import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

import { hash32 } from '../src/core/rng.js';
import { aceById } from '../src/data/namedAces.js';
import { SECTORS } from '../src/data/sectors.js';

const MODULE_URL = new URL('../src/data/planetStates.js', import.meta.url);

test('W1 planet-state data module exists', () => {
  assert.equal(existsSync(MODULE_URL), true, 'src/data/planetStates.js must exist');
});

const EXPECTED_STATE_IDS = Object.freeze([
  'planet_state_shatterstone',
  'planet_state_vestas_burn',
  'planet_state_razor_ring',
  'planet_state_reach_scrawl',
]);

const EXPECTED_PLACEMENTS = Object.freeze([
  ['planet_shatterstone', 'planet_state_shatterstone', 'sector_charon_expanse', 'whole'],
  ['planet_vestas_burn', 'planet_state_vestas_burn', 'sector_vesta_forge', 'whole'],
  ['planet_razor_ring', 'planet_state_razor_ring', 'sector_vesta_forge', 'razor'],
  ['planet_crown_of_thorns', 'planet_state_razor_ring', 'sector_sker_haven', 'crown_of_thorns'],
  ['planet_reach_scrawl_sker', 'planet_state_reach_scrawl', 'sector_sker_haven', 'sker'],
  ['planet_reach_scrawl_ashfall', 'planet_state_reach_scrawl', 'sector_ashfall_reach', 'ashfall'],
]);

const SCANNER_KINDS = new Set(['distress', 'anomaly', 'salvage', 'ambush', 'ship', 'ore']);
const ASSIGNED_SECTOR_SEMANTIC_HASHES = Object.freeze({
  sector_charon_expanse: 2499995255,
  sector_vesta_forge: 3339003051,
  sector_sker_haven: 2828418493,
  sector_ashfall_reach: 675846230,
});

function assertDeepFrozen(value, path = 'value', seen = new Set()) {
  if (value == null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true, `${path} must be frozen`);
  for (const [key, child] of Object.entries(value)) {
    assertDeepFrozen(child, `${path}.${key}`, seen);
  }
}

test('W1 declares exactly four deeply frozen semantic planet states', async () => {
  const { PLANET_STATE_DEFS } = await import(MODULE_URL);

  assert.ok(PLANET_STATE_DEFS, 'PLANET_STATE_DEFS export is required');
  assert.deepEqual(Object.keys(PLANET_STATE_DEFS).sort(), [...EXPECTED_STATE_IDS].sort());
  for (const id of EXPECTED_STATE_IDS) {
    const def = PLANET_STATE_DEFS[id];
    assert.equal(def.id, id);
    assert.equal(typeof def.label, 'string');
    assert.ok(def.label.length > 0);
    assert.equal(typeof def.baseType, 'string');
    assert.ok(def.visualRoles.length >= 2, `${id} must declare its visual read semantically`);
    assert.ok(def.gameplayHooks.length >= 1, `${id} must declare at least one future gameplay hook`);
    assertDeepFrozen(def, id);
  }
  assertDeepFrozen(PLANET_STATE_DEFS, 'PLANET_STATE_DEFS');
});

test('W1 declares six stable placements with scanner contracts and deterministic seeds', async () => {
  const { PLANET_STATE_ASSIGNMENTS } = await import(MODULE_URL);

  assert.ok(PLANET_STATE_ASSIGNMENTS, 'PLANET_STATE_ASSIGNMENTS export is required');
  assert.equal(PLANET_STATE_ASSIGNMENTS.length, EXPECTED_PLACEMENTS.length);
  assert.deepEqual(
    PLANET_STATE_ASSIGNMENTS.map((row) => [row.bodyId, row.stateId, row.sectorId, row.variantId]),
    EXPECTED_PLACEMENTS,
  );

  const bodyIds = new Set();
  const signalIds = new Set();
  for (const row of PLANET_STATE_ASSIGNMENTS) {
    assert.equal(bodyIds.has(row.bodyId), false, `duplicate bodyId ${row.bodyId}`);
    bodyIds.add(row.bodyId);
    assert.equal(row.seedKey, `w1-v1|${row.sectorId}|${row.bodyId}|${row.variantId}`);
    assert.equal(row.seed, hash32(...row.seedKey.split('|')), 'seed must hash the documented tuple order');
    assert.ok(SCANNER_KINDS.has(row.scannerSignal.kind), `${row.bodyId} uses a scanner-supported kind`);
    assert.equal(row.scannerSignal.sourceId, row.bodyId);
    assert.equal(signalIds.has(row.scannerSignal.id), false, `duplicate signal id ${row.scannerSignal.id}`);
    signalIds.add(row.scannerSignal.id);
    assert.ok(row.gameplayHooks.length >= 1, `${row.bodyId} must retain its authored mechanic contract`);
    assertDeepFrozen(row, row.bodyId);
  }
  assertDeepFrozen(PLANET_STATE_ASSIGNMENTS, 'PLANET_STATE_ASSIGNMENTS');
});

