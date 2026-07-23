// PQ-017 — pure deterministic grammar/reducer for persistent World Sites.
// No registry slot, bus access, ambient randomness, physics writes, or cross-domain state writes.

import { validateWorldSiteAssetBinding, worldSiteAssetBinding } from '../data/worldSiteAssetBindings.js';

export const WORLD_SITE_RECORD_SCHEMA_VERSION = 2;

export const WORLD_SITE_LIMITS = Object.freeze({
  maxComponents: 7,
  maxOperations: 16,
  maxPayloads: 4,
  maxReceivers: 4,
  maxEntities: 16,
  maxReceipts: 64,
  maxFailures: 16,
  maxPresentationFixtures: 12,
  maxPresentationAnimations: 12,
});

export function validateWorldSiteManifest(manifest) {
  const errors = [];
  const add = (code, path, detail = null) => errors.push(detail == null ? { code, path } : { code, path, detail });
  if (!isPlainObject(manifest)) return { ok: false, errors: [{ code: 'manifest-invalid', path: '$' }] };

  for (const path of nonJsonPaths(manifest)) add('non-json-value', path);
  if (!nonEmpty(manifest.id) || !nonEmpty(manifest.worldObjectId)) add('site-id-missing', '$.id');
  if (!positiveInt(manifest.schemaVersion)) add('manifest-version-invalid', '$.schemaVersion');
  if (!nonEmpty(manifest.sectorId) || !finitePoint(manifest.placement && manifest.placement.pos)
    || manifest.placement.coordinateSpace !== 'global_v1') add('placement-invalid', '$.placement');
  if (!nonEmpty(manifest.visualRoot && manifest.visualRoot.placeId)) add('visual-binding-missing', '$.visualRoot.placeId');
  if (!nonEmpty(manifest.visualRoot && manifest.visualRoot.anchorId)) add('visual-anchor-missing', '$.visualRoot.anchorId');

  const components = array(manifest.components);
  const operations = array(manifest.operations);
  const proxies = array(manifest.proxies);
  const payloads = array(manifest.payloads);
  const receivers = array(manifest.receivers);
  const stages = array(manifest.stages);
  const consequences = array(manifest.consequences);
  const requestStreams = array(manifest.requestStreams);
  const failureTriggers = array(manifest.failureTriggers);

  if (components.length < 1 || components.length > WORLD_SITE_LIMITS.maxComponents) add('component-limit', '$.components');
  if (operations.length < 1 || operations.length > WORLD_SITE_LIMITS.maxOperations) add('operation-limit', '$.operations');
  if (payloads.length > WORLD_SITE_LIMITS.maxPayloads) add('payload-limit', '$.payloads');
  if (receivers.length > WORLD_SITE_LIMITS.maxReceivers) add('receiver-limit', '$.receivers');
  if (1 + proxies.length + payloads.length > WORLD_SITE_LIMITS.maxEntities) add('entity-limit', '$.proxies');

  const componentIds = collectIds(components, 'component', add);
  const operationIds = collectIds(operations, 'operation', add);
  const proxyIds = collectIds(proxies, 'proxy', add);
  const payloadIds = collectIds(payloads, 'payload', add);
  const receiverIds = collectIds(receivers, 'receiver', add);
  const stageIds = collectIds(stages, 'stage', add);
  const consequenceIds = collectIds(consequences, 'consequence', add);
  const requestStreamIds = collectIds(requestStreams, 'requestStream', add);
  collectIds(failureTriggers, 'failureTrigger', add);
  void proxyIds;
  void stageIds;

  for (let i = 0; i < components.length; i += 1) {
    if (!nonEmpty(components[i] && components[i].anchorId)) add('component-anchor-missing', `$.components[${i}].anchorId`);
    if (!nonEmpty(components[i] && components[i].initialStatus)) add('component-status-missing', `$.components[${i}].initialStatus`);
  }
  for (let i = 0; i < proxies.length; i += 1) {
    const proxy = proxies[i] || {};
    if (!componentIds.has(proxy.componentId)) add('proxy-component-missing', `$.proxies[${i}].componentId`);
    if (!nonEmpty(proxy.anchorId)) add('proxy-anchor-missing', `$.proxies[${i}].anchorId`);
    if (!validProxy(proxy)) add('proxy-incompatible', `$.proxies[${i}]`);
    if (proxy.bodyTypeByStatus != null) {
      const overrides = isPlainObject(proxy.bodyTypeByStatus)
        ? Object.entries(proxy.bodyTypeByStatus)
        : [];
      if (!isPlainObject(proxy.bodyTypeByStatus) || overrides.length === 0
          || overrides.some(([status, bodyType]) => (
            !nonEmpty(status) || !['sensor', 'solid'].includes(bodyType)
          ))) {
        add('proxy-status-body-type-invalid', `$.proxies[${i}].bodyTypeByStatus`);
      } else {
        const component = components.find((candidate) => candidate.id === proxy.componentId);
        const statuses = authoredComponentStatuses(
          component,
          operations,
          failureTriggers,
        );
        for (const [status] of overrides) {
          if (!statuses.has(status)) {
            add('proxy-body-status-unknown', `$.proxies[${i}].bodyTypeByStatus`, status);
          }
        }
      }
    }
  }
  const proxyBindings = new Set();
  for (const component of components) {
    const matches = proxies.filter((proxy) => proxy.componentId === component.id);
    if (matches.length !== 1) add('component-proxy-count', '$.proxies', component.id);
  }
  for (let i = 0; i < proxies.length; i += 1) {
    const proxy = proxies[i];
    const binding = `${proxy.anchorId}|${finite(proxy.offset && proxy.offset.x)}|${finite(proxy.offset && proxy.offset.z)}`;
    if (proxyBindings.has(binding)) add('proxy-binding-duplicate', `$.proxies[${i}]`, binding);
    proxyBindings.add(binding);
  }

  const dependencyGraph = new Map();
  for (let i = 0; i < operations.length; i += 1) {
    const operation = operations[i] || {};
    dependencyGraph.set(operation.id, array(operation.dependsOn));
    if (!componentIds.has(operation.componentId)) add('operation-component-missing', `$.operations[${i}].componentId`);
    if (!['cut', 'repair', 'transfer', 'extract'].includes(operation.verb)) add('operation-verb-invalid', `$.operations[${i}].verb`);
    if (!requestStreamIds.has(operation.requestStreamId)) add('operation-request-stream-missing', `$.operations[${i}].requestStreamId`);
    if (!(Number.isFinite(operation.threshold) && operation.threshold > 0)) add('operation-threshold-invalid', `$.operations[${i}].threshold`);
    if (!array(operation.from).length || !nonEmpty(operation.to)) add('operation-state-invalid', `$.operations[${i}]`);
    for (const depId of array(operation.dependsOn)) {
      if (!operationIds.has(depId)) add('operation-dependency-missing', `$.operations[${i}].dependsOn`, depId);
    }
    if (operation.payloadId && !payloadIds.has(operation.payloadId)) add('operation-payload-missing', `$.operations[${i}].payloadId`);
    if (operation.receiverId && !receiverIds.has(operation.receiverId)) add('operation-receiver-missing', `$.operations[${i}].receiverId`);
    for (const consequenceId of array(operation.consequenceIds)) {
      if (!consequenceIds.has(consequenceId)) add('operation-consequence-missing', `$.operations[${i}].consequenceIds`, consequenceId);
    }
  }
  if (hasDependencyCycle(dependencyGraph)) add('operation-dependency-cycle', '$.operations');

  for (let i = 0; i < failureTriggers.length; i += 1) {
    const trigger = failureTriggers[i] || {};
    const recovery = operations.find((operation) => operation.id === trigger.recoveryOperationId);
    if (trigger.event !== 'physics:impact') add('failure-trigger-event-invalid', `$.failureTriggers[${i}].event`);
    if (trigger.actorPolicy !== 'player-contact') add('failure-trigger-actor-policy-invalid', `$.failureTriggers[${i}].actorPolicy`);
    if (!componentIds.has(trigger.componentId)) add('failure-trigger-component-missing', `$.failureTriggers[${i}].componentId`);
    if (!(Number.isFinite(trigger.minDp) && trigger.minDp > 0)) add('failure-trigger-threshold-invalid', `$.failureTriggers[${i}].minDp`);
    if (!array(trigger.from).length) add('failure-trigger-state-invalid', `$.failureTriggers[${i}].from`);
    if (!recovery || recovery.componentId !== trigger.componentId || !array(recovery.from).includes('failed')) {
      add('failure-trigger-recovery-invalid', `$.failureTriggers[${i}].recoveryOperationId`);
    }
  }

  for (let i = 0; i < payloads.length; i += 1) {
    const payload = payloads[i] || {};
    if (!componentIds.has(payload.componentId)) add('payload-component-missing', `$.payloads[${i}].componentId`);
    if (!operationIds.has(payload.releaseOperationId)) add('payload-release-operation-missing', `$.payloads[${i}].releaseOperationId`);
    if (!nonEmpty(payload.worldObjectId)) add('payload-world-id-missing', `$.payloads[${i}].worldObjectId`);
    const release = operations.find((operation) => operation.id === payload.releaseOperationId);
    if (release && release.payloadId !== payload.id) add('payload-release-binding-invalid', `$.payloads[${i}].releaseOperationId`);
  }
  for (let i = 0; i < receivers.length; i += 1) {
    const receiver = receivers[i] || {};
    if (!componentIds.has(receiver.componentId)) add('receiver-component-missing', `$.receivers[${i}].componentId`);
    if (!operationIds.has(receiver.settlementOperationId)) add('receiver-operation-missing', `$.receivers[${i}].settlementOperationId`);
    const settlement = operations.find((operation) => operation.id === receiver.settlementOperationId);
    if (settlement && settlement.receiverId !== receiver.id) add('receiver-operation-binding-invalid', `$.receivers[${i}].settlementOperationId`);
    for (const payloadId of array(receiver.acceptsPayloadIds)) {
      if (!payloadIds.has(payloadId)) add('receiver-payload-missing', `$.receivers[${i}].acceptsPayloadIds`, payloadId);
    }
  }
  for (let i = 0; i < stages.length; i += 1) {
    const stage = stages[i] || {};
    const binding = worldSiteAssetBinding(stage.placeId);
    if (!binding || !validateWorldSiteAssetBinding(binding)) {
      add('stage-asset-binding-missing', `$.stages[${i}].placeId`);
    }
    for (const operationId of array(stage.requires)) {
      if (!operationIds.has(operationId)) add('stage-operation-missing', `$.stages[${i}].requires`, operationId);
    }
    validateStagePresentation(stage.presentation, binding, componentIds, i, add);
  }
  const stageBindings = stages.map((stage) => worldSiteAssetBinding(stage && stage.placeId)).filter(Boolean);
  for (let i = 0; i < components.length; i += 1) {
    if (stageBindings.some((binding) => !binding.sockets[components[i].anchorId])) {
      add('component-socket-binding-missing', `$.components[${i}].anchorId`);
    }
  }
  for (let i = 0; i < proxies.length; i += 1) {
    if (stageBindings.some((binding) => !binding.sockets[proxies[i].anchorId])) {
      add('proxy-socket-binding-missing', `$.proxies[${i}].anchorId`);
    }
  }
  if (!stages.length) add('stage-limit', '$.stages');

  if (!hasDependencyCycle(dependencyGraph)) {
    const reachable = reachableOperations(components, operations);
    for (let i = 0; i < operations.length; i += 1) {
      if (!reachable.has(operations[i].id)) add('operation-unreachable', `$.operations[${i}]`, operations[i].id);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function createWorldSiteRecord(manifest, opts = {}) {
  const validation = validateWorldSiteManifest(manifest);
  if (!validation.ok) throw new TypeError(`Invalid World Site manifest: ${validation.errors.map((error) => error.code).join(',')}`);
  const tick = finiteTick(opts.tick);
  const components = {};
  for (const component of manifest.components) {
    components[component.id] = { status: component.initialStatus, progress: {}, failureCount: 0, cycle: 0 };
  }
  const payloads = {};
  for (const payload of manifest.payloads) {
    payloads[payload.id] = {
      status: 'stowed', worldObjectId: payload.worldObjectId, settledReceiptId: null,
      motion: initialPayloadMotion(manifest, payload),
    };
  }
  const receivers = {};
  for (const receiver of manifest.receivers) receivers[receiver.id] = { status: 'ready', settledReceiptId: null };
  return {
    schemaVersion: WORLD_SITE_RECORD_SCHEMA_VERSION,
    manifestId: manifest.id,
    manifestVersion: manifest.schemaVersion,
    worldObjectId: manifest.worldObjectId,
    sectorId: manifest.sectorId,
    stageId: manifest.stages[0].id,
    components,
    payloads,
    receivers,
    completedOperations: {},
    completionCount: 0,
    operationCursors: {},
    discoveries: manifest.discovery && manifest.discovery.initialDiscovered
      ? [{ id: 'natural_producer', tick }]
      : [],
    failures: [],
    receipts: [],
    nextReceiptSequence: 1,
    revision: 0,
    createdTick: tick,
    updatedTick: tick,
    producer: clonePlain(manifest.producer || {}),
    debug: clonePlain(manifest.debug || {}),
  };
}

export function normalizeWorldSiteRecord(manifest, value, opts = {}) {
  const fallback = createWorldSiteRecord(manifest, opts);
  if (!isPlainObject(value) || value.manifestId !== manifest.id || value.worldObjectId !== manifest.worldObjectId) return fallback;
  const next = clonePlain(fallback);
  next.createdTick = finiteTick(value.createdTick);
  next.updatedTick = Math.max(next.createdTick, finiteTick(value.updatedTick));
  next.revision = boundedInt(value.revision, 0, Number.MAX_SAFE_INTEGER, 0);
  const componentPrior = {};
  for (const def of manifest.components) {
    const prior = value.components && value.components[def.id];
    if (!isPlainObject(prior)) continue;
    componentPrior[def.id] = prior;
    next.components[def.id].failureCount = boundedInt(prior.failureCount, 0, Number.MAX_SAFE_INTEGER, 0);
    next.components[def.id].cycle = boundedInt(prior.cycle, 0, Number.MAX_SAFE_INTEGER, 0);
    // A prior failure is only meaningful when this component has an authored recovery path and a
    // durable failure cycle. Every other status is reconstructed from accepted operations below;
    // save data never gets to invent a terminal component state.
    if (next.components[def.id].cycle > 0 && componentCanRecoverFromFailure(manifest, def.id)) {
      next.components[def.id].status = 'failed';
    }
  }

  // Rebuild completed operations as a manifest-valid transition graph. Starting from authored
  // initial/failed states makes malformed downstream receipts fail safe to a playable path while
  // retaining legitimate chains independent of manifest declaration order.
  next.completedOperations = {};
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const operation of manifest.operations) {
      if (next.completedOperations[operation.id]) continue;
      const completed = value.completedOperations && value.completedOperations[operation.id];
      const component = next.components[operation.componentId];
      if (!isPlainObject(completed) || !nonEmpty(completed.receiptId) || !component) continue;
      if (nonEmpty(completed.requestStreamId) && completed.requestStreamId !== operation.requestStreamId) continue;
      const sequence = finiteSequence(completed.requestSequence == null ? completed.tick : completed.requestSequence);
      const cycle = boundedInt(completed.cycle, 0, Number.MAX_SAFE_INTEGER, component.cycle);
      if (sequence == null || cycle !== component.cycle) continue;
      const missingDependencies = array(operation.dependsOn)
        .filter((id) => !next.completedOperations[id]);
      if (missingDependencies.length) {
        // A later recoverable failure may legitimately remove its own completion while downstream
        // work on another component remains complete (for example the online beacon while the
        // safety coupler is failed). Preserve that historical completion only when the saved final
        // status agrees with the operation and every missing dependency belongs to a currently
        // failed, cycled component. Arbitrary missing dependencies still fail closed.
        const priorComponent = componentPrior[operation.componentId];
        const missingAreRecoverableFailures = missingDependencies.every((id) => {
          const dependency = manifest.operations.find((candidate) => candidate.id === id);
          const dependencyComponent = dependency && next.components[dependency.componentId];
          return !!(dependencyComponent && dependencyComponent.status === 'failed'
            && dependencyComponent.cycle > 0
            && componentCanRecoverFromFailure(manifest, dependency.componentId));
        });
        if (!missingAreRecoverableFailures || priorComponent?.status !== operation.to) continue;
      }
      if (!array(operation.from).includes(component.status)) continue;
      if (operation.receiverId) {
        const payloadDef = manifest.payloads.find((payload) => payload.id === operation.payloadId);
        if (!payloadDef || !next.completedOperations[payloadDef.releaseOperationId]) continue;
      }
      next.completedOperations[operation.id] = {
        receiptId: completed.receiptId,
        tick: finiteTick(completed.tick),
        cycle,
        requestStreamId: operation.requestStreamId,
        requestSequence: sequence,
      };
      component.status = operation.to;
      next.updatedTick = Math.max(next.updatedTick, finiteTick(completed.tick));
      progressed = true;
    }
  }

  // Preserve only finite partial progress that is still reachable from the normalized graph.
  for (const def of manifest.components) {
    const component = next.components[def.id];
    const prior = componentPrior[def.id];
    component.progress = {};
    if (!prior) continue;
    for (const operation of manifest.operations.filter((candidate) => candidate.componentId === def.id)) {
      if (next.completedOperations[operation.id]) continue;
      if (!array(operation.from).includes(component.status)) continue;
      if (!array(operation.dependsOn).every((id) => next.completedOperations[id])) continue;
      const progress = prior.progress && prior.progress[operation.id];
      if (Number.isFinite(progress) && progress >= 0) component.progress[operation.id] = Math.min(operation.threshold, progress);
    }
  }

  // Payload/receiver settlement is derived from accepted operations. A corrupt pair of status
  // strings or mismatched receipt ids can therefore never hide a released payload or permanently
  // close a receiver.
  for (const def of manifest.payloads) {
    const prior = value.payloads && value.payloads[def.id];
    if (isPlainObject(prior)) next.payloads[def.id].motion = normalizeMotion(prior.motion, next.payloads[def.id].motion);
    const receiver = manifest.receivers.find((candidate) => candidate.acceptsPayloadIds.includes(def.id));
    const settlement = receiver && next.completedOperations[receiver.settlementOperationId];
    const release = next.completedOperations[def.releaseOperationId];
    if (settlement) {
      next.payloads[def.id].status = 'settled';
      next.payloads[def.id].settledReceiptId = settlement.receiptId;
    } else if (release) {
      next.payloads[def.id].status = 'released';
    }
  }
  for (const def of manifest.receivers) {
    const settlement = next.completedOperations[def.settlementOperationId];
    if (!settlement) continue;
    next.receivers[def.id].status = 'settled';
    next.receivers[def.id].settledReceiptId = settlement.receiptId;
  }

  next.discoveries = boundedPlainArray(value.discoveries, 16);
  next.failures = boundedPlainArray(value.failures, WORLD_SITE_LIMITS.maxFailures)
    .filter((failure) => manifest.components.some((component) => component.id === failure.componentId)
      && finiteSequence(failure.cycle) != null);
  next.receipts = boundedPlainArray(value.receipts, WORLD_SITE_LIMITS.maxReceipts)
    .filter((receipt) => validNormalizedReceipt(manifest, receipt, next.updatedTick));
  const retainedCompletionCount = next.receipts.filter((receipt) => receipt
    && receipt.kind === 'operation' && receipt.complete === true).length;
  next.completionCount = Math.max(
    Object.keys(next.completedOperations).length,
    retainedCompletionCount,
    boundedInt(value.completionCount, 0, Number.MAX_SAFE_INTEGER, 0),
  );
  const safeCursors = {};
  for (const operation of manifest.operations) {
    const prior = value.operationCursors && value.operationCursors[operation.id];
    const sequence = prior && prior.requestStreamId === operation.requestStreamId
      ? finiteSequence(prior.throughSequence)
      : null;
    const hasProgress = Number(next.components[operation.componentId].progress[operation.id]) > 0;
    if (sequence != null && sequence <= next.updatedTick
      && (hasProgress || next.completedOperations[operation.id])) safeCursors[operation.id] = prior;
  }
  next.operationCursors = normalizeOperationCursors(manifest, safeCursors, next.receipts, next.completedOperations);
  const maxReceiptSequence = next.receipts.reduce((max, receipt) => Math.max(max, finiteSequence(receipt.sequence) || 0), 0);
  next.nextReceiptSequence = Math.max(
    maxReceiptSequence + 1,
    boundedInt(value.nextReceiptSequence, 1, Number.MAX_SAFE_INTEGER, maxReceiptSequence + 1),
  );
  next.stageId = evaluateStage(manifest, next);
  return next;
}

export function applyWorldSiteOperation(manifest, record, request = {}) {
  const operation = manifest && manifest.operations && manifest.operations.find((candidate) => candidate.id === request.operationId);
  if (!operation) return failed(record, 'unknown-operation');
  const requestStreamId = cleanId(request.requestStreamId) || operation.requestStreamId;
  const requestSequence = finiteSequence(request.requestSequence == null ? request.tick : request.requestSequence);
  if (requestStreamId !== operation.requestStreamId || requestSequence == null) return failed(record, 'request-cursor-invalid');
  const cursor = record.operationCursors && record.operationCursors[operation.id];
  if (cursor && cursor.requestStreamId === requestStreamId && requestSequence <= cursor.throughSequence) {
    return duplicate(record, 'request-replayed');
  }
  if (record.completedOperations && record.completedOperations[operation.id]) return duplicate(record, 'operation-complete');
  const amount = Number(request.amount);
  if (!(Number.isFinite(amount) && amount > 0)) return failed(record, 'amount-invalid');
  for (const dependencyId of array(operation.dependsOn)) {
    if (!record.completedOperations || !record.completedOperations[dependencyId]) return failed(record, 'dependency-incomplete');
  }
  const live = record.components && record.components[operation.componentId];
  if (!live) return failed(record, 'component-missing');
  if (!array(operation.from).includes(live.status)) return failed(record, 'component-state');
  if (operation.receiverId) {
    const receiver = record.receivers && record.receivers[operation.receiverId];
    const payload = record.payloads && record.payloads[operation.payloadId];
    if (!receiver || receiver.settledReceiptId) return duplicate(record, 'receiver-settled');
    if (!payload || payload.status !== 'released') return failed(record, 'payload-not-ready');
    if (!validDelivery(manifest, record, operation, request.delivery)) return failed(record, 'payload-not-delivered');
  }

  const next = clonePlain(record);
  next.operationCursors = normalizeOperationCursors(manifest, next.operationCursors, [], next.completedOperations);
  next.operationCursors[operation.id] = { requestStreamId, throughSequence: requestSequence };
  const receiptId = operationReceiptId(manifest.id, operation.id, requestStreamId, requestSequence);
  const component = next.components[operation.componentId];
  const before = Number(component.progress[operation.id]) || 0;
  const after = Math.min(operation.threshold, before + amount);
  component.progress[operation.id] = after;
  const complete = after >= operation.threshold;
  let intents = [];
  if (complete) {
    component.status = operation.to;
    // Completed work is represented by its durable receipt. Keep progress partial-only so the
    // live record is already in the same canonical shape produced by save-load normalization.
    delete component.progress[operation.id];
    next.completedOperations[operation.id] = {
      receiptId, tick: finiteTick(request.tick), cycle: boundedInt(component.cycle, 0, Number.MAX_SAFE_INTEGER, 0),
      requestStreamId,
      requestSequence,
    };
    next.completionCount = boundedInt(next.completionCount, 0, Number.MAX_SAFE_INTEGER - 1, 0) + 1;
    const payloadDef = operation.payloadId && manifest.payloads.find((candidate) => candidate.id === operation.payloadId);
    if (payloadDef && payloadDef.releaseOperationId === operation.id) {
      next.payloads[payloadDef.id].status = 'released';
      // A stowed payload is authored against the dark stage, but release occurs after this
      // operation has advanced the site. Snapshot the resulting stage socket now so the first
      // physical materialization starts at the asset that is actually visible to the player.
      next.payloads[payloadDef.id].motion = initialPayloadMotion(
        manifest,
        payloadDef,
        evaluateStage(manifest, next),
      );
    }
    if (operation.receiverId) {
      next.payloads[operation.payloadId].status = 'settled';
      next.payloads[operation.payloadId].settledReceiptId = receiptId;
      next.receivers[operation.receiverId].status = 'settled';
      next.receivers[operation.receiverId].settledReceiptId = receiptId;
    }
    intents = intentsForOperation(manifest, operation, receiptId);
  }
  const receipt = appendReceipt(next, {
    receiptId,
    kind: 'operation',
    operationId: operation.id,
    componentId: operation.componentId,
    cycle: boundedInt(component.cycle, 0, Number.MAX_SAFE_INTEGER, 0),
    requestStreamId,
    requestSequence,
    amountApplied: after - before,
    complete,
    tick: finiteTick(request.tick),
  });
  next.updatedTick = Math.max(finiteTick(next.updatedTick), finiteTick(request.tick));
  next.revision = boundedInt(next.revision, 0, Number.MAX_SAFE_INTEGER - 1, 0) + 1;
  next.stageId = evaluateStage(manifest, next);
  return { ok: true, duplicate: false, reason: null, record: next, receipt, intents, materializationChanged: complete };
}

export function applyWorldSiteFailure(manifest, record, request = {}) {
  const componentId = cleanId(request.componentId);
  if (!manifest.components.some((component) => component.id === componentId)) return failed(record, 'component-missing');
  const current = record.components && record.components[componentId];
  if (!current) return failed(record, 'component-missing');
  const expectedCycle = request.expectedCycle == null ? current.cycle : finiteSequence(request.expectedCycle);
  if (expectedCycle == null) return failed(record, 'failure-cycle-invalid');
  if (expectedCycle < current.cycle) return duplicate(record, 'failure-cycle-replayed');
  if (expectedCycle !== current.cycle) return failed(record, 'failure-cycle-future');
  const next = clonePlain(record);
  const component = next.components[componentId];
  component.status = 'failed';
  component.failureCount = boundedInt(component.failureCount, 0, Number.MAX_SAFE_INTEGER - 1, 0) + 1;
  component.cycle = boundedInt(component.cycle, 0, Number.MAX_SAFE_INTEGER - 1, 0) + 1;
  component.progress = {};
  const receiptId = `${manifest.id}/failure/${componentId}/${component.cycle}`;
  for (const operation of manifest.operations) {
    if (operation.componentId === componentId) delete next.completedOperations[operation.id];
  }
  const failure = {
    failureId: cleanId(request.failureId) || 'site_failure',
    componentId,
    cycle: component.cycle,
    receiptId,
    tick: finiteTick(request.tick),
  };
  next.failures.push(failure);
  if (next.failures.length > WORLD_SITE_LIMITS.maxFailures) next.failures.splice(0, next.failures.length - WORLD_SITE_LIMITS.maxFailures);
  const receipt = appendReceipt(next, { ...failure, kind: 'failure', complete: true });
  next.updatedTick = Math.max(finiteTick(next.updatedTick), finiteTick(request.tick));
  next.revision = boundedInt(next.revision, 0, Number.MAX_SAFE_INTEGER - 1, 0) + 1;
  next.stageId = evaluateStage(manifest, next);
  return { ok: true, duplicate: false, reason: null, record: next, receipt, intents: [], materializationChanged: true };
}

export function worldSiteOperationReadiness(manifest, record, componentId, verb = null) {
  const live = record && record.components && record.components[componentId];
  if (!live) return { operation: null, reason: 'component-missing', candidates: [] };
  const operations = array(manifest && manifest.operations).filter((operation) => operation.componentId === componentId
    && (!verb || operation.verb === verb)
    && array(operation.from).includes(live.status)
    && !(record.completedOperations && record.completedOperations[operation.id]));
  let reason = operations.length ? 'state-unavailable' : array(manifest && manifest.operations)
    .some((operation) => operation.componentId === componentId
      && (!verb || operation.verb === verb)
      && record.completedOperations && record.completedOperations[operation.id])
    ? 'complete'
    : 'state-unavailable';
  for (const operation of operations) {
    if (!array(operation.dependsOn).every((id) => record.completedOperations && record.completedOperations[id])) {
      if (reason === 'state-unavailable') reason = 'dependency-incomplete';
      continue;
    }
    if (operation.receiverId) {
      const payload = record.payloads && record.payloads[operation.payloadId];
      const receiver = record.receivers && record.receivers[operation.receiverId];
      if (!payload || payload.status !== 'released') {
        reason = 'payload-not-ready';
        continue;
      }
      if (!receiver || receiver.status === 'settled' || receiver.settledReceiptId) {
        reason = 'receiver-settled';
        continue;
      }
    }
    return { operation, reason: null, candidates: operations };
  }
  return { operation: null, reason, candidates: operations };
}

export function operationForWorldSiteComponent(manifest, record, componentId, verb = null) {
  return worldSiteOperationReadiness(manifest, record, componentId, verb).operation;
}

export function planWorldSiteMaterialization(manifest, record) {
  const stageId = evaluateStage(manifest, record);
  const stage = manifest.stages.find((candidate) => candidate.id === stageId) || manifest.stages[0];
  const origin = manifest.placement.pos;
  const binding = worldSiteAssetBinding(stage.placeId || manifest.visualRoot.placeId);
  const root = {
    worldRecordId: `${manifest.worldObjectId}/root`,
    type: 'fx',
    pos: { x: origin.x, z: origin.z },
    rot: Number(manifest.placement.rot) || 0,
    placeId: stage.placeId || manifest.visualRoot.placeId,
    scale: Number(stage.scale) || Number(manifest.visualRoot.initialScale) || 1,
    label: stage.label || manifest.name,
    stageId,
    presentation: projectWorldSitePresentation(stage, record),
  };
  const components = manifest.components.map((component) => {
    const proxy = manifest.proxies.find((candidate) => candidate.componentId === component.id);
    const offset = rotatedOffset(socketLocalOffset(binding, proxy, stage.scale), manifest.placement.rot);
    const live = record.components[component.id];
    const bodyType = worldSiteProxyBodyType(proxy, live.status);
    const effectiveProxy = {
      ...clonePlain(proxy),
      ...(proxy.bodyTypeByStatus
        ? { authoredBodyType: proxy.bodyType, bodyType }
        : { bodyType }),
    };
    return {
      worldRecordId: `${manifest.worldObjectId}/component/${component.id}`,
      type: 'wreck',
      componentId: component.id,
      pos: { x: origin.x + finite(offset.x), z: origin.z + finite(offset.z) },
      radius: proxyRadius(proxy) * root.scale,
      bodyType,
      shape: proxy.shape,
      proxy: effectiveProxy,
      status: live.status,
      label: component.label,
    };
  });
  const payloads = manifest.payloads
    .filter((payload) => record.payloads[payload.id] && record.payloads[payload.id].status === 'released')
    .map((payload) => {
      const mountProxy = manifest.proxies.find((candidate) => candidate.componentId === payload.componentId);
      const fallbackMotion = initialPayloadMotion(manifest, payload);
      const motion = normalizeMotion(record.payloads[payload.id].motion, fallbackMotion);
      return {
        worldRecordId: payload.worldObjectId,
        type: 'payload',
        payloadId: payload.id,
        pos: clonePlain(motion.pos),
        vel: clonePlain(motion.vel),
        radius: payload.radius,
        mass: payload.mass,
        salvagePool: clonePlain(payload.salvagePool || {}),
      };
    });
  const entities = [root, ...components, ...payloads];
  if (entities.length > WORLD_SITE_LIMITS.maxEntities) throw new RangeError('World Site materialization exceeds entity limit');
  return { siteId: manifest.id, stageId, root, components, payloads, entities };
}

export function worldSiteProxyBodyType(proxy, status) {
  const authored = ['sensor', 'solid'].includes(proxy?.bodyType)
    ? proxy.bodyType
    : 'sensor';
  const override = proxy?.bodyTypeByStatus?.[status];
  return ['sensor', 'solid'].includes(override) ? override : authored;
}

export function projectWorldSite(manifest, record) {
  const plan = planWorldSiteMaterialization(manifest, record);
  return deepFreeze({
    id: record.worldObjectId,
    manifestId: record.manifestId,
    sectorId: record.sectorId,
    stageId: plan.stageId,
    label: plan.root.label,
    pos: { x: plan.root.pos.x, z: plan.root.pos.z },
    stageLabel: plan.root.label,
    visual: { placeId: plan.root.placeId, scale: plan.root.scale },
    map: { ...clonePlain(manifest.mapAnnotation || {}), stageId: plan.stageId, stageLabel: plan.root.label },
    ledger: {
      revision: record.revision,
      receiptCount: array(record.receipts).length,
      // Receipts are a bounded audit tail and 60 Hz held operations can evict old completion rows.
      // Lifetime completion truth therefore has its own durable monotonic counter. The fallbacks
      // keep older/un-normalized records honest without inventing more history than they retain.
      completedCount: Math.max(
        Object.keys(isPlainObject(record.completedOperations) ? record.completedOperations : {}).length,
        array(record.receipts).filter((receipt) => receipt
          && receipt.kind === 'operation' && receipt.complete === true).length,
        boundedInt(record.completionCount, 0, Number.MAX_SAFE_INTEGER, 0),
      ),
      failureCount: array(record.failures).length,
      lastReceipt: clonePlain(array(record.receipts).at(-1) || null),
      recentReceipts: clonePlain(array(record.receipts).slice(-5)),
    },
    traffic: { ...clonePlain(manifest.trafficHook || {}), siteId: manifest.id, stageId: plan.stageId, active: true },
    components: manifest.components.map((def) => ({ id: def.id, label: def.label, ...clonePlain(record.components[def.id]) })),
    payloads: clonePlain(record.payloads),
    receivers: clonePlain(record.receivers),
    discoveries: clonePlain(record.discoveries),
    updatedTick: record.updatedTick,
  });
}

function appendReceipt(record, fields) {
  const receipt = { sequence: record.nextReceiptSequence, ...fields };
  record.nextReceiptSequence += 1;
  record.receipts.push(receipt);
  if (record.receipts.length > WORLD_SITE_LIMITS.maxReceipts) record.receipts.splice(0, record.receipts.length - WORLD_SITE_LIMITS.maxReceipts);
  return receipt;
}

function intentsForOperation(manifest, operation, receiptId) {
  const out = [];
  for (const consequenceId of array(operation.consequenceIds)) {
    const consequence = manifest.consequences.find((candidate) => candidate.id === consequenceId);
    if (!consequence) continue;
    for (const intent of array(consequence.intents)) {
      out.push({
        domain: intent.domain,
        type: intent.type,
        payload: {
          ...clonePlain(intent.payload || {}),
          siteId: manifest.id,
          worldObjectId: manifest.worldObjectId,
          operationId: operation.id,
          receiptId,
        },
      });
    }
  }
  return out;
}

function evaluateStage(manifest, record) {
  let stageId = manifest.stages[0].id;
  for (const stage of manifest.stages) {
    if (array(stage.requires).every((operationId) => record.completedOperations && record.completedOperations[operationId])) stageId = stage.id;
  }
  return stageId;
}

function componentCanRecoverFromFailure(manifest, componentId) {
  return array(manifest.failureTriggers).some((trigger) => trigger.componentId === componentId
    && nonEmpty(trigger.recoveryOperationId))
    || array(manifest.operations).some((operation) => operation.componentId === componentId
      && array(operation.from).includes('failed'));
}

function validNormalizedReceipt(manifest, receipt, updatedTick) {
  if (!isPlainObject(receipt)) return false;
  if (receipt.kind === 'failure') {
    return manifest.components.some((component) => component.id === receipt.componentId)
      && finiteSequence(receipt.cycle) != null
      && finiteTick(receipt.tick) <= updatedTick;
  }
  if (receipt.kind !== 'operation') return false;
  const operation = manifest.operations.find((candidate) => candidate.id === receipt.operationId);
  const sequence = finiteSequence(receipt.requestSequence == null ? receipt.tick : receipt.requestSequence);
  return !!operation
    && receipt.requestStreamId === operation.requestStreamId
    && sequence != null
    && sequence <= updatedTick;
}

function reachableOperations(components, operations) {
  const statuses = Object.fromEntries(components.map((component) => [component.id, component.initialStatus]));
  const reached = new Set();
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const operation of operations) {
      if (reached.has(operation.id)) continue;
      if (!array(operation.dependsOn).every((id) => reached.has(id))) continue;
      if (!array(operation.from).includes(statuses[operation.componentId])) continue;
      reached.add(operation.id);
      statuses[operation.componentId] = operation.to;
      progressed = true;
    }
  }
  return reached;
}

