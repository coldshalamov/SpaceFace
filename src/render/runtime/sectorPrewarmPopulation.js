export function entitySectorId(entity) {
  const data = entity && entity.data || {};
  return entity && entity.homeSectorId || data.homeSectorId || data.sectorId || null;
}

export const SECTOR_BOUNDARY_PREPARATION_STATE = Object.freeze({
  reserved: 'RESERVED',
  mountedHidden: 'MOUNTED_HIDDEN',
  preparing: 'PREPARING',
  ready: 'READY',
  publishing: 'PUBLISHING',
  live: 'LIVE',
  aborting: 'ABORTING',
  disposed: 'DISPOSED',
});

export function isLiveSectorBoundaryRecordCurrent(prepared, options = {}) {
  if (prepared?.state !== SECTOR_BOUNDARY_PREPARATION_STATE.live
      || prepared.cleanupBlocked === true) return false;
  const current = options.entities?.get(prepared.id);
  const boundary = options.meshes?.get(prepared.id);
  const fingerprint = typeof options.fingerprintForEntity === 'function'
    ? options.fingerprintForEntity(current)
    : prepared.fingerprint;
  const expectedSectorId = options.sectorId == null ? null : String(options.sectorId);
  return !!current
    && current === prepared.entity
    && current.alive !== false
    && (!expectedSectorId || String(entitySectorId(current) || '') === expectedSectorId)
    && boundary === prepared.boundary
    && current.mesh === prepared.boundary
    && fingerprint === prepared.fingerprint
    && (typeof options.isEligible !== 'function' || options.isEligible(current) === true);
}

export function pruneSettledSectorBoundaryRecords(records, options = {}) {
  if (!records || typeof records.delete !== 'function') return records;
  for (const record of records) {
    if (!record || (record.state === SECTOR_BOUNDARY_PREPARATION_STATE.disposed
      && record.cleanupBlocked !== true)) {
      records.delete(record);
      options.onPruned?.(record);
      continue;
    }
    if (record.cleanupBlocked === true) {
      // A blocked teardown keeps its boundary pinned until retried — hand it back to the
      // manager so the bounded retry arm can run instead of accumulating permanently.
      options.onCleanupBlocked?.(record);
      continue;
    }
    if (record.state === SECTOR_BOUNDARY_PREPARATION_STATE.live
        && record.cleanupBlocked !== true
        && typeof options.isLiveRecordCurrent === 'function'
        && options.isLiveRecordCurrent(record) !== true) {
      records.delete(record);
      options.onPruned?.(record);
    }
  }
  return records;
}

export function reconcileSettledSectorBoundaryRecords(records, options = {}) {
  if (!records || typeof records.delete !== 'function') return records;
  for (const prepared of [...records]) {
    if (prepared?.state === SECTOR_BOUNDARY_PREPARATION_STATE.ready
        || prepared?.state === SECTOR_BOUNDARY_PREPARATION_STATE.live) continue;
    const current = options.entities?.get(prepared?.id);
    const expectedEntityInvalidation = !current
      || current !== prepared?.entity
      || current.alive === false
      || (options.sectorId != null
        && String(entitySectorId(current) || '') !== String(options.sectorId))
      || prepared?.abortReason === 'entity-destroyed-during-sector-prewarm'
      || prepared?.abortReason === 'ship-appearance-changed-during-sector-prewarm'
      || prepared?.abortReason === 'ship-rebuild-during-sector-prewarm';
    const currentPreparation = typeof options.currentRecordForId === 'function'
      ? options.currentRecordForId(prepared?.id)
      : null;
    const safelySuperseded = currentPreparation && currentPreparation !== prepared;
    if (prepared?.state === SECTOR_BOUNDARY_PREPARATION_STATE.disposed
        && prepared.cleanupBlocked !== true
        && (expectedEntityInvalidation || safelySuperseded)) {
      records.delete(prepared);
      continue;
    }
    throw prepared?.cleanupError
      || prepared?.restoreError
      || prepared?.error
      || new Error(`Incoming authored boundary ${prepared?.id ?? 'unknown'} was not prepared`);
  }
  return records;
}

export async function settleSectorBoundaryRecordSnapshot(records, options = {}) {
  const snapshot = new Set([...(records || [])]);
  const admitted = [...snapshot];
  if (typeof options.settleRecords === 'function') await options.settleRecords(snapshot);
  reconcileSettledSectorBoundaryRecords(snapshot, options);
  if (records && typeof records.delete === 'function') {
    for (const prepared of admitted) {
      if (!snapshot.has(prepared)) records.delete(prepared);
    }
  }
  return snapshot;
}

