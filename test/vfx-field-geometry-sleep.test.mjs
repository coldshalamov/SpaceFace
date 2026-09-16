import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { vfx } from '../src/render/vfx.js';
import { FIELD_SIGNATURES } from '../src/render/forceLanguage/catalog.js';

function harness(active=[]){
 const system=Object.create(vfx);
 system._scene=new THREE.Scene();system._fieldGeomInitialized=false;system._fieldGeom=null;
 system._combatBeamLocalizer=(x,z,out)=>{out.x=x;out.z=z;return out;};
 system.state={simTime:0,fields:{active},settings:{video:{}}};return system;
}
const field=(kind)=>({id:kind,kind,center:{x:40,z:-25},radius:80,dir:{x:1,z:0},halfAngleRad:.45,halfWidth:30,engaged:true});
const versions=(fg)=>fg.batch.attributes.map(a=>a.version);

test('inactive standalone field adapter is lazy; explicitly prewarmed empty owner sleeps',()=>{
 const system=harness();system._updateFieldGeometry(1/60);assert.equal(system._fieldGeom,null);
 system._initFieldGeometry();const fg=system._fieldGeom,before=versions(fg),buffer=fg.descriptor;
 for(let i=0;i<10;i++)system._updateFieldGeometry(1/60);
 assert.equal(system._fieldGeom,fg);assert.equal(fg.descriptor,buffer);assert.deepEqual(versions(fg),before);
 assert.equal(fg.mesh.count,0);assert.equal(fg.mesh.visible,false);fg.dispose();
});

test('all five live field routes produce the authored surface counts, without old eight-mesh pools',()=>{
 for(const kind of Object.keys(FIELD_SIGNATURES)){
  const system=harness([field(kind)]);system._updateFieldGeometry(0);system.state.simTime=.5;system._updateFieldGeometry(.5);
  const fg=system._fieldGeom;assert.equal(fg.mesh.count,FIELD_SIGNATURES[kind].surfaces);
  assert.equal(system._scene.children.length,1);assert.ok(system._vfxOwnerRoots().includes(fg.mesh));
  const before=versions(fg);system.state.simTime+=1/60;system._updateFieldGeometry(1/60);
  assert.deepEqual(versions(fg),before,'steady field animates in shader, not by publishing every instance again');fg.dispose();
 }
});

test('transition retires force boundaries, then core extinction sleeps without repeated uploads',()=>{
 const system=harness([field('repulsor')]);system._updateFieldGeometry(0);system.state.simTime=.5;system._updateFieldGeometry(.5);
 const fg=system._fieldGeom;system.state.fields.active=[];system._updateFieldGeometry(0);
 assert.equal(fg.stats.active,0);assert.equal(fg.mesh.count,3,'small source-only extinction is not a lingering field');
 system.state.simTime+=.3;system._updateFieldGeometry(.3);assert.equal(fg.mesh.count,0);
 const before=versions(fg);for(let i=0;i<12;i++)system._updateFieldGeometry(1/60);
 assert.deepEqual(versions(fg),before);fg.dispose();
});
