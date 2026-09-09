import * as THREE from 'three';

// Root-relative URL survives esbuild chunk relocation and uses the same browser/Electron route.
export const PAINTED_PLANET_URL = '/assets/background/quiet-planets.png';
export const PAINTED_RING_URL = '/assets/background/quiet-ringed-planet.png';
// The generated bodies fill about 86% of each cell. Transparent gutters isolate mip filtering.
export const PAINTED_PLANET_DIAMETER = 0.86;

/** Four views share one image/source and GPU allocation; no per-planet bake or animation. */
export class PaintedPlanets {
  constructor(loader = new THREE.TextureLoader()) {
    this.failed = false;
    this.disposed = false;
    this.ready = false;
    this.views = [];
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
    for (let i = 0; i < 4; i++) {
      // Texture.clone() marks an empty source for GPU upload before decode. Build the UV view
      // without that side effect so opening resource admission sees only ready image data.
      const view = new THREE.Texture();
      view.source = this.texture.source;
      view.colorSpace = THREE.SRGBColorSpace;
      view.name = `QuietSky_Planet_${i}`;
      view.repeat.set(0.5, 0.5);
      view.offset.set((i % 2) * 0.5, i < 2 ? 0.5 : 0);
      view.userData.paintedPlanet = true;
      view.userData.paintedPlanetDiameter = PAINTED_PLANET_DIAMETER;
      this.views.push(view);
    }
    this.ringTexture = loader.load(PAINTED_RING_URL, () => onLoad(false), undefined, onError);
    this.ringTexture.colorSpace = THREE.SRGBColorSpace;
    this.ringTexture.userData.paintedPlanet = true;
    this.ringTexture.userData.paintedPlanetDiameter = 0.445;
  }

  get(spec) {
    if (this.failed || this.disposed) return null;
    if (spec.ring) return this.ringTexture;
    const cell = spec.type === 'gas' ? 1 : spec.type === 'ice' ? 2 : (spec.seed & 1) ? 3 : 0;
    return this.views[cell];
  }

  dispose() {
    this.disposed = true;
    for (const view of this.views) view.dispose();
    this.texture.dispose();
    this.ringTexture.dispose();
  }
}
