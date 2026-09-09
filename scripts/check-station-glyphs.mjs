// BP-11 packet A4 acceptance check: Station-Type Silhouette Readout (glyph/label map).
//
// Contract (src/data/stationGlyphs.js — see design/revamp/detail/A_sector_station.md packet A4):
//   - STATION_GLYPHS is TOTAL over sectors.js STATION_TYPES (every id has an entry) with NO extra
//     keys (derelicts/gates/POIs must not claim glyphs from this table — map-glyph budget).
//   - Every entry has a non-empty glyph and a non-empty ONE-WORD label.
//   - Glyphs are pairwise distinct and labels are pairwise distinct (the 1:1 read: one shape =
//     one meaning; two types sharing a glyph would be an unreadable map).
//   - glyphForStationType degrades to a usable fallback for unknown ids (never throws/null).
//
// NOTE: the 3D silhouette read is BLOCKED on BP-08 §2 P0 authored station GLBs (graphics lane).
// This check pins the map/HUD glyph half, which ships independently.
import assert from 'node:assert/strict';

import { STATION_TYPES } from '../src/data/sectors.js';
import { STATION_GLYPHS, UNKNOWN_STATION_GLYPH, glyphForStationType } from '../src/data/stationGlyphs.js';

assert.ok(Array.isArray(STATION_TYPES) && STATION_TYPES.length >= 7,
  `sectors.js STATION_TYPES must be the shipped 7-type list; got ${JSON.stringify(STATION_TYPES)}`);

// ── totality + no extras (exact key set) ────────────────────────────────────────────────────────
const tableKeys = Object.keys(STATION_GLYPHS).sort();
const typeIds = [...STATION_TYPES].sort();
assert.deepEqual(tableKeys, typeIds,
  `STATION_GLYPHS keys must be EXACTLY the STATION_TYPES ids.\n  table: ${tableKeys}\n  types: ${typeIds}`);

// ── every entry well-formed: glyph + one-word label ─────────────────────────────────────────────
for (const id of STATION_TYPES) {
  const e = STATION_GLYPHS[id];
  assert.ok(e && typeof e === 'object', `${id}: missing entry`);
  assert.ok(typeof e.glyph === 'string' && e.glyph.trim().length > 0, `${id}: empty glyph`);
  assert.ok(typeof e.label === 'string' && e.label.trim().length > 0, `${id}: empty label`);
  assert.ok(!/\s/.test(e.label.trim()), `${id}: label must be ONE word; got "${e.label}"`);
}

// ── 1:1 — glyphs distinct AND labels distinct across all 7 types ────────────────────────────────
const glyphs = STATION_TYPES.map((id) => STATION_GLYPHS[id].glyph);
const labels = STATION_TYPES.map((id) => STATION_GLYPHS[id].label.toLowerCase());
assert.equal(new Set(glyphs).size, STATION_TYPES.length,
  `glyphs must be pairwise distinct; got ${JSON.stringify(glyphs)}`);
assert.equal(new Set(labels).size, STATION_TYPES.length,
  `labels must be pairwise distinct; got ${JSON.stringify(labels)}`);

// The fallback must also not collide with a real type's glyph (an unknown type must not read as
// a known one).
assert.ok(!glyphs.includes(UNKNOWN_STATION_GLYPH.glyph),
  'UNKNOWN_STATION_GLYPH.glyph must not collide with a typed glyph');

// ── helper: known ids resolve to the table; unknown ids degrade, never throw ────────────────────
for (const id of STATION_TYPES) {
  assert.equal(glyphForStationType(id), STATION_GLYPHS[id], `glyphForStationType(${id}) must return the table entry`);
}
assert.equal(glyphForStationType('station_type_that_does_not_exist'), UNKNOWN_STATION_GLYPH,
  'unknown type must degrade to the fallback readout');
assert.equal(glyphForStationType(undefined), UNKNOWN_STATION_GLYPH, 'undefined must degrade to the fallback readout');

console.log(`Station glyph checks OK (${STATION_TYPES.length} station types, total + distinct + 1:1)`);
