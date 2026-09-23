/**
 * Convert cart — cart fill shaped after TF2Autobot UserCart (IdiNium, MIT).
 * Pattern only; their source is not in this file. Credit: ../../NOTICE.md.
 * If the snapshot already shows the seller has the digest: ONE offer,
 * addTheirItem +1 of that digest until (a) need is met or (b) add fails.
 * Pay TOTAL for how many landed. Do not pre-count and hope. Do not send
 * N one-unit offers. RF-3 need is remaining want this tick, still 1.00
 * ref TOTAL per offer (Emotion 0.11 → 9, Humor/Bomb 0.05 → 20). Keys:
 * remaining we can afford this tick at STN they_pay − 0.11. No 1.00 cap.
 * Comment "selling N" or "stock N" (details/comment; junk between verb
 * and N ignored, `/` is not junk) packs that seller to N. `A/B` is
 * remaining-for-sale B-A (`1/10` → 9, `10/10` → 0 skip). Prefer A/B
 * over a bare N. Then clamp stock / afford / offer cap. No match →
 * +1 until stock or afford.
 * Same seller + same digest, pay ask×qty. Our metal: skipItemsInTrade.
 * Classifieds Buy is 1-per-click; we build the cart from snapshot rows.
 * Do not import trade.js.
 */
import { listingAssetIds } from './inventory.js';
import { digestOf } from './gap-cut.js';
import {
  STEAM_OFFER_ITEM_CAP,
  listingCommentText,
  packKeyQty,
  parseSellingQty,
  sellingQtyOf,
} from './listing-selling-qty.js';
import { listingQty } from './part-buy-qty.js';
import { UNIQUE_KS_KIND, isUniqueKsJob } from './unique-ks.js';

export function cartPartner(item) {
  return String(
    item?.sid ||
      item?.partner ||
      item?.listing?.steamid ||
      item?.listing?.steamid64 ||
      item?.scan?.cheap?.steamid ||
      '',
  ).trim();
}

export function cartDigest(item) {
  const row = item?.listing || item?.scan?.cheap || item || {};
  return String(row.digest || digestOf(row).key || '').trim();
}

export function cartSkuKey(item) {
  const kind = item?.kind || 'convert';
  if (kind === 'key') return 'key';
  const job = item?.job || {};
  if (kind === UNIQUE_KS_KIND || isUniqueKsJob(job)) {
    return `ks:${job.defindex || job.name || item?.scan?.sku || ''}`;
  }
  return `convert:${job.defindex || job.name || ''}`;
}

/** One cart per partner + job + digest. Autobot: one UserCart per partner. */
export function cartKey(item) {
  return `${item?.kind || 'convert'}:${cartSkuKey(item)}:${cartDigest(item)}:${cartPartner(item)}`;
}

/**
 * Need for this offer. RF-3: min(remaining, floor(1.00/ask)).
 * Emotion 0.11 → 9. Humor/Bomb 0.05 → 20. Keys: remaining only — the
 * 1.00 cap does not apply. Caller sets remaining to keys we can afford
 * at they_pay − 0.11. KS: remaining only.
 */
export function fillNeed({ ask, kind = 'convert', remaining, maxRef = 1, job } = {}) {
  const left = Number(remaining);
  const rem = Number.isFinite(left) && left >= 0 ? Math.floor(left) : Infinity;
  const lane = kind === UNIQUE_KS_KIND || isUniqueKsJob(job) ? UNIQUE_KS_KIND : kind;
  if (lane === 'key' || lane === UNIQUE_KS_KIND) {
    return rem === Infinity ? Number.MAX_SAFE_INTEGER : rem;
  }
  const unit = Number(ask);
  if (!Number.isFinite(unit) || unit <= 0) return 0;
  const cap = Number(maxRef);
  const refCap = Number.isFinite(cap) && cap > 0 ? cap : 1;
  const byCap = Math.floor((refCap + 0.001) / unit);
  return Math.max(0, Math.min(rem, byCap));
}

/**
 * +1 loop. Stop when need is met or addTheirItem / addFn returns false.
 * Pay later for however many landed. Do not skip to the next id after a fail.
 */
export function addTheirUntil({ ids, need, addFn } = {}) {
  const want = Number(need);
  const cap = Number.isFinite(want) && want > 0 ? Math.floor(want) : 0;
  const landed = [];
  const add = typeof addFn === 'function' ? addFn : () => true;
  for (const raw of ids || []) {
    if (landed.length >= cap) break;
    const id = String(raw ?? '').trim();
    if (!id) break;
    let ok = true;
    try {
      ok = add({ appid: 440, contextid: 2, assetid: id, amount: 1 });
    } catch {
      ok = false;
    }
    if (ok === false) break;
    landed.push(id);
  }
  return landed;
}

