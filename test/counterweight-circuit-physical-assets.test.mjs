import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { cradleFit } from '../src/features/counterweightCircuit/course.js';
import { fittedManifest } from '../src/features/counterweightCircuit/physical.js';

const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function ray(origin,direction,triangle) {
  const e1=sub(triangle[1],triangle[0]),e2=sub(triangle[2],triangle[0]);
  const h=cross(direction,e2),det=dot(e1,h);
  if(Math.abs(det)<1e-8)return Infinity;
  const f=1/det,s=sub(origin,triangle[0]),u=f*dot(s,h);
  if(u<0||u>1)return Infinity;
  const q=cross(s,e1),v=f*dot(direction,q);
  if(v<0||u+v>1)return Infinity;
  const distance=f*dot(e2,q);return distance>=0?distance:Infinity;
}

const stages={
  source:'assets/ships/parts/places/place_ceres_section_cradle.glb',
  release:'assets/ships/release/parts/places/place_ceres_section_cradle.glb',
  package:'assets/ships/release/render-packages/ceres-section-cradle/render.glb',
};

for(const [stage,file] of Object.entries(stages))test(`${stage}: real keeper metal and full aperture match the Circuit packaged fit at every LOD`,async()=>{
  await MeshoptDecoder.ready;
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
  const doc=await io.readBinary(new Uint8Array(readFileSync(new URL('../'+file,import.meta.url))));
  await doc.transform(dequantize());
  const tiers=[[],[],[]];
  for(const node of doc.getRoot().listNodes()) {
    if(!node.getMesh() || node.getExtras().nonRender===true)continue;
    // Compiled semantic groups own mesh CHILDREN. Inheritance of the actual
    // named LOD is essential; direct getMesh() on the group cannot see metal.
    let ancestor=node,match=null;
    while(ancestor && !match){match=/^LOD([012])_/.exec(ancestor.getName());ancestor=ancestor.getParentNode();}
    if(!match)continue;
    const matrix=node.getWorldMatrix();
    for(const primitive of node.getMesh().listPrimitives()) {
      const attr=primitive.getAttribute('POSITION'),indices=primitive.getIndices();
      const points=Array.from({length:attr.getCount()},(_,i)=>{
        const [x,y,z]=attr.getElement(i,[]);
        return [matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],
          matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],
          matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]].map(v=>v*2);
      });
      for(let i=0;i<(indices?.getCount()||points.length);i+=3)
        tiers[+match[1]].push([0,1,2].map(j=>points[indices?indices.getScalar(i+j):i+j]));
    }
  }
  const fit=cradleFit(32),manifest=fittedManifest('place_ceres_section_cradle',32);
  const keeper=manifest.primitives.find(p=>p.id==='depth_keeper_port');
  assert.ok(keeper);
  // Compare visible native support location after the exact packaged max-dimension fit.
  assert.ok(Math.abs((keeper.z-keeper.hz)*32-fit.backZ)<.002);
  for(const [lod,triangles] of tiers.entries()) {
    assert.ok(triangles.length);
    for(const x of [-9,-7,-5,5,7,9]) {
      const first=Math.min(...triangles.map(t=>ray([x,-3.5,55],[0,0,1],t)));
      assert.ok(Math.abs(first-1.5)<.02,`${stage}/LOD${lod}: keeper face ${first}`);
    }
    // A full 8-WU width approach ray grid stays open until the real rear support.
    for(const x of [-9,0,9]) {
      const first=Math.min(...triangles.map(t=>ray([x,0,-80],[0,0,1],t)));
      assert.ok(first>130,`${stage}/LOD${lod}: no filled hull across receiving mouth (${first})`);
    }
  }
});

test('compiled keeper groups retain independent visible descendants',()=>{
  const metadata=JSON.parse(readFileSync(new URL('../assets/ships/release/render-packages/ceres-section-cradle/render-package.json',import.meta.url)));
  const keepers=metadata.nodes.filter(n=>n.nodeName.includes('HOOK_CERES_DEPTH_KEEPER'));
  assert.equal(keepers.length,9);
  for(const node of keepers) {
    assert.equal(node.role,'dynamic');
    assert.ok(metadata.dynamicGroups.some(g=>g.nodeId===node.id));
  }
});
