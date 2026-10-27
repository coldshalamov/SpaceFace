import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { LAST_SHIFT_FAIRLEAD_PROXY as proxy, LAST_SHIFT_FAIRLEAD_GEOMETRY as geometry } from '../src/data/lastShiftFairleadGeometry.js';
import { resolveCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';
import { sweepCollisionProxyInto } from '../src/core/collisionProxySweep.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createSimulation } from '../src/core/sim.js';
import { lastShift } from '../src/systems/lastShift.js';
import { LAST_SHIFT as C, LAST_SHIFT_POS } from '../src/data/lastShift.js';
import { save } from '../src/save/saveSystem.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { getCombatKernel } from '../src/combat/kernel.js';
const DT=1/60;
const worldPoint=(p,rot,origin)=>({x:origin.x+p.x*Math.cos(rot)-p.z*Math.sin(rot),z:origin.z+p.x*Math.sin(rot)+p.z*Math.cos(rot)});
function fixture(native) {
  const sim=createSimulation({seed:18,systems:[lastShift],helpers:{combatPhysics:native}});
  const {state}=sim; state.mode='flight';state.world.currentSectorId=C.sectorId;
  const player=sim.spawn({type:'ship',isPlayer:true,pos:{x:LAST_SHIFT_POS.x-100,z:LAST_SHIFT_POS.z},radius:2,mass:28,hull:100,data:{}});
  state.playerId=player.id;
  const system=sim.registry.get('lastShift');system.update(DT,state);
  return {sim,state,system,fairlead:system._find('fairlead'),player};
}
function probe(id,pos,vel,radius=1) {
  return {id,type:'wreck',alive:true,pos,vel,rot:0,angVel:0,radius,mass:5,
    physicsBody:{schemaVersion:1,shape:'ball',radius,mass:5,inertiaY:3,dynamic:true,ccd:true,revision:0,useMeasuredSkin:false},data:{}};
}
function distanceToTriangle(p,a,b,c) {
  const cross=(a,b,p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
  const signs=[cross(a,b,p),cross(b,c,p),cross(c,a,p)];
  if((signs.every(v=>v>=-1e-9)||signs.every(v=>v<=1e-9))&&Math.abs(cross(a,b,c))>1e-10)return 0;
  return Math.min(...[[a,b],[b,c],[c,a]].map(([a,b])=>{
    const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
    return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
  }));
}
const partDistance=p=>Math.min(...proxy.convexParts.map(part=>{
  const pts=part.points.map(p=>({x:p.x*26,z:p.z*26}));
  return Math.min(...pts.slice(1,-1).map((b,i)=>distanceToTriangle(p,pts[0],b,pts[i+2])));
}));
test('authored deck footprint follows exact compiled fit, including all LODs and raised lip/roller',async()=>{
  assert.equal(createHash('sha256').update(fs.readFileSync(geometry.url)).digest('hex'),geometry.sha256);
  await MeshoptDecoder.ready;
  const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}).read(geometry.url);
  const bounds=new THREE.Box3(), vertices=[],triangles=[],byLod=[[],[],[]];let roller=0;
  for(const node of doc.getRoot().listNodes())for(const primitive of node.getMesh()?.listPrimitives()||[]) {
    const attr=primitive.getAttribute('POSITION'), matrix=new THREE.Matrix4().fromArray(node.getWorldMatrix()),points=[];
    for(let i=0;i<attr.getCount();i++){const v=[];attr.getElement(i,v);const p=new THREE.Vector3(...v).applyMatrix4(matrix);bounds.expandByPoint(p);points.push(p);}
    if(!/^LOD[012]_/.test(node.getName()))continue;
    const lod=Number(node.getName()[3]);
    for(const p of points){const q={x:(p.x-geometry.center.x)*geometry.fitScale,z:(p.z-geometry.center.z)*geometry.fitScale};q.name=node.getName();vertices.push(q);byLod[lod].push(q);}
    if(node.getName().includes('ROLLER'))roller+=points.length;
    if(lod===0){const index=primitive.getIndices()?.getArray()||points.map((_,i)=>i);for(let i=0;i<index.length;i+=3)triangles.push([index[i],index[i+1],index[i+2]].map(j=>({x:(points[j].x-geometry.center.x)*geometry.fitScale,z:(points[j].z-geometry.center.z)*geometry.fitScale})));}
  }
  assert.ok(roller>0);
  assert.ok(Math.abs(bounds.getCenter(new THREE.Vector3()).x-geometry.center.x)<1e-9);
  assert.ok(Math.abs(52/Math.max(...bounds.getSize(new THREE.Vector3()).toArray())-geometry.fitScale)<1e-9);
  const errors=byLod.map(points=>Math.max(...points.map(partDistance)));
  assert.ok(Math.max(...errors)<.05,`compiled vertices beyond authored footprint: ${errors}`);
  const faceError=Math.max(...triangles.map(t=>partDistance({x:t.reduce((s,p)=>s+p.x,0)/3,z:t.reduce((s,p)=>s+p.z,0)/3})));
  assert.ok(faceError<.05,`compiled triangle interiors beyond footprint ${faceError}`);
  let overhang=0;
  for(const part of proxy.convexParts)for(let i=0;i<part.points.length;i++)for(let t=0;t<=12;t++){
    const a=part.points[i],b=part.points[(i+1)%part.points.length],p={x:26*(a.x+(b.x-a.x)*t/12),z:26*(a.z+(b.z-a.z)*t/12)};
    overhang=Math.max(overhang,Math.min(...triangles.map(([a,b,c])=>distanceToTriangle(p,a,b,c))));
  }
  assert.ok(overhang<.4,`proxy boundary outside actual compiled LOD0 triangles ${overhang}`);
  assert.equal(partDistance({x:0,z:0}),0,'roller throat has solid deck beneath it');
  assert.ok(partDistance({x:0,z:22})>7,'long-side empty space inside old sphere');
  console.log('FAIRLEAD_MESH',{errors,faceError,overhang});
});

