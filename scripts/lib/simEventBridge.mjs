// simEventBridge.mjs — stage 2 deep-flat event bridge.
//
// Every sim-emitted event projected onto the wire must be structuredClone-safe.
// The bridge applies a depth-bounded flat projection: cloneable scalars pass
// through (undefined included — structuredClone preserves it), arrays/objects
// flatten recursively to depth EVENT_BRIDGE_DEPTH, and live sim objects
// (entities/rows — anything carrying pos/vel/alive markers plus a numeric id)
// collapse to { entityRef: <id> } tokens the main-side read model resolves.
// Payloads whose live members don't project cleanly (non-plain objects like the
// cargo singleton's Map-backed store) get explicit per-type adapters; a payload
// that still can't flatten is dropped — classified 'unintentional' only when
// nothing explains the rejection (adapter-fallback is always unintentional:
// the adapter exists and still failed).

export const EVENT_BRIDGE_DEPTH = 4;

// Presentation-lane types: on the real architecture these drain through main's
// presentationQueue rather than dispatching synchronously at tick receipt.
export const PRESENTATION_LANE_TYPES = new Set([
  'presentation:cue', 'presentation:cueApplied', 'presentation:cueSuppressed',
  'presentation:vfxCue', 'presentation:audioCue', 'presentation:uiCue',
  'presentation:cameraCue', 'presentation:caption', 'audio:cue', 'alert',
  'camera:shake',
]);

const REJECT = Symbol('sf.bridge.reject');

export function isSimObjectRef(value) {
  return !!(value && typeof value === 'object'
    && Number.isFinite(value.id)
    && ('pos' in value || 'vel' in value || 'alive' in value));
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function flattenEventPayload(value, depth = 0, hits = null, path = '') {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === 'number') return Number.isFinite(value) ? value : 0;
  if (t === 'string' || t === 'boolean' || t === 'bigint') return value;
  if (isSimObjectRef(value)) return { entityRef: value.id };
  if (t === 'object' && depth >= EVENT_BRIDGE_DEPTH) {
    if (hits) { hits.depth += 1; hits.path = hits.path || path || '(root)'; }
    return REJECT;
  }
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i++) {
      const flat = flattenEventPayload(value[i], depth + 1, hits, `${path}[${i}]`);
      if (flat === REJECT) return REJECT;
      out[i] = flat;
    }
    return out;
  }
  if (t === 'object') {
    if (!isPlainObject(value)) {
      // Vector-like leaf (THREE.Vector2/3/4 and friends): a non-plain object
      // whose only keys are numeric x/y/z/w — project to plain coords. The
      // semantic is a point/quat, which is cloneable.
      const keys = Object.keys(value);
      const veclike = keys.length >= 2 && keys.length <= 4
        && keys.every((k) => (k === 'x' || k === 'y' || k === 'z' || k === 'w') && Number.isFinite(value[k]));
      if (veclike) {
        const v = {};
        for (const k of keys) v[k] = value[k];
        return v;
      }
      if (hits) {
        hits.typed += 1;
        hits.path = hits.path || path || '(root)';
        hits.ctor = value.constructor && value.constructor.name || '(anonymous)';
      }
      return REJECT;
    }
    const out = {};
    for (const key of Object.keys(value)) {
      const flat = flattenEventPayload(value[key], depth + 1, hits, path ? `${path}.${key}` : key);
      if (flat === REJECT) return REJECT;
      out[key] = flat;
    }
    return out;
  }
  if (hits) { hits.typed += 1; hits.path = hits.path || path || '(root)'; hits.ctor = `typeof:${t}`; }
  return REJECT;
}

// Per-type adapters for payloads that carry non-entity live objects the generic
// projection cannot flatten. Adapters return the complete wire shape; returning
// undefined falls back to the generic deep-flat path.
export const EVENT_BRIDGE_ADAPTERS = {
  // entity:spawned carries the live entity — consumers resolve it via the
  // main-side read model by entityId (the spawn already rode the journal).
  'entity:spawned': (p) => (p && typeof p === 'object'
    ? { id: p.id ?? null, type: p.type ?? null, entityId: (p.entity && p.entity.id) ?? null }
    : undefined),
  // cargo:changed carries the live cargo singleton (Map-backed; not
  // deep-flattenable). The volume/mass scalars are what listeners read.
  'cargo:changed': (p) => (p && typeof p === 'object'
    ? { usedU: Number.isFinite(p.usedU) ? p.usedU : 0, massT: Number.isFinite(p.massT) ? p.massT : 0 }
    : undefined),
};

/**
 * Project one emitted event onto the wire.
 * Returns { flat, lane, dropped, unintentional, reason, hits } — flat is the
 * cloneable payload (or null when dropped). reason is 'adapter' | 'flat' on
 * success and 'unflattenable' | 'adapter-fallback' on a drop. unintentional is
 * true when the payload rejected with no classified cause (or an adapter fell
 * back) — the stage-2 gate requires unintentional === 0 across a run.
 */
export function projectBridgeEvent(type, payload) {
  const lane = PRESENTATION_LANE_TYPES.has(type) ? 'presentation' : 'sim';
  const adapter = EVENT_BRIDGE_ADAPTERS[type];
  if (adapter) {
    const adapted = adapter(payload);
    if (adapted !== undefined) return { flat: adapted, lane, dropped: false, unintentional: false, reason: 'adapter', hits: null };
  }
  const hits = { depth: 0, typed: 0, path: null, ctor: null };
  const flat = flattenEventPayload(payload, 0, hits);
  if (flat === REJECT) {
    // A drop is unintentional only when nothing explains it: an adapter that
    // fell through to the generic path, or a rejection with no classified
    // leaf (defensive — the flattener always stamps a cause on REJECT).
    const unintentional = !!adapter || (hits.depth === 0 && hits.typed === 0);
    return {
      flat: null, lane, dropped: true,
      unintentional,
      reason: adapter ? 'adapter-fallback' : 'unflattenable',
      hits,
    };
  }
  return { flat: flat === undefined ? null : flat, lane, dropped: false, unintentional: false, reason: 'flat', hits };
}
