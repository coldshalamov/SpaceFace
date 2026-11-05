import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ActionVfx, ACTION_VFX_EVENTS } from '../src/render/actionVfx.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';

function fixture() {
 const attacker={id:2,occupantGeneration:7,type:'ship',alive:true,pos:{x:20,z:30},vel:{x:0,z:0},rot:1,radius:10,data:{}};
 const player={id:1,occupantGeneration:3,type:'ship',alive:true,pos:{x:250,z:30},vel:{x:0,z:0},rot:0,radius:8,data:{}};
 const state={tick:60,simTime:1,playerId:1,entities:new Map([[1,player],[2,attacker]]),settings:{video:{}}};
 const cue={entityId:2,sourceGeneration:7,targetId:1,targetGeneration:3,doctrineId:'interceptor_flyby',phase:'engine_flare',kind:'engine_flare',
  tick:60,durationTicks:30,attackLine:{origin:{x:20,z:30},heading:.25,dir:{x:Math.cos(.25),z:Math.sin(.25)},range:480,halfWidth:32},
  aimCommit:{bearing:.25,capRad:.2,untilTick:330}};
 return {state,attacker,player,cue};
}
function lane(owner) { const p=owner.batch.attributes[1]; for(let i=0;i<owner.batch.count;i++)if(p.getX(i)===7)return i; return -1; }

test('committed cue produces an attached wedge covering the announced angular cap',()=>{
 const {state,attacker,cue}=fixture(), out=new ActionVfx(new THREE.Scene());
 try {
  assert.equal(out.emit('ai:telegraph',cue,state),true); state.tick=66;state.simTime=1.1;out.update(state);
  let i=lane(out); assert.ok(i>=0,'real pooled geometry contains an attack lane');
  const o=out.batch.attributes[0],p=out.batch.attributes[1],s=out.batch.attributes[2];
  assert.ok(Math.abs(o.getX(i)-20)<1e-5 && Math.abs(o.getZ(i)-30)<1e-5);
  assert.ok(Math.abs(o.getW(i)-.25)<1e-5); assert.ok(Math.abs(p.getZ(i)-480)<1e-5);
  assert.ok(Math.abs(s.getX(i)-480*Math.tan(.2))<1e-3,'wedge reaches both allowed angular edges');
  attacker.pos={x:80,z:-15}; attacker.rot=2; state.tick=70;state.simTime=70/60;out.update(state);
  i=lane(out); assert.ok(i>=0); assert.ok(Math.abs(o.getX(i)-80)<1e-4 && Math.abs(o.getZ(i)+15)<1e-4);
  assert.ok(Math.abs(o.getW(i)-.25)<1e-5,'translation follows source; heading never follows a later hull turn');
 } finally {out.dispose();}
});

test('phase cancellation, expiry, and actor generation retire only the intended lane',()=>{
 const {state,attacker,cue}=fixture(), out=new ActionVfx(new THREE.Scene());
 try {
  assert.ok(ACTION_VFX_EVENTS.includes('ai:doctrinePhase'));
  out.emit('ai:telegraph',cue,state); state.tick=66;state.simTime=1.1;out.update(state); assert.ok(lane(out)>=0);
  out.emit('ai:doctrinePhase',{entityId:2,sourceGeneration:7,targetId:1,targetGeneration:3,doctrineId:'interceptor_flyby',phase:'strike',tick:90,aimCommit:cue.aimCommit},state);
  out.update(state); assert.ok(lane(out)>=0,'the live strike keeps its announced lane');
  out.emit('ai:doctrinePhase',{entityId:2,sourceGeneration:7,doctrineId:'interceptor_flyby',phase:'extend',tick:100,aimCommit:null},state);
  out.update(state); assert.equal(lane(out),-1,'egress cancels the lane');
  state.tick=120;state.simTime=2; const next={...cue,tick:120,aimCommit:{...cue.aimCommit,untilTick:150}};
  out.emit('ai:telegraph',next,state); state.tick=121;state.simTime=121/60;out.update(state); assert.ok(lane(out)>=0);
  out.emit('ai:doctrinePhase',{entityId:2,sourceGeneration:7,doctrineId:'interceptor_flyby',phase:'extend',tick:100,aimCommit:null},state);
  out.update(state); assert.ok(lane(out)>=0,'a delayed old phase cannot cancel a newer cue');
  state.tick=151;state.simTime=151/60;out.update(state);assert.equal(lane(out),-1,'deadline retires the wedge');
  state.tick=160;state.simTime=160/60;out.emit('ai:telegraph',{...next,tick:160,aimCommit:{...cue.aimCommit,untilTick:200}},state);
  attacker.occupantGeneration=8;state.tick=161;state.simTime=161/60;out.update(state);assert.equal(lane(out),-1,'a recycled shooter cannot retain the old lane');
 } finally {out.dispose();}
});

