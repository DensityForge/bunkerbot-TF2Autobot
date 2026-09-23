import fs from 'node:fs';
import SteamUser from 'steam-user';
import { emit } from './out.js';
import { isAdmin } from './admins.js';
import { noteInbound, noteOutbound } from './chat-log.js';
import { PATHS } from './env.js';
import { liveBuyUnit, liveSellUnit } from './key-price.js';
import { bptfIsLimited } from './bptf-limit.js';
import { OUT_OF_KEYS_REPLY } from './key-shop.js';

const TRADEOFFER_TAG = /^\[tradeoffer sender=.+\]$/;

function sid64(steamID) {
  if (!steamID) return '';
  if (typeof steamID.getSteamID64 === 'function') return steamID.getSteamID64();
  return String(steamID);
}

function isFriend(session, steamID) {
  const id = sid64(steamID);
  const rel = session.client.myFriends?.[id];
  return rel === SteamUser.EFriendRelationship.Friend;
}

/** backpack.tf classifieds 429. Steam fills still work. Never a key-sell ad. */
export const RATE_LIMIT_CHAT =
  "Sorry — backpack.tf is rate-limiting us right now. Listings may look stale. We still fill our half of a matching trade.";

/** Friend chat shop: after qty/plan is approved, before createOffer (can take 1–2 min). */
export const TRADE_STARTING_CHAT =
  "Thank you! I'm starting the trade. It sometimes takes a minute or two.";

