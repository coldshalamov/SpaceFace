import test from 'node:test';
import assert from 'node:assert/strict';
import { installCeresNinthMouth, stepCeresNinthMouth, serializeCeresNinthMouth, restoreCeresNinthMouth, ceresNinthMouthStatus } from '../src/systems/ceresNinthMouth.js';
import { CERES_NINTH_MOUTH as C, worldPoint } from '../src/data/ceresNinthMouth.js';
import { captureEntityRecord } from '../src/world/worldRecords.js';
import { krollNextWorkScene, krollNextWorkCourse } from '../src/story/ceresArrivalStory.js';
import { BREAKWATER_SITE_LOCAL, BREAKWATER_SECTOR_ID } from '../src/features/breakwaterSpur/definition.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
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

test('Kroll offers next work only after original arrival; conversation is inert and explicit plot is bounded',()=>{
 const f=fixture();try {
 f.choose('story');assert.ok(!f.s.ceresNinthMouthOffer.choices.some(c=>c.id==='story:nextWork'));
 f.pose(f.get('barge'),worldPoint(C.berth.local));f.step(150);
 assert.equal(f.s.npcJobs.ceresNinthMouth.rescue.count,1);f.choose('story');
 const before=clone(f.s.npcJobs.ceresNinthMouth);const bodies=f.s.entityList.map(e=>e.id);
 f.choose('story:nextWork');assert.match(f.s.ceresNinthMouthOffer.detail,/Nessa Vale/);
 assert.equal(f.events.filter(e=>e[0]==='ui:setCourse').length,0);
 assert.equal(f.s.world.breakwaterSpur,undefined,'referral must not discover/commission the destination');
 f.choose('course:breakwater');const courses=f.events.filter(e=>e[0]==='ui:setCourse');assert.equal(courses.length,1);
 assert.deepEqual(courses[0][1],krollNextWorkCourse());assert.equal(courses[0][1].autopilot,false);
 assert.deepEqual(courses[0][1].pos,sectorLocalToGlobalForSector({x:BREAKWATER_SITE_LOCAL.x,z:BREAKWATER_SITE_LOCAL.z+90},BREAKWATER_SECTOR_ID));
 assert.deepEqual(f.s.entityList.map(e=>e.id),bodies);assert.deepEqual(f.s.npcJobs.ceresNinthMouth,before);
 assert.equal(f.events.some(e=>/cargo|credit|mission:completed/.test(e[0])),false);
 } finally {f.dispose();}
});
test('stale plot request cannot operate after departure, docking, changed life or receipt loss',()=>{
 for(const invalidate of [f=>{f.s.world.currentSectorId='sector_helios_prime';},f=>{f.s.ui.docked=true;},f=>{f.p.occupantGeneration++;},f=>{f.s.npcJobs.ceresNinthMouth.rescue=null;}]){
 const f=fixture();try{f.pose(f.get('barge'),worldPoint(C.berth.local));f.step(150);f.choose('story');f.choose('story:nextWork');
 const o=f.s.ceresNinthMouthOffer;invalidate(f);f.bus.emit('ceresNinthMouth:action',{action:'course:breakwater',offerId:o.id,playerLife:o.playerLife});
 assert.equal(f.events.filter(e=>e[0]==='ui:setCourse').length,0);
 }finally{f.dispose();}}
});
test('next-work account follows current Breakwater state without writing it',()=>{
 const states=[{}, {world:{breakwaterSpur:{phase:'restoring',sockets:{drive:{status:'seated'},drum:{status:'empty'}}}}},
 {world:{breakwaterSpur:{sockets:{drive:{status:'seated'},drum:{status:'seated'}}}}},
 {world:{breakwaterSpur:{commission:{status:'paid'},charter:'cooperative'}}},
 {world:{breakwaterSpur:{phase:'operating',commission:{status:'paid'},charter:'bonded',cartridges:{drive:{status:'lost'}}}}}];
 for(const [i,s] of states.entries()){const before=clone(s),scene=krollNextWorkScene(s);assert.deepEqual(s,before);
 assert.match(scene.detail, [/two sockets/,/work in progress/,/Both originals are seated/,/current freight and services/,/lost an original/][i]);}
});
test('owner Continue retains rescue and referral availability without auto-course or duplicated originals',()=>{
 const f=fixture();try{f.pose(f.get('barge'),worldPoint(C.berth.local));f.step(150);f.choose('story');f.choose('story:nextWork');
 const saved=serializeCeresNinthMouth(f.owner), count=f.s.entityList.length;
 for(const e of f.s.entityList.filter(e=>e.data.ninthMouthRole)){const r=captureEntityRecord(e);r.liveEntityId=e.id;f.s.world.records.byId[r.recordId]=r;}
 restoreCeresNinthMouth(f.owner,saved);f.bus.emit('save:loaded',{});f.step(30);f.choose('story');f.choose('story:nextWork');
 assert.equal(f.s.entityList.length,count);assert.equal(f.s.npcJobs.ceresNinthMouth.rescue.count,1);
 assert.equal(f.events.filter(e=>e[0]==='ui:setCourse').length,0);
 }finally{f.dispose();}
});

test('production world course owner plots actual Breakwater approach without engaging or travelling',async()=>{
 const {createSimulation}=await import('../src/core/sim.js');
 const {world}=await import('../src/systems/world.js');
 const sim=createSimulation({seed:47,systems:[{...world,update(){}}],updateOrder:[]});
 try{const s=sim.state;s.mode='flight';s.run.kind='adventure';s.world.currentSectorId=C.sectorId;s.ui.docked=false;
 const before=s.world.currentSectorId;const jumps=[];s.nav.route={targetSectorId:'sector_tethys_junction'};s.nav.autoTravel=true;
 for(const event of ['world:requestJump','nav:engageRoute'])sim.bus.on(event,p=>jumps.push(p));
 sim.bus.emit('ui:setCourse',krollNextWorkCourse());
 assert.deepEqual(s.nav.waypoint.pos,krollNextWorkCourse().pos);
 assert.equal(s.world.currentSectorId,before);assert.equal(s.nav.autopilot.active,false);assert.equal(s.nav.autoTravel,false);assert.equal(s.nav.route,null);assert.equal(jumps.length,0);
 }finally{sim.dispose();}
});
