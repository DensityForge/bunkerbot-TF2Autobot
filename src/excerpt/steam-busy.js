/**
 * Extract from bunkerbot/lib/inventory.js — the Steam HTTP 429 window.
 * TF2Autobot retries escrow 429 with exponential backoff and does not restart the bot.
 * This path is a fixed 5-minute fail-fast. A warm cache still answers.
 * noteSteamSit / resetSteamSit record the pause in our trade loop. They are not in this folder.
 * Credit: ../../NOTICE.md
 */

const APPID = 440;
const CONTEXTID = 2;
const INV_TTL_MS = 120_000;
/** Inventory 429: 5-minute fail-fast. */
export const STEAM_BUSY_MS = 5 * 60 * 1000;

const invCache = new Map();
let steamBusyUntil = 0;

export function isSteamBusy(err) {
  const status = Number(err?.status || err?.eresult || 0);
  const msg = String(err?.message || err || '');
  return (
    status === 429 ||
    status === 29 ||
    /\b429\b/.test(msg) ||
    /duplicate request/i.test(msg) ||
    /duplicate and the action has already occurred/i.test(msg)
  );
}

export function steamInventoryBusy() {
  return Date.now() < steamBusyUntil;
}

export function markSteamBusy(ms = STEAM_BUSY_MS) {
  const n = Number(ms);
  const add = Number.isFinite(n) && n > 0 ? n : STEAM_BUSY_MS;
  const until = Date.now() + add;
  steamBusyUntil = Math.max(steamBusyUntil, until);
  noteSteamSit({ until, reason: 'busy' });
}

export function resetSteamBusy() {
  steamBusyUntil = 0;
  resetSteamSit();
}

function busyError() {
  const err = new Error('HTTP error 429');
  err.status = 429;
  err.code = 'STEAM_BUSY';
  return err;
}

function steamid64(sid) {
  if (sid == null) return '';
  if (typeof sid.getSteamID64 === 'function') return sid.getSteamID64();
  return String(sid);
}

function invCacheKey(sid, appid, tradableOnly) {
  return `${steamid64(sid)}:${Number(appid) || APPID}:${tradableOnly ? 1 : 0}`;
}

function invCacheGet(key) {
  const hit = invCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > INV_TTL_MS) return null;
  return hit.items;
}

function invCacheStale(key) {
  return invCache.get(key)?.items || null;
}

function invCacheSet(key, items) {
  invCache.set(key, { ts: Date.now(), items });
}

function loadInventoryOnce(manager, sid, appid, tradableOnly = true) {
  return new Promise((resolve, reject) => {
    manager.getUserInventoryContents(sid, appid, CONTEXTID, tradableOnly, (err, inventory) => {
      if (err) reject(err);
      else resolve(inventory || []);
    });
  });
}

/**
 * Serve/trade/API: manager.getUserInventoryContents only.
 * Never curl steamcommunity.com/inventory. 429 stays 429 (STEAM_BUSY).
 * Warm cache still serves during the busy window.
 */
export async function loadInventory(manager, steamid, appid = APPID, opts = {}) {
  if (appid && typeof appid === 'object') {
    opts = appid;
    appid = APPID;
  }
  const tradableOnly = opts.tradableOnly !== false;
  const sid = steamid ?? manager.steamID;
  if (!sid) {
    const err = new Error('No SteamID for inventory load');
    err.code = 'NO_STEAMID';
    throw err;
  }
  const them = steamid64(sid);
  const ck = invCacheKey(them, appid, tradableOnly);
  if (!opts.fresh) {
    const cached = invCacheGet(ck);
    if (cached) return cached;
    if (steamInventoryBusy()) {
      const stale = invCacheStale(ck);
      if (stale) return stale;
      throw busyError();
    }
  }
  try {
    const items = await loadInventoryOnce(manager, sid, appid, tradableOnly);
    invCacheSet(ck, items);
    return items;
  } catch (err) {
    if (isSteamBusy(err)) {
      markSteamBusy();
      const stale = !opts.fresh ? invCacheStale(ck) : null;
      if (stale) return stale;
    }
    throw err;
  }
}

function noteSteamSit() {
  throw new Error('noteSteamSit lives in bunkerbot/lib/steam-limit.js and is not in this package');
}

function resetSteamSit() {
  throw new Error('resetSteamSit lives in bunkerbot/lib/steam-limit.js and is not in this package');
}
