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
  // Max FPS. Keeps the light language (bloom, engine trails, energy materials — the game reads
  // black without them) and sheds the measured costs instead: shading resolution (pixel ratio 1x —
  // a 2x-DPI panel otherwise shades 4x the pixels; renderer.applyRendererSize), the tight
  // single-level bloom, and the low particle tier (the full sky tier locked an Intel iGPU to a
  // 30 fps frame — spaceBackground._resolveTier). CAS sharpening holds the 0.75 scale crisp.
  low: Object.freeze({
    id: 'low',
    label: 'High performance',
    adaptiveFloor: 0.5,
    renderScale: 0.75,
    pixelRatioCap: 1,
    bloom: true,
    bloomStrength: 0.40,
    bloomLevels: 1,
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
    particleQuality: 'low',
    frameCap: 0,
    dynamicResolution: false,
    postFx: true,
    sharpen: true,
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
    stays: Object.freeze(['bloom', 'engine trails', 'energy materials']),
    substitutes: Object.freeze([
      'pixel ratio 1x',
      'render scale 0.75 + sharpen',
      'tight single-level bloom',
      'low particles',
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
  const floor = clamp(Number(opts.floor) || 0.6, 0.2, 1);
  const apply = typeof opts.apply === 'function' ? opts.apply : () => {};
  const step = clamp(Number(opts.step) || 0.1, 0.05, 0.25);
  const downRatio = clamp(Number(opts.downRatio) || 1.16, 1.05, 1.5);
  const recoveryRatio = clamp(Number(opts.recoveryRatio) || 0.92, 0.6, 0.99);
  const raiseIntervalS = Number(opts.raiseIntervalS) || 24;
  const slowHoldS = Number(opts.slowHoldS) || 1.5;
  const trialWindowS = Number(opts.trialWindowS) || 2.5;
  const noBenefitCooldownS = Number(opts.noBenefitCooldownS) || 30;
  const outlierMs = Number(opts.outlierMs) || 100;
  const maxAcceptedMs = Number(opts.maxAcceptedMs) || 250;
  const SMOOTH = 0.12;
  const RESIZE_COOLDOWN_S = 5.0;
  const MIN_BENEFIT = clamp(Number(opts.minBenefit) || 0.06, 0.01, 0.3);

  let enabled = true;
  let scale = clamp(Number(opts.initialScale) || 1, floor, 1);
  let emaMs = 1000 / 60;
  let lowerCooldown = 0;
  let raiseTimer = 0;
  let slowTimer = 0;
  let trial = null;
  let noBenefitCooldown = 0;
  let slowFrameStreak = 0;

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
      if (!enabled) set(1); // restore full internal resolution when disabled
    },
    syncScale(value) {
      const next = Number(value);
      scale = clamp(Number.isFinite(next) ? next : 1, floor, 1);
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
            noBenefitCooldown = noBenefitCooldownS;
          }
          trial = null;
          slowTimer = 0;
          raiseTimer = 0;
          return;
        }
      }

      // A small sustained miss moves down one resolution band. The step is retained only when
      // the observed frame time improves; CPU/simulation bottlenecks restore the prior band.
      if (!trial && noBenefitCooldown <= 0 && slowTimer >= slowHoldS && scale > floor && lowerCooldown <= 0) {
        const previousScale = scale;
        set(scale - step);
        trial = { previousScale, baselineMs: emaMs, elapsed: 0 };
        lowerCooldown = RESIZE_COOLDOWN_S;
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
  };
}
