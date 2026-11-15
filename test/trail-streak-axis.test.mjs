import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {vfx} from '../src/render/vfx.js';
import {createTrailStreakSlot, updateTrailStreakMesh} from '../src/render/engineTrailSurfaces.js';

function uvEnd(geometry,matrix,uvY) {
  const p=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
  const sum=new THREE.Vector3();let n=0;
  for(let i=0;i<p.count;i++)if(Math.abs(uv.getY(i)-uvY)<1e-6){sum.add(new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)).applyMatrix4(matrix));n++;}
  assert.ok(n);return sum.multiplyScalar(1/n);
}
function assertAxis(geometry,matrix,ax,az) {
  const a=uvEnd(geometry,matrix,0),b=uvEnd(geometry,matrix,1);
  const dir=b.sub(a).normalize(),len=Math.hypot(ax,az);
  assert.ok(Math.hypot(dir.x-ax/len,dir.z-az/len)<1e-5,
    `UV 0 to 1 (${dir.x},${dir.z}) differs from supplied axis (${ax/len},${az/len})`);
}
test('live projectile streak UV direction follows the supplied world axis for all headings',()=>{
  const scene=new THREE.Scene(),state={playerId:1,entities:new Map(),entityList:[],settings:{video:{particleQuality:'high'}},render:{scene}};
  const system=Object.create(vfx);system.init({state,bus:{on(){return()=>{};}},helpers:{}});
  const fallback=createTrailStreakSlot(scene),axes=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  try {
    assert.equal(system._trailStreakPool.mesh.material.side,THREE.DoubleSide);
    assert.equal(fallback.material.side,THREE.DoubleSide);
    const positions=fallback.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++) assert.ok(Math.abs(positions.getY(i))<1e-6,
      'streak geometry is a world-plane surface, independent of camera facing');
    for(let i=0;i<axes.length;i++) {
      const [ax,az]=axes[i];
      // Motion differs from the supplied trail axis, as it does for propelled exhaust.
      system._spawnProjectileTrailStreak(10,0,20,1,.3,5,.6,'#88aaff',3,-2,ax,az);
      const matrix=new THREE.Matrix4();system._trailStreakPool.mesh.getMatrixAt(i,matrix);
      assertAxis(system._trailStreakPool.mesh.geometry,matrix,ax,az);
      updateTrailStreakMesh(fallback,{x:10,y:.4,z:20,vx:ax,vz:az,width:.3,length:5,opacity:.6,scroll:0,time:0});
      fallback.updateMatrix();assertAxis(fallback.geometry,fallback.matrix,ax,az);
    }
  } finally {system.destroy();fallback.removeFromParent();fallback.material.dispose();}
});
