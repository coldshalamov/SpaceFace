// src/render/adaptiveQuality.js — GPU capability detection + dynamic-resolution controller.
//
// Resolution can relieve GPU shading cost, while simulation and other CPU work need their own
// fixes. renderer.js uses this module to identify software rendering, choose a per-tier floor,
// and trial INTERNAL resolution bands (state.render.dynResScale). A reduction that does not
// improve frame time is restored. The controller never changes the player's saved effect choices.
//
// Contract (consumed by src/render/renderer.js):
//   detectGpu(renderer) -> { renderer:string, vendor:string, software:bool, tier:string }
//   createAdaptiveResolution({ floor, apply }) -> { setEnabled(bool), update(frameDt, sample), getScale() }
//     apply(scale) is called only when the live multiplier changes; scale is clamped to [floor, 1].
//
// No Three.js import (reads through the passed WebGLRenderer's raw context); no per-frame allocation.

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Substrings that identify a CPU/software WebGL backend (no in-game setting makes these fast).
const SOFTWARE_RE = /swiftshader|llvmpipe|software|basic render|microsoft basic|softpipe|mesa offscreen|apple software/i;
// Substrings that identify integrated / mobile GPUs (fast enough, but a lower floor is safer).
const INTEGRATED_RE = /intel|uhd|hd graphics|iris|apple m\d|apple gpu|adreno|mali|powervr|integrated|vivante/i;
// AMD's integrated parts say neither "intel" nor "integrated": a Ryzen APU reports "Radeon(TM)
// Graphics", "Radeon Vega 8 Graphics" (also "RX Vega 11 Graphics" on the 2400G/3400G), a mobile
// "Radeon 780M", the Steam Deck's "AMD Custom GPU 0405" / "0932", or a Mesa codename ("AMD RENOIR",
// "(radeonsi, vangogh, LLVM ...)"). Every form is anchored so the dedicated cards that share a
// family word stay out: "Radeon RX 6800M" and "Radeon Pro 5500M" have a word between "Radeon" and
// the digits, and "RX Vega 64" / "Pro Vega 20" carry no "Graphics" suffix. The codenames are APU-only
// (no navi/polaris/vega10, which are dedicated cards).
const AMD_INTEGRATED_RE = /radeon(?:\s*\(tm\))?\s+(?:graphics|r[2-7]\s+graphics|\d{3,4}m\b)|vega\s*(?:\d+\s+graphics|mobile)|\bamd\s+custom\s+gpu\b|\b(?:raven2?|picasso|renoir|lucienne|cezanne|barcelo|rembrandt|mendocino|phoenix|stoney|carrizo|kaveri|vangogh)\b/i;
// Intel's dedicated Arc cards carry the "intel" the integrated test keys on, so they are named here
// and tested BEFORE it: Alchemist A-series (desktop, "M" mobile, Pro), Battlemage B570/B580, and
// Pro B50/B60. The branding is NOT a reliable split by letter: integrated parts are "Arc(TM)
// Graphics", "Arc(TM) 140V GPU" and the Panther Lake "Arc B390/B370", so B-series is matched by
// its known dedicated model numbers, never by letter alone.
const INTEL_ARC_DISCRETE_RE = /\barc(?:\s*\(tm\))?\s+(?:a\d{2,3}m?|b5\d{2}|pro\s+[ab]\d{2,3})\b/i;
// What a browser reports when it hides the real GPU (the unmasked-renderer extension is blocked or
// absent, so the fallback is gl.RENDERER). It names no hardware, so it is `unknown`, not `discrete`.
const UNIDENTIFIED_RENDERER_RE = /^\s*(?:webkit webgl|mozilla|webgl|generic(?: renderer)?)\s*$/i;

// Read the unmasked renderer/vendor strings and classify the GPU into a coarse performance tier.
export function detectGpu(renderer) {
  let rendererStr = '';
  let vendorStr = '';
  try {
    const gl = renderer && typeof renderer.getContext === 'function' ? renderer.getContext() : null;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        rendererStr = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
        vendorStr = String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '');
      }
      if (!rendererStr) rendererStr = String(gl.getParameter(gl.RENDERER) || '');
      if (!vendorStr) vendorStr = String(gl.getParameter(gl.VENDOR) || '');
    }
  } catch (_) { /* detection is best-effort; fall through to 'unknown' */ }

  const software = SOFTWARE_RE.test(rendererStr) || SOFTWARE_RE.test(vendorStr);
  let tier;
  if (software) tier = 'software';
  else if (!rendererStr || UNIDENTIFIED_RENDERER_RE.test(rendererStr)) tier = 'unknown';
  else if (INTEL_ARC_DISCRETE_RE.test(rendererStr)) tier = 'discrete';
  else if (INTEGRATED_RE.test(rendererStr) || AMD_INTEGRATED_RE.test(rendererStr)) tier = 'integrated';
  else tier = 'discrete';

  return {
    renderer: rendererStr || 'unknown',
    vendor: vendorStr || 'unknown',
    software,
    tier,
  };
}

