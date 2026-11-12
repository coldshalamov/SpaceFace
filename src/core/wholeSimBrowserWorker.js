// S1 Phase-B stage 8 — browser Worker adapter for the whole-sim host.
//
// Twin of scripts/lib/wholeSimWorker.mjs on the DedicatedWorker transport:
// self.onmessage serializes every directive on the same promise chain (a reload
// await inside tick N still finishes before tick N+1 applies input), stamps
// sendNs just before postMessage, and transfers the pack columns. Reply
// envelope shapes are byte-identical to the node adapter's — ready/tickDone/
// done/bye/error plus 'boot'.
//
// SAB: the arena descriptor rides the init directive (sabArena). Without
// COOP/COEP headers crossOriginIsolated is false and SharedArrayBuffer is
// undefined — the host's bindSabJournalArena degrades to the transfer channel
// on its own, so no guard is needed here beyond the same SAB-transfer skip the
// node adapter does.
//
// SAB envelope (arena layout v2): once init binds the arena, the worker arms
// the shared cmd/reply cell rings — the main lane stops postMessage-ing
// directives and the worker parks on Atomics.wait instead of the message port.
// tickDone replies write through the reply ring (pack columns ride a SAB
// descriptor or the cell's binary tail); rare kinds (ready/done/bye/error)
// keep postMessage. The single producer preserves FIFO either way, and a
// directive that cannot fit a cell posts 'error' through the port — the lane
// fails rather than splitting channels mid-stream.

import {
  createSimHost,
  bindSabJournalArena,
  sabFreePackSlot,
} from '../../scripts/lib/simWorkerHost.mjs';
import { nowNs } from '../../scripts/lib/simRealm.mjs';
import { loadModelTruthCensus } from '../data/modelTruth.js';
import {
  bindSabEnvelopeChannel,
  encodeReplyForSab,
  sabEnvelopeDrain,
  sabEnvelopePostReply,
  sabEnvelopeWaitCommand,
  SAB_CMD_SEQ_INDEX,
  SAB_ENV_KIND,
} from '../../scripts/lib/simSabEnvelope.mjs';

const { tick, init, finalize, shutdown, drainStorageOps, hasPendingDurable,
  applyPresentationTimeEffects, effectiveTimeScale } = createSimHost({ onAsyncSaveReady: requestAsyncSaveReply });

let chain = Promise.resolve();
let sabEnv = null;

// The browser production lane can keep authoritative time moving while the
// main thread is inside a long render/driver task. The scheduler deliberately
// has one outstanding presentation reply: intermediate journal packs are
// retained as a bounded contiguous range, while every durable side-channel
// item is retained. A rebuild is reserved for a gap, a cap overflow, or an
// authoritative journal rebuild.
const LOCAL_FIXED_DT = 1 / 60;
const LOCAL_MAX_STEPS = 4;
// Reply work budget for the local accumulator's catch-up batch: once the host
// has spent this much wall time inside one tick directive it stops early and
// leaves the unexecuted steps in the bounded accumulator. A heavy step yields
// a reply before the worker spends another task on the remaining ticks.
// Explicit-step directives (tape/replay/verification) carry no budget and
// always run exactly the steps requested.
const LOCAL_WORK_BUDGET_MS = 24;
const LOCAL_HITCH_CATCHUP_STEPS = 2;
const LOCAL_MAX_DEBT_SECONDS = 0.25;
const LOCAL_DURABLE_LIMIT = 4096;
// Presentation-trigger rows replay onto the main bus only when a reply is
// actually published. Rows retained across a long ACK wait are stale by the
// time they land, and an unbounded tail is what turns a slow consumer into the
// multi-second main-lane apply that stops the world. Keep the newest bounded
// tail of expendable impact effects. Some events also carry correctness
// receipts, including save settlement and run lifecycle, so those stay queued.
const LOCAL_EVENT_RETAIN_LIMIT = 512;
// Same class: each stepped tick clones the full input state into a durable row,
// but the presentation side only ever consumes the newest few through a
// capacity-8 ring. Unbounded retained clones are payload weight, not data.
const LOCAL_INPUT_PUBLISH_RETAIN_LIMIT = 64;
// Queued wire commands wait for the next fixed tick and the drain sits outside
// the step work budget — an input flood otherwise piles up unboundedly and the
// next tick pays the whole backlog in one synchronous run. Latest-wins rows
// (camera/viewport/timeEffects envelopes, pointer-move and sample dom payloads)
// are sheddable; correctness envelopes (key edges, input, bus, rpc, settings,
// spawn...) are never dropped — a lost keyup is a stuck key.
const LOCAL_PENDING_COMMAND_LIMIT = 1024;
const LOCAL_STALE_COMMAND_TYPES = new Set(['camera', 'viewport', 'timeEffects']);
const LOCAL_STALE_DOM_TYPES = new Set(['mousemove', 'pointermove', 'gamepadFrame', 'cursorProjection']);
function localCommandEnvelopeStale(env) {
  if (!env || typeof env.t !== 'string') return false;
  if (LOCAL_STALE_COMMAND_TYPES.has(env.t)) return true;
  return env.t === 'dom' && env.p && env.p.d && LOCAL_STALE_DOM_TYPES.has(env.p.d.type);
}
// A publish whose ACK never lands wedges sentAwaitingAck forever: every later
// tick only deepens the retained reply while presentation freezes at the last
// applied pose — invisible to the in-flight watchdog because nothing is in
// flight. Past this age the ACK is treated as lost (the apply died mid-flight
// or the consumer is hopelessly behind) and the lane re-baselines through the
// existing full-rebuild path instead of waiting indefinitely.
const LOCAL_STALE_ACK_MS = 3000;
// Outstanding (un-ACKed) publish budget. Stop-and-wait on a single reply means
// every ACK round-trip beyond one tick merges into an ever-growing retained
// blob — bigger applies feed back into slower ACKs until the lane collapses
// into multi-second update cycles. A small window keeps per-tick replies
// small under mild congestion; the retained merge still bounds deep stalls.
const LOCAL_MAX_UNACKED = 4;
const LOCAL_TIMER_MS = LOCAL_FIXED_DT * 1000;
// Main-thread presentation heartbeat. Every rAF callback posts one; a stall stops the beats.
// The fence has ~150-300 ms of history, so after that it holds the picture. If the worker kept
// stepping through the stall, the first frame after it would re-seat seconds ahead — the
// freeze-then-teleport jump. Hold the clock instead; the world resumes from the held pose.
const LOCAL_HEARTBEAT_HOLD_MS = 250;
const LOCAL_JOURNAL_SCALAR_STRIDE = 18;
const LOCAL_MERGED_PACK_MAX_RECORDS = 32768;
const LOCAL_MERGED_PACK_MAX_SEGMENTS = 64;
const localClock = {
  enabled: false,
  active: false,
  generation: 0,
  lifecycleGeneration: 0,
  scale: 0,
  accumulator: 0,
  anchorMs: 0,
  deadlineMs: 0,
  timer: null,
  directiveTick: 0,
  replySequence: 0,
  commandSequence: 0,
  pendingCommandSequence: 0,
  // Highest main-lane command batch that completed successfully. Timer and
  // ACK-only replies retain this cumulative watermark so the main lane can
  // release a command flight even after the batch's own reply was coalesced.
  appliedCommandSequence: 0,
  pendingCommands: [],
  pendingAckJournalEnd: 0,
  sentAwaitingAck: false,
  sentClockSequence: 0,
  sentJournalEnd: 0,
  lastHeartbeatAtMs: 0,
  heartbeatHeld: false,
  heartbeatHolds: 0,
  unackedSequences: [],
  ackWatchdogTimer: null,
  staleAckRecoveries: 0,
  shedEventCount: 0,
  shedInputPublishCount: 0,
  shedCommandCount: 0,
  latestReply: null,
  sabArena: null,
  needsRebuildOnSend: false,
  durableCount: 0,
  backpressured: false,
  backpressureEpisodes: 0,
  backpressureSinceMs: 0,
  backpressureTotalMs: 0,
  timerFires: 0,
  stepCount: 0,
  shedStepCount: 0,
  budgetDeferredStepCount: 0,
  commandCount: 0,
  // E1 stall harness state (?simStall=): cycle of ms values, one consumed per local-clock tick.
  stallCycle: null,
  stallIndex: 0,
  stallApplications: 0,
  stallTotalMs: 0,
  // A slow authoritative tick must not leave one promise per timer turn queued
  // behind the shared directive chain. The next tick samples the elapsed wall
  // interval and applies the normal catch-up/shedding policy instead.
  tickQueued: false,
  saveReplyQueued: false,
  stopped: false,
};

function localNowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now() : Date.now();
}

// ---- E1 stall-injection harness (?simStall=) ----------------------------------------
// The faithful emulation of a heavy authoritative step is a BLOCKED worker event loop:
// no timers, no messages, no reply until the stall elapses — exactly what Rapier's
// 458 ms worst step does. Atomics.wait inside a DedicatedWorker blocks without spinning;
// the busy loop is the fallback where SAB/wait is unavailable.
let stallWaitCell = null;

function stallBlock(ms) {
  try {
    if (typeof SharedArrayBuffer === 'function' && typeof Atomics !== 'undefined'
      && typeof Atomics.wait === 'function') {
      if (!stallWaitCell) stallWaitCell = new Int32Array(new SharedArrayBuffer(4));
      Atomics.wait(stallWaitCell, 0, 0, ms);
      return;
    }
  } catch (_) { /* not blockable here — busy wait below */ }
  const until = localNowMs() + ms;
  while (localNowMs() < until) { /* emulate the step's CPU occupancy */ }
}

function runInjectedStall() {
  const cycle = localClock.stallCycle;
  if (!cycle || !cycle.length || localClock.stopped) return;
  const ms = cycle[localClock.stallIndex % cycle.length];
  localClock.stallIndex++;
  if (!(ms > 0)) return;
  const started = localNowMs();
  stallBlock(ms);
  localClock.stallApplications++;
  localClock.stallTotalMs += localNowMs() - started;
}

// Keep timer wakeups on the fixed-step deadline rather than adding a full
// interval after every asynchronous authoritative tick. A late callback (or a
// long tick) skips missed deadlines in one bounded jump; it never spins a
// zero-delay catch-up loop after the existing step cap has shed the debt.
export function nextLocalClockDeadline(deadlineMs, nowMs, intervalMs = LOCAL_TIMER_MS) {
  const interval = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : LOCAL_TIMER_MS;
  const now = Number.isFinite(nowMs) ? nowMs : 0;
  let next = Number.isFinite(deadlineMs) && deadlineMs > 0 ? deadlineMs : now;
  if (next <= now) {
    next += (Math.floor((now - next) / interval) + 1) * interval;
    // Floating-point phase ratios can land exactly on `now` after the skip.
    // Keep the returned deadline strictly future so a delayed worker cannot
    // manufacture a zero-delay timer turn.
    if (next <= now) next += interval;
  }
  return next;
}

function localElapsedSeconds(elapsedMs) {
  const seconds = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs / 1000) : 0;
  return seconds;
}

function resetLocalClockTiming() {
  localClock.anchorMs = localNowMs();
  localClock.deadlineMs = 0;
  // A pause/rate/epoch boundary starts a new wall interval. Preserve only the sub-tick phase;
  // old whole-step debt must not execute at a new rate or after a hidden/paused interval.
  localClock.accumulator %= LOCAL_FIXED_DT;
  if (localClock.accumulator < 1e-12 || LOCAL_FIXED_DT - localClock.accumulator < 1e-12) {
    localClock.accumulator = 0;
  }
}

const LOCAL_DURABLE_KEYS = Object.freeze([
  'events', 'storageOps', 'rpcAcks', 'settingsAcks', 'spawnAcks',
  'commandAcks', 'inputPublishes', 'auxUpserts', 'auxRemovals',
  'spawnInfos', 'warmStubs',
]);
// These are complete read snapshots, unlike one-shot events and lifecycle receipts. Retaining
// every intermediate value makes a slow presentation consumer stop an otherwise healthy sim.
const LOCAL_LATEST_KEYS = Object.freeze(['entityVitals', 'domainUpdates']);
const localReplyLatestRows = new WeakMap();

// A worker-local clock can finish several authoritative ticks before the main
// lane ACKs the previous presentation reply. Keep those ranges without
// copying the typed columns on every tick; the one flattening copy happens
// only when the coalesced reply is actually published. WeakMap metadata keeps
// the wire reply free of implementation-only fields.
const localReplyPackSegments = new WeakMap();
const localReplyNeedsRebuild = new WeakSet();

function localPackIsNonEmpty(pack) {
  if (!pack || !Number.isSafeInteger(pack.count) || pack.count <= 0
    || !Number.isSafeInteger(pack.start) || !Number.isSafeInteger(pack.end)
    || pack.end <= pack.start || pack.end - pack.start !== pack.count) return false;
  const scalarCount = pack.count * LOCAL_JOURNAL_SCALAR_STRIDE;
  return ArrayBuffer.isView(pack.scalars) && pack.scalars.length >= scalarCount
    && ArrayBuffer.isView(pack.kinds) && pack.kinds.length >= pack.count
    && ArrayBuffer.isView(pack.typeIndex) && pack.typeIndex.length >= pack.count;
}

function localReplySegments(reply) {
  if (!reply || typeof reply !== 'object') return [];
  const retained = localReplyPackSegments.get(reply);
  if (retained) return retained;
  return localPackIsNonEmpty(reply.pack) ? [reply.pack] : [];
}

function localReleaseUnpublishedPack(pack) {
  if (!pack || pack.sab !== true || !localClock.sabArena
    || !Number.isSafeInteger(pack.sabSlot)) return;
  try { sabFreePackSlot(localClock.sabArena.header, pack); } catch (_) { /* teardown is best-effort */ }
}

function localDropReplySegments(segments) {
  for (const pack of segments || []) localReleaseUnpublishedPack(pack);
}

function localCanAppendPack(segments, next) {
  if (!localPackIsNonEmpty(next) || !segments || segments.length === 0
    || segments.length >= LOCAL_MERGED_PACK_MAX_SEGMENTS) return false;
  const last = segments[segments.length - 1];
  if (!localPackIsNonEmpty(last) || last.end !== next.start) return false;
  let records = next.count;
  const types = new Set();
  for (const pack of segments) {
    records += pack.count;
    for (const type of Array.isArray(pack.typeTable) ? pack.typeTable : []) {
      if (typeof type === 'string') types.add(type);
    }
  }
  for (const type of Array.isArray(next.typeTable) ? next.typeTable : []) {
    if (typeof type === 'string') types.add(type);
  }
  return records <= LOCAL_MERGED_PACK_MAX_RECORDS && types.size <= 0xffff;
}

