import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { ORCHARD_GEOMETRY as G, orchardFrameBodySpec, orchardPodBodySpec } from '../src/data/anvilOrchardBody.js';

const segmentDistance = (p,a,b) => {
  const dx=b[0]-a[0],dz=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz)));
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);
};
function distance(a,b) {
  let separated=false;
  for (const p of [a,b]) for(let i=0;i<p.length;i++) {
    const q=p[(i+1)%p.length],nx=q[1]-p[i][1],nz=p[i][0]-q[0];
    const aa=a.map(v=>v[0]*nx+v[1]*nz),bb=b.map(v=>v[0]*nx+v[1]*nz);
    if(Math.max(...aa)<Math.min(...bb)||Math.max(...bb)<Math.min(...aa))separated=true;
  }
  if(!separated)return 0;
  let d=Infinity;
  for(const [p,q] of [[a,b],[b,a]])for(const v of p)for(let i=0;i<q.length;i++)d=Math.min(d,segmentDistance(v,q[i],q[(i+1)%q.length]));
  return d;
}
function pose(part,rig,angle) {
  const c=Math.cos(angle),s=Math.sin(angle),{x,z}=rig.pivot;
  return part.points.map(([px,pz])=>[x+c*(px-x)+s*(pz-z),z-s*(px-x)+c*(pz-z)]);
}
function podAt(socket,dx=0) {
  return G.pod.parts[0].points.map(([x,z])=>[x+socket.pos.x+dx,z+socket.pos.z]);
}
// Sutherland-Hodgman against one closed outside half-plane. Each result is convex;
// together the four pieces cover the complete complement of the bearing box.
function clip(poly,axis,bound,sign) {
  const out=[];
  for(let i=0;i<poly.length;i++) {
    const a=poly[i],b=poly[(i+1)%poly.length],da=sign*(a[axis]-bound),db=sign*(b[axis]-bound);
    if(da>=0)out.push(a);
    if((da>=0)!==(db>=0)) {
      const f=da/(da-db);out.push([a[0]+f*(b[0]-a[0]),a[1]+f*(b[1]-a[1])]);
    }
  }
  return out;
}
function outsidePieces(poly,box) {
  return [[0,box.minX,-1],[0,box.maxX,1],[1,box.minZ,-1],[1,box.maxZ,1]]
    .map(args=>clip(poly,...args)).filter(p=>p.length>=3);
}
const parts=new Map(G.parts.map(p=>[p.id,p]));
const rigByPart=new Map(G.rigs.map(r=>[r.partId,r]));

test('source reconstruction preserves bounded separate geometry, exact sockets and canonical body factories',()=>{
  assert.equal(G.status,'new-reconstruction-unpromoted');
  assert.equal(G.rigs.length,6);assert.equal(G.pods.length,3);
  assert.ok(G.parts.length<=32);assert.equal(new Set(G.parts.map(p=>p.id)).size,G.parts.length);
  assert.equal(G.parts.filter(p=>p.moving).length,6);
  assert.deepEqual(G.pods.map(p=>p.socket),[0,1,2]);
  assert.equal(G.pods[0].pos.z-G.pods[1].pos.z,-40);
  assert.equal(G.pods[1].pos.z-G.pods[2].pos.z,-40);
  for(const p of [...G.parts,...G.pod.parts]) {
    assert.ok(p.points.length>=3&&p.minY<p.maxY,p.id);
    for(let i=0;i<p.points.length;i++) {
      const a=p.points[i],b=p.points[(i+1)%p.points.length],c=p.points[(i+2)%p.points.length];
      assert.ok((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])>0,`${p.id} is strictly convex`);
    }
  }
  const frame=orchardFrameBodySpec();
  assert.equal(frame.dynamic,false);assert.deepEqual(frame.attachmentPoints,{});
  assert.equal(frame.useMeasuredSkin,false);assert.equal(frame.collisionProxyManifest.convexParts.length,G.parts.length);
  for(const dynamic of [false,true]) {
    const p=orchardPodBodySpec({dynamic,revision:7});
    assert.equal(p.dynamic,dynamic);assert.equal(p.mass,10);assert.equal(p.revision,7);
  }
  assert.throws(()=>orchardPodBodySpec({revision:0}));
});

