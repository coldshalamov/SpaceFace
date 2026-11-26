import * as THREE from 'three';
import { acquireSharedKtx2Loader, releaseSharedKtx2Loader } from './assetLoader.js';

// Root-relative URL survives esbuild chunk relocation and uses the same browser/Electron route.
export const PAINTED_PLANET_URL = '/assets/background/quiet-planets.png';
// Second 2x2 atlas, same cell layout: ember world (rocky), cyan ice giant (gas), frozen rift world (ice), dune world (rocky).
export const PAINTED_PLANET_URL_2 = '/assets/background/quiet-planets-2.png';
export const PAINTED_RING_URL = '/assets/background/quiet-ringed-planet.png';
// A second, clearly different ringed giant (rust-orange bands, a thin double ring tilted the other way).
export const PAINTED_RING_URL_2 = '/assets/background/quiet-ringed-planet-2.png';
// The generated bodies fill about 86% of each cell. Transparent gutters isolate mip filtering.
export const PAINTED_PLANET_DIAMETER = 0.86;
// DUST P3: on the ringed images the BODY disc and the RING SYSTEM are different fractions of the
// image, and paintedPlanetDiameter has always carried the SYSTEM fraction (0.445/0.474 — it sizes
// the sprite quad). The terminator needs the BODY diameter (~0.88 of the image, the disc out to
// where the measured coverage falls off). Using the system fraction there — as the first P3a
// increment did — shaded only the inner half of ringed bodies, leaving an unlit outer annulus:
// exactly the look gate's "ringed gas giant uniformly lit". paintedBodyDiameter is the body disc;
// atlas views need no override (their bodies fill the cell).
export const PAINTED_RING_BODY_DIAMETER = 0.885;
export const PAINTED_RING_BODY_DIAMETER_2 = 0.88;

// Cells of the second atlas a planet type may wear, by index into `extraViews` (0 ember, 1 ice giant, 2 frozen, 3 dune).
const EXTRA_CELLS = Object.freeze({ gas: [1], ice: [2], rocky: [0, 3] });

/**
 * Eight painted planet looks from two images: four views share the first atlas and four the second, so
 * every sector's sky is no longer the same four planets. No per-planet bake or animation.
 */
