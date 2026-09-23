import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  LISTING_COMMENT_KEYS,
  STEAM_OFFER_ITEM_CAP,
  keyPackRemaining,
  listingCommentText,
  packKeyQty,
  parseFractionQty,
  parseSellingQty,
  sellingQtyOf,
} from './listing-selling-qty.js';

test('parseSellingQty: selling N and close forms; first integer after selling', () => {
  assert.equal(parseSellingQty('selling 71'), 71);
  assert.equal(parseSellingQty('Selling 2'), 2);
  assert.equal(parseSellingQty('SELLING 71 keys'), 71);
  assert.equal(parseSellingQty('sell 71'), 71);
  assert.equal(parseSellingQty('Sell 2'), 2);
  assert.equal(parseSellingQty('selling: 71'), 71);
  assert.equal(parseSellingQty('selling71'), 71);
  assert.equal(parseSellingQty('I am selling 71 of these'), 71);
  assert.equal(parseSellingQty('selling 71 then 2 more'), 71);
});

test('parseSellingQty: selling/stock N; junk between verb and N is ignored', () => {
  assert.equal(parseSellingQty('selling 5'), 5);
  assert.equal(parseSellingQty('selling-5'), 5);
  assert.equal(parseSellingQty('selling:5'), 5);
  assert.equal(parseSellingQty('selling : 5'), 5);
  assert.equal(parseSellingQty('stock  5'), 5);
  assert.equal(parseSellingQty('stock-5'), 5);
  assert.equal(parseSellingQty('Stock:5'), 5);
  assert.equal(parseSellingQty('Stock: 5'), 5);
  assert.equal(parseSellingQty('STOCK 5'), 5);
  assert.equal(parseSellingQty('stock5'), 5);
});

test('parseSellingQty: A/B remaining-for-sale is B-A; prefer A/B over bare N', () => {
  assert.equal(parseSellingQty('1/10'), 9);
  assert.equal(parseSellingQty('0/10'), 10);
  assert.equal(parseSellingQty('10/10'), 0);
  assert.equal(parseSellingQty('9/10'), 1);
  assert.equal(parseSellingQty('I have 1/10'), 9);
  assert.equal(parseSellingQty('selling 5'), 5);
  assert.equal(parseSellingQty('stock-5'), 5);
  assert.equal(parseSellingQty('selling 5 1/10'), 9);
  assert.equal(parseSellingQty('1/10 selling 5'), 9);
  assert.equal(parseSellingQty('selling 1/10'), 9);
  assert.equal(parseSellingQty('selling/5'), null);
  assert.equal(parseSellingQty('stock/5'), null);
  assert.equal(parseFractionQty('1/10'), 9);
  assert.equal(parseFractionQty('10/10'), 0);
  assert.equal(parseFractionQty('12/10'), null);
});

test('parseSellingQty: no match → null (do not invent N)', () => {
  assert.equal(parseSellingQty(''), null);
  assert.equal(parseSellingQty('I have 10 left'), null);
  assert.equal(parseSellingQty('buy 71'), null);
  assert.equal(parseSellingQty('seller 71'), null);
  assert.equal(parseSellingQty('selling'), null);
  assert.equal(parseSellingQty('selling 0'), null);
  assert.equal(parseSellingQty('stock'), null);
  assert.equal(parseSellingQty('stock 0'), null);
  assert.equal(parseSellingQty('have 5'), null);
  assert.equal(parseSellingQty('stocking 5'), null);
  assert.equal(parseSellingQty('stockpile 5'), null);
  assert.equal(parseSellingQty('Haystack 5'), null);
  assert.equal(parseSellingQty('in stock now'), null);
});

