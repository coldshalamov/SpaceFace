// P1 — THE SHIP SHEET, as one DOM block every hull surface mounts.
//
// Shipworks (dock) and THE SHIP (flight) are the same shared stage, so both read this block from
// one place; New Game mounts it on the starter carousel. The Crucible Ship & Kit and the Swarm
// shop read the model (`shipStats.js`) directly and may render their own markup, but they must not
// grow a second scale.
//
// What the block shows, in order:
//   1. the build word and one sentence of shape ("Skirmisher — Built to turn and stop on a coin.
//      Thinnest at power.");
//   2. six rows, each `Name · ten pips · value 1–10`;
//   3. ONE plain meaning line that follows the row under the pointer or the keyboard;
//   4. a `Details` disclosure holding the engineering numbers the old screen led with, so nothing
//      is lost — it is only moved behind a door.
//
// Hover deltas are the same model's difference between the live fit and the ghost fit, in TENTHS
// of the 1–10 scale. Green for a gain, red for a loss, nothing for a wash. A ghost pip is drawn on
// the bar so a 0.4 gain is still visible when the whole number does not move.

import { SHIP_STAT_DEFS, statDetailText } from './shipStats.js';

const STYLE_ID = 'sf-ship-sheet-css';

const CSS = `
.sfs { display: block; font-variant-numeric: tabular-nums; max-width: 340px; }
.sfs__head { margin: 0 0 10px; }
.sfs__word {
  margin: 0; font-family: var(--dp-face-display, inherit); font-size: 22px; line-height: 1.05;
  letter-spacing: .01em; color: var(--dp-ink, #E8E2D4); text-transform: none;
}
.sfs__line { margin: 4px 0 0; font-size: 12px; line-height: 1.42; color: var(--dp-ink-dim, #B7B4A6); max-width: 34ch; }
.sfs__stats { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.sfs__stat {
  display: grid; grid-template-columns: minmax(72px, 1fr) auto; align-items: center;
  column-gap: 8px; padding: 4px 0 5px; border-bottom: 1px solid rgba(232,226,212,.10);
  cursor: default; outline: none;
}
.sfs__stat:last-child { border-bottom: 0; }
.sfs__stat:focus-visible { outline: 1px solid var(--dp-lamp, #F2B950); outline-offset: 2px; }
.sfs__stat.is-active .sfs__name { color: var(--dp-ink, #E8E2D4); }
.sfs__name { font-size: 12px; letter-spacing: .06em; color: var(--dp-ink-dim, #B7B4A6); text-transform: uppercase; }
.sfs__val { display: inline-flex; align-items: baseline; gap: 6px; }
.sfs__num { font-family: var(--dp-face-num, monospace); font-size: 17px; line-height: 1; color: var(--dp-ink, #E8E2D4); }
.sfs__delta { font-family: var(--dp-face-num, monospace); font-size: 12px; font-style: normal; letter-spacing: 0; }
.sfs__delta.is-gain { color: var(--dp-good, #7FE7A6); }
.sfs__delta.is-loss { color: var(--dp-danger, #FF5038); }
.sfs__pips { grid-column: 1 / -1; display: flex; gap: 2px; margin-top: 4px; }
.sfs__pip { flex: 1 1 0; height: 3px; background: rgba(232,226,212,.14); }
.sfs__pip.is-lit { background: var(--dp-ink, #E8E2D4); }
.sfs__pip.is-ghost-gain { background: var(--dp-good, #7FE7A6); }
.sfs__pip.is-ghost-loss { background: var(--dp-danger, #FF5038); }
.sfs__meaning { margin: 8px 0 0; font-size: 12px; line-height: 1.45; color: var(--dp-ink-dim, #B7B4A6); min-height: 2.9em; }
.sfs__details {
  margin-top: 8px; padding: 0; border: 0; background: none; color: var(--dp-ink-dim, #B7B4A6);
  font: inherit; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; cursor: pointer;
}
.sfs__details:hover, .sfs__details:focus-visible { color: var(--dp-lamp, #F2B950); }
.sfs__details:focus-visible { outline: 1px solid var(--dp-lamp, #F2B950); outline-offset: 2px; }
.sfs__eng { margin: 8px 0 0; display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; font-size: 12px; }
.sfs__eng dt { color: var(--dp-ink-mute, #B0AEA6); }
.sfs__eng dd { margin: 0; font-family: var(--dp-face-num, monospace); color: var(--dp-ink-dim, #B7B4A6); text-align: right; }
.sfs__eng[hidden] { display: none; }
.sfs--compact { max-width: 300px; }
.sfs--compact .sfs__word { font-size: 16px; }
.sfs--compact .sfs__stat { padding: 3px 0 4px; }
@media (prefers-reduced-motion: no-preference) {
  .sfs__pip { transition: background-color 120ms linear; }
}
`;

