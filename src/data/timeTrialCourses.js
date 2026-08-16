// Plan 50 — authored physical flight-skill courses.
//
// Course coordinates are sector-local and converted exactly once by the runtime owner. Medal bands
// are fixed simulation ticks (60 Hz), never wall time, so the same input tape earns the same result.

export const TIME_TRIAL_SCHEMA_VERSION = 1;
export const TIME_TRIAL_TICK_RATE = 60;

function freezePoint(x, z) {
  return Object.freeze({ x, z });
}

function freezePlanetPoint(radiusWU, angleRad) {
  return Object.freeze({ planetRadiusWU: radiusWU, planetAngleRad: angleRad });
}

function freezeGate(id, center) {
  return Object.freeze({ id, center });
}

function freezeRing(radiusWU = 58) {
  return Object.freeze({
    nodeCount: 4,
    radiusWU,
    buoyRadiusWU: 3.5,
    buoyMass: 1_000_000,
    placeScale: 0.42,
  });
}

function freezeMedals(goldS, silverS, bronzeS) {
  return Object.freeze({
    goldTicks: goldS * TIME_TRIAL_TICK_RATE,
    silverTicks: silverS * TIME_TRIAL_TICK_RATE,
    bronzeTicks: bronzeS * TIME_TRIAL_TICK_RATE,
  });
}

function freezeRewards(prefix, bronzeCredits, silverCredits, goldCredits, color) {
  return Object.freeze({
    bronzeCredits,
    silverCredits,
    goldCredits,
    goldTrailTint: Object.freeze({ id: `trail_${prefix}_gold`, color }),
  });
}

function freezeReplay(maxSeconds) {
  return Object.freeze({
    maxFrames: maxSeconds * TIME_TRIAL_TICK_RATE,
    inputQuantization: 1000,
  });
}

export const CERES_SHIFT_RING = Object.freeze({
  id: 'time_trial_ceres_shift_ring',
  name: 'Ceres Shift Ring',
  sectorId: 'sector_ceres_belt',
  postingStationId: 'station_ceres',
  postingLabel: 'SHIFT RING / OPEN RUN',
  placeId: 'place_nav_buoy',
  staging: freezePoint(-1280, -80),
  gates: Object.freeze([
    freezeGate('shift-01', freezePoint(-1050, -250)),
    freezeGate('shift-02', freezePoint(-650, -520)),
    freezeGate('shift-03', freezePoint(-150, -820)),
    freezeGate('shift-04', freezePoint(350, -1040)),
    freezeGate('shift-05', freezePoint(780, -850)),
    freezeGate('shift-06', freezePoint(1200, -520)),
  ]),
  // Four fixed bodies make two genuinely physical side rails. Their small fore/aft stagger reads
  // as a ring frame without parking a collider on the racing line in the 2.5D flight plane.
  ring: freezeRing(58),
  medals: freezeMedals(38, 52, 75),
  rewards: freezeRewards('ceres_shift', 160, 320, 560, '#f4c857'),
  replay: freezeReplay(75),
});

export const VESTA_FOUNDRY_SLALOM = Object.freeze({
  id: 'time_trial_vesta_foundry_slalom',
  kind: 'slalom',
  name: 'Foundry Teeth Slalom',
  sectorId: 'sector_vesta_forge',
  postingStationId: 'station_forge',
  postingLabel: 'FOUNDRY TEETH / CLEAN HULL',
  postingRule: 'Rock contact voids the clock; your hull stays live.',
  placeId: 'place_nav_buoy',
  staging: freezePoint(-1700, -1800),
  gates: Object.freeze([
    freezeGate('teeth-01', freezePoint(-1450, -1800)),
    freezeGate('teeth-02', freezePoint(-1100, -1750)),
    freezeGate('teeth-03', freezePoint(-750, -1850)),
    freezeGate('teeth-04', freezePoint(-400, -1750)),
    freezeGate('teeth-05', freezePoint(-50, -1850)),
    freezeGate('teeth-06', freezePoint(300, -1750)),
    freezeGate('teeth-07', freezePoint(650, -1850)),
    freezeGate('teeth-08', freezePoint(1000, -1800)),
  ]),
  ring: freezeRing(110),
  obstacles: Object.freeze([
    freezePoint(-1292, -1656), freezePoint(-1258, -1894),
    freezePoint(-892, -1685), freezePoint(-958, -1915),
    freezePoint(-608, -1685), freezePoint(-542, -1915),
    freezePoint(-192, -1685), freezePoint(-258, -1915),
    freezePoint(92, -1685), freezePoint(158, -1915),
    freezePoint(508, -1685), freezePoint(442, -1915),
    freezePoint(808, -1706), freezePoint(842, -1944),
  ]),
  obstacle: Object.freeze({ radiusWU: 14, mass: 1_000_000, placeScale: 1.0 }),
  medals: freezeMedals(40, 56, 82),
  rewards: freezeRewards('vesta_slalom', 190, 390, 650, '#ff8b45'),
  replay: freezeReplay(82),
});

