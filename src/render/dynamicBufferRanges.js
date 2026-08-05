import { BufferAttribute } from 'three';

const DEFAULT_UPLOAD_CALLBACK = BufferAttribute.prototype.onUploadCallback;
const COORDINATORS = new WeakMap();
let uploadCallbackBinding = null;

function integer(value) {
  return Number.isInteger(value) ? value : -1;
}

function removeRangeByIdentity(attribute, record) {
  const ranges = attribute.updateRanges;
  const index = ranges.indexOf(record);
  if (index >= 0) ranges.splice(index, 1);
}

function resetBindingPending(binding) {
  binding.pending.start = binding.pending.capacity;
  binding.pending.end = 0;
  binding.pending.logicalComponents = 0;
}

function markOwnerInvalid(owner, message, counter = null) {
  owner.invalid = true;
  owner.diagnostics.invalid = true;
  owner.diagnostics.lastError = message;
  const coordinator = owner.coordinator;
  if (coordinator) {
    coordinator.diagnostics.invalid = true;
    coordinator.diagnostics.lastError = message;
    if (counter) coordinator.diagnostics[counter]++;
  }
  throw new Error(message);
}

function requireDefaultUploadCallback(attribute, ownerId, name) {
  if (Object.prototype.hasOwnProperty.call(attribute, 'onUploadCallback')
      || attribute.onUploadCallback !== DEFAULT_UPLOAD_CALLBACK) {
    throw new Error(`${ownerId}:${name} already owns an upload callback`);
  }
  if (!Array.isArray(attribute.updateRanges) || attribute.updateRanges.length !== 0) {
    throw new Error(`${ownerId}:${name} has pre-existing public update ranges`);
  }
}

function installUploadCallback(binding) {
  const { attribute } = binding;
  binding.callback = function acknowledgeDynamicBufferUpload() {
    acknowledgeUpload(binding, this);
  };
  attribute.onUploadCallback = binding.callback;
}

function acknowledgeUpload(binding, callbackAttribute) {
  const owner = binding.owner;
  const snapshot = binding.snapshot;
  if (uploadCallbackBinding) {
    markOwnerInvalid(owner, `${owner.id}:${binding.name} upload callback re-entered`, 'callbackViolations');
  }
  uploadCallbackBinding = binding;
  try {
    if (!snapshot.active) {
      if (!binding.contextRestoreUploadPending) {
        markOwnerInvalid(owner, `${owner.id}:${binding.name} received an unsolicited upload callback`, 'callbackViolations');
      }
      if (callbackAttribute !== binding.attribute) {
        markOwnerInvalid(owner, `${owner.id}:${binding.name} restored-context callback used a stale attribute`, 'callbackViolations');
      }
      if (binding.attribute.onUploadCallback !== binding.callback) {
        markOwnerInvalid(owner, `${owner.id}:${binding.name} restored-context callback identity changed`, 'callbackViolations');
      }
      if (binding.attribute.version !== binding.knownVersion) {
        markOwnerInvalid(owner, `${owner.id}:${binding.name} restored-context upload version changed outside its owner`, 'callbackViolations');
      }
      if (binding.attribute.updateRanges.length !== 0) {
        markOwnerInvalid(owner, `${owner.id}:${binding.name} restored-context upload retained foreign update ranges`, 'callbackViolations');
      }

      // THREE discards its WebGLAttributes cache when a context is restored and
      // performs a fresh bufferData upload from the current CPU array. That
      // upload preserves BufferAttribute.version and therefore has no owned
      // publication snapshot. Accept exactly the one callback armed by the
      // restore event; the full driver upload also consumes every dirty span.
      binding.contextRestoreUploadPending = false;
      binding.forceFull = false;
      binding.forceReason = null;
      resetBindingPending(binding);
      owner.diagnostics.acknowledgements++;
      owner.diagnostics.contextRestoreAcknowledgements++;
      owner.coordinator.diagnostics.acknowledgedUploads++;
      owner.coordinator.diagnostics.contextRestoreAcknowledgements++;
      return;
    }
    if (callbackAttribute !== binding.attribute || snapshot.attribute !== binding.attribute) {
      markOwnerInvalid(owner, `${owner.id}:${binding.name} upload callback used a stale attribute`, 'callbackViolations');
    }
    if (binding.attribute.onUploadCallback !== binding.callback) {
      markOwnerInvalid(owner, `${owner.id}:${binding.name} upload callback identity changed`, 'callbackViolations');
    }
    if (binding.attribute.version !== snapshot.version) {
      markOwnerInvalid(owner, `${owner.id}:${binding.name} upload version changed before acknowledgement`, 'callbackViolations');
    }

    // Ordinary bufferSubData clears the public list before this callback. Initial bufferData does not,
    // so remove only the exact record this owner appended and never erase foreign metadata.
    removeRangeByIdentity(binding.attribute, snapshot.record);
    if (binding.attribute.updateRanges.length !== 0) {
      markOwnerInvalid(owner, `${owner.id}:${binding.name} retained foreign update ranges`, 'callbackViolations');
    }

    snapshot.active = false;
    snapshot.attribute = null;
    snapshot.record = null;
    binding.contextRestoreUploadPending = false;
    binding.acknowledgedGeneration = snapshot.generation;
    owner.diagnostics.acknowledgedGeneration = Math.max(
      owner.diagnostics.acknowledgedGeneration,
      snapshot.generation,
    );
    owner.diagnostics.acknowledgements++;
    owner.coordinator.diagnostics.acknowledgedUploads++;
  } finally {
    uploadCallbackBinding = null;
  }
}

