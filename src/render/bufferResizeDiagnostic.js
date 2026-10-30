const DIAGNOSTIC_PROPERTY = '__sfBufferResizeDiagnostic';
const SIZE_MISMATCH = /The size of the buffer attribute's array buffer does not match the original size/i;
const MAX_MATCHES = 16;

function boundedText(value, max = 120) {
  return typeof value === 'string' ? value.slice(0, max) : null;
}

function objectSummary(object) {
  if (!object) return null;
  return {
    uuid: boundedText(object.uuid),
    name: boundedText(object.name),
    type: boundedText(object.type, 80),
  };
}

function geometrySummary(geometry) {
  if (!geometry) return null;
  const detach = geometry.userData?.spacefaceCpuDetach || null;
  return {
    uuid: boundedText(geometry.uuid),
    name: boundedText(geometry.name),
    type: boundedText(geometry.type, 80),
    hasCpuDetachManifest: !!detach,
    detach: detach ? {
      manifestId: boundedText(detach.manifestId, 100),
      contentHash: boundedText(detach.contentHash, 100),
      kind: boundedText(detach.kind, 32),
      ordinal: Number.isFinite(detach.ordinal) ? detach.ordinal : null,
    } : null,
  };
}

function attributeMatches(candidate, failingAttribute) {
  return candidate === failingAttribute || candidate?.data === failingAttribute;
}

function attributeSummary(attribute, slot, failingAttribute, detail, owner, geometry, contextGeneration, geometryEvidence) {
  const data = attribute?.isInterleavedBufferAttribute && attribute.data ? attribute.data : attribute;
  const array = data?.array;
  return {
    slot,
    owner: objectSummary(owner),
    geometry: geometrySummary(geometry),
    attribute: {
      uuid: boundedText(attribute?.uuid),
      isInterleaved: attribute?.isInterleavedBufferAttribute === true,
      itemSize: Number.isFinite(attribute?.itemSize) ? attribute.itemSize : null,
      count: Number.isFinite(attribute?.count) ? attribute.count : null,
      arrayType: boundedText(array?.constructor?.name, 80),
      arrayLength: Number.isFinite(array?.length) ? array.length : null,
      arrayByteLength: Number.isFinite(array?.byteLength) ? array.byteLength : null,
      version: Number.isFinite(data?.version) ? data.version : null,
      interleaved: attribute?.isInterleavedBufferAttribute ? {
        stride: Number.isFinite(data?.stride) ? data.stride : null,
        offset: Number.isFinite(attribute?.offset) ? attribute.offset : null,
      } : null,
    },
    failingAttributeIsSlot: attribute === failingAttribute,
    expectedByteLength: Number.isFinite(detail.expectedByteLength) ? detail.expectedByteLength : null,
    actualByteLength: Number.isFinite(detail.actualByteLength) ? detail.actualByteLength : null,
    contextGeneration,
    packageGeometry: typeof geometryEvidence === 'function' ? geometryEvidence(geometry) : null,
  };
}

