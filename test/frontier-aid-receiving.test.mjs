// Receiving guide follows the real debt owner without settling it.
// Run: node --test test/frontier-aid-receiving.test.mjs

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
test('named receiver guides the existing exact arrival radius without paying or moving cargo',()=>{const h=scenario();try{const before={...h.m.pos};h.tick();assert.equal(guides(h).length,1);const r=guides(h)[0];assert.equal(r.physicsBody,false);assert.equal(r.collides,false);assert.equal(r.data.ringRadius,320);assert.match(r.data.scanLabel,/AID RECEIVING/);assert.equal(h.messages.length,1);assert.match(h.messages[0].text,/hull inside is solid/);assert.deepEqual({...h.m.pos},before);assert.equal(h.d.state,'open');assert.equal(h.grants.length,0);h.p.debtor.ent.pos.x+=40;h.p.debtor.ent.radius=80;h.tick();assert.equal(r.pos.x,40);assert.equal(r.data.ringRadius,340);assert.equal(h.messages.length,1);}finally{h.sim.dispose();}});
test('real carried settlement removes guide and speaks once without duplicating payment',()=>{const h=scenario();try{h.tick();h.m.pos={x:320,z:0};h.o._tickDebts(h.state);h.tick();assert.equal(h.d.state,'paid');assert.equal(guides(h).length,0);assert.equal(h.messages.length,2);assert.match(h.messages[1].text,/marker from/);h.tick();assert.equal(h.messages.length,2);assert.equal(h.grants.filter(g=>g.reason===`frontier_aid:${h.d.id}`).length,1);}finally{h.sim.dispose();}});
test('ordinary supply covers debt with distinct honest response',()=>{const h=scenario();try{h.tick();h.sim.spawn({type:'payload',pos:{x:0,z:0},radius:6,mass:10,hull:10,data:{supplyCargo:true}});h.o._tickHomesteads(h.state);h.tick();assert.equal(h.d.how,'covered');assert.match(h.messages.at(-1).text,/supply delivery covered/);assert.equal(guides(h).length,0);}finally{h.sim.dispose();}});
test('canonical marker and receiver generation plus sector/mode control guide lifetime',()=>{const h=scenario();try{h.tick();h.m.occupantGeneration++;h.tick();assert.equal(guides(h).length,0);h.m.occupantGeneration--;h.tick();assert.equal(guides(h).length,1);h.p.debtor.ent.occupantGeneration++;h.tick();assert.equal(guides(h).length,0);h.p.debtor.ent.occupantGeneration--;h.tick();h.state.world.currentSectorId='sector_helios';h.tick();assert.equal(guides(h).length,0);h.state.world.currentSectorId='sector_io_reach';h.tick();h.state.mode='menu';h.tick();assert.equal(guides(h).length,0);h.state.mode='flight';h.tick();h.state.run.kind='survival';h.o.update(1/60,h.state);assert.equal(guides(h).length,0);}finally{h.sim.dispose();}});
test('loss clears guide and durable receipt memory avoids replay after owner deserialize',()=>{const h=scenario();try{h.d.receivingContact='bad shape';h.tick();h.m.alive=false;h.o._tickDebts(h.state);h.tick();assert.equal(h.d.state,'lapsed');assert.equal(guides(h).length,0);assert.match(h.messages.at(-1).text,/no longer available/);const snapshot=structuredClone(h.o.serialize());h.o.deserialize(snapshot);h.tick();assert.equal(h.messages.length,2);}finally{h.sim.dispose();}});
test('docked arrival stays pending; orphan guide is cleaned after ledger disappears',()=>{const h=scenario();try{h.state.ui.docked=true;h.tick();assert.equal(h.messages.length,0);h.state.ui.docked=false;h.tick();assert.equal(h.messages.length,1);h.state.frontier.debts=[];h.tick();assert.equal(guides(h).length,0);}finally{h.sim.dispose();}});
test('fresh entity restore rebinds recipient guide identity',async()=>{
 const {save}=await import('../src/save/saveSystem.js');const h=boot(),fresh=boot();try{const p=pair(h),o=ownerOf(h);p.debtor.ent.flags.persistent=true;p.creditor.ent.flags.persistent=true;const d=o._postDebt(h.state,p.f,p.debtor,p.creditor),m=h.state.entities.get(d.markerId);m.pos.x+=70;
 const saver=Object.assign(Object.create(save),{state:h.state,bus:h.bus,helpers:h.sim.helpers,registry:h.sim.registry});const rows=saver._serializeEntities().persistent,frontier=structuredClone(o.serialize()),remap=new Map();const restorer=Object.assign(Object.create(save),{state:fresh.state,bus:fresh.bus,helpers:fresh.sim.helpers,registry:fresh.sim.registry});for(let cursor=0;cursor<rows.length;){const next=restorer._spawnPersistentEntities(structuredClone(rows),remap,{startIndex:cursor,clearStale:cursor===0});assert.ok(next>cursor);cursor=next;}
 const fo=ownerOf(fresh);fo.deserialize(frontier);fresh.state.sessionEntityIdRemap=remap;fresh.bus.emit('save:loaded',{});const restored=fresh.state.entityList.find(e=>e.alive&&e.data?.frontierAidId===d.id),fd=fresh.state.frontier.debts.find(e=>e.id===d.id);assert.ok(restored);assert.equal(restored.physicsBody.mass,12);assert.ok(Math.abs(restored.pos.x-m.pos.x)<.001);assert.equal(fd.markerId,restored.id);assert.equal(fd.markerGen,restored.occupantGeneration);fo._tickDebts(fresh.state);assert.equal(fd.state,'open');tickFrontierAidReceiving(fo,FRONTIER_MUTUAL_AID.settleR);assert.equal(guides(fresh).length,1);assert.equal(fd.receivingDebtorGen,fresh.state.entities.get(fd.debtorId).occupantGeneration);assert.equal(fresh.state.entityList.filter(e=>e.alive&&e.data?.frontierAidId===d.id).length,1);
 }finally{h.sim.dispose();fresh.sim.dispose();}
});

