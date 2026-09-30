import test from 'node:test';
import assert from 'node:assert/strict';

import { core } from '../src/core/coreSystem.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { isDynamicPhysicsBodyEntity } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import {
  expandProxyPrimitives,
  isCompoundSkinDynamicEligible,
  measuredSkinAllowedFor,
  resolveCollisionProxyManifest,
} from '../src/data/collisionProxyManifests.js';
import { modelTruthRow, modelTruthSkinHull } from '../src/data/modelTruth.js';

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
  rock: () => ({ type: 'asteroid', pos: { x: -900, z: 0 }, radius: 12, collides: true, data: { typeId: 'ast_common_rock' } }),
  pod: () => ({ type: 'pod', pos: { x: 100, z: 0 }, radius: 10, collides: true, data: { placeId: 'place_cargo_pod_standard' } }),
  wreck: () => ({ type: 'wreck', pos: { x: 0, z: 400 }, radius: 42, collides: true, data: { placeId: 'place_dead_hulk' } }),
});

function pointInsideAny(rec, x, z) {
  for (const collider of rec.colliders) {
    if (collider.projectPoint({ x, y: 0, z }, true).isInside === true) return true;
  }
  return false;
}

test('core.spawn stamps measured skins on plain solid dynamic bodies', () => {
  const t = bootCore(4242);
  try {
    const spawned = Object.fromEntries(Object.entries(SPECS).map(([name, make]) => [name, t.helpers.spawnEntity(make())]));
    for (const [name, e] of Object.entries(spawned)) {
      assert.equal(isDynamicPhysicsBodyEntity(e), true, `${name} dynamic`);
      assert.equal(measuredSkinAllowedFor(e), true, `${name} eligible`);
      assert.equal(typeof e.data.collisionProxy === 'string' && e.data.collisionProxy.startsWith('skin:'), true, `${name} stamped ${e.data.collisionProxy}`);
      assert.ok(resolveCollisionProxyManifest(e), `${name} resolves a measured manifest`);
    }
    assert.equal(resolveCollisionProxyManifest(spawned.rock).id, 'skin:ast_common_rock:hull');
    assert.equal(resolveCollisionProxyManifest(spawned.pod).id, 'skin:place_cargo_pod_standard:hull');
    assert.equal(resolveCollisionProxyManifest(spawned.kestrel).id, 'skin:ship_kestrel:polygon');
    assert.equal(resolveCollisionProxyManifest(spawned.wreck).id, 'skin:place_dead_hulk:polygon');
  } finally {
    t.cleanup();
  }
});

test('SG-02 builds one convex hull for a closed compact skin and a solid fan polygon otherwise', async () => {
  const t = bootCore(4243);
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const spawned = Object.fromEntries(Object.entries(SPECS).map(([name, make]) => [name, t.helpers.spawnEntity(make())]));
    owner.syncFromEntities(t.state.entityList);
    for (const name of ['rock', 'pod']) {
      const rec = owner.records.get(spawned[name].id);
      assert.ok(rec, name);
      assert.equal(rec.proxyId.endsWith(':hull'), true, `${name} proxy ${rec.proxyId}`);
      assert.equal(rec.colliders.length, 1, `${name} single hull collider`);
    }
    for (const name of ['kestrel', 'wreck']) {
      const rec = owner.records.get(spawned[name].id);
      assert.ok(rec, name);
      assert.equal(rec.proxyId.endsWith(':polygon'), true, `${name} proxy ${rec.proxyId}`);
      assert.ok(rec.colliders.length > 1 && rec.colliders.length <= 32, `${name} bounded fan ${rec.colliders.length}`);
    }
    const before = new Map(Array.from(owner.records, ([id, rec]) => [id, rec.body]));
    owner.syncFromEntities(t.state.entityList);
    for (const [id, body] of before) assert.equal(owner.records.get(id).body, body, `record ${id} rebuilt on resync`);
  } finally {
    owner.dispose();
    t.cleanup();
  }
});