// --- Player quality presets -------------------------------------------------------------------
// High performance / Balanced / High quality are the player-facing modes (settings → Video →
// Quality mode, one press each so the cost of the expensive settings can be A/B'd live). Each mode
// maps to an adaptive-quality tier: the internal-resolution posture (dynamic-resolution floor +
// persisted render scale + pixel-ratio cap) and the optional presentation features that tier may
// use. A preset NEVER changes simulation content — no actor, spawn, cargo, mission, or economy
// count is read or written; it only trades rendering quality for headroom. Fresh installs use
// Automatic policy with Balanced effect choices; selecting a named preset switches to Manual.
//
// Presets deliberately do not disable authored world content (ships, trails, stations): they lower
// resolution and particle density, not the number of things in the world.
export const ADAPTIVE_QUALITY_TIERS = Object.freeze({
  // High performance is now a cadence profile, not a picture cut: native raster, the authored
  // two-level bloom, medium particles, Nocturne/trails/energy materials/postFx, and no sun-shadow
  // map. The authored sky's own measurement says the mid tier holds 60 fps on this iGPU, and the
  // frame is submission-bound; the 30 fps cap is the lever. The hitch governor may shed bloom/post
  // under sustained blocking but never drops raster.
  low: Object.freeze({
    id: 'low',
    label: 'High performance',
    adaptiveFloor: 0.5,
    renderScale: 1,
    pixelRatioCap: 2,
    bloom: true,
    bloomStrength: 0.40,
    bloomLevels: 2,
    // Sun shadow-maps stay out of High performance/Balanced: at the neighbourhood ortho's texel
    // density they read as crawling clumps, not depth. The High quality tier opts back in.
    shadows: false,
    nocturne: true,
    nocturneShadows: false,
    nocturneAtmosphere: true,
    nocturneQuality: 'auto',
    energyMaterials: true,
    renderGraph: false,
    engineTrails: true,
    particleQuality: 'medium',
    frameCap: 30,
    dynamicResolution: false,
    postFx: true,
    sharpen: false,
  }),
  // The shipped picture, unchanged: full-resolution render, medium particles, no shadow map, no
  // render graph. Every key matches the gameState video defaults so the chooser presses Balanced
  // on a fresh install.
  medium: Object.freeze({
    id: 'medium',
    label: 'Balanced',
    adaptiveFloor: 0.6,
    renderScale: 1,
    pixelRatioCap: 2,
    bloom: true,
    bloomStrength: 0.40,
    bloomLevels: 2,
    shadows: false,
    nocturne: true,
    nocturneShadows: false,
    nocturneAtmosphere: true,
    nocturneQuality: 'auto',
    energyMaterials: true,
    renderGraph: false,
    engineTrails: true,
    particleQuality: 'medium',
    frameCap: 0,
    dynamicResolution: false,
    postFx: true,
    sharpen: false,
  }),
  // Everything the picture can spend: sun shadow maps (+14.6 ms at the trade hub on the iGPU
  // target — LOOK.md), the render graph's GTAO + multiscale composite, and the high particle /
  // starfield tier. Meant for GPUs with headroom; flip back to Balanced to feel the difference.
  high: Object.freeze({
    id: 'high',
    label: 'High quality',
    adaptiveFloor: 0.6,
    renderScale: 1,
    pixelRatioCap: 2,
    bloom: true,
    bloomStrength: 0.40,
    bloomLevels: 2,
    shadows: true,
    nocturne: true,
    nocturneShadows: true,
    nocturneAtmosphere: true,
    nocturneQuality: 'auto',
    energyMaterials: true,
    renderGraph: true,
    engineTrails: true,
    particleQuality: 'high',
    frameCap: 0,
    dynamicResolution: false,
    postFx: true,
    sharpen: false,
  }),
  // E8 — designed for an integrated GPU, not "everything low". Bloom, trails, and energy
  // materials stay. The sun-shadow map stays off (it crawls at this texel size; contact
  // shadows still ground the body). Particles step down from high, not off.
  igpu60: Object.freeze({
    id: 'igpu60',
    label: 'iGPU 60',
    adaptiveFloor: 0.5,
    renderScale: 0.75,
    pixelRatioCap: 1,
    bloom: true,
    bloomStrength: 0.40,
    bloomLevels: 2,
    shadows: false,
    nocturne: true,
    nocturneShadows: false,
    nocturneAtmosphere: true,
    nocturneQuality: 'auto',
    energyMaterials: true,
    renderGraph: false,
    engineTrails: true,
    particleQuality: 'medium',
    frameCap: 0,
    dynamicResolution: false,
    postFx: true,
    sharpen: false,
  }),
  // Opt-in integrated-GPU bundle (PERF backlog #86–#94). Default picture stays Medium —
  // this tier is never auto-applied; the game may only *suggest* it when detectGpu reports
  // integrated. Bundling bloom/post cuts here is explicit player consent (PERF_WHAT_MATTERS
  // forbids silent bloom-off as a default fix). Heavier than igpu60: 0.85 scale + sharpen,
  // single bloom level, postFx off, dynres opt-in, 30 fps cap.
  integrated: Object.freeze({
    id: 'integrated',
    label: 'Integrated GPU',
    adaptiveFloor: 0.5,
    renderScale: 0.85,
    pixelRatioCap: 1,
    bloom: true,
    bloomStrength: 0.28,
    bloomLevels: 1,
    shadows: false,
    nocturne: false,
    nocturneShadows: false,
    nocturneAtmosphere: false,
    nocturneQuality: 'auto',
    energyMaterials: true,
    renderGraph: false,
    engineTrails: true,
    particleQuality: 'low',
    frameCap: 30,
    dynamicResolution: true,
    postFx: false,
    sharpen: true,
  }),
});

export const QUALITY_PRESETS = Object.freeze([
  Object.freeze({
    id: 'low',
    label: 'High performance',
    tier: 'low',
    stays: Object.freeze(['native raster', 'bloom', 'engine trails', 'energy materials',
      'medium particles', 'Nocturne']),
    substitutes: Object.freeze([
      '30 fps cap',
      'no sun-shadow map',
      'no render graph',
    ]),
  }),
  Object.freeze({
    id: 'medium',
    label: 'Balanced',
    tier: 'medium',
    stays: Object.freeze(['bloom', 'engine trails', 'energy materials']),
    substitutes: Object.freeze([
      'pixel ratio 2x',
      'medium particles',
      'no sun-shadow map',
      'no render graph',
    ]),
  }),
  Object.freeze({
    id: 'high',
    label: 'High quality',
    tier: 'high',
    stays: Object.freeze(['sun shadows', 'render graph + contact AO', 'engine trails', 'energy materials']),
    substitutes: Object.freeze([
      'pixel ratio 2x',
      'high particles',
    ]),
  }),
  Object.freeze({
    id: 'igpu60',
    label: 'iGPU 60',
    tier: 'igpu60',
    frameCap: 60,
    stays: Object.freeze(['bloom', 'engine trails', 'energy materials']),
    substitutes: Object.freeze([
      'render scale 0.75',
      'pixel ratio 1x',
      'medium particles',
      'no sun-shadow map',
      'no render graph',
      'frame cap 60',
    ]),
  }),
  Object.freeze({
    id: 'integrated',
    label: 'Integrated GPU',
    tier: 'integrated',
    stays: Object.freeze(['bloom', 'engine trails', 'energy materials']),
    substitutes: Object.freeze([
      'render scale 0.85 + sharpen',
      'pixel ratio 1x',
      'single bloom level',
      'post effects off',
      'dynamic resolution on',
      'frame cap 30',
    ]),
  }),
]);
export const DEFAULT_QUALITY_PRESET = 'medium';

