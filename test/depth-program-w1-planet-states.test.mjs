import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

import { hash32 } from '../src/core/rng.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { aceById } from '../src/data/namedAces.js';
import { PLANET_STATE_ASSIGNMENTS } from '../src/data/planetStates.js';
import { SECTORS } from '../src/data/sectors.js';
import { aceMemory } from '../src/systems/aceMemory.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';

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

test('Scrawl placements reference a real stable named ace', () => {
  const scrawls = PLANET_STATE_ASSIGNMENTS.filter((row) => row.stateId === 'planet_state_reach_scrawl');

  assert.equal(scrawls.length, 2);
  for (const row of scrawls) {
    assert.equal(row.challenge.trigger, 'sector:enter');
    assert.ok(aceById(row.challenge.aceId), `${row.challenge.aceId} must resolve in namedAces`);
  }
});

test('Reach Scrawl sector entry schedules and fires its exact named ace once', () => {
  const scrawls = PLANET_STATE_ASSIGNMENTS.filter((row) => row.stateId === 'planet_state_reach_scrawl');
  for (const assignment of scrawls) {
    const first = bootPlanetChallenge(assignment, 0x57a11);
    const second = bootPlanetChallenge(assignment, 0x57a11);
    const scheduled = first.state.aceMemory.planetChallenges[assignment.challenge.aceId];
    assert.ok(scheduled, `${assignment.bodyId} schedules its challenge`);
    assert.deepEqual(second.state.aceMemory.planetChallenges[assignment.challenge.aceId], scheduled,
      `${assignment.bodyId} scheduling is seed-stable`);
    assert.equal(scheduled.bodyId, assignment.bodyId);
    assert.equal(scheduled.stateId, assignment.stateId);
    assert.equal(scheduled.sectorId, assignment.sectorId);
    assert.equal(scheduled.encounterId,
      `planetChallenge:${assignment.bodyId}:${assignment.challenge.aceId}`);
    assert.ok(scheduled.dueAt >= 8 && scheduled.dueAt <= 12,
      'the challenge has a short deterministic warning window');

    first.state.simTime = scheduled.dueAt - 1;
    first.sim.runTicks(Math.ceil(0.55 / SIM_DT));
    assert.equal(first.appeared.length, 0, 'the named ace cannot spawn before the warning expires');

    first.state.simTime = scheduled.dueAt;
    first.state.encounterDirector.pressure.combat = 140;
    first.state.encounterDirector.lastMeaningfulAt = -1e9;
    first.state.encounterDirector.lastMajorAt = -1e9;
    first.sim.runTicks(Math.ceil(1.05 / SIM_DT));
    assert.equal(first.appeared.length, 1, `${assignment.challenge.aceId} appears once`);
    assert.equal(first.appeared[0].aceId, assignment.challenge.aceId);
    const boss = first.state.entities.get(first.appeared[0].spawnedIds[0]);
    assert.equal(boss?.data?.ai?.namedAceId, assignment.challenge.aceId,
      'the physical boss keeps the declared Scrawl identity');
    assert.equal(boss?.data?.ai?.name, aceById(assignment.challenge.aceId).name);
    const completed = first.state.aceMemory.planetChallenges[assignment.challenge.aceId];
    assert.equal(completed.status, 'complete');
    assert.equal(completed.outcome, 'appeared');

    first.bus.emit('sector:enter', { sectorId: assignment.sectorId });
    first.state.simTime += 30;
    first.sim.runTicks(Math.ceil(1.05 / SIM_DT));
    assert.equal(first.appeared.length, 1, 're-entry cannot duplicate a completed challenge');
  }
});

test('pending Reach Scrawl challenges survive save normalization and retry after load', () => {
  const assignment = PLANET_STATE_ASSIGNMENTS.find((row) => row.bodyId === 'planet_reach_scrawl_ashfall');
  const h = bootPlanetChallenge(assignment, 0x5a9e, { emitSectorEnter: false });
  const system = h.registry.get('aceMemory');
  system.deserialize({
    schemaVersion: 1,
    news: { legacy: true },
    planetChallenges: {
      [assignment.challenge.aceId]: {
        aceId: assignment.challenge.aceId,
        bodyId: assignment.bodyId,
        stateId: assignment.stateId,
        sectorId: assignment.sectorId,
        encounterId: `planetChallenge:${assignment.bodyId}:${assignment.challenge.aceId}`,
        dueAt: 4,
        status: 'live',
        attempts: 1,
      },
    },
  });
  h.state.simTime = 20;
  h.bus.emit('save:loaded', {});
  const rearmed = h.state.aceMemory.planetChallenges[assignment.challenge.aceId];
  assert.equal(rearmed.status, 'pending');
  assert.ok(rearmed.dueAt >= 28 && rearmed.dueAt <= 32);
  assert.equal(rearmed.attempts, 1);
  assert.equal(h.state.aceMemory.news.legacy, true);
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

function bootPlanetChallenge(assignment, seed, options = {}) {
  const sim = createSimulation({
    seed,
    systems: [aceMemory, spawnBudget, encounterDirector, aiPorts],
  });
  const { state, bus, registry } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = assignment.sectorId;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 10,
  });
  state.playerId = player.id;
  const appeared = [];
  bus.on('namedAce:appeared', (payload) => appeared.push(structuredClone(payload)));
  if (options.emitSectorEnter !== false) bus.emit('sector:enter', { sectorId: assignment.sectorId });
  return { sim, state, bus, registry, appeared };
}
