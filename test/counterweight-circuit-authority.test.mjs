import test from 'node:test';
import assert from 'node:assert/strict';
import {COUNTERWEIGHT_EVENT_BY_ID as defs, GHOST_MAX_SAMPLES} from '../src/features/counterweightCircuit/definition.js';
import {createAttemptState, advanceAttempt} from '../src/features/counterweightCircuit/attempt.js';
import {applyResultToRecord, freshEventRecord, medalForCompletion} from '../src/features/counterweightCircuit/scoring.js';
import {createGhostRecorder, ghostPoseAt, normalizeGhost} from '../src/features/counterweightCircuit/ghost.js';

function frame(angle, {id='line1', taut=true, releases=[], gen=4, t=0}={}) {
  return {simTime:t,dt:.1,committed:true,playerId:1,playerPos:{x:0,z:0}, releases,
    lines:id ? [{id,aId:1,bId:7,taut}] : [], bodies:{
      load:{id:7,occupantGeneration:gen,alive:true,hull:80,hullMax:80,pos:{x:100*Math.cos(angle),z:100*Math.sin(angle)},vel:{x:0,z:0}},
      counterweight:{id:8,occupantGeneration:1,alive:true,hull:100,hullMax:100,pos:{x:0,z:0},vel:{x:0,z:0}},
    }};
}
function swingToRelease() {
 const d=defs.long_arm, s=createAttemptState(d,{attemptId:1}); let t=0;
 const step=(a,opt={})=>advanceAttempt(s,d,frame(a,{t:t+=.1,...opt}));
 step(0); step(0); for(let a=.2;a<=1.81;a+=.2) step(a);
 return {d,s,step};
}

test('swing uses net displacement while the same line is taut and cut is authenticated',()=>{
 const d=defs.long_arm, s=createAttemptState(d,{attemptId:1});let t=0;
 const step=(a,opt={})=>advanceAttempt(s,d,frame(a,{t:t+=.1,...opt}));
 step(0);step(0);for(let i=0;i<12;i++){step(.4);step(0);}
 assert.equal(s.legIndex,1); assert.ok(Math.abs(s.mem.sweepRad.load)<.001);
 step(.7,{taut:false});step(1.6,{taut:false});step(1.6);assert.equal(s.legIndex,1);
 step(1.7,{id:'different'});assert.equal(s.legIndex,0,'line replacement requires new attach');
 const broken=swingToRelease();assert.equal(broken.s.legIndex,2);
 broken.step(1.8,{id:null});assert.equal(broken.s.legIndex,0,'break is not a player release');
 const cut=swingToRelease();cut.step(1.8,{id:null,releases:[{id:'other',role:'load'}]});assert.equal(cut.s.legIndex,0);
 const valid=swingToRelease();valid.step(1.8,{id:null,releases:[{id:'line1',role:'load'}]});assert.equal(valid.s.legIndex,3);
 const replaced=swingToRelease();replaced.step(1.8,{id:null,gen:5,releases:[{id:'line1',role:'load'}]});assert.equal(replaced.s.reason,'identity_changed');
});

test('split medal uses worse measured original and payment is only proposed',()=>{
 const d=defs.split_decision, attempt={phase:'complete',eventId:d.id,attemptId:42,elapsedS:30,finishedAt:50,practice:false,mem:{arrivalSpeed:2.3}};
 assert.equal(medalForCompletion(d,attempt,{load_a:1,load_b:.96}).medal,'gold');
 assert.equal(medalForCompletion(d,attempt,{load_a:1,load_b:.94}).medal,'silver');
 assert.equal(medalForCompletion(d,attempt,{load_a:.79,load_b:1}).medal,'bronze');
 assert.equal(medalForCompletion(d,attempt,{load_a:1}).reason,'condition_unconfirmed');
 const r=freshEventRecord(),out=applyResultToRecord(r,d,attempt,{load_a:1,load_b:.79});
 assert.equal(out.result.reason,'handling_damage');assert.equal(out.result.reasonDetail,.79);
 assert.equal(out.result.arrivalSpeed,2.3);assert.equal(r.paid,false);
 assert.equal(out.rewardKey,'counterweight:first-completion:split_decision');
 assert.equal(out.rewardRequested,true);assert.equal(applyResultToRecord(r,d,attempt,{load_a:1,load_b:1}).rewardRequested,undefined);
});

