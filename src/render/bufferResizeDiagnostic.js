const SIZE_MISMATCH = /The size of the buffer attribute's array buffer does not match the original size/i;
const MAX_CHANGED_CANDIDATES = 16;
const MAX_SLOT_HISTORY = 4096;

function renderObjectSummary(object) {
  if (!object) return null;
  return {
    uuid: typeof object.uuid === 'string' ? object.uuid : null,
    name: typeof object.name === 'string' ? object.name.slice(0, 120) : null,
    type: typeof object.type === 'string' ? object.type.slice(0, 80) : null,
  };
}

function geometrySummary(geometry) {
  if (!geometry) return null;
  const detach = geometry.userData?.spacefaceCpuDetach || null;
  return {
    uuid: typeof geometry.uuid === 'string' ? geometry.uuid : null,
    name: typeof geometry.name === 'string' ? geometry.name.slice(0, 120) : null,
    type: typeof geometry.type === 'string' ? geometry.type.slice(0, 80) : null,
    hasCpuDetachManifest: !!detach,
    detach: detach ? {
      manifestId: detach.manifestId ?? null,
      contentHash: typeof detach.contentHash === 'string' ? detach.contentHash.slice(0, 80) : null,
      kind: typeof detach.kind === 'string' ? detach.kind.slice(0, 32) : null,
      ordinal: Number.isFinite(detach.ordinal) ? detach.ordinal : null,
    } : null,
  };
}

function attributeShape(attribute, slot) {
  const data = attribute?.isInterleavedBufferAttribute && attribute.data
    ? attribute.data
    : attribute;
  if (!data || !data.array) return null;
  const array = data.array;
  const updateRange = data.updateRange || null;
  return {
    slot,
    attributeUuid: typeof attribute.uuid === 'string' ? attribute.uuid : null,
    dataUuid: typeof data.uuid === 'string' ? data.uuid : null,
    arrayType: array.constructor?.name || null,
    arrayLength: Number.isFinite(array.length) ? array.length : null,
    byteLength: Number.isFinite(array.byteLength) ? array.byteLength : null,
    count: Number.isFinite(attribute.count) ? attribute.count : (Number.isFinite(data.count) ? data.count : null),
    version: Number.isFinite(data.version) ? data.version : null,
    updateRange: updateRange ? {
      offset: Number.isFinite(updateRange.offset) ? updateRange.offset : null,
      count: Number.isFinite(updateRange.count) ? updateRange.count : null,
    } : null,
    interleaved: attribute?.isInterleavedBufferAttribute ? {
      stride: Number.isFinite(data.stride) ? data.stride : null,
      offset: Number.isFinite(attribute.offset) ? attribute.offset : null,
      itemSize: Number.isFinite(attribute.itemSize) ? attribute.itemSize : null,
    } : null,
    data,
  };
}

function geometryAttributeSlots(geometry) {
  if (!geometry) return [];
  const slots = [];
  for (const [name, attribute] of Object.entries(geometry.attributes || {})) {
    const shape = attributeShape(attribute, `attribute:${name}`);
    if (shape) slots.push(shape);
  }
  if (geometry.index) {
    const shape = attributeShape(geometry.index, 'index');
    if (shape) slots.push(shape);
  }
  return slots;
}

function changeKind(previous, current, identityChanged) {
  if (!identityChanged && previous.byteLength !== current.byteLength) return 'byte-length';
  const layoutChanged = identityChanged
    || previous.arrayType !== current.arrayType
    || previous.arrayLength !== current.arrayLength
    || previous.count !== current.count
    || previous.interleaved?.stride !== current.interleaved?.stride
    || previous.interleaved?.offset !== current.interleaved?.offset
    || previous.interleaved?.itemSize !== current.interleaved?.itemSize;
  return layoutChanged ? 'identity-or-layout' : null;
}

function hasResizedBufferError(error) {
  return SIZE_MISMATCH.test(String(error?.message || error || ''));
}

