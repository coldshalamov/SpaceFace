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
import {
  bindSabEnvelopeChannel,
  encodeReplyForSab,
  sabEnvelopeDrain,
  sabEnvelopePostReply,
  sabEnvelopeWaitCommand,
  SAB_CMD_SEQ_INDEX,
  SAB_ENV_KIND,
} from '../../scripts/lib/simSabEnvelope.mjs';

const { tick, init, finalize, shutdown, drainStorageOps, applyPresentationTimeEffects, effectiveTimeScale } = createSimHost();

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
const LOCAL_HITCH_CATCHUP_STEPS = 2;
const LOCAL_DURABLE_LIMIT = 4096;
const LOCAL_TIMER_MS = LOCAL_FIXED_DT * 1000;
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
  latestReply: null,
  sabArena: null,
  needsRebuildOnSend: false,
  durableCount: 0,
  backpressured: false,
  timerFires: 0,
  stepCount: 0,
  shedStepCount: 0,
  commandCount: 0,
  // A slow authoritative tick must not leave one promise per timer turn queued
  // behind the shared directive chain. The next tick samples the elapsed wall
  // interval and applies the normal catch-up/shedding policy instead.
  tickQueued: false,
  stopped: false,
};

function localNowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now() : Date.now();
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

function localClampFrameSeconds(elapsedMs) {
  const seconds = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs / 1000) : 0;
  return Math.min(seconds, 0.25);
}

const LOCAL_DURABLE_KEYS = Object.freeze([
  'events', 'storageOps', 'rpcAcks', 'settingsAcks', 'spawnAcks',
  'commandAcks', 'inputPublishes', 'auxUpserts', 'auxRemovals',
  'domainUpdates', 'spawnInfos', 'entityVitals', 'warmStubs',
]);

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
  return count;
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
    'workMs', 'packMs', 'sendNs', 'clockAccumulator', 'clockDiagnostics',
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

function localRefreshDurablePressure() {
  localClock.durableCount = localDurableCount(localClock.latestReply);
  localClock.backpressured = localClock.durableCount >= LOCAL_DURABLE_LIMIT;
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
    return 'schedule-rebuild';
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
  localClock.sentAwaitingAck = true;
  localClock.sentClockSequence = reply.clockSequence;
  localClock.sentJournalEnd = Number.isSafeInteger(reply.journalEnd) ? reply.journalEnd : 0;
  localClock.latestReply = null;
  localClock.durableCount = 0;
  localClock.backpressured = false;
  postTickLikeReply(reply);
}