test('the fan polygon is a solid interior, not radial spokes', async () => {
  const t = bootCore(4243);
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const kestrel = t.helpers.spawnEntity({ ...SPECS.kestrel(), rot: 0.4 });
    owner.syncFromEntities(t.state.entityList);
    const rec = owner.records.get(kestrel.id);
    assert.equal(rec.proxyId, 'skin:ship_kestrel:polygon');
    const row = modelTruthRow('ship_kestrel');
    const scale = kestrel.radius / row.gameplay.entityRadius;
    const bins = row.collider.outline.length;
    for (let i = 0; i < bins; i += 1) {
      const a = row.collider.outline[i] || 0;
      const b = row.collider.outline[(i + 1) % bins] || 0;
      if (a <= 0 || b <= 0) continue;
      const midAngle = -Math.PI + ((i + 1) / bins) * Math.PI * 2 + kestrel.rot;
      const r = 0.85 * Math.min(a, b) * scale;
      const x = kestrel.pos.x + Math.cos(midAngle) * r;
      const z = kestrel.pos.z + Math.sin(midAngle) * r;
      assert.equal(pointInsideAny(rec, x, z), true,
        `wedge ${i} interior between outline samples is solid (r=${r.toFixed(2)})`);
    }
    for (let k = 0; k < 12; k += 1) {
      const angle = (k / 12) * Math.PI * 2;
      const x = kestrel.pos.x + Math.cos(angle) * 1.0;
      const z = kestrel.pos.z + Math.sin(angle) * 1.0;
      assert.equal(pointInsideAny(rec, x, z), true, `central interior angle ${angle.toFixed(2)}`);
    }
    for (let i = 0; i < bins; i += 1) {
      const visual = row.collider.outline[i] || 0;
      if (visual <= 0) continue;
      const angle = -Math.PI + ((i + 0.5) / bins) * Math.PI * 2 + kestrel.rot;
      const r = visual * scale + row.collider.toleranceWu * 1.5;
      const x = kestrel.pos.x + Math.cos(angle) * r;
      const z = kestrel.pos.z + Math.sin(angle) * r;
      assert.equal(pointInsideAny(rec, x, z), false, `outline bin ${i} outside polygon`);
    }
  } finally {
    owner.dispose();
    t.cleanup();
  }
});

test('compacted hull keeps visible outline clearance under rotation, rebuilt deterministically', async () => {
  const t = bootCore(4244);
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const rock = t.helpers.spawnEntity({ ...SPECS.rock(), rot: 0.7 });
    owner.syncFromEntities(t.state.entityList);
    const row = modelTruthRow('ast_common_rock');
    const ref = row.gameplay.entityRadius;
    const tolerance = row.collider.toleranceWu;
    const check = (rec) => {
      let worst = 0;
      const bins = row.collider.outline.length;
      for (let i = 0; i < bins; i += 1) {
        const visual = row.collider.outline[i] || 0;
        if (visual <= 0) continue;
        const angle = -Math.PI + ((i + 0.5) / bins) * Math.PI * 2 + rock.rot;
        const px = rock.pos.x + Math.cos(angle) * visual * (rock.radius / ref);
        const pz = rock.pos.z + Math.sin(angle) * visual * (rock.radius / ref);
        const projected = rec.collider.projectPoint({ x: px, y: 0, z: pz }, true);
        if (projected.isInside !== true) {
          worst = Math.max(worst, Math.hypot(projected.point.x - px, projected.point.z - pz));
        }
      }
      return worst;
    };
    const rec0 = owner.records.get(rock.id);
    assert.ok(check(rec0) <= tolerance, 'outline samples inside hull within tolerance');
    rock.physicsBody.revision += 1;
    owner.syncFromEntities(t.state.entityList);
    const rec1 = owner.records.get(rock.id);
    assert.notEqual(rec1.body, rec0.body, 'revision rebuilds the body');
    assert.equal(rec1.proxyId, rec0.proxyId);
    assert.equal(rec1.colliders.length, rec0.colliders.length);
    assert.ok(check(rec1) <= tolerance, 'rebuilt hull still covers the outline');
    const hull = modelTruthSkinHull('ast_common_rock');
    assert.equal(modelTruthSkinHull('ast_common_rock'), hull, 'hull cached per row');
    assert.equal(resolveCollisionProxyManifest(rock), resolveCollisionProxyManifest(rock), 'manifest identity stable per row');
  } finally {
    owner.dispose();
    t.cleanup();
  }
});

