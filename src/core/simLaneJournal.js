// S1 Phase-B stage 8 — transport journal (main side).
//
// The worker's presentation journal packs each tick's record range into typed
// columns that post over the wire. This facade re-materializes them into the
// journal's reader surface (visitRange / hasRange / discardThrough / the
// rebuild getters) so PresentationPublisher and PresentationRunner consume the
// wire exactly as they consume the in-process ring.
//
// Retention mirrors the real journal's contract: segments free on
// discardThrough, which the presentation ack path calls after a successful
// render — the same call additionally reports the acked end so the lane can
// piggyback it on the next tick directive (the worker frees ITS ring slots on
// that number). Sequence integrity is end-to-end: records keep the worker's
// sequence numbers, never locally re-minted, so ack/rebuild bookkeeping means
// the same thing on both sides of the lane.

import { PRESENTATION_JOURNAL_KINDS } from './presentationJournal.js';

// Layout constants mirror scripts/lib/simWorkerHost.mjs (SAB_JOURNAL_MAGIC /
// SAB_SLOT_BUSY_BASE / per-slot column layout). Kept local so the main-side
// graph never imports the host module — the wire descriptor is the contract.
const SAB_HEADER_MAGIC = 0x53414a31;
const SAB_SLOT_BUSY_BASE = 4;
const SAB_HEADER_INTS = 16;
const JOURNAL_SCALAR_STRIDE = 18;
const KIND_BY_CODE = Object.freeze({
  1: PRESENTATION_JOURNAL_KINDS.SPAWN,
  2: PRESENTATION_JOURNAL_KINDS.DESTROY,
  3: PRESENTATION_JOURNAL_KINDS.TRANSFORM,
  4: PRESENTATION_JOURNAL_KINDS.VISUAL,
});

// Mirror of createSabJournalArena in scripts/lib/simWorkerHost.mjs — the main
// realm mints the arena and ships its descriptor on the init directive; the
// worker binds it for journal packs. Same magic/layout/slot accounting.
const SAB_LAYOUT_VERSION = 1;
const SAB_HEADER_BYTES = 64;
const SAB_SLOT_BYTES_PER_RECORD = 18 * 8 + 1 + 2;

export function createLaneSabJournalArena({ slotCount = 8, recordCap = 4096 } = {}) {
  if (typeof SharedArrayBuffer !== 'function') return null;
  const slotBytes = recordCap * SAB_SLOT_BYTES_PER_RECORD;
  const sab = new SharedArrayBuffer(SAB_HEADER_BYTES + slotCount * slotBytes);
  const header = new Int32Array(sab, 0, SAB_HEADER_INTS);
  header[0] = SAB_HEADER_MAGIC;
  header[1] = SAB_LAYOUT_VERSION;
  header[2] = slotCount;
  header[3] = recordCap;
  return { sab, slotCount, recordCap, slotBytes };
}

