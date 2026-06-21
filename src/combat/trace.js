const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const DEFAULT_CAPACITY = 4096;

export function ensureCombatTrace(combat, capacity = DEFAULT_CAPACITY) {
  if (!combat.trace || typeof combat.trace !== 'object') combat.trace = {};
  const trace = combat.trace;
  if (!Number.isInteger(trace.nextSeq) || trace.nextSeq < 1) trace.nextSeq = 1;
  if (!Number.isInteger(trace.capacity) || trace.capacity < 1) trace.capacity = capacity;
  if (!Array.isArray(trace.events)) trace.events = [];
  if (!Number.isInteger(trace.dropped) || trace.dropped < 0) trace.dropped = 0;
  if (!Number.isInteger(trace.hashU32)) trace.hashU32 = FNV_OFFSET;
  trace.digest = hex32(trace.hashU32);
  return trace;
}

export function appendCombatTrace(combat, tick, kind, fields = {}) {
  const trace = ensureCombatTrace(combat);
  const event = canonicalize({ seq: trace.nextSeq++, tick: integerTick(tick), kind, ...fields });
  const encoded = stableStringify(event) + '\n';
  trace.hashU32 = fnv1a(encoded, trace.hashU32);
  trace.digest = hex32(trace.hashU32);
  event.digest = trace.digest;
  trace.events.push(event);
  if (trace.events.length > trace.capacity) {
    const excess = trace.events.length - trace.capacity;
    trace.events.splice(0, excess);
    trace.dropped += excess;
  }
  return event;
}

export function readCombatTrace(combat, options = {}) {
  const trace = ensureCombatTrace(combat);
  const sinceSeq = Number.isInteger(options.sinceSeq) ? options.sinceSeq : 0;
  const kinds = options.kinds ? new Set(options.kinds) : null;
  const actorId = options.actorId;
  const targetId = options.targetId;
  const limit = Number.isInteger(options.limit) && options.limit >= 0 ? options.limit : trace.capacity;
  const out = [];
  for (const event of trace.events) {
    if (event.seq <= sinceSeq) continue;
    if (kinds && !kinds.has(event.kind)) continue;
    if (actorId != null && event.actorId !== actorId) continue;
    if (targetId != null && event.targetId !== targetId) continue;
    out.push(event);
    if (out.length >= limit) break;
  }
  return {
    schemaVersion: 1,
    nextSeq: trace.nextSeq,
    dropped: trace.dropped,
    digest: trace.digest,
    events: out.map((event) => canonicalize(event)),
  };
}

export function canonicalize(value) {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value);
    const rounded = Math.round(value * 1e6) / 1e6;
    return Object.is(rounded, -0) ? 0 : rounded;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Map) {
    return [...value.entries()]
      .sort(([a], [b]) => compareText(String(a), String(b)))
      .map(([key, item]) => [canonicalize(key), canonicalize(item)]);
  }
  if (value instanceof Set) return [...value].map(canonicalize).sort(compareCanonical);
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined && typeof value[key] !== 'function') out[key] = canonicalize(value[key]);
    }
    return out;
  }
  return String(value);
}

export function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function fnv1a(text, seed) {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

function hex32(value) {
  return (value >>> 0).toString(16).padStart(8, '0');
}

function integerTick(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function compareCanonical(a, b) {
  const aa = stableStringify(a);
  const bb = stableStringify(b);
  return aa < bb ? -1 : aa > bb ? 1 : 0;
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
