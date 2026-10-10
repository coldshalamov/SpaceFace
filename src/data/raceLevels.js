// RACE-01 — three circuits on terrain the game already has, and the five contracts that
// require the stern camera. These are authored closed polylines in sector-local space.
// They are not raceCourseForSector() chords: a 3900 WU lane at the 120 WU/s board record
// is a straight the ships outrun, and the Helios rocks are not on that axis.
//
//   Helios  — through the starter belt and the outer metallic field
//   Tethys  — the tally queue, the scan gates, then a leg toward the split station
//   Veil    — a ribbon that crosses the radiation pocket and the named gas landmarks
//
// Missions that name a levelId reuse those gates. Offers carry no factionId, so accept
// is not standing-gated. riskTier stays at the rep-0 floor.

import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';

/** Reference pace for an authored circuit. Ships cruise ~440–1100 WU/s; the board's 120
 *  WU/s figure is for the long lane chords and would make every lap a razor. */
const AUTHORED_RECORD_WU_S = 520;
const RAZOR_CAP_MULT = 1.15;
const STANDARD_CAP_MULT = 1.9;
const GRID_HOLD_S = 3.2;

function round2(v) { return Math.round(v * 100) / 100; }

function courseLengthWU(gates) {
  let len = 0;
  for (let i = 0; i + 1 < gates.length; i++) {
    len += Math.hypot(gates[i + 1].x - gates[i].x, gates[i + 1].z - gates[i].z);
  }
  return len;
}

function freezeCourse(spec) {
  // Put the finish on the start plane. A short approach aligns the final leg with the
  // opening straight, so a lap closes physically rather than ending at a distant last buoy.
  const route = spec.gates.map((g) => ({ x: round2(g.x), z: round2(g.z) }));
  const a = route[0], b = route[1];
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  route.push({ x: round2(a.x - (b.x - a.x) / length * 220), z: round2(a.z - (b.z - a.z) / length * 220) });
  route.push({ ...a });
  const gates = route.map(Object.freeze);
  const lengthWU = courseLengthWU(gates);
  const recordS = Math.max(12, Math.round(lengthWU / AUTHORED_RECORD_WU_S));
  return Object.freeze({
    courseId: spec.courseId,
    courseName: spec.courseName,
    kind: 'circuit',
    sectorId: spec.sectorId,
    gates: Object.freeze(gates),
    gateRadiusWU: spec.gateRadiusWU,
    courseLengthWU: round2(lengthWU),
    recordS,
    bandCapsS: Object.freeze([
      Math.round(recordS * RAZOR_CAP_MULT),
      Math.round(recordS * STANDARD_CAP_MULT),
    ]),
  });
}

// Helios Prime, sector-local. Starter field center (720, -260) r=380. Outer metallic
// (-900, 640) r=320. The polyline goes through both claims and closes on a short straight.
const HELIOS_COURSE = freezeCourse({
  courseId: 'circuit_helios_belt',
  courseName: 'Textile Belt',
  sectorId: 'sector_helios_prime',
  gateRadiusWU: 90,
  gates: [
    { x: 1180, z: -260 },
    { x: 860, z: 160 },
    { x: 720, z: -260 },
    { x: 280, z: -40 },
    { x: -160, z: 280 },
    { x: -900, z: 300 },
    { x: -900, z: 640 },
    { x: -1240, z: 860 },
    { x: -420, z: 980 },
    { x: 40, z: 460 },
    { x: 520, z: -640 },
    { x: 1120, z: -640 },
  ],
});

// Tethys Junction, sector-local. The tally buoys are the first half of the lap; the
// return reaches toward the split station at (-800, 1600) without sitting on it.
const TETHYS_COURSE = freezeCourse({
  courseId: 'circuit_tethys_tally',
  courseName: 'Tally Circuit',
  sectorId: 'sector_tethys_junction',
  gateRadiusWU: 80,
  gates: [
    { x: -1500, z: -700 },
    { x: -1341, z: -901 },
    { x: -1245, z: -1065 },
    { x: -1100, z: -795 },
    { x: -1033, z: -907 },
    { x: -770, z: -885 },
    { x: -650, z: -950 },
    { x: -790, z: -400 },
    { x: -800, z: 600 },
    { x: -800, z: 1400 },
    { x: -1400, z: 900 },
    { x: -1600, z: -200 },
    { x: -1680, z: -640 },
  ],
});

