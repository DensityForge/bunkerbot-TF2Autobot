import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addTheirItem,
  addTheirUntil,
  cartAmount,
  cartPay,
  cartWant,
  cartsFromHits,
  createConvertCart,
  fillNeed,
  groupConvertSends,
} from './convert-cart.js';

const SID = '76561198000000901';
const DIGEST = '5702/6';
const JOB = { name: 'Reinforced Robot Emotion Detector', defindex: 5702, sku: '5702;6', max: 1, qty: 9 };

function hit(id, assetid, extra = {}) {
  return {
    kind: 'convert',
    job: JOB,
    sid: SID,
    listing: {
      ask: 0.11,
      steamid: SID,
      listing_id: id,
      digest: DIGEST,
      take_qty: 1,
      pay: 0.11,
      assetid,
      assetids: [assetid],
      ...extra,
    },
    scan: {
      kind: 'convert',
      cheap: { ask: 0.11, steamid: SID, listing_id: id, digest: DIGEST, take_qty: 1, pay: 0.11, assetids: [assetid] },
    },
    tok: { token: 'yes' },
  };
}

test('addTheirItem(digest, 5): cart is sku→amount, want five ids, pay unit×qty one pile', () => {
  const cart = createConvertCart({ partner: SID, kind: 'convert', job: JOB, digest: DIGEST, ask: 0.11, max: 1 });
  const ids = ['17433441001', '17433441002', '17433441003', '17433441004', '17433441005'];
  const added = addTheirItem(cart, DIGEST, 5, { ask: 0.11, assetids: ids, listing_id: 'emo-bulk' });
  assert.equal(added, 5);
  assert.equal(cart.their[DIGEST], 5);
  assert.equal(cartAmount(cart, DIGEST), 5);
  assert.deepEqual(cartWant(cart), ids);
  assert.equal(cartPay(cart), 0.55);
  assert.equal(cart.want.length, 5);
});

test('RF-3 cap: addTheirItem stops at 1.00 total, not five 1-ref carts', () => {
  const cart = createConvertCart({ partner: SID, kind: 'convert', job: JOB, digest: DIGEST, ask: 0.33, max: 1 });
  addTheirItem(cart, DIGEST, 5, {
    ask: 0.33,
    assetids: ['1111111111', '2222222222', '3333333333', '4444444444', '5555555555'],
  });
  assert.equal(cartAmount(cart), 3);
  assert.equal(cartPay(cart), 0.99);
  assert.equal(cartWant(cart).length, 3);
});

test('cartsFromHits: two snapshot rows same seller+digest → one cart, one --want list', () => {
  const carts = cartsFromHits([
    hit('emo-a', '17433441001'),
    hit('emo-b', '17433441002'),
  ]);
  assert.equal(carts.length, 1);
  assert.equal(carts[0].partner, SID);
  assert.equal(carts[0].their[DIGEST], 2);
  assert.deepEqual(cartWant(carts[0]).sort(), ['17433441001', '17433441002']);
  assert.equal(cartPay(carts[0]), 0.22);
});

test('one cart per partner: two steamids stay two carts', () => {
  const other = hit('emo-c', '17433441003');
  other.sid = '76561198000000902';
  other.listing.steamid = other.sid;
  other.scan.cheap.steamid = other.sid;
  const carts = cartsFromHits([hit('emo-a', '17433441001'), other]);
  assert.equal(carts.length, 2);
  assert.ok(carts.every((c) => cartAmount(c) === 1));
});

test('groupConvertSends is the cart→wave adapter: still one send shape', () => {
  const wave = groupConvertSends([hit('emo-a', '17433441001'), hit('emo-b', '17433441002')]);
  assert.equal(wave.length, 1);
  assert.equal(wave[0].listing.take_qty, 2);
  assert.equal(wave[0].listing.pay, 0.22);
  assert.deepEqual(wave[0].cart.their[DIGEST], 2);
  assert.equal(wave[0].listing.need, 2);
  assert.deepEqual(wave[0].listing.fill_ids, ['17433441001', '17433441002']);
});

test('fillNeed: RF-3 1.00 cap — Emotion 0.11 → 9, Humor/Bomb 0.05 → 20', () => {
  assert.equal(fillNeed({ ask: 0.11, remaining: 99, maxRef: 1 }), 9);
  assert.equal(fillNeed({ ask: 0.05, remaining: 99, maxRef: 1 }), 20);
  assert.equal(fillNeed({ ask: 0.05, kind: 'convert', remaining: 99 }), 20);
  assert.equal(fillNeed({ ask: 64.22, kind: 'key', remaining: 3 }), 3);
  assert.equal(fillNeed({ ask: 64.22, kind: 'key', remaining: 3, maxRef: 1 }), 3);
  assert.equal(fillNeed({ ask: 0.11, remaining: 2 }), 2);
});

