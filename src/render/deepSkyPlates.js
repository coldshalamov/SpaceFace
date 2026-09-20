// Regional far-sky plates: the registry, and the bounded residency that loads them.
//
// A plate is one authored painted sky for one region, baked offline by
// tools/art/bake_deep_sky_plates.mjs. The runtime contract has three parts, and all three exist
// because a plate is a big resource that the whole frame samples:
//
//  1. BOUNDED RESIDENCY. At most one active plate plus one incoming. The background used to load
//     the Helios plate unconditionally in its constructor and keep it resident in every sector,
//     including the four that never sample it. Now a region's plate is requested when that region
//     is entered and the previous one is released as soon as the new one is live.
//
//  2. GATED UPLOAD. Decoding an image is the browser's problem, but the GPU upload happens on
//     whichever frame first draws with the texture bound - which can be a frame in the middle of a
//     fight. Instead the upload is performed explicitly through renderer.initTexture(), on a frame
//     that has time for it, using the same shouldStartHeavyAdmissionEventually predicate as the
//     other heavy admissions in this renderer. A run of late frames cannot park it forever.
//
//  3. NO VISIBLE PLATE BEFORE ITS UPLOAD. The sky's blend strength stays at zero until the upload
//     has actually happened, so the plate fades in from an already-resident texture instead of
//     appearing on the frame that stalls.
//
// The registry below is checked against assets/background/deep-sky/manifest.json by
// test/deep-sky-plate-pipeline.test.mjs, so a re-bake that changes a plate cannot silently
// disagree with the sizes the runtime budgets from.
import { shouldStartHeavyAdmissionEventually } from './admissionSliceBudget.js';

/**
 * Root-relative URLs survive esbuild chunk relocation and use the same browser/Electron route,
 * matching paintedPlanets.js. `residentBytes` is RGBA8 including the full mip tail.
 */
export const DEEP_SKY_PLATES = Object.freeze({
  'helios-amber-estuary': Object.freeze({
    id: 'helios-amber-estuary',
    url: '/assets/background/helios-amber-estuary.png',
    width: 1672,
    height: 941,
    residentBytes: 8387888,
  }),
  'core-lantern-shelf': Object.freeze({
    id: 'core-lantern-shelf',
    url: '/assets/background/deep-sky/core-lantern-shelf.png',
    width: 2048,
    height: 1024,
    residentBytes: 11184812,
  }),
  'belt-ochre-shoal': Object.freeze({
    id: 'belt-ochre-shoal',
    url: '/assets/background/deep-sky/belt-ochre-shoal.png',
    width: 2048,
    height: 1024,
    residentBytes: 11184812,
  }),
  'anomaly-cold-halo': Object.freeze({
    id: 'anomaly-cold-halo',
    url: '/assets/background/deep-sky/anomaly-cold-halo.png',
    width: 2048,
    height: 1024,
    residentBytes: 11184812,
  }),
});

/** One active plate plus one incoming during a region transition. Nothing else may be held. */
export const DEEP_SKY_MAX_RESIDENT = 2;

export function deepSkyPlate(id) {
  return (typeof id === 'string' && DEEP_SKY_PLATES[id]) || null;
}

/**
 * Worst-case residency the runtime can reach: the two largest plates, which is what a transition
 * between the two biggest regions costs for the moment both are held.
 */
export function deepSkyPeakResidentBytes() {
  const sizes = Object.values(DEEP_SKY_PLATES).map((p) => p.residentBytes).sort((a, b) => b - a);
  return (sizes[0] || 0) + (sizes[1] || 0);
}

/**
 * Bounded, upload-gated residency for the regional sky plates.
 *
 * Deliberately not a general texture cache: it holds two entries by construction, so there is no
 * eviction policy to get wrong and no way for a long session through many regions to accumulate
 * sky memory. It owns no scene objects and writes no simulation state.
 */
export class DeepSkyPlateResidency {
  /**
   * @param {object} options
   * @param {{load:Function}} options.loader  a THREE.TextureLoader (or anything with .load)
   * @param {object} [options.renderer]       WebGLRenderer, for initTexture
   * @param {object} [options.state]          game state, read for render.lastPresentDtMs
   * @param {Function} [options.configure]    called with each freshly created texture
   */
  constructor({ loader, renderer = null, state = null, configure = null } = {}) {
    this.loader = loader || null;
    this.renderer = renderer;
    this.state = state;
    this.configure = configure;
    this.activeId = null;
    this.activeTexture = null;
    this.pendingId = null;
    this.pendingTexture = null;
    this.pendingDecoded = false;
    this.uploaded = false;
    this.failedIds = new Set();
    this.lateSkips = 0;
    this.uploads = 0;
    this.uploadMs = 0;
    this.lastUploadMs = 0;
    this.disposed = false;
  }