function hasDependencyCycle(graph) {
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dep of graph.get(id) || []) if (graph.has(dep) && visit(dep)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  for (const id of graph.keys()) if (visit(id)) return true;
  return false;
}

function collectIds(entries, family, add) {
  const ids = new Set();
  for (let i = 0; i < entries.length; i += 1) {
    const id = entries[i] && entries[i].id;
    if (!nonEmpty(id)) add(`${family}-id-missing`, `$.${family}s[${i}].id`);
    else if (ids.has(id)) add(`${family}-id-duplicate`, `$.${family}s[${i}].id`, id);
    else ids.add(id);
  }
  return ids;
}

function validProxy(proxy) {
  return ['sensor', 'solid'].includes(proxy.bodyType)
    && proxy.shape === 'circle'
    && Number.isFinite(proxy.radius) && proxy.radius > 0
    && finitePoint(proxy.offset);
}

function authoredComponentStatuses(component, operations, failureTriggers) {
  const statuses = new Set();
  if (nonEmpty(component?.initialStatus)) statuses.add(component.initialStatus);
  for (const operation of array(operations)) {
    if (operation?.componentId !== component?.id) continue;
    for (const status of array(operation.from)) if (nonEmpty(status)) statuses.add(status);
    if (nonEmpty(operation.to)) statuses.add(operation.to);
  }
  for (const trigger of array(failureTriggers)) {
    if (trigger?.componentId !== component?.id) continue;
    for (const status of array(trigger.from)) if (nonEmpty(status)) statuses.add(status);
    statuses.add('failed');
  }
  return statuses;
}

