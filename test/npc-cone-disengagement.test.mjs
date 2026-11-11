import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { fields } from '../src/systems/fields.js';
import { physics } from '../src/core/physics.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { planNpcFieldDeploy } from '../src/ai/npcFieldDeploy.js';
const DT=1/60;
function scene(){
 const sim=createSimulation({seed:47,bus:createBus(),systems:[fields,physics]}),s=sim.state;s.mode='flight';s.input.actions={};
 const spawn=(type,x,z,data={})=>sim.spawn({type,team:1,pos:{x,z},vel:{x:0,z:0},rot:0,angVel:0,radius:8,mass:16,hull:100,hullMax:100,collides:true,data,physicsBody:{schemaVersion:1,radius:8,mass:16,inertiaY:512,dynamic:true,ccd:true,material:'ship',revision:0}});
 const p=spawn('ship',-500,0);p.team=0;s.playerId=p.id;
 const npc=spawn('ship',0,0,{role:'scavenger',ai:{doctrine:'scavenger',passive:false,roe:'fire_at_will'}}),hull=spawn('wreck',90,0,{majorDebris:true});
 return {sim,s,npc,hull,f:sim.registry.get('fields'),p:sim.registry.get('physics')};
}
async function flags(fn){const old=FIELD_FLAGS.enabled;FIELD_FLAGS.enabled=true;try{return await fn();}finally{FIELD_FLAGS.enabled=old;}}
test('active hostile cones remain, each explicit stood-down state stops immediately before hold expiry',()=>flags(()=>{
 for(const changes of [{passive:true},{pirateDisengaged:true},{roe:'hold_fire'}]){
  const t=scene(),id=t.f.applyNpcFieldPlan(t.s,t.npc);assert.ok(id);assert.ok(t.f._kernel.has(id));
  Object.assign(t.npc.data.ai,changes);assert.equal(planNpcFieldDeploy(t.npc,t.s).reason,'combat_stood_down');
  assert.equal(t.f.applyNpcFieldPlan(t.s,t.npc),null);assert.equal(t.f._kernel.has(id),false);assert.equal(t.s.fields.npcFields[t.npc.id],undefined);
  Object.assign(t.npc.data.ai,{passive:false,pirateDisengaged:false,roe:'fire_at_will'});assert.ok(t.f.applyNpcFieldPlan(t.s,t.npc),'legitimate re-engagement retains combat tool');
 }
}));
test('civilian sweepers keep their bounded workpiece cone despite passive hold-fire posture',()=>flags(()=>{
 const t=scene();t.npc.data={role:'sweeper',ai:{passive:true,roe:'hold_fire'}};const plan=planNpcFieldDeploy(t.npc,t.s);
 assert.equal(plan.action,'on');assert.equal(plan.industrial,true);assert.equal(plan.strength,30);
 const id=t.f.applyNpcFieldPlan(t.s,t.npc),f=t.f._kernel.get(id);assert.ok(f);assert.equal(f.filters.includeId,t.hull.id);assert.equal(f.maxAffected,1);
}));
test('native existing combat cone stops adding force the first stood-down tick, including restored cone',()=>flags(async()=>{
 const t=scene();t.s.settings.gameplay.physicsBackend='rapier-dynamic';await t.p.prepareBackend(t.s);
 try{
  t.f.applyNpcFieldPlan(t.s,t.npc);for(let i=0;i<8;i++)t.sim.step(DT);
  const before=Math.hypot(t.hull.vel.x,t.hull.vel.z);assert.ok(before>0);
  const saved=t.f.serialize();Object.assign(t.npc.data.ai,{passive:true,pirateDisengaged:true,roe:'hold_fire'});
  t.f.deserialize(saved);t.sim.step(DT);
  assert.equal(Object.keys(t.s.fields.npcFields).length,0);
  const after=Math.hypot(t.hull.vel.x,t.hull.vel.z);assert.ok(after<=before+1e-4,'stopping the tool does not erase existing momentum or add more');
  assert.equal(t.hull.hull,100);
 }finally{t.p._disableSg02DynamicAuthority();}
}));

test('deployment listener stand-down cannot leave a newly published combat cone armed',()=>flags(()=>{
 const t=scene();t.sim.bus.on('fields:deployed',()=>{t.npc.data.ai.passive=true;});
 assert.equal(t.f.applyNpcFieldPlan(t.s,t.npc),null);assert.equal(Object.keys(t.s.fields.npcFields).length,0);assert.equal(t.f._kernel.list().length,0);
}));
