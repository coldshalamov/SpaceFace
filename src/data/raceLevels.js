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
// Course medal standards in WU/s. Authored paces, never a player's best and never a payout.
const MEDAL_PACE_WU_S = Object.freeze({ gold: 680, silver: 520, bronze: 390 });

function round2(v) { return Math.round(v * 100) / 100; }

function medalTimesFor(lengthWU) {
  const gold = Math.max(12, Math.round(lengthWU / MEDAL_PACE_WU_S.gold));
  const silver = Math.max(gold + 1, Math.round(lengthWU / MEDAL_PACE_WU_S.silver));
  const bronze = Math.max(silver + 1, Math.round(lengthWU / MEDAL_PACE_WU_S.bronze));
  return Object.freeze({ gold, silver, bronze });
}

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
  // Sector circuits run hazard work, not flat pace: their board record uses the slower
  // reference while the three originals keep the authored 520 WU/s standard untouched.
  const pace = Number.isFinite(spec.recordPaceWU) && spec.recordPaceWU > 0 ? spec.recordPaceWU : AUTHORED_RECORD_WU_S;
  const recordS = Math.max(12, Math.round(lengthWU / pace));
  return Object.freeze({
    courseId: spec.courseId,
    courseName: spec.courseName,
    kind: 'circuit',
    sectorId: spec.sectorId,
    gates: Object.freeze(gates),
    gateRadiusWU: spec.gateRadiusWU,
    courseLengthWU: round2(lengthWU),
    recordS,
    medalTimes: medalTimesFor(lengthWU),
    bandCapsS: Object.freeze([
      Math.round(recordS * RAZOR_CAP_MULT),
      Math.round(recordS * STANDARD_CAP_MULT),
    ]),
    ...(Number.isInteger(spec.courseRevision) ? { courseRevision: spec.courseRevision } : {}),
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
    { x: 1640, z: 180 },
    { x: 1040, z: 80 },
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
    { x: 1850, z: -580 },
    { x: 1840, z: -300 },
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
    { x: -620, z: -1570 },
    { x: -1370, z: -1030 },
    { x: -1700, z: 330 },
    { x: 620, z: 1230 },
    { x: 1800, z: 200 },
    { x: 1400, z: -700 },
  ],
});

// ── AL-RACE-2 sector-signature circuits ──────────────────────────────────────
// Every way of life is a course: each of these laps is drawn so the sector's own
// physics — its machinery cycle, its timed weather, its standing rocks — is the
// racing problem. They are temporary time trials only (raceModes ['time-trial'],
// temporaryOnly), revision 1, gate radius 90, and a 120 WU/s board record: the
// pilot pays in hazard work, not flat pace.
const SECTOR_RECORD_WU_S = 120;

// Pallas Drift, sector-local. The reef cone (-320,-620 r420) sits on gates 3-5: the
// five-mine string rides the current along rot 0.38. f_pallas_2 (980,420) is the
// eastern ice bank; f_pallas_3 (-840,1180) closes the return.
const PALLAS_COURSE = freezeCourse({
  courseId: 'circuit_pallas_reef',
  courseName: 'Pallas Reef',
  sectorId: 'sector_pallas_drift',
  gateRadiusWU: 90,
  recordPaceWU: SECTOR_RECORD_WU_S,
  courseRevision: 1,
  gates: [
    { x: -1800, z: -1400 },
    { x: -950, z: -1100 },
    { x: -470, z: -820 },
    { x: -250, z: -710 },
    { x: -80, z: -600 },
    { x: 200, z: -350 },
    { x: 700, z: 0 },
    { x: 1100, z: 600 },
    { x: 300, z: 1150 },
    { x: -700, z: 1300 },
    { x: -1450, z: 700 },
    { x: -1800, z: -600 },
  ],
});

// Vesta Forge, sector-local. The radiation belt (-540,-480 r260) is gate 6's
// approach; the storm lane (680,320, a 460x78 sheet on rot -0.55) crosses the leg
// into gate 8. Gate 6 is nudged south-west and gate 8 south-east of the authored
// marks so the course physically rides both foundry windows instead of passing
// beside them.
const VESTA_COURSE = freezeCourse({
  courseId: 'circuit_vesta_furnace',
  courseName: 'Vesta Furnace',
  sectorId: 'sector_vesta_forge',
  gateRadiusWU: 90,
  recordPaceWU: SECTOR_RECORD_WU_S,
  courseRevision: 1,
  gates: [
    { x: 1700, z: -1300 },
    { x: 900, z: -1500 },
    { x: 200, z: -1400 },
    { x: -500, z: -1100 },
    { x: -1000, z: -600 },
    { x: -850, z: -200 },
    { x: -450, z: -250 },
    { x: 200, z: 0 },
    { x: 980, z: 210 },
    { x: 900, z: 1100 },
    { x: 1600, z: 1000 },
    { x: 1900, z: 0 },
  ],
});