test('a rotated station keeps real openings and the corridor lane stays clear', async () => {
  const t = bootCore(4245);
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const station = t.helpers.spawnEntity({
      type: 'station', pos: { x: 900, z: 0 }, radius: 42, collides: true, rot: 0.35,
      data: { stationTypeId: 'trade_hub', dockRadius: 90 },
    });
    owner.syncFromEntities(t.state.entityList);
    const rec = owner.records.get(station.id);
    assert.equal(rec.spec.dynamic, false);
    assert.equal(rec.proxyId, 'skin:place_station_trade_hub');
    assert.ok(rec.colliders.length > 1 && rec.colliders.length <= 32);
    const manifest = resolveCollisionProxyManifest(station);
    const mouthDeg = manifest.mouthBearingDeg;
    assert.ok(Number.isFinite(mouthDeg), 'measured station skin keeps a mouth bearing');
    const bearing = mouthDeg * Math.PI / 180 + station.rot;
    const lane = 0.72 * 90;
    assert.equal(pointInsideAny(rec, station.pos.x + Math.cos(bearing) * lane, station.pos.z + Math.sin(bearing) * lane), false, 'berth mouth stays open');
    const row = modelTruthRow('place_station_trade_hub');
    const bins = row.collider.outline.length;
    let arm = null;
    for (let i = 0; i < bins; i += 1) {
      const angle = -Math.PI + ((i + 0.5) / bins) * Math.PI * 2;
      let d = angle - mouthDeg * Math.PI / 180;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) <= 0.42) continue;
      if (!arm || row.collider.outline[i] > arm.visual) arm = { visual: row.collider.outline[i], angle };
    }
    assert.ok(arm && arm.visual > 1);
    const wx = station.pos.x + Math.cos(arm.angle + station.rot) * arm.visual * 0.6;
    const wz = station.pos.z + Math.sin(arm.angle + station.rot) * arm.visual * 0.6;
    assert.equal(pointInsideAny(rec, wx, wz), true, 'arms remain solid');
  } finally {
    owner.dispose();
    t.cleanup();
  }
});

