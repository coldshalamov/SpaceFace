import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { readGlbJson, sceneFromGlbJson } from '../scripts/lib/renderPackageRuntimeTable.mjs';
import { CERES_WORKFLEET_CONTRACT as C } from '../src/data/ceresWorkfleet.js';
import { ceresWorkfleetHardwareSpec } from '../src/data/ceresWorkfleetHardware.js';
import { normalizeCeresWorkfleetPackageNodes } from '../src/render/ceresWorkfleetPackageNodes.js';
import { createCeresWorkfleetPropulsionDriver, createCeresWorkfleetMotionDriver } from '../src/render/ceresWorkfleetVisuals.js';
import { createCeresCradleKeeperMask, installCeresCradleLayoutGuard } from '../src/render/ceresCradleLayoutVisuals.js';
import { buildPlacePropRootSteps } from '../src/render/partsLibrary.js';
import { bindCeresCradleLayout, admitCeresCradleLayout, readCeresCradleLayout, canPublishCeresCradleLayout,
  readCeresCradlePublicLayout, bindCeresCradlePublicLayout } from '../src/core/ceresWorkfleetLayoutAdmission.js';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { markPhysicsBodyNativeFailure, clearPhysicsBodyNativeFailure } from '../src/core/physicsAuthority.js';
import { applySpawnInfos } from '../scripts/lib/simReadModel.mjs';
import { captureEntityRecord, spawnSpecFromRecord } from '../src/world/worldRecords.js';

const keys = { breaker:'ceres-breaker', cradle:'ceres-section-cradle', cutterHead:'ceres-breaker-cutter-head' };
function fixture(role) {
  const dir = `assets/ships/release/render-packages/${keys[role]}`;
  const metadata = JSON.parse(readFileSync(`${dir}/render-package.json`));
  const graph = readGlbJson(readFileSync(`${dir}/render.glb`));
  const asset = C.assets[role];
  const entity = {...ceresWorkfleetHardwareSpec(role), id: 1, occupantGeneration: 7};
  const tags = new Map(metadata.runtime.primitives.map(p => [p.name, p.tags]));
  const makeScene = () => sceneFromGlbJson(graph);
  return {metadata, graph, asset, entity, tags, makeScene};
}
function nodes(root) { const result=[]; root.traverse(n=>result.push(n)); return result; }

test('actual package graphs preserve Ceres semantic carriers while admitting named independent drawables', () => {
  for (const role of ['breaker','cradle','cutterHead']) {
    const f=fixture(role), root=f.makeScene(), plan=nodes(root);
    const expected=role==='cradle' ? 'LOD0_HOOK_CERES_DEPTH_KEEPER_Armor' : f.asset.propulsion.channels[0].coreMeshes[0];
    const carrier=root.getObjectByName(expected), mesh=carrier.children[0];
    assert.equal(carrier.isMesh, undefined); assert.equal(mesh.isMesh, true);
    const matrix=carrier.matrix.clone(), geometry=mesh.geometry;
    const overrides=normalizeCeresWorkfleetPackageNodes(f.asset.assetId,plan,f.tags);
    assert.strictEqual(root.getObjectByName(expected),mesh);
    assert.strictEqual(mesh.parent,carrier); assert.strictEqual(mesh.geometry,geometry);
    assert.deepEqual(carrier.matrix.elements,matrix.elements);
    assert.equal(carrier.userData.spacefaceRenderPackageSemantic.rawNodeName,expected);
    assert.equal(overrides.get(mesh).instance,false);
    if (role!=='cradle') {
      const driver=createCeresWorkfleetPropulsionDriver(root,f.entity);
      assert.ok(driver); driver.dispose();
    }
  }
});

test('malformed carriers do not become accepted machinery', () => {
  const f=fixture('breaker'), root=f.makeScene(), plan=nodes(root);
  const name=f.asset.propulsion.channels[0].coreMeshes[0], carrier=root.getObjectByName(name);
  carrier.children[0].position.x=1;
  normalizeCeresWorkfleetPackageNodes(f.asset.assetId,plan,f.tags);
  assert.strictEqual(root.getObjectByName(name),carrier);
  assert.throws(()=>createCeresWorkfleetPropulsionDriver(root,f.entity),/missing a sealed propulsion/);
});

