import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BOMB_DEFS } from '../src/data/bombs.js';
import { BombDetonationVfx, createBombDetonationPrecompileMesh } from '../src/render/vfx/bombDetonationVfx.js';
import { createActionPrimitivePrecompileMesh } from '../src/render/vfx/actionPrimitives.js';

function fixture(){
  const ship={id:1,alive:true,type:'ship',pos:{x:-24,z:0},vel:{x:0,z:0},rot:0,radius:7};
  const target={id:2,alive:true,type:'asteroid',pos:{x:32,z:8},prevPos:{x:32,z:8},rot:.4,radius:8};
  const other={id:3,alive:true,type:'ship',pos:{x:-13,z:28},prevPos:{x:-13,z:28},rot:-.5,radius:6};
  return {simTime:1,playerId:1,entities:new Map([[1,ship],[2,target],[3,other]]),
    settings:{video:{}},render:{interpolationAlpha:1}};
}
function receipt(payloadId,id=19){return {schemaVersion:2,bombId:id,payloadId,ownerId:1,
  pos:{x:0,z:0},vel:{x:9,z:2},radius:BOMB_DEFS[payloadId].radius,trigger:'proximity',
  hits:[2,3],shoves:[{id:2,dx:.94,dz:.34,mag:500},{id:3,dx:-.25,dz:.97,mag:180}]};}
function pieces(owner){
  const list=[];for(let i=0;i<owner.batch.count;i++){
    const values=[];for(const attribute of owner.batch.attributes)
      for(let j=0;j<4;j++)values.push(attribute.array[i*4+j]);
    list.push(values);
  }return list;
}
function disposeWarm(mesh){mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();}

test('eight native payloads have different constructions and finish their own finite lifecycle',()=>{
  const signatures=new Set();
  for(const payloadId of Object.keys(BOMB_DEFS)){
    const state=fixture(),scene=new THREE.Scene(),owner=new BombDetonationVfx(scene);
    assert.equal(owner.emit('bombs:detonated',receipt(payloadId),state),true,payloadId);
    state.simTime=1.23;owner.update(state);
    const built=pieces(owner);assert.ok(built.length>0,payloadId);
    assert.ok(built.every(row=>row.every(Number.isFinite)),payloadId);
    // Geometry/path choice is distinct before palette: kind, reach, width and local phase.
    signatures.add(JSON.stringify(built.map(row=>row.slice(3,12))));
    state.simTime=5;owner.update(state);assert.equal(owner.live,0);assert.equal(owner.mesh.visible,false);
    assert.equal(owner.particles.live,0);owner.dispose();assert.equal(scene.children.length,0);
  }
  assert.equal(signatures.size,Object.keys(BOMB_DEFS).length);
});

test('anchor links end on actual hit surfaces, follow local offsets, and invent no receivers',()=>{
  const state=fixture(),owner=new BombDetonationVfx(new THREE.Scene());
  const p=receipt('bomb_anchor');owner.emit('bombs:detonated',p,state);
  state.simTime=1.26;owner.update(state);
  const s=owner.slots[0],links=pieces(owner).filter(row=>row[4]===2);
  assert.equal(links.length,2);assert.deepEqual(s.targets.slice(0,s.targetCount).map(t=>t.id),[2,3]);
  for(let i=0;i<links.length;i++){
    const row=links[i],end={x:row[0]+Math.cos(row[3])*row[6],z:row[2]+Math.sin(row[3])*row[6]};
    assert.ok(Math.hypot(end.x-s.targets[i].x,end.z-s.targets[i].z)<1e-4);
  }
  const t=s.targets[0],body=state.entities.get(2);body.pos={x:37,z:13};body.rot+=.7;
  owner.update(state);
  assert.ok(Math.abs(t.x-(37+Math.cos(body.rot)*t.ox-Math.sin(body.rot)*t.oz))<1e-8);
  const lastX=t.x,lastZ=t.z;
  state.entities.set(2,{...body,pos:{x:999,z:999}});owner.update(state);
  assert.equal(t.x,lastX);assert.equal(t.z,lastZ,'recycled ID cannot steal a contact');
  owner.clear();owner.emit('bombs:detonated',{...p,bombId:20,hits:[]},state);
  state.simTime+=.18;owner.update(state);
  assert.equal(pieces(owner).filter(row=>row[4]===2).length,0);
  assert.equal(owner.stats.contacts,0);assert.ok(owner.batch.count>0,'unloaded source still cools');
  owner.clear();state.entities.get(3).pos={x:0,z:0};
  owner.emit('bombs:detonated',{...p,bombId:21,hits:[3]},state);state.simTime+=.26;owner.update(state);
  assert.equal(pieces(owner).filter(row=>row[4]===2).length,0,'coincident source has no degenerate strand');
  assert.equal(pieces(owner).filter(row=>row[4]===6).length,3,'coincident victim still receives two visible clamps plus source');
  owner.dispose();
});

