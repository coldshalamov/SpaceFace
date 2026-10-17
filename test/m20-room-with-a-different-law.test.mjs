import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { FIELD_FLAGS, FIELD_MAX_ACCEL } from '../src/data/fields.js';
import { POWERED_CONVEYOR_RULESET, POWERED_CONVEYOR_DEMO_TICKS,
  SURVIVAL_TRIAL_BY_RULESET } from '../src/data/survivalMutators.js';
import { fields } from '../src/systems/fields.js';
import { economy } from '../src/systems/economy.js';
import { ships } from '../src/systems/ships.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { ARENA_FIELD_SLOT_IDS, ARENA_ROOM_OWNER, planArenaInstall,
  survivalArena } from '../src/systems/survivalArena.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { compileChallenge, clearQueuedChallenge } from '../src/systems/survivalMutators.js';
import { stepCinderMachinery } from '../src/systems/cinderSluiceArena.js';
import { createLawArenaDressing } from '../src/render/lawArenaDressing.js';
import { CRUCIBLE_DEFAULT_RULESET, CRUCIBLE_RULESETS, crucibleLaunchConfig, crucibleSetupFor,
  normalizeCrucibleRuleset, requestCrucibleRun, buildCrucibleRetryRequest,
  clearCrucibleSetup, lastCrucibleSetup } from '../src/ui/crucibleLaunch.js';
import { installSandboxGameStartedHook } from '../src/ui/sandbox/sandboxSetup.js';
import { crucibleScreen } from '../src/ui/screens/crucible.js';
import { mountScreen } from './helpers/fake-dom.mjs';

const SEED = 4242;
const ARENA = 'helios_core';
const ANCHOR = { x: 400, z: -120 };
const DT = 1 / 60;

test('M20 selects a registered trial through the ordinary Crucible launch and retry path', () => {
  clearQueuedChallenge();
  clearCrucibleSetup();
  assert.ok(CRUCIBLE_RULESETS.includes(POWERED_CONVEYOR_RULESET));
  assert.ok(SURVIVAL_TRIAL_BY_RULESET[POWERED_CONVEYOR_RULESET]);
  assert.equal(normalizeCrucibleRuleset(POWERED_CONVEYOR_RULESET), POWERED_CONVEYOR_RULESET);
  assert.equal(compileChallenge(SEED, [], POWERED_CONVEYOR_RULESET).trialId, POWERED_CONVEYOR_RULESET);

  const state = createGameState(SEED);
  const bus = createBus();
  const owners = { ships: Object.create(ships), economy: Object.create(economy),
    runSession: Object.create(runSession),
    world: { enterSector() {}, relocatePlayerInSector() { return true; } } };
  const ctx = { state, bus, helpers: {}, registry: { get: name => owners[name] } };
  owners.economy.init(ctx);
  owners.ships.init(ctx);
  owners.ships.newGame();
  owners.runSession.init(ctx);
  installSandboxGameStartedHook(bus, ctx);
  const setup = crucibleSetupFor({ starterId: 'ricochet_runner', seed: SEED,
    arenaId: 'cinder_sluice', ruleset: POWERED_CONVEYOR_RULESET });
  assert.equal(setup.ok, true);
  assert.equal(setup.value.arenaId, ARENA, 'one authored Foundry room');
  assert.equal(crucibleLaunchConfig(setup.value, setup.ruleset).survivalRuleset, POWERED_CONVEYOR_RULESET);
  let newGames = 0;
  bus.on('game:new', () => newGames++);
  assert.equal(requestCrucibleRun(bus, setup.value, setup.ruleset), true);
  bus.emit('game:scenePrepared', {});
  assert.equal(newGames, 1);
  assert.equal(state.run.kind, 'survival');
  assert.equal(state.run.ruleset, POWERED_CONVEYOR_RULESET);
  assert.equal(state.run.arenaId, ARENA);
  assert.equal(buildCrucibleRetryRequest().ruleset, POWERED_CONVEYOR_RULESET);
  owners.runSession.destroy();
  clearCrucibleSetup();
});

test('M20 ordinary Crucible surface launches the authored trial with a public control', () => {
  clearCrucibleSetup();
  const h = mountScreen(crucibleScreen, { ctx: { state: createGameState(SEED) } });
  const button = h.buttons.find(b => b.attributes['aria-label']?.startsWith('A room with a different law:'));
  assert.ok(button, 'the ordinary door exposes the trial');
  const previous = globalThis.document;
  globalThis.document = h.doc;
  try {
    button.click();
    assert.equal(h.emitted.filter(e => e.event === 'game:new').length, 1);
    assert.equal(lastCrucibleSetup().ruleset, POWERED_CONVEYOR_RULESET);
    assert.equal(lastCrucibleSetup().arenaId, ARENA);
  } finally {
    crucibleScreen.dispose?.();
    globalThis.document = previous;
    clearCrucibleSetup();
  }
});