function validateStagePresentation(presentation, binding, componentIds, stageIndex, add) {
  const base = `$.stages[${stageIndex}].presentation`;
  if (!isPlainObject(presentation)) {
    add('stage-presentation-missing', base);
    return;
  }
  const fixtures = array(presentation.fixtures);
  const animations = array(presentation.animations);
  if (presentation.schemaVersion !== 1) add('stage-presentation-version-invalid', `${base}.schemaVersion`);
  if (fixtures.length < 1 || fixtures.length > WORLD_SITE_LIMITS.maxPresentationFixtures) {
    add('stage-presentation-fixture-limit', `${base}.fixtures`);
  }
  if (animations.length < 1 || animations.length > WORLD_SITE_LIMITS.maxPresentationAnimations) {
    add('stage-presentation-animation-limit', `${base}.animations`);
  }
  const fixtureIds = new Set();
  for (let i = 0; i < fixtures.length; i += 1) {
    const fixture = fixtures[i] || {};
    const path = `${base}.fixtures[${i}]`;
    if (!nonEmpty(fixture.id)) add('stage-presentation-fixture-id-missing', `${path}.id`);
    else if (fixtureIds.has(fixture.id)) add('stage-presentation-fixture-id-duplicate', `${path}.id`, fixture.id);
    else fixtureIds.add(fixture.id);
    if (!['status-light', 'ring', 'bar'].includes(fixture.kind)) add('stage-presentation-fixture-kind-invalid', `${path}.kind`);
    if (!nonEmpty(fixture.socketId) || !binding || !binding.sockets[fixture.socketId]) {
      add('stage-presentation-socket-missing', `${path}.socketId`);
    }
    if (!componentIds.has(fixture.componentId)) add('stage-presentation-component-missing', `${path}.componentId`);
    if (!Number.isInteger(fixture.color) || fixture.color < 0 || fixture.color > 0xffffff
      || !(Number.isFinite(fixture.intensity) && fixture.intensity > 0 && fixture.intensity <= 4)
      || !(Number.isFinite(fixture.opacity) && fixture.opacity > 0 && fixture.opacity <= 1)) {
      add('stage-presentation-fixture-style-invalid', path);
    }
    if (fixture.kind === 'status-light' && !(Number.isFinite(fixture.radius) && fixture.radius > 0 && fixture.radius <= 24)) {
      add('stage-presentation-fixture-shape-invalid', path);
    }
    if (fixture.kind === 'ring' && (!(Number.isFinite(fixture.radius) && fixture.radius > 0 && fixture.radius <= 48)
      || !(Number.isFinite(fixture.tube) && fixture.tube > 0 && fixture.tube <= 8))) {
      add('stage-presentation-fixture-shape-invalid', path);
    }
    if (fixture.kind === 'bar' && (!Array.isArray(fixture.size) || fixture.size.length !== 3
      || fixture.size.some((value) => !(Number.isFinite(value) && value > 0 && value <= 48)))) {
      add('stage-presentation-fixture-shape-invalid', path);
    }
  }
  const animationIds = new Set();
  for (let i = 0; i < animations.length; i += 1) {
    const animation = animations[i] || {};
    const path = `${base}.animations[${i}]`;
    if (!nonEmpty(animation.id)) add('stage-presentation-animation-id-missing', `${path}.id`);
    else if (animationIds.has(animation.id)) add('stage-presentation-animation-id-duplicate', `${path}.id`, animation.id);
    else animationIds.add(animation.id);
    if (!['pulse', 'rotate'].includes(animation.kind)) add('stage-presentation-animation-kind-invalid', `${path}.kind`);
    if (!fixtureIds.has(animation.targetId)) add('stage-presentation-animation-target-missing', `${path}.targetId`);
    if (!(Number.isFinite(animation.rate) && animation.rate >= 0 && animation.rate <= 12)
      || !(Number.isFinite(animation.amplitude) && animation.amplitude >= 0 && animation.amplitude <= 2)) {
      add('stage-presentation-animation-value-invalid', path);
    }
  }
}

