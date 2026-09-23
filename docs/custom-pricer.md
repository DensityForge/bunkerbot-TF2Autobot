# A local price server that speaks TF2Autobot's custom-pricer protocol

TF2Autobot can load prices from an HTTP service. It can also receive a live price update over a socket.io connection. Socket.io is a library that keeps a connection open so the server can push a message without waiting for the next request. We wrote a small local server that answers those same requests and events.

This server is for tests. It is not the price source the running bunkerbot uses. It does not call pricedb.io.

## What TF2Autobot expects

`CustomPricerApi` uses `https://pricedb.io/api` when no other address is configured.

- `GET /items?src=bptf` returns the full list. `src=bptf` means the prices are tagged as coming from backpack.tf.
- `GET /items/:sku?src=bptf` returns one item. The SKU is TF2Autobot's item code.
- `POST /items/:sku` with `source=bptf` asks the service to refresh that item.

Each item object has an item code, a name, a source, a timestamp, a buy price in keys and refined metal, and a sell price in keys and refined metal.

`custom-pricer-socket-manager.ts` is a socket.io client. It listens for connection, authentication, disconnect, rate-limit, blocked, and connection-error events, and it can subscribe to more events by name. Price updates arrive on the event named `price`. HTTP requests send a User-Agent of `TF2Autobot@` plus the version number, and they send an API token when one is configured.

## What our local server does

The server is `src/bunkerbot/local-pricer-server.js`. The command that starts it is `src/bunkerbot/local-pricer.mjs`, with `--port`, `--catalog`, and `--rate`. The default port is 5555.

What matches the TF2Autobot client:

- A request for the whole list returns `success`, `currency`, and `items`. Each item has an item code, a name, a source, a time, a buy price, and a sell price.
- A request for one item by its item code returns that item, or HTTP status 404 with `success` set to false and a message.
- A request that asks for an item to be checked returns `success`, the item code, and the name.
- The socket.io polling handshake answers that the client is authenticated.
- A price update is sent as the engine.io packet `42["price",{...}]`. Engine.io is the framing socket.io uses on the wire.

Where our server differs from pricedb.io:

- The catalog is a JSON file on disk. There is no call to pricedb.io.
- No API token is checked. Any client that finishes the polling handshake is marked authenticated.
- A request that asks for an item to be checked does not look up a new price. It repeats the item code it already has.
- The list response also returns `total` and `page`. A `limit` of 0 returns the whole list.
- `normalizeItemPrice` accepts TF2Autobot's buy and sell objects. If a catalog row has a buy price and no sell price, we create a sell price from the buy price. If that sell price is only refined metal, with no keys, we add eleven hundredths of a refined. If that sell price is only keys, with no extra metal, we add one refined. The point of the bump is to keep the buy price and the sell price from being the same number.
- `POST /push` and `POST /update` write a price and send it to connected clients. Those two routes are ours. They are not part of the TF2Autobot protocol.
- The socket layer is written by hand as engine.io frames. It is not the `socket.io` server package.

## What is running today

You can point a TF2Autobot process at this server if you want to test TF2Autobot against a fake price service. bunkerbot itself does not read prices from this process. We also did not copy TF2Autobot's habit of restarting the whole bot when the price list file changes.

`src/bunkerbot/local-pricer-server.test.js` can run inside this folder. `src/bunkerbot/env.js` in this folder is a stand-in, so the server file can load. It is not the loader bunkerbot uses for its real environment.

## Files

- `src/bunkerbot/local-pricer-server.js`
- `src/bunkerbot/local-pricer-server.test.js`
- `src/bunkerbot/local-pricer.mjs`
- `src/bunkerbot/env.js` (a stand-in, in this package only)
