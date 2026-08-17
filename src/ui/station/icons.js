// src/ui/station/icons.js — Orbital Command icon set.
// Hand-drawn line glyphs on a 24x24 grid, stroke = currentColor, so every icon
// inherits tile/text color and stays visually consistent (no emoji, no mixed weights).
// Each entry is the INNER svg markup; wrap() adds the <svg> frame.
//
// J05 (CANONICAL_BUILD_MAP §11.12) folded three scattered icon vocabularies into this one file:
// the station set below, the fit-tree slot glyphs (were Unicode, incl. a ⛴ ferry boat standing in
// for a starship hull), and the 14 faction crests (were `<rect><text>S</text>`).
//
// This module is deliberately DEPENDENCY-FREE. It imports nothing — not `src/data/factions/`, not
// game state — so `_uilab.html` can import it directly and snapshot the *shipped* crests rather
// than a hand-copied duplicate that silently drifts. Faction keys below are literal strings that
// match the `id` in `src/data/factions/*.js`; `factionIcon()` tolerates the `faction_` prefix.

const P = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';

const RAW = {
  // --- destinations ---
  market: `<path ${P} d="M4 19V9M9 19V5M14 19v-7M19 19v-11"/><path ${P} d="M3 19h18" opacity="0.55"/>`,
  shipworks: `<path ${P} d="M12 3.2c3.1 2 4.7 5.2 4.7 9.1 0 2.6-.7 4.6-1.7 6.2H9c-1-1.6-1.7-3.6-1.7-6.2 0-3.9 1.6-7.1 4.7-9.1Z"/><path ${P} d="M7.4 12.4 3.7 14v3.1l3.9-1.2M16.6 12.4 20.3 14v3.1l-3.9-1.2"/><circle cx="12" cy="10" r="1.5" ${P}/>`,
  industry: `<path ${P} d="M4 20V11l5 3V11l5 3V6l6 4v10Z"/><path ${P} d="M8 20v-3M13 20v-3M18 20v-3" opacity="0.6"/>`,
  contracts: `<path ${P} d="M7 3h7l4 4v14H7Z"/><path ${P} d="M14 3v4h4" opacity="0.7"/><path ${P} d="M10 12h5M10 15.5h5" opacity="0.75"/>`,
  factions: `<path ${P} d="M12 3 5 6v5.5c0 4 2.9 7.4 7 8.5 4.1-1.1 7-4.5 7-8.5V6Z"/><path ${P} d="M12 8.2 13.3 11l3 .3-2.3 2 .7 3-2.7-1.6L9.3 16.3l.7-3-2.3-2 3-.3Z" opacity="0.85"/>`,
  bar: `<path ${P} d="M5 4h14l-6 7v6M13 17h4M9 17h-2"/><path ${P} d="M8 8h8" opacity="0.6"/>`,
  ledger: `<path ${P} d="M6 3.5h9l3 3V20.5H6Z"/><path ${P} d="M15 3.5V6.5h3" opacity="0.7"/><path ${P} d="M8.5 11h6M8.5 14h6M8.5 17h3.5" opacity="0.8"/>`,

  // --- dock actions ---
  repair: `<path ${P} d="M14.5 4.2a3.8 3.8 0 0 0-4.9 4.9l-5 5a1.7 1.7 0 0 0 2.4 2.4l5-5a3.8 3.8 0 0 0 4.9-4.9l-2.2 2.2-2.1-.6-.6-2.1Z"/>`,
  refuel: `<path ${P} d="M12 3.5c3 3.6 5 6.3 5 9.1a5 5 0 0 1-10 0c0-2.8 2-5.5 5-9.1Z"/><path ${P} d="M10 13.5a2.2 2.2 0 0 0 2.2 2.2" opacity="0.8"/>`,
  resupply: `<path ${P} d="M4 8.5 12 5l8 3.5-8 3.5Z"/><path ${P} d="M4 8.5v7L12 19l8-3.5v-7M12 12v7" opacity="0.85"/>`,
  undock: `<path ${P} d="M12 4.5 6.5 10M12 4.5 17.5 10M12 4.5V15"/><path ${P} d="M6 19h12" opacity="0.7"/>`,

  // --- misc / status ---
  credits: `<circle cx="12" cy="12" r="8" ${P}/><path ${P} d="M14.5 9.5a3 3 0 1 0 0 5" opacity="0.9"/>`,
  hull: `<path ${P} d="M12 3.5 19 6.5v5c0 4-3 7.3-7 8.5-4-1.2-7-4.5-7-8.5v-5Z"/>`,
  fuel: `<path ${P} d="M12 4c2.4 2.9 4 5 4 7.2a4 4 0 0 1-8 0C8 9 9.6 6.9 12 4Z"/>`,
  cargo: `<path ${P} d="M4 8.5 12 5l8 3.5-8 3.5Z"/><path ${P} d="M4 8.5v7L12 19l8-3.5v-7" opacity="0.85"/>`,
  info: `<circle cx="12" cy="12" r="8.2" ${P}/><path ${P} d="M12 11v5M12 8.2v.2" opacity="0.95"/>`,
  chevron: `<path ${P} d="m9 6 6 6-6 6"/>`,
  // Dismiss. The set previously had no close glyph, so panels reached for `undock` — a launch
  // arrow — and every chooser shipped with an up-arrow where its close button should be.
  close: `<path ${P} d="M7 7l10 10M17 7 7 17"/>`,
  spark: `<path ${P} d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M18 6l-2.5 2.5M6 18l2.5-2.5M18 18l-2.5-2.5" opacity="0.9"/>`,
  target: `<circle cx="12" cy="12" r="7.5" ${P}/><circle cx="12" cy="12" r="2.4" ${P}/><path ${P} d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>`,
  route: `<circle cx="5.5" cy="17.5" r="2.1" ${P}/><circle cx="18.5" cy="6.5" r="2.1" ${P}/><path ${P} stroke-dasharray="2 2.6" d="M7 16 17 8"/>`,
  clock: `<circle cx="12" cy="12" r="8" ${P}/><path ${P} d="M12 7.5V12l3 2"/>`,

  // --- status semantics (paired with SEMANTIC_PALETTE in ../accessibility.js) -------------------
  // These are the DOM/innerHTML channel. The palette also keeps a plain-text `icon` glyph for
  // textContent call sites — see the two-channel note in accessibility.js before swapping either.
  shield: `<path ${P} d="M12 3.6 19 6.4v5.2c0 4.2-3 7.6-7 8.8-4-1.2-7-4.6-7-8.8V6.4Z"/><path ${P} d="M8.5 10c2-1.6 5-1.6 7 0" opacity="0.75"/>`,
  energy: `<path ${P} d="M13.2 3.2 6.6 12.6h4.8l-1 8.2 7-9.4h-4.8Z"/>`,
  heat: `<path ${P} d="M12 3.4c1.8 2.6 4.8 5 4.8 8.8 0 3.6-2.2 6.2-4.8 7.4-2.6-1.2-4.8-3.8-4.8-7.4 0-2.4 1.2-4.4 2.6-5.8"/><path ${P} d="M12 12.4c1.2 1.2 1.8 2.4 1.8 3.8 0 1.8-1 2.8-1.8 3.4-.8-.6-1.8-1.6-1.8-3.4 0-1.2.6-2.4 1.8-3.8" opacity="0.8"/>`,
  danger: `<circle cx="12" cy="12" r="8.4" ${P}/><path ${P} d="M6.1 6.1 17.9 17.9"/>`,
  warning: `<path ${P} d="M12 4.2 19.8 19.2H4.2Z"/><path ${P} d="M12 9.4v4.4M12 16.8v.2"/>`,
  boost: `<path ${P} d="M6.4 6.2 12 12l-5.6 5.8M12.8 6.2 18.4 12l-5.6 5.8"/>`,

  // --- fit-tree slot types (were Unicode ◆ ▣ ⬡ ▦ ✦ ◎ and a ⛴ ferry boat for the hull) ----------
  slot_hull: `<path ${P} d="M12 3.4c2.8 2.4 5 6.2 5 11 0 2.4-.8 4.4-2.4 5.8H9.4c-1.6-1.4-2.4-3.4-2.4-5.8 0-4.8 2.2-8.6 5-11Z"/><path ${P} d="M8.2 11.6h7.6M9.2 15.8h5.6" opacity="0.75"/>`,
  slot_weapon: `<path ${P} d="M4 7.5v9M7 9h5.5v6H7ZM12.5 10.5h7v3h-7M19.5 8.5v7"/><path ${P} d="M4 12h3" opacity="0.75"/>`,
  slot_shield: `<path ${P} d="M6.5 19.5h11l-1.8-5h-7.4Z"/><path ${P} d="M4 12.5C4 7 7.6 4 12 4s8 3 8 8.5"/><path ${P} d="M7.5 12.5C7.5 8.8 9.5 7.2 12 7.2s4.5 1.6 4.5 5.3" opacity="0.75"/>`,
  slot_engine: `<path ${P} d="M8.2 4.2h7.6l2 9.2H6.2Z"/><path ${P} d="M9 13.4l-2.2 6.8h10.4L15 13.4M12 13.4v6.8" opacity="0.8"/>`,
  slot_cargo: `<path ${P} d="M4.4 8.2 12 4.4l7.6 3.8-7.6 3.8Z"/><path ${P} d="M4.4 8.2v7.6l7.6 3.8 7.6-3.8V8.2M12 12v7.6" opacity="0.85"/>`,
  slot_mining: `<path ${P} d="M5 18.5 12.5 8M6 6.5c4-2 9-.5 12.5 3.5"/><path ${P} d="M14 16.5 16.5 13.5l3.5 1 1 3.5-3.5 2.5Z"/>`,
  slot_utility: `<rect x="7.2" y="7.2" width="9.6" height="9.6" rx="1.6" ${P}/><path ${P} d="M9.6 3.6v3.6M14.4 3.6v3.6M9.6 16.8v3.6M14.4 16.8v3.6M3.6 9.6h3.6M3.6 14.4h3.6M16.8 9.6h3.6M16.8 14.4h3.6"/><path ${P} d="M10.2 10.2h3.6v3.6h-3.6Z" opacity="0.8"/>`,
};

