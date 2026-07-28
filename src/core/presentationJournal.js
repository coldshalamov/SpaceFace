// Bounded derived publication from authoritative entity owners to presentation.
// Records retain stable IDs and scalars only; the simulation entity graph remains the sole authority.

export const PRESENTATION_JOURNAL_KINDS = Object.freeze({
  SPAWN: 'spawn',
  DESTROY: 'destroy',
  TRANSFORM: 'transform',
  VISUAL: 'visual',
});

const DEFAULT_RECORD_CAPACITY = 16384;
const DEFAULT_ENTITY_CAPACITY = 65536;
const EMPTY_OBJECT = Object.freeze({});

function finite(value) {
  return Number.isFinite(value) ? value : 0;
}

function nextCounter(value) {
  const next = (value + 1) >>> 0;
  return next === 0 ? 1 : next;
}

export function createPresentationJournalRecord() {
  return {
    tick: 0,
    sequence: 0,
    kind: null,
    entityId: 0,
    generation: 0,
    revision: 0,
    entityType: null,
    x: 0,
    y: 0,
    z: 0,
    prevX: 0,
    prevY: 0,
    prevZ: 0,
    rot: 0,
    bank: 0,
    pitch: 0,
    prevRot: 0,
    prevBank: 0,
    prevPitch: 0,
    visualRevision: 0,
  };
}

function copyRecord(target, source) {
  if (!target || typeof target !== 'object') {
    throw new TypeError('PresentationJournal requires a caller-owned record');
  }
  target.tick = source.tick;
  target.sequence = source.sequence;
  target.kind = source.kind;
  target.entityId = source.entityId;
  target.generation = source.generation;
  target.revision = source.revision;
  target.entityType = source.entityType;
  target.x = source.x;
  target.y = source.y;
  target.z = source.z;
  target.prevX = source.prevX;
  target.prevY = source.prevY;
  target.prevZ = source.prevZ;
  target.rot = source.rot;
  target.bank = source.bank;
  target.pitch = source.pitch;
  target.prevRot = source.prevRot;
  target.prevBank = source.prevBank;
  target.prevPitch = source.prevPitch;
  target.visualRevision = source.visualRevision;
  return target;
}

function sourceEntityId(source) {
  if (Number.isSafeInteger(source) && source > 0) return source;
  return source && Number.isSafeInteger(source.id) && source.id > 0 ? source.id : 0;
}

function fillPose(record, source) {
  const value = source && typeof source === 'object' ? source : EMPTY_OBJECT;
  const pos = value.pos && typeof value.pos === 'object' ? value.pos : EMPTY_OBJECT;
  const prevPos = value.prevPos && typeof value.prevPos === 'object' ? value.prevPos : pos;
  record.entityType = typeof value.type === 'string' ? value.type : null;
  record.x = finite(pos.x);
  record.y = finite(pos.y);
  record.z = finite(pos.z);
  record.prevX = Number.isFinite(prevPos.x) ? prevPos.x : record.x;
  record.prevY = Number.isFinite(prevPos.y) ? prevPos.y : record.y;
  record.prevZ = Number.isFinite(prevPos.z) ? prevPos.z : record.z;
  record.rot = finite(value.rot);
  record.bank = finite(value.bank);
  record.pitch = finite(value.pitch);
  record.prevRot = Number.isFinite(value.prevRot) ? value.prevRot : record.rot;
  record.prevBank = Number.isFinite(value.prevBank) ? value.prevBank : record.bank;
  record.prevPitch = Number.isFinite(value.prevPitch) ? value.prevPitch : record.pitch;
  record.visualRevision = Number.isSafeInteger(value.presentationVisualRevision)
    && value.presentationVisualRevision >= 0
    ? value.presentationVisualRevision
    : 0;
}

function poseChanged(entity) {
  if (!entity || entity.alive === false) return false;
  const pos = entity.pos || EMPTY_OBJECT;
  const prevPos = entity.prevPos || EMPTY_OBJECT;
  return finite(pos.x) !== finite(prevPos.x)
    || finite(pos.y) !== finite(prevPos.y)
    || finite(pos.z) !== finite(prevPos.z)
    || finite(entity.rot) !== finite(entity.prevRot)
    || finite(entity.bank) !== finite(entity.prevBank)
    || finite(entity.pitch) !== finite(entity.prevPitch);
}

/**
 * Create one bounded journal. `journalStart`/`journalEnd` spans are `(start, end]` sequence ranges.
 * Overflow never changes gameplay: retained records are discarded, a rebuild is requested, and
 * publication resumes only after `rebuildFrom` emits a full current-entity spawn set.
 */
