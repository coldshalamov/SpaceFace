// src/render/adaptiveQuality.js — GPU capability detection + dynamic-resolution controller.
//
// SpaceFace is GPU present-bound: the sim/JS side fits the frame budget, but a weak/integrated GPU
// (or a browser that has fallen back to SOFTWARE rendering with hardware acceleration off) can't
// shade the full-res HDR scene + bloom composite in time and drops to a few fps. renderer.js uses
// this module to (a) identify the real renderer so it can warn the player + pick a per-tier floor,
// and (b) run a controller that trades INTERNAL resolution (state.render.dynResScale) for a smooth
// framerate. The controller never touches settings.video, so it fully recovers on a fast context.
//
// Contract (consumed by src/render/renderer.js):
//   detectGpu(renderer) -> { renderer:string, vendor:string, software:bool, tier:string }
//   createAdaptiveResolution({ floor, apply }) -> { setEnabled(bool), update(frameDt), getScale() }
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
  else if (!rendererStr) tier = 'unknown';
  else if (INTEGRATED_RE.test(rendererStr)) tier = 'integrated';
  else tier = 'discrete';

  return {
    renderer: rendererStr || 'unknown',
    vendor: vendorStr || 'unknown',
    software,
    tier,
  };
}

// --- Player quality presets -------------------------------------------------------------------
// Low / Medium / High are the player-facing presets. Each one maps to an adaptive-quality tier: the
// internal-resolution posture (dynamic-resolution floor + persisted render scale) and the optional
// presentation features that tier may use. A preset NEVER changes simulation content — no actor,
// spawn, cargo, mission, or economy count is read or written; it only trades rendering quality for
// headroom. Medium is the shipped default and matches the gameState video defaults.
//
// Presets deliberately do not disable authored world content (ships, trails, stations): they lower
// resolution and particle density, not the number of things in the world.
export const ADAPTIVE_QUALITY_TIERS = Object.freeze({
  low: Object.freeze({
    id: 'low',
    label: 'Low',
    adaptiveFloor: 0.5,
    renderScale: 0.75,
    bloom: true,
    shadows: true,
    energyMaterials: true,
    renderGraph: false,
    engineTrails: true,
    particleQuality: 'low',
  }),
  medium: Object.freeze({
    id: 'medium',
    label: 'Medium',
    adaptiveFloor: 0.6,
    renderScale: 1,
    bloom: true,
    shadows: true,
    energyMaterials: true,
    renderGraph: false,
    engineTrails: true,
    particleQuality: 'medium',
  }),
  high: Object.freeze({
    id: 'high',
    label: 'High',
    adaptiveFloor: 0.6,
    renderScale: 1,
    bloom: true,
    shadows: true,
    energyMaterials: true,
    renderGraph: true,
    engineTrails: true,
    particleQuality: 'high',
  }),
});

export const QUALITY_PRESETS = Object.freeze([
  Object.freeze({ id: 'low', label: 'Low', tier: 'low' }),
  Object.freeze({ id: 'medium', label: 'Medium', tier: 'medium' }),
  Object.freeze({ id: 'high', label: 'High', tier: 'high' }),
]);
export const DEFAULT_QUALITY_PRESET = 'medium';

const QUALITY_PRESET_IDS = new Set(QUALITY_PRESETS.map((p) => p.id));
const PRESET_VIDEO_KEYS = Object.freeze([
  'renderScale', 'bloom', 'shadows', 'energyMaterials', 'renderGraph', 'engineTrails', 'particleQuality',
]);

/** The adaptive-quality tier a preset selects. An unknown id falls back to the default preset. */
export function qualityTierForPreset(presetId) {
  const id = QUALITY_PRESET_IDS.has(presetId) ? presetId : DEFAULT_QUALITY_PRESET;
  return ADAPTIVE_QUALITY_TIERS[id];
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
  if (video.qualityPreset !== tier.id) { video.qualityPreset = tier.id; changed.push('qualityPreset'); }
  return { preset: tier.id, tier: tier.id, changed };
}

// --- Frame cap --------------------------------------------------------------------------------
// 30 / 60 / 120 / off, with VSync honoured. `off` (0) means "no explicit cap": with VSync on the
// effective cap is the display refresh; with VSync off it is uncapped (0). A cap never exceeds the
// display refresh — a 120 request on a 60 Hz panel resolves to 60. The controller mirrors the
// adaptive-resolution controller: it reports the effective cap through an `apply` callback and
// never writes settings.video itself, so a settings edit and a runtime override stay separate.
export const FRAME_CAP_OPTIONS = Object.freeze([30, 60, 120, 0]);

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

// Frame-time-driven resolution controller. Smooths frame time (EMA) and backs the internal scale down
// a step when sustained slower than the down-threshold. Recovery is the tricky part: because browser
// rAF floors frame times at the display refresh (~16.7 ms on a 60 Hz panel), a GPU with tons of
// headroom looks identical to one that is barely keeping up — you cannot observe "fast frames". So
// instead of waiting for sub-threshold frames to raise, the controller PROBES UP on a timer
// (raiseIntervalS); if the higher resolution can't be sustained, the back-off path simply lowers it
// again. On a healthy GPU the frame time never crosses the down-threshold, so the scale rides at 1.
export function createAdaptiveResolution(opts = {}) {
  const floor = clamp(Number(opts.floor) || 0.6, 0.2, 1);
  const apply = typeof opts.apply === 'function' ? opts.apply : () => {};
  const step = clamp(Number(opts.step) || 0.05, 0.01, 0.25);
  // Dynamic resizing reallocates renderer/bloom targets, which is itself a visible hitch on some
  // drivers. Treat it as an emergency fallback for sustained bad frames, not routine frame pacing.
  const downMs = Number(opts.downMs) || 48;
  const raiseIntervalS = Number(opts.raiseIntervalS) || 20; // probe-up cadence (vsync gotcha)
  const slowHoldS = Number(opts.slowHoldS) || 1.5;
  const SMOOTH = 0.1;             // EMA weight per frame
  const LOWER_COOLDOWN_S = 4.0;   // resize target reallocs are expensive; do them rarely

  let enabled = true;
  let scale = 1;
  let emaMs = 1000 / 60;
  let lowerCooldown = 0;
  let raiseTimer = 0;
  let slowTimer = 0;

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
      if (!enabled) set(1); // restore full internal resolution when disabled
    },
    update(frameDt) {
      if (!enabled) return;
      const dt = Number(frameDt) || 0;
      const ms = clamp(dt * 1000, 1, 200);
      emaMs += (ms - emaMs) * SMOOTH;
      if (lowerCooldown > 0) lowerCooldown -= dt;
      raiseTimer += dt;
      slowTimer = emaMs > downMs ? slowTimer + dt : 0;
      // Back off only under sustained severe slowness; one-off hitches should not cause a resize
      // and then create more hitches through render-target reallocation.
      if (slowTimer >= slowHoldS && scale > floor && lowerCooldown <= 0) {
        set(scale - step);
        lowerCooldown = LOWER_COOLDOWN_S;
        raiseTimer = 0;
        slowTimer = 0;
        return;
      }
      // Periodic probe-up (see header: rAF can't reveal headroom on a vsync-capped display).
      if (raiseTimer >= raiseIntervalS && scale < 1 && emaMs <= downMs && lowerCooldown <= 0) {
        set(scale + step);
        raiseTimer = 0;
        slowTimer = 0;
      }
    },
    getScale() { return scale; },
  };
}
