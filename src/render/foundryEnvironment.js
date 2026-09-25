// One industrial foundry light for every authored PBR surface (AQ-LIGHT).
//
// spaceReflectionEnvironment.js gave chrome hulls reflected structure, but its three emissive
// cards are an abstract studio rig — paint, rubber, and bare metal all still read off the same
// broad gradients. This module feeds a real image instead: the Poly Haven
// industrial_workshop_foundry HDRI, convolved to a PMREM by renderer._bakeEnv. Specular lobes
// resolve the foundry's actual structure — windows, gantries, lamps — so bare metal, coated
// paint, and rubber finally separate under a single light.
//
// The visible sky is never touched: this texture is a scene.environment input only, and
// scene.background keeps the sector deep-sky plate.
//
// The foundry's absolute radiance (molten metal, sky lamps) runs far above the card rig's, so
// the HDR is normalized once at load to the rig's mean-luminance band. Diffuse pickup keeps the
// shipped balance — muzzle and engine emissives stay dominant — while the structure of the
// reflections is what changes.

// Served path for the promoted runtime copy. Source + license:
// assets/background/env/PROVENANCE.md (CC0 Poly Haven, retrieved 2026-09-22).
export const FOUNDRY_IBL_URL = '/assets/background/env/industrial_workshop_foundry_2k.hdr';

// Normalize the HDR's mean luminance to the card rig's diffuse band (radiance 4.2/3.0/1.15
// cards covering a modest fraction of a near-black sky ≈ ~1 mean). The environment therefore
// lifts surfaces exactly as much as the shipped rig did; only the reflected structure changes.
export const FOUNDRY_IBL_TARGET_MEAN_RADIANCE = 1.0;

export const IBL_SOURCE_FOUNDRY = 'foundry';
export const IBL_SOURCE_BACKGROUND = 'background';
export const IBL_SOURCE_REFLECTION_CARDS = 'reflection-cards';

// Every PMREM bake — foundry HDRI, sector-plate background, or card-rig fallback — must emit the
// same cube-map size. The output texture's cubeUV height sits in each lit material's shader
// program key (envMapCubeUVHeight), so a bake at a different resolution silently re-keys and
// re-links every standard material on the next presented pass — a multi-second GPU brick on the
// live route, not just in probes. Equirect sources size their bake from the input width, so
// renderer._bakeEnv routes them through a fixed-size scene capture instead of fromEquirectangular.
// 256 is the card rig's tuned size: its 0.035 radian prefilter requests ~17 blur taps at 256px and
// PMREM's blur shader caps at 20 — a larger pin would clip the kernel and log a THREE warning on
// every bake (which the performance harness counts as a runtime error). The foundry 2k HDRI
// downsamples to 256 cleanly; its structure survives because env lookups are mip-blurred anyway.
export const IBL_PMREM_CUBE_SIZE = 256;

// Priority for the PMREM source: the foundry HDRI wins once loaded; until then the existing
// chain holds (sector-plate background texture, else the emissive card rig). scene.background
// is never reassigned from here — the resolver only reads it.
export function resolveIblSource({ foundryTexture = null, background = null } = {}) {
  if (foundryTexture && foundryTexture.isTexture) return IBL_SOURCE_FOUNDRY;
  if (background && background.isTexture) return IBL_SOURCE_BACKGROUND;
  return IBL_SOURCE_REFLECTION_CARDS;
}

// Load + normalize the foundry HDRI. Returns the DataTexture or null when unavailable — the
// renderer treats it as an optional upgrade and keeps whichever env it already has.
export async function loadFoundryIblTexture(THREE, { url = FOUNDRY_IBL_URL } = {}) {
  if (!THREE) throw new TypeError('loadFoundryIblTexture requires THREE');
  let HDRLoader;
  try {
    ({ HDRLoader } = await import('three/addons/loaders/HDRLoader.js'));
  } catch (_) {
    return null;
  }
  try {
    const loader = new HDRLoader();
    // Float data keeps the luminance normalization a plain multiply on Float32Array; the
    // texture is the PMREM source only, so 33 MB resident is a one-time singleton cost.
    loader.setDataType(THREE.FloatType);
    const texture = await loader.loadAsync(url);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    normalizeHdrMeanRadiance(texture, FOUNDRY_IBL_TARGET_MEAN_RADIANCE);
    neutralizeHdrGreenCast(texture);
    texture.needsUpdate = true;
    return texture;
  } catch (_) {
    return null;
  }
}

// Scale HDR pixel data in place so the mean luminance lands on targetMean. Returns the applied
// stats, or null when the data is not float RGB(A) pixels (unexpected loader output).
export function normalizeHdrMeanRadiance(texture, targetMean) {
  const image = texture && texture.image;
  const data = image && image.data;
  if (!(data instanceof Float32Array) || !Number.isFinite(targetMean) || targetMean <= 0) return null;
  const channels = Math.round(data.length / Math.max(1, image.width * image.height));
  if (channels < 3 || channels > 4) return null;
  let sum = 0;
  let samples = 0;
  for (let i = 0; i + 2 < data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) continue;
    const lum = 0.2126 * Math.max(0, r) + 0.7152 * Math.max(0, g) + 0.0722 * Math.max(0, b);
    sum += lum;
    samples += 1;
  }
  const meanBefore = samples > 0 ? sum / samples : 0;
  if (meanBefore <= 0) return { meanBefore, meanAfter: 0, scaleFactor: 1, samples };
  const scaleFactor = targetMean / meanBefore;
  for (let i = 0; i + 2 < data.length; i += channels) {
    data[i] *= scaleFactor;
    data[i + 1] *= scaleFactor;
    data[i + 2] *= scaleFactor;
  }
  return { meanBefore, meanAfter: targetMean, scaleFactor, samples };
}

// The workshop floor is painted green — faithful in a foundry interior, wrong as the light of a
// space scene: the lower equirect hemisphere is green-dominant, so every smooth metal mirrors it
// as a lime cast (PQ-193 lane pins read as green sticks instead of dark gunmetal). Pull each
// green-dominant texel toward a warm neutral at its own luminance, with a soft knee keyed on how
// far green runs ahead of the warm channels; luminance and the furnace/window structure are
// preserved, and warm or neutral texels are never touched. Returns the count of altered texels,
// or null when the data is not float RGB(A) pixels.
export function neutralizeHdrGreenCast(texture) {
  const image = texture && texture.image;
  const data = image && image.data;
  if (!(data instanceof Float32Array)) return null;
  const channels = Math.round(data.length / Math.max(1, image.width * image.height));
  if (channels < 3 || channels > 4) return null;
  let touched = 0;
  for (let i = 0; i + 2 < data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) continue;
    const warm = Math.max(r, b);
    const over = g - warm;
    if (over <= 0) continue;
    // Soft knee: a mild lead desaturates gently; the painted floor (G ≈ 1.4-1.8x the warm
    // channels) is fully neutralized rather than merely dimmed.
    const t = Math.min(1, over / Math.max(warm * 0.4, 0.05));
    const lum = 0.2126 * Math.max(0, r) + 0.7152 * Math.max(0, g) + 0.0722 * Math.max(0, b);
    // Warm-neutral target keeps the foundry's cast instead of a sterile grey, normalized so the
    // texel's luminance is preserved exactly.
    const s = lum / (0.2126 * 1.1 + 0.7152 + 0.0722 * 0.78);
    data[i] = r + (s * 1.1 - r) * t;
    data[i + 1] = g + (s - g) * t;
    data[i + 2] = b + (s * 0.78 - b) * t;
    touched += 1;
  }
  return touched;
}