export function createConvertCart({
  partner,
  kind = 'convert',
  job,
  digest,
  sku,
  ask,
  max,
  tok,
} = {}) {
  const cap = kind === 'convert' && !isUniqueKsJob(job)
    ? (Number(max) > 0 ? Number(max) : Number(job?.max) > 0 ? Number(job.max) : 1)
    : Infinity;
  return {
    partner: String(partner || '').trim(),
    kind,
    job: job || null,
    digest: String(digest || ''),
    sku: sku || job?.name || null,
    ask: Number(ask) || null,
    max: Number.isFinite(cap) ? cap : null,
    their: {},
    want: [],
    listing_ids: [],
    units: [],
    candidates: [],
    landed: [],
    need: 0,
    sellingQty: null,
    commentText: '',
    listingStock: null,
    tok: tok || null,
    source: null,
  };
}

export function offerCandidate(cart, { assetid, ask, listing_id, digest } = {}) {
  if (!cart) return 0;
  const id = String(assetid || '').trim();
  if (!id || cart.candidates.some((u) => u.assetid === id)) return 0;
  const unit = Number(ask);
  cart.candidates.push({
    assetid: id,
    ask: Number.isFinite(unit) && unit > 0 ? unit : Number(cart.ask) || null,
    listing_id: listing_id || null,
    digest: digest || cart.digest,
  });
  if (cart.ask == null && Number.isFinite(unit) && unit > 0) cart.ask = unit;
  return 1;
}

function applyLanded(cart, landedIds) {
  const set = new Set(landedIds.map(String));
  const landed = (cart.candidates || []).filter((u) => set.has(String(u.assetid)));
  cart.landed = landed;
  cart.want = landed.map((u) => u.assetid);
  cart.units = landed;
  cart.their = {};
  if (cart.digest) cart.their[cart.digest] = landed.length;
  cart.listing_ids = [];
  for (const u of landed) {
    if (u.listing_id && !cart.listing_ids.includes(String(u.listing_id))) {
      cart.listing_ids.push(String(u.listing_id));
    }
  }
  return landed;
}

function noteListingPack(cart, row) {
  if (!cart || cart.kind !== 'key') return;
  const text = listingCommentText(row);
  if (text) cart.commentText = cart.commentText ? `${cart.commentText} ${text}` : text;
  const n = parseSellingQty(cart.commentText || '');
  if (n != null) cart.sellingQty = n;
  const q = listingQty(row);
  if (q != null) cart.listingStock = Math.max(Number(cart.listingStock) || 0, q);
}

function keyFillRemaining(cart, remaining) {
  const stock = cart.listingStock != null
    ? cart.listingStock
    : (cart.candidates || []).length;
  const afford = remaining == null ? (cart.candidates || []).length : remaining;
  const listing = cart.source?.listing || cart.source || cart;
  const n = cart.sellingQty != null ? cart.sellingQty : sellingQtyOf(listing);
  return packKeyQty({
    n,
    stock,
    afford,
    offerCap: STEAM_OFFER_ITEM_CAP,
  });
}

/** Fill this cart: +1 until need or add fails. Pay is whatever landed. */
export function fillCartUntil(cart, { remaining, addFn } = {}) {
  if (!cart) return [];
  const left = remaining == null ? cart.candidates.length : remaining;
  const packed = cart.kind === 'key' ? keyFillRemaining(cart, remaining) : left;
  const need = fillNeed({
    ask: cart.ask,
    kind: cart.kind,
    remaining: packed,
    maxRef: cart.max == null ? 1 : cart.max,
    job: cart.job,
  });
  cart.need = need;
  const ids = (cart.candidates || []).map((u) => u.assetid).filter(Boolean);
  const landedIds = addTheirUntil({ ids, need, addFn });
  applyLanded(cart, landedIds);
  return cart.landed;
}

/**
 * Autobot addTheirItem(sku, amount): record candidates, then +1 fill.
 * extra.addFn is the Steam add (false stops the loop).
 */
export function addTheirItem(cart, digest, amount = 1, extra = {}) {
  if (!cart || !digest) return 0;
  const want = Number(amount);
  const n = Number.isFinite(want) && want > 0 ? Math.floor(want) : 0;
  if (n < 1) return 0;
  const ask = Number(extra.ask);
  const unit = Number.isFinite(ask) && ask > 0 ? ask : Number(cart.ask);
  const assets = Array.isArray(extra.assetids)
    ? extra.assetids.map(String).filter(Boolean)
    : extra.assetid
      ? [String(extra.assetid)]
      : [];
  if (digest && !cart.digest) cart.digest = digest;
  if (extra.source && !cart.source) cart.source = extra.source;
  for (let i = 0; i < n; i++) {
    const id = assets[i];
    if (assets.length && !id) break;
    if (id) offerCandidate(cart, { assetid: id, ask: unit, listing_id: extra.listing_id, digest });
  }
  fillCartUntil(cart, { remaining: n, addFn: extra.addFn });
  return cart.landed.length;
}

export function cartAmount(cart, digest) {
  if (!cart) return 0;
  if (digest) return Number(cart.their[digest]) || 0;
  return Object.values(cart.their || {}).reduce((n, v) => n + (Number(v) || 0), 0);
}

/** TOTAL for landed units. Mixed asks sum; same ask is ask×qty. */
export function cartPay(cart) {
  if (!cart?.units?.length) return 0;
  const sum = cart.units.reduce((n, u) => n + Number(u.ask || 0), 0);
  return Number(sum.toFixed(2));
}

