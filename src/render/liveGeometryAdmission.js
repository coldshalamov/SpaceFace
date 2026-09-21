/** Serialize late geometry uploads between presents. Loading owns its initial
 * set; rocks and payloads created afterwards need a route out of pending too.
 *
 * The ambient lane drains one root per present — that keeps GPU uploads off the
 * draw path — and its pick is a deadline choice: a hull about to cross the
 * glass must not wait behind a background prop that arrived first. `priorityOf`
 * re-grades the waiting set on every pick (lower wins, sequence breaks ties) so
 * the order reflects where entities are NOW, not when they were noticed.
 *
 * `isUrgent` marks the harder deadline: a pending root already on the live
 * glass. Those drain on a second lane so an ambient entry's program-link wait
 * cannot hold them hostage; each urgent pick pulls every pending urgent root
 * into one pass — per-root deadline compiles (floated) plus one merged
 * un-sliced residency pass — so the whole burst resolves inside a couple of
 * turns. */
const EMPTY_PENDING_LIST = Object.freeze([]);

// One reused stats result per queue instance: stats() is called every frame
// by the render diagnostics block, so it must not allocate in steady state.
const newStatsResult = () => ({
  queued: 0, draining: false, drainingAmbient: false, drainingUrgent: false,
  urgentQueued: 0, admitted: 0, skipped: 0, urgentBatches: 0, lastBatchMs: NaN,
  enqueuedTotal: 0, dedupedTotal: 0,
  pendingIds: EMPTY_PENDING_LIST, pendingTypes: EMPTY_PENDING_LIST,
  drainStage: 'idle',
});

