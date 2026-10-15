import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ORCHARD_GEOMETRY as G, orchardFrameBodySpec, orchardPodBodySpec } from '../src/data/anvilOrchardBody.js';
import { isOrchardFrame, isOrchardPod, ORCHARD_FRAME_FILE, ORCHARD_POD_FILE } from '../src/data/anvilOrchardIdentity.js';
import { ensurePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { entityRequiresAuthoredPresentation, hasExplicitAuthoredPayloadPresentation } from '../src/core/presentationAdmission.js';
import { authoredPayloadDrawScale, authoredPayloadFileForEntity, authoredPayloadSlotForEntity,
  buildAuthoredCargoCapsule, upgradeAuthoredCargoCapsuleBoundaryForProbe,
  buildAuthoredPlaceProp, resolvePlaceDrawScale, resolvePlaceFileForEntity,
  upgradeAuthoredPlaceBoundaryForProbe } from '../src/render/partsLibrary.js';
import { installVisualOverrides } from '../src/render/visualOverrides.js';
import { wreckPackagedFile } from '../src/render/visualFactory.js';

function frame() {
  const e={id:'orchard-frame',type:'wreck',alive:true,hull:1000,radius:G.radius,
    physicsBody:orchardFrameBodySpec(), data:{orchardId:'anvil_storm_orchard',orchardKind:'frame',
      worldRecordId:G.worldRecordId,placeId:'place_anvil_storm_orchard',
      authoredAssetId:G.assetId,authoredPayloadAssetId:G.assetId,masslineTetherable:false}};
  ensurePhysicsBodySpec(e);return e;
}
function pod(dynamic=false) {
  const e={id:'orchard-pod',type:'payload',alive:true,hull:40,radius:G.pod.radius,
    physicsBody:orchardPodBodySpec({dynamic,revision:dynamic?2:1}),
    data:{orchardId:'anvil_storm_orchard',orchardKind:'pod',worldRecordId:'anvil_storm_orchard:0:1',
      identityKey:'anvil_storm_orchard:0:1',authoredAssetId:G.pod.assetId,authoredPayloadAssetId:G.pod.assetId}};
  ensurePhysicsBodySpec(e);return e;
}
const marker=(name,position)=>({name,matrix:new THREE.Matrix4().makeTranslation(...position),
  tags:{socket:true,socketRole:'attachment'},userData:{}});
const record=(assetId,file,bounds,markers)=>({assetId,url:file,slot:'place',bounds,primitives:[],markers});
const vec=(node)=>node.getWorldPosition(new THREE.Vector3()).toArray();
const near=(a,b)=>a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<1e-8,`${a} != ${b}`));

const options=record=>({releaseMode:true,loadAuthoredPart:async()=>record,
  prepareAuthoredPipelines:async()=>({skipped:false})});

test('only canonical frame and finite source pods select exact source files/scale and require admission',()=>{
  const f=frame();assert.ok(isOrchardFrame(f));assert.ok(entityRequiresAuthoredPresentation(f));
  assert.equal(resolvePlaceFileForEntity(f),ORCHARD_FRAME_FILE);assert.equal(wreckPackagedFile(f),ORCHARD_FRAME_FILE);
  assert.equal(resolvePlaceDrawScale(f.data,{entity:f,targetRadius:900,authoredEnvelope:10,censusScale:99}),1);
  for(const dynamic of [false,true]) {
    const p=pod(dynamic);assert.ok(isOrchardPod(p));assert.ok(hasExplicitAuthoredPayloadPresentation(p));
    assert.equal(authoredPayloadFileForEntity(p),ORCHARD_POD_FILE);
    assert.equal(authoredPayloadSlotForEntity(p),'place');assert.equal(authoredPayloadDrawScale(p,90,2),1);
  }
  let calls=0;const expected=new THREE.Group(),factory={build:()=>{throw new Error('generic wreck fallback');}};
  installVisualOverrides(factory,{authoredPlaceBuilder:()=>{calls++;return expected;}});
  assert.equal(factory.build(f),expected);assert.equal(calls,1);
});

