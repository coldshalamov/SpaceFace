// Authored ship paint catalog — the Shipworks paint rack (src/ui/station/screens/shipworks.js).
//
// The appearance model in src/core/shipAppearance.js (hull/accent hex, finish, wear) is the live
// owner: ships.setShipAppearance writes it, the save pipeline persists it, and the render pipeline
// (visualFactory palette + partsLibrary appearance signature) paints hulls from it. This catalog is
// the authored swatch stock the yard carries; pure data, no runtime side effects.
//
// hex: null means "back to the factory coat" — the hull's own palette colors (no override).
// Decals ARE stocked below: decalId has a renderer consumer since hull stencils shipped
// (src/render/illustratedStencils.js) — the picture answers.

export const SHIP_HULL_PAINTS = Object.freeze([
  { id: 'bare', name: 'Bare hull', hex: null, sentence: 'The factory coat the hull was delivered in.' },
  { id: 'graphite', name: 'Graphite', hex: '#33383f', sentence: 'Field primer. Hides the rock dust, not the dents.' },
  { id: 'concord_white', name: 'Concord white', hex: '#d6dae0', sentence: 'Patrol-standard white. Reads official at any dock.' },
  { id: 'signal_orange', name: 'Signal orange', hex: '#e06428', sentence: 'Salvage-crew orange. Everyone sees you coming.' },
  { id: 'hazard_yellow', name: 'Hazard yellow', hex: '#d8a018', sentence: 'Industrial yellow — the color machinery is required to wear.' },
  { id: 'oxblood', name: 'Oxblood', hex: '#6a2430', sentence: 'Old-hauler red, cured dark in engine heat.' },
  { id: 'harbor_blue', name: 'Harbor blue', hex: '#2c4a6e', sentence: 'Berth-side blue. The station crews paint their tugs this.' },
  { id: 'belt_green', name: 'Belt green', hex: '#2e5a40', sentence: 'Ceres quartz-green, matched to the seam glare.' },
  { id: 'reactor_teal', name: 'Reactor teal', hex: '#1e6e68', sentence: 'Coolant teal. Vesta fabricators run it year-round.' },
  { id: 'deep_plum', name: 'Deep plum', hex: '#5a3a78', sentence: 'Charon night-freight livery. For hulls that move at odd hours.' },
  { id: 'dune_sand', name: 'Dune sand', hex: '#a89060', sentence: 'Ashfall dust baked into a permanent coat.' },
]);

export const SHIP_ACCENT_PAINTS = Object.freeze([
  { id: 'factory', name: 'Factory trim', hex: null, sentence: 'The accent the hull was built with.' },
  { id: 'trim_white', name: 'White trim', hex: '#e8eaec', sentence: 'Registry-white spines and rails.' },
  { id: 'trim_ink', name: 'Ink trim', hex: '#1a1c20', sentence: 'Black-out trim. Hard corners read harder.' },
  { id: 'trim_red', name: 'Signal red', hex: '#d83028', sentence: 'One hot stripe the whole lane recognizes.' },
  { id: 'trim_amber', name: 'Amber trim', hex: '#f0a028', sentence: 'Caution amber, the yard crews’ favorite.' },
  { id: 'trim_cyan', name: 'Cyan trim', hex: '#3ec8d8', sentence: 'Instrument cyan, like a fresh sensor sweep.' },
  { id: 'trim_lime', name: 'Lime trim', hex: '#98c838', sentence: 'Quarry-marking lime for hulls that work the rock.' },
  { id: 'trim_ice', name: 'Ice trim', hex: '#a8d8f0', sentence: 'Eunomia ice-blue, cold under running lights.' },
]);

export const SHIP_FINISH_STOCK = Object.freeze([
  { id: 'worn', name: 'Worn', sentence: 'Matte where rock dust has sanded it. The yard leaves the scars showing.' },
  { id: 'satin', name: 'Satin', sentence: 'The standard yard cure — an even sheen and honest reflections.' },
  { id: 'polished', name: 'Polished', sentence: 'Show-floor gloss. Every dent on the hull now reads twice.' },
]);

export const SHIP_WEAR_STOCK = Object.freeze([
  { id: 'fresh', wear: 0.05, name: 'Factory fresh', sentence: 'Straight from the yard crane. Nothing has touched it yet.' },
  { id: 'working', wear: 0.25, name: 'Working hull', sentence: 'Dock rash and line scuffs. A hull with a job.' },
  { id: 'weathered', wear: 0.5, name: 'Weathered', sentence: 'Seasons of belt work baked into the coat.' },
  { id: 'veteran', wear: 0.75, name: 'Veteran', sentence: 'Every mark a story. The yard only dusts it off.' },
]);

// Hull markings — the stencil deck (src/render/illustratedStencils.js draws them in code). The ids
// are the persisted SHIP_DECALS vocabulary; 'bare' is the absence the other rows paint over.
export const SHIP_DECAL_STOCK = Object.freeze([
  { id: 'bare', decalId: 'none', name: 'Bare deck', sentence: 'No marks. Just the coat and the dents.' },
  { id: 'borrowed_time', decalId: 'borrowed_time', name: 'Borrowed time', sentence: 'A spray tag, a ghost, thirteen tallies. The old crowd still says hello.' },
  { id: 'concord', decalId: 'concord', name: 'Patrol registry', sentence: 'Crisp serials and the inspection roundel. Reads official at any dock.' },
  { id: 'industrial', decalId: 'industrial', name: 'Yard hazard', sentence: 'Lift points, hazard glyphs, the yard serial in safety yellow.' },
  { id: 'frontier', decalId: 'frontier', name: 'Frontier brand', sentence: 'A hand-painted star and route tallies, faded honest by the sun.' },
]);

/** The next appearance object the rack emits for one swatch selection: patch exactly one field of
 * the current appearance and let ships.js normalize the whole record (version, wear clamp,
 * decal default). `current` may be null — the hull's default appearance is the baseline. */
export function buildPaintAppearance(current, patch) {
  const base = current && typeof current === 'object' ? current : {};
  const next = {
    hullColor: base.hullColor != null ? base.hullColor : null,
    accentColor: base.accentColor != null ? base.accentColor : null,
    finish: base.finish != null ? base.finish : 'satin',
    wear: Number.isFinite(Number(base.wear)) ? Number(base.wear) : 0.25,
    decalId: base.decalId != null ? base.decalId : null,
  };
  if (!patch || typeof patch !== 'object') return next;
  if (patch.hullColor !== undefined) next.hullColor = patch.hullColor;
  if (patch.accentColor !== undefined) next.accentColor = patch.accentColor;
  if (patch.finish !== undefined) next.finish = patch.finish;
  if (patch.wear !== undefined) next.wear = Number(patch.wear);
  if (patch.decalId !== undefined) next.decalId = patch.decalId;
  return next;
}

/** Find a catalog row by id in one of the racks; null when the id is not stocked. */
export function shipPaintRow(list, id) {
  if (!Array.isArray(list)) return null;
  return list.find((row) => row && row.id === id) || null;
}