export function createBufferResizeDiagnostic() {
  function captureFailure(error, scene, contextGeneration, geometryEvidence = null) {
    const detail = error?.[DIAGNOSTIC_PROPERTY];
    if (!detail || !SIZE_MISMATCH.test(String(error?.message || error || ''))) return null;

    const matches = [];
    const failingAttribute = detail.attribute;
    try {
      if (scene && typeof scene.traverse === 'function' && failingAttribute) {
        scene.traverse((object) => {
          const geometry = object?.geometry;
          if (!geometry || matches.length >= MAX_MATCHES) return;
          for (const name of ['instanceMatrix', 'instanceColor']) {
            const attribute = object[name];
            if (attributeMatches(attribute, failingAttribute)) {
              matches.push(attributeSummary(attribute, `object:${name}`, failingAttribute, detail,
                object, geometry, contextGeneration, geometryEvidence));
              if (matches.length >= MAX_MATCHES) return;
            }
          }
          for (const [name, attribute] of Object.entries(geometry.attributes || {})) {
            if (attributeMatches(attribute, failingAttribute)) {
              matches.push(attributeSummary(attribute, `attribute:${name}`, failingAttribute, detail,
                object, geometry, contextGeneration, geometryEvidence));
              if (matches.length >= MAX_MATCHES) return;
            }
          }
          if (matches.length < MAX_MATCHES && attributeMatches(geometry.index, failingAttribute)) {
            matches.push(attributeSummary(geometry.index, 'index', failingAttribute, detail,
              object, geometry, contextGeneration, geometryEvidence));
          }
        });
      }
      return {
        schema: 'spaceface.bufferResizeDiagnostic.v2',
        error: {
          message: String(error?.message || error).slice(0, 500),
          stack: typeof error?.stack === 'string' ? error.stack.slice(0, 3000) : null,
        },
        expectedByteLength: Number.isFinite(detail.expectedByteLength) ? detail.expectedByteLength : null,
        actualByteLength: Number.isFinite(detail.actualByteLength) ? detail.actualByteLength : null,
        failingAttribute: attributeSummary(failingAttribute, null, failingAttribute, detail,
          null, null, contextGeneration, null).attribute,
        contextGeneration: Number.isFinite(contextGeneration) ? contextGeneration : null,
        matchingSceneSlots: matches,
        matchingSceneSlotCount: matches.length,
      };
    } finally {
      try { delete error[DIAGNOSTIC_PROPERTY]; } catch (_) { /* keep original render error */ }
    }
  }

  return Object.freeze({ captureFailure });
}

// Temporary error-only observation. The wrapper retains only the original prototype function;
// it does not capture a renderer, scene, object, or successful draw history.
const BATCH_FAILURE_PROPERTY = '__sfBatchedMeshFailureDiagnostic';
const BATCH_HOOK_MARK = Symbol.for('spaceface.batchedFailureDiagnostic.installed');

export function installBatchedMeshFailureDiagnostic(BatchedMesh) {
  const prototype = BatchedMesh?.prototype;
  if (!prototype || prototype[BATCH_HOOK_MARK]) return false;
  const original = prototype.onBeforeRender;
  if (typeof original !== 'function') return false;
  function diagnosticOnBeforeRender(...args) {
    try { return original.apply(this, args); }
    catch (error) {
      try {
        const indirectNull = this._indirectTexture == null;
        const matricesNull = this._matricesTexture == null;
        if ((indirectNull || matricesNull) && /(?:reading|read properties of).*image/i.test(String(error?.message || ''))) {
          const parents = [];
          for (let node = this.parent; node && parents.length < 8; node = node.parent) {
            parents.push(objectSummary(node));
          }
          Object.defineProperty(error, BATCH_FAILURE_PROPERTY, { configurable: true, value: {
            object: objectSummary(this), geometry: geometrySummary(this.geometry), parents,
            indirectTextureNull: indirectNull, matricesTextureNull: matricesNull,
            colorsTextureNull: this._colorsTexture == null,
          } });
        }
      } catch (_) { /* observation must preserve the original exception */ }
      throw error;
    }
  }
  Object.defineProperty(prototype, BATCH_HOOK_MARK, { value: true });
  prototype.onBeforeRender = diagnosticOnBeforeRender;
  return true;
}

export function captureBatchedMeshFailure(error, contextGeneration) {
  const detail = error?.[BATCH_FAILURE_PROPERTY];
  if (!detail) return null;
  try {
    return { schema: 'spaceface.batchedMeshFailureDiagnostic.v1', ...detail,
      contextGeneration: Number.isFinite(contextGeneration) ? contextGeneration : null,
      error: { message: String(error?.message || error).slice(0, 500),
        stack: typeof error?.stack === 'string' ? error.stack.slice(0, 3000) : null } };
  } finally {
    try { delete error[BATCH_FAILURE_PROPERTY]; } catch (_) { /* original error is preserved */ }
  }
}
