import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SHIPS } from '../src/data/ships.js';
import { modelTruthRow } from '../src/data/modelTruth.js';
import { wreckHulkCollisionModel, wreckHulkBodyUpgrade } from '../src/data/wreckHulkCollision.js';
import { isPhysicsBoundWholeHulk, wholeHulkVisualForEntity } from '../src/data/wholeShipVisualIdentity.js';
import { fitPackagedGroup, wreckPackagedFile } from '../src/render/visualFactory.js';
import { aftermathWrecks, aftermathForSector } from '../src/systems/aftermathWrecks.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { save, preflightSaveImport } from '../src/save/saveSystem.js';
import { encodeSavePayloadFinal, restorePrepareSaveJsonAsync } from '../src/save/saveWorker.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { WARM_FREIGHTER_HOST, warmFreighterCollisionModel } from '../src/data/warmFreighter.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { applySpawnInfos, createReadModel } from '../scripts/lib/simReadModel.mjs';

const sector = 'sector_helios_prime';
const counts = { atlas: 1, bastion: 8, colossus: 8, drifter: 9, hawser: 10, hornet: 10,
  ironback: 7, kestrel: 12, leviathan: 7, mule: 1, pelican: 6, ranger: 10, saucer: 1, warden: 1, wasp: 8 };
function marker(defId = 'ship_hawser') {
  const ship = SHIPS.find(s => s.id === defId);
  return { markerId: `aft_full_hulk_${defId}`, sectorId: sector, wreckClass: 'battlefield',
    pos: { x: 1200, z: 600 }, victimDefId: defId, victimVisual: { defId },
    victimRadius: ship.collisionRadius, victimMass: ship.mass,
    victimVel: { x: 8, z: -3 }, victimAngVel: .23, victimRot: .41, victimPitch: .08, victimBank: -.12,
    wreckHull: 1, wreckHullMax: 1, salvagePool: { cmdty_scrap_metal: 3 }, t: 0, tick: 0 };
}
function spec(defId) { return aftermathWrecks._specForMarker(marker(defId), { atKill: true }); }
function fixture(t, systems = [aftermathWrecks]) {
  const sim = createSimulation({ seed: 47047, systems });
  sim.state.mode = 'flight'; sim.state.world.currentSectorId = sector;
  t.after(() => { sim.registry.get('physics')?._sg02?.dispose(); sim.dispose(); });
  return sim;
}
function loadMarker(sim, value = marker()) {
  const owner = sim.registry.get('aftermathWrecks');
  owner.deserialize({ schemaVersion: 3, bySector: { [sector]: [value] } });
  return { owner, value: aftermathForSector(sim.state, sector)[0] };
}
function inside(p, vertices) {
  let yes = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i], b = vertices[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x) yes = !yes;
  }
  return yes;
}

