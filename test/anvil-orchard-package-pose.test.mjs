import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { prepareRenderPackageBlueprint, assembleRenderPackageRecord } from '../src/render/assetLoader.js';
import { createRenderPackageLoader } from '../src/render/renderPackageLoader.js';
import { loadMotionBank, authoredMotionControllersFor } from '../src/render/authoredMotion.js';
import { buildAuthoredPlaceProp, upgradeAuthoredPlaceBoundaryForProbe } from '../src/render/partsLibrary.js';
import { createOrchardVisualDriver, recordOrchardAuthoredSource } from '../src/render/anvilOrchardVisuals.js';
import { ORCHARD_GEOMETRY as G, orchardFrameBodySpec } from '../src/data/anvilOrchardBody.js';
import { ORCHARD_FRAME_FILE, isOrchardFrame } from '../src/data/anvilOrchardIdentity.js';
import { createOrchardCollarState, createOrchardMotorState } from '../src/core/anvilOrchardNative.js';
import { createSimulation } from '../src/core/sim.js';
import { physics, readOrchardNativePose } from '../src/core/physics.js';
import { primeDrawnCullStamps, resetDrawnCullPassBudget } from '../src/render/visualCullRadius.js';
import { createInfrastructureMotionTracker } from '../src/render/infrastructureMotion.js';
import { createShipMicroMotionTracker } from '../src/render/shipMicroMotion.js';
import { render, reattachResidentGpuMeshes } from '../src/render/renderer.js';

const read = path => JSON.parse(fs.readFileSync(path));
async function packageFixture() {
  const pilot = read('assets/ships/render-packages/pilots.json').pilots.find(p=>p.key==='anvil-storm-orchard');
  const metadata = read(pilot.metadataUrl);
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
  const doc = await io.read(`${pilot.outputDir}/render.glb`); await doc.transform(dequantize());
  const convert = node => {
    const primitive=node.getMesh()?.listPrimitives()[0];
    const object=primitive?new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial()):new THREE.Group();
    object.name=node.getName();object.userData={...node.getExtras()};
    if(primitive) {
      const position=primitive.getAttribute('POSITION');
      object.geometry.setAttribute('position',new THREE.BufferAttribute(position.getArray().slice(),position.getElementSize()));
      if(primitive.getIndices())object.geometry.setIndex(new THREE.BufferAttribute(primitive.getIndices().getArray().slice(),1));
      object.material.name=primitive.getMaterial()?.getName()||'';
    }
    object.position.fromArray(node.getTranslation());object.quaternion.fromArray(node.getRotation());object.scale.fromArray(node.getScale());
    for(const child of node.listChildren())object.add(convert(child));
    return object;
  };
  const scene=new THREE.Group();for(const node of doc.getRoot().listScenes()[0].listChildren())scene.add(convert(node));
  scene.userData={...doc.getRoot().listScenes()[0].getExtras()};
  const loader=createRenderPackageLoader({loadGlb:async()=>({scene,asset:doc.getRoot().getAsset()}),prepareDecoded:async(decoded,m,url,plan)=>{
    const prepared=prepareRenderPackageBlueprint(pilot,decoded,m,{plan});
    const motionBank=await loadMotionBank(m.runtime.motionBank,async path=>{const b=fs.readFileSync(path);return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};});
    return {...prepared,motionBank};
  }});
  const loaded=await loader.load(metadata,{expectedContentHash:metadata.contentHash,expectedRuntimeHash:metadata.runtimeHash});
  return {loader,loaded,record:assembleRenderPackageRecord(loaded,pilot.sourceUrl,pilot.assetId)};
}

function spawn(sim, progress, collars = createOrchardCollarState(progress)) {
  const player=sim.spawn({type:'ship',pos:{x:13240,z:8300},radius:6,hull:100,data:{defId:'ship_kestrel',fittings:[]}});sim.state.playerId=player.id;
  return sim.spawn({type:'wreck',pos:{x:13200,z:8300},rot:.713,radius:G.radius,mass:1e6,hull:300,hullMax:300,physicsBody:orchardFrameBodySpec(),
    data:{orchardId:'anvil_storm_orchard',orchardKind:'frame',worldRecordId:G.worldRecordId,placeId:'place_anvil_storm_orchard',
      authoredAssetId:G.assetId,authoredPayloadAssetId:G.assetId,masslineTetherable:false,orchardCollars:collars}});
}

