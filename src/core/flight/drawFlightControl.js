// G-mode arcade translation. This is an explicit flight-computer mode, not a retuning of
// Newtonian/manual flight. Steering rotates momentum at a bounded rate; thrust changes its
// magnitude. The returned acceleration goes through the normal force/physics authority.
// In particular, a 180-degree command must NOT interpolate the two velocity vectors through zero.
export const DRAW_FLIGHT = Object.freeze({
  responseS: 0.055,
  maxTurnRate: 6,
  minLookahead: 12,
  lookaheadRadii: 1.35,
  headingFilterS: 0.035,
  maxPoints: 1024,
  maxSegment: 100000,
});

const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const positive = (v, fallback) => Number.isFinite(v) && v > 0 ? v : fallback;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const drawWrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export function drawFlightTurnRate(profile) {
  return Math.min(DRAW_FLIGHT.maxTurnRate, positive(profile?.maxYawRate, 3));
}
export function validDrawFlight(command) {
  return command?.active === true && Number.isFinite(command.heading);
}

/** Pure finite-step acceleration request. No entity, position, or velocity writes. */
export function drawFlightAcceleration(body, command, profile, dt, boosting = false) {
  const step = clamp(finite(dt), 0, 0.25);
  const vx = finite(body?.vel?.x);
  const vz = finite(body?.vel?.z);
  const speed = Math.hypot(vx, vz);
  const heading = speed > 0.5 ? Math.atan2(vz, vx) : finite(body?.rot);
  const target = finite(command?.heading, heading);
  const baseCap = positive(profile?.combatSpeed, positive(profile?.maxSpeed, 120));
  const cap = Math.min(baseCap * (boosting ? positive(profile?.boostSpeedMult, 1) : 1),
    positive(profile?.solverSpeedLimit, Infinity));
  const accel = positive(profile?.mainAccel, positive(profile?.maxAccel, 80))
    * (boosting ? positive(profile?.boostAccelMult, 1) : 1);
  // A dash, impact or sling can put us over cap. Never confiscate that momentum just because
  // the pointer moved; finite lateral authority makes overspeed arcs wider instead.
  const turnRate = drawFlightTurnRate(profile) * Math.min(1, cap / Math.max(speed, 0.5));
  let error = drawWrapAngle(target - heading);
  // Retain the stroke's turn sense at the antipode. ±one pixel must not alternate two U-turns.
  if (Math.abs(error) > Math.PI - 0.08 && command?.turnSign) {
    error = Math.abs(error) * Math.sign(command.turnSign);
  }
  const delta = clamp(error * (1 - Math.exp(-step / DRAW_FLIGHT.responseS)),
    -turnRate * step, turnRate * step);
  const nextHeading = heading + delta;
  const nextSpeed = speed < cap ? Math.min(cap, speed + accel * step) : speed;
  const x = step > 0 ? (Math.cos(nextHeading) * nextSpeed - vx) / step : 0;
  const z = step > 0 ? (Math.sin(nextHeading) * nextSpeed - vz) / step : 0;
  return { x, z, heading: nextHeading, targetHeading: target, turnRate: step > 0 ? delta / step : 0,
    speed, nextSpeed, cap };
}

// ── FB-007 — stroke grading. The follower measures; this file owns the numbers→band law, pure
// and deterministic, using the same band names as the release rating (razor/clean/good/messy).
// The grade is the cross-track error the follower already computes implicitly (the ahead-window
// projection), averaged over time on the stroke.
export const DRAW_STROKE_MAX_POINTS = 256;
export function emptyStrokeGrader() {
  return { samples: 0, timeOnPathS: 0, errorSumWu: 0, errorPeakWu: 0, peakSpeed: 0, distanceWu: 0 };
}
export function gradeStrokeSample(grader, crossTrackWu, speed, dt) {
  const err = Number.isFinite(crossTrackWu) && crossTrackWu >= 0 ? crossTrackWu : 0;
  grader.samples += 1;
  grader.timeOnPathS += finite(dt);
  grader.errorSumWu += err * finite(dt);
  grader.errorPeakWu = Math.max(grader.errorPeakWu, err);
  grader.peakSpeed = Math.max(grader.peakSpeed, finite(speed));
  return grader;
}
// Bands are absolute wu of MEAN cross-track error — the ink is a world path, so a razor stroke
// hugs it within a hull or two regardless of speed. The record rounds for display only.
export const STROKE_BAND_MEAN_WU = Object.freeze({ razor: 6, clean: 14, good: 30 });
export function gradeStroke(grader) {
  const g = grader || emptyStrokeGrader();
  const mean = g.timeOnPathS > 1e-6 ? g.errorSumWu / g.timeOnPathS : 0;
  const band = mean <= STROKE_BAND_MEAN_WU.razor ? 'razor'
    : mean <= STROKE_BAND_MEAN_WU.clean ? 'clean'
      : mean <= STROKE_BAND_MEAN_WU.good ? 'good' : 'messy';
  return {
    band,
    meanErrorWu: Math.round(mean * 10) / 10,
    peakErrorWu: Math.round(g.errorPeakWu * 10) / 10,
    distanceWu: Math.round(g.distanceWu * 10) / 10,
    peakSpeed: Math.round(g.peakSpeed * 10) / 10,
    timeOnPathS: Math.round(g.timeOnPathS * 100) / 100,
  };
}
