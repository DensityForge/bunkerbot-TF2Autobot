/**
 * Offer qty for fab part-buy. Stock is details hint, listing qty, or 1.
 * Never remaining need, book qty, or at-ask sums.
 */

export function firstPositiveQty(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function stockHint(details) {
  const s = String(details || '');
  const selling = s.match(/selling\s+(\d+)/i);
  if (selling) return Number(selling[1]);
  const m = s.match(/\[\s*(\d+)\s*\]\s*in our storage/i) || s.match(/have\s+\[\s*(\d+)\s*\]/i);
  return m ? Number(m[1]) : null;
}

export function listingQty(listing) {
  if (!listing || typeof listing !== 'object') return null;
  const item = listing.item && typeof listing.item === 'object' ? listing.item : {};
  return firstPositiveQty(
    listing.quantity,
    listing.amount,
    listing.count,
    item.quantity,
    item.amount,
    item.count,
  );
}

function roundRef(n) {
  return Math.round(n * 100) / 100;
}

/**
 * @param {{ need?: number, listingQty?: number|null, stockHint?: number|null, ask?: number|null }} input
 * @returns {{ qty: number, pay_total: number|null, source: 'details'|'listing'|'default'|null }}
 */
export function resolveOfferQty({ need, listingQty: listing, stockHint: hint, ask } = {}) {
  if (ask == null || !Number.isFinite(Number(ask))) {
    return { qty: 0, pay_total: null, source: null };
  }
  const stock = firstPositiveQty(hint, listing, 1);
  const source = firstPositiveQty(hint) != null
    ? 'details'
    : firstPositiveQty(listing) != null
      ? 'listing'
      : 'default';
  const want = Number(need);
  const qty = Number.isFinite(want) && want > 0 ? Math.min(want, stock) : 0;
  return { qty, pay_total: roundRef(Number(ask) * qty), source };
}
