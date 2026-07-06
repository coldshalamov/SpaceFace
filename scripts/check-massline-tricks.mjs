import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { core } from '../src/core/coreSystem.js';
import { physics } from '../src/core/physics.js';
import { SIM_DT } from '../src/core/sim.js';
import { actions } from '../src/systems/actions.js';
import { combat } from '../src/systems/combat.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { createMasslineRuntime, stepMassline } from '../src/core/constraints/masslineController.js';
import { masslineTricks, compareClassification } from '../src/systems/masslineTricks.js';

const DT = SIM_DT;
const ARC_TICKS = Math.round(1.2 / DT);
const START_DISTANCE = 200;
const TANGENT_OFFSET = 45;
const REEL_IN_PER_TICK = -46 * DT;

await assertGoodSlingshotReleaseRated();
await assertPoorRadialCutRatesWorse();
await assertBattleHardeningResistsManeuverYank();
await assertNoPhysicsMutation();
await assertIdleWithoutTether();

console.log('Massline tricks checks OK');

async function assertGoodSlingshotReleaseRated() {
  const harness = createHarness();
  const { state, helpers, runtime, events } = harness;

  const startX = -Math.sqrt(START_DISTANCE * START_DISTANCE - TANGENT_OFFSET * TANGENT_OFFSET);
  const player = helpers.spawnEntity(makeShipEntitySpec('ship_wasp', {
    isPlayer: true,
    pos: { x: startX, z: -TANGENT_OFFSET },
    rot: 0,
  }));
  state.playerId = player.id;
  const asteroid = helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 0, z: 0 },
    radius: 11,
    mass: 640,
    hull: 360,
    hullMax: 360,
    collides: true,
    data: { typeId: 'ast_common_rock', oreHP: 360, oreHPMax: 360, yieldU: 12 },
  });

  player.boost.energy = player.boost.max;
  state.input.actions = { tetherFire: false, tetherCut: false, reelDelta: 0 };
  state.input.aimWorld = { x: asteroid.pos.x, z: asteroid.pos.z };
  state.input.aimAngle = 0;
  state.input.moveX = 0;
  state.input.moveZ = 1;
  state.input.boost = true;

  initializeSystems(harness);
  await ensureSg02Ready(runtime, state);

  const targetSpeed = player.maxSpeed * 0.8;
  let preflightTicks = 0;
  while (speed(player.vel) < targetSpeed && preflightTicks < 240) {
    state.input.moveZ = 1;
    state.input.moveX = 0;
    state.input.boost = true;
    state.input.turnIntent = 0;
    stepHarness(harness);
    preflightTicks++;
  }

  while (player.pos.x < -2 && preflightTicks < 420) {
    state.input.moveZ = 0;
    state.input.moveX = 0;
    state.input.boost = false;
    state.input.turnIntent = 0;
    stepHarness(harness);
    preflightTicks++;
  }

  state.input.moveZ = 0;
  state.input.moveX = 0;
  state.input.boost = false;
  state.input.turnIntent = 0;
  state.input.actions.tetherFire = true;
  stepHarness(harness);
  state.input.actions.tetherFire = false;
  assert.equal(events.latched.length, 1, 'good-cut fixture should latch once');

  for (let i = 0; i < ARC_TICKS; i++) {
    state.input.actions.reelDelta = REEL_IN_PER_TICK;
    state.input.aimWorld = { x: asteroid.pos.x, z: asteroid.pos.z };
    pilotAlongVelocity(player, state.input);
    state.input.boost = true;
    stepHarness(harness);
  }

  tapCutAndWait(harness);

  assert.equal(events.releaseRated.length, 1, 'good slingshot cut should emit tether:releaseRated exactly once');
  const rated = events.releaseRated[0];
  assert.equal(rated.targetId, asteroid.id, 'release rating should identify the asteroid');
  assert(compareClassification(rated.classification, 'good') >= 0,
    `good slingshot cut should rate at least good; got ${rated.classification} (${rated.releaseScore})`);
  assert(rated.tangentialSpeed > Math.abs(rated.radialSpeed) * 0.45,
    `good cut should favor tangential release; tangential=${rated.tangentialSpeed.toFixed(2)} radial=${rated.radialSpeed.toFixed(2)}`);
  assert(rated.maxStrain >= 0, 'release rating should include maxStrain');
  assert(rated.playerSpeed > 0, 'release rating should include playerSpeed');
}

