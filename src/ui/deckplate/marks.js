// Deckplate marks — the produced heraldry, placed.
//
// 37 marks were rendered for this game and ONE was wired: faction crests as hex shields, mode and
// arena dials, difficulty chevrons, system marks. They are the highest-detail art the frontend has
// and they were invisible, while the screens that needed them printed names in a list
// (design/frontend/ONE_PHOTOGRAPH.md §4.12: a glyph where a mark exists is a defect).
//
// Inline SVG, like the icons, for two reasons: forced colours keeps inline SVG and currentColor
// and drops background images; and a two-tone mark needs its `.accent` path reachable in the DOM
// so the lamp can light it. A CSS mask can do neither.

import { DP_MARKS } from './markPaths.js';

/** Every mark name, as it appears on disk (crest-mts, mark-swarm, insignia-difficulty-3, ...). */
export const DP_MARK_NAMES = Object.freeze(Object.keys(DP_MARKS).sort());

export function hasDpMark(name) {
  return Object.prototype.hasOwnProperty.call(DP_MARKS, String(name));
}

/** A faction id maps to its crest. Unknown factions get nothing rather than a wrong crest. */
export function factionCrestName(factionId) {
  if (!factionId) return '';
  const bare = String(factionId).replace(/^faction[_-]/, '');
  // The 14 faction ids map 1:1 to the 14 crest files, but the two spellings disagree on the
  // separator for the one id that has one: faction_verge_layers / crest-verge_layers. Try the id
  // as written first, then the hyphenated form, rather than guessing which convention won.
  for (const slug of [bare, bare.replace(/_/g, '-')]) {
    if (hasDpMark(`crest-${slug}`)) return `crest-${slug}`;
  }
  return '';
}

/**
 * Markup for one mark. Decorative by default; pass `label` to give it an accessible name.
 *
 * `size` is a CSS length or one of the named sizes the light layer defines — hero (240), large
 * (140), tile (88), badge (28). A mark below 48px where a produced mark exists is a defect, so the
 * badge size exists only for a chip that sits beside its own text.
 *
 * An unknown name renders nothing. A wrong crest on a faction is worse than no crest.
 *
 * @param {string} name
 * @param {{ size?: string, lit?: boolean, label?: string, className?: string }} [opts]
 * @returns {string}
 */
export function dpMark(name, { size = 'tile', lit = false, label = '', className = '' } = {}) {
  const mark = DP_MARKS[String(name)];
  if (!mark) return '';
  const named = ['hero', 'large', 'tile', 'badge'].includes(size);
  const a11y = label
    ? `role="img" aria-label="${String(label).replace(/"/g, '&quot;')}"`
    : 'aria-hidden="true" focusable="false"';
  const cls = ['dp-mark', named ? `dp-mark--${size}` : '', lit ? 'dp-mark--lit' : '', className]
    .filter(Boolean).join(' ');
  const style = named ? '' : ` style="--dp-mark-size:${size}"`;
  return `<span class="${cls}"${style}><svg viewBox="${mark.box}" ${a11y}>${mark.body}</svg></span>`;
}

/**
 * Put a mark into an existing element, replacing whatever is there. For a surface that already has
 * its DOM and only wants the art.
 * @returns {boolean} whether a mark was placed
 */
export function setDpMark(el, name, opts) {
  if (!el) return false;
  const html = dpMark(name, opts);
  if (!html) return false;
  el.innerHTML = html;
  return true;
}
