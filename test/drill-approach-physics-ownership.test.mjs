import assert from 'node:assert/strict';
import test from 'node:test';

import { createAttachmentService } from '../src/combat/attachments.js';
import { createBus } from '../src/core/eventBus.js';
import { entityLocalPointToWorld } from '../src/combat/geometry.js';
import { consumePhysicsCommand, writePhysicsControl } from '../src/core/physicsAuthority.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';

const DT = 1 / 60;
const DRILL_CLEARANCE_WU = 12;

test('drill approach uses attachment authority plus one additive bounded impulse and completes once settled', () => {
  const h = harness({ targetAnchorLocal: { x: 16, z: 0 } });
  const before = motionSnapshot(h.player);
  const restBefore = h.line.restLength;
  const control = writePhysicsControl(h.player, {
    mode: 'player',
    force: { x: 9, y: 0, z: -4 },
    torque: { x: 0, y: 2, z: 0 },
    source: 'existing-flight-control',
  });

  h.bus.emit('drill:approachRequested', request(h));
  h.bus.emit('drill:approachRequested', request(h));
  tick(h);

  const command = consumePhysicsCommand(h.player);
  const reelRate = h.attachments.reelPolicy(h.line.id).reelRate;
  assert.equal(h.events.started.length, 1, 'duplicate requests enter one approach');
  assert.equal(h.events.cancelled.length, 0);
  assert.deepEqual(command.control, control, 'drill assistance never replaces Flight V3 control');
  assert.equal(command.impulses.length, 1, 'one assistance impulse is added for this fixed tick');
  assert.ok(Math.hypot(command.impulses[0].x, command.impulses[0].z)
    <= 90 * h.player.physicsBody.mass * DT + 1e-9, 'approach acceleration has a fixed impulse cap');
  assert.equal(h.physics.reels.length, 1, 'the attachment service sends the reel command to physics');
  assert.equal(h.physics.reels[0].attachmentId, h.line.id);
  assert.ok(restBefore - h.line.restLength > 0);
  assert.ok(restBefore - h.line.restLength <= reelRate * DT + 1e-9,
    'the canonical reel service rate-bounds each approach tick');
  assert.deepEqual(motionSnapshot(h.player), before,
    'the gameplay owner queues physics work; it does not directly rewrite player motion');

  settleAtDrillSurface(h);
  const settledPose = motionSnapshot(h.player);
  for (let i = 0; i < 100 && h.events.completed.length === 0; i++) {
    tick(h);
    consumePhysicsCommand(h.player);
  }

  assert.equal(h.events.completed.length, 1, 'completion waits until the line and relative motion settle');
  assert.equal(h.events.cancelled.length, 0);
  assert.deepEqual(motionSnapshot(h.player), settledPose,
    'settling still leaves pose and velocity to the physics owner');
  const sourceWorld = entityLocalPointToWorld(h.player, h.line.sourceAnchorLocal);
  const targetWorld = entityLocalPointToWorld(h.asteroid, h.line.targetAnchorLocal);
  const endpointDistance = Math.hypot(sourceWorld.x - targetWorld.x, sourceWorld.z - targetWorld.z);
  assert.ok(h.line.targetAnchorLocal.x > 15.9, 'fixture preserves a far-side saved asteroid anchor');
  assert.ok(Math.abs(h.line.restLength - 52) <= 0.25,
    'a radius-16 far-side anchor needs 52 WU at the 36 WU hull-gap center pose');
  assert.ok(Math.abs(h.line.restLength - endpointDistance) <= 0.25,
    'completion requires the exact rotated endpoint length rather than radial-anchor shorthand');
  tick(h);
  assert.equal(h.events.completed.length, 1, 'the terminal event cannot repeat on later ticks');
  assert.equal(h.system._ignoreReleaseCutUntilReelIdle, false,
    'a terminal approach restores normal tether cut handling');
});

for (const { name, breakApproach, reason } of [
  {
    name: 'the attachment breaks',
    breakApproach(h) { h.attachments.breakAttachment(h.line.id, 'test_break', h.player.id); },
    reason: 'test_break',
  },
  {
    name: 'the asteroid dies',
    breakApproach(h) { h.asteroid.alive = false; tick(h); },
    reason: 'target_lost',
  },
  {
    name: 'a save load resets the tether owner',
    breakApproach(h) { h.bus.emit('save:loaded'); },
    reason: 'save_loaded',
  },
]) {
  test(`drill approach cancels exactly once when ${name}`, () => {
    const h = harness();
    h.bus.emit('drill:approachRequested', request(h));
    tick(h);
    assert.equal(h.events.started.length, 1);

    breakApproach(h);
    assert.equal(h.events.cancelled.length, 1);
    assert.equal(h.events.cancelled[0].reason, reason);
    assert.equal(h.events.completed.length, 0);
    assert.equal(h.system._ignoreReleaseCutUntilReelIdle, false);

    tick(h);
    assert.equal(h.events.cancelled.length, 1, 'terminal cancellation is not repeated');
    assert.equal(h.events.completed.length, 0);
  });
}