function supersedeBinding(binding, reason) {
  const snapshot = binding.snapshot;
  if (snapshot.active) {
    removeRangeByIdentity(binding.attribute, snapshot.record);
    snapshot.active = false;
    snapshot.attribute = null;
    snapshot.record = null;
    binding.supersededGeneration = snapshot.generation;
    binding.owner.diagnostics.supersededGenerations++;
    binding.owner.coordinator.diagnostics.supersededUploads++;
  }
  binding.forceFull = true;
  binding.forceReason = reason;
}

function forceOwnerFull(owner, reason) {
  for (let index = 0; index < owner.bindings.length; index++) {
    supersedeBinding(owner.bindings[index], reason);
  }
}

function validateBindingForPublication(binding) {
  const owner = binding.owner;
  const attribute = binding.attribute;
  if (attribute.onUploadCallback !== binding.callback) {
    markOwnerInvalid(owner, `${owner.id}:${binding.name} upload callback identity changed`, 'callbackViolations');
  }
  if (attribute.version !== binding.knownVersion) {
    markOwnerInvalid(owner, `${owner.id}:${binding.name} attribute version changed outside its owner`, 'callbackViolations');
  }
  if (binding.snapshot.active) {
    markOwnerInvalid(owner, `${owner.id}:${binding.name} still has an unacknowledged publication`, 'callbackViolations');
  }
  if (attribute.updateRanges.length !== 0) {
    markOwnerInvalid(owner, `${owner.id}:${binding.name} public update ranges changed outside its owner`, 'callbackViolations');
  }
}