function localBuildMergedPack(segments) {
  if (!segments || segments.length < 2) return segments && segments[0];
  let count = 0;
  for (const pack of segments) count += pack.count;
  if (count <= 0 || count > LOCAL_MERGED_PACK_MAX_RECORDS) return null;
  const first = segments[0];
  const last = segments[segments.length - 1];
  const scalars = new Float64Array(count * LOCAL_JOURNAL_SCALAR_STRIDE);
  const kinds = new Uint8Array(count);
  const typeIndex = new Uint16Array(count);
  const typeTable = [];
  const typeIds = new Map();
  const spawnEntityIds = [];
  let offset = 0;
  for (const pack of segments) {
    const scalarLength = pack.count * LOCAL_JOURNAL_SCALAR_STRIDE;
    scalars.set(pack.scalars.subarray(0, scalarLength), offset * LOCAL_JOURNAL_SCALAR_STRIDE);
    kinds.set(pack.kinds.subarray(0, pack.count), offset);
    const sourceTypes = Array.isArray(pack.typeTable) ? pack.typeTable : [];
    for (let i = 0; i < pack.count; i++) {
      const sourceIndex = pack.typeIndex[i];
      const type = typeof sourceTypes[sourceIndex] === 'string' ? sourceTypes[sourceIndex] : '';
      let targetIndex = typeIds.get(type);
      if (targetIndex === undefined) {
        targetIndex = typeTable.length;
        if (targetIndex > 0xffff) return null;
        typeTable.push(type);
        typeIds.set(type, targetIndex);
      }
      typeIndex[offset + i] = targetIndex;
    }
    if (Array.isArray(pack.spawnEntityIds)) spawnEntityIds.push(...pack.spawnEntityIds);
    offset += pack.count;
  }
  return {
    count,
    scalars,
    kinds,
    typeIndex,
    typeTable,
    spawnEntityIds,
    start: first.start,
    end: last.end,
    sab: false,
    sabSlot: null,
  };
}

function localMaterializePack(reply) {
  const segments = localReplyPackSegments.get(reply);
  if (!segments || segments.length < 2) return reply && reply.pack;
  const merged = localBuildMergedPack(segments);
  if (!merged) return null;
  // Copying is complete before releasing any SAB slots. Clone-backed packs
  // simply become eligible for collection here.
  localDropReplySegments(segments);
  reply.pack = merged;
  reply.journalStart = merged.start;
  reply.journalEnd = merged.end;
  localReplyPackSegments.delete(reply);
  return merged;
}

function localArrayLength(reply, key) {
  return Array.isArray(reply && reply[key]) ? reply[key].length : 0;
}

function localDurableCount(reply) {
  let count = 0;
  for (const key of LOCAL_DURABLE_KEYS) count += localArrayLength(reply, key);
  for (const key of LOCAL_LATEST_KEYS) count += localArrayLength(reply, key);
  return count;
}

function localMergeLatestRows(previous, next, key) {
  const incoming = Array.isArray(next?.[key]) ? next[key] : [];
  const spawns = key === 'entityVitals' && Array.isArray(next?.spawnInfos) ? next.spawnInfos : [];
  if (!incoming.length && !spawns.length) return;
  let tables = localReplyLatestRows.get(previous);
  if (!tables) localReplyLatestRows.set(previous, tables = new Map());
  let rows = tables.get(key);
  const identity = key === 'entityVitals'
    ? (row) => Number.isSafeInteger(row?.[0]) ? row[0] : Symbol()
    : (row) => Array.isArray(row?.segs) ? JSON.stringify(row.segs) : Symbol();
  if (!rows) {
    rows = new Map();
    for (const row of previous[key] || []) rows.set(identity(row), row);
    tables.set(key, rows);
  }
  // Spawn/rebuild infos include a fresh complete vitals row. An older occupant's retained
  // scalars must not overwrite that row when a numeric id is retired and reused.
  for (const info of spawns) rows.delete(info?.entityId);
  for (const row of incoming) {
    const id = identity(row);
    // Preserve last-write order. A parent null/reset must stay after every older descendant,
    // while a later descendant may legitimately repopulate that reset container.
    rows.delete(id);
    rows.set(id, row);
  }
  previous[key] = Array.from(rows.values());
}

function localCompletedTickCount(reply) {
  if (!reply || !reply.completedTick || typeof reply.completedTick !== 'object') return 0;
  return Number.isSafeInteger(reply.completedTickCount) && reply.completedTickCount > 0
    ? reply.completedTickCount
    : (Number.isSafeInteger(reply.completedTick.coalescedCount) && reply.completedTick.coalescedCount > 0
      ? reply.completedTick.coalescedCount : 1);
}

function localCompletedFullRebuildCount(reply) {
  if (!reply || !reply.completedTick || typeof reply.completedTick !== 'object') return 0;
  return Number.isSafeInteger(reply.completedFullRebuildCount) && reply.completedFullRebuildCount > 0
    ? reply.completedFullRebuildCount
    : (reply.journalFullRebuild === true ? 1 : 0);
}

function localStampCompletedMetadata(reply) {
  if (!reply || !reply.completedTick || typeof reply.completedTick !== 'object') return reply;
  if (!Number.isSafeInteger(reply.completedTickCount) || reply.completedTickCount <= 0) {
    reply.completedTickCount = 1;
  }
  if (reply.journalFullRebuild === true) {
    if (!Number.isSafeInteger(reply.journalFullRebuildStart)) {
      reply.journalFullRebuildStart = Number.isSafeInteger(reply.journalStart)
        ? reply.journalStart : reply.completedTick.journalStart;
    }
    if (!Number.isSafeInteger(reply.completedFullRebuildCount)
      || reply.completedFullRebuildCount <= 0) {
      reply.completedFullRebuildCount = 1;
    }
  }
  return reply;
}

