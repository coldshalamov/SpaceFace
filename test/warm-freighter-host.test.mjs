import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse } from '../src/core/physicsAuthority.js';
import { combat } from '../src/systems/combat.js';
import { mining } from '../src/systems/mining.js';
import { aftermathWrecks, aftermathForSector } from '../src/systems/aftermathWrecks.js';
import { materializeAlienEcology, resolveWarmFreighterHost, warmFreighterSiteCenter } from '../src/systems/alienEcology.js';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { WARM_FREIGHTER_HOST as C, warmFreighterAssetToLocal, warmFreighterCollisionModel, warmFreighterWorldScale } from '../src/data/warmFreighter.js';
import { resolveCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';
import { sectorGlobalOrigin, sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { applyFeatureConfigToMaps, snapshotFeatureMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { fitPackagedGroup, wreckPackagedFile } from '../src/render/visualFactory.js';
import { BORROWED_VOICE, BORROWED_VOICE_RECORDERS } from '../src/data/borrowedVoice.js';
import { witnessLineOfSight } from '../src/combat/lineOfSight.js';

const previous = snapshotFeatureMaps();
test.before(() => applyFeatureConfigToMaps(PRODUCTION_FEATURES));
test.after(() => restoreFeatureMaps(previous));
function boot(saved = null) {
  const modules = { physics, combat, mining, aftermathWrecks };
  const sim = createSimulation({ seed: 47,
    systems: PRODUCTION_INIT_ORDER.filter(id => modules[id]).map(id => modules[id]),
    updateOrder: PRODUCTION_UPDATE_ORDER.filter(id => modules[id]).map(id => modules[id]) });
  const state = sim.state;state.mode = 'flight';state.world.currentSectorId = C.sectorId;
  state.world.frameOrigin = { ...sectorGlobalOrigin(C.sectorId) };state.world.frameOriginSeq = 1;
  const center = sectorLocalToGlobalForSector(C.center, C.sectorId);
  const player = sim.spawn({ type: 'ship', hull: 100, mass: 28, radius: 6, physicsBody: false,
    pos: { x: center.x + 200, z: center.z }, data: {} });state.playerId = player.id;
  const owner = sim.registry.get('aftermathWrecks'), events = [];
  for (const name of ['entity:killed', 'news:headline', 'economy:grantCredits', 'mining:yield', 'aftermathWreck:completed'])
    sim.bus.on(name, payload => events.push({ name, payload }));
  const world = { state, bus: sim.bus, helpers: sim.helpers, registry: sim.registry,
    _toGlobal: (point, sector) => sectorLocalToGlobalForSector(point, sector) };
  if (saved) { owner.deserialize(saved);sim.bus.emit('save:loaded', {}); }
  return { sim, state, owner, world, player, events, close: () => sim.dispose() };
}
const marker = h => aftermathForSector(h.state, C.sectorId).find(row => row.markerId === C.markerId);
const hosts = h => h.state.entityList.filter(e => e.alive && e.type === 'wreck' && e.data?.markerId === C.markerId);
const materialize = h => materializeAlienEcology(h.world, { id: C.sectorId }, { dressing: [] }, [ALIEN_SITES.warm_freighter]);

test('ordinary ecology seam admits exactly one canonical global Mule without death, offer, payout or extra wreck ecology', () => {
  const h = boot();try {
    materialize(h);const b = resolveWarmFreighterHost(h.world), host = b.host;
    assert.deepEqual(b.pose, { ...sectorLocalToGlobalForSector(C.center, C.sectorId), rot: 0 });
    assert.equal(host.data.hulkOfDefId, 'ship_mule');assert.deepEqual(host.data.hulkVisual, { defId: 'ship_mule' });
    assert.equal(wreckPackagedFile(host), C.file);assert.equal(host.radius, 18);assert.equal(host.mass, 55);
    assert.equal(host.physicsBody.shape, 'compound');assert.equal(host.physicsBody.mass, 55);assert.equal(host.hull, 1);
    assert.equal(host.data.provenance.source, 'authored_site');
    assert.deepEqual(host.data.salvagePool, { cmdty_scrap_metal: 3, cmdty_salvage_electronics: 1 });
    assert.equal(host.data.salvagePool, marker(h).salvagePool);
    assert.deepEqual(h.events, []);assert.deepEqual(h.state.aftermathWrecks.ecology, {});
    for (let i = 0; i < 3; i++) { h.owner.admitSiteWreck(C.siteId);h.sim.bus.emit('sector:enter', { sectorId: C.sectorId }); }
    assert.equal(hosts(h).length, 1);assert.equal(resolveWarmFreighterHost(h.world).host, host);
    assert.equal(aftermathForSector(h.state, C.sectorId).length, 1);
  } finally { h.close(); }
});

test('canonical asset fit is recentered world scale, not asset-space bounds presented as WU', () => {
  const pkg = JSON.parse(readFileSync(new URL('../assets/ships/release/render-packages/mule-production-v1/render-package.json', import.meta.url)));
  const bounds = pkg.runtime.bounds;
  assert.deepEqual(bounds.center, [C.assetCenter.x, C.assetCenter.y, C.assetCenter.z]);
  assert.deepEqual(bounds.size, [C.assetSize.x, C.assetSize.y, C.assetSize.z]);
  const group = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(...bounds.size));
  mesh.position.fromArray(bounds.center);group.add(mesh);fitPackagedGroup(group, C.radius);
  // BoxGeometry stores Float32 vertices; the package's reported bounds retain doubles.
  assert.ok(Math.abs(group.scale.x - warmFreighterWorldScale()) < 1e-6);
  const point = new THREE.Vector3(...bounds.max);group.updateMatrixWorld(true);point.applyMatrix4(group.matrixWorld);
  const local = warmFreighterAssetToLocal({ x: bounds.max[0], y: bounds.max[1], z: bounds.max[2] });
  assert.ok(Math.abs(point.x - local.x) < 1e-5);assert.ok(Math.abs(local.x - 18) < 1e-8);
  assert.ok(local.z > 7 && local.z < 8);mesh.geometry.dispose();mesh.material.dispose();
});

test('the fresh and restored site use the fitted native Mule outline, not the old wreck capsule', async () => {
  const first = boot(); let restored;
  try {
    const host = first.owner.admitSiteWreck(C.siteId).host;
    const model = warmFreighterCollisionModel();
    assert.equal(model.manifest.compactHull.length, 16);
    assert.equal(resolveCollisionProxyManifest(host)?.id, 'warm-freighter:mule:packaged-fit-v1');
    const expectedInertia = 55 * C.radius ** 2 * model.inertiaPerMassRadiusSquared;
    assert.ok(expectedInertia > 5600 && expectedInertia < 5800);
    assert.notEqual(expectedInertia, .5 * 55 * C.radius ** 2);
    const verifyNative = async (fixture, entity) => {
      const owner = fixture.sim.registry.get('physics');
      assert.equal(await owner.prepareBackend(fixture.state), true);
      const record = owner._sg02.records.get(entity.id);
      assert.equal(record.entity, entity);
      assert.equal(record.colliders.length, 1, 'the compact measured hull is one native collider');
      assert.ok(Math.abs(record.body.mass() - 55) < .001);
      assert.ok(Math.abs(record.spec.inertiaY - expectedInertia) < .001);
      const origin = record.body.translation();
      const inside = (x, z) => record.colliders[0].containsPoint({ x: origin.x + x, y: origin.y, z: origin.z + z });
      assert.equal(inside(0, 0), true, 'the real body blocks its interior');
      assert.equal(inside(17, 0), true, 'the actual measured hull reaches the long end');
      assert.equal(inside(0, 10.3), false, 'no solid air beyond the full fitted visual width');
      return record;
    };
    const oldRecord = await verifyNative(first, host);
    restored = boot(first.owner.serialize());
    const rebound = restored.owner.admitSiteWreck(C.siteId).host;
    assert.notEqual(rebound, host);
    const newRecord = await verifyNative(restored, rebound);
    assert.notEqual(newRecord, oldRecord, 'a restored host owns a new native body and collider');
    assert.equal(rebound.hull, 1);
    assert.deepEqual(rebound.data.salvagePool, host.data.salvagePool);
  } finally { first.close(); restored?.close(); }
});

test('native impulse moves the same finite body and owner Continue restores exact pose, momentum, pool and binding', async () => {
  const h = boot();let r;try {
    const b = h.owner.admitSiteWreck(C.siteId), host = b.host, generation = host.occupantGeneration;
    const physicsOwner = h.sim.registry.get('physics');assert.equal(await physicsOwner.prepareBackend(h.state), true);
    const rec = physicsOwner._sg02.records.get(host.id);assert.ok(rec.body.isDynamic());
    assert.ok(Math.abs(rec.body.mass() - 55) < .001);assert.equal(rec.entity, host);
    const before = { ...host.pos };queuePhysicsImpulse(host, { x: 5.5, y: 0, z: 2.75 });queuePhysicsTorqueImpulse(host, { x: 0, y: .05, z: 0 });
    for (let i = 0; i < 12; i++) h.sim.step(1/60);
    assert.equal(host.occupantGeneration, generation);assert.equal(h.state.entities.get(host.id), host);
    assert.ok(Math.hypot(host.pos.x - before.x, host.pos.z - before.z) > .005);
    assert.deepEqual(warmFreighterSiteCenter(h.world), { x: host.pos.x, z: host.pos.z });
    host.data.salvagePool.cmdty_scrap_metal--;
    const saved = h.owner.serialize(), expected = { pos: { x: host.pos.x, z: host.pos.z }, vel: { x: host.vel.x, z: host.vel.z }, rot: host.rot, spin: host.angVel };
    r = boot(saved);const next = r.owner.admitSiteWreck(C.siteId).host;
    assert.deepEqual({ pos: { x: next.pos.x, z: next.pos.z }, vel: { x: next.vel.x, z: next.vel.z }, rot: next.rot, spin: next.angVel }, expected);
    assert.deepEqual(next.data.salvagePool, { cmdty_scrap_metal: 2, cmdty_salvage_electronics: 1 });
    assert.equal(next.data.markerId, host.data.markerId);assert.equal(next.data.hulkOfDefId, C.defId);
    r.sim.bus.emit('sector:exit', { sectorId: C.sectorId });r.sim.bus.emit('sector:enter', { sectorId: C.sectorId });
    assert.equal(hosts(r).length, 1);assert.equal(r.owner.admitSiteWreck(C.siteId).host, next);
  } finally { r?.close();h.close(); }
});

test('real wreck salvage retires once and terminal suppression survives Continue, reentry and marker caps', () => {
  const h = boot();let r;try {
    const host = h.owner.admitSiteWreck(C.siteId).host;
    for (let i = 0; i < 9 && host.alive; i++) h.sim.registry.get('mining')._drainWreck(h.player, host, 18, 1);
    assert.equal(host.alive, false);assert.equal(marker(h).siteOutcome, 'exhausted');
    assert.equal(h.events.filter(e => e.name === 'aftermathWreck:completed').length, 1);
    const total = h.events.filter(e => e.name === 'mining:yield').reduce((n, e) => n + e.payload.qty, 0);assert.equal(total, 4);
    assert.equal(h.owner.admitSiteWreck(C.siteId), null);
    // Exercise the existing record cap with genuine ordinary recovery admissions.
    for (let i = 0; i < 10; i++) h.owner.offerRecoveryWreck({ sectorId: C.sectorId, victimId: `cap-${i}`, pos: host.pos });
    const saved = h.owner.serialize();r = boot(saved);
    assert.equal(marker(r).siteOutcome, 'exhausted');assert.equal(r.owner.admitSiteWreck(C.siteId), null);
    materialize(r);assert.equal(hosts(r).length, 0);
    assert.equal((r.state.world.dressing?.rows || []).filter(row => row.data.siteId === C.siteId).length, 0);
    assert.equal(r.events.filter(e => e.name === 'mining:yield').length, 0);
  } finally { r?.close();h.close(); }
});

test('ordinary collision damage retires the real wreck through combat and survives Continue', async () => {
  const h = boot();let r;try {
    materialize(h);
    const host = h.owner.admitSiteWreck(C.siteId).host;
    assert.ok(h.state.world.dressing.rows.some(row => row.data.warmFreighterHostMarkerId === C.markerId));
    assert.equal(await h.sim.registry.get('physics').prepareBackend(h.state), true);h.sim.step(1/60);
    // Ordinary wrecks use collision damage, not the ship gun-target catalog. Feed
    // the existing consequence/router boundary; no synthetic entity:killed event.
    const result = collisionConsequences._routeImpactDamage.call({ registry: h.sim.registry }, host, h.player,
      { impactDamage: 10, surface: 'craft', pos: { ...host.pos }, normal: { x: 1, z: 0 },
        provenance: { actorId: h.player.id, weaponId: null, tag: 'native-contact' } });
    assert.equal(marker(h).siteOutcome, 'destroyed', JSON.stringify({ result, alive: host.alive, hull: host.hull }));assert.equal(h.owner.admitSiteWreck(C.siteId), null);
    assert.equal(h.state.world.dressing.rows.filter(row => row.data.warmFreighterHostMarkerId === C.markerId).length, 0);
    r = boot(h.owner.serialize());materialize(r);assert.equal(hosts(r).length, 0);assert.equal(marker(r).siteOutcome, 'destroyed');
  } finally { r?.close();h.close(); }
});

test('claimed or same-ID replacement references cannot grant a fresh ecology host', () => {
  for (const kind of ['claimed', 'recycled', 'missing', 'foreign-owner']) {
    const h = boot();let r;try {
      const host = h.owner.admitSiteWreck(C.siteId).host;
      if (kind === 'claimed') host.data.playerOwned = true;
      if (kind === 'foreign-owner') host.data.persistenceOwner = 'actual-claim-owner';
      if (kind === 'recycled') host.occupantGeneration++;
      if (kind === 'missing') h.state.entities.delete(host.id);
      assert.equal(resolveWarmFreighterHost(h.world), null, kind);assert.equal(warmFreighterSiteCenter(h.world), null, kind);
      if (kind === 'claimed' || kind === 'foreign-owner') {
        const saved = h.owner.serialize();r = boot(saved);assert.equal(marker(r).siteOutcome, 'claimed');
        assert.equal(r.owner.admitSiteWreck(C.siteId), null);assert.equal(resolveWarmFreighterHost(r.world), null);
        if (kind === 'claimed') assert.equal(hosts(r)[0].data.playerOwned, true);
        else assert.equal(hosts(r).length, 0, 'foreign custody owns restoration, never adopted back');
      } else if (kind === 'recycled') {
        assert.equal(h.owner.admitSiteWreck(C.siteId), null);assert.equal(hosts(h).length, 1);
      }
    } finally { r?.close();h.close(); }
  }
});

test('incoming Save ordering defers host admission and resumes only dressing, including old saves without a site marker', () => {
  const source = boot();let saved;
  try { materialize(source);saved = source.owner.serialize(); } finally { source.close(); }
  for (const snapshot of [saved, { schemaVersion: 3, bySector: {} }]) {
    const h = boot();try {
      h.sim.bus.emit('save:restoring', {});
      materialize(h);assert.equal(hosts(h).length, 0);
      const fauna = h.state.entityList.filter(e => e.type === 'fauna').map(e => e.id);
      assert.equal(fauna.length, 7);
      h.owner.deserialize(snapshot);h.sim.bus.emit('save:loaded', {});
      assert.equal(hosts(h).length, 1);assert.ok(resolveWarmFreighterHost(h.world));
      assert.equal(h.state.world.dressing.rows.filter(row => row.data.warmFreighterHostMarkerId === C.markerId).length, 12);
      assert.deepEqual(h.state.entityList.filter(e => e.type === 'fauna').map(e => e.id), fauna, 'late host never duplicates real fauna');
    } finally { h.close(); }
  }
});

test('native Mule leaves the repaired-frame authored BorrowedVoice signal segments clear', async () => {
  const h = boot();try {
    const host = h.owner.admitSiteWreck(C.siteId).host;
    assert.equal(await h.sim.registry.get('physics').prepareBackend(h.state), true);h.sim.step(1/60);
    const receiver = sectorLocalToGlobalForSector(BORROWED_VOICE.center, C.sectorId);
    for (const recorder of BORROWED_VOICE_RECORDERS) {
      const pos = sectorLocalToGlobalForSector({ x: BORROWED_VOICE.center.x + recorder.offset.x,
        z: BORROWED_VOICE.center.z + recorder.offset.z }, C.sectorId);
      assert.equal(witnessLineOfSight(h.state, { id: -1, pos }, receiver), true, recorder.id);
    }
    assert.equal(witnessLineOfSight(h.state, { id: -1, pos: { x: host.pos.x - 60, z: host.pos.z } },
      { x: host.pos.x + 60, z: host.pos.z }), false, 'control query confirms the actual solid hulk blocks a crossing');
  } finally { h.close(); }
});