function publishBinding(binding, epoch, forceFull) {
  validateBindingForPublication(binding);
  const attribute = binding.attribute;
  const start = forceFull ? 0 : binding.pending.start;
  const count = forceFull
    ? attribute.array.length
    : binding.pending.end - binding.pending.start;
  if (count <= 0) return false;

  // Three r184 reads `updateRanges` in place and clears the array before the upload callback.
  // Keep one owner-held record per attribute so a steady partial upload does not allocate here.
  const record = binding.rangeRecord;
  record.start = start;
  record.count = count;
  attribute.updateRanges.push(record);
  const snapshot = binding.snapshot;
  const generation = binding.publishedGeneration + 1;
  snapshot.active = true;
  snapshot.attribute = attribute;
  snapshot.record = record;
  snapshot.start = start;
  snapshot.count = count;
  snapshot.generation = generation;
  snapshot.epoch = epoch;
  snapshot.version = attribute.version + 1;

  try {
    attribute.needsUpdate = true;
  } catch (error) {
    removeRangeByIdentity(attribute, record);
    snapshot.active = false;
    snapshot.attribute = null;
    snapshot.record = null;
    throw error;
  }
  if (attribute.version !== snapshot.version) {
    markOwnerInvalid(binding.owner, `${binding.owner.id}:${binding.name} did not advance one upload version`, 'callbackViolations');
  }

  binding.knownVersion = attribute.version;
  binding.publishedGeneration = generation;
  binding.contextRestoreUploadPending = false;
  binding.forceFull = false;
  binding.forceReason = null;

  const logicalComponents = Math.min(count, binding.pending.logicalComponents);
  const bytesPerComponent = attribute.array.BYTES_PER_ELEMENT;
  const diagnostics = binding.owner.diagnostics;
  diagnostics.logicalBytesChanged += logicalComponents * bytesPerComponent;
  diagnostics.requestedUploadBytes += count * bytesPerComponent;
  diagnostics.uploadRangeCount++;
  diagnostics.publishedGeneration = Math.max(diagnostics.publishedGeneration, generation);
  if (forceFull) diagnostics.forceFullUploads++;
  else diagnostics.partialUploads++;
  const coordinatorDiagnostics = binding.owner.coordinator.diagnostics;
  coordinatorDiagnostics.updateRangePublications++;
  if (binding.rangeRecordUses > 0) coordinatorDiagnostics.updateRangeRecordReuses++;
  binding.rangeRecordUses++;
  resetBindingPending(binding);
  return true;
}

function ownerWork(owner) {
  let forceFull = false;
  let pending = false;
  for (let index = 0; index < owner.bindings.length; index++) {
    const binding = owner.bindings[index];
    if (binding.forceFull) forceFull = true;
    if (binding.pending.end > binding.pending.start) pending = true;
  }
  return forceFull ? 2 : pending ? 1 : 0;
}

function ownerEligibility(owner, scene, camera) {
  const mesh = owner.mesh;
  if (mesh.frustumCulled !== false) {
    markOwnerInvalid(owner, `${owner.id} became frustum-cullable`, 'eligibilityViolations');
  }
  if (Array.isArray(mesh.material)) {
    markOwnerInvalid(owner, `${owner.id} acquired a material array`, 'eligibilityViolations');
  }

  let node = mesh;
  while (node) {
    if (node.visible === false) return 0;
    if (node.isLOD && node.autoUpdate === true) {
      markOwnerInvalid(owner, `${owner.id} moved below an auto-updating LOD`, 'eligibilityViolations');
    }
    if (node === scene) break;
    node = node.parent;
  }
  if (node !== scene) return 0;
  if (!mesh.layers || !camera || !camera.layers || !mesh.layers.test(camera.layers)) return 0;
  return mesh.material && mesh.material.visible !== false && mesh.count > 0 ? 2 : 1;
}

function publishOwner(owner, scene, camera, epoch) {
  if (owner.invalid || owner.publishedEpoch === epoch) return;
  const work = ownerWork(owner);
  if (work === 0) return;
  const eligibility = ownerEligibility(owner, scene, camera);
  if (eligibility === 0) {
    owner.diagnostics.processingEligibilitySkips++;
    owner.coordinator.diagnostics.processingEligibilitySkips++;
    return;
  }
  if (work === 1 && eligibility < 2) {
    owner.diagnostics.drawEligibilitySkips++;
    owner.coordinator.diagnostics.drawEligibilitySkips++;
    return;
  }

  let published = false;
  for (let index = 0; index < owner.bindings.length; index++) {
    const binding = owner.bindings[index];
    if (binding.forceFull) {
      published = publishBinding(binding, epoch, true) || published;
    } else if (eligibility >= 2 && binding.pending.end > binding.pending.start) {
      published = publishBinding(binding, epoch, false) || published;
    }
  }
  if (published) {
    owner.publishedEpoch = epoch;
    owner.coordinator.diagnostics.publishedOwners++;
  }
}