function localMergeReply(previous, next) {
  if (!previous) return next;
  const previousCompletedCount = localCompletedTickCount(previous);
  const nextCompletedCount = localCompletedTickCount(next);
  const previousFullCount = localCompletedFullRebuildCount(previous);
  const nextFullCount = localCompletedFullRebuildCount(next);
  const previousFullStart = Number.isSafeInteger(previous.journalFullRebuildStart)
    ? previous.journalFullRebuildStart
    : (previous.journalFullRebuild === true ? previous.journalStart : null);
  const nextFullStart = Number.isSafeInteger(next?.journalFullRebuildStart)
    ? next.journalFullRebuildStart
    : (next?.journalFullRebuild === true ? next.journalStart : null);
  const previousRebuildGeneration = Number.isSafeInteger(previous.journalRebuildGeneration)
    ? previous.journalRebuildGeneration : 0;
  const nextRebuildGeneration = Number.isSafeInteger(next?.journalRebuildGeneration)
    ? next.journalRebuildGeneration : 0;
  for (const key of LOCAL_DURABLE_KEYS) {
    const incoming = next && Array.isArray(next[key]) ? next[key] : null;
    if (!incoming || incoming.length === 0) continue;
    if (!Array.isArray(previous[key])) previous[key] = [];
    previous[key].push(...incoming);
  }
  // Drop the oldest background impact effects first. The sim already consumed
  // them, but the main bus still needs save/run lifecycle events and player hits.
  if (Array.isArray(previous.events) && previous.events.length > LOCAL_EVENT_RETAIN_LIMIT) {
    const events = previous.events;
    let remaining = events.length - LOCAL_EVENT_RETAIN_LIMIT;
    let write = 0;
    for (const event of events) {
      if (remaining > 0 && event?.t === 'physics:impact' && event.p?.playerInvolved !== true) {
        remaining -= 1;
      } else {
        events[write++] = event;
      }
    }
    localClock.shedEventCount += events.length - write;
    events.length = write;
  }
  if (Array.isArray(previous.inputPublishes) && previous.inputPublishes.length > LOCAL_INPUT_PUBLISH_RETAIN_LIMIT) {
    const shed = previous.inputPublishes.length - LOCAL_INPUT_PUBLISH_RETAIN_LIMIT;
    previous.inputPublishes.splice(0, shed);
    localClock.shedInputPublishCount = (localClock.shedInputPublishCount || 0) + shed;
  }
  for (const key of LOCAL_LATEST_KEYS) localMergeLatestRows(previous, next, key);
  const previousFullRebuild = previous.journalFullRebuild === true;
  const nextFullRebuild = next?.journalFullRebuild === true;
  const previousSegments = localReplySegments(previous);
  const previousHasPack = previousSegments.length > 0;
  const nextPack = next && next.pack;
  const nextHasPack = localPackIsNonEmpty(nextPack);
  let retainedStart = Number.isSafeInteger(previous.journalStart) ? previous.journalStart : null;
  let retainedEnd = Number.isSafeInteger(previous.journalEnd) ? previous.journalEnd : null;
  let retainedRange = false;

  // Packs are the only replaceable payload that needs special treatment. A
  // contiguous append keeps every spawn/destroy/transform/visual record in
  // sequence, so the main journal can apply one incremental range and ACK its
  // exact end. A gap or bounded-cap overflow falls back to the existing full
  // rebuild path on the next worker tick.
  if (nextHasPack && !nextFullRebuild) {
    if (!previousHasPack) {
      previous.pack = nextPack;
      previous.journalStart = nextPack.start;
      previous.journalEnd = nextPack.end;
      retainedStart = nextPack.start;
      retainedEnd = nextPack.end;
      retainedRange = true;
    } else if (localCanAppendPack(previousSegments, nextPack)) {
      const mergedSegments = previousSegments.slice();
      mergedSegments.push(nextPack);
      localReplyPackSegments.set(previous, mergedSegments);
      retainedStart = mergedSegments[0].start;
      retainedEnd = mergedSegments[mergedSegments.length - 1].end;
      previous.journalStart = retainedStart;
      previous.journalEnd = retainedEnd;
      retainedRange = true;
    } else {
      localDropReplySegments(previousSegments);
      localReplyPackSegments.delete(previous);
      previous.pack = nextPack;
      previous.journalStart = nextPack.start;
      previous.journalEnd = nextPack.end;
      retainedStart = nextPack.start;
      retainedEnd = nextPack.end;
      // Do not publish a latest-only range as incremental. If this merge was
      // already the publish turn (rather than an outstanding ACK), hold the
      // reply until the next tick can carry a real journalRebuild command.
      localReplyNeedsRebuild.add(previous);
      retainedRange = true;
    }
  } else if (nextFullRebuild) {
    localDropReplySegments(previousSegments);
    localReplyPackSegments.delete(previous);
    localReplyNeedsRebuild.delete(previous);
    previous.pack = nextPack;
    if (nextPack && Number.isSafeInteger(nextPack.start) && Number.isSafeInteger(nextPack.end)) {
      previous.journalStart = nextPack.start;
      previous.journalEnd = nextPack.end;
      retainedStart = nextPack.start;
      retainedEnd = nextPack.end;
      retainedRange = true;
    } else {
      if (Number.isSafeInteger(next?.journalStart)) previous.journalStart = next.journalStart;
      if (Number.isSafeInteger(next?.journalEnd)) previous.journalEnd = next.journalEnd;
      retainedStart = Number.isSafeInteger(previous.journalStart) ? previous.journalStart : null;
      retainedEnd = Number.isSafeInteger(previous.journalEnd) ? previous.journalEnd : null;
      retainedRange = retainedStart !== null && retainedEnd !== null;
    }
  } else if (previousHasPack) {
    retainedStart = previousSegments[0].start;
    retainedEnd = previousSegments[previousSegments.length - 1].end;
    retainedRange = true;
  }

  // State markers follow the newest authoritative reply. `pack` and its range
  // are handled above so the marker still spans the retained contiguous range.
  for (const key of [
    'tick', 'arrivalNs', 'journalRebuildGeneration', 'journalValid',
    'stateTick', 'simTime',
    'workMs', 'packMs', 'boundaryMs', 'domainDiffMs', 'domainShipBytes',
    'sendNs', 'clockAccumulator', 'clockDiagnostics',
    'weaponVfxProjectiles', 'timeEffectsSnapshot',
  ]) {
    if (next && next[key] !== undefined) previous[key] = next[key];
  }
  // The key list above intentionally excludes completedTick/pack/range. Keep
  // the latest tick attribution, but widen its journal span to the merged
  // range so presentation can consume and ACK every retained record.
  if (next && next.completedTick !== undefined) {
    previous.completedTick = next.completedTick && typeof next.completedTick === 'object'
      ? { ...next.completedTick } : next.completedTick;
  }
  if (retainedRange && previous.completedTick && typeof previous.completedTick === 'object') {
    previous.completedTick.journalStart = retainedStart;
    previous.completedTick.journalEnd = retainedEnd;
  }
  previous.journalFullRebuild = previousFullRebuild || nextFullRebuild;
  if (previous.journalFullRebuild) {
    previous.journalFullRebuildStart = nextFullRebuild
      ? (nextFullStart ?? retainedStart)
      : (previousFullStart ?? retainedStart);
    previous.completedFullRebuildCount = previousFullCount + nextFullCount;
  } else {
    previous.journalFullRebuildStart = null;
    previous.completedFullRebuildCount = 0;
  }
  previous.journalRebuildGeneration = Math.max(previousRebuildGeneration, nextRebuildGeneration);
  if (previousCompletedCount + nextCompletedCount > 0) {
    previous.completedTickCount = previousCompletedCount + nextCompletedCount;
  }
  previous.commandSequence = Math.max(
    Number.isSafeInteger(previous.commandSequence) ? previous.commandSequence : 0,
    Number.isSafeInteger(next?.commandSequence) ? next.commandSequence : 0,
  );
  previous.clockSequence = next?.clockSequence || previous.clockSequence;
  previous.kind = next?.kind || previous.kind;
  previous.seq = next?.seq || previous.seq;
  return previous;
}

function localSetBackpressure(value) {
  const next = value === true;
  if (next && !localClock.backpressured) {
    localClock.backpressureEpisodes++;
    localClock.backpressureSinceMs = localNowMs();
  } else if (!next && localClock.backpressured) {
    localClock.backpressureTotalMs += Math.max(0, localNowMs() - localClock.backpressureSinceMs);
    localClock.backpressureSinceMs = 0;
  }
  localClock.backpressured = next;
}

function localRefreshDurablePressure() {
  localClock.durableCount = localDurableCount(localClock.latestReply);
  localSetBackpressure(localClock.durableCount >= LOCAL_DURABLE_LIMIT);
  const diagnostics = localClock.latestReply?.clockDiagnostics;
  if (diagnostics) {
    diagnostics.backpressured = localClock.backpressured;
    diagnostics.retainedRows = localClock.durableCount;
    diagnostics.retainedVitals = localArrayLength(localClock.latestReply, 'entityVitals');
    diagnostics.retainedDomainUpdates = localArrayLength(localClock.latestReply, 'domainUpdates');
    diagnostics.backpressureEpisodes = localClock.backpressureEpisodes;
  }
}

