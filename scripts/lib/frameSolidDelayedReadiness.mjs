// Bounded, observer-only receipt for roots that are readable or drone-owned but
// remain delayed during the frame-solid route.  The browser collector lives in
// this module so the probe's main loop stays small and the accumulator is easy
// to exercise without a browser.

export const DELAYED_READINESS_LIMITS = Object.freeze({
  maxRoots: 64,
  maxSamples: 512,
  maxSamplesPerRoot: 24,
  maxPipelineCalls: 512,
  maxStringLength: 160,
  maxArrayLength: 24,
  maxObjectKeys: 48,
  maxDepth: 5,
  maxResidencyNodes: 256,
});

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function boundValue(value, limits, depth = 0, seen = new WeakSet()) {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.length > limits.maxStringLength
    ? `${value.slice(0, limits.maxStringLength)}…`
    : value;
  if (depth >= limits.maxDepth) return '[depth-limit]';
  if (typeof value !== 'object') return String(value).slice(0, limits.maxStringLength);
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    const out = value.slice(0, limits.maxArrayLength)
      .map((item) => boundValue(item, limits, depth + 1, seen));
    if (value.length > limits.maxArrayLength) out.push(`[+${value.length - limits.maxArrayLength} more]`);
    return out;
  }
  const out = {};
  for (const key of Object.keys(value).slice(0, limits.maxObjectKeys)) {
    out[key.slice(0, limits.maxStringLength)] = boundValue(value[key], limits, depth + 1, seen);
  }
  if (Object.keys(value).length > limits.maxObjectKeys) out.__truncatedKeys = true;
  return out;
}

function makeLimits(overrides = {}) {
  const limits = {};
  for (const [key, value] of Object.entries(DELAYED_READINESS_LIMITS)) {
    const candidate = Number(overrides[key]);
    limits[key] = Number.isFinite(candidate) && candidate > 0 ? Math.floor(candidate) : value;
  }
  return Object.freeze(limits);
}

export function createDelayedReadinessReceipt(startedAtMs = 0, overrides = {}) {
  return {
    schema: 'spaceface.frameSolidDelayedReadiness.v1',
    startedAtMs: finite(startedAtMs),
    limits: makeLimits(overrides),
    polls: 0,
    delayedRowsSeen: 0,
    droppedRows: 0,
    roots: new Map(),
    samplesStored: 0,
    droppedRoots: 0,
    droppedSamples: 0,
    observer: {
      installed: false,
      pipelineCalls: [],
      pipelineCallsDropped: 0,
    },
  };
}

function rootKeyFor(row, index) {
  if (row && row.rootKey != null && String(row.rootKey)) return String(row.rootKey);
  if (row && row.entityId != null && String(row.entityId)) return `entity:${row.entityId}`;
  if (row && row.meshUuid) return `uuid:${row.meshUuid}`;
  return `row:${index}`;
}

export function recordDelayedReadinessSample(receipt, snapshot, elapsedMs = 0) {
  if (!receipt || !receipt.roots || !receipt.limits) return;
  receipt.polls += 1;
  const rows = Array.isArray(snapshot) ? snapshot : (snapshot && Array.isArray(snapshot.rows) ? snapshot.rows : []);
  const reportedDropped = snapshot && !Array.isArray(snapshot) ? finite(snapshot.droppedRows) : 0;
  receipt.droppedRows += reportedDropped;
  receipt.delayedRowsSeen += rows.length + reportedDropped;
  const t = Math.max(0, Math.round(finite(elapsedMs)));
  rows.forEach((row, index) => {
    const key = rootKeyFor(row, index);
    let entry = receipt.roots.get(key);
    if (!entry) {
      if (receipt.roots.size >= receipt.limits.maxRoots) {
        receipt.droppedRoots += 1;
        return;
      }
      entry = { rootKey: key, firstSeenMs: t, lastSeenMs: t, sampleCount: 0, samples: [], droppedSamples: 0 };
      receipt.roots.set(key, entry);
    }
    entry.firstSeenMs = Math.min(entry.firstSeenMs, t);
    entry.lastSeenMs = Math.max(entry.lastSeenMs, t);
    entry.sampleCount += 1;
    if (receipt.samplesStored >= receipt.limits.maxSamples
      || entry.samples.length >= receipt.limits.maxSamplesPerRoot) {
      entry.droppedSamples += 1;
      receipt.droppedSamples += 1;
      return;
    }
    entry.samples.push({ ...boundValue(row || {}, receipt.limits), atMs: t });
    receipt.samplesStored += 1;
  });
}

