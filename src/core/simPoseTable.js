// Shared pose table: the picture of the world never travels through the reliable reply pipe.
//
// The simulation worker writes every journaled body's pose (and the player's HUD vitals) into one
// latest-wins table after every fixed step. The main thread reads it once per presented frame.
// There are no messages, no acknowledgements and no ordering with the reply journal: a slow or
// stalled journal (spawns, despawns, events, saves) can lag, but the bodies the renderer already
// knows keep moving at the simulation's own rate.
//
// Transport: one SharedArrayBuffer guarded by a seqlock (the writer makes the sequence odd while it
// writes and even when the rows are coherent; a reader that sees an odd or changed sequence retries
// or keeps last frame's copy). Where SharedArrayBuffer is unavailable the worker posts the same
// compact Float64Array as a transferable on its own message kind, still outside the ACK protocol.
//
// This module never touches the DOM or Three.js; both realms import it.

export const POSE_TABLE_MAGIC = 0x50534531; // 'PSE1'
export const POSE_TABLE_VERSION = 1;
export const POSE_ROW_STRIDE = 12;
export const POSE_PLAYER_FIELDS = Object.freeze([
  'hull', 'hullMax', 'shield', 'shieldMax', 'cap', 'capMax', 'fuel', 'fuelMax',
  'heat', 'heatMax', 'boostEnergy', 'boostMax',
]);
// Int32 header cells.
const H_MAGIC = 0;
const H_VERSION = 1;
const H_SEQ = 2;
const H_COUNT = 3;
const H_CAPACITY = 4;
const H_LIFECYCLE = 5;
const H_TICK = 6;
const H_WRITES = 7;
const H_PLAYER_ID = 8;
const H_APPLIED_COMMAND = 9;
const H_STEPS = 10;
const HEADER_INTS = 16;
// Float64 header cells (after the Int32 header).
const F_SIM_TIME = 0;
const F_WALL_MS = 1;
const F_PLAYER_BASE = 2;
const HEADER_F64 = F_PLAYER_BASE + POSE_PLAYER_FIELDS.length + 2;
const HEADER_BYTES = HEADER_INTS * 4 + HEADER_F64 * 8;

export const POSE_TABLE_DEFAULT_CAPACITY = 4096;

export function poseTableByteLength(capacity = POSE_TABLE_DEFAULT_CAPACITY) {
  return HEADER_BYTES + Math.max(1, capacity | 0) * POSE_ROW_STRIDE * 8;
}

function bindViews(buffer, capacity) {
  return {
    buffer,
    capacity,
    header: new Int32Array(buffer, 0, HEADER_INTS),
    scalars: new Float64Array(buffer, HEADER_INTS * 4, HEADER_F64),
    rows: new Float64Array(buffer, HEADER_BYTES, capacity * POSE_ROW_STRIDE),
  };
}

const sabAvailable = () => typeof SharedArrayBuffer === 'function'
  && (typeof globalThis === 'undefined' || globalThis.crossOriginIsolated !== false);

/** Main realm: mint the shared table (null when SharedArrayBuffer is unavailable). */
export function createSharedPoseTable(capacity = POSE_TABLE_DEFAULT_CAPACITY) {
  if (!sabAvailable()) return null;
  const sab = new SharedArrayBuffer(poseTableByteLength(capacity));
  const views = bindViews(sab, capacity);
  views.header[H_MAGIC] = POSE_TABLE_MAGIC;
  views.header[H_VERSION] = POSE_TABLE_VERSION;
  views.header[H_CAPACITY] = capacity;
  return { sab, capacity };
}

const finiteOr = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);

/**
 * Worker realm: a writer over a shared descriptor, or (no descriptor) over a private buffer that
 * `takeTransfer()` hands out for posting. `write(state, journal, meta)` is read-only of sim state.
 */
