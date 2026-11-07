// P1 — THE SHIP SHEET, as one DOM block every hull surface mounts.
//
// Shipworks (dock) and THE SHIP (flight) are the same shared stage, so both read this block from
// one place; New Game mounts it on the starter carousel. The Crucible Ship & Kit and the Swarm shop
// do NOT read this model yet — they live in other lanes and were not edited here. If they grow a
// six-stat block, it must read `shipStats.js`, not a second scale.
//
// What the block shows, in order:
//   1. the authored hull class beside the build word, then one sentence of shape
//      ("Tug · Runner — Built to get there first. Thinnest at handling.");
//   2. six rows, each `Name · ten pips · value 1–10`;
//   3. ONE plain meaning line that follows the row under the pointer or the keyboard;
//   4. a `Details` disclosure holding the engineering numbers the old screen led with, so nothing
//      is lost — it is only moved behind a door.
//
// Hover deltas are the same model's difference between the live fit and the ghost fit, in TENTHS
// of the 1–10 scale. Green for a gain, red for a loss, nothing for a wash. The exact after value is
// drawn from `afterTenths`, so a 0.2 move is visible even when the whole number does not move.
//
// ACCESSIBILITY: the rows are honest focusable list items (no `role="button"` and no click verb),
// because they select nothing; focusing one only changes the meaning line. The meaning is already
// in each row's `aria-label`, so the line itself is `aria-hidden` and is not a live region — a
// screen reader does not hear the same sentence twice on every focus move. Compact sheets (New
// Game) are not focus stops at all; they keep the meaning line as static text.

import { SHIP_STAT_DEFS, statDetailText } from './shipStats.js';

// Material belongs in deckplate/; this module owns the markup and re-exports the idempotent
// injector so existing callers keep one entry point.
export { ensureShipSheetStyles } from '../deckplate/shipSheetStyles.js';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let sheetInstance = 0;
function nextSheetId() {
  sheetInstance += 1;
  return sheetInstance;
}

function signedTenths(delta) {
  const n = Math.round(Number(delta) || 0);
  if (!n) return '';
  const sign = n > 0 ? '+' : '\u2212';
  return `${sign}${(Math.abs(n) / 10).toFixed(1)}`;
}

function tenthsWord(tenths) {
  return (Math.round(Number(tenths) || 0) / 10).toFixed(1);
}

function deltaTextFor(delta) {
  if (!delta) return '';
  const amount = signedTenths(delta.delta);
  if (!amount) return '';
  // Print the exact tenths on both sides. Whole numbers would show `6 -> 6 (-0.8)` for a move
  // from 6.3 to 5.5, which reads as a contradiction; the bar headline stays whole, the delta line
  // does not hide a real move behind the same digit.
  return `${tenthsWord(delta.beforeTenths)} \u2192 ${tenthsWord(delta.afterTenths)} (${amount})`;
}

function pipRow(stat, delta) {
  const lit = Math.max(0, Math.min(10, Math.round(stat.value)));
  const afterTenths = delta ? Math.max(10, Math.min(100, Math.round(delta.afterTenths))) : null;
  const cells = [];
  for (let i = 0; i < 10; i += 1) {
    const index = i + 1;
    let cls = 'sfs__pip';
    if (index <= lit) cls += ' is-lit';
    if (delta && delta.delta > 0) {
      const ghostTo = Math.min(10, Math.ceil(afterTenths / 10));
      if (index > lit && index <= ghostTo) cls += ' is-ghost-gain';
    }
    if (delta && delta.delta < 0) {
      const ghostFrom = Math.max(1, Math.floor(afterTenths / 10));
      if (index > ghostFrom && index <= lit) cls += ' is-ghost-loss';
    }
    cells.push(`<span class="${cls}"></span>`);
  }
  // The exact after reading as a marker inside the ten-pip track: any sub-half move shows here
  // even when the whole-number ghost band does not.
  const marker = delta && delta.delta
    ? `<i class="sfs__marker${delta.delta > 0 ? ' is-gain' : ' is-loss'}" style="left:${afterTenths}%"></i>`
    : '';
  return `<span class="sfs__pips" aria-hidden="true">${cells.join('')}${marker}</span>`;
}

