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

async function loadedRig(){
 const h=await nativeFixture();h.physics.ensureTemplates(h.w);h.step(3);
 const rig=h.w.rigs.find(r=>r.template==='sled');h.w.activeRigId=rig.id;
 const holder=rig.partIds.map(id=>h.state.entities.get(id)).find(e=>e.data.rigWorkshop.partType==='collector');
 const loads=[['Heavy original',40,-7],['Light original',12,7]].map(([name,mass,z])=>h.physics.spawnBody({type:'payload',ownerId:h.player.id,team:0,pos:{x:holder.pos.x+4,z:holder.pos.z+z},vel:{x:0,z:0},radius:2,mass,hull:100,hullMax:100,collides:true,data:{name,ownerId:h.player.id},physicsBody:{schemaVersion:1,dynamic:true,shape:'ball',radius:2,mass,inertiaY:mass*2,revision:0,ccd:true}}));
 h.step(2);for(const load of loads)assert.equal(h.physics.captureCargo(h.w,rig.id,load.id).ok,true);h.step(3);
 const system=createRigWorkshopSystem();system.init(h.sim.registry.ctx);
 const choose=id=>{const p=h.w.prompt;return system.choose({promptId:p.id,revision:p.revision,choiceId:id});};
 return Object.assign(h,{rig,loads,system,choose,finish(){system.destroy();h.close();}});
}
test('field recovery offers exact secured cargo and releases the earlier heavy original only',async()=>{
 const h=await loadedRig();try{
 const [heavy,light]=h.loads;h.system._showField();h.choose('more');h.choose('releaseCargo');
 const menu=h.w.prompt;assert.equal(menu.options.length,4);assert.match(menu.options[0].label,/Heavy original.*40 t/);assert.match(menu.options[1].label,/Light original.*12 t/);
 assert.ok(menu.options.some(o=>o.id==='back'));assert.ok(menu.options.some(o=>o.id==='close'));
 const pose=clone(heavy.pos),vel=clone(heavy.vel),credit=h.state.player.credits,stock=h.w.stock;
 h.choose(`release:${heavy.id}:${heavy.occupantGeneration}`);
 assert.equal(h.physics.isCargoSecured(h.w,h.rig.id,heavy.id),false);assert.equal(h.physics.isCargoSecured(h.w,h.rig.id,light.id),true);
 assert.deepEqual(clone(heavy.pos),pose);assert.deepEqual(clone(heavy.vel),vel);assert.equal(heavy.alive,true);assert.equal(h.state.player.credits,credit);assert.equal(h.w.stock,stock);
 assert.equal(h.system.choose({promptId:menu.id,revision:menu.revision,choiceId:menu.options[0].id}),false);
 h.step(5);assert.equal(h.physics.isCargoSecured(h.w,h.rig.id,light.id),true);
 }finally{h.finish();}
});
test('Back and Leave release nothing, and changed cargo generation cannot authorize a cut',async()=>{
 const h=await loadedRig();try{
 h.system._showCargoRelease();h.choose('back');assert.equal(h.rig.cargoIds.length,2);
 h.system._showCargoRelease();h.choose('close');assert.equal(h.rig.cargoIds.length,2);assert.equal(h.w.prompt,null);
 h.system._showCargoRelease();const choice=h.w.prompt.options[0].id;const heavy=h.loads[0];const edge=h.rig.connections.find(e=>e.childId===heavy.id);const oldGen=heavy.occupantGeneration;heavy.occupantGeneration++;
 h.choose(choice);assert.equal(h.physics.kernel.attachments.get(edge.attachmentIds[0]).state,'active');assert.equal(h.rig.cargoIds.length,2);heavy.occupantGeneration=oldGen;
 }finally{h.finish();}
});
test('switching active machine or breaking its restraint invalidates old cargo choice',async()=>{
 const h=await loadedRig();try{
 h.system._showCargoRelease();let choice=h.w.prompt.options[0].id;h.w.activeRigId=h.w.rigs.find(r=>r!==h.rig).id;
 h.choose(choice);assert.equal(h.rig.cargoIds.length,2);
 h.w.activeRigId=h.rig.id;h.system._showCargoRelease();choice=h.w.prompt.options[0].id;
 const edge=h.rig.connections.find(e=>e.childId===h.loads[0].id);h.physics.kernel.attachments.cut(edge.attachmentIds[0],null,'test_break');h.step(1);
 h.choose(choice);assert.equal(h.physics.isCargoSecured(h.w,h.rig.id,h.loads[1].id),true);
 }finally{h.finish();}
});
test('cold owner save restores the retained load but does not recapture the selected released original',async()=>{
 const h=await loadedRig(),cold=await nativeFixture();try{
 h.system._showCargoRelease();h.choose(`release:${h.loads[0].id}:${h.loads[0].occupantGeneration}`);
 const snapshot=clone(captureRigWorkshop(h.state));assert.equal(snapshot.workshop.prompt,undefined);
 const restored=restoreRigWorkshop(cold.state,snapshot,cold.physics);assert.equal(restored.ok,true,restored.reason);cold.step(3);
 const rig=cold.w.rigs.find(r=>r.id===h.rig.id);assert.deepEqual(rig.cargoIds,[h.loads[1].id]);
 assert.equal(cold.physics.isCargoSecured(cold.w,rig.id,h.loads[1].id),true);assert.equal(cold.state.entities.get(h.loads[0].id).alive,true);
 }finally{cold.close();h.finish();}
});
test('native momentum and other cargo survive the selected clamp release through the actual prompt adapter',async()=>{
 const h=await loadedRig();let shown;const deck={offerDecision(spec){shown=spec;return true;},resolveDecision(){shown=null;return true;}};
 const ui=createRigWorkshopPresentation({state:h.state,bus:h.bus,getDeck:()=>deck});
 try{
 const root=h.state.entities.get(h.rig.partIds[0]);queuePhysicsImpulse(root,{x:200,z:0});h.step(10);
 const [heavy,light]=h.loads;assert.ok(Math.hypot(heavy.vel.x,heavy.vel.z)>0.01,'native constraint transmits real impulse');
 h.system._showField();shown.onChoose('more','keyboard');shown.onChoose('releaseCargo','keyboard');
 assert.ok(shown.choices.some(c=>c.id==='close'));assert.ok(shown.choices.some(c=>c.id==='back'));assert.equal(shown.choices.length,4);
 const velocity=clone(heavy.vel),position=clone(heavy.pos);shown.onChoose(`release:${heavy.id}:${heavy.occupantGeneration}`,'keyboard');
 assert.deepEqual(clone(heavy.vel),velocity);assert.deepEqual(clone(heavy.pos),position);
 assert.equal(h.physics.isCargoSecured(h.w,h.rig.id,light.id),true);h.step(15);
 assert.ok(Math.hypot(heavy.pos.x-position.x,heavy.pos.z-position.z)>0.001,'released body continues through native physics');
 assert.equal(h.rig.cargoIds.includes(heavy.id),false);assert.equal(h.rig.cargoIds.includes(light.id),true);
 }finally{ui.destroy();h.finish();}
});
test('a replaced body object and leaving flight cannot use a previously offered release',async()=>{
 const h=await loadedRig();try{
 const original=h.loads[0],edge=h.rig.connections.find(e=>e.childId===original.id);
 h.system._showCargoRelease();let choice=h.w.prompt.options[0].id;
 const replacement={...original,data:{...original.data}};h.state.entities.set(original.id,replacement);
 h.choose(choice);assert.equal(h.physics.kernel.attachments.get(edge.attachmentIds[0]).state,'active');h.state.entities.set(original.id,original);
 h.system._showCargoRelease();choice=h.w.prompt.options[0].id;h.state.mode='menu';h.choose(choice);
 assert.equal(h.physics.kernel.attachments.get(edge.attachmentIds[0]).state,'active');assert.equal(h.rig.cargoIds.length,2);
 }finally{h.finish();}
});
