// NXI-049 — a destroyed leader cannot remain the retreat anchor.
// Destroy the leader between perception updates: followers do not steer toward a recycled id.
import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSensorFrame } from '../src/ai/contracts.js';
import { SquadCommander } from '../src/ai/squad.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { aiPorts } from '../src/systems/aiPorts.js';

const LEADER = 7;
const WING = 8;

function perception(id, x, z, generation, alive = true) {
  return {
    self: {
      id,
      pos: { x, z },
      vel: { x: 0, z: 0 },
      rot: 0,
      hullFraction: 1,
      disabled: false,
      alive,
      capabilities: [],
      occupantGeneration: generation,
    },
    contacts: [],
    events: [],
  };
}

function frame(leader, wing) {
  return new Map([
    [LEADER, leader],
    [WING, wing],
  ]);
}

function slotOf(result, id) {
  const directive = result.directives.get(id);
  assert.ok(directive, `member ${id} still receives a directive`);
  return directive.formation.slot;
}

function dist(slot, pos) {
  return Math.hypot(slot.x - pos.x, slot.z - pos.z);
}

test('NXI-049: followers do not steer toward a recycled leader id', () => {
  const commander = new SquadCommander({ seed: 49, config: { minTacticTicks: 0 } });
  commander.registerSquad({
    id: 'wing',
    members: [{ id: LEADER }, { id: WING }],
  });
  const wingPos = { x: 200, z: 40 };
  const livingPos = { x: 1000, z: 0 };
  const living = commander.update('wing', 1, frame(
    perception(LEADER, livingPos.x, livingPos.z, 1),
    perception(WING, wingPos.x, wingPos.z, 3),
  ));
  assert.equal(living.directives.size, 2);
  const leaderSlot = slotOf(living, LEADER);
  const livingSlot = slotOf(living, WING);
  assert.ok(dist(leaderSlot, livingPos) < 1e-6, 'the living leader is the anchor');
  const wedgeReach = dist(livingSlot, livingPos);
  assert.ok(wedgeReach > 1, 'the follower holds a slot off the leader, not on top of them');

  const grave = { x: 3000, z: -3000 };
  const dead = commander.update('wing', 2, frame(
    perception(LEADER, grave.x, grave.z, 1, false),
    perception(WING, wingPos.x, wingPos.z, 3),
  ));
  assert.equal(dead.directives.size, 2);
  assert.ok(commander.inspect('wing'), 'a dead leader does not dissolve the squad');
  const deadSlot = slotOf(dead, WING);
  assert.ok(dist(deadSlot, grave) > wedgeReach * 2, 'followers do not steer toward the dead leader');

  const recycledPos = { x: 4000, z: 4000 };
  const recycled = commander.update('wing', 3, frame(
    perception(LEADER, recycledPos.x, recycledPos.z, 2),
    perception(WING, wingPos.x, wingPos.z, 3),
  ));
  assert.equal(recycled.directives.size, 2);
  assert.ok(commander.inspect('wing'), 'a recycled id does not dissolve the squad');
  const recycledSlot = slotOf(recycled, WING);
  assert.ok(
    dist(recycledSlot, recycledPos) > wedgeReach * 2,
    'followers do not sit on the recycled body or the wedge around it',
  );

  const moved = { x: 1100, z: 25 };
  const still = commander.update('wing', 4, frame(
    perception(LEADER, moved.x, moved.z, 1),
    perception(WING, wingPos.x, wingPos.z, 3),
  ));
  const stillLeader = slotOf(still, LEADER);
  const stillSlot = slotOf(still, WING);
  assert.ok(dist(stillLeader, moved) < 1e-6, 'the same generation, moved, is still the anchor');
  assert.ok(dist(stillSlot, moved) < dist(stillSlot, recycledPos));
  assert.ok(dist(stillSlot, moved) <= wedgeReach * 1.01);
});

