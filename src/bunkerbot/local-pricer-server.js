/**
 * Local Custom Pricer & Real-Time Price Broadcast Server.
 *
 * Implements the CustomPricer API & Socket.IO interface expected by tf2autobot:
 *   - GET  /items          -> Full / paginated catalog pricelist
 *   - GET  /items/:sku     -> Single item price lookup
 *   - POST /items/:sku     -> Check / reprice request
 *   - POST /push           -> Broadcasts real-time price change to connected bots
 *   - Socket.IO Server     -> Real-time push stream ('price' events)
 *
 * Law: docs/features/price-construct.md · tf2autobot CustomPricer specification
 * Wire shape gleaned from TF2Autobot (IdiNium, MIT). Their source is not in this file. Credit: ../../NOTICE.md.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

import { FILES } from './env.js';

export const DEFAULT_PORT = 5555;

/**
 * Normalizes a catalog row or price object into tf2autobot currency shape.
 */
export function normalizeItemPrice(item, keyRefRate = 64.0) {
  if (!item || typeof item !== 'object') return null;

  const sku = item.sku || item.market_hash_name || item.name || '';
  const name = item.name || item.market_hash_name || sku;

  let buyKeys = 0;
  let buyMetal = 0;
  let sellKeys = 0;
  let sellMetal = 0;

  if (item.buy && typeof item.buy === 'object') {
    buyKeys = Number(item.buy.keys || 0);
    buyMetal = Number(item.buy.metal || 0);
  } else if (item.price_keys != null || item.price_ref != null) {
    const rawKeys = Number(item.price_keys || 0);
    const rawRef = Number(item.price_ref || 0);
    buyKeys = Math.floor(rawKeys);
    buyMetal = Number((rawRef + (rawKeys - buyKeys) * keyRefRate).toFixed(2));
  } else if (item.suggested_price != null || item.median_price != null) {
    const usd = Number(item.suggested_price || item.median_price || 0);
    const totalRef = usd / 0.03; // ~$0.03/ref baseline
    const totalKeys = totalRef / keyRefRate;
    buyKeys = Math.floor(totalKeys);
    buyMetal = Number((totalRef % keyRefRate).toFixed(2));
  }

  if (item.sell && typeof item.sell === 'object') {
    sellKeys = Number(item.sell.keys || 0);
    sellMetal = Number(item.sell.metal || 0);
  } else {
    sellKeys = buyKeys;
    sellMetal = Number((buyMetal > 0 ? buyMetal + 0.11 : buyMetal).toFixed(2));
    if (sellKeys > 0 && sellMetal === buyMetal) {
      sellMetal = Number((sellMetal + 1.0).toFixed(2));
    }
  }

  return {
    sku,
    name,
    source: item.source || 'bptf-local',
    time: item.time || Math.floor(Date.now() / 1000),
    buy: { keys: buyKeys, metal: buyMetal },
    sell: { keys: sellKeys, metal: sellMetal },
  };
}

