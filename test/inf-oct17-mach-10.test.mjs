// INFERENCE MACH-10: "The runtime witness prints live field, tether and traffic counts."
//
// Contract:
// - collectRuntimeWitnessSample collects fieldCount, tetherCount, and trafficCount from state.
// - formatRuntimeWitnessReport prints a glanceable live line with all three counts.
// - On a seed-4242 busy scene with deployed fields, active tether, and ambient sector traffic,
//   all three counts report non-zero values.
// - A quiet scene reports 0 for all three counts.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { combat } from '../src/systems/combat.js';
import { fields } from '../src/systems/fields.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';
import { physics } from '../src/core/physics.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import {
  collectRuntimeWitnessSample,
  createRuntimeWitness,
  formatRuntimeWitnessReport,
} from '../src/core/runtimeWitness.js';

test('witness sample carries field, tether and traffic counts from state', () => {
  const state = {
    fields: { count: 4 },
    tether: { count: 2 },
    traffic: { count: 9 },
  };
  const sample = collectRuntimeWitnessSample(state);
  assert.equal(sample.fieldCount, 4, 'fieldCount matches state');
  assert.equal(sample.tetherCount, 2, 'tetherCount matches state');
  assert.equal(sample.trafficCount, 9, 'trafficCount matches state');
});

test('quiet negative branch: zero counts print in witness report', () => {
  const witness = createRuntimeWitness();
  const state = {
    mode: 'flight',
    fields: { count: 0 },
    tether: { count: 0 },
    traffic: { count: 0 },
  };
  witness.observe(state, { wallMs: 0 });
  const report = witness.explain();
  const line = report.split('\n').find((row) => row.includes('field, tether and traffic counts') || (row.includes('fields') && row.includes('tethers') && row.includes('traffic')));
  assert.ok(line, 'report carries the field, tether and traffic counts line');
  assert.match(line, /fields 0\b/, 'zero fields in quiet scene');
  assert.match(line, /tethers 0\b/, 'zero tethers in quiet scene');
  assert.match(line, /traffic 0\b/, 'zero traffic in quiet scene');
});

test('positive branch: seed-4242 busy scene shows non-zero field, tether and traffic counts', async () => {
  const prevFlag = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    const sim = createSimulation({
      seed: 4242,
      systems: [physics, combat, world, traffic, fields, tetherGameplay],
    });
    const phys = sim.registry.get('physics');
    sim.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    await phys.prepareBackend(sim.state);
    sim.state.mode = 'flight';

    const player = sim.spawn({
      type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      radius: 5, mass: 10, hull: 100, hullMax: 100, flags: {},
      physicsBody: { schemaVersion: 1, radius: 5, mass: 10, dynamic: true, material: 'ship', revision: 0 },
    });
    sim.state.playerId = player.id;

    const target = sim.spawn({
      type: 'ship', team: 1, pos: { x: 20, z: 0 }, vel: { x: 0, z: 0 },
      radius: 5, mass: 10, hull: 100, hullMax: 100, flags: {},
      physicsBody: { schemaVersion: 1, radius: 5, mass: 10, dynamic: true, material: 'ship', revision: 0 },
      data: { combatProfileId: 'combat_profile_standard_ship' },
    });

    const w = sim.registry.get('world');
    w.enterSector('sector_helios_prime', { placePlayer: false });

    // Deploy a well and fire tether
    sim.state.input.aimWorld = { x: 100, z: 0 };
    sim.state.input.tetherMode = 'nearest';
    sim.state.input.actions = { deployWell: true, tetherFire: true };
    sim.step();
    sim.state.input.actions = {};
    sim.step();

    const witness = createRuntimeWitness();
    witness.observe(sim.state, { wallMs: 0 });
    const sample = witness.snapshot();

    assert.ok(sample.fieldCount > 0, `expected non-zero fields, got ${sample.fieldCount}`);
    assert.ok(sample.tetherCount > 0, `expected non-zero tethers, got ${sample.tetherCount}`);
    assert.ok(sample.trafficCount > 0, `expected non-zero traffic, got ${sample.trafficCount}`);

    const report = witness.explain();
    const line = report.split('\n').find((row) => row.includes('field, tether and traffic counts') || (row.includes('fields') && row.includes('tethers') && row.includes('traffic')));
    assert.ok(line, 'report carries the field, tether and traffic line');
    assert.match(line, /fields [1-9]\d*/, 'report prints non-zero fields count');
    assert.match(line, /tethers [1-9]\d*/, 'report prints non-zero tethers count');
    assert.match(line, /traffic [1-9]\d*/, 'report prints non-zero traffic count');

    sim.dispose();
  } finally {
    FIELD_FLAGS.enabled = prevFlag;
  }
});
