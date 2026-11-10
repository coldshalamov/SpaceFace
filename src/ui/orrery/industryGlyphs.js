// src/ui/orrery/industryGlyphs.js — the Industry chain's pictograms (design/frontend/ORRERY.md §6 Industry).
//
// The things on the production chain are objects, not line icons: each is a filled two- or three-tone solid on
// the 24 grid (a lit face, a mid face, a shade face; a dark seam where an object has a hole), so a node reads as
// the material sitting in it. One per material family; the chain draws them at 18-22 px. Classes, not colours:
// the instrument's sheet lights them (`.is-lit`, `.is-mid`, `.is-shade`, `.is-hole`).

export const INDUSTRY_PICTOGRAMS = Object.freeze({
  // a fractured rock: a shaded body, a mid face, a lit top facet
  ore: '<path class="is-shade" d="M3.5 14.5 6 7.5 12 4l6.5 3 2 7.5-4.5 5.5-8 .5Z"/><path class="is-mid" d="m6 7.5 7.5 4-1.5 8.5-8.5-5.5Z"/><path class="is-lit" d="M6 7.5 12 4l6.5 3-5 4.5Z"/>',
  // an ingot: its lit top, its front, its shaded end
  refined: '<path class="is-mid" d="M3 11h12.5v6.5H3Z"/><path class="is-shade" d="M15.5 11 21 7v6.5l-5.5 4Z"/><path class="is-lit" d="M3 11 8.5 7H21l-5.5 4Z"/>',
  // a gas bottle: the body in shade, a lit highlight down its side, the valve
  gas: '<rect class="is-shade" x="6.5" y="7" width="11" height="14" rx="3"/><rect class="is-lit" x="8.3" y="8.8" width="3.2" height="10.4" rx="1.6"/><path class="is-mid" d="M9.5 3.5h5V7h-5Z"/>',
  // a crystal: a lit left face, a shaded right face, a mid crown
  crystal: '<path class="is-shade" d="m12 3 5 5.5-2 12H9L7 8.5Z"/><path class="is-lit" d="M12 3 7 8.5l2 12h3Z"/><path class="is-mid" d="M7 8.5h10L12 3Z"/>',
  // a chip: the package in shade, the lit die, the pins
  tech: '<path class="is-mid" d="M8.5 3.5h2v3h-2ZM13.5 3.5h2v3h-2ZM8.5 17.5h2v3h-2ZM13.5 17.5h2v3h-2ZM3.5 8.5h3v2h-3ZM3.5 13.5h3v2h-3ZM17.5 8.5h3v2h-3ZM17.5 13.5h3v2h-3Z"/><rect class="is-shade" x="6.5" y="6.5" width="11" height="11"/><rect class="is-lit" x="9.3" y="9.3" width="5.4" height="5.4"/>',
  // a hex nut: its lit top face with the bore, its shaded flanks
  component: '<path class="is-shade" d="m12 3.5 7.5 4.25v8.5L12 20.5l-7.5-4.25v-8.5Z"/><path class="is-mid" d="M19.5 7.75v8.5L12 20.5V12Z"/><path class="is-lit" d="m12 3.5 7.5 4.25L12 12 4.5 7.75Z"/><ellipse class="is-hole" cx="12" cy="7.8" rx="2.5" ry="1.4"/>',
  // a round: the case in shade, a lit flank, the band
  military: '<path class="is-shade" d="M9 20.5v-10l3-6.5 3 6.5v10Z"/><path class="is-lit" d="M9 20.5v-10l3-6.5v16.5Z"/><path class="is-mid" d="M9 15.5h6v2H9Z"/>',
  // a module: a cube with a lit top, a mid face and a shaded face
  module: '<path class="is-mid" d="m4 8 8 4.5V21l-8-4.5Z"/><path class="is-shade" d="M20 8v8.5L12 21v-8.5Z"/><path class="is-lit" d="M12 3.5 20 8l-8 4.5L4 8Z"/>',
  // a weapon: a lit barrel over a shaded grip
  weapon: '<path class="is-shade" d="M6 13h7v6.5H9.5L8 17H6Z"/><path class="is-lit" d="M3 9.5h14l4 2-4 2H3Z"/><path class="is-mid" d="M3 13.5h14v1.5H3Z"/>',
  // a hull: a lit port flank, a shaded starboard flank, the drive
  ship: '<path class="is-shade" d="m12 3 7 17-7-3.5Z"/><path class="is-lit" d="M12 3 5 20l7-3.5Z"/><path class="is-mid" d="M9.5 18.2h5L12 21Z"/>',
});

const BY_CATEGORY = { 'raw ore': 'ore', refined: 'refined', gas: 'gas', crystal: 'crystal', exotic: 'crystal', tech: 'tech', component: 'component', military: 'military' };

/** The pictogram for a thing on the chain: a commodity by its category, a catalogue kind by its kind. */
export function industryPictogram(category, kind) {
  if (kind === 'module') return INDUSTRY_PICTOGRAMS.module;
  if (kind === 'weapon') return INDUSTRY_PICTOGRAMS.weapon;
  if (kind === 'ship') return INDUSTRY_PICTOGRAMS.ship;
  return INDUSTRY_PICTOGRAMS[BY_CATEGORY[category] || 'refined'];
}
