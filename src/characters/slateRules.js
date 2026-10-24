// src/characters/slateRules.js — pure rules for Slate's column (row 542 / 03 §4.1 / 06 B3).
// No state, no bus, no Math.random. The adapter hears weld receipts and reads hull
// positions; these answer: was that service event a real weld, does this hull stand in
// reading range, and what does the column say for a hull with N spikes.

import { SLATE_COLUMN } from '../data/slate.js';

function finiteXZ(v) {
  return Number.isFinite(v && v.x) && Number.isFinite(v && v.z);
}

/** A weld rings the column when a repair service actually put hull back — a patch under
 *  the threshold is a weld too small to stress the seam. Refuel, wash, and everything
 *  else the yard sells are not welds. */
export function slateWeldSpike(payload, minHull = SLATE_COLUMN.spikeMinHull) {
  if (!payload || payload.type !== 'repair') return false;
  return (Number(payload.restoredHull) || 0) >= minHull;
}

/** The pillar reads a hull standing inside its ring — a scan, not a census. */
export function slateColumnInRange(pos, column = SLATE_COLUMN.pos, radius = SLATE_COLUMN.readRadius) {
  if (!finiteXZ(pos) || !finiteXZ(column)) return false;
  return Math.hypot(pos.x - column.x, pos.z - column.z) <= radius;
}

/** What the column says for a hull with n spikes: under the canon number it predicts;
 *  at or past it, it recites. */
export function slateColumnLine(spikes) {
  const n = Math.max(0, Math.floor(Number(spikes) || 0));
  if (n >= SLATE_COLUMN.failureSpike) {
    return SLATE_COLUMN.readFailed.replace('{n}', String(n));
  }
  if (n <= 0) return SLATE_COLUMN.readOne.replace('{n}', '0');
  const tpl = n === 1 ? SLATE_COLUMN.readOne : SLATE_COLUMN.readMany;
  return tpl.replace('{n}', String(n));
}
