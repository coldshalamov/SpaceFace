import { createTerminalArtwork } from './loadingTerminalArt.js';

const DEFAULT_STAGE = Object.freeze({
  id: 'restoring-save',
  progress: 0.05,
  label: 'Restoring flight state',
  detail: 'Rebuilding the current sector and critical visuals',
});

/** DOM-only loading presenter shared by browser and Electron's one game route. */
export function createLoadingPresenter({ document, bus, hideDelayMs = 600 } = {}) {
  if (!document || !bus || typeof bus.on !== 'function') {
    return { show() {}, hide() {}, destroy() {} };
  }
  const overlay = document.getElementById ? document.getElementById('boot-overlay') : null;
  const label = document.querySelector ? document.querySelector('[data-loading-label]') : null;
  const detail = document.querySelector ? document.querySelector('[data-loading-detail]') : null;
  const progress = document.querySelector ? document.querySelector('[data-loading-progress]') : null;
  if (!overlay) return { show() {}, hide() {}, destroy() {} };

  const canvas = document.getElementById ? document.getElementById('boot-terminal-canvas') : null;
  const waveformCanvas = document.getElementById ? document.getElementById('boot-waveform-canvas') : null;
  // The loading screen's artwork is DECORATION. It must never be able to stop the game from
  // starting — and it has: createTerminalArtwork threw InvalidStateError out of boot (the canvas
  // was being set up twice and transferControlToOffscreen is irreversible), which meant the boot
  // overlay was never hidden and the game hung on the loading screen indefinitely.
  //
  // The underlying re-entrancy is fixed in loadingTerminalArt.js. This guard is here so that the
  // NEXT bug in the artwork costs the player a missing animation instead of the whole game.
  const NO_ART = { updateProgress() {}, start() {}, stop() {}, destroy() {} };
  let terminalArt = NO_ART;
  try {
    terminalArt = createTerminalArtwork({ canvas, waveformCanvas, overlay, document }) || NO_ART;
  } catch (err) {
    try { console.warn('[boot] loading artwork failed; continuing without it', err); } catch (_) {}
    terminalArt = NO_ART;
  }

  let hideTimer = null;
  let activeStage = null;
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
    terminalArt.start();
    terminalArt.updateProgress(DEFAULT_STAGE);
  }

  const show = (stage = DEFAULT_STAGE) => {
    if (hideTimer != null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    const amount = Math.max(0, Math.min(1, Number(stage.progress) || 0));
    activeStage = stage;
    overlay.style.display = 'flex';
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-busy', 'true');
    overlay.dataset.loadingStage = String(stage.id || 'loading');
    if (label) label.textContent = String(stage.label || DEFAULT_STAGE.label);
    if (detail) detail.textContent = String(stage.detail || 'Preparing the playable scene');
    if (progress) progress.style.width = `${Math.round(amount * 100)}%`;

    terminalArt.start();
    terminalArt.updateProgress(stage);
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
    terminalArt.stop();
    if (hideTimer != null) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (overlay.classList.contains('hidden')) overlay.style.display = 'none';
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
      terminalArt.destroy();
    },
  };
}

