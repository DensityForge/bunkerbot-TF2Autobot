# What we read in TF2Autobot and chose not to copy

While we were designing bunkerbot we read how TF2Autobot version 5.18.0 is put together. The pieces below stayed in TF2Autobot. We list them so this package accounts for everything we studied, not only the four pieces we kept.

**Using `pricelist.json` as the entire plan for the bot.** In TF2Autobot that file says what to bank, what to buy, what to sell, the minimum stock, the maximum stock, and whether the price updates itself. Our listings and stock targets live in a different list. We did not make `pricelist.json` the plan for bunkerbot.

**One operating-system process per Steam account, often kept up by PM2.** PM2 is a process manager. Many TF2Autobot operators use it so the bot process starts again if it exits. We also run one process per Steam login. We did not adopt PM2.

**Restarting the process to apply a price change.** An automatic pricer in that setup writes the price list and then the bot process starts over. We do not do that. Price changes apply inside the process that is already running.

**prices.tf or pricedb.io as the price feed.** Those services are not where bunkerbot gets prices. The local server in [A local price server](custom-pricer.md) only answers the same requests and events. It is not the price source the running bunkerbot uses.

**Discord messages forwarded into the same command handler.** bunkerbot has no bridge that turns a Discord message into a Steam chat command.

**The chat shop.** A person types `!buy`, `!sell`, `!checkout`, or `!clearcart`, and there are also donation carts. Our friend commands are a different list. See [Friend chat](chat.md) and [Trade offers built like a cart](cart.md).

**The listing manager inside the same Steam process that also holds the other connections.** Our backpack.tf listing updates run apart from the other jobs on the chat process. We keep one backpack.tf websocket for the whole setup, rather than opening a separate one for each idea.

Bliss Autopricer, and other people's backpack.tf collectors, were in the same design pass. They are not TF2Autobot code, so they are not unpacked here. The decision that touches TF2Autobot is the one above: a separate price program may exist, and it does not restart the bot.
