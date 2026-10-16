// Small browser/Node-safe seam for probes that wait for the public flight handoff. The game
// publishes the failure on its bus before returning to the menu; preserving that payload gives a
// diagnostic the real readiness stage instead of making it wait for the outer flight deadline.

function jsonSafe(value) {
  if (value == null) return value;
  try { return JSON.parse(JSON.stringify(value)); } catch { return String(value); }
}

export function normalizeFlightStartFailure(payload) {
  const copied = jsonSafe(payload);
  const source = copied && typeof copied === 'object' && !Array.isArray(copied)
    ? copied
    : { error: copied == null ? 'game:startFailed' : String(copied) };
  const stage = typeof source.stage === 'string' ? source.stage
    : typeof source.phase === 'string' ? source.phase : null;
  const code = typeof source.code === 'string' ? source.code : null;
  const message = typeof source.message === 'string' ? source.message
    : typeof source.error === 'string' ? source.error
      : typeof source.text === 'string' ? source.text : null;
  return {
    ...source,
    stage,
    phase: typeof source.phase === 'string' ? source.phase : stage,
    code,
    message,
  };
}

export function flightStartFailureError(payload, mode = null) {
  const failure = normalizeFlightStartFailure(payload);
  const phase = failure.stage || failure.phase || 'unknown';
  const code = failure.code || 'GAME_START_FAILED';
  const message = failure.message || failure.text || 'The game could not enter flight.';
  const error = new Error(`game:startFailed before flight (phase=${phase}, code=${code}): ${message}`);
  error.name = 'FlightStartFailure';
  error.flightFailure = failure;
  error.flightMode = mode;
  return error;
}

/**
 * Browser-side installer passed directly to Playwright's page.evaluate(). Keep this function
 * self-contained: historical source overlays may not contain newly added probe helpers, and a
 * diagnostic observer must never create a module request or console 404 of its own. The page keeps
 * the raw event; the Node-side normalizer above formats it when the wait loop reads it.
 */
export function installFlightStartFailureObserver() {
  const key = '__SF_PROFILE_FLIGHT_FAILURE_WATCH__';
  try { globalThis[key]?.dispose?.(); } catch { /* a prior route may have torn down its bus */ }

  const bus = globalThis.SF?.bus;
  let failure = null;
  let unsubscribe = null;
  let installed = false;
  try {
    if (bus && typeof bus.on === 'function') {
      unsubscribe = bus.on('game:startFailed', (payload) => {
        if (failure === null) failure = payload;
      });
      installed = true;
    }
  } catch { /* an already-tearing-down route may reject a new subscription */ }
  globalThis[key] = {
    read: () => failure,
    dispose: () => {
      if (!unsubscribe) return;
      const off = unsubscribe;
      unsubscribe = null;
      try { off(); } catch { /* the bus may already be gone */ }
    },
  };
  return { installed };
}

/** Subscribe to one launch attempt. Call dispose when the route reaches flight or exits. */
export function watchFlightStartFailure(bus) {
  let failure = null;
  const unsubscribe = bus && typeof bus.on === 'function'
    ? bus.on('game:startFailed', (payload) => {
      if (failure === null) failure = normalizeFlightStartFailure(payload);
    })
    : null;
  return {
    read: () => failure,
    dispose: () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    },
  };
}
