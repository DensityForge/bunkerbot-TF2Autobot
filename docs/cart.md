# Trade offers built like a cart

TF2Autobot builds one Steam trade offer per checkout. It adds the other person's items until they no longer have those items, or until the bot cannot take any more. The price the bot pays is based on how many items actually made it into the offer, not on how many the person asked for in chat.

We kept that idea. We pointed it at backpack.tf classified listings instead of a shopping cart that a person fills by typing `!buy` and `!checkout`.

This module is written. The part of bunkerbot that sends trade offers today does not call it. Those offers still use an older path. Do not read this chapter as a description of live trades.

## What TF2Autobot does

`Cart.addTheirItem` stores a count on the cart, keyed by TF2Autobot's item code (the SKU string). At checkout, `UserCart` loads both inventories. For each item code it finds the matching Steam item identifiers, reduces the count to however many the other person actually holds and however many the bot can still buy, and writes that smaller count back onto the cart. The trade offer is built from those final counts. The person who is trading fills the cart in Steam chat with commands such as `!buy`, `!sell`, and `!checkout`.

## What bunkerbot does

The file `src/bunkerbot/convert-cart.js` is a cart for backpack.tf listings. It is not a chat cart.

- The other trader and the item already come from a listing row. That row already includes Steam item identifiers.
- The function `addTheirUntil` adds one item at a time. It stops when the needed count is reached, or when adding the next item fails. After a failure it does not skip ahead and try a later identifier.
- The bot pays the listing's asking price multiplied by how many items were actually added. It does not pick a count first and hope every add succeeds.
- Items from the same seller that share the same internal item identity go on one offer.

Listing comments control the count. A comment that says `selling 10` or `stock 10` means take at most ten items from that seller. A comment that looks like `1/10` means nine are still for sale, because we subtract the first number from the second. A comment that looks like `10/10` means none are left, so we skip that listing. If both styles appear on the same listing, the `1/10` style wins over a bare number such as `selling 10`. After that, the count is also limited by how many items they hold, how many we can afford, and Steam's limit of 256 items on a single offer.

The comment reader is `src/bunkerbot/listing-selling-qty.js`. `part-buy-qty.js` is a small helper used by that reader. It did not come from TF2Autobot.

## What is running today

The cart module is in this repository. The part of bunkerbot that sends trades today does not call this module yet. Those trades still use an older path. Read `convert-cart.js` as the change we wrote, not as the code that is sending live offers.

`src/bunkerbot/convert-cart.test.js` and `listing-selling-qty.test.js` are the tests. The comment-reader tests can run inside this folder. The cart tests import the rest of bunkerbot, so they cannot run from this folder alone. The test cases are still here so you can read them.

## Files

- `src/bunkerbot/convert-cart.js`
- `src/bunkerbot/convert-cart.test.js`
- `src/bunkerbot/listing-selling-qty.js`
- `src/bunkerbot/listing-selling-qty.test.js`
- `src/bunkerbot/part-buy-qty.js`
