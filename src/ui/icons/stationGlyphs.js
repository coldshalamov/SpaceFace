// src/ui/icons/stationGlyphs.js — the DUST station tab glyphs (DUST P5, BS-5).
//
// The berth's destination rail read as "eight paragraphs of micro-text": every tab was a
// 12px word on the ruled line and nothing else. Each destination word now leads with its
// glyph. The LABEL STAYS (accessibility: the spoken name, the checks, and players who read
// faster than they decode pictures all keep the word) — the glyph augments, never replaces.
//
// These render inside `.sx-tile__label` beside the 12px label text, sized in lockstep with
// it (13px) and aligned to the text's baseline via a minimal inline style, because the
// Orrery station sheet deliberately hides the old `.sx-tile__seat` artwork rail and this
// packet's hook points do not include stylesheets. Same hand as the other DUST glyph sets:
// 24×24 grid, single 1.8 stroke, square caps, miter joins, currentColor — the tab's own
// bone/amber state colors flow through the token layer untouched.

const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter"';

/** The berth's destinations (stationApp.js DESTINATIONS), one glyph each. */
export const STATION_TAB_GLYPHS = Object.freeze({
  // the exchange: four quoted bars on a baseline
  market: `<path ${STROKE} d="M5 19v-7.5M10 19V5.5M15 19v-6M20 19V9"/><path ${STROKE} d="M4 20.5h17" opacity="0.55"/>`,
  // the yard: a hull in its gantry, deck line across
  shipworks: `<path ${STROKE} d="M12 3.6c3 2.1 4.6 5.2 4.6 9 0 2.5-.7 4.5-1.7 6.1H9.1c-1-1.6-1.7-3.6-1.7-6.1 0-3.8 1.6-6.9 4.6-9Z"/><path ${STROKE} d="M8.6 11.6h6.8" opacity="0.8"/>`,
  // the works: a roofline of bays, one door open
  industry: `<path ${STROKE} d="M4.5 20V11l5 3.2V11l5 3.2V6.5l5 3.2V20Z"/><path ${STROKE} d="M10.5 20v-3.2" opacity="0.75"/>`,
  // the board: a posted sheet, corner turned, terms lined
  contracts: `<path ${STROKE} d="M7 3.5h7l4 4v13H7Z"/><path ${STROKE} d="M14 3.5v4h4" opacity="0.75"/><path ${STROKE} d="M10 12h5M10 15.5h5" opacity="0.8"/>`,
  // the powers: one shield
  factions: `<path ${STROKE} d="M12 3.6 5.5 6.4v5.2c0 4 2.9 7.4 6.5 8.6 3.6-1.2 6.5-4.6 6.5-8.6V6.4Z"/>`,
  // the bar: one glass, pour line, footed
  bar: `<path ${STROKE} d="M5.5 4.5h13l-6 7v6M11 17.5h4M8.7 7.5h6.6" opacity="0.9"/>`,
  // the ledger: a bound book, spine ruled
  ledger: `<rect x="5" y="4.5" width="14" height="15" ${STROKE}/><path ${STROKE} d="M9 4.5v15" opacity="0.7"/><path ${STROKE} d="M11.8 9h4M11.8 12h4M11.8 15h2.6" opacity="0.8"/>`,
});

/** The tab ids STATION_TAB_GLYPHS covers — the berth's destination rail. */
export const STATION_TAB_IDS = Object.freeze(Object.keys(STATION_TAB_GLYPHS));

const DEFAULT_TAB = 'market';

function tabKey(id) {
  const key = String(id || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(STATION_TAB_GLYPHS, key) ? key : DEFAULT_TAB;
}

export function hasStationTabGlyph(id) {
  return Object.prototype.hasOwnProperty.call(STATION_TAB_GLYPHS, String(id || '').trim().toLowerCase());
}

/**
 * The glyph for a station destination, as a decorative inline `<svg>` sized to the tab
 * label's 12px rhythm (13px, pulled onto the text baseline). Augments the label; the label
 * itself is never replaced.
 */
export function stationTabGlyphSvg(id, { size = 13 } = {}) {
  const key = tabKey(id);
  return `<svg class="dust-tab-glyph" viewBox="0 0 24 24" width="${size}" height="${size}" ${STROKE}`
    + ` style="vertical-align:-2.2px;margin-right:5px" aria-hidden="true" focusable="false" data-tab-glyph="${key}">`
    + `${STATION_TAB_GLYPHS[key]}</svg>`;
}