export function snapshotSectorPrewarmPopulation(record) {
  return {
    promise: record?.promise || null,
    revision: Number(record?.boundaryRevision) || 0,
    boundaryRecords: new Set([...(record?.boundaryRecords || [])]),
    liveBoundaryEntries: new Map(record?.liveBoundaryPromises || []),
    boundaryMembership: [...(record?.boundaryRecords || [])].map((prepared) => ({
      id: prepared?.id,
      entity: prepared?.entity,
      record: prepared,
      fingerprint: prepared?.fingerprint,
    })),
    liveBoundaryMembership: [...(record?.liveBoundaryPromises || [])].map(([id, entry]) => ({
      id,
      entity: entry?.entity,
      entry,
      fingerprint: entry?.fingerprint,
    })),
  };
}

function sectorPrewarmPopulationMatches(record, snapshot) {
  if (!record
      || !snapshot
      || record.promise !== snapshot.promise
      || (Number(record.boundaryRevision) || 0) !== snapshot.revision) return false;
  const boundaryRecords = record.boundaryRecords || new Set();
  if (boundaryRecords.size !== snapshot.boundaryMembership.length) return false;
  for (const member of snapshot.boundaryMembership) {
    if (!boundaryRecords.has(member.record)
        || member.record?.id !== member.id
        || member.record?.entity !== member.entity
        || member.record?.fingerprint !== member.fingerprint) return false;
  }
  const liveBoundaryEntries = record.liveBoundaryPromises || new Map();
  if (liveBoundaryEntries.size !== snapshot.liveBoundaryMembership.length) return false;
  for (const member of snapshot.liveBoundaryMembership) {
    if (liveBoundaryEntries.get(member.id) !== member.entry
        || member.entry?.entity !== member.entity
        || member.entry?.fingerprint !== member.fingerprint) return false;
  }
  return true;
}

export function failClosedSectorPrewarm(error, code = 'SPACEFACE_SECTOR_PREWARM_INVARIANT') {
  const exactError = error instanceof Error ? error : new Error(String(error));
  exactError.code = exactError.code || code;
  exactError.preventSectorFallbackRotation = true;
  return exactError;
}

export function sectorPrewarmGenerationEnvelopeMatches(record, current) {
  const recordSectorId = record?.sectorId == null ? null : String(record.sectorId);
  const currentSectorId = current?.sectorId == null ? null : String(current.sectorId);
  const complete = record?.active === true
    && current?.record === record
    && Number.isFinite(record?.generation)
    && Number.isFinite(current?.generation)
    && Number.isFinite(record?.preparationEpoch)
    && Number.isFinite(current?.preparationEpoch)
    && Number.isFinite(record?.contextGeneration)
    && Number.isFinite(current?.contextGeneration)
    && typeof record?.preparationSignature === 'string'
    && record.preparationSignature.length > 0
    && typeof current?.preparationSignature === 'string'
    && current.preparationSignature.length > 0
    && typeof current?.contextLost === 'boolean'
    && recordSectorId != null
    && currentSectorId != null;
  return complete
    && record.generation === current.generation
    && record.preparationEpoch === current.preparationEpoch
    && record.contextGeneration === current.contextGeneration
    && record.preparationSignature === current.preparationSignature
    && recordSectorId === currentSectorId
    && current.contextLost === false;
}

/** Promote cleanup failures discovered while unwinding an otherwise optional admission failure.
 * abortRecords intentionally returns allSettled outcomes, so the caller must inspect both those
 * outcomes and the retained records before it can safely clear the generation or rotate residency. */
export function promoteSectorPrewarmAbortQuarantine(records, outcomes, originalError) {
  const blockedRecords = [...(records || [])].filter((record) => (
    record?.cleanupBlocked === true
      || record?.state === SECTOR_BOUNDARY_PREPARATION_STATE.aborting
      || record?.cleanupError
      || record?.restoreError
  ));
  const rejected = [...(outcomes || [])]
    .filter((outcome) => outcome?.status === 'rejected')
    .map((outcome) => outcome.reason);
  if (blockedRecords.length === 0 && rejected.length === 0) return originalError;
  const failures = [
    originalError,
    ...rejected,
    ...blockedRecords.flatMap((record) => [record.cleanupError, record.restoreError].filter(Boolean)),
  ].filter(Boolean);
  return failClosedSectorPrewarm(
    new AggregateError(failures, 'Sector prewarm abort cleanup entered quarantine', {
      cause: originalError,
    }),
    'SPACEFACE_SECTOR_PREWARM_CLEANUP_QUARANTINE',
  );
}

