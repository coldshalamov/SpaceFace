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
import { createLedgerTape } from '../../orrery/ledgerTape.js';
import { formatLedgerCycle } from '../../../systems/shipLedger.js';
import { el } from '../../kit/index.js';
import { createEndingMeter } from '../dust/endingMeter.js';
import { rollTo } from '../../orrery/text.js';
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
// ORRERY colour law (design/frontend/ORRERY.md §3.3): red is threat only — a lost ship, an open
// scar, the patch that records one. Gains and stories carry no colour of their own: the signed
// figure (+/−) and the cap's own word are the channels, and the type cap reads bone like every
// other rest-state label.
const LOSS_TYPES = new Set(['loss', 'scar', 'patch']);

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
    '.sx-ledger .st-ledger-entry[aria-selected="true"]{box-shadow:none!important}' +
    // ORRERY §3.3 (P1): the tape Hand is this screen's one amber. The shared legend/key chrome
    // renders lamp-45% at rest (deckplate .fh-legend / .fh-key--legend), which put a second amber
    // on the board's empty line and on a disabled page key — both recede to bone here.
    '.sx-ledger .st-ledger-board-empty{color:color-mix(in srgb,var(--dp-ink-dim,#b7b4a6) 62%,transparent)!important}' +
    '.sx-ledger [data-ledger-page]:disabled{color:color-mix(in srgb,var(--dp-ink-mute,#b0aea6) 58%,transparent)!important}' +
    // the reading re-hangs when the column itself returns (never on an entry change): a 140ms
    // settle, instant under the game's own reduce-motion class
    '.sx-ledger__read.is-settle{animation:sx-ledger-read-settle 140ms var(--dp-ease-out,ease-out) both}' +
    '@keyframes sx-ledger-read-settle{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}' +
    'html.sf-reduce-motion .sx-ledger__read.is-settle{animation:none}';
  document.head.appendChild(style);
}

/**
 * What the reading column says about an entry: a hero figure with its unit when the entry is about
 * a number, the name of the thing it files, and a kicker of type · cycle · place. Pure over the
 * entry's own tokens (src/systems/shipLedger.js keeps them on the candidate), so a template's
 * wording never has to be parsed back.
 */
export function readingOf(entry) {
  const type = entry && entry.type ? String(entry.type) : '';
  const t = (entry && entry.tokens) || {};
  const cycle = (entry && entry.cycleLabel) || '';
  const kick = (...parts) => parts.filter(Boolean).join(' · ').toUpperCase();
  const str = (v) => (v == null ? '' : String(v));
  switch (type) {
    case 'trade': {
      // the purse's story is signed: sold is credits in, bought is credits out
      const credits = Number(String(t.credits || '').replace(/[^0-9.]/g, ''));
      const sold = t.verbPast === 'sold';
      const qty = Number(t.qty);
      const perUnit = Number.isFinite(credits) && qty > 0 ? Math.round(credits / qty) : null;
      const effect = [perUnit != null ? `${perUnit.toLocaleString('en-US')} cr per unit` : '', str(t.station)].filter(Boolean).join(' · ');
      // one label says the direction (TRADE · SOLD); the unit is only the unit, on the numeral's baseline
      return { hero: Number.isFinite(credits) ? `${sold ? '+' : '\u2212'}${credits.toLocaleString('en-US')}` : str(t.credits), unit: 'cr',
        title: [qty > 0 ? `${qty}u` : '', str(t.commodity)].filter(Boolean).join(' '), kicker: kick(type, sold ? 'sold' : 'bought'), line: effect };
    }
    case 'witness':
      return t.credits
        ? { hero: `\u2212${str(t.credits)}`, unit: 'cr paid', title: str(t.event), kicker: kick(type, 'credits out', str(t.cause)) }
        : { hero: '', unit: '', title: str(t.event), kicker: kick(type, cycle, str(t.outcome)) };
    case 'bearing':
      return { hero: str(t.radius), unit: 'u search ring', title: str(t.wreck), kicker: kick(type, cycle, str(t.sector)) };
    case 'loss':
      return { hero: '', unit: '', title: str(t.ship), kicker: kick(type, cycle, str(t.sector)) };
    case 'rumor':
    case 'unique':
      return { hero: '', unit: '', title: str(t.wreck), kicker: kick(type, cycle, str(t.source || t.choice || t.outcome)) };
    case 'scar':
    case 'patch':
      return { hero: '', unit: '', title: [str(t.band), str(t.facing)].filter(Boolean).join(' · '), kicker: kick(type, cycle, str(t.what)) };
    case 'renown':
      return { hero: '', unit: '', title: str(t.ship), kicker: kick(type, cycle, str(t.faction), str(t.sector)) };
    case 'title':
      return { hero: '', unit: '', title: str(t.title), kicker: kick(type, cycle) };
    case 'name':
      return { hero: '', unit: '', title: str(t.name), kicker: kick(type, cycle) };
    case 'salvage': {
      // FB-014 — a stunt-minted right: the chit count is the hero, the act that minted (or
      // redeemed) it is the title, and the kicker names the direction like trade does.
      const redeemed = str(t.verbPast) === 'redeemed';
      const rights = Number(t.rights);
      return {
        hero: Number.isFinite(rights) ? `${redeemed ? '' : '+'}${rights}` : str(t.rights),
        unit: 'salvage chits',
        title: str(t.trick),
        kicker: kick(type, redeemed ? 'redeemed' : 'minted'),
      };
    }
    default: {
      const digits = cycleDigits(cycle);
      return { hero: digits, unit: 'cycle', title: '', kicker: kick(type) };
    }
  }
}

