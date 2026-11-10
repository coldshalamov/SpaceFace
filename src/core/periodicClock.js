export const MAX_PERIODIC_STEPS = 4;

export function consumePeriodicClock(accumulator, dt, period, { epsilon = 0 } = {}) {
  if (!Number.isFinite(period) || !(period > 0)) {
    throw new RangeError(`consumePeriodicClock requires a finite positive period, got ${period}`);
  }
  if (!Number.isFinite(dt) || dt < 0) {
    throw new RangeError(`consumePeriodicClock requires a finite non-negative dt, got ${dt}`);
  }
  if (!Number.isFinite(epsilon) || epsilon < 0) {
    throw new RangeError(`consumePeriodicClock requires a finite non-negative epsilon, got ${epsilon}`);
  }
  if (!Number.isFinite(accumulator) || accumulator < -epsilon) {
    throw new RangeError(
      `consumePeriodicClock requires a finite accumulator >= ${-epsilon}, got ${accumulator}`);
  }
  let total = accumulator + dt;
  if (!Number.isFinite(total)
    || !Number.isSafeInteger(Math.floor(Math.max(0, total) / period))) {
    throw new RangeError(
      `consumePeriodicClock cannot bound pending work: ${accumulator} + ${dt} over ${period}s`);
  }
  let steps = 0;
  while (steps < MAX_PERIODIC_STEPS && total + epsilon >= period) {
    const next = total - period;
    if (next === total) {
      throw new RangeError(
        `consumePeriodicClock cannot advance: ${total} - ${period} makes no progress`);
    }
    total = next;
    steps++;
  }
  return { steps, accumulator: total };
}

export function normalizePeriodicAccumulator(value, period) {
  if (!Number.isFinite(period) || !(period > 0)) {
    throw new RangeError(`normalizePeriodicAccumulator requires a finite positive period, got ${period}`);
  }
  if (!Number.isFinite(value) || value < 0) return 0;
  const due = Math.floor(value / period);
  if (Number.isSafeInteger(due) && value - period !== value) return value;
  return value % period;
}