/** The three picture modes the Quality mode chooser shows; the hardware bundles sit beside them. */
export const CANONICAL_QUALITY_PRESET_IDS = Object.freeze(['low', 'medium', 'high']);

const QUALITY_PRESET_IDS = new Set(QUALITY_PRESETS.map((p) => p.id));
const PRESET_VIDEO_KEYS = Object.freeze([
  'renderScale', 'pixelRatioCap', 'bloom', 'bloomStrength', 'bloomLevels', 'shadows', 'energyMaterials',
  'renderGraph', 'engineTrails', 'particleQuality', 'frameCap', 'dynamicResolution',
  'postFx', 'sharpen',
  'nocturne', 'nocturneShadows', 'nocturneAtmosphere', 'nocturneQuality',
]);

/** The adaptive-quality tier a preset selects. An unknown id falls back to the default preset. */
export function qualityTierForPreset(presetId) {
  const id = QUALITY_PRESET_IDS.has(presetId) ? presetId : DEFAULT_QUALITY_PRESET;
  return ADAPTIVE_QUALITY_TIERS[id];
}

/** True when every preset-owned video key equals the tier `presetId` resolves to — the chooser's
 * pressed state, so one hand-tweaked row truthfully un-presses the mode that set it. */
export function videoMatchesQualityTier(video, presetId) {
  if (!video || typeof video !== 'object') return false;
  const tier = qualityTierForPreset(presetId);
  return PRESET_VIDEO_KEYS.every((key) => video[key] === tier[key]);
}

/** The preset whose tier `video` currently matches exactly, or null when the granular settings
 * have drifted into a modified picture no preset represents. */
export function matchingQualityPreset(video) {
  if (!video || typeof video !== 'object') return null;
  for (const row of QUALITY_PRESETS) {
    if (videoMatchesQualityTier(video, row.id)) return row.id;
  }
  return null;
}

/**
 * Write a preset's tier into `settings.video` and return `{ preset, tier, changed }`. Presentation
 * keys only — never a sim, spawn, cargo, or economy writer. `changed` lists the keys that actually
 * moved so the caller can publish just those to `settings:changed`.
 */
export function applyQualityPreset(settings, presetId) {
  const video = settings && settings.video;
  if (!video || typeof video !== 'object') return null;
  const tier = qualityTierForPreset(presetId);
  const changed = [];
  for (const key of PRESET_VIDEO_KEYS) {
    if (video[key] !== tier[key]) { video[key] = tier[key]; changed.push(key); }
  }
  if (video.qualityMode !== 'manual') { video.qualityMode = 'manual'; changed.push('qualityMode'); }
  if (video.qualityPreset !== tier.id) { video.qualityPreset = tier.id; changed.push('qualityPreset'); }
  const preset = QUALITY_PRESETS.find((row) => row.id === tier.id);
  if (preset && Number.isFinite(preset.frameCap) && video.frameCap !== preset.frameCap) {
    video.frameCap = preset.frameCap;
    changed.push('frameCap');
  }
  return { preset: tier.id, tier: tier.id, changed };
}

/**
 * Apply a preset as an AUTOMATIC posture: the picture keys move, but the quality policy stays Auto
 * so the dynamic-resolution controller, the hitch governor and the Auto presentation cap keep
 * working. Manual choices still go through `applyQualityPreset`.
 */
export function applyAutoQualityPreset(settings, presetId) {
  const applied = applyQualityPreset(settings, presetId);
  if (!applied) return applied;
  const video = settings && settings.video;
  if (video && video.qualityMode !== 'auto') {
    video.qualityMode = 'auto';
    if (!applied.changed.includes('qualityMode')) applied.changed.push('qualityMode');
  }
  return { ...applied, qualityMode: 'auto' };
}

/** Resolve automatic/manual policy without changing existing player settings. Older saves have no
 * policy key: an untouched (possibly older, partial) Balanced profile adopts Auto, while a named
 * non-default or hand-edited profile remains manual. The former dynamic-resolution opt-in also
 * remains an explicit choice. */
export function qualityModeForVideo(video) {
  if (!video || typeof video !== 'object') return 'auto';
  if (video.qualityMode === 'auto' || video.qualityMode === 'manual') return video.qualityMode;
  if (video.dynamicResolution === true) return 'manual';
  if (video.qualityPreset && video.qualityPreset !== DEFAULT_QUALITY_PRESET) return 'manual';
  const balanced = qualityTierForPreset(DEFAULT_QUALITY_PRESET);
  return PRESET_VIDEO_KEYS.every((key) => video[key] == null || video[key] === balanced[key])
    ? 'auto'
    : 'manual';
}

/** Auto adapts render resolution only; Manual honors the explicit dynamicResolution setting. */
export function adaptiveResolutionEnabledForSettings(gpu, video) {
  if (!gpu || !dynamicResolutionAllowedForTier(gpu.tier)) return false;
  return qualityModeForVideo(video) === 'auto' || video?.dynamicResolution === true;
}

/** Frame budget follows the live cap, then display refresh; uncapped mode uses the 60 fps target. */
export function adaptiveFrameBudgetMs(render = {}, video = {}) {
  const liveCap = Number(render.frameCap);
  if (Number.isFinite(liveCap) && liveCap > 0) return 1000 / clamp(liveCap, 1, 1000);
  const displayHz = Number(render.displayHz);
  if (video.vsync !== false && Number.isFinite(displayHz) && displayHz >= 20 && displayHz <= 360) {
    return 1000 / displayHz;
  }
  return 1000 / 60;
}

/** Auto learns only after the exact opening picture has handed off to playable flight. */
export function adaptiveResolutionEligibleForState(state, visibilityState = 'visible') {
  const render = state && state.render;
  return state?.mode === 'flight'
    && state.paused !== true
    && Number(state.timeScale) > 0
    && render?.openingFirstPictureReady === true
    && render.flightVeilHoldsSim !== true
    && render.liveSectorGpuAdmission !== true
    && Number.isFinite(render.firstPlayableFrameAt)
    && visibilityState !== 'hidden';
}

