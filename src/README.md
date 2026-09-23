# Source files in this package

These files are copies or short extracts from bunkerbot. Read each file together with the chapter listed in the table.

Some files import modules that are not in this folder. Those missing modules are the rest of bunkerbot: the shop, the listing search, and the real environment loader. We left them out on purpose. This package is the overlap with TF2Autobot, not a runnable copy of bunkerbot.

The last column answers whether you can execute that file inside this repository, with only the files shipped here.

| File | Original path inside bunkerbot | Chapter | Can you run this file using only this repository? |
|---|---|---|---|
| `excerpt/presence.js` | The `goOnline` function in `bunkerbot/lib/session.js` | [Friend chat](../docs/chat.md) | No. It is a short extract, not a program you can start. |
| `excerpt/steam-busy.js` | The "too many requests" window in `bunkerbot/lib/inventory.js` | [When Steam says too many requests](../docs/steam-429.md) | No. It is a short extract. `noteSteamSit`, which records the pause, is not included. |
| `bunkerbot/chat.js` | `bunkerbot/lib/chat.js` | [Friend chat](../docs/chat.md) | No. It imports the shop and the environment loader, which are not in this folder. |
| `bunkerbot/convert-cart.js` | `bunkerbot/lib/convert-cart.js` | [Trade offers built like a cart](../docs/cart.md) | No. It imports the rest of the trade path, which is not in this folder. |
| `bunkerbot/convert-cart.test.js` | `bunkerbot/lib/convert-cart.test.js` | [Trade offers built like a cart](../docs/cart.md) | No. It needs those same missing imports. The cases are here so you can read them. |
| `bunkerbot/listing-selling-qty.js` | `bunkerbot/lib/listing-selling-qty.js` | [Trade offers built like a cart](../docs/cart.md) | Yes, together with `part-buy-qty.js`. |
| `bunkerbot/listing-selling-qty.test.js` | `bunkerbot/lib/listing-selling-qty.test.js` | [Trade offers built like a cart](../docs/cart.md) | Yes. |
| `bunkerbot/part-buy-qty.js` | `bunkerbot/lib/part-buy-qty.js` | [Trade offers built like a cart](../docs/cart.md) | This is a helper for the comment reader. It did not come from TF2Autobot. |
| `bunkerbot/local-pricer-server.js` | `bunkerbot/lib/local-pricer-server.js` | [A local price server](../docs/custom-pricer.md) | Yes, together with the stand-in file `env.js`. |
| `bunkerbot/local-pricer-server.test.js` | `bunkerbot/lib/local-pricer-server.test.js` | [A local price server](../docs/custom-pricer.md) | Yes. |
| `bunkerbot/local-pricer.mjs` | `bunkerbot/scripts/local-pricer.mjs` | [A local price server](../docs/custom-pricer.md) | No. It imports the real environment loader from bunkerbot, which is not here. |
| `bunkerbot/env.js` | Written for this package. There is no original bunkerbot path. | [A local price server](../docs/custom-pricer.md) | It is a stand-in only. It is not bunkerbot's environment loader. |

These copies are the snapshot in this repository.
