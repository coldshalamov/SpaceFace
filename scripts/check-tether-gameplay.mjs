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
await assertCursorTetherTargeting();
await assertLockedHostileTetherTargeting();
await assertNearestTetherMode();
await assertPickupMasslinePull();
await assertInitialLatchReleaseDoesNotCut();
await assertShortTapCutsAfterDelay();
await assertHeldGReelsInsteadOfCutting();
await assertTetherHelmAuthority();
await assertLoadedTetherFacesNoseInwardWhileThrusting();
await assertSlowReverseIntoTetherLimitStaysStable();
await assertReverseIntoDynamicPayloadMasslineStaysBounded();
await assertTetherCutClampsReleaseSpin();
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

  assert.equal(events.broke.length, 0, `mid asteroid slingshot should not break the standard tether: ${JSON.stringify({
    event: events.broke.at(-1) || null,
    attachments: state.combat.attachments.byId,
  })}`);
  tapCutAndWait(harness);

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

async function assertCursorTetherTargeting() {
  const harness = createHarness();
  const { state, helpers, runtime, events } = harness;

  const player = helpers.spawnEntity(makeShipEntitySpec('ship_wasp', {
    isPlayer: true,
    pos: { x: 0, z: 0 },
    rot: 0,
  }));
  state.playerId = player.id;
  const nearbyRock = helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 42, z: 0 },
    radius: 9,
    mass: 260,
    hull: 180,
    hullMax: 180,
    collides: true,
    data: { typeId: 'ast_common_rock' },
  });
  const aimedShip = helpers.spawnEntity(makeShipEntitySpec('ship_wasp', {
    pos: { x: 145, z: 46 },
    rot: Math.PI,
  }));

  initializeSystems(harness);
  await ensureSg02Ready(runtime, state);
  state.input.aimWorld = { x: aimedShip.pos.x, z: aimedShip.pos.z };
  state.input.aimAngle = Math.atan2(aimedShip.pos.z - player.pos.z, aimedShip.pos.x - player.pos.x);
  fireTetherOnce(harness);

  assert.equal(events.latched.length, 1, 'cursor-targeted tether should latch exactly once');
  assert.equal(events.latched[0].targetId, aimedShip.id,
    `cursor-targeted tether should choose the reticle ship, not the nearer rock ${nearbyRock.id}`);
}

async function assertLockedHostileTetherTargeting() {
  const harness = createHarness();
  const { state, helpers, runtime, events } = harness;

  const player = helpers.spawnEntity(makeShipEntitySpec('ship_wasp', {
    isPlayer: true,
    pos: { x: 0, z: 0 },
    rot: 0,
  }));
  state.playerId = player.id;
  const nearbyRock = helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 42, z: 0 },
    radius: 9,
    mass: 260,
    hull: 180,
    hullMax: 180,
    collides: true,
    data: { typeId: 'ast_common_rock' },
  });
  const lockedHostile = helpers.spawnEntity(makeShipEntitySpec('ship_wasp', {
    team: 1,
    pos: { x: 145, z: 46 },
    rot: Math.PI,
    ai: { fsm: 'attack' },
  }));
  lockedHostile.data.combat.targetId = player.id;

  initializeSystems(harness);
  await ensureSg02Ready(runtime, state);
  state.player.targetId = lockedHostile.id;
  state.input.aimWorld = { x: nearbyRock.pos.x, z: nearbyRock.pos.z };
  state.input.aimAngle = Math.atan2(nearbyRock.pos.z - player.pos.z, nearbyRock.pos.x - player.pos.x);
  fireTetherOnce(harness);

  assert.equal(events.latched.length, 1, 'locked-hostile tether should latch exactly once');
  assert.equal(events.latched[0].targetId, lockedHostile.id,
    `locked-hostile tether should choose the selected enemy, not the nearer rock ${nearbyRock.id}`);
}