export const PALLAS_MASSLINE_SLINGSHOT = Object.freeze({
  id: 'time_trial_pallas_massline_slingshot',
  kind: 'slingshot',
  name: 'Pallas Longline Sling',
  sectorId: 'sector_pallas_drift',
  postingStationId: 'station_drift',
  postingLabel: 'LONGLINE SLING / RELEASE RUN',
  postingRule: 'Gate 2 only opens on a live Massline cut above sling speed.',
  placeId: 'place_nav_buoy',
  staging: freezePoint(-820, 0),
  gates: Object.freeze([
    freezeGate('sling-01', freezePoint(-600, 0)),
    freezeGate('sling-02', freezePoint(-750, -85)),
    freezeGate('sling-03', freezePoint(-1100, -400)),
    freezeGate('sling-04', freezePoint(-1450, -650)),
  ]),
  ring: freezeRing(120),
  anchor: Object.freeze({
    center: freezePoint(-300, 0),
    radiusWU: 38,
    mass: 1_000_000_000,
    typeId: 'ast_common_rock',
    placeScale: 2.1,
  }),
  qualification: Object.freeze({ gateIndex: 1, minCheckpointSpeedWU: 155 }),
  medals: freezeMedals(48, 70, 105),
  rewards: freezeRewards('pallas_slingshot', 240, 480, 800, '#7ce7ff'),
  replay: freezeReplay(105),
});

export const TETHYS_ANVIL_SKIM = Object.freeze({
  id: 'time_trial_tethys_anvil_skim',
  kind: 'skim',
  name: 'Anvil Rim Skim',
  sectorId: 'sector_tethys_junction',
  postingStationId: 'station_tethys',
  postingLabel: 'ANVIL RIM / SKIM RUN',
  postingRule: 'Stay inside the live skim band; storm depth or climbing clear voids the clock.',
  placeId: 'place_nav_buoy',
  planetSiteId: 'planet_tethys_anvil',
  staging: freezePlanetPoint(995, -2.05),
  gates: Object.freeze([
    freezeGate('skim-01', freezePlanetPoint(965, -1.88)),
    freezeGate('skim-02', freezePlanetPoint(965, -1.52)),
    freezeGate('skim-03', freezePlanetPoint(965, -1.16)),
    freezeGate('skim-04', freezePlanetPoint(965, -0.80)),
    freezeGate('skim-05', freezePlanetPoint(965, -0.44)),
    freezeGate('skim-06', freezePlanetPoint(965, -0.08)),
  ]),
  ring: freezeRing(54),
  safety: Object.freeze({ minRadiusWU: 900, maxRadiusWU: 1058 }),
  medals: freezeMedals(42, 60, 88),
  rewards: freezeRewards('tethys_skim', 220, 450, 760, '#ffae68'),
  replay: freezeReplay(88),
});

export const TIME_TRIAL_COURSES = Object.freeze([
  CERES_SHIFT_RING,
  VESTA_FOUNDRY_SLALOM,
  PALLAS_MASSLINE_SLINGSHOT,
  TETHYS_ANVIL_SKIM,
]);

const COURSE_BY_ID = new Map(TIME_TRIAL_COURSES.map((course) => [course.id, course]));
const COURSE_BY_SECTOR = new Map(TIME_TRIAL_COURSES.map((course) => [course.sectorId, course]));

export function timeTrialCourseById(courseId) {
  return COURSE_BY_ID.get(courseId) || null;
}

export function timeTrialCourseForSector(sectorId) {
  return COURSE_BY_SECTOR.get(sectorId) || null;
}

export function medalForTimeTrialTicks(course, elapsedTicks) {
  if (!course || !Number.isFinite(elapsedTicks)) return null;
  const ticks = Math.max(0, Math.trunc(elapsedTicks));
  if (ticks <= course.medals.goldTicks) return 'gold';
  if (ticks <= course.medals.silverTicks) return 'silver';
  if (ticks <= course.medals.bronzeTicks) return 'bronze';
  return null;
}

export function timeTrialMedalRank(medal) {
  if (medal === 'gold') return 3;
  if (medal === 'silver') return 2;
  if (medal === 'bronze') return 1;
  return 0;
}

export function cumulativeTimeTrialCredits(course, medal) {
  if (!course) return 0;
  if (medal === 'gold') return course.rewards.goldCredits;
  if (medal === 'silver') return course.rewards.silverCredits;
  if (medal === 'bronze') return course.rewards.bronzeCredits;
  return 0;
}
