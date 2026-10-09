import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';
import { RED_KITE_RADIUS } from './redKiteBody.js';

export const RED_KITE = Object.freeze({
  actorId: 'red-kite:ceres:courier:v1', courseId: 'red-kite:ceres:three-handoffs', courseVersion: 1,
  sectorId: 'sector_ceres_belt', assetId: 'SF_SHIP_RED_KITE',
  mass: 32, radius: RED_KITE_RADIUS, hull: 220, maxSpeed: 110, mainAccel: 40, yawAccel: 8,
  countdownTicks: 180, deadlineTicks: 90 * 60, hailRange: 420, startRange: 110,
  gateRadius: 70, firstRewardCr: 240,
});
const global = (x, z) => Object.freeze(sectorLocalToGlobalForSector({ x, z }, RED_KITE.sectorId));
// East of the permanent through-line rock: the ordinary Ceres world must leave
// the full surveyed aperture usable without deleting its physical landmarks.
export const RED_KITE_START = global(2800, 1200);
export const RED_KITE_GATES = Object.freeze([
  Object.freeze({ id: 'poi_red_kite_gate_1', label: 'Red Kite · 1 / the falling corner', pos: global(3100, -500) }),
  Object.freeze({ id: 'poi_red_kite_gate_2', label: 'Red Kite · 2 / the outside handoff', pos: global(4100, -1100) }),
  Object.freeze({ id: 'poi_red_kite_gate_3', label: 'Red Kite · 3 / the long return', pos: global(4100, 1700) }),
]);
export const RED_KITE_MARKS = Object.freeze([
  Object.freeze({ id: 'poi_red_kite_start', label: 'Red Kite · public timing buoy', pos: RED_KITE_START }),
  ...RED_KITE_GATES,
]);
export const RED_KITE_LINES = Object.freeze({
  offer: 'Three handoffs. One clean run. I will try not to look impressed.',
  win: 'Fine. I am stealing that corner.', loss: 'I got there first. You got there interestingly.',
  sling: 'That was not the short route. It was the clever one.',
  attack_abort: 'Clock is dead. People first. Get clear.',
});
export function redKiteClass(player) {
  const radius = Math.max(1, Number(player?.radius) || 1);
  return radius <= 12 ? 'light' : radius <= 24 ? 'medium' : 'heavy';
}
export function validRedKiteReceipt(row) {
  return !!row && row.courseId === RED_KITE.courseId && row.courseVersion === RED_KITE.courseVersion
    && Number.isInteger(row.sequence) && row.sequence > 0 && row.id === `${RED_KITE.courseId}:run:${row.sequence}`
    && Number.isInteger(row.ticks) && row.ticks > 0 && row.ticks <= RED_KITE.deadlineTicks
    && ['light', 'medium', 'heavy'].includes(row.hullClass)
    && Array.isArray(row.gates) && row.gates.length === 3
    && row.gates.every((g, i) => g?.id === RED_KITE_GATES[i].id && Number.isInteger(g.tick)
      && g.tick > 0 && g.tick <= row.ticks && (i === 0 || g.tick > row.gates[i - 1].tick));
}
export function freshRedKiteMemory() {
  return { schema: 1, courseVersion: RED_KITE.courseVersion, met: false, lineUsed: false,
    courierDestroyed: false, courierHull: RED_KITE.hull, bestTimesByCourseAndHullClass: {},
    cleanCompletions: 0, sequence: 0, firstCompletion: null, lastResult: null, courierPose: null };
}
export function normalizeRedKiteMemory(raw) {
  const out = freshRedKiteMemory();
  if (raw?.schema !== 1) return out;
  out.met = raw.met === true; out.lineUsed = raw.lineUsed === true; out.courierDestroyed = raw.courierDestroyed === true;
  out.courierHull = Math.max(0, Math.min(RED_KITE.hull, Number(raw.courierHull) || 0));
  if (out.courierHull === 0) out.courierDestroyed = true;
  out.sequence = Math.max(0, Math.min(1e9, Math.trunc(Number(raw.sequence) || 0)));
  if (raw.courseVersion !== RED_KITE.courseVersion) return out;
  for (const [key, ticks] of Object.entries(raw.bestTimesByCourseAndHullClass || {}).slice(0, 12)) {
    if (/^(light|medium|heavy):(live|solo)$/.test(key) && Number.isInteger(ticks) && ticks > 0 && ticks <= RED_KITE.deadlineTicks)
      out.bestTimesByCourseAndHullClass[key] = ticks;
  }
  out.cleanCompletions = Math.max(0, Math.min(1e6, Math.trunc(Number(raw.cleanCompletions) || 0)));
  if (validRedKiteReceipt(raw.firstCompletion)) out.firstCompletion = structuredClone(raw.firstCompletion);
  if (validRedKiteReceipt(raw.lastResult)) out.lastResult = structuredClone(raw.lastResult);
  if (raw.courierPose && ['x', 'z', 'vx', 'vz', 'rot'].every(k => Number.isFinite(raw.courierPose[k]) && Math.abs(raw.courierPose[k]) < 1e7))
    out.courierPose = { ...raw.courierPose };
  return out;
}
