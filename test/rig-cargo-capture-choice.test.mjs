import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner, createSg02CombatPhysicsPort } from '../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse, readPhysicsTelemetry } from '../src/core/physicsAuthority.js';
import { economy } from '../src/systems/economy.js';
import * as THREE from 'three';
import { routeDigit, planSlotClaim } from '../src/ui/promptDeck.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { PART_LIST, partBodySpec } from '../src/features/rigWorkshop/parts.js';
import { createRigPhysicsAdapter } from '../src/features/rigWorkshop/physics.js';
import { createRigWorkshopSystem, freshRigWorkshop } from '../src/features/rigWorkshop/runtime.js';
import { createWorkshopJobs } from '../src/features/rigWorkshop/jobs.js';
import { createRigWorkshopRender, buildRigWorkshopBody } from '../src/features/rigWorkshop/render.js';
import { captureRigWorkshop, restoreRigWorkshop } from '../src/features/rigWorkshop/persistence.js';
import { rigWorkshopSavePlanEntry, captureRigWorkshopSaveSlot, restoreRigWorkshopSaveSlot } from '../src/features/rigWorkshop/integration.js';
import { createRigWorkshopView } from '../src/features/rigWorkshop/view.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { physics as productionPhysics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { buildEntitySpawnSpec } from '../src/testing/lab/entityProfiles.js';
import {
  createRigWorkshopPresentation, rigWorkshopDecision, buildRigWorkshopReadModel,
} from '../src/features/rigWorkshop/presentation.js';

const DT = 1 / 60;
const clone = (value) => JSON.parse(JSON.stringify(value));

async function nativeFixture() {
  const native = await createSg02DynamicBodyOwner();
  const helpers = { combatPhysics: createSg02CombatPhysicsPort(native) };
  const sim = createSimulation({ seed: 8202, systems: [economy], helpers, updateOrder: [] });
  const { state, bus } = sim;
  state.mode = 'flight'; state.world.currentSectorId = 'sector_ceres_belt';
  state.player.credits = 1000;
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 1000, hullMax: 1000, collides: true,
    physicsBody: { schemaVersion: 1, dynamic: true, shape: 'ball', radius: 8, mass: 100,
      inertiaY: 3000, ccd: true, revision: 0, useMeasuredSkin: false }, data: {} });
  state.playerId = player.id;
  const w = state.rigWorkshop = { version: 1, ownerId: 'pilot:8202',
    bench: { pos: { x: 0, z: 0 }, sectorId: state.world.currentSectorId }, rigs: [], stock: 8, jobs: {}, receipts: [] };
  const physics = createRigPhysicsAdapter(sim.registry.ctx);
  const events = [];
  bus.on('economy:grantCredits', (payload) => events.push(payload));
  const step = (ticks = 1) => {
    for (let i = 0; i < ticks; i++) {
      sim.step(DT);
      native.syncFromEntities(state.entityList);
      physics.update(DT, state.rigWorkshop);
      physics.kernel.prePhysics(DT);
      native.step(DT);
      physics.kernel.postPhysics();
    }
  };
  return { native, sim, state, bus, get w() { return state.rigWorkshop; }, player, physics, events, step,
    close() { physics.dispose(); native.dispose(); sim.dispose(); } };
}

async function looseRig(){
 const h=await nativeFixture();h.physics.ensureTemplates(h.w);h.step(3);
 const rig=h.w.rigs.find(r=>r.template==='sled');h.w.activeRigId=rig.id;
 const holder=rig.partIds.map(id=>h.state.entities.get(id)).find(e=>e.data.rigWorkshop.partType==='collector');
 const loads=[['Heavy original',40,-7],['Light original',12,7]].map(([name,mass,z])=>h.physics.spawnBody({type:'payload',ownerId:h.player.id,team:0,pos:{x:holder.pos.x+4,z:holder.pos.z+z},vel:{x:0,z:0},radius:2,mass,hull:100,hullMax:100,collides:true,data:{name,ownerId:h.player.id},physicsBody:{schemaVersion:1,dynamic:true,shape:'ball',radius:2,mass,inertiaY:mass*2,revision:0,ccd:true}}));
 h.step(2);
 const system=createRigWorkshopSystem();system.init(h.sim.registry.ctx);
 const choose=id=>{const p=h.w.prompt;return system.choose({promptId:p.id,revision:p.revision,choiceId:id});};
 return Object.assign(h,{rig,loads,system,choose,finish(){system.destroy();h.close();}});
}