export function recordPipelineCalls(receipt, calls = [], dropped = 0, installed = false) {
  if (!receipt || !receipt.observer) return;
  receipt.observer.installed = installed === true;
  receipt.observer.pipelineCallsDropped += finite(dropped);
  for (const call of Array.isArray(calls) ? calls : []) {
    if (receipt.observer.pipelineCalls.length >= receipt.limits.maxPipelineCalls) {
      receipt.observer.pipelineCallsDropped += 1;
      continue;
    }
    receipt.observer.pipelineCalls.push(boundValue(call || {}, receipt.limits));
  }
}

export function finalizeDelayedReadinessReceipt(receipt) {
  if (!receipt || !receipt.limits) return null;
  return {
    schema: receipt.schema,
    startedAtMs: receipt.startedAtMs,
    limits: { ...receipt.limits },
    polls: receipt.polls,
    delayedRowsSeen: receipt.delayedRowsSeen,
    droppedRows: receipt.droppedRows,
    rootsTracked: receipt.roots.size,
    samplesStored: receipt.samplesStored,
    droppedRoots: receipt.droppedRoots,
    droppedSamples: receipt.droppedSamples,
    roots: [...receipt.roots.values()].map((entry) => ({
      rootKey: entry.rootKey,
      firstSeenMs: entry.firstSeenMs,
      lastSeenMs: entry.lastSeenMs,
      sampleCount: entry.sampleCount,
      droppedSamples: entry.droppedSamples,
      samples: entry.samples,
    })),
    observer: {
      installed: receipt.observer.installed,
      pipelineCallsDropped: receipt.observer.pipelineCallsDropped,
      pipelineCalls: receipt.observer.pipelineCalls,
    },
  };
}

/**
 * Install the browser-side collector and compile-pipeline observer.  This
 * function is passed directly to Playwright, so it intentionally uses only
 * browser globals and its serializable config argument.
 */