async function assertNearestTetherMode() {
  const defaultHarness = createHarness();
  const defaultState = defaultHarness.state;
  const defaultHelpers = defaultHarness.helpers;
  const defaultRuntime = defaultHarness.runtime;
  const defaultEvents = defaultHarness.events;
  const defaultPlayer = defaultHelpers.spawnEntity(makeShipEntitySpec('ship_wasp', {
    isPlayer: true,
    pos: { x: 0, z: 0 },
    rot: 0,
  }));
  defaultState.playerId = defaultPlayer.id;
  defaultHelpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 40, z: 0 },
    radius: 9,
    mass: 260,
    hull: 180,
    hullMax: 180,
    collides: true,
    data: { typeId: 'ast_common_rock' },
  });
  initializeSystems(defaultHarness);
  await ensureSg02Ready(defaultRuntime, defaultState);
  defaultState.input.aimWorld = { x: 0, z: 180 };
  defaultState.input.aimAngle = Math.PI / 2;
  fireTetherOnce(defaultHarness);
  assert.equal(defaultEvents.latched.length, 0, 'default tether should not grab a nearby object when the reticle/ray misses');

  const nearestHarness = createHarness();
  const { state, helpers, runtime, events } = nearestHarness;
  const player = helpers.spawnEntity(makeShipEntitySpec('ship_wasp', {
    isPlayer: true,
    pos: { x: 0, z: 0 },
    rot: 0,
  }));
  state.playerId = player.id;
  const nearestRock = helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 40, z: 0 },
    radius: 9,
    mass: 260,
    hull: 180,
    hullMax: 180,
    collides: true,
    data: { typeId: 'ast_common_rock' },
  });
  initializeSystems(nearestHarness);
  await ensureSg02Ready(runtime, state);
  state.input.aimWorld = { x: 0, z: 180 };
  state.input.aimAngle = Math.PI / 2;
  state.input.tetherMode = 'nearest';
  fireTetherOnce(nearestHarness);
  assert.equal(events.latched.length, 1, 'nearest tether mode should latch when default aim misses');
  assert.equal(events.latched[0].targetId, nearestRock.id, 'nearest tether mode should choose the closest attachable object');
}

async function assertPickupMasslinePull() {
  const harness = createHarness();
  const { state, helpers, runtime, events } = harness;

  const player = helpers.spawnEntity(makeShipEntitySpec('ship_wasp', {
    isPlayer: true,
    pos: { x: 0, z: 0 },
    rot: 0,
  }));
  state.playerId = player.id;
  const pickup = helpers.spawnEntity({
    type: 'pickup',
    pos: { x: 125, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 2.2,
    collides: true,
    data: { kind: 'ore', commodityId: 'cmdty_silicate', amount: 1, despawnAt: 999 },
  });

  initializeSystems(harness);
  await ensureSg02Ready(runtime, state);
  assert.equal(readPhysicsMass(runtime, pickup.id), 0.1, 'pickup tether bodies should default to featherweight mass');

  state.input.aimWorld = { x: pickup.pos.x, z: pickup.pos.z };
  state.input.aimAngle = 0;
  fireTetherOnce(harness);
  assert.equal(events.latched.length, 1, 'cursor-targeted tether should latch a floating pickup');
  assert.equal(events.latched[0].targetId, pickup.id, 'pickup tether should identify the aimed loose material');

  const initialDistance = distanceBetween(player, pickup);
  for (let i = 0; i < 150 && pickup.alive !== false; i++) {
    state.input.actions.reelDelta = -1;
    state.input.aimWorld = { x: pickup.pos.x, z: pickup.pos.z };
    state.input.aimAngle = Math.atan2(pickup.pos.z - player.pos.z, pickup.pos.x - player.pos.x);
    state.input.moveZ = 0;
    state.input.moveX = 0;
    state.input.boost = false;
    state.input.turnIntent = 0;
    stepHarness(harness);
  }
  state.input.actions.reelDelta = 0;

  const finalDistance = distanceBetween(player, pickup);
  const brokeBeforeCollection = pickup.alive !== false && events.broke.length > 0;
  assert.equal(brokeBeforeCollection, false, 'pickup massline pull should not break before the pickup reaches collection range');
  assert(pickup.alive === false || finalDistance < initialDistance * 0.45,
    `held reel should pull loose material quickly inward; ${finalDistance.toFixed(1)} vs ${initialDistance.toFixed(1)}`);
}

async function assertHeldGReelsInsteadOfCutting() {
  const harness = createHarness();
  const { state, helpers, runtime, events } = harness;

  const player = helpers.spawnEntity(makeShipEntitySpec('ship_wasp', {
    isPlayer: true,
    pos: { x: 0, z: 0 },
    rot: 0,
  }));
  state.playerId = player.id;
  const asteroid = helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 120, z: 0 },
    radius: 12,
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
  fireTetherOnce(harness);
  releaseTetherKey(harness);
  assert.equal(events.latched.length, 1, 'held-G fixture should latch the aimed asteroid');

  const attachment = Object.values(state.combat.attachments.byId).find((a) => a.state === 'active');
  assert(attachment, 'held-G fixture should have an active attachment');
  const before = attachment.restLength;

  state.input.actions.tetherCut = true;
  state.input.actions.reelDelta = -1;
  stepHarness(harness);
  state.input.actions.tetherCut = false;
  for (let i = 0; i < 18; i++) {
    state.input.actions.reelDelta = -1;
    stepHarness(harness);
  }
  state.input.actions.reelDelta = 0;
  stepHarness(harness);

  const after = state.combat.attachments.byId[attachment.id];
  assert(after && after.state === 'active', 'releasing G after a connected hold should keep the massline attached');
  assert.equal(events.released.length, 0, 'holding G while tethered should not emit a release');
  assert(after.restLength < before,
    `holding G should reel inward instead of cutting; restLength ${before.toFixed(2)} -> ${after.restLength.toFixed(2)}`);
}

