// Opt-in support control. The normal player route has no diagnostic UI.
import { buildDiagnosticsReport, copyTextToClipboard, primeDiagnosticsReport } from './diagnosticsReport.js';

export function mountStartupReportControl({ state, document = globalThis.document, host = globalThis } = {}) {
  try {
    if (new URLSearchParams(host.location?.search || '').get('launchReport') !== '1') return null;
    if (!document?.body) return null;
    primeDiagnosticsReport();
    const root = document.createElement('aside');
    root.setAttribute('data-startup-report-control', '');
    root.setAttribute('aria-label', 'Launch support');
    Object.assign(root.style, { position: 'fixed', bottom: 'max(12px, env(safe-area-inset-bottom))',
      right: '12px', maxWidth: 'calc(100vw - 24px)', zIndex: '12000', pointerEvents: 'auto' });
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'sf-state__verb';
    Object.assign(button.style, { minHeight: '44px', padding: '10px 14px', fontSize: '16px', touchAction: 'manipulation' });
    button.textContent = 'Copy launch details';
    root.appendChild(button); document.body.appendChild(root);
    let fallback = null;
    const stop = event => event.stopPropagation();
    for (const event of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'keydown']) root.addEventListener(event, stop);
    const copy = event => {
      event.stopPropagation();
      const report = buildDiagnosticsReport(state);
      // Keep the native clipboard call inside the tap's user-activation window on iOS.
      copyTextToClipboard(report, { document, navigator: host.navigator }).then(copied => {
        if (!root.isConnected) return;
        button.textContent = copied ? 'Launch details copied' : 'Select and copy details below';
        if (copied) { fallback?.remove(); fallback = null; return; }
        if (!fallback) {
          fallback = document.createElement('textarea'); fallback.readOnly = true;
          fallback.setAttribute('aria-label', 'Launch details');
          Object.assign(fallback.style, { display: 'block', width: 'min(480px, calc(100vw - 24px))', height: '35vh', fontSize: '16px' });
          root.appendChild(fallback);
        }
        fallback.value = report; fallback.focus(); fallback.select();
      });
    };
    button.addEventListener('click', copy);
    return { destroy() { button.removeEventListener('click', copy); root.remove(); } };
  } catch { return null; }
}
