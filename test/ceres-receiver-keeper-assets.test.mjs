/** Positive-depth retention must be manufactured metal at every delivered LOD. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dequantize} from '@gltf-transform/functions';
import {MeshoptDecoder} from 'meshoptimizer';
import {CERES_WORKFLEET_CONTRACT as contract} from '../src/data/ceresWorkfleet.js';

const stages={
 source:'assets/ships/parts/places/place_ceres_section_cradle.glb',
 release:'assets/ships/release/parts/places/place_ceres_section_cradle.glb',
 package:'assets/ships/release/render-packages/ceres-section-cradle/render.glb',
};
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function ray(origin,direction,tri){
 const e1=sub(tri[1],tri[0]),e2=sub(tri[2],tri[0]),h=cross(direction,e2),det=dot(e1,h);
 if(Math.abs(det)<1e-8)return Infinity;
 const f=1/det,s=sub(origin,tri[0]),u=f*dot(s,h);if(u< -1e-6||u>1+1e-6)return Infinity;
 const q=cross(s,e1),v=f*dot(direction,q);if(v< -1e-6||u+v>1+1e-6)return Infinity;
 const d=f*dot(e2,q);return d>=0?d:Infinity;
}
async function triangles(file){
 await MeshoptDecoder.ready;
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
 const doc=await io.readBinary(new Uint8Array(readFileSync(new URL('../'+file,import.meta.url))));
 await doc.transform(dequantize());
 const tiers=[[],[],[]];
 for(const node of doc.getRoot().listNodes()){
  const match=/^LOD([012])_/.exec(node.getName());if(!match||!node.getMesh()||node.getExtras().nonRender===true)continue;
  const m=node.getWorldMatrix();
  for(const p of node.getMesh().listPrimitives()){
   const attr=p.getAttribute('POSITION'),indices=p.getIndices();
   const points=Array.from({length:attr.getCount()},(_,i)=>{
    const [x,y,z]=attr.getElement(i,[]);
    return [m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]].map(v=>v*contract.sourceScale);
   });
   for(let i=0;i<(indices?.getCount()||points.length);i+=3)
    tiers[+match[1]].push([0,1,2].map(j=>points[indices?indices.getScalar(i+j):i+j]));
  }
 }
 return tiers;
}
for(const [stage,file] of Object.entries(stages))test(`${stage}: real keeper contact planes and cable channel survive every LOD`,async()=>{
 const a=contract.assets.cradle;
 assert.equal(a.states.open.boxes.length,11);
 assert.deepEqual(a.well.z,[-75,56.5]);
 assert.deepEqual(a.sockets.SOCKET_Service_Head,{x:0,y:0,z:63});
 const tiers=await triangles(file),epsilon=stage==='source'?1e-4:.02;
 for(const [lod,tier] of tiers.entries()){
  assert.ok(tier.length>0,`${stage}: LOD${lod} has rendered geometry`);
  for(const side of [-1,1])for(const dx of [-2,0,2])for(const y of [-3.5,0,3.5]){
   const origin=[side*7+dx,y,55];
   const first=Math.min(...tier.map(tri=>ray(origin,[0,0,1],tri)));
   assert.ok(Math.abs(first-1.5)<epsilon,`${stage} LOD${lod} visible keeper contact at ${origin}: ${first}`);
  }
  // A full 8-WU source channel is proved at its inner edges too. Compressed
  // transport receives only the existing .02-WU decode precision allowance.
  for(const x of [-4+epsilon*2,0,4-epsilon*2])for(const y of [-4.8,0,4.8]){
   const first=Math.min(...tier.map(tri=>ray([x,y,55],[0,0,1],tri)));
   assert.ok(first>=8-epsilon,`${stage} LOD${lod} obstructs the unchanged Z63 fairlead channel: ${first}`);
  }
 }
});

test('one keeper visibility group remains unpooled and independent at all pipeline stages',async()=>{
 await MeshoptDecoder.ready;
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
 for(const [stage,file]of Object.entries(stages)){
  const doc=await io.readBinary(new Uint8Array(readFileSync(new URL('../'+file,import.meta.url))));
  const nodes=doc.getRoot().listNodes(),keepers=nodes.filter(n=>n.getName().includes('HOOK_CERES_DEPTH_KEEPER'));
  assert.equal(keepers.length,9,`${stage}: three shared finishes at each of three LODs`);
  for(const lod of [0,1,2]){
   const group=keepers.filter(n=>n.getName().startsWith(`LOD${lod}_`));
   assert.equal(group.length,3);
   const triangleCount=group.flatMap(n=>n.getMesh().listPrimitives())
    .reduce((sum,p)=>sum+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0);
   assert.ok(triangleCount<=[880,240,80][lod],`${stage}: LOD${lod} keeper detail budget: ${triangleCount}`);
   for(const n of group){
    assert.ok(n.getMesh(),`${stage}: real keeper geometry`);
    assert.equal(n.getExtras().spaceface?.instance,false,`${stage}: keeper must not enter shared opaque instance pools`);
    assert.ok(!n.getParentNode()?.getName().startsWith('MOTION_'),'Fixed keeper has no actuator');
   }
  }
 }
 const metadata=JSON.parse(readFileSync(new URL('../assets/ships/release/render-packages/ceres-section-cradle/render-package.json',import.meta.url)));
 for(const node of metadata.nodes.filter(n=>n.nodeName.includes('HOOK_CERES_DEPTH_KEEPER'))){
  assert.equal(node.role,'dynamic','Offline compiler preserves hardware visibility boundaries');
  assert.ok(metadata.dynamicGroups.some(g=>g.nodeId===node.id&&g.kind==='dynamic-surface'));
 }
});
