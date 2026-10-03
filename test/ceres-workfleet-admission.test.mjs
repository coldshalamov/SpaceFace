import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSimulation } from '../src/core/sim.js';
import { CERES_WORKFLEET_CONTRACT as C } from '../src/data/ceresWorkfleet.js';
import { ceresWorkfleetHardwareSpec } from '../src/data/ceresWorkfleetHardware.js';
import { reconcileCeresWorkfleetPresentation } from '../src/systems/ceresWorkfleet.js';
import { ensureActivityClassified } from '../src/world/activityRuntime.js';
import {
  isPhysicalMachinery, machineryPresentationFamily, machineryRequestedPresentation,
  machineryPresentationPlace, machineryHasEffectivePresentation, machineryDesiredPresentationReady,
  recordCeresWorkfleetAuthoredSource,
  registerMachineryReconciliation, reconcileMachineryBeforePhysics, invalidateMachineryPresentation,
} from '../src/core/machineryPresentation.js';
import {
  presentationAllowsPlayerFacingAction, presentationAllowsTargetLock,
  presentationOwnerAdmissionForWorldRecord,
} from '../src/core/presentationAdmission.js';
import { markPhysicsBodyNativeFailure, clearPhysicsBodyNativeFailure } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { physics } from '../src/core/physics.js';
import { segmentHitsProxy, witnessLineOfSight } from '../src/combat/lineOfSight.js';
import { render, runWebGlContextRestoreRebuild, disposeRendererOwnedResources } from '../src/render/renderer.js';
import { buildAuthoredPlaceProp, upgradeAuthoredPlaceBoundaryForProbe, wrapShipWithAuthoredParts,
  preloadAuthoredAssetsForEntity, invalidatePartsLibraryCaches, wholeShipVisualForEntity } from '../src/render/partsLibrary.js';
import { ceresWorkfleetVisualRigs, ceresWorkfleetPropulsionAwake } from '../src/render/ceresWorkfleetVisuals.js';
import { attachAuthoredMotionDriver } from '../src/render/authoredMotion.js';
import { installCeresCradleLayoutGuard } from '../src/render/ceresCradleLayoutVisuals.js';
import { recordCeresWorkfleetActuation } from '../src/core/ceresWorkfleetActuation.js';

