// src/characters/tareRules.js — pure rules for TARE / WG-2 (row 506 / 03 §4.3).
// No state, no bus, no Math.random. The adapter censuses the deck each calendar
// pass; these answer: what counts as on the scale, whether a mass answers the
// request, what the robot says, and where the paid fragment lands.

import { TARE } from '../data/tare.js';

function finiteXZ(v) {
  return Number.isFinite(v && v.x) && Number.isFinite(v && v.z);
}

/** A weighable body on the plate: finite mass and position, settled (the plate does
 *  not read flybys), and not TARE's own machinery — the robot, its paid fragments,
 *  and non-physical fx do not go on the scale. Verge law: machines do not weigh
 *  machines, so `data.machineKind` bodies are out too. The player is deliberately
 *  weighable — "Measure Engines weigh *you*" is canon (03 §The Line site). Wrecks,
 *  debris, pods, rocks and parked hulls all count; nothing is consumed, so the
 *  shared protected-list law does not apply here. */
export function tareWeighable(entity, deckPos = TARE.post, deckRadius = TARE.deckRadius) {
  if (!entity || entity.alive === false) return false;
  if (!finiteXZ(entity.pos) || !finiteXZ(deckPos)) return false;
  if (!Number.isFinite(entity.mass) || entity.mass <= 0) return false;
  const d = entity.data || {};
  if (d.tare === true || d.tareFragment === true) return false;
  if (d.machineKind) return false;
  if (entity.type === 'fx') return false;
  const speed = finiteXZ(entity.vel) ? Math.hypot(entity.vel.x, entity.vel.z) : 0;
  if (speed > TARE.settleSpeed) return false;
  return Math.hypot(entity.pos.x - deckPos.x, entity.pos.z - deckPos.z) <= deckRadius;
}

/** Does a mass answer the current request? The ladder index beyond the table has
 *  no request — a finished scale weighs and reads but stops paying. */
export function tareTargetAt(step, targets = TARE.targets) {
  const i = Math.floor(Number(step));
  return Number.isInteger(i) && i >= 0 && i < targets.length ? targets[i] : null;
}

export function tareMatches(mass, target, toleranceRatio = TARE.toleranceRatio) {
  if (!Number.isFinite(mass) || !Number.isFinite(target) || target <= 0) return false;
  return Math.abs(mass - target) <= target * toleranceRatio;
}

/** The spoken reading — the robot says the truth it stamped, to two decimals so the
 *  player learns what a hull really weighs. */
export function tareReadLine(mass, template = TARE.massTrue) {
  const m = Number.isFinite(mass) ? mass.toFixed(2) : '?';
  return String(template).replace('{mass}', m);
}

/** The next request line. */
export function tareTargetLine(target, template = TARE.nextTarget) {
  return String(template).replace('{target}', String(target));
}

/** Where the paid fragment materializes: just off the plate edge at a deterministic
 *  bearing from the paid count — the robot sets its payment down beside the scale,
 *  never on it (a fragment on the plate would be its own customer). */
export function tareFragmentSpot(paidCount, post = TARE.post) {
  const angle = 0.7 + (Number(paidCount) || 0) * 2.1;
  const r = TARE.deckRadius + TARE.fragmentSpawnOffset;
  return { x: post.x + Math.cos(angle) * r, z: post.z + Math.sin(angle) * r };
}
