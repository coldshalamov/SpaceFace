import * as THREE from 'three';

// Terrain / cloud detail for the colossal planet-site bodies (planetSiteVisual.js). The body's colour still comes from
// the authored PLANET_COLORS bake, which is a smooth 1024 x 512 map stretched over hundreds of world units and so reads
// as soft blobs at the chase camera. Each tile here is a generated, seamless, neutral-grey relief multiplier (mean 0.5):
// the bake keeps the palette, the tile adds craters, dunes, ice plates, lava cracks, coasts or cloud filaments.
// Source images, review and finishing live in tools/art/imagegen_variants.py + finish_generated.py (`detail`);
// provenance in the manifest beside the files.
const ROOT = '/assets/ships/release/surfaces/planet-detail/';

export const PLANET_DETAIL_ASSETS = Object.freeze({
  rock: `${ROOT}rock.jpg`,
  dune: `${ROOT}dune.jpg`,
  ice: `${ROOT}ice.jpg`,
  lava: `${ROOT}lava.jpg`,
  terrain: `${ROOT}terrain.jpg`,
  cloud: `${ROOT}cloud.jpg`,
});

/** planet type (PLANET_COLORS key) -> which tile it wears. */
export const PLANET_DETAIL_BY_TYPE = Object.freeze({
  terran: 'terrain',
  oceanic: 'cloud',
  gas_giant: 'cloud',
  arid: 'dune',
  rocky: 'rock',
  ice: 'ice',
  lava: 'lava',
  dead: 'rock',
  scorched: 'rock',
});

/** World units one tile covers: cloud features are broad, dunes and cracks are fine. */
export const PLANET_DETAIL_TILE_WU = Object.freeze({
  rock: 190, dune: 90, ice: 110, lava: 260, terrain: 150, cloud: 190,
});

/** How strongly the tile modulates the bake (0 = none, 1 = full multiply). */
export const PLANET_DETAIL_AMOUNT = Object.freeze({
  rock: 0.7, dune: 0.8, ice: 0.8, lava: 0.7, terrain: 0.8, cloud: 0.7,
});

let readyTextures = null;
let readyPromise = null;

/**
 * Decode every tile and warm it on the GPU. Failure is not fatal: nothing is published, the promise resolves null and
 * every planet keeps the plain baked surface it always had.
 */
export function preloadPlanetDetailLibrary(renderer, options = {}) {
  if (readyTextures) return Promise.resolve(readyTextures);
  if (readyPromise) return readyPromise;
  const loadTexture = typeof options.loadTexture === 'function'
    ? options.loadTexture
    : (url) => new THREE.TextureLoader().loadAsync(url);
  const entries = Object.entries(PLANET_DETAIL_ASSETS);
  readyPromise = Promise.all(entries.map(([, url]) => loadTexture(url))).then((textures) => {
    const out = {};
    entries.forEach(([name], index) => {
      const texture = textures[index];
      // A relief multiplier is data, not colour: sampled linear so 0.5 grey is exactly a x1.0 multiplier.
      texture.colorSpace = THREE.NoColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = 8; // the limb sweeps past at a grazing angle; without this the detail shimmers
      texture.userData = { ...(texture.userData || {}), spacefaceSurfaceRole: `planet-detail-${name}` };
      texture.needsUpdate = true;
      out[name] = texture;
      if (renderer && typeof renderer.initTexture === 'function') renderer.initTexture(texture);
    });
    readyTextures = Object.freeze(out);
    return readyTextures;
  }).catch((error) => {
    readyTextures = null;
    readyPromise = null;
    if (typeof console !== 'undefined') console.warn('[planets] Detail tiles failed; using the plain baked surface.', error);
    return null;
  });
  return readyPromise;
}

export function getReadyPlanetDetail() {
  return readyTextures;
}

/** Resolves with the decoded set (or null on failure); resolves null at once if nothing has started loading. */
export function whenPlanetDetailReady() {
  return readyTextures ? Promise.resolve(readyTextures) : (readyPromise || Promise.resolve(null));
}

/** The tile a planet type wears, or null until the library has published. */
export function planetDetailFor(planetType) {
  const name = PLANET_DETAIL_BY_TYPE[planetType] || 'rock';
  return (readyTextures && readyTextures[name]) || null;
}

/** Tile name + scale + amount for a planet of this type and world radius. */
export function planetDetailParams(planetType, radiusWu) {
  const name = PLANET_DETAIL_BY_TYPE[planetType] || 'rock';
  const tile = PLANET_DETAIL_TILE_WU[name];
  return { name, scale: Math.max(1, Math.round(radiusWu / tile)), amount: PLANET_DETAIL_AMOUNT[name] };
}
