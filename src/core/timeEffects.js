// Sole owner of the runtime time-scale scalar. Independent systems request an upper bound and the
// lowest active request wins, so clearing one effect can never erase another system's pause or
// slow-time. Requests are transient runtime state and are intentionally absent from save data.
//
// Two channels:
//   { scale }    — [0, 1], the original slow/pause bound. Adventure and every existing caller use
//                  this. assertScale still throws outside [0, 1].
//   { labSpeed } — [1, LAB_SPEED_MAX], extra speed only while a Lab run is live. The simulation
//                  always steps LOOP_FIXED_DT; a multiplier above 1 is more 60 Hz steps per frame,
//                  never a larger dt (see advanceFixedTimestep in src/core/simulationRunner.js).
//                  LAB_SPEED_MAX equals MAX_CATCHUP_STEPS in that file so a 4x request cannot ask
//                  for more steps than the runner will admit.
// Effective scale is min(scale requests, default 1) * min(labSpeed requests, default 1). A pause
// (0) still beats any speed-up because 0 * 4 === 0. labSpeed above 1 is clamped to 1 when no live
// Lab session is present (state.run.kind === 'lab' && phase !== 'inactive'); the gate is re-read
// on every applyMinimum recompute, not only at request time.

const SERVICE_BY_STATE = new WeakMap();

// Ceiling matches MAX_CATCHUP_STEPS in src/core/simulationRunner.js: the runner never takes more
// than four fixed 60 Hz steps in one presentation frame, so a Lab speed above 4 cannot produce
// extra work and would only shed backlog.
export const LAB_SPEED_MAX = 4;

function assertState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('time-effects state must be an object');
  }
}

function assertSource(source) {
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new TypeError('time-effects source must be a nonempty string');
  }
}

function assertScale(scale) {
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale < 0 || scale > 1) {
    throw new RangeError('time-effects scale must be a finite number in [0, 1]');
  }
}

function assertLabSpeed(labSpeed) {
  if (typeof labSpeed !== 'number' || !Number.isFinite(labSpeed) || labSpeed < 1 || labSpeed > LAB_SPEED_MAX) {
    throw new RangeError('time-effects labSpeed must be a finite number in [1, 4]');
  }
}

function hasOwn(object, key) {
  return !!object && Object.prototype.hasOwnProperty.call(object, key);
}

function isLiveLabRun(state) {
  const run = state && state.run;
  return !!(run && run.kind === 'lab' && run.phase !== 'inactive');
}

export function createTimeEffects(state) {
  assertState(state);
  const existing = SERVICE_BY_STATE.get(state);
  if (existing) return existing;

  const requests = new Map();
  let effectiveScale = 1;
  if (state.timeScale !== effectiveScale) state.timeScale = effectiveScale;

  function applyMinimum() {
    let minScale = 1;
    let minLabSpeed = 1;
    let sawLabSpeed = false;
    const labLive = isLiveLabRun(state);
    requests.forEach((request) => {
      if (typeof request.scale === 'number' && request.scale < minScale) minScale = request.scale;
      // labSpeed lives in [1, 4], so the empty-set default of 1 cannot be a running min —
      // the first live request must seed it, then later requests may only lower it.
      if (labLive && typeof request.labSpeed === 'number') {
        if (!sawLabSpeed || request.labSpeed < minLabSpeed) minLabSpeed = request.labSpeed;
        sawLabSpeed = true;
      }
    });
    const next = minScale * minLabSpeed;
    effectiveScale = next;
    if (state.timeScale !== next) state.timeScale = next;
    return next;
  }

  const service = {
    set(source, request) {
      assertSource(source);
      const hasScale = hasOwn(request, 'scale');
      const hasLabSpeed = hasOwn(request, 'labSpeed');
      if (!hasScale && !hasLabSpeed) {
        throw new RangeError('time-effects scale must be a finite number in [0, 1]');
      }
      if (hasScale) assertScale(request.scale);
      if (hasLabSpeed) assertLabSpeed(request.labSpeed);
      const stored = {};
      if (hasScale) stored.scale = request.scale;
      if (hasLabSpeed) stored.labSpeed = request.labSpeed;
      requests.set(source, stored);
      return applyMinimum();
    },

    clear(source) {
      assertSource(source);
      requests.delete(source);
      return applyMinimum();
    },

    reset() {
      requests.clear();
      effectiveScale = 1;
      if (state.timeScale !== 1) state.timeScale = 1;
      return effectiveScale;
    },

    getEffectiveScale() {
      return applyMinimum();
    },
  };

  SERVICE_BY_STATE.set(state, service);
  return service;
}