/** True when detectGpu reports an integrated GPU and the player is not already on that preset. */
export function shouldSuggestIntegratedPreset(gpu, video = {}) {
  if (!gpu || gpu.tier !== 'integrated') return false;
  const preset = video && video.qualityPreset;
  return preset !== 'integrated';
}

/**
 * The presentation cadence the Auto policy applies to an integrated GPU. The authored picture is
 * unchanged; the cap stops the loop from presenting frames it cannot finish. Manual presets and
 * explicit frame caps always win.
 */
export function autoPresentationCapFor(gpu, video = {}, render = null) {
  if (!gpu || gpu.tier !== 'integrated') return 0;
  if (qualityModeForVideo(video) !== 'auto') return 0;
  // The live choice of the presentation governor (createAutoPresentationGovernor): 60 while the
  // frame holds it, a steady 30 when it cannot. Until the governor has published, 30.
  const live = render ? Number(render.autoPresentCap) : NaN;
  return live === AUTO_PRESENT_HIGH_CAP ? AUTO_PRESENT_HIGH_CAP : AUTO_PRESENT_LOW_CAP;
}

// --- Software-renderer emergency profile (the one automatic visual reduction) ------------------
// A CPU backend (SwiftShader/llvmpipe, hardware acceleration off) cannot shade the HDR scene plus
// bloom composite: the game auto-drops bloom and starts dynres at its established floor, and tells
// the player how to fix it. This is the ONLY automatic visual reduction — integrated and unknown
// tiers keep bloom (the integrated preset is opt-in via shouldSuggestIntegratedPreset). The
// profile is runtime intent only: it carries no settings.video write, so a hardware context after
// relaunch fully recovers (MACH-04).

export const GPU_TIER_DYNRES_FLOOR = Object.freeze({
  software: 0.34,
  integrated: 0.5,
  default: 0.6,
});

/**
 * The worst effective raster scale Auto may present: dyn-res content scale multiplied by the
 * automatic raster reliefs (integrated-GPU relief, hitch-governor rung 3). Those reliefs shrink
 * the drawing buffer itself while dyn-res shrinks the content inside it — the same lever pulled
 * twice — so the product, not each channel, is what must stay readable. The software emergency
 * tier is exempt: a CPU rasterizer needs the depth more than the readability.
 *
 * Native content is the contract: the demo drawing buffer is already native (renderScale 1,
 * integrated raster cap 1.0) and the frame is submission-bound, so shrinking the scene inside
 * that buffer buys no measured cadence and reads as softness. Keep the combined product at 1:1;
 * the hitch governor handles blocking with post-FX only. The software emergency tier is exempt:
 * a CPU rasterizer needs the depth more than the readability.
 */
// Coordinator decision 2026-11-20 (render lead): Auto may render the 3D scene down to 0.67 of
// native when the measured GPU time says the GPU is the long pole (Foundry round 20: ~70 ms of
// scene GPU at native, ~40 ms at 0.6). The frame is brought back to the display by the FidelityFX
// CAS scaling pass already in the composite (cas.js: contrast-adaptive upsample + sharpen in one
// full-screen pass), and the HUD, text and markers are DOM at native resolution. Manual presets
// (dynamicResolution off) keep native: the "Sharp" posture.
// Director ruling 2026-11-21: the GPU-budget governor (createGpuBudgetResolution) may use the
// whole 0.5-1.0 range in Auto. 0.5 is exactly the CAS scaling pass's 4x-area limit, so the
// contrast-adaptive upscale still reconstructs every band.
export const COMBINED_READABILITY_FLOOR = 0.5;

/**
 * Effective dyn-res floor once automatic raster relief is already below 1: the deeper the
 * drawing-buffer relief, the shallower the content scale must stay to hold the combined
 * product at COMBINED_READABILITY_FLOOR. `rasterRelief` is the product of the automatic
 * reliefs only — the player's own renderScale choice belongs to Manual and is not rescued here.
 */
export function adaptiveFloorForCombinedScale(tierFloor, rasterRelief) {
  const relief = clamp(Number(rasterRelief) || 1, 0.2, 1);
  const base = clamp(Number(tierFloor) || 0.6, 0.2, 1);
  return clamp(Math.max(base, COMBINED_READABILITY_FLOOR / relief), 0.2, 1);
}

export function dynResFloorForTier(tier) {
  if (tier === 'software') return GPU_TIER_DYNRES_FLOOR.software;
  if (tier === 'integrated') return GPU_TIER_DYNRES_FLOOR.integrated;
  return GPU_TIER_DYNRES_FLOOR.default;
}

/**
 * Whether this detected GPU class supports automatic internal-resolution adaptation. All known
 * classes do; their floors differ. Manual mode remains controlled by `dynamicResolution`.
 */
export function dynamicResolutionAllowedForTier(tier) {
  return tier === 'software' || tier === 'integrated' || tier === 'unknown' || tier === 'discrete';
}

export const SOFTWARE_RENDERER_TOAST = Object.freeze({
  text: 'Graphics hardware acceleration appears OFF — the game is rendering in slow software mode. Turn on hardware acceleration in your browser (or run the Desktop launcher) for smooth play.',
  kind: 'warn',
  ttl: 14,
});

/**
 * The software-context emergency profile, or null. Keys on `gpu.software === true` exactly —
 * a software-tier string without the flag, and every other tier, returns null so bloom is
 * disabled for a software context and nothing else.
 */
export function softwareRendererEmergencyProfile(gpu) {
  if (!gpu || gpu.software !== true) return null;
  return Object.freeze({
    bloomOff: true,
    dynFloor: GPU_TIER_DYNRES_FLOOR.software,
    toast: SOFTWARE_RENDERER_TOAST,
    toastDelayMs: 1200,
  });
}

export const INTEGRATED_PRESET_SUGGESTION = Object.freeze({
  text: 'Integrated GPU detected. Open Settings → Video and try the Integrated GPU preset for a smoother frame rate on this machine.',
  kind: 'info',
  ttl: 12,
});

// --- Frame cap --------------------------------------------------------------------------------
// 30 / 45 / 60 / 120 / off, with VSync honoured. `off` (0) means "no explicit cap": with VSync on
// the effective cap is the display refresh; with VSync off it is uncapped (0). A cap never exceeds
// the display refresh — a 120 request on a 60 Hz panel resolves to 60. The controller mirrors the
// adaptive-resolution controller: it reports the effective cap through an `apply` callback and
// never writes settings.video itself, so a settings edit and a runtime override stay separate.
export const FRAME_CAP_OPTIONS = Object.freeze([30, 45, 60, 120, 0]);

