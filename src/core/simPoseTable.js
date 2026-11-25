// Shared pose table: the picture of the world never travels through the reliable reply pipe.
//
// The simulation worker writes every journaled body's pose (and the player's HUD vitals) into one
// latest-wins table after every fixed step. The main thread reads it once per presented frame.
// There are no messages, no acknowledgements and no ordering with the reply journal: a slow or
// stalled journal (spawns, despawns, events, saves) can lag, but the bodies the renderer already
// knows keep moving at the simulation's own rate.
//
// The writer fills the unpublished bank and atomically publishes its sequence on success.
// A reader checks that sequence after copying, so it can keep using the last complete bank even
// if a write throws. The transferable fallback stages its next table the same way.
//
// This module never touches the DOM or Three.js; both realms import it.

export const POSE_TABLE_MAGIC = 0x50534531; // 'PSE1'
export const POSE_TABLE_VERSION = 2;
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
const H_TRUNCATED = 11;
const H_WRITE_ERRORS = 12;
// Live worker transport facts (forensics; read without waiting for a reply).
const H_REPLY_SEQ = 13;
const H_UNACKED = 14;
const H_RETAINED = 15;
const HEADER_INTS = 16;
// Float64 header cells (after the Int32 header).
const F_SIM_TIME = 0;
const F_WALL_MS = 1;
const F_PLAYER_BASE = 2;
const F_OVERFLOW = F_PLAYER_BASE + POSE_PLAYER_FIELDS.length;
const HEADER_F64 = F_OVERFLOW + 1;
const HEADER_BYTES = HEADER_INTS * 4 + HEADER_F64 * 8;
const PUBLISHED_SEQUENCE = 0;
const SHARED_WRITE_ERRORS = 1;
const SHARED_CONTROL_BYTES = 2 * Int32Array.BYTES_PER_ELEMENT;

export const POSE_TABLE_DEFAULT_CAPACITY = 4096;

export function poseTableByteLength(capacity = POSE_TABLE_DEFAULT_CAPACITY) {
  return HEADER_BYTES + Math.max(1, capacity | 0) * POSE_ROW_STRIDE * 8;
}

function bindViews(buffer, capacity, offset = 0) {
  return {
    buffer,
    capacity,
    header: new Int32Array(buffer, offset, HEADER_INTS),
    scalars: new Float64Array(buffer, offset + HEADER_INTS * 4, HEADER_F64),
    rows: new Float64Array(buffer, offset + HEADER_BYTES, capacity * POSE_ROW_STRIDE),
  };
}

const sabAvailable = () => typeof SharedArrayBuffer === 'function'
  && (typeof globalThis === 'undefined' || globalThis.crossOriginIsolated !== false);

function bindSharedTable(buffer, capacity) {
  if (typeof SharedArrayBuffer !== 'function' || !(buffer instanceof SharedArrayBuffer)
    || !Number.isSafeInteger(capacity) || capacity < 1) return null;
  const bankBytes = poseTableByteLength(capacity);
  if (buffer.byteLength !== SHARED_CONTROL_BYTES + 2 * bankBytes) return null;
  return {
    control: new Int32Array(buffer, 0, 2),
    banks: [
      bindViews(buffer, capacity, SHARED_CONTROL_BYTES),
      bindViews(buffer, capacity, SHARED_CONTROL_BYTES + bankBytes),
    ],
  };
}

function stampFormat(views) {
  views.header[H_MAGIC] = POSE_TABLE_MAGIC;
  views.header[H_VERSION] = POSE_TABLE_VERSION;
  views.header[H_CAPACITY] = views.capacity;
}

function validFormat(views) {
  return views.header[H_MAGIC] === POSE_TABLE_MAGIC
    && views.header[H_VERSION] === POSE_TABLE_VERSION;
}

