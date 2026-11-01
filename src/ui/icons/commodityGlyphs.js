// src/ui/icons/commodityGlyphs.js — the DUST commodity glyph set (DUST P5, BS-5).
//
// One glyph per catalogue CATEGORY, then a small honest grade bar for rare stock. The
// vision audit's finding was that the market read as "66 near-identical circles": the fix is
// not 66 bespoke pictures but 16 silhouettes whose OUTER GEOMETRY differs at a glance —
// a boulder is round-lumpy, a gas bottle is tall, an ingot stack is flat-wide, a cross is a
// cross — so the eye sorts a 60-row register into families before it reads a single name.
//
// House hand (design/frontend/ORRERY.md §2, src/ui/views/commodityGlyphs.js precedent):
// 24×24 grid, ONE stroke weight (1.8 — bolder than the 1.35 wireframe it replaces, because
// these ship at 16px in market rows where 1.35 dissolved into mush), square caps, miter
// joins, `stroke="currentColor"` so every row state (family tint, selection, the Orrery
// market sheet's bone/ink repaints) lights the glyph through the token layer. No fill, no
// colour literals: monochrome wayfinding only (TONE_BIBLE §2 — icons are signage, not jokes).
//
// Grade bar: `marketTier` is the catalogue's own rarity ladder (the minimum sector tier where
// a station may stock the good). Tier 2–3 draws a short bar under the silhouette, tier 4 a
// full-width one — the premium lots (platinoids, gems, credentials) carry a heavier keel.
// Deterministic from data; no ambient state is read.

import { COMMODITIES } from '../../data/commodities.js';

const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter"';

/** The 16 catalogue categories, each a distinct silhouette. */
export const COMMODITY_CATEGORY_GLYPHS = Object.freeze({
  // a fractured boulder: angular lump, two fault faces
  'raw ore': `<path ${STROKE} d="M4.5 15 7 8l5-3.5 5.5 3.5 1.5 7-5 4.5H9Z"/><path ${STROKE} d="m7 8 4.5 3.5 7.5-.5M11.5 11.5 10.5 19.5" opacity="0.75"/>`,
  // a gas bottle: tall cylinder, valve stem, shoulder seam
  gas: `<rect x="7.5" y="8" width="9" height="11.5" rx="2.4" ${STROKE}/><path ${STROKE} d="M10.5 8V5h3v3M9.5 12.5h5" opacity="0.8"/>`,
  // a prism crystal: tall rhombus, one longitudinal seam
  crystal: `<path ${STROKE} d="M12 3 16 8.5 14 19.5h-4L8 8.5Z"/><path ${STROKE} d="M8 8.5h8M12 3v16.5" opacity="0.75"/>`,
  // exotica: a four-point core inside an inclined orbit
  exotic: `<path ${STROKE} d="m12 8.4 1.1 2.5 2.5 1.1-2.5 1.1-1.1 2.5-1.1-2.5-2.5-1.1 2.5-1.1Z"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(-28 12 12)" ${STROKE}/>`,
  // bioresource: a rounded cell, nucleus and one vacuole — organic, never machined
  bioresource: `<rect x="6" y="4.5" width="12" height="15" rx="5.2" ${STROKE}/><circle cx="12" cy="12" r="2.8" ${STROKE}/><circle cx="15.8" cy="8.2" r="1.1" ${STROKE} opacity="0.8"/>`,
  // protocol: a credential card, contact bands left, one wide read band right
  protocol: `<rect x="4.5" y="7" width="15" height="10.5" rx="1.6" ${STROKE}/><path ${STROKE} d="M7.5 10h3.5M7.5 13.5h3.5M13.5 10.5h3M13.5 13h3" opacity="0.8"/>`,
  // salvage: a plate with a torn corner folded back
  salvage: `<path ${STROKE} d="M5 7.5h8.5l5.5 5.5v3.5h-14Z"/><path ${STROKE} d="M13.5 7.5V13H19" opacity="0.75"/>`,
  // refined: two stacked billets in profile
  refined: `<path ${STROKE} d="M3.5 12 6 8.5h7.5L16 12Z"/><path ${STROKE} d="M8 16.5l2.5-3.5H18l2.5 3.5Z" opacity="0.85"/>`,
  // component: a hex nut with its bore
  component: `<path ${STROKE} d="M12 3.5 19 7.75v8.5L12 20.5 5 16.25v-8.5Z"/><circle cx="12" cy="12" r="3" ${STROKE}/>`,
  // tech: a chip package, die inside, four pins
  tech: `<rect x="7.5" y="7.5" width="9" height="9" ${STROKE}/><rect x="10.6" y="10.6" width="2.8" height="2.8" ${STROKE}/><path ${STROKE} d="M10 7.5V5M14 7.5V5M10 19v-2.5M14 19v-2.5" opacity="0.8"/>`,
  // consumer: a lidded crate, strap band
  consumer: `<rect x="4.5" y="8" width="15" height="11" ${STROKE}/><path ${STROKE} d="M4.5 12h15M9.5 8 12 4.5 14.5 8" opacity="0.8"/>`,
  // luxury: a brilliant-cut gem, table and facets
  luxury: `<path ${STROKE} d="M4 9.5 8 5h8l4 4.5-8 10Z"/><path ${STROKE} d="M4 9.5h16M8 5l2.7 4.5L12 19.5M16 5l-2.7 4.5" opacity="0.75"/>`,
  // food: a grain head on its stalk
  food: `<path ${STROKE} d="M12 20.5V7"/><path ${STROKE} d="m12 10-3.5-2.5M12 10l3.5-2.5M12 13.5 8.5 11M12 13.5l3.5-2.5M12 7 10.2 4M12 7l1.8-3" opacity="0.85"/>`,
  // med: a plain bold cross — the one glyph that is its symbol and nothing else
  med: `<path ${STROKE} d="M9.5 4.5h5V9.5h5v5h-5v5h-5v-5h-5v-5h5Z"/>`,
  // contraband: a sealed case, struck through
  contraband: `<rect x="5" y="7.5" width="14" height="10.5" ${STROKE}/><path ${STROKE} d="M5 11.5h14" opacity="0.7"/><path ${STROKE} d="M4.5 20.5 19.5 5.5"/>`,
  // military: a pointed round over its driving band
  military: `<path ${STROKE} d="M8.5 19.5h7M10 19.5V12l2-6.5L14 12v7.5Z"/><path ${STROKE} d="M10 15h4" opacity="0.75"/>`,
});