/** Refuse fallback residency rotation once the preparation generation no longer owns the exact
 * renderer/context envelope in which it started. Settings, resize, context loss, and supersession
 * can invalidate that envelope without first flipping record.active; checking only active/sector
 * would let a raw async rejection rotate an obsolete generation. */
export function promoteSectorPrewarmGenerationInvalidation(record, current, originalError) {
  if (sectorPrewarmGenerationEnvelopeMatches(record, current)) return originalError;
  const cause = originalError instanceof Error ? originalError : new Error(String(originalError));
  return failClosedSectorPrewarm(
    new Error('Sector prewarm renderer generation changed before fallback residency rotation', {
      cause,
    }),
    'SPACEFACE_SECTOR_PREWARM_GENERATION_INVALIDATED',
  );
}

export function createSectorPrewarmCertification(record, snapshot, current) {
  if (!sectorPrewarmGenerationEnvelopeMatches(record, current)
      || !sectorPrewarmPopulationMatches(record, snapshot)) return null;
  return Object.freeze({
    record,
    snapshot,
    sectorId: String(record.sectorId),
    generation: record.generation,
    preparationEpoch: record.preparationEpoch,
    contextGeneration: record.contextGeneration,
    preparationSignature: record.preparationSignature,
    revision: snapshot.revision,
  });
}

export function sectorPrewarmCertificationIsCurrent(record, certification, current = {}) {
  if (!certification
      || certification.record !== record
      || certification.snapshot == null
      || certification.sectorId !== String(record?.sectorId ?? '')
      || certification.generation !== record?.generation
      || certification.preparationEpoch !== record?.preparationEpoch
      || certification.contextGeneration !== record?.contextGeneration
      || certification.preparationSignature !== record?.preparationSignature
      || certification.revision !== (Number(record?.boundaryRevision) || 0)
      || !sectorPrewarmGenerationEnvelopeMatches(record, current)
      || !sectorPrewarmPopulationMatches(record, certification.snapshot)) return false;
  if (typeof current.validatePopulation === 'function') {
    try {
      if (current.validatePopulation(record, certification.snapshot) !== true) return false;
    } catch (_) {
      return false;
    }
  }
  return true;
}

/** Settle one moving sector-prewarm population to an identity-stable fixpoint. Target-sector spawn
 * events may add or replace exact boundaries while decode/GPU admission is awaiting; cardinality is
 * insufficient because equal-size churn can still substitute a different owner. Publication runs
 * only after the same promise, boundary identities, and live-entry identities survive a full settle,
 * then repeats if a producer extends the population during the asynchronous publish itself. */