// Ceres Belt, sector-local. The Cinder Sluice cone (1950,-1250 r620, dir
// (0.984,-0.179)) covers legs 4-6 between the jaw fields: the pilot crosses the
// current three times while it cycles warning/surge/calm off the durable site
// record. The gate-8 hairpin is the sluice mouth reversal.
const CERES_COURSE = freezeCourse({
  courseId: 'circuit_ceres_sluice',
  courseName: 'Ceres Sluice',
  sectorId: 'sector_ceres_belt',
  gateRadiusWU: 90,
  recordPaceWU: SECTOR_RECORD_WU_S,
  courseRevision: 1,
  gates: [
    { x: 2800, z: -2200 },
    { x: 2200, z: -2300 },
    { x: 1600, z: -2000 },
    { x: 1500, z: -1400 },
    { x: 1900, z: -900 },
    { x: 2300, z: -1050 },
    { x: 2300, z: -1350 },
    { x: 2800, z: -1500 },
    { x: 3200, z: -1000 },
    { x: 3400, z: -1800 },
  ],
});

// Haumea Rift, sector-local. The dense_asteroid disc (-540,380 r780) covers gates
// 2-5; the fissure cracker (180,380) stands off gate 5's shoulder as native
// machinery scenery. f_haumea_1 ice banks the north loop, f_haumea_2 crystals the
// east drop.
const HAUMEA_COURSE = freezeCourse({
  courseId: 'circuit_haumea_fissure',
  courseName: 'Haumea Fissure',
  sectorId: 'sector_haumea_rift',
  gateRadiusWU: 90,
  recordPaceWU: SECTOR_RECORD_WU_S,
  courseRevision: 1,
  gates: [
    { x: -1500, z: -800 },
    { x: -1400, z: 0 },
    { x: -1000, z: 500 },
    { x: -450, z: 650 },
    { x: 0, z: 700 },
    { x: 400, z: 450 },
    { x: 900, z: 700 },
    { x: 1400, z: 200 },
    { x: 1500, z: -600 },
    { x: 800, z: -1200 },
    { x: -300, z: -1400 },
  ],
});

// Kepler Scar, sector-local. The radiation scar (200,-300 r900) covers the east
// descent through gates 6-8; the debris field (-700,500 r700) takes the north
// arc through gates 2-3. f_kepler_1 rare-exotic banks the south drop, f_kepler_2
// metallic the north.
const KEPLER_COURSE = freezeCourse({
  courseId: 'circuit_kepler_scar',
  courseName: 'Kepler Scar',
  sectorId: 'sector_kepler_scar',
  gateRadiusWU: 90,
  recordPaceWU: SECTOR_RECORD_WU_S,
  courseRevision: 1,
  gates: [
    { x: -1800, z: -900 },
    { x: -1700, z: 0 },
    { x: -1350, z: 500 },
    { x: -1000, z: 900 },
    { x: -200, z: 1300 },
    { x: 700, z: 1000 },
    { x: 1100, z: 200 },
    { x: 700, z: -500 },
    { x: 100, z: -850 },
    { x: -600, z: -1300 },
  ],
});