/**
 * The sheet's markup.
 *
 * @param {object} sheet — `shipStatSheet()` output
 * @param {{delta?: Array, defaultStat?: string, heading?: string, compact?: boolean,
 *          sentence?: string, emptyNote?: string}} [opts]
 *   `delta` is `shipStatDelta()` output for a hovered or selected part; it paints the green/red
 *   preview without committing anything. `emptyNote` renders when every delta is a wash, so a
 *   part that changes no bar still says what it adds. `compact` drops the Details door and the
 *   focus stops for a screen that only needs the six readings, the build word and the meaning
 *   (New Game's starter choice); it keeps the meaning line.
 */
export function shipSheetHtml(sheet, opts = {}) {
  if (!sheet) return '';
  const compact = opts.compact === true;
  const deltaRows = Array.isArray(opts.delta) ? opts.delta : [];
  const deltaById = new Map(deltaRows.map((row) => [row.id, row]));
  const meaning = new Map(sheet.stats.map((stat) => [stat.id, stat.meaning]));
  const initial = opts.defaultStat || (sheet.stats[0] && sheet.stats[0].id) || 'firepower';
  // One id per mounted sheet: two sheets (a chooser preview beside the dock sheet) must not share
  // an `aria-controls` target.
  const engId = `sfs-eng-${nextSheetId()}`;
  const rows = sheet.stats.map((stat) => {
    const delta = deltaById.get(stat.id) || null;
    const deltaText = deltaTextFor(delta);
    const deltaCls = delta && delta.tone !== 'same' ? ` is-${delta.tone}` : '';
    const deltaAria = deltaText ? ` Now ${tenthsWord(delta.afterTenths)} of 10, ${signedTenths(delta.delta)}.` : '';
    const label = `${stat.label} ${stat.value} of 10. ${stat.meaning}${deltaAria}`;
    return (
      `<li class="sfs__stat" data-sfs-stat="${escapeHtml(stat.id)}" ` +
        `data-sfs-stat-meaning="${escapeHtml(stat.meaning)}" ` +
        (compact ? '' : 'tabindex="0" ') +
        `aria-label="${escapeHtml(label)}">` +
        `<span class="sfs__name">${escapeHtml(stat.label)}</span>` +
        `<span class="sfs__val"><span class="sfs__num">${stat.value}</span>` +
          `${deltaText ? `<i class="sfs__delta${deltaCls}">${escapeHtml(deltaText)}</i>` : ''}</span>` +
        pipRow(stat, delta) +
      `</li>`
    );
  }).join('');

  const allWash = deltaRows.length > 0 && deltaRows.every((row) => !row || row.delta === 0);
  const emptyNote = allWash && opts.emptyNote
    ? `<p class="sfs__note">${escapeHtml(opts.emptyNote)}</p>`
    : '';

  const detail = sheet.detail || {};
  const engineering = [
    ['Mass', `${detail.mass} t`],
    ['Ram weight', `${detail.ramWeight} t`],
    ['Hull', detail.hull],
    ['Shield', detail.shield],
    ['Armour', detail.armor],
    ['Capacitor', `${detail.capMax} (+${detail.capRegen}/s)`],
    ['Draw', `${detail.continuousDrain || 0}/s continuous`],
    ['Cargo', `${detail.cargo} u`],
    ['Fight speed', `${detail.fightSpeed} wu/s`],
    ['Burn gain', `${detail.burnPct || 0} %`],
    ['Turn rate', `${detail.turnRate} rad/s`],
    ['Thrust', `${detail.accel} wu/s²`],
    ['Tow class', detail.towRated ? (detail.towClass ? `${detail.towClass} t` : 'overloaded') : 'no tow'],
    ['Burst window', detail.sustainedFireS == null ? 'held' : `${detail.sustainedFireS} s`],
  ].map(([term, value]) => `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd>`).join('');

  return (
    `<section class="sfs${compact ? ' sfs--compact' : ''}" data-sfs data-sfs-identity="${escapeHtml(sheet.identity.id)}" ` +
      `data-sfs-default="${escapeHtml(initial)}">` +
      `<header class="sfs__head">` +
        `<p class="sfs__word"><span class="sfs__class">${escapeHtml(sheet.roleLabel || 'Ship')}</span> \u00b7 ${escapeHtml(sheet.identity.label)}</p>` +
        `<p class="sfs__line">${escapeHtml(opts.sentence || sheet.sentence || sheet.identity.gloss)}</p>` +
      `</header>` +
      `<ul class="sfs__stats">${rows}</ul>` +
      emptyNote +
      `<p class="sfs__meaning" data-sfs-meaning aria-hidden="true">${escapeHtml(meaning.get(initial) || '')}</p>` +
      (compact ? '' : (
        `<button type="button" class="sfs__details" data-sfs-details aria-expanded="false" aria-controls="${engId}">Details</button>` +
        `<dl class="sfs__eng" id="${engId}" data-sfs-eng hidden>${engineering}</dl>`
      )) +
    `</section>`
  );
}

