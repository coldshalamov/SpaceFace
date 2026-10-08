// Hasp, aboard the Second Rinse. Pure numbers. The renderer is not imported here.
// Three contacts, and a fair hull can take only one at a time:
//   the blue sheet (port, whipping) seats crooked,
//   the bare pin-cord (starboard) cuts,
//   the white sheets (on the line) only hail.
// Shapes stay more than two fair-radii apart through the whole whip, so a Hitch
// or a common hauler (radius <= fairRadius) cannot graze a second verb on the way in.

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
  fairRadius: 18,
  pocketLateral: 620,
  minAlong: 1600,
  hailRadius: 280,
  warnBand: 12,
  hoverSeconds: 1.25,
  againCooldown: 8,
  sheetAlong: 20,
  sheetAcross: 10,
  whiteSpan: 9,
  whiteDrop: 10,
  whipAmp: 0.7,
  whipPeriod: 2.8,
  mast: Object.freeze({ x: 0, z: 32 }),
  buoy: Object.freeze({ x: 0, z: 210 }),
  blueHinge: Object.freeze({ x: -52, z: 96 }),
  blueHang: Object.freeze({ x: -1, z: 0 }),
  blueAcross: Object.freeze({ x: 0, z: 1 }),
  whiteCenters: Object.freeze([
    Object.freeze({ x: 0, z: 42 }),
    Object.freeze({ x: 0, z: 150 }),
    Object.freeze({ x: 0, z: 198 }),
  ]),
  pinA: Object.freeze({ x: 62, z: 88 }),
  pinB: Object.freeze({ x: 62, z: 104 }),
});

const TAU = Math.PI * 2;
const HEARD_KEYS = ['tuesday', 'boat', 'hover', 'white', 'stay'];

