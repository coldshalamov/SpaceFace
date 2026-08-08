// Context-loss cleanup for Three.js CPU resource identities.
//
// WebGLRenderer replaces its internal property/geometry/material managers when a context is
// restored. Resources rendered before the loss still retain dispose listeners from the old
// managers, however. If a later sector transition disposes one of those resources, the stale
// listener attempts to delete its old buffer/program/VAO through the restored context and Chromium
// reports INVALID_OPERATION. Function names are not provenance: release minification renames Three's
// callbacks and a foreign listener can have the same name. The renderer-generation probe records the
// exact opaque callback identities instead; context loss consumes that provenance once.

export const WEBGL_DISPOSE_LISTENER_KINDS = Object.freeze([
  'instancedMeshes',
  'geometries',
  'materials',
  'textures',
  'renderTargets',
]);

const WEBGL_DISPOSE_LISTENER_MINIMUMS = Object.freeze({
  instancedMeshes: 1,
  geometries: 1,
  // WebGLRenderer and WebGLShadowMap own distinct material-disposal callbacks.
  materials: 2,
  textures: 1,
  renderTargets: 1,
});

export function createWebGlDisposeListenerProvenance() {
  return {
    instancedMeshes: new Set(),
    geometries: new Set(),
    materials: new Set(),
    textures: new Set(),
    renderTargets: new Set(),
  };
}

export function mergeWebGlDisposeListenerProvenance(target, source) {
  const merged = target || createWebGlDisposeListenerProvenance();
  for (const kind of WEBGL_DISPOSE_LISTENER_KINDS) {
    const listeners = source?.[kind];
    if (!listeners || typeof listeners[Symbol.iterator] !== 'function') continue;
    for (const listener of listeners) {
      if (typeof listener === 'function') merged[kind].add(listener);
    }
  }
  return merged;
}

export function describeWebGlDisposeListenerProvenance(provenance) {
  const listenerCounts = {};
  const missingKinds = [];
  for (const kind of WEBGL_DISPOSE_LISTENER_KINDS) {
    const count = provenance?.[kind] instanceof Set ? provenance[kind].size : 0;
    listenerCounts[kind] = count;
    if (count < WEBGL_DISPOSE_LISTENER_MINIMUMS[kind]) missingKinds.push(kind);
  }
  return {
    complete: missingKinds.length === 0,
    missingKinds,
    listenerCounts,
  };
}

export function deferWebGlContextRestore(rebuild, enqueue = enqueueRestoreMicrotask) {
  if (typeof rebuild !== 'function') {
    throw new TypeError('deferWebGlContextRestore requires a rebuild callback');
  }
  if (typeof enqueue !== 'function') {
    throw new TypeError('deferWebGlContextRestore requires a microtask scheduler');
  }
  const receipt = {
    pending: true,
    ran: false,
    cancelled: false,
    cancel() {
      if (!receipt.pending) return false;
      receipt.pending = false;
      receipt.cancelled = true;
      return true;
    },
  };
  enqueue(() => {
    if (!receipt.pending) return;
    receipt.pending = false;
    receipt.ran = true;
    rebuild();
  });
  return receipt;
}

/**
 * The context becomes unusable before the asynchronous `webglcontextlost` event updates application
 * state. Query the live GL object at each draw boundary so that short event-delivery gap cannot feed
 * now-invalid program handles back into Three.js.
 */
export function isWebGlContextUnavailable(explicitlyLost, renderer) {
  if (explicitlyLost) return true;
  try {
    const gl = renderer && typeof renderer.getContext === 'function' ? renderer.getContext() : null;
    return !!(gl && typeof gl.isContextLost === 'function' && gl.isContextLost());
  } catch (_) {
    // A context getter/query throwing is itself proof that a draw is unsafe this frame.
    return true;
  }
}