export function normalizeFrameCap(value) {
  const n = Number(value);
  return FRAME_CAP_OPTIONS.includes(n) ? n : 0;
}

export function frameCapLabel(value) {
  const n = normalizeFrameCap(value);
  return n === 0 ? 'Off' : n + ' fps';
}

/** Resolve the live cap in fps (0 = uncapped) from a request, the VSync flag, and the display Hz. */
export function resolveFrameCap({ cap, vsync, displayHz = 60 } = {}) {
  const requested = normalizeFrameCap(cap);
  const hz = Number(displayHz) > 0 ? Number(displayHz) : 60;
  if (!vsync) return requested;       // no sync: the request is the cap (0 = uncapped)
  if (requested === 0) return hz;     // sync + off: the display refresh is the cap
  return Math.min(requested, hz);     // a cap never exceeds the display refresh
}

/**
 * Fractional-debt present gate. rAF fires at the display refresh; a cap below that must skip
 * some callbacks rather than presenting off the vsync beat. `cap` is the *effective* cap from
 * `resolveFrameCap` (already vsync-clamped). Returns `{ present, debt }` for the next callback.
 *
 *   30 on 60 Hz → present every other rAF
 *   120 on 144 Hz → present five of six rAFs
 *   0 / cap ≥ displayHz → present every rAF
 */
// Out-param twin for the per-frame caller: same math, no fresh {present,debt} per rAF.
export function stepFrameCapDebtInto({ cap, displayHz = 60, debt = 0 } = {}, out) {
  const hz = Number(displayHz) > 0 ? Number(displayHz) : 60;
  const requested = Number(cap);
  const limit = Number.isFinite(requested) && requested > 0 ? requested : 0;
  if (limit <= 0 || limit >= hz) {
    out.present = true;
    out.debt = 0;
    return out;
  }
  let next = Number(debt);
  if (!Number.isFinite(next) || next < 0) next = 0;
  next += limit / hz;
  if (next >= 1) {
    out.present = true;
    out.debt = next - 1;
    return out;
  }
  out.present = false;
  out.debt = next;
  return out;
}

export function stepFrameCapDebt(args = {}) {
  return stepFrameCapDebtInto(args, {});
}

export function createFrameCap({ vsync = true, displayHz = 60, apply } = {}) {
  const sink = typeof apply === 'function' ? apply : () => {};
  let sync = !!vsync;
  let hz = Number(displayHz) > 0 ? Number(displayHz) : 60;
  let requested = 0;
  let effective = resolveFrameCap({ cap: requested, vsync: sync, displayHz: hz });
  function publish() {
    effective = resolveFrameCap({ cap: requested, vsync: sync, displayHz: hz });
    sink(effective);
    return effective;
  }
  return {
    setCap(cap) { requested = normalizeFrameCap(cap); return publish(); },
    setVsync(on) { sync = !!on; return publish(); },
    setDisplayHz(value) { hz = Number(value) > 0 ? Number(value) : 60; return publish(); },
    getCap() { return requested; },
    getVsync() { return sync; },
    getEffectiveCap() { return effective; },
  };
}