async function assertInitialLatchReleaseDoesNotCut() {
  const harness = createHarness();
  const { state, helpers, runtime, events } = harness;

  const player = helpers.spawnEntity(makeShipEntitySpec('ship_wasp', {
    isPlayer: true,
    pos: { x: 0, z: 0 },
    rot: 0,
  }));
  state.playerId = player.id;
  const asteroid = helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 120, z: 0 },
    radius: 12,
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
  state.input.actions = {
    ...(state.input.actions || {}),
    tetherFire: true,
    tetherCut: false,
    reelDelta: 0,
  };
  stepHarness(harness);
  state.input.actions.tetherFire = false;
  for (let i = 0; i < 5; i++) {
    state.input.actions.reelDelta = -1;
    stepHarness(harness);
  }
  state.input.actions.reelDelta = 0;
  stepHarness(harness);

  assert.equal(events.latched.length, 1, 'initial latch-release fixture should latch the aimed asteroid');
  assert.equal(events.released.length, 0, 'releasing the original latch press should not cut the new tether');
  assert(state.player.tether && state.player.tether.active, 'initial latch-release fixture should remain tethered after key release');
}

async function assertShortTapCutsAfterDelay() {
  const harness = createHarness();
  const { state, helpers, runtime, events } = harness;

  const player = helpers.spawnEntity(makeShipEntitySpec('ship_wasp', {
    isPlayer: true,
    pos: { x: 0, z: 0 },
    rot: 0,
  }));
  state.playerId = player.id;
  const asteroid = helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 120, z: 0 },
    radius: 12,
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
  fireTetherOnce(harness);
  releaseTetherKey(harness);
  assert.equal(events.latched.length, 1, 'short-tap fixture should latch the aimed asteroid');

  const attachment = Object.values(state.combat.attachments.byId).find((a) => a.state === 'active');
  assert(attachment, 'short-tap fixture should have an active attachment before cutting');

  state.input.actions.tetherCut = true;
  state.input.actions.reelDelta = -1;
  stepHarness(harness);
  state.input.actions.tetherCut = false;
  for (let i = 0; i < 5; i++) {
    state.input.actions.reelDelta = -1;
    stepHarness(harness);
  }
  for (let i = 0; i < 14; i++) {
    state.input.actions.reelDelta = 0;
    stepHarness(harness);
  }

  const after = state.combat.attachments.byId[attachment.id];
  assert(after && after.state === 'broken', 'a short G tap while tethered should cut after the tap/hold grace window');
  assert.equal(events.released.length, 1, 'short G tap should emit a release exactly once');
  assert.equal(events.released[0].targetId, asteroid.id, 'short G tap release should identify the tether target');
}

