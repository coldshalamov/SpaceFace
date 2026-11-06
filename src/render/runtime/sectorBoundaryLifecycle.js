import { SECTOR_BOUNDARY_PREPARATION_STATE } from './sectorPrewarmPopulation.js';
import { armCallbackAfterPresent } from '../compilePresentSlice.js';

/** How many retired-with-cause boundary records to keep readable after disposal erases them. */
export const SECTOR_BOUNDARY_FAILURE_TAIL = 24;
// A cleanup-blocked record may retry its boundary teardown this many times before the
// manager accepts the residue as permanent rather than re-arming every sweep forever.
export const SECTOR_BOUNDARY_CLEANUP_MAX_RETRIES = 3;

export function clearEntityMeshReference(entity, mesh) {
  if (!entity) return;
  if (entity.mesh === mesh) entity.mesh = null;
  if (entity.view && entity.view.root === mesh) entity.view = null;
}

export function authoredBoundaryPreparationSignature(renderer, state, contextGeneration = 0) {
  const canvas = renderer && renderer.domElement;
  return JSON.stringify({
    contextGeneration,
    width: Number(canvas && canvas.width) || 0,
    height: Number(canvas && canvas.height) || 0,
    pixelRatio: Number(renderer && renderer.getPixelRatio && renderer.getPixelRatio()) || 1,
    outputColorSpace: renderer && renderer.outputColorSpace || null,
    toneMapping: renderer && renderer.toneMapping || null,
    shadows: !!(renderer && renderer.shadowMap && renderer.shadowMap.enabled),
    video: state && state.settings && state.settings.video || {},
  });
}

/**
 * Generation-owned hidden-boundary lifecycle. The manager is dependency-injected so its ordering and
 * failure atomicity can be proven without constructing a WebGLRenderer. Production supplies the real
 * visual factory, scene, authored admission queue, presentation binding, and disposal functions.
 */