// -------------------------------------------------------------------------------------------------
// FACTION HERALDRY — 14 crests, one per entry in `src/data/factions/`.
//
// Replaces `serviceIconSvg()`'s `<rect><text>S</text>` letter-in-a-box. Each is a naval-insignia
// silhouette read at a glance, drawn on the same 24×24 stroke grid as everything above.
//
// LEGIBILITY RULE: these ship at ~18–24px in roster rows and chart pins, not at the 56px the lab
// board shows. Every crest below therefore holds a single dominant silhouette and at most two
// interior strokes — detail that survives 4× preview but dissolves at 1× is a defect here, not a
// refinement. `_uilab.html` renders a shipping-size row beside the large one to keep that honest.
// -------------------------------------------------------------------------------------------------
const FACTION_RAW = {
  // Solar Concord Navy — a five-point concord star riding above a doubled rank chevron.
  scn: `<path ${P} d="M12 3.4 13.6 7 17.2 8.6 13.6 10.2 12 13.8 10.4 10.2 6.8 8.6 10.4 7Z"/><path ${P} d="M4.6 19.6 12 13.6l7.4 6"/><path ${P} d="M7.6 19.6 12 16.2l4.4 3.4" opacity="0.75"/>`,
  // Meridian Trade Syndicate — eight-tooth industrial cog, bored through by the trade meridian.
  mts: `<path ${P} d="M10.7 3.7h2.6l.2 2.3 1.7.7 1.7-1.5 1.9 1.9-1.5 1.7.7 1.7 2.3.2v2.6l-2.3.2-.7 1.7 1.5 1.7-1.9 1.9-1.7-1.5-1.7.7-.2 2.3h-2.6l-.2-2.3-1.7-.7-1.7 1.5-1.9-1.9 1.5-1.7-.7-1.7-2.3-.2v-2.6l2.3-.2.7-1.7-1.5-1.7 1.9-1.9 1.7 1.5 1.7-.7Z"/><circle cx="12" cy="12" r="2.8" ${P}/><path ${P} d="M12 3.6v16.8"/>`,
  // Drift Miners Collective — a cut crystal prism, faulted along one vertical and one horizontal seam.
  dmc: `<path ${P} d="M7.4 4.6h9.2l4.2 6-8.8 10-8.8-10Z"/><path ${P} d="M3.2 10.6h17.6M12 4.6v16" opacity="0.8"/>`,
  // Crimson Reach — salvage cross under a recovery arc.
  reach: `<path ${P} d="M4.4 15.6C4.4 7.6 19.6 7.6 19.6 15.6"/><path ${P} d="M12 7.4v13.2M7.2 13.8h9.6"/>`,
  // The Quiet — concentric resonance rings, deliberately silent at the core.
  quiet: `<circle cx="12" cy="12" r="2.4" ${P}/><path ${P} d="M12 6.4a5.6 5.6 0 0 1 5.6 5.6M12 17.6a5.6 5.6 0 0 1-5.6-5.6"/><path ${P} d="M12 3.6a8.4 8.4 0 0 1 8.4 8.4M12 20.4a8.4 8.4 0 0 1-8.4-8.4" opacity="0.75"/>`,
  // The Vael — a faceted stealth dart; the interior creases are radar-deflecting facets, not detail.
  vael: `<path ${P} d="M12 3.4 20.6 15 16.4 20.4 12 17.2 7.6 20.4 3.4 15Z"/><path ${P} d="M12 3.4v13.8M3.4 15 12 10.4 20.6 15" opacity="0.75"/>`,
  // Free Frontier — a ring broken open, and the line that broke it.
  free: `<path ${P} d="M15.4 4.6A8.2 8.2 0 1 0 19.8 13.8"/><path ${P} d="M5.8 18.2 18.8 5.2"/>`,
  // Ascendant Choir — a radiant burst fanning from one held note.
  choir: `<circle cx="12" cy="18.2" r="2.2" ${P}/><path ${P} d="M12 14.6V3.4M11.2 15.4 6.8 5.2M12.8 15.4 17.2 5.2M10.2 16.8 3.6 10.4M13.8 16.8 20.4 10.4"/>`,
  // Helix Directorate — two crossing strands, three rungs; kept sparse so it survives 20px.
  helix: `<path ${P} d="M7 3.6C7 7.5 17 8 17 12s-10 4.5-10 8.4M17 3.6C17 7.5 7 8 7 12s10 4.5 10 8.4"/><path ${P} d="M8.2 6h7.6M7 12h10M8.2 18h7.6" opacity="0.8"/>`,
  // The Understory — root system reaching up out of the dark.
  understory: `<path ${P} d="M12 3.6v9M12 12.6c-3.6 2.4-6.4 5-7.4 8.2M12 12.6c3.6 2.4 6.4 5 7.4 8.2"/><path ${P} d="M12 7.8c-2.4 1.8-4.8 3.8-6.2 6.8M12 7.8c2.4 1.8 4.8 3.8 6.2 6.8" opacity="0.8"/>`,
  // The Fulfillment — a sealed hexagonal shipment, check struck through it: delivery honoured.
  fulfillment: `<path ${P} d="M12 3.6 19.6 7.8v8.4L12 20.4 4.4 16.2V7.8Z"/><path ${P} d="M8.2 12.2 11 14.8l5.2-5.4"/>`,
  // The Archive — a closed record, three sealed lines.
  archive: `<path ${P} d="M5.4 4.4h13.2v15.2H5.4Z"/><path ${P} d="M8.6 4.4v15.2M11.6 8.6h4.4M11.6 12h4.4M11.6 15.4h2.8" opacity="0.8"/>`,
  // The Pitborn — jagged forge-flame off a broken rim.
  pitborn: `<path ${P} d="M4.8 19.6 8 5.6l3.6 6.8 3.6-9 4 7.6-2 8.6Z"/><path ${P} d="M8.8 19.6 12 12.8l2.6 3.2 1.8-2-.8 5.6" opacity="0.75"/>`,
  // The Verge-Layers — stacked strata, each thinner than the one below.
  verge_layers: `<path ${P} d="M3.8 18.8c2.8-4.6 5.4-6.8 8.2-6.8s5.4 2.2 8.2 6.8"/><path ${P} d="M5.6 14.2c2.2-3.6 4.2-5.4 6.4-5.4s4.2 1.8 6.4 5.4" opacity="0.85"/><path ${P} d="M7.6 9.8c1.5-2.6 2.9-3.8 4.4-3.8s2.9 1.2 4.4 3.8" opacity="0.7"/>`,
};

