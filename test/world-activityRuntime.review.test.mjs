import assert from 'node:assert/strict';
import test from 'node:test';

import { SpatialHash } from '../src/core/spatialHash.js';
import { ensureActivityClassified } from '../src/world/activityRuntime.js';

test('a static body-spec revision invalidates activity and physics in the same tick', () => {
  const player = ship(99, 0);
  const anchor = rock(1, 40);
  const state = makeState([player, anchor], {
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      version: 1,
      physicsStaticVersion: 1,
    },
  });

  const first = ensureActivityClassified(state);
  const firstVersion = first.physicsStaticVersion;

  anchor.physicsBody = {
    dynamic: false,
    material: 'rock',
    radius: anchor.radius,
    revision: 1,
  };
  state.entityIndex.physicsStaticVersion++;

  const second = ensureActivityClassified(state);
  assert.ok(
    second.physicsStaticVersion > firstVersion,
    'the activity layer must forward the entity index static-body revision',
  );
});

test('static membership invalidation cannot collide when no entity index is available', () => {
  const player = ship(99, 0);
  const firstRocks = [rock(1, -160), rock(2, -180)];
  const state = makeState([player, ...firstRocks]);
  const spatialHash = new SpatialHash(64);

  const first = ensureActivityClassified(state);
  const firstVersion = first.physicsStaticVersion;
  spatialHash.rebuildLayers(first.physicsStatics, [], firstVersion);

  const replacementRocks = [rock(4, 160), rock(7, 180)];
  state.entityList = [player, ...replacementRocks];
  state.entities = new Map(state.entityList.map((entity) => [entity.id, entity]));
  state.tick++;
  state.simTime += 1 / 60;

  const second = ensureActivityClassified(state);
  assert.ok(
    second.physicsStaticVersion > firstVersion,
    '1 XOR 2 and 4 XOR 7 are both 3, but they are different static memberships',
  );
  spatialHash.rebuildLayers(second.physicsStatics, [], second.physicsStaticVersion);
  const found = spatialHash.queryRadius(170, 0, 40, []);
  assert.deepEqual(found.map((entity) => entity.id).sort((a, b) => a - b), [4, 7]);
});

function makeState(entityList, extras = {}) {
  return {
    tick: 10,
    simTime: 10,
    playerId: 99,
    mode: 'flight',
    camera: { zoom: 144 },
    settings: { video: { fov: 50 } },
    entities: new Map(entityList.map((entity) => [entity.id, entity])),
    entityList,
    player: {},
    combat: {},
    ...extras,
  };
}

function ship(id, x) {
  return {
    id,
    type: 'ship',
    alive: true,
    collides: true,
    isPlayer: true,
    team: 0,
    radius: 8,
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    data: {},
    flags: {},
  };
}

function rock(id, x) {
  return {
    id,
    type: 'asteroid',
    alive: true,
    collides: true,
    radius: 10,
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    data: {
      oreHP: 40,
      oreHPMax: 80,
      fieldId: 'review-field',
      activityObjectSlotId: String(id),
    },
    flags: {},
  };
}
