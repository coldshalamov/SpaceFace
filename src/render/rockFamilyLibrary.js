import * as THREE from 'three';

// Surface families for the asteroid types that used to be flat-tinted bare spheres: metallic,
// crystalline and exotic rocks. Each family is a generated, seamless 512 px albedo (plus a normal map
// derived from it, and for the two luminous families a glow map keyed from the albedo so only the
// crystals / veins glow instead of the whole rock). Source images, review and finishing live in
// tools/art/imagegen_variants.py + tools/art/finish_generated.py; provenance in the manifest beside them.
//
// Common rock keeps its own packed-ORM library (rockSurfaceLibrary.js); ice stays transmissive glass and the
// gas cloud stays a translucent hull, so neither has a family.
const ROOT = '/assets/ships/release/surfaces/asteroid-families/';

export const ROCK_FAMILY_ASSETS = Object.freeze({
  metal: Object.freeze({ baseColor: `${ROOT}metal_basecolor.jpg`, normal: `${ROOT}metal_normal.png` }),
  crystal: Object.freeze({
    baseColor: `${ROOT}crystal_basecolor.jpg`, normal: `${ROOT}crystal_normal.png`, emissive: `${ROOT}crystal_emissive.jpg`,
  }),
  exotic: Object.freeze({
    baseColor: `${ROOT}exotic_basecolor.jpg`, normal: `${ROOT}exotic_normal.png`, emissive: `${ROOT}exotic_emissive.jpg`,
  }),
});

// The icosphere's UVs wrap once around (u) and once pole to pole (v), so u repeats twice as often to keep
// texels square; an integer u repeat keeps the wrap seam invisible because the tile itself is seamless.
export const ROCK_FAMILY_REPEAT = Object.freeze([4, 2]);

// How much of the type's authored colour tints the texture (0 = texture only, 1 = the old flat colour).
export const ROCK_FAMILY_TINT_MIX = Object.freeze({ metal: 0.35, crystal: 0.2, exotic: 0.12 });

// Glow-map strength: the keyed map is mostly black, so the old flat emissive intensity is lifted to keep
// the crystals and veins reading at the gameplay camera.
export const ROCK_FAMILY_EMISSIVE_LIFT = 3.2;

let readyFamilies = null;
let readyPromise = null;

function configure(texture, { color = false, role }) {
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(ROCK_FAMILY_REPEAT[0], ROCK_FAMILY_REPEAT[1]);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.userData = { ...(texture.userData || {}), spacefaceSurfaceRole: role };
  texture.needsUpdate = true;
  return texture;
}

/**
 * Decode every family map and warm it on the GPU. Failure is NOT fatal: the library publishes nothing,
 * resolves to null, and every family type keeps the plain tinted material it always had.
 */
export function preloadRockFamilyLibrary(renderer, options = {}) {
  if (readyFamilies) return Promise.resolve(readyFamilies);
  if (readyPromise) return readyPromise;
  const loadTexture = typeof options.loadTexture === 'function'
    ? options.loadTexture
    : (url) => new THREE.TextureLoader().loadAsync(url);
  const jobs = [];
  for (const [family, files] of Object.entries(ROCK_FAMILY_ASSETS)) {
    for (const [slot, url] of Object.entries(files)) jobs.push({ family, slot, url });
  }
  readyPromise = Promise.all(jobs.map((job) => loadTexture(job.url))).then((textures) => {
    const families = {};
    jobs.forEach((job, index) => {
      const texture = configure(textures[index], {
        color: job.slot !== 'normal',
        role: `asteroid-family-${job.family}-${job.slot}`,
      });
      (families[job.family] || (families[job.family] = {}))[job.slot] = texture;
      if (renderer && typeof renderer.initTexture === 'function') renderer.initTexture(texture);
    });
    for (const family of Object.keys(families)) Object.freeze(families[family]);
    readyFamilies = Object.freeze(families);
    return readyFamilies;
  }).catch((error) => {
    readyFamilies = null;
    readyPromise = null;
    if (typeof console !== 'undefined') console.warn('[rocks] Asteroid family textures failed; using flat tinted rocks.', error);
    return null;
  });
  return readyPromise;
}

export function getReadyRockFamilies() {
  return readyFamilies;
}

/** The decoded family for an asteroid def's `variant` ('metal' | 'crystal' | 'exotic'), else null. */
export function rockFamilyFor(variant) {
  return (readyFamilies && readyFamilies[variant]) || null;
}