test('closed sockets and every continuous 0-to-90-degree jaw sweep preserve the actual seated pod cavity',t=>{
  let minimum=Infinity;
  // A 0.125-degree mesh plus the rotation Lipschitz bound certifies the intervals too.
  const intervals=720,step=Math.PI/2/intervals;
  for(const rig of G.rigs) {
    const part=parts.get(rig.partId),pod=podAt(G.pods[rig.socket]);
    assert.equal(rig.nativeSteps,30);assert.equal(Math.abs(rig.signedOpenRadians),Math.PI/2);
    const reach=Math.max(...part.points.map(([x,z])=>Math.hypot(x-rig.pivot.x,z-rig.pivot.z)));
    let sampled=Infinity;
    for(let n=0;n<=intervals;n++)sampled=Math.min(sampled,distance(pose(part,rig,rig.yawSign*n*step),pod));
    const certified=sampled-reach*step/2;
    assert.ok(certified>.25,`${rig.id} seated pod clearance ${certified}`);
    minimum=Math.min(minimum,certified);
  }
  t.diagnostic(`Continuous seated-pod sweep clearance lower bound: ${minimum.toFixed(6)} WU`);
});

test('every jaw clears every fixed source solid outside only its exact internal bearing domain over the continuous arc',t=>{
  const intervals=720,step=Math.PI/2/intervals,fixed=G.parts.filter(p=>!p.moving);
  let minimum=Infinity,witness=null;
  for(const rig of G.rigs) {
    const jaw=parts.get(rig.partId);
    const domain=G.bearingDomains.find(d=>d.id===rig.bearingDomainId);
    assert.ok(domain);assert.equal(domain.movingPartId,jaw.id);
    assert.equal(domain.fixedPartId,`s${rig.socket}-shoulder-${rig.side}`);
    assert.deepEqual(domain.pivot,rig.pivot);
    assert.equal(domain.nativeY,'full-owner-planar-prism-extrusion');
    assert.deepEqual(domain.planarBox,{minX:rig.pivot.x-.70,maxX:rig.pivot.x+.70,minZ:rig.pivot.z-.70,maxZ:rig.pivot.z+.70});
    const reach=Math.max(...jaw.points.map(([x,z])=>Math.hypot(x-rig.pivot.x,z-rig.pivot.z)));
    for(const support of fixed) {
      const pieces=support.id===domain.fixedPartId ? outsidePieces(support.points,domain.planarBox) : [support.points];
      assert.ok(pieces.length,`${support.id} was not omitted`);
      let sampled=Infinity;
      for(let n=0;n<=intervals;n++)for(const piece of pieces)sampled=Math.min(sampled,distance(pose(jaw,rig,rig.yawSign*n*step),piece));
      const certified=sampled-reach*step/2;
      assert.ok(certified>.12,`${rig.id} versus ${support.id}: continuous clearance ${certified}`);
      if(certified<minimum){minimum=certified;witness=`${rig.id} / ${support.id}`;}
    }
  }
  t.diagnostic(`Continuous jaw-versus-all-fixed/off-bearing-domain clearance lower bound: ${minimum.toFixed(6)} WU (${witness})`);
});

test('fully open sockets have a continuous straight insertion path for the actual pod, from outside the frame',t=>{
  const opened=G.parts.map(p=>rigByPart.has(p.id)?pose(p,rigByPart.get(p.id),rigByPart.get(p.id).signedOpenRadians):p.points);
  let minimum=Infinity;
  // Translating a rigid convex body is 1-Lipschitz in travel distance: subtract half step.
  const step=.25;
  for(const socket of G.pods)for(let dx=0;dx<=90;dx+=step) {
    const pod=podAt(socket,dx);
    for(let i=0;i<opened.length;i++) {
      const d=distance(pod,opened[i])-.5*step;
      assert.ok(d>.05,`socket ${socket.socket} insertion dx=${dx}, part=${G.parts[i].id}, clearance=${d}`);
      minimum=Math.min(minimum,d);
    }
  }
  t.diagnostic(`Continuous insertion clearance lower bound: ${minimum.toFixed(6)} WU`);
});

