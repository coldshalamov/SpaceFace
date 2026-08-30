// Debug-only render continuity witness.
//
// The normal renderer already owns the entity/snapshot, mesh, LOD, submission, pipeline, and
// residency boundaries. This module only samples those boundaries when explicitly enabled. It is
// deliberately renderer-agnostic so the decision rules can be tested without a WebGL context.
// The renderer does not instantiate this module while disabled, so its normal frame path allocates
// nothing for continuity; enabled sampling is bounded and opt-in.

export const RENDER_CONTINUITY_SCHEMA = 'spaceface.renderContinuity.v1';
export const DEFAULT_RENDER_CONTINUITY_SAMPLE_EVERY = 6;
export const DEFAULT_RENDER_CONTINUITY_MISS_SAMPLES = 3;
export const DEFAULT_RENDER_CONTINUITY_MAX_OBJECTS = 256;
export const DEFAULT_RENDER_CONTINUITY_ALERT_LIMIT = 64;
const MAX_SCENE_NODES = 2048;

const AUTHORIZED_REASONS = new Set([
  'despawn',
  'cull',
  'view-cull',
  'presentation-tier',
  'sector-transition',
  'sector-residency',
  'lod-transition',
  'context-loss',
  'lifecycle-transition',
  'opening-defer',
]);

const AUTHORIZED_TRANSITION_REASONS = new Set([
  'context-loss',
  'context-restored',
  'loading-transition',
  'flight-transition',
  'mode-transition',
  'opening-defer',
  'opening-defer-release',
  'sector-transition',
  'sector-residency',
]);

const CHAIN = Object.freeze([
  'entity/snapshot',
  'asset/authored-state',
  'mesh/view-root',
  'scene-parent/visibility/visible-leaves',
  'lod',
  'cull-reason',
  'frame-tier',
  'instance-submission',
  'pipeline',
  'residency/sector/origin-generation',
  'authorized-lifecycle-transition',
  'last-render-error',
]);

/**
 * Create a sampled render-continuity observer.
 *
 * `observe(context)` samples every `sampleEvery` calls. `sample(context)` forces one sample and is
 * useful for focused tests. The context is intentionally a bag of already-owned renderer facts;
 * callers do not need to construct a parallel render model.
 */