function cycleDigits(label) {
  const match = String(label || '').match(/(\d+)/);
  return match ? match[1] : '';
}

function toneColor(type) {
  if (LOSS_TYPES.has(type)) return 'var(--dp-danger, var(--k-bad))';
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

  // ORRERY §6 Ledger: the tape on a cycle scale is the hero, above the reading; the Hand rides it at
  // the entry being read, and picking a tick reads that entry
  const tapeHost = el('div', 'orr-ledger-tape');
  tapeHost.setAttribute('aria-hidden', 'true');
  let tape = null;
  function tapeEntryOf(entry) {
    const t = (entry && entry.tokens) || {};
    const type = entry && entry.type ? String(entry.type) : '';
    const credits = t.credits != null ? Number(String(t.credits).replace(/[^0-9.]/g, '')) : NaN;
    let amount = null;
    if (type === 'trade' && Number.isFinite(credits)) amount = (t.verbPast === 'sold' ? 1 : -1) * credits;
    else if (type === 'witness' && Number.isFinite(credits)) amount = -credits;
    return { id: entry.id, type, at: Number(entry.at) || 0, cycleLabel: entry.cycleLabel || '', amount };
  }
  function syncTape(selectedId) {
    const model = panel.model;
    const entries = model && Array.isArray(model.entries) ? model.entries.map(tapeEntryOf) : [];
    if (!tape) tape = createLedgerTape(tapeHost, { onPick: (id) => pickById(id), purseHost, readingHost: read });
    let nowCycle = '';
    try { nowCycle = formatLedgerCycle(Number(ctx && ctx.state && ctx.state.simTime) || 0); } catch (_) { nowCycle = ''; }
    tape.set({ entries, selectedId: selectedId || null, nowCycle });
  }
  function pickById(id) {
    const model = panel.model;
    const entries = (model && model.entries) || [];
    const idx = entries.findIndex((e) => e && e.id === id);
    if (idx < 0) return;
    const rows = [...panel.el.querySelectorAll('.st-ledger-entry')];
    if (rows[idx]) { readEntry(rows[idx]); if (typeof rows[idx].focus === 'function') rows[idx].focus({ preventScroll: true }); }
  }

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
  // the captain's hand reads as quiet voice in bone — amber stays the tape Hand's alone (ORRERY §3.3);
  // the station skin sizes and tints .sx-ledger__read-hand, so no signal class is wanted here
  const readHand = el('p', 'k-sentence sx-ledger__read-hand');
  read.append(readKicker, readHero, readTitle, readLine, readHand);
  // the right column: the tape above, the reading beneath the Hand's tick
  // the purse gauge stands beside the reading, off the tape's baseline: two instruments, two zones
  const purseHost = el('div', 'orr-ledger-purse');
  purseHost.setAttribute('aria-hidden', 'true');
  const row = el('div', 'sx-ledger__row');
  row.append(read, purseHost);
  const right = el('div', 'sx-ledger__right');
  right.append(tapeHost, row);
  right.append(createEndingMeter(ctx.state));   // DUST P2b — read-only eligibility readout
  wrap.appendChild(right);
  // the keys that walk the ledger, said once at the ladder's foot
  const keys = el('p', 'k-caps sx-ledger__keys');
  keys.textContent = '\u2191\u2193 Read \u00b7 \u2190\u2192 Page';
  keys.setAttribute('aria-hidden', 'true');
  const navEl = panel.el.querySelector('.st-ledger-nav');
  if (navEl) navEl.insertAdjacentElement('afterend', keys); else panel.el.appendChild(keys);
  panel.el.addEventListener('keydown', (ev) => {
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
      const rows = [...panel.el.querySelectorAll('.st-ledger-entry')];
      if (!rows.length) return;
      const cur = rows.findIndex((r) => r.getAttribute('aria-selected') === 'true');
      const next = rows[Math.max(0, Math.min(rows.length - 1, (cur < 0 ? 0 : cur) + (ev.key === 'ArrowDown' ? 1 : -1)))];
      if (!next) return;
      ev.preventDefault();
      readEntry(next);
      if (typeof next.focus === 'function') next.focus({ preventScroll: true });
    } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      const btn = panel.el.querySelector(ev.key === 'ArrowLeft' ? '[data-ledger-page="newer"]' : '[data-ledger-page="older"]');
      if (!btn || btn.disabled || btn.hidden) return;
      ev.preventDefault();
      btn.click();
    }
  });

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
      const onboard = row.querySelector('[data-ledger-onboard]');
      if (onboard) paintCap(onboard);
    }
    // Row 444 — the case board wears the same chrome: legend type, key affordances, keyrack plate.
    const boardEl = panel.el.querySelector('.st-ledger-board');
    if (boardEl) {
      pinKeyrack(boardEl);
      paintCap(boardEl.querySelector('.st-ledger-board-head'));
      paintLegend(boardEl.querySelector('.st-ledger-board-empty'), true);
      paintLegend(boardEl.querySelector('.st-ledger-board-note'), true);
      paintLegend(boardEl.querySelector('.st-ledger-board-banner'));
      for (const btn of boardEl.querySelectorAll('button')) paintKey(btn, 'small');
      for (const thread of boardEl.querySelectorAll('.st-ledger-thread')) paintLegend(thread);
    }
    pinKeyrack(panel.el.querySelector('.st-ledger-nav'));
    for (const btn of panel.el.querySelectorAll('[data-ledger-page]')) paintKey(btn, 'legend');
    const detail = panel.el.querySelector('.st-ledger-detail');
    // the key hints describe the ladder; while the evidence page holds the screen they say nothing
    // that is reachable, so they stand down with the list
    if (keys) keys.hidden = !!(detail && !detail.hidden);
    if (detail && !detail.hidden) {
      paintPlate(detail, 'sunk');
      paintMarking(detail.querySelector('.st-ledger-detail-title'));
      paintLegend(detail.querySelector('.st-ledger-provenance'));
      paintLegend(detail.querySelector('.st-ledger-detail-note'), true);
      const back = detail.querySelector('[data-ledger-back]');
      if (back) paintKey(back, 'legend');
      for (const tool of detail.querySelectorAll('.st-ledger-detail-tools button')) paintKey(tool, 'small');
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
    if (!item || !model || (detail && !detail.hidden)) { read.hidden = true; syncTape(null); dressLedger(); return; }
    const entries = model.entries || [];
    const rows = [...panel.el.querySelectorAll('.st-ledger-entry')];
    const entry = entries[rows.indexOf(item)];
    if (!entry) { read.hidden = true; syncTape(null); dressLedger(); return; }
    syncTape(entry.id);
    for (const row of rows) row.setAttribute('aria-selected', String(row === item));
    const type = entry.type ? String(entry.type) : '';
    const color = toneColor(type);
    if (color) pin(readKicker, { color });
    // The reading leads with the figure the entry is about (the credits of a trade, the ring of a
    // bearing), then the thing it names; the cycle rides in the kicker so it is never said twice.
    const r = readingOf(entry);
    readKicker.textContent = r.kicker;
    rollTo(readHeroN, r.hero);
    readHeroW.textContent = r.unit;
    readHero.hidden = !r.hero;
    readTitle.textContent = r.title;
    readTitle.hidden = !r.title;
    // a trade's sentence already stands in its row; the reading carries the effect instead
    readLine.textContent = r.line != null ? r.line : (entry.text || '');
    readLine.hidden = !readLine.textContent;
    readHand.textContent = entry.annotation || '';
    readHand.hidden = !entry.annotation;
    // the column re-hangs when it itself returns (first read, back from an evidence page) —
    // never on an entry change, which is an instrument update, not an arrival
    const revealing = read.hidden;
    read.hidden = false;
    if (revealing && !document.documentElement.classList.contains('sf-reduce-motion')) {
      read.classList.remove('is-settle');
      void read.offsetWidth;
      read.classList.add('is-settle');
    }
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
  // A board chip opening the same detail yields the same way. The Hand stands down with it — a
  // leader pointing at a reading that is no longer there is a false statement. A page turn
  // re-serves the adapter's normalize + first-read pass, which the panel's own nav bypasses
  // (its refresh re-renders rows from templates and swaps the archive slice under the tape).
  function onClick(ev) {
    const t = ev.target && ev.target.closest && ev.target.closest('[data-ledger-evidence], [data-ledger-board-open], [data-ledger-back], [data-ledger-page]');
    if (!t) return;
    if (t.hasAttribute('data-ledger-evidence') || t.hasAttribute('data-ledger-board-open')) {
      read.hidden = true;
      syncTape(null);
      dressLedger();
    } else if (t.hasAttribute('data-ledger-page')) {
      // no disabled guard: the panel's own nav listener has already turned the page by the time
      // this bubbles here and will have disabled the button just left — a fresh disabled check
      // would read the post-turn state and cancel the re-sync. A disabled key cannot dispatch
      // click at all, so a delivered event is a real turn by construction.
      setTimeout(afterPageTurn, 0);
    } else setTimeout(readFirst, 0);
  }
  function afterPageTurn() {
    normalizeStatusPlural();
    readFirst();
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
    // one page is no archive: the count stands alone, and the key hint offers PAGE only when there is one
    if (status && /archive page 1 of 1/i.test(status.textContent)) status.textContent = status.textContent.replace(/\s*Archive page 1 of 1\.?/i, '').replace(/\.\s*$/, '');
    // the board's empty line may not promise an action the archive cannot serve: with no receipts
    // there is no evidence page to open, so the line says what would bring one instead
    const boardEmpty = panel.el.querySelector('.st-ledger-board-empty');
    if (boardEmpty) {
      if (!boardEmpty.dataset.ledgerDefaultCopy) boardEmpty.dataset.ledgerDefaultCopy = boardEmpty.textContent;
      const archiveEmpty = !panel.model || panel.model.total === 0;
      boardEmpty.textContent = archiveEmpty
        ? 'Nothing pinned yet — evidence rides in with the first receipts.'
        : boardEmpty.dataset.ledgerDefaultCopy;
    }
    // a trade's line item is equipment, not prose: verb · quantity · commodity · station · signed figure
    const rows = [...panel.el.querySelectorAll('.st-ledger-entry')];
    const entries = (panel.model && panel.model.entries) || [];
    rows.forEach((row, i) => {
      const entry = entries[i];
      if (!entry || String(entry.type) !== 'trade') return;
      const t = entry.tokens || {};
      const credits = Number(String(t.credits || '').replace(/[^0-9.]/g, ''));
      if (!Number.isFinite(credits)) return;
      const sold = t.verbPast === 'sold';
      const verb = String(t.verbPast || t.verb || (sold ? 'sold' : 'bought'));
      const line = row.querySelector('.st-ledger-line');
      if (line) {
        line.textContent = '';
        const item = document.createElement('span'); item.className = 'sx-ledger__item';
        item.textContent = `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${t.qty != null ? `${t.qty}u ` : ''}${t.commodity || ''} \u00b7 ${t.station || ''}`;
        const fig = document.createElement('span'); fig.className = 'sx-ledger__fig';
        fig.textContent = `${sold ? '+' : '\u2212'}${credits.toLocaleString('en-US')} cr`;
        line.append(item, fig);
      }
    });
    const older = panel.el.querySelector('[data-ledger-page="older"]');
    const newer = panel.el.querySelector('[data-ledger-page="newer"]');
    const paged = (older && !older.disabled && !older.hidden) || (newer && !newer.disabled && !newer.hidden);
    keys.textContent = paged ? '\u2191\u2193 Read \u00b7 \u2190\u2192 Page' : '\u2191\u2193 Read';
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
      if (!panel.el.querySelector('.st-ledger-entry')) syncTape(null);
      dressShell();
    },
    // Declared with no parameter on purpose. The panel closes over the ctx it was built with and
    // reads `ctx.state` live, so it cannot honour a *different* ctx handed to refresh. Accepting one
    // and ignoring it would silently serve stale state if the station contract ever passes a new ctx.
    refresh() {
      panel.refresh();
      normalizeStatusPlural();
      readFirst();
      if (!panel.el.querySelector('.st-ledger-entry')) syncTape(null);
      dressShell();
    },
    onHide() { panel.onHide(); },
    dispose() {
      if (tape) { tape.dispose(); tape = null; }
      panel.el.removeEventListener('pointerover', onPointerOver);
      panel.el.removeEventListener('focusin', onFocusIn);
      panel.el.removeEventListener('click', onClick);
      panel.destroy();
    },
  };
}

export default createLedgerScreen;
