function materialTextures(material, textures) {
  if (!material || typeof material !== 'object') return;
  for (const value of Object.values(material)) {
    if (value && value.isTexture) textures.add(value);
  }
  const uniforms = material.uniforms;
  if (!uniforms || typeof uniforms !== 'object') return;
  for (const uniform of Object.values(uniforms)) {
    const value = uniform && uniform.value;
    if (value && value.isTexture) textures.add(value);
  }
}

export function collectStartupTextures(subjects) {
  const textures = new Set();
  const roots = Array.isArray(subjects) ? subjects : [subjects];
  for (const root of roots) {
    if (!root || typeof root.traverse !== 'function') continue;
    root.traverse((object) => {
      const materials = Array.isArray(object.material)
        ? object.material
        : object.material ? [object.material] : [];
      for (const material of materials) materialTextures(material, textures);
    });
  }
  return [...textures];
}

export async function prepareStartupGpuResidency(renderer, subjects, options = {}) {
  if (!renderer || typeof renderer.initTexture !== 'function') {
    return { skipped: true, reason: 'initTexture unavailable', textures: 0 };
  }
  const yieldToMain = typeof options.yieldToMain === 'function'
    ? options.yieldToMain
    : yieldToBrowser;
  const onBlockingSlice = typeof options.onBlockingSlice === 'function'
    ? options.onBlockingSlice
    : null;
  const now = typeof options.now === 'function' ? options.now : clockNow;
  const textures = collectStartupTextures(subjects);
  const uploads = [];
  const count = textures.length;
  for (let index = 0; index < count; index++) {
    const texture = textures[index];
    await yieldToMain();
    const started = now();
    let success = false;
    try {
      renderer.initTexture(texture);
      success = true;
    } finally {
      const durationMs = now() - started;
      const name = texture.name || texture.source?.data?.name || 'unnamed';
      const width = Number(texture.image?.width) || Number(texture.source?.data?.width) || 0;
      const height = Number(texture.image?.height) || Number(texture.source?.data?.height) || 0;
      if (success) uploads.push({ name, width, height, durationMs });
      if (onBlockingSlice) {
        try {
          onBlockingSlice({
            kind: 'gpuResidencyUpload',
            durationMs,
            name,
            width,
            height,
            index,
            count,
            success,
          });
        } catch {
          // Observer errors must not change upload semantics.
        }
      }
    }
  }
  await yieldToMain();
  return { skipped: false, textures: textures.length, uploads };
}

export function yieldToBrowser() {
  if (globalThis.scheduler && typeof globalThis.scheduler.yield === 'function') {
    return globalThis.scheduler.yield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Wait for the next displayed frame so a texture upload cannot stack on the present rAF. */
export function yieldToNextPresent() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 16);
  });
}

function clockNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}
