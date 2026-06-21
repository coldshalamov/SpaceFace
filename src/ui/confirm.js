// Shared confirmation dialog (UX-2). A lightweight modal that gates irreversible actions — ship
// sell, module unfit, mission abandon, save-overwrite, load (discards current), Pause→Main Menu,
// market Max-then-Buy. Returns a Promise<boolean>: resolve(true) on confirm, false on dismiss.
//
// Design: renders into a top-level overlay above #screens (z-index 5000) using the existing design
// tokens (sf-card / sf-btn--primary / sf-btn--ghost) so it inherits the cohesive identity without a
// new stylesheet. Focus-trapped: Tab cycles within the dialog, Esc cancels, focus moves to the
// confirm button on open and restores to the opener on close. Accessible (role=dialog, aria-modal,
// labelled). Honors the existing body.ui-modal-open class so the HUD hides underneath.
//
// Usage:
//   import { confirm } from './confirm.js';
//   if (await confirm({ title: 'Sell ship?', body: 'Refund: 12,500 CR (50%).', confirmLabel: 'Sell', danger: true })) { ... }

const STYLE_ID = 'sf-confirm-style';
let _openResolver = null;   // tracks the currently-open dialog's resolver so only one is live at a time

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
  #sf-confirm-root { position:fixed; inset:0; z-index:5000; display:flex; align-items:center;
    justify-content:center; background:rgba(3,5,10,.78); backdrop-filter:blur(6px);
    opacity:0; transition:opacity .16s var(--ease); pointer-events:auto; }
  #sf-confirm-root.sf-confirm--in { opacity:1; }
  .sf-confirm { width:min(440px, 92vw); background:linear-gradient(180deg,var(--panel-2),var(--panel));
    border:1px solid var(--panel-edge); border-radius:var(--r-lg); padding:var(--sp-5);
    box-shadow:var(--sh-3), 0 0 0 1px rgba(57,208,255,.08) inset; backdrop-filter:blur(8px);
    animation:sf-fadein var(--dur) var(--ease) both; }
  .sf-confirm__title { font-family:var(--mono); font-size:var(--t-lg); letter-spacing:.12em;
    text-transform:uppercase; color:var(--accent); text-shadow:0 0 14px rgba(57,208,255,.4);
    margin:0 0 var(--sp-2); }
  .sf-confirm__title.sf-confirm__title--danger { color:var(--danger);
    text-shadow:0 0 14px rgba(255,84,112,.4); }
  .sf-confirm__body { color:var(--ink-dim); font-size:var(--t-md); line-height:1.5;
    margin-bottom:var(--sp-5); white-space:pre-line; }
  .sf-confirm__body b { color:var(--ink); font-weight:600; }
  .sf-confirm__btns { display:flex; gap:var(--sp-3); justify-content:flex-end; }
  .sf-confirm__btns button { min-width:96px; padding:var(--sp-2) var(--sp-4);
    font-size:var(--t-sm); letter-spacing:.06em; text-transform:uppercase; font-family:inherit;
    border-radius:var(--r-md); cursor:pointer; pointer-events:auto; }
  `;
  document.head.appendChild(s);
}

function getRoot() {
  let root = document.getElementById('sf-confirm-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'sf-confirm-root';
    // mount at top level (above screens/toasts) — falls back to body if ui-root absent
    (document.getElementById('ui-root') || document.body).appendChild(root);
  }
  return root;
}

/**
 * Show a confirmation dialog. Resolves true on confirm, false on cancel/Esc/backdrop.
 * @param {object} opts
 * @param {string} opts.title     - dialog heading
 * @param {string} [opts.body]    - explanatory text (may contain <b> via text, but we use textContent so it's literal)
 * @param {string} [opts.confirmLabel='Confirm']
 * @param {string} [opts.cancelLabel='Cancel']
 * @param {boolean} [opts.danger=false] - renders the confirm button + title in the danger color
 * @returns {Promise<boolean>}
 */
export function confirm(opts) {
  opts = opts || {};
  injectStyle();
  // If a dialog is already open, reject it as cancelled (only one live at a time — avoids stacking).
  if (_openResolver) { const r = _openResolver; _openResolver = null; r(false); }

  const root = getRoot();
  // capture the element that had focus before opening so we can restore it on close
  const opener = document.activeElement;

  const titleCls = 'sf-confirm__title' + (opts.danger ? ' sf-confirm__title--danger' : '');
  const dialog = document.createElement('div');
  dialog.className = 'sf-confirm';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.innerHTML =
    `<h2 class="${titleCls}"></h2>` +
    `<div class="sf-confirm__body"></div>` +
    `<div class="sf-confirm__btns">` +
      `<button class="sf-btn sf-btn--ghost sf-confirm__cancel" type="button"></button>` +
      `<button class="sf-btn sf-confirm__ok" type="button"></button>` +
    `</div>`;
  dialog.querySelector('.sf-confirm__title').textContent = opts.title || 'Confirm';
  dialog.querySelector('.sf-confirm__body').textContent = opts.body || '';
  const cancelBtn = dialog.querySelector('.sf-confirm__cancel');
  const okBtn = dialog.querySelector('.sf-confirm__ok');
  cancelBtn.textContent = opts.cancelLabel || 'Cancel';
  okBtn.textContent = opts.confirmLabel || 'Confirm';
  // danger confirm button uses the danger variant
  okBtn.className = 'sf-btn ' + (opts.danger ? 'sf-btn--danger' : 'sf-btn--primary') + ' sf-confirm__ok';

  root.innerHTML = '';
  root.appendChild(dialog);
  document.body.classList.add('ui-modal-open');
  // animate in next frame
  requestAnimationFrame(() => root.classList.add('sf-confirm--in'));
  // focus the confirm button (the affirmative action is usually what keyboard users want)
  setTimeout(() => { try { okBtn.focus(); } catch (e) {} }, 30);

  // build the promise + a settle closure that tears down the dialog, restores focus, and resolves.
  let _resolve;
  const promise = new Promise((res) => { _resolve = res; });
  let settled = false;
  const close = (v) => {
    if (settled) return;
    settled = true;
    root.classList.remove('sf-confirm--in');
    document.body.classList.remove('ui-modal-open');
    setTimeout(() => {
      if (opener && typeof opener.focus === 'function') { try { opener.focus(); } catch (e) {} }
      if (root.parentNode) root.innerHTML = '';
    }, 160);
    _openResolver = null;
    _resolve(v);
  };
  _openResolver = close;

  okBtn.addEventListener('click', () => close(true));
  cancelBtn.addEventListener('click', () => close(false));
  // backdrop click (on the root, not the dialog) cancels
  root.addEventListener('click', (ev) => { if (ev.target === root) close(false); });
  // Esc cancels; Enter confirms. Focus-trap Tab between the two buttons.
  dialog.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(false); }
    else if (ev.key === 'Enter') { ev.preventDefault(); close(true); }
    else if (ev.key === 'Tab') {
      ev.preventDefault();
      // cycle between cancel and ok
      if (document.activeElement === okBtn) cancelBtn.focus(); else okBtn.focus();
    }
  });

  return promise;
}

/** Synchronous check whether a confirm dialog is currently open (for input routers). */
export function isConfirmOpen() {
  return !!_openResolver;
}
