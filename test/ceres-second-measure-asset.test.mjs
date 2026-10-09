/** Authored P03 geometry contract. Runtime behavior and live GPU cost are separate tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const liveDirectory=path.join(root,'assets/ships/parts/places');
const hasLive=fs.existsSync(path.join(liveDirectory,'place_ceres_second_measure.glb'));
const directory=process.env.CERES_SECOND_MEASURE_DIR||(hasLive?liveDirectory:path.join(root,'.devshots/ceres-second-measure'));
const required=!!process.env.CERES_SECOND_MEASURE_DIR||hasLive;
const parts={shell:'CeresSecondMeasure',long_plate:'CeresSecondMeasureLongPlate',crossbeam:'CeresSecondMeasureCrossbeam',keel:'CeresSecondMeasureKeel'};
const filename=part=>{const canonical='place_ceres_second_measure'+(part==='shell'?'':'_'+part)+'.glb';return fs.existsSync(path.join(directory,canonical))?canonical:parts[part]+'.glb';};
const available=Object.keys(parts).every(part=>fs.existsSync(path.join(directory,filename(part))));
const options={skip:!required&&!available&&'Build ceres_second_measure_kit.py first'};
const sourceHash=createHash('sha256').update(fs.readFileSync(path.join(root,'tools/blender/forge/ceres_second_measure_kit.py'))).digest('hex');
const bytes=part=>fs.readFileSync(path.join(directory,filename(part)));
const json=part=>{const b=bytes(part);return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));};
const near=(a,b,eps=1e-4)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<=eps);
const overlap=(a,b)=>[0,2].every(i=>Math.abs(a.centerWU[i]-b.centerWU[i])<(a.sizeWU[i]+b.sizeWU[i])/2-1e-5);
const mounted=(b,c)=>({...b,centerWU:b.centerWU.map((v,i)=>v+c[i])});
function verify(part,d){
 const c=d.asset.extras.ceresSecondMeasure;
 assert.equal(c.sourceSha256,sourceHash,'Candidate matches current authoring source');
 assert.equal(c.sourceScale,2);assert.equal(c.part,part);
 assert.equal(d.asset.extras.spacefaceAsset.partId,'place_ceres_second_measure'+(part==='shell'?'':'_'+part));
 assert.ok(!d.nodes.some(n=>/COLLISION_HULL/.test(n.name)),'No generic convex collision may close the two passages');
 assert.equal(d.animations?.length||0,0,'Released poses are simulation-owned');
 assert.ok(d.materials.every(m=>m.extras.spacefaceFinish==='forge-v1'));
 assert.equal(d.images.length,6,'Only the two shared Forge texture sets');
 for(let l=0;l<3;l++)assert.ok(d.nodes.some(n=>n.name.startsWith('LOD'+l+'_')));
 if(part==='shell'){
  assert.equal(c.collision.boxes.length,5,'Five bounded fixed compounds');
  for(const p of [...c.collision.passages,...c.collision.clearExitRaysWU]){
   const hole={centerWU:[(p.x[0]+p.x[1])/2,0,(p.z[0]+p.z[1])/2],sizeWU:[p.x[1]-p.x[0],99,p.z[1]-p.z[0]]};
   assert.ok(c.collision.boxes.every(b=>!overlap(b,hole)),'Every required passage remains genuinely open');
  }
  for(const [name,w] of Object.entries(c.supportSocketsWU)){
   const n=d.nodes.find(n=>n.name===name);assert.ok(n,name);
   assert.ok(near(n.translation||[0,0,0],w.map(v=>v/2)),name+' axis conversion and scale');
  }
  for(const [part,center] of Object.entries({LongPlate:[-40,0,0],Crossbeam:[40,0,0],Keel:[0,0,35]}))
   assert.ok(near(d.nodes.find(n=>n.name==='SOCKET_Section_'+part).translation,center));
 } else {
  assert.ok(near(d.nodes.find(n=>n.name==='SOCKET_Recovery').translation||[0,0,0],[0,0,0]),'Origin remains mass center');
  assert.deepEqual(c.dimensionsWU,part==='keel'?[70,12,20]:[68,part==='long_plate'?10:12,110]);
  assert.equal(c.collision.boxes.length,part==='keel'?1:5);
  if(part!=='keel'){
   assert.deepEqual(c.shearPlanesLocalXWU,[-34,34]);
   for(const side of ['A','B'])assert.ok(near(d.nodes.find(n=>n.name==='SOCKET_Cut_'+side).translation,[0,0,side==='A'?-27.5:27.5]));
  }
 }
 return c;
}
test('four independent authored masses preserve axes, sockets and explicit open collision',options,()=>{
 for(const part of Object.keys(parts))verify(part,json(part));
});
test('mounted sections touch but never overlap shell or one another',options,()=>{
 const shell=verify('shell',json('shell')),world=[];
 for(const part of ['long_plate','crossbeam','keel']){
  const c=verify(part,json(part));const bs=c.collision.boxes.map(b=>mounted(b,c.mountedCenterWU));
  for(const b of bs){
   for(const fixed of shell.collision.boxes)assert.ok(!overlap(b,fixed),`${part}/${b.name} overlaps ${fixed.name}`);
   for(const other of world)assert.ok(!overlap(b,other),`${part} overlaps other mass`);
  }
  world.push(...bs);
 }
});
test('reject false passage infill, recentered parts and omitted travelling tabs',options,()=>{
 const a=structuredClone(json('shell'));a.asset.extras.ceresSecondMeasure.collision.boxes[0]={centerWU:[-80,0,0],sizeWU:[40,20,120]};
 assert.throws(()=>verify('shell',a),/genuinely open/);
 const trapped=structuredClone(json('shell'));trapped.asset.extras.ceresSecondMeasure.collision.boxes[0]={centerWU:[-80,0,92],sizeWU:[68,20,14]};
 assert.throws(()=>verify('shell',trapped),/genuinely open/,'A rail beyond the nominal window must not trap the route');
 const b=structuredClone(json('long_plate'));b.nodes.find(n=>n.name==='SOCKET_Recovery').translation=[-40,0,0];
 assert.throws(()=>verify('long_plate',b),/mass center/);
 const c=structuredClone(json('crossbeam'));c.asset.extras.ceresSecondMeasure.collision.boxes.pop();
 assert.throws(()=>verify('crossbeam',c));
});
const world=(p,m)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]].map(v=>v*2);
// Separating-axis test on a projected triangle and an open XZ rectangle. This
// catches a face crossing a hole even if every triangle vertex lies outside it.
function triangleHits(a,b,c,h){
 const tri=[a,b,c].map(p=>[p[0],p[2]]),rect=[[h.x[0],h.z[0]],[h.x[1],h.z[0]],[h.x[1],h.z[1]],[h.x[0],h.z[1]]];
 const axes=[[1,0],[0,1]];
 for(let i=0;i<3;i++){const u=tri[i],v=tri[(i+1)%3];axes.push([v[1]-u[1],u[0]-v[0]]);}
 for(const axis of axes){if(Math.hypot(...axis)<1e-8)continue;
  const project=p=>p[0]*axis[0]+p[1]*axis[1],x=tri.map(project),y=rect.map(project);
  if(Math.max(...x)<=Math.min(...y)+1e-5||Math.max(...y)<=Math.min(...x)+1e-5)return false;
 }return true;
}
test('actual exported triangles and every LOD preserve both empty passage volumes',options,async()=>{
 for(const part of Object.keys(parts)){
  const raw=json(part),c=verify(part,raw),d=await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(bytes(part)));
  const counts=[0,0,0],draws=[0,0,0],bounds=Array.from({length:3},()=>[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]]);
  for(const n of d.getRoot().listNodes()){
   const match=/^LOD([012])_/.exec(n.getName());if(!match||!n.getMesh())continue;
   const lod=+match[1],m=n.getWorldMatrix();
   for(const p of n.getMesh().listPrimitives()){
    draws[lod]++;const pa=p.getAttribute('POSITION'),idx=p.getIndices(),ps=[];
    for(let i=0;i<pa.getCount();i++){
     const v=world(pa.getElement(i,[]),m);ps.push(v);
     for(let j=0;j<3;j++){bounds[lod][0][j]=Math.min(bounds[lod][0][j],v[j]);bounds[lod][1][j]=Math.max(bounds[lod][1][j],v[j]);}
    }
    counts[lod]+=(idx?.getCount()||pa.getCount())/3;
    if(part==='shell')for(let i=0;i<(idx?.getCount()||pa.getCount());i+=3){
     const tri=[0,1,2].map(j=>ps[idx?idx.getScalar(i+j):i+j]);
     for(const hole of [...c.collision.passages,...c.collision.clearExitRaysWU.map((p,i)=>({...p,id:'exit-'+i}))])assert.ok(!triangleHits(...tri,hole),`${n.getName()} fills ${hole.id} passage`);
    }
   }
  }
  if(part==='shell')assert.ok(near([bounds[0][0][0],bounds[0][1][0]],[-180,180],.04),'Authored360WU hull length');
  if(part!=='shell')assert.ok(near(bounds[0][1].map((v,i)=>v-bounds[0][0][i]),c.dimensionsWU,.04),part+' actual envelope includes all tabs');
  for(let l=0;l<3;l++)assert.ok(draws[l]<=raw.materials.length,'Static geometry welded per finish');
  assert.ok(counts[1]<counts[0]&&counts[2]<counts[1],'LOD reduction preserves authored family');
 }
});