test('compiled cradle keepers retain authored world poses for both layouts and slide endpoints', () => {
  const f=fixture('cradle'), reference=f.makeScene(), actual=f.makeScene(), plan=nodes(actual);
  const overrides=normalizeCeresWorkfleetPackageNodes(f.asset.assetId,plan,f.tags);
  for(const n of plan)if(overrides?.has(n))n.userData.spacefaceTags=overrides.get(n);
  const mask=createCeresCradleKeeperMask(actual,f.entity);
  assert.equal(mask.valid,true);
  const referenceMotion=createCeresWorkfleetMotionDriver(reference,f.entity);
  const actualMotion=createCeresWorkfleetMotionDriver(actual,f.entity);
  for(const root of [reference,actual]){root.position.set(4,2,-9);root.rotation.y=.71;root.scale.setScalar(2);}
  for(const slide of [0,1])for(const layout of ['open-v1','keepers-v2'])for(const lod of ['lod0','lod1','lod2']) {
    f.entity.data.ceresWorkfleetSlide=slide;referenceMotion(f.entity);actualMotion(f.entity);
    assert.equal(mask.apply(layout,lod),true);reference.updateMatrixWorld(true);actual.updateMatrixWorld(true);
    for(let level=0;level<3;level++)for(const finish of ['Armor','BrushedMetal','Warning']) {
      const name=`LOD${level}_HOOK_CERES_DEPTH_KEEPER_${finish}`;
      const expected=reference.getObjectByName(name),mesh=actual.getObjectByName(name);
      expected.matrixWorld.elements.forEach((value,i)=>assert.ok(Math.abs(value-mesh.matrixWorld.elements[i])<1e-10,`${name} matrix ${i}`));
      assert.equal(mesh.visible,layout==='keepers-v2'&&lod===`lod${level}`);
    }
  }
  mask.dispose();
});

test('real place composition accepts the compiled cradle and cutter hierarchy', () => {
  for (const role of ['cradle','cutterHead']) {
    const f=fixture(role), geometry=new THREE.BoxGeometry(1,1,1), material=new THREE.MeshStandardMaterial();
    const primitive = f.metadata.runtime.primitives.map(p=>({name:p.name,tags:{...p.tags,instance:false},geometry,material,matrix:new THREE.Matrix4()}));
    const record={assetId:f.asset.assetId,url:`assets/ships/release/parts/${f.asset.file}`,slot:'place',
      bounds:{size:[100,50,100],center:[0,0,0],min:[-50,-25,-50],max:[50,25,50]},primitives:primitive,markers:[],
      renderPackage:{assetId:f.asset.assetId,contentHash:'fixture',createInstance(){
        const root=f.makeScene(); root.traverse(n=>{if(n.isMesh){n.geometry=geometry;n.material=material;}});
        return {root,planNodes:nodes(root),dispose(){}};
      }}};
    const scene=new THREE.Scene(), boundary=new THREE.Group();scene.add(boundary);
    const steps=buildPlacePropRootSteps(f.entity,record,scene,boundary,{layoutEntity:f.entity});
    let step=steps.next();while(!step.done)step=steps.next();
    const root=step.value.root;
    assert.ok(root);
    if(role==='cradle')assert.ok(root.userData.ceresCradleLayoutGuard);
    else assert.ok(root.userData.updateCeresPhysicalState);
    root.userData.detachAuthoredMotion?.();
  }
});

test('worker-shaped cradle mirror cannot inherit the native constructor receipt', () => {
  const f=fixture('cradle'), nativeState={entities:new Map([[f.entity.id,f.entity]])};
  assert.equal(bindCeresCradleLayout(f.entity,nativeState),'keepers-v2');
  const mirror={entities:new Map()};
  applySpawnInfos(mirror,[{entityId:f.entity.id,occupantGeneration:f.entity.occupantGeneration,
    type:f.entity.type,alive:true,data:f.entity.data}]);
  const row=mirror.entities.get(f.entity.id);
  assert.equal(row.data.ceresWorkfleetCradleLayout,'keepers-v2');
  assert.equal(readCeresCradleLayout(row,mirror),null);
  assert.equal(canPublishCeresCradleLayout(row,mirror),false);
});