export async function settleSectorPrewarmPopulationFixpoint(record, options = {}) {
  const maxPasses = Number.isInteger(options.maxPasses) && options.maxPasses > 0
    ? options.maxPasses
    : 64;
  const isActive = () => record?.active === true
    && (typeof options.isActive !== 'function' || options.isActive(record) === true);
  const awaitActivePhase = async (phase) => {
    try {
      await phase();
    } catch (error) {
      if (!isActive()) {
        // A generation superseded or retired while its phase was in flight withdraws quietly:
        // whatever the phase failed on belongs to the population census the newer generation
        // re-verifies on its own pass, not to this stale record. A quarantined teardown is a real
        // blocked cleanup rather than handoff noise, so it stays loud even on a stale generation.
        if (error?.code !== 'SPACEFACE_SECTOR_PREWARM_CLEANUP_QUARANTINE') return false;
      }
      throw error;
    }
    return isActive();
  };
  record.certification = null;
  await Promise.resolve();
  for (let pass = 0; pass < maxPasses && isActive(); pass++) {
    if (typeof options.refreshPopulation === 'function') {
      if (!await awaitActivePhase(() => options.refreshPopulation(
        record,
        { pass, phase: 'before-settle' },
      ))) return false;
    }
    const snapshot = snapshotSectorPrewarmPopulation(record);
    if (typeof options.settlePrefetch === 'function') {
      if (!await awaitActivePhase(() => options.settlePrefetch(snapshot.promise, snapshot))) return false;
    }
    if (typeof options.settleBoundaryRecords === 'function') {
      if (!await awaitActivePhase(() => options.settleBoundaryRecords(
        snapshot.boundaryRecords,
        snapshot,
      ))) return false;
    }
    if (typeof options.settleLiveBoundaryEntries === 'function') {
      if (!await awaitActivePhase(() => options.settleLiveBoundaryEntries(
        [...snapshot.liveBoundaryEntries.values()],
        snapshot,
      ))) return false;
    }
    if (typeof options.refreshPopulation === 'function') {
      if (!await awaitActivePhase(() => options.refreshPopulation(
        record,
        { pass, phase: 'after-settle' },
      ))) return false;
    }
    await Promise.resolve();
    if (!isActive()) return false;
    if (!sectorPrewarmPopulationMatches(record, snapshot)) continue;
    if (typeof options.publishBoundaryRecords === 'function') {
      if (!await awaitActivePhase(() => options.publishBoundaryRecords(
        snapshot.boundaryRecords,
        snapshot,
      ))) return false;
      if (typeof options.refreshPopulation === 'function') {
        if (!await awaitActivePhase(() => options.refreshPopulation(
          record,
          { pass, phase: 'after-publish' },
        ))) return false;
      }
      await Promise.resolve();
      if (!isActive()) return false;
      if (!sectorPrewarmPopulationMatches(record, snapshot)) continue;
    }
    if (typeof options.validatePopulation === 'function') {
      if (!await awaitActivePhase(() => options.validatePopulation(record, snapshot))) return false;
      await Promise.resolve();
      if (!isActive()) return false;
      if (!sectorPrewarmPopulationMatches(record, snapshot)) continue;
    }
    if (!isActive()) return false;
    if (typeof options.certifyPopulation === 'function') {
      let certification;
      try {
        certification = options.certifyPopulation(record, snapshot);
      } catch (error) {
        if (!isActive()) return false;
        throw error;
      }
      if (!isActive()) return false;
      if (!certification || typeof certification.then === 'function') {
        throw failClosedSectorPrewarm(
          new Error('Sector prewarm final population did not produce a synchronous certification'),
          'SPACEFACE_SECTOR_PREWARM_CERTIFICATION_MISSING',
        );
      }
      record.certification = certification;
    }
    return true;
  }
  if (!isActive()) return false;
  throw failClosedSectorPrewarm(
    new Error(`Sector prewarm population did not stabilize within ${maxPasses} deterministic passes`),
    'SPACEFACE_SECTOR_PREWARM_FIXPOINT_EXHAUSTED',
  );
}

/** Publish exactly one settled boundary snapshot. READY (and in-flight PUBLISHING) records must
 * all publish successfully; already-LIVE records are idempotent members from an earlier fixpoint
 * pass. A member that already left the claim — superseded by a newer reservation for the same id
 * or self-aborted on its own stale-before-publish path — is ordinary population churn, not a lost
 * authored boundary: the fixpoint re-verifies the live census after this phase either way. Any
 * other non-ready state or a member carrying a real failure stays a fail-closed admission error
 * rather than a silently omitted hidden reservation. */
