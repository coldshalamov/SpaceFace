import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import { createShipMicroMotionTracker } from '../src/render/shipMicroMotion.js';

const DT = 1 / 60;

function createBus() {
  const handlers = new Map();
  return {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
      const list = handlers.get(event);
      return () => {
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      };
    },
    emit(event, payload) {
      for (const fn of handlers.get(event) || []) fn(payload);
    },
  };
}

function createPlayerCraft(baseYaw = 0) {
  const mesh = new Group();
  const hull = new Group();
  hull.rotation.y = baseYaw;
  mesh.add(hull);
  mesh.userData.hull = hull;
  return { mesh, hull };
}

function playerEntity() {
  return {
    id: 1,
    type: 'ship',
    mass: 20,
    radius: 8,
    pos: { x: 0, z: 0 },
    vel: { x: 60, z: 0 },
    rot: 0,
    angVel: 0,
    flags: {},
  };
}

function presentFrame(tracker, entity, mesh, t, options) {
  mesh.rotation.y = -entity.rot;
  tracker.updateCraftMicroMotion(entity, mesh, t, DT, options);
}

function emitOffCentreImpact(bus, over = {}) {
  bus.emit('physics:impact', {
    aId: 1,
    bId: 9,
    playerInvolved: true,
    dp: 2400,
    normal: { x: 0, z: 1 },
    pos: { x: 4, z: 6 },
    solverPlayerYawRateKick: 3,
    ...over,
  });
}

function maxHeadingError(tracker, entity, mesh, hull, baseYaw, frames, t0, options, perFrame = null) {
  let worst = 0;
  for (let i = 0; i < frames; i++) {
    if (perFrame) perFrame(i);
    const t = t0 + i * DT;
    presentFrame(tracker, entity, mesh, t, options);
    const presented = mesh.rotation.y + (hull.rotation.y - baseYaw);
    const err = Math.abs(presented - (-entity.rot));
    if (err > worst) worst = err;
  }
  return worst;
}

test('player hull yaw stays on the authored heading through an off-centre contact', () => {
  const tracker = createShipMicroMotionTracker();
  const bus = createBus();
  tracker.bindEvents(bus);
  const { mesh, hull } = createPlayerCraft(0);
  const entity = playerEntity();
  const options = { playerId: 1 };

  presentFrame(tracker, entity, mesh, 0, options);
  assert.equal(hull.rotation.y, 0, 'authored base preserved on the warm frame');

  emitOffCentreImpact(bus);

  const rotSamples = [0.08, 0.16, 0.30, 0.52, 0.9, 1.4];
  const worst = maxHeadingError(tracker, entity, mesh, hull, 0, rotSamples.length, DT, options,
    (i) => { entity.rot = rotSamples[i]; });
  assert.equal(worst, 0, `player visible yaw error after contact: ${worst}`);
  assert.equal(entity.rot, rotSamples[rotSamples.length - 1], 'presentation never writes sim yaw');
  assert.equal(entity.angVel, 0, 'presentation never writes sim angular velocity');
});

test('player hull yaw holds for reversed contact ids and a receipt missing playerInvolved', () => {
  const tracker = createShipMicroMotionTracker();
  const bus = createBus();
  tracker.bindEvents(bus);
  const { mesh, hull } = createPlayerCraft(0);
  const entity = playerEntity();
  const options = { playerId: 1 };

  presentFrame(tracker, entity, mesh, 0, options);

  emitOffCentreImpact(bus, { aId: 9, bId: 1, solverPlayerYawRateKick: -3 });
  entity.rot = 0.4;
  const worstReversed = maxHeadingError(tracker, entity, mesh, hull, 0, 6, DT, options,
    () => { entity.rot += 0.05; });
  assert.equal(worstReversed, 0, `reversed-id player yaw error: ${worstReversed}`);

  emitOffCentreImpact(bus, { playerInvolved: undefined, solverPlayerYawRateKick: 2.5 });
  const worstFlagless = maxHeadingError(tracker, entity, mesh, hull, 0, 6, 1, options,
    () => { entity.rot += 0.05; });
  assert.equal(worstFlagless, 0, `flagless-receipt player yaw error: ${worstFlagless}`);
});

test('an impact emitted before the player\'s first pose cannot swing the nose', () => {
  const tracker = createShipMicroMotionTracker();
  const bus = createBus();
  tracker.bindEvents(bus);
  const { mesh, hull } = createPlayerCraft(0);
  const entity = playerEntity();
  const options = { playerId: 1 };

  emitOffCentreImpact(bus);

  const worst = maxHeadingError(tracker, entity, mesh, hull, 0, 10, 0, options,
    () => { entity.rot += 0.03; });
  assert.equal(worst, 0, `pre-pose impact yaw error: ${worst}`);
});

test('repeated impact grinding never accrues player hull yaw', () => {
  const tracker = createShipMicroMotionTracker();
  const bus = createBus();
  tracker.bindEvents(bus);
  const { mesh, hull } = createPlayerCraft(0);
  const entity = playerEntity();
  const options = { playerId: 1 };

  presentFrame(tracker, entity, mesh, 0, options);

  const worst = maxHeadingError(tracker, entity, mesh, hull, 0, 30, DT, options, (i) => {
    entity.rot += 0.02;
    emitOffCentreImpact(bus, { solverPlayerYawRateKick: i % 2 === 0 ? 3 : -3 });
  });
  assert.equal(worst, 0, `grinding contact yaw error: ${worst}`);
});

test('reduced motion keeps the same yaw contract', () => {
  const tracker = createShipMicroMotionTracker();
  const bus = createBus();
  tracker.bindEvents(bus);
  const { mesh, hull } = createPlayerCraft(0);
  const entity = playerEntity();
  const options = { playerId: 1, motionReduce: true };

  presentFrame(tracker, entity, mesh, 0, options);
  emitOffCentreImpact(bus);

  const worst = maxHeadingError(tracker, entity, mesh, hull, 0, 8, DT, options,
    () => { entity.rot += 0.04; });
  assert.equal(worst, 0, `reduced-motion yaw error: ${worst}`);
});

test('an authored hull base yaw survives contact, and a rebuilt tracker re-reads it', () => {
  const bus = createBus();
  const baseYaw = 0.35;
  const { mesh, hull } = createPlayerCraft(baseYaw);
  const entity = playerEntity();
  const options = { playerId: 1 };

  const tracker = createShipMicroMotionTracker();
  tracker.bindEvents(bus);
  presentFrame(tracker, entity, mesh, 0, options);
  emitOffCentreImpact(bus, { solverPlayerYawRateKick: -3 });
  const worst = maxHeadingError(tracker, entity, mesh, hull, baseYaw, 8, DT, options,
    () => { entity.rot += 0.04; });
  assert.equal(worst, 0, `authored-base yaw error: ${worst}`);
  assert.equal(hull.rotation.y, baseYaw, 'child hull keeps the authored yaw offset');

  const rebuilt = createShipMicroMotionTracker();
  rebuilt.bindEvents(bus);
  emitOffCentreImpact(bus, { solverPlayerYawRateKick: 3 });
  const worstRebuilt = maxHeadingError(rebuilt, entity, mesh, hull, baseYaw, 8, 10, options,
    () => { entity.rot += 0.04; });
  assert.equal(worstRebuilt, 0, `rebuilt-tracker yaw error: ${worstRebuilt}`);
  assert.equal(hull.rotation.y, baseYaw, 'rebuilt tracker preserves the authored base');
});