// Frame-time-driven resolution controller. It learns only from eligible presented-flight frames,
// ignores long stalls, and adjusts in visible bands around the current presentation budget. A
// measured improvement check rejects CPU-bound cases where reducing pixels did not help. Recovery
// probes upward slowly because rAF is capped by display refresh even when the GPU has headroom.
export function createAdaptiveResolution(opts = {}) {
  let floor = clamp(Number(opts.floor) || 0.6, 0.2, 1);
  const apply = typeof opts.apply === 'function' ? opts.apply : () => {};
  const step = clamp(Number(opts.step) || 0.1, 0.05, 0.25);
  const downRatio = clamp(Number(opts.downRatio) || 1.16, 1.05, 1.5);
  const recoveryRatio = clamp(Number(opts.recoveryRatio) || 0.92, 0.6, 0.99);
  const raiseIntervalS = Number(opts.raiseIntervalS) || 24;
  const slowHoldS = Number(opts.slowHoldS) || 1.5;
  const trialWindowS = Number(opts.trialWindowS) || 2.5;
  const noBenefitCooldownS = Number(opts.noBenefitCooldownS) || 15;
  const outlierMs = Number(opts.outlierMs) || 100;
  const maxAcceptedMs = Number(opts.maxAcceptedMs) || 250;
  const SMOOTH = 0.12;
  const RESIZE_COOLDOWN_S = 5.0;
  const MIN_BENEFIT = clamp(Number(opts.minBenefit) || 0.04, 0.01, 0.3);
  // Depth gate: each deeper band demands a progressively worse sustained miss —
  // gate(next) = downRatio + (1 − next)·1.2, so the step to 0.9 needs >1.28× the
  // budget, 0.7 needs >1.52×, and the floor band needs ≈1.8–2×. A mild persistent
  // load (the wider submit box at far zoom is the canonical case) parks at a
  // nearly invisible shallow band instead of grinding to the floor over ~40 s.
  const DEPTH_SEVERITY_SPAN = clamp(Number(opts.depthSeveritySpan) || 1.2, 0, 4);

  let enabled = true;
  let scale = clamp(Number(opts.initialScale) || 1, floor, 1);
  let emaMs = 1000 / 60;
  let lowerCooldown = 0;
  let raiseTimer = 0;
  let slowTimer = 0;
  let trial = null;
  let noBenefitCooldown = 0;
  let slowFrameStreak = 0;
  // Who is the long pole? Lowering resolution only relieves the GPU. When the main thread is busy
  // for (nearly) the whole frame interval the frame is CPU-bound: a trial would drop the picture to
  // a lower band for 2.5 s, measure no benefit, restore it and try again 15 s later — a visible
  // resolution pop every ~17 s that buys nothing. With a CPU sample the controller only trials when
  // the main thread leaves a real share of the interval idle (the wait is the GPU or compositor);
  // with a GPU-time sample (async timer queries) it trials when the GPU is the longer pole.
  let cpuEmaMs = null;
  let gpuEmaMs = null;
  let noBenefitStreak = 0;
  let bound = 'unknown';
  const CPU_BOUND_SHARE = clamp(Number(opts.cpuBoundShare) || 0.8, 0.5, 0.98);

  function resolutionCanHelp(targetMs) {
    if (gpuEmaMs != null) {
      bound = gpuEmaMs >= (cpuEmaMs ?? 0) * 0.9 && gpuEmaMs > targetMs * 0.6 ? 'gpu' : 'cpu';
    } else if (cpuEmaMs != null) {
      bound = cpuEmaMs >= emaMs * CPU_BOUND_SHARE ? 'cpu' : 'gpu';
    } else {
      bound = 'unknown';
    }
    return bound !== 'cpu';
  }

  function set(next) {
    const s = clamp(next, floor, 1);
    if (Math.abs(s - scale) < 1e-3) return;
    scale = s;
    apply(scale);
  }

  return {
    setEnabled(on) {
      enabled = !!on;
      emaMs = 1000 / 60;
      lowerCooldown = 0;
      raiseTimer = 0;
      slowTimer = 0;
      trial = null;
      noBenefitCooldown = 0;
      slowFrameStreak = 0;
      cpuEmaMs = null;
      gpuEmaMs = null;
      noBenefitStreak = 0;
      if (!enabled) set(1); // restore full internal resolution when disabled
    },
    syncScale(value) {
      const next = Number(value);
      scale = clamp(Number.isFinite(next) ? next : 1, floor, 1);
    },
    /** Raises/lowers the floor the controller may descend to (see
     * adaptiveFloorForCombinedScale). Raising past the live scale lifts it at once —
     * that direction restores readability and never costs a frame budget. */
    setFloor(nextFloor) {
      floor = clamp(Number(nextFloor) || floor, 0.2, 1);
      if (scale < floor) set(floor);
    },
    update(frameDt, sample = {}) {
      if (!enabled) return;
      const dt = Number(frameDt);
      const targetMs = clamp(Number(sample.targetMs) || 1000 / 60, 1000 / 360, 1000 / 20);
      if (sample.eligible === false || !Number.isFinite(dt) || dt <= 0) {
        slowTimer = 0;
        raiseTimer = 0;
        slowFrameStreak = 0;
        return;
      }
      if (dt * 1000 > outlierMs) {
        slowFrameStreak++;
        if (slowFrameStreak < 3) return;
      } else slowFrameStreak = 0;
      const boundedDt = Math.min(dt, maxAcceptedMs / 1000);
      const ms = boundedDt * 1000;
      emaMs += (ms - emaMs) * SMOOTH;
      const cpuMs = Number(sample.cpuMs);
      if (Number.isFinite(cpuMs) && cpuMs >= 0) {
        cpuEmaMs = cpuEmaMs == null ? cpuMs : cpuEmaMs + (Math.min(cpuMs, maxAcceptedMs) - cpuEmaMs) * SMOOTH;
      }
      const gpuMs = Number(sample.gpuMs);
      if (Number.isFinite(gpuMs) && gpuMs >= 0) {
        gpuEmaMs = gpuEmaMs == null ? gpuMs : gpuEmaMs + (Math.min(gpuMs, maxAcceptedMs) - gpuEmaMs) * SMOOTH;
      }
      if (lowerCooldown > 0) lowerCooldown -= boundedDt;
      if (noBenefitCooldown > 0) noBenefitCooldown -= boundedDt;
      raiseTimer += boundedDt;
      slowTimer = emaMs > targetMs * downRatio ? slowTimer + boundedDt : 0;

      if (trial) {
        trial.elapsed += boundedDt;
        if (trial.elapsed >= trialWindowS) {
          const improved = emaMs <= trial.baselineMs * (1 - MIN_BENEFIT);
          if (!improved) {
            set(trial.previousScale);
            // Back off: every consecutive fruitless trial doubles the wait (15 s, 30, 60, 120), so a
            // frame that resolution cannot help stops showing the player a lower-res band at all.
            noBenefitCooldown = noBenefitCooldownS * (2 ** Math.min(noBenefitStreak, 3));
            noBenefitStreak++;
          } else {
            noBenefitStreak = 0;
          }
          trial = null;
          slowTimer = 0;
          raiseTimer = 0;
          return;
        }
      }

      // A small sustained miss moves down one resolution band. The step is retained only when
      // the observed frame time improves; CPU/simulation bottlenecks restore the prior band.
      if (!trial && noBenefitCooldown <= 0 && slowTimer >= slowHoldS && scale > floor && lowerCooldown <= 0
        && resolutionCanHelp(targetMs)) {
        const nextScale = Math.max(floor, scale - step);
        // Depth gate: the deeper the candidate band, the worse the sustained miss must be.
        // Without it a borderline load walked every band on the same mild miss and the
        // picture spent long stretches at the readability floor for a ~20% overage.
        if (emaMs <= targetMs * (downRatio + (1 - nextScale) * DEPTH_SEVERITY_SPAN)) {
          slowTimer = 0;
          return;
        }
        const previousScale = scale;
        // Badly slow (>1.6x the frame budget): re-trial twice as often so Auto reaches the floor
        // in ~12 s instead of ~25 s (first step stays 0.1; the controller test pins it).
        const severe = emaMs > targetMs * 1.6;
        set(nextScale);
        trial = { previousScale, baselineMs: emaMs, elapsed: 0 };
        lowerCooldown = severe ? RESIZE_COOLDOWN_S * 0.5 : RESIZE_COOLDOWN_S;
        raiseTimer = 0;
        slowTimer = 0;
        return;
      }
      // Periodic probe-up reveals headroom on a vsync-capped display. A real miss then takes the
      // same sustained down path; a stable band is kept for the full recovery interval.
      const recoveryThresholdMs = targetMs * (1 + (1 - recoveryRatio));
      if (!trial && raiseTimer >= raiseIntervalS && scale < 1
        && emaMs <= recoveryThresholdMs && lowerCooldown <= 0) {
        set(scale + step);
        raiseTimer = 0;
        slowTimer = 0;
      }
    },
    getScale() { return scale; },
    isEnabled() { return enabled; },
    /** Diagnostics: 'cpu' | 'gpu' | 'unknown' as of the last lowering decision, plus the EMAs. */
    getBound() { return { bound, frameMs: emaMs, cpuMs: cpuEmaMs, gpuMs: gpuEmaMs }; },
  };
}

