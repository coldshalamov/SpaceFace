// Canonical headless snapshot helpers for replay/audit tooling.
//
// This is intentionally small: it snapshots the authoritative state surface that current Phase 0
// headless runs can prove, without pretending to be the full SG-01 rollback/snapshot contract.

const OMIT_KEYS = new Set([
  'entities',
  'entityList',
  'entityIndex',
  'spatialHash',
  'render',
  'vfx',
  'audioRuntime',
  'perfRuntime',
  'rng',
  'save',
]);

// state.input.actions holds EDGE-TRIGGERED verb flags (tetherFire, chargeDetonate, …) recomputed
// from held keys every tick by systems/input.js. They are derived, one-tick state: snapshotting
// them would (a) drift replay hashes on input-contract growth and (b) re-fire an action on
// restore. Excluded by design (GDD 2.0 input contract).
function snapshotInput(input) {
  if (!input || typeof input !== 'object') return input;
  const out = {};
  for (const k of Object.keys(input)) {
    if (k === 'actions') continue;
    out[k] = input[k];
  }
  return out;
}

/**
 * Stable, browser-safe FNV-1a hash of canonical snapshot text. Replay-ring-local; the lab
 * checkpoint sha256 remains the cross-agent hash authority.
 */
export function hashCanonicalText(text) {
  const payload = text == null ? '' : String(text);
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Bounded fixed-tick ring of canonical sim snapshots for replay (PQ-160.00).
 *
 * Capacity = windowSeconds * tickRate (30 s at 60 Hz = 1800). Slots are reused, never reallocated,
 * and the byte ceiling evicts the oldest frame rather than growing without bound (≤ 24 MB default).
 * Entries store canonical snapshot text so a reader can scrub poses and re-hash without retaining a
 * live state graph.
 */
export function createSimSnapshotRingBuffer(options = {}) {
  const tickRate = Number.isFinite(options.tickRate) && options.tickRate > 0 ? options.tickRate : 60;
  const seconds = Number.isFinite(options.seconds) && options.seconds > 0 ? options.seconds : 30;
  const capacity = Math.max(1, Math.floor(
    Number.isFinite(options.capacity) && options.capacity > 0
      ? options.capacity
      : Math.round(seconds * tickRate),
  ));
  const maxBytes = Math.max(1024, Math.floor(
    Number.isFinite(options.maxBytes) && options.maxBytes > 0
      ? options.maxBytes
      : 24 * 1024 * 1024,
  ));
  const slots = Array.from({ length: capacity }, () => ({
    tick: -1,
    hashHex: null,
    bytes: 0,
    text: null,
  }));
  let write = 0;
  let size = 0;
  let recorded = 0;
  let overwritten = 0;
  let evicted = 0;
  let totalBytes = 0;
  let peakBytes = 0;

  function slotAt(offsetFromNewest) {
    return slots[(write - 1 - offsetFromNewest + capacity * 2) % capacity];
  }

  function release(slot) {
    if (slot.bytes) totalBytes -= slot.bytes;
    slot.text = null;
    slot.bytes = 0;
    slot.hashHex = null;
    slot.tick = -1;
  }

  function dropOldest() {
    if (size <= 0) return;
    const index = (write - size + capacity * 2) % capacity;
    release(slots[index]);
    size -= 1;
    evicted += 1;
  }

  function recordText(text, tick, meta = {}) {
    const value = text == null ? '' : String(text);
    if (size >= capacity) {
      dropOldest();
      overwritten += 1;
    }
    const slot = slots[write];
    if (slot.bytes) totalBytes -= slot.bytes;
    slot.text = value;
    slot.bytes = value.length;
    slot.tick = Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : recorded;
    slot.hashHex = meta && meta.hashHex ? String(meta.hashHex) : hashCanonicalText(value);
    totalBytes += slot.bytes;
    if (totalBytes > peakBytes) peakBytes = totalBytes;
    write = (write + 1) % capacity;
    size += 1;
    recorded += 1;
    while (totalBytes > maxBytes && size > 1) dropOldest();
    return slot.tick;
  }

  function record(state, tick) {
    return recordText(canonicalStringify(snapshotSimState(state)), tick);
  }

  function recordSnapshot(snapshot, tick, meta = {}) {
    return recordText(canonicalStringify(snapshot), tick, meta);
  }

  function get(tick) {
    const t = Number.isFinite(tick) ? Math.floor(tick) : -1;
    for (let i = 0; i < size; i++) {
      const slot = slotAt(i);
      if (slot.tick === t) return slot;
    }
    return null;
  }

  function hashAt(tick) {
    const slot = get(tick);
    return slot ? slot.hashHex : null;
  }

  function newest() { return size > 0 ? slotAt(0) : null; }
  function oldest() { return size > 0 ? slotAt(size - 1) : null; }

  function forEach(fn) {
    if (typeof fn !== 'function') return;
    for (let i = size - 1; i >= 0; i--) {
      const slot = slotAt(i);
      fn(slot, slot.tick);
    }
  }

  function hashList() {
    const out = [];
    forEach((slot) => out.push({ tick: slot.tick, hash: slot.hashHex }));
    return out;
  }

  function clear() {
    for (const slot of slots) release(slot);
    write = 0;
    size = 0;
    recorded = 0;
    overwritten = 0;
    evicted = 0;
    totalBytes = 0;
    peakBytes = 0;
  }

  return {
    capacity,
    tickRate,
    windowSeconds: capacity / tickRate,
    maxBytes,
    record,
    recordText,
    recordSnapshot,
    get,
    hashAt,
    newest,
    oldest,
    forEach,
    hashList,
    clear,
    get size() { return size; },
    get recorded() { return recorded; },
    get overwritten() { return overwritten; },
    get evicted() { return evicted; },
    get estimatedBytes() { return totalBytes; },
    get peakBytes() { return peakBytes; },
    get windowTicks() {
      const first = oldest();
      const last = newest();
      return first && last ? Math.max(0, last.tick - first.tick) : 0;
    },
    diagnostics() {
      const first = oldest();
      const last = newest();
      return {
        capacity,
        tickRate,
        windowSeconds: capacity / tickRate,
        maxBytes,
        size,
        recorded,
        overwritten,
        evicted,
        estimatedBytes: totalBytes,
        peakBytes,
        firstTick: first ? first.tick : -1,
        lastTick: last ? last.tick : -1,
        windowTicks: first && last ? Math.max(0, last.tick - first.tick) : 0,
      };
    },
  };
}

export function snapshotSimState(state) {
  const snapshot = {
    schema: 'spaceface.simSnapshot.v1',
    meta: snapshotMeta(state.meta),
    tick: state.tick | 0,
    simTime: round6(state.simTime || 0),
    mode: state.mode,
    playerId: state.playerId | 0,
    player: sanitize(state.player),
    input: sanitize(snapshotInput(state.input)),
    economy: snapshotEconomy(state.economy),
    missions: sanitize(state.missions),
    scenario: sanitize(state.scenario),
    story: sanitize(state.story),
    combat: {
      beams: Array.isArray(state.combat && state.combat.beams) ? state.combat.beams.length : 0,
    },
    entities: Array.from(state.entityList || [])
      .map(snapshotEntity)
      .sort((a, b) => a.id - b.id),
  };
  const physics = snapshotPhysicsRuntime(state);
  if (physics) snapshot.physics = physics;
  return snapshot;
}

// Per-listing price history is a bounded chart cache. Unvisited histories are deliberately omitted
// from saves and formula-reseeded after load, so including them in the authoritative replay hash
// makes an otherwise identical reload diverge. Normalize only this exact cache path: current stock,
// quotes, cycles, demand drivers, player knowledge, and every unrelated `history` field remain.
function snapshotEconomy(economy) {
  const out = sanitize(economy);
  const markets = out && out.markets;
  if (!markets || typeof markets !== 'object' || Array.isArray(markets)) return out;
  for (const station of Object.values(markets)) {
    if (!station || typeof station !== 'object' || Array.isArray(station)) continue;
    for (const entry of Object.values(station)) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) delete entry.history;
    }
  }
  return out;
}

