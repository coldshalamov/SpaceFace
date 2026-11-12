import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { physics } from '../src/core/physics.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { MIGRATIONS } from '../src/save/migrations.js';

const DT = 1 / 60;
const clone = value => JSON.parse(JSON.stringify(value));

function stationEntity(id, stationId, x, z) {
  return {
    id, type: 'station', alive: true, radius: 34, mass: 1e6,
    pos: { x, y: 0, z }, vel: { x: 0, y: 0, z: 0 }, rot: 0, angVel: 0,
    hull: 1e6, hullMax: 1e6, collides: true,
    homeSectorId: 'sector_alpha',
    data: { stationId, dockRadius: 72, homeSectorId: 'sector_alpha', sectorId: 'sector_alpha' },
    physicsBody: { schemaVersion: 1, radius: 34, mass: 1e6, inertiaY: 1e6, dynamic: false, shape: 'ball', revision: 0 },
  };
}

function gateEntity(id, gateTo, x, z) {
  const gate = stationEntity(id, null, x, z);
  gate.data = { ...gate.data, isGate: true, gateTo, collisionProxy: 'gate_jump_ring' };
  return gate;
}

async function rig(entities, seed = 91) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.entityList = entities;
  state.entities = new Map(entities.map(entity => [entity.id, entity]));
  const system = Object.create(physics);
  system.init({ state, bus: createBus(), helpers: {} });
  system._sg02 = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  system._sg02.syncFromEntities(entities);
  return { state, system, owner: system._sg02 };
}

function restoreThrough(payload, rig2, context = {}) {
  rig2.system.deserialize(clone(payload), { deferNative: true });
  rig2.system.completeRestore(context);
  return rig2;
}

async function settle(owner, ticks = 600) {
  for (let i = 0; i < ticks; i++) owner.step(DT);
}

test('a mid-recoil station resumes its offset and settles to the regenerated rest pose', async () => {
  const station = stationEntity(1, 'station_alpha', 500, -200);
  const source = await rig([station]);
  try {
    queuePhysicsImpulse(station, { x: 8e6, z: 0 });
    for (let i = 0; i < 12; i++) source.owner.step(DT);
    const recoil = station.physicsBody.anchorRecoil;
    assert.ok(recoil && Math.hypot(recoil.x, recoil.z) > 0.1, 'the station is mid-recoil when saved');
    const saved = { x: recoil.x, z: recoil.z, vx: recoil.vx, vz: recoil.vz };
    const payload = source.system.serialize();
    assert.ok(Array.isArray(payload.anchoredRecoil) && payload.anchoredRecoil.length === 1);
    assert.equal(payload.anchoredRecoil[0].key, 'station:station_alpha');

    // Regeneration produces a fresh entity at the authored pose with a fresh entity id.
    const regrown = stationEntity(9, 'station_alpha', 500, -200);
    const target = await rig([regrown]);
    try {
      target.system.deserialize(clone(payload), { deferNative: true });
      target.system.completeRestore({ entityIdRemap: new Map([['1', 9]]) });
      const restored = regrown.physicsBody.anchorRecoil;
      assert.ok(restored, 'the recoil row reattaches by station id, not entity id');
      assert.equal(restored.x, saved.x); assert.equal(restored.z, saved.z);
      assert.equal(restored.vx, saved.vx); assert.equal(restored.vz, saved.vz);
      assert.deepEqual(restored.rest, { x: 500, z: -200 });
      assert.ok(regrown.pos.x > 500, 'the regenerated station resumes at the recoiled pose');

      await settle(target.owner);
      assert.equal(restored.settled, true, 'the recoil spring still runs to rest');
      assert.equal(regrown.pos.x, 500); assert.equal(regrown.pos.z, -200);
      const rec = target.owner.records.get(9);
      assert.ok(rec && rec.body.numColliders() > 0, 'the settled station keeps its collider');
    } finally { target.owner.dispose(); }
  } finally { source.owner.dispose(); }
});

