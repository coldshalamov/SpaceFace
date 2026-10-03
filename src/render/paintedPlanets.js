import * as THREE from 'three';

// Root-relative URL survives esbuild chunk relocation and uses the same browser/Electron route.
export const PAINTED_PLANET_URL = '/assets/background/quiet-planets.png';
// Second 2x2 atlas, same cell layout: ember world (rocky), cyan ice giant (gas), frozen rift world (ice), dune world (rocky).
export const PAINTED_PLANET_URL_2 = '/assets/background/quiet-planets-2.png';
export const PAINTED_RING_URL = '/assets/background/quiet-ringed-planet.png';
// The generated bodies fill about 86% of each cell. Transparent gutters isolate mip filtering.
export const PAINTED_PLANET_DIAMETER = 0.86;

// Cells of the second atlas a planet type may wear, by index into `extraViews` (0 ember, 1 ice giant, 2 frozen, 3 dune).
const EXTRA_CELLS = Object.freeze({ gas: [1], ice: [2], rocky: [0, 3] });

/**
 * Eight painted planet looks from two images: four views share the first atlas and four the second, so
 * every sector's sky is no longer the same four planets. No per-planet bake or animation.
 */
export class PaintedPlanets {
  constructor(loader = new THREE.TextureLoader()) {
    this.failed = false;
    this.disposed = false;
    this.ready = false;
    this.views = [];
    this.extraViews = [];
    let remaining = 2;
    const onLoad = (atlas) => {
      if (this.disposed) return;
      this.ready = --remaining === 0;
      if (atlas) for (const view of this.views) view.needsUpdate = true;
    };
    const onError = (error) => {
      if (this.disposed) return;
      this.failed = true;
      console.error('[background] Painted planet atlas failed; using baked planets.', error);
    };
    this.texture = loader.load(PAINTED_PLANET_URL, () => onLoad(true), undefined, onError);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const makeViews = (atlas, into, name) => {
      for (let i = 0; i < 4; i++) {
        // Texture.clone() marks an empty source for GPU upload before decode. Build the UV view
        // without that side effect so opening resource admission sees only ready image data.
        const view = new THREE.Texture();
        view.source = atlas.source;
        view.colorSpace = THREE.SRGBColorSpace;
        view.name = `${name}_${i}`;
        view.repeat.set(0.5, 0.5);
        view.offset.set((i % 2) * 0.5, i < 2 ? 0.5 : 0);
        view.userData.paintedPlanet = true;
        view.userData.paintedPlanetDiameter = PAINTED_PLANET_DIAMETER;
        into.push(view);
      }
    };
    makeViews(this.texture, this.views, 'QuietSky_Planet');
    this.ringTexture = loader.load(PAINTED_RING_URL, () => onLoad(false), undefined, onError);
    this.ringTexture.colorSpace = THREE.SRGBColorSpace;
    this.ringTexture.userData.paintedPlanet = true;
    this.ringTexture.userData.paintedPlanetDiameter = 0.445;
    // The second atlas loads after the first pair and is not part of `ready`: the first four looks are a
    // complete sky on their own. A load failure uses the same reported bake fallback as the first atlas, so
    // a planet that picked a second-atlas cell can never be left blank.
    this.extraTexture = loader.load(PAINTED_PLANET_URL_2, () => {
      if (this.disposed) return;
      for (const view of this.extraViews) view.needsUpdate = true;
    }, undefined, onError);
    this.extraTexture.colorSpace = THREE.SRGBColorSpace;
    makeViews(this.extraTexture, this.extraViews, 'QuietSky_PlanetB');
  }

  get(spec) {
    if (this.failed || this.disposed) return null;
    if (spec.ring) return this.ringTexture;
    const base = spec.type === 'gas' ? 1 : spec.type === 'ice' ? 2 : (spec.seed & 1) ? 3 : 0;
    const extras = EXTRA_CELLS[spec.type] || EXTRA_CELLS.rocky;
    // Seed bit 0 already picks the rocky base cell, so the look is chosen from the bits above it.
    const k = (spec.seed >>> 1) % (1 + extras.length);
    return k === 0 ? this.views[base] : this.extraViews[extras[k - 1]];
  }

  dispose() {
    this.disposed = true;
    for (const view of this.views) view.dispose();
    for (const view of this.extraViews) view.dispose();
    this.texture.dispose();
    this.extraTexture.dispose();
    this.ringTexture.dispose();
  }
}
