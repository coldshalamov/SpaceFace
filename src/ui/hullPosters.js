// Produced hull renders for the interface (design/frontend/ONE_PHOTOGRAPH.md §9, asset #1).
//
// A ship in a menu is a real object, so it is produced art at display size, never a CSS drawing
// and never an empty frame waiting on WebGL. Each starter hull has two Cycles renders of the same
// GLB the game flies (assets/ships/parts/wholeships/*.glb, collision shell hidden):
//   hero: three-quarter from the nose, port side, slightly above; transparent film; 2400 x 1350.
//   side: orthographic starboard elevation, nose to the right; transparent film; 2400 x 1100.
//   top:  orthographic plan view, nose up; transparent film; 1024 x 1024.
//   holo: the plan view as instrument light (its own panel detail tinted phosphor, alpha from its
//         luminance, a crisp outline) for the flight cluster and the radar (ORRERY §5).
//   jig:  the plan view as a bone line drawing in the plan view's own frame (so its marks land on
//         it), for the refit jig (tools/art/jig_glyph.py, src/ui/orrery/hullSchematic.js).
// Provenance, framing and the projected hook positions live in
// assets/ui/renders/hulls/manifest.json. The live WebGL stage draws over the hero render once the
// authored hull has settled; until then (and wherever WebGL never arrives) the render is the stage.

const RENDER_ROOT = new URL('../../assets/ui/renders/hulls/', import.meta.url).href;

export const HULL_POSTERS = Object.freeze({
  ship_kestrel: Object.freeze({ hero: 'ship_kestrel.hero.webp', side: 'ship_kestrel.side.webp', top: 'ship_kestrel.top.webp', holo: 'ship_kestrel.holo.webp', jig: 'ship_kestrel.jig.webp' }),
  ship_pelican: Object.freeze({ hero: 'ship_pelican.hero.webp', side: 'ship_pelican.side.webp', top: 'ship_pelican.top.webp', holo: 'ship_pelican.holo.webp', jig: 'ship_pelican.jig.webp' }),
  ship_wasp: Object.freeze({ hero: 'ship_wasp.hero.webp', side: 'ship_wasp.side.webp', top: 'ship_wasp.top.webp', holo: 'ship_wasp.holo.webp', jig: 'ship_wasp.jig.webp' }),
  // the Crucible's own hull (three of its four starter builds fly it)
  ship_hornet: Object.freeze({ hero: 'ship_hornet.hero.webp', side: 'ship_hornet.side.webp', top: 'ship_hornet.top.webp', holo: 'ship_hornet.holo.webp', jig: 'ship_hornet.jig.webp' }),
});

/** URL of a hull's produced render, or null when that hull has none. */
export function hullPosterUrl(shipId, view = 'hero') {
  const entry = shipId && Object.prototype.hasOwnProperty.call(HULL_POSTERS, shipId) ? HULL_POSTERS[shipId] : null;
  return entry && entry[view] ? RENDER_ROOT + entry[view] : null;
}
