import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { modelTruthRow } from '../src/data/modelTruth.js';
import { RENDER_PACKAGE_PILOTS } from '../src/render/renderPackageManifest.js';
import { wholeHulkVisualForEntity } from '../src/data/wholeShipVisualIdentity.js';
import { OCCUPATIONAL_HULK_FILE, OCCUPATIONAL_HULK_ROW, OCCUPATIONAL_HULK_SHA256,
  occupationalHulkQualification } from '../src/data/occupationalWreckHulkFit.js';

const row = modelTruthRow(OCCUPATIONAL_HULK_ROW);
const pilot = RENDER_PACKAGE_PILOTS.find(p => p.sourceUrl.endsWith(`/${OCCUPATIONAL_HULK_FILE}`));
const select = (hulkVisual, hulkFactionId = null) => wholeHulkVisualForEntity({ type: 'wreck', data: { hulkVisual, hulkFactionId } })?.file;

test('unskinned Span qualification is bound to the exact adopted measurement and release', () => {
  assert.equal(pilot.sourceSha256, OCCUPATIONAL_HULK_SHA256);
  assert.equal(createHash('sha256').update(readFileSync(pilot.sourceUrl)).digest('hex'), OCCUPATIONAL_HULK_SHA256);
  assert.equal(occupationalHulkQualification(OCCUPATIONAL_HULK_FILE, pilot.sourceSha256, row).row, row);
  assert.equal(occupationalHulkQualification(OCCUPATIONAL_HULK_FILE, 'stale', row), null);
  assert.equal(occupationalHulkQualification(OCCUPATIONAL_HULK_FILE, pilot.sourceSha256, {...row, url: 'other'}), null);
  assert.equal(occupationalHulkQualification(OCCUPATIONAL_HULK_FILE, pilot.sourceSha256, {...row, proposedSkin: {adopted: false}}), null);
});

test('same-file traffic and trader aliases resolve through the actual visual selector', () => {
  for (const visual of [{defId:'ship_mule', trafficRole:'hauler'}, {defId:'ship_mule', lootTableId:'mule_trader'}, {defId:'ship_mule', silhouette:'trader_haul'}])
    assert.equal(select(visual), OCCUPATIONAL_HULK_FILE);
  assert.notEqual(select({defId:'ship_mule', trafficRole:'hauler'}, 'faction_dmc'), OCCUPATIONAL_HULK_FILE);
});
import { wreckHulkCollisionModel, wreckHulkBodyUpgrade } from '../src/data/wreckHulkCollision.js';
import { isPhysicsBoundWholeHulk } from '../src/data/wholeShipVisualIdentity.js';
import { aftermathWrecks, aftermathForSector, victimVisualFor } from '../src/systems/aftermathWrecks.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createSimulation } from '../src/core/sim.js';

const sector = 'sector_helios_prime';
const marker = () => ({ markerId: 'aft_span_test', sectorId: sector, wreckClass:'battlefield',
  pos:{x:1200,z:600}, victimDefId:'ship_mule',
  victimVisual:victimVisualFor({defId:'ship_mule', trafficRole:'hauler'}), victimRadius:14,
  victimMass:180, victimVel:{x:2,z:1}, victimRot:0, wreckHull:1, wreckHullMax:1,
  salvagePool:{cmdty_scrap_metal:3}, t:0, tick:0 });

test('Span produces the tolerance-accepted native hull and preserves operational mass and inertia', async () => {
  const e = {...aftermathWrecks._specForMarker(marker(), {atKill:true}), id:70123, alive:true, occupantGeneration:3};
  const model = wreckHulkCollisionModel(e);
  assert.ok(model); assert.equal(model.file, OCCUPATIONAL_HULK_FILE);
  assert.equal(model.manifest.sourceRow, OCCUPATIONAL_HULK_ROW);
  assert.ok(model.manifest.compactHull?.length > 2); assert.equal(model.manifest.convexParts, undefined);
  assert.ok(isPhysicsBoundWholeHulk(e));
  assert.ok(Math.abs(e.physicsBody.inertiaY - 180 * 14**2 * model.inertiaPerMassRadiusSquared) < 1e-8);
  const native = await createSg02DynamicBodyOwner({publishTelemetry:false});
  try {
    native.syncFromEntities([e]);
    const rec=native.records.get(e.id);
    assert.equal(rec.colliders.length, 1);
    assert.ok(Math.abs(rec.body.mass()-180)<0.001);
    assert.ok(Math.abs(rec.body.principalInertia().y-e.physicsBody.inertiaY)<0.1);
    // Center-line broad-side point belongs to the old 1.16R capsule, not this narrow hull.
    assert.equal(rec.colliders.some(c => c.containsPoint({x:1200,y:0,z:606.9})), false);
  } finally { native.dispose(); }
});

test('Span legacy capsule rebind and serialized identity restore stay idempotent', t => {
  const sim=createSimulation({seed:47047,systems:[aftermathWrecks]});
  t.after(()=>sim.dispose()); sim.state.mode='flight'; sim.state.world.currentSectorId=sector;
  const owner=sim.registry.get('aftermathWrecks');
  owner.deserialize({schemaVersion:3,bySector:{[sector]:[marker()]}});
  const saved=JSON.parse(JSON.stringify(owner.serialize()));
  owner.deserialize(saved);
  const restored=aftermathForSector(sim.state,sector)[0];
  assert.deepEqual(restored.victimVisual,{defId:'ship_mule',trafficRole:'hauler'});
  const old=aftermathWrecks._specForMarker(restored,{atKill:true});
  old.physicsBody={shape:'capsule',mass:180,revision:7};
  delete old.data.hulkCollisionFile; delete old.data.hulkCollisionProfile;
  const e=sim.spawn(old), generation=e.occupantGeneration;
  assert.equal(owner.bindImmediateWreck(restored.markerId,e),e);
  assert.equal(e.physicsBody.revision,8); assert.equal(e.occupantGeneration,generation);
  assert.ok(isPhysicsBoundWholeHulk(e)); assert.equal(wreckHulkBodyUpgrade(e).changed,false);
  const body=e.physicsBody; owner.bindImmediateWreck(restored.markerId,e);
  assert.equal(e.physicsBody,body);
});
