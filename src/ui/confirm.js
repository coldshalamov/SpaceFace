// Shared confirmation dialog (UX-2). A lightweight modal that gates irreversible actions — ship
// sell, module unfit, mission abandon, save-overwrite, load (discards current), Pause→Main Menu,
// market Max-then-Buy. Returns a Promise<boolean>: resolve(true) on confirm, false on dismiss.
//
// Design (frontend direction sheet, Task D §4.2): the dialog is kit words on a dark ground — a
// display title, a sentence, and two words in a row (the destructive one `k-word--danger`). No
// plate, no border, no glow; the rules live in styles/kit.css under "Task D additions".
// Focus-trapped: Tab cycles within the dialog, Esc cancels, focus moves to the safe default on
// open, and restores to the opener on close. Accessible (role=dialog, aria-modal,
// labelled/described). Honors the existing body.ui-modal-open class so the HUD hides underneath.
// `#sf-confirm-root`, `.sf-confirm`, `.sf-confirm__ok/__cancel`, `#sf-confirm-title/-body` and
// `sf-confirm__title--danger` are inert hooks the checks and probes query — keep them.
//
// Usage:
//   import { confirm } from './confirm.js';
//   if (await confirm({ title: 'Sell ship?', body: 'Refund: 12,500 CR (50%).', confirmLabel: 'Sell', danger: true })) { ... }

let _openResolver = null;   // tracks the currently-open dialog's resolver so only one is live at a time
// True while the live confirm chain owns body.ui-modal-open (vs. a screen/dock session).
// Inherited across supersession so B does not steal teardown rights from a screen-owned class.
let _confirmOwnsModalOpen = false;

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

/** Opener is restorable only when still connected, visible, and not inert/disabled. */
function isRestorableTarget(el) {
  if (!el || el === document.body || el === document.documentElement) return false;
  if (!el.isConnected || typeof el.focus !== 'function') return false;
  if (el.disabled) return false;
  if (el.hidden) return false;
  if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return false;
  if (el.style && (el.style.display === 'none' || el.style.visibility === 'hidden')) return false;
  let p = el.parentNode;
  while (p && p !== document && p !== document.documentElement && p !== document.body) {
    if (p.hidden) return false;
    if (p.getAttribute && p.getAttribute('aria-hidden') === 'true') return false;
    if (p.style && (p.style.display === 'none' || p.style.visibility === 'hidden')) return false;
    p = p.parentNode;
  }
  return true;
}

function tryFocus(el) {
  if (!isRestorableTarget(el)) return false;
  try {
    el.focus({ preventScroll: true });
  } catch (e) {
    try { el.focus(); } catch (_) { return false; }
  }
  return document.activeElement === el;
}

