import { createTerminalArtwork, ensureBootTerminalCanvas } from './loadingTerminalArt.js';
import { mountBootRing } from './orrery/bootRing.js';

const DEFAULT_STAGE = Object.freeze({
  id: 'restoring-save',
  progress: 0.05,
  label: 'Restoring flight state',
  detail: 'Rebuilding the current sector',
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

const ORRERY_STYLE_ID = 'sf-loading-orrery-style';

// F5/F7: the lockup reads over every phase of the field. A radial scrim sits behind the wordmark
// and stage sentences (worst phase governs: bone on the scrimmed field clears 4.5:1 with room),
// and the pct is promoted from a small readout to the ring's thin-display-numeral hero (96px Archivo 250).
const ORRERY_LOCKUP_CSS = `
#boot-overlay.boot-overlay--orrery .boot-lockup {
  background: radial-gradient(closest-side, rgb(5 7 10 / .78), rgb(5 7 10 / .45) 62%, rgb(5 7 10 / 0) 100%);
  padding: 28px 48px 32px;
  backdrop-filter: blur(18px) saturate(1.15);
  -webkit-backdrop-filter: blur(18px) saturate(1.15);
}
#boot-overlay.boot-overlay--orrery .boot-label { color: rgb(236 230 216); text-shadow: 0 1px 10px rgb(0 0 0 / .85); }
#boot-overlay.boot-overlay--orrery .boot-detail { color: rgb(236 230 216 / .92); text-shadow: 0 1px 8px rgb(0 0 0 / .85); }
#boot-overlay.boot-overlay--orrery .boot-progress-row { align-items: center; gap: 12px; }
/* F3+F4 CUT: the registry tag + raw stopwatch are generic chrome with no voice. The DOM and its
   hooks stay (checks and the clock writer keep working); the glass drops them. */
#boot-overlay.boot-overlay--orrery .boot-meta { display: none; }
/* F1 field: the faint Sensor Lattice in bone at ~6% across the whole frame — the screen's
   authored air. Above the canvas, below the lockup; static, so reduced-motion keeps it. */
#boot-overlay.boot-overlay--orrery::before {
  content: ""; position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background-image: radial-gradient(circle, rgb(236 230 216 / .06) 1px, transparent 1.7px);
  background-size: 30px 30px;
}
/* F1 disc: the tableaux aura, locked to the ring disc by containFieldInRing (geometry inline).
   A faint bone breath inside the ring — the interior always holds light on pixels, even when
   the travelling sculptures are off-disc. Real tableaux strokes paint over it when they cross. */
.boot-tableaux-aura {
  position: absolute; z-index: 1; pointer-events: none; border-radius: 50%;
  background: radial-gradient(circle, rgb(236 230 216 / .10) 0, rgb(236 230 216 / .05) 55%, rgb(236 230 216 / 0) 72%);
}
/* F6: the leader tick joining ring to numeral. */
.boot-ring__leader { fill: none; stroke: rgb(236 230 216 / .55); stroke-width: 1.5; }
@media (forced-colors: active) {
  #boot-overlay.boot-overlay--orrery::before, .boot-tableaux-aura { display: none; }
  .boot-ring__leader { stroke: CanvasText; }
}
#boot-overlay.boot-overlay--orrery .boot-progress-pct {
  position: static; left: auto; top: auto; transform: none; min-width: 4ch; text-align: left;
  font-family: "Archivo", "Instrument Sans", system-ui, sans-serif; font-stretch: 100%;
  font-weight: 250; font-size: 96px; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; line-height: 1;
  color: #dfeeff; text-shadow: 0 0 18px rgb(0 0 0 / .8);
}
`;

function injectOrreryLockupStyle(document) {
  if (!document || typeof document.getElementById !== 'function') return;
  try {
    if (document.getElementById(ORRERY_STYLE_ID)) return;
    if (typeof document.createElement !== 'function' || !document.head) return;
    const s = document.createElement('style');
    s.id = ORRERY_STYLE_ID;
    s.textContent = ORRERY_LOCKUP_CSS;
    document.head.appendChild(s);
  } catch (_) { /* decoration never blocks boot */ }
}

/** DOM-only loading presenter shared by browser and Electron's one game route. */
export function createLoadingPresenter({ document, bus, state, hideDelayMs = 600 } = {}) {
  if (!document || !bus || typeof bus.on !== 'function') {
    return { show() {}, hide() {}, destroy() {} };
  }
  const overlay = document.getElementById ? document.getElementById('boot-overlay') : null;
  const label = document.querySelector ? document.querySelector('[data-loading-label]') : null;
  const detail = document.querySelector ? document.querySelector('[data-loading-detail]') : null;
  const progress = document.querySelector ? document.querySelector('[data-loading-progress]') : null;
  const pctEl = document.querySelector ? document.querySelector('[data-loading-pct]') : null;
  if (!overlay) return { show() {}, hide() {}, destroy() {} };
  // ORRERY: the progress reads on a ring round the turning emblem, a tick per reported stage.
  let ring = { set() {}, mark() {} };
  try { ring = mountBootRing(document, overlay); } catch (_) { /* decoration never blocks boot */ }
  injectOrreryLockupStyle(document);

  // F1: the tableaux play INSIDE the ring — the field canvas wears a radial mask centred on
  // the ring, full strength over the inner disc (r), 30% at 1.6r, gone by 2r. The ring stays the
  // hero; the field is its aura, not a fullscreen rival. Recomputed per show so a moved lockup
  // cannot strand the mask; any failure leaves the field unmasked, never blank.
  const containFieldInRing = () => {
    try {
      if (!overlay.querySelector || !document.getElementById) return;
      const canvas = document.getElementById('boot-terminal-canvas');
      const video = document.getElementById('boot-intro-video'); // the baked tableaux wears the same mask
      const ringEl = overlay.querySelector('.boot-ring');
      if (!ringEl || !ringEl.getBoundingClientRect) return;
      const surfaces = [canvas, video].filter((s) => s && s.style && typeof s.getBoundingClientRect === 'function');
      if (!surfaces.length) return;
      const geom = surfaces[0];
      const cr = geom.getBoundingClientRect();
      const rr = ringEl.getBoundingClientRect();
      if (!(cr.width > 0 && cr.height > 0 && rr.width > 0)) return;
      const cx = Math.round(rr.left + rr.width / 2 - cr.left);
      const cy = Math.round(rr.top + rr.height / 2 - cr.top);
      const r = Math.round(rr.width / 2);
      const mask = `radial-gradient(circle at ${cx}px ${cy}px, `
        + `rgb(0 0 0 / 1) 0 ${r}px, `
        + `rgb(0 0 0 / .3) ${Math.round(r * 1.6)}px, `
        + `rgb(0 0 0 / 0) ${Math.round(r * 2)}px)`;
      for (const s of surfaces) { s.style.webkitMaskImage = mask; s.style.maskImage = mask; }
      // The tableaux aura rides the same geometry: a faint bone breath locked to the disc, so
      // the interior always holds light even when the travelling sculptures are off-disc. DOM,
      // not canvas — it cannot miss a frame, a worker, or a still.
      let aura = overlay.querySelector ? overlay.querySelector('.boot-tableaux-aura') : null;
      if (!aura && document.createElement && overlay.appendChild) {
        aura = document.createElement('div');
        aura.className = 'boot-tableaux-aura';
        if (aura.setAttribute) aura.setAttribute('aria-hidden', 'true');
        overlay.appendChild(aura);
      }
      if (aura && aura.style) {
        aura.style.left = `${cx - r}px`;
        aura.style.top = `${cy - r}px`;
        aura.style.width = `${r * 2}px`;
        aura.style.height = `${r * 2}px`;
      }
    } catch (_) { /* decoration never blocks boot */ }
  };

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
  // The artwork is acquired lazily. On worker-capable hosts it uses the 2D renderer and can stay
  // paused between loading screens, so a later New Game/Continue does not wait for another worker
  // and canvas startup. Hosts without transferable worker canvases keep the old destroy/rebuild
  // lifecycle, since their renderer may own a main-thread WebGL context.
  let terminalArt = null;
  let retainWorkerArt = false;
  let retainedCanvas = null;
  let retainedPointerMove = null;
  let needsPointerBridge = false;
  const artwork = () => {
    if (terminalArt) return terminalArt;
    const canvas = ensureBootTerminalCanvas(document);
    if (!canvas) return NO_ART;
    try {
      const isolatedWorkerCanvas = typeof globalThis.Worker === 'function'
        && typeof canvas.transferControlToOffscreen === 'function';
      // The opening load is already compiling pipelines and uploading large textures on the
      // shared GPU. Keep the decorative visualizer in its existing worker-based 2D renderer so
      // it can animate without competing for that GPU time or allocating a second set of GL
      // feedback buffers.
      terminalArt = createTerminalArtwork({
        canvas,
        waveformCanvas,
        overlay,
        force2D: isolatedWorkerCanvas,
        document,
      }) || NO_ART;
      retainWorkerArt = isolatedWorkerCanvas && terminalArt !== NO_ART;
      retainedCanvas = retainWorkerArt ? canvas : null;
    } catch (err) {
      retainWorkerArt = false;
      retainedCanvas = null;
      try { console.warn('[boot] loading artwork failed; continuing without it', err); } catch (_) {}
      terminalArt = NO_ART;
    }
    return terminalArt;
  };

  const detachRetainedPointerBridge = () => {
    if (!retainedPointerMove) return;
    try { overlay.removeEventListener('pointermove', retainedPointerMove); } catch (_) {}
    retainedPointerMove = null;
  };

  const attachRetainedPointerBridge = () => {
    if (!needsPointerBridge || !retainWorkerArt || !retainedCanvas
        || !terminalArt || typeof overlay.addEventListener !== 'function') return;
    const receive = terminalArt.__engine && terminalArt.__engine.receive;
    if (typeof receive !== 'function') return;
    retainedPointerMove = (event) => {
      const rect = retainedCanvas.getBoundingClientRect && retainedCanvas.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      receive.call(terminalArt.__engine, { type: 'pointer', x, y });
    };
    overlay.addEventListener('pointermove', retainedPointerMove, { passive: true });
    needsPointerBridge = false;
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
    ring.set(shown);
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

  // ---- first-presented-frame gate ---------------------------------------------------------
  // `mode:changed` -> 'flight' lands one commit before the first real flight draw; the canvas is
  // still holding the frozen menu-era picture at that instant, and lifting the shell on the flag
  // alone was the "brown frame" flash players saw on Continue. The shell instead stays up — bar
  // run out to 100%, so it reads as finishing, not stalled — until the renderer has presented
  // again, and only then fades. A bounded deadline keeps a broken renderer from hanging the shell.
  const FLIGHT_REVEAL_TIMEOUT_MS = 20000;
  let revealRaf = null;
  let revealDeadlineTimer = null;

  const flightFrameNow = () => {
    const info = state && state.render && state.render.renderer && state.render.renderer.info;
    // Three's presented-frame counter lives at info.render.frame (info.frame does not exist).
    const frame = info && info.render && info.render.frame;
    return Number.isFinite(frame) ? frame : null;
  };

  const cancelRevealWait = () => {
    if (revealRaf != null && cancelRaf) cancelRaf(revealRaf);
    revealRaf = null;
    if (revealDeadlineTimer != null) clearTimeout(revealDeadlineTimer);
    revealDeadlineTimer = null;
  };

  // If overlay is initially visible, start terminal artwork immediately
  if (!overlay.classList?.contains?.('hidden')) {
    const initial = artwork();
    initial.start(); containFieldInRing();
    initial.updateProgress(DEFAULT_STAGE);
    displayProgress = DEFAULT_STAGE.progress;
    paintProgress();
    ensureProgressLoop();
  }

  const show = (stage = DEFAULT_STAGE) => {
    cancelRevealWait();
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
    ring.mark(amount);
    overlay.style.display = 'flex';
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-busy', 'true');
    overlay.dataset.loadingStage = String(stage.id || 'loading');
    if (label) label.textContent = String(stage.label || DEFAULT_STAGE.label);
    if (detail) detail.textContent = String(stage.detail || 'Preparing the flight');
    if (!raf) {
      // No animation clock (probes, unit tests): keep the honest step write.
      if (progress) progress.style.width = `${Math.round(amount * 100)}%`;
      if (pctEl) pctEl.textContent = `${Math.round(amount * 100)}%`;
      ring.set(amount);
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
    art.start(); containFieldInRing();
    attachRetainedPointerBridge();
    art.updateProgress(raf ? { ...stage, progress: clamp01(displayProgress) } : stage);
  };

  const hide = () => {
    cancelRevealWait();
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-busy', 'false');
    // Let the bar run out to 100% while the shell fades; the loop stops when display:none lands.
    targetProgress = 1;
    targetAt = null;
    const retiring = terminalArt || NO_ART;
    retiring.stop();
    detachRetainedPointerBridge();
    // A paused 2D worker has no GL context and is cheap to resume on the next load. Release the
    // non-retained path immediately so a main-thread WebGL context cannot race the flight route.
    if (retiring === terminalArt && !retainWorkerArt) {
      retiring.destroy();
      terminalArt = null;
      retainedCanvas = null;
    } else if (retiring === terminalArt) {
      needsPointerBridge = true;
    }
    if (hideTimer != null) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (!overlay.classList.contains('hidden')) return;
      overlay.style.display = 'none';
      stopProgressLoop();
    }, hideDelayMs);
  };

  // The 'flight' handoff: keep the shell up until the renderer has presented a frame past the
  // mode change — the first real world picture — so the held menu-era canvas never shows through.
  const hideAfterFirstFlightFrame = () => {
    const baseline = flightFrameNow();
    if (baseline == null || overlay.classList.contains('hidden')) { hide(); return; }
    targetProgress = 1;
    targetAt = null;
    const deadline = Date.now() + FLIGHT_REVEAL_TIMEOUT_MS;
    const poll = () => {
      revealRaf = null;
      const frame = flightFrameNow();
      if ((frame != null && frame > baseline) || Date.now() >= deadline) { hide(); return; }
      revealRaf = raf ? raf(poll) : null;
      if (revealRaf == null) hide();
    };
    if (raf) {
      revealRaf = raf(poll);
      revealDeadlineTimer = setTimeout(() => { cancelRevealWait(); hide(); }, FLIGHT_REVEAL_TIMEOUT_MS + 500);
    } else {
      // No animation clock (probes, unit tests): there is no frame to observe — hide now.
      hide();
    }
  };
  const unsubs = [
    bus.on('game:loadingProgress', show),
    bus.on('mode:changed', ({ mode } = {}) => {
      if (mode === 'loading') show(activeStage || DEFAULT_STAGE);
      else if (mode === 'flight') {
        activeStage = null;
        hideAfterFirstFlightFrame();
      } else if (mode === 'menu') {
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
      cancelRevealWait();
      if (hideTimer != null) clearTimeout(hideTimer);
      hideTimer = null;
      stopProgressLoop();
      detachRetainedPointerBridge();
      (terminalArt || NO_ART).destroy();
      terminalArt = null;
      retainedCanvas = null;
      retainWorkerArt = false;
      needsPointerBridge = false;
    },
  };
}

