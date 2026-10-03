import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CERES_WORKFLEET_CONTRACT as C } from '../src/data/ceresWorkfleet.js';
import { ceresWorkfleetHardwareSpec } from '../src/data/ceresWorkfleetHardware.js';
import { recordCeresWorkfleetActuation, readCeresWorkfleetActuation, clearCeresWorkfleetActuation } from '../src/core/ceresWorkfleetActuation.js';
import { bindMachineryPresentation, markMachineryEffective, recordCeresWorkfleetAuthoredSource } from '../src/core/machineryPresentation.js';
import { createCeresWorkfleetNozzleSamples, sampleCeresWorkfleetNozzles, createCeresWorkfleetPropulsionDriver,
  createCeresWorkfleetPlumeBatch, ceresWorkfleetPropulsionAwake, ceresWorkfleetVisualRigs } from '../src/render/ceresWorkfleetVisuals.js';
import { attachAuthoredMotionDriver } from '../src/render/authoredMotion.js';
import { ContinuousPlumeSystem } from '../src/render/thruster/systems/continuousPlume.js';
import { resolveThrusterRecipes } from '../src/render/thruster/recipes/registry.js';
import { vfx } from '../src/render/vfx.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const limits=role=>role==='breaker'?{accel:.5,angularAccel:.025}:{accel:8,angularAccel:.6};
function fixture(role='breaker',{sharedMaterial=new THREE.MeshStandardMaterial({emissive:0x77bbff,emissiveIntensity:3})}={}) {
  const entity={id:role,occupantGeneration:1,...ceresWorkfleetHardwareSpec(role)};
  const root=new THREE.Group();root.userData.authoredAssetState='authored';root.scale.setScalar(C.sourceScale);
  entity.mesh=root;root.position.set(37,4,-61);root.rotation.y=-.7;
  for(const channel of C.assets[role].propulsion.channels) {
    const socket=new THREE.Group();socket.name=channel.socket;
    socket.position.set(channel.mouth.x/2,channel.mouth.y/2,channel.mouth.z/2);root.add(socket);
    for(const name of channel.coreMeshes) {
      const core=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),sharedMaterial);core.name=name;
      root.add(core);
    }
  }
  for(const rig of ceresWorkfleetVisualRigs(role)){const pivot=new THREE.Group();pivot.name=rig.node;root.add(pivot);}
  const scene=new THREE.Scene();scene.add(root);scene.updateMatrixWorld(true);
  const state={tick:4,simTime:.4,playerId:'player',entities:new Map([[entity.id,entity]]),
    render:{scene,renderer:{},admissionRunGeneration:1,contextRecovery:{pending:false,generation:1}}};
  recordCeresWorkfleetAuthoredSource(root,C.assets[role]);bindMachineryPresentation(entity,root,state);
  markMachineryEffective(entity,state,C.assets[role].id);
  const driver=createCeresWorkfleetPropulsionDriver(root,entity);
  return {entity,root,state,driver,sharedMaterial};
}
function record(t,fx=100,fz=0,torque=0) {
  const c=Math.cos(t.entity.rot),s=Math.sin(t.entity.rot);
  return recordCeresWorkfleetActuation(t.state,t.entity,
    {force:{x:fx*c-fz*s,z:fx*s+fz*c},torque:{y:torque}},limits(t.entity.data.ceresWorkfleetRole));
}
for(const role of ['breaker','cutterHead'])test(`${role}: nozzle forces reconstruct every signed input with no opposing same-station burn`,()=>{
  const samples=createCeresWorkfleetNozzleSamples(role);
  assert.equal(samples.length,role==='breaker'?10:6);
  for(const fx of [-1600,-30,0,30,1600])for(const fz of [-480,0,480])for(const torque of [-318506,-1200,0,1200,318506]) {
    sampleCeresWorkfleetNozzles(role,{localFx:fx,localFz:fz,torque,linearCapacity:1600,torqueCapacity:318506},samples);
    let x=0,z=0,yaw=0;
    for(const {channel,force,level} of samples) {
      const ax=force*channel.forceDirection.x,az=force*channel.forceDirection.z;
      x+=ax;z+=az;yaw+=channel.mouth.x*az-channel.mouth.z*ax;
      assert.ok(force>=0&&level>=0&&level<=1);
    }
    near(x,fx);near(z,fz);near(yaw,torque);
    const by=Object.fromEntries(samples.map(s=>[s.channel.id,s.force]));
    const pairs=role==='breaker'? [['MAIN_PORT_INNER','RETRO_PORT'],['MAIN_STARBOARD_INNER','RETRO_STARBOARD'],
      ['RCS_BOW_PORT','RCS_BOW_STARBOARD'],['RCS_STERN_PORT','RCS_STERN_STARBOARD']]
      :[['AXIAL_AFT_PORT','AXIAL_FORE_PORT'],['AXIAL_AFT_STARBOARD','AXIAL_FORE_STARBOARD'],['LATERAL_PORT','LATERAL_STARBOARD']];
    for(const [a,b] of pairs)assert.equal(by[a]*by[b],0);
  }
});
test('only ephemeral current consumed force lights the exact admitted body lifetime',()=>{
  const changes=[t=>t.state.tick++,t=>t.state.simTime+=.01,t=>t.entity.alive=false,t=>t.entity.hull=0,
    t=>t.entity.occupantGeneration++,t=>t.entity.data.disabled=true,t=>t.entity.data.controlLease={},
    t=>t.entity.data.playerOwned=true,t=>t.entity.data.worldRecordId='spoof',t=>t.entity.data.ceresWorkfleetRole='cradle',
    t=>t.state.entities.set(t.entity.id,{...t.entity}),t=>t.state.render={...t.state.render},
    t=>t.state.render.scene=new THREE.Scene(),t=>t.state.render.renderer={},
    t=>t.state.render.admissionRunGeneration++,t=>t.state.render.contextRecovery.generation++,
    t=>t.state.render.contextRecovery.pending=true,t=>t.entity.mesh.userData.pipelinesPending=true,
    t=>t.entity.mesh.userData.authoredAssetState='failed',t=>t.entity.physicsBody={...t.entity.physicsBody},
    t=>t.state.combat={entities:{[t.entity.id]:{capabilities:{drive:false}}}},
    t=>t.state.combat={entities:{[t.entity.id]:{capabilities:{power:false}}}}];
  for(const mutate of changes) {
    const t=fixture();assert.ok(record(t));assert.ok(readCeresWorkfleetActuation(t.entity,t.state));
    t.driver.update(t.entity);assert.ok(t.driver.binding.samples.some(s=>s.materials[0].material.emissiveIntensity>0));
    mutate(t);assert.equal(readCeresWorkfleetActuation(t.entity,t.state),null);
    t.driver.update(t.entity);assert.ok(t.driver.binding.samples.every(s=>s.materials[0].material.emissiveIntensity===0));
    t.driver.dispose();
  }
  const t=fixture();t.entity.data.ceresWorkfleetActuation={tick:t.state.tick,forward:999,linearFraction:1};
  t.entity._flightFrame={driveId:'ceres_workfleet_service_thrusters',actuators:{main:999}};
  assert.equal(readCeresWorkfleetActuation(t.entity,t.state),null);
  t.driver.update(t.entity);assert.ok(t.driver.binding.samples.every(s=>s.level===0));
  t.driver.dispose();
});
test('channel radiance is isolated across opposed throats, LODs, instances and disposal without changing visibility or pose',()=>{
  const t=fixture(),other=fixture('breaker',{sharedMaterial:t.sharedMaterial});
  assert.equal(t.sharedMaterial.emissiveIntensity,3);
  const cold=t.driver.binding.samples.map(s=>s.materials[0].material);
  assert.equal(new Set(cold).size,10);
  for(const sample of t.driver.binding.samples)assert.equal(new Set(sample.meshes.map(n=>n.material)).size,1);
  const hidden=t.driver.binding.samples[0].meshes[0];hidden.visible=false;hidden.scale.set(2,3,4);
  record(t,800);t.driver.update(t.entity,{reducedMotion:true,reducedFlash:true});
  assert.ok(t.driver.binding.samples.slice(0,4).every(s=>s.level===.5));
  assert.ok(t.driver.binding.samples.slice(4).every(s=>s.level===0));
  assert.equal(other.driver.binding.samples[0].materials[0].material.emissiveIntensity,0);
  assert.equal(hidden.visible,false);assert.deepEqual(hidden.scale.toArray(),[2,3,4]);
  record(t,-800);t.driver.update(t.entity);assert.ok(t.driver.binding.samples.slice(0,4).every(s=>s.level===0));
  t.driver.dispose();assert.ok(cold.every(m=>m.emissiveIntensity===0));other.driver.dispose();
});
test('cutter head binds without a motion bank and clears all throats on detach',()=>{
  const t=fixture('cutterHead');t.driver.dispose();
  const detach=attachAuthoredMotionDriver(t.root,t.entity,[]);assert.equal(typeof detach,'function');
  record(t,240);t.root.userData.updateDriveState(t.entity,9);
  const lit=t.root.getObjectByName(C.assets.cutterHead.propulsion.channels[0].coreMeshes[0]);assert.ok(lit.material.emissiveIntensity>0);
  detach();assert.equal(lit.material.emissiveIntensity,0);assert.equal(t.root.userData.updateDriveState,undefined);
});
test('continuous source sockets follow rotated render pose, rebasing, pause and accessibility; coast sleeps with fixed capacity',()=>{
  const t=fixture(),plume=new ContinuousPlumeSystem(THREE,resolveThrusterRecipes('engine_industrial').main,{maxSockets:16,distortionEnabled:false});
  const batch=createCeresWorkfleetPlumeBatch(plume,THREE.Vector3),slots=batch.slots.slice();
  record(t,800);assert.equal(ceresWorkfleetPropulsionAwake(t.state),true);
  assert.equal(batch.update(t.state,1/60,{}),4);assert.equal(batch.slots.length,16);
  const first=batch.slots[0],expected=t.root.getObjectByName(first.channel.socket).getWorldPosition(new THREE.Vector3());
  near(first.sockets[0].x,expected.x);near(first.sockets[0].z,expected.z);
  near(first.sockets[0].ax,Math.cos(.7));near(first.sockets[0].az,Math.sin(.7));
  t.root.position.x-=10000;t.root.position.z+=5000;t.root.updateMatrixWorld(true);
  const time=plume._time;
  batch.update(t.state,0,{reducedMotion:true,reducedFlash:true});assert.equal(plume._time,time);
  near(first.sockets[0].x,expected.x-10000);near(first.sockets[0].z,expected.z+5000);
  assert.ok(plume.layerBatches.every(b=>b.mesh?.isInstancedMesh||b.material));
  assert.ok(plume.pool.activeCount>0);assert.equal(plume.pool.frameAllocations,0);
  record(t,0);t.entity.vel={x:500,z:-500};t.driver.update(t.entity);
  assert.equal(batch.update(t.state,1/60,{}),0);assert.equal(ceresWorkfleetPropulsionAwake(t.state),false);
  assert.equal(plume.pool.activeCount,0);assert.ok(t.driver.binding.samples.every(s=>s.level===0));
  for(let i=0;i<16;i++)assert.equal(batch.slots[i],slots[i]);
  record(t,0,480,900);assert.ok(batch.update(t.state,1/60,{reducedMotion:true})>0);
  t.state.render.contextRecovery.pending=true;assert.equal(batch.update(t.state,1/60,{}),0);
  assert.ok(batch.slots.every(s=>s.driveState.plumeDrive===0));batch.dispose();t.driver.dispose();
});
test('generic speed plume path excludes only exact Ceres bodies, preserving ordinary ships and wrecks',()=>{
  const owner=Object.create(vfx);owner.state={playerId:'player'};
  owner._rcsScaleCache=new Map();owner._rcsDefaultScale={};owner._mainDriveDemandScratch={};
  for(const role of ['breaker','cutterHead']) {
    const t=fixture(role);t.entity.vel={x:100,z:0};t.entity.flags.boosting=true;
    const out=owner._engineDriveFor(t.entity,{});assert.equal(out.drive,0);assert.equal(out.speedDrive,0);
    assert.equal(owner._usesProductionThruster(t.entity),true);
    t.entity.data.worldRecordId='ordinary';assert.equal(owner._usesProductionThruster(t.entity),false);
    t.driver.dispose();
  }
  const ordinary={id:'ordinary',type:'ship',vel:{x:100,z:0},rot:0};
  assert.ok(owner._engineDriveFor(ordinary,{}).drive>0);
});