test('unrelated phase events do not allocate visuals; reduced-motion warning remains bounded and visible',()=>{
 const {state,cue}=fixture(),out=new ActionVfx(new THREE.Scene());
 try {
  assert.equal(out.emit('ai:doctrinePhase',{entityId:2,doctrineId:'mine_layer_wake',phase:'idle',tick:60},state),false);
  assert.equal(out.live,0);
  state.settings.video.motionReduce=true;state.settings.video.flashReduce=true;
  out.emit('ai:telegraph',cue,state);state.tick=66;state.simTime=1.1;out.update(state);
  const i=lane(out);assert.ok(i>=0); assert.ok(out.batch.attributes[3].getW(i)>0);
  assert.ok(out.batch.attributes.every(a=>a.array.every(Number.isFinite)));
 } finally {out.dispose();}
});

test('real tactical decision receipts cancel the visible lane once on living target sensor loss',()=>{
 const {state,attacker,player}=fixture(),out=new ActionVfx(new THREE.Scene());
 const ids=[2,3,4,5,6],events=[];
 state.meta={seed:47};state.player={heat:0};state.combat={trace:{events:[]}};
 const activity={kind:'attack_run',reason:'lane_fixture',anchor:{x:0,z:0},leashRadius:2600,preferredRange:180,startedTick:0};
 for(const id of ids){const a=id===2?attacker:{id,type:'ship',alive:true,team:1,pos:{x:0,z:id*12},vel:{x:0,z:0},rot:0,radius:12};
  a.team=1;a.data={ai:{combatDoctrineId:id===2?'interceptor_flyby':null,activity,roe:'weapons_free'},intent:{},weapons:[{projSpeed:420}]};state.entities.set(id,a);}
 player.team=2;player.pos={x:190,z:0};
 let hidden=false;
 const tactical=createTacticalAISystem({seed:47,config:{trace:{enabled:false}},
  sensors:{frameFor(id,tick){return {tick,self:{id,team:1,pos:state.entities.get(id).pos,vel:{x:0,z:0},rot:0,radius:12,hullFraction:1,energyFraction:1,heatFraction:0,disabled:false,tethered:false,capabilities:['drive','sensor','weapon','ranged'],subsystemFractions:{},activity,roe:'weapons_free',combatDoctrineId:id===2?'interceptor_flyby':null},contacts:hidden&&id===2?[]:[{id:1,kind:'ship',team:2,classification:'live_hostile',pos:player.pos,vel:player.vel,radius:12,confidence:1,threat:.9,hostile:true,alive:true,valid:true,visible:true,tags:['armed']}],events:[]};}},
  roster:{listSquads(){return [{id:'lane_fixture',doctrine:'scavenger',faction:'fixture',formation:'wedge',members:ids.map(id=>({id,capabilities:id===2?['drive','sensor','weapon']:['drive','sensor','weapon','ranged'],combatDoctrineId:id===2?'interceptor_flyby':null}))}];}},
  maneuver:{request(){return true;}},actionPortFactory:()=>({list:()=>[{id:'action_burst',tags:['attack'],range:700,preferredRange:220,targetKinds:['ship']}],canStart:()=>({ok:true}),start:()=>({}),status:()=> 'running',interrupt:()=>true})});
 const bus={emit(name,p){events.push({name,p});out.emit(name,p,state);}};
 try{
  tactical.init({state,bus,helpers:{}});state.tick=0;state.simTime=0;tactical.update(1/60,state);
  const sent=events.find(e=>e.name==='ai:telegraph'&&e.p.entityId===2);assert.ok(sent,'production decision emits a cue');
  assert.equal(sent.p.sourceGeneration,7);assert.equal(sent.p.targetGeneration,3);assert.ok(sent.p.aimCommit.capRad>0);
  state.tick=1;state.simTime=1/60;out.update(state);assert.ok(lane(out)>=0,'actual cue feeds pooled geometry');
  hidden=true;
  for(let tick=1;tick<=8;tick++){state.tick=tick;state.simTime=tick/60;tactical.update(1/60,state);out.update(state);}
  const canceled=events.filter(e=>e.name==='ai:doctrinePhase'&&e.p.entityId===2&&e.p.phase==='cancelled');
  assert.equal(canceled.length,1,'sensor loss emits one cancellation, not repeated targetless receipts');
  assert.equal(player.alive,true);assert.equal(lane(out),-1,'living unseen target no longer has a warned lane');
 }finally{out.dispose();}
});

