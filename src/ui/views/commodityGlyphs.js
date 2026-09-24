// Commodity pictograms (design/frontend/ONE_PHOTOGRAPH.md §9 asset #4).
//
// Every market row used to carry one of four stand-ins (ore, industry, warning, cargo), and the
// sixteen raw ores, the gases, the crystals and the exotic all shared the same wireframe cube, so a
// list of forty-seven goods read as forty-seven identical crates. One pictogram per catalogue
// category now, drawn on the same 24 grid, 1.35 stroke, square caps and miter joins as the rest of
// the interface's icons (src/ui/views/identity.js), in currentColor so a row's state can light it.
// Each is the object itself at a glance: a fractured rock, a gas bottle, a crystal, an ingot stack,
// a hex nut, a chip, a crate, a cut gem, a grain head, a medical cross, a torn plate, a sealed box
// struck through, a round of ammunition.

import { escapeMarkup } from './identity.js';

export const COMMODITY_GLYPHS = Object.freeze({
  'raw ore': '<path d="M4.5 15 7 8.5l6-3.5 6 4 1 6-6 4H8.5Z"/><path d="m7 8.5 5 3.5 7-3M12 12l2 7"/>',
  gas: '<rect x="7" y="7.5" width="10" height="12.5" rx="3"/><path d="M10 7.5V4.5h4v3M9.5 12.5h5"/>',
  crystal: '<path d="m12 3 5 5.5L15 20.5H9L7 8.5Z"/><path d="M7 8.5h10M12 3v17.5"/>',
  exotic: '<circle cx="12" cy="12" r="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.4" transform="rotate(-28 12 12)"/>',
  refined: '<path d="M3.5 18.5 5.5 14.5h5.5l2 4ZM11 18.5l2-4h5.5l2 4ZM7.5 14.5l2-4h5l2 4"/>',
  component: '<path d="m12 3.5 7.5 4.25v8.5L12 20.5l-7.5-4.25v-8.5Z"/><circle cx="12" cy="12" r="3"/>',
  tech: '<rect x="7" y="7" width="10" height="10"/><rect x="10" y="10" width="4" height="4"/><path d="M10 7V4M14 7V4M10 17v3M14 17v3M7 10H4M7 14H4M17 10h3M17 14h3"/>',
  consumer: '<rect x="4" y="9.5" width="16" height="10"/><path d="M4 13.5h16M9 9.5l3-4.5 3 4.5"/>',
  luxury: '<path d="M3 10 7 5h10l4 5-9 10Z"/><path d="M3 10h18M12 20 9 10l3-5 3 5Z"/>',
  food: '<path d="M12 20.5V8M12 11.5 8.5 8.5M12 11.5l3.5-3M12 15.5l-3.5-3M12 15.5l3.5-3M12 8 10 4.5M12 8l2-3.5"/>',
  med: '<rect x="4.5" y="4.5" width="15" height="15"/><path d="M12 8.25v7.5M8.25 12h7.5"/>',
  salvage: '<path d="m4 7.5 10-2.5-2 6 8 2-2 6.5-12-1Z"/><path d="m8 10.5 1 4"/>',
  contraband: '<rect x="5" y="7.5" width="14" height="11.5"/><path d="M5 11.5h14M4 20 20 4"/>',
  military: '<path d="M9 20.5v-10l3-6.5 3 6.5v10Z"/><path d="M9 16.5h6"/>',
});

/** The pictogram for a catalogue category, as an inline SVG string. Unknown categories get the crate. */
export function commodityGlyphHtml(category, className = 'of-commodity-icon') {
  const key = String(category || '').toLowerCase();
  const path = COMMODITY_GLYPHS[key] || COMMODITY_GLYPHS.consumer;
  return `<svg class="${escapeMarkup(className)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false" data-commodity-glyph="${escapeMarkup(key || 'consumer')}">${path}</svg>`;
}