const near = (a,b,tolerance=1e-6) => a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<tolerance,`${a} != ${b}`));
function rendererPoseDispatch() {
  // Execute the exact bounded scheduling branch from the renderer. Decoding,
  // composition and native reads below are real; pixels/GPU remain outside this probe.
  const code=fs.readFileSync('src/render/renderer.js','utf8');
  const hook=code.indexOf('&& userData.updateAuthoredMotion)');
  const start=code.lastIndexOf('        if (entity && runClosures',hook);
  const last=code.indexOf('userData.updateOrchardPhysicalState(entity, this.state);',hook);
  const end=code.indexOf('\n        }',last)+'\n        }'.length;
  assert.ok(start>=0&&last>start);
  return new Function('entity','runClosures','farSpeck','userData','authoredNow','_worldSiteA11y',code.slice(start,end));
}

test('the exact wreck scheduling branch keeps fixed Orchard basis while ordinary wreck motion remains active', () => {
  const code=fs.readFileSync('src/render/renderer.js','utf8');
  const start=code.indexOf("} else if (typeName === 'wreck' &&");
  assert.ok(start>=0,'the live renderer has its wreck scheduling branch');
  const close=code.indexOf('\n          }',start);assert.ok(close>start,'the branch has its bounded closing brace');
  const end=close+'\n          }'.length;
  const dispatch=new Function('classifiers','typeName','entity','mesh','simTime','frameDt','_worldSiteA11y','globalShipMicroMotion','globalInfrastructureMotion',
    'const {isOrchardFrame}=classifiers; if (false) {'+code.slice(start,end)).bind(null,
    {isOrchardFrame});
  const sim=createSimulation(),frame=spawn(sim,[0,14,30]),wreck={...frame,id:98765,data:{...frame.data,orchardKind:'ordinary-wreck'}};
  try {
    const root=()=>{const r=new THREE.Group();r.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial()));return r;};
    const fixed=root(),ordinary=root(),ships=createShipMicroMotionTracker(),places=createInfrastructureMotionTracker();
    for(let i=0;i<20;i++)for(const [entity,mesh] of [[frame,fixed],[wreck,ordinary]])dispatch('wreck',entity,mesh,i/60,1/60,{},ships,places);
    near(fixed.scale.toArray(),[1,1,1]);near(fixed.children[0].quaternion.toArray(),[0,0,0,1]);
    assert.notDeepEqual(ordinary.children[0].quaternion.toArray(),[0,0,0,1]);
    for(const mesh of [fixed,ordinary]){mesh.children[0].geometry.dispose();mesh.children[0].material.dispose();}
  } finally {sim.dispose();}
});

