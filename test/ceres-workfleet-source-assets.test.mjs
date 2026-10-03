/** Authored workfleet anatomy and true open-volume GLB contract, not runtime reachability. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {validateMotionBank} from '../src/contracts/motionBank.js';
import {CERES_WORKFLEET_CONTRACT as contract} from '../src/data/ceresWorkfleet.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const names={breaker:'ceres_breaker',cradle:'place_ceres_section_cradle',cutterHead:'place_ceres_breaker_cutter_head'};
const candidate=process.env.CERES_WORKFLEET_DIR;
const file=part=>path.join(candidate||path.join(root,'assets/ships/parts',part==='breaker'?'wholeships':'places'),names[part]+'.glb');
const required=!!candidate;
const available=Object.keys(names).every(part=>fs.existsSync(file(part)));
const options={skip:!required&&!available&&'Build or publish all Ceres workfleet assets first'};
const sourceHash=()=>{
 const h=createHash('sha256');
 for(const name of Object.values(names))h.update(fs.readFileSync(path.join(root,'tools/blender/forge/ships',name+'.py')));
 return h.digest('hex');
};
const bytes=part=>fs.readFileSync(file(part));
const json=part=>{const b=bytes(part);return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));};
const near=(a,b,eps=1e-4)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<eps);
const overlap=(a,b)=>[0,1,2].every(i=>Math.abs(a.centerWU[i]-b.centerWU[i])<(a.sizeWU[i]+b.sizeWU[i])/2-1e-5);
const world=(p,m,scale)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]].map(v=>v*scale);
const assertNativeVertex=(name,p,solids)=>{
 const outside=Math.min(...solids.map(solid=>Math.hypot(
  Math.max(0,Math.abs(p[0]-solid.centerWU[0])-solid.sizeWU[0]/2),
  Math.max(0,Math.abs(p[2]-solid.centerWU[2])-solid.sizeWU[2]/2))));
 assert.ok(outside<1e-4,name+' has '+outside+' WU outside the native flight-plane compound');
};

function verify(part,doc){
 const c=doc.asset.extras.ceresWorkfleet;
 assert.equal(c.sourceSha256,sourceHash(),'Asset matches exact current three-file original source');
 assert.equal(c.geometryContractSha256,createHash('sha256').update(fs.readFileSync(path.join(root,'src/data/ceresWorkfleet.js'))).digest('hex'),'Geometry contract is source-sealed');
 assert.equal(c.sourceScale,2);assert.equal(c.part,part);
 const a=contract.assets[part],v=p=>[p.x,p.y,p.z];
 assert.deepEqual(c.dimensionsWU,v(a.dimensions));
 assert.deepEqual(c.states,a.states||{});
 assert.deepEqual(c.propulsion,a.propulsion||{},'Exported channels use the exact physical mouth contract');
 assert.deepEqual(c.socketsWU,Object.fromEntries(Object.entries(a.sockets).map(([k,p])=>[k,v(p)])));
 assert.deepEqual(c.collision.boxes,(a.states?.open.boxes||a.boxes).map(b=>({name:b.id,centerWU:v(b.center),sizeWU:v(b.size)})),'Exported solids are the actual native physics contract');
 assert.ok(!doc.nodes.some(n=>n.name==='COLLISION_HULL'),'Never convexify a receiving void');
 assert.equal(doc.animations?.length||0,0,'Simulation owns machinery state');
 assert.ok(doc.materials.every(m=>m.extras.spacefaceFinish==='forge-v1'));
 assert.equal(doc.images.length,6,'Uses the existing Forge shared surface set');
 assert.ok(doc.nodes.some(n=>n.name==='SF_'+names[part].toUpperCase()+'_ROOT'));
 assert.ok(c.collision.boxes.length>0,'Actual runtime compound boxes exist');
 const proxies=doc.nodes.filter(n=>n.name.startsWith('COLLISION_'));
 assert.equal(proxies.length,c.collision.boxes.length);
 for(const solid of c.collision.boxes){
  const node=proxies.find(n=>n.name==='COLLISION_'+solid.name);
  assert.ok(node,'Explicit solid '+solid.name);
  assert.equal(node.extras.nonRender,true);assert.equal(node.extras.collision,true);
 }
 for(const [name,p] of Object.entries(c.socketsWU)){
  const node=doc.nodes.find(n=>n.name===name);assert.ok(node,name);
  assert.ok(near(node.translation||[0,0,0],p.map(v=>v/c.sourceScale)),name+' preserves origin/axes');
  const fwd=c.socketDirections[name];
  assert.ok(near(node.extras.spaceface.forward,[fwd.x,fwd.y,fwd.z]),name+' explicit working direction');
 }
 for(const hole of c.clearVolumesWU||[])for(const solid of c.collision.boxes)
  assert.ok(!overlap(solid,hole),solid.name+' fills '+hole.name);
 for(let lod=0;lod<3;lod++)assert.ok(doc.nodes.some(n=>n.name.startsWith('LOD'+lod+'_')));
 return c;
}

test('required output mode fails on absent assets',()=>{
 if(required)for(const part of Object.keys(names))assert.ok(fs.existsSync(file(part)),'Missing required asset '+file(part));
});
test('all workfleet parts preserve authored origins, sockets, compounds and Forge finishes',options,()=>{
 for(const part of Object.keys(names))verify(part,json(part));
});

// A 3D triangle/box separating-axis test catches triangles spanning a void even
// when every triangle vertex is outside it. Contact with the boundary is legal.
function triangleHitsBox(tri,box){
 const p=tri.map(v=>v.map((n,i)=>n-box.centerWU[i])),half=box.sizeWU.map(v=>v/2);
 const sub=(a,b)=>a.map((v,i)=>v-b[i]);
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const basis=[[1,0,0],[0,1,0],[0,0,1]],edges=p.map((v,i)=>sub(p[(i+1)%3],v));
 const axes=[...basis,cross(edges[0],edges[1]),...edges.flatMap(e=>basis.map(b=>cross(e,b)))];
 for(const axis of axes){
  if(Math.hypot(...axis)<1e-8)continue;
  const dot=v=>v.reduce((a,n,i)=>a+n*axis[i],0),ts=p.map(dot),radius=half.reduce((a,n,i)=>a+n*Math.abs(axis[i]),0);
  if(Math.min(...ts)>=radius-1e-5||Math.max(...ts)<=-radius+1e-5)return false;
 }
 return true;
}

test('actual authored triangles at every LOD preserve the physical loading void and cost envelope',options,async()=>{
 for(const part of Object.keys(names)){
  const raw=json(part),c=verify(part,raw);
  const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(bytes(part)));
  const stopFaces=[0,0,0];
  const triangles=[0,0,0],draws=[0,0,0],bounds=Array.from({length:3},()=>[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]]);
  for(const solid of c.collision.boxes){
   const n=doc.getRoot().listNodes().find(n=>n.getName()==='COLLISION_'+solid.name),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
   assert.ok(n?.getMesh(),'Proxy must contain an actual box mesh');
   for(const primitive of n.getMesh().listPrimitives()){
    const attr=primitive.getAttribute('POSITION');
    for(let i=0;i<attr.getCount();i++){
     const p=world(attr.getElement(i,[]),n.getWorldMatrix(),c.sourceScale);
     for(let axis=0;axis<3;axis++){lo[axis]=Math.min(lo[axis],p[axis]);hi[axis]=Math.max(hi[axis],p[axis]);}
    }
   }
   assert.ok(near(lo.map((v,i)=>(v+hi[i])/2),solid.centerWU),'Proxy actual center '+solid.name);
   assert.ok(near(hi.map((v,i)=>v-lo[i]),solid.sizeWU),'Proxy actual extent '+solid.name);
  }

  for(const n of doc.getRoot().listNodes()){
   const lod=/^LOD([012])_/.exec(n.getName());if(!lod||!n.getMesh())continue;
   const level=+lod[1],matrix=n.getWorldMatrix();
   for(const primitive of n.getMesh().listPrimitives()){
    draws[level]++;const ps=primitive.getAttribute('POSITION'),idx=primitive.getIndices(),vertices=[];
    for(let i=0;i<ps.getCount();i++){
     const p=world(ps.getElement(i,[]),matrix,c.sourceScale);vertices.push(p);
     assertNativeVertex(n.getName(),p,c.collision.boxes);
     if(part==='breaker'){
      const stop=c.collision.boxes.find(b=>b.name==='load_stop'),face=stop.centerWU[0]+stop.sizeWU[0]/2;
      if(Math.abs(p[0]-face)<1e-4&&Math.abs(p[1])<=5&&Math.abs(p[2])>=4&&Math.abs(p[2])<=10)stopFaces[level]|=p[2]<0?1:2;
     }
     for(let axis=0;axis<3;axis++){bounds[level][0][axis]=Math.min(bounds[level][0][axis],p[axis]);bounds[level][1][axis]=Math.max(bounds[level][1][axis],p[axis]);}
    }
    const count=idx?.getCount()||ps.getCount();triangles[level]+=count/3;
    for(let i=0;i<count;i+=3){
     const tri=[0,1,2].map(j=>vertices[idx?idx.getScalar(i+j):i+j]);
     const rig=c.rigs.find(r=>n.getName().includes('_'+r.node+'_'));
     for(const progress of rig?[0,.5,1]:[0]){
      const posed=tri.map(p=>{
       const next=[...p];if(rig?.runtimeAxis){
        const axis={x:0,y:1,z:2}[rig.runtimeAxis],scale=1+(rig.retainedScale-1)*progress;
        next[axis]=rig.pivotWU[axis]+(next[axis]-rig.pivotWU[axis])*scale+rig.retainedDeltaWU*progress;
       }return next;
      });
      if(rig?.collisionBoxName){
       const open=c.states.open.boxes.find(b=>b.id===rig.collisionBoxName),retained=c.states.retained.boxes.find(b=>b.id===rig.collisionBoxName);
       assert.ok(open&&retained,'Rig names its real native collider');
       for(const vertex of posed)for(const [axis,key] of ['x','y','z'].entries()){
        const center=open.center[key]+(retained.center[key]-open.center[key])*progress;
        const half=(open.size[key]+(retained.size[key]-open.size[key])*progress)/2;
        assert.ok(Math.abs(vertex[axis]-center)<=half+1e-4,n.getName()+' leaves native '+rig.collisionBoxName+' at '+progress+' axis '+key);
       }
      }
      for(const hole of c.clearVolumesWU||[])assert.ok(!triangleHitsBox(posed,hole),n.getName()+' spans '+hole.name+' at slide '+progress);
      if(progress===0||progress===1)for(const clear of c.strictClearVolumes[progress===0?'open':'retained']||[]){
       const hole={centerWU:[(clear.x[0]+clear.x[1])/2,0,(clear.z[0]+clear.z[1])/2],sizeWU:[clear.x[1]-clear.x[0],1000,clear.z[1]-clear.z[0]]};
       assert.ok(!triangleHitsBox(posed,hole),n.getName()+' blocks strict '+(progress?'retained':'open')+' aperture');
      }
     }
    }
   }
  }
  for(let lod=0;lod<3;lod++)for(let axis=0;axis<3;axis++){
   assert.ok(bounds[lod][0][axis]>=c.boundsWU[0][axis]-1e-4,part+' LOD'+lod+' low bound '+axis);
   assert.ok(bounds[lod][1][axis]<=c.boundsWU[1][axis]+1e-4,part+' LOD'+lod+' high bound '+axis);
  }
  if(part==='breaker')assert.deepEqual(stopFaces,[3,3,3],'Both real passive-stop contact faces survive every LOD');
  const budget={breaker:45000,cradle:30000,cutterHead:8000}[part];
  assert.ok(triangles[0]<=budget,part+' measured triangle budget '+triangles[0]);
  assert.ok(triangles[1]<triangles[0]&&triangles[2]<triangles[1],'Genuine reduced authored LODs');
  assert.ok(draws[0]<=c.drawBudget,part+' batched material/motion cost '+draws[0]);
 }
});

test('reject an explicit false well solid and shifted socket',options,()=>{
 const doc=structuredClone(json('breaker'));
 doc.asset.extras.ceresWorkfleet.collision.boxes[0]={name:doc.asset.extras.ceresWorkfleet.collision.boxes[0].name,centerWU:[27,0,0],sizeWU:[20,10,20]};
 assert.throws(()=>verify('breaker',doc),/actual native physics contract|fills/);
 const shifted=structuredClone(json('cradle')),name=Object.keys(shifted.asset.extras.ceresWorkfleet.socketsWU)[0];
 shifted.nodes.find(n=>n.name===name).translation=[999,0,0];
 assert.throws(()=>verify('cradle',shifted),/preserves origin/);
});


test('sealed reference banks bind all source pivots at every LOD without ambient or scale ownership',options,()=>{
 for(const [part,key] of [['breaker','ceres-breaker'],['cradle','ceres-section-cradle']]){
  const filename=path.join(candidate||path.join(root,'assets/ships/motions'),key+'.motion.json');
  const bank=validateMotionBank(JSON.parse(fs.readFileSync(filename,'utf8'))),doc=json(part);
  assert.equal(bank.sourceGlbSha256,createHash('sha256').update(bytes(part)).digest('hex'),'Reference bank sealed to exact stamped GLB');
  assert.equal(bank.sourceAssetId,doc.asset.extras.ceresWorkfleet.asset.assetId);
  assert.ok(!bank.events||!Object.keys(bank.events).length,'No ambient or event-driven mechanism clips');
  assert.ok(bank.clips.every(c=>!c.loop&&c.channels.every(ch=>ch.path==='translation'&&ch.values.every(v=>Math.abs(v)<1e-7))),'Only the source open reference pose; native controller owns real articulation');
  for(const binding of bank.bindings){
   const node=doc.nodes.find(n=>n.name===binding.node);assert.ok(node);
   assert.deepEqual(binding.requiredAtLod,[0,1,2]);
   assert.ok(near(binding.restPose.translation,node.translation||[0,0,0]));
   assert.ok(near(binding.restPose.rotation,node.rotation||[0,0,0,1]));
   assert.ok(near(binding.restPose.scale,node.scale||[1,1,1]));
   for(const lod of [0,1,2])assert.ok(node.children.some(i=>doc.nodes[i].name.startsWith('LOD'+lod+'_')),'LOD'+lod+' physical children '+binding.node);
  }
  const rootNode=doc.nodes.find(n=>n.name==='SF_'+names[part].toUpperCase()+'_ROOT');
  assert.deepEqual(rootNode.extras.ceresWorkfleet.rigs,doc.asset.extras.ceresWorkfleet.rigs,'Renderer-visible node extras preserve exact articulation metadata');
 }
});


const vec=p=>[p.x,p.y,p.z], sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function rayTriangle(origin,direction,tri){
 const e1=sub(tri[1],tri[0]),e2=sub(tri[2],tri[0]),h=cross(direction,e2),det=dot(e1,h);
 if(Math.abs(det)<1e-8)return Infinity;
 const f=1/det,s=sub(origin,tri[0]),u=f*dot(s,h);if(u< -1e-6||u>1+1e-6)return Infinity;
 const q=cross(s,e1),v=f*dot(direction,q);if(v< -1e-6||u+v>1+1e-6)return Infinity;
 const distance=f*dot(e2,q);return distance>=0?distance:Infinity;
}
async function renderedTriangles(part){
 const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(bytes(part)));
 const tiers=[[],[],[]];
 for(const node of doc.getRoot().listNodes()){
  const lod=/^LOD([012])_/.exec(node.getName());if(!lod||!node.getMesh())continue;
  for(const primitive of node.getMesh().listPrimitives()){
   const p=primitive.getAttribute('POSITION'),ix=primitive.getIndices(),vertices=[];
   for(let i=0;i<p.getCount();i++)vertices.push(world(p.getElement(i,[]),node.getWorldMatrix(),2));
   for(let i=0;i<(ix?.getCount()||p.getCount());i+=3)
    tiers[+lod[1]].push({name:node.getName(),vertices:[0,1,2].map(j=>vertices[ix?ix.getScalar(i+j):i+j])});
  }
 }
 return tiers;
}
function verifyThrusterGeometry(part,raw,tiers){
 const c=verify(part,raw),channels=c.propulsion.channels||[],native=c.collision.boxes;
 const seen=new Set();
 assert.equal(channels.length,part==='breaker'?10:part==='cutterHead'?6:0);
 for(const channel of channels){
  const mouth=vec(channel.mouth),normal=vec(channel.exhaustDirection),axis=normal.findIndex(v=>v!==0);
  const tangents=[0,1,2].filter(i=>i!==axis),solid=native.find(b=>b.name===channel.supportingSolid);
  assert.ok(solid,'Channel is supported by an existing real collision solid');
  assert.deepEqual(vec(channel.forceDirection).map(v=>v||0),normal.map(v=>-v||0));
  assert.equal(dot(normal,normal),1);
  assert.equal(channel.socket,`SOCKET_CERES_THRUSTER_${channel.id}`);
  assert.equal(channel.coreHook,`HOOK_CERES_THRUSTER_${channel.id}`);
  const axial=channel.category.startsWith('axial-');
  const inside=p=>p.every((v,i)=>Math.abs(v-solid.centerWU[i])<=solid.sizeWU[i]/2+1e-4);
  const local=p=>{
   const d=sub(p,mouth),depth=-dot(d,normal);
   return {depth,radius:Math.hypot(...tangents.map(i=>d[i]))};
  };
  for(let lod=0;lod<3;lod++){
   const name=channel.coreMeshes[lod];assert.equal(name,`LOD${lod}_${channel.coreHook}_glow_drive`);
   assert.ok(!seen.has(name),'No merged/opposing channel core');seen.add(name);
   const node=raw.nodes.find(n=>n.name===name);assert.ok(node,'Independent core '+name);
   assert.deepEqual(node.extras.ceresThruster,{channel:channel.id,mouthWU:mouth,exhaustNormal:normal,
    socketNormal:normal,supportingSolid:channel.supportingSolid,coreHook:channel.coreHook});
   const core=tiers[lod].filter(t=>t.name===name);assert.ok(core.length>=12,'Real triangulated core face');
   for(const triangle of core){
    for(const p of triangle.vertices){
     const {depth,radius}=local(p);
     assert.ok(inside(p),name+' exported vertex escapes its unchanged supporting native solid');
     assert.ok(Math.abs(depth-channel.coreDepthWU)<(axial?.041:1e-4),name+' actual core is on the exhaust axis behind its mouth');
     assert.ok(radius<=channel.coreRadiusWU+1e-4,name+' actual core radius');
    }
    const [p0,p1,p2]=triangle.vertices,face=cross(sub(p1,p0),sub(p2,p0));
    if(!axial)assert.ok(dot(face,normal)/Math.hypot(...face)>.9999,name+' core triangle faces actual exhaust normal');
   }
   // Test real exported matte lip vertices, not just socket metadata. Sixteen
   // angular probes reject a lying axis hint or a sealed/retracted far LOD bell.
   if(!axial)for(let i=0;i<16;i++){
    const angle=2*Math.PI*i/16,expected=[...mouth];
    expected[tangents[0]]+=Math.cos(angle)*channel.lipRadiusWU;
    expected[tangents[1]]+=Math.sin(angle)*channel.lipRadiusWU;
    const closest=Math.min(...tiers[lod].filter(t=>t.name!==name).flatMap(t=>t.vertices)
      .filter(p=>Math.abs(local(p).depth)<1e-4)
      .map(p=>Math.hypot(...sub(p,expected))));
    // Main/retro bells have 24/20 facets, RCS 16, so probe angular sector coverage.
    assert.ok(closest<channel.lipRadiusWU*.17,name+' actual lip has the correct mouth plane and orientation');
   }
   // Every exported triangle wholly belonging to the small channel cylinder is
   // covered by the named pre-existing convex solid. AABB union inflation cannot
   // satisfy this check; verify() already pins every collider to the sim owner.
   const surfaces=tiers[lod].filter(t=>t.vertices.every(p=>{
    const q=local(p);return q.depth>=-.041&&q.depth<=channel.depthWU+.001&&q.radius<=channel.lipRadiusWU+.001;
   }));
   assert.ok(surfaces.length>=core.length+(axial?24:80),name+' exported bell/throat surface coverage');
   for(const triangle of surfaces)for(const p of triangle.vertices)
    assert.ok(inside(p),name+' actual nozzle triangle leaves its supporting solid');
   // Central and off-centre exhaust sightlines must reach this core before any
   // matte host casting. These catch blocked bores and backwards-facing nozzles.
   for(const angle of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
    const origin=mouth.map((v,i)=>v+normal[i]*.12);
    origin[tangents[0]]+=Math.cos(angle)*channel.coreRadiusWU*.25;
    origin[tangents[1]]+=Math.sin(angle)*channel.coreRadiusWU*.25;
    const direction=normal.map(v=>-v),distance=Math.min(...core.map(t=>rayTriangle(origin,direction,t.vertices)));
    assert.ok(Number.isFinite(distance)&&distance<=channel.coreDepthWU+.17,name+' exposed core ray');
    const firstObstruction=Math.min(...tiers[lod].filter(t=>t.name!==name).map(t=>rayTriangle(origin,direction,t.vertices)));
    assert.ok(firstObstruction>distance+1e-4,name+' matte geometry blocks actual exhaust opening: '+firstObstruction+' before '+distance);
   }
  }
 }
 return channels.length;
}

test('every exhaust channel has independent LOD cores, supported triangles and an open correctly oriented mouth',options,async()=>{
 for(const part of Object.keys(names))verifyThrusterGeometry(part,json(part),await renderedTriangles(part));
});

test('channel geometry proof rejects a correct socket with a moved or merged emissive core',options,async()=>{
 const part='cutterHead',raw=json(part),tiers=await renderedTriangles(part);
 const channel=raw.asset.extras.ceresWorkfleet.propulsion.channels[0],name=channel.coreMeshes[0];
 const moved=structuredClone(tiers);
 for(const t of moved[0].filter(t=>t.name===name))for(const p of t.vertices)p[2]+=2;
 assert.throws(()=>verifyThrusterGeometry(part,raw,moved),/escapes|radius|axis/);
 const merged=structuredClone(raw);merged.nodes.find(n=>n.name===name).name='LOD0_HOOK_DRIVE_CORE';
 assert.throws(()=>verifyThrusterGeometry(part,merged,tiers),/Independent core/);
});

test('channel geometry proof rejects inward core faces and a matte exhaust cap despite truthful sockets',options,async()=>{
 const part='breaker',raw=json(part),tiers=await renderedTriangles(part);
 const channel=raw.asset.extras.ceresWorkfleet.propulsion.channels[0],name=channel.coreMeshes[0];
 const backwards=structuredClone(tiers);
 for(const t of backwards[0].filter(t=>t.name===name))t.vertices.reverse();
 assert.throws(()=>verifyThrusterGeometry(part,raw,backwards),/actual exhaust normal/);
 const capped=structuredClone(tiers),m=vec(channel.mouth),r=channel.coreRadiusWU;
 const corners=[[-r,-r],[r,-r],[r,r],[-r,r]].map(([y,z])=>[m[0]-.01,m[1]+y,m[2]+z]);
 for(const indices of [[0,1,2],[0,2,3]])capped[0].push({name:'LOD0_FalseExhaustCap',vertices:indices.map(i=>corners[i])});
 assert.throws(()=>verifyThrusterGeometry(part,raw,capped),/blocks actual exhaust opening/);
});


test('native containment rejects the real decimator overshoot even with unchanged truthful proxies',()=>{
 const solids=contract.assets.breaker.states.open.boxes.map(b=>({
  centerWU:[b.center.x,b.center.y,b.center.z],sizeWU:[b.size.x,b.size.y,b.size.z]}));
 const point=[-90.02235412597656,-2.2988405227661133,-56.973426818847656];
 assert.throws(()=>assertNativeVertex('LOD2_Hull',point,solids),/outside the native flight-plane compound/);
 assertNativeVertex('LOD2_Hull',[-90,point[1],point[2]],solids);
});