// --- GPU frame budget (2026-11-21) ---------------------------------------------------------------
// The scene's internal resolution is driven directly by measured GPU time (async timer queries, one
// same-frame total of every pass), the way console engines run dynamic resolution: hold about
// GPU_FRAME_BUDGET_MS of GPU work per frame whatever the main thread is doing. On a 15 W laptop the
// GPU and CPU share one power budget, so GPU time over budget costs the main thread too.
//
//   over budget   -> jump straight to the scale the measurement predicts (pixel cost ~ scale^2),
//                    snapped to 0.05 bands: one decision, taken within a few samples
//   under budget  -> climb one band at a time, only after the predicted cost of the higher band
//                    has stayed under the budget with margin for upHoldS
//   deadband      -> between those two nothing moves, so the picture does not pump
//   no benefit    -> if a drop did not buy the GPU time the pixel model promised (the time is not
//                    pixel-bound), the old scale is restored and drops wait out a doubling hold
//
// Samples rendered at the old scale are discarded by frame id after every change. No allocation per
// update. The caller owns eligibility (live flight only) and feeds each GPU frame total once.
export const GPU_FRAME_BUDGET_MS = 12;

export function createGpuBudgetResolution(opts = {}) {
  let floor = clamp(Number(opts.floor) || 0.5, 0.2, 1);
  const apply = typeof opts.apply === 'function' ? opts.apply : () => {};
  const budgetMs = clamp(Number(opts.budgetMs) || GPU_FRAME_BUDGET_MS, 2, 100);
  const band = clamp(Number(opts.band) || 0.05, 0.01, 0.25);
  const downRatio = clamp(Number(opts.downRatio) || 1.08, 1.01, 1.5);
  const upRatio = clamp(Number(opts.upRatio) || 0.88, 0.5, 0.99);
  const aimRatio = clamp(Number(opts.aimRatio) || 0.94, 0.5, 1);
  const smoothS = clamp(Number(opts.smoothS) || 0.15, 0.02, 2);
  const upHoldS = clamp(Number(opts.upHoldS) || 2, 0.2, 60);
  const minSamples = Math.max(1, Math.floor(Number(opts.minSamples) || 2));
  const noBenefitHoldS = clamp(Number(opts.noBenefitHoldS) || 15, 1, 600);
  const maxAcceptedMs = Number(opts.maxAcceptedMs) || 250;

  let enabled = true;
  let scale = clamp(Number(opts.initialScale) || 1, floor, 1);
  let emaMs = null;
  let samples = 0;          // valid samples since the last scale change
  let sinceSampleS = 0;
  let validFromFrameId = 0; // samples from frames before this were rendered at another scale
  let upTimer = 0;
  let upHold = upHoldS;     // doubles when a climb is undone straight away
  let sinceUpS = Infinity;
  let pending = null;       // the last drop, judged once enough samples arrive at the new scale
  const pendingBox = { fromScale: 1, fromMs: 0 };
  let dropHoldS = 0;
  let noBenefitStreak = 0;
  let fixedMs = 0;          // learned part of the GPU frame that resolution does not move
  let lastReason = 'init';

  const snapDown = (value) => Math.floor(value / band + 1e-6) * band;

  function set(next, frameId, reason) {
    const s = clamp(Math.round(next * 1000) / 1000, floor, 1);
    if (Math.abs(s - scale) < 1e-3) return false;
    scale = s;
    samples = 0;
    emaMs = null;
    upTimer = 0;
    validFromFrameId = Number.isFinite(frameId) ? frameId : 0;
    lastReason = reason;
    apply(scale);
    return true;
  }

  function predicted(atScale) {
    // cost(s) = fixed + pixel * s^2, with the learned fixed part.
    const pixelMs = Math.max(0, emaMs - fixedMs);
    return fixedMs + pixelMs * (atScale * atScale) / (scale * scale);
  }

  return {
    setEnabled(on) {
      enabled = !!on;
      emaMs = null;
      samples = 0;
      upTimer = 0;
      pending = null;
      dropHoldS = 0;
      noBenefitStreak = 0;
      if (!enabled) set(1, 0, 'disabled');
    },
    isEnabled() { return enabled; },
    getScale() { return scale; },
    syncScale(value) {
      const next = Number(value);
      const s = clamp(Number.isFinite(next) ? next : 1, floor, 1);
      if (Math.abs(s - scale) > 1e-3) { scale = s; samples = 0; emaMs = null; pending = null; }
    },
    setFloor(nextFloor) {
      floor = clamp(Number(nextFloor) || floor, 0.2, 1);
      if (scale < floor) set(floor, validFromFrameId, 'floor');
    },
    getFloor() { return floor; },
    atFloor() { return scale <= floor + 1e-3; },
    /**
     * @param {number} dtS wall seconds since the last call
     * @param {number|null} gpuMs a NEW same-frame GPU total, or null when none arrived this call
     * @param {number} sampleFrameId the render frame that total was measured on
     * @param {number} currentFrameId the render frame about to be drawn (a change applies from it)
     */
    update(dtS, gpuMs, sampleFrameId, currentFrameId) {
      if (!enabled) return scale;
      const dt = Number.isFinite(dtS) && dtS > 0 ? Math.min(dtS, 0.25) : 0;
      sinceSampleS += dt;
      sinceUpS += dt;
      if (dropHoldS > 0) dropHoldS -= dt;
      const ms = Number(gpuMs);
      if (gpuMs == null || !Number.isFinite(ms) || ms <= 0) return scale;
      if (Number.isFinite(sampleFrameId) && sampleFrameId < validFromFrameId) return scale; // old scale
      const sampleMs = Math.min(ms, maxAcceptedMs);
      const alpha = emaMs == null ? 1 : 1 - Math.exp(-Math.max(sinceSampleS, 0.004) / smoothS);
      emaMs = emaMs == null ? sampleMs : emaMs + (sampleMs - emaMs) * alpha;
      sinceSampleS = 0;
      samples++;
      if (samples < minSamples) return scale;

      if (pending) {
        // Judge the last drop against what the pixel model promised.
        const promised = pending.fromMs * (1 - (scale * scale) / (pending.fromScale * pending.fromScale));
        const got = pending.fromMs - emaMs;
        const denom = pending.fromScale * pending.fromScale - scale * scale;
        if (denom > 1e-6) {
          const pixelAtOne = Math.max(0, got / denom);
          fixedMs = clamp(emaMs - pixelAtOne * scale * scale, 0, emaMs);
        }
        const fromScale = pending.fromScale;
        pending = null;
        if (promised > 0.5 && got < promised * 0.25) {
          // The GPU time did not move: it is not pixel-bound, so the lower band only costs sharpness.
          dropHoldS = noBenefitHoldS * (2 ** Math.min(noBenefitStreak, 3));
          noBenefitStreak++;
          set(fromScale, currentFrameId, 'no-benefit');
          return scale;
        }
        noBenefitStreak = 0;
      }

      if (emaMs > budgetMs * downRatio && scale > floor + 1e-3 && dropHoldS <= 0) {
        const pixelMs = Math.max(0.001, emaMs - fixedMs);
        const room = budgetMs * aimRatio - fixedMs;
        // With no room under the fixed part, the pixel model cannot reach the budget: one band.
        const wanted = room > 0 ? scale * Math.sqrt(room / pixelMs) : scale - band;
        const next = clamp(Math.min(snapDown(wanted), scale - band), floor, 1);
        const fromScale = scale;
        const fromMs = emaMs;
        if (sinceUpS < 3) upHold = Math.min(upHold * 2, 30); // the climb was premature
        if (set(next, currentFrameId, 'over-budget')) {
          pendingBox.fromScale = fromScale;
          pendingBox.fromMs = fromMs;
          pending = pendingBox;
        }
        return scale;
      }

      if (scale < 1 - 1e-3) {
        const nextUp = Math.min(1, scale + band);
        if (predicted(nextUp) < budgetMs * upRatio) {
          upTimer += Math.max(dt, 0.001);
          if (upTimer >= upHold) {
            if (sinceUpS > 30) upHold = upHoldS;
            sinceUpS = 0;
            set(nextUp, currentFrameId, 'headroom');
          }
        } else {
          upTimer = 0;
        }
      }
      return scale;
    },
    /** Diagnostics for probes and the perf overlay. */
    getState() {
      return { scale, floor, gpuMs: emaMs, fixedMs, budgetMs, samples, upHold, dropHoldS, reason: lastReason };
    },
  };
}

