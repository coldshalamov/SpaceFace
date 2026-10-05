// Applies the bounded simulation publication journal to a disposable PresentationWorld.
// This consumer never acknowledges or discards journal records; PresentationRunner owns that commit.
import {
  createPresentationJournalRecord,
  PRESENTATION_JOURNAL_KINDS,
} from '../core/presentationJournal.js';
import {
  collectJournalPresentationEntities,
  resolveWorldPresentationEntity,
} from '../world/presentationSources.js';

function aliveEntities(state) {
  return collectJournalPresentationEntities(state);
}

function entityForId(state, entityId) {
  return resolveWorldPresentationEntity(state, entityId);
}

/**
 * Create an idempotent journal consumer. A failed or missing range requests an authoritative journal
 * rebuild and immediately reconstructs a one-frame derived mirror from current GameState.
 */
export function createPresentationPublisher(world, state, options = {}) {
  if (!world || typeof world.allocateRecord !== 'function') {
    throw new TypeError('PresentationPublisher requires a PresentationWorld');
  }

  const defaultJournal = options.journal || null;
  const scratch = createPresentationJournalRecord();
  const spawnedSlots = [];
  const result = {
    applied: 0,
    start: 0,
    end: 0,
    rebuilt: false,
    // Slot-remap marker: true only when the world was actually cleared
    // (journalFullRebuild, rebuildFromEntities, clear) — poses teleport and the
    // pose-pack epoch must bump. A diff-apply fallback (updateFromEntities)
    // preserves id-keyed slot identity, so it stays a non-remap even though it
    // is also `rebuilt` — its rows remain copy/blend-safe.
    remapped: false,
    fallback: false,
    valid: true,
    error: null,
    spawnedSlots,
    spawnedCount: 0,
  };
  const diagnostics = {
    lastAppliedSequence: 0,
    rebuildGeneration: 0,
    consumeCount: 0,
    appliedRecords: 0,
    spawnRecords: 0,
    destroyRecords: 0,
    transformRecords: 0,
    visualRecords: 0,
    idempotentFrames: 0,
    fullRebuilds: 0,
    fallbackRebuilds: 0,
    fallbackReusedFrames: 0,
    rangeFailures: 0,
    applyFailures: 0,
    lastError: null,
  };

  let lastAppliedSequence = 0;
  let rebuildGeneration = 0;
  let lastFallbackLifecycleGeneration = -2;
  let initialized = false;

  function resetResult(start, end) {
    result.applied = 0;
    result.start = start;
    result.end = end;
    result.rebuilt = false;
    result.remapped = false;
    result.fallback = false;
    result.valid = true;
    result.error = null;
    spawnedSlots.length = 0;
    result.spawnedCount = 0;
    return result;
  }

  function requestRebuild(journal, reason) {
    try { journal?.requestRebuild?.(reason); } catch (_) { /* derived channel only */ }
  }

  function fallbackFromState(journal, reason, end, presentationFrame = null) {
    // A stepped rebuild holds needsRebuild across its suspension — re-requesting it
    // here would clearRetained() under the publish the journal still has in flight
    // and doom every attempt that spans presents. Only re-request when no stepped
    // publish is in progress; foreign invalidations still arrive via record writes.
    if (journal.getRebuildInProgress?.() !== true) requestRebuild(journal, reason);
    // The stepped journal rebuild holds needsRebuild across several presents, and
    // the world the fallback mirrors only moves on a completed sim tick or a
    // lifecycle transition (restore/restart). An unchanged-tick present re-packs
    // the existing world instead of clear + re-allocating every slot — identical
    // contents minus the per-frame whole-set drain inside the suspension window.
    const completedTickCount = presentationFrame
      && Number.isSafeInteger(presentationFrame.completedTickCount)
      ? presentationFrame.completedTickCount : 0;
    const lifecycleGeneration = presentationFrame
      && Number.isSafeInteger(presentationFrame.lifecycleGeneration)
      ? presentationFrame.lifecycleGeneration : -1;
    if (!initialized || !presentationFrame || completedTickCount > 0
      || lifecycleGeneration !== lastFallbackLifecycleGeneration) {
      // A stepped journal rebuild mid-publish shares its completed collect on the
      // frame — the same live-GameState sample, collected once. While the collect
      // leg is still pacing its accumulating prefix mirrors instead: retained
      // rows refresh and not-yet-collected ids hold their last pose, strictly
      // fresher than the whole-set sync collect it replaces.
      const sharedCollect = Array.isArray(presentationFrame?.rebuildCollectedEntities)
        ? presentationFrame.rebuildCollectedEntities
        : null;
      const collectPrefix = sharedCollect ? null
        : (Array.isArray(presentationFrame?.rebuildCollectPrefix)
          ? presentationFrame.rebuildCollectPrefix : null);
      const sample = sharedCollect || collectPrefix || aliveEntities(state);
      // Diff-apply while a stepped rebuild is suspended: clear+realloc used to
      // retire every slot and drop every mesh binding on each tick-advanced
      // present. Rows absent from the collect retire, new ids allocate, and
      // retained rows pay only the changed-row dirty marks. A prefix sample
      // suppresses the retire sweep — partial by construction.
      // A diff-apply is NOT a remap — slot identities survive, so the pose
      // epoch holds and the pack's copy/interp paths keep working across the
      // suspension window.
      if (typeof world.updateFromEntities === 'function') {
        world.updateFromEntities(sample, null, collectPrefix
          ? {
            retire: false,
            hiddenIds: presentationFrame.rebuildSuppressedDestroyIds || null,
            // Suppressed-destroy ids recycle during the suspended window — the
            // live map tells the doom loop which ids still name the dead
            // occupant vs a respawn bound onto the row mid-window.
            liveEntities: state && state.entities,
          }
          : undefined);
      } else {
        world.rebuildFromEntities(sample);
        result.remapped = true;
      }
      lastFallbackLifecycleGeneration = lifecycleGeneration;
      diagnostics.fallbackRebuilds++;
      result.rebuilt = true;
    } else {
      diagnostics.fallbackReusedFrames++;
    }
    lastAppliedSequence = Number.isSafeInteger(end) && end >= 0 ? end : lastAppliedSequence;
    diagnostics.lastAppliedSequence = lastAppliedSequence;
    diagnostics.lastError = reason;
    result.fallback = true;
    result.valid = false;
    result.error = reason;
    spawnedSlots.length = 0;
    result.spawnedCount = 0;
    initialized = true;
    return result;
  }

  function applyRecord(record) {
    const entity = entityForId(state, record.entityId);
    switch (record.kind) {
      case PRESENTATION_JOURNAL_KINDS.SPAWN: {
        const handle = world.allocateRecord(record, entity);
        spawnedSlots.push(handle.slot);
        diagnostics.spawnRecords++;
        break;
      }
      case PRESENTATION_JOURNAL_KINDS.DESTROY:
        if (!world.retire(record.entityId, record.generation)) {
          throw new Error(`destroy identity mismatch for entity ${record.entityId}`);
        }
        diagnostics.destroyRecords++;
        break;
      case PRESENTATION_JOURNAL_KINDS.TRANSFORM:
        world.applyTransform(record, entity);
        diagnostics.transformRecords++;
        break;
      case PRESENTATION_JOURNAL_KINDS.VISUAL:
        world.applyVisual(record, entity);
        diagnostics.visualRecords++;
        break;
      default:
        throw new Error(`unknown presentation journal kind: ${record.kind}`);
    }
  }

  function consume(presentationFrame = null) {
    diagnostics.consumeCount++;
    const journal = presentationFrame && presentationFrame.journal || defaultJournal;
    const directEnd = journal?.getWriteSequence?.() || lastAppliedSequence;
    const frameStart = presentationFrame
      ? presentationFrame.journalStart
      : lastAppliedSequence;
    const frameEnd = presentationFrame
      ? presentationFrame.journalEnd
      : directEnd;
    resetResult(frameStart, frameEnd);

    if (!journal) {
      if (!initialized) {
        world.rebuildFromEntities(aliveEntities(state));
        initialized = true;
        result.rebuilt = true;
        result.remapped = true;
        result.fallback = true;
        diagnostics.fallbackRebuilds++;
      } else {
        diagnostics.idempotentFrames++;
      }
      return result;
    }

    if (journal.needsRebuild?.() === true || presentationFrame && presentationFrame.journalValid === false) {
      return fallbackFromState(journal, 'presentation-journal-invalid', frameEnd, presentationFrame);
    }

    if (!Number.isSafeInteger(frameStart) || !Number.isSafeInteger(frameEnd)
      || frameStart < 0 || frameEnd < frameStart) {
      diagnostics.rangeFailures++;
      return fallbackFromState(journal, 'presentation-range-invalid', frameEnd, presentationFrame);
    }

    const fullRebuild = !!(presentationFrame && presentationFrame.journalFullRebuild);
    const nextRebuildGeneration = fullRebuild
      ? presentationFrame.journalRebuildGeneration >>> 0
      : rebuildGeneration;
    if (fullRebuild && nextRebuildGeneration !== rebuildGeneration) {
      world.clear();
      lastAppliedSequence = frameStart;
      rebuildGeneration = nextRebuildGeneration;
      diagnostics.rebuildGeneration = rebuildGeneration;
      diagnostics.fullRebuilds++;
      result.rebuilt = true;
      result.remapped = true;
      initialized = true;
    }

    if (frameEnd <= lastAppliedSequence) {
      diagnostics.idempotentFrames++;
      return result;
    }

    if (frameStart > lastAppliedSequence) {
      diagnostics.rangeFailures++;
      return fallbackFromState(journal, 'presentation-range-gap', frameEnd, presentationFrame);
    }

    const start = Math.max(frameStart, lastAppliedSequence);
    result.start = start;
    if (typeof journal.hasRange === 'function' && !journal.hasRange(start, frameEnd)) {
      diagnostics.rangeFailures++;
      return fallbackFromState(journal, 'presentation-range-not-retained', frameEnd, presentationFrame);
    }

    try {
      result.applied = journal.visitRange(start, frameEnd, scratch, applyRecord);
      lastAppliedSequence = frameEnd;
      diagnostics.lastAppliedSequence = lastAppliedSequence;
      diagnostics.appliedRecords += result.applied;
      diagnostics.lastError = null;
      result.spawnedCount = spawnedSlots.length;
      initialized = true;
      return result;
    } catch (error) {
      diagnostics.applyFailures++;
      const message = error && error.message ? error.message : String(error);
      return fallbackFromState(journal, `presentation-apply-failed:${message}`, frameEnd, presentationFrame);
    }
  }

  return {
    consume,
    getLastAppliedSequence: () => lastAppliedSequence,
    getRebuildGeneration: () => rebuildGeneration,
    getDiagnostics: () => diagnostics,
  };
}
