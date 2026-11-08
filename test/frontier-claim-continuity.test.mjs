// Physically claimed salvage gets bounded save retention.
// Run: node --test test/frontier-claim-continuity.test.mjs

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
test('only exact living player line retains an existing claim; saved body keeps its actual pose',async()=>{const {save}=await import('../src/save/saveSystem.js');const h=scenario();try{h.o._tickDisputes(h.state);assert.notEqual(h.w.flags.persistent,true);const a=attach(h);a.targetGeneration++;h.o._tickDisputes(h.state);assert.notEqual(h.w.flags.persistent,true);a.targetGeneration--;h.o._tickDisputes(h.state);assert.equal(h.w.flags.persistent,true);assert.equal(h.w.data.frontierClaimRetention,h.d.id);h.w.pos.x+=80;const saver=Object.assign(Object.create(save),{state:h.state,bus:h.bus,helpers:h.sim.helpers,registry:h.sim.registry}),row=saver._serializeEntities().persistent.find(e=>e.data?.frontierClaimRetention===h.d.id);assert.ok(row);assert.equal(row.pos.x,h.w.pos.x);assert.equal(h.d.state,'open');assert.equal(h.grants.length,0);}finally{h.sim.dispose();}});
test('lapse and jump release only the retained original body, preserving later owners',()=>{for(const mode of ['lapsed','jumped','later-mission','recycled']){const h=scenario();try{attach(h);h.o._tickDisputes(h.state);if(mode==='later-mission')h.w.data.missionId='later-owner';if(mode==='recycled')h.w.occupantGeneration++;h.o._closeDispute(h.state,h.d,mode==='jumped'?'jumped':'lapsed',null);assert.equal(h.w.flags.persistent,mode==='later-mission'||mode==='recycled');if(mode!=='recycled')assert.equal(h.w.data.frontierClaimRetention,undefined);}finally{h.sim.dispose();}}});
test('unrelated protected or world-owned bodies are not retained by this scene',()=>{for(const key of ['missionId','missionTargetSlot','wreckMissionId','worldRecordId']){const h=scenario();try{attach(h);h.w.data[key]='foreign';assert.equal(retainFrontierClaimCarry(h.state,h.d,h.w),false);assert.equal(h.w.data.frontierClaimRetention,undefined);}finally{h.sim.dispose();}}});
test('native retained haul restores into a fresh world, can be recaught and settled once',{timeout:120000},async()=>{
 const {bootRealPath,writeRealPathInput}=await import('../scripts/lib/bench/realPath.mjs');const {combat}=await import('../src/systems/combat.js');const {tetherGameplay}=await import('../src/systems/tetherGameplay.js');const {lineProgression}=await import('../src/systems/lineProgression.js');const {economy}=await import('../src/systems/economy.js');const {save}=await import('../src/save/saveSystem.js');
 const systems=[frontierHomesteads,economy,combat,tetherGameplay,lineProgression,'flightV3','physics'];let h=await bootRealPath({seed:9091,systems,hulls:[{hullId:'ship_pelican',isPlayer:true,pos:{x:650,z:-500},rot:0}]});
 const prepare=()=>{h.state.mode='flight';h.state.run.kind='adventure';h.state.world.currentSectorId='sector_io_reach';return h.runtime.getSystem('frontierHomesteads');};let o=prepare();
 const saveOwner=()=>Object.assign(Object.create(save),{state:h.state,bus:h.bus,helpers:o.helpers,registry:{get:n=>h.runtime.getSystem(n)}});
 async function fly(goal,speed=12){for(let n=0;n<16000;n++){const p=h.player,x=goal.x-p.pos.x,z=goal.z-p.pos.z;if(Math.hypot(x,z)<2&&Math.hypot(p.vel.x,p.vel.z)<1)return;const sc=Math.min(.5,speed/Math.max(1,Math.hypot(x,z))),ax=(x*sc-p.vel.x)*.12,az=(z*sc-p.vel.z)*.12,c=Math.cos(p.rot),sn=Math.sin(p.rot);writeRealPathInput(h.state,{moveZ:ax*c+az*sn,moveX:-ax*sn+az*c});h.step(1);}assert.fail('haul timed out');}
 function catchBody(w){writeRealPathInput(h.state,{});h.state.input.tetherMode='cursor';h.state.input.aimWorld={x:w.pos.x,z:w.pos.z};h.state.input.actions.tetherFire=true;h.step(2);h.state.input.actions.tetherFire=false;assert.equal(h.state.player.tether.targetId,w.id);}
 try{const f=ensureFrontierState(h.state);f.nextDebtAt=99999;
 function stead(x,name){const e=o.helpers.spawnEntity({type:'station',pos:{x,z:0},radius:60,mass:1e6,hull:2000,hullMax:2000,collides:true,physicsBody:{shape:'ball',radius:60,mass:1e6,dynamic:false},flags:{persistent:true},data:{homestead:true,name}});f.homesteads.push({entityId:e.id,gen:e.occupantGeneration,name,pos:{...e.pos},sectorId:'sector_io_reach',raisedAt:0,lastSupplyAt:0,supplies:1,traffic:0});return e;}
 stead(0,'South Window');stead(1500,'Open Hearth');let w=o.helpers.spawnEntity({type:'wreck',pos:{x:750,z:0},radius:8,mass:12,hull:50,hullMax:50,collides:true,physicsBody:{shape:'ball',radius:8,mass:12,dynamic:true},data:{name:'Filed drifting hulk'}});o._tickDisputes(h.state);const id=f.disputes.find(d=>d.wreckId===w.id).id;
 await fly({x:650,z:0});catchBody(w);await fly({x:530,z:0});assert.equal(w.flags.persistent,true);const pose={x:h.player.pos.x,z:h.player.pos.z},rot=h.player.rot,time=h.state.simTime,position={...w.pos};const entities=saveOwner()._serializeEntities(),frontier=structuredClone(o.serialize());assert.ok(entities.persistent.some(e=>e.data?.frontierClaimRetention===id));h.dispose();
 h=await bootRealPath({seed:9091,systems,hulls:[{hullId:'ship_pelican',isPlayer:true,pos:pose,rot}]});o=prepare();h.state.simTime=time;const remap=new Map(),restorer=saveOwner();for(let cursor=0;cursor<entities.persistent.length;){const next=restorer._spawnPersistentEntities(structuredClone(entities.persistent),remap,{startIndex:cursor,clearStale:cursor===0});assert.ok(next>cursor);cursor=next;}o.deserialize(frontier);h.state.sessionEntityIdRemap=remap;h.bus.emit('save:loaded',{});w=h.state.entityList.find(e=>e.alive&&e.data?.frontierClaimRetention===id);assert.ok(w);assert.ok(Math.hypot(w.pos.x-position.x,w.pos.z-position.z)<.001);const d=h.state.frontier.disputes.find(d=>d.id===id);assert.equal(d.wreckGen,w.occupantGeneration);const grants=[];let impacts=0;h.bus.on('economy:grantCredits',e=>grants.push(e));h.bus.on('physics:impact',e=>{if([h.player.id,w.id].includes(e.aId)||[h.player.id,w.id].includes(e.bId))impacts++;});catchBody(w);await fly({x:220,z:0});writeRealPathInput(h.state,{});h.state.input.actions.reelDelta=-1;for(let n=0;n<1200&&d.state==='open';n++)h.step(1);h.state.input.actions.reelDelta=0;assert.equal(d.state,'settled');assert.equal(w.alive,false);h.step(60);assert.equal(grants.filter(e=>e.reason===`frontier_claim:${id}`).length,1);assert.equal(h.state.entityList.filter(e=>e.alive&&e.data?.frontierClaimRetention===id).length,0);console.log('CLAIM_RESTORED_NATIVE',JSON.stringify({time:h.state.simTime,restoreAt:time,impacts,payment:grants.filter(e=>e.reason===`frontier_claim:${id}`)}));
 }finally{h.dispose();}
});
