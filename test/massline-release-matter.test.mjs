import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MasslineReleaseMatter } from '../src/render/vfx/masslineReleaseMatter.js';
import { createMasslineReleaseArcPlan, resolveMasslineReleaseArcPlan } from '../src/render/masslineReleaseArc.js';
import { vfx } from '../src/render/vfx.js';

const body=()=>({id:44,alive:true,pos:{x:120,z:-40},vel:{x:35,z:12},radius:7,rot:.4});
const snapshot=o=>o.batch.attributes.map(a=>Array.from(a.array));
function plan(b,extra={}){return resolveMasslineReleaseArcPlan(createMasslineReleaseArcPlan(),{
  active:true,releaseTarget:{kind:'entity',targetId:b.id},liveTarget:b,radiusPadding:4,
  predictor:{valid:true,onSolution:true,errorRad:0,tolRad:.1,timeToSolution:.1},...extra});}

test('receiver uses open unequal shoulders at the actual target with transported current, no tiled ring',()=>{
  const scene=new THREE.Scene(),b=body(),o=new MasslineReleaseMatter(scene);
  try{
    o.receiver(plan(b),b,3);o.receiver(plan(b),b,3.3);
    assert.equal(o.mesh.count,6);const path=o.batch.attributes[1],shape=o.batch.attributes[2];
    let totalAngle=0;
    for(let i=0;i<6;i+=2){
      assert.equal(path.getX(i),4);totalAngle+=path.getZ(i)-path.getY(i);
      assert.ok(shape.getX(i)>=.8&&shape.getY(i)>.5,'cross-sections retain visible depth');
      assert.ok(Math.abs(shape.getZ(i)-11)<.3,'shoulders remain at the real receiver edge');
    }
    assert.ok(totalAngle<Math.PI,'negative space exceeds luminous rim coverage');
    const before=snapshot(o);o.receiver(plan(b),b,3.7);assert.notDeepEqual(snapshot(o),before);
    b.pos.x+=20;b.rot+=.3;o.receiver(plan(b),b,3.7);
    assert.equal(o.batch.attributes[0].getX(0),140);assert.ok(o.batch.attributes[0].getW(0)>.69);
    o.receiver({...plan(b),visible:false},b,3.8);assert.equal(o.mesh.count,0);
  }finally{o.dispose();}
});

test('apex follows the released mass and velocity, peels without expanding scale, then drains',()=>{
  const scene=new THREE.Scene(),b=body(),original=structuredClone(b),o=new MasslineReleaseMatter(scene);
  try{
    assert.ok(o.release(b,4,.8));o.updateRelease(4.16,b);assert.equal(o.mesh.count,6);
    const origin=o.batch.attributes[0],path=o.batch.attributes[1],shape=o.batch.attributes[2];
    for(let i=0;i<o.mesh.count;i++){
      assert.ok(Math.hypot(origin.getX(i)-b.pos.x,origin.getZ(i)-b.pos.z)<b.radius*1.2);
      assert.ok(Math.abs(path.getY(i))<=21&&Math.abs(path.getZ(i))<=21);
      assert.ok(shape.getX(i)<=3,'broad but bounded channel body');
    }
    const before=snapshot(o),cut=o.batch.attributes[5].getY(0);o.updateRelease(4.16,b);
    assert.deepEqual(snapshot(o),before,'paused sim clock preserves all descriptors');
    o.updateRelease(4.5,b);assert.ok(o.batch.attributes[5].getY(0)>cut,'source cutoff travels along the fold');
    assert.deepEqual(o.mesh.scale.toArray(),[1,1,1],'no whole-shape grow/shrink');
    assert.deepEqual(b,original,'presentation never changes the throw');
    const x=origin.getX(0);b.pos.x+=40;o.updateRelease(4.5,b);assert.ok(Math.abs(origin.getX(0)-x-40)<1e-4);
    b.vel={x:0,z:45};o.updateRelease(4.6,b);assert.equal(o.axis,Math.PI/2);
    o.updateRelease(4.9,b);assert.equal(o.active,false);assert.equal(o.mesh.visible,false);
  }finally{o.dispose();assert.equal(scene.children.length,0);}
});

test('reduced motion, rebase, recycled body, rewind and disposal stay bounded',()=>{
  const scene=new THREE.Scene(),b=body(),o=new MasslineReleaseMatter(scene);
  try{
    o.receiver(plan(b,{reducedMotion:true}),b,1);o.receiver(plan(b,{reducedMotion:true}),b,2);
    const stationary=snapshot(o);o.receiver(plan(b,{reducedMotion:true}),b,3);
    assert.deepEqual(snapshot(o),stationary);assert.equal(o.batch.material.uniforms.uMotion.value,0);
    o.release(b,4,.6);o.updateRelease(4.2,b,true,true);
    assert.ok(o.mesh.count>0);assert.equal(o.batch.material.uniforms.uFlash.value,.56);
    const x=o.batch.attributes[0].getX(0);o.reproject(-100,50);
    assert.ok(Math.abs(o.batch.attributes[0].getX(0)-(x-100))<1e-4);
    o.updateRelease(4.3,{...b});assert.equal(o.active,false,'same id on a new body cannot retain a released effect');
    o.release(b,5);o.updateRelease(4,b);assert.equal(o.mesh.count,0,'rewind clears stale matter');
    assert.equal(o.batch.capacity,12);o.dispose();o.dispose();assert.equal(scene.children.length,0);
  }finally{o.dispose();}
});

test('native rated receipt attaches apex matter to the thrown body, consumes its token and resets',()=>{
  const b=body(),o=Object.create(vfx),scene=new THREE.Scene(),cues=[];
  o.state={tick:7,settings:{},entities:new Map([[b.id,b]])};o._scene=scene;o._t=3;
  o._ent=id=>o.state.entities.get(id);o._isReduced=()=>false;
  o._toLocalXZ=(x,z,out)=>{out.x=x;out.z=z;return out;};
  o._spawnProjectileTrailStreak=()=>{};o.bus={emit:(...args)=>cues.push(args)};
  o._lastMasslineReleaseVfx={};o._masslineReleaseArc=null;
  o._masslineReleaseToken={active:true,targetId:b.id,sourceId:1,tick:7};o._initApexFlare();
  try{
    const receipt={targetId:b.id,sourceId:1,classification:'clean',releaseScore:.8,releasedAtApex:true};
    assert.equal(o._onTetherReleaseRated(receipt),true);assert.equal(o._apexFlare.body,b);
    assert.equal(o._onTetherReleaseRated(receipt),false);assert.equal(cues.length,1);
    o._t=3.18;assert.equal(o._updateApexFlare(.18),true);
    assert.equal(o._apexFlare.mesh.count,6);o._resetApexFlare();assert.equal(o._apexFlare.mesh.visible,false);
  }finally{o._apexFlare.dispose();}
});