export function createRenderContinuityCensus(options = {}) {
  let enabled = options.enabled === true;
  const sampleEvery = positiveInt(options.sampleEvery, DEFAULT_RENDER_CONTINUITY_SAMPLE_EVERY);
  const missSamples = positiveInt(options.missSamples, DEFAULT_RENDER_CONTINUITY_MISS_SAMPLES);
  const maxObjects = positiveInt(options.maxObjects, DEFAULT_RENDER_CONTINUITY_MAX_OBJECTS);
  const alertLimit = positiveInt(options.alertLimit, DEFAULT_RENDER_CONTINUITY_ALERT_LIMIT);
  const tracks = new Map();
  const alerts = [];
  const transitions = [];
  let callFrame = 0;
  let sampledFrames = 0;
  let latest = null;
  let lastError = null;
  let disposed = false;

  function reset() {
    tracks.clear();
    alerts.length = 0;
    transitions.length = 0;
    callFrame = 0;
    sampledFrames = 0;
    latest = null;
    lastError = null;
    return api;
  }

  function observe(context = {}) {
    if (disposed || !enabled) return null;
    callFrame++;
    if (callFrame % sampleEvery !== 0) return null;
    return sampleContext(context, callFrame, alerts, alertLimit);
  }

  function sample(context = {}) {
    if (disposed || !enabled) return null;
    callFrame++;
    return sampleContext(context, callFrame, alerts, alertLimit);
  }

  function sampleContext(context, frame, alertSink, alertCap) {
    sampledFrames++;
    const entities = collectEntities(context);
    const seen = new Set();
    const rows = [];
    const limit = Math.min(maxObjects, entities.length);
    for (let index = 0; index < limit; index++) {
      const entity = entities[index];
      const id = entityId(entity);
      if (id == null || seen.has(id)) continue;
      seen.add(id);
      const row = inspectRenderContinuityObject(entity, context, {
        track: tracks.get(id),
        missSamples,
      });
      const track = updateTrack(tracks, id, row, frame, context, missSamples, alertSink, alertCap);
      row.continuity.missSamples = track.missSamples;
      row.continuity.previouslyVisibleInCamera = track.everVisibleInCamera === true;
      row.continuity.disappearance = track.disappearance || null;
      rows.push(row);
    }

    // An entity disappearing from the state table is an authorized despawn. Retain one explicit row
    // for it so the witness explains why the prior visible object is no longer in the sample.
    for (const [id, track] of tracks) {
      if (seen.has(id) || track.lastSeenFrame === frame) continue;
      if (track.everVisibleInCamera !== true) {
        tracks.delete(id);
        continue;
      }
      const row = inspectRenderContinuityObject(null, {
        ...context,
        cullReasons: withReason(context.cullReasons, id, 'despawn'),
      }, { track, missSamples });
      row.id = id;
      row.continuity.missSamples = 0;
      row.continuity.previouslyVisibleInCamera = true;
      row.continuity.disappearance = null;
      rows.push(row);
      tracks.delete(id);
    }

    pruneTracks(tracks, frame, maxObjects);
    const state = context.state || {};
    const render = state.render || {};
    const lifecycle = inspectLifecycle(context, state, render, null, {});
    const currentError = context.lastRenderError || render.lastRenderError || lastError || null;
    const report = {
      schema: RENDER_CONTINUITY_SCHEMA,
      enabled: true,
      sampleEvery,
      missSamples,
      frame,
      sampledFrames,
      objectCount: rows.length,
      disappearanceCount: alerts.length,
      chain: CHAIN,
      rows,
      alerts: alerts.slice(),
      transitions: transitions.slice(),
      lastRenderError: currentError,
      mode: context.mode ?? state.mode ?? null,
      lifecycle,
      sector: context.currentSectorId ?? state.world?.currentSectorId ?? null,
      origin: readOrigin(context, state),
      queue: context.queue ? summarizeQueue(context.queue) : null,
    };
    latest = report;
    return report;
  }

  function getReport() {
    if (latest) return latest;
    return {
      schema: RENDER_CONTINUITY_SCHEMA,
      enabled: enabled && !disposed,
      sampleEvery,
      missSamples,
      frame: callFrame,
      sampledFrames,
      objectCount: 0,
      disappearanceCount: alerts.length,
      chain: CHAIN,
      rows: [],
      alerts: alerts.slice(),
      transitions: transitions.slice(),
      lastRenderError: lastError,
      mode: null,
      lifecycle: null,
      sector: null,
      origin: null,
      queue: null,
    };
  }

  function recordError(stage, error, metadata = {}) {
    const entry = normalizeError(stage, error, metadata);
    lastError = entry;
    if (latest) {
      latest.lastRenderError = entry;
      for (const row of latest.rows) row.lastRenderError = entry;
    }
    return entry;
  }

  function recordTransition(reason, metadata = {}) {
    const entry = {
      reason: String(reason || 'lifecycle-transition'),
      frame: callFrame,
      ...safeMetadata(metadata),
    };
    transitions.push(entry);
    if (transitions.length > 16) transitions.splice(0, transitions.length - 16);
    return entry;
  }

  function setEnabled(value) {
    const next = value === true;
    if (next !== enabled) reset();
    enabled = next;
    if (latest) latest.enabled = enabled && !disposed;
    return enabled;
  }

  function dispose() {
    reset();
    enabled = false;
    disposed = true;
    return undefined;
  }

  const api = {
    observe,
    sample,
    getReport,
    recordError,
    recordTransition,
    setEnabled,
    reset,
    dispose,
    get enabled() { return enabled && !disposed; },
    get sampleEvery() { return sampleEvery; },
    get missSamples() { return missSamples; },
  };
  return api;
}