async function runTrajectory({old=false,rot=.61,origin={x:541,z:-213},start={x:-35,z:22},velocity={x:20,z:0},steps=180,radius=1}){
  const native=await createSg02DynamicBodyOwner({ready:true}),h=fixture(native);
  try{
    const f=h.fairlead;f.pos.set(origin.x,0,origin.z);f.rot=rot;
    if(old)delete f.physicsBody.collisionProxyManifest;
    const p=probe(90001,worldPoint(start,rot,origin),worldPoint(velocity,rot,{x:0,z:0}),radius);
    native.syncFromEntities([f,p]);const fr=native.records.get(f.id),pr=native.records.get(p.id);let impacts=0,min=Infinity;
    for(let i=0;i<steps;i++){
      native.step(DT);impacts+=native.drainContactImpacts().filter(r=>r.aId===f.id||r.bId===f.id).length;
      for(const a of fr.colliders)for(const b of pr.colliders){const c=a.contactCollider(b,50);if(c)min=Math.min(min,c.distance);}
    }
    const end=worldPoint({x:start.x+velocity.x*steps*DT,z:start.z+velocity.z*steps*DT},rot,origin);
    return {error:Math.hypot(p.pos.x-end.x,p.pos.z-end.z),impacts,min,colliders:fr.colliders.length,
      local:worldPoint({x:p.pos.x-origin.x,z:p.pos.z-origin.z},-rot,{x:0,z:0})};
  }finally{h.sim.dispose();native.dispose();}
}
test('unchanged published ball negative control hits empty space; authored native deck clears it at translated yaw',async()=>{
  const old=await runTrajectory({old:true}),fresh=await runTrajectory({}),zero=await runTrajectory({rot:0});
  assert.ok(old.impacts>0&&old.error>5,JSON.stringify(old));
  for(const row of [fresh,zero]){assert.equal(row.colliders,17);assert.equal(row.impacts,0);assert.ok(row.min>6);assert.ok(row.error<.03,JSON.stringify(row));}
  console.log('FAIRLEAD_NATIVE_CLEARANCE',{old,fresh,zero});
});
test('actual native contact stops a probe on the visible long deck edge, not former sphere edge',async()=>{
  const hit=await runTrajectory({start:{x:0,z:22},velocity:{x:0,z:-10},steps:120});
  assert.ok(hit.impacts>0);assert.ok(hit.local.z>14&&hit.local.z<16,JSON.stringify(hit));
  console.log('FAIRLEAD_NATIVE_CONTACT',hit);
});
test('fallback query shares the tested free lane and solid plate, while remaining only a strip approximation',()=>{
  const rot=.61,origin={x:541,z:-213};const entity={radius:26,pos:origin,rot,physicsBody:{collisionProxyManifest:proxy},data:{}};
  for(const [a,b,expected] of [[{x:-35,z:22},{x:35,z:22},false],[{x:0,z:22},{x:0,z:0},true]]){
    assert.equal(sweepCollisionProxyInto({},entity,proxy,worldPoint(a,rot,origin),worldPoint(b,rot,origin),1),expected);
  }
});
test('old live fairlead upgrades in place once; real cold Continue and missing-body rematerialization retain owner geometry',async()=>{
  const native=await createSg02DynamicBodyOwner({ready:true}),h=fixture(native);
  const otherNative=await createSg02DynamicBodyOwner({ready:true});
  const dest=createSimulation({seed:18,systems:[world,lastShift,save],helpers:{combatPhysics:otherNative}});
  try{
    const f=h.fairlead;delete f.physicsBody.collisionProxyManifest;const id=f.id,life=f.occupantGeneration;
    native.syncFromEntities(h.state.entityList);assert.equal(native.records.get(id).colliders.length,1);
    const before=JSON.parse(JSON.stringify(h.system._row)),rev=f.physicsBody.revision;
    h.system.afterContinue();assert.strictEqual(h.system._find('fairlead'),f);assert.equal(f.id,id);assert.equal(f.occupantGeneration,life);
    assert.equal(f.physicsBody.revision,rev+1);h.system.afterContinue();assert.equal(f.physicsBody.revision,rev+1);
    native.syncFromEntities(h.state.entityList);assert.equal(native.records.get(id).colliders.length,17);
    assert.deepEqual(h.system.serialize(),before);
    const saver=Object.assign(Object.create(save),{state:h.state,bus:h.sim.bus,helpers:h.sim.helpers,registry:h.sim.registry});
    const data=saver.serializeData();const old=data.entities.persistent.find(e=>e.data?.lastShiftClueId==='fairlead');delete old.physicsBody.collisionProxyManifest;old.physicsBody.revision=0;
    const ds=dest.registry.get('save'),sys=dest.registry.get('lastShift');
    assert.equal(ds._restore(JSON.parse(JSON.stringify(data)),'quick').restored,true);
    const continued=sys._find('fairlead');assert.notStrictEqual(continued,f);assert.equal(resolveCollisionProxyManifest(continued).id,proxy.id);
    otherNative.syncFromEntities(dest.state.entityList);assert.equal(otherNative.records.get(continued.id).colliders.length,17);
    for(const name of ['cargo','recorder']){const e=sys._find(name);assert.equal(e.physicsBody.shape,'ball');assert.equal(e.physicsBody.dynamic,true);assert.equal(e.physicsBody.radius,name==='cargo'?12:5);assert.equal(e.physicsBody.mass,name==='cargo'?90:5);assert.equal(resolveCollisionProxyManifest(e),null);}
    assert.equal(continued.mass,1800);assert.equal(continued.hull,360);assert.equal(continued.physicsBody.dynamic,false);assert.equal(continued.radius,26);
    dest.state.entities.delete(continued.id);dest.state.entityList.splice(dest.state.entityList.indexOf(continued),1);sys._bindings.clear();dest.state.world.currentSectorId=C.sectorId;sys._materialize();const remade=sys._find('fairlead');
    assert.ok(remade);assert.notStrictEqual(remade,continued);assert.equal(resolveCollisionProxyManifest(remade).id,proxy.id);
  }finally{h.sim.dispose();dest.dispose();native.dispose();otherNative.dispose();}
});

