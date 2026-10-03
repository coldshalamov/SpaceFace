import * as THREE from 'three';

// Generated, seamless surface maps for the two creature-like bodies that were flat-coloured primitives: the
// alien fauna (faunaVisuals.js `tissueMat`, every species body) and the Verge-Layer machines
// (machineVisuals.js `metalMat`, pale nacre plating). Each is a 512 px albedo plus a normal map derived from
// it; the strain / palette colour still tints the albedo. Source images, review and finishing live in
// tools/art/imagegen_variants.py + tools/art/finish_generated.py; provenance in the manifest beside them.
const ROOT = '/assets/ships/release/surfaces/creature-skins/';

export const CREATURE_SKIN_ASSETS = Object.freeze({
  tissue: Object.freeze({ baseColor: `${ROOT}tissue_basecolor.jpg`, normal: `${ROOT}tissue_normal.png` }),
  nacre: Object.freeze({ baseColor: `${ROOT}nacre_basecolor.jpg`, normal: `${ROOT}nacre_normal.png` }),
});

// Fauna bodies are stretched spheres (u wraps once around, v runs pole to pole), machines are boxes and
// cylinders (one 0..1 UV span per face): integer repeats keep every wrap seam invisible.
export const CREATURE_SKIN_REPEAT = Object.freeze({ tissue: [3, 2], nacre: [2, 2] });

let readySkins = null;
let readyPromise = null;

/**
 * Decode and GPU-warm both skins. Failure is not fatal: the library publishes nothing, resolves null, and
 * creatures and machines keep the flat colours they always had.
 */
export function preloadCreatureSkinLibrary(renderer, options = {}) {
  if (readySkins) return Promise.resolve(readySkins);
  if (readyPromise) return readyPromise;
  const loadTexture = typeof options.loadTexture === 'function'
    ? options.loadTexture
    : (url) => new THREE.TextureLoader().loadAsync(url);
  const jobs = [];
  for (const [skin, files] of Object.entries(CREATURE_SKIN_ASSETS)) {
    for (const [slot, url] of Object.entries(files)) jobs.push({ skin, slot, url });
  }
  readyPromise = Promise.all(jobs.map((job) => loadTexture(job.url))).then((textures) => {
    const skins = {};
    jobs.forEach((job, index) => {
      const texture = textures[index];
      texture.colorSpace = job.slot === 'baseColor' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(CREATURE_SKIN_REPEAT[job.skin][0], CREATURE_SKIN_REPEAT[job.skin][1]);
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = 4;
      texture.userData = { ...(texture.userData || {}), spacefaceSurfaceRole: `creature-skin-${job.skin}-${job.slot}` };
      texture.needsUpdate = true;
      (skins[job.skin] || (skins[job.skin] = {}))[job.slot] = texture;
      if (renderer && typeof renderer.initTexture === 'function') renderer.initTexture(texture);
    });
    for (const skin of Object.keys(skins)) Object.freeze(skins[skin]);
    readySkins = Object.freeze(skins);
    return readySkins;
  }).catch((error) => {
    readySkins = null;
    readyPromise = null;
    if (typeof console !== 'undefined') console.warn('[creatures] Skin textures failed; using flat colours.', error);
    return null;
  });
  return readyPromise;
}

export function getReadyCreatureSkins() {
  return readySkins;
}

/** The decoded skin ('tissue' | 'nacre'), else null until the library has published. */
export function creatureSkin(name) {
  return (readySkins && readySkins[name]) || null;
}