const roles=['breaker','cradle','cutterHead'];
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function fixture({browser=true}={}) {
  const sim=createSimulation({seed:621,systems:[]}),state=sim.state;
  state.world.currentSectorId=C.sectorId;
  const entities=roles.map(role=>sim.spawn({...ceresWorkfleetHardwareSpec(role),pos:{x:0,z:0},rot:0}));
  const calls=[];
  const owner={state,_reconcileAnvilPresentation(){calls.push('anvil');},_reconcileCeresWorkfleetPresentation(){
    calls.push('ceres');
    reconcileCeresWorkfleetPresentation(this);
  }};
  registerMachineryReconciliation(state,owner);
  const t={sim,state,entities,owner,calls};
  if(browser) {
    const scene=new THREE.Scene(),renderer={};
    state.render={scene,renderer,admissionRunGeneration:1,compileObjectPipelines:async()=>({ready:true})};
    const view=Object.create(render);
    Object.assign(view,{state,scene,renderer,_meshes:new Map(),_meshesVersion:0,
      _frameMembrane:{toLocal:p=>p},_shadowPolicyOptions:()=>({}),
      _presentationWorld:{handleForEntityId:id=>({id}),bindMesh:()=>true,unbindMesh:()=>true},
      _persistentSubmitLanes:{reserve(){},release(){}}});
    t.view=view;
  }
  reconcile(t);
  return t;
}
function reconcile(t){t.state.tick++;reconcileMachineryBeforePhysics(t.state);}
function syncNative(t,native){const a=ensureActivityClassified(t.state);native.syncFromEntityLayers(a.physicsStatics,a.physicsDynamics,a.physicsStaticVersion);}
function root(role,{source=true,file=C.assets[role].file,assetId=C.assets[role].assetId}={}) {
  const m=new THREE.Group();
  m.userData={placeId:C.assets[role].id,authoredAssetState:'authored'};
  if(role==='cradle') {
    for(let lod=0;lod<3;lod++)for(const finish of ['Armor','BrushedMetal','Warning']) {
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());
      mesh.name=`LOD${lod}_HOOK_CERES_DEPTH_KEEPER_${finish}`;
      mesh.userData.spacefaceTags={lod:`lod${lod}`,instance:false};m.add(mesh);
    }
    // These abstract source/lifetime fixtures model an already compiled root. Its
    // truthful per-instance layout receipt still comes through the real guard.
    let guard;
    m.userData.rebindCeresCradleLayout=(entity,state)=>{
      if(!guard)guard=installCeresCradleLayoutGuard(m,entity,m);
      guard?.rebind(entity,state);return guard?.publish(entity,state);
    };
    m.userData.updateCeresCradleLayout=(entity,state)=>guard?.refresh(entity,state);
  }
  if(source)recordCeresWorkfleetAuthoredSource(m,{assetId,file});
  return m;
}
function mount(t,e,m=root(e.data.ceresWorkfleetRole)) {
  t.view.scene.add(m);t.view._meshes.set(e.id,m);t.view._bindPresentationMesh(e,m);return m;
}
function evict(t,e) {
  const m=e.mesh;t.view._unbindPresentationMesh(e.id,m);t.view._meshes.delete(e.id);
  m.removeFromParent();e.mesh=e.view=null;reconcile(t);
}
function admitted(t,e) {
  assert.equal(machineryHasEffectivePresentation(e,t.state),true);
  assert.equal(machineryDesiredPresentationReady(e,t.state),true);
  assert.equal(presentationAllowsPlayerFacingAction(e,t.state),true);
  assert.equal(presentationAllowsTargetLock(e,t.state),true);
}
function closed(t,e) {
  assert.equal(machineryHasEffectivePresentation(e,t.state),false);
  assert.equal(machineryDesiredPresentationReady(e,t.state),false);
  assert.equal(presentationAllowsPlayerFacingAction(e,t.state),false);
  assert.equal(presentationAllowsTargetLock(e,t.state),false);
}
function query(e) {
  const role=e.data.ceresWorkfleetRole,box=C.assets[role].states?.open.boxes[0]||C.assets[role].boxes[0];
  const a={x:box.center.x-box.size.x/2-2,z:box.center.z};
  const b={x:box.center.x+box.size.x/2+2,z:box.center.z};
  const projectile={id:-1,type:'projectile',radius:.1,collisionMask:-1};
  const hit=physics._bestProjectileTarget.call({_segmentHitScratch:{},_bestSegmentHitScratch:{}},projectile,a,b,[e],null);
  return {hit,los:segmentHitsProxy(e,a,b),clear:witnessLineOfSight({entities:new Map([[e.id,e]])},{id:-10,pos:a},b)};
}
function placeRecord(role,overrides={}) {
  const a=C.assets[role],size=[a.dimensions.x/2,a.dimensions.y/2,a.dimensions.z/2];
  const geometry=new THREE.BoxGeometry(...size),material=new THREE.MeshStandardMaterial();
  return {url:`assets/ships/release/parts/${a.file}`,assetId:a.assetId,slot:'place',
    bounds:{min:size.map(v=>-v/2),max:size.map(v=>v/2),size,center:[0,0,0]},
    primitives:[{key:`${role}:fixture`,name:'LOD0_Body',geometry,
      material,matrix:new THREE.Matrix4(),tags:{lod:'lod0'}}],markers:[],
    renderPackage:{assetId:a.assetId,contentHash:`${role}-admission-fixture`,createInstance(){
      const root=new THREE.Group(),mesh=new THREE.Mesh(geometry,material);mesh.name='LOD0_Body';root.add(mesh);
      if(role==='cradle')for(let lod=0;lod<3;lod++)for(const finish of ['Armor','BrushedMetal','Warning']) {
        const keeper=new THREE.Mesh(geometry,material);keeper.name=`LOD${lod}_HOOK_CERES_DEPTH_KEEPER_${finish}`;
        keeper.userData.spacefaceTags={lod:`lod${lod}`,instance:false};root.add(keeper);
      }
      for(const rig of ceresWorkfleetVisualRigs(role)) {
        const pivot=new THREE.Group();pivot.name=rig.node;pivot.position.fromArray(rig.pivotWU.map(v=>v/2));root.add(pivot);
      }
      for(const channel of a.propulsion?.channels||[]) {
        const socket=new THREE.Group();socket.name=channel.socket;
        socket.position.set(channel.mouth.x/2,channel.mouth.y/2,channel.mouth.z/2);root.add(socket);
        for(const name of channel.coreMeshes) {
          const core=new THREE.Mesh(geometry,material);core.name=name;core.userData.spacefaceTags={drive:'core',lod:`lod${name[3]}`};root.add(core);
        }
      }
      return {root,planNodes:[root,...root.children],dispose(){root.clear();}};
    }},...overrides};
}