// Sker Haven, sector-local. Both dense-asteroid approach banks are on the lap:
// the east disc (500,300 r800) covers gates 4-6 between the Throne pass and the
// Bazaar cut; the west disc (-500,-400 r700) takes gates 2-3 and the long return.
// f_sker_1 rare-exotic sits off the south sweep.
const SKER_COURSE = freezeCourse({
  courseId: 'circuit_sker_wreckrun',
  courseName: 'Sker Wreckrun',
  sectorId: 'sector_sker_haven',
  gateRadiusWU: 90,
  recordPaceWU: SECTOR_RECORD_WU_S,
  courseRevision: 1,
  gates: [
    { x: -1700, z: -1500 },
    { x: -1500, z: -500 },
    { x: -1100, z: -100 },
    { x: -800, z: 100 },
    { x: -100, z: 250 },
    { x: 600, z: 550 },
    { x: 1100, z: 300 },
    { x: 1000, z: -300 },
    { x: 500, z: -850 },
    { x: -150, z: -1100 },
    { x: -1000, z: -1600 },
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

// AL-RACE-2 — the six sector-signature circuits. `sectorHazards` stores only
// references (native IDs, zone indices, a leg's served gate) — the projection in
// missions/racingSectorHazards.js reads the live phase off the sector's own
// machinery and site records; nothing here duplicates force, cycle, or damage.
const SECTOR_LEVEL = (spec) => Object.freeze({ temporaryOnly: true, raceModes: Object.freeze(['time-trial']), ...spec });

export const SECTOR_RACE_LEVELS = Object.freeze([
  SECTOR_LEVEL({
    id: 'level_pallas_reef',
    name: 'Pallas Reef',
    sectorId: 'sector_pallas_drift',
    stationId: 'station_drift',
    courseRevision: 1,
    terrain: 'Pallas debris reef cone and the metallic, icy banks around it',
    blurb: 'The reef shoves on surge and goes quiet on calm. Cross the mine string on the window, not on nerve.',
    course: PALLAS_COURSE,
    sectorHazards: Object.freeze([
      Object.freeze({ id: 'pallas_reef', kind: 'pallasReef', name: 'Debris reef current',
        gateIndex: 4, label: 'TIMED CURRENT', waitBackWU: 300,
        hint: 'The reef pushes on surge; the calm window is the crossing.' }),
    ]),
  }),
  SECTOR_LEVEL({
    id: 'level_vesta_furnace',
    name: 'Vesta Furnace',
    sectorId: 'sector_vesta_forge',
    stationId: 'station_forge',
    courseRevision: 1,
    terrain: 'Vesta radiation belt, storm lane, and the metallic foundry fields',
    blurb: 'Two foundry windows on the same clock. The belt gathers you; the storm sheet carries you.',
    course: VESTA_COURSE,
    sectorHazards: Object.freeze([
      Object.freeze({ id: 'vesta_radiation_belt', kind: 'weatherVolume', volumeId: 'vesta_radiation_belt',
        name: 'Radiation belt', gateIndex: 6, label: 'WELL WINDOW', waitBackWU: 240,
        hint: 'The belt gathers on surge. Wait the calm or spend the crossing fast.' }),
      Object.freeze({ id: 'vesta_storm_lane', kind: 'weatherVolume', volumeId: 'vesta_storm_lane',
        name: 'Storm lane', gateIndex: 8, label: 'STORM SHEET', waitBackWU: 240,
        hint: 'The sheet carries everything inside it. Enter on the calm or ride it straight.' }),
    ]),
  }),
  SECTOR_LEVEL({
    id: 'level_ceres_sluice',
    name: 'Ceres Sluice',
    sectorId: 'sector_ceres_belt',
    stationId: 'station_ceres',
    courseRevision: 1,
    terrain: 'Cinder Sluice current between the Ceres jaw fields',
    blurb: 'The sluice exhausts downstream on surge and goes quiet on calm. Three crossings, one clock.',
    course: CERES_COURSE,
    sectorHazards: Object.freeze([
      Object.freeze({ id: 'ceres_sluice', kind: 'cinderSluice', name: 'Cinder Sluice current',
        gateIndex: 5, label: 'SLUICE WINDOW', waitBackWU: 280,
        hint: 'The cone shoves downstream on surge. Time the calm; the site keeps its own clock.' }),
    ]),
  }),
  SECTOR_LEVEL({
    id: 'level_haumea_fissure',
    name: 'Haumea Fissure',
    sectorId: 'sector_haumea_rift',
    stationId: 'station_haumea_rift',
    courseRevision: 1,
    terrain: 'Haumea dense-ice asteroid disc and the fissure cracker',
    blurb: 'Dense ice all through the north arc, and the drill works the fissure on its own cycle.',
    course: HAUMEA_COURSE,
    sectorHazards: Object.freeze([
      Object.freeze({ id: 'haumea_ice_disc', kind: 'staticZone', zoneIndex: 0,
        name: 'Dense ice field', gateIndex: 4, label: 'DENSE ICE', waitBackWU: 200,
        hint: 'The disc is rock all the way through. Stay on the cleared line.' }),
      Object.freeze({ id: 'fissure_cracker', kind: 'killMachine', machineId: 'fissure_cracker',
        name: 'Fissure cracker', gateIndex: 5, label: 'CRACK CYCLE', waitBackWU: 220,
        hint: 'The drill throws on surge. Pass the shoulder on calm.' }),
    ]),
  }),
  SECTOR_LEVEL({
    id: 'level_kepler_scar',
    name: 'Kepler Scar',
    sectorId: 'sector_kepler_scar',
    stationId: 'station_kepler_scar',
    courseRevision: 1,
    terrain: 'Kepler radiation scar and the debris field under the capsized hull',
    blurb: 'The glow eats the east descent. The debris field takes the north arc. Neither one moves for you.',
    course: KEPLER_COURSE,
    sectorHazards: Object.freeze([
      Object.freeze({ id: 'kepler_debris', kind: 'staticZone', zoneIndex: 1,
        name: 'Scar debris field', gateIndex: 3, label: 'DEBRIS FIELD', waitBackWU: 200,
        hint: 'Old-war mass fills the north arc. The banks mark the only line through.' }),
      Object.freeze({ id: 'kepler_glow', kind: 'staticZone', zoneIndex: 0,
        name: 'Radiation scar', gateIndex: 7, label: 'RADIATION', waitBackWU: 220,
        hint: 'The glow covers the descent. Short exposure, clean line, no sightseeing.' }),
    ]),
  }),
  SECTOR_LEVEL({
    id: 'level_sker_wreckrun',
    name: 'Sker Wreckrun',
    sectorId: 'sector_sker_haven',
    stationId: 'station_sker',
    courseRevision: 1,
    terrain: 'Both Sker dense-asteroid approach banks and the exotic seam',
    blurb: 'Gate-camp rock on both approaches. The banks are the checkpoints and the hazard at once.',
    course: SKER_COURSE,
    sectorHazards: Object.freeze([
      Object.freeze({ id: 'sker_west_bank', kind: 'staticZone', zoneIndex: 1,
        name: 'West approach bank', gateIndex: 3, label: 'DENSE BANK', waitBackWU: 200,
        hint: 'The west disc is crowded with scrap rock. Hold the cleared lane.' }),
      Object.freeze({ id: 'sker_east_bank', kind: 'staticZone', zoneIndex: 0,
        name: 'East approach bank', gateIndex: 5, label: 'DENSE BANK', waitBackWU: 220,
        hint: 'The east disc takes the Throne pass. Do not improvise inside it.' }),
    ]),
  }),
]);

export const RACING_CIRCUITS = Object.freeze([...RACE_LEVELS, ...SECTOR_RACE_LEVELS]);

const LEVEL_BY_ID = new Map(RACING_CIRCUITS.map((level) => [level.id, level]));

export function raceLevelById(id) {
  return LEVEL_BY_ID.get(id) || null;
}

const LEVEL_BY_SECTOR = new Map(RACING_CIRCUITS.map((level) => [level.sectorId, level]));

/** The circuit living in a sector, across the full nine-course catalog. */
export function raceLevelForSector(sectorId) {
  return LEVEL_BY_SECTOR.get(sectorId) || null;
}

/** The authored circuit for a level, or null. Never the derived lane chord. */
export function courseForLevel(id) {
  const level = raceLevelById(id);
  return level && level.course ? level.course : null;
}

/** Best medal a time-trial lap strictly beats. Gold is fastest. Not the player's best. */
export function medalForCourseTime(levelId, elapsedS) {
  const times = courseForLevel(levelId)?.medalTimes;
  if (!times || !Number.isFinite(elapsedS) || elapsedS <= 0) return null;
  if (elapsedS < times.gold) return 'Gold';
  if (elapsedS < times.silver) return 'Silver';
  if (elapsedS < times.bronze) return 'Bronze';
  return null;
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
    courseRevision: Number.isInteger(extra && extra.courseRevision) ? extra.courseRevision
      : (Number.isInteger(course.courseRevision) ? course.courseRevision : 3),
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
    courseRevision: 4,
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
    summary: 'Stop and align at the start line (within 70 WU, at 8 WU/s or less, no tether), run the tally, then dock at the destination station. Chase view during countdown and course.',
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
    courseRevision: 4,
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
    brief: 'A pace light traces the tally ahead of you. Read its line through the turns; real rivals provide the draft in pack races. The stern camera stays on — that is how dispatch watches the run.',
    summary: 'The tally circuit again. Follow the pace light through the turns. Stern camera required.',
    gridLine: 'Hold. The pace light leaves with you. Read the line ahead.',
  }),
  Object.freeze({
    id: 'contract_textile_rematch',
    levelId: 'level_textile_outbound',
    practice: false,
    laps: 2,
    steerLock: 'racing',
    racingKind: 'laps',
    reward_cr: 1500,
    duration_s: 1200,
    title: 'The tallyman’s rematch',
    brief: 'The dispatch clerk who graded Vesper’s mark disputes the lap. Two circuits of the belt, posted purse, stern camera — he is watching the same rocks you are.',
    summary: 'Two laps of the Helios belt. Stern camera required. The clerk is grading this one personally.',
    gridLine: 'Hold. Two laps. The tallyman already wrote your time down once.',
  }),
]);