export async function publishSectorBoundaryRecordSnapshot(records, options = {}) {
  if (typeof options.publishRecords !== 'function') {
    throw new TypeError('publishSectorBoundaryRecordSnapshot requires publishRecords');
  }
  const candidates = [];
  const withdrawn = [];
  const failed = [];
  // A member is provably retired when its own record shows the claim is gone, or — when the
  // caller can answer — a different record now owns the id. In-flight members stay candidates so
  // the publisher's memoized share can complete them instead of starting a competing reveal.
  const provablyRetired = (prepared) => !!prepared
    && (prepared.active !== true
      || !!prepared.abortReason
      || (typeof options.currentRecordForId === 'function'
        && options.currentRecordForId(prepared?.id) !== prepared));
  const recordFailed = (prepared) => prepared?.cleanupBlocked === true
    || !!(prepared && (prepared.error || prepared.cleanupError || prepared.restoreError));
  for (const prepared of records || []) {
    if (prepared?.state === SECTOR_BOUNDARY_PREPARATION_STATE.live) continue;
    if (recordFailed(prepared)) {
      failed.push(prepared);
      continue;
    }
    if (prepared?.state === SECTOR_BOUNDARY_PREPARATION_STATE.ready
        || prepared?.state === SECTOR_BOUNDARY_PREPARATION_STATE.publishing) {
      candidates.push(prepared);
      continue;
    }
    if (provablyRetired(prepared)) {
      withdrawn.push(prepared);
      continue;
    }
    failed.push(prepared
      || new Error('unknown prepared boundary'));
  }
  if (failed.length > 0) {
    const prepared = failed[0];
    throw failClosedSectorPrewarm(prepared?.cleanupError
      || prepared?.restoreError
      || prepared?.error
      || new Error(`Incoming authored boundary ${prepared?.id ?? 'unknown'} was not ready to publish`));
  }
  const published = await options.publishRecords(candidates);
  if (!Array.isArray(published)
      || published.length !== candidates.length) {
    throw failClosedSectorPrewarm(
      new Error(`Incoming sector ${options.sectorId ?? 'unknown'} publish returned an incomplete receipt`),
    );
  }
  for (let index = 0; index < candidates.length; index++) {
    if (published[index] === true) continue;
    const prepared = candidates[index];
    if (recordFailed(prepared)
        || (prepared?.active === true
          && (prepared?.state === SECTOR_BOUNDARY_PREPARATION_STATE.ready
            || prepared?.state === SECTOR_BOUNDARY_PREPARATION_STATE.publishing))
        || !provablyRetired(prepared)) {
      failed.push(prepared);
    } else {
      withdrawn.push(prepared);
    }
  }
  if (failed.length > 0) {
    // Per-candidate status at throw time distinguishes a genuine publish loss (still
    // claimed by this generation) from a mid-await supersede/abort rotation.
    const detail = candidates.map((prepared, i) => {
      const live = typeof options.currentRecordForId === 'function'
        ? options.currentRecordForId(prepared?.id)
        : undefined;
      return `${prepared?.id ?? 'unknown'}=${published?.[i] === true ? 'ok' : `fail(active=${prepared?.active},state=${prepared?.state},inMap=${live === prepared ? 'yes' : 'no'})`}`;
    }).join(',');
    throw failClosedSectorPrewarm(
      new Error(`Incoming sector ${options.sectorId ?? 'unknown'} lost a prepared authored boundary before publish [${detail}]`),
    );
  }
  if (withdrawn.length > 0) {
    return Object.freeze({
      churned: true,
      withdrawn: Object.freeze(withdrawn.map((prepared) => prepared?.id)),
    });
  }
  return true;
}

const ACCEPTED_LIVE_AUTHORED_STATES = new Set([
  'authored',
  'same-semantic-fallback',
]);

/** Assert that the stable preparation population is an exact cover of the authoritative live
 * target-sector census. This rejects both omissions and stale LIVE supersets: a previously
 * published record is evidence only while its exact entity, boundary, fingerprint, and mesh map
 * identity still agree with the current world. */
export function validateSectorPrewarmPopulationCoverage(record, options = {}) {
  const fail = (message, error = null) => {
    throw failClosedSectorPrewarm(
      error || new Error(message),
      'SPACEFACE_SECTOR_PREWARM_INCOMPLETE_PUBLICATION',
    );
  };
  const eligibleById = new Map();
  for (const entity of options.entityList || []) {
    if (!entity || typeof options.isEligible !== 'function' || options.isEligible(entity) !== true) continue;
    if (options.entities?.get(entity.id) !== entity) {
      fail(`Incoming authored entity ${entity.id} was not authoritative in the entity map`);
    }
    if (eligibleById.has(entity.id)) {
      fail(`Incoming authored entity ${entity.id} appeared more than once in the target census`);
    }
    eligibleById.set(entity.id, entity);
  }

  const covered = new Map();
  for (const prepared of record?.boundaryRecords || []) {
    if (prepared?.cleanupBlocked === true
        || prepared?.state !== SECTOR_BOUNDARY_PREPARATION_STATE.live) {
      fail(
        `Incoming authored boundary ${prepared?.id ?? 'unknown'} remained ${prepared?.state || 'unknown'} after publish`,
        prepared?.cleanupError || prepared?.restoreError || prepared?.error,
      );
    }
    if (!eligibleById.has(prepared.id)
        || !isLiveSectorBoundaryRecordCurrent(prepared, options)) {
      fail(`Published authored boundary ${prepared.id} no longer matched the authoritative entity and mesh census`);
    }
    if (covered.has(prepared.id)) {
      fail(`Incoming authored entity ${prepared.id} had more than one published preparation owner`);
    }
    covered.set(prepared.id, prepared);
  }

  for (const [id, entry] of record?.liveBoundaryPromises || []) {
    const current = options.entities?.get(id);
    const boundary = options.meshes?.get(id);
    const fingerprint = typeof options.fingerprintForEntity === 'function'
      ? options.fingerprintForEntity(current)
      : entry?.fingerprint;
    const exact = eligibleById.get(id) === current
      && current === entry?.entity
      && current?.alive !== false
      && boundary === entry?.boundary
      && current?.mesh === entry?.boundary
      && fingerprint === entry?.fingerprint
      && entry?.preparationEpoch === options.preparationEpoch
      && entry?.contextGeneration === options.contextGeneration
      && entry?.preparationSignature === options.preparationSignature
      && options.contextLost !== true
      && ACCEPTED_LIVE_AUTHORED_STATES.has(boundary?.userData?.authoredAssetState);
    if (!exact) {
      fail(`Live authored boundary ${id} no longer matched the certified renderer generation`);
    }
    if (covered.has(id)) {
      fail(`Incoming authored entity ${id} had both prepared and live admission owners`);
    }
    covered.set(id, entry);
  }

  if (covered.size !== eligibleById.size) {
    const missing = [...eligibleById.keys()].filter((id) => !covered.has(id));
    fail(`Incoming authored census was missing exact coverage for ${missing.join(', ') || 'unknown owners'}`);
  }
  return true;
}