test('receipt snapshots and contact budget do not mutate producers or expand with unordered duplicates',()=>{
  const state=fixture(),owner=new BombDetonationVfx(new THREE.Scene(),{capacity:2});
  for(let id=4;id<16;id++)state.entities.set(id,{id,alive:true,pos:{x:id*3,z:8},rot:0,radius:2});
  const p=receipt('bomb_anchor');p.hits=[2,2,3,4,5,6,7,8,9,10];
  const before=JSON.stringify([...state.entities.values()]);owner.emit('bombs:detonated',p,state);
  assert.equal(owner.slots[0].targetCount,6);assert.equal(p.hits.length,10);
  p.pos.x=500;p.hits.length=0;p.shoves[0].dx=-50;
  state.simTime+=.2;owner.update(state);assert.equal(owner.slots[0].x,0);
  assert.equal(owner.slots[0].targetCount,6);assert.equal(JSON.stringify([...state.entities.values()]),before);
  owner.emit('bombs:detonated',receipt('bomb_emp',20),state);
  owner.emit('bombs:detonated',receipt('bomb_frag',21),state);
  owner.update(state);assert.equal(owner.live,2);assert.equal(owner.stats.dropped,1);
  assert.ok(owner.batch.count<=owner.batch.capacity);owner.dispose();
});

test('singularity opening, collapse and field end do not create a duplicate persistent field',()=>{
  const state=fixture(),owner=new BombDetonationVfx(new THREE.Scene());
  const p=receipt('bomb_singularity');owner.emit('bombs:detonated',p,state);
  owner.emit('bombs:detonated',p,state);assert.equal(owner.live,1,'same receipt coalesces');
  state.simTime+=.22;owner.update(state);assert.equal(pieces(owner).filter(row=>row[4]===4).length,0);
  state.simTime+=1;owner.update(state);assert.equal(owner.live,0,'opening is only a short handoff');
  owner.emit('bombs:detonated',{...p,trigger:'collapse'},state);
  owner.emit('bombs:fieldEnded',{...p,trigger:'collapse'},state);assert.equal(owner.live,1);
  state.simTime+=.33;owner.update(state);assert.ok(pieces(owner).some(row=>row[4]===4),'collapse uses received shove directions');
  owner.dispose();
});

test('interruptions and goo expiry cool locally without detonating or spawning powered parcels',()=>{
  for(const event of ['bombs:fieldEnded','bombs:destroyed']){
    const state=fixture(),owner=new BombDetonationVfx(new THREE.Scene());
    owner.emit(event,receipt('bomb_goo'),state);state.simTime+=.2;owner.update(state);
    assert.equal(owner.batch.count,2);assert.equal(owner.particles.live,0);
    assert.ok(pieces(owner).every(row=>row[4]===3));
    state.simTime+=1;owner.update(state);assert.equal(owner.mesh.visible,false);owner.dispose();
  }
});

test('pause, accessibility, rebasing and rewind preserve time and anchor ownership',()=>{
  const state=fixture();let origin=0;
  const owner=new BombDetonationVfx(new THREE.Scene(),{toLocal:(x,z,out)=>{out.x=x-origin;out.z=z;}});
  owner.emit('bombs:detonated',receipt('bomb_emp'),state);state.simTime+=.19;owner.update(state);
  const initial=pieces(owner),particleAge=owner.particles.system.particles[0]?.age;
  owner.update(state);assert.deepEqual(pieces(owner),initial);
  assert.equal(owner.particles.system.particles[0]?.age,particleAge);
  origin=100;owner.reproject(-100,0);owner.update(state);
  assert.ok(Math.abs(pieces(owner)[0][0]-(initial[0][0]-100))<1e-6);
  assert.equal(owner.slots[0].x,0,'source snapshot stays global');
  state.settings.video={motionReduce:true,flashReduce:true};owner.update(state);
  assert.equal(owner.particles.live,0);assert.ok(owner.batch.count>0);
  assert.equal(owner.batch.material.uniforms.uMotion.value,0);assert.equal(owner.batch.material.uniforms.uFlash.value,.56);
  state.simTime=.3;owner.emit('bombs:detonated',receipt('bomb_frag',25),state);owner.update(state);
  assert.equal(owner.live,1,'receipt at rewound time survives next update');
  state.simTime=.4;owner.update(state);assert.ok(owner.batch.count>0);
  state.simTime=.1;owner.update(state);assert.equal(owner.live,0);
  owner.dispose();owner.dispose();assert.equal(owner.emit('bombs:detonated',receipt('bomb_frag'),state),false);
});

test('bomb cook uses the already shared action program rather than a second shader engine',()=>{
  const bomb=createBombDetonationPrecompileMesh(),action=createActionPrimitivePrecompileMesh();
  assert.equal(bomb.material.vertexShader,action.material.vertexShader);
  assert.equal(bomb.material.fragmentShader,action.material.fragmentShader);
  assert.equal(bomb.material.transparent,true);assert.equal(bomb.material.depthWrite,false);
  disposeWarm(bomb);disposeWarm(action);
});
