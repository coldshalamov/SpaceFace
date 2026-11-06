// src/ui/icons/missionGlyphs.js — the DUST mission-type glyph set and tag chip (DUST P5, BS-5).
//
// The contracts board's rows are authored prose ("A kiln-back cask, third owner…"), which is
// the game's voice and stays — but the board could only be scanned by READING. Every row now
// leads with a type chip: one small glyph in the house hand plus the type's own label
// (cargo delivery, bounty hunt…). The glyph is the wayfinding, the label is the meaning,
// and both ride inside the row's existing name cell so no layout moves.
//
// Same hand as commodityGlyphs.js: 24×24 grid, single 1.8 stroke, square caps, miter joins,
// currentColor only. These render at ~13px inside the chip, so each glyph is ONE dominant
// silhouette plus at most one accent — detail that dissolves at 1× is a defect here.

const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter"';

/** One glyph per mission type in src/data/missions.js MISSION_TYPES (22). */
export const MISSION_TYPE_GLYPHS = Object.freeze({
  // a crate handed right
  cargo_delivery: `<rect x="4.5" y="7.5" width="9.5" height="9.5" ${STROKE}/><path ${STROKE} d="M16 12h4.3M18.4 9.8 20.6 12l-2.2 2.2"/>`,
  // two crates, tall and short — the quota is plural
  bulk_trade: `<rect x="4.5" y="5" width="8" height="6" ${STROKE}/><rect x="4.5" y="13" width="8" height="6" ${STROKE}/><path ${STROKE} d="M16.8 6.5v11M14.9 8.4l1.9-1.9 1.9 1.9M14.9 15.6l1.9 1.9 1.9-1.9" opacity="0.85"/>`,
  // a target: ring, pip, four register ticks
  bounty_hunt: `<circle cx="12" cy="12" r="6.8" ${STROKE}/><circle cx="12" cy="12" r="1.4" ${STROKE}/><path ${STROKE} d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6" opacity="0.85"/>`,
  // a drill stroke into rock
  mining_quota: `<path ${STROKE} d="M4 17 6 11l5-2.2 4.5 2.4 1.5 5.8Z"/><path ${STROKE} d="M20.5 4 12 12.5M17.6 4h2.9v2.9" opacity="0.9"/>`,
  // a recovery hook over a plate
  salvage_retrieval: `<path ${STROKE} d="M15.5 3.5v7a3.5 3.5 0 0 1-7 0"/><path ${STROKE} d="M4.5 19.5h15M8.5 19.5 10 14h4l1.5 5.5" opacity="0.85"/>`,
  // a shadowing pair of chevrons — one hull following another
  escort: `<path ${STROKE} d="m6 8 5.5 4L6 16M12.5 8 18 12l-5.5 4"/>`,
  // a passenger under way: head, back, arrow
  passenger_transport: `<circle cx="8.5" cy="6.8" r="2.3" ${STROKE}/><path ${STROKE} d="M4 20c0-4.2 2-6.6 4.5-6.6S13 15.8 13 20"/><path ${STROKE} d="M15.5 12h5M18.3 9.6 20.6 12l-2.3 2.4" opacity="0.85"/>`,
  // a circuit with a register tick and a cleared core
  patrol_clear: `<circle cx="12" cy="12" r="7.5" ${STROKE}/><path ${STROKE} d="M12 4.5v4M8.2 18.4l2.6-3M15.8 5.6l-2.4 3" opacity="0.85"/><circle cx="12" cy="12" r="1.4" ${STROKE}/>`,
  // a radar: dish arc, sweep, blip
  recon_scan: `<path ${STROKE} d="M4.5 16.5A9 9 0 1 1 12 20.5"/><path ${STROKE} d="M12 20.5 7 9.5" opacity="0.85"/><circle cx="15.2" cy="8.8" r="1.5" ${STROKE}/>`,
  // a casualty cross with two hail arcs
  rescue_under_fire: `<path ${STROKE} d="M9.8 5h2.9v4.4H17v2.9h-4.3V17H9.8v-4.7H5.5V9.4h4.3Z"/><path ${STROKE} d="M15.5 4.5a8 8 0 0 1 4 4M17.5 8.5a4.6 4.6 0 0 1 2 2" opacity="0.7"/>`,
  // a pennant on its mast
  race: `<path ${STROKE} d="M6 20.5v-16"/><path ${STROKE} d="M6 5h11.5L14 8.5l3.5 3.5H6Z"/>`,
  // a demolition burst: six rays off a core
  demolition: `<path ${STROKE} d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.6 2.6M18 6l-2.6 2.6M6 18l2.6-2.6M18 18l-2.6-2.6"/><circle cx="12" cy="12" r="1.6" ${STROKE}/>`,
  // a crate run on a dashed, unlit route
  smuggling_run: `<rect x="5" y="6" width="14" height="9.5" ${STROKE}/><path ${STROKE} stroke-dasharray="2.6 2.8" d="M5 20h14" opacity="0.85"/>`,
  // a hook line down to a drifting hull
  tow_recovery: `<path ${STROKE} d="M12 3.5v8a3.6 3.6 0 0 0 7.2 0"/><path ${STROKE} d="M4 19.5h16l-2.8-4h-10.4Z" opacity="0.85"/>`,
  // a berth cradle holding one light — the quiet job
  quiet_berth: `<path ${STROKE} d="M4.5 14h15l-2.4 6H6.9Z"/><path ${STROKE} d="M12 10.5a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z" opacity="0.85"/>`,
  // a bolt through a case — the interception
  heist_intercept: `<rect x="5" y="5.5" width="14" height="13" ${STROKE}/><path ${STROKE} d="M13.5 7.5 9 13h4.5L9 18.5"/>`,
  // a balance beam, two pans, one post — the watched weight
  counterweight_watch: `<path ${STROKE} d="M12 4.5v14M8.5 19.5h7M4.5 8h15"/><path ${STROKE} d="M3.5 12a2.7 2.7 0 0 0 5.4 0M15.1 12a2.7 2.7 0 0 0 5.4 0" opacity="0.85"/>`,
  // two masses, tether cut, drift sparks
  breakaway_recovery: `<circle cx="5.4" cy="12" r="2.4" ${STROKE}/><circle cx="18.6" cy="12" r="2.4" ${STROKE}/><path ${STROKE} d="M8.8 12h2M13.2 12h2M12 8.8v-2M12 15.2v2" opacity="0.85"/>`,
  // one waybill torn into two leaves
  split_manifest: `<path ${STROKE} d="M4.5 5h5.8v14H4.5Z"/><path ${STROKE} d="M13.7 5h5.8v14h-5.8Z"/><path ${STROKE} d="M10.3 8.5 13.7 11M13.7 15 10.3 17.8" opacity="0.7"/>`,
  // a hull inside a return loop
  vessel_recovery: `<path ${STROKE} d="M19.4 12a7.4 7.4 0 1 1-2.2-5.2"/><path ${STROKE} d="M19.8 3.6 17.2 6.8l3.4 1Z" opacity="0.85"/><path ${STROKE} d="M9.5 14.5h5l1.5 3h-8Z"/>`,
  // a capital: long slab hull, high superstructure
  capital_boss: `<path ${STROKE} d="M4.5 17 19.5 13.2V17.5H4.5Z"/><path ${STROKE} d="M10 13V9h4v4M9 20h6" opacity="0.85"/>`,
  // a plaque star — the authored piece, pinned on the board
  authored_set_piece: `<path ${STROKE} d="m12 4.5 1.7 5.8 5.8 1.7-5.8 1.7L12 19.5l-1.7-5.8L4.5 12l5.8-1.7Z"/>`,
});