function projectWorldSitePresentation(stage, record) {
  const componentStatuses = {};
  for (const [id, component] of Object.entries(record.components || {})) componentStatuses[id] = component.status;
  const payloadStatuses = {};
  for (const [id, payload] of Object.entries(record.payloads || {})) payloadStatuses[id] = payload.status;
  return {
    schemaVersion: 1,
    stageId: stage.id,
    revision: record.revision,
    fixtures: stage.presentation.fixtures,
    animations: stage.presentation.animations,
    componentStatuses,
    payloadStatuses,
  };
}

function nonJsonPaths(value) {
  const paths = [];
  const active = new Set();
  const visit = (current, path) => {
    if (current == null || typeof current === 'string' || typeof current === 'boolean') return;
    if (typeof current === 'number') { if (!Number.isFinite(current)) paths.push(path); return; }
    if (typeof current !== 'object') { paths.push(path); return; }
    if (active.has(current)) { paths.push(path); return; }
    if (!Array.isArray(current) && !isPlainObject(current)) { paths.push(path); return; }
    active.add(current);
    if (Array.isArray(current)) current.forEach((entry, index) => visit(entry, `${path}[${index}]`));
    else for (const key of Object.keys(current)) visit(current[key], `${path}.${key}`);
    active.delete(current);
  };
  visit(value, '$');
  return paths;
}

