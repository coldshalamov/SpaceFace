// Pure deterministic response policy for lawful-jurisdiction incidents. The registered
// lawSecurity system owns lifecycle/events; this module owns only timing, strength, selection,
// and arrival geometry so those contracts can be tested without a world root.
import { hash32 } from '../core/rng.js';

export function authorityResponsePolicy(securityValue) {
  const security = round(clamp(Number(securityValue), 0, 1), 2);
  return Object.freeze({
    security,
    dispatchDelayS: roundQuarter(1.25 + (1 - security) * 5),
    responderCap: security >= 0.85 ? 3 : security >= 0.5 ? 2 : 1,
    reserveAllowed: security >= 0.55,
    challengeWindowS: roundQuarter(1 + (1 - security) * 0.75),
  });
}

export function rankLawfulResponders(candidates, anchor, {
  aggressorId = null,
  cap = 1,
  radius = Infinity,
} = {}) {
  const limitSq = Number.isFinite(radius) ? Math.max(0, radius) ** 2 : Infinity;
  const unique = new Map();
  for (const entity of Array.isArray(candidates) ? candidates : []) {
    if (!entity || entity.alive === false || entity.type !== 'ship'
      || entity.id === aggressorId || !entity.data || !entity.data.ai || entity.data.ai.lawful !== true
      || distanceSq(entity.pos, anchor) > limitSq) continue;
    unique.set(stableId(entity.id), entity);
  }
  return [...unique.values()]
    .sort((a, b) => distanceSq(a.pos, anchor) - distanceSq(b.pos, anchor)
      || stableId(a.id).localeCompare(stableId(b.id)))
    .slice(0, Math.max(0, Math.floor(Number(cap) || 0)));
}

export function reserveArrivalPoint({
  anchor,
  aggressorPos,
  jurisdictionRadius,
  seed = 1,
  incidentId = 'law:incident',
} = {}) {
  const origin = finitePoint(anchor);
  const aggressor = finitePoint(aggressorPos, origin);
  const radius = Math.max(2000, Math.max(0, Number(jurisdictionRadius) || 0) + 700);
  const angle = hash32(seed, incidentId, 'law_reserve_arrival') / 0xffffffff * Math.PI * 2;
  const first = pointAt(origin, angle, radius);
  const opposite = pointAt(origin, angle + Math.PI, radius);
  return Object.freeze(distanceSq(first, aggressor) >= 900 * 900
    ? first
    : opposite);
}

function pointAt(origin, angle, radius) {
  return {
    x: origin.x + Math.cos(angle) * radius,
    z: origin.z + Math.sin(angle) * radius,
  };
}

function finitePoint(value, fallback = { x: 0, z: 0 }) {
  return {
    x: Number.isFinite(value && value.x) ? value.x : fallback.x,
    z: Number.isFinite(value && value.z) ? value.z : fallback.z,
  };
}

function distanceSq(a, b) {
  const dx = (Number(a && a.x) || 0) - (Number(b && b.x) || 0);
  const dz = (Number(a && a.z) || 0) - (Number(b && b.z) || 0);
  return dx * dx + dz * dz;
}

function stableId(value) {
  return `${typeof value}:${String(value)}`;
}

function roundQuarter(value) {
  return Math.round(value * 4) / 4;
}

function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clamp(value, min, max) {
  const finite = Number.isFinite(value) ? value : 0;
  return finite < min ? min : finite > max ? max : finite;
}