async function assertPoorRadialCutRatesWorse() {
  const harness = createHarness();
  const { state, helpers, runtime, events } = harness;

  const player = helpers.spawnEntity(makeShipEntitySpec('ship_wasp', {
    isPlayer: true,
    pos: { x: -140, z: 0 },
    vel: { x: 95, z: 0 },
    rot: 0,
  }));
  state.playerId = player.id;
  const asteroid = helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 0, z: 0 },
    radius: 11,
    mass: 640,
    hull: 360,
    hullMax: 360,
    collides: true,
    data: { typeId: 'ast_common_rock' },
  });

  initializeSystems(harness);
  await ensureSg02Ready(runtime, state);

  state.input.aimWorld = { x: asteroid.pos.x, z: asteroid.pos.z };
  state.input.aimAngle = 0;
  state.input.moveZ = 1;
  state.input.moveX = 0;
  state.input.boost = true;
  state.input.turnIntent = 0;
  fireTetherOnce(harness);

  for (let i = 0; i < 24; i++) {
    state.input.actions.reelDelta = -1;
    state.input.moveZ = 1;
    state.input.moveX = 0;
    state.input.boost = true;
    state.input.turnIntent = 0;
    stepHarness(harness);
  }

  tapCutAndWait(harness);

  assert.equal(events.releaseRated.length, 1, 'poor radial cut should emit tether:releaseRated exactly once');
  const rated = events.releaseRated[0];
  assert.equal(rated.targetId, asteroid.id, 'poor radial rating should identify the asteroid');
  assert(compareClassification(rated.classification, 'good') < 0,
    `deliberate radial cut should classify worse than good; got ${rated.classification} (${rated.releaseScore})`);
  assert(Math.abs(rated.radialSpeed) > rated.tangentialSpeed * 0.55,
    `poor cut should be radial-dominant; tangential=${rated.tangentialSpeed.toFixed(2)} radial=${rated.radialSpeed.toFixed(2)}`);
}

function assertBattleHardeningResistsManeuverYank() {
  const def = {
    maxTension: 420000,
    maxImpulse: 7600,
    maxYank: 380,
    overloadGraceS: 0.22,
    catastrophicRatio: 1.75,
  };
  let runtime = createMasslineRuntime(def);

  for (let i = 0; i < 90; i++) {
    const result = stepMassline({
      dt: DT,
      def,
      runtime,
      telemetry: {
        attachmentId: 'battle_tether',
        restLength: 80,
        distance: 96,
        tension: 92000,
        impulse: 1500,
        yank: 290,
      },
      command: { reel: 0, hold: true },
    });
    runtime = result.runtime;
    assert.equal(result.action.cut, false,
      `loaded battle tether should not snap on maneuver yank; tick=${i} overload=${result.telemetry.overloadRatio.toFixed(3)}`);
  }

  let snapped = false;
  for (let i = 0; i < 24; i++) {
    const result = stepMassline({
      dt: DT,
      def,
      runtime,
      telemetry: {
        attachmentId: 'battle_tether',
        restLength: 80,
        distance: 96,
        tension: 430000,
        impulse: 9200,
        yank: 1400,
      },
      command: {},
    });
    runtime = result.runtime;
    if (result.action.cut) {
      snapped = true;
      break;
    }
  }
  assert(snapped, 'catastrophic authored overload should still break a hardened tether');
}

async function assertNoPhysicsMutation() {
  const harness = createHarness();
  const { state, helpers, runtime } = harness;

  const player = helpers.spawnEntity(makeShipEntitySpec('ship_wasp', {
    isPlayer: true,
    pos: { x: 0, z: 0 },
    rot: 0,
  }));
  state.playerId = player.id;
  const asteroid = helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 110, z: 0 },
    radius: 11,
    mass: 640,
    hull: 360,
    hullMax: 360,
    collides: true,
    data: { typeId: 'ast_common_rock' },
  });

  initializeSystems(harness);
  await ensureSg02Ready(runtime, state);
  fireTetherOnce(harness);

  for (let i = 0; i < 18; i++) {
    state.input.actions.reelDelta = -1;
    stepHarness(harness);
  }

  const before = snapshotEntities(state);
  runtime.masslineTricks.update(DT, state);
  const after = snapshotEntities(state);

  assert.deepEqual(after, before, 'masslineTricks.update must not mutate entity pos/vel/rot/angVel');
}

async function assertIdleWithoutTether() {
  const harness = createHarness();
  const { state, helpers, runtime, events } = harness;

  const player = helpers.spawnEntity(makeShipEntitySpec('ship_wasp', {
    isPlayer: true,
    pos: { x: 0, z: 0 },
    rot: 0,
  }));
  state.playerId = player.id;

  initializeSystems(harness);
  await ensureSg02Ready(runtime, state);

  for (let i = 0; i < 30; i++) {
    stepHarness(harness);
  }

  assert.equal(events.releaseRated.length, 0, 'idle flight without tether should not emit release ratings');
  assert.equal(state.player.masslineTricks?.active, false, 'masslineTricks runtime should stay inactive without tether');
}