test('NXI-049: a leader frame with no occupant token is still followed when it moves', () => {
  const commander = new SquadCommander({ seed: 50, config: { minTacticTicks: 0 } });
  commander.registerSquad({
    id: 'plain',
    members: [{ id: LEADER }, { id: WING }],
  });
  const wingPos = { x: -80, z: 20 };
  const firstPos = { x: 500, z: -40 };
  const first = commander.update('plain', 1, frame(
    perception(LEADER, firstPos.x, firstPos.z, null),
    perception(WING, wingPos.x, wingPos.z, null),
  ));
  const firstSlot = slotOf(first, WING);
  assert.ok(dist(slotOf(first, LEADER), firstPos) < 1e-6);
  const moved = { x: 540, z: -10 };
  const second = commander.update('plain', 2, frame(
    perception(LEADER, moved.x, moved.z, null),
    perception(WING, wingPos.x, wingPos.z, null),
  ));
  const secondSlot = slotOf(second, WING);
  assert.ok(dist(slotOf(second, LEADER), moved) < 1e-6, 'a tokenless living leader stays the anchor');
  const firstReach = dist(firstSlot, firstPos);
  assert.ok(dist(secondSlot, moved) <= firstReach * 1.01, 'the follower slot stays on the moved leader');
});

function sensed(id, x, z, carried) {
  const self = {
    id,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    hullFraction: 1,
    disabled: false,
    capabilities: [],
  };
  if (carried && Object.prototype.hasOwnProperty.call(carried, 'occupantGeneration')) {
    self.occupantGeneration = carried.occupantGeneration;
  }
  if (carried && Object.prototype.hasOwnProperty.call(carried, 'alive')) self.alive = carried.alive;
  return normalizeSensorFrame({ self, contacts: [], events: [] }, id, 0);
}

test('NXI-049: a normalized frame keeps a carried death flag and occupant token', () => {
  const commander = new SquadCommander({ seed: 51, config: { minTacticTicks: 0 } });
  commander.registerSquad({
    id: 'norm',
    members: [{ id: LEADER }, { id: WING }],
  });
  const wingPos = { x: 200, z: 40 };
  const livingPos = { x: 1000, z: 0 };
  const generation = 1;
  const livingFrame = sensed(LEADER, livingPos.x, livingPos.z, { occupantGeneration: generation, alive: true });
  const wingFrame = sensed(WING, wingPos.x, wingPos.z, { occupantGeneration: 3, alive: true });
  assert.equal(livingFrame.self.occupantGeneration, generation);
  assert.equal(livingFrame.self.alive, true);
  const living = commander.update('norm', 1, frame(livingFrame, wingFrame));
  assert.equal(living.directives.size, 2);
  const livingSlot = slotOf(living, WING);
  const wedgeReach = dist(livingSlot, livingPos);
  assert.ok(dist(slotOf(living, LEADER), livingPos) < 1e-6);
  assert.ok(wedgeReach > 1);

  const grave = { x: 3000, z: -3000 };
  const deadFrame = sensed(LEADER, grave.x, grave.z, { occupantGeneration: generation, alive: false });
  assert.equal(deadFrame.self.alive, false);
  assert.equal(deadFrame.self.occupantGeneration, generation);
  const dead = commander.update('norm', 2, frame(deadFrame, wingFrame));
  assert.equal(dead.directives.size, 2);
  assert.ok(commander.inspect('norm'), 'a dead leader does not dissolve the squad');
  assert.ok(dist(slotOf(dead, WING), grave) > wedgeReach * 2, 'a normalized death flag is not a steering target');

  const recycledPos = { x: 4000, z: 4000 };
  const nextGeneration = 2;
  const recycledFrame = sensed(LEADER, recycledPos.x, recycledPos.z, { occupantGeneration: nextGeneration, alive: true });
  assert.equal(recycledFrame.self.occupantGeneration, nextGeneration);
  assert.notEqual(recycledFrame.self.occupantGeneration, generation);
  const recycled = commander.update('norm', 3, frame(recycledFrame, wingFrame));
  assert.equal(recycled.directives.size, 2);
  assert.ok(commander.inspect('norm'));
  assert.ok(
    dist(slotOf(recycled, WING), recycledPos) > wedgeReach * 2,
    'a normalized occupant token on a recycled id is not the anchor',
  );

  const moved = { x: 1100, z: 25 };
  const stillFrame = sensed(LEADER, moved.x, moved.z, { occupantGeneration: generation, alive: true });
  assert.equal(stillFrame.self.occupantGeneration, generation);
  const still = commander.update('norm', 4, frame(stillFrame, wingFrame));
  assert.ok(dist(slotOf(still, LEADER), moved) < 1e-6, 'the same generation, moved, is still the anchor');
  assert.ok(dist(slotOf(still, WING), moved) <= wedgeReach * 1.01);

  const bareLeader = sensed(LEADER, 500, -40, {});
  const bareWing = sensed(WING, -80, 20, {});
  assert.equal(bareLeader.self.alive, undefined);
  assert.equal(bareLeader.self.occupantGeneration, undefined);
  const plain = new SquadCommander({ seed: 52, config: { minTacticTicks: 0 } });
  plain.registerSquad({ id: 'bare', members: [{ id: LEADER }, { id: WING }] });
  const firstPos = { x: 500, z: -40 };
  const first = plain.update('bare', 1, frame(bareLeader, bareWing));
  assert.ok(dist(slotOf(first, LEADER), firstPos) < 1e-6, 'a frame that never carried the fields is still followed');
  const later = { x: 540, z: -10 };
  const second = plain.update('bare', 2, frame(sensed(LEADER, later.x, later.z, {}), bareWing));
  assert.ok(dist(slotOf(second, LEADER), later) < 1e-6, 'the normalizer does not invent a token that drops the leader');
  assert.ok(dist(slotOf(second, WING), later) <= dist(slotOf(first, WING), firstPos) * 1.01);
});

