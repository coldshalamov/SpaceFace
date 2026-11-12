// Existing salvage claims become a physical household choice with truthful outcomes.
// Run: node --test test/frontier-salvage-choice.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import {
  frontierHomesteads,
  ensureFrontierState,
  FRONTIER_MODULES,
  FRONTIER_MUTUAL_AID,
} from '../src/systems/faction_frontier.js';
import {
  FRONTIER_FRAME,
  FRONTIER_BARN_RAISING,
} from '../src/data/factions/free.js';

const SEED = 9091;

function boot() {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [frontierHomesteads] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_io_reach';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: -4000, z: -4000 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true, data: { name: 'PLAYER' },
  });
  state.playerId = player.id;
  const taps = {};
  const on = (ev, key) => {
    const heard = [];
    taps[key || ev] = heard;
    bus.on(ev, (p) => heard.push(p));
  };
  const grants = [];
  const reps = [];
  bus.on('economy:grantCredits', (p) => grants.push(p));
  bus.on('faction:repDelta', (p) => reps.push(p));
  return { sim, state, bus, player, taps, on, grants, reps };
}

const frame = (sim, x = 0, z = 0) => sim.spawn({
  type: 'station', team: 0, factionId: 'faction_free',
  pos: { x, z }, radius: FRONTIER_FRAME.radius, mass: 1e6,
  hull: 2000, hullMax: 2000, collides: true,
  data: { homesteadFrame: true, typeId: FRONTIER_FRAME.typeId },
});

const moduleFor = (sim, kind, x, z) => {
  const spec = FRONTIER_MODULES.find((m) => m.id === kind);
  return sim.spawn({
    type: 'payload', team: 0, factionId: 'faction_free',
    pos: { x, z }, radius: spec.radius, mass: spec.mass,
    hull: 100, hullMax: 100, collides: true,
    data: { homesteadModule: kind, name: spec.label },
  });
};

/** Raise a stead on the real path: six modules snap, welders finish. */
function raiseStead(sim, x = 0, z = 0) {
  const f = frame(sim, x, z);
  for (const m of FRONTIER_MODULES) {
    moduleFor(sim, m.id, x + FRONTIER_FRAME.snapRange - 60, z + (m.mass % 40) - 20);
  }
  sim.runTicks(Math.ceil(FRONTIER_BARN_RAISING.weldTimeS * 60) + 10);
  assert.equal(f.data.homestead, true, 'the frame became the homestead');
  return f;
}

const recOf = (state, entityId) =>
  ensureFrontierState(state).homesteads.find((r) => r.entityId === entityId);

const ownerOf=h=>h.sim.registry.get('frontierHomesteads');
function pair(h){const a=raiseStead(h.sim,0,0),b=raiseStead(h.sim,1500,0);const f=ensureFrontierState(h.state),ra=recOf(h.state,a.id),rb=recOf(h.state,b.id);ra.stranded=true;rb.stranded=false;rb.supplies=1;return {f,debtor:{ent:a,rec:ra},creditor:{ent:b,rec:rb}};}

import {tickFrontierSalvageChoice} from '../src/missions/frontierSalvageChoice.js';

