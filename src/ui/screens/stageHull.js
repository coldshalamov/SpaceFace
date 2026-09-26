// A hull on a kit stage (design/frontend/direction/tasks/TASK_B_SHELL_AND_HUD.md §1.1, §1.2).
// The new-game and load screens both put a ship in its dock interior on `.k-stage`: the same
// shipPreviewMount the title uses, bounded to the stage instead of the title's 150 vw world canvas,
// with the title's slow yaw and its "photograph me" contract (`data-k-ready="1"` on the screen root
// once the authored hull has settled). No CSS lives here; `.k-world--stage` is a kit rule.
import { NEW_GAME } from '../../data/newGameDefaults.js';
import { createShipPreviewMount, dockInteriorIdForArchetype } from '../shipPreviewMount.js';
import { el, reducedMotion } from '../kit/index.js';
import { hullPosterUrl } from '../hullPosters.js';

// The title's drift: ≈ 3.4° per second. The sheet says the hull turns very slowly, never spins.
const DRIFT_RAD_PER_S = 0.06;
export const STAGE_HULL_ZOOM = 1.1;
// The loading shell fades in over 0.8 s (#boot-overlay in styles/intro.css). A screen that hands its
// stage to the shell frees the hull's WebGL context with release() once the shell covers it.
export const STAGE_HULL_RELEASE_MS = 900;

function motionReduced(ctx) {
  const video = ctx && ctx.state && ctx.state.settings && ctx.state.settings.video;
  return reducedMotion() || !!(video && video.motionReduce);
}

/**
 * @param {HTMLElement} stageEl  the screen's `.k-stage`
 * @param {object} o
 * @param {HTMLElement} o.rootEl   the screen root; receives data-k-ready
 * @param {number} [o.zoom]
 * @param {() => void} [o.onReady]  fires once the authored hull has drawn (the arrival moment)
 * @param {Function} [o.mountFactory]  the preview mount constructor; tests substitute a fake
 * @param {boolean} [o.live]  mount the live hull (default); false keeps the produced poster as the stage and mounts a
 *                              live hull only for a ship with no poster (New Game: the hero never changes ship)
 * @param {boolean} [o.dock]  draw the hull in its dock interior (default); false draws the hull alone on a
 *                              transparent canvas, for a stage that is its own instrument (New Game's ring)
 */