export class LocalPricerServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.port = options.port !== undefined ? Number(options.port) : DEFAULT_PORT;
    this.keyRefRate = Number(options.keyRefRate) || 64.0;
    this.catalogPath = options.catalogPath || path.join(FILES, 'catalogue_bptf_EVERY_SINGLE_ITEM.json');
    this.itemsBySku = new Map();
    this.itemsByName = new Map();
    this.clients = new Map(); // sid -> { sid, pollingRes, queue: [], ws, authenticated }
    this.server = null;
    this.isLoaded = false;
  }

  /**
   * Load catalog from disk into memory index.
   */
  loadCatalog(catalogData) {
    let raw = catalogData;
    if (!raw && fs.existsSync(this.catalogPath)) {
      raw = JSON.parse(fs.readFileSync(this.catalogPath, 'utf8').replace(/^\uFEFF/, ''));
    }

    const items = Array.isArray(raw) ? raw : raw?.items || [];
    if (raw?.key_ref_rate) this.keyRefRate = Number(raw.key_ref_rate);

    this.itemsBySku.clear();
    this.itemsByName.clear();

    for (const rawItem of items) {
      const normalized = normalizeItemPrice(rawItem, this.keyRefRate);
      if (normalized && normalized.sku) {
        this.itemsBySku.set(normalized.sku, normalized);
        this.itemsByName.set(normalized.name, normalized);
      }
    }

    this.isLoaded = true;
    this.emit('loaded', { count: this.itemsBySku.size });
    return this.itemsBySku.size;
  }

  /**
   * Add or update an item price and push to connected clients.
   */
  updatePrice(item) {
    const normalized = normalizeItemPrice(item, this.keyRefRate);
    if (!normalized || !normalized.sku) return null;

    this.itemsBySku.set(normalized.sku, normalized);
    this.itemsByName.set(normalized.name, normalized);

    this.broadcastPrice(normalized);
    this.emit('priceUpdate', normalized);
    return normalized;
  }

  /**
   * Broadcast price change event to all Socket.IO / polling clients.
   */
  broadcastPrice(priceItem) {
    const payload = {
      sku: priceItem.sku,
      name: priceItem.name,
      source: priceItem.source || 'bptf-local',
      time: priceItem.time || Math.floor(Date.now() / 1000),
      buy: priceItem.buy,
      sell: priceItem.sell,
    };

    const socketIoMsg = `42["price",${JSON.stringify(payload)}]`;

    for (const [sid, client] of this.clients.entries()) {
      if (client.pollingRes && !client.pollingRes.writableEnded) {
        try {
          client.pollingRes.writeHead(200, {
            'Content-Type': 'text/plain; charset=UTF-8',
            'Access-Control-Allow-Origin': '*',
          });
          client.pollingRes.end(socketIoMsg);
        } catch (e) {}
        client.pollingRes = null;
      } else {
        if (!client.queue) client.queue = [];
        client.queue.push(socketIoMsg);
      }

      if (client.ws && client.ws.readyState === 1) {
        try {
          client.ws.send(socketIoMsg);
        } catch (e) {}
      }
    }
  }

  /**
   * Start HTTP + Socket.IO server.
   */
  start() {
    return new Promise((resolve, reject) => {
      if (!this.isLoaded) {
        try {
          this.loadCatalog();
        } catch (e) {}
      }

      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', reject);
      this.server.listen(this.port, () => {
        this.port = this.server.address().port;
        this.emit('listening', { port: this.port });
        resolve(this.port);
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      for (const [sid, client] of this.clients.entries()) {
        if (client.ws) {
          try { client.ws.close(); } catch (e) {}
        }
        if (client.pollingRes && !client.pollingRes.writableEnded) {
          try { client.pollingRes.end(); } catch (e) {}
        }
      }
      this.clients.clear();
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  handleRequest(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    if (pathname.startsWith('/socket.io/')) {
      return this.handleSocketIo(req, res, parsedUrl);
    }

    if (req.method === 'GET' && (pathname === '/health' || pathname === '/status')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          itemsCount: this.itemsBySku.size,
          activeClients: this.clients.size,
          keyRefRate: this.keyRefRate,
        }),
      );
      return;
    }

    if (req.method === 'GET' && pathname === '/items') {
      const page = Math.max(1, Number(parsedUrl.searchParams.get('page') || 1));
      const limit = Number(parsedUrl.searchParams.get('limit')) || 0;

      const allItems = Array.from(this.itemsBySku.values());
      const items = limit > 0 ? allItems.slice((page - 1) * limit, page * limit) : allItems;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          currency: 'metal',
          total: allItems.length,
          page,
          items,
        }),
      );
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/items/')) {
      const rawSku = decodeURIComponent(pathname.slice('/items/'.length));
      const found = this.itemsBySku.get(rawSku) || this.itemsByName.get(rawSku);

      if (found) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            ...found,
          }),
        );
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: false,
            message: `Item not found: ${rawSku}`,
          }),
        );
      }
      return;
    }

    if (req.method === 'POST' && pathname.startsWith('/items/')) {
      const rawSku = decodeURIComponent(pathname.slice('/items/'.length));
      const found = this.itemsBySku.get(rawSku) || this.itemsByName.get(rawSku);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          sku: found ? found.sku : rawSku,
          name: found ? found.name : rawSku,
        }),
      );
      return;
    }

    if (req.method === 'POST' && (pathname === '/push' || pathname === '/update')) {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const items = Array.isArray(data) ? data : data.items ? data.items : [data];
          const results = [];
          for (const item of items) {
            const updated = this.updatePrice(item);
            if (updated) results.push(updated);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, updated: results.length, items: results }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'Endpoint not found' }));
  }

  handleSocketIo(req, res, parsedUrl) {
    const sid = parsedUrl.searchParams.get('sid') || crypto.randomBytes(8).toString('hex');
    const isInitial = !parsedUrl.searchParams.get('sid');

    if (isInitial) {
      this.clients.set(sid, { sid, pollingRes: null, queue: [], authenticated: false, createdAt: Date.now() });

      const openPacket = `0${JSON.stringify({
        sid,
        upgrades: [],
        pingInterval: 25000,
        pingTimeout: 20000,
      })}`;

      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(openPacket);
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=UTF-8',
          'Access-Control-Allow-Origin': '*',
        });
        res.end('ok');
      });
      return;
    }

    const client = this.clients.get(sid) || { sid, pollingRes: null, queue: [], authenticated: false };
    this.clients.set(sid, client);

    if (!client.authenticated) {
      client.authenticated = true;
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(`40{"sid":"${sid}"}\x1e42["authenticated"]`);
      return;
    }

    // If there are buffered messages in the client's queue, flush immediately
    if (client.queue && client.queue.length > 0) {
      const msg = client.queue.shift();
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(msg);
      return;
    }

    // Otherwise park response for long poll
    client.pollingRes = res;
    req.on('close', () => {
      if (client.pollingRes === res) {
        client.pollingRes = null;
      }
    });
  }
}