export function createPoseTableWriter(descriptor = null, { capacity = POSE_TABLE_DEFAULT_CAPACITY } = {}) {
  let shared = false;
  let views = null;
  if (descriptor && typeof SharedArrayBuffer === 'function' && descriptor.sab instanceof SharedArrayBuffer) {
    const cap = Number.isSafeInteger(descriptor.capacity) ? descriptor.capacity : capacity;
    views = bindViews(descriptor.sab, cap);
    if (views.header[H_MAGIC] !== POSE_TABLE_MAGIC || views.header[H_VERSION] !== POSE_TABLE_VERSION) {
      views = null;
    } else {
      shared = true;
    }
  }
  let privateCapacity = capacity;
  const allocPrivate = () => {
    const buf = new ArrayBuffer(poseTableByteLength(privateCapacity));
    const v = bindViews(buf, privateCapacity);
    v.header[H_MAGIC] = POSE_TABLE_MAGIC;
    v.header[H_VERSION] = POSE_TABLE_VERSION;
    v.header[H_CAPACITY] = privateCapacity;
    return v;
  };
  if (!views) views = allocPrivate();
  let writes = 0;
  let dirtyPrivate = false;
  const stats = { writes: 0, rows: 0, truncated: 0, lastWriteMs: 0, maxWriteMs: 0 };

  function write(state, journal, meta = {}) {
    if (!state || !journal || typeof journal.getActiveGeneration !== 'function') return 0;
    const started = typeof performance !== 'undefined' ? performance.now() : 0;
    if (!views) views = allocPrivate();
    const { header, scalars, rows, capacity: cap } = views;
    if (shared) Atomics.add(header, H_SEQ, 1); // odd: rows are being written
    else header[H_SEQ] += 1;
    let count = 0;
    const list = state.entityList || [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.alive === false || !Number.isSafeInteger(e.id) || e.id <= 0) continue;
      const generation = journal.getActiveGeneration(e.id);
      if (!generation) continue;
      if (count >= cap) { stats.truncated++; break; }
      const o = count * POSE_ROW_STRIDE;
      const pos = e.pos || null;
      const vel = e.vel || null;
      rows[o] = e.id;
      rows[o + 1] = generation;
      rows[o + 2] = Number.isSafeInteger(e.occupantGeneration) ? e.occupantGeneration : 0;
      rows[o + 3] = pos ? finiteOr(pos.x) : 0;
      rows[o + 4] = pos ? finiteOr(pos.y) : 0;
      rows[o + 5] = pos ? finiteOr(pos.z) : 0;
      rows[o + 6] = finiteOr(e.rot);
      rows[o + 7] = finiteOr(e.bank);
      rows[o + 8] = finiteOr(e.pitch);
      rows[o + 9] = vel ? finiteOr(vel.x) : 0;
      rows[o + 10] = vel ? finiteOr(vel.z) : 0;
      rows[o + 11] = finiteOr(e.angVel);
      count++;
    }
    const playerId = Number.isSafeInteger(state.playerId) ? state.playerId : 0;
    const player = playerId > 0 && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(playerId) : null;
    for (let k = 0; k < POSE_PLAYER_FIELDS.length; k++) {
      const key = POSE_PLAYER_FIELDS[k];
      let value = NaN;
      if (player) {
        if (key === 'boostEnergy') value = player.boost ? player.boost.energy : NaN;
        else if (key === 'boostMax') value = player.boost ? player.boost.max : NaN;
        else value = player[key];
      }
      scalars[F_PLAYER_BASE + k] = Number.isFinite(value) ? value : NaN;
    }
    scalars[F_SIM_TIME] = finiteOr(state.simTime);
    scalars[F_WALL_MS] = started;
    header[H_COUNT] = count;
    header[H_LIFECYCLE] = Number.isSafeInteger(meta.lifecycleGeneration) ? meta.lifecycleGeneration : 0;
    header[H_TICK] = Number.isSafeInteger(state.tick) ? state.tick : 0;
    header[H_PLAYER_ID] = playerId;
    header[H_APPLIED_COMMAND] = Number.isSafeInteger(meta.appliedCommandSequence) ? meta.appliedCommandSequence : 0;
    header[H_STEPS] = Number.isSafeInteger(meta.steps) ? (meta.steps & 0x7fffffff) : 0;
    writes++;
    header[H_WRITES] = writes & 0x7fffffff;
    if (shared) {
      Atomics.add(header, H_SEQ, 1); // even: coherent
    } else {
      header[H_SEQ] += 1;
      dirtyPrivate = true;
    }
    stats.writes = writes;
    stats.rows = count;
    if (typeof performance !== 'undefined') {
      stats.lastWriteMs = performance.now() - started;
      if (stats.lastWriteMs > stats.maxWriteMs) stats.maxWriteMs = stats.lastWriteMs;
    }
    return count;
  }

  /** Non-shared fallback: detach the latest private table for a transfer post (or null). */
  function takeTransfer() {
    if (shared || !dirtyPrivate || !views) return null;
    const out = views.buffer;
    // Shrink the transfer to the populated rows so a 300-body scene posts ~30 KB, not 400 KB.
    const used = HEADER_BYTES + views.header[H_COUNT] * POSE_ROW_STRIDE * 8;
    const compact = out.byteLength > used * 2 ? out.slice(0, used) : out;
    if (compact === out) views = null; // transferred away; the next write allocates
    dirtyPrivate = false;
    return compact;
  }

  return { shared, write, takeTransfer, getStats: () => ({ ...stats, shared }) };
}

/**
 * Main realm reader. `bindShared(descriptor)` reads the live SAB; `acceptTransfer(buffer)` takes a
 * posted fallback table. `read()` returns a private coherent snapshot, or the previous one when the
 * writer is mid-write (never a torn row).
 */
function createSnapshot() {
  return {
    valid: false,
    seq: -1,
    writes: -1,
    count: 0,
    lifecycleGeneration: 0,
    tick: 0,
    simTime: 0,
    wallMs: 0,
    playerId: 0,
    appliedCommandSequence: 0,
    steps: 0,
    rows: new Float64Array(64 * POSE_ROW_STRIDE),
    player: Object.fromEntries(POSE_PLAYER_FIELDS.map((k) => [k, NaN])),
    readAtMs: 0,
    advancedAtMs: 0,
  };
}

