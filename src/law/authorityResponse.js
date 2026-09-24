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

// A reserve unit launching from its own station clears the dock ring by this much before it turns
// toward the incident, and never starts closer than this to the aggressor it is answering.
export const RESERVE_STATION_LAUNCH_CLEARANCE_WU = 40;
export const RESERVE_STATION_LAUNCH_MIN_LEG_WU = 150;

export const WITNESS_FRAME_HALF_WU = 126;

export function reserveArrivalPoint({
  anchor,
  aggressorPos,
  jurisdictionRadius,
  seed = 1,
  incidentId = 'law:incident',
  station = null,
  frameHalfWu = null,
} = {}) {
  const origin = finitePoint(anchor);
  const aggressor = finitePoint(aggressorPos, origin);
  // PQ-138.00 (the witness has a choice): reserves launch from the jurisdiction's own station when
  // that station is a real body in the world and the incident is inside its reach. The sector law
  // card promises "reserve units available"; those units live at the port, and a kill witnessed
  // near the port gets a pursuer the player can see within the ten seconds B10a allows. Before
  // this, every reserve entered on a ring of at least 2000 WU — ten camera widths out — so the
  // chase half of the choice always happened off-stage. Nothing still pops onto the fight: the
  // launch point sits on the dock ring's far side from the aggressor whenever the aggressor is
  // close, and a station that is not in the world (or is out of reach) keeps the ring below.
  const stationOrigin = station && station.pos
    && Number.isFinite(station.pos.x) && Number.isFinite(station.pos.z)
    ? { x: station.pos.x, z: station.pos.z }
    : null;
  if (stationOrigin) {
    const reach = Math.max(0, Number(jurisdictionRadius) || 0) + 700;
    if (distanceSq(stationOrigin, origin) <= reach * reach) {
      const launch = Math.max(60, Number(station.launchRadius) || 0) + RESERVE_STATION_LAUNCH_CLEARANCE_WU;
      const spread = (hash32(seed, incidentId, 'law_reserve_launch') / 0xffffffff - 0.5) * (Math.PI / 3);
      const toward = Math.atan2(origin.z - stationOrigin.z, origin.x - stationOrigin.x) + spread;
      const near = pointAt(stationOrigin, toward, launch);
      const far = pointAt(stationOrigin, toward + Math.PI, launch);
      const minLeg = RESERVE_STATION_LAUNCH_MIN_LEG_WU;
      if (distanceSq(near, aggressor) >= minLeg * minLeg) return Object.freeze(pullIntoFrame(near, aggressor, frameHalfWu));
      if (distanceSq(far, aggressor) >= minLeg * minLeg) return Object.freeze(pullIntoFrame(far, aggressor, frameHalfWu));
    }
  }
  const radius = Math.max(2000, Math.max(0, Number(jurisdictionRadius) || 0) + 700);
  const angle = hash32(seed, incidentId, 'law_reserve_arrival') / 0xffffffff * Math.PI * 2;
  const first = pointAt(origin, angle, radius);
  const opposite = pointAt(origin, angle + Math.PI, radius);
  const picked = distanceSq(first, aggressor) >= 900 * 900 ? first : opposite;
  return Object.freeze(pullIntoFrame(picked, aggressor, frameHalfWu));
}

function pullIntoFrame(point, aggressor, frameHalfWu) {
  const half = Number(frameHalfWu);
  if (!(half > 0)) return point;
  const dx = point.x - aggressor.x;
  const dz = point.z - aggressor.z;
  const dist = Math.hypot(dx, dz);
  const keepOff = 40;
  if (dist <= half && dist >= keepOff) return point;
  // The chase picture is shorter than the 126 WU screen constant along the
  // near edge, so the visible ring sits at half of that constant.
  const edge = Math.max(keepOff, Math.min(half * 0.5, half - 16));
  if (dist < 1e-6) return { x: aggressor.x + edge, z: aggressor.z };
  const scale = edge / dist;
  return { x: aggressor.x + dx * scale, z: aggressor.z + dz * scale };
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
