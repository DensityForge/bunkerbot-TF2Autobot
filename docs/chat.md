# Friend chat

TF2Autobot stays signed in to Steam, appears online, shows as playing Team Fortress 2, and treats a friend message as a command when the message starts with an exclamation mark. We kept that overall design. We changed three things: which library event we listen to, how we stop two commands from the same friend running at once, and which command words the bot understands.

This code is what the running bunkerbot uses today.

## What TF2Autobot does

In `Bot.ts`, after the bot reconnects and is ready:

- TF2Autobot sets the Steam status to Online with `setPersona`.
- If `miscSettings.game.playOnlyTF2` is set, it tells Steam it is playing Team Fortress 2. Steam's application number for that game is 440, so the call is `gamesPlayed(440)`.
- Otherwise it calls `gamesPlayed` with a custom name, defaulting to "Team Fortress 2", and it still includes Team Fortress 2 in that list.

`onMessage` drops a message that starts with `[tradeoffer sender=` and ends with `[/tradeoffer]`. Those are Steam's own trade-offer notices, not a person talking. The rest of the text goes to the command handler. `CommandParser.getCommand` takes the first word after the prefix. The default prefix is an exclamation mark, from `miscSettings.prefixes.steam`. `Friends.isFriend` checks that the sender is a friend. Accepting new friends is the `addFriends` option.

In version 5.18.0 the listener is the `friendMessage` event on `client`.

## What bunkerbot does

Showing as online is the `goOnline` function in `src/excerpt/presence.js`. That function was cut from `bunkerbot/lib/session.js`. It sets the account to Online and tells Steam it is playing Team Fortress 2. We do not set a custom game title. We do not use Steam's Snooze status.

Receiving chat is the `attachChat` function in `src/bunkerbot/chat.js`.

- The steam-user library, version 5, delivers friend chat on `client.chat`, not on the older `client.on('friendMessage')` event. Each message arrives as an object with the friend's Steam identifier, the message text, the text with Steam formatting removed, a flag for whether the bot itself sent it, and a server timestamp.
- We ignore a message the bot itself just sent.
- We ignore a trade-offer notice that matches the pattern `^[tradeoffer sender=.+]$`.
- After a friend message arrives, we call `chat.ackFriendMessage` so Steam marks the message as read. If we skip that call, Steam can keep the message as unread and may deliver it again.
- We ignore anyone who is not a friend and not an administrator.
- Only one command from a given friend runs at a time. When that command finishes, we wait four tenths of a second before we allow another command from the same friend. That pause is there so a second message does not start while the first reply is still being sent.
- Incoming friend requests are accepted unless the environment variable `ADD_FRIENDS` is the string `false`. When the request becomes a friendship, the bot sends `Hi! I'm BunkerBot.` and the public command list.

## The command words

The loop that receives chat is the part we took from TF2Autobot. The words the bot understands are ours. They live in our command handler, which is not in this package, because that handler is our shop.

Public commands, from the list named `publicCommandLines` in `chat.js`:

- `!help`, `!owner`, `!stock`, and `!price`
- `!buy keys`, and `!sell` lines for keys and for two named shop items
- `!cancel`, `!refund`, and `!message`

Administrator commands: `!say`, `!add`, `!send`, `!offers`, `!listings`, `!pricelist`, `!bid`, `!ask`, and `!stop`.

TF2Autobot's shop, where someone types `!buy` for an item and then `!checkout` or `!clearcart`, is a different set of commands. That shopping-cart design is described in [Trade offers built like a cart](cart.md).

## Files

- `src/excerpt/presence.js`
- `src/bunkerbot/chat.js`