function publishSceneOwners(coordinator, camera) {
  const owners = coordinator.owners;
  for (let index = 0; index < owners.length; index++) {
    publishOwner(owners[index], coordinator.scene, camera, coordinator.epoch);
  }
}

function supersedeIncompleteEpoch(coordinator, epoch, reason) {
  const owners = coordinator.owners;
  for (let ownerIndex = 0; ownerIndex < owners.length; ownerIndex++) {
    const owner = owners[ownerIndex];
    for (let bindingIndex = 0; bindingIndex < owner.bindings.length; bindingIndex++) {
      const binding = owner.bindings[bindingIndex];
      if (binding.snapshot.active && binding.snapshot.epoch === epoch) {
        supersedeBinding(binding, reason);
      }
    }
  }
}

export function createDynamicComponentSpan(componentCapacity) {
  const capacity = Math.max(0, Math.floor(Number(componentCapacity) || 0));
  return { capacity, start: capacity, end: 0, logicalComponents: 0 };
}

export function resetDynamicComponentSpan(span) {
  span.start = span.capacity;
  span.end = 0;
  span.logicalComponents = 0;
  return span;
}

export function markDynamicComponentRange(span, start, count) {
  if (integer(start) < 0 || integer(count) < 0 || start + count > span.capacity) {
    throw new RangeError(`dirty component range ${start}+${count} exceeds capacity ${span.capacity}`);
  }
  if (count === 0) return span;
  if (start < span.start) span.start = start;
  const end = start + count;
  if (end > span.end) span.end = end;
  span.logicalComponents = Math.min(span.capacity, span.logicalComponents + count);
  return span;
}