/** Inject the block's stylesheet once per document. Safe to call on every render. */
export function ensureShipSheetStyles(doc = null) {
  const host = doc || (typeof document !== 'undefined' ? document : null);
  if (!host || host.getElementById(STYLE_ID)) return;
  const style = host.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  (host.head || host.documentElement).appendChild(style);
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function signedTenths(delta) {
  const n = Math.round(Number(delta) || 0);
  if (!n) return '';
  const sign = n > 0 ? '+' : '\u2212';
  return `${sign}${(Math.abs(n) / 10).toFixed(1)}`;
}

function pipRow(stat, delta) {
  const lit = Math.max(0, Math.min(10, Math.round(stat.value)));
  const ghost = delta ? Math.max(-10, Math.min(10, Math.round(delta.delta / 10))) : 0;
  const cells = [];
  for (let i = 0; i < 10; i += 1) {
    const index = i + 1;
    let cls = 'sfs__pip';
    if (index <= lit) cls += ' is-lit';
    if (ghost > 0 && index > lit && index <= lit + ghost) cls += ' is-ghost-gain';
    if (ghost < 0 && index > lit + ghost && index <= lit) cls += ' is-ghost-loss';
    cells.push(`<span class="${cls}"></span>`);
  }
  return `<span class="sfs__pips" aria-hidden="true">${cells.join('')}</span>`;
}

/**
 * The sheet's markup.
 *
 * @param {object} sheet — `shipStatSheet()` output
 * @param {{delta?: Array, defaultStat?: string, heading?: string, compact?: boolean}} [opts]
 *   `delta` is `shipStatDelta()` output for a hovered or selected part; it paints the green/red
 *   preview without committing anything. `compact` drops the meaning line and the Details door for
 *   a screen that only needs the six readings and the build word (New Game's starter choice).
 */
export function shipSheetHtml(sheet, opts = {}) {
  if (!sheet) return '';
  const compact = opts.compact === true;
  const deltaRows = Array.isArray(opts.delta) ? opts.delta : [];
  const deltaById = new Map(deltaRows.map((row) => [row.id, row]));
  const meaning = new Map(sheet.stats.map((stat) => [stat.id, stat.meaning]));
  const initial = opts.defaultStat || (sheet.stats[0] && sheet.stats[0].id) || 'firepower';
  const rows = sheet.stats.map((stat) => {
    const delta = deltaById.get(stat.id) || null;
    const deltaText = delta ? signedTenths(delta.delta) : '';
    const deltaCls = delta && delta.tone !== 'same' ? ` is-${delta.tone}` : '';
    const label = `${stat.label} ${stat.value} of 10. ${stat.meaning}`;
    return (
      // Compact sheets are readings: there is no meaning panel or action to focus.
      `<li class="sfs__stat" data-sfs-stat="${escapeHtml(stat.id)}"${compact ? '' : ' tabindex="0" role="button"'} ` +
        `aria-label="${escapeHtml(label)}">` +
        `<span class="sfs__name">${escapeHtml(stat.label)}</span>` +
        `<span class="sfs__val"><span class="sfs__num">${stat.value}</span>` +
          `${deltaText ? `<i class="sfs__delta${deltaCls}">${deltaText}</i>` : ''}</span>` +
        pipRow(stat, delta) +
      `</li>`
    );
  }).join('');

  const detail = sheet.detail || {};
  const engineering = [
    ['Mass', `${detail.mass} t`],
    ['Hull', detail.hull],
    ['Shield', detail.shield],
    ['Armour', detail.armor],
    ['Capacitor', `${detail.capMax} (+${detail.capRegen}/s)`],
    ['Cargo', `${detail.cargo} u`],
    ['Fight speed', `${detail.fightSpeed} wu/s`],
    ['Turn rate', `${detail.turnRate} rad/s`],
    ['Thrust', `${detail.accel} wu/s²`],
    ['Tow class', detail.towClass ? `${detail.towClass} t` : 'no tow'],
    ['Burst window', detail.sustainedFireS == null ? 'held' : `${detail.sustainedFireS} s`],
  ].map(([term, value]) => `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd>`).join('');

  return (
    `<section class="sfs${compact ? ' sfs--compact' : ''}" data-sfs data-sfs-identity="${escapeHtml(sheet.identity.id)}" ` +
      `data-sfs-default="${escapeHtml(initial)}">` +
      `<header class="sfs__head">` +
        `<p class="sfs__word">${escapeHtml(sheet.identity.label)}</p>` +
        `<p class="sfs__line">${escapeHtml(opts.sentence || sheet.sentence || sheet.identity.gloss)}</p>` +
      `</header>` +
      `<ul class="sfs__stats">${rows}</ul>` +
      (compact ? '' : (
        `<p class="sfs__meaning" data-sfs-meaning aria-live="polite">${escapeHtml(meaning.get(initial) || '')}</p>` +
        `<button type="button" class="sfs__details" data-sfs-details aria-expanded="false" aria-controls="sfs-eng">Details</button>` +
        `<dl class="sfs__eng" id="sfs-eng" data-sfs-eng hidden>${engineering}</dl>`
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
    const label = row.getAttribute('aria-label') || '';
    const text = label.replace(/^.*?of 10\.\s*/, '');
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
