import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { spawnCollisionTearOff, spawnFracturePieces } from '../src/systems/hullFracture.js';

function harness(seed = 231) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 10;
  state.world.currentSectorId = 'test';
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const ctx = { state, helpers, bus: createBus() };
  const aftermath = Object.assign(Object.create(aftermathWrecks), ctx);
  return { ...ctx, aftermath };
}

function source(h, type = 'wreck', data = {}) {
  return h.helpers.spawnEntity({
    type, pos: { x: 80, z: -40 }, vel: { x: 0, z: 0 },
    radius: 14, mass: 800, hull: 100, hullMax: 100, collides: true,
    physicsBody: { shape: 'capsule', dynamic: true, mass: 800, radius: 14 },
    data,
  });
}

function note(entity, count = 2) {
  return {
    victimId: entity.id, pos: entity.pos, vel: entity.vel,
    radius: entity.radius, mass: entity.mass, normal: { x: 1, z: 0 },
    closingSpeed: 50, count, tick: 600,
  };
}

function impact(h, entity, deltaV = 40) {
  h.aftermath._shedChipsFromWreck(entity, true, { normal: { x: 1, z: 0 } },
    entity.physicsBody.mass * deltaV, h.state);
}

test('a loose body gets one physical breakup in its lifetime, including after cooldown', () => {
  const h = harness();
  const wreck = source(h);
  impact(h, wreck, 20);
  assert.equal(h.state.entityList.length, 2, 'first impact creates one physical chip');
  h.state.simTime += 3;
  impact(h, wreck, 20);
  assert.equal(h.state.entityList.length, 2, 'the same body cannot mint another spray');
});

test('physical hull pieces and tear-off descendants cannot recursively shed more bodies', () => {
  for (const spawn of [spawnCollisionTearOff, spawnFracturePieces]) {
    const h = harness();
    const ship = source(h, 'ship');
    const result = spawn(h, note(ship));
    const pieces = Array.isArray(result) ? result : result.pieces;
    assert.equal(pieces.length, 2);
    assert.ok(pieces.every((piece) => Number.isFinite(piece.angVel)), 'finite physical spin');
    assert.ok(pieces.every((piece) => piece.physicsBody.mass >= 2),
      'exercise real descendants above the old recursive admission mass floor');
    const count = h.state.entityList.length;
    for (const piece of pieces) impact(h, piece);
    assert.equal(h.state.entityList.length, count, 'descendant contacts add no physics bodies');
  }
});

test('legacy saved fracture, tear-off, and ship-wreck stamps remain terminal', () => {
  for (const data of [
    { fracturePiece: 'remainder' },
    { collisionTearOff: true },
    { parentType: 'ship' },
    { impactChipCount: 1 },
  ]) {
    const h = harness();
    const fragment = source(h, 'wreck', data);
    impact(h, fragment);
    assert.equal(h.state.entityList.length, 1, JSON.stringify(data));
  }
});

test('a previously chipped ship cannot split into more hull bodies on death', () => {
  const h = harness();
  const ship = source(h, 'ship');
  assert.equal(spawnCollisionTearOff(h, note(ship)).length, 2);
  assert.equal(spawnFracturePieces(h, note(ship)), null);
});

test('new hull pieces and tear-offs start clear of their siblings and surviving parent in Rapier', async () => {
  for (const spawn of [spawnFracturePieces, spawnCollisionTearOff]) {
    const h = harness();
    const ship = source(h, 'ship');
    const result = spawn(h, note(ship));
    const pieces = Array.isArray(result) ? result : result.pieces;
    const bodies = Array.isArray(result) ? [ship, ...pieces] : pieces;
    const owner = await createSg02DynamicBodyOwner({ fixedDt: 1 / 60 });
    try {
      owner.syncFromEntities(bodies);
      let contacts = 0;
      owner.world.forEachCollider((a) => {
        owner.world.forEachCollider((b) => {
          if (a.handle < b.handle && a.contactCollider(b, 0)) contacts++;
        });
      });
      assert.equal(contacts, 0, `${spawn.name}: born interpenetrating`);
    } finally {
      owner.dispose();
    }
  }
});
