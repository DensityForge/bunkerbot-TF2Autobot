# Overview

bunkerbot is our Team Fortress 2 trading bot. TF2Autobot is the public bot written by IdiNium. The TF2Autobot source we compared against was version 5.18.0, published under the MIT license.

This package exists so you can read the overlap without opening the rest of the bunkerbot repository. It shows the behaviors we copied from that version of TF2Autobot, and the changes we made after the copy.

In these notes, "you" means TF2Autobot and "we" means bunkerbot.

Read this page first. Then open the chapter for the area you care about. Then open the source file that chapter names.

The folder `src/bunkerbot/` holds copies of our modules. The folder `src/excerpt/` holds a short function cut out of a larger bunkerbot file. We left the rest of those larger files out because they are our shop and listing code, not the overlap with TF2Autobot.

This folder cannot be started as a bot. It is also not a patch you can drop onto the TF2Autobot repository.

| | |
|---|---|
| bunkerbot | donkeybrains#1504, densityforge@gmail.com, [trade offer](https://steamcommunity.com/tradeoffer/new/?partner=691756854&token=EEH2ayer) |
| TF2Autobot | IdiNium, https://github.com/TF2Autobot/tf2autobot |
| TF2Autobot license | MIT, copyright 2020–2022 TF2Autobot/IdiNium |
| This package | Creative Commons Attribution-NonCommercial 4.0 International. The text is in `LICENSE` and `NOTICE.md`. |

## Read in this order

1. `README.md` tells you what this repository is, and what it is not.
2. This page lists the four behaviors we kept, and the list of behaviors we studied and did not copy.
3. [Friend chat](docs/chat.md) and [When Steam says the bot has made too many requests](docs/steam-429.md) match what the running bunkerbot actually does today.
4. [Trade offers built like a cart](docs/cart.md) is written. It is not yet connected to the code that sends live trade offers.
5. [A local price server](docs/custom-pricer.md) is a test server. It is not where bunkerbot reads live prices.
6. [What we read and chose not to copy](docs/left-on-the-table.md) is everything we studied and left behind.
7. [Source files](src/README.md) says which files you can actually run inside this repository.

That distinction matters. Some of this code is what the running bot uses. Some of it is written and unused. One piece is only a test server.

## What we took, and what we changed

**Staying visible on Steam so friend chat is delivered.** Steam only delivers some friend chat reliably when the account appears online and is playing Team Fortress 2. Steam's application number for that game is 440. In TF2Autobot this happens in `Bot.ts`: the bot sets its persona to Online and tells Steam it is playing application 440, sometimes with a custom game title. Our equivalent is the `goOnline` function in `src/excerpt/presence.js`, taken from our `session.js`. We always play application 440. We do not set a custom game title. We do not use Steam's Snooze status. This code is what the running bunkerbot uses today.

**Friend messages that start with an exclamation mark.** TF2Autobot ignores Steam's own trade-offer notices and only answers people who are friends. That logic is in `Bot.ts` (`onMessage`), `CommandParser.ts`, and `Friends.ts`. Our version is the `attachChat` function in `src/bunkerbot/chat.js`. The steam-user library, version 5, delivers those messages on `client.chat`, so we listen there instead of on the older `client.on('friendMessage')` event. After a message arrives we tell Steam it has been read. Only one command from a given friend runs at a time, and we wait four tenths of a second after it finishes before we accept another from that same friend. The command words are ours, and so is the greeting text. This code is what the running bunkerbot uses today.

**One trade offer, filled until it cannot take more, paid for what actually went into the offer.** TF2Autobot does this in `Cart.ts` with `addTheirItem`, and in `UserCart.ts` at checkout. Our version is `src/bunkerbot/convert-cart.js`, with the listing-comment reader in `listing-selling-qty.js`. We do not run the TF2Autobot chat shop, where a person types `!buy`, `!sell`, and `!checkout`. A backpack.tf listing already names the Steam item identifiers. We add one item at a time. A listing comment such as `selling 10` or `1/10` sets how many to take. This code is written. The part of bunkerbot that sends trade offers today does not call it yet.

**A "too many requests" answer from Steam is a reason to wait, not a reason to restart.** TF2Autobot's escrow check in `Trades.ts` tries again up to five times. Each wait is longer than the last, starting from five seconds. Our inventory downloads, in `src/excerpt/steam-busy.js` taken from `inventory.js`, stop for a fixed five minutes. If we already downloaded that inventory, we keep using that copy during the wait. We did not copy TF2Autobot's retry timing. This code is what the running bunkerbot uses today.

**A price service TF2Autobot can call over the web and over a live socket.** TF2Autobot's client is `custom-pricer-api.ts` and `custom-pricer-socket-manager.ts`. Our stand-in server is `src/bunkerbot/local-pricer-server.js`. It answers a request for the whole list, a request for one item by its item code, and a request that asks for that item to be checked again. It then pushes an event named `price` after the client is marked authenticated. It does not call pricedb.io. It does not check an API token. The check request repeats the item code and does not look up a new price. When a row has a buy price and no sell price, the sell price in refined metal is the buy price plus eleven hundredths of a refined. This server is only for tests. It is not the price source the running bunkerbot uses.

## What is in `src/`

[Source files](src/README.md) lists each file, the original path inside bunkerbot, and whether you can run that file using only this repository.

`chat.js` and `convert-cart.js` import other parts of bunkerbot. Those parts stayed in the bunkerbot repository. They are our listing search, our shop, and the loader for our environment. They are not part of what we took from TF2Autobot.

## What we read and chose not to copy

We read more of the TF2Autobot design than we kept. The list is in [What we read and chose not to copy](docs/left-on-the-table.md). In short: we did not make `pricelist.json` the whole plan for the bot, we do not restart the process when a price changes, we do not use prices.tf as the price feed, we have no Discord command bridge, and we do not use the TF2Autobot checkout shop.

## License

You may take the ideas here and build your own system, in your own code. This code and these notes belong to bunkerbot, under Creative Commons Attribution-NonCommercial 4.0 International. If you share them, credit bunkerbot (donkeybrains#1504) and keep the license with the copy. TF2Autobot is not an author of this code. The TF2Autobot repository stays under the MIT license, and nothing in this folder changes that. If you want to sell this code, or run it as a paid service, email densityforge@gmail.com. We can agree to that in writing.