export function createBufferResizeDiagnostic({ maxCandidates = MAX_CHANGED_CANDIDATES } = {}) {
  const cap = Number.isInteger(maxCandidates) ? Math.max(1, Math.min(MAX_CHANGED_CANDIDATES, maxCandidates)) : MAX_CHANGED_CANDIDATES;
  let generation = null;
  let nextIdentity = 1;
  let lastSuccessByAttribute = new WeakMap();
  const identityByAttribute = new WeakMap();
  const lastSuccessBySlot = new Map();

  function ensureGeneration(nextGeneration) {
    if (generation === nextGeneration) return;
    generation = nextGeneration;
  }

  function identify(attribute) {
    let identity = identityByAttribute.get(attribute);
    if (!identity) {
      identity = nextIdentity++;
      identityByAttribute.set(attribute, identity);
    }
    return identity;
  }

  function snapshotSuccessfulDraw({ geometry, object, contextGeneration }) {
    if (!geometry) return;
    ensureGeneration(contextGeneration);
    const owner = renderObjectSummary(object);
    const geometryInfo = geometrySummary(geometry);
    for (const shape of geometryAttributeSlots(geometry)) {
      const data = shape.data;
      const identity = identify(data);
      const compact = { ...shape, data: undefined, identity, owner, geometry: geometryInfo, contextGeneration };
      lastSuccessByAttribute.set(data, compact);
      const slotKey = `${geometryInfo?.uuid || 'geometry'}|${shape.slot}`;
      lastSuccessBySlot.delete(slotKey);
      lastSuccessBySlot.set(slotKey, compact);
      while (lastSuccessBySlot.size > MAX_SLOT_HISTORY) {
        lastSuccessBySlot.delete(lastSuccessBySlot.keys().next().value);
      }
    }
  }

  function retainCandidate(candidates, candidate) {
    if (candidates.length < cap) {
      candidates.push(candidate);
      return;
    }
    let lowestPriorityIndex = 0;
    for (let index = 1; index < candidates.length; index++) {
      if (candidates[index].priority > candidates[lowestPriorityIndex].priority) lowestPriorityIndex = index;
    }
    if (candidate.priority < candidates[lowestPriorityIndex].priority) {
      candidates[lowestPriorityIndex] = candidate;
    }
  }

  function inspectGeometry(geometry, object, candidates, geometryEvidence) {
    const geometryInfo = geometrySummary(geometry);
    const owner = renderObjectSummary(object);
    for (const shape of geometryAttributeSlots(geometry)) {
      const slotKey = `${geometryInfo?.uuid || 'geometry'}|${shape.slot}`;
      const prior = lastSuccessByAttribute.get(shape.data) || lastSuccessBySlot.get(slotKey) || null;
      const identity = identify(shape.data);
      const current = { ...shape, data: undefined, identity, owner, geometry: geometryInfo, contextGeneration: generation };
      if (!prior) continue;
      const identityChanged = prior.identity !== identity;
      const kind = changeKind(prior, current, identityChanged);
      if (!kind) continue;
      retainCandidate(candidates, {
        priority: kind === 'byte-length' ? 0 : 1,
        changeKind: kind,
        slot: shape.slot,
        previous: {
          identity: prior.identity,
          attributeUuid: prior.attributeUuid,
          dataUuid: prior.dataUuid,
          owner: prior.owner,
          geometry: prior.geometry,
          arrayType: prior.arrayType,
          arrayLength: prior.arrayLength,
          byteLength: prior.byteLength,
          count: prior.count,
          version: prior.version,
          updateRange: prior.updateRange,
          interleaved: prior.interleaved,
          contextGeneration: prior.contextGeneration,
        },
        current: {
          identity,
          attributeUuid: current.attributeUuid,
          dataUuid: current.dataUuid,
          owner,
          geometry: geometryInfo,
          arrayType: current.arrayType,
          arrayLength: current.arrayLength,
          byteLength: current.byteLength,
          count: current.count,
          version: current.version,
          updateRange: current.updateRange,
          interleaved: current.interleaved,
          contextGeneration: generation,
        },
        identityChanged,
        packageGeometry: typeof geometryEvidence === 'function'
          ? geometryEvidence(geometry)
          : null,
      });
    }
  }

  function captureFailure(error, scene, contextGeneration, fallbackGeometry = null, fallbackObject = null, geometryEvidence = null) {
    if (!hasResizedBufferError(error)) return null;
    ensureGeneration(contextGeneration);
    const candidates = [];
    try {
      if (scene && typeof scene.traverse === 'function') {
        scene.traverse((object) => {
          if (object?.geometry) inspectGeometry(object.geometry, object, candidates, geometryEvidence);
        });
      }
      if (!candidates.length && fallbackGeometry) {
        inspectGeometry(fallbackGeometry, fallbackObject, candidates, geometryEvidence);
      }
    } catch (_) { /* keep the original render error and any candidates already captured */ }
    const rankedCandidates = candidates.slice().sort((left, right) => left.priority - right.priority);
    return {
      schema: 'spaceface.bufferResizeDiagnostic.v1',
      contextGeneration: generation,
      error: {
        message: String(error?.message || error).slice(0, 500),
        stack: typeof error?.stack === 'string' ? error.stack.slice(0, 3_000) : null,
      },
      candidates: rankedCandidates.map(({ priority: _priority, ...candidate }) => candidate),
      candidateCount: candidates.length,
      candidateLimit: cap,
    };
  }

  return Object.freeze({
    snapshotSuccessfulDraw,
    captureFailure,
  });
}