// --- Auto presentation cadence (2026-11-22) ------------------------------------------------------
// An integrated GPU on the Auto policy used to present at a fixed 30 Hz. The cap now follows what
// the frame can hold: 60 while nearly every presented frame fits about 15 ms of main-thread work
// (and the GPU fits it too once resolution is already at its floor: resolution gives way first, the
// cadence last), a steady 30 when it cannot, because a locked 30 reads better than a 40-55 that
// judders. Hysteresis is in seconds: several clean seconds to go up, a sustained miss to come down,
// and a hold after every fall that doubles when the climb did not last. An explicit frame cap in
// Settings never reaches this code.
export const AUTO_PRESENT_LOW_CAP = 30;
export const AUTO_PRESENT_HIGH_CAP = 60;

export function createAutoPresentationGovernor(opts = {}) {
  const budgetMs = clamp(Number(opts.budgetMs) || 15, 4, 33);
  const windowS = clamp(Number(opts.windowS) || 3, 0.5, 30);
  const riseHoldS = clamp(Number(opts.riseHoldS) || 5, 1, 120);
  const fallHoldS = clamp(Number(opts.fallHoldS) || 10, 1, 600);
  const riseFraction = clamp(Number(opts.riseFraction) || 0.05, 0.005, 0.5);
  const fallFraction = clamp(Number(opts.fallFraction) || 0.15, 0.02, 0.9);
  let cap = AUTO_PRESENT_LOW_CAP;
  let overFraction = 1; // share of recent presented frames over budget; starts unproven
  let cleanS = 0;
  let inStateS = 0;
  let holdS = 0;
  let fallStreak = 0;
  return {
    getCap() { return cap; },
    /**
     * Once per presented live-flight frame.
     * @param {number} dtS wall seconds since the previous presented frame
     * @param {number} workMs main-thread time of the last presented frame callback
     * @param {number|null} gpuMs GPU time of the newest measured frame (null: unknown)
     * @param {boolean} resolutionAtFloor true when dynamic resolution has nothing left to give
     */
    update(dtS, workMs, gpuMs, resolutionAtFloor) {
      const dt = Number.isFinite(dtS) && dtS > 0 ? Math.min(dtS, 0.25) : 0;
      if (dt <= 0 || !Number.isFinite(workMs)) return cap;
      const gpuKnown = gpuMs != null && Number.isFinite(gpuMs);
      const gpuOver = gpuKnown && gpuMs > budgetMs;
      // At 60 a present that arrived late is a miss whoever caused it, unless resolution is still
      // on its way down to fix a GPU overrun (resolution gives way first).
      const lateAtHigh = cap === AUTO_PRESENT_HIGH_CAP && dt * 1000 > 25
        && (resolutionAtFloor === true || !gpuOver);
      const over = workMs > budgetMs || (resolutionAtFloor === true && gpuOver) || lateAtHigh;
      overFraction += ((over ? 1 : 0) - overFraction) * (1 - Math.exp(-dt / windowS));
      inStateS += dt;
      if (holdS > 0) holdS -= dt;
      if (cap === AUTO_PRESENT_LOW_CAP) {
        cleanS = overFraction < riseFraction ? cleanS + dt : 0;
        if (cleanS >= riseHoldS && holdS <= 0) {
          cap = AUTO_PRESENT_HIGH_CAP;
          inStateS = 0;
          cleanS = 0;
        }
      } else if ((overFraction > fallFraction && inStateS >= 2) || (overFraction > 0.4 && inStateS >= 0.7)) {
        // A climb that lasted under 20 s was a mistake: wait twice as long before the next one.
        fallStreak = inStateS < 20 ? Math.min(fallStreak + 1, 4) : 0;
        holdS = fallHoldS * (2 ** fallStreak);
        cap = AUTO_PRESENT_LOW_CAP;
        inStateS = 0;
        cleanS = 0;
      }
      return cap;
    },
    getState() { return { cap, overFraction, cleanS, holdS, inStateS, budgetMs }; },
  };
}