test('actual decoded package and ordinary composer apply verified native poses after rest-bank updates', async t => {
  const pkg=await packageFixture(),sim=createSimulation({systems:[physics]});
  const state=sim.state;state.mode='flight';state.world.currentSectorId='sector_tethys_junction';state.render={scene:new THREE.Scene()};
  const frame=spawn(sim,[0,14,30]),facade=sim.registry.get('physics');
  let boundary;
  try {
    assert.equal(await facade.prepareBackend(state),true);assert.deepEqual(readOrchardNativePose(state,frame)?.progress,[0,14,30]);
    const fallback=new THREE.Group();boundary=buildAuthoredPlaceProp(frame,{fallbackRoot:fallback,releaseMode:true});frame.mesh=boundary;
    boundary.position.set(frame.pos.x,0,frame.pos.z);boundary.rotation.y=-frame.rot;boundary.updateMatrix();state.render.scene.add(boundary);
    assert.equal(await upgradeAuthoredPlaceBoundaryForProbe(boundary,fallback,frame,ORCHARD_FRAME_FILE,{},state.render.scene,
      {releaseMode:true,loadAuthoredPart:async()=>pkg.record,prepareAuthoredPipelines:async()=>({skipped:false})}),true);
    let root;boundary.traverse(n=>{if(n.userData.orchardAuthoredSource)root=n;});assert.ok(root,'normal composer records exact source and installs driver');
    const rigs=G.rigs.map(rig=>({rig,node:root.getObjectByName(rig.node)}));assert.equal(authoredMotionControllersFor(frame.id).length,1);
    assert.ok(readOrchardNativePose(state,frame),'normal visual admission preserves native source lease');
    for(let update=0;update<3;update++) {
      // The generic bank resets each joint to rest. The ordinary update must then
      // apply the verified pose again, including hidden LOD descendants.
      boundary.userData.updateAuthoredMotion(frame,update/60,{},state);
      assert.equal(root.userData.orchardNativePose.kind,'pose-only');assert.equal(root.userData.orchardNativePose.completedNativeTick,null);
      for(const {rig,node} of rigs) {
        const angle=rig.yawSign*[0,14,30][rig.socket]*Math.PI/60;
        assert.equal(node.visible,true);near(node.position.toArray(),rig.pivotGltf);
        near(node.quaternion.toArray(),[0,Math.sin(angle/2),0,Math.cos(angle/2)]);
        assert.equal(node.children.filter(c=>/^LOD[012]_MOTION_ORCHARD_/.test(c.name)).length,3);
      }
    }
    resetDrawnCullPassBudget();primeDrawnCullStamps(root);
    assert.ok(root.userData.__authoredMotionPad>0,'full 90-degree physical travel is inside the cull allowance');
    for(const lod of ['lod0','lod1','lod2']) {
      boundary.userData.updateLod(lod);boundary.userData.updateAuthoredMotion(frame,1,{},state);
      assert.ok(rigs.every(({node})=>node.visible));
    }
    const saved=frame.data.orchardCollars.progress[1];frame.data.orchardCollars.progress[1]=30;
    boundary.userData.updateAuthoredMotion(frame,2,{},state);assert.ok(rigs.every(({node})=>!node.visible),'saved scalar cannot move physical jaws');
    assert.equal(root.userData.orchardNativePose,undefined);frame.data.orchardCollars.progress[1]=saved;
    boundary.userData.updateAuthoredMotion(frame,3,{},state);assert.ok(rigs.every(({node})=>node.visible));
    const collider=facade._sg02.records.get(frame.id).colliders.at(-1),translation=collider.translationWrtParent();
    collider.setTranslationWrtParent({...translation,x:translation.x+.1});
    boundary.userData.updateAuthoredMotion(frame,4,{},state);assert.ok(rigs.every(({node})=>!node.visible));
    collider.setTranslationWrtParent(translation);boundary.userData.updateAuthoredMotion(frame,5,{},state);assert.ok(rigs.every(({node})=>node.visible));
    facade._nativeRestorePending=true;boundary.userData.updateAuthoredMotion(frame,6,{},state);assert.ok(rigs.every(({node})=>!node.visible));facade._nativeRestorePending=false;
    const source=root.userData.orchardAuthoredSource;root.userData.orchardAuthoredSource={...source,sourceGlbSha256:'wrong'};
    boundary.userData.updateAuthoredMotion(frame,7,{},state);assert.ok(rigs.every(({node})=>!node.visible));root.userData.orchardAuthoredSource=source;
    const parent=new THREE.Group();parent.position.set(17,3,-8);parent.rotation.y=.37;state.render.scene.add(parent);parent.add(boundary);
    boundary.userData.updateAuthoredMotion(frame,8,{},state);state.render.scene.updateMatrixWorld(true);
    for(const {rig,node} of rigs)near(node.getWorldPosition(new THREE.Vector3()).toArray(),boundary.localToWorld(new THREE.Vector3(...rig.pivotGltf)).toArray());
    parent.visible=false;boundary.userData.updateAuthoredMotion(frame,9,{},state);assert.ok(rigs.every(({node})=>!node.visible));parent.visible=true;
    parent.remove(boundary);boundary.userData.updateAuthoredMotion(frame,10,{},state);assert.ok(rigs.every(({node})=>!node.visible));parent.add(boundary);
    assert.equal(recordOrchardAuthoredSource(new THREE.Group(),frame,{...pkg.record,motionBank:{bank:{...pkg.record.motionBank.bank,sourceGlbSha256:'wrong'}}}),false);
    assert.equal(createOrchardVisualDriver(new THREE.Group(),frame),null);
    const dispatch=rendererPoseDispatch(),originalRead=facade.readOrchardFramePose;
    let reads=0;facade.readOrchardFramePose=function(...args){reads++;return originalRead.apply(this,args);};
    try {
      for(const [closures,far,awake] of [[true,false,true],[false,false,true],[true,true,true],[true,false,false],[true,false,true]]) {
        boundary.userData.livingMachineAwake=awake;reads=0;
        dispatch.call({state},frame,closures,far,boundary.userData,11,{});
        assert.equal(reads,1,'awake/sleep/far scheduling uses exactly one current-world native read');
        assert.ok(rigs.every(({node})=>node.visible));
      }
      facade._nativeRestorePending=true;
      dispatch.call({state},frame,false,true,boundary.userData,12,{});
      assert.ok(rigs.every(({node})=>!node.visible),'sleep/far still withdraws a missing current native receipt');
      facade._nativeRestorePending=false;
      const replacement={...frame,occupantGeneration:frame.occupantGeneration+1};
      state.entities.set(frame.id,replacement);
      dispatch.call({state},replacement,false,true,boundary.userData,13,{});
      assert.ok(rigs.every(({node})=>!node.visible),'an old render binding cannot follow a new occupant');
      state.entities.set(frame.id,frame);
      dispatch.call({state},frame,true,false,boundary.userData,14,{});
      assert.ok(rigs.every(({node})=>node.visible));
    } finally {facade.readOrchardFramePose=originalRead;}
    for(const mutation of ['mesh','scene','detach','hidden','source']) {
      const body=facade._sg02.records.get(frame.id).body,prototype=facade._sg02.RAPIER.RigidBody.prototype;
      const translation=prototype.translation,scene=state.render.scene,ownerParent=boundary.parent,source=root.userData.orchardAuthoredSource;
      let fired=false;
      prototype.translation=function(...args){const value=translation.apply(this,args);if(!fired&&this===body){fired=true;
        if(mutation==='mesh')frame.mesh=new THREE.Group();
        if(mutation==='scene')state.render.scene=new THREE.Scene();
        if(mutation==='detach')boundary.removeFromParent();
        if(mutation==='hidden')boundary.visible=false;
        if(mutation==='source')root.userData.orchardAuthoredSource={...source};
      }return value;};
      try {
        boundary.userData.updateAuthoredMotion(frame,15,{},state);assert.equal(fired,true);
        assert.equal(root.userData.orchardNativePose,undefined,`${mutation} invalidates publication after the native read`);
        assert.ok(rigs.every(({node})=>!node.visible));
      } finally {prototype.translation=translation;frame.mesh=boundary;state.render.scene=scene;ownerParent.add(boundary);boundary.visible=true;root.userData.orchardAuthoredSource=source;}
      boundary.userData.updateAuthoredMotion(frame,16,{},state);assert.ok(rigs.every(({node})=>node.visible));
    }
    const R=facade._sg02.RAPIER,counts={},restore=[];
    for(const [label,prototype,methods] of [
      ['world',R.World.prototype,['getRigidBody','getCollider']],
      ['body',R.RigidBody.prototype,['isFixed','isEnabled','numColliders','translation','rotation','isCcdEnabled']],
      ['collider',R.Collider.prototype,['parent','shapeType','isSensor','isEnabled','contactSkin','density','collisionGroups','solverGroups','activeCollisionTypes','friction','restitution','frictionCombineRule','restitutionCombineRule','translationWrtParent','rotationWrtParent','vertices']],
    ])for(const method of methods){const original=prototype[method],key=`${label}.${method}`;prototype[method]=function(...args){counts[key]=(counts[key]||0)+1;return original.apply(this,args);};restore.push(()=>{prototype[method]=original;});}
    try{assert.ok(readOrchardNativePose(state,frame));}finally{for(const reset of restore)reset();}
    t.diagnostic(`Invalidated-receipt read with instrumented public getters, native dispatch counts: ${JSON.stringify(counts)}`);
    // The earlier native collider mutation/restoration invalidated the published
    // receipt. Restoring its values does not publish a new simulation receipt:
    // repeated draws still take the geometry-validation path until normal sync.
    // Time both states explicitly, without getter instrumentation. Assertions
    // run outside the measured interval; these CPU observations have no timing
    // threshold and make no live-frame, GPU or target-hardware acceptance claim.
    const measureCpu = (label, run, verify) => {
      const warmup = 10, samples = 100, times = [];
      for (let i = 0; i < warmup; i++) verify(run());
      for (let i = 0; i < samples; i++) {
        const start = performance.now(), result = run();
        times.push(performance.now() - start);
        verify(result);
      }
      times.sort((a,b) => a-b);
      t.diagnostic(`Orchard CPU observation ${JSON.stringify({label, warmup, samples,
        medianMs:times[50], p95Ms:times[95], hostLoad:'uncontrolled', timingThreshold:false})}`);
    };
    const readPose = () => readOrchardNativePose(state,frame);
    const drawPose = () => {
      boundary.userData.updateAuthoredMotion(frame,16,{},state);
      return root.userData.orchardNativePose;
    };
    let previous = readPose();
    assert.ok(previous);
    const verifyInvalidated = pose => {
      assert.ok(pose);
      assert.notEqual(pose,previous,'restored native geometry is revalidated without republishing a receipt');
      assert.deepEqual(pose.progress,[0,14,30]);
      previous = pose;
    };
    measureCpu('invalidated receipt: public pose reader',readPose,verifyInvalidated);
    measureCpu('invalidated receipt: ordinary authored callback',drawPose,verifyInvalidated);
    facade._sg02.syncFromEntities(state.entityList);
    const published = readPose();
    assert.ok(published);assert.equal(Object.isFrozen(published),true);
    assert.notEqual(published,previous,'normal simulation sync publishes the restored pose');
    const verifyPublished = pose => assert.equal(pose,published,'unchanged draws retain the published receipt');
    measureCpu('post-sync cached receipt: public pose reader',readPose,verifyPublished);
    measureCpu('post-sync cached receipt: ordinary authored callback',drawPose,verifyPublished);
    assert.deepEqual(published.progress,[0,14,30]);
    assert.ok(rigs.every(({node}) => node.visible));
    // Warming the fast path must never weaken immediate native-change refusal.
    collider.setTranslationWrtParent({...translation,x:translation.x+.1});
    try {
      assert.equal(readPose(),null);
      assert.equal(drawPose(),undefined);
      assert.ok(rigs.every(({node}) => !node.visible));
    } finally {collider.setTranslationWrtParent(translation);}
    facade._sg02.syncFromEntities(state.entityList);
    const republished = readPose();
    assert.ok(republished);assert.notEqual(republished,published);
    assert.equal(readPose(),republished);assert.equal(drawPose(),republished);
    assert.ok(rigs.every(({node}) => node.visible));
    const body=facade._sg02.records.get(frame.id).body,prototype=facade._sg02.RAPIER.RigidBody.prototype,nativeTranslation=prototype.translation;
    let successor=null,successorPose=null;
    prototype.translation=function(...args){const value=nativeTranslation.apply(this,args);if(!successor&&this===body){
      successor=createOrchardVisualDriver(root,frame);assert.ok(successor);
      successor.update(frame,17,{},state);successorPose=root.userData.orchardNativePose;
    }return value;};
    try {
      boundary.userData.updateAuthoredMotion(frame,17,{},state);assert.ok(successorPose);
      assert.equal(root.userData.orchardNativePose,successorPose,'stale failure cleanup cannot erase successor receipt');
      assert.ok(rigs.every(({node})=>node.visible),'stale failure cleanup cannot hide successor jaws');
      root.userData.detachAuthoredMotion();
      assert.equal(root.userData.orchardNativePose,successorPose,'retired owner disposal cannot erase successor receipt');
      assert.ok(rigs.every(({node})=>node.visible));
    } finally {prototype.translation=nativeTranslation;successor?.dispose();}
  } finally {boundary?.userData.dispose?.();sim.dispose();pkg.loader.dispose();}
});

