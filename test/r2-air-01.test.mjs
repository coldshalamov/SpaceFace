import test from 'node:test';
import assert from 'node:assert/strict';

import { livingHullWithScar } from '../src/core/livingHull.js';
import { createSimulation } from '../src/core/sim.js';
import { captureEntityRecord } from '../src/world/worldRecords.js';
import { save } from '../src/save/saveSystem.js';
import { MIGRATIONS } from '../src/save/migrations.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalResults } from '../src/systems/survivalResults.js';
import {
  RUN_SHARE_PREFIX,
  SHARE_CODE_VERSION,
  decodeRunShareCode,
  encodeShareBlock,
  runShareSpecFields,
} from '../src/core/runShareCode.js';
import { crucibleSetupFor } from '../src/ui/crucibleLaunch.js';
import { applyRunShareCode, requestSharedCrucibleRun, runShareCodeForRun } from '../src/ui/screens/shareCode.js';

const SEED = 4242;

function setup() {
  const result = crucibleSetupFor({ starterId: 'physics_toolkit', seed: SEED });
  assert.equal(result.ok, true);
  return result.value;
}

test('AIR-01: the existing results export must carry the dead hull before it can reach another galaxy', () => {
  const launch = setup();
  const livingHull = livingHullWithScar(null, {
    cause: 'slam', surface: 'terrain', band: 'heavy', facing: 'bow',
    tick: 300, atT: 5,
  }, 5);
  const wreck = {
    v: 1,
    sectorId: 'sector_helios_prime',
    pos: { x: 123.25, z: -456.5 },
    hullId: launch.hullId,
    livingHull,
    loadout: launch.loadout,
  };
  const code = runShareCodeForRun(launch, {
    seed: SEED, ruleset: 'swarm', outcome: 'defeat', wreck,
  });
  const decoded = decodeRunShareCode(code);
  assert.equal(decoded.ok, true);
  const fields = runShareSpecFields(decoded.spec);
  assert.deepEqual(fields.wreck?.pos, wreck.pos,
    'the real results export drops the death position required for cross-run wreck placement');
  assert.equal(fields.wreck.v, 1, 'the wreck record has its own version');
  assert.deepEqual(fields.wreck.livingHull, livingHull, 'the hull scars survive export');
  assert.deepEqual(fields.wreck.loadout, launch.loadout, 'the fitted modules survive export');
});

test('AIR-01: a run without a wreck and an absent code remain quiet', () => {
  const code = runShareCodeForRun(setup(), { seed: SEED, ruleset: 'swarm' });
  const decoded = decodeRunShareCode(code);
  assert.equal(decoded.ok, true);
  assert.ok(runShareSpecFields(decoded.spec).wreck == null);
  assert.equal(code, 'SFC1-eyJhIjoiaGVsaW9zX2NvcmUiLCJnIjowLCJoIjoic2hpcF9ob3JuZXQiLCJrIjoicGh5c2ljc190b29sa2l0IiwibCI6W1swLCJ3cG5fY29uY3Vzc2lvbl9jYW5ub25fbSJdLFsxLCJ3cG5fZ3Jhdml0eV9tYXJrZXJfcyJdLFsyLCJ3cG5fbW9tZW50dW1fc2lua19zIl1dLCJyIjoic3dhcm0iLCJzIjo0MjQyLCJ2IjoxfQ-87424915',
    'a no-wreck results code stays byte-identical');
  const imported = applyRunShareCode(code);
  assert.equal(imported.ok, true);
  assert.ok(imported.wreck == null);
  assert.equal(applyRunShareCode('').ok, false);
});

function deadRun() {
  const launch = setup();
  const sim = createSimulation({ seed: SEED, systems: [runSession, survivalResults] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_helios_prime';
  const livingHull = livingHullWithScar(null, {
    cause: 'slam', surface: 'terrain', band: 'heavy', facing: 'bow', tick: 300, atT: 5,
  }, 5);
  const fittings = launch.loadout.reduce((out, entry) => {
    out[entry.slotIndex] = entry.defId;
    return out;
  }, []);
  sim.state.player.ownedShips = [{ defId: launch.hullId, fittings, livingHull }];
  sim.state.player.activeShipIndex = 0;
  const player = sim.spawn({
    type: 'ship', pos: { x: 123.25, z: -456.5 }, radius: 10,
    data: { defId: launch.hullId, fittings, livingHull },
  });
  sim.state.playerId = player.id;
  sim.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: SEED });
  sim.bus.emit('player:death', {});
  const result = sim.registry.get('survivalResults').lastResult();
  sim.dispose();
  return { launch, result, livingHull };
}

