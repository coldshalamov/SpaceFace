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

function link(f,e) {
 f.s.combat.attachments.byId.line={state:'active',ownerId:f.p.id,ownerGeneration:f.p.occupantGeneration,
   targetId:e.id,targetGeneration:e.occupantGeneration};f.step(20);
}
test('compact radio keeps original pickup and destination marks; attached original wins and focus survives release',()=>{
 const f=fixture(),lamp=f.get('lamp:0');
 f.choose('guide:lamp:0');f.choose('close');
 assert.equal(f.s.ceresNinthMouthOffer.guidance.role,'lamp:0');
 assert.ok(f.s.ceresNinthMouthOffer.serviceMarks.some(m=>m.id==='lamp:0'));
 assert.ok(f.s.ceresNinthMouthOffer.serviceMarks.some(m=>m.id==='source'));
 f.s.player={targetId:f.get('barge').id};link(f,lamp);
 assert.equal(f.s.ceresNinthMouthOffer.guidance.role,'lamp:0');
 assert.equal(f.s.ceresNinthMouthOffer.guidance.attached,true);
 assert.equal(f.s.ceresNinthMouthOffer.serviceMarks.length,1);
 f.s.combat.attachments.byId={};f.step(20);
 assert.equal(f.s.ceresNinthMouthOffer.guidance.role,'lamp:0');
 assert.equal(f.s.ceresNinthMouthOffer.guidance.attached,false);
 const saved=serializeCeresNinthMouth(f.owner);assert.equal(saved.guide,'lamp:0');
 restoreCeresNinthMouth(f.owner,{...saved,guide:'foreign'});assert.equal(f.s.npcJobs.ceresNinthMouth.guide,null);f.dispose();
});
test('decision identity stays stable across telemetry changes but readiness changes revoke it',()=>{
 const f=fixture(),lamp=f.get('lamp:0');f.choose('guide:lamp:0');f.choose('close');link(f,lamp);
 const offer=f.s.ceresNinthMouthOffer,id=offer.id;
 f.pose(lamp,{x:lamp.pos.x+4,z:lamp.pos.z},{x:.31,z:0});f.step(20);
 assert.equal(f.s.ceresNinthMouthOffer,offer);assert.equal(offer.id,id);
 assert.equal(offer.guidance.speed,.4);assert.ok(offer.serviceMarks[0].readout.includes('0.4'));
 const at=worldPoint(C.lamps[0].local);f.pose(lamp,at);f.pose(f.p,{x:at.x-50,z:at.z});f.step(20);
 assert.equal(f.s.ceresNinthMouthOffer.guidance.stage,'release');
 assert.notEqual(f.s.ceresNinthMouthOffer.id,id);
 assert.equal(f.s.ceresNinthMouthOffer.choices.find(c=>c.id==='seat:0').disabled,true);
 f.s.combat.attachments.byId={};f.step(20);
 assert.equal(f.s.ceresNinthMouthOffer.guidance.stage,'seat');
 assert.equal(f.s.ceresNinthMouthOffer.choices.find(c=>c.id==='seat:0').disabled,false);
 f.choose('seat:0');assert.equal(f.s.ceresNinthMouthOffer.guidance.stage,'seated');f.dispose();
});
test('unsafe speed/spin, other Line, stale native and foreign custody never advertise a ready seat',()=>{
 for(const change of [
  (f,e)=>f.pose(e,worldPoint(C.lamps[0].local),{x:1.01,z:0}),
  (f,e)=>{f.native.records.get(e.id).pose.spin=.21;},
  (f,e)=>{f.s.combat.attachments.byId.a={state:'active',ownerId:99,ownerGeneration:1,targetId:e.id,targetGeneration:e.occupantGeneration};},
  (f,e)=>{f.native.records.get(e.id).body.isEnabled=()=>false;},
  (f,e)=>{e.data.controlLease={owner:99};},
 ]) {
  const f=fixture(),e=f.get('lamp:0'),at=worldPoint(C.lamps[0].local);f.choose('guide:lamp:0');
  f.pose(e,at);f.pose(f.p,{x:at.x-50,z:at.z});change(f,e);f.step(20);
  assert.notEqual(f.s.ceresNinthMouthOffer.guidance?.stage,'seat');
  assert.equal(f.s.ceresNinthMouthOffer.choices.find(c=>c.id==='seat:0').disabled,true);f.dispose();
 }
});
test('receiving guidance is pending for two seconds and changes only after one committed arrival',()=>{
 const f=fixture(),b=f.get('barge');f.choose('guide:lamp:0');f.choose('guide:barge');f.pose(b,worldPoint(C.berth.local));f.step(20);
 assert.equal(f.s.ceresNinthMouthOffer.guidance.stage,'receiving');assert.equal(f.s.npcJobs.ceresNinthMouth.rescue,null);
 f.step(120);assert.equal(f.s.ceresNinthMouthOffer.guidance.stage,'received');
 assert.equal(f.events.filter(([n])=>n==='ceresNinthMouth:rescueCommitted').length,1);f.dispose();
});
test('live control hints use rebound keyboard, gamepad and touch action grammar',async()=>{
 const {ninthMouthControlHint}=await import('../src/ui/ceresNinthMouthPrompt.js');
 const {setGamepadPromptBindings}=await import('../src/ui/bindings.js');
 const state={settings:{controls:{bindings:{tether:['KeyJ'],brake:['KeyK']}}}};
 const guide={stage:'tow'};
 assert.match(ninthMouthControlHint(state,guide,'kbm'),/Tap J: attach\/release Line · K: brake/);
 state.settings.controls.bindings.tether=['KeyL'];assert.match(ninthMouthControlHint(state,guide,'kbm'),/Tap L/);
 setGamepadPromptBindings({massline:['alt'],brake:['cancel']});
 const pad=ninthMouthControlHint(state,guide,'gamepad');assert.match(pad,/Tap Y:.*B: brake/);
 assert.equal(ninthMouthControlHint(state,guide,'touch'),'Tap Line to attach/release · Use the brake control');
 assert.equal(ninthMouthControlHint(state,{stage:'seated'},'kbm'),'');setGamepadPromptBindings(null);
});