test('decoded package keeps all six jaws on completed native steps after bank reset and cold adoption', async () => {
  const pkg=await packageFixture(),sim=createSimulation({systems:[physics]}),state=sim.state;
  state.mode='flight';state.world.currentSectorId='sector_tethys_junction';state.render={scene:new THREE.Scene()};
  const frame=spawn(sim,[0,0,0],createOrchardMotorState()),facade=sim.registry.get('physics');
  let boundary;
  try {
    assert.equal(await facade.prepareBackend(state),true);
    const fallback=new THREE.Group();boundary=buildAuthoredPlaceProp(frame,{fallbackRoot:fallback,releaseMode:true});frame.mesh=boundary;
    boundary.position.set(frame.pos.x,0,frame.pos.z);boundary.rotation.y=-frame.rot;state.render.scene.add(boundary);
    assert.equal(await upgradeAuthoredPlaceBoundaryForProbe(boundary,fallback,frame,ORCHARD_FRAME_FILE,{},state.render.scene,
      {releaseMode:true,loadAuthoredPart:async()=>pkg.record,prepareAuthoredPipelines:async()=>({skipped:false})}),true);
    let root;boundary.traverse(node=>{if(node.userData.orchardAuthoredSource)root=node;});assert.ok(root);
    const rigs=G.rigs.map(rig=>({rig,node:root.getObjectByName(rig.node)}));
    const assertVisiblePose=pose=>{
      assert.equal(root.userData.orchardNativePose,pose,'presentation retains the exact current reader receipt');
      for(const {rig,node} of rigs) {
        const angle=rig.yawSign*pose.progress[rig.socket]*Math.PI/60;
        assert.equal(node.visible,true);near(node.position.toArray(),rig.pivotGltf);
        near(node.quaternion.toArray(),[0,Math.sin(angle/2),0,Math.cos(angle/2)]);
      }
    };
    const draw=tick=>boundary.userData.updateAuthoredMotion(frame,tick/60,{},state);
    draw(0);assert.equal(root.userData.orchardNativePose.kind,'pose-only');
    const owner=facade._sg02;
    for(const target of [30,0]) {
      const start=target===30?0:30;
      for(let socket=0;socket<3;socket++)assert.equal(owner.requestOrchardMotion(frame,socket,target,start),true);
      for(let offset=1;offset<=30;offset++) {
        const tick=start+offset;
        owner.step(1/60,tick);owner.publishCompletedOrchardContacts(owner.completedOrchardTail(),()=>owner.drainContactImpacts());
        const pose=readOrchardNativePose(state,frame);
        assert.ok(pose);assert.equal(pose.kind,'completed-step');assert.equal(pose.provenance,'native-tail');
        assert.equal(pose.completedNativeTick,tick);assert.equal(pose.canonicalTick,tick);
        assert.deepEqual(pose.progress,Array(3).fill(target===30?offset:30-offset));
        // Repeated draws reset the one-frame bank each time. Every LOD must end
        // at the real native result again, including a stationary completed pose.
        for(const lod of ['lod0','lod1','lod2']) {boundary.userData.updateLod(lod);draw(tick);assertVisiblePose(pose);}
      }
      const dispatch=rendererPoseDispatch(),readPose=facade.readOrchardFramePose;
      let reads=0;
      facade.readOrchardFramePose=function(...args){reads++;return readPose.apply(this,args);};
      try {
        const pose=readOrchardNativePose(state,frame);
        for(const [closures,far,awake] of [[true,false,true],[false,false,true],[true,true,true],[true,false,false],[true,false,true]]) {
          boundary.userData.livingMachineAwake=awake;reads=0;
          dispatch.call({state},frame,closures,far,boundary.userData,1,{});
          assert.equal(reads,1,'completed-pose sleep/far/wake dispatch reads only once');assertVisiblePose(pose);
        }
      } finally {facade.readOrchardFramePose=readPose;}
    }
    const completed=readOrchardNativePose(state,frame),readPose=facade.readOrchardFramePose;
    assert.equal(completed.poseRevision,180);
    // Cosmetic/public data and copied receipt-shaped records cannot replace the
    // current native reader. Neither an old render receipt nor the saved scalar
    // is an animation input.
    root.userData.orchardNativePose=Object.freeze({...completed,progress:Object.freeze([30,30,30])});draw(61);assertVisiblePose(completed);
    frame.data.orchardCollars.progress[0]=1;draw(61);assert.ok(rigs.every(({node})=>!node.visible));
    assert.equal(root.userData.orchardNativePose,undefined);frame.data.orchardCollars.progress[0]=0;
    owner.syncFromEntities(state.entityList);draw(62);assertVisiblePose(readOrchardNativePose(state,frame));
    const malformed=[
      {...completed},
      Object.freeze({...completed,progress:[0,0,0]}),
      Object.freeze({...completed,kind:'saved-step'}),
      Object.freeze({...completed,kind:'pose-only'}),
      Object.freeze({...completed,provenance:'saved'}),
      Object.freeze({...completed,sourceSha:'wrong'}),
      Object.freeze({...completed,bindingRevision:0}),
      Object.freeze({...completed,poseRevision:0}),
      Object.freeze({...completed,completedNativeTick:null}),
      Object.freeze({...completed,completedNativeTick:1.5}),
      Object.freeze({...completed,canonicalTick:-1}),
      Object.freeze({...completed,canonicalTick:NaN}),
      Object.freeze({...completed,progress:Object.freeze([0,31,0])}),
      Object.freeze({...completed,progress:Object.freeze([0,0])}),
    ];
    try {
      for(const bad of malformed) {
        facade.readOrchardFramePose=()=>bad;draw(63);
        assert.equal(root.userData.orchardNativePose,undefined);assert.ok(rigs.every(({node})=>!node.visible));
      }
    } finally {facade.readOrchardFramePose=readPose;}
    draw(64);assertVisiblePose(readOrchardNativePose(state,frame));
    for(const mutation of ['mesh','scene','detach','hidden']) {
      const scene=state.render.scene,parent=boundary.parent;
      facade.readOrchardFramePose=function(...args) {
        const pose=readPose.apply(this,args);assert.equal(pose.kind,'completed-step');
        if(mutation==='mesh')frame.mesh=new THREE.Group();
        if(mutation==='scene')state.render.scene=new THREE.Scene();
        if(mutation==='detach')boundary.removeFromParent();
        if(mutation==='hidden')boundary.visible=false;
        return pose;
      };
      try {draw(65);assert.equal(root.userData.orchardNativePose,undefined);assert.ok(rigs.every(({node})=>!node.visible));}
      finally {facade.readOrchardFramePose=readPose;frame.mesh=boundary;state.render.scene=scene;parent.add(boundary);boundary.visible=true;}
      draw(66);assertVisiblePose(readOrchardNativePose(state,frame));
    }
    facade._nativeRestorePending=true;draw(67);assert.ok(rigs.every(({node})=>!node.visible));facade._nativeRestorePending=false;
    owner.rebuildWorldFromEntities(state.entityList,{orchardColdRestore:true});owner.syncFromEntities(state.entityList);
    const cold=readOrchardNativePose(state,frame);assert.ok(cold);assert.equal(cold.kind,'pose-only');assert.equal(cold.completedNativeTick,null);
    assert.notEqual(cold.bindingRevision,completed.bindingRevision);draw(68);assertVisiblePose(cold);
  } finally {boundary?.userData.dispose?.();sim.dispose();pkg.loader.dispose();}
});

