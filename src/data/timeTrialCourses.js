// Plan 50 — first authored gate-ring time trial.
//
// Course coordinates are sector-local and converted exactly once by the runtime owner. Medal bands
// are fixed simulation ticks (60 Hz), never wall time, so the same input tape earns the same result.

export const TIME_TRIAL_SCHEMA_VERSION = 1;
export const TIME_TRIAL_TICK_RATE = 60;

function freezePoint(x, z) {
  return Object.freeze({ x, z });
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
    Object.freeze({ id: 'shift-01', center: freezePoint(-1050, -250) }),
    Object.freeze({ id: 'shift-02', center: freezePoint(-650, -520) }),
    Object.freeze({ id: 'shift-03', center: freezePoint(-150, -820) }),
    Object.freeze({ id: 'shift-04', center: freezePoint(350, -1040) }),
    Object.freeze({ id: 'shift-05', center: freezePoint(780, -850) }),
    Object.freeze({ id: 'shift-06', center: freezePoint(1200, -520) }),
  ]),
  ring: Object.freeze({
    // Four fixed bodies make two genuinely physical side rails. Their small fore/aft stagger reads
    // as a ring frame without parking a collider on the racing line in the 2.5D flight plane.
    nodeCount: 4,
    radiusWU: 58,
    buoyRadiusWU: 3.5,
    buoyMass: 1_000_000,
    placeScale: 0.42,
  }),
  medals: Object.freeze({
    goldTicks: 38 * TIME_TRIAL_TICK_RATE,
    silverTicks: 52 * TIME_TRIAL_TICK_RATE,
    bronzeTicks: 75 * TIME_TRIAL_TICK_RATE,
  }),
  rewards: Object.freeze({
    bronzeCredits: 160,
    silverCredits: 320,
    goldCredits: 560,
    goldTrailTint: Object.freeze({ id: 'trail_ceres_shift_gold', color: '#f4c857' }),
  }),
  replay: Object.freeze({
    maxFrames: 75 * TIME_TRIAL_TICK_RATE,
    inputQuantization: 1000,
  }),
});

export const TIME_TRIAL_COURSES = Object.freeze([CERES_SHIFT_RING]);

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