export function canonicalStringify(value) {
  return JSON.stringify(sanitize(value));
}

function snapshotEntity(e) {
  return {
    id: e.id | 0,
    type: e.type,
    team: e.team | 0,
    factionId: e.factionId || null,
    alive: !!e.alive,
    pos: vec2(e.pos),
    vel: vec2(e.vel),
    rot: round6(e.rot || 0),
    radius: round6(e.radius || 0),
    hull: round6(e.hull || 0),
    armorHp: round6(e.armorHp || 0),
    shield: round6(e.shield || 0),
    cap: round6(e.cap || 0),
    ttl: Number.isFinite(e.ttl) ? round6(e.ttl) : 'Infinity',
    ownerId: e.ownerId == null ? null : e.ownerId,
    data: sanitize(e.data),
  };
}

function snapshotMeta(meta) {
  return {
    version: meta && typeof meta.version === 'number' ? meta.version : null,
    seed: meta && typeof meta.seed === 'number' ? meta.seed >>> 0 : 0,
  };
}

function snapshotPhysicsRuntime(state) {
  const gameplay = state && state.settings && state.settings.gameplay;
  if (!gameplay || gameplay.physicsBackend !== 'rapier-dynamic') return null;
  const runtime = state.physicsRuntime || {};
  const diag = runtime.diagnostics || {};
  return {
    schema: 'spaceface.physicsSnapshot.v1',
    backend: 'rapier-dynamic',
    ready: diag.sg02Ready === true,
    bodies: Array.isArray(runtime.sg02Snapshot)
      ? runtime.sg02Snapshot.map(snapshotSg02Body).sort((a, b) => a.id - b.id)
      : [],
  };
}

function snapshotSg02Body(body) {
  return {
    id: body.id | 0,
    x: round6(body.x),
    z: round6(body.z),
    yaw: round6(body.yaw),
    vx: round6(body.vx),
    vz: round6(body.vz),
    wy: round6(body.wy),
    revision: Math.max(0, Math.trunc(body.revision || 0)),
  };
}

function sanitize(value, depth = 0) {
  if (value == null) return value;
  if (depth > 8) return '[depth]';
  const t = typeof value;
  if (t === 'number') return round6(value);
  if (t === 'string' || t === 'boolean') return value;
  if (t === 'function' || t === 'symbol' || t === 'undefined') return undefined;
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1)).filter((v) => v !== undefined);
  if (value instanceof Map) {
    return Array.from(value.entries())
      .map(([k, v]) => [String(k), sanitize(v, depth + 1)])
      .sort((a, b) => a[0].localeCompare(b[0]));
  }
  if (value instanceof Set) return Array.from(value.values()).map((v) => sanitize(v, depth + 1)).sort();
  if (t === 'object') {
    if (value.isVector3 || (typeof value.x === 'number' && typeof value.z === 'number' && Object.keys(value).length <= 4)) {
      return vec2(value);
    }
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (OMIT_KEYS.has(key) || key.startsWith('_')) continue;
      const v = sanitize(value[key], depth + 1);
      if (v !== undefined) out[key] = v;
    }
    return out;
  }
  return undefined;
}

function vec2(v) {
  return { x: round6(v && v.x), z: round6(v && v.z) };
}

function round6(value) {
  return Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : 0;
}
