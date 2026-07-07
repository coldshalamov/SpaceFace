// stationGlyphs.js — BP-11 packet A4 "Station-Type Silhouette Readout" (SURFACE — see
// design/revamp/detail/A_sector_station.md packet A4).
//
// A shape on the horizon should read as a refinery / customs blockhouse / smuggler cache WITHOUT
// a scan. This module is the GLYPH/LABEL half of that read: a pure, total, 1:1 map from every
// `STATION_TYPES` id (src/data/sectors.js) to a distinct map/HUD glyph + a one-word type label.
// Doctrine filter: the player can SEE what a station is at a glance on the map layer.
//
// Scope contract (packet failureModes):
//   * Pure data, no DOM, no imports, headless-testable. NOT a mesh source — the 3D silhouette
//     read is BLOCKED on BP-08 §2 P0 (the 8 authored station GLBs, graphics lane). DO NOT author
//     GLBs here; this table ships independently and degrades gracefully while GLBs are procedural.
//   * Scoped to the 7 station types ONLY — derelicts/gates/POIs do not claim glyphs from this
//     table (map-glyph budget).
//   * Consumers: the map/HUD glyph layer (maps lane wires it; localmap/starmap are maps-lane-owned
//     per AGENTS.md §10 — this packet ships the data + check, not map-file edits).
//
// Acceptance (scripts/check-station-glyphs.mjs): total over STATION_TYPES, distinct glyphs,
// distinct labels, 1:1, no extra keys.

/** stationTypeId → { glyph, label }. Total over sectors.js STATION_TYPES; glyphs + labels 1:1. */
export const STATION_GLYPHS = {
  trade_hub:   { glyph: '⬢', label: 'Market' },
  refinery:    { glyph: '⚒', label: 'Refinery' },
  mining:      { glyph: '⛏', label: 'Mine' },
  fab:         { glyph: '⚙', label: 'Foundry' },
  military:    { glyph: '⛨', label: 'Military' },
  blackmarket: { glyph: '◬', label: 'Cache' },
  research:    { glyph: '✧', label: 'Research' },
};

/** Fallback for an unknown/modded station type — a generic readout, never a throw. */
export const UNKNOWN_STATION_GLYPH = { glyph: '▪', label: 'Station' };

/** glyphForStationType(id) → { glyph, label } (always returns a usable readout). */
export function glyphForStationType(stationTypeId) {
  return STATION_GLYPHS[stationTypeId] || UNKNOWN_STATION_GLYPH;
}

export default STATION_GLYPHS;