/** First focusable control in the visible active #screens child (toast/screenManager parity). */
function tryFocusActiveScreen() {
  const screens = document.getElementById('screens');
  if (!screens || screens.style.display === 'none') return false;
  const kids = screens.children || [];
  for (let i = 0; i < kids.length; i++) {
    const screenEl = kids[i];
    if (!screenEl || screenEl.style.display === 'none') continue;
    const items = screenEl.querySelectorAll
      ? screenEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      : [];
    for (let j = 0; j < items.length; j++) {
      if (tryFocus(items[j])) return true;
    }
  }
  return false;
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
  // If a dialog is already open, reject it as cancelled (only one live at a time — avoids stacking).
  // Capture pre-supersession so a second confirm inherits modal-open ownership from the first
  // when the first still holds ui-modal-open during its delayed close cleanup.
  const wasConfirmOpen = !!_openResolver;
  if (_openResolver) { const r = _openResolver; _openResolver = null; r(false); }

  const root = getRoot();
  const token = Symbol('sf-confirm');
  root._sfConfirmToken = token;
  // capture the element that had focus before opening so we can restore it on close
  const opener = document.activeElement;
  // Screen-owned modal: leave body class alone. Confirm-owned (including supersession transfer):
  // remove on our final delayed cleanup only. Inherit chain ownership on supersession —
  // do not treat every supersession as confirm-owned (would strip a screen/dock class).
  const hadModalOpen = wasConfirmOpen
    ? !_confirmOwnsModalOpen
    : document.body.classList.contains('ui-modal-open');
  _confirmOwnsModalOpen = !hadModalOpen;

  const titleCls = 'k-display k-t-sub sf-confirm__title' + (opts.danger ? ' sf-confirm__title--danger' : '');
  const dialog = document.createElement('div');
  dialog.className = 'sf-confirm';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.innerHTML =
    `<h2 class="${titleCls}" id="sf-confirm-title"></h2>` +
    `<p class="k-sentence sf-confirm__body" id="sf-confirm-body"></p>` +
    `<ul class="k-words k-words--row sf-confirm__btns">` +
      `<li><button class="k-word k-word--body sf-confirm__cancel" type="button"></button></li>` +
      `<li><button class="k-word sf-confirm__ok" type="button"></button></li>` +
    `</ul>`;
  dialog.setAttribute('aria-labelledby', 'sf-confirm-title');
  dialog.setAttribute('aria-describedby', 'sf-confirm-body');
  dialog.querySelector('#sf-confirm-title').textContent = opts.title || 'Confirm';
  dialog.querySelector('#sf-confirm-body').textContent = opts.body || '';
  const cancelBtn = dialog.querySelector('.sf-confirm__cancel');
  const okBtn = dialog.querySelector('.sf-confirm__ok');
  cancelBtn.textContent = opts.cancelLabel || 'Cancel';
  okBtn.textContent = opts.confirmLabel || 'Confirm';
  // the destructive word is red; otherwise the confirming word is the primary (signal) one
  okBtn.className = 'k-word k-word--emph ' + (opts.danger ? 'k-word--danger' : 'k-word--primary') + ' sf-confirm__ok';

  root.innerHTML = '';
  root.appendChild(dialog);
  document.body.classList.add('ui-modal-open');
  // Danger dialogs default to Cancel so a stray Enter never commits an irreversible action.
  const initialFocus = opts.danger ? cancelBtn : okBtn;
  const focusInitial = () => {
    if (root._sfConfirmToken !== token) return;
    try { initialFocus.focus({ preventScroll: true }); }
    catch (e) {
      try { initialFocus.focus(); } catch (_) {}
    }
  };
  const onFocusIn = (ev) => {
    if (root._sfConfirmToken !== token || dialog.contains(ev.target)) return;
    ev.stopPropagation();
    focusInitial();
  };
  document.addEventListener('focusin', onFocusIn, true);
  focusInitial();
  // animate in next frame, then re-assert focus in case the game shell bootstraps late
  requestAnimationFrame(() => {
    root.classList.add('sf-confirm--in');
    focusInitial();
  });
  setTimeout(focusInitial, 30);

  // build the promise + a settle closure that tears down the dialog, restores focus, and resolves.
  let _resolve;
  const promise = new Promise((res) => { _resolve = res; });
  let settled = false;
  function onBackdropClick(ev) {
    if (ev.target === root) close(false);
  }
  const close = (v) => {
    if (settled) return;
    settled = true;
    root.classList.remove('sf-confirm--in');
    // Keep modal/input-fence ownership until delayed cleanup completes so keyboard cannot race
    // the fade-out while focus still lives on dialog controls. Supersession still works via
    // settled + token check (second confirm() nulls _openResolver then takes ownership).
    setTimeout(() => {
      const sameDialog = root._sfConfirmToken === token;
      root.removeEventListener('click', onBackdropClick);
      document.removeEventListener('focusin', onFocusIn, true);
      if (sameDialog) {
        // Validate opener restorability; fall back to first valid control in visible active screen.
        let restored = false;
        if (isRestorableTarget(opener)) {
          try { opener.focus({ preventScroll: true }); }
          catch (e) {
            try { opener.focus(); } catch (_) {}
          }
          restored = document.activeElement === opener;
        }
        if (!restored) tryFocusActiveScreen();
        // Avoid leaving focus inside the dialog about to be removed.
        const active = document.activeElement;
        if (active && root.contains && root.contains(active) && typeof active.blur === 'function') {
          try { active.blur(); } catch (e) {}
        }
        if (root.parentNode) root.innerHTML = '';
        root._sfConfirmToken = null;
        if (!hadModalOpen) document.body.classList.remove('ui-modal-open');
        // Final sameDialog cleanup ends the chain; clear ownership flag either way.
        _confirmOwnsModalOpen = false;
      }
      if (_openResolver === close) _openResolver = null;
      _resolve(v);
    }, 160);
  };
  _openResolver = close;

  okBtn.addEventListener('click', () => close(true));
  cancelBtn.addEventListener('click', () => close(false));
  // backdrop click (on the root, not the dialog) cancels
  root.addEventListener('click', onBackdropClick);
  // Esc cancels. Enter follows the focused button so danger dialogs can default safely to Cancel.
  dialog.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(false); }
    else if (ev.key === 'Enter') {
      if (document.activeElement === okBtn) { ev.preventDefault(); ev.stopPropagation(); close(true); }
      else if (document.activeElement === cancelBtn) { ev.preventDefault(); ev.stopPropagation(); close(false); }
    }
    else if (ev.key === 'Tab') {
      ev.preventDefault();
      ev.stopPropagation();
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

function confirmRoot() {
  return typeof document !== 'undefined' ? document.getElementById('sf-confirm-root') : null;
}

/** Gamepad A/Cross: activate the focused confirm control, else Confirm. */
export function confirmGamepadAccept() {
  if (!_openResolver) return false;
  const root = confirmRoot();
  if (!root) return false;
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  if (active && root.contains(active) && typeof active.click === 'function') {
    active.click();
    return true;
  }
  const ok = root.querySelector('.sf-confirm__ok');
  if (ok && typeof ok.click === 'function') { ok.click(); return true; }
  return false;
}

/** Gamepad B/Circle: Cancel. */
export function confirmGamepadCancel() {
  if (!_openResolver) return false;
  const root = confirmRoot();
  const cancel = root && root.querySelector('.sf-confirm__cancel');
  if (cancel && typeof cancel.click === 'function') { cancel.click(); return true; }
  return false;
}