/** Main realm: mint the shared table (null when SharedArrayBuffer is unavailable). */
export function createSharedPoseTable(capacity = POSE_TABLE_DEFAULT_CAPACITY) {
  if (!sabAvailable() || !Number.isSafeInteger(capacity) || capacity < 1) return null;
  const sab = new SharedArrayBuffer(SHARED_CONTROL_BYTES + 2 * poseTableByteLength(capacity));
  for (const bank of bindSharedTable(sab, capacity).banks) stampFormat(bank);
  return { sab, capacity };
}

const finiteOr = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);

/**
 * Worker realm: a writer over a shared descriptor, or (no descriptor) over a private buffer that
 * `takeTransfer()` hands out for posting. `write(state, journal, meta)` is read-only of sim state.
 */
export function createPoseTableWriter(descriptor = null, { capacity = POSE_TABLE_DEFAULT_CAPACITY } = {}) {
  const table = bindSharedTable(descriptor?.sab, descriptor?.capacity);
  const shared = table?.banks.every(validFormat) === true;
  let privateWrite = null;
  let pendingTransfer = null;
  let writes = 0;
  const stats = { writes: 0, rows: 0, truncated: 0, writeErrors: 0, lastWriteMs: 0, maxWriteMs: 0 };

  function write(state, journal, meta = {}) {
    if (!state || !journal || typeof journal.getActiveGeneration !== 'function') return 0;
    const started = typeof performance !== 'undefined' ? performance.now() : 0;
    if (!shared && !privateWrite) {
      privateWrite = bindViews(new ArrayBuffer(poseTableByteLength(capacity)), capacity);
      stampFormat(privateWrite);
    }
    const sequence = (writes + 1) | 0;
    const views = shared ? table.banks[sequence & 1] : privateWrite;
    const { header, scalars, rows, capacity: cap } = views;
    let count = 0;
    let overflow = false;
    try {
      const roster = journal.activePoseEntities?.();
      const list = roster || state.entityList || [];
      const liveEntities = roster && typeof state.entities?.get === 'function' ? state.entities : null;
      for (const e of list) {
        // Every body the journal still presents gets its pose, dying ones included: a killed hull keeps
        // drifting through its death beat until the journal retires it, instead of freezing mid-air.
        if (!e || !Number.isSafeInteger(e.id) || e.id <= 0) continue;
        // The entity owner may already have removed or reused an id when the
        // structural journal needs a rebuild. Publish only the exact live life.
        if (liveEntities && liveEntities.get(e.id) !== e) continue;
        const generation = roster || typeof journal.getActiveGenerationFor !== 'function'
          ? journal.getActiveGeneration(e.id) : journal.getActiveGenerationFor(e);
        if (!generation) continue;
        if (count >= cap) { overflow = true; break; }
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
      header[H_REPLY_SEQ] = Number.isSafeInteger(meta.replySequence) ? meta.replySequence & 0x7fffffff : 0;
      header[H_UNACKED] = Number.isSafeInteger(meta.unacked) ? meta.unacked : 0;
      header[H_RETAINED] = Number.isSafeInteger(meta.retained) ? meta.retained : 0;
      scalars[F_OVERFLOW] = overflow ? 1 : 0;
      if (overflow) stats.truncated++;
      header[H_TRUNCATED] = stats.truncated & 0x7fffffff;
      header[H_WRITE_ERRORS] = stats.writeErrors & 0x7fffffff;
      header[H_WRITES] = sequence;
      header[H_SEQ] = sequence;
      writes++;
      stats.writes = writes;
      stats.rows = count;
      if (shared) {
        Atomics.store(table.control, PUBLISHED_SEQUENCE, sequence);
      } else {
        privateWrite = pendingTransfer;
        pendingTransfer = views;
      }
    } catch {
      stats.writeErrors++;
      if (shared) Atomics.store(table.control, SHARED_WRITE_ERRORS, stats.writeErrors);
      else if (pendingTransfer) pendingTransfer.header[H_WRITE_ERRORS] = stats.writeErrors;
      count = 0;
    }
    if (typeof performance !== 'undefined') {
      stats.lastWriteMs = performance.now() - started;
      if (stats.lastWriteMs > stats.maxWriteMs) stats.maxWriteMs = stats.lastWriteMs;
    }
    return count;
  }

  /** Non-shared fallback: transfer the latest successful table. */
  function takeTransfer() {
    if (shared || !pendingTransfer) return null;
    const views = pendingTransfer;
    pendingTransfer = null;
    const out = views.buffer;
    // Compact small scenes and reuse the source buffer for a later write.
    const used = HEADER_BYTES + views.header[H_COUNT] * POSE_ROW_STRIDE * 8;
    if (out.byteLength <= used * 2) return out;
    if (!privateWrite) privateWrite = views;
    return out.slice(0, used);
  }

  return { shared, write, takeTransfer, getStats: () => ({ ...stats, shared }) };
}

/**
 * Main realm reader. `bindShared(descriptor)` reads the live SAB; `acceptTransfer(buffer)` takes a
 * posted fallback table. `read()` returns a private coherent snapshot, or the previous one when the
 * writer publishes while the copy is in progress.
 */
function createSnapshot() {
  return {
    valid: false,
    overflow: false,
    writeErrors: 0,
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

  function readInto(target, views, seqValue, takeRows = false) {
    const { header, scalars, rows } = views;
    const count = Math.max(0, Math.min(header[H_COUNT], views.capacity));
    const needed = count * POSE_ROW_STRIDE;
    if (takeRows) {
      target.rows = rows;
    } else {
      if (target.rows.length < needed) {
        target.rows = new Float64Array(Math.max(needed, target.rows.length * 2));
      }
      target.rows.set(rows.subarray(0, needed));
    }
    target.count = count;
    target.lifecycleGeneration = header[H_LIFECYCLE];
    target.tick = header[H_TICK];
    target.playerId = header[H_PLAYER_ID];
    target.appliedCommandSequence = header[H_APPLIED_COMMAND];
    target.steps = header[H_STEPS];
    target.writes = header[H_WRITES] >>> 0;
    target.overflow = scalars[F_OVERFLOW] === 1;
    target.truncated = header[H_TRUNCATED];
    target.replySequence = header[H_REPLY_SEQ];
    target.unacked = header[H_UNACKED];
    target.retained = header[H_RETAINED];
    target.writeErrors = header[H_WRITE_ERRORS];
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
      const { control, banks } = sharedViews;
      for (let attempt = 0; attempt < 4; attempt++) {
        const sequence = Atomics.load(control, PUBLISHED_SEQUENCE);
        if ((sequence === 0 && !snapshot.valid) || sequence === snapshot.seq) {
          snapshot.readAtMs = nowMs;
          snapshot.writeErrors = Atomics.load(control, SHARED_WRITE_ERRORS);
          return { snapshot, advanced: false };
        }
        readInto(back, banks[sequence & 1], sequence);
        if (Atomics.load(control, PUBLISHED_SEQUENCE) === sequence) {
          const advanced = commit(nowMs);
          snapshot.writeErrors = Atomics.load(control, SHARED_WRITE_ERRORS);
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
      if (validFormat(views)) {
        readInto(back, views, views.header[H_SEQ], true);
        const advanced = commit(nowMs);
        return { snapshot, advanced };
      }
    }
    snapshot.readAtMs = nowMs;
    return { snapshot, advanced: false };
  }

  return {
    bindShared(descriptor) {
      const table = bindSharedTable(descriptor?.sab, descriptor?.capacity);
      if (!table?.banks.every(validFormat)) return false;
      sharedViews = table;
      snapshot = createSnapshot();
      back = createSnapshot();
      return true;
    },
    acceptTransfer(buffer) {
      if (buffer instanceof ArrayBuffer && buffer.byteLength >= HEADER_BYTES) latestTransfer = buffer;
    },
    isShared: () => sharedViews !== null,
    /** Cheap liveness probe: the writer's write counter, without copying or committing. */
    peekWrites: () => (sharedViews ? (Atomics.load(sharedViews.control, PUBLISHED_SEQUENCE) >>> 0) : -1),
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