function normalizeOperationCursors(manifest, value, receipts, completedOperations) {
  const out = {};
  for (const operation of manifest.operations) {
    const prior = value && value[operation.id];
    let throughSequence = prior && prior.requestStreamId === operation.requestStreamId
      ? finiteSequence(prior.throughSequence)
      : null;
    for (const receipt of array(receipts)) {
      if (!receipt || receipt.operationId !== operation.id) continue;
      const sequence = finiteSequence(receipt.requestSequence == null ? receipt.tick : receipt.requestSequence);
      if (sequence != null) throughSequence = Math.max(throughSequence == null ? -1 : throughSequence, sequence);
    }
    const completed = completedOperations && completedOperations[operation.id];
    const completedSequence = completed && finiteSequence(completed.requestSequence == null ? completed.tick : completed.requestSequence);
    if (completedSequence != null) throughSequence = Math.max(throughSequence == null ? -1 : throughSequence, completedSequence);
    if (throughSequence != null) out[operation.id] = {
      requestStreamId: operation.requestStreamId,
      throughSequence,
    };
  }
  return out;
}

function operationReceiptId(siteId, operationId, requestStreamId, requestSequence) {
  return `${siteId}/operation/${operationId}/${requestStreamId}/${requestSequence}`;
}

function rotatedOffset(offset, rotation) {
  const x = finite(offset && offset.x);
  const z = finite(offset && offset.z);
  const angle = finite(rotation);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: x * cos - z * sin, z: x * sin + z * cos };
}

