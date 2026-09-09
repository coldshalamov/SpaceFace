// Honest CPU phase clocks for the real bloom/HDR present path.
//
// Default play does not start these clocks. Probes and tests pass `enabled: true`.
// GPU timestamps stay in gpuTimers.js; this module only names CPU bills so an
// A/B can say whether sim, prep, submit, present, UI, or VFX grew.

export const PRESENT_PHASES = Object.freeze([
  'sim',
  'prep',
  'submit',
  'present',
  'ui',
  'vfx',
  'admission',
]);

function nowMs(now) {
  if (typeof now === 'function') return now();
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export function createPresentPhaseClock(options = {}) {
  const enabled = options.enabled === true;
  const clockNow = options.now;
  const totals = Object.create(null);
  const last = Object.create(null);
  for (const name of PRESENT_PHASES) {
    totals[name] = 0;
    last[name] = 0;
  }
  return {
    enabled,
    frames: 0,
    totals,
    last,
    now: () => nowMs(clockNow),
  };
}

export function measurePresentPhase(clock, name, work) {
  if (!clock || typeof work !== 'function') {
    return typeof work === 'function' ? work() : undefined;
  }
  if (clock.enabled !== true || !Object.prototype.hasOwnProperty.call(clock.totals, name)) {
    return work();
  }
  const start = clock.now();
  try {
    return work();
  } finally {
    const spent = Math.max(0, clock.now() - start);
    clock.totals[name] += spent;
    clock.last[name] = spent;
  }
}

export function endPresentPhaseFrame(clock) {
  if (!clock) return null;
  clock.frames += 1;
  return { ...clock.last };
}

export function presentPhaseReport(clock) {
  const frames = clock && clock.frames > 0 ? clock.frames : 0;
  const averages = {};
  const last = {};
  for (const name of PRESENT_PHASES) {
    const total = clock ? clock.totals[name] : 0;
    averages[name] = frames ? total / frames : 0;
    last[name] = clock ? clock.last[name] : 0;
  }
  return { frames, averages, last };
}
