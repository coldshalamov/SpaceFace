// src/characters/tallyhoRules.js — pure rules for TALLYHO / CN-2 (row 506 / 03 §4.3).
// No state, no bus, no Math.random. The adapter hears kill reports; these answer: did
// the scoreboard see it, what does the streak rate, and where the next spectator parks.

import { TALLYHO } from '../data/tallyho.js';

function finiteXZ(v) {
  return Number.isFinite(v && v.x) && Number.isFinite(v && v.z);
}

/** In sight: the kill's position inside the crowd ring — the scoreboard rates what it
 *  can see, not what it merely heard about. */
export function tallyhoInSight(pos, post = TALLYHO.post, radius = TALLYHO.crowdRadius) {
  if (!finiteXZ(pos) || !finiteXZ(post)) return false;
  return Math.hypot(pos.x - post.x, pos.z - post.z) <= radius;
}

/** A rated kill: player-signed, in sight, and not the scoreboard or its own crowd. */
export function tallyhoRateableKill(payload, playerId, selfIds) {
  if (!payload || !Number.isFinite(payload.killerId) || payload.killerId !== playerId) return false;
  if (payload.id === playerId) return false;
  if (selfIds && selfIds.has && selfIds.has(payload.id)) return false;
  return tallyhoInSight(payload.pos);
}

/** The streak: a kill extends the run only inside the window. */
export function tallyhoStreak(count, lastAt, now, windowS = TALLYHO.streakWindowS) {
  const fresh = !(Number.isFinite(lastAt) && (now - lastAt) < windowS);
  return { count: fresh ? 1 : (Number(count) || 0) + 1, fresh };
}

/** The call for a streak count — doubles and big runs get the louder board. */
export function tallyhoRateLine(streak) {
  const n = Number(streak) || 0;
  if (n >= 4) return TALLYHO.rateBig;
  if (n === 3) return TALLYHO.rateTriple;
  if (n === 2) return TALLYHO.rateDouble;
  return TALLYHO.rateSingle;
}

/** Score for a kill at a given streak: the double pays double. */
export function tallyhoScoreFor(streak) {
  return (Number(streak) || 0) >= 2 ? 2 : 1;
}

/** A spectator's rail seat: parked just outside the crowd ring at a deterministic bearing
 *  from the spectator index — a ring of seats around the board. */
export function tallyhoSpectatorSeat(index, post = TALLYHO.post) {
  const angle = (Number(index) || 0) * 2.4; // even spread, no rng
  const r = TALLYHO.crowdRadius + TALLYHO.spectatorRingOffset;
  return { x: post.x + Math.cos(angle) * r, z: post.z + Math.sin(angle) * r };
}