test('only a current native cradle body can authorize and revoke a worker mirror layout', async () => {
  const sim=createSimulation({seed:47,systems:[]}), state=sim.state;
  state.world.currentSectorId=C.sectorId;
  const entity=sim.spawn(ceresWorkfleetHardwareSpec('cradle'));
  const native=await createSg02DynamicBodyOwner({publishTelemetry:false});
  try {
    assert.equal(bindCeresCradleLayout(entity,state),'keepers-v2');
    assert.equal(readCeresCradlePublicLayout(entity,state,native,8),null,'selected recipe is not a body');
    native.syncFromEntities([entity]);
    const receipt=readCeresCradlePublicLayout(entity,state,native,8);
    assert.equal(receipt?.layout,'keepers-v2');assert.equal(receipt.bodyRevision,entity.physicsBody.revision);
    assert.strictEqual(readCeresCradlePublicLayout(entity,state,native,8),receipt,'unchanged native life reuses its public receipt');
    const mirror={entities:new Map(),world:{currentSectorId:C.sectorId}};
    applySpawnInfos(mirror,[{entityId:entity.id,occupantGeneration:entity.occupantGeneration,
      type:entity.type,alive:true,data:entity.data}]);
    const row=mirror.entities.get(entity.id);
    assert.equal(bindCeresCradlePublicLayout(row,mirror,receipt,7),false,'wrong world lifetime');
    assert.equal(bindCeresCradlePublicLayout(row,mirror,receipt,8),true);
    assert.equal(readCeresCradleLayout(row,mirror),'keepers-v2');
    assert.equal(canPublishCeresCradleLayout(row,mirror),true);
    const f=fixture('cradle'), root=f.makeScene(), plan=nodes(root), boundary=new THREE.Group();
    const overrides=normalizeCeresWorkfleetPackageNodes(f.asset.assetId,plan,f.tags);
    for(const n of plan)if(overrides?.has(n))n.userData.spacefaceTags=overrides.get(n);
    boundary.add(root);row.mesh=boundary;mirror.render={contextRecovery:{pending:false}};
    const guard=installCeresCradleLayoutGuard(root,row,boundary);
    guard.rebind(row,mirror);assert.equal(guard.publish(row,mirror),true);
    mirror.render.contextRecovery.pending=true;guard.refresh(row,mirror);assert.equal(root.visible,false);
    mirror.render.contextRecovery.pending=false;guard.refresh(row,mirror);assert.equal(root.visible,true,'same native life survives GPU context recovery');
    assert.equal(bindCeresCradlePublicLayout(row,mirror,{...receipt,bodyRevision:-1},8),false);
    assert.equal(readCeresCradleLayout(row,mirror),null,'invalid update revokes');
    guard.refresh(row,mirror);assert.equal(root.visible,false);
    assert.equal(bindCeresCradlePublicLayout(row,mirror,receipt,8),true);
    row.occupantGeneration++;assert.equal(canPublishCeresCradleLayout(row,mirror),false);
    row.occupantGeneration--;bindCeresCradlePublicLayout(row,mirror,null,8);
    assert.equal(readCeresCradleLayout(row,mirror),null,'explicit removal revokes');
    const failure=markPhysicsBodyNativeFailure(entity,native);
    assert.equal(readCeresCradlePublicLayout(entity,state,native,8),null);
    clearPhysicsBodyNativeFailure(entity,native,failure);
    entity.physicsBody.revision++;
    assert.equal(readCeresCradlePublicLayout(entity,state,native,8),null,'unsynchronized revision');
    guard.dispose();
  } finally {native.dispose();sim.dispose();}
});

test('legacy cradle receipt waits for materialization and the native nine-collider body', async () => {
  const sim=createSimulation({seed:48,systems:[]}),state=sim.state;
  state.world.currentSectorId=C.sectorId;
  const fresh=sim.spawn(ceresWorkfleetHardwareSpec('cradle'));
  const record=JSON.parse(JSON.stringify(captureEntityRecord(fresh,{sectorId:C.sectorId,tick:1})));
  delete record.itinerary.ceresWorkfleet.cradleLayout;
  const legacy=sim.spawn(spawnSpecFromRecord(record));
  const native=await createSg02DynamicBodyOwner({publishTelemetry:false});
  try {
    assert.equal(bindCeresCradleLayout(legacy,state),'open-v1');
    assert.equal(readCeresCradlePublicLayout(legacy,state,native,8),null,'pending materialization cannot authorize');
    assert.equal(admitCeresCradleLayout(state,null,legacy).status,'legacy');
    native.syncFromEntities([legacy]);
    const receipt=readCeresCradlePublicLayout(legacy,state,native,8);
    assert.equal(receipt?.layout,'open-v1');assert.equal(receipt.proxyId,'ceres-workfleet:cradle:open:v1');
    assert.equal(native.records.get(legacy.id).colliders.length,9);
    state.entities.delete(legacy.id);
    assert.equal(readCeresCradlePublicLayout(legacy,state,native,8),null,'removed life cannot authorize');
  } finally {native.dispose();sim.dispose();}
});