// An active ACK is already a presentation boundary. If the worker accumulated
// a contiguous latest reply while the previous one was in flight, publish that
// retained reply now instead of waiting for another timer wake. A journal gap,
// rebuild marker, or durable-side-channel overflow must stay on the existing
// authoritative rebuild/tick path; publishing one of those ranges directly
// would make the main journal lose records. The returned action is kept pure so
// the wire fixture can exercise the same safety decision without a wall-clock
// dependency.
function localAckReplyAction(reply, {
  ackJournalEnd = 0,
  active = false,
  scale = 0,
  durableCount = 0,
  needsRebuild = false,
} = {}) {
  if (!reply || !active || !(scale > 0)) return 'schedule';
  if (needsRebuild || durableCount >= LOCAL_DURABLE_LIMIT) return 'schedule-rebuild';
  if (Number.isSafeInteger(reply.journalStart) && reply.journalStart > ackJournalEnd) {
    // The retained window starts past the last applied-watermark ack: the
    // previous publish is still mid-apply on main (a paced visit spreads a
    // dense range over several presents). That is ordinary backpressure, not
    // a dropped hole — genuine drops are already flagged by needsRebuild or
    // the merge cap. Keep retaining; rebuilds issued here self-amplify (each
    // full republish congests the wire further and re-arms this check).
    return 'schedule';
  }
  return 'publish';
}

async function publishRetainedReplyAfterAck(ackJournalEnd) {
  const reply = localClock.latestReply;
  const action = localAckReplyAction(reply, {
    ackJournalEnd,
    active: localClock.active,
    scale: localClock.scale,
    durableCount: localDurableCount(reply),
    needsRebuild: localClock.needsRebuildOnSend || localReplyNeedsRebuild.has(reply),
  });
  if (action !== 'publish') {
    if (reply && action === 'schedule-rebuild') localClock.needsRebuildOnSend = true;
    return false;
  }
  localClock.latestReply = null;
  await publishLocalReply(reply);
  return true;
}

function postTickLikeReply(reply) {
  reply.sendNs = Number(nowNs());
  if (sabEnv) {
    const { msg: wire, binTail } = encodeReplyForSab(reply);
    sabEnvelopePostReply(sabEnv, wire, SAB_ENV_KIND.TICK_DONE, binTail);
    return;
  }
  const transfers = [];
  if (reply.pack) {
    for (const col of [reply.pack.scalars, reply.pack.kinds, reply.pack.typeIndex]) {
      if (col && col.byteLength
        && !(typeof SharedArrayBuffer === 'function' && col.buffer instanceof SharedArrayBuffer)) {
        transfers.push(col.buffer);
      }
    }
  }
  self.postMessage(reply, transfers);
}

function localDisarmStaleAckWatchdog() {
  if (localClock.ackWatchdogTimer === null) return;
  clearTimeout(localClock.ackWatchdogTimer);
  localClock.ackWatchdogTimer = null;
}

function localArmStaleAckWatchdog(clockSequence) {
  localDisarmStaleAckWatchdog();
  localClock.ackWatchdogTimer = setTimeout(() => {
    localClock.ackWatchdogTimer = null;
    if (localClock.stopped || !localClock.sentAwaitingAck
      || localClock.unackedSequences[0] !== clockSequence) return;
    // The publish's ACK never landed — the apply died mid-flight or the
    // consumer is hopelessly behind. Continuing to retain either hard-stops
    // the clock at the durable limit or leaves presentation frozen at the
    // last applied pose while the sim runs blind. Re-baseline instead: the
    // full rebuild rides the very next tick, carries every retained receipt,
    // and lands as an idempotent replace even when the original apply is
    // still queued on main. A late duplicate ACK is sequence-rejected below.
    localClock.unackedSequences.length = 0;
    localClock.sentAwaitingAck = false;
    localClock.needsRebuildOnSend = true;
    localClock.staleAckRecoveries++;
    localSetBackpressure(false);
    scheduleLocalClock();
  }, LOCAL_STALE_ACK_MS);
}

function localJournalRebuildEnvelope() {
  return {
    t: 'rpc',
    seq: ++localClock.commandSequence,
    p: { id: `local-clock-rebuild-${localClock.commandSequence}`, op: 'journalRebuild', payload: {} },
  };
}

async function publishLocalReply(reply) {
  localMaterializePack(reply);
  localReplyNeedsRebuild.delete(reply);
  localClock.replySequence++;
  reply.kind = 'clockTick';
  reply.clockSequence = localClock.replySequence;
  reply.seq = `clock-${localClock.replySequence}`;
  localClock.unackedSequences.push(reply.clockSequence);
  localClock.sentAwaitingAck = true;
  localClock.sentClockSequence = reply.clockSequence;
  localClock.sentJournalEnd = Number.isSafeInteger(reply.journalEnd) ? reply.journalEnd : 0;
  if (localClock.unackedSequences.length === 1) localArmStaleAckWatchdog(reply.clockSequence);
  localClock.latestReply = null;
  localReplyLatestRows.delete(reply);
  localClock.durableCount = 0;
  localSetBackpressure(false);
  postTickLikeReply(reply);
}