// Veil Nebula, sector-local. Radiation pocket (200, -200) r=600 is gate 2 — the burn
// ring. The rest of the ribbon passes the containment ring, the orchard, the spire,
// and quiet ice, all inside the gas field at the origin.
const VEIL_COURSE = freezeCourse({
  courseId: 'circuit_veil_wash',
  courseName: 'Veil Wash',
  sectorId: 'sector_veil_nebula',
  gateRadiusWU: 110,
  gates: [
    { x: 900, z: -900 },
    { x: 200, z: -780 },
    { x: 200, z: -200 },
    { x: -280, z: -200 },
    { x: -900, z: -1900 },
    { x: -1700, z: -800 },
    { x: -1400, z: 600 },
    { x: 900, z: 1500 },
    { x: 1800, z: 200 },
    { x: 1400, z: -700 },
  ],
});

export const RACE_LEVELS = Object.freeze([
  Object.freeze({
    id: 'level_textile_outbound',
    name: 'Textile Belt',
    sectorId: 'sector_helios_prime',
    stationId: 'station_helios',
    terrain: 'Helios starter belt and the outer metallic field',
    blurb: 'A closed lap through the starter claim and the outer metallic rocks. The belt is the course.',
    course: HELIOS_COURSE,
  }),
  Object.freeze({
    id: 'level_junction_return',
    name: 'Tally Circuit',
    sectorId: 'sector_tethys_junction',
    stationId: 'station_tethys',
    terrain: 'Tethys tally queue, scan gates, and the leg toward the split station',
    blurb: 'The count plaza is the first half. The buoys are the ones already on the inbound lane.',
    course: TETHYS_COURSE,
  }),
  Object.freeze({
    id: 'level_veil_ribbon',
    name: 'Veil Wash',
    sectorId: 'sector_veil_nebula',
    stationId: 'station_veil',
    terrain: 'Veil gas field, the radiation pocket, and the named landmarks inside it',
    blurb: 'A ribbon through the wash. The burn ring sits in the radiation pocket. The gas is the scenery you already chart.',
    course: VEIL_COURSE,
  }),
]);

const LEVEL_BY_ID = new Map(RACE_LEVELS.map((level) => [level.id, level]));

export function raceLevelById(id) {
  return LEVEL_BY_ID.get(id) || null;
}

/** The authored circuit for a level, or null. Never the derived lane chord. */
export function courseForLevel(id) {
  const level = raceLevelById(id);
  return level && level.course ? level.course : null;
}

const globalGateCache = new WeakMap();
export function raceGateGlobals(params) {
  if (!params || !Array.isArray(params.gates)) return [];
  const sectorId = params.courseSectorId;
  const cached = globalGateCache.get(params);
  if (cached && cached.gates === params.gates && cached.sectorId === sectorId) return cached.value;
  const out = [];
  for (const gate of params.gates) {
    if (!gate || !Number.isFinite(gate.x) || !Number.isFinite(gate.z)) continue;
    const global = sectorLocalToGlobalForSector({ x: gate.x, z: gate.z }, sectorId, { x: 0, z: 0 });
    out.push({ x: global.x, z: global.z });
  }
  globalGateCache.set(params, { gates: params.gates, sectorId, value: out });
  return out;
}

/** Start line: behind gate 0, nose aimed at gate 1, in galactic coordinates. */
export function startLineFor(params) {
  const gates = params && params.gates;
  if (!Array.isArray(gates) || gates.length < 2) return null;
  const a = gates[0];
  const b = gates[1];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  const back = 140;
  const local = { x: a.x - (dx / len) * back, z: a.z - (dz / len) * back };
  const global = sectorLocalToGlobalForSector(local, params.courseSectorId, { x: 0, z: 0 });
  return { x: global.x, z: global.z, heading: Math.atan2(dz, dx) };
}

