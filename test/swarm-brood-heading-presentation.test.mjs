import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createBus} from '../src/core/eventBus.js';
import {createGameState} from '../src/core/gameState.js';
import {createRunState} from '../src/core/runState.js';
import {createBroodEngine, BROOD_ATTACK_ARRIVAL_S} from '../src/systems/swarmBrood.js';
import {TENDRIL_HEAD_LOOT_ID, SWARM_BROOD_FAMILIES} from '../src/data/swarmBrood.js';
import {SWARM_BROOD_LATE_FAMILIES} from '../src/data/swarmBroodLate.js';
import {SWARM_MACHINE_FAMILIES} from '../src/data/swarmMachine.js';
import {SURVIVAL_COHORT_TAG} from '../src/systems/waveMaterialization.js';
import {createBroodPresentation} from '../src/render/broodPresentation.js';
import {vfx} from '../src/render/vfx.js';

function boot(wave) {
  const state=createGameState(4242), player={id:state.nextEntityId++,alive:true,type:'ship',team:0,
    pos:{x:0,z:0},vel:{x:0,z:0},radius:6,mass:400};
  state.mode='flight';state.entities.set(player.id,player);state.entityList.push(player);state.playerId=player.id;
  state.run=createRunState({kind:'survival',ruleset:'swarm',seed:4242});
  state.run.arenaId='helios_core';state.run.phase='active';state.run.wave=wave;
  const engine=createBroodEngine({bus:createBus(),getState:()=>state,fieldList:()=>[],routeDamage:r=>r});
  engine.prepareWave(state.run,wave);engine.spawnWave(state);
  state.simTime+=BROOD_ATTACK_ARRIVAL_S;
  return {state,engine};
}
function present(h) {
  h.state.swarmBrood=h.engine.view;
  const scene=new THREE.Scene(),pres=createBroodPresentation(scene,400),owner=Object.create(vfx);
  owner.state=h.state;owner._broodPresentation=pres;owner._updateBroodPresentation(1/60);
  return {scene,pres};
}
function direction(mesh, index) {
  const matrix=new THREE.Matrix4();mesh.getMatrixAt(index,matrix);
  const origin=new THREE.Vector3(0,0,0).applyMatrix4(matrix);
  return new THREE.Vector3(1,0,0).applyMatrix4(matrix).sub(origin).normalize();
}
function aligned(mesh,index,angle) {
  const d=direction(mesh,index);
  assert.ok(Math.hypot(d.x-Math.cos(angle),d.z-Math.sin(angle))<1e-5,
    `nose (${d.x},${d.z}) mismatches heading ${angle}`);
}
test('engine-published brood body headings aim the shared +X nose on both slopes', () => {
  for(const z of [60,-60]) {
    const h=boot(7);h.state.entities.get(h.state.playerId).pos.z=z;
    h.state.simTime+=1/60;h.state.tick++;h.engine.step(h.state);
    const {scene,pres}=present(h);
    try {
      const view=h.engine.view;let drawn=0,checked=0;
      for(let i=0;i<view.cap;i++) {
        if(!view.alive[i]) continue;
        assert.equal(pres.mesh.parent,scene);
        aligned(pres.mesh,drawn++,view.heading[i]);checked++;
      }
      assert.ok(checked>0);
    } finally {pres.dispose();}
  }
});
test('engine-published Tendril segment heading aims its own shared +X nose', () => {
  for(const vz of [30,-30]) {
    const h=boot(80), head={id:h.state.nextEntityId++,alive:true,type:'ship',team:2,
      pos:{x:120,z:0},vel:{x:-30,z:vz},radius:26,mass:300,
      data:{lootTableId:TENDRIL_HEAD_LOOT_ID,runCohort:SURVIVAL_COHORT_TAG}};
    h.state.entities.set(head.id,head);h.state.entityList.push(head);
    h.state.tick++;h.state.simTime+=1/60;h.engine.step(h.state);
    assert.ok(h.engine.view.segAliveCount>0);
    const {scene,pres}=present(h);
    try {
      assert.equal(pres.segs.parent,scene);assert.ok(pres.segs.count>0);
      aligned(pres.segs,0,h.engine.view.segHeading[0]);
    } finally {pres.dispose();}
  }
});

test('all shared-geometry families retain their scales and turn continuously across pi', () => {
  const families=[...SWARM_BROOD_FAMILIES,...SWARM_BROOD_LATE_FAMILIES,...SWARM_MACHINE_FAMILIES];
  const n=families.length, scene=new THREE.Scene(), pres=createBroodPresentation(scene,n);
  const view={cap:n,aliveCount:n,alive:Array(n).fill(1),px:Array(n).fill(0),pz:Array(n).fill(0),
    heading:Array(n).fill(Math.PI-0.001),family:families.map((_,i)=>i),phase:Array(n).fill(0),
    seedPhase:Array(n).fill(0),teleX:Array(n).fill(0),teleZ:Array(n).fill(0),timer:Array(n).fill(0)};
  try {
    pres.update(view,1/60,{simTime:1,reducedMotion:true});
    const before=[];
    for(let i=0;i<n;i++) {
      const m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
      pres.mesh.getMatrixAt(i,m);m.decompose(p,q,s);
      assert.ok(s.x>0 && s.y>0 && s.z>0, `${families[i].id} retains positive silhouette scales`);
      before.push({direction:direction(pres.mesh,i),scale:s});
      aligned(pres.mesh,i,view.heading[i]);
    }
    view.heading.fill(-Math.PI+0.001);
    pres.update(view,1/60,{simTime:2,reducedMotion:true});
    for(let i=0;i<n;i++) {
      const m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
      pres.mesh.getMatrixAt(i,m);m.decompose(p,q,s);
      assert.ok(s.distanceTo(before[i].scale)<1e-5, `${families[i].id} scale is unchanged`);
      assert.ok(direction(pres.mesh,i).distanceTo(before[i].direction)<0.003, `${families[i].id} turns continuously`);
      aligned(pres.mesh,i,view.heading[i]);
    }
  } finally {pres.dispose();}
});