test('only three exact Ceres identities join the three existing Stormshift families',()=>{
  const t=fixture({browser:false});
  try {
    assert.deepEqual(t.entities.map(machineryPresentationFamily),['ceres_breaker','ceres_cradle','ceres_cutterHead']);
    for(const e of t.entities) {
      assert.equal(machineryRequestedPresentation(e),C.assets[e.data.ceresWorkfleetRole].id);admitted(t,e);
      const impostor={...e,data:{...e.data,worldRecordId:e.data.worldRecordId+':other'}};
      assert.equal(isPhysicalMachinery(impostor),false);
    }
    const unrelated=t.sim.spawn({type:'ship',radius:10,data:{occupationalCraft:'ceres_breaker',placeId:C.assets.breaker.id}});
    assert.equal(isPhysicalMachinery(unrelated),false);
    assert.equal(presentationAllowsPlayerFacingAction(unrelated,t.state),true);
    const old=t.entities[0];t.state.entities.set(old.id,{...old});closed(t,old);
  } finally {t.sim.dispose();}
});

test('saved readiness, requested tags, staged roots and mismatched GLB sources never admit a cold body',()=>{
  const t=fixture();
  try {
    for(const e of t.entities) {
      const role=e.data.ceresWorkfleetRole;
      e.presentationAdmission='ready';closed(t,e);assert.equal(e.physicsBody,false);
      const forged=root(role,{source:false});forged.userData.assetId=C.assets[role].assetId;
      forged.userData.ceresWorkfleetAuthoredSource={assetId:C.assets[role].assetId,file:C.assets[role].file};
      mount(t,e,forged);reconcile(t);closed(t,e);
      const wrong=root(role,{file:'wholeships/yard_tug.glb'});mount(t,e,wrong);reconcile(t);closed(t,e);
      assert.equal(recordCeresWorkfleetAuthoredSource(wrong,C.assets[role]),false,'wrong first source cannot be relabelled');
      mount(t,e,root(role==='breaker'?'cradle':'breaker'));reconcile(t);closed(t,e);
      const staged=root(role);e.mesh=staged;reconcile(t);closed(t,e);
      mount(t,e,root(role));reconcile(t);admitted(t,e);
      const replaced=root(role,{source:false});mount(t,e,replaced);reconcile(t);closed(t,e);
      assert.equal(e.physicsBody,false,'a new invalid root cannot borrow prior offscreen authority');
    }
  } finally {t.sim.dispose();}
});

test('source/release GLB URLs normalize exactly and mutable boundary metadata cannot relabel receipts',()=>{
  for(const prefix of ['', 'assets/ships/parts/','/assets/ships/release/parts/','https://game.example/assets/ships/release/parts/']) {
    const t=fixture();try {
      for(const e of t.entities) {
        const role=e.data.ceresWorkfleetRole,m=mount(t,e,root(role,{file:prefix+C.assets[role].file}));
        reconcile(t);admitted(t,e);
        m.userData.placeId='place_fake';m.userData.assetId='SF_FAKE';
        assert.equal(machineryPresentationPlace(e,t.state),C.assets[role].id);
      }
    } finally {t.sim.dispose();}
  }
});

for(const role of ['cradle','cutterHead'])test(`actual ${role} place publication waits for delayed GPU and both initial renderer latches`,async()=>{
  const t=fixture(),e=t.entities.find(e=>e.data.ceresWorkfleetRole===role),native=await createSg02DynamicBodyOwner();
  try {
    const m=buildAuthoredPlaceProp(e,{releaseMode:true}),fallback=m.children[0];mount(t,e,m);
    m.userData.pipelinesPending=true;m.userData.geometryPending=true;
    const gate=deferred();
    const pending=upgradeAuthoredPlaceBoundaryForProbe(m,fallback,e,C.assets[role].file,t.view.renderer,t.view.scene,
      {releaseMode:true,loadAuthoredPart:async()=>placeRecord(role),prepareAuthoredPipelines:()=>gate.promise});
    await flush();reconcile(t);syncNative(t,native);closed(t,e);
    assert.equal(native.records.has(e.id),false);assert.equal(query(e).hit,null);assert.equal(query(e).clear,true);
    gate.resolve({ready:true});assert.equal(await pending,true);reconcile(t);closed(t,e);
    m.userData.pipelinesPending=false;reconcile(t);closed(t,e);
    m.userData.geometryPending=false;reconcile(t);syncNative(t,native);admitted(t,e);
    assert.ok(native.records.get(e.id).colliders.length>0);assert.equal(query(e).hit,e);assert.equal(query(e).los,true);
  } finally {native.dispose();t.sim.dispose();}
});