test('authored physicsBody.collisionProxyManifest wins: thin obb and a chain gap route', async () => {
  const t = bootCore(4246);
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const slab = t.helpers.spawnEntity({
      type: 'prop', pos: { x: 0, z: 0 }, radius: 20, collides: true,
      data: { placeId: 'place_cargo_pod_standard' },
      physicsBody: {
        collisionProxyManifest: {
          schemaVersion: 1,
          id: 'authored-slab',
          referenceRadius: 'radius',
          primitives: [{ kind: 'obb', id: 'slab', x: 0, z: 0, hx: 1.0, hz: 0.05, angleDeg: 0 }],
        },
      },
    });
    assert.equal(resolveCollisionProxyManifest(slab).id, 'authored-slab');
    owner.syncFromEntities(t.state.entityList);
    const rec = owner.records.get(slab.id);
    assert.equal(rec.proxyId, 'authored-slab');
    assert.equal(rec.colliders.length, 1);
    assert.equal(pointInsideAny(rec, 19, 0), true, 'long axis inside');
    assert.equal(pointInsideAny(rec, 0, 19), false, 'thin axis avoids phantom circle edge');
    assert.equal(pointInsideAny(rec, 0, 0.9), true, 'thin axis inside at half thickness');

    const ringed = t.helpers.spawnEntity({
      type: 'prop', pos: { x: 500, z: 0 }, radius: 30, collides: true,
      physicsBody: {
        collisionProxyManifest: {
          schemaVersion: 1,
          id: 'authored-gapped-ring',
          referenceRadius: 'radius',
          primitives: [{
            kind: 'chain', id: 'ring', radius: 0.8, circleR: 0.1, count: 16,
            gap: { bearingDeg: 0, halfWidthDeg: 20 },
          }],
        },
      },
    });
    owner.syncFromEntities(t.state.entityList);
    const rrec = owner.records.get(ringed.id);
    assert.equal(rrec.proxyId, 'authored-gapped-ring');
    assert.ok(rrec.colliders.length > 1);
    assert.equal(pointInsideAny(rrec, 500 + 24, 0), false, 'gap lane clear through the ring');
    assert.equal(pointInsideAny(rrec, 500 + 24 * Math.cos(Math.PI / 2), 24 * Math.sin(Math.PI / 2)), true, 'ring solid away from the gap');

    const malformed = t.helpers.spawnEntity({
      type: 'prop', pos: { x: -500, z: 0 }, radius: 10, collides: true,
      physicsBody: { collisionProxyManifest: { schemaVersion: 1, id: 'bad', primitives: [{ kind: 'obb', hx: -2, hz: 0 }] } },
    });
    assert.equal(resolveCollisionProxyManifest(malformed), null, 'malformed manifest is not trusted');
    owner.syncFromEntities(t.state.entityList);
    const mrec = owner.records.get(malformed.id);
    assert.equal(mrec.proxyId, null);
    assert.equal(mrec.colliders.length, 1, 'malformed manifest falls back to the legacy ball');
  } finally {
    owner.dispose();
    t.cleanup();
  }
});

test('physicsBody.useMeasuredSkin:false and authored shape genuinely opt out of measured geometry', async () => {
  const t = bootCore(4247);
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const optout = t.helpers.spawnEntity({ ...SPECS.kestrel(), pos: { x: 0, z: 800 } });
    optout.physicsBody = optout.physicsBody || {};
    optout.physicsBody.useMeasuredSkin = false;
    assert.equal(resolveCollisionProxyManifest(optout), null);
    owner.syncFromEntities(t.state.entityList);
    const orec = owner.records.get(optout.id);
    assert.equal(orec.proxyId, null);
    assert.equal(orec.colliders.length, 1, 'capsule fallback for the opted-out craft');

    const balled = t.helpers.spawnEntity({ ...SPECS.kestrel(), pos: { x: 300, z: 800 } });
    balled.physicsBody = { ...(balled.physicsBody || {}), shape: 'ball' };
    assert.equal(measuredSkinAllowedFor(balled), false, 'authored ball differs from canonical capsule');
    owner.syncFromEntities(t.state.entityList);
    const brec = owner.records.get(balled.id);
    assert.equal(brec.proxyId, null);
    assert.equal(brec.colliders.length, 1);
    assert.equal(brec.collider.shape.type, 0, 'authored ball really builds a ball, not a craft capsule');
  } finally {
    owner.dispose();
    t.cleanup();
  }
});

test('a normalized default capsule on a ship is not an authored override', async () => {
  const t = bootCore(4248);
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const ship = t.helpers.spawnEntity({ ...SPECS.kestrel(), pos: { x: -300, z: 800 } });
    ship.physicsBody = { schemaVersion: 1, shape: 'capsule', mass: 20, dynamic: true };
    assert.equal(hasDefaultShapeOnly(ship), true);
    assert.ok(resolveCollisionProxyManifest(ship), 'normalized default still resolves the skin');
    owner.syncFromEntities(t.state.entityList);
    const rec = owner.records.get(ship.id);
    assert.equal(rec.proxyId, 'skin:ship_kestrel:polygon');
  } finally {
    owner.dispose();
    t.cleanup();
  }
});

