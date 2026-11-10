// Deckplate icons — the kit's 86-glyph FILLED family (assets/ui/kit/icons/), one call for every
// surface. Inline SVG on purpose: forced colours keeps inline SVG and currentColor, and drops CSS
// background images, so an icon drawn this way survives high contrast.
//
// Each glyph is two layers: the body in currentColor and an `.accent` path the consumer tints
// (`.dp-icon .accent { fill: var(--dp-lamp) }` by default — a lit core in a bone silhouette).
// Sizes up to 32 px use the 24 px drawing; larger ones use the 48 px drawing, which is optically
// redrawn rather than scaled.

import { DP_ICON_24, DP_ICON_48 } from './iconPaths.js';

/** Every glyph name, without the `icon-` prefix. */
export const DP_ICON_NAMES = Object.freeze(Object.keys(DP_ICON_24).map((k) => k.slice(5)).sort());

export function hasDpIcon(name) {
  return Object.prototype.hasOwnProperty.call(DP_ICON_24, `icon-${name}`);
}

/**
 * Markup for one icon at `size` CSS px. Decorative by default (aria-hidden); pass `label` to make
 * it an image with an accessible name. An unknown name renders nothing — a wrong icon is worse
 * than none.
 */
export function dpIcon(name, size = 24, { label = '', className = '' } = {}) {
  const key = `icon-${name}`;
  const big = size > 32;
  const body = (big ? DP_ICON_48 : DP_ICON_24)[key];
  if (!body) return '';
  const box = big ? 48 : 24;
  const a11y = label
    ? `role="img" aria-label="${String(label).replace(/"/g, '&quot;')}"`
    : 'aria-hidden="true" focusable="false"';
  const cls = className ? `dp-icon ${className}` : 'dp-icon';
  return `<svg class="${cls}" viewBox="0 0 ${box} ${box}" width="${size}" height="${size}" ${a11y}>${body}</svg>`;
}