function galaxy() {
  const sim = createSimulation({ seed: SEED, systems: [uniqueWrecks] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_helios_prime';
  return sim;
}

function ghosts(sim) {
  return sim.state.entityList.filter((entity) => entity.alive !== false
    && entity.type === 'wreck' && entity.data?.crossRunWreck);
}

test('AIR-01: a real death exports the final hull and the native launch reaches the sim', () => {
  const { launch, result, livingHull } = deadRun();
  assert.deepEqual(result.wreck?.pos, { x: 123.25, z: -456.5 }, 'death captures the authoritative position');
  assert.deepEqual(result.wreck.livingHull, livingHull);
  assert.deepEqual(result.wreck.loadout, launch.loadout);
  const imported = applyRunShareCode(runShareCodeForRun(launch, result));
  assert.equal(imported.ok, true);
  let opts;
  const accepted = requestSharedCrucibleRun({ emit(name, value) { if (name === 'game:new') opts = value; } },
    { ...launch, wreck: imported.wreck }, 'swarm');
  assert.equal(accepted, true);
  assert.deepEqual(opts.wreck, imported.wreck, 'the native New Game options must carry the wreck past launch allowlists');
  const sim = galaxy();
  try {
    sim.bus.emit('game:newGame', opts);
    sim.bus.emit('sector:enter', { sectorId: sim.state.world.currentSectorId });
    assert.equal(ghosts(sim).length, 1);
    const entity = ghosts(sim)[0];
    assert.equal(entity.pos.x, result.wreck.pos.x);
    assert.equal(entity.pos.z, result.wreck.pos.z);
    assert.deepEqual(entity.data.livingHull, livingHull);
    assert.deepEqual(entity.data.loadout, launch.loadout);
    assert.equal(entity.data.hulkOfDefId, launch.hullId);
    assert.equal(entity.physicsBody.mass > 0, true, 'a wreck is a physical body');
  } finally { sim.dispose(); }
});

test('AIR-01: the real sim places, dedupes, saves and restores one exact wreck', () => {
  const { launch, result } = deadRun();
  const imported = applyRunShareCode(runShareCodeForRun(launch, result));
  assert.equal(imported.ok, true);
  assert.ok(imported.wreck, 'the real paste path returns the wreck');
  const a = galaxy();
  const b = galaxy();
  try {
    for (let i = 0; i < 2; i++) {
      a.bus.emit('game:newGame', { wreck: imported.wreck });
      a.bus.emit('game:started', {});
    }
    assert.equal(ghosts(a).length, 1, 'importing the same record twice does not duplicate it');
    assert.equal(captureEntityRecord(ghosts(a)[0], { sectorId: 'sector_helios_prime' }), null,
      'the unique-wreck owner prevents a second degraded world-record shell on Continue');
    const serialized = save._serializePlayer.call({ state: a.state });
    save._restorePlayer.call({ state: b.state }, serialized);
    b.bus.emit('save:loaded', {});
    b.bus.emit('save:loaded', {});
    b.bus.emit('sector:enter', { sectorId: b.state.world.currentSectorId });
    assert.equal(ghosts(b).length, 1, 'Continue keeps exactly one wreck');
    assert.deepEqual(ghosts(b)[0].data.livingHull, ghosts(a)[0].data.livingHull);
    assert.deepEqual(ghosts(b)[0].data.loadout, ghosts(a)[0].data.loadout);
    assert.equal(ghosts(b)[0].pos.x, ghosts(a)[0].pos.x);
    assert.equal(ghosts(b)[0].pos.z, ghosts(a)[0].pos.z);
    assert.deepEqual(b.registry.get('uniqueWrecks').serialize(), a.registry.get('uniqueWrecks').serialize());
  } finally { a.dispose(); b.dispose(); }
});

test('AIR-01: old wreck state migrates without inventing a ghost', () => {
  const migration = MIGRATIONS.find((entry) => entry.from === 17 && entry.to === 18);
  assert.ok(migration, 'the added saved wreck record has an explicit migration');
  const data = { player: { uniqueWrecks: { schemaVersion: 2, bearings: {} } } };
  migration.fn(data);
  const once = structuredClone(data);
  migration.fn(data);
  assert.deepEqual(data, once, 'the migration is idempotent');
  const sim = galaxy();
  try {
    save._restorePlayer.call({ state: sim.state }, data.player);
    sim.bus.emit('save:loaded', {});
    assert.equal(ghosts(sim).length, 0);
  } finally { sim.dispose(); }
});

test('AIR-01: the production worker read model carries the native wreck to presentation', { timeout: 30000 }, async () => {
  const { readFileSync } = await import('node:fs');
  const { createSimHost } = await import('../scripts/lib/simWorkerHost.mjs');
  const { createReadModel, applySpawnInfos } = await import('../scripts/lib/simReadModel.mjs');
  const { launch, result } = deadRun();
  const imported = applyRunShareCode(runShareCodeForRun(launch, result));
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: SEED,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const { state, registry } = lane.host;
    state.mode = 'flight';
    state.world.currentSectorId = imported.wreck.sectorId;
    const owner = registry.get('uniqueWrecks');
    owner._importRunWreck(imported.wreck);
    owner._syncRunWrecks(state.world.currentSectorId);
    const reply = structuredClone(await lane.tick({ tick: 1, steps: 0, ackEnd: init.journalSequence }));
    const main = createReadModel();
    applySpawnInfos(main, reply.spawnInfos);
    const wreck = [...main.entities.values()].find((entity) => entity.data.crossRunWreck);
    assert.ok(wreck, 'the real worker spawn-info channel reaches the frontend entity store');
    assert.equal(wreck.pos.x, imported.wreck.pos.x);
    assert.equal(wreck.pos.z, imported.wreck.pos.z);
    assert.deepEqual(wreck.data.livingHull, imported.wreck.livingHull);
    assert.deepEqual(wreck.data.loadout, imported.wreck.loadout);
    assert.equal(wreck.data.hulkVisual.defId, imported.wreck.hullId);
  } finally { lane.shutdown(); }
});

test('AIR-01: unsupported and foreign wrecks are refused without touching the galaxy', () => {
  const { launch, result } = deadRun();
  assert.ok(result.wreck);
  const base = decodeRunShareCode(runShareCodeForRun(launch, result)).spec;
  const sim = galaxy();
  try {
    for (const change of [
      { v: 0 }, { v: 2 }, { hullId: 'foreign_hull' }, { sectorId: 'foreign_sector' },
      { pos: { x: null, z: 10 } }, { loadout: [{ slotIndex: 0, defId: 'foreign_module' }] },
    ]) {
      const wreck = { ...result.wreck, ...change };
      const response = applyRunShareCode(encodeShareBlock(RUN_SHARE_PREFIX, { ...base, e: wreck }));
      assert.equal(response.ok, false);
      assert.match(response.error, /wreck|ship|code/i);
      assert.doesNotMatch(response.error, /foreign_|hullId|sectorId|loadout|base64|JSON/);
      sim.bus.emit('game:newGame', { wreck });
    }
    sim.bus.emit('game:newGame', {});
    sim.bus.emit('game:started', {});
    assert.equal(ghosts(sim).length, 0);
  } finally { sim.dispose(); }
});

test('AIR-01: old, foreign-version, and unrelated codes are refused by the real paste path', () => {
  for (const v of [0, SHARE_CODE_VERSION + 1]) {
    const code = encodeShareBlock(RUN_SHARE_PREFIX, { v, s: SEED, k: 'physics_toolkit' });
    const result = applyRunShareCode(code);
    assert.equal(result.ok, false);
    assert.equal(typeof result.error, 'string');
    assert.ok(result.error.length > 0, 'the refusal explains the problem');
  }
  assert.equal(applyRunShareCode('another game code').ok, false);
});
