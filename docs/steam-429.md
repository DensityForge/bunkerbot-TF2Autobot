# When Steam says the bot has made too many requests

Steam answers some requests with HTTP status 429, which means "too many requests." TF2Autobot treats that answer as a reason to wait. It does not treat that answer as a reason to restart the whole bot. We kept that policy for inventory downloads. We use a different timer.

This code is what the running bunkerbot uses today.

## What TF2Autobot does

In `Trades.ts`, the escrow check calls `getUserDetails`. If Steam returns HTTP 429 ("too many requests"), the bot tries again, up to five times. Each wait is longer than the last: the helper `exponentialBackoff` is multiplied by five seconds. The log line says the escrow check failed because Steam returned HTTP 429, and that this failure does not restart the bot.

A separate HTTP 429, when the bot checks whether an administrator is banned, waits ten seconds and tries that Steam account again. That path is in `Bot.ts`.

`InventoryGetter.ts` in version 5.18.0 does not have its own wait for HTTP 429. We did not copy a function out of that file.

## What bunkerbot does

`src/excerpt/steam-busy.js` is the inventory path taken from `bunkerbot/lib/inventory.js`.

- `isSteamBusy` treats these as the same kind of busy signal: HTTP status 429 ("too many requests"), Steam status 29, the text `429` inside an error message, and Steam's "duplicate request" wording.
- The first matching error starts a five-minute pause. The constant name is `STEAM_BUSY_MS`.
- During that pause we do not download a fresh inventory. If we already have a copy from the last successful download, we return that copy, even if it is older than the usual two-minute cache.
- We do not retry with a growing delay. We do not restart the bot.
- `noteSteamSit` records the pause so our trade loop can see it. That recorder is bunkerbot code and is not included in this package. The extract still calls it, so you can see where the pause is reported.

We load inventories only through `getUserInventoryContents` on the `steam-tradeoffer-manager` library. We do not request `steamcommunity.com/inventory` ourselves.

## Files

- `src/excerpt/steam-busy.js`