test('listing comment fields are the real snapshot / HTML names, not buyout', () => {
  assert.ok(LISTING_COMMENT_KEYS.includes('details'));
  assert.ok(LISTING_COMMENT_KEYS.includes('comment'));
  assert.ok(LISTING_COMMENT_KEYS.includes('listed_comment'));
  assert.equal(LISTING_COMMENT_KEYS.includes('buyout'), false);
  assert.equal(sellingQtyOf({ details: 'selling 71' }), 71);
  assert.equal(sellingQtyOf({ comment: 'Selling 2' }), 2);
  assert.equal(sellingQtyOf({ listed_comment: 'sell 71' }), 71);
  assert.equal(sellingQtyOf({ details: 'stock 5' }), 5);
  assert.equal(sellingQtyOf({ comment: 'stock-5' }), 5);
  assert.equal(sellingQtyOf({ message: 'Stock:5' }), 5);
  assert.equal(sellingQtyOf({ details: '1/10' }), 9);
  assert.equal(sellingQtyOf({ details: '10/10' }), 0);
  assert.equal(sellingQtyOf({ message: 'selling 3' }), 3);
  assert.equal(sellingQtyOf({ description: 'selling 4' }), 4);
  assert.equal(sellingQtyOf({ 'data-listing_comment': 'selling 5' }), 5);
  assert.equal(sellingQtyOf({ buyout: 1, quantity: 71 }), null);
  assert.equal(sellingQtyOf({ listing: { details: 'selling 8' } }), 8);
  assert.match(listingCommentText({ details: 'selling 71' }), /selling 71/);
});

test('packKeyQty: min(N, stock, afford, offer cap); no N keeps stock/afford', () => {
  assert.equal(packKeyQty({ n: 71, stock: 80, afford: 100, offerCap: STEAM_OFFER_ITEM_CAP }), 71);
  assert.equal(packKeyQty({ n: 71, stock: 10, afford: 100, offerCap: STEAM_OFFER_ITEM_CAP }), 10);
  assert.equal(packKeyQty({ n: 71, stock: 80, afford: 5, offerCap: STEAM_OFFER_ITEM_CAP }), 5);
  assert.equal(packKeyQty({ n: 300, stock: 300, afford: 300, offerCap: STEAM_OFFER_ITEM_CAP }), 256);
  assert.equal(packKeyQty({ stock: 5, afford: 10, offerCap: STEAM_OFFER_ITEM_CAP }), 5);
  assert.equal(packKeyQty({ stock: 12, afford: 3, offerCap: STEAM_OFFER_ITEM_CAP }), 3);
  assert.equal(packKeyQty({ afford: 4, offerCap: STEAM_OFFER_ITEM_CAP }), 4);
  assert.equal(packKeyQty({}), 0);
  assert.equal(packKeyQty({ n: 0, stock: 8, afford: 10, offerCap: STEAM_OFFER_ITEM_CAP }), 0);
});

test('keyPackRemaining: comment N clamped; no comment uses stock/afford', () => {
  assert.equal(
    keyPackRemaining({ details: 'selling 71', quantity: 80 }, { afford: 100 }),
    71,
  );
  assert.equal(
    keyPackRemaining({ details: 'selling 71', quantity: 10 }, { afford: 100 }),
    10,
  );
  assert.equal(
    keyPackRemaining({ details: 'selling 71' }, { stock: 80, afford: 2 }),
    2,
  );
  assert.equal(
    keyPackRemaining({ details: 'stock 5', quantity: 80 }, { afford: 100 }),
    5,
  );
  assert.equal(
    keyPackRemaining({ details: 'stock-5' }, { stock: 80, afford: 2 }),
    2,
  );
  assert.equal(
    keyPackRemaining({ details: '1/10', quantity: 80 }, { afford: 100 }),
    9,
  );
  assert.equal(
    keyPackRemaining({ details: '0/10', quantity: 80 }, { afford: 100 }),
    10,
  );
  assert.equal(
    keyPackRemaining({ details: '10/10', quantity: 80 }, { afford: 100 }),
    0,
  );
  assert.equal(
    keyPackRemaining({ details: 'I have 10 left' }, { stock: 6, afford: 9 }),
    6,
  );
  assert.equal(
    keyPackRemaining({ buyout: 1 }, { stock: 4, afford: 9 }),
    4,
  );
});

test('comment with a trade URL still only yields N — no token in the number', () => {
  const row = {
    details: 'selling 71 https://steamcommunity.com/tradeoffer/new/?partner=1&token=SECRETTOKEN',
  };
  assert.equal(sellingQtyOf(row), 71);
  assert.equal(typeof sellingQtyOf(row), 'number');
});