export function cartWant(cart) {
  return Array.isArray(cart?.want) ? cart.want.slice() : [];
}

function hitUnits(item) {
  const row = item?.listing || item?.scan?.cheap || {};
  const ask = Number(row.ask ?? row.metal);
  const assets = listingAssetIds(row);
  return {
    row,
    ask,
    assets,
    digest: String(row.digest || digestOf(row).key || ''),
    listing_id: row.listing_id || row.id || null,
  };
}

/**
 * Snapshot / wave hits → one cart per partner + digest.
 * Candidates only. Fill (+1 until need or fail) is fillCartUntil.
 */
export function cartsFromHits(items, { fill = true, remaining, addFn } = {}) {
  const rows = Array.isArray(items) ? items : [];
  const ranked = rows
    .map((item) => ({ item, ...hitUnits(item) }))
    .filter((u) => Number.isFinite(u.ask) && u.ask > 0 && cartPartner(u.item));
  ranked.sort((a, b) => {
    if (a.ask !== b.ask) return a.ask - b.ask;
    return String(a.listing_id || '').localeCompare(String(b.listing_id || ''));
  });
  const carts = new Map();
  for (const u of ranked) {
    const key = cartKey(u.item);
    if (!carts.has(key)) {
      carts.set(
        key,
        createConvertCart({
          partner: cartPartner(u.item),
          kind: u.item.kind || 'convert',
          job: u.item.job,
          digest: u.digest,
          sku: u.item.job?.name || u.item.scan?.sku,
          ask: u.ask,
          max: u.item.job?.max,
          tok: u.item.tok,
        }),
      );
    }
    const cart = carts.get(key);
    if (u.item && !cart.source) cart.source = u.item;
    noteListingPack(cart, u.row);
    noteListingPack(cart, u.item);
    for (const id of u.assets) {
      offerCandidate(cart, { assetid: id, ask: u.ask, listing_id: u.listing_id, digest: u.digest });
    }
  }
  const out = [...carts.values()].filter((c) => c.candidates.length);
  if (fill) {
    for (const cart of out) {
      const left = remaining == null ? cart.candidates.length : remaining;
      fillCartUntil(cart, { remaining: left, addFn });
    }
  }
  return out.filter((c) => !fill || cartAmount(c) > 0);
}

/** Wave row convertTrade already understands (listing + scan.cheap). */
export function waveFromCart(cart) {
  const first = cart.source || {};
  const qty = cartAmount(cart);
  const pay = cartPay(cart);
  const listing = {
    ...(first.listing || {}),
    steamid: cart.partner,
    steamid64: cart.partner,
    ask: cart.ask,
    take_qty: qty,
    pay,
    assetid: cart.want[0] || null,
    assetids: cartWant(cart),
    fill_ids: (cart.candidates || []).map((u) => u.assetid).filter(Boolean),
    need: cart.need,
    listing_id: cart.listing_ids[0] || first.listing?.listing_id || null,
    listing_ids: cart.listing_ids.slice(),
    grouped: qty > 1,
    digest: cart.digest,
    selling_qty: cart.sellingQty != null ? cart.sellingQty : undefined,
  };
  const cheap = {
    ask: cart.ask,
    listing_id: listing.listing_id,
    steamid: cart.partner,
    digest: cart.digest,
    take_qty: qty,
    pay,
    assetid: listing.assetid,
    assetids: listing.assetids,
    fill_ids: listing.fill_ids,
    need: cart.need,
    listing_ids: listing.listing_ids,
    grouped: listing.grouped,
  };
  return {
    ...first,
    kind: cart.kind,
    job: cart.job || first.job,
    sid: cart.partner,
    tok: cart.tok || first.tok,
    cart,
    listing,
    scan: {
      ...(first.scan || {}),
      kind: cart.kind,
      cheap,
      kept: first.scan?.kept || [listing],
    },
  };
}

/**
 * One cart per seller+digest. Remaining want is shared this tick.
 * RF-3: 1.00 cap inside fillNeed. Keys: remaining is keys we can afford
 * at they_pay − 0.11 (pass remaining.key). Each cart +1 until need or fail.
 */
export function groupConvertSends(items, { addFn, remaining: remainingIn } = {}) {
  const carts = cartsFromHits(items, { fill: false });
  const remaining = new Map();
  for (const cart of carts) {
    const k = cartSkuKey(cart);
    remaining.set(k, (remaining.get(k) || 0) + cart.candidates.length);
  }
  if (remainingIn && typeof remainingIn === 'object') {
    for (const [k, n] of Object.entries(remainingIn)) {
      const cap = Math.floor(Number(n));
      if (!remaining.has(k) || !Number.isFinite(cap) || cap < 0) continue;
      remaining.set(k, Math.min(remaining.get(k), cap));
    }
  }
  const out = [];
  for (const cart of carts) {
    const k = cartSkuKey(cart);
    const left = remaining.get(k) ?? 0;
    fillCartUntil(cart, { remaining: left, addFn });
    remaining.set(k, Math.max(0, left - cart.landed.length));
    if (cart.landed.length) out.push(waveFromCart(cart));
  }
  return out;
}