async function assertTetherHelmAuthority() {
  const harness = createHarness();
  const { state, helpers, runtime, events } = harness;

  const player = helpers.spawnEntity(makeShipEntitySpec('ship_wasp', {
    isPlayer: true,
    pos: { x: 0, z: 0 },
    rot: 0,
  }));
  state.playerId = player.id;
  const asteroid = helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 95, z: 0 },
    radius: 12,
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
  fireTetherOnce(harness);
  assert.equal(events.latched.length, 1, 'helm-authority fixture should latch the aimed asteroid');

  for (let i = 0; i < 36; i++) {
    state.input.actions.reelDelta = -1;
    state.input.turnIntent = 0;
    state.input.moveZ = 0;
    state.input.moveX = 0;
    state.input.boost = false;
    stepHarness(harness);
  }
  assert(state.player.tether && state.player.tether.active, 'helm-authority fixture should keep an active tether');
  assert.notEqual(state.player.tether.phase, 'slack', 'helm-authority fixture should load the tether before steering');

  const beforeRot = player.rot || 0;
  let helmAuthoritySeen = false;
  for (let i = 0; i < 72; i++) {
    state.input.actions.reelDelta = 0;
    state.input.turnIntent = 1;
    state.input.moveZ = 1;
    state.input.moveX = 0;
    state.input.boost = false;
    stepHarness(harness);
    helmAuthoritySeen = helmAuthoritySeen || !!(player._flightFrame && player._flightFrame.tetherHelmAuthority > 1);
  }

  const yawDelta = positiveAngleDelta(player.rot || 0, beforeRot);
  assert.equal(events.broke.length, 0, 'tether helm steering should not break the standard tether');
  assert(helmAuthoritySeen,
    'Flight V3 should apply a tether-only helm authority multiplier while the line is loaded');
  assert(yawDelta > 0.32,
    `loaded tether should still allow meaningful pilot yaw; got ${yawDelta.toFixed(3)} rad`);
}

async function assertLoadedTetherFacesNoseInwardWhileThrusting() {
  const harness = createHarness();
  const { state, helpers, runtime, events } = harness;

  const player = helpers.spawnEntity(makeShipEntitySpec('ship_wasp', {
    isPlayer: true,
    pos: { x: 0, z: 0 },
    rot: Math.PI,
  }));
  state.playerId = player.id;
  const asteroid = helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 95, z: 0 },
    radius: 12,
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
  fireTetherOnce(harness);
  assert.equal(events.latched.length, 1, 'nose-inward fixture should latch the aimed asteroid');

  for (let i = 0; i < 36; i++) {
    state.input.actions.reelDelta = -1;
    state.input.turnIntent = 0;
    state.input.moveZ = 0;
    state.input.moveX = 0;
    state.input.boost = false;
    stepHarness(harness);
  }
  assert(state.player.tether && state.player.tether.active, 'nose-inward fixture should keep an active tether');
  assert.notEqual(state.player.tether.phase, 'slack', 'nose-inward fixture should load the tether before steering');

  setBodyYaw(runtime, player, Math.PI, 0);
  const beforeError = Math.abs(wrapAngle(Math.atan2(asteroid.pos.z - player.pos.z, asteroid.pos.x - player.pos.x) - player.rot));
  let bestError = beforeError;
  let assistSeen = false;
  for (let i = 0; i < 72; i++) {
    state.input.actions.reelDelta = 0;
    state.input.turnIntent = 0;
    state.input.moveZ = 1;
    state.input.moveX = 0;
    state.input.boost = false;
    stepHarness(harness);
    const err = Math.abs(wrapAngle(Math.atan2(asteroid.pos.z - player.pos.z, asteroid.pos.x - player.pos.x) - player.rot));
    bestError = Math.min(bestError, err);
    assistSeen = assistSeen || !!(player._flightFrame && player._flightFrame.tetherNoseAssist);
  }
  assert(assistSeen,
    'Flight V3 should engage nose-inward tether assist when a loaded line is held without manual yaw');
  assert(bestError < beforeError * 0.45,
    `loaded tether thrust should turn the nose inward; best error ${beforeError.toFixed(3)} -> ${bestError.toFixed(3)} rad`);
}