async function runLocalClockTick(force = false, explicitSteps = 0, publishReply = true) {
  if (!localClock.enabled || localClock.stopped) return;
  // The injected stall is part of this tick's wall cost: it elapses BEFORE the elapsed
  // interval is measured, so the accumulator owes the blocked time and the existing
  // catch-up/shed policy sees exactly what a heavy step produces.
  runInjectedStall();
  const now = localNowMs();
  const hasExplicit = Number.isSafeInteger(explicitSteps) && explicitSteps > 0;
  if (!force && !hasExplicit && localClock.lastHeartbeatAtMs > 0
    && now - localClock.lastHeartbeatAtMs > LOCAL_HEARTBEAT_HOLD_MS) {
    // The page cannot present. Do not advance the world into a picture it will later jump
    // across: drop the stalled wall interval, keep the pose, and wait for the next beat.
    if (!localClock.heartbeatHeld) {
      localClock.heartbeatHeld = true;
      localClock.heartbeatHolds += 1;
    }
    localClock.anchorMs = now;
    localClock.accumulator = 0;
    scheduleLocalClock();
    return;
  }
  const elapsedMs = localClock.anchorMs > 0 ? Math.max(0, now - localClock.anchorMs) : 0;
  if (localClock.backpressured && localClock.sentAwaitingAck && !force) return;
  // A timer that fires while the presentation side is backpressured must not
  // discard the wall interval it was unable to consume. Leave anchorMs at the
  // last completed authoritative call until an ACK releases the guard; that
  // call then gets one bounded catch-up window and the existing shed policy.
  localClock.anchorMs = now;

  let steps = 0;
  let shedSteps = 0;
  const hasExplicitSteps = Number.isSafeInteger(explicitSteps) && explicitSteps > 0;
  if (hasExplicitSteps) {
    steps = Math.min(LOCAL_MAX_STEPS, explicitSteps);
  } else if (localClock.active && localClock.scale > 0) {
    localClock.accumulator += localElapsedSeconds(elapsedMs) * localClock.scale;
    // Cap carried simulation debt, not the work consumed by this one timer turn. A late wake
    // must not permanently slow the sim by dropping every tick beyond its small work batch.
    if (localClock.accumulator > LOCAL_MAX_DEBT_SECONDS) {
      shedSteps = Math.max(0, Math.ceil(
        (localClock.accumulator - LOCAL_MAX_DEBT_SECONDS) / LOCAL_FIXED_DT - 1e-9,
      ));
      localClock.accumulator -= shedSteps * LOCAL_FIXED_DT;
    }
    const hitch = elapsedMs > LOCAL_FIXED_DT * 1000 * 6.5;
    const cap = hitch ? LOCAL_HITCH_CATCHUP_STEPS : LOCAL_MAX_STEPS;
    while (localClock.accumulator + 1e-12 >= LOCAL_FIXED_DT && steps < cap) {
      localClock.accumulator -= LOCAL_FIXED_DT;
      steps++;
    }
    if (localClock.accumulator < 1e-12) {
      localClock.accumulator = 0;
    }
  }

  localClock.stepCount += steps;
  localClock.shedStepCount += shedSteps;

  const commands = localClock.pendingCommands.splice(0);
  const commandSequence = localClock.pendingCommandSequence;
  localClock.pendingCommandSequence = 0;
  const coalescedForPublish = localClock.needsRebuildOnSend;
  if (coalescedForPublish) commands.push(localJournalRebuildEnvelope());
  const ackJournalEnd = localClock.pendingAckJournalEnd;
  localClock.pendingAckJournalEnd = 0;
  const needsReply = force || steps > 0 || commands.length > 0 || ackJournalEnd > 0;
  if (!needsReply) return;

  let reply = await tick({
    kind: 'tick',
    seq: `local-directive-${++localClock.directiveTick}`,
    tick: localClock.directiveTick,
    steps,
    workBudgetMs: hasExplicitSteps ? undefined : LOCAL_WORK_BUDGET_MS,
    commands,
    ackJournalEnd,
    generation: localClock.lifecycleGeneration,
  });
  // A budget limit is a yield between steps. Restore the part of the reserved
  // debt that did not execute. The next turn still applies the normal debt cap.
  const executed = Number.isSafeInteger(reply.stepsExecuted) ? reply.stepsExecuted : steps;
  if (executed < steps) {
    const deferred = steps - executed;
    localClock.stepCount -= deferred;
    if (!hasExplicitSteps) {
      localClock.accumulator += deferred * LOCAL_FIXED_DT;
      localClock.budgetDeferredStepCount += deferred;
    }
  }
  refreshLocalClockScale();
  // Only advance the watermark after tick() returns. A thrown authoritative
  // batch must never look consumed to the main lane.
  if (commandSequence > localClock.appliedCommandSequence) {
    localClock.appliedCommandSequence = commandSequence;
  }
  reply.kind = 'clockTick';
  reply.clockAccumulator = localClock.accumulator;
  reply.commandSequence = localClock.appliedCommandSequence;
  reply.clockShedSteps = shedSteps;
  // Keep this bounded diagnostic block on every published local-clock reply.
  // It is intentionally scalar-only so a stuck loading route can distinguish
  // an inactive/scale-zero clock from transport churn without retaining a
  // per-tick history or changing simulation state.
  reply.clockDiagnostics = {
    active: localClock.active,
    scale: localClock.scale,
    accumulator: localClock.accumulator,
    timerPending: localClock.timer !== null,
    timerFires: localClock.timerFires,
    directiveTicks: localClock.directiveTick,
    steps: localClock.stepCount,
    shedSteps: localClock.shedStepCount,
    budgetDeferredSteps: localClock.budgetDeferredStepCount,
    commands: localClock.commandCount,
    pendingCommands: localClock.pendingCommands.length,
    appliedCommandSequence: localClock.appliedCommandSequence,
    awaitingAck: localClock.sentAwaitingAck,
    unacked: localClock.unackedSequences.length,
    shedEvents: localClock.shedEventCount || 0,
    shedInputPublishes: localClock.shedInputPublishCount || 0,
    shedCommands: localClock.shedCommandCount || 0,
    staleAckRecoveries: localClock.staleAckRecoveries || 0,
    stallApplications: localClock.stallApplications || 0,
    stallTotalMs: localClock.stallTotalMs || 0,
    heartbeatHolds: localClock.heartbeatHolds || 0,
    heartbeatHeld: localClock.heartbeatHeld === true,
    heartbeatAgeMs: localClock.lastHeartbeatAtMs > 0
      ? Math.max(0, now - localClock.lastHeartbeatAtMs) : null,
    backpressured: localClock.backpressured,
    backpressureEpisodes: localClock.backpressureEpisodes,
    backpressureMs: localClock.backpressureTotalMs + (localClock.backpressured
      ? Math.max(0, now - localClock.backpressureSinceMs) : 0),
  };
  localStampCompletedMetadata(reply);
  if (coalescedForPublish) reply.journalFullRebuild = true;
  if (coalescedForPublish) {
    reply.journalFullRebuildStart = Number.isSafeInteger(reply.journalStart)
      ? reply.journalStart : reply.completedTick?.journalStart;
    reply.completedFullRebuildCount = Math.max(1, localCompletedFullRebuildCount(reply));
  }
  localClock.needsRebuildOnSend = false;

  // An acknowledgement can require one authoritative journal trim even while
  // the game is paused. When no coalesced presentation/durable reply is
  // waiting, that trim is an internal maintenance tick: emitting another
  // clockTick would make the main ACK feed back into this branch forever.
  if (!publishReply && !localClock.sentAwaitingAck && !localClock.latestReply
    && !localArrayLength(reply, 'events') && !localArrayLength(reply, 'storageOps')) return;

  if (localClock.unackedSequences.length >= LOCAL_MAX_UNACKED) {
    // Pipeline saturated — fold this tick into the retained reply. Merging
    // starts only once several replies are outstanding, which is what keeps
    // a mildly congested lane shipping small per-tick replies instead of
    // collapsing into a growing blob.
    localClock.latestReply = localMergeReply(localClock.latestReply, reply);
    localRefreshDurablePressure();
  } else {
    if (localClock.latestReply) {
      localClock.latestReply = localMergeReply(localClock.latestReply, reply);
      if (coalescedForPublish) localClock.latestReply.journalFullRebuild = true;
      if (!coalescedForPublish && localReplyNeedsRebuild.has(localClock.latestReply)) {
        // A bounded merge can fail only when the outstanding range is no
        // longer safely incremental. Retain its durable payload, then let the
        // next worker tick carry the real rebuild RPC before publishing it.
        localClock.needsRebuildOnSend = true;
        return;
      }
      reply = localClock.latestReply;
    }
    await publishLocalReply(reply);
  }
}

function requestAsyncSaveReply() {
  if (!localClock.enabled || localClock.stopped || localClock.saveReplyQueued
    || (localClock.active && localClock.scale > 0)) return;
  const generation = localClock.lifecycleGeneration;
  localClock.saveReplyQueued = true;
  let published = false;
  chain = chain.then(async () => {
    if (localClock.stopped || generation !== localClock.lifecycleGeneration
      || (localClock.active && localClock.scale > 0) || !hasPendingDurable()) return;
    // Force a reply, never a simulation step. The existing reply/ACK coalescer owns ordering.
    await runLocalClockTick(true);
    published = true;
  }).catch((error) => {
    self.postMessage({ kind: 'error', message: error?.message || String(error), stack: error?.stack || null });
  }).finally(() => {
    localClock.saveReplyQueued = false;
    // Another async save may have settled after tick() drained its payload but before
    // publication finished. Recheck actual queued data; an empty ACK never re-arms this.
    if (published && generation === localClock.lifecycleGeneration && hasPendingDurable()) requestAsyncSaveReply();
  });
}