/** Pure object inspection helper used by the observer and focused tests. */
export function inspectRenderContinuityObject(entity, context = {}, options = {}) {
  const state = context.state || {};
  const render = state.render || {};
  const id = entityId(entity);
  const meshInfo = resolveMesh(entity, context, id);
  const root = meshInfo.root;
  const userData = root && root.userData || {};
  const record = resolveFrameRecord(context.entityFrame, id);
  const snapshot = context.snapshot || context.latestSnapshot;
  const snapshotIndex = id == null || !snapshot ? -1 : snapshotIndexFor(snapshot, id);
  const snapshotKnown = snapshot != null;
  const snapshotPresent = snapshotKnown ? snapshotIndex >= 0 : null;
  const scene = inspectSceneRoot(root, context.scene);
  const lod = inspectLod(root, userData);
  const instance = inspectInstanceSubmission(entity, root, context, id);
  const pipeline = inspectPipeline(root, userData, context, id);
  const currentSectorId = context.currentSectorId
    ?? state.world?.currentSectorId
    ?? null;
  const residency = inspectResidency(entity, root, userData, context, currentSectorId);
  const lifecycle = inspectLifecycle(context, state, render, root, userData);
  const inCamera = resolveInCamera(entity, record, context, id);
  const presentationTier = entity?.activity?.presentationTier
    ?? record?.presentationTier
    ?? resolveMapValue(context.presentationTiers, id)
    ?? null;
  const explicitCullReason = resolveCullMap(context.cullReasons, id)
    || inspectCullReason(userData.renderCullReason)
    || inspectCullReason(userData.cullReason)
    || inspectCullReason(entity?.renderCullReason)
    || null;
  const cullReason = explicitCullReason
    || resolveAuthorizedCullReason({
      entity,
      root,
      scene,
      lod,
      lifecycle,
      inCamera,
      presentationTier,
      currentSectorId,
      residency,
      context,
    });
  const alive = entity == null ? false : entity.alive !== false;
  const rootReady = !!root;
  const visibleStructure = scene.visibleLeafCount > 0 || instance.submitted === true;
  const visualReady = alive
    && rootReady
    && scene.attached
    && scene.chainVisible
    && visibleStructure
    && pipeline.pending !== true
    && pipeline.ready !== false
    && pipeline.error == null
    && snapshotPresent !== false;
  const renderable = visualReady && inCamera === true;
  const missing = [];
  if (!alive) missing.push('entity');
  if (snapshotPresent === false) missing.push('snapshot');
  if (!rootReady) missing.push('mesh/view-root');
  if (rootReady && !scene.attached) missing.push('scene-parent');
  if (rootReady && !scene.chainVisible) missing.push('visibility');
  if (rootReady && !visibleStructure) missing.push('visible-leaves');
  if (pipeline.pending === true || pipeline.ready === false) missing.push('pipeline');
  if (inCamera !== true) missing.push('in-camera');

  const previous = options.track || null;
  const continuity = {
    renderable,
    visualReady,
    inCamera,
    previouslyVisibleInCamera: previous?.everVisibleInCamera === true,
    missSamples: previous?.missSamples || 0,
    missing,
    disappearance: null,
  };

  return {
    id,
    type: entity?.type || null,
    selector: inspectSelector(entity, userData),
    entity: {
      present: entity != null,
      alive,
      id,
      type: entity?.type || null,
      pos: finitePosition(entity?.pos),
    },
    snapshot: {
      known: snapshotKnown,
      present: snapshotPresent,
      index: snapshotIndex,
      sequence: finiteOrNull(snapshot?.sequence),
      count: finiteOrNull(snapshot?.count),
    },
    asset: inspectAsset(entity, root, userData),
    mesh: {
      present: !!meshInfo.mesh,
      source: meshInfo.source,
      rootPresent: !!root,
      rootName: root?.name || root?.type || null,
      rootUuid: root?.uuid || null,
      viewRootMatchesMesh: !meshInfo.mesh || !root || meshInfo.mesh === root,
    },
    scene,
    lod,
    cull: {
      inCamera,
      reason: cullReason || null,
      authorized: isAuthorizedReason(cullReason),
      recordViewCulled: record?.viewCulled === true,
    },
    frame: {
      presentationTier,
      simTier: entity?.activity?.simTier ?? record?.simTier ?? null,
      activityFrame: summarizeActivityFrame(context.activityFrame, id),
      frameId: finiteOrNull(context.frameId ?? context.entityFrame?.frameId),
    },
    instance,
    pipeline,
    residency,
    origin: readOrigin(context, state),
    lifecycle,
    lastRenderError: context.lastRenderError || render.lastRenderError || null,
    continuity,
  };
}

export const classifyRenderContinuityObject = inspectRenderContinuityObject;
export const evaluateRenderContinuity = inspectRenderContinuityObject;

/** Pure multi-frame decision helper. */
export function shouldReportRenderDisappearance({
  previouslyVisibleInCamera = false,
  inCamera = null,
  renderable = false,
  authorizedReason = null,
  missSamples = 0,
  threshold = DEFAULT_RENDER_CONTINUITY_MISS_SAMPLES,
} = {}) {
  return previouslyVisibleInCamera === true
    && inCamera === true
    && renderable !== true
    && !isAuthorizedReason(authorizedReason)
    && Number(missSamples) >= positiveInt(threshold, DEFAULT_RENDER_CONTINUITY_MISS_SAMPLES);
}

