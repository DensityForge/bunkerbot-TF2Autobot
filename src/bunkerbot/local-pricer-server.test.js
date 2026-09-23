import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { LocalPricerServer, normalizeItemPrice } from './local-pricer-server.js';

test('normalizeItemPrice correctly handles keys + metal, USD, and direct objects', () => {
  const item1 = {
    name: 'Mann Co. Supply Crate Key',
    sku: '5021;6',
    price_keys: 0,
    price_ref: 62.77,
  };
  const norm1 = normalizeItemPrice(item1, 64.0);
  assert.equal(norm1.sku, '5021;6');
  assert.equal(norm1.buy.keys, 0);
  assert.equal(norm1.buy.metal, 62.77);
  assert.equal(norm1.sell.keys, 0);
  assert.equal(norm1.sell.metal, 62.88);

  const item2 = {
    name: 'Earbuds',
    sku: '143;6',
    price_keys: 2.5,
    price_ref: 0,
  };
  const norm2 = normalizeItemPrice(item2, 60.0);
  assert.equal(norm2.buy.keys, 2);
  assert.equal(norm2.buy.metal, 30.0);
});

test('LocalPricerServer starts, serves REST endpoints, and pushes price updates', async () => {
  const sampleCatalog = [
    {
      name: 'Mann Co. Supply Crate Key',
      sku: '5021;6',
      price_keys: 0,
      price_ref: 62.77,
    },
    {
      name: 'Bill\'s Hat',
      sku: '126;6',
      price_keys: 2,
      price_ref: 10.0,
    },
  ];

  const server = new LocalPricerServer({ port: 0, keyRefRate: 64.0 });
  server.loadCatalog(sampleCatalog);
  const port = await server.start();

  try {
    const get = (path) =>
      new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}${path}`, (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
        }).on('error', reject);
      });

    const post = (path, payload) =>
      new Promise((resolve, reject) => {
        const req = http.request(
          `http://127.0.0.1:${port}${path}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' } },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
          },
        );
        req.on('error', reject);
        req.write(JSON.stringify(payload));
        req.end();
      });

    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.itemsCount, 2);

    const items = await get('/items');
    assert.equal(items.status, 200);
    assert.equal(items.body.success, true);
    assert.equal(items.body.items.length, 2);

    const single = await get('/items/5021;6');
    assert.equal(single.status, 200);
    assert.equal(single.body.name, 'Mann Co. Supply Crate Key');
    assert.equal(single.body.buy.metal, 62.77);

    const check = await post('/items/5021;6', {});
    assert.equal(check.status, 200);
    assert.equal(check.body.success, true);

    let eventReceived = null;
    server.on('priceUpdate', (p) => {
      eventReceived = p;
    });

    const pushRes = await post('/push', {
      sku: '5021;6',
      name: 'Mann Co. Supply Crate Key',
      buy: { keys: 0, metal: 63.55 },
      sell: { keys: 0, metal: 64.0 },
    });
    assert.equal(pushRes.status, 200);
    assert.equal(pushRes.body.success, true);
    assert.equal(eventReceived.buy.metal, 63.55);

    const updated = await get('/items/5021;6');
    assert.equal(updated.body.buy.metal, 63.55);
  } finally {
    await server.stop();
  }
});

test('LocalPricerServer handles Socket.IO handshake and pushes price changes', async () => {
  const sampleCatalog = [
    {
      name: 'Mann Co. Supply Crate Key',
      sku: '5021;6',
      buy: { keys: 0, metal: 62.77 },
      sell: { keys: 0, metal: 63.0 },
    },
  ];

  const server = new LocalPricerServer({ port: 0 });
  server.loadCatalog(sampleCatalog);
  const port = await server.start();

  try {
    const handshake = await new Promise((resolve) => {
      http.get(`http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling`, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(data));
      });
    });

    assert.ok(handshake.startsWith('0{'));
    const session = JSON.parse(handshake.slice(1));
    assert.ok(session.sid);

    const authResp = await new Promise((resolve) => {
      http.get(`http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling&sid=${session.sid}`, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(data));
      });
    });

    assert.ok(authResp.includes('authenticated'));

    server.updatePrice({
      sku: '5021;6',
      name: 'Mann Co. Supply Crate Key',
      buy: { keys: 0, metal: 63.22 },
      sell: { keys: 0, metal: 63.55 },
    });

    const pushData = await new Promise((resolve) => {
      http.get(`http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling&sid=${session.sid}`, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(data));
      });
    });

    assert.ok(pushData.startsWith('42["price"'));
    assert.ok(pushData.includes('63.22'));
  } finally {
    await server.stop();
  }
});