test('slow inertial course is a projection, never early Seat or receipt; changed course revokes it',()=>{
 const f=fixture(),e=f.get('lamp:0'),at=worldPoint(C.lamps[0].local);f.choose('guide:lamp:0');
 f.pose(e,{x:at.x-100,z:at.z},{x:.8,z:0});f.pose(f.p,{x:at.x-150,z:at.z});f.step(20);
 const g=f.s.ceresNinthMouthOffer.guidance;assert.equal(g.stage,'coast');assert.ok(g.coastEta>=115 && g.coastEta<=116);
 assert.equal(f.s.ceresNinthMouthOffer.choices.find(c=>c.id==='seat:0').disabled,true);
 assert.equal(e.data.ninthMouthInstalled,false);assert.equal(f.s.npcJobs.ceresNinthMouth.rescue,null);
 f.pose(e,{x:at.x-100,z:at.z},{x:.5,z:.5});f.step(20);
 assert.equal(f.s.ceresNinthMouthOffer.guidance.stage,'acquire');assert.equal(f.s.ceresNinthMouthOffer.guidance.coastEta,null);
 f.dispose();
});

test('temporary venue or mode interruption republishes a fresh reachable decision',()=>{
 for(const gate of ['venue','mode']) {
  const f=fixture();f.choose('guide:lamp:0');f.choose('close');const id=f.s.ceresNinthMouthOffer.id;
  if(gate==='venue')f.s.physicsVenue={active:true};else f.s.mode='menu';f.step(20);
  assert.equal(f.s.ceresNinthMouthOffer,null);
  if(gate==='venue')f.s.physicsVenue.active=false;else f.s.mode='flight';f.step(20);
  assert.ok(f.s.ceresNinthMouthOffer);assert.notEqual(f.s.ceresNinthMouthOffer.id,id);
  assert.equal(f.s.ceresNinthMouthOffer.guidance.role,'lamp:0');f.dispose();
 }
});

test('a fast released original teaches a counter-pull, without changing motion or promising readiness',()=>{
 const f=fixture(),e=f.get('lamp:0'),at=worldPoint(C.lamps[0].local);f.choose('guide:lamp:0');
 f.pose(e,{x:at.x-70,z:at.z-20},{x:8,z:2});f.pose(f.p,{x:at.x-100,z:at.z});
 const before=clone([e.pos,e.vel,e.rot,e.angVel]);f.step(20);
 const offer=f.s.ceresNinthMouthOffer;assert.equal(offer.guidance.stage,'intercept');
 assert.match(offer.guidance.instruction,/behind.*Reattach/);assert.ok(offer.serviceMarks.some(m=>m.label.includes('CATCH FROM BEHIND')));
 assert.equal(offer.choices.find(c=>c.id==='seat:0').disabled,true);assert.deepEqual([e.pos,e.vel,e.rot,e.angVel],before);
 f.pose(e,{x:at.x+20,z:at.z},{x:8,z:2});f.step(20);
 assert.match(f.s.ceresNinthMouthOffer.guidance.instruction,/miss the mark/);
 link(f,e);assert.notEqual(f.s.ceresNinthMouthOffer.guidance.stage,'intercept');assert.equal(f.s.ceresNinthMouthOffer.guidance.attached,true);f.dispose();
});