export function createStageHull(stageEl, {
  rootEl, zoom = STAGE_HULL_ZOOM, onReady, mountFactory = createShipPreviewMount, dock = true, live = true,
} = {}) {
  let canvas = null;
  let mount = null;
  let framed = false;
  let readyFired = false;
  let driftRaf = 0;
  let ctxRef = null;
  let released = false;

  // The produced render of the hull on show (src/ui/hullPosters.js). It sits over the canvas until
  // the authored hull has drawn, then fades out (.k-stage.is-live, a kit rule): the stage is never
  // an empty frame, not while the GLB streams in and not where WebGL never arrives.
  const poster = el('img', 'k-stage__poster');
  poster.alt = '';
  poster.setAttribute('aria-hidden', 'true');
  poster.decoding = 'async';
  poster.draggable = false;
  stageEl.prepend(poster);
  const setPoster = (defId) => {
    const url = hullPosterUrl(defId || NEW_GAME.shipId);
    if (url) { if (poster.getAttribute('src') !== url) poster.src = url; poster.hidden = false; }
    else { poster.removeAttribute('src'); poster.hidden = true; }
    // With a poster the canvas stays hidden until live (it clears to an opaque frame while the dock
    // and hull stream in); a hull with no render keeps the old behaviour and shows the canvas at once.
    if (stageEl.classList) stageEl.classList.toggle('has-poster', !!url);
  };
  const setLive = (on) => { if (stageEl.classList) stageEl.classList.toggle('is-live', !!on); };
  // a poster-only stage is ready as soon as it shows its poster: it never goes live, so the poster stays up
  const posterReady = () => {
    if (rootEl) rootEl.dataset.kReady = '1';
    if (readyFired) return;
    readyFired = true;
    if (typeof onReady === 'function') onReady();
  };

  const ready = () => {
    setLive(true);
    if (rootEl) rootEl.dataset.kReady = '1';
    if (readyFired) return;
    readyFired = true;
    if (typeof onReady === 'function') onReady();
  };

  function mountHull() {
    canvas = el('canvas', 'k-world k-world--stage');
    canvas.setAttribute('aria-hidden', 'true');
    // Before the poster in document order: both sit at the kit's z-index -1, so the poster paints
    // over the canvas until the stage goes live.
    stageEl.prepend(canvas);
    try {
      mount = mountFactory(canvas, {
        dockId: dock ? dockInteriorIdForArchetype(null) : null,
        authoredShips: true,
        authoredWarmup: true,
        fastPreview: false,
        allowFastFallback: false,
        onFirstFrame: () => {
          framed = true;
          if (mount && mount.getAssetState() === 'authored') ready();
        },
        onAssetSettled: ({ state }) => { if (state === 'authored') ready(); },
      });
    } catch (e) {
      mount = null;
      console.warn('[stageHull] hull mount unavailable; the screen renders without it', e);
    }
  }
  if (live) mountHull();

  function show(defId, o = {}) {
    const next = defId || NEW_GAME.shipId;
    setPoster(next);
    // poster-only: the produced render IS the stage; a ship without one falls back to the live hull
    if (!live && !poster.hidden) { posterReady(); return; }
    if (!live && !mount && !released) mountHull();
    // A different hull is not on the glass until its own authored frame; the poster covers the swap.
    if (!mount || (typeof mount.getDefId === 'function' && mount.getDefId() !== next)) setLive(false);
    if (!mount) return;
    try {
      mount.show(defId || NEW_GAME.shipId, {
        rotating: false,
        fittings: Array.isArray(o.fittings) ? o.fittings : null,
        weapons: Array.isArray(o.weapons) ? o.weapons : null,
        isPlayer: true,
      });
      mount.setZoom(zoom);
    } catch (e) {
      console.warn('[stageHull] hull show failed', e);
    }
  }

  function stopDrift() {
    if (driftRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(driftRaf);
    driftRaf = 0;
  }
  function startDrift() {
    stopDrift();
    if (!mount) return;
    if (motionReduced(ctxRef) || typeof requestAnimationFrame !== 'function') {
      try { mount.frame(); } catch (_) {}
      return;
    }
    let last = null;
    const tick = (nowMs) => {
      if (!mount) { driftRaf = 0; return; }
      // The Launch path replaces the screen stack without always routing through onHide, which used
      // to leave this drift running for the whole flight — a second WebGL context re-rendered every
      // frame behind the world. A stage that has left layout cannot be seen, so stop; activate()
      // starts a fresh drift if the screen comes back.
      if (!canvas.isConnected || canvas.clientWidth < 1 || canvas.clientHeight < 1) {
        driftRaf = 0;
        try { mount.setActive(false); } catch (_) {}
        return;
      }
      const now = Number.isFinite(nowMs) ? nowMs : performance.now();
      const dt = last == null ? 0 : Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      if (motionReduced(ctxRef)) { driftRaf = 0; return; }
      try { mount.rotateBy(dt * DRIFT_RAD_PER_S); } catch (_) {}
      driftRaf = requestAnimationFrame(tick);
    };
    driftRaf = requestAnimationFrame(tick);
  }

  function activate(ctx) {
    ctxRef = ctx || ctxRef;
    if (!mount) return;
    try { mount.setActive(true); } catch (_) {}
    startDrift();
  }
  function deactivate() {
    stopDrift();
    if (mount) try { mount.setActive(false); } catch (_) {}
  }
  function dispose() {
    stopDrift();
    if (mount) { try { mount.dispose(); } catch (_) {} mount = null; }
    if (canvas && canvas.parentNode) canvas.remove();
  }
  // Launch hands the stage to the loading shell for the whole load, but the mount's WebGL context
  // kept drifting, linking and uploading behind it until flight (profiled: 2.4 s of main thread in
  // the drift renders alone during gpu-resources). release() disposes the mount and takes its canvas
  // off the stage; the mount stops drawing at once and force-loses the context when the context's own
  // shaders have finished linking (losing it mid-link froze a fresh install's loading screen 1.9 s).
  // A lost context cannot be revived on the same canvas, so restore() builds a fresh canvas and mount
  // when a failed start hands the screen back.
  function release() {
    if (released) return false;
    released = true;
    dispose();
    return true;
  }
  function restore() {
    if (!released) return false;
    released = false;
    setLive(false);
    if (live) mountHull();
    return true;
  }

  return {
    get canvas() { return canvas; },
    get poster() { return poster; },
    hasMount: () => !!mount,
    isReady: () => readyFired,
    show,
    activate,
    deactivate,
    release,
    restore,
    dispose,
  };
}
