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
  const overlay = document.getElementById('boot-overlay');
  const label = document.querySelector('[data-loading-label]');
  const detail = document.querySelector('[data-loading-detail]');
  const progress = document.querySelector('[data-loading-progress]');
  if (!overlay) return { show() {}, hide() {}, destroy() {} };

  let hideTimer = null;
  let activeStage = null;
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
  };
  const hide = () => {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-busy', 'false');
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
    },
  };
}
