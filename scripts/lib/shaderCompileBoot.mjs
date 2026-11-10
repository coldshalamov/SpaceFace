// Boot-phase helpers for scripts/check-shader-compile.mjs.
//
// The shader gate boots New Game -> flight before it reads GL programs. When the game's own
// startup fails (e.g. the opening first-picture admission times out on a slow software-GL runner),
// the game logs it and never enters flight. Without this, the gate sat out its full 180 s flight
// wait and reported a bare `waitForFunction` timeout that looked like a shader-compile hang.

const STARTUP_FAILED = /\[SpaceFace\] new game startup failed\b/;

/** Returns a one-line reason when a console line reports a failed New Game startup, else null. */
export function startupFailureFromConsole(text) {
  if (typeof text !== 'string' || !STARTUP_FAILED.test(text)) return null;
  return text.split('\n')[0].replace(/\s+/g, ' ').trim().slice(0, 400);
}

/** Phase stopwatch: `mark(name)` records ms since the previous mark; `summary()` prints them. */
export function createPhaseClock(now = () => Date.now()) {
  const phases = [];
  let last = now();
  return {
    mark(name) { const t = now(); phases.push({ name, ms: t - last }); last = t; },
    phases: () => phases.slice(),
    summary: () => phases.map((p) => `${p.name}=${(p.ms / 1000).toFixed(1)}s`).join(' '),
  };
}

/**
 * Resolves when `waitPromise` resolves; rejects as soon as `failure.reason` is set (polled), so a
 * game that has already reported a failed startup ends the wait immediately with that reason.
 */
export function raceStartupFailure(waitPromise, failure, { pollMs = 250 } = {}) {
  let timer = null;
  const failed = new Promise((_, reject) => {
    const tick = () => {
      if (failure.reason) {
        const error = new Error(`game startup failed before flight: ${failure.reason}`);
        error.code = 'SF_STARTUP_FAILED';
        reject(error);
        return;
      }
      timer = setTimeout(tick, pollMs);
    };
    tick();
  });
  return Promise.race([waitPromise, failed]).finally(() => { if (timer) clearTimeout(timer); });
}
