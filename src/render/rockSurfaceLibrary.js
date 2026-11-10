import * as THREE from 'three';

export const ROCK_SURFACE_ASSETS = Object.freeze({
  baseColor: '/assets/ships/release/surfaces/common-rock/rock_basecolor.png',
  normal: '/assets/ships/release/surfaces/common-rock/rock_normal.png',
  orm: '/assets/ships/release/surfaces/common-rock/rock_orm.png',
});
export const ROCK_SURFACE_TEXTURE_REPEAT = 1.65;

/**
 * Per-variant surface response for the five common-rock instance variants. The displacement
 * variants already re-seat the same maps via COMMON_ROCK_UV_TRANSFORMS; without a per-variant
 * material answer every pooled rock still reads as one texture painted five times. `tint`
 * multiplies the material color (ast_common_rock is white, so it is a straight modulation of
 * the shared baseColor map); `roughness`, `aoIntensity`, and `normalScale` retune how each
 * variant answers the shared packed ORM + normal maps — ferric warmth, dusty matte, fresh
 * fracture sheen — without cloning textures or touching the pool or the mesh.
 */
export const ROCK_SURFACE_VARIANTS = Object.freeze([
  Object.freeze({ tint: [0.90, 0.88, 0.84], roughness: 1.0, aoIntensity: 0.78, normalScale: 0.72 }),
  Object.freeze({ tint: [0.70, 0.72, 0.74], roughness: 1.06, aoIntensity: 0.86, normalScale: 0.62 }),
  Object.freeze({ tint: [0.74, 0.58, 0.46], roughness: 0.92, aoIntensity: 0.74, normalScale: 0.78 }),
  Object.freeze({ tint: [0.84, 0.82, 0.78], roughness: 0.85, aoIntensity: 0.7, normalScale: 0.82 }),
  Object.freeze({ tint: [0.58, 0.56, 0.54], roughness: 1.12, aoIntensity: 0.92, normalScale: 0.58 }),
]);

export function rockSurfaceVariantSpec(variantIdx) {
  const idx = Math.abs(Math.trunc(Number(variantIdx) || 0)) % ROCK_SURFACE_VARIANTS.length;
  return ROCK_SURFACE_VARIANTS[idx];
}

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

/**
 * Join the preload already started by the renderer without creating a second loader. Global shader
 * admission uses this boundary so its common-rock probe receives the same final texture-slot layout
 * that streamed asteroids publish. Tests and hosts that have not started the library remain a no-op.
 */
export function waitForRockSurfaceLibraryReady() {
  if (readyTextures) return Promise.resolve(readyTextures);
  return readyPromise || Promise.resolve(null);
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