test('small native probe retains the real torn-edge recess rather than a filled union hull',async()=>{
  const start={x:(3.4-geometry.center.x)*geometry.fitScale,z:(-.2-geometry.center.z)*geometry.fitScale};
  assert.ok(partDistance(start)>.8);
  const row=await runTrajectory({start,velocity:{x:0,z:0},radius:.25,steps:60});
  assert.equal(row.impacts,0);assert.ok(row.min>.5,JSON.stringify(row));assert.ok(row.error<.001);
});
test('canonical recorder tow remains physically clear beside the deck without pose correction',async()=>{
  const native=await createSg02DynamicBodyOwner({ready:true}),h=fixture(native);
  try{
    const f=h.fairlead,recorder=h.system._find('recorder'),origin={x:541,z:-213},rot=.61;
    f.pos.set(origin.x,0,origin.z);f.rot=rot;
    for(const [e,x] of [[h.player,-25],[recorder,-13]]){
      const p=worldPoint({x,z:24},rot,origin),v=worldPoint({x:6,z:0},rot,{x:0,z:0});e.pos.set(p.x,0,p.z);e.vel.set(v.x,0,v.z);
    }
    native.syncFromEntities([f,h.player,recorder]);
    const created=getCombatKernel(h.system.ctx).attachments.create({defId:'tether_standard',ownerId:h.player.id,targetId:recorder.id,sourceWorld:h.player.pos,targetWorld:recorder.pos});
    assert.equal(created.ok,true,created.reason);const line=created.attachment;
    assert.ok(native.exportWorldSnapshot().attachmentOrder.includes(line.id));
    const id=recorder.id,life=recorder.occupantGeneration;let min=Infinity,impacts=0;
    for(let i=0;i<120;i++){
      native.step(DT);impacts+=native.drainContactImpacts().filter(r=>r.aId===f.id||r.bId===f.id).length;
      for(const a of native.records.get(f.id).colliders)for(const b of native.records.get(recorder.id).colliders){const c=a.contactCollider(b,50);if(c)min=Math.min(min,c.distance);}
    }
    assert.equal(impacts,0);assert.ok(min>4);assert.equal(line.state,'active');assert.equal(recorder.id,id);assert.equal(recorder.occupantGeneration,life);
    assert.ok(native.exportWorldSnapshot().attachmentOrder.includes(line.id));
    console.log('FAIRLEAD_TOW',{min,id,life});
  }finally{h.sim.dispose();native.dispose();}
});
test('migration never replaces foreign identity or an existing explicit body override',()=>{
  const h=fixture({createAttachment:()=>null});
  try{
    const f=h.fairlead,original=JSON.parse(JSON.stringify(f.physicsBody));
    const changes=[
      e=>{e.data.persistenceOwner='foreign';},e=>{e.data.lastShiftClueId='cargo';},
      e=>{e.physicsBody.shape='capsule';},e=>{e.physicsBody.dynamic=true;},
      e=>{e.physicsBody.radius=25;},e=>{e.physicsBody.mass=1799;},
      e=>{e.physicsBody.collisionProxyManifest={...proxy,id:'foreign-authored'};},
    ];
    for(const change of changes){
      f.physicsBody=JSON.parse(JSON.stringify(original));delete f.physicsBody.collisionProxyManifest;
      f.data.persistenceOwner=C.persistenceOwner;f.data.lastShiftClueId='fairlead';change(f);
      const before=JSON.stringify(f.physicsBody);h.system._find('fairlead');assert.equal(JSON.stringify(f.physicsBody),before);
    }
  }finally{h.sim.dispose();}
});

