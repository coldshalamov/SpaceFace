import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { vfx, MINING_BEAM_RELEASE_S } from '../src/render/vfx.js';

function fixture() {
  const ship={id:'ship',alive:true,pos:{x:0,z:0},rot:0,radius:8};
  const rock={id:'rock',alive:true,pos:{x:50,z:5},radius:12};
  const owner=Object.create(vfx);
  owner._scene=new THREE.Scene();owner.state={playerId:ship.id,entities:new Map([[ship.id,ship],[rock.id,rock]]),settings:{},render:{interpolationAlpha:1}};
  owner.helpers={player:()=>ship,socketWorldPose:()=>({x:11,y:2,z:3})};
  owner._spawnLocalXZ={};owner._entityLocalXZ={};
  owner._toLocalXZ=(x,z,out)=>Object.assign(out,{x,z});
  owner._spawnProjectileTrailStreak=()=>{};
  owner._initMiningBeam();
  return {owner,ship,rock,beam:owner._miningBeam};
}

test('tool material travels and cools after source cutoff without reverse width scaling',()=>{
  const {owner,beam,rock}=fixture();
  owner._onMiningStart({targetId:rock.id,verb:'extract'});
  owner._updateMiningBeam(1/60);
  const width=beam.shaderShared.coreRadius.value;
  assert.deepEqual(beam.shaderShared.start.value.toArray(),[11,2,3]);
  assert.ok(Number.isFinite(beam.shaderShared.seed.value));
  owner._updateMiningBeam(.3);
  assert.equal(beam.shaderShared.coreRadius.value,width);
  const stop=beam.t;owner._onMiningStop();
  assert.equal(beam.active,false);assert.equal(beam.shaderShared.stop.value,stop);
  rock.pos.z+=10;owner._updateMiningBeam(.25);
  assert.equal(beam.mesh.visible,true);assert.ok(beam.shaderShared.time.value>stop);
  assert.equal(beam.shaderShared.coreRadius.value,width);
  assert.ok(beam.shaderShared.end.value.z>5,'cooling work face follows moved receiver');
  owner._updateMiningBeam(MINING_BEAM_RELEASE_S);
  assert.equal(beam.mesh.visible,false);
  const time=beam.t;owner._updateMiningBeam(1);assert.equal(beam.t,time,'idle does not advance');
});

test('retarget preserves transport clock and source stop is idempotent',()=>{
  const {owner,beam,rock}=fixture();owner._onMiningStart({targetId:rock.id,verb:'repair'});
  owner._updateMiningBeam(.4);const time=beam.t;
  owner._onMiningStart({targetId:rock.id,verb:'repair'});assert.equal(beam.t,time);
  owner._onMiningStop();owner._updateMiningBeam(.1);owner._onMiningStop();
  assert.equal(beam.shaderShared.stop.value,time);
});

test('tool topology includes receiving work faces and source lips in fixed draws',()=>{
  const {beam}=fixture();const g=beam.mesh.geometry;
  assert.ok(g.attributes.position.count<4096);
  assert.deepEqual([...new Set(g.attributes.aConduitKind.array)],[0,1,2]);
  const version=g.attributes.position.version;
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.basic.vertexShader,fragmentShader:THREE.ShaderLib.basic.fragmentShader};
  beam.mesh.material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uSfBeamStop,beam.shaderShared.stop);
  assert.match(shader.vertexShader,/curvature/);
  assert.match(shader.fragmentShader,/stopAge/);
  assert.equal(g.attributes.position.version,version);
});