function initialPayloadMotion(manifest, payload, stageId = null) {
  const proxy = manifest.proxies.find((candidate) => candidate.componentId === payload.componentId);
  const stage = manifest.stages.find((candidate) => candidate.id === stageId) || manifest.stages[0];
  const binding = worldSiteAssetBinding(stage.placeId || manifest.visualRoot.placeId);
  const local = socketLocalOffset(binding, proxy, stage.scale);
  const offset = rotatedOffset({ x: local.x + 8 * stage.scale, z: local.z + 4 * stage.scale }, manifest.placement.rot);
  return {
    pos: {
      x: manifest.placement.pos.x + offset.x,
      z: manifest.placement.pos.z + offset.z,
    },
    vel: { x: 0, z: 0 },
  };
}

function socketLocalOffset(binding, proxy, scale) {
  const socket = binding && proxy && binding.sockets[proxy.anchorId];
  const translation = socket && socket.transform && socket.transform.translation;
  const center = binding && binding.visualCenterXZ;
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    x: ((translation && translation[0]) - (center && center.x) + finite(proxy && proxy.offset && proxy.offset.x)) * s,
    z: ((translation && translation[2]) - (center && center.z) + finite(proxy && proxy.offset && proxy.offset.z)) * s,
  };
}

function normalizeMotion(value, fallback) {
  const base = fallback || { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  return {
    pos: finitePoint(value && value.pos) ? { x: value.pos.x, z: value.pos.z } : { ...base.pos },
    vel: finitePoint(value && value.vel) ? { x: value.vel.x, z: value.vel.z } : { ...base.vel },
  };
}

function validDelivery(manifest, record, operation, delivery) {
  if (!isPlainObject(delivery)) return false;
  const payload = manifest.payloads.find((candidate) => candidate.id === operation.payloadId);
  const receiver = manifest.receivers.find((candidate) => candidate.id === operation.receiverId);
  const proxy = receiver && manifest.proxies.find((candidate) => candidate.componentId === receiver.componentId);
  if (!payload || !receiver || !proxy) return false;
  if (delivery.payloadId !== payload.id || delivery.payloadWorldObjectId !== payload.worldObjectId
    || delivery.receiverId !== receiver.id) return false;
  if (!finitePoint(delivery.payloadPos) || !finitePoint(delivery.receiverPos)) return false;
  const dx = delivery.payloadPos.x - delivery.receiverPos.x;
  const dz = delivery.payloadPos.z - delivery.receiverPos.z;
  const stage = manifest.stages.find((candidate) => candidate.id === evaluateStage(manifest, record));
  const stageScale = stage && Number(stage.scale) > 0 ? Number(stage.scale) : Number(manifest.visualRoot.initialScale) || 1;
  const radius = finite(payload.radius) + proxyRadius(proxy) * stageScale;
  return dx * dx + dz * dz <= radius * radius;
}

function duplicate(record, reason) {
  return { ok: true, duplicate: true, reason, record, receipt: null, intents: [], materializationChanged: false };
}

function failed(record, reason) {
  return { ok: false, duplicate: false, reason, record, receipt: null, intents: [], materializationChanged: false };
}

function boundedPlainArray(value, limit) {
  if (!Array.isArray(value)) return [];
  const out = value.filter((entry) => isPlainObject(entry) && nonJsonPaths(entry).length === 0).slice(-limit);
  return clonePlain(out);
}

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function proxyRadius(proxy) {
  if (!proxy) return 4;
  if (proxy.shape === 'circle') return proxy.radius;
  return Math.max(proxy.halfExtents.x, proxy.halfExtents.z);
}

function array(value) { return Array.isArray(value) ? value : []; }
function nonEmpty(value) { return typeof value === 'string' && value.trim().length > 0; }
function cleanId(value) { return nonEmpty(value) ? value.trim() : null; }
function finiteSequence(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}
function positiveInt(value) { return Number.isInteger(value) && value > 0; }
function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
function finiteTick(value) { return Math.max(0, Math.trunc(finite(Number(value), 0))); }
function finitePoint(value) { return isPlainObject(value) && Number.isFinite(value.x) && Number.isFinite(value.z); }
function isPlainObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function boundedInt(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.trunc(number))) : fallback;
}

export default {
  validateWorldSiteManifest,
  createWorldSiteRecord,
  normalizeWorldSiteRecord,
  applyWorldSiteOperation,
  applyWorldSiteFailure,
  worldSiteOperationReadiness,
  operationForWorldSiteComponent,
  planWorldSiteMaterialization,
  projectWorldSite,
};