export class PaintedPlanets {
  /**
   * @param {object} [loader]        a THREE.TextureLoader (or anything with .load); the default
   *                                 also races each atlas through its sibling `url.ktx2`.
   * @param {object} [options]
   * @param {object} [options.renderer]  WebGLRenderer, used to arm the shared KTX2 transcoder.
   */
  constructor(loader = null, options = {}) {
    this.failed = false;
    this.disposed = false;
    this.ready = false;
    this.views = [];
    this.extraViews = [];
    this.texture = null;
    this.extraTexture = null;
    this.ringTexture = null;
    this.ringTexture2 = null;
    const rasterLoader = loader || new THREE.TextureLoader();
    // KTX2-first applies only on the default load path: injected loaders (tests) keep their
    // synchronous TextureLoader-shaped contract untouched.
    this._ktx2 = null;
    const ktx2Ready = loader
      ? Promise.resolve(null)
      : acquireSharedKtx2Loader(options.renderer || null).then((l) => { this._ktx2 = l; return l; });
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
    const makeViews = (atlas, into, name) => {
      const ViewType = atlas.isCompressedTexture ? THREE.CompressedTexture : THREE.Texture;
      for (let i = 0; i < 4; i++) {
        // Texture.clone() marks an empty source for GPU upload before decode. Build the UV view
        // without that side effect so opening resource admission sees only ready image data.
        const view = new ViewType();
        view.source = atlas.source;
        // Compressed textures carry pixels in `mipmaps`, not `source.data` — share both so a
        // KTX2 atlas view uploads real levels instead of an empty, incomplete texture.
        if (atlas.isCompressedTexture) view.mipmaps = atlas.mipmaps;
        view.format = atlas.format;
        view.colorSpace = THREE.SRGBColorSpace;
        view.name = `${name}_${i}`;
        view.repeat.set(0.5, 0.5);
        view.offset.set((i % 2) * 0.5, i < 2 ? 0.5 : 0);
        view.userData.paintedPlanet = true;
        view.userData.paintedPlanetDiameter = PAINTED_PLANET_DIAMETER;
        into.push(view);
      }
    };
    // Fetch one atlas KTX2-first, raster fallback; `adopt` runs as soon as the texture object
    // exists, `done` once its pixels are decoded (or immediately for an already-full KTX2).
    const loadAtlas = (url, adopt, done) => {
      const adoptRaster = () => {
        if (this.disposed) return;
        adopt(rasterLoader.load(url, () => { if (!this.disposed) done(); }, undefined, onError));
      };
      // An injected loader keeps the constructor's original synchronous adopt so callers and
      // tests that read the atlas right after `new` see the same object graph as before.
      if (loader) { adoptRaster(); return; }
      ktx2Ready.then((ktx2) => {
        if (this.disposed) return;
        if (!ktx2) { adoptRaster(); return; }
        try {
          ktx2.load(`${url}.ktx2`, (texture) => {
            if (this.disposed) { texture?.dispose?.(); return; }
            adopt(texture);
            done();
          }, undefined, adoptRaster);
        } catch {
          adoptRaster();
        }
      }, adoptRaster);
    };
    loadAtlas(PAINTED_PLANET_URL, (atlas) => {
      this.texture = atlas;
      atlas.colorSpace = THREE.SRGBColorSpace;
      makeViews(atlas, this.views, 'QuietSky_Planet');
      if (atlas.isCompressedTexture) for (const view of this.views) view.needsUpdate = true;
    }, () => onLoad(true));
    loadAtlas(PAINTED_RING_URL, (atlas) => {
      this.ringTexture = atlas;
      atlas.colorSpace = THREE.SRGBColorSpace;
      atlas.userData.paintedPlanet = true;
      atlas.userData.paintedPlanetDiameter = 0.445;
      atlas.userData.paintedBodyDiameter = PAINTED_RING_BODY_DIAMETER;
    }, () => onLoad(false));
    // The second atlas loads after the first pair and is not part of `ready`: the first four looks are a
    // complete sky on their own. A load failure uses the same reported bake fallback as the first atlas, so
    // a planet that picked a second-atlas cell can never be left blank.
    loadAtlas(PAINTED_PLANET_URL_2, (atlas) => {
      this.extraTexture = atlas;
      atlas.colorSpace = THREE.SRGBColorSpace;
      makeViews(atlas, this.extraViews, 'QuietSky_PlanetB');
    }, () => {
      for (const view of this.extraViews) view.needsUpdate = true;
    });
    loadAtlas(PAINTED_RING_URL_2, (atlas) => {
      this.ringTexture2 = atlas;
      atlas.colorSpace = THREE.SRGBColorSpace;
      atlas.userData.paintedPlanet = true;
      atlas.userData.paintedPlanetDiameter = 0.474;
      atlas.userData.paintedBodyDiameter = PAINTED_RING_BODY_DIAMETER_2;
    }, () => {});
  }

  get(spec) {
    if (this.failed || this.disposed) return null;
    // Seed bit 1 picks between the two painted ringed giants.
    if (spec.ring) return ((spec.seed >>> 1) & 1) ? this.ringTexture2 : this.ringTexture;
    const base = spec.type === 'gas' ? 1 : spec.type === 'ice' ? 2 : (spec.seed & 1) ? 3 : 0;
    const extras = EXTRA_CELLS[spec.type] || EXTRA_CELLS.rocky;
    // Seed bit 0 already picks the rocky base cell, so the look is chosen from the bits above it.
    const k = (spec.seed >>> 1) % (1 + extras.length);
    return k === 0 ? this.views[base] : this.extraViews[extras[k - 1]];
  }

  // Atlas views retain the source identity but are themselves disposable Texture wrappers. Keep
  // every owned wrapper and atlas in the exact loss root set, including views that are not visible
  // in the current sky selection.
  contextLossResources() {
    return [
      this.texture,
      this.extraTexture,
      this.ringTexture,
      this.ringTexture2,
      ...this.views,
      ...this.extraViews,
    ].filter(Boolean);
  }

  dispose() {
    this.disposed = true;
    for (const view of this.views) view.dispose();
    for (const view of this.extraViews) view.dispose();
    this.texture?.dispose();
    this.extraTexture?.dispose();
    this.ringTexture?.dispose();
    this.ringTexture2?.dispose();
    if (this._ktx2) releaseSharedKtx2Loader(this._ktx2);
    this._ktx2 = null;
  }
}
