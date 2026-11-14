import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateScene, placeBody } from './cinderglass-job-fixture.mjs';
import { cinderglassJobStepConvoy } from '../src/features/cinderglassJob/convoy.js';
import { latchWorld, cinderglassJobServiceGate } from '../src/features/cinderglassJob/interception.js';
import { CINDERGLASS_JOB_POINTS as P } from '../src/features/cinderglassJob/definition.js';
import { createCinderglassJobPromptSystem } from '../src/features/cinderglassJob/presentation.js';
async function ready(options={}){
 const t=await candidateScene(options);await t.accept();
 const c=t.body('carrierId'),d={x:P.pullOff.x-c.pos.x,z:P.pullOff.z-c.pos.z};
 for(const key of ['carrierId','podId','latchId']){const e=t.body(key);placeBody(t,e,{x:e.pos.x+d.x,z:e.pos.z+d.z});}
 const job=t.state.npcJobs.byId[t.cg().entities.carrierJobId].job;job.routeIndex=1;job.phase='transit';job.progress=0;
 t.cg().scanDone=true;t.cg().phase='decide';cinderglassJobStepConvoy(t.sys,t.state);
 placeBody(t,t.player,{x:P.pullOff.x-160,z:P.pullOff.z+40});
 return t;
}
const choice=t=>{t.sys._publishApproachPrompts();return t.cg().approachPrompt?.choices.find(c=>c.id==='serviceStart');};
test('nearby scanned inspection explains real range gate visibly without enabling service',async()=>{
 const t=await ready();try{
 assert.equal(cinderglassJobServiceGate(t.sys,t.state).reason,'range');
 const c=choice(t);assert.equal(c.disabled,true);assert.match(c.label,/closer/);assert.match(t.cg().approachPrompt.detail,/external latch/);
 const before=t.cg().custody;assert.equal(t.action('serviceStart').ok,false);assert.equal(t.cg().custody,before);assert.equal(t.cg().serviceActive,false);
 }finally{t.sim.dispose();}
});
test('guidance disappears for unscanned, departed, far and settled work',async()=>{
 for(const kind of ['unscanned','departed','far','settled']){
 const t=await ready();try{
 if(kind==='unscanned')t.cg().scanDone=false;
 if(kind==='departed')t.cg().atLayby=false,t.cg().laybyHoldActive=false;
 if(kind==='far')placeBody(t,t.player,{x:P.pullOff.x-400,z:P.pullOff.z});
 if(kind==='settled')t.cg().outcome={id:'returned_tala'};
 assert.equal(choice(t),undefined,kind);
 }finally{t.sim.dispose();}}
});
test('leave stays dismissed for unchanged condition and returns when physical condition changes',async()=>{
 const t=await ready();try{
 assert.equal(choice(t).disabled,true);assert.equal(t.action('leave').ok,true);assert.equal(choice(t),undefined);
 const l=latchWorld(t.sys,t.state);placeBody(t,t.player,{x:l.x+20,z:l.z},{x:8,z:0});
 assert.equal(cinderglassJobServiceGate(t.sys,t.state).reason,'too_fast');
 assert.match(choice(t).label,/drift/);assert.equal(choice(t).disabled,true);
 }finally{t.sim.dispose();}
});
test('browser adapter refuses disabled guidance without emitting an action',async()=>{
 const t=await ready();let card,calls=0;const deck={hasDecision:()=>false,offerDecision:s=>(card=s,true),resolveDecision(){}};
 const p=createCinderglassJobPromptSystem();try{
 choice(t);p.init({state:t.state,bus:t.bus,deck});p.servicePrompt(t.cg().approachPrompt);
 t.bus.on('cinderglassJob:action',()=>calls++);
 assert.equal(card.onChoose('serviceStart'),false);assert.equal(calls,0);assert.equal(t.cg().serviceActive,false);
 }finally{p.destroy();t.sim.dispose();}
});

test('watched approach explains sightlines without revealing witness identity or inviting refused negotiation',async()=>{
 const t=await ready({withLaw:true});try{
 const l=latchWorld(t.sys,t.state);placeBody(t,t.player,{x:l.x+20,z:l.z});
 t.sim.spawn({type:'ship',pos:{x:l.x+20,z:l.z+45},vel:{x:0,z:0},radius:2,collides:true,hull:100,hullMax:100,data:{lawWitness:true,displayName:'Fixture witness'}});
 t.step(2);
 assert.equal(cinderglassJobServiceGate(t.sys,t.state).reason,'watched');
 t.cg().suspicion=3;
 const c=choice(t);assert.equal(c.disabled,true);assert.match(c.label,/sightlines/);
 assert.doesNotMatch(c.reason,/Oren|Kestrel Nine|negotiate/);assert.match(t.cg().approachPrompt.detail,/does not guarantee a gap/);
 assert.match(t.cg().approachPrompt.detail,/not releasing/);assert.doesNotMatch(t.cg().approachPrompt.detail,/tell me your terms/);
 assert.equal(t.action('serviceStart').ok,false);assert.equal(t.cg().serviceActive,false);
 }finally{t.sim.dispose();}
});
test('occluded access explains repositioning rather than offering an actionable service',async()=>{
 const t=await ready();try{
 const l=latchWorld(t.sys,t.state);placeBody(t,t.player,{x:l.x+40,z:l.z});
 t.sim.spawn({type:'station',pos:{x:l.x+20,z:l.z},vel:{x:0,z:0},radius:8,collides:true,hull:100,hullMax:100});
 assert.equal(cinderglassJobServiceGate(t.sys,t.state).reason,'obstructed');
 const c=choice(t);assert.equal(c.disabled,true);assert.match(c.label,/clear approach/);assert.match(t.cg().approachPrompt.detail,/solid body/);
 assert.equal(t.action('serviceStart').ok,false);
 }finally{t.sim.dispose();}
});