test('a mid-recoil gate resumes through its gate:<home>:<to> key', async () => {
  const gate = gateEntity(2, 'sector_beta', -700, 40);
  const source = await rig([gate]);
  try {
    queuePhysicsImpulse(gate, { x: 0, z: 2.4e6 });
    for (let i = 0; i < 10; i++) source.owner.step(DT);
    const saved = { ...gate.physicsBody.anchorRecoil };
    assert.ok(Math.abs(saved.z) > 0.05, 'the gate is mid-recoil when saved');
    const payload = source.system.serialize();
    assert.equal(payload.anchoredRecoil[0].key, 'gate:sector_alpha:sector_beta');

    const regrown = gateEntity(4, 'sector_beta', -700, 40);
    const target = await rig([regrown]);
    try {
      target.system.deserialize(clone(payload), { deferNative: true });
      target.system.completeRestore({ entityIdRemap: new Map([['2', 4]]) });
      const restored = regrown.physicsBody.anchorRecoil;
      assert.ok(restored && restored.z === saved.z);
      await settle(target.owner);
      assert.equal(restored.settled, true);
      assert.equal(regrown.pos.z, 40);
    } finally { target.owner.dispose(); }
  } finally { source.owner.dispose(); }
});

test('an envelope without the recoil row and a pre-v15 envelope both restore at rest', async () => {
  const station = stationEntity(1, 'station_alpha', 500, -200);
  const source = await rig([station]);
  try {
    queuePhysicsImpulse(station, { x: 3e6, z: 0 });
    source.owner.step(DT);
    const payload = clone(source.system.serialize());
    // A current-version envelope whose snapshot predates the row, and the same payload through
    // the v14→v15 migration (which must leave the physics row untouched).
    delete payload.anchoredRecoil;
    const migrated = { physics: clone(payload) };
    MIGRATIONS.find(entry => entry.from === 14).fn(migrated);
    for (const physicsRow of [payload, migrated.physics]) {
      const regrown = stationEntity(3, 'station_alpha', 500, -200);
      const target = await rig([regrown]);
      try {
        restoreThrough(physicsRow, target, { entityIdRemap: new Map([['1', 3]]) });
        assert.equal(regrown.physicsBody.anchorRecoil, undefined);
        assert.equal(regrown.pos.x, 500); assert.equal(regrown.pos.z, -200);
      } finally { target.owner.dispose(); }
    }
  } finally { source.owner.dispose(); }
});

test('malformed and unknown recoil rows load without corrupting the regenerated body', async () => {
  const station = stationEntity(1, 'station_alpha', 500, -200);
  const source = await rig([station]);
  try {
    queuePhysicsImpulse(station, { x: 3e6, z: 0 });
    source.owner.step(DT);
    // structuredClone keeps NaN/Infinity malformed — JSON would launder them into null → 0.
    const payload = structuredClone(source.system.serialize());
    payload.anchoredRecoil = [
      { key: 'station:station_alpha', x: NaN, z: 0, vx: 0, vz: 0 },
      { key: 'station:unknown_station', x: 1, z: 1, vx: 0, vz: 0 },
      { key: 42, x: 1, z: 1, vx: 0, vz: 0 },
      { key: 'station:station_alpha', x: 0.5, z: 0, vx: Infinity, vz: 0 },
      'not-a-row',
    ];
    const regrown = stationEntity(7, 'station_alpha', 500, -200);
    const target = await rig([regrown]);
    try {
      restoreThrough(payload, target, { entityIdRemap: new Map([['1', 7]]) });
      await settle(target.owner);
      assert.equal(regrown.physicsBody.anchorRecoil, undefined, 'every malformed row is dropped');
      assert.equal(regrown.pos.x, 500); assert.equal(regrown.pos.z, -200);
    } finally { target.owner.dispose(); }
  } finally { source.owner.dispose(); }
});

test('settled recoil is not persisted', async () => {
  const station = stationEntity(1, 'station_alpha', 500, -200);
  const source = await rig([station]);
  try {
    queuePhysicsImpulse(station, { x: 8e4, z: 0 });
    await settle(source.owner);
    assert.equal(station.physicsBody.anchorRecoil.settled, true);
    const payload = source.system.serialize();
    assert.ok(!payload || !payload.anchoredRecoil || payload.anchoredRecoil.length === 0);
  } finally { source.owner.dispose(); }
});