test('impostors and source/hash/point mismatches cannot acquire the physical basis override',()=>{
  const changes=[
    e=>e.data.orchardId='other', e=>e.data.orchardKind='other',e=>e.data.authoredAssetId='other',
    e=>e.physicsBody.collisionProxyManifest.sourceSha='0'.repeat(64),
    e=>e.physicsBody.collisionProxyManifest.sourceGlbSha256='1'.repeat(64),
    e=>e.physicsBody.collisionProxyManifest.convexParts[0].points[0].x+=.001,
    e=>e.physicsBody.collisionProxyManifest.primitives[0].hx+=.001,
    e=>e.physicsBody.radius++, e=>e.physicsBody.useMeasuredSkin=true,
  ];
  for(const mutate of changes) {
    const f=frame();mutate(f);assert.equal(isOrchardFrame(f),false);
    assert.notEqual(resolvePlaceDrawScale(f.data,{entity:f,targetRadius:900,authoredEnvelope:10,censusScale:99}),1);
    const p=pod();mutate(p);assert.equal(isOrchardPod(p),false);
    assert.equal(hasExplicitAuthoredPayloadPresentation(p),false);
    assert.equal(authoredPayloadFileForEntity(p),'pods/pod_cargo_container.glb');
  }
  const lookalike=pod();lookalike.type='pickup';assert.equal(isOrchardPod(lookalike),false);
  const lot=pod();lot.data.identityKey='duplicate';assert.equal(isOrchardPod(lot),false);
  const ordinary={type:'payload',alive:true,radius:3,data:{authoredPayloadAssetId:'pod_cargo_container'}};
  assert.equal(authoredPayloadDrawScale(ordinary,3,5),1.2);
});

test('real place composer preserves the neutral root, every socket and pivot at source scale1',async()=>{
  const f=frame(),fallback=new THREE.Group(),scene=new THREE.Scene();
  f.data.placeTargetRadius=999;f.data.poi=true;
  const boundary=buildAuthoredPlaceProp(f,{fallbackRoot:fallback,releaseMode:true});scene.add(boundary);
  boundary.position.set(130,0,-240);boundary.rotation.y=.37;
  const markers=[...G.sockets.map(s=>marker(s.node,s.position)),...G.rigs.map(r=>marker(r.node,r.pivotGltf))];
  const rec=record(G.assetId,ORCHARD_FRAME_FILE,G.bounds,markers);
  assert.equal(await upgradeAuthoredPlaceBoundaryForProbe(boundary,fallback,f,ORCHARD_FRAME_FILE,{},scene,options(rec)),true);
  scene.updateMatrixWorld(true);
  for(const m of markers) {
    const expected=new THREE.Vector3().setFromMatrixPosition(m.matrix).applyMatrix4(boundary.matrixWorld).toArray();
    near(vec(boundary.getObjectByName(m.name)),expected);
  }
  assert.equal(boundary.userData.authoredAssetState,'authored');
  assert.equal(boundary.children.find(c=>c.userData.authoredWorldScale)?.userData.authoredWorldScale,1);
});

test('real payload composer preserves coupler and tether coordinates in fixed and released modes',async()=>{
  for(const dynamic of [false,true]) {
    const p=pod(dynamic),fallback=new THREE.Group(),scene=new THREE.Scene();
    const boundary=buildAuthoredCargoCapsule(p,{fallbackRoot:fallback,releaseMode:true});scene.add(boundary);
    const markers=[marker('SOCKET_Orchard_Coupler',[-2.12,0,0]),marker('SOCKET_Tether_Massline',[2,0,0])];
    const rec=record(G.pod.assetId,ORCHARD_POD_FILE,G.pod.bounds,markers);
    assert.equal(await upgradeAuthoredCargoCapsuleBoundaryForProbe(boundary,fallback,p,{},scene,options(rec)),true);
    scene.updateMatrixWorld(true);
    near(vec(boundary.getObjectByName('SOCKET_Orchard_Coupler')),[-2.12,0,0]);
    near(vec(boundary.getObjectByName('SOCKET_Tether_Massline')),[2,0,0]);
  }
});

test('missing release data cannot publish an authored Orchard body',async()=>{
  const f=frame(),fallback=new THREE.Group(),scene=new THREE.Scene();
  const boundary=buildAuthoredPlaceProp(f,{fallbackRoot:fallback,releaseMode:true});scene.add(boundary);
  const ok=await upgradeAuthoredPlaceBoundaryForProbe(boundary,fallback,f,ORCHARD_FRAME_FILE,{},scene,{
    releaseMode:true,loadAuthoredPart:async()=>null,prepareAuthoredPipelines:async()=>({skipped:false}),
  });
  assert.equal(ok,false);assert.notEqual(boundary.userData.authoredAssetState,'authored');
});