function bootWing() {
  const state = createGameState(49);
  const bus = createBus();
  const helpers = {};
  const coreSys = Object.create(core);
  coreSys.init({ state, bus, helpers });
  const ports = Object.create(aiPorts);
  ports.init({ state, bus, helpers, registry: { get() { return null; } } });
  return { state, helpers, sensors: helpers.aiSensors, ports };
}

function spawnShip(helpers, pos, extra = {}) {
  return helpers.spawnEntity({
    type: 'ship',
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    mass: 12,
    hull: 100,
    hullMax: 100,
    collides: true,
    team: 1,
    data: { ai: { passive: true } },
    ...extra,
  });
}

function copiedOwnFields(entity) {
  const copied = {};
  for (const key in entity) copied[key] = entity[key];
  return copied;
}

test('NXI-049: a freeIds recycle sensed through the live sensor frame is not the formation anchor', () => {
  const { state, helpers } = bootWing();
  const livingPos = { x: 1000, z: 0 };
  const wingPos = { x: 200, z: 40 };
  const leader = spawnShip(helpers, livingPos);
  const wing = spawnShip(helpers, wingPos);
  assert.ok(leader.id < wing.id);
  assert.ok(leader.occupantGeneration != null && leader.occupantGeneration !== '');
  assert.notEqual(leader.occupantGeneration, wing.occupantGeneration);
  assert.equal(copiedOwnFields(leader).occupantGeneration, undefined);

  const commander = new SquadCommander({ seed: 49, config: { minTacticTicks: 0 } });
  commander.registerSquad({
    id: 'wing',
    members: [{ id: leader.id }, { id: wing.id }],
  });
  const livingFrames = helpers.aiSensors.liveFramesFor([leader.id, wing.id], 1);
  const leaderLive = livingFrames.get(leader.id);
  assert.equal(leaderLive.self.id, leader.id);
  assert.equal(leaderLive.self.occupantGeneration, leader.occupantGeneration);
  assert.equal(livingFrames.get(wing.id).self.occupantGeneration, wing.occupantGeneration);
  const frozen = helpers.aiSensors.frameFor(leader.id, 1);
  assert.equal(frozen.self.occupantGeneration, leader.occupantGeneration);

  const living = commander.update('wing', 1, livingFrames);
  assert.equal(living.directives.size, 2);
  assert.ok(dist(slotOf(living, leader.id), livingPos) < 1e-6, 'the living leader is the anchor');
  const livingSlot = slotOf(living, wing.id);
  const wedgeReach = dist(livingSlot, livingPos);
  assert.ok(wedgeReach > 1, 'the follower holds a slot off the leader');

  assert.equal(helpers.removeEntity(leader.id, { immediate: true }), true);
  assert.equal(state.freeIds[state.freeIds.length - 1], leader.id);
  const gone = helpers.aiSensors.frameFor(leader.id, 2);
  assert.equal(gone.self.occupantGeneration, undefined);

  const recycledPos = { x: 4000, z: 4000 };
  const carried = leader.occupantGeneration;
  const recycled = spawnShip(helpers, recycledPos, { occupantGeneration: carried });
  assert.equal(recycled.id, leader.id);
  assert.notEqual(recycled.occupantGeneration, carried);
  assert.equal(copiedOwnFields(recycled).occupantGeneration, undefined);

  const recycledFrames = helpers.aiSensors.liveFramesFor([recycled.id, wing.id], 3);
  const recycledLive = recycledFrames.get(recycled.id);
  assert.equal(recycledLive.self.occupantGeneration, recycled.occupantGeneration);
  assert.notEqual(recycledLive.self.occupantGeneration, carried);
  assert.equal(helpers.aiSensors.frameFor(recycled.id, 3).self.occupantGeneration, recycled.occupantGeneration);

  const after = commander.update('wing', 3, recycledFrames);
  assert.equal(after.directives.size, 2);
  assert.ok(commander.inspect('wing'), 'a recycled id does not dissolve the squad');
  assert.ok(
    dist(slotOf(after, wing.id), recycledPos) > wedgeReach * 2,
    'followers do not sit on the recycled body or the wedge around it',
  );
  assert.ok(dist(slotOf(after, recycled.id), recycledPos) > wedgeReach * 2);
});