export function createSimLaneJournal() {
  // Contiguous-by-construction segments [start, end) carrying the wire columns.
  const segments = [];
  let writeSequence = 0;
  let closed = false;
  let rebuildPending = false;
  let lastRebuildStart = 0;
  let lastRebuildEnd = 0;
  let rebuildGeneration = 0;
  let ackHook = null;
  let rebuildHook = null;
  let sabHeader = null;
  const stats = { appliedPacks: 0, evictedPacks: 0, rebuildPacks: 0, releasedSabSlots: 0 };

  function releaseSegment(seg) {
    // An SAB-backed pack posts its columns as shared memory; the arena slot is
    // freed by flipping its busy bit (the worker claims free slots only).
    if (seg.sab === true && sabHeader && Number.isSafeInteger(seg.sabSlot)) {
      try { Atomics.store(sabHeader, SAB_SLOT_BUSY_BASE + seg.sabSlot, 0); stats.releasedSabSlots++; } catch (_) { /* arena ownership ended with the worker */ }
    }
  }

  function evictThrough(end) {
    let kept = 0;
    for (const seg of segments) {
      if (seg.end <= end) { releaseSegment(seg); stats.evictedPacks++; continue; }
      segments[kept++] = seg;
    }
    segments.length = kept;
  }

  return {
    // ---- journal reader surface (consumer parity) ----
    getWriteSequence: () => writeSequence,
    getPendingCount() {
      const first = segments[0];
      return first && first.start < writeSequence ? writeSequence - first.start : 0;
    },
    getOldestSequence: () => (segments.length ? segments[0].start : writeSequence),
    hasRange(start, end) {
      if (end <= start) return true;
      let cursor = start;
      for (const seg of segments) {
        if (seg.end <= cursor) continue;
        if (seg.start > cursor) return false;
        cursor = seg.end;
        if (cursor >= end) return true;
      }
      return false;
    },
    visitRange(start, end, scratch, visit) {
      if (!visit) return 0;
      let applied = 0;
      for (const seg of segments) {
        const lo = Math.max(start, seg.start);
        const hi = Math.min(end, seg.end);
        for (let seq = lo; seq < hi; seq++) {
          const i = seq - seg.start;
          const o = i * JOURNAL_SCALAR_STRIDE;
          const s = seg.scalars;
          scratch.tick = s[o];
          scratch.sequence = s[o + 1];
          scratch.entityId = s[o + 2];
          scratch.generation = s[o + 3];
          scratch.revision = s[o + 4];
          scratch.x = s[o + 5];
          scratch.y = s[o + 6];
          scratch.z = s[o + 7];
          scratch.prevX = s[o + 8];
          scratch.prevY = s[o + 9];
          scratch.prevZ = s[o + 10];
          scratch.rot = s[o + 11];
          scratch.bank = s[o + 12];
          scratch.pitch = s[o + 13];
          scratch.prevRot = s[o + 14];
          scratch.prevBank = s[o + 15];
          scratch.prevPitch = s[o + 16];
          scratch.visualRevision = s[o + 17];
          scratch.kind = KIND_BY_CODE[seg.kinds[i]] || PRESENTATION_JOURNAL_KINDS.TRANSFORM;
          scratch.entityType = seg.typeTable[seg.typeIndex[i]] || null;
          visit(scratch);
          applied++;
        }
      }
      return applied;
    },
    discardThrough(end) {
      if (!Number.isSafeInteger(end) || end <= 0) return;
      evictThrough(end);
      if (ackHook) { try { ackHook(end); } catch (_) { /* ack reporting is advisory */ } }
    },
    needsRebuild: () => rebuildPending,
    requestRebuild() {
      if (rebuildPending) return;
      rebuildPending = true;
      if (rebuildHook) { try { rebuildHook(); } catch (_) { /* best effort */ } }
    },
    // The runner's local-rebuild path maps onto a worker rebuild directive:
    // locally minted records would mint local sequences the worker's ack map
    // never heard of, so the range must arrive through the wire instead.
    // Returning false keeps needsRebuild()'s pending state on the consumer —
    // the real range installs when the worker's rebuild pack arrives.
    rebuildFrom() {
      this.requestRebuild();
      return false;
    },
    getLastRebuildStart: () => lastRebuildStart,
    getLastRebuildEnd: () => lastRebuildEnd,
    getRebuildGeneration: () => rebuildGeneration,
    isClosed: () => closed,
    close() {
      closed = true;
      for (const seg of segments) releaseSegment(seg);
      segments.length = 0;
    },
    // ---- lane plumbing ----
    // Normal tick pack: append into the segment store. Caller guarantees the
    // range is contiguous with writeSequence (a gap would fail hasRange on the
    // consumer side exactly like the in-process journal's window sliding).
    applyPack(pack) {
      if (!pack || !Number.isSafeInteger(pack.count) || pack.count <= 0
        || !Number.isSafeInteger(pack.start) || !Number.isSafeInteger(pack.end)) return false;
      const seg = {
        start: pack.start,
        end: pack.end,
        scalars: pack.scalars,
        kinds: pack.kinds,
        typeIndex: pack.typeIndex,
        typeTable: pack.typeTable || [],
        sab: pack.sab === true,
        sabSlot: Number.isSafeInteger(pack.sabSlot) ? pack.sabSlot : null,
      };
      segments.push(seg);
      if (pack.end > writeSequence) writeSequence = pack.end;
      stats.appliedPacks++;
      return true;
    },
    // Rebuild pack: replaces the retained set. The worker emits this on init
    // and after a rebuild directive; generation ticks so consumers clear.
    applyRebuildPack(rebuild) {
      if (!rebuild || !rebuild.pack) return false;
      for (const seg of segments) releaseSegment(seg);
      segments.length = 0;
      lastRebuildStart = rebuild.start;
      lastRebuildEnd = rebuild.end;
      rebuildGeneration++;
      rebuildPending = false;
      const ok = this.applyPack(rebuild.pack);
      stats.rebuildPacks++;
      return ok;
    },
    // Bind the shared arena descriptor shipped on init; pack columns arriving
    // as SAB views index into it, and busy-bit release needs its header.
    attachSabArena(desc) {
      if (!desc || typeof SharedArrayBuffer !== 'function' || !(desc.sab instanceof SharedArrayBuffer)) {
        sabHeader = null;
        return false;
      }
      const header = new Int32Array(desc.sab, 0, SAB_HEADER_INTS);
      if (header[0] !== SAB_HEADER_MAGIC || header[2] !== desc.slotCount || header[3] !== desc.recordCap) return false;
      sabHeader = header;
      return true;
    },
    onAck(cb) { ackHook = cb; },
    onRebuildRequest(cb) { rebuildHook = cb; },
    getDiagnostics: () => ({ ...stats, retainedSegments: segments.length, writeSequence }),
  };
}