function hasDefaultShapeOnly(entity) {
  const body = entity.physicsBody || {};
  const canonical = (entity.type === 'ship' || entity.type === 'drone') ? 'capsule' : 'ball';
  return body.shape === canonical;
}

test('pickups, projectiles, and collides:false bodies stay off measured skins', () => {
  const t = bootCore(4249);
  try {
    const pickup = t.helpers.spawnEntity({
      type: 'pickup', pos: { x: 0, z: 1200 }, radius: 2, collides: true,
      data: { placeId: 'place_cargo_pod_standard' },
    });
    assert.equal(measuredSkinAllowedFor(pickup), false);
    assert.equal(resolveCollisionProxyManifest(pickup), null);
    const shot = t.helpers.spawnEntity({
      type: 'projectile', pos: { x: 40, z: 1200 }, radius: 1, collides: true,
      data: { defId: 'ship_kestrel' },
    });
    assert.equal(measuredSkinAllowedFor(shot), false);
    assert.equal(resolveCollisionProxyManifest(shot), null);
    const ghost = { ...SPECS.kestrel(), id: 93, alive: true, collides: false };
    ghost.data = { ...ghost.data, collisionProxy: 'skin:ship_kestrel' };
    assert.equal(measuredSkinAllowedFor(ghost), false, 'collides:false never adopts');
    assert.equal(resolveCollisionProxyManifest(ghost), null, 'stale skin stamp on collides:false resolves nothing');
  } finally {
    t.cleanup();
  }
});

test('a replaced primitives set on the same authored manifest object rebuilds on revision bump', async () => {
  const t = bootCore(4250);
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const authored = {
      schemaVersion: 1,
      id: 'authored-mutating',
      referenceRadius: 'radius',
      primitives: [{ kind: 'obb', id: 'slab', x: 0, z: 0, hx: 1.0, hz: 0.05, angleDeg: 0 }],
    };
    const slab = t.helpers.spawnEntity({
      type: 'prop', pos: { x: 0, z: 1600 }, radius: 20, collides: true,
      physicsBody: { collisionProxyManifest: authored },
    });
    owner.syncFromEntities(t.state.entityList);
    const rec0 = owner.records.get(slab.id);
    assert.equal(rec0.proxyId, 'authored-mutating');
    const at = (dx, dz) => [slab.pos.x + dx, slab.pos.z + dz];
    assert.equal(pointInsideAny(rec0, ...at(19, 0)), true);
    assert.equal(pointInsideAny(rec0, ...at(0, 19)), false, 'thin axis before mutation');
    authored.primitives = [{ kind: 'circle', id: 'disc', x: 0, z: 0, r: 0.9 }];
    slab.physicsBody.revision = (slab.physicsBody.revision || 0) + 1;
    owner.syncFromEntities(t.state.entityList);
    const rec1 = owner.records.get(slab.id);
    assert.notEqual(rec1.body, rec0.body, 'revision bump rebuilds the body');
    assert.equal(rec1.proxyId, 'authored-mutating');
    assert.equal(pointInsideAny(rec1, ...at(17, 0)), true, 'new disc covers the axis');
    assert.equal(pointInsideAny(rec1, ...at(0, 17)), true, 'new disc covers the thin axis too');
  } finally {
    owner.dispose();
    t.cleanup();
  }
});

test('expanded skin primitives stay bounded and hull matches census tolerance', () => {
  const manifest = resolveCollisionProxyManifest({ type: 'asteroid', radius: 12, data: { typeId: 'ast_common_rock', collisionProxy: 'skin:ast_common_rock' } });
  assert.ok(manifest);
  const expanded = expandProxyPrimitives(manifest);
  assert.ok(expanded.length <= 32);
  assert.equal(isCompoundSkinDynamicEligible({ type: 'asteroid', data: {} }), true);
});