test('Scrawl placements reference a real stable named ace without emitting runtime state', async () => {
  const { PLANET_STATE_ASSIGNMENTS } = await import(MODULE_URL);
  assert.ok(PLANET_STATE_ASSIGNMENTS, 'PLANET_STATE_ASSIGNMENTS export is required');
  const scrawls = PLANET_STATE_ASSIGNMENTS.filter((row) => row.stateId === 'planet_state_reach_scrawl');

  assert.equal(scrawls.length, 2);
  for (const row of scrawls) {
    assert.equal(row.challenge.trigger, 'sector:enter');
    assert.ok(aceById(row.challenge.aceId), `${row.challenge.aceId} must resolve in namedAces`);
  }
});

test('planetStatesForSector is stable, frozen, and independent of query order', async () => {
  const { planetStatesForSector } = await import(MODULE_URL);
  assert.equal(typeof planetStatesForSector, 'function', 'planetStatesForSector export is required');
  const first = planetStatesForSector('sector_vesta_forge');
  const unrelated = planetStatesForSector('sector_helios_prime');
  const second = planetStatesForSector('sector_vesta_forge');

  assert.deepEqual(first.map((row) => row.bodyId), ['planet_vestas_burn', 'planet_razor_ring']);
  assert.strictEqual(first, second, 'sector queries return the canonical frozen bucket');
  assert.deepEqual(unrelated, []);
  assert.equal(Object.isFrozen(unrelated), true);
  assertDeepFrozen(first, 'sector_vesta_forge assignments');
});

test('sector decorator adds only planetStates and preserves every prior field by identity', async () => {
  const { applyPlanetStateAssignments } = await import(MODULE_URL);
  assert.equal(typeof applyPlanetStateAssignments, 'function', 'applyPlanetStateAssignments export is required');
  const sector = {
    id: 'sector_vesta_forge',
    name: 'Vesta Forge',
    neighbors: ['sector_helios_prime'],
    hazards: [{ type: 'radiation' }],
    pois: [{ id: 'poi_forge' }],
    owner: 'faction_dmc',
  };
  const beforeKeys = Object.keys(sector);
  const decorated = applyPlanetStateAssignments(sector);

  assert.notStrictEqual(decorated, sector);
  assert.deepEqual(Object.keys(decorated), [...beforeKeys, 'planetStates']);
  for (const key of beforeKeys) assert.strictEqual(decorated[key], sector[key], `${key} byte-semantics changed`);
  assert.deepEqual(decorated.planetStates.map((row) => row.bodyId), ['planet_vestas_burn', 'planet_razor_ring']);
  assert.equal(Object.hasOwn(sector, 'planetStates'), false, 'decorator must not mutate its input');

  const unassigned = { id: 'sector_helios_prime', neighbors: [] };
  assert.strictEqual(applyPlanetStateAssignments(unassigned), unassigned, 'unassigned sectors retain identity');
  assert.equal(applyPlanetStateAssignments(null), null);
});

test('live SECTORS exposes six additive W1 assignments without changing sector semantics', () => {
  assert.equal(SECTORS.length, 24, 'W1 must not change the canonical sector count');
  const assigned = SECTORS.filter((sector) => Array.isArray(sector.planetStates));
  assert.deepEqual(
    assigned.map((sector) => sector.id).sort(),
    Object.keys(ASSIGNED_SECTOR_SEMANTIC_HASHES).sort(),
  );
  assert.equal(assigned.reduce((sum, sector) => sum + sector.planetStates.length, 0), 6);

  for (const sector of assigned) {
    const semantics = {
      factionId: sector.factionId,
      neighbors: sector.neighbors,
      hazards: sector.hazards,
      pois: sector.pois,
    };
    assert.equal(
      hash32(JSON.stringify(semantics)),
      ASSIGNED_SECTOR_SEMANTIC_HASHES[sector.id],
      `${sector.id} topology/hazards/POIs/faction ownership changed`,
    );
  }
});
