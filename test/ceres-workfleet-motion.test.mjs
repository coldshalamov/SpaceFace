import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { CERES_WORKFLEET_CONTRACT as C } from '../src/data/ceresWorkfleet.js';
import { ceresWorkfleetVisualRigs, createCeresWorkfleetMotionDriver } from '../src/render/ceresWorkfleetVisuals.js';
import { ceresWorkfleetRigPose } from '../src/data/ceresWorkfleetArticulation.js';
import { attachAuthoredMotionDriver, authoredMotionControllersFor } from '../src/render/authoredMotion.js';
const base=process.env.CERES_WORKFLEET_SOURCE_DIR||'assets/ships/parts';
const e=role=>({id:`motion:${role}`,type:role==='breaker'?'ship':'wreck',alive:true,
 data:{ceresWorkfleetRole:role,worldRecordId:C.identities[role==='breaker'?'worker':role],
 placeId:C.assets[role].id,ceresWorkfleetSlide:0,ceresWorkfleetSlideTarget:1}});
async function graph(role){
 const nested=path.join(base,C.assets[role].file);
 const file=fs.existsSync(nested)?nested:path.join(base,path.basename(C.assets[role].file));assert.ok(fs.existsSync(file),`Required original source missing: ${file}`);
 const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
 const materials=new Map();
 const convert=n=>{const mesh=n.getMesh(),primitive=mesh?.listPrimitives()[0],source=primitive?.getMaterial();
  if(source&&!materials.has(source))materials.set(source,new THREE.MeshStandardMaterial({emissive:0x77aaff,emissiveIntensity:3}));
  const out=primitive?new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),materials.get(source)||new THREE.MeshStandardMaterial()):new THREE.Group();
  out.name=n.getName();out.userData={...n.getExtras()};
  out.position.fromArray(n.getTranslation());out.quaternion.fromArray(n.getRotation());out.scale.fromArray(n.getScale());
  for(const child of n.listChildren())out.add(convert(child));return out;};
 const root=new THREE.Group();for(const n of doc.getRoot().listScenes()[0].listChildren())root.add(convert(n));return root;
}
for(const role of ['breaker','cradle'])test(`${role} source rigs and every LOD follow accepted physical slide, never requested motion`,async()=>{
 const root=await graph(role),entity=e(role),rigs=ceresWorkfleetVisualRigs(role);
 let meta;root.traverse(n=>{if(n.userData.ceresWorkfleet?.part===role)meta=n.userData.ceresWorkfleet;});
 assert.ok(meta,'Original source rig certificate must survive on its root');assert.equal(meta.rigs.length,rigs.length);
 for(const rig of rigs){const source=meta.rigs.find(r=>r.node===rig.node);assert.ok(source);
  for(const key of ['pivotWU','runtimeAxis','retainedDeltaWU','retainedScale'])assert.deepEqual(source[key],rig[key]);
  const node=root.getObjectByName(rig.node);assert.ok(node);
  const lods=new Set();node.traverse(n=>{const m=/^LOD([012])_/.exec(n.name);if(m)lods.add(m[1]);});assert.equal(lods.size,3);
 }
 const fake={rigId:'test-open-reference',handleEvent(){},update(){for(const rig of rigs){const n=root.getObjectByName(rig.node);n.position.set(999,999,999);n.scale.set(99,99,99);}}};
 const detach=attachAuthoredMotionDriver(root,entity,[fake]);assert.equal(typeof detach,'function');
 for(let i=0;i<=100;i++){
  entity.data.ceresWorkfleetSlide=i/100;
  root.userData.updateAuthoredMotion(entity,1000-i,{reducedMotion:true});
  for(const rig of rigs){const node=root.getObjectByName(rig.node),pose=ceresWorkfleetRigPose(rig,i/100);
   assert.deepEqual(node.position.toArray(),[pose.position.x,pose.position.y,pose.position.z]);
   assert.deepEqual(node.scale.toArray(),[pose.scale.x,pose.scale.y,pose.scale.z]);
  }
 }
 detach();assert.equal(root.userData.updateAuthoredMotion,undefined);assert.equal(authoredMotionControllersFor(entity.id).length,0);
});
test('missing required physical pivot fails admission instead of drawing wrong collision pose',async()=>{
 const root=await graph('breaker');const missing=root.getObjectByName('MOTION_SHOE_PORT');missing.removeFromParent();
 assert.throws(()=>createCeresWorkfleetMotionDriver(root,e('breaker')),/missing a sealed physical motion pivot/);
 const ordinary=e('breaker');ordinary.data.worldRecordId='ordinary';assert.equal(createCeresWorkfleetMotionDriver(root,ordinary),null);
});