export async function settleLiveSectorBoundaryAdmissions(entries, options = {}) {
  const candidates = [...(entries || [])].filter(Boolean);
  const outcomes = await Promise.allSettled(candidates.map((entry) => entry.promise));
  const failures = [];
  for (let index = 0; index < candidates.length; index++) {
    const entry = candidates[index];
    const current = options.entities?.get(entry.id);
    const expectedSectorId = entry.sectorId == null ? null : String(entry.sectorId);
    if (!current
        || current !== entry.entity
        || current.alive === false
        || (expectedSectorId && String(entitySectorId(current) || '') !== expectedSectorId)) {
      continue;
    }
    const boundary = options.meshes?.get(entry.id);
    // Loss detection covers only entries still claiming this generation. An entry superseded
    // while its admission promise was in flight — the population refresh replaced the claimant
    // in liveBoundaryPromises, near-body early publication promoted a prepared record for the
    // id, or a newer claim reseated the presented/registry boundary — resolves stale; whatever
    // it settled or failed on belongs to the claim the fixpoint's next pass re-grades.
    // Withdrawal, not loss (same rule the publish path applies via provablyRetired).
    const stillClaimed = typeof options.currentLiveEntryForId !== 'function'
      || options.currentLiveEntryForId(entry.id) === entry;
    if (!stillClaimed
        || current.mesh !== entry.boundary
        || (boundary != null && boundary !== entry.boundary)) {
      continue;
    }
    const outcome = outcomes[index];
    if (outcome.status === 'rejected') {
      failures.push(outcome.reason);
      continue;
    }
    entry.receipt = outcome.value;
    const fingerprint = typeof options.fingerprintForEntity === 'function'
      ? options.fingerprintForEntity(current)
      : entry.fingerprint;
    const authoredState = boundary?.userData?.authoredAssetState;
    const envelopeComplete = Number.isFinite(Number(entry.preparationEpoch))
      && Number.isFinite(Number(entry.contextGeneration))
      && typeof entry.preparationSignature === 'string'
      && entry.preparationSignature.length > 0;
    if (!boundary
        || boundary !== entry.boundary
        || current.mesh !== entry.boundary
        || fingerprint !== entry.fingerprint
        || !envelopeComplete
        || entry.preparationEpoch !== options.preparationEpoch
        || entry.contextGeneration !== options.contextGeneration
        || entry.preparationSignature !== options.preparationSignature
        || options.contextLost === true
        || !ACCEPTED_LIVE_AUTHORED_STATES.has(authoredState)) {
      failures.push(entry.receipt?.error || new Error(
        `Live authored boundary ${entry.id} did not finish exact admission `
          + `(receipt=${entry.receipt?.status || 'missing'}, state=${authoredState || 'missing'})`,
      ));
    }
  }
  if (failures.length) {
    const detail = failures.map((error) => error?.message || String(error)).join('; ');
    throw new AggregateError(failures, `Live authored sector-boundary admission failed: ${detail}`);
  }
  return true;
}