export function createPresentationJournal(capacity = DEFAULT_RECORD_CAPACITY, options = {}) {
  const size = Math.max(1, Math.floor(Number.isFinite(capacity)
    ? capacity
    : DEFAULT_RECORD_CAPACITY));
  const initialEntityCapacity = Math.max(
    16,
    Math.floor(Number.isFinite(options.entityCapacity)
      ? options.entityCapacity
      : DEFAULT_ENTITY_CAPACITY),
  );
  const records = Array.from({ length: size }, () => createPresentationJournalRecord());

  let generations = new Uint32Array(initialEntityCapacity + 1);
  let activeGenerations = new Uint32Array(initialEntityCapacity + 1);
  let revisions = new Uint32Array(initialEntityCapacity + 1);
  let lastTransformSequence = new Float64Array(initialEntityCapacity + 1);
  let lastVisualSequence = new Float64Array(initialEntityCapacity + 1);
  let highestEntityId = 0;

  let read = 0;
  let write = 0;
  let count = 0;
  let writeSequence = 0;
  let lastRecordTick = -1;
  let lastDiscardedSequence = 0;
  let rebuildRequired = false;
  let rebuildReason = null;
  let rebuildGeneration = 0;
  let lastRebuildStart = 0;
  let lastRebuildEnd = 0;
  let lastRebuildRecordCount = 0;

  let publishedCount = 0;
  let spawnCount = 0;
  let destroyCount = 0;
  let transformCount = 0;
  let visualCount = 0;
  let transformCoalesceCount = 0;
  let visualCoalesceCount = 0;
  let discardCount = 0;
  let overflowCount = 0;
  let suppressedCount = 0;
  let identityErrorCount = 0;
  let orderErrorCount = 0;
  let rebuildRequestCount = 0;
  let rebuildCount = 0;
  let rebuildFailureCount = 0;

  function growMetadata(entityId) {
    if (entityId < generations.length) return;
    let nextSize = generations.length;
    while (nextSize <= entityId) nextSize *= 2;

    const nextGenerations = new Uint32Array(nextSize);
    const nextActive = new Uint32Array(nextSize);
    const nextRevisions = new Uint32Array(nextSize);
    const nextTransforms = new Float64Array(nextSize);
    const nextVisuals = new Float64Array(nextSize);
    nextGenerations.set(generations);
    nextActive.set(activeGenerations);
    nextRevisions.set(revisions);
    nextTransforms.set(lastTransformSequence);
    nextVisuals.set(lastVisualSequence);
    generations = nextGenerations;
    activeGenerations = nextActive;
    revisions = nextRevisions;
    lastTransformSequence = nextTransforms;
    lastVisualSequence = nextVisuals;
  }

  function ensureEntityId(source) {
    const entityId = sourceEntityId(source);
    if (entityId === 0) {
      identityErrorCount++;
      requestRebuild('invalid-entity-id');
      return 0;
    }
    growMetadata(entityId);
    if (entityId > highestEntityId) highestEntityId = entityId;
    return entityId;
  }

  function clearRetained() {
    read = 0;
    write = 0;
    count = 0;
  }

  function requestRebuild(reason = 'requested') {
    rebuildRequestCount++;
    rebuildRequired = true;
    rebuildReason = typeof reason === 'string' && reason ? reason : 'requested';
    clearRetained();
    lastRecordTick = -1;
    return true;
  }

  function prepareRecord(tick) {
    if (rebuildRequired) {
      suppressedCount++;
      return false;
    }
    if (!Number.isSafeInteger(tick) || tick < 0) {
      orderErrorCount++;
      requestRebuild('invalid-tick');
      return false;
    }
    if (lastRecordTick > tick) {
      orderErrorCount++;
      requestRebuild('tick-rewind');
      return false;
    }
    if (count >= size) {
      overflowCount++;
      requestRebuild('overflow');
      return false;
    }
    return true;
  }

  function retainedSlot(sequence) {
    if (!Number.isSafeInteger(sequence) || sequence <= 0 || count <= 0) return null;
    const oldestSequence = records[read].sequence;
    const offset = sequence - oldestSequence;
    if (offset < 0 || offset >= count) return null;
    const slot = records[(read + offset) % size];
    return slot.sequence === sequence ? slot : null;
  }

  function refreshCoalescedRecords(startSequence, tick, entityId, generation, revision, source) {
    const newestSequence = count > 0
      ? records[(write - 1 + size) % size].sequence
      : 0;
    for (let sequence = startSequence; sequence <= newestSequence; sequence++) {
      const slot = retainedSlot(sequence);
      if (!slot || slot.tick !== tick || slot.entityId !== entityId
        || slot.generation !== generation) continue;
      // A coalesced write can precede another kind for the same entity. Refresh the later records too
      // so sequence-order consumers never observe a revision or scalar snapshot moving backwards.
      slot.revision = revision;
      fillPose(slot, source);
    }
  }

  function append(kind, tick, entityId, generation, revision, source) {
    const slot = records[write];
    writeSequence++;
    slot.tick = tick;
    slot.sequence = writeSequence;
    slot.kind = kind;
    slot.entityId = entityId;
    slot.generation = generation;
    slot.revision = revision;
    fillPose(slot, source);
    write = (write + 1) % size;
    count++;
    lastRecordTick = tick;
    publishedCount++;
    return slot.sequence;
  }

  function publishSpawn(tick, entity, rebuilding = false) {
    if (!rebuilding && !prepareRecord(tick)) return 0;
    const entityId = ensureEntityId(entity);
    if (entityId === 0 || rebuildRequired && !rebuilding) return 0;
    if (activeGenerations[entityId] !== 0) {
      identityErrorCount++;
      requestRebuild(rebuilding ? 'rebuild-duplicate-id' : 'duplicate-spawn');
      return 0;
    }
    const generation = nextCounter(generations[entityId]);
    generations[entityId] = generation;
    activeGenerations[entityId] = generation;
    revisions[entityId] = 1;
    lastTransformSequence[entityId] = 0;
    lastVisualSequence[entityId] = 0;
    const sequence = append(
      PRESENTATION_JOURNAL_KINDS.SPAWN,
      tick,
      entityId,
      generation,
      1,
      entity,
    );
    spawnCount++;
    return sequence;
  }

  function recordSpawn(tick, entity) {
    return publishSpawn(tick, entity, false);
  }

  function recordDestroy(tick, source) {
    if (!prepareRecord(tick)) return 0;
    const entityId = ensureEntityId(source);
    if (entityId === 0 || rebuildRequired) return 0;
    const generation = activeGenerations[entityId];
    if (generation === 0) {
      identityErrorCount++;
      requestRebuild('destroy-without-spawn');
      return 0;
    }
    const revision = nextCounter(revisions[entityId]);
    revisions[entityId] = revision;
    const sequence = append(
      PRESENTATION_JOURNAL_KINDS.DESTROY,
      tick,
      entityId,
      generation,
      revision,
      source,
    );
    activeGenerations[entityId] = 0;
    lastTransformSequence[entityId] = 0;
    lastVisualSequence[entityId] = 0;
    destroyCount++;
    return sequence;
  }

  function recordCoalescible(kind, tick, entity, sequenceTable) {
    if (rebuildRequired) {
      suppressedCount++;
      return 0;
    }
    if (!Number.isSafeInteger(tick) || tick < 0 || lastRecordTick > tick) {
      orderErrorCount++;
      requestRebuild(lastRecordTick > tick ? 'tick-rewind' : 'invalid-tick');
      return 0;
    }
    const entityId = ensureEntityId(entity);
    if (entityId === 0 || rebuildRequired) return 0;
    const generation = activeGenerations[entityId];
    if (generation === 0) {
      identityErrorCount++;
      requestRebuild(`${kind}-without-spawn`);
      return 0;
    }

    const prior = retainedSlot(sequenceTable[entityId]);
    if (prior && prior.kind === kind && prior.tick === tick && prior.generation === generation) {
      const revision = nextCounter(revisions[entityId]);
      revisions[entityId] = revision;
      refreshCoalescedRecords(
        prior.sequence,
        tick,
        entityId,
        generation,
        revision,
        entity,
      );
      if (kind === PRESENTATION_JOURNAL_KINDS.TRANSFORM) transformCoalesceCount++;
      else visualCoalesceCount++;
      return prior.sequence;
    }

    if (!prepareRecord(tick)) return 0;
    const revision = nextCounter(revisions[entityId]);
    revisions[entityId] = revision;
    const sequence = append(kind, tick, entityId, generation, revision, entity);
    sequenceTable[entityId] = sequence;
    if (kind === PRESENTATION_JOURNAL_KINDS.TRANSFORM) transformCount++;
    else visualCount++;
    return sequence;
  }

  function recordTransform(tick, entity) {
    return recordCoalescible(
      PRESENTATION_JOURNAL_KINDS.TRANSFORM,
      tick,
      entity,
      lastTransformSequence,
    );
  }

  function recordTransformIfChanged(tick, entity) {
    return poseChanged(entity) ? recordTransform(tick, entity) : 0;
  }

  function recordVisual(tick, entity) {
    return recordCoalescible(
      PRESENTATION_JOURNAL_KINDS.VISUAL,
      tick,
      entity,
      lastVisualSequence,
    );
  }

  function copySequence(sequence, target) {
    const slot = retainedSlot(sequence);
    if (!slot) return false;
    copyRecord(target, slot);
    return true;
  }

  function hasRange(startExclusive, endInclusive) {
    if (!Number.isSafeInteger(startExclusive) || !Number.isSafeInteger(endInclusive)
      || startExclusive < 0 || endInclusive < startExclusive) return false;
    if (startExclusive === endInclusive) return true;
    if (count <= 0) return false;
    const oldestSequence = records[read].sequence;
    const newestSequence = records[(write - 1 + size) % size].sequence;
    return startExclusive + 1 >= oldestSequence && endInclusive <= newestSequence;
  }

  function visitRange(startExclusive, endInclusive, target, visitor) {
    if (typeof visitor !== 'function') {
      throw new TypeError('PresentationJournal visitRange requires a visitor');
    }
    if (!hasRange(startExclusive, endInclusive)) {
      throw new Error(`PresentationJournal range is not retained (${startExclusive}, ${endInclusive}]`);
    }
    let visited = 0;
    for (let sequence = startExclusive + 1; sequence <= endInclusive; sequence++) {
      if (!copySequence(sequence, target)) {
        throw new Error(`PresentationJournal record ${sequence} is not retained`);
      }
      visitor(target);
      visited++;
    }
    return visited;
  }

  function discardThrough(sequence) {
    if (!Number.isSafeInteger(sequence) || sequence < 0) return 0;
    let discarded = 0;
    while (count > 0 && records[read].sequence <= sequence) {
      lastDiscardedSequence = records[read].sequence;
      read = (read + 1) % size;
      count--;
      discarded++;
    }
    discardCount += discarded;
    return discarded;
  }

  function rebuildFrom(entities, tick) {
    if (!Array.isArray(entities) || !Number.isSafeInteger(tick) || tick < 0) {
      rebuildFailureCount++;
      requestRebuild('invalid-rebuild-source');
      return false;
    }

    let aliveCount = 0;
    let maxEntityId = 0;
    for (const entity of entities) {
      if (!entity || entity.alive === false) continue;
      const entityId = sourceEntityId(entity);
      if (entityId === 0) {
        rebuildFailureCount++;
        identityErrorCount++;
        requestRebuild('invalid-rebuild-entity');
        return false;
      }
      aliveCount++;
      if (entityId > maxEntityId) maxEntityId = entityId;
    }
    if (aliveCount > size) {
      rebuildFailureCount++;
      requestRebuild('rebuild-capacity');
      return false;
    }

    if (maxEntityId > 0) growMetadata(maxEntityId);
    if (maxEntityId > highestEntityId) highestEntityId = maxEntityId;
    if (highestEntityId > 0) activeGenerations.fill(0, 0, highestEntityId + 1);
    clearRetained();
    lastRecordTick = -1;
    rebuildRequired = false;
    rebuildGeneration = nextCounter(rebuildGeneration);
    lastRebuildStart = writeSequence;
    lastRebuildRecordCount = 0;

    for (const entity of entities) {
      if (!entity || entity.alive === false) continue;
      if (publishSpawn(tick, entity, true) === 0) {
        rebuildFailureCount++;
        requestRebuild('rebuild-publication-failed');
        return false;
      }
      lastRebuildRecordCount++;
    }

    lastRecordTick = tick;
    lastRebuildEnd = writeSequence;
    rebuildReason = null;
    rebuildCount++;
    return true;
  }

  return {
    capacity: size,
    recordSpawn,
    recordDestroy,
    recordTransform,
    recordTransformIfChanged,
    recordVisual,
    copySequence,
    hasRange,
    visitRange,
    discardThrough,
    requestRebuild,
    rebuildFrom,
    needsRebuild: () => rebuildRequired,
    getWriteSequence: () => writeSequence,
    getOldestSequence: () => count > 0 ? records[read].sequence : 0,
    getPendingCount: () => count,
    getRebuildGeneration: () => rebuildGeneration,
    getLastRebuildStart: () => lastRebuildStart,
    getLastRebuildEnd: () => lastRebuildEnd,
    getDiagnostics() {
      return {
        capacity: size,
        entityCapacity: generations.length - 1,
        pending: count,
        writeSequence,
        oldestSequence: count > 0 ? records[read].sequence : 0,
        lastDiscardedSequence,
        lastRecordTick,
        publishedCount,
        spawnCount,
        destroyCount,
        transformCount,
        visualCount,
        transformCoalesceCount,
        visualCoalesceCount,
        discardCount,
        overflowCount,
        suppressedCount,
        identityErrorCount,
        orderErrorCount,
        rebuildRequired,
        rebuildReason,
        rebuildRequestCount,
        rebuildGeneration,
        rebuildCount,
        rebuildFailureCount,
        lastRebuildStart,
        lastRebuildEnd,
        lastRebuildRecordCount,
      };
    },
  };
}
