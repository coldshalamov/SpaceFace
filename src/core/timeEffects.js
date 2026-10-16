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

import { laneTimeEffectsSnapshot } from './simLaneCommands.js';

const SERVICE_BY_STATE = new WeakMap();
const BRIDGE_BY_STATE = new WeakMap();

// Ceiling matches MAX_CATCHUP_STEPS in src/core/simulationRunner.js: the runner never takes more
// than four fixed 60 Hz steps in one presentation frame, so a Lab speed above 4 cannot produce
// extra work and would only shed backlog.
export const LAB_SPEED_MAX = 4;

export function readTimeEffectsRequests(state) {
  return SERVICE_BY_STATE.get(state)?.describeRequests() || {};
}

// Only requests authored in this realm cross the boundary. Mirrored requests participate in
// composition but are never exported again, so a released effect cannot feed back into itself.
export function readLocalTimeEffectsSnapshot(state) {
  return BRIDGE_BY_STATE.get(state)?.snapshot() || null;
}

export function applyRemoteTimeEffectsSnapshot(state, origin, snapshot) {
  createTimeEffects(state);
  return BRIDGE_BY_STATE.get(state).receive(origin, snapshot);
}

export function setTimeEffectsGeneration(state, generation) {
  return BRIDGE_BY_STATE.get(state)?.setGeneration(generation) || false;
}

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
  const remoteRequests = new Map();
  let generation = 0;
  let revision = 0;
  let snapshot = Object.freeze({ generation, revision, requests: Object.freeze({}) });
  let effectiveScale = 1;
  if (state.timeScale !== effectiveScale) state.timeScale = effectiveScale;

  function applyMinimum() {
    let minScale = 1;
    let minLabSpeed = 1;
    let sawLabSpeed = false;
    const labLive = isLiveLabRun(state);
    const visit = (request) => {
      if (typeof request.scale === 'number' && request.scale < minScale) minScale = request.scale;
      // labSpeed lives in [1, 4], so the empty-set default of 1 cannot be a running min —
      // the first live request must seed it, then later requests may only lower it.
      if (labLive && typeof request.labSpeed === 'number') {
        if (!sawLabSpeed || request.labSpeed < minLabSpeed) minLabSpeed = request.labSpeed;
        sawLabSpeed = true;
      }
    };
    requests.forEach(visit);
    remoteRequests.forEach((remote) => remote.requests.forEach(visit));
    const next = minScale * minLabSpeed;
    effectiveScale = next;
    if (state.timeScale !== next) state.timeScale = next;
    return next;
  }

  function publishLocal() {
    const local = {};
    requests.forEach((request, source) => { local[source] = Object.freeze({ ...request }); });
    snapshot = Object.freeze({ generation, revision: ++revision, requests: Object.freeze(local) });
    laneTimeEffectsSnapshot(snapshot);
  }

  BRIDGE_BY_STATE.set(state, {
    snapshot: () => snapshot,
    setGeneration(next) {
      if (!Number.isSafeInteger(next) || next <= generation) return false;
      generation = next;
      // A fresh snapshot from the other realm re-establishes its still-live requests. Old
      // lifecycle replies cannot resurrect an effect after a resume or a new route boundary.
      remoteRequests.clear();
      publishLocal();
      applyMinimum();
      return true;
    },
    receive(origin, incoming) {
      assertSource(origin);
      if (!incoming || !Number.isSafeInteger(incoming.generation)
        || !Number.isSafeInteger(incoming.revision) || incoming.revision < 0 || incoming.generation < generation
        || !incoming.requests || typeof incoming.requests !== 'object'
        || Array.isArray(incoming.requests)) return false;
      const previous = remoteRequests.get(origin);
      if (previous && (incoming.generation < previous.generation
        || (incoming.generation === previous.generation && incoming.revision <= previous.revision))) {
        // Run membership may have changed independently of the request revision (Lab speed).
        applyMinimum();
        return false;
      }
      const received = new Map();
      for (const [source, request] of Object.entries(incoming.requests)) {
        assertSource(source);
        if (!request || (!hasOwn(request, 'scale') && !hasOwn(request, 'labSpeed'))) return false;
        if (hasOwn(request, 'scale')) assertScale(request.scale);
        if (hasOwn(request, 'labSpeed')) assertLabSpeed(request.labSpeed);
        received.set(source, { ...request });
      }
      remoteRequests.set(origin, { generation: incoming.generation, revision: incoming.revision, requests: received });
      applyMinimum();
      return true;
    },
  });

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
      const previous = requests.get(source);
      requests.set(source, stored);
      if (!previous || previous.scale !== stored.scale || previous.labSpeed !== stored.labSpeed) publishLocal();
      return applyMinimum();
    },

    clear(source) {
      assertSource(source);
      if (requests.delete(source)) publishLocal();
      return applyMinimum();
    },

    reset() {
      if (requests.size > 0) {
        requests.clear();
        publishLocal();
      }
      // The other realm still owns its holds. A sim run reset must not release the loading
      // veil or a modal which presentation has not closed yet.
      return applyMinimum();
    },

    getEffectiveScale() {
      return applyMinimum();
    },

    // Diagnostic surface for the runtime witness / soak probes: a scale-0 freeze is only
    // actionable if the caller can see which source still holds its request.
    describeRequests() {
      const out = {};
      requests.forEach((request, source) => { out[source] = { ...request }; });
      remoteRequests.forEach((remote, origin) => remote.requests.forEach((request, source) => {
        out[Object.prototype.hasOwnProperty.call(out, source) ? `${origin}:${source}` : source] = { ...request };
      }));
      return out;
    },
  };

  SERVICE_BY_STATE.set(state, service);
  return service;
}