test('all fifteen exact releases use fitted measured geometry; native parts retain declined concavities', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    for (const [name, expected] of Object.entries(counts)) {
      const id = `ship_${name}`, e = { ...spec(id), id: 70001, alive: true, occupantGeneration: 4 };
      const model = wreckHulkCollisionModel(e), row = modelTruthRow(id);
      assert.equal(isPhysicsBoundWholeHulk(e), true, id);
      assert.equal(model.file, wreckPackagedFile(e));
      assert.equal(row.url, `assets/ships/release/parts/${model.file}`);
      assert.equal(wreckHulkCollisionModel(e), model, 'normalized model is cached');
      assert.equal(expected === 1, !!model.manifest.compactHull, id);
      assert.equal(expected === 1, !model.manifest.convexParts, id);
      // Exercise the actual render fitter over the already measured asset-space box.
      const box = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(...row.bounds.size));
      mesh.position.fromArray(row.bounds.center); box.add(mesh);
      fitPackagedGroup(box, e.radius); box.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(box), size = bounds.getSize(new THREE.Vector3());
      assert.ok(bounds.getCenter(new THREE.Vector3()).length() < 1e-5, id);
      assert.ok(Math.abs(Math.max(size.x, size.y, size.z) - 2*e.radius) < 1e-5, id);
      const tolerance = row.collider.toleranceWu * 2*row.gameplay.entityRadius / Math.max(...row.worldSize)
        * e.radius / row.gameplay.entityRadius;
      const xs = model.outline.map(p => p.x*e.radius), zs = model.outline.map(p => p.z*e.radius);
      assert.ok(Math.abs(Math.max(...xs)-Math.min(...xs)-size.x) <= 2*tolerance, id);
      assert.ok(Math.abs(Math.max(...zs)-Math.min(...zs)-size.z) <= 2*tolerance, id);
      owner.syncFromEntities([e]);
      const rec = owner.records.get(e.id);
      assert.equal(rec.colliders.length, expected, id);
      assert.ok(Math.abs(rec.body.mass()-e.mass) < .001, id);
      if (expected > 1) {
        const vertices = model.outline;
        const notch = vertices.map((b, i) => {
          const a = vertices[(i+vertices.length-1)%vertices.length], c = vertices[(i+1)%vertices.length];
          const cross = (b.x-a.x)*(c.z-b.z)-(b.z-a.z)*(c.x-b.x);
          return cross < 0 ? { x: (a.x+b.x+c.x)/3, z: (a.z+b.z+c.z)/3 } : null;
        }).find(p => p && !inside(p, vertices));
        assert.ok(notch, `${id}: an actual declined concavity exists`);
        const c = Math.cos(e.rot), s = Math.sin(e.rot);
        const p = { x: e.pos.x+(notch.x*c-notch.z*s)*e.radius, y: 0,
          z: e.pos.z+(notch.x*s+notch.z*c)*e.radius };
        assert.equal(rec.colliders.some(c => c.containsPoint(p)), false, `${id}: notch remains empty`);
      }
      mesh.geometry.dispose();
    }
  } finally { owner.dispose(); }
});

test('owner fresh/adopted body upgrade is idempotent and retains real body identity, custody and attachment', async t => {
  const sim = fixture(t), { owner, value } = loadMarker(sim);
  const old = spec('ship_hawser');
  old.physicsBody = { shape: 'capsule', mass: old.mass, revision: 7 };
  delete old.data.hulkCollisionFile; delete old.data.hulkCollisionProfile;
  const e = sim.spawn(old), generation = e.occupantGeneration;
  e.data.claimedBy = 'player'; e.data.custodyOwner = 'salvage';
  const pool = e.data.salvagePool = value.salvagePool;
  const pose = [e.pos.x, e.pos.z, e.rot, e.pitch, e.bank, e.vel.x, e.vel.z, e.angVel, e.mass];
  const native = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  t.after(() => native.dispose());
  const tow = sim.spawn({ type: 'ship', radius: 3, mass: 24, pos: { x: e.pos.x-60, z: e.pos.z },
    physicsBody: { shape: 'ball', mass: 24 }, data: {} });
  native.syncFromEntities([e, tow]);
  assert.ok(native.createAttachment({ attachmentId: 'full-hulk-line', defId: 'test_legacy_rope',
    ownerId: tow.id, targetId: e.id, sourceAnchorLocal: { x: 1, z: 0 }, targetAnchorLocal: { x: -2, z: 0 },
    restLength: 60, spring: { mode: 'legacy_rope' } }));
  const line = native.attachments.get('full-hulk-line');
  assert.equal(owner.bindImmediateWreck(value.markerId, e), e);
  assert.equal(e.physicsBody.revision, 8);
  native.syncFromEntities([e, tow]);
  assert.equal(native.attachments.get('full-hulk-line'), line);
  assert.equal(line.target.entity, e);
  assert.equal(e.occupantGeneration, generation);
  assert.equal(isPhysicsBoundWholeHulk(e), true);
  assert.deepEqual([e.pos.x,e.pos.z,e.rot,e.pitch,e.bank,e.vel.x,e.vel.z,e.angVel,e.mass], pose);
  assert.equal(e.data.salvagePool, pool);
  assert.equal(e.data.claimedBy, 'player'); assert.equal(e.data.custodyOwner, 'salvage');
  const body = e.physicsBody;
  owner.bindImmediateWreck(value.markerId, e);
  assert.equal(e.physicsBody, body); assert.equal(body.revision, 8);
  const fresh = sim.spawn(spec('ship_hawser'));
  assert.equal(wreckHulkBodyUpgrade(fresh).changed, false);
  owner._spawned.clear(); e.alive = false;
  const freshBody = fresh.physicsBody;
  assert.equal(owner.bindImmediateWreck(value.markerId, fresh), fresh);
  assert.equal(fresh.physicsBody, freshBody); assert.equal(freshBody.revision, 1);
});

