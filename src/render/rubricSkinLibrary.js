import * as THREE from 'three';

// RUBRIC's painted surfaces: a four-row skin atlas for the marker's paint tank and a five-cartridge
// stencil-wheel sheet for its face. Painted by tools/art/rubric_skins.mjs (provenance in the manifest
// beside the files). The marker builds synchronously with flat colours and swaps the skins in when
// they publish, so a failed or slow load costs it only its paint, never its presence.
const ROOT = '/assets/ships/release/surfaces/rubric/';

export const RUBRIC_SKIN_ASSETS = Object.freeze({
  atlas: `${ROOT}rubric_skin_atlas.png`,
  wheel: `${ROOT}rubric_stencil_wheel.png`,
});
export const RUBRIC_SKIN_ROWS = Object.freeze(['primer', 'witness', 'scarred', 'memorial']);

/** Which row of the atlas the marker wears. History outranks tidiness: a hurt marker keeps its
 * scar even after it has been through the work; a finished one is whitewashed. */
export function rubricSkinRow(pose) {
  if (pose?.memorial) return 3;
  if ((pose?.wronged || 0) > 0) return 2;
  if ((pose?.witness || 0) >= 3) return 1;
  return 0;
}

let readySkins = null;
let readyPromise = null;
const waiters = new Set();

/** Decode and GPU-warm both sheets. Failure is not fatal: it resolves null and the marker keeps
 * the flat colours it was built with. `options.loadTexture` lets tests and benches inject a loader. */
export function preloadRubricSkinLibrary(renderer, options = {}) {
  if (readySkins) return Promise.resolve(readySkins);
  if (readyPromise) return readyPromise;
  const loadTexture = typeof options.loadTexture === 'function'
    ? options.loadTexture
    : (url) => new THREE.TextureLoader().loadAsync(url);
  const jobs = Object.entries(RUBRIC_SKIN_ASSETS).map(([slot, url]) => ({ slot, url }));
  readyPromise = Promise.all(jobs.map((job) => loadTexture(job.url))).then((textures) => {
    const skins = {};
    jobs.forEach((job, index) => {
      const texture = textures[index];
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = job.slot === 'atlas' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = 4;
      texture.userData = { ...(texture.userData || {}), spacefaceSurfaceRole: `rubric-${job.slot}` };
      texture.needsUpdate = true;
      skins[job.slot] = texture;
      if (renderer && typeof renderer.initTexture === 'function') renderer.initTexture(texture);
    });
    readySkins = Object.freeze(skins);
    for (const fn of [...waiters]) { try { fn(readySkins); } catch (_) { /* a dead root never blocks the rest */ } }
    waiters.clear();
    return readySkins;
  }).catch((error) => {
    readySkins = null;
    readyPromise = null;
    if (typeof console !== 'undefined') console.warn('[rubric] Skin textures failed; keeping flat colours.', error);
    return null;
  });
  return readyPromise;
}

export function getReadyRubricSkins() { return readySkins; }

/** Called by a freshly built marker: runs `onReady(skins)` now if the sheets are decoded, else
 * starts the (single) load and runs it when they publish. A no-op where there is no DOM. */
export function requestRubricSkins(onReady) {
  if (readySkins) { onReady(readySkins); return () => {}; }
  waiters.add(onReady);
  if (typeof document !== 'undefined') preloadRubricSkinLibrary(null);
  return () => waiters.delete(onReady);
}

/** Test seam: forget the decoded sheets. */
export function resetRubricSkinLibraryForTests() { readySkins = null; readyPromise = null; waiters.clear(); }
