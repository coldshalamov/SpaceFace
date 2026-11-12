// globalFind.js — PQ-183.02 "one key finds anything". A thin find palette that opens on `/`
// (BINDINGS.find), searches every entity class through entityResolver.searchEntities, and lets
// the results be DOORS: each row carries data-entity, so the same delegated handler that opens
// every other link opens the found thing's dossier. Find owns no second entity browser.
//
// TWO MOUNT CASES, one rule — the palette always lives inside #screens so the delegate reaches
// its rows:
//
//   • A screen is up: palette mounts INSIDE the active screen root. Picked results open the
//     dossier on that screen, the palette waits behind the drawer, Esc unwinds in order
//     (drawer first — entityLinks' capture handler — then the palette).
//   • Flight (no screen): the palette carries .screen + aria-modal itself, because the drawer's
//     activeScreenRoot() lookup needs a .screen host. The dossier then mounts INSIDE the palette.
//
// Keyboard contract: type to search, ↑/↓ moves the row, Enter opens the dossier, Esc closes.
// While the input has focus the global key router already ignores letter keys (textEntry); the
// palette's own Esc stops propagation so one keypress never also opens Pause.
//
// ONE PANE, not three loose parts: field, results and hint sit in a single .sf-find__pane
// (chrome: orrery/popupsLayouts.js) so the palette reads as one instrument — the shared sheet's
// per-slab glass and the floating hint were two unrelated boxes and a stray caption.

import { searchEntities, findRowOpens } from './entityResolver.js';
import { ensurePopupsLayout } from './orrery/popupsLayouts.js';

const MAX_ROWS = 12;

function el(tag, className, opts = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (opts.text != null) node.textContent = opts.text;
  if (opts.attrs) for (const k in opts.attrs) node.setAttribute(k, opts.attrs[k]);
  return node;
}

