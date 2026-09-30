// Measured skins follow collidable solid bodies, fixed or dynamic.
//
// ad1f92053 stamped `skin:<census row>` on every census-covered entity at spawn; for a while
// SG-02 refused skins on DYNAMIC bodies entirely because the 24-capsule compound ignored
// centerOfMass and broke 47-A save/reload determinism (check:sim "reload-at N hash diverged").
// The current contract: eligible solids take their measured skin — compacted to ONE tolerance-
// checked convex hull where the census outline permits, else a bounded ≤32 compound — while
// sensors, ghosts, pickups, projectiles, and authored geometry overrides stay off it.
//
// This test goes through the REAL core.spawn path and the REAL SG-02 builder: a dynamic hull or
// rock gets its measured boundary, and a fixed station keeps its skin with real openings.
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

test('census covers every fixture, so the scope decision is what admits bodies to skins', () => {
  // Guard the premise: if a row stopped being adopted this test would pass vacuously.
  for (const [name, make] of Object.entries(SPECS)) {
    const probe = make();
    assert.ok(modelTruthProxyManifest(probe), `${name}: census row with an adopted skin`);
  }
});

test('core.spawn stamps a measured skin on every eligible solid body', () => {
  const t = bootCore(4711);
  try {
    const spawned = Object.fromEntries(Object.entries(SPECS).map(([name, make]) => [name, t.helpers.spawnEntity(make())]));
    for (const name of ['kestrel', 'mule', 'wreck', 'chunk']) {
      const e = spawned[name];
      assert.equal(isDynamicPhysicsBodyEntity(e), true, `${name} is a dynamic body`);
      assert.equal(measuredSkinAllowedFor(e), true, `${name} takes its measured skin`);
      const stamp = e.data && e.data.collisionProxy;
      assert.ok(typeof stamp === 'string' && stamp.startsWith('skin:'), `${name} was stamped ${stamp}`);
      assert.ok(resolveCollisionProxyManifest(e), `${name} resolves its measured proxy`);
    }
    assert.equal(spawned.station.data.collisionProxy, 'skin:place_station_trade_hub');
    assert.equal(resolveCollisionProxyManifest(spawned.station).id, 'skin:place_station_trade_hub');
    assert.ok(resolveCollisionProxyManifest(spawned.station).docking, 'station skin keeps the dock block');
    assert.equal(spawned.rock.data.collisionProxy, 'skin:ast_common_rock');
    assert.equal(resolveCollisionProxyManifest(spawned.rock).id, 'skin:ast_common_rock:hull');
  } finally {
    t.cleanup();
  }
});

test('a dynamic hull carrying an old skin stamp (pre-fix save) adopts its measured skin', () => {
  const ship = { ...SPECS.kestrel(), id: 91, alive: true };
  ship.data = { ...ship.data, collisionProxy: 'skin:ship_kestrel' };
  assert.equal(resolveCollisionProxyManifest(ship).id, 'skin:ship_kestrel:polygon');
  // Resolving is cached per entity; repeated resolves hand back the same manifest object.
  const station = { ...SPECS.station(), id: 92, alive: true };
  station.data = { ...station.data, collisionProxy: 'skin:place_station_trade_hub' };
  assert.equal(resolveCollisionProxyManifest(station), resolveCollisionProxyManifest(station));
});

test('SG-02 builds measured geometry for dynamic bodies and the skin for fixed ones', async () => {
  const t = bootCore(4712);
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const spawned = Object.fromEntries(Object.entries(SPECS).map(([name, make]) => [name, t.helpers.spawnEntity(make())]));
    const stale = t.helpers.spawnEntity({ ...SPECS.kestrel(), pos: { x: 0, z: 200 } });
    stale.data.collisionProxy = 'skin:ship_kestrel';
    owner.syncFromEntities(t.state.entityList);
    for (const name of ['kestrel', 'mule', 'wreck', 'chunk']) {
      const rec = owner.records.get(spawned[name].id);
      assert.ok(rec, `${name} has a body`);
      assert.equal(rec.spec.dynamic, true, `${name} is built dynamic`);
      assert.ok(rec.proxyId && rec.proxyId.startsWith('skin:'), `${name} carries a measured proxy`);
      assert.ok(rec.colliders.length >= 1 && rec.colliders.length <= 32, `${name} stays within the primitive bound`);
    }
    const staleRec = owner.records.get(stale.id);
    assert.equal(staleRec.proxyId, 'skin:ship_kestrel:polygon');
    assert.ok(staleRec.colliders.length > 1, 'kestrel silhouette exceeds hull tolerance → fan polygon');
    for (const [name, id] of [['station', 'skin:place_station_trade_hub'], ['rock', 'skin:ast_common_rock:hull']]) {
      const rec = owner.records.get(spawned[name].id);
      assert.ok(rec, `${name} has a body`);
      assert.equal(rec.proxyId, id);
      assert.ok(rec.colliders.length >= 1, `${name} collides with its measured boundary`);
    }
    assert.equal(owner.records.get(spawned.station.id).spec.dynamic, false, 'station is built fixed');
    assert.equal(owner.records.get(spawned.rock.id).colliders.length, 1, 'closed rock compacts to one hull');
    // A second sync must not rebuild anything: the proxy id is stable per entity.
    const before = new Map(Array.from(owner.records, ([id, rec]) => [id, rec.body]));
    owner.syncFromEntities(t.state.entityList);
    for (const [id, body] of before) assert.equal(owner.records.get(id).body, body, `record ${id} rebuilt on resync`);
  } finally {
    owner.dispose();
    t.cleanup();
  }
});