function scenario(){const h=boot(),p=pair(h),o=ownerOf(h);h.player.pos={x:750,z:100};h.state.run.kind='adventure';const w=h.sim.spawn({type:'wreck',pos:{x:750,z:0},radius:8,mass:12,hull:50,hullMax:50,collides:true,physicsBody:{shape:'ball',radius:8,mass:12,dynamic:true},data:{name:'Drifting hulk'}});o._tickDisputes(h.state);const d=p.f.disputes.find(r=>r.wreckId===w.id),messages=[];assert.ok(d);h.bus.on('comms:popup',e=>{if(e.id?.startsWith('frontier_salvage_choice:'))messages.push(e);});return {...h,p,o,w,d,messages,tick:()=>tickFrontierSalvageChoice(o,260)};}
const guides=h=>h.state.entityList.filter(e=>e.alive&&e.data?.frontierSalvageReceiving);
test('two households expose actual choice rings without changing wreck or reward',()=>{const h=scenario();try{h.tick();assert.equal(guides(h).length,2);assert.ok(guides(h).every(e=>e.physicsBody===false&&e.data.ringRadius===320));assert.equal(h.messages.length,1);assert.match(h.messages[0].text,/Choose a receiving household/);assert.equal(h.w.pos.x,750);assert.equal(h.d.state,'open');assert.equal(h.grants.length,0);h.tick();assert.equal(h.messages.length,1);}finally{h.sim.dispose();}});
test('either actual handled haul can settle the chosen household once and close both circles',()=>{for(const side of ['debtor','creditor']){const h=scenario();try{h.tick();const c=h.p[side],before=c.rec.supplies;h.w.pos={...c.ent.pos};h.player.pos={x:c.ent.pos.x,z:500};h.state.player.tether={active:true,targetId:h.w.id};h.o._tickDisputes(h.state);h.tick();assert.equal(h.d.state,'settled');assert.equal(c.rec.supplies,before+1);assert.equal(guides(h).length,0);assert.match(h.messages.at(-1).text,/took title/);assert.equal(h.grants.filter(g=>g.reason===`frontier_claim:${h.d.id}`).length,1);h.o._tickDisputes(h.state);h.tick();assert.equal(h.messages.length,2);}finally{h.sim.dispose();}}});
test('unhandled drifting hulk inside receiving radius is not accepted by guide',()=>{const h=scenario();try{h.w.pos={x:100,z:0};h.tick();h.o._tickDisputes(h.state);assert.equal(h.d.state,'open');assert.equal(h.w.alive,true);assert.equal(h.grants.length,0);}finally{h.sim.dispose();}});
test('jumped claim closes circles and reports the owner consequence, never a settlement',()=>{const h=scenario();try{h.tick();h.w.pos={x:750,z:1000};h.state.player.tether={active:true,targetId:h.w.id};h.o._tickDisputes(h.state);h.player.pos={x:0,z:500};h.tick();assert.equal(h.d.state,'jumped');assert.equal(guides(h).length,0);assert.match(h.messages.at(-1).text,/jumped claim/);assert.equal(h.grants.length,0);}finally{h.sim.dispose();}});
test('generation, sector and mode cleanup preserve old unstamped claim mechanics',()=>{const h=scenario();try{h.tick();h.w.occupantGeneration++;h.tick();assert.equal(guides(h).length,0);h.w.occupantGeneration--;h.p.debtor.ent.occupantGeneration++;h.p.debtor.rec.gen=h.p.debtor.ent.occupantGeneration;h.tick();assert.equal(guides(h).length,1);h.state.mode='menu';h.tick();assert.equal(guides(h).length,0);h.state.mode='flight';delete h.d.receivingGens;h.tick();assert.equal(guides(h).length,0);h.w.pos={...h.p.creditor.ent.pos};h.state.player.tether={active:true,targetId:h.w.id};h.o._tickDisputes(h.state);assert.equal(h.d.state,'settled');}finally{h.sim.dispose();}});
test('native pilot chooses one household by physically towing the filed hulk',{timeout:120000},async()=>{
 const {bootRealPath,writeRealPathInput}=await import('../scripts/lib/bench/realPath.mjs');const {combat}=await import('../src/systems/combat.js');const {tetherGameplay}=await import('../src/systems/tetherGameplay.js');const {lineProgression}=await import('../src/systems/lineProgression.js');const {economy}=await import('../src/systems/economy.js');
 const h=await bootRealPath({seed:9091,systems:[frontierHomesteads,economy,combat,tetherGameplay,lineProgression,'flightV3','physics'],hulls:[{hullId:'ship_pelican',isPlayer:true,pos:{x:650,z:-500},rot:0}]});try{
 const s=h.state,o=h.runtime.getSystem('frontierHomesteads');s.mode='flight';s.run.kind='adventure';s.world.currentSectorId='sector_io_reach';
 const f=ensureFrontierState(s);f.nextDebtAt=99999;f.nextLeadAt=99999;
 function stead(x,name){const e=o.helpers.spawnEntity({type:'station',pos:{x,z:0},radius:60,mass:1e6,hull:2000,hullMax:2000,collides:true,physicsBody:{shape:'ball',radius:60,mass:1e6,dynamic:false},flags:{persistent:true},data:{homestead:true,name}});const rec={entityId:e.id,gen:e.occupantGeneration,name,pos:{...e.pos},sectorId:'sector_io_reach',raisedAt:s.simTime,lastSupplyAt:s.simTime,supplies:1,traffic:0,stranded:false};f.homesteads.push(rec);return {ent:e,rec};}
 const debtor=stead(0,'South Window'),creditor=stead(1500,'Open Hearth');debtor.rec.stranded=true;
 const m=o.helpers.spawnEntity({type:'wreck',pos:{x:750,z:0},radius:8,mass:12,hull:50,hullMax:50,collides:true,physicsBody:{shape:'ball',radius:8,mass:12,dynamic:true},data:{name:'Filed drifting hulk'}});o._tickDisputes(s);const d=f.disputes.find(r=>r.wreckId===m.id);assert.ok(d);const before=debtor.rec.supplies;let impacts=0;const contacts=[];const grants=[];h.bus.on('physics:impact',e=>{if([h.player.id,m.id].includes(e.aId)||[h.player.id,m.id].includes(e.bId)){impacts++;contacts.push({a:e.aId,b:e.bId,t:s.simTime,p:{x:h.player.pos.x,z:h.player.pos.z},m:{x:m.pos.x,z:m.pos.z}});}});h.bus.on('economy:grantCredits',e=>grants.push(e));
 async function fly(goal,speed=18){for(let n=0;n<24000;n++){const p=h.player,x=goal.x-p.pos.x,z=goal.z-p.pos.z;if(Math.hypot(x,z)<2&&Math.hypot(p.vel.x,p.vel.z)<1)return;const sc=Math.min(.5,speed/Math.max(1,Math.hypot(x,z))),ax=(x*sc-p.vel.x)*.12,az=(z*sc-p.vel.z)*.12,c=Math.cos(p.rot),sn=Math.sin(p.rot);writeRealPathInput(s,{moveZ:ax*c+az*sn,moveX:-ax*sn+az*c});h.step(1);}assert.fail(JSON.stringify({goal,pos:h.player.pos,marker:m.pos,impacts}));}
 await fly({x:m.pos.x-100,z:m.pos.z});writeRealPathInput(s,{});s.input.tetherMode='cursor';s.input.aimWorld={x:m.pos.x,z:m.pos.z};s.input.actions.tetherFire=true;h.step(2);s.input.actions.tetherFire=false;assert.equal(s.player.tether.targetId,m.id);const guide=s.entityList.find(e=>e.alive&&e.data?.frontierSalvageReceiving&&e.data.choiceKey.startsWith(d.id+':'));assert.ok(guide);assert.equal(guide.physicsBody,false);assert.equal(guide.data.ringRadius,320);const mass=h.runtime.getSystem('physics')._sg02.records.get(m.id).body.mass();assert.ok(Math.abs(mass-12)<.001);
 await fly({x:220,z:0},14);writeRealPathInput(s,{});s.input.actions.reelDelta=-1;for(let i=0;i<1200&&d.state==='open';i++)h.step(1);s.input.actions.reelDelta=0;
 assert.equal(d.state,'settled');assert.equal(debtor.rec.supplies,before+1);assert.equal(s.entityList.filter(e=>e.alive&&e.data?.frontierSalvageReceiving&&e.data.choiceKey.startsWith(d.id+':')).length,0);assert.equal(m.alive,false);assert.equal(grants.filter(g=>g.reason===`frontier_claim:${d.id}`).length,1);h.step(60);assert.equal(grants.filter(g=>g.reason===`frontier_claim:${d.id}`).length,1);assert.ok(h.player.alive);assert.ok(contacts.every(e=>[e.a,e.b].includes(h.player.id)&&[e.a,e.b].includes(m.id)),JSON.stringify(contacts));console.log('SALVAGE_CHOICE_NATIVE',JSON.stringify({time:s.simTime,mass,impacts,payment:grants.filter(g=>g.reason===`frontier_claim:${d.id}`),contacts}));
 }finally{h.dispose();}
});