function updateTrack(tracksById, id, row, frame, context, threshold, alertSink, alertCap) {
  let track = tracksById.get(id);
  if (!track) {
    track = {
      id,
      firstFrame: frame,
      lastSeenFrame: frame,
      lastSector: row.residency.currentSectorId,
      lastOriginSequence: row.origin?.sequence ?? null,
      everVisibleInCamera: false,
      lastRenderable: false,
      missSamples: 0,
      disappearance: null,
      lastReason: null,
    };
    tracksById.set(id, track);
  }
  const authorizedReason = row.cull.authorized ? row.cull.reason : null;
  const inCamera = row.cull.inCamera;
  const wasVisible = track.everVisibleInCamera === true;
  if (row.continuity.renderable === true) {
    track.everVisibleInCamera = true;
    track.lastRenderable = true;
    track.missSamples = 0;
    track.disappearance = null;
  } else if (wasVisible && inCamera === true && !isAuthorizedReason(authorizedReason)) {
    track.lastRenderable = false;
    track.missSamples++;
    if (track.missSamples >= threshold && !track.disappearance) {
      const alert = {
        id,
        frame,
        missSamples: track.missSamples,
        reason: row.cull.reason || 'unexplained-render-loss',
        missing: row.continuity.missing.slice(),
        lastRenderError: row.lastRenderError || context.lastRenderError || null,
      };
      alertsPush(alertSink, alert, alertCap);
      track.disappearance = alert;
    }
  } else {
    track.lastRenderable = false;
    track.missSamples = 0;
    track.disappearance = null;
  }
  track.lastReason = row.cull.reason || null;
  track.lastSector = row.residency.currentSectorId;
  track.lastOriginSequence = row.origin?.sequence ?? null;
  track.lastSeenFrame = frame;
  return track;
}

function alertsPush(list, alert, cap = DEFAULT_RENDER_CONTINUITY_ALERT_LIMIT) {
  if (!Array.isArray(list)) return;
  list.push(alert);
  if (list.length > cap) list.splice(0, list.length - cap);
}

function collectEntities(context) {
  if (Array.isArray(context.entities)) return context.entities;
  if (context.entities && typeof context.entities.values === 'function') return [...context.entities.values()];
  if (context.entityMap && typeof context.entityMap.values === 'function') return [...context.entityMap.values()];
  if (context.entityList && Array.isArray(context.entityList)) return context.entityList;
  return [];
}

function resolveMesh(entity, context, id) {
  const entityMesh = entity?.mesh || null;
  const viewRoot = entity?.view?.root || null;
  const mapped = resolveMapValue(context.meshes, id) || null;
  const mesh = entityMesh || viewRoot || mapped;
  const root = viewRoot || entityMesh || mapped;
  return {
    mesh,
    root,
    source: entityMesh ? 'entity.mesh' : viewRoot ? 'entity.view.root' : mapped ? 'renderer.meshes' : 'missing',
  };
}

function inspectSelector(entity, userData) {
  const data = entity?.data || {};
  return {
    defId: data.defId ?? entity?.defId ?? null,
    assetRef: data.assetRef ?? entity?.assetRef ?? null,
    silhouette: data.silhouette ?? entity?.silhouette ?? null,
    trafficRole: data.trafficRole ?? entity?.trafficRole ?? null,
    factionId: entity?.factionId ?? data.factionId ?? null,
    assetId: userData.assetId ?? userData.authoredCompositionId ?? null,
  };
}

function inspectAsset(entity, root, userData) {
  const data = entity?.data || {};
  const envelope = userData.authoredSourceEnvelope || userData.sourceEnvelope || null;
  const packageInfo = userData.flightRenderPackage || userData.renderPackage || null;
  return {
    authoredState: userData.authoredAssetState ?? null,
    visualRoot: userData.authoredVisualRoot ?? null,
    assetId: userData.assetId ?? userData.authoredCompositionId ?? packageInfo?.assetId ?? data.assetRef ?? null,
    sourceUrl: envelope?.sourceUrl ?? envelope?.url ?? packageInfo?.sourceUrl ?? null,
    releaseUrl: envelope?.releaseUrl ?? packageInfo?.releaseUrl ?? null,
    sourceHash: envelope?.sourceSha256 ?? packageInfo?.sourceSha256 ?? null,
    releaseHash: envelope?.releaseSha256 ?? packageInfo?.releaseSha256 ?? null,
    packageId: packageInfo?.packageId ?? packageInfo?.id ?? null,
    packageGeneration: packageInfo?.generation ?? packageInfo?.contentHash ?? null,
    readableFallbackRetained: userData.authoredReadableFallbackRetained === true,
    rootPresent: !!root,
  };
}

