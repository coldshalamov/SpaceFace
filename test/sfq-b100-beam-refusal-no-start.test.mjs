import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { mulberry32 } from '../src/core/rng.js';
import { SIM_DT } from '../src/core/sim.js';
import { mining as miningBase } from '../src/systems/mining.js';

const SEED = 4242;

function bootHarness(seed = SEED) {
  const player = {
    id: 1,
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 6,
    flags: { docked: false },
    data: { miningBeam: { tierId: 'beam_mk1', directToCargo: false } },
  };

  const state = {
    mode: 'flight',
    playerId: player.id,
    simTime: 0,
    tick: 0,
    meta: { seed },
    rng: mulberry32(seed),
    player: {
      credits: 0,
      beamMode: 'auto',
      cargo: { items: {}, capVolume: 500, capMass: 1000, usedVolume: 0, usedMass: 0 },
    },
    input: { aimAngle: 0, fireGroup: 0, actions: {} },
    entities: new Map([[player.id, player]]),
    entityList: [player],
    world: { currentSectorId: 'sector_test' },
  };

  const bus = createBus();
  const events = {
    start: [],
    stop: [],
    denied: [],
    toast: [],
  };
  bus.on('mining:start', (p) => events.start.push(p));
  bus.on('mining:stop', (p) => events.stop.push(p));
  bus.on('beam:denied', (p) => events.denied.push(p));
  bus.on('toast', (p) => events.toast.push(p));

  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, ...spec, data: spec.data || {} };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };

  const mining = { ...miningBase };
  mining.init({ state, bus, helpers, registry: { get: () => null } });
  return { state, bus, mining, player, events };
}

test('positive case: holding fireGroup = 2 on a mined-out target announces refusal once, never starts beam, keeps heat at 0 (seed 4242)', () => {
  const { state, mining, player, events } = bootHarness(SEED);

  // Wreck target with data.respawnAt != null in extract mode resolves to verb 'extract', ok: false, reason: 'mined-out'
  state.player.beamMode = 'extract';
  const minedOutWreck = {
    id: 10,
    type: 'wreck',
    alive: true,
    pos: { x: 50, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 10,
    data: { respawnAt: 100 },
  };
  state.entities.set(minedOutWreck.id, minedOutWreck);
  state.entityList.push(minedOutWreck);

  state.input.fireGroup = 2;
  state.input.aimAngle = 0;

  // Hold the trigger across 5 ticks
  for (let i = 0; i < 5; i++) {
    mining.update(SIM_DT, state);
    state.simTime += SIM_DT;
    state.tick += 1;
  }

  const beam = player.data.miningBeam;

  // Emits beam:denied for mined-out
  assert.ok(events.denied.length >= 1, 'emits beam:denied');
  assert.equal(events.denied[0].reason, 'mined-out');
  assert.equal(events.denied[0].verb, 'extract');
  assert.equal(events.denied[0].targetId, minedOutWreck.id);

  // Announces refusal toast once across the hold
  assert.equal(events.toast.length, 1, 'refusal toast announced exactly once');
  assert.equal(events.toast[0].text, 'Nothing left to take');

  // Zero mining:start events
  assert.equal(events.start.length, 0, 'emits zero mining:start events');

  // Keeps mining._beaming === false
  assert.equal(mining._beaming, false, 'mining._beaming stays false');

  // Keeps beam.heat === 0
  assert.equal(beam.heat, 0, 'beam.heat stays 0');
});

test('positive case: holding fireGroup = 2 on an intact or unresourceful weld target announces refusal once, never starts beam, keeps heat at 0 (seed 4242)', () => {
  const { state, mining, player, events } = bootHarness(SEED);

  // Damaged friendly ship, but player has 0 credits and 0 scrap metal -> resolveBeamVerb gives 'insufficient-resources'
  const friendlyCasualty = {
    id: 20,
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 50, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    hull: 40,
    hullMax: 100,
    data: {},
  };
  state.entities.set(friendlyCasualty.id, friendlyCasualty);
  state.entityList.push(friendlyCasualty);

  state.input.fireGroup = 2;
  state.input.aimAngle = 0;

  // Hold the trigger across 5 ticks
  for (let i = 0; i < 5; i++) {
    mining.update(SIM_DT, state);
    state.simTime += SIM_DT;
    state.tick += 1;
  }

  const beam = player.data.miningBeam;

  // Emits beam:denied for insufficient-resources
  assert.ok(events.denied.length >= 1, 'emits beam:denied');
  assert.equal(events.denied[0].reason, 'insufficient-resources');
  assert.equal(events.denied[0].verb, 'repair');
  assert.equal(events.denied[0].targetId, friendlyCasualty.id);

  // Announces refusal toast once across the hold
  assert.equal(events.toast.length, 1, 'refusal toast announced exactly once');
  assert.equal(events.toast[0].text, 'Need scrap or credits to weld');

  // Zero mining:start events
  assert.equal(events.start.length, 0, 'emits zero mining:start events');

  // Keeps mining._beaming === false
  assert.equal(mining._beaming, false, 'mining._beaming stays false');

  // Keeps beam.heat === 0
  assert.equal(beam.heat, 0, 'beam.heat stays 0');
});

test('negative/quiet case: transitioning from a valid target to a refused target emits mining:stop for prior target and does not start a new beam loop', () => {
  const { state, mining, events } = bootHarness(SEED);
  state.player.beamMode = 'extract';

  const validRock = {
    id: 30,
    type: 'asteroid',
    alive: true,
    pos: { x: 50, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    mass: 400,
    hull: 140,
    hullMax: 140,
    data: { typeId: 'ast_common_rock', oreHP: 140, oreHPMax: 140, commodityId: 'cmdty_silicate' },
  };
  const refusedWreck = {
    id: 31,
    type: 'wreck',
    alive: true,
    pos: { x: 0, z: 50 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 10,
    data: { respawnAt: 200 },
  };
  state.entities.set(validRock.id, validRock);
  state.entities.set(refusedWreck.id, refusedWreck);
  state.entityList.push(validRock, refusedWreck);

  state.input.fireGroup = 2;
  state.input.aimAngle = 0; // points toward validRock at (50, 0)

  // Tick 1: active on valid rock
  mining.update(SIM_DT, state);
  state.simTime += SIM_DT;
  state.tick += 1;

  assert.equal(mining._beaming, true, 'beam is active on valid rock');
  assert.equal(events.start.length, 1, 'emitted mining:start for valid rock');
  assert.equal(events.start[0].targetId, validRock.id);
  assert.equal(events.stop.length, 0, 'no stop event yet');

  // Tick 2: transition to refused target via worldObjectTargetId pointer
  state.input.worldObjectTargetId = refusedWreck.id;

  mining.update(SIM_DT, state);
  state.simTime += SIM_DT;
  state.tick += 1;

  // Emits mining:stop for the prior target
  assert.equal(events.stop.length, 1, 'emitted mining:stop for prior target');
  assert.equal(events.stop[0].targetId, validRock.id);

  // Does not start a new beam loop
  assert.equal(events.start.length, 1, 'zero new mining:start events emitted');
  assert.equal(mining._beaming, false, 'mining._beaming is false after refusal');

  // Refusal was emitted for the new target
  assert.ok(events.denied.length >= 1, 'emits beam:denied for refused target');
  assert.equal(events.denied[0].targetId, refusedWreck.id);
  assert.equal(events.denied[0].reason, 'mined-out');
});