const choiceFor=(h,body)=>`capture:${body.id}:${body.occupantGeneration}`;
test('ordinary field menu selects the lighter original rather than the nearest heavy load',async()=>{
 const h=await looseRig();try{
 h.system._showField();h.choose('capture');const light=h.loads[1],heavy=h.loads[0];
 assert.ok(h.w.prompt.options.some(c=>c.id===choiceFor(h,light)));
 const before={pos:{x:light.pos.x,z:light.pos.z},credits:h.state.player.credits};
 h.choose(choiceFor(h,light));h.step(2);
 assert.equal(h.physics.isCargoSecured(h.w,h.rig.id,light.id),true);
 assert.equal(h.physics.isCargoSecured(h.w,h.rig.id,heavy.id),false);
 assert.equal(h.state.entities.get(light.id),light);assert.equal(light.mass,12);
 assert.equal(h.state.player.credits,before.credits);assert.equal(h.events.length,0);
 }finally{h.finish();}
});
test('selection excludes foreign and out-of-reach loads and refuses stale original or changed ownership',async()=>{
 const h=await looseRig();try{
 const [heavy,light]=h.loads;
 light.ownerId=999;light.data.ownerId=999;h.system._showCargoCapture();
 assert.ok(!h.w.prompt.options.some(c=>c.id===choiceFor(h,light)));
 const id=choiceFor(h,heavy);heavy.ownerId=999;heavy.data.ownerId=999;
 h.choose(id);assert.equal(h.physics.isCargoSecured(h.w,h.rig.id,heavy.id),false);
 heavy.ownerId=h.player.id;heavy.data.ownerId=h.player.id;h.system._showCargoCapture();
 const old=choiceFor(h,heavy);heavy.occupantGeneration++;h.choose(old);
 assert.equal(h.physics.isCargoSecured(h.w,h.rig.id,heavy.id),false);
 heavy.pos.x+=200;h.system._showCargoCapture();assert.ok(!h.w.prompt.options.some(c=>c.id===choiceFor(h,heavy)));
 }finally{h.finish();}
});
test('native owner rejects a selected load that moves out of reach or accelerates before the clamp command',async()=>{
 const h=await looseRig();try{
 const heavy=h.loads[0];h.system._showCargoCapture();const id=choiceFor(h,heavy);
 heavy.pos.x+=100;h.choose(id);assert.equal(h.physics.isCargoSecured(h.w,h.rig.id,heavy.id),false);
 heavy.pos.x-=100;h.system._showCargoCapture();heavy.vel.x=100;h.choose(choiceFor(h,heavy));
 assert.equal(h.physics.isCargoSecured(h.w,h.rig.id,heavy.id),false);
 }finally{h.finish();}
});
test('bounded load pages retain every local original and Back/Leave without capturing anything',async()=>{
 const h=await looseRig();try{
 const base=h.loads[0];
 for(let i=0;i<10;i++)h.physics.spawnBody({type:'payload',ownerId:h.player.id,pos:{x:base.pos.x,z:base.pos.z},vel:{x:0,z:0},radius:1,mass:1,hull:10,hullMax:10,data:{name:`Fixture ${i}`,ownerId:h.player.id},physicsBody:{schemaVersion:1,dynamic:true,shape:'ball',radius:1,mass:1,inertiaY:1,revision:0}});
 h.system._showCargoCapture();const seen=new Set();
 for(let page=0;page<3;page++){
  assert.ok(h.w.prompt.options.length<=9);assert.ok(h.w.prompt.options.some(c=>c.id==='back'));assert.ok(h.w.prompt.options.some(c=>c.id==='close'));
  for(const c of h.w.prompt.options)if(c.id.startsWith('capture:'))seen.add(c.id);
  if(page<2)h.choose('next');
 }
 assert.equal(seen.size,12);h.choose('close');assert.equal(h.rig.cargoIds.length,0);
 }finally{h.finish();}
});
test('actual prompt adapter selects one original; native restraint carries it and cold owner restore preserves only that choice',async()=>{
 const h=await looseRig(),cold=await nativeFixture();let shown;
 const deck={offerDecision(spec){shown=spec;return true;},resolveDecision(){shown=null;return true;}};
 const ui=createRigWorkshopPresentation({state:h.state,bus:h.bus,getDeck:()=>deck});
 try{
 h.system._showField();shown.onChoose('capture','keyboard');
 assert.equal(shown.choices.length,4);assert.ok(shown.choices.some(c=>c.id==='back'));
 const light=h.loads[1],heavy=h.loads[0];shown.onChoose(choiceFor(h,light),'keyboard');h.step(3);
 assert.equal(h.physics.isCargoSecured(h.w,h.rig.id,light.id),true);
 const start=clone(light.pos),root=h.state.entities.get(h.rig.partIds[0]);
 queuePhysicsImpulse(root,{x:200,z:0});h.step(30);
 assert.ok(Math.hypot(light.pos.x-start.x,light.pos.z-start.z)>.001,'native restraint transmits rig movement');
 const snapshot=clone(captureRigWorkshop(h.state));assert.equal(snapshot.workshop.prompt,undefined);
 assert.equal(restoreRigWorkshop(cold.state,snapshot,cold.physics).ok,true);cold.step(3);
 const rig=cold.w.rigs.find(r=>r.id===h.rig.id);
 assert.deepEqual(rig.cargoIds,[light.id]);assert.equal(cold.physics.isCargoSecured(cold.w,rig.id,light.id),true);
 assert.equal(rig.cargoIds.includes(heavy.id),false);
 }finally{ui.destroy();cold.close();h.finish();}
});
test('Back, changed rig and a same-ID replacement cannot clamp an unintended body',async()=>{
 const h=await looseRig();try{
 h.system._showCargoCapture();h.choose('back');assert.equal(h.rig.cargoIds.length,0);
 h.system._showCargoCapture();const light=h.loads[1],id=choiceFor(h,light);
 const replacement={...light};h.state.entities.set(light.id,replacement);h.choose(id);
 assert.equal(h.physics.isCargoSecured(h.w,h.rig.id,light.id),false);h.state.entities.set(light.id,light);
 h.system._showCargoCapture();h.w.activeRigId=h.w.rigs.find(r=>r.id!==h.rig.id).id;h.choose(choiceFor(h,light));
 assert.equal(h.physics.isCargoSecured(h.w,h.rig.id,light.id),false);
 }finally{h.finish();}
});