const DEFAULT_CATEGORY = 'consumer';

/** The grade bar strokes for a market tier (rarity keel). '' for everyday stock. */
function gradeBarFor(marketTier) {
  const tier = Math.floor(Number(marketTier));
  if (!Number.isFinite(tier) || tier < 2) return '';
  return tier >= 4
    ? `<path ${STROKE} d="M5.5 21.7h13" opacity="0.85"/>`
    : `<path ${STROKE} d="M8.5 21.7h7" opacity="0.85"/>`;
}

function categoryOf(def) {
  const category = def && typeof def.category === 'string' ? def.category.trim().toLowerCase() : '';
  return Object.prototype.hasOwnProperty.call(COMMODITY_CATEGORY_GLYPHS, category) ? category : DEFAULT_CATEGORY;
}

/**
 * The DUST glyph for one commodity, as a complete inline `<svg>` string.
 *
 * `def` may be a catalogue record (category + marketTier read from it) or a plain
 * `{ category, marketTier }`. The class and `data-commodity-glyph` attribute match the
 * presentation-layer glyph this replaces, so existing row CSS (the Orrery market sheet sizes
 * `.of-commodity-icon` at 16px and repaints it by row state) keeps applying untouched.
 */
export function commodityGlyphSvg(def, { className = 'of-commodity-icon', size = 16 } = {}) {
  const category = categoryOf(def);
  const tier = def && Number.isFinite(Number(def.marketTier)) ? Math.floor(Number(def.marketTier)) : -1;
  const body = `${COMMODITY_CATEGORY_GLYPHS[category]}${gradeBarFor(tier)}`;
  return `<svg class="${className}" viewBox="0 0 24 24" width="${size}" height="${size}" ${STROKE} aria-hidden="true" focusable="false" data-commodity-glyph="${category}" data-glyph-grade="${Math.max(0, tier)}">${body}</svg>`;
}

/**
 * Graft the DUST glyph into a market row's HTML, replacing the presentation-layer
 * `of-commodity-icon` svg in place. The surrounding presentation span (family colour,
 * `data-commodity-presentation`) is left exactly as the presentation layer emitted it.
 *
 * This is the one seam the market screen owns: `marketPresentation.js` stays the row's
 * author, and the screen swaps only the glyph element it hosts.
 */
export function applyCommodityGlyph(rowHtml, def) {
  const html = String(rowHtml || '');
  if (!html) return html;
  const glyph = commodityGlyphSvg(def);
  return html.replace(/<svg class="of-commodity-icon"[^>]*>[\s\S]*?<\/svg>/, glyph);
}

/** Every catalogue id → its category, so callers (and tests) can prove full coverage. */
export const COMMODITY_GLYPH_CATEGORIES = Object.freeze(
  Object.fromEntries(COMMODITIES.map((c) => [c.id, categoryOf(c)])),
);

export const COMMODITY_GLYPH_CATEGORY_IDS = Object.freeze(Object.keys(COMMODITY_CATEGORY_GLYPHS));
