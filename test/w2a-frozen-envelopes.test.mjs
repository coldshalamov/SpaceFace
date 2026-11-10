// W2-A / O25 — Old saves are proven to load.
//
// Three frozen envelopes sit under test/fixtures/saves/ (recipe: build-frozen.mjs): the oldest
// schema (v1), a mid-ladder schema (v12) and the current one, each carrying credits, hold cargo and
// an accepted contract. Each goes through the real load path (parse -> checksum -> migrate ->
// normalise -> restore) into a live sim, and the player's stuff must come out equal to the fixture.
// The migration ladder itself must have exactly one step per version. Fixtures are frozen: when the
// schema moves, ADD a fixture; never regenerate these.
// Run: node --test test/w2a-frozen-envelopes.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { MIGRATIONS } from '../src/save/migrations.js';
import { save } from '../src/save/saveSystem.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { heat } from '../src/systems/heat.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { salvage } from '../src/systems/salvage.js';
import { missions } from '../src/systems/missions.js';
import { world } from '../src/systems/world.js';

const SYSTEMS = [spawnBudget, cargo, economy, factions, heat, encounterDirector, salvage, missions, world, save];
const FIXTURES = [
  { name: 'frozen-v01.json', version: 1 },
  { name: 'frozen-v12.json', version: 12 },
  // The v19 capture stays here by name after the schema moves; a newer fixture is ADDED beside it.
  { name: 'frozen-v19.json', version: 19 },
];

const fixtureText = (name) => fs.readFileSync(new URL(`./fixtures/saves/${name}`, import.meta.url), 'utf8');

// The contracts a fixture carries: where the producer put them depends on the schema era.
function activeContracts(data) {
  const m = data.missions || {};
  return (Array.isArray(m.active) ? m.active : (m.missions && m.missions.active) || [])
    .map((row) => ({ id: row.id, type: row.type, status: row.status }));
}

// Load failures only: entering a sector arms an autosave that a restore then supersedes, and that
// cancellation is reported on the same event with slot 'auto'.
function loadErrors(sim) {
  const errors = [];
  sim.bus.on('save:error', (e) => { if (!e || e.slot !== 'auto') errors.push(e); });
  return errors;
}

function liveSim() {
  const sim = createSimulation({ seed: 31, systems: SYSTEMS });
  sim.state.mode = 'flight';
  sim.registry.get('world').enterSector('sector_helios_prime');
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 6,
  });
  sim.state.playerId = player.id;
  // The session being left holds different money, hold and contracts: the load must replace them.
  sim.state.player.credits = 1;
  sim.state.player.cargo.items = { cmdty_water_ice: 9 };
  return sim;
}

for (const { name, version } of FIXTURES) {
  test(`${name}: loads through the real path and restores credits, cargo and contracts as frozen`, () => {
    const text = fixtureText(name);
    const frozen = JSON.parse(text);
    assert.equal(frozen.version, version, 'the file is the version it claims');
    const want = {
      credits: frozen.data.player.credits,
      cargo: frozen.data.cargo.items,
      contracts: activeContracts(frozen.data),
    };
    assert.ok(want.credits > 0, 'the fixture carries money');
    assert.ok(Object.keys(want.cargo).length > 0, 'the fixture carries cargo');
    assert.ok(want.contracts.length > 0, 'the fixture carries an active contract');

    const sim = liveSim();
    const saver = sim.registry.get('save');
    const prepared = saver._prepareEnvelopeString(text);
    assert.equal(prepared.ok, true, `the envelope prepares: ${prepared.reason || ''}`);
    assert.equal(prepared.version, version, 'prepare reports the schema it migrated from');

    const errors = loadErrors(sim);
    assert.equal(saver.loadEnvelope(frozen, 'frozen'), true, `the load is accepted: ${JSON.stringify(errors)}`);
    assert.deepEqual(errors, [], 'no load error was reported');

    assert.equal(sim.state.player.credits, want.credits, 'credits');
    assert.deepEqual(sim.state.player.cargo.items, want.cargo, 'cargo');
    assert.deepEqual(
      sim.state.missions.active.map((row) => ({ id: row.id, type: row.type, status: row.status })),
      want.contracts, 'active contracts');
    assert.equal(sim.state.meta.version, CURRENT_VERSION, 'the loaded run is on the current schema');
    assert.ok(version <= CURRENT_VERSION);

    // And the loaded game plays on and saves again at the current version.
    sim.runTicks(60);
    const resaved = saver.serialize('frozen');
    assert.equal(resaved.version, CURRENT_VERSION);
    assert.equal(resaved.data.player.credits, want.credits);
    assert.deepEqual(resaved.data.cargo.items, want.cargo);
    sim.dispose();
  });
}

test('tripwire: a frozen fixture exists for the current schema (add one when the schema moves)', () => {
  assert.ok(fs.existsSync(new URL(`./fixtures/saves/frozen-v${CURRENT_VERSION}.json`, import.meta.url)),
    `no frozen-v${CURRENT_VERSION}.json: capture one with build-frozen.mjs --write (and keep the older files)`);
});

test('a hand-edited frozen fixture is refused, not loaded (the checksum guards the bytes)', () => {
  const frozen = JSON.parse(fixtureText('frozen-v12.json'));
  frozen.data.player.credits += 1;
  const sim = liveSim();
  const errors = loadErrors(sim);
  assert.equal(sim.registry.get('save').loadEnvelope(frozen, 'frozen'), false);
  assert.equal(errors[0] && errors[0].reason, 'checksum');
  assert.equal(sim.state.player.credits, 1, 'the running game is untouched');
  sim.dispose();
});

test('the migration ladder has exactly one step for every version 1..CURRENT-1', () => {
  assert.ok(CURRENT_VERSION >= 19);
  for (let v = 1; v < CURRENT_VERSION; v++) {
    const steps = MIGRATIONS.filter((m) => m.from === v);
    assert.equal(steps.length, 1, `exactly one step leaves v${v}`);
    assert.equal(steps[0].to, v + 1, `the step from v${v} lands on v${v + 1}`);
    assert.equal(typeof steps[0].fn, 'function', `v${v}->v${v + 1} is runnable`);
  }
  assert.equal(MIGRATIONS.length, CURRENT_VERSION - 1, 'and no step leaves the ladder or repeats');
  assert.equal(MIGRATIONS.filter((m) => m.from >= CURRENT_VERSION).length, 0, 'nothing migrates from current');
});