for(const failure of ['compile','wrong-source'])test(`actual place ${failure} cannot publish requested Ceres identity`,async()=>{
  const t=fixture(),e=t.entities[1];
  try {
    const m=buildAuthoredPlaceProp(e,{releaseMode:true}),fallback=m.children[0];mount(t,e,m);
    const record=placeRecord('cradle',failure==='wrong-source'?{assetId:'SF_PLACE_OTHER',url:'assets/ships/release/parts/places/place_other.glb'}:{});
    await upgradeAuthoredPlaceBoundaryForProbe(m,fallback,e,C.assets.cradle.file,t.view.renderer,t.view.scene,
      {releaseMode:true,loadAuthoredPart:async()=>record,prepareAuthoredPipelines:async()=>{
        if(failure==='compile')throw new Error('injected compile failure');return {ready:true};
      }});
    m.userData.placeId=C.assets.cradle.id;e.presentationAdmission='ready';reconcile(t);closed(t,e);
    assert.equal(e.physicsBody,false);
  } finally {t.sim.dispose();}
});

test('offscreen eviction retains exact admitted hardware; context failure and browser disposal revoke it',async()=>{
  const t=fixture();
  try {
    for(const e of t.entities)mount(t,e);reconcile(t);
    const e=t.entities[0],body=e.physicsBody;evict(t,e);admitted(t,e);assert.equal(e.physicsBody,body);
    mount(t,e);reconcile(t);
    const recovery=t.state.render.contextRecovery={generation:1};
    const gate=deferred(),pending=runWebGlContextRestoreRebuild(t.view,recovery,()=>gate.promise);
    reconcile(t);for(const body of t.entities){closed(t,body);assert.equal(body.physicsBody,false);}
    gate.reject(new Error('injected context failure'));assert.equal((await pending).ok,false);
    reconcile(t);for(const body of t.entities)closed(t,body);
    assert.equal((await runWebGlContextRestoreRebuild(t.view,recovery,async()=>({ready:true}))).ok,true);
    reconcile(t);for(const body of t.entities)admitted(t,body);
    disposeRendererOwnedResources(t.view,{contextLost:true});t.state.render.scene=null;reconcile(t);
    for(const body of t.entities){closed(t,body);assert.equal(body.physicsBody,false);}
  } finally {t.sim.dispose();}
});

test('reused objects, render generations and cold restore revoke both exact identity and indirect child actions',()=>{
  const t=fixture();
  try {
    const e=t.entities[0],m=mount(t,e);reconcile(t);admitted(t,e);
    const child={id:-1,type:'fx',alive:true,data:{presentationOwnerWorldRecordId:C.identities.worker}};
    assert.equal(presentationAllowsPlayerFacingAction(child,t.state),true);
    e.occupantGeneration++;reconcile(t);closed(t,e);assert.equal(e.physicsBody,false);
    mount(t,e,m);reconcile(t);admitted(t,e);
    t.state.render.admissionRunGeneration++;reconcile(t);closed(t,e);
    mount(t,e,m);reconcile(t);admitted(t,e);
    invalidateMachineryPresentation(t.state);e.presentationAdmission='ready';reconcile(t);closed(t,e);
    assert.equal(presentationOwnerAdmissionForWorldRecord(C.identities.worker,t.state),'pending');
    assert.equal(presentationAllowsPlayerFacingAction(child,t.state),false);
    t.state.render.scene=null;assert.equal(presentationAllowsTargetLock(child,t.state),false);
  } finally {t.sim.dispose();}
});

test('existing single traffic reconciliation invokes both bounded owners once per tick',()=>{
  const t=fixture();try {
    t.calls.length=0;reconcile(t);reconcileMachineryBeforePhysics(t.state);
    assert.deepEqual(t.calls,['anvil','ceres']);
    const version=t.state.entityIndex.version;
    for(let i=0;i<20;i++)reconcile(t);
    assert.equal(t.state.entityIndex.version,version);
    t.owner._restoreEpochPending=true;t.calls.length=0;reconcile(t);assert.deepEqual(t.calls,[]);
  } finally {t.sim.dispose();}
});

test('native failure closes headless and browser work, target, projectile and LOS readers without replacing authored shapes',async()=>{
  for(const browser of [false,true]) {
    const t=fixture({browser}),native=await createSg02DynamicBodyOwner();
    try {
      if(browser){for(const e of t.entities)mount(t,e);reconcile(t);}
      syncNative(t,native);
      for(const e of t.entities) {
        admitted(t,e);const body=e.physicsBody;assert.equal(query(e).hit,e);
        const failure=markPhysicsBodyNativeFailure(e,native);closed(t,e);
        const child={id:-1,type:'fx',alive:true,data:{presentationOwnerWorldRecordId:e.data.worldRecordId}};
        assert.equal(presentationAllowsPlayerFacingAction(child,t.state),false);
        assert.equal(query(e).hit,null);assert.equal(query(e).los,false);assert.equal(query(e).clear,true);
        reconcile(t);assert.equal(e.physicsBody,body);closed(t,e);
        clearPhysicsBodyNativeFailure(e,native,failure);admitted(t,e);assert.equal(query(e).hit,e);
      }
    } finally {native.dispose();t.sim.dispose();}
  }
});


