// Manual, opt-in native integration probe. Requires an actual damaged save envelope.
// Run from the repository root with RETURN_ENVELOPE and PROBE_OUTPUT set.
// Relocated observer and supplied physical cursor projection are diagnostic setup,
// NOT ordinary flight arrival, renderer pointer projection, or live visual acceptance.
// No attachment, targetId, hull, cargo, action packet or repair amount is injected.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {anvilReceiverFixture,relocateAnvilObserver,receiverContactDepth} from './anvil-receiver-native.mjs';
import {domKeyEvent} from '../../src/systems/input.js';
import {ANVIL_WORK} from '../../src/systems/anvilWork.js';
assert.ok(process.env.RETURN_ENVELOPE && process.env.PROBE_OUTPUT, 'Set RETURN_ENVELOPE to a real damaged save and PROBE_OUTPUT to an evidence path');
const f=await anvilReceiverFixture({envelope:JSON.parse(fs.readFileSync(process.env.RETURN_ENVELOPE,'utf8'))});
const out={sourceTree:process.env.PUBLIC_TREE,kind:'production normalized keyboard events in native saved-world fixture; relocated setup and supplied sim-lane pointer projection, not live camera or ordinary arrival',events:[],rows:[]};
const input=f.runtime.getSystem('input');assert.ok(input);
out.contacts=[];out.nativeTicks=0;const nativeStep=f.step.bind(f);
f.step=(n=1)=>{for(let i=0;i<n;i++){nativeStep();for(const role of ['collector','receiver']){const e=f.actor(role);if(!e)continue;const view=receiverContactDepth(f.physics,e);if(view.admitted)out.nativeTicks++;for(const c of view.contacts||[]){if(c.distance<0||c.impulse>0)out.contacts.push({time:f.state.simTime,role,targetId:c.targetId,distance:c.distance,impulse:c.impulse,hull:e.hull});const protectedPair=c.targetId===f.state.playerId||['collector','receiver'].some(r=>f.actor(r)?.id===c.targetId);assert.ok(!protectedPair||c.distance>=-0.05,'player/original pair penetration');}}}};
for(const name of ['tether:latched','tether:latchDenied','tether:cut'])f.runtime.bus.on(name,p=>out.events.push({name,time:f.state.simTime,p:structuredClone(p)}));
const key=(code,pressed)=>{domKeyEvent(input,{code,pressed,blocked:false,repeat:false});out.events.push({name:'normalized-key',code,pressed,time:f.state.simTime});};
const row=label=>{const c=f.actor('collector');out.rows.push({label,time:f.state.simTime,hull:c?.hull,recordId:c?.data.worldRecordId,phase:c?.data.itinerary.phase,serviceRequired:c?.data.itinerary.serviceRequired,playerPos:{...f.state.entities.get(f.state.playerId).pos},collectorPos:{...c?.pos},actions:structuredClone(f.state.input.actions),receipt:structuredClone(f.state.masslineAcquisition),tether:structuredClone(f.state.player.tether)});};
try{
 const initialCollector = f.actor('collector');
 assert.ok(initialCollector && initialCollector.alive === true && initialCollector.hull > 0 && initialCollector.hull < initialCollector.hullMax * ANVIL_WORK.serviceReleaseHull, 'checkpoint must contain the living injured original below service release hull');
 assert.ok(!initialCollector.data.jobId, 'checkpoint must leave original movement unclaimed');
 for(let i=0;i<60*50;i++){const c=f.actor('collector');if(i%120===0)relocateAnvilObserver(f,c,'input-service-setup');f.step();if(c.data.itinerary.phase==='service_hold'&&Math.hypot(c.vel.x,c.vel.z)<1&&Math.hypot(c.pos.x-c.data.itinerary.center.x-2980,c.pos.z-c.data.itinerary.center.z-160)<25)break;}
 const c=f.actor('collector');assert.equal(c.data.itinerary.phase,'service_hold');assert.ok(Math.hypot(c.pos.x-c.data.itinerary.center.x-2980,c.pos.z-c.data.itinerary.center.z-160)<25,'physical exterior layby reached');
 relocateAnvilObserver(f,c,'input-service-start');f.step(3);
 assert.equal(Object.values(f.state.combat.attachments.byId).filter(a=>a.state==='active'&&a.ownerId===f.state.playerId).length,0,'no seeded player attachment');row('before-cold-press');
 if(f.state.input.autoFire){key('KeyG',true);f.step();key('KeyG',false);f.step();}
 input.ingestLaneDomEvent({type:'mousemove',clientX:320,clientY:240,movementX:1,movementY:0});
 input.ingestLaneDomEvent({type:'cursorProjection',x:c.pos.x,z:c.pos.z});
 f.step(2);row('deliberate-projected-pointer');
 assert.equal(f.state.masslineAcquisition?.selected?.targetId,c.id,'actual projected-point scoring must preview collector before press');
 key('Digit0',true);key('KeyF',true);f.step();row('cold-press');key('KeyF',false);f.step(2);row('cold-release');
 const latched=out.events.find(e=>e.name==='tether:latched');assert.ok(latched,'cold production key must acquire without attachment API');assert.equal(latched.p.targetId,c.id,'standing receipt must acquire original collector');
 const originalRecord=c.data.worldRecordId;const initialRest=f.state.player.tether.restLength;const initialHull=c.hull;
 key('KeyF',true);f.step(12);key('BracketLeft',true);f.step(15);row('real-reel');
 assert.ok(f.state.player.tether.restLength<initialRest,'mapped reel input actually shortens line');
 key('BracketLeft',false);key('KeyF',false);f.step(30);row('long-release');assert.equal(f.state.player.tether.active,true,'long hold release does not cut');
 for(let i=0;i<60*10&&c.data.itinerary.serviceRequired;i++)f.step();row('repaired-release');
 assert.equal(f.actor('collector'),c,'release must belong to the current original');assert.equal(c.alive,true);
 assert.ok(c.hull>initialHull&&c.hull>=c.hullMax*ANVIL_WORK.serviceReleaseHull,'existing owner heals to real service threshold');assert.equal(c.data.itinerary.serviceRequired,false);assert.equal(c.data.worldRecordId,originalRecord);
 key('KeyF',true);f.step(2);key('KeyF',false);f.step(2);row('short-tap-cut');assert.equal(f.state.player.tether.active,false,'fresh short tap cuts');const cutHull=c.hull;
 f.step(60);row('after-cut');assert.equal(f.actor('collector'),c,'cut must retain the current original');assert.equal(c.alive,true);assert.equal(c.hull,cutHull,'cut stops repair');
 key('Digit0',false);const releasePos={...c.pos};for(let i=0;i<60*90;i++){if(i%120===0)relocateAnvilObserver(f,c,'input-repaired-reopened-observation');f.step();if(c.data.itinerary.phase==='outbound'&&Math.hypot(c.pos.x-releasePos.x,c.pos.z-releasePos.z)>200)break;}
 row('reopened');assert.equal(f.actor('collector'),c,'reopened worker must be the current original');assert.equal(c.alive,true);assert.equal(c.data.itinerary.phase,'outbound');assert.ok(Math.hypot(c.pos.x-releasePos.x,c.pos.z-releasePos.z)>200,'same repaired worker leaves after real cut');out.ok=true;
}catch(error){out.error={message:error.message,stack:error.stack};throw error;}finally{fs.writeFileSync(process.env.PROBE_OUTPUT,JSON.stringify(out,null,2));fs.writeFileSync(process.env.PROBE_OUTPUT+'.save.json',JSON.stringify(f.runtime.getSystem('save').serialize('service-input-terminal')));f.close();}
