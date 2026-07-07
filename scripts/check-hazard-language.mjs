// BP-11 packet A7 acceptance check: Hazard Language & Counterplay (data + hint half).
//
// Contract (src/data/hazardLanguage.js — see design/revamp/detail/A_sector_station.md A7):
//   - HAZARD_LANGUAGE is TOTAL over sectors.js HAZARD_TYPES AND every `hazard:true` zone type in
//     sectorZones.js ZONE_TYPES (derived dynamically — a future hazard zone type without language
//     fails this check).
//   - Every entry: non-empty glyph + color + damages[] + hint, and a MANDATORY counterplay[] of
//     real player verbs (COUNTERPLAY_VERBS: avoid/shield/time/tether/route).
//   - One language per phenomenon: radiation_field shares radiation's glyph, nebula_fog shares
//     nebula's; zone colors come FROM ZONE_TYPES (one source of truth); the 4 sector-hazard
//     glyphs are pairwise distinct.
//   - hazardHints: first entry into a hazard TYPE per session → exactly ONE
//     voice.say({channel:'warn'}) counterplay hint, then silent for that type; independent per
//     type; non-hazard zones never hint; newGame() resets the tutorial-memory; the active
//     hazard's language mirrors onto state.ui.hazardRead and clears on exit.
//
// NOTE: the render half (src/render/hazardGlyphs.js — boundary edge glyph + map marker) is
// HANDED OFF to the graphics lane (release.__building/ active); its wiring contract is in the
// hazardLanguage.js header. This check pins the data + hint half, which ships independently.
import assert from 'node:assert/strict';

import { HAZARD_TYPES } from '../src/data/sectors.js';
import { ZONE_TYPES } from '../src/data/sectorZones.js';
import {
  HAZARD_LANGUAGE, COUNTERPLAY_VERBS, hazardLanguageFor, hazardHints,
} from '../src/data/hazardLanguage.js';

assertTableTotality();
assertEntriesWellFormed();
assertOneLanguagePerPhenomenon();
assertHintFiresOncePerTypePerSession();
assertHazardReadLifecycle();

console.log('Hazard language checks OK');

// ── totality (dynamic — derived from the shipped tables, not a hardcoded list) ──────────────────

function hazardZoneTypeIds() {
  return Object.keys(ZONE_TYPES).filter((id) => ZONE_TYPES[id] && ZONE_TYPES[id].hazard === true);
}

function assertTableTotality() {
  assert.ok(Array.isArray(HAZARD_TYPES) && HAZARD_TYPES.length >= 4, 'sectors.js HAZARD_TYPES must be shipped');
  const zoneHazards = hazardZoneTypeIds();
  assert.ok(zoneHazards.length >= 2, `expected hazard:true zone types in sectorZones.js; got ${zoneHazards}`);
  for (const id of HAZARD_TYPES) {
    assert.ok(HAZARD_LANGUAGE[id], `HAZARD_LANGUAGE must cover sector hazard type '${id}'`);
  }
  for (const id of zoneHazards) {
    assert.ok(HAZARD_LANGUAGE[id], `HAZARD_LANGUAGE must cover hazard zone type '${id}'`);
  }
  // No stray keys: language only for real hazard causes (map-glyph budget).
  const known = new Set([...HAZARD_TYPES, ...zoneHazards]);
  for (const key of Object.keys(HAZARD_LANGUAGE)) {
    assert.ok(known.has(key), `HAZARD_LANGUAGE has an entry for unknown hazard '${key}'`);
  }
}

// ── entry shape: glyph/color/damages/hint + MANDATORY real-verb counterplay ─────────────────────