async function runLocalClockTick(force = false, explicitSteps = 0, publishReply = true) {
  if (!localClock.enabled || localClock.stopped) return;
  const now = localNowMs();
  const elapsedMs = localClock.anchorMs > 0 ? Math.max(0, now - localClock.anchorMs) : 0;
  if (localClock.backpressured && localClock.sentAwaitingAck && !force) return;
  // A timer that fires while the presentation side is backpressured must not
  // discard the wall interval it was unable to consume. Leave anchorMs at the
  // last completed authoritative call until an ACK releases the guard; that
  // call then gets one bounded catch-up window and the existing shed policy.
  localClock.anchorMs = now;

  let steps = 0;
  let shedSteps = 0;
  if (Number.isSafeInteger(explicitSteps) && explicitSteps > 0) {
    steps = Math.min(LOCAL_MAX_STEPS, explicitSteps);
  } else if (localClock.active && localClock.scale > 0) {
    localClock.accumulator += localClampFrameSeconds(elapsedMs) * localClock.scale;
    const hitch = elapsedMs > LOCAL_FIXED_DT * 1000 * 6.5;
    const cap = hitch ? LOCAL_HITCH_CATCHUP_STEPS : LOCAL_MAX_STEPS;
    while (localClock.accumulator >= LOCAL_FIXED_DT && steps < cap) {
      localClock.accumulator -= LOCAL_FIXED_DT;
      steps++;
    }
    if (localClock.accumulator >= LOCAL_FIXED_DT) {
      const whole = Math.floor(localClock.accumulator / LOCAL_FIXED_DT);
      shedSteps = whole;
      localClock.accumulator -= whole * LOCAL_FIXED_DT;
      if (localClock.accumulator < 1e-12 || LOCAL_FIXED_DT - localClock.accumulator < 1e-12) {
        localClock.accumulator = 0;
      }
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
    commands,
    ackJournalEnd,
    generation: localClock.lifecycleGeneration,
  });
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
    commands: localClock.commandCount,
    pendingCommands: localClock.pendingCommands.length,
    appliedCommandSequence: localClock.appliedCommandSequence,
    awaitingAck: localClock.sentAwaitingAck,
    backpressured: localClock.backpressured,
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
  if (!publishReply && !localClock.sentAwaitingAck && !localClock.latestReply) return;

  if (localClock.sentAwaitingAck) {
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

function scheduleLocalClock() {
  if (!localClock.enabled || localClock.stopped || !localClock.active
    || localClock.scale <= 0 || localClock.timer !== null || localClock.backpressured) return;
  const now = localNowMs();
  localClock.deadlineMs = nextLocalClockDeadline(localClock.deadlineMs, now);
  const delayMs = Math.max(0, localClock.deadlineMs - now);
  const generation = localClock.generation;
  localClock.timer = setTimeout(() => {
    localClock.timer = null;
    localClock.timerFires++;
    if (localClock.stopped || !localClock.active || generation !== localClock.generation) return;
    localClock.deadlineMs = nextLocalClockDeadline(localClock.deadlineMs, localNowMs());
    // Keep at most one timer-driven tick queued. When the worker is busy, a
    // timer per 16.67 ms would create an unbounded promise queue and turn a
    // bounded catch-up policy into a delayed burst. The next run measures the
    // whole elapsed interval and sheds it through the same fixed-step cap.
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
    localClock.anchorMs = localNowMs();
    localClock.deadlineMs = 0;
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
  localClock.anchorMs = localNowMs();
  if (localClock.timer !== null) {
    clearTimeout(localClock.timer);
    localClock.timer = null;
  }
  localClock.deadlineMs = 0;
  if (localClock.active) scheduleLocalClock();
}

async function handleLocalClockAck(msg) {
  if (!localClock.enabled || localClock.stopped) return;
  let retainedReplyPublished = false;
  if (Number.isSafeInteger(msg.ackJournalEnd)) {
    localClock.pendingAckJournalEnd = Math.max(localClock.pendingAckJournalEnd, msg.ackJournalEnd);
  }
  if (Number.isSafeInteger(msg.clockSequence)
    && msg.clockSequence >= localClock.sentClockSequence) {
    localClock.sentAwaitingAck = false;
    const ackEnd = Number.isSafeInteger(msg.ackJournalEnd) ? msg.ackJournalEnd : localClock.sentJournalEnd;
    if (localClock.latestReply) {
      // The latest pack can be sent incrementally when it starts exactly at
      // the range the main side acknowledged. A gap means one or more worker
      // ticks were coalesced while the main thread was blocked, so rebuild the
      // authoritative journal before publishing that latest snapshot.
      localClock.needsRebuildOnSend = Number.isSafeInteger(localClock.latestReply.journalStart)
        && localClock.latestReply.journalStart > ackEnd;
    }
    localClock.backpressured = false;
    retainedReplyPublished = await publishRetainedReplyAfterAck(ackEnd);
  }
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
  if (Number.isSafeInteger(msg.lifecycleGeneration)) localClock.lifecycleGeneration = msg.lifecycleGeneration;
  applyPresentationTimeEffects(msg.timeEffectsSnapshot, localClock.lifecycleGeneration);
  refreshLocalClockScale(msg.timeScale);
  if (Number.isSafeInteger(msg.ackJournalEnd)) {
    localClock.pendingAckJournalEnd = Math.max(localClock.pendingAckJournalEnd, msg.ackJournalEnd);
  }
  if (Number.isSafeInteger(msg.ackClockSequence)
    && msg.ackClockSequence >= localClock.sentClockSequence) {
    localClock.sentAwaitingAck = false;
    const ackEnd = Number.isSafeInteger(msg.ackJournalEnd) ? msg.ackJournalEnd : localClock.sentJournalEnd;
    if (localClock.latestReply) {
      localClock.needsRebuildOnSend = Number.isSafeInteger(localClock.latestReply.journalStart)
        && localClock.latestReply.journalStart > ackEnd;
    }
    localClock.backpressured = false;
    retainedReplyPublished = await publishRetainedReplyAfterAck(ackEnd);
  }
  if (Number.isSafeInteger(msg.commandSequence)) {
    localClock.pendingCommandSequence = Math.max(localClock.pendingCommandSequence, msg.commandSequence);
  }
  if (Array.isArray(msg.commands) && msg.commands.length) {
    localClock.pendingCommands.push(...msg.commands);
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
      const result = await init(msg);
      localClock.enabled = msg.clockMode === 'worker-local';
      localClock.stopped = false;
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
  chain = chain.then(() => dispatchDirective(msg));
};

self.postMessage({ kind: 'boot', workerDataPresent: false });
