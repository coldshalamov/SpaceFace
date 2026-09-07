// src/ui/station/screens/ledger.js — station lifecycle adapter for the Ship's Ledger.
// Mounts the SAME panel the Codex "Ledger" tab uses and maps the panel's show/hide/destroy onto
// the station contract (onShow/onHide/refresh/dispose). The panel owns no subscriptions; refresh
// reads the live state reference the station already holds, so there is no hidden refresh and no
// listener leak across host-switch or show/hide cycles.
//
// Frontend Task C §1.4: the station host is a split kit panel. The shared panel's children sit on
// the left (its root is `display: contents` under .sx-ledger — see styles/station.css); the right
// half reads the entry under the pointer or focus: its cycle at title size, the line as an
// emphasised sentence, the captain's hand as a sentence in the signal colour. The panel's own
// evidence detail (one image) takes the right half when an evidence row is opened.
import { createShipLedgerPanel } from '../../shipLedgerPanel.js';
import { el } from '../../kit/index.js';

export function createLedgerScreen(ctx) {
  const wrap = document.createElement('div');
  wrap.className = 'k-panel k-panel--split sx-ledger';
  const panel = createShipLedgerPanel(ctx, {
    hostId: 'station',
    headingLevel: 2,
    hostOptions: { title: "The Ship's Ledger", intro: 'The Tessera keeps what the manifests leave out.' },
  });
  wrap.appendChild(panel.el);

  // The reading column (station only): the entry the player rests on.
  const read = el('div', 'sx-ledger__read');
  read.hidden = true;
  const readKicker = el('p', 'k-caps sx-ledger__read-kicker');
  const readTitle = el('h3', 'k-display k-t-title sx-ledger__read-title');
  const readLine = el('p', 'k-sentence k-sentence--emph sx-ledger__read-line');
  const readHand = el('p', 'k-sentence k-signal sx-ledger__read-hand');
  read.append(readKicker, readTitle, readLine, readHand);
  wrap.appendChild(read);

  function readEntry(item) {
    const model = panel.model;
    const detail = panel.el.querySelector('.st-ledger-detail');
    if (!item || !model || (detail && !detail.hidden)) { read.hidden = true; return; }
    const entries = model.entries || [];
    const rows = [...panel.el.querySelectorAll('.st-ledger-entry')];
    const entry = entries[rows.indexOf(item)];
    if (!entry) { read.hidden = true; return; }
    for (const row of rows) row.setAttribute('aria-selected', String(row === item));
    readKicker.textContent = entry.type ? String(entry.type).toUpperCase() : '';
    readTitle.textContent = entry.cycleLabel || '';
    readLine.textContent = entry.text || '';
    readHand.textContent = entry.annotation || '';
    readHand.hidden = !entry.annotation;
    read.hidden = false;
  }
  function onPointerOver(ev) {
    const item = ev.target && ev.target.closest && ev.target.closest('.st-ledger-entry');
    if (item) readEntry(item);
  }
  function onFocusIn(ev) {
    const item = ev.target && ev.target.closest && ev.target.closest('.st-ledger-entry');
    if (item) readEntry(item);
  }
  // The panel's own evidence detail takes the right half while open; the reading column yields.
  function onClick(ev) {
    const t = ev.target && ev.target.closest && ev.target.closest('[data-ledger-evidence], [data-ledger-back]');
    if (!t) return;
    if (t.hasAttribute('data-ledger-evidence')) read.hidden = true;
    else setTimeout(readFirst, 0);
  }
  panel.el.addEventListener('pointerover', onPointerOver);
  panel.el.addEventListener('focusin', onFocusIn);
  panel.el.addEventListener('click', onClick);

  // Presentation fix owned at this layer: the shared panel (also mounted by the Codex host, which
  // is outside this screen's ownership) writes the status line itself and pluralizes "1 entries".
  // The singular case can only show when the archive has exactly one entry, which pins page 1 of
  // 1 and hides archive paging — so normalizing after each refresh this adapter triggers covers
  // every state in which the mispluralized line is reachable. The node keeps its role="status"
  // live-region semantics; only the text is corrected.
  function normalizeStatusPlural() {
    const status = panel.el.querySelector('.st-ledger-status');
    if (status && status.textContent.includes('1 entries')) {
      status.textContent = status.textContent.replace(/\b1 entries\b/g, '1 entry');
    }
  }
  // After each render the first entry is the one read, so the right half is never blank.
  function readFirst() {
    const selected = panel.el.querySelector('.st-ledger-entry[aria-selected="true"]') || panel.el.querySelector('.st-ledger-entry');
    readEntry(selected);
  }

  return {
    el: wrap,
    onShow() {
      panel.onShow();
      normalizeStatusPlural();
      readFirst();
    },
    // Declared with no parameter on purpose. The panel closes over the ctx it was built with and
    // reads `ctx.state` live, so it cannot honour a *different* ctx handed to refresh. Accepting one
    // and ignoring it would silently serve stale state if the station contract ever passes a new ctx.
    refresh() {
      panel.refresh();
      normalizeStatusPlural();
      readFirst();
    },
    onHide() { panel.onHide(); },
    dispose() {
      panel.el.removeEventListener('pointerover', onPointerOver);
      panel.el.removeEventListener('focusin', onFocusIn);
      panel.el.removeEventListener('click', onClick);
      panel.destroy();
    },
  };
}

export default createLedgerScreen;