export function createLiveGeometryAdmissionQueue({ compile, prepare, prepareBatch, yieldToMain, isActive, isUrgent, onReady, onError, priorityOf }) {
  const pending = [];
  const admissions = new WeakMap();
  // A thrown compile/upload used to stay latched in `admissions` forever — the
  // pending root could never re-enter the queue and stayed invisible. Retry a
  // few times (one attempt per drain, so a hard failure costs a few frames, not
  // a per-frame storm), then latch as before for genuinely broken uploads.
  const retryCounts = new WeakMap();
  const MAX_ADMISSION_RETRIES = 4;
  // Two drain lanes: the ambient lane keeps its compile-before-show contract
  // (a real program link can take seconds, and off-glass roots can wait for it),
  // but that wait must not hold the queue while on-glass roots sit invisible —
  // the urgent lane batches and drains them independently. GPU work still
  // serializes at the resource level (compile tail, residency chains), so the
  // split changes ordering, not pacing.
  let drainingAmbient = false;
  let drainingUrgent = false;
  let sequence = 0;
  let admittedCount = 0;
  let skippedCount = 0;
  let urgentBatches = 0;
  let lastBatchMs = NaN;
  let enqueuedTotal = 0;
  let dedupedTotal = 0;
  let drainStage = 'idle';
  const statsResult = newStatsResult();

  const entryPriority = (entry) => {
    if (typeof priorityOf !== 'function') return 0;
    let value;
    try {
      value = Number(priorityOf(entry.entity, entry.root));
    } catch (_) {
      return 0;
    }
    return Number.isFinite(value) ? value : 0;
  };

  const entryUrgent = (entry) => {
    if (typeof isUrgent !== 'function') return false;
    try {
      return isUrgent(entry.entity, entry.root) === true;
    } catch (_) {
      return false;
    }
  };
  const entryNotUrgent = (entry) => !entryUrgent(entry);

  const pickNextWhere = (predicate) => {
    let bestIndex = -1;
    let bestPriority = Infinity;
    let bestSequence = Infinity;
    for (let index = 0; index < pending.length; index++) {
      const entry = pending[index];
      if (!predicate(entry)) continue;
      const priority = entryPriority(entry);
      if (priority < bestPriority
          || (priority === bestPriority && entry.sequence < bestSequence)) {
        bestIndex = index;
        bestPriority = priority;
        bestSequence = entry.sequence;
      }
    }
    return bestIndex < 0 ? null : pending.splice(bestIndex, 1)[0];
  };

  const runEntry = async (entry) => {
    const active = entry.active;
    drainStage = `yield:${entry.entity && entry.entity.id}`;
    await yieldToMain();
    if (!active()) return false;
    drainStage = `compile:${entry.entity && entry.entity.id}`;
    // Off-glass roots wait out the program link before showing — that is the
    // hitch contract. But the link can take seconds: if the root crosses onto
    // the glass mid-wait, invisibility becomes the worse defect, so the poll
    // bails to residency within a yield (~one present) of going on-glass and
    // the link floats on without gating the latch. A dead entry bails too —
    // it must not hold the lane hostage for a link nobody needs.
    let compileSettled = false;
    let compileError = null;
    // `finished` marks entry exit so a compile rejection that lands later is
    // still reported exactly once; the awaited path reports through the retry
    // catch instead, so the handler must not also report it.
    let finished = false;
    let compileReported = false;
    const reportCompileError = (error) => {
      if (compileReported) return;
      compileReported = true;
      try { onError(error, entry.entity); } catch (_) { /* log-only path */ }
    };
    const compilePromise = Promise.resolve().then(() => compile(entry.root));
    compilePromise.then(() => { compileSettled = true; }, (error) => {
      compileSettled = true;
      compileError = error;
      if (finished) reportCompileError(error);
    });
    try {
      while (!compileSettled && !entryUrgent(entry) && active()) await yieldToMain();
      if (!active()) return false;
      drainStage = `prepare:${entry.entity && entry.entity.id}`;
      const result = await prepare(entry.root, {
        isActive: active,
        unSliced: !compileSettled || entryUrgent(entry),
      });
      if (!active() || result?.skipped === true) return false;
      // A root that drifted on-glass during the residency pass stops waiting
      // for the link here too — urgency is re-derived, not latched, so an entry
      // that came back off-glass returns to the compile-before-show contract.
      while (!compileSettled && !entryUrgent(entry) && active()) await yieldToMain();
      if (!active()) return false;
      if (compileError) {
        if (entryUrgent(entry)) {
          // On the glass, the latch still clears at residency — the link error
          // is logged once; a throw would retry a visible root for nothing.
          reportCompileError(compileError);
        } else {
          throw compileError;
        }
      }
      onReady(entry.entity, entry.root);
      return true;
    } finally {
      finished = true;
    }
  };

  // One deadline pass for the whole on-glass set. The pending latch covers
  // geometry residency — an un-uploaded buffer would pay its upload inside the
  // presented frame — so residency is what the deadline waits on. Program links
  // are driver-bound work that can take seconds: compiles still run (one
  // deadline admission per root, floated on the shared tail) but never gate the
  // latch. Per-root calls matter: a merged compile would detach every root into
  // a staging group and hold each pipelinesPending latch for the SLOWEST link
  // in the batch. With separate calls a root whose program is already linked
  // clears its mark in the same turn, and only a genuinely new program waits on
  // its own link — it must, since drawing an unlinked program blocks the
  // presented frame instead.
  const runUrgentBatch = async (collectBatch) => {
    const done = new Set();
    drainStage = 'batch-yield:1';
    await yieldToMain();
    // Sweep after the yield so roots that arrived during the wait ride the
    // same pass — otherwise every latecomer pays a full extra batch cycle.
    const batch = collectBatch();
    const live = batch.filter((entry) => entry.active());
    if (live.length === 0) return { entries: batch, ready: done };
    const roots = live.map((entry) => entry.root);
    const startedAt = typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
    drainStage = `batch-compile:${live.length}`;
    // The compiles float: failures are reported per-root (Promise.all would
    // blame the first rejection on the whole burst), and residency below does
    // not wait on any link.
    for (const entry of live) {
      if (!entry.active()) continue;
      void Promise.resolve().then(() => compile(entry.root)).catch((error) => {
        try { onError(error, entry.entity); } catch (_) { /* log-only path */ }
      });
    }
    if (typeof prepareBatch === 'function') {
      // One merged residency pass over the burst: a single work list and one
      // chain link instead of N serialized per-root passes.
      drainStage = `batch-prepare:${live.length}`;
      const result = await prepareBatch(roots, {
        isActive: () => live.some((entry) => entry.active()),
        unSliced: true,
      });
      for (const entry of live) {
        if (!entry.active() || result?.skipped === true) continue;
        onReady(entry.entity, entry.root);
        entry.readied = true;
        done.add(entry);
      }
    } else {
      for (const entry of live) {
        if (!entry.active()) continue;
        drainStage = `batch-prepare:${entry.entity && entry.entity.id}`;
        const result = await prepare(entry.root, { isActive: entry.active, unSliced: true });
        if (!entry.active() || result?.skipped === true) continue;
        onReady(entry.entity, entry.root);
        entry.readied = true;
        done.add(entry);
      }
    }
    const endedAt = typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
    lastBatchMs = endedAt - startedAt;
    return { entries: batch, ready: done };
  };

  const settleBatch = (batch, done) => {
    for (const item of batch) {
      const ready = done.has(item);
      if (!ready) { admissions.delete(item.root); skippedCount++; }
      else admittedCount++;
      item.resolve(ready);
    }
  };
  const failBatch = (batch, error) => {
    for (const item of batch) {
      if (item.readied === true) {
        // Already admitted before the failure — resolve honestly and leave the
        // latch in place; the error belongs to a later sibling's work.
        item.resolve(true);
        continue;
      }
      // A failed admission must not stay deduped while it is still
      // pending — release it so the next frame can re-enqueue, up to
      // the retry budget; past that, keep the latch.
      const retries = (retryCounts.get(item.root) || 0) + 1;
      retryCounts.set(item.root, retries);
      if (retries < MAX_ADMISSION_RETRIES) admissions.delete(item.root);
      // Resolve BEFORE the reporting calls: a throwing isActive/onError must
      // never strand the rest of the batch un-resolved and still deduped.
      item.resolve(false);
      try {
        if (item.active()) onError(error, item.entity);
      } catch (_) { /* log-only path */ }
    }
  };

  const drainUrgentLane = async () => {
    if (drainingUrgent) return;
    drainingUrgent = true;
    try {
      for (;;) {
        const first = pickNextWhere(entryUrgent);
        if (!first) break;
        // Every other pending urgent root rides the same deadline pass — the
        // sweep runs after the batch's yield inside runUrgentBatch so roots
        // that arrived during the wait are collected too.
        let batch = [first];
        const collectBatch = () => {
          for (let index = 0; index < pending.length;) {
            if (entryUrgent(pending[index])) batch.push(pending.splice(index, 1)[0]);
            else index++;
          }
          return batch;
        };
        try {
          urgentBatches++;
          const result = await runUrgentBatch(collectBatch);
          settleBatch(result.entries, result.ready);
        } catch (error) {
          failBatch(batch, error);
        }
      }
      if (!drainingAmbient) drainStage = 'idle';
    } finally {
      drainingUrgent = false;
      // An urgent root enqueued during the exit window (between the last pick
      // and this flag clearing) saw the lane busy and only queued — re-check
      // so it is not stranded until the next enqueue call.
      if (pending.some(entryUrgent)) void drainUrgentLane();
    }
  };

  const drainAmbientLane = async () => {
    if (drainingAmbient) return;
    drainingAmbient = true;
    try {
      for (;;) {
        const entry = pickNextWhere(entryNotUrgent);
        if (!entry) break;
        try {
          const ready = await runEntry(entry);
          // A pause or opening admission hold may interrupt the drain; the next
          // live frame re-enqueues the still-pending root. Genuine upload errors
          // stay in the map: retrying a failed upload every frame is a loop, not
          // a recovery.
          if (!ready) { admissions.delete(entry.root); skippedCount++; }
          else admittedCount++;
          entry.resolve(ready);
        } catch (error) {
          const retries = (retryCounts.get(entry.root) || 0) + 1;
          retryCounts.set(entry.root, retries);
          if (retries < MAX_ADMISSION_RETRIES) admissions.delete(entry.root);
          entry.resolve(false);
          try {
            if (entry.active()) onError(error, entry.entity);
          } catch (_) { /* log-only path */ }
        }
      }
      if (!drainingUrgent) drainStage = 'idle';
    } finally {
      drainingAmbient = false;
      if (pending.some(entryNotUrgent)) void drainAmbientLane();
    }
  };

  const drain = () => {
    if (pending.length === 0) return;
    if (!drainingUrgent) void drainUrgentLane();
    if (!drainingAmbient) void drainAmbientLane();
  };

  return {
    enqueue(entity, root) {
      if (admissions.has(root)) {
        dedupedTotal++;
        // A deduped entry may be stranded in `pending` if it arrived while its
        // lane was exiting — keep driving the drain on re-offers.
        drain();
        return admissions.get(root);
      }
      enqueuedTotal++;
      let resolve;
      const completion = new Promise((res) => { resolve = res; });
      pending.push({
        entity,
        root,
        sequence: ++sequence,
        active: () => isActive(entity, root),
        resolve,
      });
      admissions.set(root, completion);
      drain();
      return completion;
    },
    debugRoot(root) {
      if (!root) return { exists: false };
      return {
        exists: true,
        inPending: pending.some((entry) => entry.root === root),
        hasAdmission: admissions.has(root),
        retries: retryCounts.get(root) || 0,
        draining: drainingAmbient || drainingUrgent,
        drainStage,
      };
    },
    stats() {
      // Called from the per-frame diagnostics block: one reused result object
      // (the consumer reads fields synchronously) and the pending lists only
      // exist while the queue holds entries — the empty steady state is
      // alloc-free.
      statsResult.queued = pending.length;
      statsResult.draining = drainingAmbient || drainingUrgent;
      statsResult.drainingAmbient = drainingAmbient;
      statsResult.drainingUrgent = drainingUrgent;
      statsResult.urgentQueued = 0;
      statsResult.admitted = admittedCount;
      statsResult.skipped = skippedCount;
      statsResult.urgentBatches = urgentBatches;
      statsResult.lastBatchMs = lastBatchMs;
      statsResult.enqueuedTotal = enqueuedTotal;
      statsResult.dedupedTotal = dedupedTotal;
      statsResult.pendingIds = EMPTY_PENDING_LIST;
      statsResult.pendingTypes = EMPTY_PENDING_LIST;
      statsResult.drainStage = drainStage;
      if (pending.length > 0) {
        const ids = [];
        const types = [];
        for (const entry of pending) {
          if (entryUrgent(entry)) statsResult.urgentQueued++;
          if (ids.length < 24) {
            ids.push(entry.entity && entry.entity.id);
            types.push((entry.entity && entry.entity.type) || '?');
          }
        }
        statsResult.pendingIds = ids;
        statsResult.pendingTypes = types;
      }
      return statsResult;
    },
  };
}
