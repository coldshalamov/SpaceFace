import * as THREE from 'three';

export const ROCK_SURFACE_ASSETS = Object.freeze({
  baseColor: '/assets/ships/release/surfaces/common-rock/rock_basecolor.png',
  normal: '/assets/ships/release/surfaces/common-rock/rock_normal.png',
  orm: '/assets/ships/release/surfaces/common-rock/rock_orm.png',
});
export const ROCK_SURFACE_TEXTURE_REPEAT = 1.65;

const TEXTURE_ROLES = Object.freeze({
  baseColor: 'micro-base-color',
  normal: 'micro-regolith-normal',
  orm: 'micro-packed-orm',
});

let readyTextures = null;
let readyPromise = null;

/**
 * Decode the shared common-rock maps before flight admission. The visual factory reads only the
 * resolved set, so a live asteroid never publishes a flat/clay material and swaps texture identity
 * a few frames later.
 */
export function preloadRockSurfaceLibrary(renderer, options = {}) {
  if (readyTextures) return Promise.resolve(readyTextures);
  if (readyPromise) return readyPromise;
  const loadTexture = typeof options.loadTexture === 'function'
    ? options.loadTexture
    : (url) => new THREE.TextureLoader().loadAsync(url);
  readyPromise = Promise.all([
    loadTexture(ROCK_SURFACE_ASSETS.baseColor),
    loadTexture(ROCK_SURFACE_ASSETS.normal),
    loadTexture(ROCK_SURFACE_ASSETS.orm),
  ]).then(([baseColor, normal, orm]) => {
    configureSurfaceTexture(baseColor, { color: true, role: TEXTURE_ROLES.baseColor });
    configureSurfaceTexture(normal, { role: TEXTURE_ROLES.normal });
    configureSurfaceTexture(orm, { role: TEXTURE_ROLES.orm });
    // The packed ORM map serves AO, roughness, and metalness from one sampled texture. Common-rock
    // geometry uses TEXCOORD_0 for every role, matching the promoted Rock A contract.
    orm.channel = 0;
    const textures = Object.freeze({ baseColor, normal, orm });
    if (renderer && typeof renderer.initTexture === 'function') {
      renderer.initTexture(baseColor);
      renderer.initTexture(normal);
      renderer.initTexture(orm);
    }
    // Publication is the commit point: decoded maps are not observable as ready until every
    // required GPU initialization has completed without throwing.
    readyTextures = textures;
    return textures;
  }).catch((error) => {
    readyTextures = null;
    readyPromise = null;
    throw error;
  });
  return readyPromise;
}

export function getReadyRockSurfaceTextures() {
  return readyTextures;
}

function configureSurfaceTexture(texture, { color = false, role = 'surface-data' } = {}) {
  if (!texture) return;
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(ROCK_SURFACE_TEXTURE_REPEAT, ROCK_SURFACE_TEXTURE_REPEAT);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.userData = {
    ...(texture.userData || {}),
    spacefaceSurfaceRole: role,
    spacefaceTextureScale: 'common-rock-micro-1.65x+per-variant-uv',
  };
  texture.needsUpdate = true;
}