function harness({ targetAnchorLocal = { x: -16, z: 0 } } = {}) {
  const player = entity('player', 'ship', 0, 0, {
    radius: 8,
    mass: 40,
    vel: { x: 11, z: -4 },
    physicsBody: { dynamic: true, mass: 40 },
  });
  const asteroid = entity('asteroid', 'asteroid', 120, 0, {
    radius: 16,
    mass: 640,
    physicsBody: { dynamic: false, mass: 640 },
  });
  const entities = new Map([[player.id, player], [asteroid.id, asteroid]]);
  const state = {
    mode: 'flight',
    tick: 100,
    simTime: 5,
    playerId: player.id,
    player: {},
    input: {
      aimWorld: { x: asteroid.pos.x, z: asteroid.pos.z },
      aimAngle: 0,
      moveX: 0,
      moveZ: 0,
      turnIntent: 0,
      tetherMode: null,
      actions: { tetherFire: false, tetherCut: false, reelDelta: 0, massline: null },
    },
    runtime: { features: {} },
    world: { currentSectorId: 'test-sector' },
    entities,
    entityList: [...entities.values()],
  };
  ensureCombatState(state);
  const bus = createBus();
  const events = { started: [], completed: [], cancelled: [] };
  bus.on('drill:approachStarted', (payload) => events.started.push({ ...payload }));
  bus.on('drill:approachCompleted', (payload) => events.completed.push({ ...payload }));
  bus.on('drill:approachCancelled', (payload) => events.cancelled.push({ ...payload }));
  const physics = fakePhysics();
  const catalog = createCombatCatalog();
  const attachments = createAttachmentService({ state, catalog, helpers: { combatPhysics: physics }, bus });
  const registry = {
    get(id) {
      return id === 'actions' ? { kernel: { attachments, catalog } } : null;
    },
  };
  const system = Object.create(tetherGameplay);
  system.init({ state, bus, helpers: { combatPhysics: physics }, registry });
  const created = attachments.create({
    defId: 'tether_standard',
    ownerId: player.id,
    targetId: asteroid.id,
    sourceWorld: { x: player.pos.x, z: player.pos.z },
    targetWorld: entityLocalPointToWorld(asteroid, targetAnchorLocal),
  });
  assert.equal(created.ok, true, `test tether must exist: ${created.reason || 'unknown failure'}`);
  return { state, player, asteroid, line: created.attachment, bus, events, physics, attachments, system };
}

function tick(h) {
  h.state.tick += 1;
  h.state.simTime += DT;
  h.state.input.actions = { tetherFire: false, tetherCut: false, reelDelta: 0, massline: null };
  h.system.update(DT, h.state);
}

function request(h) {
  return { asteroidId: h.asteroid.id, attachmentId: h.line.id };
}

function settleAtDrillSurface(h) {
  const distance = h.asteroid.radius + h.player.radius + DRILL_CLEARANCE_WU;
  h.player.pos.x = h.asteroid.pos.x - distance;
  h.player.pos.z = h.asteroid.pos.z;
  h.player.vel.x = h.asteroid.vel.x;
  h.player.vel.z = h.asteroid.vel.z;
}

function fakePhysics() {
  return {
    reels: [],
    createAttachment(spec) { return { id: `joint:${spec.attachmentId}` }; },
    cutAttachment() { return true; },
    setAttachmentReel(spec) {
      this.reels.push({ ...spec });
      return { restLength: spec.restLength };
    },
    getAttachmentTelemetry() { return { tension: 0, impulse: 0, yank: 0, phase: 'slack' }; },
  };
}

function entity(id, type, x, z, overrides = {}) {
  return {
    id,
    type,
    alive: true,
    collides: true,
    team: type === 'ship' ? 0 : null,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: type === 'asteroid' ? 16 : 8,
    mass: type === 'asteroid' ? 640 : 40,
    maxSpeed: 180,
    hull: 100,
    hullMax: 100,
    data: {},
    ...overrides,
  };
}

function motionSnapshot(entityValue) {
  return {
    pos: { ...entityValue.pos },
    vel: { ...entityValue.vel },
    rot: entityValue.rot,
  };
}