function bootRoom({ ruleset = POWERED_CONVEYOR_RULESET, withPhysics = false, wave = 1 } = {}) {
  const sim = createSimulation({ seed: SEED,
    systems: withPhysics ? [survivalArena, fields, physics] : [survivalArena, fields] });
  const { state } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  const player = sim.spawn({ type: 'ship', team: 0, pos: { ...ANCHOR }, vel: { x: 0, z: 0 },
    radius: 12, mass: 28, hull: 200, hullMax: 200, rot: 0, angVel: 0, collides: true,
    physicsBody: { schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88,
      dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship' } });
  state.playerId = player.id;
  state.run = createRunState({ kind: 'survival', ruleset, seed: SEED });
  Object.assign(state.run, { phase: 'wave_intro', arenaId: ARENA, wave });
  const events = [];
  sim.bus.on('survivalArena:installed', p => events.push(p));
  const plan = planWave({ seed: SEED, arenaId: ARENA, ruleset, wave });
  sim.bus.emit('run:wavePlanned', { wave, plan });
  return { sim, state, player, events, plan, arena: sim.registry.get('survivalArena'),
    field: () => sim.registry.get('fields')._kernel.get(ARENA_FIELD_SLOT_IDS[0]) };
}

test('M20 uses the unchanged authored wave roster and introduces only the conveyor law', () => {
  for (let wave = 1; wave <= 10; wave++) {
    const args = { seed: SEED, arenaId: ARENA, wave };
    assert.deepEqual(planWave({ ...args, ruleset: POWERED_CONVEYOR_RULESET }),
      planWave({ ...args, ruleset: 'scored' }), 'no parallel combat balance');
    const h = bootRoom({ wave });
    assert.equal(h.events[0].fields, 1);
    assert.equal(h.events[0].lawId, POWERED_CONVEYOR_RULESET);
    assert.ok(h.events[0].toySpecs.some(t => t.id === 'powered_conveyor'));
    assert.ok(h.events[0].toySpecs.some(t => t.kind === 'plate'), 'reuse the bank room');
    assert.equal(h.events[0].mines, 0, 'one law, no additional hazards');
    h.arena.destroy();
    h.sim.dispose();
  }
});

test('M20 demonstration stays in wave_intro even when the ordinary intro receipt arrives early', () => {
  const sim = createSimulation({ seed: SEED, systems: [spawnBudget, runSession, survivalRun, survivalWave, survivalArena, fields] });
  sim.state.mode = 'loading';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { ...ANCHOR }, vel: { x: 0, z: 0 }, radius: 12 });
  sim.state.playerId = player.id;
  sim.bus.emit('run:beginRequested', { kind: 'survival', ruleset: POWERED_CONVEYOR_RULESET,
    seed: SEED, arenaId: ARENA });
  sim.bus.emit('run:loadoutReady', {});
  sim.bus.emit('run:openingPrepareRequested', {});
  assert.equal(sim.state.run.phase, 'wave_intro', 'loading must not skip the demonstration');
  sim.state.mode = 'flight';
  sim.bus.emit('run:waveIntroComplete', {});
  sim.runTicks(POWERED_CONVEYOR_DEMO_TICKS - 1);
  assert.equal(sim.state.run.phase, 'wave_intro');
  assert.ok(!sim.state.entityList.some(e => e.alive && e.team === 1), 'no foes during the safe demo');
  sim.step();
  assert.equal(sim.state.run.phase, 'active');
  sim.runTicks(2);
  assert.ok(sim.state.entityList.some(e => e.alive && e.team === 1), 'ordinary wave materialization runs after the demo');
  for (const name of ['survivalWave', 'survivalArena', 'survivalRun', 'runSession', 'fields']) {
    sim.registry.get(name).destroy?.();
  }
  sim.dispose();
});

test('M20 powered pulse moves the real workpiece through fields and Rapier; no rig is required', async () => {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const h = bootRoom({ withPhysics: true });
  const physicsSys = h.sim.registry.get('physics');
  try {
    assert.equal(await physicsSys.prepareBackend(h.state), true);
    const piece = h.state.entityList.find(e => e.data?.conveyorWorkpiece);
    assert.ok(piece);
    const start = { ...piece.pos };
    h.sim.runTicks(105);
    assert.ok(Math.hypot(piece.pos.x - start.x, piece.pos.z - start.z) < 0.01, 'warning is unpowered');
    h.sim.runTicks(100);
    const field = h.field();
    const moved = (piece.pos.x - start.x) * field.dir.x + (piece.pos.z - start.z) * field.dir.z;
    assert.ok(moved > 5, `real downstream travel ${moved} WU`);
    assert.ok(Math.hypot(h.player.pos.x - ANCHOR.x, h.player.pos.z - ANCHOR.z) < 0.01,
      'the starting side pocket stays safe for a stationary low-mobility build');
    assert.equal(h.player.hull, 200, 'the law adds motion, never direct damage');
  } finally {
    physicsSys._disableSg02DynamicAuthority();
    h.arena.destroy();
    h.sim.registry.get('fields').newGame();
    h.sim.dispose();
    FIELD_FLAGS.enabled = previous;
  }
});

test('M20 can carry hostiles, amplify a field rig, and leave side pockets quiet', () => {
  const h = bootRoom();
  const sounds = [];
  h.sim.bus.on('audio:cue', p => sounds.push(p));
  h.state.simTime = 3;
  h.arena.update(DT, h.state);
  h.arena.update(DT, h.state);
  assert.equal(sounds.filter(p => p.id === 'sfx_field_deploy_cone').length, 1, 'one sound per actual powered onset');
  const field = h.field();
  const pos = { x: field.center.x + field.dir.x * 200, z: field.center.z + field.dir.z * 200 };
  const profile = { type: 'ship', team: 1, id: 999, mass: 28, dynamic: true };
  const sample = (p, profile_, list = [field]) => sampleFieldAcceleration(p, { x: 0, z: 0 }, list, 3, profile_);
  const ordinary = sample(pos, profile);
  const tagged = sample(pos, { ...profile, fieldResponseMult: 2 });
  const along = a => a.ax * field.dir.x + a.az * field.dir.z;
  assert.ok(along(ordinary) > 1, 'a hostile is carried by the same law');
  assert.ok(along(tagged) > along(ordinary), 'a field-response rig exploits that same kernel');
  assert.deepEqual(sample(ANCHOR, profile), { ax: 0, az: 0 }, 'quiet side costs field reach');
  const dense = sample(pos, profile, [field, { ...field, id: 'player-cone', strength: 300 }]);
  assert.ok(Math.hypot(dense.ax, dense.az) <= FIELD_MAX_ACCEL, 'overlap uses the existing acceleration bound');
  h.state.simTime = 10;
  h.arena.update(DT, h.state);
  assert.equal(h.field().strength, 0, 'power shuts off during calm');
  assert.deepEqual(sample(pos, profile), { ax: 0, az: 0 });
  h.arena.destroy();
  h.sim.dispose();
});

test('M20 mouth uses the authoritative cycle with reduced motion, and releases its scene objects', () => {
  const h = bootRoom();
  const dressing = createLawArenaDressing();
  const scene = new THREE.Scene();
  dressing.handleInstall(h.events[0], scene);
  assert.equal(dressing.peekRoom().parts.length, 1, 'Foundry plates keep their existing body-owned visuals');
  const mouth = dressing.peekRoom().parts.find(p => p.root.name === 'law_current_mouth');
  assert.ok(mouth, 'reuse the existing solid current machinery');
  const throat = mouth.root.getObjectByName('law_mouth_throat');
  mouth.mover(0, DT, true, false);
  const warning = throat.material.emissiveIntensity;
  mouth.mover(3, DT, true, false);
  assert.ok(throat.material.emissiveIntensity > warning);
  mouth.mover(10, DT, true, false);
  assert.ok(throat.material.emissiveIntensity < warning);
  mouth.mover(3, DT, true, true);
  assert.equal(throat.material.emissiveIntensity, 0.8, 'reduced flash keeps a steady readable seam');
  dressing.handleReleased();
  assert.equal(scene.children.length, 0);
  h.arena.destroy();
  h.sim.dispose();
});

test('M20 transient law/workpiece clean up on clear, abort, new game, and load', () => {
  for (const event of ['run:waveCleared', 'run:ended', 'save:loaded']) {
    const h = bootRoom();
    h.sim.bus.emit(event, {});
    assert.equal(h.field(), null, `${event} releases the field`);
    assert.ok(!h.state.entityList.some(e => e.alive && e.data?.roomOwner === ARENA_ROOM_OWNER));
    h.arena.destroy();
    h.sim.dispose();
  }
  const h = bootRoom();
  h.arena.newGame();
  assert.equal(h.field(), null);
  assert.ok(!h.state.entityList.some(e => e.alive && e.data?.conveyorWorkpiece));
  h.sim.dispose();
});

test('M20 off leaves the standard ruleset and room unchanged, including after a trial', () => {
  assert.equal(CRUCIBLE_DEFAULT_RULESET, 'swarm');
  for (let wave = 1; wave <= 10; wave++) {
    const args = { seed: SEED, wave, arenaId: ARENA, arenaPhase: planWave({ seed: SEED, wave, arenaId: ARENA }).arenaPhase,
      anchor: ANCHOR, laneGate: 'front' };
    const baseline = planArenaInstall(args);
    planArenaInstall({ ...args, ruleset: POWERED_CONVEYOR_RULESET });
    for (const ruleset of ['scored', 'swarm', undefined]) {
      assert.deepEqual(planArenaInstall({ ...args, ruleset }), baseline);
    }
  }
  const h = bootRoom({ ruleset: 'scored' });
  assert.equal(h.events[0].lawId, null);
  assert.equal(h.field(), null);
  assert.ok(!h.state.entityList.some(e => e.data?.conveyorWorkpiece));
  h.arena.destroy();
  h.sim.dispose();
  assert.equal(stepCinderMachinery(3).phase, 'surge', 'the reused Cinder owner is unchanged');
});