function inspectSceneRoot(root, scene) {
  if (!root) {
    return {
      attached: false,
      attachedToScene: false,
      rootVisible: false,
      ancestorVisible: false,
      chainVisible: false,
      parent: null,
      visibleLeafCount: 0,
      drawableLeafCount: 0,
      zeroCountInstanceLeaves: 0,
      instancedLeafCount: 0,
      nodeCount: 0,
      nodeLimitHit: false,
    };
  }
  let parent = root.parent || null;
  let ancestorVisible = true;
  let attached = !!parent;
  let attachedToScene = scene == null ? attached : false;
  let current = root;
  while (current) {
    if (current.visible === false) ancestorVisible = false;
    if (current !== root && current.parent) attached = true;
    if (scene && current === scene) attachedToScene = true;
    current = current.parent || null;
  }
  if (scene != null) attached = attachedToScene;
  let drawableLeafCount = 0;
  let visibleLeafCount = 0;
  let zeroCountInstanceLeaves = 0;
  let instancedLeafCount = 0;
  let nodeCount = 0;
  let nodeLimitHit = false;
  const visited = new Set();
  const visit = (object, visible) => {
    if (!object || visited.has(object)) return;
    if (nodeCount >= MAX_SCENE_NODES) {
      nodeLimitHit = true;
      return;
    }
    visited.add(object);
    nodeCount++;
    const nextVisible = visible && object.visible !== false;
    if (isDrawable(object)) {
      drawableLeafCount++;
      if (object.isInstancedMesh || object.isBatchedMesh) {
        instancedLeafCount++;
        const count = Number(object.count);
        if (!(Number.isFinite(count) && count > 0)) zeroCountInstanceLeaves++;
        else if (nextVisible && materialVisible(object.material)) visibleLeafCount++;
      } else if (nextVisible && materialVisible(object.material)) {
        visibleLeafCount++;
      }
    }
    const children = Array.isArray(object.children) ? object.children : [];
    for (let index = 0; index < children.length; index++) visit(children[index], nextVisible);
  };
  visit(root, true);
  return {
    attached,
    attachedToScene,
    rootVisible: root.visible !== false,
    ancestorVisible,
    chainVisible: root.visible !== false && ancestorVisible,
    parent: parent?.name || parent?.type || null,
    visibleLeafCount,
    drawableLeafCount,
    zeroCountInstanceLeaves,
    instancedLeafCount,
    nodeCount,
    nodeLimitHit,
  };
}

function inspectLod(root, userData) {
  const state = userData.lod || null;
  const available = userData.authoredLodLevels || userData.lodLevels || null;
  return {
    level: state?.level ?? userData.lodLevel ?? null,
    projectedPx: finiteOrNull(state?.lastPx ?? userData.projectedWidthPx),
    transitioning: !!(
      userData.wholeShipLodTransitionPromise
      || userData.lodTransitionPromise
      || userData.lodTransitioning === true
      || state?.transitioning === true
    ),
    available: summarizeLodLevels(available),
    rootPresent: !!root,
  };
}

function summarizeLodLevels(value) {
  if (Array.isArray(value)) {
    return value.slice(0, 8).map((level) => (
      typeof level === 'string' ? level : level?.id ?? level?.level ?? null
    ));
  }
  if (value && typeof value === 'object') return Object.keys(value).slice(0, 8);
  return null;
}

