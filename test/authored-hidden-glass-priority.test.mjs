import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { enqueueBoundaryUpgrade, cancelAuthoredUpgradeQueue } from '../src/render/partsLibrary.js';

for (const tier of ['R0_GLASS', 'R2_METADATA']) {
  test(`hidden ${tier} boundary carries live preparation priority without publishing`, async () => {
    const oldWindow=globalThis.window,oldRaf=globalThis.requestAnimationFrame;
    const frames=[];globalThis.requestAnimationFrame=fn=>frames.push(fn);
    const scene=new THREE.Scene(),boundary=new THREE.Group();boundary.visible=false;scene.add(boundary);
    const player={id:1,alive:true,pos:{x:0,z:0}},entity={id:2,type:'place',alive:true,pos:{x:tier==='R0_GLASS'?50:50000,z:0},radius:20,
      activity:{presentationTier:tier},data:{placeId:'place_charon_colony_service_barge'}};
    const state={mode:'flight',playerId:1,entities:new Map([[1,player],[2,entity]]),world:{},camera:{zoom:144},render:{firstPlayableFrameAt:1,gpu:{tier:'software'}}};
    globalThis.window={SF:{state}};let received;
    try {
      const done=enqueueBoundaryUpgrade(scene,{boundary,entity,renderer:null,options:{deferBoundaryPublication:true},run:({options})=>{received=options;return true;}});
      for(let i=0;i<5&&!received;i++){for(const fn of frames.splice(0))fn();for(let j=0;j<30;j++)await Promise.resolve();}
      assert.ok(received,'actual queue run starts');
      assert.equal(received.admissionVisible===true,tier==='R0_GLASS');
      assert.equal(received.deferBoundaryPublication,true);
      assert.equal(boundary.visible,false);assert.equal(entity.mesh,undefined);
      await done;
    } finally {
      cancelAuthoredUpgradeQueue(scene);
      if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;
      if(oldRaf===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=oldRaf;
    }
  });
}

for(const change of ['approach','still-ambient','recycled-id','departed-sector','stale-epoch','owner-inactive','shell-active','gpu-active','loading-mode']) {
 test(`existing watchdog observes ${change} without publishing hidden preparation`,async()=>{
  const oldWindow=globalThis.window,oldRaf=globalThis.requestAnimationFrame,oldTimeout=globalThis.setTimeout;
  const frames=[],wakes=[];globalThis.requestAnimationFrame=fn=>frames.push(fn);
  globalThis.setTimeout=(fn,ms,...args)=>ms===5000?(wakes.push(fn),{unref(){}}):oldTimeout(fn,ms,...args);
  const scene=new THREE.Scene(),boundary=new THREE.Group();boundary.visible=false;boundary.userData.admissionEpoch=1;scene.add(boundary);
  const player={id:1,alive:true,pos:{x:0,z:0}},entity={id:2,type:'place',alive:true,pos:{x:50000,z:0},radius:20,activity:{presentationTier:'R2_METADATA'},data:{placeId:'place_charon_colony_service_barge'}};
  const state={mode:'flight',playerId:1,entities:new Map([[1,player],[2,entity]]),world:{currentSectorId:'charon'},camera:{zoom:144},render:{firstPlayableFrameAt:1,gpu:{tier:'software'}}};
  globalThis.window={SF:{state}};let received,release,futureConsumerRead;let active=true;
  const work=new Promise(resolve=>{release=resolve;});
  try {
   const done=enqueueBoundaryUpgrade(scene,{boundary,entity,renderer:null,options:{sectorId:'charon',admissionEpoch:1,deferBoundaryPublication:true,isResidencyOwnerActive:()=>active},run:({options})=>{received=options;return work.then(()=>{futureConsumerRead=options.admissionVisible===true;return true;});}});
   for(const fn of frames.splice(0))fn();for(let i=0;i<30;i++)await Promise.resolve();
   assert.ok(received);assert.notEqual(received.admissionVisible,true);assert.ok(wakes.length>0);
   if(change!=='still-ambient'){entity.pos.x=50;entity.activity.presentationTier='R0_GLASS';}
   if(change==='recycled-id')state.entities.set(entity.id,{...entity});
   if(change==='departed-sector')state.world.currentSectorId='helios';
   if(change==='stale-epoch')boundary.userData.admissionEpoch=2;
   if(change==='owner-inactive')active=false;
   if(change==='shell-active')state.render.sectorShellAdmission=true;
   if(change==='gpu-active')state.render.liveSectorGpuAdmission=true;
   if(change==='loading-mode')state.mode='loading';
   wakes.shift()();for(let i=0;i<30;i++)await Promise.resolve();
   assert.equal(received.admissionVisible===true,change==='approach');
   assert.equal(received.deferBoundaryPublication,true);assert.equal(boundary.visible,false);assert.equal(entity.mesh,undefined);
   if(change==='approach'){
    entity.pos.x=50000;entity.activity.presentationTier='R2_METADATA';
    wakes.shift()?.();assert.equal(received.admissionVisible,true,'existing monotonic scheduling contract survives a later departure');
   }
   release(true);await done;
   if(change!=='owner-inactive')assert.equal(futureConsumerRead,change==='approach','later consumer reads the promoted live option, without changing already-copied request bags');
  }finally{
   release(true);cancelAuthoredUpgradeQueue(scene);
   globalThis.setTimeout=oldTimeout;
   if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;
   if(oldRaf===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=oldRaf;
  }
 });
}
