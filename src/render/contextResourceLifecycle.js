// Context-loss cleanup for Three.js CPU resource identities.
//
// WebGLRenderer replaces its internal property/geometry/material managers when a context is
// restored. Resources rendered before the loss still retain dispose listeners from the old
// managers, however. If a later sector transition disposes one of those resources, the stale
// listener attempts to delete its old buffer/program/VAO through the restored context and Chromium
// reports INVALID_OPERATION. Detach only Three's renderer-owned dispose listeners while the old
// context is lost; the restored renderer reattaches fresh listeners when each resource is used.

const THREE_GPU_DISPOSE_LISTENER_NAMES = Object.freeze(new Set([
  'onGeometryDispose',
  'onMaterialDispose',
  'onTextureDispose',
  'onRenderTargetDispose',
]));

export function detachStaleWebGlDisposeListeners(roots) {
  const seenObjects = new Set();
  const seenResources = new Set();
  const counts = {
    objects: 0,
    geometries: 0,
    materials: 0,
    textures: 0,
    renderTargets: 0,
    listenersDetached: 0,
  };

  const visitResource = (resource) => {
    if (!resource || typeof resource !== 'object' || seenResources.has(resource)) return;
    seenResources.add(resource);
    if (resource.isBufferGeometry) counts.geometries++;
    else if (resource.isMaterial) counts.materials++;
    else if (resource.isTexture) counts.textures++;
    else if (resource.isWebGLRenderTarget) counts.renderTargets++;
    else return;

    const listeners = Array.isArray(resource._listeners?.dispose)
      ? resource._listeners.dispose.slice()
      : [];
    for (const listener of listeners) {
      if (!THREE_GPU_DISPOSE_LISTENER_NAMES.has(listener?.name)) continue;
      resource.removeEventListener?.('dispose', listener);
      counts.listenersDetached++;
    }

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
