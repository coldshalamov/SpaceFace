// Material.copy() copies userData but not instance-assigned onBeforeCompile /
// customProgramCacheKey, so an authored shader patch would be dropped while its
// userData receipt survived — leaving a flag that lies and a cache key that no
// longer matches the source it was compiled from.
// Exported for the regression test that pins the clone contract.
function projectTextureUserData(value, path, textureRefs, visiting) {
  if (!value || typeof value !== 'object') return value;
  if (value.isTexture === true) {
    textureRefs.push({ path, texture: value });
    // Material.copy JSON-clones userData. A texture in that graph serializes its image (which can
    // synchronously call canvas.toDataURL); restore the exact shared texture reference afterward.
    return null;
  }
  if (visiting.has(value)) return value;
  const array = Array.isArray(value);
  if (!array) {
    const prototype = Object.getPrototypeOf(value);
    if ((prototype !== Object.prototype && prototype !== null) || typeof value.toJSON === 'function') return value;
  }

  visiting.add(value);
  try {
    let changed = false;
    if (array) {
      const projected = new Array(value.length);
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        const next = projectTextureUserData(item, [...path, i], textureRefs, visiting);
        projected[i] = next;
        if (next !== item) changed = true;
      }
      return changed ? projected : value;
    }

    const projected = {};
    for (const [key, item] of Object.entries(value)) {
      const next = projectTextureUserData(item, [...path, key], textureRefs, visiting);
      projected[key] = next;
      if (next !== item) changed = true;
    }
    return changed ? projected : value;
  } finally {
    visiting.delete(value);
  }
}

function restoreTextureUserData(userData, textureRefs) {
  for (const { path, texture } of textureRefs) {
    if (path.length === 0) return texture;
    let parent = userData;
    for (let i = 0; i < path.length - 1; i++) parent = parent?.[path[i]];
    if (parent != null) parent[path[path.length - 1]] = texture;
  }
  return userData;
}

export function cloneMaterialPreservingShaderHooks(base) {
  const textureRefs = [];
  const projectedUserData = projectTextureUserData(base.userData, [], textureRefs, new Set());
  // Material.clone delegates to Material.copy, whose JSON deep-copy of userData is otherwise
  // retained. A read-only proxy lets that copy see the texture-free projection without mutating
  // the live authored material, including during async presentation preparation.
  const cloneSource = textureRefs.length > 0
    ? new Proxy(base, {
      get(target, property, receiver) {
        return property === 'userData' ? projectedUserData : Reflect.get(target, property, receiver);
      },
    })
    : base;
  const clone = base.clone.call(cloneSource);
  if (textureRefs.length > 0) clone.userData = restoreTextureUserData(clone.userData, textureRefs);
  if (Object.hasOwn(base, 'onBeforeCompile')) clone.onBeforeCompile = base.onBeforeCompile;
  if (Object.hasOwn(base, 'customProgramCacheKey')) clone.customProgramCacheKey = base.customProgramCacheKey;
  clone.needsUpdate = true;
  return clone;
}