function keyHit(id, assetid, sid = SID, ask = 64.22, extra = {}) {
  return {
    kind: 'key',
    job: { name: 'Mann Co. Supply Crate Key', defindex: 5021, qty: 1 },
    sid,
    listing: {
      ask,
      steamid: sid,
      listing_id: id,
      digest: '5021/6',
      take_qty: 1,
      pay: ask,
      assetid,
      assetids: [assetid],
      defindex: 5021,
      quality: 6,
      ...extra,
    },
    scan: {
      kind: 'key',
      cheap: { ask, steamid: sid, listing_id: id, digest: '5021/6', take_qty: 1, pay: ask, assetids: [assetid] },
    },
    tok: { token: 'yes' },
  };
}

test('keys: same seller + digest → one cart, +1 until need, pay ask×qty, no 1.00 cap', () => {
  const wave = groupConvertSends([
    keyHit('key-a', '17433441801'),
    keyHit('key-b', '17433441802'),
  ]);
  assert.equal(wave.length, 1);
  assert.equal(wave[0].kind, 'key');
  assert.equal(wave[0].listing.take_qty, 2);
  assert.equal(wave[0].listing.pay, 128.44);
  assert.equal(wave[0].listing.need, 2);
  assert.deepEqual([...wave[0].listing.assetids].sort(), ['17433441801', '17433441802']);
});

test('keys: remaining is afford at they_pay − 0.11, not RF-3 1.00', () => {
  const rows = [
    keyHit('key-a', '17433441801'),
    keyHit('key-b', '17433441802'),
    keyHit('key-c', '17433441803'),
  ];
  const capped = groupConvertSends(rows, { remaining: { key: 1 } });
  assert.equal(capped.length, 1);
  assert.equal(capped[0].listing.take_qty, 1);
  assert.equal(capped[0].listing.pay, 64.22);
  assert.equal(capped[0].listing.need, 1);
  assert.equal(capped[0].listing.fill_ids.length, 3);

  const two = groupConvertSends(rows, { remaining: { key: 2 } });
  assert.equal(two[0].listing.take_qty, 2);
  assert.equal(two[0].listing.pay, 128.44);
});

test('keys: selling N on details packs one offer to N, not N one-key offers', () => {
  const rows = Array.from({ length: 5 }, (_, i) =>
    keyHit(`key-${i}`, `1743344180${i}`, SID, 64.22, { details: 'selling 2' }),
  );
  const wave = groupConvertSends(rows, { remaining: { key: 10 } });
  assert.equal(wave.length, 1);
  assert.equal(wave[0].listing.take_qty, 2);
  assert.equal(wave[0].listing.need, 2);
  assert.equal(wave[0].listing.pay, 128.44);
  assert.equal(wave[0].listing.selling_qty, 2);
  assert.equal(wave[0].listing.fill_ids.length, 5);
});

test('keys: selling/stock N with junk separators packs one offer to N', () => {
  for (const details of [
    'selling 5',
    'selling-5',
    'selling:5',
    'selling : 5',
    'stock 5',
    'stock-5',
    'Stock:5',
    'stock  5',
    'Stock: 5',
  ]) {
    const rows = Array.from({ length: 8 }, (_, i) =>
      keyHit(`key-${i}`, `1743344180${i}`, SID, 64.22, { details }),
    );
    const wave = groupConvertSends(rows, { remaining: { key: 10 } });
    assert.equal(wave.length, 1, details);
    assert.equal(wave[0].listing.take_qty, 5, details);
    assert.equal(wave[0].listing.need, 5, details);
    assert.equal(wave[0].listing.pay, Number((64.22 * 5).toFixed(2)), details);
    assert.equal(wave[0].listing.selling_qty, 5, details);
  }
});

test('keys: A/B remaining packs B-A; 10/10 skips; selling/stock N still N', () => {
  const frac = (details, n) =>
    Array.from({ length: n }, (_, i) =>
      keyHit(`key-${i}`, `1743344180${i}`, SID, 64.22, { details }),
    );

  const nine = groupConvertSends(frac('1/10', 12), { remaining: { key: 20 } });
  assert.equal(nine.length, 1);
  assert.equal(nine[0].listing.take_qty, 9);
  assert.equal(nine[0].listing.need, 9);
  assert.equal(nine[0].listing.selling_qty, 9);

  const ten = groupConvertSends(frac('0/10', 12), { remaining: { key: 20 } });
  assert.equal(ten.length, 1);
  assert.equal(ten[0].listing.take_qty, 10);
  assert.equal(ten[0].listing.selling_qty, 10);

  const soldOut = groupConvertSends(frac('10/10', 8), { remaining: { key: 10 } });
  assert.equal(soldOut.length, 0);

  const selling = groupConvertSends(frac('selling 5', 8), { remaining: { key: 10 } });
  assert.equal(selling[0].listing.take_qty, 5);

  const stock = groupConvertSends(frac('stock-5', 8), { remaining: { key: 10 } });
  assert.equal(stock[0].listing.take_qty, 5);

  const prefer = groupConvertSends(frac('selling 5 1/10', 12), { remaining: { key: 20 } });
  assert.equal(prefer[0].listing.take_qty, 9);
});