// AL-RACE-2 — three non-practice contracts on three of the six sector circuits.
// Same offer shape as the story originals: pace kind, racing steer lock, 900 s window.
// The other three new courses stay fully selectable through practice.
const SECTOR_CONTRACTS = Object.freeze([
  Object.freeze({
    id: 'contract_pallas_reef',
    levelId: 'level_pallas_reef',
    courseRevision: 1,
    practice: false,
    laps: 1,
    steerLock: 'racing',
    racingKind: 'pace',
    reward_cr: 1100,
    duration_s: 900,
    title: 'Reef window',
    brief: 'One lap of the Pallas reef. The current shoves on surge and goes quiet on calm — the pilot who reads the window keeps the line.',
    summary: 'One lap of the Pallas reef. Stern camera required. The surge is the course.',
    gridLine: 'Hold. The reef keeps its own clock.',
  }),
  Object.freeze({
    id: 'contract_vesta_furnace',
    levelId: 'level_vesta_furnace',
    courseRevision: 1,
    practice: false,
    laps: 1,
    steerLock: 'racing',
    racingKind: 'pace',
    reward_cr: 1200,
    duration_s: 900,
    title: 'Foundry windows',
    brief: 'One lap of the Vesta furnace circuit. The belt gathers and the storm sheet carries, both on the same shift clock.',
    summary: 'One lap of the Vesta furnace. Stern camera required. Two hazard windows.',
    gridLine: 'Hold. The foundry does not wait for your read.',
  }),
  Object.freeze({
    id: 'contract_sker_wreckrun',
    levelId: 'level_sker_wreckrun',
    courseRevision: 1,
    practice: false,
    laps: 1,
    steerLock: 'racing',
    racingKind: 'pace',
    reward_cr: 1400,
    duration_s: 900,
    title: 'Wreckrun',
    brief: 'One lap of the Sker approaches. Both banks are the checkpoints and the hazard; the posted purse says the Reach approves.',
    summary: 'One lap of the Sker wreckrun. Stern camera required. Dense rock on both approaches.',
    gridLine: 'Hold. The bank does not move for a poster time.',
  }),
]);

