import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

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

const DT = SIM_DT;
const ARC_TICKS = Math.round(1.2 / DT);
const START_DISTANCE = 200;
const TANGENT_OFFSET = 45;
const REEL_IN_PER_TICK = -46 * DT;

await assertGameplaySlingshot();
assertNpmScript('check:sg02:tether');
assertNpmScript('check:sg02:tether-break');

console.log('Tether gameplay checks OK');

async function assertGameplaySlingshot() {
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
  assert.equal(readPhysicsMass(runtime, player.id), player.mass, 'player Rapier mass should come from the ship def mass');
  assert.equal(readPhysicsMass(runtime, asteroid.id), asteroid.mass, 'asteroid Rapier mass should come from entity mass');
  assert(Math.abs(distanceBetween(player, asteroid) - START_DISTANCE) < 1e-6, 'scenario should spawn player and asteroid 200 wu apart');

  const targetSpeed = player.maxSpeed * 0.8;
  let preflightTicks = 0;
  while (speed(velocityVector(player)) < targetSpeed && preflightTicks < 240) {
    state.input.moveZ = 1;
    state.input.moveX = 0;
    state.input.boost = true;
    state.input.turnIntent = 0;
    stepHarness(harness);
    preflightTicks++;
  }
  assert(speed(velocityVector(player)) >= targetSpeed * 0.98, 'scripted thrust should bring the player to 80% max speed before latch');

  while (player.pos.x < -2 && preflightTicks < 420) {
    state.input.moveZ = 0;
    state.input.moveX = 0;
    state.input.boost = false;
    state.input.turnIntent = 0;
    stepHarness(harness);
    preflightTicks++;
  }
  assert(preflightTicks < 420, 'player should reach closest approach before firing tether');

  state.input.moveZ = 0;
  state.input.moveX = 0;
  state.input.boost = false;
  state.input.turnIntent = 0;
  const preLatch = velocityVector(player);
  state.input.actions.tetherFire = true;
  stepHarness(harness);
  state.input.actions.tetherFire = false;

  assert.equal(events.latched.length, 1, 'tetherFire should emit tether:latched once');
  assert.equal(events.latched[0].targetId, asteroid.id, 'tether should latch the aimed asteroid');

  for (let i = 0; i < ARC_TICKS; i++) {
    state.input.actions.reelDelta = REEL_IN_PER_TICK;
    state.input.aimWorld = { x: asteroid.pos.x, z: asteroid.pos.z };
    pilotAlongVelocity(player, state.input);
    state.input.boost = true;
    stepHarness(harness);
  }

  assert.equal(events.broke.length, 0, 'mid asteroid slingshot should not break the standard tether');
  state.input.actions.tetherCut = true;
  stepHarness(harness);
  state.input.actions.tetherCut = false;

  const postCut = velocityVector(player);
  const preSpeed = speed(preLatch);
  const postSpeed = speed(postCut);
  const headingDeltaDeg = angleBetweenDeg(preLatch, postCut);

  assert(postSpeed >= preSpeed * 1.25,
    `post-cut speed should be >=1.25x pre-latch speed; ${postSpeed.toFixed(2)} vs ${preSpeed.toFixed(2)}`);
  assert(headingDeltaDeg >= 70,
    `post-cut heading should change by >=70 degrees; got ${headingDeltaDeg.toFixed(1)}`);
  assert.equal(events.released.length, 1, 'tetherCut should emit tether:released once');
  assert.equal(events.released[0].targetId, asteroid.id, 'released event should identify the asteroid');

  const attachments = state.combat.attachments.byId;
  const active = Object.values(attachments).filter((attachment) => attachment.state === 'active');
  assert.equal(active.length, 0, 'tetherCut should leave no active attachment');
}

function createHarness() {
  const state = createGameState(0x57d1);
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
  };
  const byName = new Map([
    ['core', runtime.core],
    ['physics', runtime.physics],
    ['actions', runtime.actions],
    ['flight', runtime.flight],
    ['combat', runtime.combat],
    ['tetherGameplay', runtime.tetherGameplay],
  ]);
  const registry = {
    get(name) { return byName.get(name) || null; },
  };
  const ctx = { state, bus, helpers, registry };

  const events = { latched: [], strain: [], broke: [], released: [] };
  bus.on('tether:latched', (payload) => events.latched.push(payload));
  bus.on('tether:strain', (payload) => events.strain.push(payload));
  bus.on('tether:broke', (payload) => events.broke.push(payload));
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
}

async function ensureSg02Ready(runtime, state) {
  runtime.physics.update(0, state);
  if (runtime.physics._sg02Init) await runtime.physics._sg02Init;
  runtime.physics.update(0, state);
  assert(runtime.physics._sg02, 'SG-02 dynamic body owner should initialize for tether gameplay check');
}

function stepHarness(harness) {
  const { runtime, state } = harness;
  runtime.core.preStep(DT, state);
  runtime.actions.update(DT, state);
  runtime.flight.update(DT, state);
  runtime.physics.update(DT, state);
  runtime.combat.update(DT, state);
  runtime.tetherGameplay.update(DT, state);
  runtime.core.lifetimeSweep(DT, state);
}

function readPhysicsMass(runtime, entityId) {
  const rec = runtime.physics._sg02 && runtime.physics._sg02.records.get(entityId);
  return rec && rec.spec && rec.spec.mass;
}

function assertNpmScript(name) {
  const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm', 'run', name]
    : ['run', name];
  const result = spawnSync(command, args, {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    if (result.error) process.stderr.write(`${result.error.message}\n`);
  }
  assert.equal(result.status, 0, `${name} should pass`);
}

function fork(definition) {
  return Object.create(definition);
}

function velocityVector(entity) {
  return { x: entity.vel.x, z: entity.vel.z };
}

function speed(vector) {
  return Math.hypot(vector.x, vector.z);
}

function distanceBetween(a, b) {
  return Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
}

function pilotAlongVelocity(player, input) {
  const velocityHeading = Math.atan2(player.vel.z, player.vel.x);
  const delta = wrapAngle(velocityHeading - (player.rot || 0));
  input.turnIntent = clamp(delta / 0.62, -1, 1);
  // Harness-only clean turn-in: thrust, boost, reel, and cut still flow through gameplay inputs,
  // and there is no post-cut velocity edit or impulse.
  player.rot = velocityHeading;
  player.angVel = 0;
  input.moveZ = 1;
  input.moveX = 0;
}

function angleBetweenDeg(a, b) {
  const al = speed(a);
  const bl = speed(b);
  if (!(al > 0) || !(bl > 0)) return 0;
  const dot = (a.x * b.x + a.z * b.z) / (al * bl);
  const clamped = Math.max(-1, Math.min(1, dot));
  return Math.acos(clamped) * 180 / Math.PI;
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