test('a shooter-cap-held attacker paints no committed lane; its release still warns in the same cue',()=>{
 const {state,attacker,player}=fixture(),out=new ActionVfx(new THREE.Scene());
 const ids=[2,3,4,5,6],events=[];
 state.meta={seed:47};state.player={heat:0};state.combat={trace:{events:[]}};
 const activity={kind:'attack_run',reason:'lane_fixture',anchor:{x:0,z:0},leashRadius:2600,preferredRange:180,startedTick:0};
 for(const id of ids){const a=id===2?attacker:{id,type:'ship',alive:true,team:1,pos:{x:0,z:id*12},vel:{x:0,z:0},rot:0,radius:12};
  a.team=1;a.data={ai:{combatDoctrineId:id===2?'interceptor_flyby':null,activity,roe:'weapons_free'},intent:{},weapons:[{projSpeed:420}]};state.entities.set(id,a);}
 player.team=2;player.pos={x:190,z:0};
 attacker.data.ai.swarmFireHoldUntil=10;
 const tactical=createTacticalAISystem({seed:47,config:{trace:{enabled:false}},
  sensors:{frameFor(id,tick){return {tick,self:{id,team:1,pos:state.entities.get(id).pos,vel:{x:0,z:0},rot:0,radius:12,hullFraction:1,energyFraction:1,heatFraction:0,disabled:false,tethered:false,capabilities:['drive','sensor','weapon','ranged'],subsystemFractions:{},activity,roe:'weapons_free',combatDoctrineId:id===2?'interceptor_flyby':null},contacts:[{id:1,kind:'ship',team:2,classification:'live_hostile',pos:player.pos,vel:player.vel,radius:12,confidence:1,threat:.9,hostile:true,alive:true,valid:true,visible:true,tags:['armed']}],events:[]};}},
  roster:{listSquads(){return [{id:'lane_fixture',doctrine:'scavenger',faction:'fixture',formation:'wedge',members:ids.map(id=>({id,capabilities:id===2?['drive','sensor','weapon']:['drive','sensor','weapon','ranged'],combatDoctrineId:id===2?'interceptor_flyby':null}))}];}},
  maneuver:{request(){return true;}},actionPortFactory:()=>({list:()=>[{id:'action_burst',tags:['attack'],range:700,preferredRange:220,targetKinds:['ship']}],canStart:()=>({ok:true}),start:()=>({}),status:()=> 'running',interrupt:()=>true})});
 const bus={emit(name,p){events.push({name,p});out.emit(name,p,state);}};
 try{
  tactical.init({state,bus,helpers:{}});state.tick=0;state.simTime=0;tactical.update(1/60,state);
  assert.equal(events.filter(e=>e.name==='ai:telegraph'&&e.p.entityId===2).length,0,
   'a held attacker must not emit the telegraph that renders the committed lane');
  assert.equal(attacker.data.intent.fire!==true,true,'the same hold keeps the volley shut');
  attacker.data.ai.swarmFireHoldUntil=0;
  state.tick=1;state.simTime=1/60;tactical.update(1/60,state);
  const sent=events.find(e=>e.name==='ai:telegraph'&&e.p.entityId===2);
  assert.ok(sent,'the released attacker still warns inside its own announce window');
  assert.equal(sent.p.sourceGeneration,7);assert.equal(sent.p.targetGeneration,3);assert.ok(sent.p.aimCommit.capRad>0);
  tactical.update(1/60,state);
  assert.equal(events.filter(e=>e.name==='ai:telegraph'&&e.p.entityId===2).length,1,
   'a released hold emits its owed cue once, not on every later decision');
  state.tick=2;state.simTime=2/60;out.update(state);
  assert.ok(lane(out)>=0,'the deferred cue still paints the honest corridor');
 }finally{out.dispose();}
});

test('a delayed cue cannot adopt a replacement target or invent an unstamped identity',()=>{
 for(const missing of [false,true]){
  const {state,player,cue}=fixture(),out=new ActionVfx(new THREE.Scene());
  try{
   if(missing)delete cue.targetGeneration;
   else state.entities.set(player.id,{...player,occupantGeneration:player.occupantGeneration+1});
   out.emit('ai:telegraph',cue,state);state.tick=66;state.simTime=1.1;out.update(state);
   assert.equal(lane(out),-1,'old or unstamped target life must not acquire a lane');
  }finally{out.dispose();}
 }
});

test('target death or replacement retires the warning without touching another actor',()=>{
 for(const replace of [false,true]){
  const {state,player,cue}=fixture(),out=new ActionVfx(new THREE.Scene());
  try{out.emit('ai:telegraph',cue,state);state.tick=66;state.simTime=1.1;out.update(state);assert.ok(lane(out)>=0);
   if(replace)state.entities.set(player.id,{...player,occupantGeneration:player.occupantGeneration+1});else player.alive=false;
   state.tick++;state.simTime=state.tick/60;out.update(state);assert.equal(lane(out),-1);
  }finally{out.dispose();}
 }
});