function scheduleLocalClock() {
  if (!localClock.enabled || localClock.stopped || !localClock.active
    || localClock.scale <= 0 || localClock.timer !== null || localClock.backpressured) return;
  const now = localNowMs();
  // Include authoritative work since the last batch began. If that work itself left a whole
  // tick owed, yield to one new task promptly instead of waiting another fixed interval.
  const pendingDebt = localClock.accumulator
    + localElapsedSeconds(now - localClock.anchorMs) * localClock.scale;
  const hasWholeDebt = pendingDebt + 1e-12 >= LOCAL_FIXED_DT;
  if (!hasWholeDebt) localClock.deadlineMs = nextLocalClockDeadline(localClock.deadlineMs, now);
  const delayMs = hasWholeDebt ? 0 : Math.max(0, localClock.deadlineMs - now);
  const generation = localClock.generation;
  localClock.timer = setTimeout(() => {
    localClock.timer = null;
    localClock.timerFires++;
    if (localClock.stopped || !localClock.active || generation !== localClock.generation) return;
    localClock.deadlineMs = nextLocalClockDeadline(localClock.deadlineMs, localNowMs());
    // Keep at most one timer-driven tick queued. When the worker is busy, a
    // timer per 16.67 ms would create an unbounded promise queue and turn a
    // bounded catch-up policy into a delayed burst. The next run measures the
    // whole elapsed interval and consumes another bounded batch from its capped debt.
    if (localClock.tickQueued) return;
    localClock.tickQueued = true;
    chain = chain.then(() => runLocalClockTick(false)).catch((error) => {
      self.postMessage({ kind: 'error', message: error?.message || String(error), stack: error?.stack || null });
    }).finally(() => {
      localClock.tickQueued = false;
      scheduleLocalClock();
    });
  }, delayMs);
}

function refreshLocalClockScale(fallback) {
  const authoritative = effectiveTimeScale();
  const next = Number.isFinite(authoritative) ? authoritative
    : Number.isFinite(fallback) ? Math.max(0, fallback) : localClock.scale;
  if (next !== localClock.scale) {
    localClock.scale = next;
    // The pause interval is not catch-up debt. Keep the fractional fixed-step phase, but
    // start the new rate at this boundary instead of charging hidden/paused wall time.
    resetLocalClockTiming();
  }
}

async function handleLocalClockControl(msg) {
  if (!localClock.enabled || localClock.stopped) return;
  if (Number.isSafeInteger(msg.lifecycleGeneration) && msg.lifecycleGeneration < localClock.lifecycleGeneration) return;
  localClock.generation = Number.isSafeInteger(msg.generation) ? msg.generation : localClock.generation + 1;
  localClock.lifecycleGeneration = Number.isSafeInteger(msg.lifecycleGeneration)
    ? msg.lifecycleGeneration : localClock.lifecycleGeneration;
  applyPresentationTimeEffects(msg.timeEffectsSnapshot, localClock.lifecycleGeneration);
  refreshLocalClockScale(msg.timeScale);
  localClock.active = msg.active === true;
  resetLocalClockTiming();
  if (localClock.timer !== null) {
    clearTimeout(localClock.timer);
    localClock.timer = null;
  }
  if (localClock.active) scheduleLocalClock();
}

// The ACK half of a clockAck/clockCommand touches lane bookkeeping only — it
// never mutates the sim host, so it does not need the serial directive chain's
// FIFO protection. Applying it the moment the message arrives keeps the
// publish pipeline moving while a heavy tick batch owns the chain; the
// chained handler re-checks the sequence idempotently.
async function localReleaseClockAck(clockSequence, ackJournalEnd) {
  if (Number.isSafeInteger(ackJournalEnd)) {
    localClock.pendingAckJournalEnd = Math.max(localClock.pendingAckJournalEnd, ackJournalEnd);
  }
  if (!Number.isSafeInteger(clockSequence)) return false;
  // ACKs are cumulative: applied-watermark seq N covers every published reply
  // at or below N. Clearing only the covered prefixes frees pipeline slots;
  // a stale ACK for a superseded publish clears nothing.
  let cleared = 0;
  while (localClock.unackedSequences.length
    && localClock.unackedSequences[0] <= clockSequence) {
    localClock.unackedSequences.shift();
    cleared++;
  }
  if (!cleared) return false;
  if (localClock.unackedSequences.length === 0) {
    localClock.sentAwaitingAck = false;
    localDisarmStaleAckWatchdog();
  } else {
    // The watchdog tracks the oldest outstanding publish — re-arm on the new
    // head so a freed pipeline still catches a lost ACK for later replies.
    localArmStaleAckWatchdog(localClock.unackedSequences[0]);
  }
  const ackEnd = Number.isSafeInteger(ackJournalEnd) ? ackJournalEnd : localClock.sentJournalEnd;
  // The retained window starting past ackEnd is applied-watermark
  // backpressure (the paced visit spreads a dense range over presents), not
  // a dropped hole — arming needsRebuildOnSend here re-minted a full
  // republish on every ACK under load, which is the rebuild-storm loop.
  // True drops reach this path through localReplyNeedsRebuild instead.
  localSetBackpressure(false);
  return await publishRetainedReplyAfterAck(ackEnd);
}

async function handleLocalClockAck(msg) {
  if (!localClock.enabled || localClock.stopped) return;
  let retainedReplyPublished = false;
  if (Number.isSafeInteger(msg.ackJournalEnd)) {
    localClock.pendingAckJournalEnd = Math.max(localClock.pendingAckJournalEnd, msg.ackJournalEnd);
  }
  // localReleaseClockAck clears whichever pipeline slots this cumulative ACK
  // covers — older-than-newest sequences still free real slots.
  retainedReplyPublished = await localReleaseClockAck(msg.clockSequence, msg.ackJournalEnd);
  const needsImmediateMaintenance = !localClock.active || localClock.scale <= 0;
  if (localClock.latestReply && !retainedReplyPublished) {
    if (needsImmediateMaintenance) await runLocalClockTick(true);
    else scheduleLocalClock();
  } else if (localClock.pendingAckJournalEnd > 0) {
    // Consume the main-side journal cursor once without manufacturing a fresh
    // presentation reply. A paused lane therefore settles after one ACK. An
    // active lane lets its next real timer tick carry the trim, avoiding an
    // ACK-only zero-step host pack.
    if (needsImmediateMaintenance) await runLocalClockTick(true, 0, false);
    else scheduleLocalClock();
  }
  scheduleLocalClock();
}

async function handleLocalClockCommand(msg) {
  if (!localClock.enabled || localClock.stopped) return;
  if (Number.isSafeInteger(msg.lifecycleGeneration) && msg.lifecycleGeneration < localClock.lifecycleGeneration) return;
  let retainedReplyPublished = false;
  localClock.commandCount++;
  if (Number.isSafeInteger(msg.lifecycleGeneration)) {
    if (msg.lifecycleGeneration !== localClock.lifecycleGeneration) resetLocalClockTiming();
    localClock.lifecycleGeneration = msg.lifecycleGeneration;
  }
  applyPresentationTimeEffects(msg.timeEffectsSnapshot, localClock.lifecycleGeneration);
  refreshLocalClockScale(msg.timeScale);
  if (Number.isSafeInteger(msg.ackJournalEnd)) {
    localClock.pendingAckJournalEnd = Math.max(localClock.pendingAckJournalEnd, msg.ackJournalEnd);
  }
  if (Number.isSafeInteger(msg.ackClockSequence)) {
    retainedReplyPublished = await localReleaseClockAck(msg.ackClockSequence, msg.ackJournalEnd);
  }
  if (Number.isSafeInteger(msg.commandSequence)) {
    localClock.pendingCommandSequence = Math.max(localClock.pendingCommandSequence, msg.commandSequence);
  }
  if (Array.isArray(msg.commands) && msg.commands.length) {
    localClock.pendingCommands.push(...msg.commands);
    if (localClock.pendingCommands.length > LOCAL_PENDING_COMMAND_LIMIT) {
      const kept = localClock.pendingCommands.filter((env) => !localCommandEnvelopeStale(env));
      localClock.shedCommandCount = (localClock.shedCommandCount || 0)
        + (localClock.pendingCommands.length - kept.length);
      localClock.pendingCommands = kept;
    }
  }
  const explicitSteps = Number.isSafeInteger(msg.steps) ? msg.steps : 0;
  // A command arriving while the autonomous clock is active can join the next
  // fixed-step tick. Calling runLocalClockTick(true) here made every rAF cursor
  // projection and input batch pay a second zero-step whole-host pack. Paused
  // or inactive clocks still flush immediately so menus, load/boot RPCs, and
  // lifecycle transitions cannot wait on a timer that is intentionally off.
  if (!localClock.active || localClock.scale <= 0 || explicitSteps > 0) {
    await runLocalClockTick(true, explicitSteps);
  } else if (!retainedReplyPublished) {
    scheduleLocalClock();
  }
  scheduleLocalClock();
}