const PRACTICE = RACING_CIRCUITS.map((level) => Object.freeze({
  id: `practice_${level.id}`,
  levelId: level.id,
  practice: true,
  laps: level.id === 'level_veil_ribbon' ? 3 : 1,
  steerLock: null,
  racingKind: 'practice',
  boostGateIndex: level.id === 'level_veil_ribbon' ? 2 : undefined,
  // Sector circuits carry their own course revision; the originals keep the default.
  ...(Number.isInteger(level.courseRevision) ? { courseRevision: level.courseRevision } : {}),
  reward_cr: 250,
  duration_s: level.id === 'level_veil_ribbon' ? 1400 : 900,
  title: `Practice — ${level.name}`,
  brief: level.blurb,
  summary: 'Practice. The stern camera follows your steering-view setting; it is not locked.',
  gridLine: 'Hold the grid. Practice does not lock the camera.',
}));

export const RACE_CONTRACTS = Object.freeze([...PRACTICE, ...CONTRACTS, ...SECTOR_CONTRACTS]);
const CONTRACT_BY_ID = new Map(RACE_CONTRACTS.map((row) => [row.id, row]));

export function raceContractById(id) {
  return CONTRACT_BY_ID.get(id) || null;
}

/** The authored story contracts — exactly the legacy roster, no sector rows. */
export function storyContracts() {
  return CONTRACTS.filter((row) => row.practice !== true);
}

/** All non-practice circuit contracts: the story roster plus the three sector rows. */
export function circuitContracts() {
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
    courseRevision: Number.isInteger(row.courseRevision) ? row.courseRevision
      : (Number.isInteger(course.courseRevision) ? course.courseRevision : 3),
    laps: row.laps,
    terrain: level.terrain,
    gridLine: row.gridLine || '',
  });
  if (level.temporaryOnly) params.temporaryOnly = true;
  if (level.raceModes) params.raceModes = level.raceModes.slice();
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