  /** True while a plate is loading or waiting for its upload slot. */
  get transitioning() { return this.pendingId !== null; }

  /** The id whose pixels are actually on the GPU right now, or null. */
  get readyId() { return this.uploaded ? this.activeId : null; }

  /** Textures this object is holding. The invariant the test pins. */
  get residentCount() { return (this.activeTexture ? 1 : 0) + (this.pendingTexture ? 1 : 0); }

  get residentBytes() {
    let bytes = 0;
    if (this.activeTexture) bytes += deepSkyPlate(this.activeId)?.residentBytes || 0;
    if (this.pendingTexture) bytes += deepSkyPlate(this.pendingId)?.residentBytes || 0;
    return bytes;
  }

  /**
   * Ask for a region's plate. Returns true when this changed what the residency is working toward.
   * A null/unknown id releases everything: a region with no plate pays nothing for the feature.
   */
  request(id) {
    if (this.disposed) return false;
    const plate = deepSkyPlate(id);
    const wanted = plate && !this.failedIds.has(plate.id) ? plate.id : null;
    if (wanted === this.activeId && !this.pendingId) return false;
    // `this.pendingId` is null when nothing is in flight, so a bare equality test would treat
    // "release everything" as "already fetching that" and quietly keep the old plate resident.
    if (wanted !== null && wanted === this.pendingId) return false;
    // A transition that turns around mid-flight drops the plate it was fetching, not the live one.
    this._releasePending();
    if (wanted === this.activeId) return false;
    if (!wanted) {
      this._releaseActive();
      return true;
    }
    if (!this.loader) return false;
    this.pendingId = wanted;
    this.pendingDecoded = false;
    const plateDef = DEEP_SKY_PLATES[wanted];
    this.pendingTexture = this.loader.load(
      plateDef.url,
      () => { if (!this.disposed && this.pendingId === wanted) this.pendingDecoded = true; },
      undefined,
      (error) => {
        if (this.disposed) return;
        // A missing plate is a quiet region, never a broken frame.
        console.error(`[background] deep-sky plate failed to load: ${wanted}`, error);
        this.failedIds.add(wanted);
        if (this.pendingId === wanted) this._releasePending();
      },
    );
    if (this.pendingTexture && this.configure) this.configure(this.pendingTexture, plateDef);
    return true;
  }

  /**
   * Advance the transition. Call once per rendered frame, before the sky strength is computed.
   * Performs at most one GPU upload, and only on a frame that has room for it.
   */
  pump() {
    if (this.disposed || !this.pendingId || !this.pendingDecoded) return false;
    const lastPresentDtMs = this.state && this.state.render
      ? this.state.render.lastPresentDtMs : undefined;
    const gate = shouldStartHeavyAdmissionEventually(lastPresentDtMs, this.lateSkips);
    this.lateSkips = gate.skippedCount;
    if (!gate.start) return false;
    const texture = this.pendingTexture;
    const id = this.pendingId;
    const started = now();
    if (this.renderer && typeof this.renderer.initTexture === 'function') {
      // The whole point: pay the upload HERE, on a frame chosen for it, not on whichever frame
      // first happens to draw the sky with this texture bound.
      try { this.renderer.initTexture(texture); } catch { /* upload retries next frame */ }
    }
    this.lastUploadMs = Math.round((now() - started) * 100) / 100;
    this.uploadMs += this.lastUploadMs;
    this.uploads++;
    this._releaseActive();
    this.activeId = id;
    this.activeTexture = texture;
    this.uploaded = true;
    this.pendingId = null;
    this.pendingTexture = null;
    this.pendingDecoded = false;
    return true;
  }

  stats() {
    return {
      activePlate: this.activeId,
      incomingPlate: this.pendingId,
      residentPlates: this.residentCount,
      residentMB: Math.round((this.residentBytes / 1048576) * 10) / 10,
      uploads: this.uploads,
      lastUploadMs: this.lastUploadMs,
      totalUploadMs: Math.round(this.uploadMs * 100) / 100,
      lateFrameSkips: this.lateSkips,
    };
  }

  _releasePending() {
    if (this.pendingTexture) this.pendingTexture.dispose();
    this.pendingTexture = null;
    this.pendingId = null;
    this.pendingDecoded = false;
  }

  _releaseActive() {
    if (this.activeTexture) this.activeTexture.dispose();
    this.activeTexture = null;
    this.activeId = null;
    this.uploaded = false;
  }

  dispose() {
    this.disposed = true;
    this._releasePending();
    this._releaseActive();
  }
}

function now() {
  return (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now() : Date.now();
}
