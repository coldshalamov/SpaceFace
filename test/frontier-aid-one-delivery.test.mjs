// Physical supply arrival covers aid without counting a second delivery.
// Run: node --test test/frontier-aid-one-delivery.test.mjs

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

import {tickFrontierAidReceiving} from '../src/missions/frontierAidReceiving.js';

function scenario(){const h=boot(),p=pair(h),o=ownerOf(h),d=o._postDebt(h.state,p.f,p.debtor,p.creditor);h.player.pos={x:0,z:500};h.state.run.kind='adventure';const messages=[];h.bus.on('comms:popup',e=>{if(e.id?.startsWith('frontier_aid_receiving:'))messages.push(e);});return {...h,p,o,d,m:h.state.entities.get(d.markerId),messages,tick:()=>tickFrontierAidReceiving(o,FRONTIER_MUTUAL_AID.settleR)};}
const guides=h=>h.state.entityList.filter(e=>e.alive&&e.data?.frontierAidReceiving);

test('one real supply covers aid but records only one delivery and retains both existing fees',()=>{const h=scenario();try{h.tick();const count=h.p.debtor.rec.supplies;const supply=h.sim.spawn({type:'payload',pos:{x:0,z:0},radius:6,mass:10,hull:10,hullMax:10,data:{supplyCargo:true}});h.o._tickHomesteads(h.state);h.tick();assert.equal(supply.alive,false);assert.equal(h.d.state,'paid');assert.equal(h.d.how,'covered');assert.equal(h.p.debtor.rec.supplies,count+1);assert.equal(h.m.alive,false);assert.match(h.messages.at(-1).text,/supply delivery covered/);assert.equal(h.grants.filter(g=>g.reason.startsWith('frontier_supply:')).length,1);assert.equal(h.grants.filter(g=>g.reason===`frontier_aid:${h.d.id}`).length,1);h.o._tickHomesteads(h.state);h.o._settleDebt(h.state,h.d,'covered');assert.equal(h.p.debtor.rec.supplies,count+1);assert.equal(h.grants.filter(g=>g.reason===`frontier_aid:${h.d.id}`).length,1);}finally{h.sim.dispose();}});
test('a carried marker still records exactly one delivery of its own',()=>{const h=scenario();try{const count=h.p.debtor.rec.supplies;h.m.pos={...h.p.debtor.ent.pos};h.o._tickDebts(h.state);assert.equal(h.d.how,'carried');assert.equal(h.p.debtor.rec.supplies,count+1);h.o._tickDebts(h.state);assert.equal(h.p.debtor.rec.supplies,count+1);}finally{h.sim.dispose();}});
test('native supply covers open aid and counts one physical delivery',{timeout:120000},async()=>{
 const {bootRealPath,writeRealPathInput}=await import('../scripts/lib/bench/realPath.mjs');const {combat}=await import('../src/systems/combat.js');const {tetherGameplay}=await import('../src/systems/tetherGameplay.js');const {lineProgression}=await import('../src/systems/lineProgression.js');const {economy}=await import('../src/systems/economy.js');
 const h=await bootRealPath({seed:9091,systems:[frontierHomesteads,economy,combat,tetherGameplay,lineProgression,'flightV3','physics'],hulls:[{hullId:'ship_pelican',isPlayer:true,pos:{x:700,z:-500},rot:0}]});try{
 const s=h.state,o=h.runtime.getSystem('frontierHomesteads');s.mode='flight';s.run.kind='adventure';s.world.currentSectorId='sector_io_reach';
 const f=ensureFrontierState(s);f.nextDebtAt=99999;f.nextLeadAt=99999;
 function stead(x,name){const e=o.helpers.spawnEntity({type:'station',pos:{x,z:0},radius:60,mass:1e6,hull:2000,hullMax:2000,collides:true,physicsBody:{shape:'ball',radius:60,mass:1e6,dynamic:false},flags:{persistent:true},data:{homestead:true,name}});const rec={entityId:e.id,gen:e.occupantGeneration,name,pos:{...e.pos},sectorId:'sector_io_reach',raisedAt:s.simTime,lastSupplyAt:s.simTime,supplies:1,traffic:0,stranded:false};f.homesteads.push(rec);return {ent:e,rec};}
 const debtor=stead(0,'South Window'),creditor=stead(1500,'Open Hearth');debtor.rec.stranded=true;
 const d=o._postDebt(s,f,debtor,creditor),marker=s.entities.get(d.markerId);const before=debtor.rec.supplies;const m=o.helpers.spawnEntity({type:'payload',pos:{x:800,z:0},radius:6,mass:10,hull:10,hullMax:10,collides:true,physicsBody:{shape:'ball',radius:6,mass:10,dynamic:true},data:{supplyCargo:true}});let impacts=0;const contacts=[];const grants=[];const initialCredits=s.player.credits;h.bus.on('physics:impact',e=>{if([h.player.id,m.id].includes(e.aId)||[h.player.id,m.id].includes(e.bId)){impacts++;contacts.push({a:e.aId,b:e.bId,t:s.simTime,p:{x:h.player.pos.x,z:h.player.pos.z},m:{x:m.pos.x,z:m.pos.z}});}});h.bus.on('economy:grantCredits',e=>grants.push(e));
 async function fly(goal,speed=18){for(let n=0;n<24000;n++){const p=h.player,x=goal.x-p.pos.x,z=goal.z-p.pos.z;if(Math.hypot(x,z)<2&&Math.hypot(p.vel.x,p.vel.z)<1)return;const sc=Math.min(.5,speed/Math.max(1,Math.hypot(x,z))),ax=(x*sc-p.vel.x)*.12,az=(z*sc-p.vel.z)*.12,c=Math.cos(p.rot),sn=Math.sin(p.rot);writeRealPathInput(s,{moveZ:ax*c+az*sn,moveX:-ax*sn+az*c});h.step(1);}assert.fail(JSON.stringify({goal,pos:h.player.pos,marker:m.pos,impacts}));}
 await fly({x:m.pos.x-100,z:m.pos.z});writeRealPathInput(s,{});s.input.tetherMode='cursor';s.input.aimWorld={x:m.pos.x,z:m.pos.z};s.input.actions.tetherFire=true;h.step(2);s.input.actions.tetherFire=false;assert.equal(s.player.tether.targetId,m.id);const guide=s.entityList.find(e=>e.alive&&e.data?.frontierAidReceiving&&e.data.debtId===d.id);assert.ok(guide);assert.equal(guide.physicsBody,false);assert.equal(guide.data.ringRadius,320);const mass=h.runtime.getSystem('physics')._sg02.records.get(m.id).body.mass();assert.ok(Math.abs(mass-10)<.001);
 await fly({x:140,z:0},14);writeRealPathInput(s,{});s.input.actions.reelDelta=-1;for(let i=0;i<1200&&d.state==='open';i++)h.step(1);s.input.actions.reelDelta=0;
 assert.equal(d.state,'paid');assert.equal(d.how,'covered');assert.equal(marker.alive,false);assert.equal(debtor.rec.supplies,before+1);assert.equal(grants.filter(g=>g.reason.startsWith('frontier_supply:')).length,1);assert.equal(s.player.credits-initialCredits,grants.reduce((sum,g)=>sum+g.amount,0));assert.equal(s.entityList.filter(e=>e.alive&&e.data?.frontierAidReceiving&&e.data.debtId===d.id).length,0);assert.equal(m.alive,false);assert.equal(grants.filter(g=>g.reason===`frontier_aid:${d.id}`).length,1);h.step(60);assert.equal(grants.filter(g=>g.reason===`frontier_aid:${d.id}`).length,1);assert.ok(h.player.alive);assert.ok(contacts.every(e=>[e.a,e.b].includes(h.player.id)&&[e.a,e.b].includes(m.id)),JSON.stringify(contacts));console.log('AID_ONE_DELIVERY_NATIVE',JSON.stringify({time:s.simTime,mass,impacts,payments:grants,deliveries:debtor.rec.supplies-before,contacts}));
 }finally{h.dispose();}
});