test('opposite moving jaws stay physically separated throughout their simultaneous sweep',t=>{
  let minimum=Infinity;
  for(let socket=0;socket<3;socket++) {
    const [a,b]=G.rigs.filter(r=>r.socket===socket);
    const ap=parts.get(a.partId),bp=parts.get(b.partId),step=Math.PI/2/720;
    const reach=r=>Math.max(...parts.get(r.partId).points.map(([x,z])=>Math.hypot(x-r.pivot.x,z-r.pivot.z)));
    for(let n=0;n<=720;n++)minimum=Math.min(minimum,
      distance(pose(ap,a,a.yawSign*n*step),pose(bp,b,b.yawSign*n*step))-(reach(a)+reach(b))*step/2);
  }
  assert.ok(minimum>.3,`opposite-jaw clearance ${minimum}`);
  t.diagnostic(`Continuous opposite-jaw clearance lower bound: ${minimum.toFixed(6)} WU`);
});

test('authoring source and candidate source GLBs match the generated provenance when present',()=>{
  const hash=p=>createHash('sha256').update(readFileSync(new URL('../'+p,import.meta.url))).digest('hex');
  assert.equal(hash(G.sourcePath),G.sourceSha);
  for(const input of G.sourceInputs)assert.equal(hash(input.path),input.sha256,input.path);
  for(const spec of [G,G.pod]) {
    const file=new URL('../'+spec.sourceGlbPath,import.meta.url);
    if(!existsSync(file))continue; // Sparse source checkout: source-only tests are not artifact acceptance.
    assert.equal(hash(spec.sourceGlbPath),spec.sourceGlbSha256);
    const bytes=readFileSync(file),doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
    const nodes=doc.nodes;
    assert.equal(doc.asset.extras.spacefaceAsset.assetId,spec.assetId);
    const bearingMetadata=doc.asset.extras.spacefaceAsset.internalBearings;
    assert.equal(bearingMetadata.revision,G.bearingContractRevision);
    assert.deepEqual(bearingMetadata.domains,spec===G?G.bearingDomains:[]);
    const binStart = 20 + bytes.readUInt32LE(12) + 8;
    for(const part of spec.parts) {
      const matches=nodes.filter(n=>n.name==='COLLISION_'+part.id);
      assert.equal(matches.length,1);
      const node=matches[0];
      assert.ok(!node.translation && !node.rotation && !node.scale,part.id+' collision frame');
      const accessor=doc.accessors[doc.meshes[node.mesh].primitives[0].attributes.POSITION];
      const view=doc.bufferViews[accessor.bufferView];
      assert.equal(accessor.componentType,5126);assert.equal(accessor.type,'VEC3');
      const start=binStart+(view.byteOffset||0)+(accessor.byteOffset||0),stride=view.byteStride||12;
      const vertices=Array.from({length:accessor.count},(_,i)=>[0,1,2].map(k=>bytes.readFloatLE(start+i*stride+k*4)));
      const tolerance=8*2**-23*Math.max(1,...part.points.flat().map(Math.abs));
      for(const v of vertices) {
        assert.ok(part.points.some(p=>Math.hypot(v[0]-p[0],v[2]-p[1])<tolerance),part.id+' source proxy vertex');
        assert.ok(Math.min(Math.abs(v[1]-part.minY),Math.abs(v[1]-part.maxY))<tolerance,part.id+' height');
      }
      for(const p of part.points)assert.ok(vertices.some(v=>Math.hypot(v[0]-p[0],v[2]-p[1])<tolerance));
    }
    for(const level of [0,1,2])assert.ok(nodes.some(n=>n.name?.startsWith(`LOD${level}_`)));
    if(spec===G)for(const rig of G.rigs) {
      const pivot=nodes.find(n=>n.name===rig.node);
      assert.ok(pivot,rig.id);
      assert.deepEqual(pivot.translation||[0,0,0],rig.pivotGltf);
      assert.equal((pivot.children||[]).filter(i=>nodes[i].name.startsWith('LOD')).length,3);
    }
  }
});