async function assertSlowReverseIntoTetherLimitStaysStable() {
  const harness = createHarness();
  const { state, helpers, runtime, events } = harness;
  state.settings.controls.flightMode = 'assisted';

  const player = helpers.spawnEntity(makeShipEntitySpec('ship_wasp', {
    isPlayer: true,
    pos: { x: 0, z: 0 },
    rot: 0.55,
  }));
  state.playerId = player.id;
  const asteroid = helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 120, z: 0 },
    radius: 12,
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
  fireTetherOnce(harness);
  assert.equal(events.latched.length, 1, 'slow-reverse fixture should latch the aimed asteroid');

  let maxYawRate = 0;
  let maxSpeed = 0;
  for (let i = 0; i < 240; i++) {
    state.input.actions.reelDelta = 0;
    state.input.turnIntent = 0;
    state.input.moveZ = -0.28;
    state.input.moveX = 0;
    state.input.boost = false;
    stepHarness(harness);
    maxYawRate = Math.max(maxYawRate, Math.abs(readBodyYawRate(runtime, player.id)), Math.abs(player.angVel || 0));
    maxSpeed = Math.max(maxSpeed, speed(velocityVector(player)));
  }

  const facingError = Math.abs(wrapAngle(Math.atan2(asteroid.pos.z - player.pos.z, asteroid.pos.x - player.pos.x) - player.rot));
  assert.equal(events.broke.length, 0, 'slow reverse into a taut tether should not break the standard tether');
  assert(state.player.tether && state.player.tether.active, 'slow reverse fixture should keep an active tether');
  assert(maxYawRate <= 5.35,
    `slow reverse into line limit should not top-spin; max yaw ${maxYawRate.toFixed(3)} rad/s`);
  assert(maxSpeed < 180,
    `slow reverse into line limit should not fling the ship into space; max speed ${maxSpeed.toFixed(1)} wu/s`);
  assert(facingError < Math.PI * 0.72,
    `loaded tether should not settle facing away from the anchor; error ${facingError.toFixed(3)} rad`);

  let reverseMaxYawRate = 0;
  let reverseMaxSpeed = 0;
  for (let i = 0; i < 150; i++) {
    state.input.actions.reelDelta = 0;
    state.input.turnIntent = 0;
    state.input.moveZ = -1;
    state.input.moveX = 0;
    state.input.boost = false;
    stepHarness(harness);
    reverseMaxYawRate = Math.max(reverseMaxYawRate, Math.abs(readBodyYawRate(runtime, player.id)), Math.abs(player.angVel || 0));
    reverseMaxSpeed = Math.max(reverseMaxSpeed, speed(velocityVector(player)));
  }

  assert.equal(events.broke.length, 0, 'full reverse while tethered should not break the standard tether');
  assert(reverseMaxYawRate <= 5.35,
    `full reverse while tethered should not top-spin; max yaw ${reverseMaxYawRate.toFixed(3)} rad/s`);
  assert(reverseMaxSpeed < 230,
    `full reverse while tethered should not fling the ship into space; max speed ${reverseMaxSpeed.toFixed(1)} wu/s`);
}