import { ceresWorkfleetHardwareSpec } from '../src/data/ceresWorkfleetHardware.js';
import { recordCeresWorkfleetActuation } from '../src/core/ceresWorkfleetActuation.js';
import { bindMachineryPresentation, markMachineryEffective, recordCeresWorkfleetAuthoredSource } from '../src/core/machineryPresentation.js';
import { createCeresWorkfleetPlumeBatch } from '../src/render/ceresWorkfleetVisuals.js';
import { ContinuousPlumeSystem } from '../src/render/thruster/systems/continuousPlume.js';
import { resolveThrusterRecipes } from '../src/render/thruster/recipes/registry.js';
for(const role of ['breaker','cutterHead'])test(`${role} actual source sockets and independent LOD cores feed the runtime propulsion batch`,async()=>{
  const root=await graph(role),asset=C.assets[role];
  const entity={id:`source:${role}`,occupantGeneration:1,...ceresWorkfleetHardwareSpec(role)};
  entity.rot=.83;entity.mesh=root;root.scale.setScalar(C.sourceScale);root.rotation.y=-entity.rot;
  root.position.set(193,0,-247);root.userData.authoredAssetState='authored';
  const scene=new THREE.Scene();scene.add(root);scene.updateMatrixWorld(true);
  const state={tick:17,simTime:1.7,entities:new Map([[entity.id,entity]]),render:{scene,renderer:{},admissionRunGeneration:1}};
  recordCeresWorkfleetAuthoredSource(root,asset);bindMachineryPresentation(entity,root,state);
  markMachineryEffective(entity,state,asset.id);
  const detach=attachAuthoredMotionDriver(root,entity,[]);
  const plume=new ContinuousPlumeSystem(THREE,resolveThrusterRecipes('engine_industrial').main,{maxSockets:16,distortionEnabled:false});
  const batch=createCeresWorkfleetPlumeBatch(plume,THREE.Vector3);
  const caps=role==='breaker'?{accel:.5,angularAccel:.025}:{accel:8,angularAccel:.6};
  try {
    for(const [fx,fz,torque] of [[entity.mass*caps.accel,0,0],[-entity.mass*caps.accel,0,0],[0,0,entity.physicsBody.inertiaY*caps.angularAccel]]) {
      const c=Math.cos(entity.rot),s=Math.sin(entity.rot);
      assert.ok(recordCeresWorkfleetActuation(state,entity,{force:{x:fx*c-fz*s,z:fx*s+fz*c},torque:{y:torque}},caps));
      root.userData.updateAuthoredMotion(entity,9,{reducedMotion:true});
      assert.ok(batch.update(state,1/60,{reducedMotion:true})>0);
      for(const channel of asset.propulsion.channels) {
        const core=root.getObjectByName(channel.coreMeshes[0]);
        const sample=batch.slots.find(slot=>slot.role===role&&slot.channel===channel);
        for(const name of channel.coreMeshes)assert.equal(root.getObjectByName(name).material,core.material);
        if(sample.signals.throttle<=0)continue;
        const expected=root.localToWorld(new THREE.Vector3(channel.mouth.x/2,channel.mouth.y/2,channel.mouth.z/2));
        const actual=sample.sockets[0];
        assert.ok(Math.hypot(actual.x-expected.x,actual.y-expected.y,actual.z-expected.z)<1e-4,
          `${channel.id} renders at its real source lip, never a center/radius approximation`);
        const axis=new THREE.Vector3(channel.exhaustDirection.x,channel.exhaustDirection.y,channel.exhaustDirection.z).transformDirection(root.matrixWorld);
        assert.ok(Math.hypot(actual.ax+axis.x,actual.ay+axis.y,actual.az+axis.z)<1e-6);
        assert.ok(core.material.emissiveIntensity>0);
      }
    }
  } finally {batch.dispose();detach();}
});
