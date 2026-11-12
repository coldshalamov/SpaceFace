// Scene-owned retention is reconciled without unpinning unrelated bodies.
// Run: node --test test/frontier-claim-retention-reconcile.test.mjs

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

import {retainFrontierClaimCarry,releaseFrontierClaimCarry} from '../src/missions/frontierClaimContinuity.js';

function attach(h){const id='claim-line';h.state.player.tether={active:true,targetId:h.w.id,attachmentId:id};h.state.combat={...(h.state.combat||{}),attachments:{byId:{[id]:{id,state:'active',ownerId:h.player.id,ownerGeneration:h.player.occupantGeneration,targetId:h.w.id,targetGeneration:h.w.occupantGeneration}}}};return h.state.combat.attachments.byId[id];}

import {reconcileFrontierClaimRetention} from '../src/missions/frontierClaimContinuity.js';

test('live exact claim keeps retention; dropped ledger releases only its own pin without moving or paying',()=>{const h=scenario();try{attach(h);h.o._tickDisputes(h.state);reconcileFrontierClaimRetention(h.state);assert.equal(h.w.flags.persistent,true);const before={...h.w.pos};h.state.frontier.disputes=[];reconcileFrontierClaimRetention(h.state);assert.equal(h.w.flags.persistent,false);assert.equal(h.w.data.frontierClaimRetention,undefined);assert.deepEqual({...h.w.pos},before);assert.equal(h.grants.length,0);reconcileFrontierClaimRetention(h.state);assert.equal(h.grants.length,0);}finally{h.sim.dispose();}});
test('real normalization/update releases malformed-row orphan, leaving actual wreck untouched',()=>{const h=scenario();try{attach(h);h.o._tickDisputes(h.state);h.state.player.tether.active=false;h.state.frontier.disputes=[null];h.w.pos.x=5000;const before={...h.w.pos};h.o.update(1/60,h.state);assert.equal(h.w.flags.persistent,false);assert.equal(h.w.alive,true);assert.deepEqual({...h.w.pos},before);}finally{h.sim.dispose();}});
test('recycled, legacy, conflicting-tag and later-owned bodies are never blindly unpinned',()=>{for(const variant of ['recycled','legacy','conflict','mission','world']){const h=scenario();try{attach(h);h.o._tickDisputes(h.state);h.state.frontier.disputes=[];if(variant==='recycled')h.w.occupantGeneration++;if(variant==='legacy')delete h.w.data.frontierClaimRetentionVersion;if(variant==='conflict')h.w.data.frontierDisputeId='other';if(variant==='mission')h.w.data.missionId='later';if(variant==='world')h.w.data.worldRecordId='later';reconcileFrontierClaimRetention(h.state);assert.equal(h.w.flags.persistent,true);}finally{h.sim.dispose();}}});
test('fresh restore requires matching serialized life proof and map, not recycled tags',async()=>{const {save}=await import('../src/save/saveSystem.js');for(const missing of [false,true,'recycled','malformed-proof']){const h=scenario(),fresh=boot();try{attach(h);h.o._tickDisputes(h.state);if(missing==='recycled')h.w.occupantGeneration++;const saver=Object.assign(Object.create(save),{state:h.state,bus:h.bus,helpers:h.sim.helpers,registry:h.sim.registry}),rows=saver._serializeEntities().persistent,data=structuredClone(h.o.serialize());data.disputes=[];if(missing==='malformed-proof')data.claimCarryBindings={};const restorer=Object.assign(Object.create(save),{state:fresh.state,bus:fresh.bus,helpers:fresh.sim.helpers,registry:fresh.sim.registry}),remap=new Map();for(let cursor=0;cursor<rows.length;){const next=restorer._spawnPersistentEntities(structuredClone(rows),remap,{startIndex:cursor,clearStale:cursor===0});assert.ok(next>cursor);cursor=next;}const fo=ownerOf(fresh);fo.deserialize(data);fresh.state.sessionEntityIdRemap=missing===true?new Map():remap;fresh.bus.emit('save:loaded',{});const w=fresh.state.entityList.find(e=>e.alive&&e.data?.frontierDisputeId===h.d.id);assert.ok(w);assert.equal(w.flags.persistent,!!missing);reconcileFrontierClaimRetention(fresh.state);assert.equal(w.flags.persistent,!!missing);if(missing)assert.equal(w.data.frontierClaimRetentionLife,null);else assert.equal(w.data.frontierClaimRetention,undefined);assert.equal(fresh.grants.length,0);}finally{h.sim.dispose();fresh.sim.dispose();}}});
