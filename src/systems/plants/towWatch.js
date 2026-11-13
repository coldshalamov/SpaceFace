// towWatch — the player-tow view shared by plant modules (PL-144/PL-197/PL-198/PL-251).
//
// The real tether truth lives on `state.player.tether` ({active, targetId}) — the same record
// tetherGameplay mirrors and masslineTelemetry reads. Nothing writes player.data.tetherTargetId,
// so plants never read that. Instead each plant keeps its OWN event-driven view in module
// memory: `tether:snapCatch` (masslineTelemetry, carries targetId) latches a tow;
// `massline:releaseValidated` (masslineThrow receipt, carries entityId) clears it. The live
// `state.player.tether` read is the authority whenever it is present, so a missed release
// event can never leave a stale latch.
//
// Pure functions only: no bus, no module-level mutable state. Memory bounds via TOW_WATCH_TUNING.

export const TOW_WATCH_TUNING = Object.freeze({
  memoryCap: 4,          // bounded latch rows (one live view per plant host)
  staleS: 240,           // an event-driven latch older than this is stale without confirmation
});

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Memory-row builder (pure): the single tow-latch row, FIFO + stale eviction at the cap.
 */
export function towRowFor(memory, now, cap = TOW_WATCH_TUNING.memoryCap) {
  if (!memory) return null;
  let row = memory.get('tow');
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = { targetId: null, latchedAt: -Infinity, lastAt: now };
    memory.set('tow', row);
  }
  return row;
}

/** tether:snapCatch receipt: latch the tow view onto this target. */
export function towLatch(memory, payload, now) {
  const targetId = payload && payload.targetId != null ? payload.targetId : null;
  if (targetId == null) return null;
  const row = towRowFor(memory, now);
  if (!row) return null;
  row.lastAt = now;
  row.targetId = targetId;
  row.latchedAt = now;
  return row;
}

/** massline:releaseValidated receipt: the tow view releases this target. */
export function towRelease(memory, entityId) {
  const row = memory ? memory.get('tow') : null;
  if (!row || row.targetId == null) return false;
  if (entityId != null && row.targetId !== entityId) return false;
  row.targetId = null;
  row.latchedAt = -Infinity;
  return true;
}

/**
 * Decision helper: what is the player towing right now? The live `state.player.tether`
 * read is the authority when present; the event-driven latch view answers for harnesses and
 * whenever there is no live tether read. A live release also retires the remembered latch.
 */
export function towTargetIdOf(state, memory, now) {
  const tether = state && state.player && state.player.tether;
  if (tether != null) {
    if (tether.active !== false && tether.targetId != null) return tether.targetId;
    towRelease(memory, null);
    return null;
  }
  const row = memory ? memory.get('tow') : null;
  if (row && row.targetId != null
      && Number.isFinite(row.latchedAt) && now - row.latchedAt <= TOW_WATCH_TUNING.staleS) {
    return row.targetId;
  }
  return null;
}

/**
 * Install the two real tow-event listeners on a plant host (`this` carries bus/state plus a
 * `<prefix>Memory` Map factory). Idempotent via a `_<prefix>TowInstalled` flag.
 */
export function attachTowWatch(host, prefix, memoryMapFn) {
  if (!host || !host.bus || typeof host.bus.on !== 'function') return false;
  const flag = `_${prefix}TowInstalled`;
  if (host[flag]) return false;
  host[flag] = true;
  host.bus.on('tether:snapCatch', (p) => {
    if (!host.state || (host.state.mode && host.state.mode !== 'flight')) return;
    towLatch(memoryMapFn.call(host), p, finite(host.state.simTime, 0));
  });
  host.bus.on('massline:releaseValidated', (p) => {
    towRelease(memoryMapFn.call(host), p && p.entityId);
  });
  return true;
}