test('fragments, custom bodies, unknown/variant identities and stale capsules cannot claim physical alignment', () => {
  const base = spec('ship_mule');
  for (const data of [{ fracturePiece: 'remainder' }, { fractureVisual: { partId: 'corvette_turret' } },
    { collisionTearOff: true }, { placeId: 'place_any' }, { hulkFactionId: 'faction_pitborn' },
    { hulkVisual: { defId: 'ship_wasp', lootTableId: 'wasp_swarmer' } },
    { hulkVisual: { defId: 'missing' }, hulkOfDefId: 'missing' }]) {
    const e = { ...base, data: { ...base.data, ...data } };
    assert.equal(wreckHulkCollisionModel(e), null);
    assert.equal(isPhysicsBoundWholeHulk(e), false);
  }
  for (const body of [{ shape: 'ball' }, { shape: 'capsule', useMeasuredSkin: false },
    { shape: 'compound', collisionProxyManifest: { id: 'custom' } },
    { useMeasuredSkin: false }]) {
    const e = { ...base, physicsBody: { ...base.physicsBody, ...body } };
    assert.equal(wreckHulkBodyUpgrade(e), null);
    assert.equal(isPhysicsBoundWholeHulk(e), false);
  }
  assert.equal(isPhysicsBoundWholeHulk({ ...base, physicsBody: { shape: 'capsule' } }), false);
  const alias = { type: 'wreck', data: { hulkOfDefId: 'ship_kestrel',
    hulkVisual: { defId: 'ship_kestrel', assetRef: 'asset.slice.meridian_recovery_tug' } } };
  assert.equal(wreckHulkCollisionModel(alias).defId, 'ship_hawser');
  assert.equal(wholeHulkVisualForEntity(alias).file, 'wholeships/yard_tug.glb');
  const site = aftermathWrecks._specForMarker({ ...marker('ship_mule'),
    markerId: WARM_FREIGHTER_HOST.markerId, sectorId: WARM_FREIGHTER_HOST.sectorId,
    siteId: WARM_FREIGHTER_HOST.siteId, source: 'authored_site' });
  assert.equal(site.physicsBody.collisionProxyManifest, warmFreighterCollisionModel().manifest);
  assert.equal(isPhysicsBoundWholeHulk(site), true, 'existing Mule profile gains the motion binding');
  const cached = spec('ship_mule'); assert.equal(isPhysicsBoundWholeHulk(cached), true);
  cached.data.hulkVisual.defId = 'ship_wasp';
  assert.equal(isPhysicsBoundWholeHulk(cached), false, 'in-place identity mutation invalidates predicate cache');
});

test('declined live fragment/custom adoption clears stale stamps without replacing geometry', t => {
  const sim = fixture(t), { owner, value } = loadMarker(sim);
  for (const patch of [{ fracturePiece: 'remainder', fractureVisual: { defId: 'ship_hawser' } }, {}]) {
    const e = sim.spawn(spec('ship_hawser'));
    Object.assign(e.data, patch);
    const body = e.physicsBody = { shape: 'ball', mass: 70, revision: 11 };
    owner.bindImmediateWreck(value.markerId, e);
    assert.equal(e.physicsBody, body);
    assert.equal(e.data.hulkCollisionFile, undefined);
    assert.equal(e.data.hulkCollisionProfile, undefined);
    // Make the second fixture a distinct unbound marker life.
    owner._spawned.clear(); e.alive = false;
  }
});

