// Deterministic event trace for slice evidence.
//
// This is not analytics and it does not use wall-clock time. It records selected gameplay,
// presentation, and narrative bus events with tick/simTime so replays and browser probes can compare
// current behavior against the 47-A golden tape/telemetry envelope.

export const DEFAULT_TRACE_EVENTS = Object.freeze([
  'flight:modeChanged',
  'ship:thrust',
  'ship:boostStart',
  'ship:boostStop',
  'combat:fire',
  'combat:damage',
  'combat:subsystemDisabled',
  'combat:beamStop',
  'projectile:hit',
  'entity:killed',
  'player:death',
  'player:respawn',
  'ai:stateChange',
  'economy:tick',
  'economy:tradeCompleted',
  'credits:changed',
  'scenario:loaded',
  'scenario:factsInitialized',
  'scenario:actorBindings',
  'scenario:beatEntered',
  'scenario:factChanged',
  'scenario:branchResolved',
  'tether:attached',
  'tether:reel',
  'tether:broken',
  'story:beatAdvanced',
  'comms:popup',
  'graffiti:show',
  'hud:phase',
  'hud:tagFlicker',
  'camera:shake',
  'presentation:cue',
  'presentation:cueSuppressed',
  'intervention:available',
  'mission:accepted',
  'mission:completed',
  'mission:failed',
  'jump:chargeStart',
  'jump:arrive',
]);

const DEFAULT_CAP = 5000;

export function createDeterministicEventTrace(bus, state, options = {}) {
  if (!bus || typeof bus.on !== 'function') throw new TypeError('event trace requires a bus');
  const events = Array.isArray(options.events) && options.events.length ? options.events : DEFAULT_TRACE_EVENTS;
  const cap = Math.max(1, Math.floor(options.cap || DEFAULT_CAP));
  const records = [];
  let seq = 0;
  const unsubs = events.map((type) => bus.on(type, (payload) => {
    records.push({
      seq: seq++,
      tick: state && Number.isFinite(state.tick) ? state.tick : 0,
      simTime: round6(state && state.simTime),
      type,
      payload: sanitizePayload(payload),
    });
    if (records.length > cap) records.splice(0, records.length - cap);
  }));

  return {
    name: 'eventTrace',
    events: events.slice(),
    clear() { records.length = 0; seq = 0; },
    snapshot() { return records.map((r) => sanitizePayload(r)); },
    dispose() {
      while (unsubs.length) {
        const unsub = unsubs.pop();
        try { unsub(); } catch (_err) {}
      }
    },
  };
}

function sanitizePayload(value, depth = 0) {
  if (value == null) return value;
  if (depth > 5) return '[depth]';
  const t = typeof value;
  if (t === 'number') return round6(value);
  if (t === 'string' || t === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 40).map((v) => sanitizePayload(v, depth + 1));
  if (t === 'object') {
    if (value.isVector3 || (typeof value.x === 'number' && typeof value.z === 'number' && Object.keys(value).length <= 4)) {
      return { x: round6(value.x), z: round6(value.z) };
    }
    if (value.isObject3D || value.isMesh || value instanceof Map || value instanceof Set) return undefined;
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      const v = sanitizePayload(value[key], depth + 1);
      if (v !== undefined) out[key] = v;
    }
    return out;
  }
  return undefined;
}

function round6(value) {
  return Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : 0;
}
