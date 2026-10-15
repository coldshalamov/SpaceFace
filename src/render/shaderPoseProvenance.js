// Shader wrappers that preserve Three.js vertex geometry may participate in native opaque
// player-truth masks. Keep provenance on the actual function identity: userData tags are copyable.
import { Material } from 'three';

const geometryPreservingShaderHooks = new WeakSet();

/** Register a wrapper only when its captured predecessor is known to preserve the vertex pose. */
export function registerGeometryPreservingShaderHook(wrapper, previousHook) {
  if (typeof wrapper !== 'function') return false;
  if (previousHook !== Material.prototype.onBeforeCompile
      && !geometryPreservingShaderHooks.has(previousHook)) return false;
  geometryPreservingShaderHooks.add(wrapper);
  return true;
}

export function isKnownGeometryPreservingShaderHook(hook) {
  return typeof hook === 'function' && geometryPreservingShaderHooks.has(hook);
}