export function createDynamicBufferCoordinator(scene) {
  if (!scene || scene.isScene !== true) throw new TypeError('dynamic buffer coordinator requires a Scene');
  const existing = COORDINATORS.get(scene);
  if (existing) return existing;

  const diagnostics = {
    epochs: 0,
    sceneInvocations: 0,
    registeredOwners: 0,
    publishedOwners: 0,
    updateRangeAllocations: 0,
    updateRangePublications: 0,
    updateRangeRecordReuses: 0,
    acknowledgedUploads: 0,
    supersededUploads: 0,
    processingEligibilitySkips: 0,
    drawEligibilitySkips: 0,
    hookViolations: 0,
    callbackViolations: 0,
    writeViolations: 0,
    eligibilityViolations: 0,
    contextLosses: 0,
    contextRestores: 0,
    contextRestoreAcknowledgements: 0,
    invalid: false,
    lastError: null,
    owners: [],
  };
  const coordinator = {
    scene,
    owners: [],
    attributeOwners: new WeakMap(),
    diagnostics,
    epoch: 0,
    active: false,
    inSceneHook: false,
    priorHook: null,
    priorHookHadOwnProperty: false,
  };

  const wrapper = function dynamicBufferSceneBeforeRender(renderer, renderedScene, camera, renderTarget) {
    if (!coordinator.active || renderedScene !== scene) {
      diagnostics.hookViolations++;
      diagnostics.invalid = true;
      diagnostics.lastError = 'dynamic buffer scene hook invoked outside its renderer epoch';
      throw new Error(diagnostics.lastError);
    }
    if (coordinator.inSceneHook) {
      diagnostics.hookViolations++;
      diagnostics.invalid = true;
      diagnostics.lastError = 'dynamic buffer scene hook re-entered';
      throw new Error(diagnostics.lastError);
    }
    coordinator.inSceneHook = true;
    diagnostics.sceneInvocations++;
    try {
      if (typeof coordinator.priorHook === 'function') {
        coordinator.priorHook.call(this, renderer, renderedScene, camera, renderTarget);
      }
      if (scene.onBeforeRender !== wrapper) {
        diagnostics.hookViolations++;
        diagnostics.invalid = true;
        diagnostics.lastError = 'scene onBeforeRender ownership changed during publication';
        throw new Error(diagnostics.lastError);
      }
      publishSceneOwners(coordinator, camera);
    } finally {
      coordinator.inSceneHook = false;
    }
  };
  coordinator.wrapper = wrapper;

  coordinator.arm = () => {
    if (diagnostics.invalid) throw new Error(diagnostics.lastError || 'dynamic buffer coordinator is invalid');
    if (coordinator.active) {
      diagnostics.hookViolations++;
      diagnostics.invalid = true;
      diagnostics.lastError = 'dynamic buffer renderer epoch re-entered';
      throw new Error(diagnostics.lastError);
    }
    coordinator.active = true;
    coordinator.epoch++;
    diagnostics.epochs++;
    coordinator.priorHookHadOwnProperty = Object.prototype.hasOwnProperty.call(scene, 'onBeforeRender');
    coordinator.priorHook = scene.onBeforeRender;
    scene.onBeforeRender = wrapper;
    return coordinator.epoch;
  };

  coordinator.disarm = (epoch) => {
    if (!coordinator.active || epoch !== coordinator.epoch) {
      diagnostics.hookViolations++;
      diagnostics.invalid = true;
      diagnostics.lastError = 'dynamic buffer renderer epoch disarmed out of order';
      throw new Error(diagnostics.lastError);
    }
    try {
      supersedeIncompleteEpoch(coordinator, epoch, 'interrupted-render');
      if (scene.onBeforeRender !== wrapper) {
        diagnostics.hookViolations++;
        diagnostics.invalid = true;
        diagnostics.lastError = 'scene onBeforeRender ownership was lost before disarm';
        throw new Error(diagnostics.lastError);
      }
      if (coordinator.priorHookHadOwnProperty) scene.onBeforeRender = coordinator.priorHook;
      else delete scene.onBeforeRender;
    } finally {
      coordinator.active = false;
      coordinator.priorHook = null;
      coordinator.priorHookHadOwnProperty = false;
    }
  };

  coordinator.handleContextLost = () => {
    diagnostics.contextLosses++;
    for (let index = 0; index < coordinator.owners.length; index++) {
      const owner = coordinator.owners[index];
      forceOwnerFull(owner, 'context-loss');
      for (let bindingIndex = 0; bindingIndex < owner.bindings.length; bindingIndex++) {
        owner.bindings[bindingIndex].contextRestoreUploadPending = false;
      }
    }
  };

  coordinator.handleContextRestored = () => {
    diagnostics.contextRestores++;
    for (let index = 0; index < coordinator.owners.length; index++) {
      const owner = coordinator.owners[index];
      forceOwnerFull(owner, 'context-restore');
      for (let bindingIndex = 0; bindingIndex < owner.bindings.length; bindingIndex++) {
        owner.bindings[bindingIndex].contextRestoreUploadPending = true;
      }
    }
  };

  coordinator.getDiagnostics = () => diagnostics;
  COORDINATORS.set(scene, coordinator);
  return coordinator;
}