/**
 * Wire a rendered sheet: the meaning line follows pointer and keyboard, and `Details` opens the
 * engineering numbers. Returns a disposer. Idempotent per element.
 */
export function bindShipSheet(rootEl) {
  if (!rootEl) return () => {};
  if (rootEl.__sfsBound) return rootEl.__sfsBound;
  const list = rootEl.querySelector('.sfs__stats');
  const meaningEl = rootEl.querySelector('[data-sfs-meaning]');
  const detailsBtn = rootEl.querySelector('[data-sfs-details]');
  const engEl = rootEl.querySelector('[data-sfs-eng]');
  const say = (id) => {
    if (!meaningEl || !id) return;
    const row = list ? list.querySelector(`[data-sfs-stat="${id}"]`) : null;
    if (!row) return;
    const text = row.getAttribute('data-sfs-stat-meaning') || '';
    meaningEl.textContent = text;
    for (const other of list ? list.querySelectorAll('.sfs__stat') : []) {
      other.classList.toggle('is-active', other === row);
    }
  };
  const onOver = (ev) => {
    const row = ev.target.closest && ev.target.closest('[data-sfs-stat]');
    if (row) say(row.getAttribute('data-sfs-stat'));
  };
  const onOut = () => say(rootEl.getAttribute('data-sfs-default'));
  const onFocus = (ev) => {
    const row = ev.target.closest && ev.target.closest('[data-sfs-stat]');
    if (row) say(row.getAttribute('data-sfs-stat'));
  };
  const onDetails = () => {
    if (!engEl || !detailsBtn) return;
    const open = engEl.hasAttribute('hidden');
    if (open) engEl.removeAttribute('hidden'); else engEl.setAttribute('hidden', '');
    detailsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  list?.addEventListener('pointerover', onOver);
  list?.addEventListener('pointerleave', onOut);
  list?.addEventListener('focusin', onFocus);
  list?.addEventListener('focusout', onOut);
  detailsBtn?.addEventListener('click', onDetails);
  say(rootEl.getAttribute('data-sfs-default'));
  const dispose = () => {
    list?.removeEventListener('pointerover', onOver);
    list?.removeEventListener('pointerleave', onOut);
    list?.removeEventListener('focusin', onFocus);
    list?.removeEventListener('focusout', onOut);
    detailsBtn?.removeEventListener('click', onDetails);
    rootEl.__sfsBound = null;
  };
  rootEl.__sfsBound = dispose;
  return dispose;
}

/** The six stat definitions, for a surface that wants to lay the rows out its own way. */
export function shipStatRows() {
  return SHIP_STAT_DEFS;
}

export { statDetailText };