async function assertReverseIntoDynamicPayloadMasslineStaysBounded() {
  const harness = createHarness();
  const { state, helpers, runtime, events } = harness;
  state.settings.controls.flightMode = 'newtonian';

  const player = helpers.spawnEntity(makeShipEntitySpec('ship_wasp', {
    isPlayer: true,
    pos: { x: 0, z: 0 },
    rot: 0,
  }));
  state.playerId = player.id;
  const payload = helpers.spawnEntity({
    type: 'payload',
    alive: true,
    collides: false,
    radius: 8,
    mass: 120,
    flightModel: { inertia: 180 },
    pos: { x: 96, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    hull: 120,
    hullMax: 120,
    team: 0,
    data: {
      tetherPayload: true,
      combatProfileId: 'combat_profile_tether_payload',
    },
  });

  initializeSystems(harness);
  await ensureSg02Ready(runtime, state);
  assert.equal(isPhysicsDynamic(runtime, payload.id), true, 'reverse-edge payload fixture should use a dynamic SG-02 target');

  state.input.aimWorld = { x: payload.pos.x, z: payload.pos.z };
  state.input.aimAngle = 0;
  fireTetherOnce(harness);
  assert.equal(events.latched.length, 1, 'dynamic payload reverse-edge fixture should latch');

  let maxYawRate = 0;
  let maxPlayerSpeed = 0;
  let maxPayloadSpeed = 0;
  for (let i = 0; i < 420; i++) {
    state.input.actions.reelDelta = 0;
    state.input.turnIntent = 0;
    state.input.moveZ = -0.38;
    state.input.moveX = 0;
    state.input.boost = false;
    stepHarness(harness);
    maxYawRate = Math.max(maxYawRate, Math.abs(readBodyYawRate(runtime, player.id)), Math.abs(player.angVel || 0));
    maxPlayerSpeed = Math.max(maxPlayerSpeed, speed(velocityVector(player)));
    maxPayloadSpeed = Math.max(maxPayloadSpeed, speed(velocityVector(payload)));
  }

  assert.equal(events.broke.length, 0, 'slow reverse into a dynamic payload tether should not break the standard tether');
  assert(state.player.tether && state.player.tether.active, 'dynamic payload reverse-edge fixture should keep an active tether');
  assert(maxYawRate <= 5.35,
    `dynamic payload reverse-edge should not top-spin; max yaw ${maxYawRate.toFixed(3)} rad/s`);
  assert(maxPlayerSpeed < 245,
    `dynamic payload reverse-edge should not fling the ship; max player speed ${maxPlayerSpeed.toFixed(1)} wu/s`);
  assert(maxPayloadSpeed < 245,
    `dynamic payload reverse-edge should not fling the payload; max payload speed ${maxPayloadSpeed.toFixed(1)} wu/s`);
}

async function assertTetherCutClampsReleaseSpin() {
  const harness = createHarness();
  const { state, helpers, runtime, events } = harness;

  const player = helpers.spawnEntity(makeShipEntitySpec('ship_wasp', {
    isPlayer: true,
    pos: { x: 0, z: 0 },
    rot: 0,
  }));
  state.playerId = player.id;
  const asteroid = helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 90, z: 0 },
    radius: 12,
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
  fireTetherOnce(harness);
  assert.equal(events.latched.length, 1, 'release-spin fixture should latch the aimed asteroid');

  for (let i = 0; i < 36; i++) {
    state.input.actions.reelDelta = -1;
    state.input.turnIntent = 0;
    state.input.moveZ = 0;
    state.input.moveX = 0;
    state.input.boost = false;
    stepHarness(harness);
  }
  assert(state.player.tether && state.player.tether.active, 'release-spin fixture should keep an active tether');
  assert.notEqual(state.player.tether.phase, 'slack', 'release-spin fixture should load the tether before cut');

  setBodyYaw(runtime, player, player.rot || 0, 18);
  state.input.actions.reelDelta = 0;
  state.input.turnIntent = 0;
  state.input.moveZ = 0;
  state.input.moveX = 0;
  state.input.boost = false;
  tapCutAndWait(harness);

  const bodyYawRate = readBodyYawRate(runtime, player.id);
  assert.equal(events.released.length, 1, 'release-spin fixture should release exactly once');
  assert(Math.abs(player.angVel || 0) <= 3.45,
    `tether cut should clamp entity yaw instead of leaving top-spin; got ${Number(player.angVel || 0).toFixed(3)} rad/s`);
  assert(Math.abs(bodyYawRate) <= 3.45,
    `tether cut should clamp Rapier body yaw; got ${bodyYawRate.toFixed(3)} rad/s`);
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
  state.input.tetherMode = null;
}

function releaseTetherKey(harness) {
  const { state } = harness;
  state.input.actions.tetherFire = false;
  state.input.actions.tetherCut = false;
  state.input.actions.reelDelta = 0;
  stepHarness(harness);
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

function readPhysicsMass(runtime, entityId) {
  const rec = runtime.physics._sg02 && runtime.physics._sg02.records.get(entityId);
  return rec && rec.spec && rec.spec.mass;
}

function isPhysicsDynamic(runtime, entityId) {
  const rec = runtime.physics._sg02 && runtime.physics._sg02.records.get(entityId);
  return !!(rec && rec.spec && rec.spec.dynamic);
}

function setBodyYaw(runtime, entity, yaw, yawRate) {
  entity.rot = yaw;
  entity.angVel = yawRate;
  const rec = runtime.physics._sg02 && runtime.physics._sg02.records.get(entity.id);
  assert(rec && rec.body, 'fixture should have a live Rapier body for the player');
  rec.body.setRotation(quatFromYaw(yaw), true);
  rec.body.setAngvel({ x: 0, y: yawRate, z: 0 }, true);
}

function readBodyYawRate(runtime, entityId) {
  const rec = runtime.physics._sg02 && runtime.physics._sg02.records.get(entityId);
  assert(rec && rec.body, 'fixture should have a live Rapier body for yaw-rate readback');
  const w = rec.body.angvel();
  return Number.isFinite(w && w.y) ? w.y : 0;
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
  // and the production cut impulse is center-of-mass only, not an off-center spin injection.
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

function positiveAngleDelta(next, previous) {
  let x = (next - previous) % (Math.PI * 2);
  if (x < 0) x += Math.PI * 2;
  return x;
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function quatFromYaw(yaw) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}