test('late ghost uses relative time; online compaction preserves end and semantic marks',()=>{
 const g=createGhostRecorder('long_arm',{x:0,z:0});
 for(let i=0;i<12000;i++){
   const t=2000+i/15;g.sample(t,{x:i,z:0},0);
   if(i===100)g.mark('attach',{x:i,z:0},0,t,'load');
   if(i===6000)g.mark('release',{x:i,z:0},0,t,'load');
 }
 const end=12000, tape=g.end({x:end,z:0},0,2000+end/15);
 assert.ok(tape);assert.ok(tape.samples.length/4<=GHOST_MAX_SAMPLES);
 assert.equal(tape.samples[0],0);assert.equal(tape.samples.at(-3),end*100);
 for(const m of tape.marks) assert.equal(tape.samples[m.i*4+1],m.kind==='attach'?10000:600000);
 assert.ok(ghostPoseAt(tape,0));assert.equal(ghostPoseAt(tape,0).x,0);
 assert.equal(ghostPoseAt(tape,tape.durationS).x,end);assert.ok(normalizeGhost(tape,'long_arm'));
});

test('ghost refuses semantic key overflow instead of dropping the end',()=>{
 const g=createGhostRecorder('long_arm',{x:0,z:0});g.sample(10,{x:0,z:0},0);
 for(let i=0;i<257;i++)g.mark('attach',{x:i,z:0},0,10+i/1000,`role${i}`);
 assert.equal(g.end({x:999,z:0},0,11),null);
});

test('gate uses the actual segment-plane crossing, not the segment midpoint',()=>{
 const d={id:'gate_check',bodies:[],constraints:[],legs:[{kind:'transit',role:'load'}],gate:{pos:{x:0,z:0},axis:{x:1,z:0},halfWidth:30}};
 const obs=(prev,pos)=>({simTime:1,dt:.1,committed:true,lines:[],bodies:{load:{id:7,alive:true,pos,prevPos:prev,vel:{x:1,z:1}}}});
 const outside=createAttemptState(d);advanceAttempt(outside,d,obs({x:-100,z:-1},{x:100,z:9}));
 assert.equal(outside.phase,'running','midpoint lies inside, actual crossing is outside');
 const inside=createAttemptState(d);advanceAttempt(inside,d,obs({x:-40,z:-1},{x:160,z:9}));
 assert.equal(inside.phase,'complete','actual crossing is inside despite outside midpoint');
});

test('seating requires current occupant-bound physical receiver support',()=>{
 const d=defs.soft_berth, s=createAttemptState(d,{attemptId:2});
 const base={simTime:1,dt:2,committed:true,playerId:1,playerPos:{x:0,z:0},lines:[{id:'l',aId:1,bId:7,taut:true}],bodies:{
  load:{id:7,occupantGeneration:3,alive:true,hull:80,hullMax:80,pos:{x:0,z:0},vel:{x:0,z:0}},
  cradle:{id:9,occupantGeneration:2,alive:true,hull:100,hullMax:100,pos:{x:0,z:0},vel:{x:0,z:0}}}};
 advanceAttempt(s,d,base);assert.equal(s.legIndex,1);
 advanceAttempt(s,d,{...base,simTime:2});assert.equal(s.phase,'running','proximity alone cannot complete');
 const w={bodyId:7,bodyGeneration:2,receiverId:9,receiverGeneration:2,stable:true,relativeSpeed:2.5};
 advanceAttempt(s,d,{...base,simTime:3,receivers:{'load:cradle':w}});assert.equal(s.phase,'running','stale generation refused');
 advanceAttempt(s,d,{...base,simTime:4,receivers:{'load:cradle':{...w,bodyGeneration:3}}});
 assert.equal(s.phase,'complete');assert.equal(s.mem.arrivalSpeed,2.5);assert.equal(s.mem.conditions.load,1);
});

test('baffle gate requires the live attachment',()=>{
 const d={id:'baffle',bodies:[],constraints:[],legs:[{kind:'transit',role:'load',gate:'gap',attached:true}]};
 const gate={pos:{x:0,z:0},axis:{x:0,z:1},halfWidth:20};
 const o={simTime:1,dt:.1,committed:true,gates:{gap:gate},lines:[],bodies:{load:{id:7,alive:true,pos:{x:1,z:0},prevPos:{x:-1,z:0},vel:{x:2,z:0}}}};
 const s=createAttemptState(d);advanceAttempt(s,d,o);assert.equal(s.phase,'running');
 advanceAttempt(s,d,{...o,simTime:2,lines:[{id:'l',aId:1,bId:7}]});assert.equal(s.phase,'complete');
});