export function createSectorBoundaryGenerationManager(options = {}) {
  const records = new Map();
  const states = SECTOR_BOUNDARY_PREPARATION_STATE;
  const startBudgetPerTurn = Math.max(0, Number(options.startBudgetPerTurn) || 0);
  const pendingStarts = [];
  let pendingStartHead = 0;
  let startTurnScheduled = false;
  // A record that fails during prepare is caught in startRecord, stored on the record, and then
  // DELETED from `records` by disposeRecord. One frame later there is no trace of it: the entity
  // simply has no mesh and nothing anywhere says why. That is exactly how a station failing to
  // admit reads as "no visual root was ever created" instead of "the root was built and thrown
  // away because X". Retain a bounded tail of retired-with-cause records so the reason survives
  // the disposal that erases the record itself.
  const failures = [];

  const retainFailure = (record) => {
    if (!record) return;
    const cause = record.error || record.cleanupError || record.restoreError || null;
    if (!cause && !record.abortReason) return;
    failures.push({
      id: record.id,
      sectorId: record.sectorId,
      generation: record.generation,
      state: record.state,
      abortReason: record.abortReason || null,
      error: cause ? String(cause && cause.message || cause) : null,
      authoredAssetState: record.boundary && record.boundary.userData
        ? record.boundary.userData.authoredAssetState || null : null,
      cleanupBlocked: record.cleanupBlocked === true,
    });
    if (failures.length > SECTOR_BOUNDARY_FAILURE_TAIL) failures.shift();
  };

  const disposeRecord = (record) => {
    if (!record || record.state === states.live) return Promise.resolve(record);
    if (record.cleanupPromise) return record.cleanupPromise;
    record.cleaned = true;
    record.cleanupPromise = (async () => {
      record.state = states.aborting;
      if (record.boundary) {
        try { await options.disposeBoundary?.(record); }
        catch (error) { record.cleanupError = error; }
      }
      try { options.restoreEntity?.(record); }
      catch (error) { record.restoreError = error; }
      if (record.cleanupError || record.restoreError) {
        record.cleanupBlocked = true;
        record.state = states.aborting;
        // Leave a retryable record: a blocked record that stays in `records` forever pins its
        // boundary (and the whole detached tree) for the session. A bounded retry count keeps
        // transient teardown races from becoming permanent pins without looping forever on a
        // deterministically-throwing disposer.
        record.cleanupRetries = (Number(record.cleanupRetries) || 0) + 1;
        if (record.cleanupRetries <= SECTOR_BOUNDARY_CLEANUP_MAX_RETRIES) record.cleanupPromise = null;
        return record;
      }
      if (records.get(record.id) === record) records.delete(record.id);
      record.state = states.disposed;
      retainFailure(record);
      return record;
    })();
    return record.cleanupPromise;
  };

  const startRecord = async (record) => {
    if (!record.active) return disposeRecord(record);
    try {
      options.captureBeforeStart?.(record);
      record.beforeStartCaptured = true;
      record.boundary = options.buildBoundary(record);
      if (!record.boundary) throw new Error(`No render boundary for ${record.id}`);
      if (!record.active) return disposeRecord(record);
      options.mountBoundary(record);
      record.state = states.mountedHidden;
      if (!record.active) return disposeRecord(record);
      record.state = states.preparing;
      record.preparation = Promise.resolve(options.requestPreparation(record));
      record.receipt = await record.preparation;
      if (!record.active) return disposeRecord(record);
      if (options.isPrepared && options.isPrepared(record) !== true) {
        throw new Error(`Authored boundary ${record.id} did not reach prepared admission`);
      }
      record.state = states.ready;
      return record;
    } catch (error) {
      record.error = error;
      record.active = false;
      return disposeRecord(record);
    }
  };

  const scheduleStartTurn = () => {
    if (startTurnScheduled || pendingStartHead >= pendingStarts.length) return;
    startTurnScheduled = true;
    const schedule = typeof options.scheduleNextStartTurn === 'function'
      ? options.scheduleNextStartTurn
      : scheduleSectorBoundaryBuildTurn;
    schedule(() => {
      startTurnScheduled = false;
      const end = Math.min(pendingStarts.length, pendingStartHead + startBudgetPerTurn);
      while (pendingStartHead < end) {
        const pending = pendingStarts[pendingStartHead++];
        Promise.resolve(startRecord(pending.record)).then(pending.resolve, pending.reject);
      }
      if (pendingStartHead >= pendingStarts.length) {
        pendingStarts.length = 0;
        pendingStartHead = 0;
      }
      scheduleStartTurn();
    });
  };

  const scheduleRecordStart = (record) => {
    if (startBudgetPerTurn <= 0) return startRecord(record);
    return new Promise((resolve, reject) => {
      pendingStarts.push({ record, resolve, reject });
      scheduleStartTurn();
    });
  };

  const reserve = (spec = {}) => {
    const id = spec.id ?? spec.entity?.id;
    if (id == null || id === '') return null;
    const prior = records.get(id);
    if (prior && prior.active && prior.generation === spec.generation && prior.entity === spec.entity) {
      return prior;
    }
    if (prior) {
      prior.active = false;
      if (prior.state !== states.disposed && prior.state !== states.live) prior.state = states.aborting;
    }
    const record = {
      ...spec,
      id,
      active: true,
      cleaned: false,
      cleanupPromise: null,
      boundary: null,
      preparation: null,
      receipt: null,
      error: null,
      state: states.reserved,
    };
    records.set(id, record);
    const priorCleanup = prior && prior.state !== states.live
      ? Promise.resolve(prior.settled).then(() => disposeRecord(prior))
      : Promise.resolve(prior);
    record.settled = priorCleanup.then((cleanedPrior) => {
      if (cleanedPrior
          && cleanedPrior.state !== states.disposed
          && cleanedPrior.state !== states.live) {
        throw new AggregateError(
          [cleanedPrior.cleanupError, cleanedPrior.restoreError].filter(Boolean),
          `Prior authored boundary ${id} could not be retired safely`,
        );
      }
      return scheduleRecordStart(record);
    }).catch((error) => {
      record.active = false;
      record.error = error;
      record.cleanupError = error;
      record.cleanupBlocked = true;
      record.state = states.aborting;
      throw error;
    });
    return record;
  };

  const abort = (record, reason = 'sector-boundary-aborted') => {
    if (!record || record.state === states.live || record.state === states.disposed) {
      return Promise.resolve(record);
    }
    record.abortReason = reason;
    record.active = false;
    record.state = states.aborting;
    return Promise.resolve(record.settled).then(() => disposeRecord(record));
  };

  const publishOnce = async (record) => {
    if (!record) return false;
    await record.settled;
    if (record.state === states.live) return true;
    if (!record.active || record.state !== states.ready || options.validate?.(record) !== true) {
      await abort(record, record.abortReason || 'sector-boundary-stale-before-publish');
      return false;
    }
    record.state = states.publishing;
    try {
      if (options.publishBoundary(record) === false) {
        throw new Error(`Authored boundary ${record.id} publication was declined`);
      }
      record.state = states.live;
      record.active = false;
      if (records.get(record.id) === record) records.delete(record.id);
      return true;
    } catch (error) {
      record.error = error;
      record.active = false;
      await disposeRecord(record);
      return false;
    }
  };

  /** One publication per record. A near body may be revealed ahead of its certified set while the
   * set's own fixpoint is settling, so two callers can reach a READY record across the same await;
   * without this memo both would run the reveal transaction and bind the same mesh twice. */
  const publish = (record) => {
    if (!record) return Promise.resolve(false);
    if (!record.publishPromise) record.publishPromise = publishOnce(record);
    return record.publishPromise;
  };

  return {
    reserve,
    publish,
    /**
     * Reveal one already-prepared boundary ahead of the certified set, or decline without touching
     * it. Declining must be free: `publish()` aborts a record it cannot publish, and an aborted
     * member fails the whole sector's certified publication closed, so a near body that is not
     * cleanly publishable right now is simply left for the set's own fixpoint.
     */
    publishIfReady(record) {
      if (!record) return Promise.resolve(false);
      if (record.publishPromise) return record.publishPromise;
      if (record.active !== true
        || record.state !== states.ready
        || records.get(record.id) !== record
        || (typeof options.validate === 'function' && options.validate(record) !== true)) {
        return Promise.resolve(false);
      }
      return publish(record);
    },
    abort,
    abortEntity(id, reason) {
      return abort(records.get(id), reason);
    },
    abortRecords(iterable, reason) {
      return Promise.allSettled([...(iterable || [])].map((record) => abort(record, reason)));
    },
    abortAll(reason) {
      return Promise.allSettled([...records.values()].map((record) => abort(record, reason)));
    },
    settleRecords(iterable) {
      return Promise.allSettled([...(iterable || [])].map((record) => (
        Promise.resolve(record && record.settled).then(() => record?.cleanupPromise || record)
      )));
    },
    publishRecords(iterable) {
      return Promise.all([...(iterable || [])].map((record) => publish(record)));
    },
    has(id) {
      return records.has(id);
    },
    get(id) {
      return records.get(id) || null;
    },
    /** True while any live record (or one of its staged prewarm boundaries) still owns this
     * boundary — a prepared admission parked off-scene is claimed, never leak-sweepable. */
    isBoundaryClaimed(boundary) {
      if (!boundary) return false;
      for (const record of records.values()) {
        if (record.boundary === boundary) return true;
        for (const prepared of record.boundaryRecords || []) {
          if (prepared && prepared.boundary === boundary) return true;
        }
      }
      return false;
    },
    /** Re-arms a cleanup-blocked record's teardown. `disposeRecord` cleared `cleanupPromise`
     * on the failure path only while retries remain, so this is a no-op once exhausted. */
    retryBlockedCleanup(record) {
      if (!record || record.cleanupBlocked !== true || record.cleanupPromise) return null;
      return disposeRecord(record);
    },
    inspect() {
      return [...records.values()].map((record) => ({
        id: record.id,
        sectorId: record.sectorId,
        generation: record.generation,
        state: record.state,
        active: record.active,
        abortReason: record.abortReason || null,
        error: record.error ? String(record.error.message || record.error) : null,
      }));
    },
    /** Retired boundaries that gave up, with the cause the record carried when it was deleted. */
    inspectFailures() {
      return failures.map((entry) => ({ ...entry }));
    },
  };
}