function assertEntriesWellFormed() {
  for (const [id, e] of Object.entries(HAZARD_LANGUAGE)) {
    assert.ok(typeof e.glyph === 'string' && e.glyph.trim(), `${id}: empty glyph`);
    assert.match(e.color, /^#[0-9a-fA-F]{6}$/, `${id}: color must be a #rrggbb hex; got '${e.color}'`);
    assert.ok(Array.isArray(e.damages) && e.damages.length > 0, `${id}: damages[] is mandatory`);
    for (const d of e.damages) assert.ok(typeof d === 'string' && d.trim(), `${id}: empty damage tag`);
    assert.ok(Array.isArray(e.counterplay) && e.counterplay.length > 0,
      `${id}: counterplay[] is MANDATORY (a glyph with no counterplay is decoration)`);
    for (const v of e.counterplay) {
      assert.ok(COUNTERPLAY_VERBS.includes(v),
        `${id}: counterplay '${v}' must be a real player verb (${COUNTERPLAY_VERBS.join('/')})`);
    }
    assert.ok(typeof e.hint === 'string' && e.hint.trim().length > 10, `${id}: hint must be a real line`);
    assert.equal(hazardLanguageFor(id), e, `hazardLanguageFor('${id}') must return the entry`);
  }
  assert.equal(hazardLanguageFor('not_a_hazard'), null, 'unknown type resolves null, never throws');
}

function assertOneLanguagePerPhenomenon() {
  // Same phenomenon, same shape — the zone form must not invent a second glyph.
  assert.equal(HAZARD_LANGUAGE.radiation_field.glyph, HAZARD_LANGUAGE.radiation.glyph,
    'radiation_field must share the radiation glyph');
  assert.equal(HAZARD_LANGUAGE.nebula_fog.glyph, HAZARD_LANGUAGE.nebula.glyph,
    'nebula_fog must share the nebula glyph');
  // Zone colors come FROM ZONE_TYPES — the map tint and the language can never disagree.
  for (const id of hazardZoneTypeIds()) {
    assert.equal(HAZARD_LANGUAGE[id].color, ZONE_TYPES[id].color,
      `${id}: language color must be ZONE_TYPES.${id}.color (one source of truth)`);
  }
  // The 4 sector-hazard glyphs are pairwise distinct (the glance read).
  const glyphs = HAZARD_TYPES.map((id) => HAZARD_LANGUAGE[id].glyph);
  assert.equal(new Set(glyphs).size, HAZARD_TYPES.length,
    `sector hazard glyphs must be pairwise distinct; got ${JSON.stringify(glyphs)}`);
}

// ── hint behavior ──────────────────────────────────────────────────────────────────────────────

function makeBus() {
  const handlers = new Map();
  return {
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit(evt, payload) { for (const fn of (handlers.get(evt) || []).slice()) fn(payload); },
  };
}

function makeCtx() {
  const bus = makeBus();
  const sayCalls = [];
  const state = { simTime: 50, ui: {} };
  const ctx = { bus, state, helpers: { voice: { say(msg) { sayCalls.push(msg); return true; } } } };
  return { ctx, bus, state, sayCalls };
}

function assertHintFiresOncePerTypePerSession() {
  const { ctx, bus, sayCalls } = makeCtx();
  hazardHints.init(ctx);

  bus.emit('hazard:enter', { entityId: 1, zoneType: 'radiation', intensity: 0.5 });
  assert.equal(sayCalls.length, 1, 'first radiation entry speaks one hint');
  assert.equal(sayCalls[0].channel, 'warn', 'hint routes on the warn channel');
  assert.equal(sayCalls[0].text, HAZARD_LANGUAGE.radiation.hint, 'hint text is the counterplay line');

  bus.emit('hazard:exit', { entityId: 1, zoneType: 'radiation' });
  bus.emit('hazard:enter', { entityId: 1, zoneType: 'radiation', intensity: 0.5 });
  bus.emit('hazard:enter', { entityId: 1, zoneType: 'radiation', intensity: 0.5 });
  assert.equal(sayCalls.length, 1, `re-entries must NOT re-hint (tutorial-memory); got ${sayCalls.length}`);

  bus.emit('hazard:enter', { entityId: 1, zoneType: 'debris', intensity: 0.5 });
  assert.equal(sayCalls.length, 2, 'a different hazard TYPE gets its own one hint');

  // Hazard ZONE types hint via the shipped world:zoneEntered cue, once each too.
  bus.emit('world:zoneEntered', { zoneId: 'z1', name: 'Slag Field', type: 'radiation_field', threat: 2 });
  assert.equal(sayCalls.length, 3, 'a hazard zone type hints once');
  assert.equal(sayCalls[2].text, HAZARD_LANGUAGE.radiation_field.hint);
  bus.emit('world:zoneEntered', { zoneId: 'z1', name: 'Slag Field', type: 'radiation_field', threat: 2 });
  assert.equal(sayCalls.length, 3, 'zone re-entry stays silent');

  // Non-hazard zones NEVER hint (world:zoneEntered fires for every named zone).
  bus.emit('world:zoneEntered', { zoneId: 'z2', name: 'Ceres Mining Belt', type: 'mining_belt', threat: 1 });
  assert.equal(sayCalls.length, 3, 'non-hazard zones never hint');

  // New session resets the tutorial-memory.
  hazardHints.newGame();
  bus.emit('hazard:enter', { entityId: 1, zoneType: 'radiation', intensity: 0.5 });
  assert.equal(sayCalls.length, 4, 'newGame resets once-per-session memory');
  hazardHints.destroy();
}

// ── state.ui.hazardRead lifecycle (the seam the handed-off render half consumes) ────────────────

function assertHazardReadLifecycle() {
  const { ctx, bus, state, sayCalls } = makeCtx();
  hazardHints.init(ctx);

  bus.emit('hazard:enter', { entityId: 1, zoneType: 'radiation', intensity: 0.5 });
  let read = state.ui.hazardRead;
  assert.ok(read, 'entering a hazard sets state.ui.hazardRead');
  assert.equal(read.type, 'radiation');
  assert.equal(read.glyph, HAZARD_LANGUAGE.radiation.glyph, 'readout carries the glyph');
  assert.equal(read.color, HAZARD_LANGUAGE.radiation.color, 'readout carries the color');
  assert.deepEqual(read.damages, HAZARD_LANGUAGE.radiation.damages, 'readout carries the damage tags');
  assert.deepEqual(read.counterplay, HAZARD_LANGUAGE.radiation.counterplay, 'readout carries the counterplay verbs');

  bus.emit('hazard:exit', { entityId: 1, zoneType: 'radiation' });
  assert.equal(state.ui.hazardRead, null, 'leaving the hazard clears the readout');

  // A zone-hazard readout is cleared by the zone exit, not by an unrelated sector-hazard exit.
  bus.emit('world:zoneEntered', { zoneId: 'z1', name: 'Veil Bank', type: 'nebula_fog', threat: 1 });
  assert.equal(state.ui.hazardRead && state.ui.hazardRead.type, 'nebula_fog');
  bus.emit('hazard:exit', { entityId: 1, zoneType: 'radiation' });
  assert.equal(state.ui.hazardRead && state.ui.hazardRead.type, 'nebula_fog',
    'a sector-hazard exit must not clear a zone readout');
  bus.emit('world:zoneExited', { zoneId: 'z1' });
  assert.equal(state.ui.hazardRead, null, 'zone exit clears the zone readout');

  assert.ok(sayCalls.length >= 1, 'sanity: hints fired during lifecycle test');
  hazardHints.destroy();
}