/** Shop / thanks / out-of-keys — no rate-limit prefix. Miss and sold-out are shop answers, not classifieds. */
export function isShopResultLine(text) {
  const t = String(text ?? '');
  if (t === 'Thank you for trading!') return true;
  if (t === TRADE_STARTING_CHAT) return true;
  if (t === OUT_OF_KEYS_REPLY) return true;
  if (/^Sold you /.test(t)) return true;
  if (/^Buying \d/.test(t)) return true;
  if (/^No shop row for /.test(t)) return true;
  if (/^We have 0 .+ left\./.test(t)) return true;
  if (/^We have \d+\/\d+ /.test(t)) return true;
  if (/^Can't\. Max \d+\.$/.test(t)) return true;
  if (/^Can't add \d+ /.test(t)) return true;
  if (/^Can't send\./.test(t)) return true;
  if (/^Offer already out /.test(t)) return true;
  if (/^Already sending/.test(t)) return true;
  if (/^Not buying .+ right now/.test(t)) return true;
  if (/^How many/.test(t)) return true;
  return false;
}

/** Canned `!sell 1 key @ 64.xx` / 5-minute key-sell ad. Must not go out. */
export function isKeySellAd(text) {
  const t = String(text ?? '');
  return /!sell 1 key/i.test(t) && /64\.\d{2}/.test(t);
}

/** Drop the priced key-sell sentence. Never rewrite to "out of keys" — that is the other shop side. */
export function stripKeySellAd(text) {
  return String(text ?? '')
    .replace(/\s*Then !sell 1 key works @ \d+\.\d{2}\.?/gi, '')
    .replace(/!sell 1 key[^\n]*64\.\d{2}[^\n]*/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function withChatPreamble(message, { limited } = {}) {
  let text = String(message ?? '');
  if (!text) return text;
  if (isKeySellAd(text)) text = stripKeySellAd(text);
  if (!text) return text;
  if (isShopResultLine(text)) return text;
  const on = limited === true || (limited !== false && bptfIsLimited());
  if (!on) return text;
  if (isKeySellAd(RATE_LIMIT_CHAT)) return text;
  if (text.startsWith(RATE_LIMIT_CHAT)) return text;
  return `${RATE_LIMIT_CHAT}\n\n${text}`;
}

export async function sendFriendChat(session, to, message) {
  const text = withChatPreamble(message);
  if (!text) return { to: sid64(to), message: '', skipped: true };
  const id = sid64(to);
  if (!id) throw new Error('missing recipient');

  if (isFriend(session, id)) {
    await session.client.chat.sendFriendMessage(id, text, {
      chatEntryType: 1,
      containsBbCode: false,
    });
  } else {
    session.client.chatMessage(id, text);
  }
  noteOutbound({ to: id, message: text });
  return { to: id, message: text };
}

export function addFriendsEnabled() {
  return process.env.ADD_FRIENDS !== 'false';
}

export function addFriend(session, steamID) {
  const id = sid64(steamID);
  if (!id) {
    return Promise.resolve({ ok: false, to: '', error: 'missing steamid' });
  }
  return new Promise((resolve) => {
    session.client.addFriend(id, (err, personaName) => {
      if (err) {
        resolve({
          ok: false,
          to: id,
          error: err.message || String(err),
          eresult: err.eresult,
        });
        return;
      }
      resolve({ ok: true, to: id, personaName: personaName || null });
    });
  });
}

export const acceptFriendRequest = addFriend;

export async function acceptPendingFriendRequests(session) {
  const friends = session.client.myFriends || {};
  const pending = Object.keys(friends).filter(
    (id) => friends[id] === SteamUser.EFriendRelationship.RequestRecipient
  );
  const results = [];
  for (const id of pending) {
    const res = await addFriend(session, id);
    results.push(res);
    emit(res.ok ? 'friend_accept' : 'friend_add_failed', res);
  }
  return results;
}

/**
 * Elite receive path: SteamChatRoomClient, not deprecated client.on('friendMessage').
 * Payload is { steamid_friend, message, local_echo, ... }.
 */
export function attachChat(session, { prefix = '!', onCommand, onPlain } = {}) {
  const busy = new Map();

  const handle = async (body) => {
    if (!body || body.local_echo) return;
    const steamID = body.steamid_friend;
    const message = String(body.message_no_bbcode || body.message || '').trim();
    if (!message) return;
    if (TRADEOFFER_TAG.test(message)) return;

    const from = sid64(steamID);
    try {
      session.client.chat.ackFriendMessage(steamID, body.server_timestamp);
    } catch {
      // ack is best-effort
    }
    emit('chat', { from, message, friend: isFriend(session, from) });

    if (!isFriend(session, from) && !isAdmin(from)) return;
    if (busy.get(from)) return;

    const isCmd = message.startsWith(prefix);
    const noted = noteInbound({ from, message, command: isCmd, prefix });
    if (noted.pending) emit('chat_needs', { from, message });
    busy.set(from, 1);
    try {
      if (isCmd && onCommand) await onCommand(steamID, message, prefix);
      else if (!isCmd && onPlain) await onPlain(steamID, message);
    } finally {
      setTimeout(() => busy.delete(from), 400);
    }
  };

  session.client.chat.on('friendMessage', (body) => {
    void handle(body).catch((err) => {
      emit('chat_error', { error: err?.message || String(err) });
    });
  });

  session.client.on('friendRelationship', (steamID, relationship) => {
    const from = sid64(steamID);
    if (relationship === SteamUser.EFriendRelationship.RequestRecipient) {
      emit('friend_request', { from });
      if (addFriendsEnabled() || isAdmin(from)) {
        void addFriend(session, steamID).then((res) => {
          emit(res.ok ? 'friend_accept' : 'friend_add_failed', { from, ...res });
        });
      }
    } else if (relationship === SteamUser.EFriendRelationship.Friend) {
      emit('friend', { from });
      void sendFriendChat(session, from, greetingText(prefix)).catch(() => {});
    }
  });

  return { prefix };
}

export function publicCommandLines(prefix = '!') {
  const p = prefix;
  return [
    `${p}help — this list`,
    `${p}owner — owner SteamIDs`,
    `${p}stock [name] — tradable stock`,
    `${p}price [name] — our buy/sell (house pricelist)`,
    `${p}buy keys — buy keys from us @ ${liveSellUnit()} (we ask how many)`,
    `${p}sell <n> key(s) — sell keys to us @ ${liveBuyUnit()}`,
    `${p}sell Killstreak <weapon> — sell us Unique KS-1 @ 13 (need 2)`,
    `${p}sell Battle-Worn Robot KB-808 — sell us @ 1 ref (need 50)`,
    `${p}cancel — cancel my last offer from this bot`,
    `${p}refund — reverse last accepted trade (5 min)`,
    `${p}message <text> — relay to owner`,
  ];
}

export function shopNotice() {
  try {
    const note = fs.readFileSync(PATHS.shopNotice, 'utf8').trim();
    if (!note || isKeySellAd(note)) return '';
    return note;
  } catch {
    return '';
  }
}

export function greetingText(prefix = '!') {
  const cmds = `Hi! I'm BunkerBot.\nCommands:\n- ${publicCommandLines(prefix).join('\n- ')}`;
  const note = shopNotice();
  return note ? `${note}\n\n${cmds}` : cmds;
}

export { isFriend, sid64 };