export function installFrameSolidDelayedReadiness(config = {}) {
  const limits = {
    maxRoots: Number(config.maxRoots) || 64,
    maxRowsPerPoll: Number(config.maxRowsPerPoll) || 64,
    maxPipelineCalls: Number(config.maxPipelineCalls) || 512,
    maxResidencyNodes: Number(config.maxResidencyNodes) || 256,
    maxStringLength: Number(config.maxStringLength) || 160,
  };
  const clip = (value) => {
    if (value == null) return value;
    const text = String(value);
    return text.length > limits.maxStringLength ? `${text.slice(0, limits.maxStringLength)}…` : text;
  };
  const state = window.SF && window.SF.state;
  const render = state && state.render;
  if (!state || !render) return { installed: false, reason: 'state-render-unavailable' };
  const tracker = {
    installed: false,
    original: null,
    wrapped: null,
    calls: [],
    dropped: 0,
  };
  const entityForId = (id) => {
    const entities = state.entities;
    if (!entities || typeof entities.get !== 'function' || id == null) return null;
    let entity = entities.get(id);
    if (!entity && /^-?\d+(?:\.0+)?$/.test(String(id))) entity = entities.get(Number(id));
    return entity || null;
  };
  const idFromNode = (node) => {
    for (let current = node, depth = 0; current && depth < 64; current = current.parent, depth++) {
      const data = current.userData || {};
      const id = data.presentationEntityId ?? data.entityId ?? data.sfEntityId ?? data.sfStableEntityKey;
      if (id != null && id !== '') return id;
    }
    return null;
  };
  const rootFor = (node) => {
    let root = node;
    for (let depth = 0; root && root.parent && root.parent.type !== 'Scene' && depth < 64; depth++) root = root.parent;
    return root || node || null;
  };
  const rootIdentityCandidates = (entity, root) => {
    const data = root && root.userData || {};
    const values = [];
    const push = (value) => {
      if (value == null || value === '') return;
      const text = String(value);
      if (!values.includes(text)) values.push(text);
    };
    if (entity && entity.id != null) push(`entity:${entity.id}`);
    push(data.entityId != null ? `entity:${data.entityId}` : null);
    push(data.sfEntityId != null ? `entity:${data.sfEntityId}` : null);
    push(root && root.uuid ? `uuid:${root.uuid}` : null);
    push(root && root.id != null ? `id:${root.id}` : null);
    push(root && root.name ? `name:${root.name}` : null);
    return values.slice(0, 16);
  };
  const openingCohortFor = (entity, root) => {
    const cohort = render.openingAdmissionCohort || null;
    const identities = cohort && Array.isArray(cohort.identities) ? cohort.identities : [];
    const candidates = rootIdentityCandidates(entity, root);
    const matched = candidates.filter((candidate) => identities.includes(candidate));
    return {
      frozen: cohort ? cohort.frozen === true : null,
      size: cohort && Number.isFinite(Number(cohort.size)) ? Number(cohort.size) : null,
      createdAtMs: cohort && Number.isFinite(Number(cohort.createdAtMs)) ? Number(cohort.createdAtMs) : null,
      identity: candidates[0] || null,
      candidates,
      matched: matched.slice(0, 16),
      membership: cohort ? (matched.length ? 'member' : 'nonMember') : 'unavailable',
    };
  };
  const callForRoot = (entityId, root) => {
    const key = entityId == null ? null : String(entityId);
    const rootUuid = root && root.uuid ? String(root.uuid) : null;
    const rootName = root && root.name ? String(root.name) : null;
    for (let i = tracker.calls.length - 1; i >= 0; i--) {
      const call = tracker.calls[i];
      if (key != null && call.entityId === key) return call;
      if (key == null && ((rootUuid && call.rootUuid === rootUuid) || (rootName && call.rootName === rootName))) return call;
    }
    return null;
  };
  const subjectDescription = (subject, options) => {
    const root = rootFor(subject);
    const entityId = idFromNode(subject);
    const entity = entityForId(entityId);
    const data = subject && subject.userData || {};
    return {
      atMs: Math.round(typeof performance !== 'undefined' && performance.now ? performance.now() : 0),
      frame: window.__SF_FRAME__ && Number(window.__SF_FRAME__.frames) || 0,
      simTime: Number.isFinite(Number(state.simTime)) ? Number(state.simTime) : null,
      entityId: entityId == null ? null : String(entityId),
      entityType: entity && entity.type || null,
      entityDefId: entity && entity.data ? (entity.data.defId || entity.data.shipId || null) : null,
      subjectUuid: subject && subject.uuid || null,
      subjectName: subject && subject.name || null,
      rootUuid: root && root.uuid || null,
      rootName: root && root.name || null,
      urgent: options && Object.prototype.hasOwnProperty.call(options, 'urgent') ? options.urgent === true : null,
      debugBy: options && options.debugBy != null ? clip(options.debugBy) : null,
      source: 'compileObjectPipelines',
    };
  };
  if (typeof render.compileObjectPipelines === 'function') {
    tracker.original = render.compileObjectPipelines;
    tracker.wrapped = function delayedReadinessCompileObserver(subject, options, ...rest) {
      const row = subjectDescription(subject, options);
      if (tracker.calls.length < limits.maxPipelineCalls) tracker.calls.push(row);
      else tracker.dropped += 1;
      return tracker.original.call(this, subject, options, ...rest);
    };
    render.compileObjectPipelines = tracker.wrapped;
    tracker.installed = true;
  }
  const hasId = (collection, id) => {
    if (!collection || id == null) return false;
    if (typeof collection.has === 'function') return collection.has(id) || collection.has(String(id));
    if (Array.isArray(collection)) return collection.includes(id) || collection.includes(String(id));
    return false;
  };
  const rootHidden = (root) => {
    for (let node = root, depth = 0; node && depth < 64; node = node.parent, depth++) {
      if (node.visible === false) return true;
      if (node.type === 'Scene') break;
    }
    return false;
  };
  const pendingStatus = (value) => ['loading', 'awaiting-authored-admission', 'compiling-pipelines',
    'orphaned-before-swap', 'orphaned-after-pipeline-compile'].includes(String(value || ''));
  const pipelineFor = (entityId, data, root) => {
    const debugBy = data && data.pipelinesPendingBy != null ? clip(data.pipelinesPendingBy) : null;
    const call = callForRoot(entityId, root);
    const urgentByCall = call ? call.urgent : null;
    const urgentByReason = debugBy && /urgent|glass|authored|compile/i.test(debugBy) ? true : null;
    return {
      pending: data ? data.pipelinesPending === true : null,
      debugBy,
      holds: data && Number.isFinite(Number(data.pipelinesPendingHolds)) ? Number(data.pipelinesPendingHolds) : null,
      urgent: call ? call.urgent : urgentByReason,
      urgentSource: call ? 'compileObjectPipelines' : (urgentByReason === true ? 'debugBy' : null),
      lastCall: call,
    };
  };
  const residencyFor = (root, rootData) => {
    const out = {
      nodesVisited: 0,
      scanCapped: false,
      packageMounted: false,
      fallbackVisible: 0,
      fallbackPackageResidencyStamps: {
        root: {
          spacefaceGeometryResident: rootData && rootData.spacefaceGeometryResident === true,
          authoredAssetState: rootData && rootData.authoredAssetState || null,
          authoredVisualRoot: rootData && rootData.authoredVisualRoot || null,
          authoredReadableFallbackRetained: rootData && rootData.authoredReadableFallbackRetained === true,
          authoredPendingFallbackDrawn: rootData && rootData.authoredPendingFallbackDrawn === true,
        },
        package: { nodes: 0, geometries: 0, resident: 0, unresident: 0, visibleNodes: 0, stamp: null },
        fallback: { nodes: 0, geometries: 0, resident: 0, unresident: 0, visibleNodes: 0, stamp: null },
        other: { nodes: 0, geometries: 0, resident: 0, unresident: 0, visibleNodes: 0 },
      },
    };
    if (!root || typeof root.traverse !== 'function') return out;
    let scanned = 0;
    const walk = (node, inheritedBranch = 'other') => {
      if (!node || scanned >= limits.maxResidencyNodes) { out.scanCapped = true; return; }
      scanned += 1;
      const data = node.userData || {};
      const branch = data.packagedAuthoredBody === true ? 'package'
        : data.authoredReadableFallbackLayer === true ? 'fallback' : inheritedBranch;
      const bucket = out.fallbackPackageResidencyStamps[branch] || out.fallbackPackageResidencyStamps.other;
      bucket.nodes += 1;
      if (node.visible !== false) bucket.visibleNodes += 1;
      if (branch === 'package') out.packageMounted = true;
      if (branch === 'fallback' && node.visible !== false) out.fallbackVisible += 1;
      if (data.packagedAuthoredBody === true) bucket.stamp = data.spacefaceGeometryResident === true;
      if (data.authoredReadableFallbackLayer === true && bucket.stamp == null) bucket.stamp = data.spacefaceGeometryResident === true;
      const geometry = node.geometry;
      if (geometry) {
        bucket.geometries += 1;
        if (geometry.userData && geometry.userData.spacefaceGpuResident === true) bucket.resident += 1;
        else bucket.unresident += 1;
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          if (scanned >= limits.maxResidencyNodes) { out.scanCapped = true; break; }
          walk(child, branch);
        }
      }
    };
    walk(root);
    out.nodesVisited = scanned;
    return out;
  };
  const readableRows = () => {
    const rows = [];
    let droppedRows = 0;
    const frame = render.activityFrame || {};
    const runtime = state.activityRuntime || {};
    const glass = frame.renderGlassIds || frame.glassIds || runtime.glassIds;
    const runway = frame.renderRunwayIds || frame.runwayIds || runtime.runwayIds;
    const entities = state.entities;
    if (!entities || typeof entities.values !== 'function') return { rows, droppedRows };
    for (const entity of entities.values()) {
      if (!entity || entity.alive === false || entity.id === state.playerId) continue;
      const tier = entity.activity && entity.activity.presentationTier || null;
      const readable = tier === 'R0_GLASS' || tier === 'R1_RUNWAY'
        || hasId(glass, entity.id) || hasId(runway, entity.id);
      const isDrone = entity.type === 'drone';
      if (!readable && !isDrone) continue;
      const root = entity.mesh || entity.view && entity.view.root || null;
      const data = root && root.userData || {};
      const status = data.authoredAssetState || null;
      const noMesh = !root;
      const pendingGeometry = !!(data.geometryPending === true
        || (root && data.spacefaceGeometryResident !== true && status && pendingStatus(status)));
      const pendingPipelines = data.pipelinesPending === true;
      const pendingAuthored = pendingStatus(status);
      const hidden = !root || rootHidden(root);
      const delayed = noMesh || pendingGeometry || pendingPipelines || pendingAuthored || (readable && hidden);
      if (!delayed) continue;
      if (rows.length >= limits.maxRowsPerPoll) { droppedRows += 1; continue; }
      const id = entity.id == null ? null : String(entity.id);
      const queue = root && window.SF.registry && typeof window.SF.registry.get === 'function'
        ? (() => {
          try {
            const owner = window.SF.registry.get('render');
            return owner && owner._liveGeometryAdmissions && typeof owner._liveGeometryAdmissions.debugRoot === 'function'
              ? owner._liveGeometryAdmissions.debugRoot(root) : null;
          } catch (_) { return null; }
        })()
        : null;
      const cohort = openingCohortFor(entity, root);
      rows.push({
        rootKey: id != null ? `entity:${id}` : (root && root.uuid ? `uuid:${root.uuid}` : `type:${entity.type || 'unknown'}`),
        entityId: id,
        type: entity.type || null,
        defId: entity.data && (entity.data.defId || entity.data.shipId) || null,
        readable,
        tier,
        noMesh,
        visible: root ? root.visible !== false : false,
        rootHidden: hidden,
        pending: { geometry: pendingGeometry, pipelines: pendingPipelines, authored: pendingAuthored },
        authoredAssetState: status,
        authoredVisualRoot: data.authoredVisualRoot || null,
        firstPlayableFrameAt: Number.isFinite(Number(render.firstPlayableFrameAt)) ? Number(render.firstPlayableFrameAt) : null,
        liveSectorGpuAdmission: render.liveSectorGpuAdmission === true,
        openingCohort: cohort,
        queue,
        pipeline: pipelineFor(id, data, root),
        residency: residencyFor(root, data),
        frame: window.__SF_FRAME__ && Number(window.__SF_FRAME__.frames) || 0,
        simTime: Number.isFinite(Number(state.simTime)) ? Number(state.simTime) : null,
      });
    }
    return { rows, droppedRows };
  };
  window.__SF_CAPTURE_D201_DELAYED_READINESS__ = readableRows;
  window.__SF_D201_DELAYED_READINESS__ = tracker;
  return { installed: tracker.installed };
}

export function restoreFrameSolidDelayedReadiness() {
  const record = window.__SF_D201_DELAYED_READINESS__;
  const state = window.SF && window.SF.state;
  if (record && record.original && state && state.render
    && state.render.compileObjectPipelines === record.wrapped) {
    state.render.compileObjectPipelines = record.original;
  }
  if (record) return {
    installed: record.installed === true,
    calls: record.calls,
    dropped: record.dropped || 0,
  };
  return { installed: false, calls: [], dropped: 0 };
}