export function registerDynamicBufferOwner(scene, spec) {
  const coordinator = scene && COORDINATORS.get(scene);
  if (!coordinator) return null;
  const id = String(spec && spec.id || 'dynamic-buffer-owner');
  const mesh = spec && spec.mesh;
  const attributes = spec && spec.attributes;
  if (!mesh || !Array.isArray(attributes) || attributes.length === 0) {
    throw new TypeError(`${id} requires a mesh and tracked attributes`);
  }
  if (mesh.frustumCulled !== false) throw new Error(`${id} must disable frustum culling`);
  if (Array.isArray(mesh.material)) throw new Error(`${id} cannot track a material array`);

  const owner = {
    id,
    mesh,
    coordinator,
    bindings: [],
    capacity: Infinity,
    logicalGeneration: 0,
    publishedEpoch: 0,
    touched: false,
    invalid: false,
    diagnostics: {
      id,
      activeCount: mesh.count || 0,
      capacity: 0,
      logicalBytesChanged: 0,
      requestedUploadBytes: 0,
      uploadRangeCount: 0,
      forceFullUploads: 0,
      partialUploads: 0,
      acknowledgements: 0,
      contextRestoreAcknowledgements: 0,
      pendingGeneration: 0,
      publishedGeneration: 0,
      acknowledgedGeneration: 0,
      supersededGenerations: 0,
      processingEligibilitySkips: 0,
      drawEligibilitySkips: 0,
      invalid: false,
      lastError: null,
    },
  };

  for (let index = 0; index < attributes.length; index++) {
    const source = attributes[index];
    const attribute = source && source.attribute;
    const name = String(source && source.name || `attribute-${index}`);
    if (!attribute || !attribute.isBufferAttribute || !attribute.array) {
      throw new TypeError(`${id}:${name} is not a BufferAttribute`);
    }
    requireDefaultUploadCallback(attribute, id, name);
    const priorOwner = coordinator.attributeOwners.get(attribute);
    if (priorOwner) throw new Error(`${id}:${name} shares an attribute with ${priorOwner.id}`);
    const itemSize = Math.max(1, Math.floor(Number(attribute.itemSize) || 1));
    const itemCapacity = Math.floor(attribute.array.length / itemSize);
    const binding = {
      owner,
      index,
      name,
      attribute,
      itemSize,
      itemCapacity,
      rangeRecord: { start: 0, count: 0 },
      rangeRecordUses: 0,
      pending: createDynamicComponentSpan(attribute.array.length),
      touchedSinceCommit: false,
      forceFull: true,
      forceReason: 'initial',
      knownVersion: attribute.version,
      publishedGeneration: 0,
      acknowledgedGeneration: 0,
      supersededGeneration: 0,
      contextRestoreUploadPending: false,
      callback: null,
      snapshot: {
        active: false,
        attribute: null,
        record: null,
        start: 0,
        count: 0,
        version: 0,
        generation: 0,
        epoch: 0,
      },
    };
    installUploadCallback(binding);
    owner.bindings.push(binding);
    owner.capacity = Math.min(owner.capacity, itemCapacity);
    coordinator.attributeOwners.set(attribute, owner);
  }

  coordinator.diagnostics.updateRangeAllocations += owner.bindings.length;
  owner.diagnostics.capacity = Number.isFinite(owner.capacity) ? owner.capacity : 0;
  coordinator.owners.push(owner);
  diagnosticsAddOwner(coordinator, owner);
  return owner;
}

function diagnosticsAddOwner(coordinator, owner) {
  coordinator.diagnostics.registeredOwners = coordinator.owners.length;
  coordinator.diagnostics.owners.push(owner.diagnostics);
}

export function unregisterDynamicBufferOwner(owner) {
  if (!owner || !owner.coordinator) return false;
  assertDynamicBufferOwnerWritable(owner);
  const coordinator = owner.coordinator;
  const ownerIndex = coordinator.owners.indexOf(owner);
  if (ownerIndex >= 0) coordinator.owners.splice(ownerIndex, 1);
  const diagnosticIndex = coordinator.diagnostics.owners.indexOf(owner.diagnostics);
  if (diagnosticIndex >= 0) coordinator.diagnostics.owners.splice(diagnosticIndex, 1);
  for (let index = 0; index < owner.bindings.length; index++) {
    const binding = owner.bindings[index];
    if (binding.snapshot.active) supersedeBinding(binding, 'unregister');
    coordinator.attributeOwners.delete(binding.attribute);
    if (binding.attribute.onUploadCallback === binding.callback) delete binding.attribute.onUploadCallback;
  }
  owner.coordinator = null;
  coordinator.diagnostics.registeredOwners = coordinator.owners.length;
  return true;
}

export function assertDynamicBufferOwnerWritable(owner) {
  if (!owner) return;
  if (owner.invalid) throw new Error(owner.diagnostics.lastError || `${owner.id} is invalid`);
  const coordinator = owner.coordinator;
  if (uploadCallbackBinding) {
    coordinator.diagnostics.writeViolations++;
    throw new Error(`${owner.id} cannot write during an upload callback`);
  }
  if (coordinator.active && owner.publishedEpoch === coordinator.epoch) {
    coordinator.diagnostics.writeViolations++;
    throw new Error(`${owner.id} cannot write after publication in renderer epoch ${coordinator.epoch}`);
  }
}

