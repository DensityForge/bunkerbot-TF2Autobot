/**
 * Extract from bunkerbot/lib/session.js — goOnline.
 * TF2Autobot also sets Online and plays app 440 (or a custom name plus 440).
 * This extract is the whole of that overlap. The rest of session.js is our login.
 * Credit: ../../NOTICE.md
 */
import SteamUser from 'steam-user';

/** Must be Online or Steam Chat will not deliver friend messages. */
export function goOnline(session, { playTf2 = true } = {}) {
  const client = session?.client;
  if (!client) return;
  client.setPersona(SteamUser.EPersonaState.Online);
  if (playTf2) client.gamesPlayed(440);
}
