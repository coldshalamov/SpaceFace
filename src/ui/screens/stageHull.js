// A hull on a kit stage (design/frontend/direction/tasks/TASK_B_SHELL_AND_HUD.md §1.1, §1.2).
// The new-game and load screens both put a ship in its dock interior on `.k-stage`: the same
// shipPreviewMount the title uses, bounded to the stage instead of the title's 150 vw world canvas,
// with the title's slow yaw and its "photograph me" contract (`data-k-ready="1"` on the screen root
// once the authored hull has settled). No CSS lives here; `.k-world--stage` is a kit rule.
import { NEW_GAME } from '../../data/newGameDefaults.js';
import { createShipPreviewMount, dockInteriorIdForArchetype } from '../shipPreviewMount.js';
import { el, reducedMotion } from '../kit/index.js';

// The title's drift: ≈ 3.4° per second. The sheet says the hull turns very slowly, never spins.
const DRIFT_RAD_PER_S = 0.06;
export const STAGE_HULL_ZOOM = 1.1;

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
 */
export function createStageHull(stageEl, { rootEl, zoom = STAGE_HULL_ZOOM, onReady } = {}) {
  const canvas = el('canvas', 'k-world k-world--stage');
  canvas.setAttribute('aria-hidden', 'true');
  stageEl.prepend(canvas);

  let mount = null;
  let framed = false;
  let readyFired = false;
  let driftRaf = 0;
  let ctxRef = null;

  const ready = () => {
    if (rootEl) rootEl.dataset.kReady = '1';
    if (readyFired) return;
    readyFired = true;
    if (typeof onReady === 'function') onReady();
  };

  try {
    mount = createShipPreviewMount(canvas, {
      dockId: dockInteriorIdForArchetype(null),
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

  function show(defId, o = {}) {
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
    if (canvas.parentNode) canvas.remove();
  }

  return {
    canvas,
    hasMount: () => !!mount,
    isReady: () => readyFired,
    show,
    activate,
    deactivate,
    dispose,
  };
}
