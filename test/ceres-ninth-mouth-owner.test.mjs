import test from 'node:test';
import assert from 'node:assert/strict';
import { installCeresNinthMouth, stepCeresNinthMouth, serializeCeresNinthMouth, restoreCeresNinthMouth, ceresNinthMouthStatus } from '../src/systems/ceresNinthMouth.js';
import { CERES_NINTH_MOUTH as C, worldPoint } from '../src/data/ceresNinthMouth.js';
import { captureEntityRecord } from '../src/world/worldRecords.js';
const clone=v=>JSON.parse(JSON.stringify(v));
// Owner-boundary fixture. This is deliberately not native-motion evidence:
// the separate production test exercises Rapier, Line input and full SaveSystem.
function fixture() {
 const listeners=new Map(),events=[];
 const bus={on(n,fn){const list=listeners.get(n)||[];list.push(fn);listeners.set(n,list);return()=>{const i=list.indexOf(fn);if(i>=0)list.splice(i,1);};},emit(n,p){events.push([n,p]);for(const fn of [...(listeners.get(n)||[])])fn(p);}};
 const s={mode:'flight',run:{kind:'adventure'},settings:{gameplay:{physicsBackend:'rapier-dynamic'}},world:{currentSectorId:C.sectorId,records:{byId:{}}},ui:{},npcJobs:{},combat:{attachments:{byId:{}}},entities:new Map(),entityList:[],tick:0,simTime:0};
 const native={records:new Map(),world:{getRigidBody(h){return native.records.get(h)?.body;}},_frameOrigin:{x:0,z:0},_simTick:0,tick:0};
 let id=1;
 const spawn=spec=>{const e={alive:true,flags:{},data:{},rot:0,angVel:0,vel:{x:0,z:0},...spec,id:id++,occupantGeneration:id};s.entities.set(e.id,e);s.entityList.push(e);const pose={pos:{...e.pos},vel:{...e.vel},spin:e.angVel||0};const body={handle:e.id,isEnabled:()=>true,translation:()=>pose.pos,linvel:()=>pose.vel,angvel:()=>({y:pose.spin})};native.records.set(e.id,{entity:e,spec:e.physicsBody||{dynamic:true},body,pose,_postStepReadTick:0});bus.emit('entity:spawned',{entity:e,id:e.id});return e;};
 const p=spawn({type:'ship',radius:6,mass:20,hull:100,pos:worldPoint({x:-450,z:0}),physicsBody:{dynamic:true,radius:6,mass:20}});s.playerId=p.id;
 const owner={state:s,bus,helpers:{spawnEntity:spawn},registry:{get:n=>n==='physics'?{_sg02:native}:null}};
 const dispose=installCeresNinthMouth(owner);
 const step=(n=1)=>{for(let i=0;i<n;i++){s.tick++;s.simTime+=1/60;native.tick++;native._simTick=s.tick;for(const row of native.records.values()){row._postStepReadTick=native.tick;row.spec=row.entity.physicsBody||{dynamic:true};}stepCeresNinthMouth(owner,1/60);}};
 const get=role=>s.entityList.find(e=>e.alive&&e.data.ninthMouthRole===role);
 const pose=(e,at,velocity={x:0,z:0})=>{e.pos={...at};e.vel={...velocity};const r=native.records.get(e.id);r.pose.pos={...at};r.pose.vel={...velocity};};
 const choose=action=>{const o=s.ceresNinthMouthOffer;assert.ok(o?.choices.some(c=>c.id===action&&!c.disabled),JSON.stringify(o));bus.emit('ceresNinthMouth:action',{action,offerId:o.id,playerLife:o.playerLife});return o;};
 step(30);return {s,p,bus,events,owner,spawn,step,get,pose,choose,native,dispose};
}
test('one real original must arrive released, slow, with live receiver; repetitions pay nothing',()=>{
 const f=fixture();const {s,get,pose,step,owner,bus,events}=f;
 assert.equal(s.entityList.filter(e=>e.data.ninthMouthRole).length,8);
 const barge=get('barge');step(180);assert.equal(s.npcJobs.ceresNinthMouth.rescue,null);
 pose(barge,worldPoint(C.berth.local),{x:4,z:0});step(180);assert.equal(s.npcJobs.ceresNinthMouth.rescue,null);
 pose(barge,worldPoint(C.berth.local));s.combat.attachments.byId.a={state:'active',ownerId:s.playerId,targetId:barge.id,targetGeneration:barge.occupantGeneration};step(180);assert.equal(s.npcJobs.ceresNinthMouth.rescue,null);
 s.combat.attachments.byId={};step(30);for(let i=0;i<200;i++)stepCeresNinthMouth(owner,1/60);assert.equal(s.npcJobs.ceresNinthMouth.rescue,null,'same tick cannot accelerate dwell');
 step(100);assert.equal(ceresNinthMouthStatus(owner).rescuedBarges,1);step(200);
 assert.equal(events.filter(e=>e[0]==='ceresNinthMouth:rescueCommitted').length,1);
 assert.equal(events.some(e=>/cargo|credit|economy|mission:completed/.test(e[0])),false);
 f.dispose();
});
test('native pose and missing receiver block false arrival; destroyed barge is never a safe census',()=>{
 const f=fixture(),b=f.get('barge');b.pos=worldPoint(C.berth.local);f.step(180);assert.equal(f.s.npcJobs.ceresNinthMouth.rescue,null);
 f.pose(b,worldPoint(C.berth.local));f.get('receiver').alive=false;f.step(180);assert.equal(f.s.npcJobs.ceresNinthMouth.rescue,null);
 b.alive=false;f.step(10);assert.equal(ceresNinthMouthStatus(f.owner).rescuedBarges,0);assert.equal(ceresNinthMouthStatus(f.owner).status,'lost');
 const count=f.s.entityList.length;f.step(200);assert.equal(f.s.entityList.length,count,'no remint after loss');f.dispose();
});
test('seating is an actual released settled lamp; stale buttons cannot freeze a moved or rebound body',()=>{
 const f=fixture(),lamp=f.get('lamp:0');const at=worldPoint(C.lamps[0].local);
 f.pose(f.p,{x:at.x-35,z:at.z});f.pose(lamp,at);f.step(20);
 const before=clone([lamp.pos,lamp.vel,lamp.rot,lamp.angVel]);const stale=f.choose('seat:0');
 assert.equal(lamp.physicsBody.dynamic,false);assert.equal(lamp.data.ninthMouthInstalled,true);assert.deepEqual([lamp.pos,lamp.vel,lamp.rot,lamp.angVel],before);
 f.choose('unseat:0');assert.equal(lamp.physicsBody.dynamic,true);
 f.bus.emit('ceresNinthMouth:action',{action:'seat:0',offerId:stale.id,playerLife:stale.playerLife});assert.equal(lamp.physicsBody.dynamic,true);
 f.step(20);const pending=f.s.ceresNinthMouthOffer;f.pose(lamp,{x:at.x+90,z:at.z});
 f.bus.emit('ceresNinthMouth:action',{action:'seat:0',offerId:pending.id,playerLife:pending.playerLife});assert.equal(lamp.physicsBody.dynamic,true);
 f.pose(lamp,at);f.step(20);const old=f.s.ceresNinthMouthOffer;f.p.occupantGeneration++;f.bus.emit('ceresNinthMouth:action',{action:'seat:0',offerId:old.id,playerLife:old.playerLife});assert.equal(lamp.physicsBody.dynamic,true);
 f.dispose();
});
test('save schema rejects counterfeit receipts and malformed slots, and rewind resets pending dwell',()=>{
 const f=fixture();const saved=serializeCeresNinthMouth(f.owner);saved.version=99;
 restoreCeresNinthMouth(f.owner,saved);assert.ok(Object.values(f.s.npcJobs.ceresNinthMouth.objects).every(o=>o.spawned));
 const valid=serializeCeresNinthMouth(f.owner);valid.version=1;valid.rescue={committed:true,count:9};restoreCeresNinthMouth(f.owner,valid);assert.equal(f.s.npcJobs.ceresNinthMouth.rescue,null);
 for(const e of f.s.entityList.filter(e=>e.data.ninthMouthRole)){const r=captureEntityRecord(e);r.liveEntityId=e.id;f.s.world.records.byId[r.recordId]=r;}
 f.bus.emit('save:loaded',{});f.pose(f.get('barge'),worldPoint(C.berth.local));f.step(60);const half=serializeCeresNinthMouth(f.owner);restoreCeresNinthMouth(f.owner,half);f.step(65);assert.equal(f.s.npcJobs.ceresNinthMouth.rescue,null);f.step(60);assert.equal(f.s.npcJobs.ceresNinthMouth.rescue.count,1);f.dispose();
});
test('duplicate body identity refuses rescue, same-id replacement cannot inherit arrival',()=>{
 const f=fixture(),b=f.get('barge');f.spawn({...clone(b),pos:worldPoint(C.berth.local)});f.pose(b,worldPoint(C.berth.local));f.step(160);assert.equal(f.s.npcJobs.ceresNinthMouth.rescue,null);f.dispose();
 const g=fixture(),old=g.get('barge');g.pose(old,worldPoint(C.berth.local));g.step(60);old.occupantGeneration++;g.step(160);assert.equal(g.s.npcJobs.ceresNinthMouth.rescue,null);g.dispose();
});
test('light restoration is separate from rescue; loss changes current condition but not historical arrival',()=>{
 const f=fixture();for(let i=0;i<3;i++){const e=f.get(`lamp:${i}`),at=worldPoint(C.lamps[i].local);f.pose(e,at);f.pose(f.p,{x:at.x-35,z:at.z});f.step(20);f.choose(`seat:${i}`);}
 assert.equal(ceresNinthMouthStatus(f.owner).lights,3);assert.equal(f.s.npcJobs.ceresNinthMouth.tag,false);
 f.pose(f.get('barge'),worldPoint(C.berth.local));f.step(130);assert.equal(f.s.npcJobs.ceresNinthMouth.tag,true);
 f.get('lamp:1').alive=false;f.step(2);assert.equal(ceresNinthMouthStatus(f.owner).lights,2);assert.equal(ceresNinthMouthStatus(f.owner).rescuedBarges,1);assert.equal(f.s.npcJobs.ceresNinthMouth.tag,true);f.dispose();
});
test('non-Adventure mode and sector departure cannot award or accept old actions',()=>{
 const f=fixture(),b=f.get('barge');f.pose(b,worldPoint(C.berth.local));f.step(60);f.s.run.kind='survival';f.step(200);assert.equal(f.s.npcJobs.ceresNinthMouth.rescue,null);assert.equal(f.s.ceresNinthMouthOffer,null);
 f.s.run.kind='adventure';f.s.world.currentSectorId='sector_helios_prime';f.bus.emit('sector:exit',{});f.step(200);assert.equal(f.s.npcJobs.ceresNinthMouth.rescue,null);f.dispose();
});

test('unbound copied tags and null tombstones never replace an original after lifecycle reset',()=>{
 const f=fixture(), b=f.get('barge');
 f.bus.emit('save:loaded',{});f.pose(b,worldPoint(C.berth.local));f.step(180);
 assert.equal(f.s.npcJobs.ceresNinthMouth.rescue,null,'canonical-looking tags without world owner are not adoption');
 f.dispose();
 const g=fixture();const n=g.s.entityList.length;g.s.world.records.byId[C.id+':barge']=null;
 g.s.npcJobs.ceresNinthMouth.objects.barge.spawned=false;
 const old=g.get('barge');g.s.entities.delete(old.id);g.s.entityList.splice(g.s.entityList.indexOf(old),1);
 g.bus.emit('sector:enter',{});g.step(120);
 assert.equal(g.s.entityList.length,n-1);assert.equal(g.s.npcJobs.ceresNinthMouth.objects.barge.spawned,true);g.dispose();
});