const DEFAULT_TYPE = 'cargo_delivery';

function typeKey(type) {
  const key = String(type || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(MISSION_TYPE_GLYPHS, key) ? key : DEFAULT_TYPE;
}

export function hasMissionTypeGlyph(type) {
  return Object.prototype.hasOwnProperty.call(MISSION_TYPE_GLYPHS, String(type || '').trim().toLowerCase());
}

/** The glyph for a mission type, as a decorative inline `<svg>` string. */
export function missionTypeGlyphSvg(type, { size = 13 } = {}) {
  const key = typeKey(type);
  return `<svg class="dust-mission-glyph" viewBox="0 0 24 24" width="${size}" height="${size}" ${STROKE} aria-hidden="true" focusable="false" data-mission-glyph="${key}">${MISSION_TYPE_GLYPHS[key]}</svg>`;
}

/**
 * The board row's type chip: glyph + the type's own label. The label text is REAL content
 * (it is the row's type, spoken by assistive tech); only the glyph is decorative.
 * `label` defaults to the caller's humanised type word so chips and prose never disagree.
 */
export function missionTypeChipHtml(type, { label = '', size = 13 } = {}) {
  const key = typeKey(type);
  const text = String(label || key).replace(/_/g, ' ');
  return `<span class="sx-ct-row__type k-t-fine" data-mission-type="${key}"`
    + ` style="display:inline-flex;align-items:center;gap:4px;margin-right:7px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.82;vertical-align:baseline;white-space:nowrap">`
    + `${missionTypeGlyphSvg(type, { size })}<span>${text}</span></span>`;
}

export const MISSION_GLYPH_TYPE_IDS = Object.freeze(Object.keys(MISSION_TYPE_GLYPHS));