export function createGlobalFind(ctx) {
  ensurePopupsLayout();
  const state = ctx && ctx.state;
  const bus = ctx && ctx.bus;
  const screensRoot = typeof document !== 'undefined' ? document.getElementById('screens') : null;
  if (!screensRoot) return { open() {}, close() {}, isOpen: () => false, destroy() {} };

  let panel = null;
  let pane = null;         // .sf-find__pane — the one glass the field, results and hint share
  let input = null;
  let listEl = null;
  let opener = null;
  let rows = [];
  let selIdx = 0;
  let destroyed = false;

  // Same query entityLinks' activeScreenRoot runs: the visible/modal screen, else none.
  function activeScreenRoot() {
    return screensRoot.querySelector('.screen[aria-modal="true"]')
      || screensRoot.querySelector('.screen.sf-screen--visible');
  }

  function paintRows() {
    if (!listEl) return;
    listEl.textContent = '';
    if (!rows.length) {
      input.removeAttribute('aria-activedescendant');
      const q = input && input.value.trim();
      if (q) listEl.appendChild(el('div', 'sf-find__empty k-t-fine', { text: 'Nothing by that name — yet.' }));
      return;
    }
    rows.forEach((row, i) => {
      // A row is a door only while it still opens. A contract can complete or a captain can leave
      // between render and a POINTER click, which bypasses `activateSelected`; a stale row keeps
      // its text but loses the data-entity hook, so the delegate has nothing dead to open.
      const opens = findRowOpens(state, row.ref);
      const btn = el('button', 'sf-find__row k-row' + (i === selIdx ? ' sf-find__row--sel' : ''), {
        attrs: {
          type: 'button',
          role: 'option',
          id: 'sf-find-option-' + i,
          tabindex: '-1',
          ...(opens ? { 'data-entity': row.ref } : {}),
          'aria-selected': i === selIdx ? 'true' : 'false',
        },
      });
      btn.appendChild(el('span', 'sf-find__kind', { text: row.type }));
      btn.appendChild(el('span', 'sf-find__name k-row__name', { text: row.label }));
      if (row.detail) btn.appendChild(el('span', 'sf-find__detail k-row__sub', { text: row.detail }));
      // Activation is the delegated data-entity path — but a plain click on the palette row is
      // still a click; no extra wiring needed. What the row cannot do is lie: searchEntities only
      // returns refs that resolve.
      listEl.appendChild(btn);
    });
    input.setAttribute('aria-activedescendant', 'sf-find-option-' + selIdx);
  }

  function refresh() {
    const q = input ? input.value.trim() : '';
    rows = q ? searchEntities(state, q, { limit: MAX_ROWS }) : [];
    selIdx = 0;
    paintRows();
  }

  function open() {
    if (destroyed) return;
    if (panel) { try { input && input.focus(); } catch (_) {} return; }
    const host = activeScreenRoot();
    opener = document.activeElement;
    const bare = !host;
    panel = el('div', 'sf-find' + (bare ? ' screen sf-find--host' : ''), {
      attrs: { role: 'dialog', 'aria-label': 'Find', 'aria-modal': 'true' },
    });
    input = el('input', 'sf-find__input', {
      attrs: {
        type: 'text', role: 'combobox', 'aria-expanded': 'true',
        'aria-controls': 'sf-find-results', 'aria-autocomplete': 'list',
        'aria-label': 'Find anything',
        placeholder: 'Find — a power, a price, a port, a name…',
        autocomplete: 'off',
        spellcheck: 'false',
        'data-sf-text': '',
      },
    });
    listEl = el('div', 'sf-find__results', { attrs: { id: 'sf-find-results', role: 'listbox', 'aria-label': 'Find results' } });
    const hint = el('div', 'sf-find__hint k-t-fine', { text: '↑↓ pick · Enter opens the dossier · Esc closes' });
    pane = el('div', 'sf-find__pane');
    const field = el('div', 'sf-find__field');
    const dismiss = el('button', 'sf-find__dismiss', { attrs: { type: 'button', 'aria-label': 'Close find' } });
    dismiss.addEventListener('click', close);
    field.append(input, dismiss);
    pane.append(field, listEl, hint);
    panel.appendChild(pane);
    (host || screensRoot).appendChild(panel);
    if (bare) {
      // screenManager parks #screens at display:none + inert whenever the stack is empty, so a
      // bare palette mounted there would lay out but never paint — lift the lid while it's up
      // and put it back on close (close() restores only when still no stack screen).
      screensRoot.style.display = 'flex';
      screensRoot.inert = false;
      screensRoot.removeAttribute('aria-hidden');
    }

    input.addEventListener('input', refresh);
    // Panel-level keys; Esc and Enter stop here so they never double-fire the screen behind.
    panel.addEventListener('keydown', onKey);
    // Click on the dimmed surround (not the field, not a row) dismisses — same muscle as Esc.
    panel.addEventListener('pointerdown', (ev) => {
      if (ev.target === panel) { ev.preventDefault(); close(); }
    });
    refresh();
    try { input.focus({ preventScroll: true }); } catch (_) { try { input.focus(); } catch (__) {} }
  }

  function activateSelected() {
    const row = rows[selIdx];
    if (!row || !listEl) return;
    // Re-check at the door: a contract can complete between render and Enter, and a dead door is
    // the one thing this palette is not allowed to have.
    if (!findRowOpens(state, row.ref)) { refresh(); return; }
    // Match the stored reference as data, never as CSS selector syntax.
    const btn = [...listEl.querySelectorAll('[data-entity]')]
      .find(node => node.getAttribute('data-entity') === row.ref);
    if (btn) btn.click(); // the delegate opens the dossier — one path, no second opener.
  }

  function onKey(ev) {
    // The flight-hosted drawer is a child of the palette. Its controls own their Enter and Tab.
    if (pane.inert || !pane.contains(ev.target)) return;
    if (ev.key === 'Tab') {
      ev.preventDefault();
      ev.stopPropagation();
      (document.activeElement === input ? pane.querySelector('.sf-find__dismiss') : input).focus();
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      close();
      return;
    }
    if (!rows.length || ev.target !== input) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      ev.stopPropagation();
      const old = listEl.children[selIdx];
      old.classList.remove('sf-find__row--sel');
      old.setAttribute('aria-selected', 'false');
      selIdx = (selIdx + (ev.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      const next = listEl.children[selIdx];
      next.classList.add('sf-find__row--sel');
      next.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', next.id);
      next.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      ev.stopPropagation();
      activateSelected();
    }
  }

  function close() {
    if (!panel) return;
    const p = panel;
    const restore = p.contains(document.activeElement) ? opener : null;
    opener = null;
    panel = null;
    input = null;
    listEl = null;
    rows = [];
    selIdx = 0;
    p.removeEventListener('keydown', onKey);
    pane = null;                                     // the pane dies with its panel
    const wasBareHost = p.classList.contains('sf-find--host');
    if (p.parentNode) p.parentNode.removeChild(p);
    if (wasBareHost) {
      const stackScreen = [...screensRoot.children].find((child) => (
        child !== p && child.classList
        && child.classList.contains('screen')
        && !child.classList.contains('sf-find--host')
      ));
      if (!stackScreen) {
        screensRoot.style.display = 'none';
        screensRoot.inert = true;
        screensRoot.setAttribute('aria-hidden', 'true');
      }
    }
    if (restore?.isConnected && !restore.closest('[inert]')) restore.focus?.({ preventScroll: true });
  }

  const off = bus && bus.on ? bus.on('ui:globalFind', () => open()) : null;
  // A dossier opened from a row (or anywhere) paints under this palette's z 4500 scrim; while it
  // is up the palette steps back so the drawer reads in front — "the palette waits behind the
  // drawer". entityLinks announces it (ui:entityDrawer); the class carries the recede look.
  const offDrawer = bus && bus.on ? bus.on('ui:entityDrawer', (ev) => {
    if (!panel) return;
    const open = !!ev?.open;
    pane.inert = open;
    panel.classList.toggle('sf-find--recede', open);
  }) : null;

  return {
    open,
    close,
    isOpen: () => !!panel,
    // Test seam: pure search over live state, same as the palette's own query path.
    search: (q, opts) => searchEntities(state, q, opts),
    destroy() {
      destroyed = true;
      close();
      if (typeof off === 'function') off();
      if (typeof offDrawer === 'function') offDrawer();
    },
  };
}
