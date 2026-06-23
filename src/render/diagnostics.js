// Renderer / performance diagnostics (ARCHITECTURE §2.4 draw pipeline). A read-only presentation-layer
// probe: it samples the live WebGLRenderer's draw stats + per-frame timing and publishes a snapshot on
// window.__THREE_GAME_DIAGNOSTICS__. It NEVER touches sim state and issues no draws of its own.
//
// WIRING (done by the lead, NOT here): after render is up, call
//     const diag = installDiagnostics(renderer, { particles, entities });
//   then once per frame, AS THE LAST THING in renderUpdate (registry.js renderUpdate, after
//   render.renderFrame / vfx / feel / ui — all of which run after the draw and add no draw calls):
//     diag.update(frameDt);
//   `frameDt` is the loop's wall-clock seconds (loop.js: `now-last`/1000, clamped to 0.25).
//
// WHY "after the draw, once per frame" is load-bearing:
//   renderer.info.render.{calls,triangles,points,lines} are PER-render() counters. By default
//   info.autoReset === true, so they zero at the START of every renderer.render() call. The bloom
//   path (bloom.js) issues several render() calls per frame — one scene render plus a pyramid of
//   fullscreen downsample/upsample blits — so a naive read would see only the LAST pass (~1 draw
//   call) instead of the true frame total. installDiagnostics sets renderer.info.autoReset = false
//   and update() calls renderer.info.reset() at the END of each sample, so calls/triangles
//   ACCUMULATE across every pass of the frame and reflect the real total. The mechanism is
//   pass-count-agnostic: whatever the pyramid depth, the totals stay correct.
//   The contract: update() MUST be called exactly once per frame (after the draw). Skipping it makes
//   info.render.* over-accumulate; calling it twice halves the reported counts.
//
// No THREE import: this module only reads a passed-in renderer and uses typed arrays.

const RING_N = 180; // ~3s of history at 60fps; sized for a stable p95 without per-frame churn

/**
 * Install the diagnostics probe on a live renderer.
 * @param {object} renderer - THREE.WebGLRenderer (we read renderer.info; we flip info.autoReset).
 * @param {object} [opts]
 * @param {() => number} [opts.particles] - getter for live particle count   (e.g. () => SF.registry.get('vfx')._liveCount)
 * @param {() => number} [opts.entities]  - getter for live entity count     (e.g. () => SF.state.entityList.length)
 * @param {() => number} [opts.sprites]   - getter for live sprite count     (optional)
 * @param {() => number} [opts.lights]    - getter for active dynamic lights (optional)
 * @param {() => object} [opts.perf]       - getter for perfRuntime report    (optional)
 * @param {() => object} [opts.settings]   - getter for settings metadata     (optional)
 * @param {boolean} [opts.overlay] - create+show the on-screen overlay immediately (default false).
 * @returns {{ update(dt:number):void, getReport():object, setOverlay(on:boolean):void,
 *            toggleOverlay():boolean, get overlay():boolean, dispose():void }}
 */