function inspectInstanceSubmission(entity, root, context, id) {
  const provided = resolveMapValue(context.instanceSubmissions, id)
    || (typeof context.instanceSubmission === 'function' ? context.instanceSubmission(entity, root) : null)
    || (context.instanceSubmission && typeof context.instanceSubmission === 'object' ? context.instanceSubmission : null);
  if (provided) return normalizeInstance(provided, root);
  const asteroidOwned = context.asteroidInstancePool?.byEntity?.get?.(id);
  if (asteroidOwned) {
    const bucket = asteroidOwned.bucket;
    const index = bucket?.entityIds?.indexOf?.(id) ?? -1;
    return {
      kind: 'asteroid-instance-pool',
      registered: true,
      adopted: asteroidOwned.record?.leaf?.userData?.asteroidInstanceAdopted === true,
      submitted: index >= 0,
      submittedIndex: index,
      count: Number(bucket?.mesh?.count) || 0,
      poolMeshUuid: bucket?.mesh?.uuid || null,
    };
  }
  if (root?.isInstancedMesh || root?.isBatchedMesh) {
    const count = Number(root.count) || 0;
    return {
      kind: root.isBatchedMesh ? 'batched-mesh' : 'instanced-mesh',
      registered: true,
      submitted: root.visible !== false && count > 0,
      submittedIndex: null,
      count,
      poolMeshUuid: root.uuid || null,
    };
  }
  const userData = root?.userData || {};
  return {
    kind: userData.asteroidInstanceBody ? 'source-leaf' : 'direct-root',
    registered: !!userData.asteroidInstanceBody,
    adopted: userData.asteroidInstanceBody?.userData?.asteroidInstanceAdopted === true,
    submitted: null,
    submittedIndex: null,
    count: null,
    poolMeshUuid: null,
  };
}

function normalizeInstance(value, root) {
  return {
    kind: value.kind || value.source || 'provided',
    registered: value.registered !== false,
    adopted: value.adopted === true,
    submitted: value.submitted == null ? null : value.submitted === true,
    submittedIndex: finiteOrNull(value.submittedIndex),
    count: finiteOrNull(value.count ?? value.submittedCount),
    poolMeshUuid: value.poolMeshUuid || value.meshUuid || root?.uuid || null,
  };
}

function inspectPipeline(root, userData, context, id) {
  const provided = resolveMapValue(context.pipelines, id)
    || (typeof context.pipeline === 'function' ? context.pipeline(root, id) : null)
    || null;
  const pending = provided?.pending === true
    || userData.pipelinesPending === true
    || userData.authoredAssetState === 'compiling-pipelines';
  const ready = provided?.ready ?? userData.pipelineReady ?? userData.authoredPipelineReadyState ?? null;
  const error = provided?.error ?? userData.pipelineError ?? userData.lastPipelineError ?? null;
  const precompile = context.state?.render?.pipelinePrecompileReady ?? null;
  return {
    pending,
    ready: typeof ready === 'boolean' ? ready : null,
    error: error ? String(error.message || error) : null,
    key: provided?.key ?? userData.pipelineKey ?? null,
    source: provided ? 'context' : userData.pipelinesPending === true ? 'mesh.userData' : null,
    rendererPrecompileReady: summarizePipelineReadiness(precompile),
  };
}

function summarizePipelineReadiness(value) {
  if (value == null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value.then === 'function') return 'pending';
  if (typeof value === 'object') {
    if (typeof value.ready === 'boolean') return value.ready;
    if (typeof value.ok === 'boolean') return value.ok;
    if (value.skipped === true) return 'skipped';
  }
  return null;
}

function inspectResidency(entity, root, userData, context, currentSectorId) {
  const data = entity?.data || {};
  const packageInfo = userData.flightRenderPackage || userData.renderPackage || {};
  const local = userData.residency || userData.assetResidency || packageInfo.residency || {};
  const render = context.state?.render || {};
  const aggregate = context.assetResidency || render.assetResidency || null;
  return {
    key: local.key ?? packageInfo.residencyKey ?? null,
    generation: local.generation ?? packageInfo.generation ?? packageInfo.contentHash ?? null,
    state: local.state ?? null,
    role: local.role ?? userData.residencyRole ?? null,
    entitySectorId: data.sectorId ?? entity?.homeSectorId ?? null,
    currentSectorId,
    aggregateGeneration: aggregate?.generation ?? aggregate?.contextGeneration ?? null,
    aggregateCurrentSectorId: aggregate?.currentSectorId ?? null,
    aggregateWarmSectorId: aggregate?.warmSectorId ?? null,
    aggregatePendingRequests: finiteOrNull(aggregate?.pendingRequests),
    ownerActive: local.ownerActive ?? null,
    rootPresent: !!root,
  };
}

