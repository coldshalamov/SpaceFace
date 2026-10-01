import { dataState } from './uiPrimitives.js';

const BACKGROUND_IDS = ['hud', 'modal-backdrop', 'screens', 'toasts', 'alerts', 'gl-canvas'];

export function createRuntimeFailurePresenter({ document, host, onRestart } = {}) {
  const view = host || (document && document.defaultView) || globalThis;
  const restart = typeof onRestart === 'function'
    ? onRestart
    : () => view.location?.reload?.();
  const overlay = document && typeof document.getElementById === 'function'
    ? document.getElementById('boot-overlay')
    : null;
  let pane = null;
  let destroyed = false;
  let listening = false;
  let overlaySnapshot = null;
  let childSnapshots = null;
  let backgroundSnapshots = null;

  function onKeydown(event) {
    if (!event) return;
    const verb = pane && pane.sfStateVerb;
    const key = event.key;
    if (verb && event.target === verb && (key === 'Enter' || key === ' ' || key === 'Spacebar')) {
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      else if (typeof event.stopPropagation === 'function') event.stopPropagation();
      return;
    }
    if (key === 'Tab') {
      event.preventDefault?.();
      verb?.focus?.();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      else if (typeof event.stopPropagation === 'function') event.stopPropagation();
      return;
    }
    event.preventDefault?.();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    else if (typeof event.stopPropagation === 'function') event.stopPropagation();
  }

  function show(failure) {
    if (destroyed || !overlay) return false;
    if (pane) return true;

    overlaySnapshot = {
      hadHidden: overlay.classList.contains('hidden'),
      display: overlay.style ? (overlay.style.display || '') : '',
      ariaBusy: overlay.getAttribute('aria-busy'),
    };
    childSnapshots = [];
    for (const child of Array.from(overlay.children || [])) {
      childSnapshots.push({ node: child, display: child.style ? (child.style.display || '') : '' });
      if (child.style) child.style.display = 'none';
    }
    backgroundSnapshots = [];
    for (const id of BACKGROUND_IDS) {
      const node = document.getElementById(id);
      if (!node || node === overlay || (overlay.contains && overlay.contains(node))) continue;
      backgroundSnapshots.push({
        node,
        inert: node.hasAttribute?.('inert') === true,
        ariaHidden: node.getAttribute ? node.getAttribute('aria-hidden') : null,
      });
      node.setAttribute?.('inert', '');
      node.setAttribute?.('aria-hidden', 'true');
    }

    overlay.classList.remove('hidden');
    if (overlay.style) overlay.style.display = 'flex';
    overlay.setAttribute('aria-busy', 'false');

    pane = dataState('error', {
      code: 'FLIGHT_INTERRUPTED',
      headline: 'Flight interrupted',
      fills: 'The simulation stopped before another frame could be completed.',
      detail: 'Restart from the main menu to recover. Progress since your last save may be lost.',
      verb: { label: 'Restart to main menu', onActivate: restart },
    });
    pane.classList.add('boot-error');
    pane.setAttribute('role', 'alertdialog');
    pane.setAttribute('aria-modal', 'true');
    const head = pane.querySelector('.sf-state__head');
    const detail = pane.querySelector('.sf-state__detail');
    if (head) {
      head.id = 'runtime-failure-headline';
      pane.setAttribute('aria-labelledby', head.id);
    }
    if (detail) {
      detail.id = 'runtime-failure-detail';
      pane.setAttribute('aria-describedby', detail.id);
    }
    if (failure && failure.message != null) {
      pane.setAttribute('data-failure-message', String(failure.message));
    }
    overlay.appendChild(pane);

    if (view && typeof view.addEventListener === 'function') {
      view.addEventListener('keydown', onKeydown, true);
      listening = true;
    }
    pane.sfStateVerb?.focus?.();
    return true;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (listening && view && typeof view.removeEventListener === 'function') {
      view.removeEventListener('keydown', onKeydown, true);
      listening = false;
    }
    if (pane) {
      pane.parentNode?.removeChild(pane);
      pane = null;
    }
    if (backgroundSnapshots) {
      for (const snap of backgroundSnapshots) {
        if (!snap.inert) snap.node.removeAttribute?.('inert');
        if (snap.ariaHidden === null) snap.node.removeAttribute?.('aria-hidden');
        else snap.node.setAttribute?.('aria-hidden', snap.ariaHidden);
      }
      backgroundSnapshots = null;
    }
    if (childSnapshots) {
      for (const snap of childSnapshots) {
        if (snap.node.style) snap.node.style.display = snap.display;
      }
      childSnapshots = null;
    }
    if (overlaySnapshot && overlay) {
      if (overlay.style) overlay.style.display = overlaySnapshot.display;
      if (overlaySnapshot.hadHidden) overlay.classList.add('hidden');
      else overlay.classList.remove('hidden');
      if (overlaySnapshot.ariaBusy === null) overlay.removeAttribute('aria-busy');
      else overlay.setAttribute('aria-busy', overlaySnapshot.ariaBusy);
      overlaySnapshot = null;
    }
  }

  return { show, destroy };
}