export function installDiagnostics(renderer, opts = {}) {
  // Preallocated ring buffers — NO per-frame object/array allocation. Frame times stored in ms.
  const ftMs = new Float64Array(RING_N);   // rolling frame-time samples (ms)
  const sortScratch = new Float64Array(RING_N); // reused for p95 sort in getReport (never per-frame)
  let head = 0;     // write cursor
  let count = 0;    // filled entries (<= RING_N)

  // Latest-frame scalars (cheap to keep up to date each sample; report reads these directly).
  let lastMs = 0;
  let fps = 0;
  let fpsEma = 0;          // smoothed FPS (reads steadier than instantaneous 1000/ms)
  const EMA_A = 0.1;       // EMA weight for the displayed FPS

  // Mirror of renderer.info (refreshed each sample; no allocation — fields written in place).
  const info = {
    calls: 0, triangles: 0, points: 0, lines: 0,
    geometries: 0, textures: 0, programs: 0,
  };

  // Optional gameplay counters (filled from opts getters when present).
  const counts = { particles: 0, sprites: 0, entities: 0, lights: 0 };

  // Take over the per-render auto-reset so multi-pass frames (bloom) accumulate (see header).
  let prevAutoReset = true;
  try { prevAutoReset = renderer.info.autoReset; renderer.info.autoReset = false; }
  catch (_) { /* renderer.info shape unexpected — degrade to whatever it gives us */ }

  // ---- on-screen overlay (lazy; off by default; NOT auto-enabled) ----
  let overlayEl = null;
  let overlayOn = false;
  let overlayAcc = 0;            // throttle accumulator (seconds)
  const OVERLAY_HZ = 5;          // DOM text refresh rate — don't rewrite every frame

  function ensureOverlay() {
    if (overlayEl || typeof document === 'undefined' || !document.body) return;
    const el = document.createElement('div');
    el.id = 'sf-diagnostics';
    // Inline style only — we do NOT modify index.html and add no stylesheet.
    el.style.cssText = [
      'position:fixed', 'top:8px', 'left:8px', 'z-index:99999',
      'font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      'color:#9fe6ff', 'background:rgba(6,9,18,0.72)', 'padding:6px 8px',
      'border:1px solid rgba(80,160,255,0.35)', 'border-radius:5px',
      'white-space:pre', 'pointer-events:none', 'text-shadow:0 1px 2px #000',
    ].join(';');
    document.body.appendChild(el);
    overlayEl = el;
  }

  function setOverlay(on) {
    overlayOn = !!on;
    if (overlayOn) { ensureOverlay(); if (overlayEl) overlayEl.style.display = 'block'; }
    else if (overlayEl) overlayEl.style.display = 'none';
  }

  function refreshOverlayText() {
    if (!overlayEl) return;
    // textContent (never innerHTML) — no markup, no injection surface.
    overlayEl.textContent =
      'FPS ' + fpsEma.toFixed(0) + '  (' + lastMs.toFixed(2) + 'ms)\n' +
      'calls ' + info.calls + '  tris ' + info.triangles + '\n' +
      'geo ' + info.geometries + '  tex ' + info.textures + '  prog ' + info.programs + '\n' +
      'part ' + counts.particles + '  ent ' + counts.entities;
  }

  function resetFrameStats() {
    ftMs.fill(0);
    sortScratch.fill(0);
    head = 0;
    count = 0;
    lastMs = 0;
    fps = 0;
    fpsEma = 0;
    overlayAcc = 0;
  }

  // ---- per-frame sample (called once per frame, AFTER the draw) ----
  function update(dt) {
    // dt is seconds (loop frameDt). Guard non-positive / NaN (paused tab, first frame).
    const ms = (typeof dt === 'number' && dt > 0) ? dt * 1000 : lastMs;
    if (ms > 0) {
      lastMs = ms;
      fps = 1000 / ms;
      fpsEma = fpsEma > 0 ? fpsEma + (fps - fpsEma) * EMA_A : fps;
      ftMs[head] = ms;
      head = (head + 1) % RING_N;
      if (count < RING_N) count++;
    }

    // Mirror renderer.info IN PLACE (no allocation). render.* has accumulated across every pass.
    const ri = renderer.info;
    if (ri) {
      if (ri.render) {
        info.calls = ri.render.calls | 0;
        info.triangles = ri.render.triangles | 0;
        info.points = ri.render.points | 0;
        info.lines = ri.render.lines | 0;
      }
      if (ri.memory) {
        info.geometries = ri.memory.geometries | 0;
        info.textures = ri.memory.textures | 0;
      }
      // programs is null until the first shader compiles; not a per-frame counter.
      info.programs = ri.programs ? ri.programs.length : 0;
      // We own the reset (autoReset disabled): clear render.* now so NEXT frame starts at zero and
      // accumulates afresh across its passes.
      if (typeof ri.reset === 'function') ri.reset();
    }

    // Pull optional gameplay counters (only if a getter was provided).
    if (typeof opts.particles === 'function') counts.particles = num(opts.particles());
    if (typeof opts.sprites === 'function') counts.sprites = num(opts.sprites());
    if (typeof opts.entities === 'function') counts.entities = num(opts.entities());
    if (typeof opts.lights === 'function') counts.lights = num(opts.lights());

    // Overlay: throttled DOM write (~OVERLAY_HZ), only when visible.
    if (overlayOn) {
      overlayAcc += (typeof dt === 'number' && dt > 0) ? dt : 0;
      if (overlayAcc >= 1 / OVERLAY_HZ) { overlayAcc = 0; refreshOverlayText(); }
    }
  }

  // ---- snapshot (allocation here is fine — NOT a hot path) ----
  function getReport() {
    let min = Infinity, max = 0, sum = 0;
    for (let i = 0; i < count; i++) {
      const v = ftMs[i];
      sortScratch[i] = v;
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (count === 0) { min = 0; max = 0; }
    const avg = count ? sum / count : 0;

    // p95 frame time: sort the reused scratch subarray (once, on demand — never per frame).
    let p95 = 0;
    if (count > 0) {
      const sub = sortScratch.subarray(0, count);
      Array.prototype.sort.call(sub, (a, b) => a - b);
      const idx = Math.min(count - 1, Math.floor(0.95 * (count - 1)));
      p95 = sub[idx];
    }

    const out = {
      fps: fps,
      fpsAvg: avg > 0 ? 1000 / avg : 0,
      fpsEma: fpsEma,
      frameMs: { last: lastMs, avg, min: min === Infinity ? 0 : min, max, p95 },
      samples: count,
      render: { calls: info.calls, triangles: info.triangles, points: info.points, lines: info.lines },
      memory: { geometries: info.geometries, textures: info.textures, programs: info.programs },
      counts: { particles: counts.particles, sprites: counts.sprites, entities: counts.entities, lights: counts.lights },
    };
    if (typeof opts.perf === 'function') out.perf = safeObject(opts.perf());
    if (typeof opts.settings === 'function') out.settings = safeObject(opts.settings());
    return out;
  }

  function toggleOverlay() { setOverlay(!overlayOn); return overlayOn; }

  function dispose() {
    try { renderer.info.autoReset = prevAutoReset; } catch (_) { /* ignore */ }
    if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    overlayEl = null; overlayOn = false;
    if (typeof window !== 'undefined' && window.__THREE_GAME_DIAGNOSTICS__ === api) {
      delete window.__THREE_GAME_DIAGNOSTICS__;
    }
  }

  const api = {
    update,
    getReport,
    reset: resetFrameStats,
    setOverlay,
    toggleOverlay,
    get overlay() { return overlayOn; },
    dispose,
    // expose the raw mirrors for ad-hoc console poking (read-only intent)
    info,
    counts,
    RING_N,
  };

  // Publish the global handle the spec asks for. The overlay stays OFF until setOverlay(true).
  if (typeof window !== 'undefined') window.__THREE_GAME_DIAGNOSTICS__ = api;
  if (opts.overlay) setOverlay(true);

  return api;
}

// coerce a getter result to a finite number (getters may return undefined before systems are up)
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function safeObject(v) { return v && typeof v === 'object' ? v : {}; }

// ARCHITECTURE §9 naming convenience — keep a capitalized alias available too.
export { installDiagnostics as Diagnostics };