function inspectLifecycle(context, state, render, root, userData) {
  const lifecycle = context.lifecycle || context.presentationFrame || {};
  const recovery = context.contextRecovery || render.contextRecovery || null;
  const explicit = context.authorizedTransition || resolveMapValue(context.transitions, 'current') || null;
  let reason = explicit?.reason || (typeof explicit === 'string' ? explicit : null);
  const hasExplicitAuthorization = typeof explicit === 'string'
    || (explicit && Object.prototype.hasOwnProperty.call(explicit, 'authorized'));
  const explicitAuthorized = typeof explicit === 'string'
    ? AUTHORIZED_TRANSITION_REASONS.has(explicit)
    : explicit && explicit.authorized === true
      ? true
      : explicit && hasExplicitAuthorization
        ? false
        : AUTHORIZED_TRANSITION_REASONS.has(reason);
  if (!reason && recovery?.pending === true) reason = 'context-loss';
  if (!reason && (lifecycle.state === 'restoring' || lifecycle.lifecycleState === 'restoring')) reason = 'context-loss';
  if (!reason && state.mode === 'loading') reason = 'lifecycle-transition';
  if (!reason && render.deferNoncriticalMeshStreaming === true && !Number.isFinite(render.firstPlayableFrameAt)) {
    reason = 'opening-defer';
  }
  const inferredAuthorization = !hasExplicitAuthorization
    && (!explicit || explicitAuthorized === true)
    && (recovery?.pending === true
      || lifecycle.state === 'restoring'
      || lifecycle.lifecycleState === 'restoring'
      || state.mode === 'loading'
      || (render.deferNoncriticalMeshStreaming === true && !Number.isFinite(render.firstPlayableFrameAt)));
  return {
    mode: context.mode ?? state.mode ?? null,
    state: lifecycle.state ?? lifecycle.lifecycleState ?? null,
    generation: finiteOrNull(lifecycle.generation ?? lifecycle.lifecycleGeneration),
    contextRecovery: recovery ? {
      pending: recovery.pending === true,
      generation: finiteOrNull(recovery.generation),
      losses: finiteOrNull(recovery.losses),
      restores: finiteOrNull(recovery.restores),
    } : null,
    authorizedTransition: reason ? {
      reason,
      active: true,
      authorized: explicitAuthorized === true || inferredAuthorization,
      source: explicit ? 'context' : recovery?.pending === true ? 'context-recovery' : 'render-state',
    } : null,
    rootState: userData.authoredAssetState ?? null,
  };
}

function resolveAuthorizedCullReason({
  entity,
  root,
  scene,
  lod,
  lifecycle,
  inCamera,
  presentationTier,
  currentSectorId,
  residency,
  context,
}) {
  if (entity && entity.alive === false) return 'despawn';
  if (lifecycle.authorizedTransition?.authorized === true) {
    const reason = lifecycle.authorizedTransition.reason;
    return isAuthorizedReason(reason) ? reason : 'lifecycle-transition';
  }
  if (lod.transitioning && scene.visibleLeafCount === 0) return 'lod-transition';
  if (inCamera === false && (context.activityFrame || context.entityFrame)) return 'view-cull';
  if (presentationTier && presentationTier !== 'R0_GLASS') return 'presentation-tier';
  if (residency.entitySectorId && currentSectorId && residency.entitySectorId !== currentSectorId) {
    return 'sector-residency';
  }
  if (context.contextRecovery?.pending === true || context.state?.render?.contextRecovery?.pending === true) {
    return 'context-loss';
  }
  if (root && !scene.attached && context.mode === 'loading') return 'lifecycle-transition';
  return null;
}

function resolveInCamera(entity, record, context, id) {
  const explicit = resolveMapValue(context.inCamera, id);
  if (explicit != null) return explicit === true;
  if (entity?.inCamera != null) return entity.inCamera === true;
  if (record) return record.viewCulled !== true;
  const activity = context.activityFrame;
  if (activity) {
    const glass = activity.renderGlassIds || activity.glassIds;
    const runway = activity.renderRunwayIds || activity.runwayIds;
    if (collectionHas(glass, id)) return true;
    if (collectionHas(runway, id)) return false;
  }
  if (context.inCamera === true || context.inCamera === false) return context.inCamera;
  return null;
}

function summarizeActivityFrame(frame, id) {
  if (!frame) return null;
  const glass = frame.renderGlassIds || frame.glassIds;
  const runway = frame.renderRunwayIds || frame.runwayIds;
  return {
    complete: frame.complete === true,
    glass: collectionHas(glass, id),
    runway: collectionHas(runway, id),
  };
}

function summarizeQueue(queue) {
  return {
    deferred: queue.deferred === true,
    pending: Number(queue.pending ?? queue.length ?? 0) || 0,
    head: Number(queue.head ?? queue.queueHead ?? 0) || 0,
    scheduled: queue.scheduled === true,
    opening: queue.opening === true,
    firstPicturePrepared: queue.firstPicturePrepared === true,
  };
}

