// Mutual-aid pickup: physical staging, one-shot owner delivery and fresh restore.
// Run: node --test test/frontier-aid-pickup.test.mjs

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
test('aid marker has accessible finite physical staging outside both arrival volumes',()=>{const h=boot();try{const p=pair(h),o=ownerOf(h);const d=o._postDebt(h.state,p.f,p.debtor,p.creditor),m=h.state.entities.get(d.markerId);assert.ok(Math.hypot(m.pos.x-p.creditor.ent.pos.x,m.pos.z-p.creditor.ent.pos.z)>=320);assert.ok(Math.hypot(m.pos.x,m.pos.z)>FRONTIER_MUTUAL_AID.settleR+p.debtor.ent.radius);assert.equal(m.physicsBody.mass,12);assert.equal(m.flags.persistent,true);o._tickDebts(h.state);assert.equal(d.state,'open');m.pos={...p.debtor.ent.pos};o._tickDebts(h.state);assert.equal(d.state,'paid');assert.equal(h.grants.filter(e=>e.reason===`frontier_aid:${d.id}`).length,1);o._tickDebts(h.state);assert.equal(h.grants.filter(e=>e.reason===`frontier_aid:${d.id}`).length,1);}finally{h.sim.dispose();}});
test('blocked pocket and failed creation do not post phantom debt',()=>{const h=boot();try{const p=pair(h),o=ownerOf(h),before=p.f.debts.length;const blocker=h.sim.spawn({type:'station',pos:{...p.creditor.ent.pos},radius:1000,collides:true,hull:1});assert.equal(o._postDebt(h.state,p.f,p.debtor,p.creditor),null);assert.equal(p.f.debts.length,before);blocker.alive=false;const spawn=o.helpers.spawnEntity;o.helpers.spawnEntity=()=>null;assert.equal(o._postDebt(h.state,p.f,p.debtor,p.creditor),null);o.helpers.spawnEntity=spawn;assert.equal(p.f.debts.length,before);assert.ok(o._postDebt(h.state,p.f,p.debtor,p.creditor));}finally{h.sim.dispose();}});
test('nearby debtor cannot consume freshly staged marker before a tow',()=>{const h=boot();try{const p=pair(h),o=ownerOf(h);p.debtor.ent.pos={x:1800,z:0};p.debtor.rec.pos={...p.debtor.ent.pos};const d=o._postDebt(h.state,p.f,p.debtor,p.creditor),m=h.state.entities.get(d.markerId);assert.ok(Math.hypot(m.pos.x-1800,m.pos.z)>FRONTIER_MUTUAL_AID.settleR+p.debtor.ent.radius);o._tickDebts(h.state);assert.equal(d.state,'open');}finally{h.sim.dispose();}});
test('native Pelican carries actual aid marker between fixture homesteads',{timeout:120000},async()=>{
 const {bootRealPath,writeRealPathInput}=await import('../scripts/lib/bench/realPath.mjs');const {combat}=await import('../src/systems/combat.js');const {tetherGameplay}=await import('../src/systems/tetherGameplay.js');const {lineProgression}=await import('../src/systems/lineProgression.js');const {economy}=await import('../src/systems/economy.js');
 const h=await bootRealPath({seed:9091,systems:[frontierHomesteads,economy,combat,tetherGameplay,lineProgression,'flightV3','physics'],hulls:[{hullId:'ship_pelican',isPlayer:true,pos:{x:1400,z:700},rot:0}]});try{
 const s=h.state,o=h.runtime.getSystem('frontierHomesteads');s.mode='flight';s.run.kind='adventure';s.world.currentSectorId='sector_io_reach';
 const f=ensureFrontierState(s);f.nextDebtAt=99999;f.nextLeadAt=99999;
 function stead(x,name){const e=o.helpers.spawnEntity({type:'station',pos:{x,z:0},radius:60,mass:1e6,hull:2000,hullMax:2000,collides:true,physicsBody:{shape:'ball',radius:60,mass:1e6,dynamic:false},flags:{persistent:true},data:{homestead:true,name}});const rec={entityId:e.id,gen:e.occupantGeneration,name,pos:{...e.pos},sectorId:'sector_io_reach',raisedAt:s.simTime,lastSupplyAt:s.simTime,supplies:1,traffic:0,stranded:false};f.homesteads.push(rec);return {ent:e,rec};}
 const debtor=stead(0,'South Window'),creditor=stead(1500,'Open Hearth');debtor.rec.stranded=true;
 const d=o._postDebt(s,f,debtor,creditor),m=s.entities.get(d.markerId);let impacts=0;const grants=[];h.bus.on('physics:impact',e=>{if([h.player.id,m.id].includes(e.aId)||[h.player.id,m.id].includes(e.bId))impacts++;});h.bus.on('economy:grantCredits',e=>grants.push(e));
 async function fly(goal,speed=18){for(let n=0;n<24000;n++){const p=h.player,x=goal.x-p.pos.x,z=goal.z-p.pos.z;if(Math.hypot(x,z)<2&&Math.hypot(p.vel.x,p.vel.z)<1)return;const sc=Math.min(.5,speed/Math.max(1,Math.hypot(x,z))),ax=(x*sc-p.vel.x)*.12,az=(z*sc-p.vel.z)*.12,c=Math.cos(p.rot),sn=Math.sin(p.rot);writeRealPathInput(s,{moveZ:ax*c+az*sn,moveX:-ax*sn+az*c});h.step(1);}assert.fail(JSON.stringify({goal,pos:h.player.pos,marker:m.pos,impacts}));}
 await fly({x:2200,z:700});await fly({x:2200,z:-650});await fly({x:m.pos.x,z:m.pos.z-100});writeRealPathInput(s,{});s.input.tetherMode='cursor';s.input.aimWorld={x:m.pos.x,z:m.pos.z};s.input.actions.tetherFire=true;h.step(2);s.input.actions.tetherFire=false;assert.equal(s.player.tether.targetId,m.id);const mass=h.runtime.getSystem('physics')._sg02.records.get(m.id).body.mass();assert.ok(Math.abs(mass-12)<.001);
 await fly({x:m.pos.x,z:-650});await fly({x:0,z:-650});await fly({x:0,z:-220},5);writeRealPathInput(s,{});s.input.actions.reelDelta=-1;for(let i=0;i<1200&&d.state==='open';i++)h.step(1);s.input.actions.reelDelta=0;
 assert.equal(d.state,'paid');assert.equal(d.how,'carried');assert.equal(m.alive,false);assert.equal(grants.filter(g=>g.reason===`frontier_aid:${d.id}`).length,1);h.step(60);assert.equal(grants.filter(g=>g.reason===`frontier_aid:${d.id}`).length,1);assert.ok(h.player.alive);console.log('AID_NATIVE',JSON.stringify({time:s.simTime,mass,impacts,payment:grants.filter(g=>g.reason===`frontier_aid:${d.id}`)}));
 }finally{h.dispose();}
});
test('fresh persistent entity restore keeps moved aid and rebinds its ledger without replacement',async()=>{
 const {save}=await import('../src/save/saveSystem.js');const h=boot(),fresh=boot();try{const p=pair(h),o=ownerOf(h);p.debtor.ent.flags.persistent=true;p.creditor.ent.flags.persistent=true;const d=o._postDebt(h.state,p.f,p.debtor,p.creditor),m=h.state.entities.get(d.markerId);m.pos.x+=70;
 const saver=Object.assign(Object.create(save),{state:h.state,bus:h.bus,helpers:h.sim.helpers,registry:h.sim.registry});const rows=saver._serializeEntities().persistent,frontier=structuredClone(o.serialize()),remap=new Map();const restorer=Object.assign(Object.create(save),{state:fresh.state,bus:fresh.bus,helpers:fresh.sim.helpers,registry:fresh.sim.registry});for(let cursor=0;cursor<rows.length;){const next=restorer._spawnPersistentEntities(structuredClone(rows),remap,{startIndex:cursor,clearStale:cursor===0});assert.ok(next>cursor);cursor=next;}
 const fo=ownerOf(fresh);fo.deserialize(frontier);fresh.state.sessionEntityIdRemap=remap;fresh.bus.emit('save:loaded',{});const restored=fresh.state.entityList.find(e=>e.alive&&e.data?.frontierAidId===d.id),fd=fresh.state.frontier.debts.find(e=>e.id===d.id);assert.ok(restored);assert.equal(restored.physicsBody.mass,12);assert.ok(Math.abs(restored.pos.x-m.pos.x)<.001);assert.equal(fd.markerId,restored.id);assert.equal(fd.markerGen,restored.occupantGeneration);fo._tickDebts(fresh.state);assert.equal(fd.state,'open');assert.equal(fresh.state.entityList.filter(e=>e.alive&&e.data?.frontierAidId===d.id).length,1);
 }finally{h.sim.dispose();fresh.sim.dispose();}
});