test('real old-ball binary snapshot is rejected and rebuilt by the normal SaveSystem physics epilogue',async()=>{
  const native=await createSg02DynamicBodyOwner({ready:true}),h=fixture(native);
  const dest=createSimulation({seed:18,systems:[world,lastShift,physics,save]});
  try{
    const f=h.fairlead;delete f.physicsBody.collisionProxyManifest;f.physicsBody.revision=0;
    // Keep the saved scene in frame zero so the old binary reaches contract
    // validation, rather than being rejected first for an unrelated origin shift.
    for(const e of h.state.entityList)e.pos.set(e.pos.x-LAST_SHIFT_POS.x,0,e.pos.z-LAST_SHIFT_POS.z);
    native.syncFromEntities(h.state.entityList);
    assert.equal(native.records.get(f.id).colliders.length,1);
    native.step(DT);native.drainContactImpacts();
    const legacySnapshot=JSON.parse(JSON.stringify(native.exportWorldSnapshot()));
    assert.ok(legacySnapshot.snapshot.length>0);
    const control=await createSg02DynamicBodyOwner({ready:true});
    try {
      assert.equal(control.adoptWorldSnapshot(legacySnapshot,h.state.entityList),true,'legacy snapshot is genuinely adoptable before migration');
      h.system._find('fairlead');
      assert.equal(control.adoptWorldSnapshot(legacySnapshot,h.state.entityList),false,'only the fairlead upgrade invalidates the old binary contract');
    } finally {control.dispose();}
    const saver=Object.assign(Object.create(save),{state:h.state,bus:h.sim.bus,helpers:h.sim.helpers,registry:h.sim.registry});
    const data=saver.serializeData();data.physics=legacySnapshot;
    // Reconstruct the coherent old-version save envelope: serialization in today's
    // owner upgrades the live entity, but this payload must retain yesterday's body.
    const legacyEntity=data.entities.persistent.find(e=>e.data?.lastShiftClueId==='fairlead');
    delete legacyEntity.physicsBody.collisionProxyManifest;legacyEntity.physicsBody.revision=0;
    const ps=dest.registry.get('physics');await ps.prepareBackend(dest.state);
    const result=dest.registry.get('save')._restore(data,'legacy-fairlead-binary');
    assert.equal(result.restored,true);
    const restored=dest.registry.get('lastShift')._find('fairlead');
    assert.equal(dest.state.physicsRuntime.nativeRestore.mode,'scalar');
    assert.equal(dest.state.physicsRuntime.nativeRestore.exact,false);
    assert.equal(dest.state.physicsRuntime.nativeRestore.reason,'identity_or_contract_changed');
    assert.equal(ps._sg02.records.get(restored.id).colliders.length,17);
    assert.equal(ps._nativeRestorePending,false);
    assert.equal(ps._pendingSg02Snapshot,null);
    assert.equal(restored.physicsBody.revision,1);
    assert.equal(ps._sg02.records.get(restored.id).proxyId,proxy.id);
    console.log('FAIRLEAD_BINARY_CONTINUE',dest.state.physicsRuntime.nativeRestore);
  }finally{h.sim.dispose();dest.registry.get('physics')._sg02?.dispose();dest.dispose();native.dispose();}
});