test('new homestead at recycled debtor ID does not inherit old guide or voice',()=>{const h=scenario();try{h.tick();h.p.debtor.ent.occupantGeneration++;h.p.debtor.rec.gen=h.p.debtor.ent.occupantGeneration;h.d.receivingContact={};h.tick();assert.equal(guides(h).length,0);assert.equal(h.messages.length,1);}finally{h.sim.dispose();}});
test('fresh restore cannot revive guide for replaced same-ID household',async()=>{
 const {save}=await import('../src/save/saveSystem.js');const h=boot(),fresh=boot();try{const p=pair(h),o=ownerOf(h);p.debtor.ent.flags.persistent=true;p.creditor.ent.flags.persistent=true;const d=o._postDebt(h.state,p.f,p.debtor,p.creditor),m=h.state.entities.get(d.markerId);m.pos.x+=70;p.debtor.ent.occupantGeneration++;p.debtor.rec.gen=p.debtor.ent.occupantGeneration;
 const saver=Object.assign(Object.create(save),{state:h.state,bus:h.bus,helpers:h.sim.helpers,registry:h.sim.registry});const rows=saver._serializeEntities().persistent,frontier=structuredClone(o.serialize()),remap=new Map();const restorer=Object.assign(Object.create(save),{state:fresh.state,bus:fresh.bus,helpers:fresh.sim.helpers,registry:fresh.sim.registry});for(let cursor=0;cursor<rows.length;){const next=restorer._spawnPersistentEntities(structuredClone(rows),remap,{startIndex:cursor,clearStale:cursor===0});assert.ok(next>cursor);cursor=next;}
 const fo=ownerOf(fresh);fo.deserialize(frontier);fresh.state.sessionEntityIdRemap=remap;fresh.bus.emit('save:loaded',{});const restored=fresh.state.entityList.find(e=>e.alive&&e.data?.frontierAidId===d.id),fd=fresh.state.frontier.debts.find(e=>e.id===d.id);assert.ok(restored);assert.equal(restored.physicsBody.mass,12);assert.ok(Math.abs(restored.pos.x-m.pos.x)<.001);assert.equal(fd.markerId,restored.id);assert.equal(fd.markerGen,restored.occupantGeneration);fo._tickDebts(fresh.state);assert.equal(fd.state,'open');tickFrontierAidReceiving(fo,FRONTIER_MUTUAL_AID.settleR);assert.equal(guides(fresh).length,0);assert.equal(fd.receivingDebtorGen,null);assert.equal(fresh.state.entityList.filter(e=>e.alive&&e.data?.frontierAidId===d.id).length,1);
 }finally{h.sim.dispose();fresh.sim.dispose();}
});

test('missing trusted recipient remap invalidates presentation even if numeric body survives',async()=>{
 const {save}=await import('../src/save/saveSystem.js');const h=boot(),fresh=boot();try{const p=pair(h),o=ownerOf(h);p.debtor.ent.flags.persistent=true;p.creditor.ent.flags.persistent=true;const d=o._postDebt(h.state,p.f,p.debtor,p.creditor),m=h.state.entities.get(d.markerId);m.pos.x+=70;
 const saver=Object.assign(Object.create(save),{state:h.state,bus:h.bus,helpers:h.sim.helpers,registry:h.sim.registry});const rows=saver._serializeEntities().persistent,frontier=structuredClone(o.serialize()),remap=new Map();const restorer=Object.assign(Object.create(save),{state:fresh.state,bus:fresh.bus,helpers:fresh.sim.helpers,registry:fresh.sim.registry});for(let cursor=0;cursor<rows.length;){const next=restorer._spawnPersistentEntities(structuredClone(rows),remap,{startIndex:cursor,clearStale:cursor===0});assert.ok(next>cursor);cursor=next;}
 const fo=ownerOf(fresh);fo.deserialize(frontier);remap.delete(String(p.debtor.ent.id));fresh.state.sessionEntityIdRemap=remap;fresh.bus.emit('save:loaded',{});const restored=fresh.state.entityList.find(e=>e.alive&&e.data?.frontierAidId===d.id),fd=fresh.state.frontier.debts.find(e=>e.id===d.id);assert.ok(restored);assert.equal(restored.physicsBody.mass,12);assert.ok(Math.abs(restored.pos.x-m.pos.x)<.001);assert.equal(fd.markerId,restored.id);assert.equal(fd.markerGen,restored.occupantGeneration);fo._tickDebts(fresh.state);assert.equal(fd.state,'open');tickFrontierAidReceiving(fo,FRONTIER_MUTUAL_AID.settleR);assert.equal(guides(fresh).length,0);assert.equal(fd.receivingDebtorGen,null);assert.equal(fresh.state.entityList.filter(e=>e.alive&&e.data?.frontierAidId===d.id).length,1);
 }finally{h.sim.dispose();fresh.sim.dispose();}
});

