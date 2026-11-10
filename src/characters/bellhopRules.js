// src/characters/bellhopRules.js — pure rules for BELLHOP / CB-9 (row 506 /
// 03 §4.3). No state, no bus, no Math.random. The adapter reads real physics
// impacts; these answer: where each crystal hangs, whether an impact rings,
// which note the song wants next, and what a strike does to the progress.

import { BELLHOP } from '../data/bellhop.js';

function finiteXZ(v) {
  return Number.isFinite(v && v.x) && Number.isFinite(v && v.z);
}

/** Crystal i's hang spot: an arc of even steps centered on arcBearing out from
 *  the post — the chime floor is authored, not scattered, so the floor is the
 *  same floor each visit. */
export function bellhopCrystalSpot(index, post = BELLHOP.post) {
  const n = BELLHOP.crystalCount;
  const i = Number(index) || 0;
  const angle = BELLHOP.arcBearing + (n === 1 ? 0 : (i / (n - 1) - 0.5) * BELLHOP.arcSpread);
  return { x: post.x + Math.cos(angle) * BELLHOP.crystalRadius, z: post.z + Math.sin(angle) * BELLHOP.crystalRadius };
}

/** Which note index this entity is, or -1. Crystals are stamped, alive, and
 *  carry an authored seat index — a body can never borrow a note. */
export function bellhopNoteOf(entity) {
  if (!entity || entity.alive === false) return -1;
  const d = entity.data || {};
  if (d.bellhopCrystal !== true) return -1;
  const i = Number(d.bellhopCrystalIndex);
  return Number.isInteger(i) && i >= 0 && i < BELLHOP.crystalCount ? i : -1;
}

/** Does this impact ring a bell: a measured blow at or over the floor the
 *  drone tunes against. A drift-brush never rings; a thrown rock always does. */
export function bellhopRings(impulse, minImpulse = BELLHOP.minImpulse) {
  return Number.isFinite(impulse) && impulse >= minImpulse;
}

/** What a strike does to the song: ring the expected note and the phrase
 *  advances; ring any other and it starts over. `done` only when the last
 *  note of the phrase lands — the caller owns the sung receipt. */
export function bellhopStrikeResult(progress, noteIndex, song = BELLHOP.song) {
  const p = Number(progress) || 0;
  if (p >= song.length) return { progress: p, verdict: 'done' };
  if (noteIndex === song[p]) {
    const next = p + 1;
    return { progress: next, verdict: next >= song.length ? 'done' : 'hit' };
  }
  return { progress: 0, verdict: 'miss' };
}

/** The drone's call for a correct strike: the authored step line for the note
 *  position just rung — 'Again. Lower. There.' kept in the drone's own voice. */
export function bellhopStepLine(position, lines = BELLHOP.stepLines) {
  const i = Math.max(0, Math.min(lines.length - 1, Number(position) || 0));
  return lines[i];
}

/** Station-keeping: the drone holds its post on the chime floor; shoved off it
 *  walks home through the impulse membrane — a delta-v for the caller to scale
 *  by mass, never a vel write. */
export function bellhopDriftHome(entity, post = BELLHOP.post, leash = 60, speed = 16) {
  if (!finiteXZ(entity?.pos) || !finiteXZ(post)) return null;
  const vx = finiteXZ(entity.vel) ? entity.vel.x : 0;
  const vz = finiteXZ(entity.vel) ? entity.vel.z : 0;
  const dx = post.x - entity.pos.x, dz = post.z - entity.pos.z;
  const d = Math.hypot(dx, dz);
  if (d > leash) return { x: (dx / d) * speed - vx, z: (dz / d) * speed - vz };
  if (d < leash * 0.5 && (vx !== 0 || vz !== 0)) return { x: -vx, z: -vz };
  return null;
}
