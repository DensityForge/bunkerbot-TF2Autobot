/**
 * Key listing comment → pack qty.
 * Real comment fields on a snapshot / listing row are `details` (normalize
 * from raw.details || raw.comment) and HTML `data-listing_comment`. Also
 * read comment / listed_comment / message / description when they are
 * strings. `buyout` is a 0/1 flag — not a comment. Do not invent N.
 * First integer after selling or stock (or close form sell) is N.
 * Junk between verb and N (spaces, `-`, `:`, other punctuation) is ignored.
 * Slash is not junk: `A/B` (B>=A) remaining-for-sale is B-A. `1/10` → 9,
 * `0/10` → 10, `10/10` → 0 skip. Prefer A/B over a bare N when both appear.
 * Do not invent other verbs. Pack is min(N, stock, afford at unit ask,
 * offer item cap). No match → no N. 0 is skip, not a missing match.
 */
import { firstPositiveQty, listingQty } from './part-buy-qty.js';

/** Steam their-side item slots on one offer. */
export const STEAM_OFFER_ITEM_CAP = 256;

/** Listing-row comment fields that actually exist in this tree. */
export const LISTING_COMMENT_KEYS = [
  'details',
  'comment',
  'listed_comment',
  'listing_comment',
  'message',
  'description',
  'data-listing_comment',
];

/** Verb, then optional junk except `/` and letters, then N. stocking / stockpile do not match. */
const QTY_VERB_RE = /\b(?:selling|stock)[^0-9A-Za-z/]*(\d+)/i;
const SELL_RE = /\bsell[^0-9A-Za-z/]*(\d+)/i;
/** `A/B` not glued into a path. Slash is a fraction, not a verb separator. */
const FRACTION_RE = /(?<![\d/])(\d+)\s*\/\s*(\d+)(?![\d/])/g;

function pushComment(parts, raw) {
  if (raw == null) return;
  if (typeof raw === 'number' || typeof raw === 'boolean') return;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (s) parts.push(s);
    return;
  }
  if (typeof raw !== 'object') return;
  for (const key of LISTING_COMMENT_KEYS) {
    const v = raw[key];
    if (typeof v === 'string' && v.trim()) parts.push(v.trim());
  }
}

/** Concatenate real comment strings already on the listing / scan row. */
export function listingCommentText(listing) {
  if (listing == null) return '';
  const parts = [];
  pushComment(parts, listing);
  if (listing && typeof listing === 'object') {
    pushComment(parts, listing.listing);
    pushComment(parts, listing.item);
    pushComment(parts, listing.scan?.cheap);
    pushComment(parts, listing.source);
  }
  return parts.join(' ');
}

/**
 * First sell-qty `A/B` (B>=A, B>0) → remaining B-A, including 0.
 * `12/10` (B<A) is not a sell-qty. No match → null.
 */
export function parseFractionQty(text) {
  const s = String(text || '');
  const re = new RegExp(FRACTION_RE.source, FRACTION_RE.flags);
  let m;
  while ((m = re.exec(s))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b <= 0 || b < a) continue;
    return Math.floor(b) - Math.floor(a);
  }
  return null;
}

/**
 * Prefer A/B remaining when it is a sell-qty. Else first integer after
 * selling or stock, or close form sell. Case-insensitive.
 * Junk (` `, `-`, `:`, other punctuation except `/`) between verb and N
 * is ignored. "selling 5", "stock-5", "1/10" → 9. No match → null.
 * `10/10` → 0 (skip). `selling/5` does not match.
 */
export function parseSellingQty(text) {
  const s = String(text || '');
  const frac = parseFractionQty(s);
  if (frac != null) return frac;
  const hit = s.match(QTY_VERB_RE) || s.match(SELL_RE);
  if (!hit) return null;
  const n = Number(hit[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export function sellingQtyOf(listing) {
  return parseSellingQty(listingCommentText(listing));
}

export function sellerStockOf(listing, fallback) {
  const row = listing?.listing && typeof listing.listing === 'object' ? listing.listing : listing;
  return firstPositiveQty(listingQty(row), listingQty(listing), fallback);
}

/**
 * Pack qty. n is comment N or null. Missing clamps are skipped.
 * No comment N → min(stock, afford, offerCap) — current +1-until-stock-or-afford.
 */
export function packKeyQty({ n, stock, afford, offerCap } = {}) {
  const caps = [];
  const push = (v) => {
    const x = Number(v);
    if (Number.isFinite(x) && x >= 0) caps.push(Math.floor(x));
  };
  if (n != null) push(n);
  if (stock != null) push(stock);
  if (afford != null) push(afford);
  if (offerCap != null) push(offerCap);
  if (!caps.length) return 0;
  return Math.max(0, Math.min(...caps));
}

/** Key-cart remaining: comment N clamped, else stock/afford. */
export function keyPackRemaining(listing, { stock, afford, offerCap = STEAM_OFFER_ITEM_CAP } = {}) {
  const n = sellingQtyOf(listing);
  return packKeyQty({
    n,
    stock: sellerStockOf(listing, stock),
    afford,
    offerCap,
  });
}