import { createBus } from '../src/core/eventBus.js';
test('live VFX wakes for the wreck-typed cutter, continuously brakes, and returns to sleep without generic emission',()=>{
  const t=fixture('cutterHead');
  Object.assign(t.state,{player:{},entityList:[t.entity],input:{moveZ:0,turnIntent:0},
    settings:{video:{particleQuality:'high',engineTrails:true,energyMaterials:false,motionReduce:false,bloom:false},
      accessibility:{flashReduce:false}}});
  const owner=Object.create(vfx);owner.init({state:t.state,bus:createBus(),helpers:{}});
  record(t,-240);assert.equal(owner._updateEnergy(1/60),true);
  const batch=owner._energy.ceresWorkfleet,group=batch.plume.group;
  assert.equal(batch.activeCount,2);assert.equal(group.parent,t.state.render.scene);
  assert.equal(owner._energy.fleet.hasEntity(t.entity.id),false);
  for(let i=0;i<20;i++)assert.equal(owner._updateEnergy(1/60),true);
  assert.equal(batch.activeCount,2);assert.equal(batch.slots.filter(s=>s.signals.throttle>0).length,2);
  assert.equal(owner._liveTrailStreakCount,0);assert.equal(owner._liveCount,0);
  clearCeresWorkfleetActuation(t.entity);t.entity.vel={x:100,z:100};
  owner._updateEnergy(1/60);assert.equal(owner._updateEnergy(1/60),false);
  assert.equal(group.visible,false);assert.ok(batch.slots.every(s=>s.driveState.plumeDrive===0));
  owner._disposeEnergy();assert.equal(group.parent,null);t.driver.dispose();
});