test('all three exact families retry failed offscreen builds through one existing renderer poll',async()=>{
  const t=fixture(),gates=[];
  t.view.vf={build:e=>root(e.data.ceresWorkfleetRole)};
  t.state.render.compileObjectPipelines=()=>{const gate=deferred();gates.push(gate);return gate.promise;};
  try {
    const pending=t.entities.map(e=>t.view.rebuildShipMesh(e.id));await flush();
    assert.equal(gates.length,3);reconcile(t);for(const e of t.entities)closed(t,e);
    for(const gate of gates)gate.reject(new Error('injected cold compilation failure'));
    await Promise.all(pending);await flush();
    const failures=t.view._unboundMachineryAppearanceFailures;
    assert.equal(failures.size,3);assert.deepEqual([...failures.keys()],roles.map(role=>`ceres_${role}`));
    t.view._retryUnboundMachineryAppearances(Infinity);await flush();
    const retries=t.entities.map(e=>t.view._appearanceReplacements.get(e.id).completion);
    assert.equal(gates.length,6);
    for(const gate of gates.slice(3))gate.resolve({ready:true});
    assert.deepEqual((await Promise.all(retries)).map(x=>x.status),['committed','committed','committed']);
    reconcile(t);for(const e of t.entities)admitted(t,e);assert.equal(failures.size,0);
  } finally {t.sim.dispose();}
});

test('delayed breaker GPU publication cannot authorize a stale generation, object or same-object life',async()=>{
  for(const change of ['generation','life','object']) {
    const t=fixture(),e=t.entities[0],gate=deferred();
    t.view.vf={build:()=>root('breaker')};t.state.render.compileObjectPipelines=()=>gate.promise;
    try {
      const pending=t.view.rebuildShipMesh(e.id);await flush();closed(t,e);
      if(change==='generation')t.state.render.admissionRunGeneration++;
      if(change==='life')e.occupantGeneration++;
      if(change==='object')t.state.entities.set(e.id,{...e,physicsBody:false});
      gate.resolve({ready:true});assert.equal((await pending).status,'retained');
      reconcile(t);closed(t,e);assert.equal(e.physicsBody,false);
      assert.equal(machineryPresentationPlace(e,t.state),null);
    } finally {t.sim.dispose();}
  }
});

test('foreign effective proxy, scale and mass cannot acquire the authored Ceres receipt',()=>{
  const t=fixture();try {
    for(const e of t.entities) {
      mount(t,e);reconcile(t);admitted(t,e);
      const expected=e.physicsBody;
      e.physicsBody={...expected,radius:999,mass:1,collisionProxyManifest:{schemaVersion:1,id:'forged',primitives:[]}};
      closed(t,e);reconcile(t);
      assert.equal(e.physicsBody.radius,expected.radius);assert.equal(e.physicsBody.mass,expected.mass);
      assert.deepEqual(e.physicsBody.collisionProxyManifest,expected.collisionProxyManifest);admitted(t,e);
    }
  } finally {t.sim.dispose();}
});

test('real Continue restores Ceres identities and hardware recipes without saved browser readiness',async()=>{
  const [{world},{ships},{traffic},{npcJobsRuntime},{save}]=await Promise.all([
    import('../src/systems/world.js'),import('../src/systems/ships.js'),import('../src/systems/traffic.js'),
    import('../src/systems/npcJobsRuntime.js'),import('../src/save/saveSystem.js'),
  ]);
  const sim=createSimulation({seed:621,systems:[world,ships,npcJobsRuntime,traffic,save]});
  const state=sim.state;state.mode='flight';
  const player=sim.spawn({type:'ship',team:0,hull:100,hullMax:100,pos:{x:0,z:0},radius:6,flags:{persistent:true}});
  state.playerId=player.id;sim.registry.get('world').enterSector(C.sectorId);
  const entities=roles.map(role=>sim.spawn(ceresWorkfleetHardwareSpec(role)));
  for(const e of entities)sim.registry.get('world').upsertWorldRecord(e);
  const scene=new THREE.Scene(),renderer={},view=Object.create(render);
  state.render={scene,renderer,admissionRunGeneration:1};
  Object.assign(view,{state,scene,renderer,_meshes:new Map(),_meshesVersion:0,
    _frameMembrane:{toLocal:p=>p},_presentationWorld:{handleForEntityId:id=>({id}),bindMesh:()=>true,unbindMesh:()=>true},
    _persistentSubmitLanes:{reserve(){},release(){}}});
  const t={sim,state,entities,view};
  try {
    // This fixture manually spawns hardware; run the same cold recipe binding
    // that the production traffic producer performs before authored admission.
    reconcileCeresWorkfleetPresentation({state});
    for(const e of entities)mount(t,e);reconcile(t);for(const e of entities)admitted(t,e);
    const stored=sim.registry.get('save').serialize('ceres-admission-continue');
    assert.equal(sim.registry.get('save').loadEnvelope(JSON.parse(JSON.stringify(stored)),'ceres-admission-continue'),true);
    state.mode='flight';
    const fresh=roles.map(role=>[...state.entities.values()].find(e=>e.data?.worldRecordId===C.identities[role==='breaker'?'worker':role]));
    assert.ok(fresh.every(Boolean),'actual world-record Continue materializes the three exact durable identities');
    reconcileCeresWorkfleetPresentation({state});
    for(let i=0;i<fresh.length;i++) {
      const e=fresh[i];assert.notEqual(e,entities[i]);closed(t,e);assert.equal(e.physicsBody,false);
      e.presentationAdmission='ready';closed(t,e);mount(t,e);
    }
    reconcileCeresWorkfleetPresentation({state});for(const e of fresh)admitted(t,e);
  } finally {sim.dispose();}
});

