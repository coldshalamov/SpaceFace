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

import { searchEntities, entityExists } from './entityResolver.js';

const MAX_ROWS = 12;

function el(tag, className, opts = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (opts.text != null) node.textContent = opts.text;
  if (opts.attrs) for (const k in opts.attrs) node.setAttribute(k, opts.attrs[k]);
  return node;
}

export function createGlobalFind(ctx) {
  const state = ctx && ctx.state;
  const bus = ctx && ctx.bus;
  const screensRoot = typeof document !== 'undefined' ? document.getElementById('screens') : null;
  if (!screensRoot) return { open() {}, close() {}, isOpen: () => false, destroy() {} };

  let panel = null;
  let input = null;
  let listEl = null;
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
      const q = input && input.value.trim();
      if (q) listEl.appendChild(el('div', 'sf-find__empty k-t-fine', { text: 'Nothing by that name — yet.' }));
      return;
    }
    rows.forEach((row, i) => {
      const btn = el('button', 'sf-find__row k-row' + (i === selIdx ? ' sf-find__row--sel' : ''), {
        attrs: {
          type: 'button',
          role: 'option',
          'data-entity': row.ref,
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
    const bare = !host;
    panel = el('div', 'sf-find' + (bare ? ' screen sf-find--host' : ''), {
      attrs: bare
        ? { role: 'dialog', 'aria-label': 'Find', 'aria-modal': 'true' }
        : { role: 'dialog', 'aria-label': 'Find' },
    });
    input = el('input', 'sf-find__input', {
      attrs: {
        type: 'text',
        'aria-label': 'Find anything',
        placeholder: 'Find — a power, a price, a port, a name…',
        autocomplete: 'off',
        spellcheck: 'false',
        'data-sf-text': '',
      },
    });
    listEl = el('div', 'sf-find__results', { attrs: { role: 'listbox', 'aria-label': 'Find results' } });
    const hint = el('div', 'sf-find__hint k-t-fine', { text: '↑↓ pick · Enter opens the dossier · Esc closes' });
    panel.append(input, listEl, hint);
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
    if (!entityExists(row.ref)) { refresh(); return; }
    const btn = listEl.querySelector(`[data-entity="${row.ref}"]`);
    if (btn) btn.click(); // the delegate opens the dossier — one path, no second opener.
  }

  function onKey(ev) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      close();
      return;
    }
    if (!rows.length) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      selIdx = (selIdx + (ev.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      paintRows();
      return;
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      activateSelected();
    }
  }

  function close() {
    if (!panel) return;
    const p = panel;
    panel = null;
    input = null;
    listEl = null;
    rows = [];
    selIdx = 0;
    p.removeEventListener('keydown', onKey);
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
  }

  const off = bus && bus.on ? bus.on('ui:globalFind', () => open()) : null;

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
    },
  };
}