export function collectContextLossRoots({
  scene = null,
  environment = null,
  spaceBackground = null,
  bloom = null,
  renderGraph = null,
  entities = [],
} = {}) {
  const roots = [scene, environment];
  for (const provider of [spaceBackground, bloom, renderGraph]) {
    if (!provider || typeof provider.contextLossResources !== 'function') continue;
    const resources = provider.contextLossResources();
    if (Array.isArray(resources)) roots.push(...resources);
  }
  for (const entity of entities || []) {
    if (entity?.mesh) roots.push(entity.mesh);
  }
  return roots.filter(Boolean);
}

export function detachStaleWebGlDisposeListeners(roots, provenance) {
  const seenObjects = new Set();
  const seenResources = new Set();
  const provenanceStatus = describeWebGlDisposeListenerProvenance(provenance);
  const counts = {
    objects: 0,
    instancedMeshes: 0,
    geometries: 0,
    materials: 0,
    textures: 0,
    renderTargets: 0,
    listenersDetached: 0,
    provenanceComplete: provenanceStatus.complete,
    provenanceMissingKinds: provenanceStatus.missingKinds,
    provenanceListenerCounts: provenanceStatus.listenerCounts,
  };

  const detachExactListeners = (resource, kind) => {
    const provenListeners = provenance?.[kind];
    if (!resource || !(provenListeners instanceof Set) || provenListeners.size === 0) return;
    for (const listener of provenListeners) {
      if (resource.hasEventListener?.('dispose', listener) !== true) continue;
      resource.removeEventListener('dispose', listener);
      counts.listenersDetached++;
    }
  };

  const visitResource = (resource) => {
    if (!resource || typeof resource !== 'object' || seenResources.has(resource)) return;
    seenResources.add(resource);
    if (resource.isBufferGeometry) {
      counts.geometries++;
      detachExactListeners(resource, 'geometries');
    } else if (resource.isMaterial) {
      counts.materials++;
      detachExactListeners(resource, 'materials');
    } else if (resource.isTexture) {
      counts.textures++;
      detachExactListeners(resource, 'textures');
    } else if (resource.isWebGLRenderTarget) {
      counts.renderTargets++;
      detachExactListeners(resource, 'renderTargets');
    } else return;

    if (resource.isMaterial) {
      for (const [key, value] of Object.entries(resource)) {
        if (key === '_listeners') continue;
        visitMaterialValue(value, visitResource, 0);
      }
    } else if (resource.isWebGLRenderTarget) {
      visitResource(resource.texture);
      visitResource(resource.depthTexture);
      for (const texture of resource.textures || []) visitResource(texture);
    }
  };

  const visitObject = (object) => {
    if (!object || typeof object !== 'object' || seenObjects.has(object)) return;
    seenObjects.add(object);
    counts.objects++;
    if (object.isInstancedMesh) {
      counts.instancedMeshes++;
      detachExactListeners(object, 'instancedMeshes');
    }
    visitResource(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) visitResource(material);
    visitResource(object.customDepthMaterial);
    visitResource(object.customDistanceMaterial);
    visitResource(object.skeleton?.boneTexture);
  };

  for (const root of Array.isArray(roots) ? roots : [roots]) {
    if (!root) continue;
    if (root.isBufferGeometry || root.isMaterial || root.isTexture || root.isWebGLRenderTarget) {
      visitResource(root);
      continue;
    }
    if (typeof root.traverse === 'function') root.traverse(visitObject);
    else visitObject(root);
  }
  return counts;
}

function visitMaterialValue(value, visitResource, depth) {
  if (!value || depth > 3) return;
  if (value.isTexture || value.isWebGLRenderTarget) {
    visitResource(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) visitMaterialValue(entry, visitResource, depth + 1);
    return;
  }
  // ShaderMaterial uniforms wrap textures in { value }; do not walk arbitrary Three.js objects.
  if (typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value')) {
    visitMaterialValue(value.value, visitResource, depth + 1);
  }
}

function enqueueRestoreMicrotask(callback) {
  if (typeof queueMicrotask === 'function') queueMicrotask(callback);
  else Promise.resolve().then(callback);
}