test('NXI-049: a roster rebuild during the death gap still rejects the recycled id', () => {
  const { state, helpers } = bootWing();
  const livingPos = { x: 1000, z: 0 };
  const wingPos = { x: 200, z: 40 };
  const leader = spawnShip(helpers, livingPos);
  const wing = spawnShip(helpers, wingPos);
  assert.ok(leader.id < wing.id);
  const commander = new SquadCommander({ seed: 49, config: { minTacticTicks: 0 } });
  commander.registerSquad({
    id: 'wing',
    members: [{ id: leader.id }, { id: wing.id }],
  });
  const livingFrames = helpers.aiSensors.liveFramesFor([leader.id, wing.id], 1);
  const carried = livingFrames.get(leader.id).self.occupantGeneration;
  assert.equal(carried, leader.occupantGeneration);
  const living = commander.update('wing', 1, livingFrames);
  const wedgeReach = dist(slotOf(living, wing.id), livingPos);
  assert.ok(wedgeReach > 1);

  assert.equal(helpers.removeEntity(leader.id, { immediate: true }), true);
  assert.ok(state.freeIds.includes(leader.id));
  commander.registerSquad({
    id: 'wing',
    members: [{ id: wing.id }],
  });
  const gap = commander.update('wing', 2, helpers.aiSensors.liveFramesFor([wing.id], 2));
  assert.ok(commander.inspect('wing'), 'dropping the leader does not dissolve the squad');
  assert.ok(
    dist(slotOf(gap, wing.id), wingPos) < 1e-6,
    'the surviving wing stays the anchor through the gap',
  );

  const recycledPos = { x: 4000, z: 4000 };
  const recycled = spawnShip(helpers, recycledPos, { occupantGeneration: carried });
  assert.equal(recycled.id, leader.id);
  assert.notEqual(recycled.occupantGeneration, carried);
  commander.registerSquad({
    id: 'wing',
    members: [{ id: recycled.id }, { id: wing.id }],
  });
  const recycledFrames = helpers.aiSensors.liveFramesFor([recycled.id, wing.id], 3);
  assert.equal(recycledFrames.get(recycled.id).self.occupantGeneration, recycled.occupantGeneration);
  assert.notEqual(recycledFrames.get(recycled.id).self.occupantGeneration, carried);
  const after = commander.update('wing', 3, recycledFrames);
  assert.equal(after.directives.size, 2);
  assert.ok(commander.inspect('wing'), 'a recycled id does not dissolve the squad');
  assert.ok(
    dist(slotOf(after, wing.id), recycledPos) > wedgeReach * 2,
    'followers do not steer toward the recycled body after the roster rebuild',
  );
});
