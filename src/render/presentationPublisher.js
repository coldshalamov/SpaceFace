// Applies the bounded simulation publication journal to a disposable PresentationWorld.
// This consumer never acknowledges or discards journal records; PresentationRunner owns that commit.
import {
  createPresentationJournalRecord,
  PRESENTATION_JOURNAL_KINDS,
} from '../core/presentationJournal.js';

function aliveEntities(state) {
  return state && Array.isArray(state.entityList) ? state.entityList : [];
}

function entityForId(state, entityId) {
  return state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(entityId) || null
    : null;
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
    rangeFailures: 0,
    applyFailures: 0,
    lastError: null,
  };

  let lastAppliedSequence = 0;
  let rebuildGeneration = 0;
  let initialized = false;

  function resetResult(start, end) {
    result.applied = 0;
    result.start = start;
    result.end = end;
    result.rebuilt = false;
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

  function fallbackFromState(journal, reason, end) {
    requestRebuild(journal, reason);
    world.rebuildFromEntities(aliveEntities(state));
    lastAppliedSequence = Number.isSafeInteger(end) && end >= 0 ? end : lastAppliedSequence;
    diagnostics.lastAppliedSequence = lastAppliedSequence;
    diagnostics.fallbackRebuilds++;
    diagnostics.lastError = reason;
    result.rebuilt = true;
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
        result.fallback = true;
        diagnostics.fallbackRebuilds++;
      } else {
        diagnostics.idempotentFrames++;
      }
      return result;
    }

    if (journal.needsRebuild?.() === true || presentationFrame && presentationFrame.journalValid === false) {
      return fallbackFromState(journal, 'presentation-journal-invalid', frameEnd);
    }

    if (!Number.isSafeInteger(frameStart) || !Number.isSafeInteger(frameEnd)
      || frameStart < 0 || frameEnd < frameStart) {
      diagnostics.rangeFailures++;
      return fallbackFromState(journal, 'presentation-range-invalid', frameEnd);
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
      initialized = true;
    }

    if (frameEnd <= lastAppliedSequence) {
      diagnostics.idempotentFrames++;
      return result;
    }

    if (frameStart > lastAppliedSequence) {
      diagnostics.rangeFailures++;
      return fallbackFromState(journal, 'presentation-range-gap', frameEnd);
    }

    const start = Math.max(frameStart, lastAppliedSequence);
    result.start = start;
    if (typeof journal.hasRange === 'function' && !journal.hasRange(start, frameEnd)) {
      diagnostics.rangeFailures++;
      return fallbackFromState(journal, 'presentation-range-not-retained', frameEnd);
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
      return fallbackFromState(journal, `presentation-apply-failed:${message}`, frameEnd);
    }
  }

  return {
    consume,
    getLastAppliedSequence: () => lastAppliedSequence,
    getRebuildGeneration: () => rebuildGeneration,
    getDiagnostics: () => diagnostics,
  };
}
