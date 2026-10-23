// Journal arithmetic only. Real native contact/save/damage proofs live in pq146-save-roundtrip.
import test from 'node:test';
import assert from 'node:assert/strict';
import {bindStuntEvidence,unbindStuntEvidence,bodyLife,journalFor,observeAppliedImpulse,observeContact,resetStuntEvidence} from '../src/combat/stuntEvidence.js';
function fixture(){
  const body=(id,x)=>({id,type:'ship',team:id?1:0,alive:true,pos:{x,z:0},vel:{x:0,z:0},mass:10,radius:8,hull:100,hullMax:100,combatSpeed:95,data:{},physicsBody:{mass:10,dynamic:true}});
  const entities=[body(0,-100),body(1,0),body(2,40)];
  const state={playerId:0,tick:1,entities:new Map(entities.map(e=>[e.id,e])),entityList:entities};
  bindStuntEvidence(state);
  const [player,source,target]=entities;
  const root=observeAppliedImpulse(source,{x:0,z:0},{x:100,z:0},{actorId:player.id},1,'weapon_hit',state);
  const hit=(tick,before=40,after=60)=>{state.tick=tick;observeContact(source,state.entities.get(2),{beforeA:{x:100,z:0},beforeB:{x:before,z:0},afterA:{x:80,z:0},afterB:{x:after,z:0},normal:{x:1,z:0}},state);};
  hit(10,0,40);
  const carried=()=>journalFor(state).bodies.get(bodyLife(state.entities.get(2),state).id);
  return {state,source,target,root,hit,carried,close:()=>unbindStuntEvidence(state)};
}
test('separated same-pair receipts retain the first player push, not a fabricated natural baseline',()=>{
 const f=fixture();try{f.hit(13);assert.deepEqual(f.carried().origin.before,{x:0,z:0});assert.equal(f.carried().origin.tick,10);assert.deepEqual(f.carried().useful,{x:60,z:0});assert.equal(f.carried().edges,1);assert.equal(f.root.nodes.filter(n=>n.kind==='contact').length,2,'separate contact nodes remain separate');f.hit(14,60,70);assert.equal(f.carried().useful.x,70);}finally{f.close();}
});
for(const [name,delta,observed] of [['observed independent thrust',20,true],['unobserved independent thrust',20,false],['opposing force',-20,true],['outside native matching tolerance',0.00101,false]])test(`${name} stays in the new counterfactual`,()=>{
 const f=fixture();try{if(observed){f.state.tick=12;observeAppliedImpulse(f.target,{x:40,z:0},{x:40+delta,z:0},{actorId:9},12,'impulse',f.state);}f.hit(13,40+delta,60+delta);assert.equal(f.carried().origin.tick,13);assert.equal(f.carried().origin.before.x,40+delta);assert.equal(f.carried().useful.x,20);}finally{f.close();}
});
test('native float matching tolerance does not discard an otherwise unchanged transfer',()=>{
 const f=fixture();try{f.hit(13,40.0005,60.0005);assert.equal(f.carried().origin.tick,10);}finally{f.close();}
});
test('a different root on the target cannot inherit the old transfer baseline',()=>{
 const f=fixture();try{f.state.tick=12;observeAppliedImpulse(f.target,{x:40,z:0},{x:60,z:0},{actorId:0},12,'weapon_hit',f.state);f.hit(13,60,80);assert.equal(f.carried().rootId,f.root.id);assert.equal(f.carried().origin.tick,13);assert.equal(f.carried().origin.before.x,60);}finally{f.close();}
});
test('a recycled body ID cannot inherit a former life transfer',()=>{
 const f=fixture();try{f.state.entities.set(2,{...f.target,pos:{...f.target.pos},vel:{x:40,z:0}});f.hit(13);assert.equal(f.carried().origin.tick,13);assert.equal(f.carried().origin.before.x,40);}finally{f.close();}
});
test('reset and expired roots cannot revive transfer ownership',()=>{
 for(const reset of [false,true]){const f=fixture();try{if(reset)resetStuntEvidence(f.state);f.hit(600);assert.equal(journalFor(f.state).contacts.get("600|number:1|number:2").paths.length,0);if(reset)assert.equal(f.carried(),undefined);else assert.equal(f.carried().lastTick,10);}finally{f.close();}}
});

test('a signed decelerating re-contact subtracts rather than refreshes useful motion',()=>{
 const f=fixture();try{f.hit(13,40,20);assert.equal(f.carried().origin.tick,10);assert.equal(f.carried().useful.x,20);}finally{f.close();}
});
test('a duplicate same-tick receipt does not accumulate an impulse twice',()=>{
 const f=fixture();try{f.hit(13);const once=structuredClone(f.carried());const nodes=f.root.nodes.length;f.hit(13);assert.deepEqual(f.carried(),once);assert.equal(f.root.nodes.length,nodes);}finally{f.close();}
});
test('a saturated source edge budget cannot transfer again',()=>{
 const f=fixture();try{journalFor(f.state).bodies.get(bodyLife(f.source,f.state).id).edges=4;f.hit(13);assert.equal(journalFor(f.state).contacts.get('13|number:1|number:2').paths.length,0);assert.equal(f.carried().lastTick,10);}finally{f.close();}
});
test('a same-root transfer through another body cannot reuse a different edge baseline',()=>{
 const f=fixture();try{
   const sibling={...f.target,id:3,pos:{x:20,z:0},vel:{x:0,z:0}};f.state.entities.set(3,sibling);f.state.tick=11;
   observeContact(f.source,sibling,{beforeA:{x:100,z:0},beforeB:{x:0,z:0},afterA:{x:80,z:0},afterB:{x:80,z:0},normal:{x:1,z:0}},f.state);
   f.target.pos.x=80;f.state.tick=13;observeContact(sibling,f.target,{beforeA:{x:80,z:0},beforeB:{x:40,z:0},afterA:{x:50,z:0},afterB:{x:60,z:0},normal:{x:1,z:0}},f.state);
   assert.equal(f.carried().rootId,f.root.id);assert.equal(f.carried().edges,2);assert.equal(f.carried().origin.tick,13);assert.equal(f.carried().origin.before.x,40);
 }finally{f.close();}
});
