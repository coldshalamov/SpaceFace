// Sole owner of the runtime time-scale scalar. Independent systems request an upper bound and the
// lowest active request wins, so clearing one effect can never erase another system's pause or
// slow-time. Requests are transient runtime state and are intentionally absent from save data.

const SERVICE_BY_STATE = new WeakMap();

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

export function createTimeEffects(state) {
  assertState(state);
  const existing = SERVICE_BY_STATE.get(state);
  if (existing) return existing;

  const requests = new Map();
  let effectiveScale = 1;
  let pendingMinimum = 1;
  if (state.timeScale !== effectiveScale) state.timeScale = effectiveScale;

  function visitScale(scale) {
    if (scale < pendingMinimum) pendingMinimum = scale;
  }

  function applyMinimum() {
    pendingMinimum = 1;
    requests.forEach(visitScale);
    const next = pendingMinimum;
    effectiveScale = next;
    if (state.timeScale !== next) state.timeScale = next;
    return next;
  }

  const service = {
    set(source, request) {
      assertSource(source);
      const scale = request && request.scale;
      assertScale(scale);
      requests.set(source, scale);
      return applyMinimum();
    },

    clear(source) {
      assertSource(source);
      if (!requests.delete(source)) return effectiveScale;
      return applyMinimum();
    },

    reset() {
      requests.clear();
      effectiveScale = 1;
      if (state.timeScale !== 1) state.timeScale = 1;
      return effectiveScale;
    },

    getEffectiveScale() {
      return effectiveScale;
    },
  };

  SERVICE_BY_STATE.set(state, service);
  return service;
}