test('keys: no selling comment keeps +1 until stock or afford', () => {
  const rows = Array.from({ length: 5 }, (_, i) =>
    keyHit(`key-${i}`, `1743344180${i}`),
  );
  const byStock = groupConvertSends(rows, { remaining: { key: 10 } });
  assert.equal(byStock.length, 1);
  assert.equal(byStock[0].listing.take_qty, 5);
  assert.equal(byStock[0].listing.selling_qty, undefined);
  const byAfford = groupConvertSends(rows, { remaining: { key: 3 } });
  assert.equal(byAfford[0].listing.take_qty, 3);
});

test('keys: selling N clamps to stock and afford; one seller stays one offer', () => {
  const stockClamp = groupConvertSends(
    [
      keyHit('key-a', '17433441801', SID, 64.22, { details: 'Selling 71', quantity: 3 }),
      keyHit('key-b', '17433441802', SID, 64.22, { details: 'Selling 71', quantity: 3 }),
      keyHit('key-c', '17433441803', SID, 64.22, { details: 'Selling 71', quantity: 3 }),
    ],
    { remaining: { key: 10 } },
  );
  assert.equal(stockClamp.length, 1);
  assert.equal(stockClamp[0].listing.take_qty, 3);
  assert.equal(stockClamp[0].listing.pay, 192.66);

  const affordClamp = groupConvertSends(
    Array.from({ length: 8 }, (_, i) =>
      keyHit(`key-${i}`, `1743344181${i}`, SID, 64.22, { details: 'sell 71' }),
    ),
    { remaining: { key: 2 } },
  );
  assert.equal(affordClamp.length, 1);
  assert.equal(affordClamp[0].listing.take_qty, 2);
  assert.equal(affordClamp[0].listing.pay, 128.44);
});

test('keys: two steamids stay two offers; leftover afford goes to next seller', () => {
  const other = '76561198000000902';
  const wave = groupConvertSends(
    [
      keyHit('key-a', '17433441801'),
      keyHit('key-b', '17433441802'),
      keyHit('key-c', '17433441803', other),
    ],
    { remaining: { key: 3 } },
  );
  assert.equal(wave.length, 2);
  assert.equal(wave[0].listing.take_qty, 2);
  assert.equal(wave[0].listing.pay, 128.44);
  assert.equal(wave[1].listing.take_qty, 1);
  assert.equal(wave[1].listing.pay, 64.22);
});

test('addTheirUntil: add fail on 3rd stops; pay later for landed 2', () => {
  const ids = ['17433441001', '17433441002', '17433441003', '17433441004'];
  let n = 0;
  const landed = addTheirUntil({
    ids,
    need: 9,
    addFn: () => {
      n += 1;
      return n < 3;
    },
  });
  assert.deepEqual(landed, ['17433441001', '17433441002']);
  assert.equal(n, 3);
});

test('12 Emotion 0.11 candidates: need 9, pay 0.99, fill_ids keep all 12', () => {
  const rows = Array.from({ length: 12 }, (_, i) =>
    hit(`emo-${i}`, `17433441${String(i).padStart(3, '0')}`),
  );
  const wave = groupConvertSends(rows);
  assert.equal(wave.length, 1);
  assert.equal(wave[0].listing.need, 9);
  assert.equal(wave[0].listing.take_qty, 9);
  assert.equal(wave[0].listing.pay, 0.99);
  assert.equal(wave[0].listing.fill_ids.length, 12);
  assert.equal(wave[0].listing.assetids.length, 9);
});

test('addTheirUntil fail on 3rd of 12: landed 2, remaining goes to next seller', () => {
  const a = Array.from({ length: 12 }, (_, i) =>
    hit(`emo-a-${i}`, `17433442${String(i).padStart(3, '0')}`),
  );
  const firstIds = new Set(a.map((h) => h.listing.assetid));
  const other = hit('emo-b', '17433442999');
  other.sid = '76561198000000902';
  other.listing.steamid = other.sid;
  other.scan.cheap.steamid = other.sid;
  let firstAdds = 0;
  const wave = groupConvertSends([...a, other], {
    addFn: ({ assetid }) => {
      if (firstIds.has(assetid)) {
        firstAdds += 1;
        return firstAdds < 3;
      }
      return true;
    },
  });
  assert.equal(wave.length, 2);
  assert.equal(wave[0].listing.take_qty, 2);
  assert.equal(wave[0].listing.pay, 0.22);
  assert.equal(wave[1].listing.take_qty, 1);
  assert.equal(wave[1].listing.pay, 0.11);
});
