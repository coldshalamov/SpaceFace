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
