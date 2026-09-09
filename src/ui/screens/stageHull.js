// An authored, interactive ship turntable shared by New Game and Load.
// Asset readiness and first draw remain separate from the screen's ability to launch/load.
import { NEW_GAME } from '../../data/newGameDefaults.js';
import { createShipPreviewMount, dockInteriorIdForArchetype } from '../shipPreviewMount.js';
import { el, reducedMotion, cue } from '../kit/index.js';
import { createStageHullStatus } from './stageHullStatus.js';

const DRIFT_RAD_PER_S = 0.06;
const DRAW_INTERVAL_MS = 1000 / 30;
export const STAGE_HULL_ZOOM = 1.1;

function motionReduced(ctx) {
  return reducedMotion() || !!ctx?.state?.settings?.video?.motionReduce;
}

export function createStageHull(stageEl, { rootEl, zoom = STAGE_HULL_ZOOM, onReady } = {}) {
  stageEl.classList.add('cd-hull-stage');
  const canvas = el('canvas', 'k-world k-world--stage');
  canvas.setAttribute('aria-hidden', 'true');
  stageEl.prepend(canvas);
  const status = el('div', 'cd-hull-status', 'Preparing ship preview');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  stageEl.appendChild(status);
  const controls = el('div', 'cd-hull-controls');
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Ship preview controls');
  stageEl.appendChild(controls);

  let mount = null;
  let active = false;
  let disposed = false;
  let readyFired = false;
  let driftRaf = 0;
  let waitingTimer = 0;
  let ctxRef = null;
  let autoRotate = true;
  let drag = null;
  const listeners = new AbortController();
  const media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const state = createStageHullStatus(({ phase }) => {
    stageEl.dataset.previewState = phase;
    stageEl.setAttribute('aria-busy', String(phase === 'loading' || phase === 'waiting'));
    if (rootEl) rootEl.dataset.kReady = phase === 'ready' ? '1' : '0';
    status.hidden = phase === 'ready';
    status.textContent = phase === 'unavailable' ? 'Ship preview unavailable. Your controls still work.'
      : phase === 'waiting' ? 'Ship preview is still loading.' : 'Preparing ship preview';
    if (phase === 'ready') {
      clearTimeout(waitingTimer);
      if (!readyFired) { readyFired = true; onReady?.(); }
    }
  });

  function drawn(defId) {
    if (!mount || disposed) return;
    state.drawn(defId, mount.getAssetState());
  }
  try {
    mount = createShipPreviewMount(canvas, {
      dockId: dockInteriorIdForArchetype(null),
      authoredShips: true, authoredWarmup: true,
      fastPreview: false, allowFastFallback: false,
      onFirstFrame: ({ defId }) => drawn(defId),
      // shipPreviewMount renders the upgraded asset before publishing this event.
      onAssetSettled: ({ defId }) => drawn(defId),
    });
    mount.setActive(false);
  } catch (error) {
    state.unavailable();
    console.warn('[stageHull] ship preview unavailable', error);
  }

  function stopDrift() {
    if (driftRaf) cancelAnimationFrame(driftRaf);
    driftRaf = 0;
  }
  function startDrift() {
    stopDrift();
    if (!mount || !active || !autoRotate || disposed || document.hidden || motionReduced(ctxRef)) return;
    let last = null;
    const tick = (now) => {
      driftRaf = 0;
      if (!mount || !active || !autoRotate || disposed || document.hidden || motionReduced(ctxRef)) return;
      if (last == null) last = now;
      const elapsed = now - last;
      if (elapsed >= DRAW_INTERVAL_MS) {
        mount.rotateBy(Math.min(0.1, elapsed / 1000) * DRIFT_RAD_PER_S);
        last = now;
      }
      driftRaf = requestAnimationFrame(tick);
    };
    driftRaf = requestAnimationFrame(tick);
  }
  function manual(action) {
    if (!mount || disposed) return;
    autoRotate = false;
    stopDrift();
    action();
    cue('move');
  }
  const glyphs = {
    left: 'M16 6H9a5 5 0 0 0 0 10h7M10 2 6 6l4 4',
    right: 'M6 6h7a5 5 0 0 1 0 10H6M12 2l4 4-4 4',
    reset: 'M4 5v5h5M5 9a7 7 0 1 1 0 6',
    minus: 'M5 11h12',
    plus: 'M5 11h12M11 5v12',
  };
  const button = (label, glyph, action) => {
    const b = el('button', 'k-word k-word--fine cd-hull-control');
    b.type = 'button'; b.title = label; b.setAttribute('aria-label', label);
    b.innerHTML = `<svg viewBox="0 0 22 22" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter"><path d="${glyphs[glyph]}"/></svg>`;
    b.disabled = !mount;
    b.addEventListener('click', action, { signal: listeners.signal });
    controls.appendChild(b);
  };
  button('Turn ship left', 'left', () => manual(() => mount.rotateBy(-0.2)));
  button('Turn ship right', 'right', () => manual(() => mount.rotateBy(0.2)));
  button('Zoom out', 'minus', () => manual(() => mount.zoomBy(-0.12)));
  button('Zoom in', 'plus', () => manual(() => mount.zoomBy(0.12)));
  button('Reset ship view', 'reset', () => {
    if (!mount || disposed) return;
    mount.setYaw(0); mount.setZoom(zoom); autoRotate = true; startDrift(); cue('confirm');
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !mount || !active) return;
    drag = { id: event.pointerId, x: event.clientX };
    autoRotate = false; stopDrift();
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
  }, { signal: listeners.signal });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id || !mount) return;
    const dx = event.clientX - drag.x;
    drag.x = event.clientX;
    mount.rotateBy(dx * 0.008);
  }, { signal: listeners.signal });
  const endDrag = () => { drag = null; canvas.classList.remove('is-dragging'); };
  canvas.addEventListener('pointerup', endDrag, { signal: listeners.signal });
  canvas.addEventListener('pointercancel', endDrag, { signal: listeners.signal });
  canvas.addEventListener('lostpointercapture', endDrag, { signal: listeners.signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopDrift(); else startDrift();
  }, { signal: listeners.signal });
  const mediaChange = () => startDrift();
  media?.addEventListener('change', mediaChange);

  function show(defId, options = {}) {
    if (disposed) return;
    const selected = defId || NEW_GAME.shipId;
    readyFired = false;
    state.select(selected);
    clearTimeout(waitingTimer);
    waitingTimer = setTimeout(() => state.waiting(), 15000);
    if (!mount) { state.unavailable(); clearTimeout(waitingTimer); return; }
    try {
      mount.show(selected, {
        rotating: false,
        fittings: Array.isArray(options.fittings) ? options.fittings : null,
        weapons: Array.isArray(options.weapons) ? options.weapons : null,
        isPlayer: true,
      });
      mount.setZoom(zoom);
      // A cached authored model can draw synchronously without a second asset-swap event.
      drawn(mount.getDefId());
    } catch (error) {
      state.unavailable(); clearTimeout(waitingTimer);
      console.warn('[stageHull] ship preview failed', error);
    }
  }
  function activate(ctx) {
    if (disposed) return;
    ctxRef = ctx || ctxRef; active = true;
    mount?.setActive(true);
    // setActive draws once; never call mount.frame(), which owns an ongoing render loop.
    startDrift();
  }
  function deactivate() {
    active = false; stopDrift(); endDrag();
    clearTimeout(waitingTimer);
    mount?.setActive(false);
  }
  function dispose() {
    if (disposed) return;
    deactivate(); disposed = true; state.dispose(); listeners.abort();
    media?.removeEventListener('change', mediaChange);
    mount?.dispose(); mount = null;
    canvas.remove(); controls.remove(); status.remove();
    stageEl.classList.remove('cd-hull-stage');
  }
  return { canvas, hasMount: () => !!mount, isReady: () => state.snapshot().phase === 'ready',
    show, activate, deactivate, dispose };
}