function courseParams(course, extra) {
  return {
    courseId: course.courseId,
    courseName: course.courseName,
    courseKind: course.kind,
    closedCircuit: true,
    courseRevision: Number.isInteger(extra && extra.courseRevision) ? extra.courseRevision : 2,
    courseSectorId: course.sectorId,
    gates: course.gates.map((g) => ({ x: g.x, z: g.z })),
    gateRadiusWU: course.gateRadiusWU,
    courseLengthWU: course.courseLengthWU,
    recordS: course.recordS,
    bandCapsS: course.bandCapsS.slice(),
    nextGate: 0,
    gridHoldS: GRID_HOLD_S,
    raceLease: true,
    ...extra,
  };
}

const CONTRACTS = Object.freeze([
  Object.freeze({
    id: 'contract_textile_qual',
    levelId: 'level_textile_outbound',
    practice: false,
    laps: 1,
    steerLock: 'racing',
    racingKind: 'qualifying',
    reward_cr: 900,
    duration_s: 900,
    title: 'Textile qualifying',
    brief: 'Helios dispatch grades one lap of the belt from a stern camera. Overhead optics are not the instrument they pay for.',
    summary: 'One lap through both Helios fields. The stern camera is required.',
    gridLine: 'Hold the grid. The belt does not start until the lights drop.',
  }),
  Object.freeze({
    id: 'contract_junction_jam',
    levelId: 'level_junction_return',
    courseRevision: 3,
    practice: false,
    laps: 1,
    steerLock: 'racing',
    sectionMission: true,
    steerLockPhases: ['grid', 'chase'],
    racingKind: 'sensors',
    reward_cr: 1100,
    duration_s: 900,
    title: 'Burned canopy',
    brief: 'Customs cooked the overhead picture on the tally. Approach within 70 WU of the line at 8 WU/s or less, align with the first leg and release any tether; fly the course, then dock at the destination station to file.',
    summary: 'Stop and align at the start line (within 70 WU, at 8 WU/s or less, no tether), run the tally, then dock at the destination station. Stern camera locks at green.',
    gridLine: 'Approach within 70 WU, slow to 8 WU/s or less, align with the first leg and release any tether. Dock at the destination after the finish.',
  }),
  Object.freeze({
    id: 'contract_veil_laps',
    levelId: 'level_veil_ribbon',
    practice: false,
    laps: 3,
    steerLock: 'racing',
    racingKind: 'laps',
    boostGateIndex: 2,
    reward_cr: 1600,
    duration_s: 1400,
    title: 'Veil ribbon',
    brief: 'Three laps of the wash. The gas eats a top-down frame. The radiation pocket is a burn ring. Leave the ribbon and the leash drags you back.',
    summary: 'Three laps on the Veil wash. Stern camera required. Burn ring in the radiation pocket.',
    gridLine: 'Hold. Three laps. The burn is inside the wash.',
  }),
  Object.freeze({
    id: 'contract_textile_mark',
    levelId: 'level_textile_outbound',
    practice: false,
    laps: 1,
    steerLock: 'racing',
    racingKind: 'pace',
    reward_cr: 1400,
    duration_s: 900,
    tighten: true,
    title: 'Vesper’s mark',
    brief: 'The belt mark is already posted. Beat the tightened clock. The rocks do not rearrange themselves.',
    summary: 'Same Helios terrain as qualifying. Stern camera. Tighter time bands.',
    gridLine: 'Hold. The mark is tighter than the qualifying lap.',
  }),
  Object.freeze({
    id: 'contract_junction_draft',
    levelId: 'level_junction_return',
    courseRevision: 3,
    practice: false,
    laps: 1,
    steerLock: 'racing',
    sectionMission: true,
    steerLockPhases: ['grid', 'chase'],
    racingKind: 'draft',
    draftRequiredS: 2.0,
    paceSpeedWU: 260,
    reward_cr: 1200,
    duration_s: 900,
    title: 'Pace light',
    brief: 'Approach within 70 WU of the line at 8 WU/s or less, align with the first leg and release any tether. Track 18–150 WU behind the 260 WU/s pace light, within its 45 WU wake, aligned and moving at 35% pace or faster for 2 cumulative seconds; dock at the destination station after the course.',
    summary: 'Stop and align at the start line (within 70 WU, at 8 WU/s or less, no tether). Hold the aligned wake 18–150 WU behind the pace light for 2 seconds, then dock at the destination station.',
    gridLine: 'Approach within 70 WU; slow to 8 WU/s or less, align and release any tether. Hold the 45 WU-wide wake 18–150 WU behind the beacon for 2 seconds, then dock after the finish.',
  }),
]);