function createHarness() {
  const state = createGameState(0x57d2);
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.controls.flightMode = 'newtonian';
  state.entities.clear();
  state.entityList.length = 0;
  state.nextEntityId = 1;
  state.freeIds.length = 0;

  const bus = createBus();
  const helpers = {};
  const runtime = {
    core: fork(core),
    physics: fork(physics),
    actions: fork(actions),
    flight: fork(flightV3),
    combat: fork(combat),
    tetherGameplay: fork(tetherGameplay),
    masslineTricks: fork(masslineTricks),
  };
  const byName = new Map([
    ['core', runtime.core],
    ['physics', runtime.physics],
    ['actions', runtime.actions],
    ['flight', runtime.flight],
    ['combat', runtime.combat],
    ['tetherGameplay', runtime.tetherGameplay],
    ['masslineTricks', runtime.masslineTricks],
  ]);
  const registry = {
    get(name) { return byName.get(name) || null; },
  };
  const ctx = { state, bus, helpers, registry };

  const events = { latched: [], releaseRated: [], released: [] };
  bus.on('tether:latched', (payload) => events.latched.push(payload));
  bus.on('tether:releaseRated', (payload) => events.releaseRated.push(payload));
  bus.on('tether:released', (payload) => events.released.push(payload));

  runtime.core.init(ctx);
  return { state, bus, helpers, registry, runtime, ctx, events };
}

function initializeSystems(harness) {
  const { runtime, ctx } = harness;
  runtime.physics.init(ctx);
  runtime.actions.init(ctx);
  runtime.flight.init(ctx);
  runtime.combat.init(ctx);
  runtime.tetherGameplay.init(ctx);
  runtime.masslineTricks.init(ctx);
}

async function ensureSg02Ready(runtime, state) {
  runtime.physics.update(0, state);
  if (runtime.physics._sg02Init) await runtime.physics._sg02Init;
  runtime.physics.update(0, state);
  assert(runtime.physics._sg02, 'SG-02 dynamic body owner should initialize for massline tricks check');
}

function stepHarness(harness) {
  const { runtime, state } = harness;
  runtime.core.preStep(DT, state);
  runtime.actions.update(DT, state);
  runtime.flight.update(DT, state);
  runtime.physics.update(DT, state);
  runtime.combat.update(DT, state);
  runtime.tetherGameplay.update(DT, state);
  runtime.masslineTricks.update(DT, state);
  runtime.core.lifetimeSweep(DT, state);
}

function fireTetherOnce(harness) {
  const { state } = harness;
  state.input.moveZ = 0;
  state.input.moveX = 0;
  state.input.boost = false;
  state.input.turnIntent = 0;
  state.input.actions = {
    ...(state.input.actions || {}),
    tetherFire: true,
    tetherCut: false,
    reelDelta: 0,
  };
  stepHarness(harness);
  state.input.actions.tetherFire = false;
}

function tapCutAndWait(harness) {
  const { state } = harness;
  state.input.actions.tetherCut = true;
  state.input.actions.reelDelta = 0;
  stepHarness(harness);
  state.input.actions.tetherCut = false;
  for (let i = 0; i < 15; i++) {
    state.input.actions.reelDelta = 0;
    stepHarness(harness);
  }
}

function snapshotEntities(state) {
  const out = [];
  for (const entity of state.entityList) {
    out.push({
      id: entity.id,
      pos: { x: entity.pos.x, z: entity.pos.z },
      vel: { x: entity.vel.x, z: entity.vel.z },
      rot: entity.rot || 0,
      angVel: entity.angVel || 0,
    });
  }
  out.sort((a, b) => a.id - b.id);
  return out;
}

function fork(definition) {
  return Object.create(definition);
}

function speed(vel) {
  return Math.hypot(vel.x, vel.z);
}

function pilotAlongVelocity(player, input) {
  const velocityHeading = Math.atan2(player.vel.z, player.vel.x);
  const delta = wrapAngle(velocityHeading - (player.rot || 0));
  input.turnIntent = clamp(delta / 0.62, -1, 1);
  player.rot = velocityHeading;
  player.angVel = 0;
  input.moveZ = 1;
  input.moveX = 0;
}

function wrapAngle(value) {
  let x = value % (Math.PI * 2);
  if (x <= -Math.PI) x += Math.PI * 2;
  if (x > Math.PI) x -= Math.PI * 2;
  return x;
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}