export function normalizeSecondRinse(raw) {
  const flag = raw && raw.flag;
  const heardIn = raw && raw.heard;
  const heard = {};
  for (const key of HEARD_KEYS) heard[key] = !!(heardIn && heardIn[key]);
  return {
    revision: 2,
    flag: flag === 'crooked' || flag === 'cut' ? flag : 'open',
    introduced: !!(raw && raw.introduced),
    heard,
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

/** Four corners of the loose blue sheet in skiff-local XZ. Hinge is port of the kettle; the sheet hangs further port and whips. */
export function blueSheetLocal(simTime, flag) {
  const angle = whipAngle(simTime, flag);
  const along = rot2(SECOND_RINSE.blueHang.x, SECOND_RINSE.blueHang.z, angle);
  const across = rot2(SECOND_RINSE.blueAcross.x, SECOND_RINSE.blueAcross.z, angle);
  const L = SECOND_RINSE.sheetAlong;
  const W = SECOND_RINSE.sheetAcross;
  const h = SECOND_RINSE.blueHinge;
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
  return { a: SECOND_RINSE.pinA, b: SECOND_RINSE.pinB };
}

export function whiteSheetLocal(index) {
  const c = SECOND_RINSE.whiteCenters[index];
  if (!c) return null;
  const hx = SECOND_RINSE.whiteSpan / 2;
  const hz = SECOND_RINSE.whiteDrop / 2;
  return [
    { x: c.x - hx, z: c.z - hz },
    { x: c.x + hx, z: c.z - hz },
    { x: c.x + hx, z: c.z + hz },
    { x: c.x - hx, z: c.z + hz },
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

export function distToPoly(x, z, corners) {
  if (!corners || corners.length < 3) return Infinity;
  if (pointInPoly(x, z, corners)) return 0;
  let best = Infinity;
  for (let i = 0; i < corners.length; i++) {
    const d = distToSeg(x, z, corners[i], corners[(i + 1) % corners.length]);
    if (d < best) best = d;
  }
  return best;
}

export function circleHitsPoly(x, z, radius, corners) {
  return distToPoly(x, z, corners) <= Math.max(0, radius || 0);
}

/** Minimum distance between two convex polygons. 0 when they touch or overlap. */
export function polyGap(a, b) {
  if (!a || !b || a.length < 2 || b.length < 2) return Infinity;
  const gapFrom = (pts, poly) => {
    let best = Infinity;
    for (const p of pts) {
      const d = distToPoly(p.x, p.z, poly);
      if (d <= 0) return 0;
      if (d < best) best = d;
    }
    return best;
  };
  return Math.min(gapFrom(a, b), gapFrom(b, a));
}

export function segmentsCross(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Inclusive: a hull path that lands on the cord still cuts it. A proper cross does too. */
export function segmentHitsSegment(p, q, a, b) {
  if (!p || !q || !a || !b) return false;
  const orient = (s, t, r) => {
    const v = (t.x - s.x) * (r.z - s.z) - (t.z - s.z) * (r.x - s.x);
    if (Math.abs(v) <= 1e-7) return 0;
    return v > 0 ? 1 : -1;
  };
  const on = (s, t, r) => orient(s, t, r) === 0
    && r.x >= Math.min(s.x, t.x) - 1e-7 && r.x <= Math.max(s.x, t.x) + 1e-7
    && r.z >= Math.min(s.z, t.z) - 1e-7 && r.z <= Math.max(s.z, t.z) + 1e-7;
  const o1 = orient(p, q, a);
  const o2 = orient(p, q, b);
  const o3 = orient(a, b, p);
  const o4 = orient(a, b, q);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && on(p, q, a)) return true;
  if (o2 === 0 && on(p, q, b)) return true;
  if (o3 === 0 && on(a, b, p)) return true;
  if (o4 === 0 && on(a, b, q)) return true;
  return false;
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

/**
 * World-space contact against the skiff's wash. `prev` is the previous hull center.
 * `motionReduce` freezes the whip so the hit matches the still picture.
 */
export function secondRinseSample(origin, rot, pos, prev, radius, simTime, flag, motionReduce) {
  const time = motionReduce ? 0 : (Number(simTime) || 0);
  const open = flag === 'open';
  const blue = localsToWorld(origin, rot, blueSheetLocal(time, flag));
  const r = Math.max(0, radius || 0);
  const overlapsBlue = open && circleHitsPoly(pos.x, pos.z, r, blue);
  let overlapsWhite = false;
  if (open) {
    for (let i = 0; i < SECOND_RINSE.whiteCenters.length; i++) {
      const sheet = localsToWorld(origin, rot, whiteSheetLocal(i));
      if (circleHitsPoly(pos.x, pos.z, r, sheet)) { overlapsWhite = true; break; }
    }
  }
  const pin = pinCordLocal();
  const a = localToWorld(origin, rot, pin.a);
  const b = localToWorld(origin, rot, pin.b);
  const from = prev || pos;
  const cordCut = open && segmentHitsSegment(from, pos, a, b);
  const blueDist = distToPoly(pos.x, pos.z, blue);
  const nearBlue = open && !overlapsBlue && blueDist <= r + SECOND_RINSE.warnBand;
  const inHail = Math.hypot(pos.x - origin.x, pos.z - origin.z) <= SECOND_RINSE.hailRadius;
  return { overlapsBlue, overlapsWhite, cordCut, nearBlue, inHail, simTime: time };
}

/**
 * Speech and flag for one sample. Mutates `mem.heard` in place.
 * A hit outranks a greeting. The boat warning is the loose sheet's near band,
 * and hover only after lingering there. White never changes the flag.
 */
export function secondRinseBeat(mem, sample, dt) {
  const heard = mem.heard;
  let line = null;
  let cue = null;
  let flag = mem.flag;
  let hoverDwell = mem.hoverDwell || 0;
  let againAt = Number.isFinite(mem.againAt) ? mem.againAt : -1e9;
  const simTime = Number(sample.simTime) || 0;
  const hit = secondRinseResolve(flag, sample);
  if (hit === 'cut') {
    flag = 'cut';
    line = 'cut';
    cue = 'pin';
  } else if (hit === 'crooked') {
    flag = 'crooked';
    line = 'shut';
    cue = 'clap';
  } else if (hit === 'white' && !heard.white) {
    heard.white = true;
    line = 'white';
  }
  if (!line && sample.inHail && !mem.inHail) {
    if (flag === 'open' && !heard.tuesday) {
      heard.tuesday = true;
      line = 'tuesday';
    } else if (flag !== 'open' && simTime - againAt >= SECOND_RINSE.againCooldown) {
      line = flag === 'crooked' ? 'crookedAgain' : 'cutAgain';
      againAt = simTime;
    }
  }
  if (!line && flag === 'open' && sample.nearBlue) {
    if (!heard.boat) {
      heard.boat = true;
      line = 'boat';
      hoverDwell = 0;
    } else {
      hoverDwell += Math.max(0, Number(dt) || 0);
      if (!heard.hover && hoverDwell >= SECOND_RINSE.hoverSeconds) {
        heard.hover = true;
        line = 'hover';
      }
    }
  } else if (!sample.nearBlue) {
    hoverDwell = 0;
  }
  if (!line && !sample.inHail && mem.inHail && flag !== 'open' && !heard.stay) {
    heard.stay = true;
    line = 'stay';
  }
  return { flag, heard, inHail: !!sample.inHail, hoverDwell, againAt, line, cue };
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
