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
  const textures = collectStartupTextures(subjects);
  const uploads = [];
  for (const texture of textures) {
    await yieldToMain();
    const started = clockNow();
    renderer.initTexture(texture);
    uploads.push({
      name: texture.name || texture.source?.data?.name || 'unnamed',
      width: Number(texture.image?.width) || Number(texture.source?.data?.width) || 0,
      height: Number(texture.image?.height) || Number(texture.source?.data?.height) || 0,
      durationMs: clockNow() - started,
    });
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

function clockNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}
