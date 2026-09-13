import { createTerminalArtwork, ensureBootTerminalCanvas } from './loadingTerminalArt.js';

const DEFAULT_STAGE = Object.freeze({
  id: 'restoring-save',
  progress: 0.05,
  label: 'Restoring flight state',
  detail: 'Rebuilding the current sector and critical visuals',
});

// Stage events arrive as sparse steps (0.08 → 0.25 → 0.5 …); writing them straight to the bar
// made the loader click between values and sit parked while a stage ran. The displayed value
// instead chases a moving goal through a velocity-lagged approach: it accelerates smoothly out
// of each completed stage, eases in over a tail a little slower than the ramp-up, then keeps
// creeping — asymptotically slower — into a small overhang past the last reported stage so a
// long-running stage never looks stuck.
const PROGRESS_GAIN = 3.4;       // approach rate toward the goal (1/s)
const PROGRESS_VEL_TAU = 0.13;   // velocity lag in seconds — the "accelerate off the step" ramp
const PROGRESS_VEL_MAX = 1.1;    // bound on bar speed (progress/s)
const PROGRESS_OVERHANG = 0.06;  // creep headroom past the last stage while it runs
const PROGRESS_CREEP_TAU = 6.5;  // seconds for that headroom to open fully while waiting
const PROGRESS_CAP = 0.985;      // 100% is only ever shown when a stage actually reports it

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** DOM-only loading presenter shared by browser and Electron's one game route. */
export function createLoadingPresenter({ document, bus, hideDelayMs = 600 } = {}) {
  if (!document || !bus || typeof bus.on !== 'function') {
    return { show() {}, hide() {}, destroy() {} };
  }
  const overlay = document.getElementById ? document.getElementById('boot-overlay') : null;
  const label = document.querySelector ? document.querySelector('[data-loading-label]') : null;
  const detail = document.querySelector ? document.querySelector('[data-loading-detail]') : null;
  const progress = document.querySelector ? document.querySelector('[data-loading-progress]') : null;
  const pctEl = document.querySelector ? document.querySelector('[data-loading-pct]') : null;
  if (!overlay) return { show() {}, hide() {}, destroy() {} };

  const raf = typeof globalThis.requestAnimationFrame === 'function'
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : null;
  const cancelRaf = typeof globalThis.cancelAnimationFrame === 'function'
    ? globalThis.cancelAnimationFrame.bind(globalThis)
    : null;

  const waveformCanvas = document.getElementById ? document.getElementById('boot-waveform-canvas') : null;
  // The loading screen's artwork is DECORATION. It must never be able to stop the game from
  // starting — and it has: createTerminalArtwork threw InvalidStateError out of boot (the canvas
  // was being set up twice and transferControlToOffscreen is irreversible), which meant the boot
  // overlay was never hidden and the game hung on the loading screen indefinitely.
  //
  // The underlying re-entrancy is fixed in loadingTerminalArt.js. This guard is here so that the
  // NEXT bug in the artwork costs the player a missing animation instead of the whole game.
  const NO_ART = { updateProgress() {}, start() {}, stop() {}, destroy() {} };
  // The artwork is acquired lazily and rebuilt after release. hide() destroys the instance once
  // the hide fade ends — its worker owns a WebGL2 context, and a stopped worker still holds it,
  // which is how boot-terminal-canvas stayed connected with live GL programs through whole
  // flights (2026-09-10 canvas census) — and the next show() builds a fresh one on a virgin
  // canvas, because destroy() detaches the transferred element and it can never host another.
  let terminalArt = null;
  const artwork = () => {
    if (terminalArt) return terminalArt;
    const canvas = ensureBootTerminalCanvas(document);
    if (!canvas) return NO_ART;
    try {
      terminalArt = createTerminalArtwork({ canvas, waveformCanvas, overlay, document }) || NO_ART;
    } catch (err) {
      try { console.warn('[boot] loading artwork failed; continuing without it', err); } catch (_) {}
      terminalArt = NO_ART;
    }
    return terminalArt;
  };

  let hideTimer = null;
  let activeStage = null;

  // Smoothed progress model. `targetProgress` is the last stage's honest value; the bar eases
  // toward it and then keeps inching into the overhang while that stage runs. All timestamps
  // come from the rAF clock so a busy main thread pauses the animation rather than jumping it.
  let displayProgress = 0;
  let displayVel = 0;
  let targetProgress = DEFAULT_STAGE.progress;
  let targetAt = null;         // rAF-clock timestamp of the last stage change; null = next tick
  let lastFrameAt = null;
  let progressRaf = null;

  const reducedMotion = () => {
    try {
      if (document.documentElement && document.documentElement.classList
          && document.documentElement.classList.contains('sf-reduce-motion')) return true;
      if (typeof globalThis.matchMedia === 'function'
          && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    } catch (_) {}
    return false;
  };

  const paintProgress = () => {
    const shown = clamp01(displayProgress);
    if (progress) progress.style.width = `${(shown * 100).toFixed(2)}%`;
    if (pctEl) pctEl.textContent = `${Math.round(shown * 100)}%`;
    // Feed the smoothed value to the artwork so its segment bar, pct and worker morphs move
    // with the bar instead of stepping. NO_ART keeps this a no-op when the canvas is absent.
    (terminalArt || NO_ART).updateProgress({
      id: activeStage && activeStage.id ? activeStage.id : 'loading',
      progress: shown,
    });
  };

  const tickProgress = (ts) => {
    progressRaf = null;
    if (overlay.style.display === 'none') return; // fully hidden — the loop's job is done
    const t = Number.isFinite(ts) ? ts
      : (typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
        ? performance.now() : Date.now());
    const dt = lastFrameAt == null ? 0 : Math.min(0.1, Math.max(0, (t - lastFrameAt) / 1000));
    lastFrameAt = t;
    if (targetAt == null) targetAt = t;
    if (reducedMotion()) {
      displayProgress = targetProgress;
      displayVel = 0;
    } else {
      const waitingS = Math.max(0, (t - targetAt) / 1000);
      const creep = PROGRESS_OVERHANG * (1 - Math.exp(-waitingS / PROGRESS_CREEP_TAU));
      const goal = targetProgress >= 1 ? 1 : Math.min(targetProgress + creep, PROGRESS_CAP);
      let desired = (goal - displayProgress) * PROGRESS_GAIN;
      if (desired > PROGRESS_VEL_MAX) desired = PROGRESS_VEL_MAX;
      else if (desired < -PROGRESS_VEL_MAX) desired = -PROGRESS_VEL_MAX;
      displayVel += (desired - displayVel) * (1 - Math.exp(-dt / PROGRESS_VEL_TAU));
      displayProgress = clamp01(displayProgress + displayVel * dt);
    }
    paintProgress();
    progressRaf = raf(tickProgress);
  };

  const ensureProgressLoop = () => {
    if (raf && progressRaf == null) {
      lastFrameAt = null;
      progressRaf = raf(tickProgress);
    }
  };
  const stopProgressLoop = () => {
    if (progressRaf != null && cancelRaf) cancelRaf(progressRaf);
    progressRaf = null;
  };
  let initialBoot = !overlay.classList?.contains?.('hidden');
  let initialBootStartTime = Date.now();
  const MIN_BOOT_DISPLAY_MS = 9500; // ~10s full music video loop on initial launch

  // Allow clicking or pressing any key to skip initial boot at any time
  const handleUserSkip = () => {
    if (initialBoot) {
      initialBoot = false;
      if (pendingHide) {
        const fn = pendingHide;
        pendingHide = null;
        fn();
      }
    }
  };

  if (document && typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', handleUserSkip, { passive: true, once: true });
    document.addEventListener('pointerdown', handleUserSkip, { passive: true, once: true });
  }

  let pendingHide = null;

  // If overlay is initially visible, start terminal artwork immediately
  if (!overlay.classList?.contains?.('hidden')) {
    const initial = artwork();
    initial.start();
    initial.updateProgress(DEFAULT_STAGE);
    displayProgress = DEFAULT_STAGE.progress;
    paintProgress();
    ensureProgressLoop();
  }

  const show = (stage = DEFAULT_STAGE) => {
    if (hideTimer != null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    const amount = clamp01(Number(stage.progress) || 0);
    const wasHidden = Boolean(overlay.classList?.contains?.('hidden'))
      || overlay.style.display === 'none';
    const stageChanged = !activeStage || activeStage.id !== stage.id
      || Math.abs((Number(activeStage.progress) || 0) - amount) > 1e-6;
    activeStage = stage;
    overlay.style.display = 'flex';
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-busy', 'true');
    overlay.dataset.loadingStage = String(stage.id || 'loading');
    if (label) label.textContent = String(stage.label || DEFAULT_STAGE.label);
    if (detail) detail.textContent = String(stage.detail || 'Preparing the playable scene');
    if (!raf) {
      // No animation clock (probes, unit tests): keep the honest step write.
      if (progress) progress.style.width = `${Math.round(amount * 100)}%`;
      if (pctEl) pctEl.textContent = `${Math.round(amount * 100)}%`;
    } else {
      targetProgress = amount;
      // A fresh session or a regressed target snaps to the reported step; a re-show of the
      // same stage keeps the creep clock so the bar doesn't visibly drop its headroom.
      if (stageChanged || wasHidden) targetAt = null;
      if (wasHidden || amount < displayProgress - 1e-4) {
        displayProgress = amount;
        displayVel = 0;
        paintProgress();
      }
      ensureProgressLoop();
    }

    const art = artwork();
    art.start();
    art.updateProgress(raf ? { ...stage, progress: clamp01(displayProgress) } : stage);
  };

  const hide = (force = false) => {
    if (initialBoot && !force) {
      const elapsed = Date.now() - initialBootStartTime;
      if (elapsed < MIN_BOOT_DISPLAY_MS) {
        pendingHide = () => hide(true);
        setTimeout(() => {
          if (pendingHide) {
            const fn = pendingHide;
            pendingHide = null;
            fn();
          }
        }, MIN_BOOT_DISPLAY_MS - elapsed);
        return;
      }
    }
    initialBoot = false;
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-busy', 'false');
    // Let the bar run out to 100% while the shell fades; the loop stops when display:none lands.
    targetProgress = 1;
    targetAt = null;
    const retiring = terminalArt || NO_ART;
    retiring.stop();
    // Kill the boot WebGL2 worker immediately so the first flight present is
    // not racing a second context. Overlay fade can still wait hideDelayMs.
    if (retiring === terminalArt) {
      retiring.destroy();
      terminalArt = null;
    }
    if (hideTimer != null) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (!overlay.classList.contains('hidden')) return;
      overlay.style.display = 'none';
      stopProgressLoop();
    }, hideDelayMs);
  };
  const unsubs = [
    bus.on('game:loadingProgress', show),
    bus.on('mode:changed', ({ mode } = {}) => {
      if (mode === 'loading') show(activeStage || DEFAULT_STAGE);
      else if (mode === 'flight' || mode === 'menu') {
        activeStage = null;
        hide();
      }
    }),
    bus.on('game:startFailed', hide),
    bus.on('save:error', hide),
  ];

  return {
    show,
    hide,
    destroy() {
      for (const unsub of unsubs) if (typeof unsub === 'function') unsub();
      if (hideTimer != null) clearTimeout(hideTimer);
      hideTimer = null;
      stopProgressLoop();
      (terminalArt || NO_ART).destroy();
      terminalArt = null;
    },
  };
}

