import { getBootVisualizer } from './bootVisualizer.js';
import { mountBootRing } from './orrery/bootRing.js';
import { createLoadingProgressDriver } from './loadingProgressDriver.js';
import { observeBootWork, createBootWorkAccumulator } from '../core/bootWork.js';
import { dataState } from './uiPrimitives.js';

const DEFAULT_STAGE = Object.freeze({ id: 'restoring-save', progress: .05,
  label: 'Restoring flight state', detail: 'Rebuilding the current sector and critical visuals' });
const NO_ART = { updateProgress() {}, start() {}, stop() {}, destroy() {} };
const NOOP = { show() {}, hide() {}, destroy() {} };

/** One presenter for browser/Electron, boot/New Game/Continue; rendering never authorizes flight. */
export function createLoadingPresenter({ document, bus, state, hideDelayMs = 600 } = {}) {
  if (!document || !bus || typeof bus.on !== 'function') return NOOP;
  const overlay = document.getElementById?.('boot-overlay');
  if (!overlay) return NOOP;
  const label = document.querySelector?.('[data-loading-label]');
  const detail = document.querySelector?.('[data-loading-detail]');
  const progress = document.querySelector?.('[data-loading-progress]');
  const pctEl = document.querySelector?.('[data-loading-pct]');
  const host = document.defaultView || globalThis;
  const raf = host.requestAnimationFrame?.bind(host);
  const cancelRaf = host.cancelAnimationFrame?.bind(host);
  const now = () => host.performance?.now?.() ?? Date.now();
  let ring;
  try { ring = mountBootRing(document, overlay); } catch { ring = null; }
  if (!ring?.mounted) ring = createLoadingProgressDriver(host);
  // Only phase sentences are live. Numeric progress is a queryable progressbar, not 10 spoken
  // announcements per second; the existing hidden span hooks remain available to tools.
  overlay.setAttribute('aria-live', 'off');
  label?.setAttribute?.('role', 'status'); label?.setAttribute?.('aria-live', 'polite');
  let terminalArt = null, retainWorkerArt = false, retainedCanvas = null;
  let retainedPointerMove = null, needsPointerBridge = false;
  let hideTimer = null, activeStage = null, revealRaf = null, revealPollTimer = null, revealDeadlineTimer = null;
  let workTimer = null, pendingWork = null, accumulator = null, disposed = false;
  let startupFailure = null, failurePane = null;
  const lockup = overlay.querySelector?.('.boot-lockup') || null;
  const priorLockupDisplay = lockup?.style?.display || '';
  let session = 0;
  const visible = () => overlay.style.display !== 'none' && !overlay.classList.contains('hidden');
  function artwork() {
    if (terminalArt) return terminalArt;
    try {
      terminalArt = getBootVisualizer(document) || NO_ART;
      // Native playback and its fallback are owned together, on every host.
      // Retain the paused owner across New Game / Continue, not just on hosts
      // with Worker support. Its start() never seeks back to the first frame.
      retainWorkerArt = terminalArt !== NO_ART;
      retainedCanvas = null;
    } catch (error) {
      console.warn('[boot] loading artwork failed; continuing without it', error);
      retainWorkerArt = false; retainedCanvas = null; terminalArt = NO_ART;
    }
    return terminalArt;
  }
  function detachPointer() {
    if (retainedPointerMove) overlay.removeEventListener?.('pointermove', retainedPointerMove);
    retainedPointerMove = null;
  }
  function attachPointer() {
    if (!needsPointerBridge || retainedPointerMove || !retainWorkerArt || !retainedCanvas) return;
    const receive = terminalArt?.__engine?.receive;
    if (typeof receive !== 'function') return;
    retainedPointerMove = (event) => {
      const rect = retainedCanvas.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      receive.call(terminalArt.__engine, { type: 'pointer',
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: ((event.clientY - rect.top) / rect.height) * 2 - 1 });
    };
    overlay.addEventListener?.('pointermove', retainedPointerMove, { passive: true });
    needsPointerBridge = false;
  }
  function clearWork() {
    if (workTimer !== null) clearTimeout(workTimer);
    workTimer = null; pendingWork = null;
  }
  function cancelRevealWait() {
    if (revealRaf !== null) cancelRaf?.(revealRaf);
    revealRaf = null;
    if (revealPollTimer !== null) clearTimeout(revealPollTimer);
    revealPollTimer = null;
    if (revealDeadlineTimer !== null) clearTimeout(revealDeadlineTimer);
    revealDeadlineTimer = null;
  }
  function paint(fraction, formatted) {
    if (!visible() || disposed || startupFailure) return;
    if (progress) progress.style.width = raf ? `${(fraction * 100).toFixed(2)}%` : `${Math.round(fraction * 100)}%`;
    if (pctEl && pctEl.textContent !== formatted) pctEl.textContent = formatted;
    (terminalArt || NO_ART).updateProgress({ id: activeStage?.id || 'loading', progress: fraction });
  }
  const unsubscribePaint = ring?.subscribe(paint) || (() => {});
  const unsubscribeWork = observeBootWork((receipt) => {
    if (!visible() || !accumulator || disposed || !activeStage || startupFailure) return;
    if (!['authored-library', 'authored-visuals', 'render-pipelines', 'gpu-resources'].includes(activeStage.id)) return;
    if (!receipt.owner || (receipt.owner !== state?.render && receipt.owner !== state?.render?.renderer)) return;
    const work = accumulator.accept(receipt);
    if (!work) return;
    pendingWork = work;
    if (workTimer !== null) return;
    const ownerSession = session;
    // Coalesce receipts, not progress animation: 100 texture completions do not post 100 UI writes.
    workTimer = setTimeout(() => {
      workTimer = null;
      if (ownerSession !== session || !visible() || !pendingWork || disposed) return;
      const current = pendingWork; pendingWork = null;
      ring?.report({ ...activeStage, progress: current.progress });
      if (detail && current.total > 0) {
        detail.textContent = `${current.completed} of ${current.total} resources prepared in this pass`;
      }
    }, 80);
  });

  function show(stage = DEFAULT_STAGE) {
    if (disposed || startupFailure) return;
    cancelRevealWait();
    if (hideTimer !== null) clearTimeout(hideTimer);
    hideTimer = null;
    const wasHidden = !visible();
    // New run/restore restarts a completed/retiring session. Late progress inside one session
    // cannot rewind it. The first presenter inherits the entry worker's existing boot progress.
    const fresh = wasHidden || stage.reset === true;
    const changed = !activeStage || activeStage.id !== stage.id || fresh;
    if (changed) { session++; clearWork(); accumulator = createBootWorkAccumulator(stage); }
    activeStage = stage;
    overlay.style.display = 'flex'; overlay.classList.remove('hidden');
    overlay.setAttribute('aria-busy', 'true'); overlay.dataset.loadingStage = String(stage.id || 'loading');
    if (label) label.textContent = String(stage.label || DEFAULT_STAGE.label);
    if (detail) detail.textContent = String(stage.detail || 'Preparing the playable scene');
    ring?.report(stage, { reset: fresh }); ring?.start();
    if (!ring || !raf) {
      const amount = Math.max(0, Math.min(.997, Number(stage.progress) || 0));
      paint(amount, `${(Math.floor(amount * 1000) / 10).toFixed(1)}%`);
    }
    const needsStart = wasHidden || !terminalArt;
    const art = artwork(); if (needsStart) art.start(); attachPointer();
    art.updateProgress({ ...stage, progress: ring?.snapshot().shown ?? Number(stage.progress) ?? 0 });
  }
  /** completed=false on error/timeout/menu cancellation: never celebrate a failed load as 100%. */
  function hide({ completed = true } = {}) {
    if (disposed) return;
    if (startupFailure) return;
    cancelRevealWait(); clearWork(); accumulator = null; session++;
    if (completed) ring?.finish();
    overlay.classList.add('hidden'); overlay.setAttribute('aria-busy', 'false');
    ring?.stop();
    const retiring = terminalArt || NO_ART; retiring.stop(); detachPointer();
    if (retiring === terminalArt && !retainWorkerArt) {
      retiring.destroy(); terminalArt = null; retainedCanvas = null;
    } else if (retiring === terminalArt) needsPointerBridge = true;
    if (hideTimer !== null) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (overlay.classList.contains('hidden')) overlay.style.display = 'none';
    }, hideDelayMs);
  }
  const frameNow = () => {
    const count = state?.render?.renderer?.info?.render?.frame;
    return Number.isFinite(count) ? count : null;
  };
  function hideAfterFirstFlightFrame() {
    if (startupFailure) return;
    cancelRevealWait(); clearWork(); accumulator = null;
    const baseline = frameNow();
    if (baseline === null || !raf || !visible()) { hide({ completed: false }); return; }
    // Reserve the final arc until the existing renderer-frame handoff gate actually advances.
    ring?.report({ id: 'entering-flight', progress: .96, ceiling: .997, label: 'Presenting the first frame' });
    // rAF alone can starve the whole escape window on a throttled host (background tab,
    // occluded window) while the game presents frames on its own cadence — pair it with a
    // self-clearing timer channel like the continue-fade veil so the shell still lifts.
    const poll = (viaTimer) => {
      if (viaTimer) revealPollTimer = null; else revealRaf = null;
      if (disposed) return;
      if (frameNow() > baseline) {
        cancelRevealWait(); ring?.finish();
        // A small, bounded finish interval lets the needle settle before removing the shell.
        if (ring?.mounted) revealDeadlineTimer = setTimeout(() => hide(), 450);
        else hide(); // no decorative instrument to finish on minimal shells
        return;
      }
      if (raf && revealRaf === null) revealRaf = raf(() => poll(false));
      if (revealPollTimer === null) revealPollTimer = setTimeout(() => poll(true), 200);
    };
    revealRaf = raf(() => poll(false));
    revealPollTimer = setTimeout(() => poll(true), 200);
    // Preserve the pre-existing escape hatch; timeout is NOT evidence of readiness or 100%.
    revealDeadlineTimer = setTimeout(() => hide({ completed: false }), 20500);
  }
  function removeFailurePane() {
    if (failurePane) {
      failurePane.parentNode?.removeChild(failurePane);
      failurePane = null;
    }
    if (lockup?.style) lockup.style.display = priorLockupDisplay;
    delete overlay.dataset.startupFailure;
  }
  function clearStartupFailure({ dismiss = false } = {}) {
    if (!startupFailure) return false;
    startupFailure = null;
    removeFailurePane();
    activeStage = null;
    if (dismiss) hide({ completed: false });
    return true;
  }
  function eventMatchesCurrentGeneration(payload) {
    const eventGeneration = payload?.transitionGeneration
      ?? payload?.admissionRunGeneration
      ?? payload?.generation
      ?? payload?.transitionToken?.generation;
    const currentGeneration = state?.render?.admissionRunGeneration;
    return eventGeneration == null || currentGeneration == null
      || eventGeneration === currentGeneration;
  }
  function startupFailureCopy(payload = {}) {
    const failure = payload.failure && typeof payload.failure === 'object' ? payload.failure : {};
    const codeText = payload.code ?? failure.code ?? 'GAME_START_FAILED';
    const normalizedCode = String(codeText).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '').slice(0, 40);
    const code = /^[A-Z][A-Z0-9_]{1,39}$/.test(normalizedCode)
      ? normalizedCode : 'GAME_START_FAILED';
    const stageValue = payload.stage ?? failure.stage ?? 'startup';
    const stage = String(stageValue || 'startup');
    const messageValue = payload.originalMessage ?? payload.error ?? failure.originalMessage
      ?? failure.error ?? payload.message ?? failure.message ?? payload.causes?.[0];
    const message = messageValue && typeof messageValue === 'object' && 'message' in messageValue
      ? String(messageValue.message) : String(messageValue ?? 'No technical detail was provided.');
    return { code, stage, message };
  }
  function showStartupFailure(payload = {}) {
    if (disposed || startupFailure || !eventMatchesCurrentGeneration(payload)) return false;
    cancelRevealWait(); clearWork(); accumulator = null; pendingWork = null; session++;
    if (hideTimer !== null) clearTimeout(hideTimer);
    hideTimer = null;
    startupFailure = startupFailureCopy(payload);
    activeStage = null;
    ring?.stop();
    (terminalArt || NO_ART).stop();
    detachPointer();
    if (lockup?.style) lockup.style.display = 'none';
    const pane = dataState('error', {
      code: startupFailure.code,
      headline: 'Startup could not finish',
      fills: `The launch stopped during ${startupFailure.stage}.`,
      detail: startupFailure.message,
      verb: { label: 'Retry', onActivate: () => bus.emit('game:retryStart', { source: 'startup-failure-overlay' }) },
    });
    pane.setAttribute('data-startup-failure', 'true');
    // Keep recovery above the positioned cinematic canvas, which otherwise intercepts taps.
    pane.style.position = 'relative';
    pane.style.zIndex = '1';
    pane.style.maxHeight = 'calc(100% - 48px)';
    pane.style.overflowY = 'auto';
    pane.style.overflowWrap = 'anywhere';
    pane.setAttribute('data-startup-stage', startupFailure.stage);
    const body = pane.querySelector?.('.sf-state__body');
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'sf-state__verb';
    back.textContent = 'Back to menu';
    back.setAttribute('data-sf-verb', 'back-to-menu');
    back.addEventListener('click', () => bus.emit('game:exitToMenu', { source: 'startup-failure-overlay' }));
    body?.appendChild(back);
    failurePane = pane;
    overlay.appendChild(pane);
    overlay.style.display = 'flex'; overlay.classList.remove('hidden');
    overlay.setAttribute('aria-busy', 'false');
    overlay.dataset.startupFailure = startupFailure.code;
    pane.sfStateVerb?.focus?.();
    return true;
  }
  function resetForNewSession() {
    if (!clearStartupFailure()) return;
    hide({ completed: false });
  }
  const unsubs = [
    bus.on('game:loadingProgress', (stage) => {
      if (!startupFailure && eventMatchesCurrentGeneration(stage)) show(stage);
    }),
    bus.on('mode:changed', ({ mode } = {}) => {
      if (state?.mode != null && state.mode !== mode) return;
      if (mode === 'loading') {
        clearStartupFailure();
        show(activeStage || DEFAULT_STAGE);
      }
      else if (mode === 'flight') {
        if (startupFailure && state?.mode === 'flight') clearStartupFailure();
        if (!startupFailure) { activeStage = null; hideAfterFirstFlightFrame(); }
      }
      else if (mode === 'menu') {
        if (startupFailure) return;
        if (activeStage?.id?.startsWith('boot-')) return; // initial menu is revealed by main after init
        activeStage = null; hide({ completed: false });
      }
    }),
    bus.on('game:startFailed', (payload = {}) => { showStartupFailure(payload); }),
    bus.on('game:new', resetForNewSession),
    bus.on('game:load', resetForNewSession),
    bus.on('game:exitToMenu', () => {
      if (clearStartupFailure()) hide({ completed: false });
    }),
    bus.on('save:error', (payload = {}) => {
      if (startupFailure) return;
      if (payload.reason === 'load_failed' && state?.mode === 'loading' && visible()) {
        const failure = {
          ...payload,
          code: payload.code || 'SAVE_LOAD_FAILED',
          stage: payload.stage || 'save-restore',
          error: payload.originalMessage ?? payload.error ?? payload.message,
          source: 'startup-save-error',
        };
        showStartupFailure(failure);
        bus.emit('game:startFailed', failure);
        return;
      }
      hide({ completed: false });
    }),
  ];
  if (visible()) {
    // Do not replace boot-modules with restoring-save at the entry -> main handoff.
    ring?.start(); const art = artwork(); art.start();
    art.updateProgress({ id: 'boot-state', progress: ring?.snapshot().shown || .14 });
  }
  return { show, hide, destroy() {
    if (disposed) return;
    for (const unsub of unsubs) if (typeof unsub === 'function') unsub();
    unsubscribePaint(); unsubscribeWork(); cancelRevealWait(); clearWork();
    if (hideTimer !== null) clearTimeout(hideTimer);
    hideTimer = null; detachPointer(); removeFailurePane(); (terminalArt || NO_ART).destroy();
    terminalArt = null; retainedCanvas = null; ring?.destroy(); disposed = true;
  } };
}