const PRACTICE = RACE_LEVELS.map((level) => Object.freeze({
  id: `practice_${level.id}`,
  levelId: level.id,
  practice: true,
  laps: level.id === 'level_veil_ribbon' ? 3 : 1,
  steerLock: null,
  racingKind: 'practice',
  boostGateIndex: level.id === 'level_veil_ribbon' ? 2 : undefined,
  reward_cr: 250,
  duration_s: level.id === 'level_veil_ribbon' ? 1400 : 900,
  title: `Practice — ${level.name}`,
  brief: level.blurb,
  summary: 'Practice. The stern camera follows your steering-view setting; it is not locked.',
  gridLine: 'Hold the grid. Practice does not lock the camera.',
}));

export const RACE_CONTRACTS = Object.freeze([...PRACTICE, ...CONTRACTS]);
const CONTRACT_BY_ID = new Map(RACE_CONTRACTS.map((row) => [row.id, row]));

export function raceContractById(id) {
  return CONTRACT_BY_ID.get(id) || null;
}

export function storyContracts() {
  return RACE_CONTRACTS.filter((row) => row.practice !== true);
}

export function practiceContractForLevel(levelId) {
  return RACE_CONTRACTS.find((row) => row.practice === true && row.levelId === levelId) || null;
}

/** A normal board offer. postAndAcceptAuthoredOffer is the only writer that should take it. */
export function racingOfferFor(contractId) {
  const row = raceContractById(contractId);
  if (!row) return null;
  const level = raceLevelById(row.levelId);
  const course = courseForLevel(row.levelId);
  if (!level || !course) return null;
  const params = courseParams(course, {
    levelId: level.id,
    racingContractId: row.id,
    racingKind: row.racingKind,
    courseRevision: Number.isInteger(row.courseRevision) ? row.courseRevision : 2,
    laps: row.laps,
    terrain: level.terrain,
    gridLine: row.gridLine || '',
  });
  if (row.sectionMission) {
    params.sectionMission = true;
    params.phase = 'approach';
    params.steerLockPhases = row.steerLockPhases.slice();
  }
  if (Number.isFinite(row.draftRequiredS)) params.draftRequiredS = row.draftRequiredS;
  if (Number.isFinite(row.paceSpeedWU)) params.paceSpeedWU = row.paceSpeedWU;
  if (row.steerLock) params.steerLock = row.steerLock;
  if (Number.isInteger(row.boostGateIndex)) params.boostGateIndex = row.boostGateIndex;
  if (row.laps > 1) {
    params.recordS = Math.max(12, Math.round(course.recordS * row.laps));
    params.bandCapsS = [
      Math.round(params.recordS * RAZOR_CAP_MULT),
      Math.round(params.recordS * STANDARD_CAP_MULT),
    ];
  }
  if (row.tighten) {
    const base = params.recordS;
    params.recordS = Math.max(8, Math.round(base * 0.9));
    params.bandCapsS = [
      Math.max(8, Math.round(base * 0.95)),
      Math.max(12, Math.round(base * 1.25)),
    ];
  }
  return {
    id: `race_offer_${row.id}`,
    source: 'racingCircuit',
    type: 'race',
    stationId: level.stationId,
    reward_cr: row.reward_cr,
    time_limit_s: row.duration_s,
    duration_s: row.duration_s,
    collateral_cr: 0,
    riskTier: 0,
    preloadedCargo: false,
    destStationId: level.stationId,
    destSectorId: level.sectorId,
    distance: Math.round(course.courseLengthWU),
    params,
    title: row.title,
    brief: row.brief,
    summary: row.summary,
    storyTag: `racing:${row.id}`,
    cause: {
      tag: 'race',
      fingerprint: `racing:${row.id}`,
      levelId: level.id,
      terrain: level.terrain,
    },
  };
}

/** Stable seed for a fresh practice flight. Not a campaign seed. */
export function racingSeedFor(contractId) {
  let h = 2166136261;
  const s = String(contractId || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}