export function markDynamicBufferItems(owner, bindingIndex, itemStart, itemCount = 1) {
  if (!owner) return;
  const binding = owner.bindings[bindingIndex];
  if (!binding) throw new RangeError(`${owner.id} has no tracked attribute ${bindingIndex}`);
  if (integer(itemStart) < 0 || integer(itemCount) < 0 || itemStart + itemCount > binding.itemCapacity) {
    throw new RangeError(`${owner.id}:${binding.name} item range ${itemStart}+${itemCount} exceeds ${binding.itemCapacity}`);
  }
  markDynamicComponentRange(
    binding.pending,
    itemStart * binding.itemSize,
    itemCount * binding.itemSize,
  );
  binding.touchedSinceCommit = itemCount > 0 || binding.touchedSinceCommit;
  owner.touched = binding.touchedSinceCommit || owner.touched;
}

export function commitDynamicBufferOwner(owner, activeCount) {
  if (!owner) return false;
  assertDynamicBufferOwnerWritable(owner);
  if (integer(activeCount) < 0 || activeCount > owner.capacity) {
    throw new RangeError(`${owner.id} active count ${activeCount} exceeds capacity ${owner.capacity}`);
  }
  owner.mesh.count = activeCount;
  owner.diagnostics.activeCount = activeCount;
  if (owner.touched) owner.logicalGeneration++;

  for (let index = 0; index < owner.bindings.length; index++) {
    const binding = owner.bindings[index];
    const componentLimit = Math.min(binding.pending.capacity, activeCount * binding.itemSize);
    if (binding.pending.start >= componentLimit) {
      resetBindingPending(binding);
    } else if (binding.pending.end > componentLimit) {
      binding.pending.end = componentLimit;
      binding.pending.logicalComponents = Math.min(
        binding.pending.logicalComponents,
        binding.pending.end - binding.pending.start,
      );
    }
    if (binding.touchedSinceCommit) {
      binding.touchedSinceCommit = false;
      owner.diagnostics.pendingGeneration = owner.logicalGeneration;
    }
  }
  owner.touched = false;
  return true;
}

export function replaceDynamicBufferAttribute(owner, bindingIndex, attribute, reason = 'replacement') {
  assertDynamicBufferOwnerWritable(owner);
  const binding = owner && owner.bindings[bindingIndex];
  if (!binding) throw new RangeError(`${owner && owner.id || 'owner'} has no tracked attribute ${bindingIndex}`);
  requireDefaultUploadCallback(attribute, owner.id, binding.name);
  const coordinator = owner.coordinator;
  const priorOwner = coordinator.attributeOwners.get(attribute);
  if (priorOwner && priorOwner !== owner) {
    throw new Error(`${owner.id}:${binding.name} shares a replacement attribute with ${priorOwner.id}`);
  }

  if (binding.snapshot.active) supersedeBinding(binding, reason);
  coordinator.attributeOwners.delete(binding.attribute);
  if (binding.attribute.onUploadCallback === binding.callback) delete binding.attribute.onUploadCallback;
  binding.attribute = attribute;
  binding.itemSize = Math.max(1, Math.floor(Number(attribute.itemSize) || 1));
  binding.itemCapacity = Math.floor(attribute.array.length / binding.itemSize);
  binding.pending = createDynamicComponentSpan(attribute.array.length);
  binding.touchedSinceCommit = false;
  binding.knownVersion = attribute.version;
  binding.forceFull = true;
  binding.forceReason = reason;
  binding.snapshot.active = false;
  binding.snapshot.attribute = null;
  binding.snapshot.record = null;
  installUploadCallback(binding);
  coordinator.attributeOwners.set(attribute, owner);

  let capacity = Infinity;
  for (let index = 0; index < owner.bindings.length; index++) {
    capacity = Math.min(capacity, owner.bindings[index].itemCapacity);
  }
  owner.capacity = capacity;
  owner.diagnostics.capacity = Number.isFinite(capacity) ? capacity : 0;
  forceOwnerFull(owner, reason);
  return binding;
}

export function getDynamicBufferOwnerDiagnostics(owner) {
  return owner ? owner.diagnostics : null;
}