// One directive, one dispatch — shared by the pre-arm message path and the
// post-arm ring park loop. Returns true only for 'shutdown'.
async function dispatchDirective(msg) {
  try {
    if (msg.kind === 'init') {
      // Simulation publishes authored source strings; locale selection belongs to the main
      // presentation owner. Optional keyed catalogs must not delay this realm's init.
      await loadModelTruthCensus(msg.modelTruthCensusUrl);
      const result = await init(msg);
      localClock.enabled = msg.clockMode === 'worker-local';
      localClock.stopped = false;
      // E1 stall harness (?simStall=): the main lane ships the requested cycle on init.
      localClock.stallCycle = Array.isArray(msg.simStall) && msg.simStall.length
        ? msg.simStall : null;
      localClock.stallIndex = 0;
      localClock.stallApplications = 0;
      localClock.stallTotalMs = 0;
      localClock.scale = Number.isFinite(msg.timeScale) ? Math.max(0, msg.timeScale) : 0;
      refreshLocalClockScale(msg.timeScale);
      localClock.lifecycleGeneration = Number.isSafeInteger(msg.generation) ? msg.generation : 0;
      localClock.anchorMs = localNowMs();
      localClock.deadlineMs = 0;
      self.postMessage({ kind: 'ready', seq: msg.seq, ...result });
      // Arm the envelope rings only after 'ready' posts — the channel contract
      // flips post-arm and stray pre-arm messages must drain first.
      const arena = bindSabJournalArena(msg.sabArena);
      localClock.sabArena = arena;
      if (arena) {
        sabEnv = bindSabEnvelopeChannel(arena);
        if (sabEnv) void sabParkLoop();
      }
    } else if (msg.kind === 'clockControl') {
      await handleLocalClockControl(msg);
    } else if (msg.kind === 'clockCommand') {
      await handleLocalClockCommand(msg);
    } else if (msg.kind === 'clockAck') {
      await handleLocalClockAck(msg);
    } else if (msg.kind === 'tick') {
      const reply = await tick(msg);
      reply.kind = 'tickDone';
      reply.seq = msg.seq;
      postTickLikeReply(reply);
    } else if (msg.kind === 'finalize') {
      const result = await finalize();
      self.postMessage({ kind: 'done', seq: msg.seq, ...result });
    } else if (msg.kind === 'shutdown') {
      localClock.stopped = true;
      localClock.active = false;
      localDisarmStaleAckWatchdog();
      if (localClock.timer !== null) {
        clearTimeout(localClock.timer);
        localClock.timer = null;
      }
      localClock.deadlineMs = 0;
      shutdown();
      // storageOps rides every reply kind — writes must not wait for a
      // tickDone that may never come (shutdown races a queued autosave).
      self.postMessage({ kind: 'bye', seq: msg.seq, storageOps: drainStorageOps() });
      return true;
    }
  } catch (error) {
    self.postMessage({
      kind: 'error',
      seq: msg && msg.seq,
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? String(error.stack) : null,
    });
  }
  return false;
}

async function waitForSabCommand(seen) {
  // Atomics.wait blocks the worker event loop, which would also block the
  // worker-local fixed clock. Use waitAsync when available and a small timer
  // yield as the compatibility path for browsers that expose SAB without the
  // async primitive.
  if (!localClock.enabled) {
    sabEnvelopeWaitCommand(sabEnv, seen);
    return;
  }
  if (typeof Atomics.waitAsync === 'function') {
    const result = Atomics.waitAsync(sabEnv.header, SAB_CMD_SEQ_INDEX, seen);
    if (result && result.async && result.value && typeof result.value.then === 'function') {
      await result.value;
      return;
    }
    // A non-async result means the sequence already changed. Returning from
    // sabParkLoop immediately would spin in promise microtasks and starve the
    // worker's timer and message tasks. Yield one timer turn before the next
    // drain; the command is still observed on that next pass.
    await new Promise((resolve) => setTimeout(resolve, 0));
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 4));
}

// Post-arm pump: drain ready command cells, dispatch each in FIFO, then park
// until the next writer store. The local-clock path yields while parked so
// its timer can continue to advance the authoritative worker.
async function sabParkLoop() {
  for (;;) {
    // `seen` is read BEFORE the drain — a post landing mid-dispatch is already
    // counted and must make the next wait fall through to another drain pass.
    const seen = Atomics.load(sabEnv.header, SAB_CMD_SEQ_INDEX);
    const batch = [];
    sabEnvelopeDrain(sabEnv, 'cmd', (msg) => batch.push(msg));
    for (const msg of batch) {
      if (localClock.enabled) {
        // Timer-driven ticks and SAB commands share this chain. Without this
        // handoff, a command can mutate the host while a timer tick is in
        // progress, violating the fixed FIFO ordering of the transport.
        let shouldStop = false;
        chain = chain.then(async () => {
          shouldStop = await dispatchDirective(msg);
          return shouldStop;
        });
        await chain;
        if (shouldStop) return;
      } else if (await dispatchDirective(msg)) return;
    }
    await waitForSabCommand(seen);
  }
}

// Kept as named exports for the deterministic transport fixture. The browser
// worker entrypoint still uses the same functions above; exporting these pure
// merge seams does not add a runtime message or a second simulation path.
export { localMergeReply, localMaterializePack, localAckReplyAction };

self.onmessage = (event) => {
  const msg = event && event.data;
  if (!msg || typeof msg !== 'object') return;
  // Presentation heartbeat: lane bookkeeping only, never parked behind the serial chain. A beat
  // resumes a held clock from the held pose without charging the stalled wall interval.
  if (msg.kind === 'laneHeartbeat') {
    const now = localNowMs();
    localClock.lastHeartbeatAtMs = now;
    if (localClock.heartbeatHeld) {
      localClock.heartbeatHeld = false;
      localClock.anchorMs = now;
      localClock.accumulator = 0;
      scheduleLocalClock();
    }
    return;
  }
  // ACK release is host-independent lane bookkeeping — run it on receipt
  // instead of parking it behind an in-flight tick batch on the serial chain.
  // The chained handler re-applies it through the same sequence check, so a
  // double pass is a no-op; only the retained publish must not wait.
  if (msg.kind === 'clockAck' || msg.kind === 'clockCommand') {
    if (localClock.enabled && !localClock.stopped) {
      const seq = msg.kind === 'clockAck' ? msg.clockSequence : msg.ackClockSequence;
      const early = localReleaseClockAck(seq, msg.ackJournalEnd);
      early.catch((error) => {
        self.postMessage({
          kind: 'error', seq: msg && msg.seq,
          message: error && error.message ? error.message : String(error),
          stack: error && error.stack ? String(error.stack) : null,
        });
      });
    }
  }
  chain = chain.then(() => dispatchDirective(msg));
};

self.postMessage({ kind: 'boot', workerDataPresent: false });
