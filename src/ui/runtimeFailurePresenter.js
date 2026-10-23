import { dataState } from './uiPrimitives.js';
import { buildDiagnosticsReport, copyTextToClipboard, primeDiagnosticsReport } from './diagnosticsReport.js';

const BACKGROUND_IDS = ['hud', 'modal-backdrop', 'screens', 'toasts', 'alerts', 'gl-canvas'];
// Keys a read-only report box needs natively (caret/selection moves and select-all / copy). The
// pane blocks every other key so a dead game's shortcuts cannot fire behind it.
const REPORT_BOX_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
const COPIED_TEXT = 'Copied — paste it into your report.';
const COPY_FAILED_TEXT = 'Could not copy — select the text below.';

// The one recovery pane owner, shared by both dead-end classes:
//  - a quarantined simulation step mid-flight (loop.js onSimulationFailure), and
//  - a boot-stage failure before any menu exists (main.js showBootError).
// SFQ-B228: boot failures were a raw stack in #boot-overlay — a cause, but no exit. The pane
// spec below is parameterized so the same alertdialog carries a named cause and a Retry verb
// for boot, while the flight-interrupted defaults stay byte-identical for the loop path.
const FLIGHT_FAILURE_DEFAULTS = Object.freeze({
  code: 'FLIGHT_INTERRUPTED',
  headline: 'Flight interrupted',
  fills: 'The simulation stopped before another frame could be completed.',
  detail: 'Restart from the main menu to recover. Progress since your last save may be lost.',
  verbLabel: 'Restart to main menu',
});

/**
 * Name a boot-stage failure as a player-facing recovery spec. The boot route's own missing
 * asset / failed service is the scenario-contract load (main.js loadScenarioContract — a
 * bounded fetch of `47a.scenario.json`); its message and the platform fetch/timeout error
 * names are the fingerprint. Everything else is an honest generic startup failure. Neither
 * class can touch stored saves: no save write happens before the main menu.
 * @returns {code,headline,fills,detail,verbLabel,message} — pass straight to show().
 */
export function describeBootFailure(err) {
  const raw = err && err.message != null ? String(err.message) : String(err || 'unknown boot failure');
  const firstLine = raw.split('\n', 1)[0].trim() || 'unknown boot failure';
  const name = (err && err.name) || '';
  const contractMissing = /scenario contract/i.test(raw);
  const fetchShaped = name === 'TimeoutError' || name === 'AbortError'
    || /failed to fetch|networkerror|load failed|err_|timed? ?out|abort/i.test(raw);
  if (contractMissing || fetchShaped) {
    return {
      code: contractMissing ? 'BOOT_SCENARIO_UNAVAILABLE' : 'BOOT_SERVICE_UNAVAILABLE',
      headline: 'The opening scenario could not be loaded',
      fills: 'SpaceFace could not read its scenario data — the file is missing or the network path failed.',
      detail: 'Your saved games are unaffected. Retry the launch; if it keeps failing, check the game files or connection.',
      verbLabel: 'Retry',
      message: firstLine,
    };
  }
  return {
    code: 'BOOT_FAILED',
    headline: 'SpaceFace could not finish starting',
    fills: 'An error stopped startup before the main menu appeared.',
    detail: 'Your saved games are unaffected. Retry the launch; the technical detail is in the console log.',
    verbLabel: 'Retry',
    message: firstLine,
  };
}

/**
 * `getDiagnosticsState` (optional) returns the live GameState for the "Copy details" report; it may
 * return null (a boot failure happens before the state exists). `copyText` (optional) replaces the
 * clipboard helper, so tests never touch a real clipboard.
 */
