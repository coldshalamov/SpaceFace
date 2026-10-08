// Hasp, aboard the Second Rinse. Pure numbers. The renderer is not imported here.
// The blue sheet and the pin-cord are tests in the skiff frame. They are not entities.

import { buildLaneGeometry, LANE_HELIOS_CERES } from './travelLaneRoutes.js';
import { sectorMembershipAtGlobal } from './sectorCoordinates.js';

export const SECOND_RINSE = Object.freeze({
  encounterId: 'second_rinse',
  sectorId: 'sector_helios_prime',
  worldRecordId: 'second-rinse:hasp',
  persistenceOwner: 'secondRinse',
  shipId: 'ship_kestrel',
  factionId: 'faction_free',
  callsign: 'HASP',
  name: 'Hasp · Second Rinse',
  hullRadius: 11,
  pocketLateral: 620,
  minAlong: 1600,
  sheetAlong: 32,
  sheetAcross: 16,
  whipAmp: 0.85,
  whipPeriod: 2.8,
  pinLength: 4,
  mast: Object.freeze({ x: 0, z: 16 }),
  buoy: Object.freeze({ x: 0, z: 52 }),
  whiteCenters: Object.freeze([
    Object.freeze({ x: -4, z: 28 }),
    Object.freeze({ x: 0, z: 36 }),
    Object.freeze({ x: 4, z: 44 }),
  ]),
  hailRadius: 80,
});

const TAU = Math.PI * 2;

export function normalizeSecondRinse(raw) {
  const flag = raw && raw.flag;
  return {
    revision: 1,
    flag: flag === 'crooked' || flag === 'cut' ? flag : 'open',
    introduced: !!(raw && raw.introduced),
  };
}

export function whipAngle(simTime, flag) {
  if (flag !== 'open') return 0;
  const t = Number(simTime) || 0;
  return SECOND_RINSE.whipAmp * Math.sin((TAU * t) / SECOND_RINSE.whipPeriod);
}

function rot2(x, z, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: x * c - z * s, z: x * s + z * c };
}

/** Four corners of the blue sheet in skiff-local XZ. Hinge is the mast. Extends +Z, yawed by the whip. */
export function blueSheetLocal(simTime, flag) {
  const angle = whipAngle(simTime, flag);
  const along = rot2(0, 1, angle);
  const across = rot2(1, 0, angle);
  const L = SECOND_RINSE.sheetAlong;
  const W = SECOND_RINSE.sheetAcross;
  const h = SECOND_RINSE.mast;
  const corner = (u, v) => ({
    x: h.x + along.x * u + across.x * v,
    z: h.z + along.z * u + across.z * v,
  });
  return [
    corner(0, -W / 2),
    corner(L, -W / 2),
    corner(L, W / 2),
    corner(0, W / 2),
  ];
}

export function pinCordLocal() {
  const h = SECOND_RINSE.mast;
  return {
    a: { x: h.x, z: h.z },
    b: { x: h.x, z: h.z + SECOND_RINSE.pinLength },
  };
}

export function whiteSheetLocal(index) {
  const c = SECOND_RINSE.whiteCenters[index];
  if (!c) return null;
  const L = SECOND_RINSE.sheetAlong;
  const W = SECOND_RINSE.sheetAcross;
  return [
    { x: c.x - W / 2, z: c.z },
    { x: c.x + W / 2, z: c.z },
    { x: c.x + W / 2, z: c.z + L * 0.45 },
    { x: c.x - W / 2, z: c.z + L * 0.45 },
  ];
}

export function localToWorld(origin, rot, local) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return {
    x: origin.x + local.x * c - local.z * s,
    z: origin.z + local.x * s + local.z * c,
  };
}

export function localsToWorld(origin, rot, locals) {
  return locals.map((p) => localToWorld(origin, rot, p));
}

function pointInPoly(x, z, corners) {
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const a = corners[i];
    const b = corners[j];
    const hit = (a.z > z) !== (b.z > z)
      && x < ((b.x - a.x) * (z - a.z)) / ((b.z - a.z) || 1e-9) + a.x;
    if (hit) inside = !inside;
  }
  return inside;
}

function distToSeg(px, pz, a, b) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  if (len2 <= 1e-8) return Math.hypot(px - a.x, pz - a.z);
  let t = ((px - a.x) * abx + (pz - a.z) * abz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + abx * t), pz - (a.z + abz * t));
}

export function circleHitsPoly(x, z, radius, corners) {
  if (!corners || corners.length < 3) return false;
  if (pointInPoly(x, z, corners)) return true;
  const r = Math.max(0, radius || 0);
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    if (distToSeg(x, z, a, b) <= r) return true;
  }
  return false;
}

export function segmentsCross(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * One tick of the verb. Cord wins over a clap on the same tick.
 * `wasOnBlue` is the previous tick's overlap. Hull and buoy are not pads.
 * Returns 'crooked' | 'cut' | 'white' | null. 'white' does not change the flag.
 */
export function secondRinseResolve(flag, sample) {
  if (flag !== 'open') return null;
  const cord = sample.cordCut === true;
  const began = sample.overlapsBlue === true && sample.wasOnBlue !== true;
  if (cord) return 'cut';
  if (began) return 'crooked';
  if (sample.overlapsWhite === true && sample.wasOnWhite !== true) return 'white';
  return null;
}

export function secondRinsePocket(geometry = buildLaneGeometry(LANE_HELIOS_CERES)) {
  const from = geometry && geometry.from;
  const axis = geometry && geometry.axis;
  if (!from || !axis || !(geometry.lengthWU > 0)) return null;
  let chosen = null;
  for (const seg of geometry.segments || []) {
    const mid = seg.midpoint;
    if (!mid) continue;
    const along = (mid.x - from.x) * axis.x + (mid.z - from.z) * axis.z;
    if (along < SECOND_RINSE.minAlong) continue;
    const member = sectorMembershipAtGlobal(mid);
    if (member !== SECOND_RINSE.sectorId) continue;
    chosen = { along, mid };
    break;
  }
  if (!chosen) return null;
  const n = { x: -axis.z, z: axis.x };
  const x = chosen.mid.x + n.x * SECOND_RINSE.pocketLateral;
  const z = chosen.mid.z + n.z * SECOND_RINSE.pocketLateral;
  // Local +Z points further off the chord, so the wash never crosses the freight spline.
  const rot = Math.atan2(-n.x, n.z);
  return { x, z, rot, along: chosen.along, normal: n };
}

export const LINES = Object.freeze({
  tuesday: 'HASP: Tuesday. The core calls lint a contaminant. I call it the load.',
  boat: 'HASP: Blue, with the boat. It\u2019s off the pin. Don\u2019t put your burn on it.',
  hover: 'HASP: Don\u2019t hover. It has to hit you.',
  shut: 'HASP: Shut. Boat\u2019s upside down. Leave it.',
  cut: 'HASP: You cut it. I won\u2019t call that clean.',
  stay: 'HASP: Lines stay up. File it with Concord.',
  white: 'HASP: White. It stays clipped.',
  crookedAgain: 'HASP: Still crooked. I left it.',
  cutAgain: 'HASP: Pin\u2019s bare. Same as I left it.',
});
