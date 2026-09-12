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
// Field Hardware chrome (kit plates, keys, quiet type) is pinned from this module. Evidence,
// paging and Back stay the same verbs.
import { createShipLedgerPanel } from '../../shipLedgerPanel.js';
import { el } from '../../kit/index.js';
import { dressComms, watchComms } from './comms.js';
import { dressEvents, watchEvents } from './events.js';
import {
  ensureInteriorStyle,
  paintCap,
  paintHeroNum,
  paintKey,
  paintLegend,
  paintMarking,
  paintPlate,
  paintRow,
  paintWindow,
  pin,
  pinKeyrack,
  syncKeys,
} from './fhChrome.js';

const STYLE_ID = 'sf-station-ledger-fh';
const LOSS_TYPES = new Set(['loss', 'scar', 'patch']);
const GAIN_TYPES = new Set(['trade', 'renown', 'title', 'name']);

function ensureLedgerStyle() {
  ensureInteriorStyle();
  if (typeof document === 'undefined' || !document.head) return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    '.sx-ledger .k-word.fh-key::after{display:none!important}' +
    '.sx-ledger .st-ledger-entry.fh-row{box-shadow:none!important;background-color:transparent!important}' +
    '.sx-ledger .fh-keyrack{gap:6px!important;align-items:center!important;flex-wrap:wrap!important}' +
    '.sx-ledger .st-ledger-entry[aria-selected="true"]{box-shadow:none!important}';
  document.head.appendChild(style);
}

function cycleDigits(label) {
  const match = String(label || '').match(/(\d+)/);
  return match ? match[1] : '';
}

function toneColor(type) {
  if (LOSS_TYPES.has(type)) return 'var(--fh-hazard, var(--k-bad))';
  if (GAIN_TYPES.has(type)) return 'var(--k-good)';
  if (type === 'rumor' || type === 'bearing' || type === 'unique') return 'var(--fh-legend-lit, var(--k-signal))';
  return '';
}

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
  const readHero = el('div', 'k-hero sx-ledger__read-hero');
  const readHeroN = el('span', 'k-hero__n sx-ledger__read-num');
  const readHeroW = el('span', 'k-hero__w sx-ledger__read-unit');
  readHeroW.textContent = 'cycle';
  readHero.append(readHeroN, readHeroW);
  const readTitle = el('h3', 'k-display k-t-title sx-ledger__read-title');
  const readLine = el('p', 'k-sentence k-sentence--emph sx-ledger__read-line');
  const readHand = el('p', 'k-sentence k-signal sx-ledger__read-hand');
  read.append(readKicker, readHero, readTitle, readLine, readHand);
  wrap.appendChild(read);

  function dressShell() {
    const shell = (wrap.closest && wrap.closest('.sx-berth, .sx-app, .k-screen'))
      || (typeof document !== 'undefined' ? document : wrap);
    dressEvents(shell);
    dressComms(shell);
  }

  function dressLedger() {
    ensureLedgerStyle();
    paintMarking(panel.el.querySelector('.st-sub-h'));
    paintLegend(panel.el.querySelector('.st-ledger-intro'));
    paintLegend(panel.el.querySelector('.st-ledger-status'), true);
    paintLegend(panel.el.querySelector('.st-ledger-empty'), true);
    paintLegend(panel.el.querySelector('.st-ledger-page'));
    for (const row of panel.el.querySelectorAll('.st-ledger-entry')) {
      paintRow(row, row.getAttribute('aria-selected') === 'true');
      paintLegend(row.querySelector('.st-ledger-cycle'));
      const typeEl = row.querySelector('.st-ledger-type');
      if (typeEl) {
        paintCap(typeEl);
        const color = toneColor(row.getAttribute('data-ledger-entry-type'));
        if (color) pin(typeEl, { color });
      }
      const evidence = row.querySelector('[data-ledger-evidence]');
      if (evidence) paintKey(evidence, 'small');
    }
    pinKeyrack(panel.el.querySelector('.st-ledger-nav'));
    for (const btn of panel.el.querySelectorAll('[data-ledger-page]')) paintKey(btn, 'legend');
    const detail = panel.el.querySelector('.st-ledger-detail');
    if (detail && !detail.hidden) {
      paintPlate(detail, 'sunk');
      paintMarking(detail.querySelector('.st-ledger-detail-title'));
      paintLegend(detail.querySelector('.st-ledger-provenance'));
      const back = detail.querySelector('[data-ledger-back]');
      if (back) paintKey(back, 'legend');
      const figure = detail.querySelector('.st-ledger-figure');
      if (figure) paintWindow(figure);
    } else if (!read.hidden) {
      paintPlate(read, 'sunk');
      paintLegend(readKicker, true);
      if (!readHero.hidden) {
        paintHeroNum(readHeroN);
        paintLegend(readHeroW);
        paintLegend(readTitle);
      } else {
        paintMarking(readTitle);
      }
    }
    syncKeys(wrap);
  }

  function readEntry(item) {
    const model = panel.model;
    const detail = panel.el.querySelector('.st-ledger-detail');
    if (!item || !model || (detail && !detail.hidden)) { read.hidden = true; dressLedger(); return; }
    const entries = model.entries || [];
    const rows = [...panel.el.querySelectorAll('.st-ledger-entry')];
    const entry = entries[rows.indexOf(item)];
    if (!entry) { read.hidden = true; dressLedger(); return; }
    for (const row of rows) row.setAttribute('aria-selected', String(row === item));
    const type = entry.type ? String(entry.type) : '';
    readKicker.textContent = type ? type.toUpperCase() : '';
    const color = toneColor(type);
    if (color) pin(readKicker, { color });
    const digits = cycleDigits(entry.cycleLabel);
    readHeroN.textContent = digits;
    readHero.hidden = !digits;
    readTitle.textContent = entry.cycleLabel || '';
    readLine.textContent = entry.text || '';
    readHand.textContent = entry.annotation || '';
    readHand.hidden = !entry.annotation;
    read.hidden = false;
    dressLedger();
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
    if (t.hasAttribute('data-ledger-evidence')) {
      read.hidden = true;
      dressLedger();
    } else setTimeout(readFirst, 0);
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

  watchEvents();
  watchComms();

  return {
    el: wrap,
    onShow() {
      panel.onShow();
      normalizeStatusPlural();
      readFirst();
      dressShell();
    },
    // Declared with no parameter on purpose. The panel closes over the ctx it was built with and
    // reads `ctx.state` live, so it cannot honour a *different* ctx handed to refresh. Accepting one
    // and ignoring it would silently serve stale state if the station contract ever passes a new ctx.
    refresh() {
      panel.refresh();
      normalizeStatusPlural();
      readFirst();
      dressShell();
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