test('decoded Orchard package rebinds only after an accepted retained-mesh restore, including hidden and same-id roots', async t => {
  const observations={kind:'Decoded runtime package, ordinary composer and native reader; CPU observations, not GPU pixels'};
  for (const sameId of [false,true]) {
    const pkg=await packageFixture(),sim=createSimulation({systems:[physics]}),state=sim.state;
    state.mode='flight';state.world.currentSectorId='sector_tethys_junction';state.render={scene:new THREE.Scene()};
    const frame=spawn(sim,[0,14,30]),facade=sim.registry.get('physics');
    let boundary,root;
    try {
      assert.equal(await facade.prepareBackend(state),true);
      let bindAllowed=true;
      const view=Object.create(render);
      Object.assign(view,{state,scene:state.render.scene,_meshes:new Map(),_meshesVersion:0,
        _presentationWorld:{handleForEntityId:id=>({slot:id}),bindMesh:()=>bindAllowed,unbindMesh:()=>true},
        _persistentSubmitLanes:{reserve(){},release(){}},_unbindPresentationMesh(){return true;},
        _meshReleaseBatchBegin(){},_meshReleaseBatchEnd(){}});
      const fallback=new THREE.Group();boundary=buildAuthoredPlaceProp(frame,{fallbackRoot:fallback,releaseMode:true});
      state.render.scene.add(boundary);view._meshes.set(frame.id,boundary);
      assert.equal(view._bindPresentationMesh(frame,boundary),true);
      assert.equal(await upgradeAuthoredPlaceBoundaryForProbe(boundary,fallback,frame,ORCHARD_FRAME_FILE,{},state.render.scene,
        {releaseMode:true,loadAuthoredPart:async()=>pkg.record,prepareAuthoredPipelines:async()=>({skipped:false})}),true);
      boundary.traverse(node=>{if(node.userData.orchardAuthoredSource)root=node;});assert.ok(root);
      const rigs=G.rigs.map(rig=>root.getObjectByName(rig.node));
      const snapshot=entity=>({id:entity.id,life:entity.occupantGeneration,assetState:boundary.userData.authoredAssetState,
        nativePose:readOrchardNativePose(state,entity),renderPose:root.userData.orchardNativePose??null,
        rigs:rigs.map(node=>({node:node.name,quaternion:node.quaternion.toArray(),visible:node.visible}))});
      const assertPose=entity=>{
        const pose=readOrchardNativePose(state,entity);assert.ok(pose);
        assert.equal(root.userData.orchardNativePose,pose);
        for (let i=0;i<rigs.length;i++) {
          const angle=G.rigs[i].yawSign*pose.progress[G.rigs[i].socket]*Math.PI/60;
          assert.equal(rigs[i].visible,true);near(rigs[i].quaternion.toArray(),[0,Math.sin(angle/2),0,Math.cos(angle/2)]);
        }
      };
      boundary.userData.updateAuthoredMotion(frame,0,{},state);assertPose(frame);
      if (!sameId) observations.before=snapshot(frame);
      frame.alive=false;state.entities.delete(frame.id);state.entityList.splice(state.entityList.indexOf(frame),1);
      if (sameId) state.nextEntityId=frame.id;
      const fresh=sim.spawn({type:'wreck',pos:{...frame.pos},rot:frame.rot,radius:G.radius,mass:1e6,hull:300,hullMax:300,
        physicsBody:orchardFrameBodySpec(),data:{...frame.data,orchardCollars:createOrchardCollarState([0,14,30])}});
      assert.equal(fresh.id===frame.id,sameId);assert.notEqual(fresh.occupantGeneration,frame.occupantGeneration);
      state.mode='loading';state.sessionEntityIdRemap=new Map([[String(frame.id),fresh.id]]);
      facade._sg02.rebuildWorldFromEntities(state.entityList,{orchardColdRestore:true});facade._sg02.syncFromEntities(state.entityList);
      assert.ok(readOrchardNativePose(state,fresh));
      // Ordinary updates and even a refused renderer bind cannot adopt a new life.
      boundary.userData.updateAuthoredMotion(fresh,1,{},state);assert.ok(rigs.every(node=>!node.visible));
      bindAllowed=false;assert.equal(view._bindPresentationMesh(fresh,boundary),false);bindAllowed=true;
      boundary.userData.updateOrchardPhysicalState(fresh,state);assert.ok(rigs.every(node=>!node.visible));
      if (!sameId) {
        // Reenact the previously missing handoff on the actual reattach route,
        // retaining the observed pre-fix failure for CPU reconstruction evidence.
        const rebind=boundary.userData.rebindOrchardPhysicalState;assert.equal(typeof rebind,'function');
        delete boundary.userData.rebindOrchardPhysicalState;
        try {
          assert.equal(reattachResidentGpuMeshes(view),1);
          boundary.userData.updateAuthoredMotion(fresh,2,{},state);assert.ok(rigs.every(node=>!node.visible));
          observations.failedRestore=snapshot(fresh);
        } finally {boundary.userData.rebindOrchardPhysicalState=rebind;}
      }
      if (sameId) boundary.visible=false; // Cull/loading visibility cannot block ownership transfer.
      assert.equal(reattachResidentGpuMeshes(view),1);
      assert.equal(fresh.mesh,boundary);assert.equal(view._meshes.get(fresh.id),boundary);
      assert.equal(boundary.userData.presentationOccupantGeneration,fresh.occupantGeneration);
      boundary.visible=true;
      boundary.userData.updateAuthoredMotion(fresh,3,{},state);assertPose(fresh);
      boundary.userData.updateOrchardPhysicalState(fresh,state);assertPose(fresh);
      assert.equal(authoredMotionControllersFor(fresh.id).length,1,'rest bank follows the explicit restored identity');
      if (!sameId) {
        assert.equal(authoredMotionControllersFor(frame.id).length,0);
        observations.fixedRestore=snapshot(fresh);
      }
      root.userData.detachAuthoredMotion();
      assert.equal(root.userData.orchardNativePose,undefined,'teardown owns the successor driver');
      assert.equal(root.userData.rebindOrchardPhysicalState,undefined);
      assert.equal(authoredMotionControllersFor(fresh.id).length,0);
      boundary.userData.updateAuthoredMotion(fresh,4,{},state);
      assert.equal(root.userData.orchardNativePose,undefined,'a retired wrapper cannot revive the successor');
    } finally {root?.userData?.detachAuthoredMotion?.();boundary?.userData.dispose?.();sim.dispose();pkg.loader.dispose();}
  }
  t.diagnostic('ORCHARD_RETAINED_POSE_OBSERVATIONS '+JSON.stringify(observations));
});