function scheduleSectorBoundaryBuildTurn(callback) {
  // Boundary builds are ambient admission work: each turn runs budgeted mount/prepare steps and
  // mounts land hidden until the publisher reveals them. Inside the rAF callback they ran on the
  // frame's pre-present budget; after the present at background priority they cannot delay it.
  armCallbackAfterPresent(callback);
}

/** Transactionally attach one prepared hidden boundary to render/presentation ownership. Binding
 * hooks are allowed to mutate and then throw, so every attempted owner is rolled back independently
 * before the original failure escapes to the generation manager. */
export function publishPreparedSectorBoundary(record, options = {}) {
  const entity = record && record.entity;
  const boundary = record && record.boundary;
  const id = record?.id ?? entity?.id;
  if (!entity || !boundary || id == null || id === '') return false;
  boundary.visible = false;
  if (options.publishAuthoredBoundary?.(boundary) === false) return false;
  options.seatBoundary?.(record);

  entity.mesh = boundary;
  entity.view = { root: boundary };
  options.meshes?.set(id, boundary);
  try {
    record.presentationBindingAttempted = true;
    const presentationBound = options.bindPresentationMesh?.(entity, boundary);
    if (presentationBound === false) {
      throw new Error(`Prepared boundary ${id} could not bind presentation ownership`);
    }
    record.asteroidBindingAttempted = true;
    options.registerAsteroid?.(entity, boundary);
    options.markShadowReceiversDirty?.();
    boundary.visible = true;
    return true;
  } catch (error) {
    boundary.visible = false;
    const rollbackErrors = [];
    try {
      options.unbindPresentationMesh?.(id, boundary);
      record.presentationBindingAttempted = false;
    }
    catch (cleanupError) { rollbackErrors.push(cleanupError); }
    try {
      options.releaseAsteroid?.(id);
      record.asteroidBindingAttempted = false;
    }
    catch (cleanupError) { rollbackErrors.push(cleanupError); }
    try {
      if (options.meshes?.get(id) === boundary) options.meshes.delete(id);
    } catch (cleanupError) { rollbackErrors.push(cleanupError); }
    clearEntityMeshReference(entity, boundary);
    // The boundary mounts un-noted by design (its receivers are covered by the publish
    // recount), and the rollback can run before or after that recount — only a recount
    // re-derives the subtree's tally exactly, never a fixed subtract.
    try {
      options.markShadowReceiversDirty?.();
    }
    catch (cleanupError) { rollbackErrors.push(cleanupError); }
    if (rollbackErrors.length) {
      throw new AggregateError([error, ...rollbackErrors], `Prepared boundary ${id} rollback failed`, {
        cause: error,
      });
    }
    throw error;
  }
}

