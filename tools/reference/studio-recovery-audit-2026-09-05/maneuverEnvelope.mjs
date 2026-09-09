/** Force-feasible speed envelope over supplied arc-length / curvature samples.
 * NOT a spline generator, steering controller, collision avoidance system, or runtime patch.
 * Segment curvature is conservatively bounded by the supplied endpoint limits; callers must
 * sample interior curvature extrema too. Entry/exit mismatch is REPORTED, never applied to a body.
 */
function finiteNonnegative(name, x) {
  if (!Number.isFinite(x) || x < 0) throw new RangeError(`${name} must be finite and nonnegative`);
  return x;
}
function positive(name, x) {
  finiteNonnegative(name, x);
  if (x === 0) throw new RangeError(`${name} must be positive`);
  return x;
}
export function segmentSeconds(distance, start, end, accel, brake, cap) {
  positive('distance', distance); positive('accel', accel); positive('brake', brake);
  positive('cap', cap); finiteNonnegative('start', start); finiteNonnegative('end', end);
  const tolerance = 1e-8 * Math.max(1, cap * cap, start * start, end * end);
  if (start > cap + 1e-8 || end > cap + 1e-8
      || end * end > start * start + 2 * accel * distance + tolerance
      || start * start > end * end + 2 * brake * distance + tolerance) {
    throw new RangeError('Infeasible segment boundary speeds');
  }
  const freePeak2 = (2 * accel * brake * distance + brake * start ** 2 + accel * end ** 2)
    / (accel + brake);
  const peak = Math.min(cap, Math.sqrt(Math.max(0, freePeak2)));
  const accelerationDistance = Math.max(0, (peak ** 2 - start ** 2) / (2 * accel));
  const brakingDistance = Math.max(0, (peak ** 2 - end ** 2) / (2 * brake));
  const cruiseDistance = Math.max(0, distance - accelerationDistance - brakingDistance);
  const seconds = Math.max(0, peak - start) / accel + Math.max(0, peak - end) / brake
    + cruiseDistance / peak;
  if (!Number.isFinite(seconds)) throw new RangeError('Numeric envelope exceeded');
  return Object.freeze({seconds, peakSpeed: peak, cruiseDistance});
}
/** @param {{samples:Array<{s:number,curvature:number}>,maxSpeed:number,
 * lateralAccel:number,accel:number,brake:number,entrySpeed?:number,exitSpeed?:number}} p */
export function maneuverEnvelope(p) {
  const {samples} = p;
  if (!Array.isArray(samples) || samples.length < 2) throw new TypeError('At least two samples required');
  const maxSpeed = positive('maxSpeed', p.maxSpeed);
  const lateral = positive('lateralAccel', p.lateralAccel);
  const accel = positive('accel', p.accel);
  const brake = positive('brake', p.brake);
  const entry = finiteNonnegative('entrySpeed', p.entrySpeed ?? 0);
  const exit = finiteNonnegative('exitSpeed', p.exitSpeed ?? 0);
  const local = samples.map((sample, i) => {
    finiteNonnegative('arc length', sample.s);
    if (!Number.isFinite(sample.curvature)) throw new RangeError('Curvature must be finite');
    if (i && sample.s <= samples[i - 1].s) throw new RangeError('Arc length must strictly increase');
    return Math.min(maxSpeed, sample.curvature === 0 ? maxSpeed : Math.sqrt(lateral / Math.abs(sample.curvature)));
  });
  const ds = samples.slice(1).map((s, i) => s.s - samples[i].s);
  const segmentCaps = ds.map((_, i) => Math.min(local[i], local[i + 1]));
  const caps = local.map((limit, i) => Math.min(limit,
    i > 0 ? segmentCaps[i - 1] : Infinity,
    i < segmentCaps.length ? segmentCaps[i] : Infinity));
  const speeds = caps.slice();
  speeds[0] = Math.min(speeds[0], entry);
  for (let i = 1; i < speeds.length; i++) {
    speeds[i] = Math.min(speeds[i], Math.sqrt(speeds[i - 1] ** 2 + 2 * accel * ds[i - 1]));
  }
  speeds[speeds.length - 1] = Math.min(speeds.at(-1), exit);
  for (let i = speeds.length - 2; i >= 0; i--) {
    speeds[i] = Math.min(speeds[i], Math.sqrt(speeds[i + 1] ** 2 + 2 * brake * ds[i]));
  }
  const segments = ds.map((d, i) => segmentSeconds(d, speeds[i], speeds[i + 1], accel, brake, segmentCaps[i]));
  const seconds = segments.reduce((sum, segment) => sum + segment.seconds, 0);
  if (!Number.isFinite(seconds)) throw new RangeError('Numeric envelope exceeded');
  return {
    speeds, segmentCaps, segments, seconds,
    averageSpeed: (samples.at(-1).s - samples[0].s) / seconds,
    entryFeasible: Math.abs(entry - speeds[0]) <= 1e-8 * Math.max(1, entry),
    exitFeasible: Math.abs(exit - speeds.at(-1)) <= 1e-8 * Math.max(1, exit),
    requestedEntrySpeed: entry,
    requestedExitSpeed: exit,
  };
}