function readOrigin(context, state) {
  const origin = context.origin || state.world?.frameOrigin || null;
  if (!origin) return null;
  return {
    x: finiteOrNull(origin.x),
    z: finiteOrNull(origin.z),
    sequence: finiteOrNull(context.originSequence ?? state.world?.frameOriginSeq ?? origin.sequence),
    generation: finiteOrNull(context.originGeneration ?? origin.generation),
  };
}

function resolveFrameRecord(frame, id) {
  if (!frame || id == null) return null;
  if (frame.byId && typeof frame.byId.get === 'function') return frame.byId.get(id) || null;
  const records = Array.isArray(frame.records) ? frame.records : [];
  for (let index = 0; index < records.length; index++) if (records[index]?.id === id) return records[index];
  return null;
}

function snapshotIndexFor(snapshot, id) {
  const index = snapshot?.indexByEntityId;
  if (index && typeof index.get === 'function') {
    const exact = index.get(id);
    if (exact != null) return exact;
    const numeric = Number(id);
    const coerced = Number.isSafeInteger(numeric) ? index.get(numeric >>> 0) : null;
    if (coerced != null) return coerced;
  }
  const ids = snapshot?.columns?.entityId;
  if (!ids) return -1;
  const count = Math.min(Number(snapshot.count) || ids.length, ids.length);
  for (let cursor = 0; cursor < count; cursor++) {
    if (ids[cursor] === id || ids[cursor] === Number(id)) return cursor;
  }
  return -1;
}

function inspectCullReason(value) {
  if (value == null || value === false) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return value.reason || value.name || null;
  return String(value);
}

function resolveCullMap(map, id) {
  return inspectCullReason(resolveMapValue(map, id));
}

function withReason(map, id, reason) {
  if (map instanceof Map) {
    const clone = new Map(map);
    clone.set(id, reason);
    return clone;
  }
  return { ...(map || {}), [id]: reason };
}

function resolveMapValue(map, key) {
  if (map == null) return null;
  if (map instanceof Map || typeof map.get === 'function') return map.get(key) ?? map.get(String(key)) ?? null;
  if (typeof map === 'function') return map(key);
  if (typeof map === 'object') return map[key] ?? map[String(key)] ?? null;
  return null;
}

function collectionHas(collection, id) {
  if (collection == null) return false;
  if (typeof collection.has === 'function') return collection.has(id) || collection.has(String(id));
  if (Array.isArray(collection)) return collection.includes(id) || collection.includes(Number(id));
  return false;
}

function entityId(entity) {
  return entity?.id ?? null;
}

function materialVisible(material) {
  if (!material) return false;
  if (Array.isArray(material)) return material.some((item) => item && item.visible !== false);
  return material.visible !== false;
}

function isDrawable(object) {
  return !!(object && (
    object.isMesh
    || object.isInstancedMesh
    || object.isBatchedMesh
    || object.isLine
    || object.isPoints
    || object.drawable === true
    || object.userData?.continuityDrawable === true
  ));
}

function finitePosition(pos) {
  if (!pos) return null;
  return { x: finiteOrNull(pos.x), y: finiteOrNull(pos.y), z: finiteOrNull(pos.z) };
}

function finiteOrNull(value) {
  if (value == null) return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function positiveInt(value, fallback) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function isAuthorizedReason(reason) {
  return typeof reason === 'string' && (
    AUTHORIZED_REASONS.has(reason)
    || reason.startsWith('sector-')
    || reason.startsWith('context-')
    || reason.startsWith('lod-')
  );
}

function normalizeError(stage, error, metadata = {}) {
  return {
    stage: String(stage || 'render'),
    name: error?.name || 'Error',
    message: String(error?.message || error || 'Unknown render error').slice(0, 240),
    frame: finiteOrNull(metadata.frame),
    mode: metadata.mode ?? null,
    route: metadata.route ?? null,
  };
}

function safeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (key === 'error' || key === 'stack') continue;
    if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return out;
}

function pruneTracks(tracksById, frame, maxObjects) {
  const cap = Math.max(maxObjects * 2, maxObjects + 16);
  if (tracksById.size <= cap) return;
  const stale = [...tracksById.values()]
    .sort((left, right) => left.lastSeenFrame - right.lastSeenFrame)
    .slice(0, tracksById.size - maxObjects);
  for (const track of stale) tracksById.delete(track.id);
}

export { createRenderContinuityCensus as RenderContinuityCensus };