/** Exhaust the exact prepared-boundary ownership journal before falling back to ordinary Object3D
 * teardown. Authored roots clear their owner-local resources first, so the generic traversal sees
 * only the remaining procedural substrate and cannot replace a failed cleanup with a second owner. */
export async function disposePreparedSectorBoundary(record, options = {}) {
  const boundary = record?.boundary;
  const id = record?.id ?? record?.entity?.id;
  if (!boundary || id == null || id === '') return false;
  const cleanupErrors = [];
  const attempt = async (cleanup) => {
    try { await cleanup(); }
    catch (error) { cleanupErrors.push(error); }
  };
  boundary.visible = false;
  if (record.presentationBindingAttempted) {
    await attempt(() => options.unbindPresentationMesh?.(id, boundary));
  }
  if (record.asteroidBindingAttempted) {
    await attempt(() => options.releaseAsteroid?.(id));
  }
  await attempt(() => {
    if (options.meshes?.get(id) === boundary) options.meshes.delete(id);
  });
  await attempt(() => options.removeBoundary?.(boundary));
  await attempt(() => options.disposePreparedBoundary?.(boundary));
  await attempt(() => options.disposeBoundaryObject?.(boundary));
  await attempt(() => clearEntityMeshReference(record.entity, boundary));
  await attempt(() => options.markShadowReceiversDirty?.());
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, `Prepared boundary ${id} cleanup failed`);
  }
  record.presentationBindingAttempted = false;
  record.asteroidBindingAttempted = false;
  return true;
}