/** Return an <svg> string for the named icon. size in px. */
export function icon(name, size = 24) {
  const inner = RAW[name] || RAW.info;
  return `<svg class="sx-ico" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">${inner}</svg>`;
}

export const ICON_NAMES = Object.keys(RAW);

/** True when `name` resolves to a real glyph rather than falling back to `info`. */
export function hasIcon(name) {
  return Object.prototype.hasOwnProperty.call(RAW, String(name || ''));
}

/**
 * Normalise a faction key. Accepts either the raw data id (`faction_scn`) or the bare crest key
 * (`scn`), so call sites can pass `faction.id` straight through without stripping the prefix.
 */
export function factionIconKey(id) {
  const raw = String(id == null ? '' : id).trim().toLowerCase();
  if (!raw) return '';
  const bare = raw.startsWith('faction_') ? raw.slice(8) : raw;
  return Object.prototype.hasOwnProperty.call(FACTION_RAW, bare) ? bare : '';
}

/**
 * Return an <svg> crest for a faction, or `''` when the id is unknown.
 *
 * Returning empty (rather than a letter-in-a-box, which is what this replaced) is deliberate: a
 * missing crest should read as absent, not as a half-designed placeholder that ships forever.
 * Callers decide the fallback; `galaxyMap.serviceIconSvg` uses a neutral unknown-mark.
 */
export function factionIcon(id, size = 24) {
  const key = factionIconKey(id);
  if (!key) return '';
  return `<svg class="sx-ico sx-ico--crest" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false" data-faction="${key}">${FACTION_RAW[key]}</svg>`;
}

export const FACTION_ICON_KEYS = Object.keys(FACTION_RAW);