export function createRuntimeFailurePresenter({ document, host, onRestart, getDiagnosticsState, copyText } = {}) {
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

  function stopEvent(event) {
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    else if (typeof event.stopPropagation === 'function') event.stopPropagation();
  }

  // The pane's tab ring: Retry, Copy details, and the report box once it is showing.
  function paneButtons() {
    const list = [];
    if (pane && pane.sfStateVerb) list.push(pane.sfStateVerb);
    if (pane && pane.sfCopyButton) list.push(pane.sfCopyButton);
    return list;
  }

  function onKeydown(event) {
    if (!event) return;
    const key = event.key;
    const target = event.target;
    const buttons = paneButtons();
    const box = pane && pane.sfReportShown ? pane.sfReportBox : null;
    // Native activation on a pane button is allowed through (the default action runs); the event
    // itself still never reaches gameplay or save listeners.
    if (buttons.includes(target) && (key === 'Enter' || key === ' ' || key === 'Spacebar')) {
      stopEvent(event);
      return;
    }
    if (key === 'Tab') {
      event.preventDefault?.();
      const ring = box ? [...buttons, box] : buttons;
      if (ring.length) {
        const at = ring.indexOf(target);
        const step = event.shiftKey ? -1 : 1;
        const next = at < 0 ? (step > 0 ? 0 : ring.length - 1) : (at + step + ring.length) % ring.length;
        ring[next].focus?.();
      }
      stopEvent(event);
      return;
    }
    // The read-only report box keeps caret moves, select-all and copy so the text can be taken by hand.
    if (box && target === box
      && (REPORT_BOX_KEYS.has(key) || ((event.ctrlKey || event.metaKey) && /^[acAC]$/.test(key || '')))) {
      stopEvent(event);
      return;
    }
    event.preventDefault?.();
    stopEvent(event);
  }

  // "Copy details": a second control beside Retry that puts the diagnostics report + the failure's
  // code and wording on the clipboard, and answers in words. If the clipboard refuses, the report
  // appears in a read-only box so it can still be selected by hand.
  function mountCopyControls(node, failureRecord) {
    const verb = node.sfStateVerb;
    const body = verb && verb.parentNode;
    if (!body || typeof document.createElement !== 'function') return;
    const copyBtn = document.createElement('button');
    copyBtn.className = 'sf-state__verb sf-state__verb--quiet';
    copyBtn.setAttribute('type', 'button');
    copyBtn.setAttribute('data-sf-verb', 'copy-details');
    const label = document.createElement('span');
    label.textContent = 'Copy details';
    copyBtn.appendChild(label);
    const status = document.createElement('p');
    status.className = 'sf-state__copy-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const box = document.createElement('textarea');
    box.className = 'sf-state__report';
    box.setAttribute('readonly', '');
    box.readOnly = true;
    box.setAttribute('rows', '8');
    box.setAttribute('spellcheck', 'false');
    box.setAttribute('aria-label', 'Diagnostic details to copy');
    box.setAttribute('hidden', '');
    // Retry and Copy sit in one row; hosts that cannot re-parent (stub DOMs) just stack them.
    if (typeof body.removeChild === 'function') {
      const row = document.createElement('div');
      row.className = 'sf-state__actions';
      body.removeChild(verb);
      row.appendChild(verb);
      row.appendChild(copyBtn);
      body.appendChild(row);
    } else {
      body.appendChild(copyBtn);
    }
    body.appendChild(status);
    body.appendChild(box);
    node.sfCopyButton = copyBtn;
    node.sfReportBox = box;
    node.sfReportShown = false;

    let copying = false;
    copyBtn.addEventListener('click', () => {
      if (copying || destroyed || pane !== node) return;
      copying = true;
      let text;
      try {
        text = buildDiagnosticsReport(typeof getDiagnosticsState === 'function' ? getDiagnosticsState() : null,
          { failure: failureRecord, document });
      } catch (_) {
        text = 'SpaceFace diagnostics\nFailure code: ' + failureRecord.code;
      }
      status.textContent = '';
      const finish = (ok) => {
        copying = false;
        if (destroyed || pane !== node) return;
        if (ok) {
          status.textContent = COPIED_TEXT;
          return;
        }
        status.textContent = COPY_FAILED_TEXT;
        box.value = text;
        box.removeAttribute?.('hidden');
        node.sfReportShown = true;
        // Focus without the browser's jump (it would scroll the headline off a short screen), then
        // bring the box into view by the least amount. select() leaves it scrolled to its end.
        box.focus?.({ preventScroll: true });
        box.select?.();
        box.scrollTop = 0;
        box.scrollIntoView?.({ block: 'nearest' });
      };
      let attempt;
      try {
        attempt = Promise.resolve((typeof copyText === 'function' ? copyText : copyTextToClipboard)(text,
          { navigator: view && view.navigator, document }));
      } catch (_) {
        attempt = Promise.resolve(false);
      }
      attempt.then((ok) => finish(ok === true), () => finish(false));
    });
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

    const spec = failure && typeof failure === 'object' ? failure : {};
    pane = dataState('error', {
      code: spec.code || FLIGHT_FAILURE_DEFAULTS.code,
      headline: spec.headline || FLIGHT_FAILURE_DEFAULTS.headline,
      fills: spec.fills || FLIGHT_FAILURE_DEFAULTS.fills,
      detail: spec.detail || FLIGHT_FAILURE_DEFAULTS.detail,
      verb: {
        label: spec.verbLabel || FLIGHT_FAILURE_DEFAULTS.verbLabel,
        onActivate: typeof spec.onActivate === 'function' ? spec.onActivate : restart,
      },
    });
    pane.classList.add('boot-error');
    mountCopyControls(pane, {
      code: spec.code || FLIGHT_FAILURE_DEFAULTS.code,
      headline: spec.headline || FLIGHT_FAILURE_DEFAULTS.headline,
      fills: spec.fills || FLIGHT_FAILURE_DEFAULTS.fills,
      detail: spec.detail || FLIGHT_FAILURE_DEFAULTS.detail,
      message: spec.message,
      site: spec.site,
      tick: spec.tick,
      simTime: spec.simTime,
    });
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
    // Resolve the build hash now so the Copy click never waits on it.
    try { primeDiagnosticsReport(); } catch (_) { /* the report falls back to the bundled version */ }

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