test('fresh restore does not resurrect an unsaved ambient hulk or its guide',async()=>{
 const {save}=await import('../src/save/saveSystem.js');const h=scenario(),fresh=boot();try{h.tick();h.p.debtor.ent.flags.persistent=true;h.p.creditor.ent.flags.persistent=true;const saver=Object.assign(Object.create(save),{state:h.state,bus:h.bus,helpers:h.sim.helpers,registry:h.sim.registry}),rows=saver._serializeEntities().persistent,data=structuredClone(h.o.serialize());assert.equal(rows.some(e=>e.data?.frontierDisputeId===h.d.id),false);
 const restorer=Object.assign(Object.create(save),{state:fresh.state,bus:fresh.bus,helpers:fresh.sim.helpers,registry:fresh.sim.registry}),remap=new Map();for(let cursor=0;cursor<rows.length;){const next=restorer._spawnPersistentEntities(structuredClone(rows),remap,{startIndex:cursor,clearStale:cursor===0});assert.ok(next>cursor);cursor=next;}const fo=ownerOf(fresh);fo.deserialize(data);fresh.state.sessionEntityIdRemap=remap;fresh.bus.emit('save:loaded',{});const d=fresh.state.frontier.disputes.find(e=>e.id===h.d.id);fo._tickDisputes(fresh.state);tickFrontierSalvageChoice(fo,260);assert.equal(d.state,'lapsed');assert.equal(guides(fresh).length,0);assert.equal(fresh.grants.filter(g=>g.reason===`frontier_claim:${d.id}`).length,0);
 }finally{h.sim.dispose();fresh.sim.dispose();}
});
test('persistent filed-hulk fixture restores only trusted claimant identities',async()=>{
 const {save}=await import('../src/save/saveSystem.js');for(const variant of ['valid','replacement','missing-map']){const h=scenario(),fresh=boot();try{h.tick();h.w.flags.persistent=true;if(variant==='replacement'){h.p.debtor.ent.occupantGeneration++;h.p.debtor.rec.gen=h.p.debtor.ent.occupantGeneration;}h.p.debtor.ent.flags.persistent=true;h.p.creditor.ent.flags.persistent=true;const saver=Object.assign(Object.create(save),{state:h.state,bus:h.bus,helpers:h.sim.helpers,registry:h.sim.registry}),rows=saver._serializeEntities().persistent,data=structuredClone(h.o.serialize());assert.equal(rows.some(e=>e.data?.frontierDisputeId===h.d.id),true);
 const restorer=Object.assign(Object.create(save),{state:fresh.state,bus:fresh.bus,helpers:fresh.sim.helpers,registry:fresh.sim.registry}),remap=new Map();for(let cursor=0;cursor<rows.length;){const next=restorer._spawnPersistentEntities(structuredClone(rows),remap,{startIndex:cursor,clearStale:cursor===0});assert.ok(next>cursor);cursor=next;}const fo=ownerOf(fresh);fo.deserialize(data);if(variant==='missing-map')remap.delete(String(h.p.debtor.ent.id));fresh.state.sessionEntityIdRemap=remap;fresh.bus.emit('save:loaded',{});const d=fresh.state.frontier.disputes.find(e=>e.id===h.d.id);fo._tickDisputes(fresh.state);tickFrontierSalvageChoice(fo,260);assert.equal(d.state,'open');assert.equal(guides(fresh).length,variant==='valid'?2:1);if(variant!=='valid')assert.equal(d.receivingGens[0],null);assert.equal(fresh.grants.filter(g=>g.reason===`frontier_claim:${d.id}`).length,0);
 }finally{h.sim.dispose();fresh.sim.dispose();}}
});