test('fresh restore preserves one counted delivery and paid debt without replay or retroactive repair',async()=>{
 const {save}=await import('../src/save/saveSystem.js');const h=scenario(),fresh=boot();try{h.p.debtor.ent.flags.persistent=true;h.p.creditor.ent.flags.persistent=true;const count=h.p.debtor.rec.supplies;h.sim.spawn({type:'payload',pos:{...h.p.debtor.ent.pos},radius:6,mass:10,hull:10,data:{supplyCargo:true}});h.o._tickHomesteads(h.state);
 const saver=Object.assign(Object.create(save),{state:h.state,bus:h.bus,helpers:h.sim.helpers,registry:h.sim.registry});const rows=saver._serializeEntities().persistent,data=structuredClone(h.o.serialize()),remap=new Map(),restorer=Object.assign(Object.create(save),{state:fresh.state,bus:fresh.bus,helpers:fresh.sim.helpers,registry:fresh.sim.registry});for(let cursor=0;cursor<rows.length;){const next=restorer._spawnPersistentEntities(structuredClone(rows),remap,{startIndex:cursor,clearStale:cursor===0});assert.ok(next>cursor);cursor=next;}
 const fo=ownerOf(fresh);fo.deserialize(data);fresh.state.sessionEntityIdRemap=remap;fresh.bus.emit('save:loaded',{});const debt=fresh.state.frontier.debts.find(d=>d.id===h.d.id),rec=fo._steadRec(fresh.state,debt.debtorId);assert.equal(rec.supplies,count+1);assert.equal(debt.state,'paid');fo._tickDebts(fresh.state);fo._tickHomesteads(fresh.state);assert.equal(rec.supplies,count+1);assert.equal(fresh.grants.filter(g=>g.reason===`frontier_aid:${debt.id}`).length,0);
 // Historical saved counts are not guessed back down: only future physical arrivals change them.
 rec.supplies=17;const legacy=structuredClone(fo.serialize());fo.deserialize(legacy);const restored=fo._steadRec(fresh.state,debt.debtorId);assert.equal(restored.supplies,17);const frame=fo._steadEnt(fresh.state,restored);fresh.sim.spawn({type:'payload',pos:{...frame.pos},radius:6,mass:10,hull:10,data:{supplyCargo:true}});fo._tickHomesteads(fresh.state);assert.equal(restored.supplies,18);assert.equal(fresh.grants.filter(g=>g.reason===`frontier_aid:${debt.id}`).length,0);
 }finally{h.sim.dispose();fresh.sim.dispose();}
});
