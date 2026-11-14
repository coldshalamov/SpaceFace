import * as THREE from 'three';

// One generated steel sheet is shared by every volatile class. Class identification
// lives on the physical containment band, so a texture is not duplicated per color.
export const VOLATILE_SURFACE_URL = '/assets/ships/release/surfaces/volatile-vessel/pressure-shell.webp';

let readyTexture = null;
let loading = null;

export function getReadyVolatileSurface() {
  return readyTexture;
}

/** Decode and upload before publishing; failure leaves the original warning finish intact. */
export function preloadVolatileSurface(renderer, options = {}) {
  if (readyTexture) {
    try {
      renderer?.initTexture?.(readyTexture);
      return Promise.resolve(readyTexture);
    } catch (_) {
      return Promise.resolve(null);
    }
  }
  if (loading) return loading;
  if (typeof options.loadTexture !== 'function' && typeof document === 'undefined') return Promise.resolve(null);
  const loadTexture = options.loadTexture || ((url) => new THREE.TextureLoader().loadAsync(url));
  let decoded = null;
  loading = Promise.resolve().then(() => loadTexture(VOLATILE_SURFACE_URL)).then((texture) => {
    if (!texture) throw new Error('Volatile surface texture was not decoded');
    decoded = texture;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    renderer?.initTexture?.(texture);
    readyTexture = texture;
    return texture;
  }).catch(() => {
    decoded?.dispose?.();
    loading = null;
    return null;
  });
  return loading;
}