test('real typed Save with an actual old capsule/native cache uses authoritative cold owner fallback', async t => {
  const sim = fixture(t, [aftermathWrecks, physics, save]);
  const player = sim.spawn({ type: 'ship', isPlayer: true, radius: 3, mass: 24,
    hull: 100, hullMax: 100, pos: { x: 1000, z: 600 }, data: { defId: 'ship_kestrel' },
    physicsBody: { shape: 'capsule', mass: 24 }, flags: {} });
  sim.state.playerId = player.id;
  const { owner, value } = loadMarker(sim);
  // Historical production capsule contract, instantiated in the real native owner.
  // The typed/native payload below is captured by SaveSystem, never fabricated or stripped.
  const old = spec('ship_hawser'); old.physicsBody = { shape: 'capsule', mass: old.mass };
  delete old.data.hulkCollisionFile; delete old.data.hulkCollisionProfile;
  const e = sim.spawn(old); owner._bindLiveMarker(value, e);
  const phys = sim.registry.get('physics'), saver = sim.registry.get('save');
  assert.equal(await phys.prepareBackend(sim.state), true);
  assert.equal(phys._sg02.records.get(e.id).colliders.length, 1);
  const captured = saver.serialize('full-hulk-old-capsule');
  assert.equal(captured.data.physics.schema, 4);
  assert.ok(captured.data.physics.snapshot.length > 0);
  const { data, ...descriptor } = captured;
  const encoded = await encodeSavePayloadFinal({ descriptor, data }); assert.equal(encoded.ok, true);
  const prepared = await restorePrepareSaveJsonAsync(encoded.json, CURRENT_VERSION);
  assert.equal(prepared.ok, true); assert.equal(preflightSaveImport(prepared.env).ok, true);
  const cold = fixture(t, [aftermathWrecks, physics, save]);
  const coldPhys = cold.registry.get('physics'), coldSaver = cold.registry.get('save');
  assert.equal(await coldPhys.prepareBackend(cold.state), true);
  assert.equal(coldPhys._sg02.records.size, 0, 'fresh native owner has no outgoing body/cache');
  assert.equal(coldSaver.loadEnvelope(prepared.env, 'full-hulk-old-capsule'), true);
  const restored = cold.state.entityList.find(e => e.alive && e.data?.provenance?.markerId === value.markerId);
  assert.ok(restored); assert.equal(isPhysicsBoundWholeHulk(restored), true);
  assert.equal(coldPhys._sg02.records.get(restored.id).colliders.length, 10);
  assert.equal(cold.state.physicsRuntime.nativeRestore.mode, 'scalar');
  assert.equal(cold.state.physicsRuntime.nativeRestore.exact, false);
  assert.deepEqual([restored.rot,restored.pitch,restored.bank,restored.vel.x,restored.vel.z,restored.angVel,restored.mass],
    [e.rot,e.pitch,e.bank,e.vel.x,e.vel.z,e.angVel,e.mass]);
  assert.deepEqual(restored.data.salvagePool, { cmdty_scrap_metal: 3 });
  assert.ok(coldSaver.serialize('full-hulk-after-fallback').data.physics.snapshot.length > 0);
  console.log('full-hulk old native restore:', JSON.stringify(cold.state.physicsRuntime.nativeRestore));
});

test('production worker entity-info transports the binding stamp into the ordinary presentation facade', async () => {
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 47,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const e = lane.host.runtime.spawn(spec('ship_saucer'));
    const reply = await lane.tick({ tick: 1, steps: 0, commands: [], ackEnd: init.initRebuild?.end ?? 0 });
    const info = reply.spawnInfos.find(row => row.entityId === e.id);
    assert.ok(info); assert.equal(info.data.hulkCollisionProfile, e.data.hulkCollisionProfile);
    const read = createReadModel(); applySpawnInfos(read, [info]);
    const facade = read.entities.get(e.id);
    assert.equal(facade.physicsBody, undefined, 'no heavy collision model is needed by presentation');
    assert.equal(isPhysicsBoundWholeHulk(facade), true);
    assert.notEqual(facade.data, e.data);
  } finally { lane.shutdown(); }
});