export function createPoseTableReader() {
  let sharedViews = null;
  let latestTransfer = null;
  // Front is what callers see; back is the copy target. A torn copy never reaches the front.
  let snapshot = createSnapshot();
  let back = createSnapshot();
  const stats = { reads: 0, retries: 0, tornSkips: 0, advances: 0 };

  function copyInto(target, views, seqValue) {
    const { header, scalars, rows } = views;
    const count = Math.max(0, Math.min(header[H_COUNT], views.capacity));
    const needed = count * POSE_ROW_STRIDE;
    if (target.rows.length < needed) {
      target.rows = new Float64Array(Math.max(needed, target.rows.length * 2));
    }
    target.rows.set(rows.subarray(0, needed));
    target.count = count;
    target.lifecycleGeneration = header[H_LIFECYCLE];
    target.tick = header[H_TICK];
    target.playerId = header[H_PLAYER_ID];
    target.appliedCommandSequence = header[H_APPLIED_COMMAND];
    target.steps = header[H_STEPS];
    target.writes = header[H_WRITES];
    target.simTime = scalars[F_SIM_TIME];
    target.wallMs = scalars[F_WALL_MS];
    for (let k = 0; k < POSE_PLAYER_FIELDS.length; k++) {
      target.player[POSE_PLAYER_FIELDS[k]] = scalars[F_PLAYER_BASE + k];
    }
    target.seq = seqValue;
    target.valid = true;
  }

  function commit(nowMs) {
    const advanced = back.writes !== snapshot.writes || !snapshot.valid;
    back.readAtMs = nowMs;
    back.advancedAtMs = advanced ? nowMs : snapshot.advancedAtMs;
    const previous = snapshot;
    snapshot = back;
    back = previous;
    if (advanced) stats.advances++;
    return advanced;
  }

  function read(nowMs = 0) {
    stats.reads++;
    if (sharedViews) {
      const { header } = sharedViews;
      for (let attempt = 0; attempt < 4; attempt++) {
        const s1 = Atomics.load(header, H_SEQ);
        if (s1 & 1) { stats.retries++; continue; }
        if (s1 === snapshot.seq && snapshot.valid) {
          snapshot.readAtMs = nowMs;
          return { snapshot, advanced: false };
        }
        copyInto(back, sharedViews, s1);
        if (Atomics.load(header, H_SEQ) === s1) {
          const advanced = commit(nowMs);
          return { snapshot, advanced };
        }
        stats.retries++;
      }
      stats.tornSkips++;
      snapshot.readAtMs = nowMs;
      return { snapshot, advanced: false };
    }
    if (latestTransfer) {
      const views = bindViews(latestTransfer, Math.floor(
        (latestTransfer.byteLength - HEADER_BYTES) / (POSE_ROW_STRIDE * 8)));
      latestTransfer = null;
      if (views.header[H_MAGIC] === POSE_TABLE_MAGIC) {
        copyInto(back, views, views.header[H_SEQ]);
        const advanced = commit(nowMs);
        return { snapshot, advanced };
      }
    }
    snapshot.readAtMs = nowMs;
    return { snapshot, advanced: false };
  }

  return {
    bindShared(descriptor) {
      if (!descriptor || typeof SharedArrayBuffer !== 'function'
        || !(descriptor.sab instanceof SharedArrayBuffer)) return false;
      sharedViews = bindViews(descriptor.sab, descriptor.capacity);
      return true;
    },
    acceptTransfer(buffer) {
      if (buffer instanceof ArrayBuffer && buffer.byteLength >= HEADER_BYTES) latestTransfer = buffer;
    },
    isShared: () => sharedViews !== null,
    /** Cheap liveness probe: the writer's write counter, without copying or committing. */
    peekWrites: () => (sharedViews ? Atomics.load(sharedViews.header, H_WRITES) : -1),
    read,
    get snapshot() { return snapshot; },
    getStats: () => ({ ...stats, shared: sharedViews !== null }),
  };
}

// ---- per-frame feed shared between the lane (reads once per frame) and the renderer ----------
// The lane reads the table at the start of each presented frame and publishes the coherent copy
// here; the renderer applies it to the presentation world in the same frame. One realm, one feed.
let activeFeed = null;

/** Lane: publish this frame's coherent snapshot (null clears). */
export function setActivePoseFeed(feed) { activeFeed = feed || null; }
/** Renderer: { snapshot, advanced, frame } for this frame, or null without a table lane. */
export function getActivePoseFeed() { return activeFeed; }

/** Row accessors over a snapshot's `rows` (row index i). */
export const POSE_ROW = Object.freeze({
  ID: 0, GENERATION: 1, OCCUPANT: 2, X: 3, Y: 4, Z: 5, ROT: 6, BANK: 7, PITCH: 8, VX: 9, VZ: 10, ANG: 11,
});