test('Ceres cold admission withdraws real native attachment endpoints and resumes the same line only after exact readmission',async()=>{
  const {ATTACHMENT_DEFS}=await import('../src/data/combatDefs.js');
  const t=fixture(),native=await createSg02DynamicBodyOwner();
  try {
    for(const e of t.entities)mount(t,e);reconcile(t);syncNative(t,native);
    const [breaker,,head]=t.entities,def=ATTACHMENT_DEFS.find(d=>d.id==='tether_standard');
    assert.ok(native.createAttachment({attachmentId:'ceres-admission-line',defId:def.id,
      ownerId:breaker.id,targetId:head.id,sourceWorld:{...breaker.pos,y:0},targetWorld:{...head.pos,y:0},
      restLength:20,spring:def.spring,break:def.break,tick:t.state.tick}));
    assert.equal(native.attachments.size,1);
    const meshes=t.entities.map(e=>e.mesh);
    invalidateMachineryPresentation(t.state);reconcile(t);syncNative(t,native);
    assert.equal(native.records.size,0);assert.equal(native.attachments.size,0);
    assert.equal(native._suspendedAttachments.size,1);
    for(const e of t.entities)closed(t,e);
    for(let i=0;i<t.entities.length;i++)mount(t,t.entities[i],meshes[i]);
    reconcile(t);syncNative(t,native);
    assert.equal(native.attachments.size,1);assert.equal(native._suspendedAttachments.size,0);
    assert.equal(native.attachments.get('ceres-admission-line').restLength,20);
    for(const e of t.entities)admitted(t,e);
  } finally {native.dispose();t.sim.dispose();}
});


