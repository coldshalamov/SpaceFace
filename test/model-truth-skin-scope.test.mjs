// Measured skins are fixed-body geometry only.
//
// ad1f92053 stamped `skin:<census row>` on every census-covered entity at spawn, including ships,
// payloads, and wrecks that SG-02 builds as DYNAMIC bodies. Those hulls then got a 24-capsule
// compound collider that ignores centerOfMass, and 47-A's save/reload determinism broke at the
// first multi-contact (check:sim / check:sim:v3 "reload-at N hash diverged"). The collision-proxy
// unit test called the resolver directly and skipped core.spawn, so nothing caught it.
//
// This test goes through the REAL core.spawn path and the REAL SG-02 builder: a dynamic hull keeps
// its craft capsule, a dynamic wreck/chunk keeps its ball, and a fixed station or rock gets its
// measured skin. Same predicate SG-02 uses to pick RigidBodyDesc.dynamic() vs fixed().
import test from 'node:test';
import assert from 'node:assert/strict';

import { core } from '../src/core/coreSystem.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { isDynamicPhysicsBodyEntity } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import {
  measuredSkinAllowedFor,
  resolveCollisionProxyManifest,
} from '../src/data/collisionProxyManifests.js';
import { modelTruthProxyManifest } from '../src/data/modelTruth.js';

function bootCore(seed) {
  const state = createGameState(seed);
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers });
  return {
    state,
    helpers,
    cleanup() {
      core.destroy();
      bus.clear();
    },
  };
}

const SPECS = Object.freeze({
  kestrel: () => ({ type: 'ship', pos: { x: 0, z: 0 }, radius: 14, collides: true, data: { defId: 'ship_kestrel' } }),
  mule: () => ({ type: 'ship', pos: { x: 60, z: 0 }, radius: 18, collides: true, data: { defId: 'ship_mule' } }),
  wreck: () => ({ type: 'wreck', pos: { x: 0, z: 400 }, radius: 42, collides: true, data: { placeId: 'place_dead_hulk' } }),
  chunk: () => ({ type: 'asteroid', pos: { x: 0, z: -400 }, radius: 8, collides: true, data: { typeId: 'ast_common_rock', isChunk: true } }),
  station: () => ({
    type: 'station', pos: { x: 900, z: 0 }, radius: 42, collides: true,
    data: { stationTypeId: 'trade_hub', dockRadius: 90 },
  }),
  rock: () => ({ type: 'asteroid', pos: { x: -900, z: 0 }, radius: 12, collides: true, data: { typeId: 'ast_common_rock' } }),
});

test('census covers every fixture, so the scope decision is what keeps dynamic bodies off skins', () => {
  // Guard the premise: if a row stopped being adopted this test would pass vacuously.
  for (const [name, make] of Object.entries(SPECS)) {
    const probe = make();
    assert.ok(modelTruthProxyManifest(probe), `${name}: census row with an adopted skin`);
  }
});

test('core.spawn stamps a measured skin on fixed bodies only', () => {
  const t = bootCore(4711);
  try {
    const spawned = Object.fromEntries(Object.entries(SPECS).map(([name, make]) => [name, t.helpers.spawnEntity(make())]));
    for (const name of ['kestrel', 'mule', 'wreck', 'chunk']) {
      const e = spawned[name];
      assert.equal(isDynamicPhysicsBodyEntity(e), true, `${name} is a dynamic body`);
      assert.equal(measuredSkinAllowedFor(e), false, `${name} may not take a skin`);
      const stamp = e.data && e.data.collisionProxy;
      assert.ok(!(typeof stamp === 'string' && stamp.startsWith('skin:')), `${name} was stamped ${stamp}`);
      assert.equal(resolveCollisionProxyManifest(e), null, `${name} resolves no proxy`);
    }
    assert.equal(spawned.station.data.collisionProxy, 'skin:place_station_trade_hub');
    assert.equal(resolveCollisionProxyManifest(spawned.station).id, 'skin:place_station_trade_hub');
    assert.ok(resolveCollisionProxyManifest(spawned.station).docking, 'station skin keeps the dock block');
    assert.equal(spawned.rock.data.collisionProxy, 'skin:ast_common_rock');
    assert.equal(resolveCollisionProxyManifest(spawned.rock).id, 'skin:ast_common_rock');
  } finally {
    t.cleanup();
  }
});

test('a dynamic hull carrying an old skin stamp (pre-fix save) still resolves to its capsule', () => {
  const ship = { ...SPECS.kestrel(), id: 91, alive: true };
  ship.data = { ...ship.data, collisionProxy: 'skin:ship_kestrel' };
  assert.equal(resolveCollisionProxyManifest(ship), null);
  // Resolving is cached per entity for fixed bodies and allocation-free for dynamic ones.
  const station = { ...SPECS.station(), id: 92, alive: true };
  station.data = { ...station.data, collisionProxy: 'skin:place_station_trade_hub' };
  assert.equal(resolveCollisionProxyManifest(station), resolveCollisionProxyManifest(station));
});

test('SG-02 builds the capsule/ball for dynamic bodies and the compound skin for fixed ones', async () => {
  const t = bootCore(4712);
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const spawned = Object.fromEntries(Object.entries(SPECS).map(([name, make]) => [name, t.helpers.spawnEntity(make())]));
    // A pre-fix save could still carry the stamp; the builder must refuse it on a dynamic body.
    const stale = t.helpers.spawnEntity({ ...SPECS.kestrel(), pos: { x: 0, z: 200 } });
    stale.data.collisionProxy = 'skin:ship_kestrel';
    owner.syncFromEntities(t.state.entityList);
    for (const name of ['kestrel', 'mule', 'wreck', 'chunk']) {
      const rec = owner.records.get(spawned[name].id);
      assert.ok(rec, `${name} has a body`);
      assert.equal(rec.spec.dynamic, true, `${name} is built dynamic`);
      assert.equal(rec.proxyId, null, `${name} has no compound proxy`);
      assert.equal(rec.colliders.length, 1, `${name} keeps one capsule/ball collider`);
    }
    const staleRec = owner.records.get(stale.id);
    assert.equal(staleRec.proxyId, null);
    assert.equal(staleRec.colliders.length, 1);
    for (const [name, id] of [['station', 'skin:place_station_trade_hub'], ['rock', 'skin:ast_common_rock']]) {
      const rec = owner.records.get(spawned[name].id);
      assert.ok(rec, `${name} has a body`);
      assert.equal(rec.spec.dynamic, false, `${name} is built fixed`);
      assert.equal(rec.proxyId, id);
      assert.ok(rec.colliders.length > 1, `${name} collides with its measured skin`);
    }
    // A second sync must not rebuild anything: the proxy id is stable per entity.
    const before = new Map(Array.from(owner.records, ([id, rec]) => [id, rec.body]));
    owner.syncFromEntities(t.state.entityList);
    for (const [id, body] of before) assert.equal(owner.records.get(id).body, body, `record ${id} rebuilt on resync`);
  } finally {
    owner.dispose();
    t.cleanup();
  }
});