test('actual breaker whole-ship wrapper publishes the selected hull source through repeated composition',async()=>{
  const t=fixture(),e=t.entities[0],asset=C.assets.breaker;
  const priorWindow=globalThis.window,priorRaf=globalThis.requestAnimationFrame,priorDocument=globalThis.document;
  const frames=[];
  const context=new Proxy({canvas:{width:256,height:256},measureText:()=>({width:10}),
    createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},
    {get:(value,key)=>key in value?value[key]:()=>{}});
  globalThis.document={createElement:()=>({width:256,height:256,getContext:()=>context,style:{},addEventListener(){}})};
  globalThis.window={SF:{state:t.state}};globalThis.requestAnimationFrame=fn=>{frames.push(fn);return frames.length;};
  t.state.mode='loading';
  const loads=[];
  const options={releaseMode:true,requiredWholeShip:true,loadAuthoredPart:async url=>{
    loads.push(url);
    const assetId=String(url).endsWith(asset.file)?asset.assetId
      : String(url).endsWith('wholeships/kestrel.glb')?'SF_K0_KESTREL_BORROWED_TIME_V4':`FIXTURE_${url}`;
    const record=placeRecord('breaker',{url,assetId});record.renderPackage.assetId=assetId;return record;
  }};
  try {
    assert.equal(wholeShipVisualForEntity(e)?.file,asset.file,'published package catalog must expose the breaker on the live route');
    await preloadAuthoredAssetsForEntity(t.view.renderer,e,options);
    for(let iteration=0;iteration<2;iteration++) {
      let m,pending;
      if(iteration===0) {
        const substrate=new THREE.Group();substrate.userData.authoredAdmissionSubstrate=true;
        m=wrapShipWithAuthoredParts(e,substrate,options);mount(t,e,m);
        pending=m.userData.requestAuthoredUpgrade(t.view.renderer,t.view.scene,
          {prepareAuthoredPipelines:async()=>({ready:true})});
      } else {
        t.view.vf={build:snapshot=>{
          assert.notEqual(snapshot,e);assert.equal(snapshot.deferAuthoredMotionRegistration,true);
          assert.equal(snapshot.occupantGeneration,e.occupantGeneration);
          const substrate=new THREE.Group();substrate.userData.authoredAdmissionSubstrate=true;
          return m=wrapShipWithAuthoredParts(snapshot,substrate,options);
        }};
        pending=t.view.rebuildShipMesh(e.id);
      }
      let settled=false;pending.finally(()=>{settled=true;});
      for(let turn=0;turn<160&&!settled;turn++) {
        if(frames.length)frames.shift()();await flush();
      }
      const result=await pending;if(iteration)assert.equal(result.status,'committed');
      assert.equal(m.userData.authoredAssetState,'authored');
      reconcile(t);admitted(t,e);
      assert.equal(machineryPresentationPlace(e,t.state),asset.id);
      assert.ok(m.userData.authoredParts.some(url=>url.endsWith(asset.file)));
      const cores=[];m.traverse(n=>{if(/^LOD[012]_HOOK_CERES_THRUSTER_/.test(n.name))cores.push(n);});
      assert.equal(cores.length,30,'all three source LODs retain ten separate cores');
      const materials=new Set(cores.map(n=>n.material));assert.equal(materials.size,10);
      for(const material of materials) {
        assert.equal(material.userData.spacefaceCeresThruster,true);
        assert.equal(material.userData.spacefaceSharedAsset,false);
        assert.equal(material.emissiveIntensity,0,'admission never starts hot');
      }
      const channels=asset.propulsion.channels;
      for(const channel of channels) {
        const trio=channel.coreMeshes.map(name=>m.getObjectByName(name));
        assert.equal(new Set(trio.map(n=>n.material)).size,1);
      }
      if(iteration===1) {
        let retainedTemplateOwner=null;
        m.traverse(n=>{if(n.userData?.wholeShip && n.userData?.authoredMotionControllers
          && typeof n.userData.releaseAuthoredAssetResidency==='function')retainedTemplateOwner=n;});
        assert.ok(retainedTemplateOwner,'the second public composition retains the cached flight-template owner');
      }
      assert.ok(currentForce(t,e));m.userData.updateAuthoredMotion(e,t.state.simTime,{});
      assert.ok(m.getObjectByName(channels[0].coreMeshes[0]).material.emissiveIntensity>0,
        'published fresh or cached root consumes a new force from the authoritative entity');
      if(iteration===1) {
        // The real boundary disposal must release every private channel material.
        const disposed=new Set();for(const material of materials)material.addEventListener('dispose',()=>disposed.add(material));
        disposeRendererOwnedResources(t.view);await flush();assert.equal(disposed.size,10);
      }
    }
    assert.ok(loads.some(url=>url.endsWith(asset.file)));
  } finally {
    if(priorWindow===undefined)delete globalThis.window;else globalThis.window=priorWindow;
    if(priorRaf===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=priorRaf;
    if(priorDocument===undefined)delete globalThis.document;else globalThis.document=priorDocument;
    invalidatePartsLibraryCaches(t.view.renderer);t.sim.dispose();
  }
});

function currentForce(t,e) {
  const role=e.data.ceresWorkfleetRole,caps=role==='breaker'?{accel:.5,angularAccel:.025}:{accel:8,angularAccel:.6};
  return recordCeresWorkfleetActuation(t.state,e,{force:{x:Math.cos(e.rot)*100,z:Math.sin(e.rot)*100},torque:{y:0}},caps);
}
function propulsionRoot(e) {
  const role=e.data.ceresWorkfleetRole,m=placeRecord(role).renderPackage.createInstance().root;
  m.userData.authoredAssetState='authored';recordCeresWorkfleetAuthoredSource(m,C.assets[role]);
  attachAuthoredMotionDriver(m,e,[]);return m;
}
for(const role of ['breaker','cutterHead'])test(`${role} actual renderer snapshot replacement activates only its published current-life propulsion`,async()=>{
  const t=fixture(),e=t.entities.find(e=>e.data.ceresWorkfleetRole===role),gate=deferred();
  const first=mount(t,e,propulsionRoot(e));reconcile(t);
  const coreName=C.assets[role].propulsion.channels[0].coreMeshes[0];
  assert.ok(currentForce(t,e));first.userData.updateAuthoredMotion(e,t.state.simTime,{});
  assert.ok(first.getObjectByName(coreName).material.emissiveIntensity>0);
  let snapshot,candidate;
  t.view.vf={build:copy=>{snapshot=copy;return candidate=propulsionRoot(copy);}};
  t.state.render.compileObjectPipelines=()=>gate.promise;
  try {
    const pending=t.view.rebuildShipMesh(e.id);await flush();
    assert.notEqual(snapshot,e);assert.equal(snapshot.deferAuthoredMotionRegistration,true);
    assert.equal(e.mesh,first);candidate.userData.updateAuthoredMotion(e,t.state.simTime,{});
    assert.equal(candidate.getObjectByName(coreName).material.emissiveIntensity,0);
    assert.equal(candidate.userData.activateAuthoredMotionRegistration(e),false,'a staged root cannot steal live binding');
    first.userData.updateAuthoredMotion(e,t.state.simTime,{});
    assert.ok(first.getObjectByName(coreName).material.emissiveIntensity>0);
    assert.equal(ceresWorkfleetPropulsionAwake(t.state),true);
    gate.resolve({ready:true});assert.equal((await pending).status,'committed');
    assert.equal(e.mesh,candidate);reconcile(t);assert.ok(currentForce(t,e));
    candidate.userData.updateAuthoredMotion(e,t.state.simTime,{});
    assert.ok(candidate.getObjectByName(coreName).material.emissiveIntensity>0);
    assert.equal(ceresWorkfleetPropulsionAwake(t.state),true);
    assert.equal(first.userData.updateAuthoredMotion,undefined,'retired root detaches its binding');
    const coldGate=deferred();t.state.render.compileObjectPipelines=()=>coldGate.promise;
    const another=t.view.rebuildShipMesh(e.id);await flush();const staleCandidate=candidate,retained=e.mesh;
    e.occupantGeneration++;
    assert.equal(staleCandidate.userData.activateAuthoredMotionRegistration(
      {...e,occupantGeneration:e.occupantGeneration,mesh:staleCandidate}),false,'same ID cannot transfer across lives');
    staleCandidate.userData.updateAuthoredMotion(e,t.state.simTime,{});
    assert.equal(staleCandidate.getObjectByName(coreName).material.emissiveIntensity,0);
    coldGate.resolve({ready:true});assert.equal((await another).status,'retained');assert.equal(e.mesh,retained);
  } finally {disposeRendererOwnedResources(t.view);t.sim.dispose();}
});

import {createRenderEntityFrame} from '../src/render/renderEntityFrame.js';
import {createPersistentSubmitLanes} from '../src/render/persistentSubmitLanes.js';
test('actual LOD2 renderer submission clears a cutter throat on zero consumed force despite decorative sleep', () => {
  const t=fixture(), e=t.entities.find(entity=>entity.data.ceresWorkfleetRole==='cutterHead');
  const mesh=mount(t,e,propulsionRoot(e)); reconcile(t);
  const core=mesh.getObjectByName(C.assets.cutterHead.propulsion.channels[0].coreMeshes[0]);
  const world=t.view._presentationWorld;
  Object.assign(world,{alive:[1],slotGenerations:[1],meshRefs:[mesh],entityIds:[e.id],flags:[0],entityRefs:[e],
    dirtyMasks:[0],radii:[e.radius],boundCount:1,refreshVisibleEntity(){},clearDirty(){},poseHasDelta:()=>false});
  mesh.userData.lod={level:'lod2',resolve:()=> 'lod2'};
  mesh.userData.updateLod=()=>{};mesh.userData._appliedLodLevel='lod2';
  Object.assign(t.view,{_presentationQueryOptions:{},
    _presentationQueries:{query:()=>({visibleCount:1,visibleSlots:[0],visibleGenerations:[1],hiddenCount:0,
      candidateCount:1,culledCount:0,newlyVisibleCount:0})},
    _entityViewCullBounds:()=>({x:0,z:0,halfX:10000,halfZ:10000,glassHalfX:10000,glassHalfZ:10000}),
    _hasCompletedPresentationPose:()=>true,_entityFrame:createRenderEntityFrame(),_entityViewDiagnostics:{},
    _hlodDiagnostics:{},_persistentSubmitLanes:createPersistentSubmitLanes(),viewport:{width:1280,height:720},_presentationFrameDt:0});
  t.view._frameMembrane.origin={x:0,z:0};
  let decorative=0;mesh.userData.updateAuthoredMotion=()=>{decorative++;};
  try {
    assert.ok(currentForce(t,e));t.view.syncEntityViews(1);assert.ok(core.material.emissiveIntensity>0);
    assert.ok(recordCeresWorkfleetActuation(t.state,e,{force:{x:0,z:0},torque:{y:0}},{accel:8,angularAccel:.6}));
    t.view.syncEntityViews(1);assert.equal(core.material.emissiveIntensity,0);assert.equal(decorative,0);
  } finally {disposeRendererOwnedResources(t.view);t.sim.dispose();}
});
