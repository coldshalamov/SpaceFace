import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { cargo, addCargo, cargoUnitVolume, sellableCargoQuantity } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { combat } from '../src/systems/combat.js';
import { stationServices } from '../src/systems/stationServices.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { PRODUCTION_FEATURES, applyFeatureConfigToMaps, snapshotFeatureMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { world as worldOwner } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';
import { salvageTender, createSalvageTenderSystem, SALVAGE_TENDER_ENCOUNTER_RUNTIME, getSalvageTenderOwner } from '../src/features/salvageTender/runtime.js';
import { findTenderBody, TENDER_BODY_ID } from '../src/features/salvageTender/physical.js';
import { getSalvageTenderReadModel, getSalvageTenderHomeMarker, getSalvageTenderMapMarkers, filterSalvageTenderMapContacts } from '../src/features/salvageTender/readModel.js';
import { salvageTenderPrompt, createSalvageTenderPromptSystem } from '../src/features/salvageTender/prompts.js';
import { freshSalvageTender, discoverTenderState } from '../src/features/salvageTender/model.js';
import { createSalvageTenderPresentation, TENDER_EQUIPMENT, bindSalvageTenderAudio } from '../src/features/salvageTender/presentation.js';
import { bindNocturneScene, createLogicalLight, unbindNocturneScene } from '../src/render/nocturne/bridge.js';
import { NocturneRegistry } from '../src/render/nocturne/registry.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';
import { resolveCourseTarget, commitCoursePayload, resolveGalaxyMapPrimaryAction } from '../src/ui/galaxyMap.js';

const SECTOR = 'sector_helios_prime';
const DT = 1 / 60;
const clone = value => JSON.parse(JSON.stringify(value));

// Focused explicit host: real simulation, cargo, credits, repair delivery, combat attachments,
// and (where requested) the production Rapier authority. This is not a full-render acceptance.
async function boot({ native = false, credits = 1000, discover = true, saving = false, prompts = false } = {}) {
  const systems = [...(native ? [physics] : []), cargo, economy, stationServices, combat, salvageTender,
    ...(saving ? [save] : []), ...(prompts ? [salvageTenderPrompt] : [])];
  const sim = createSimulation({ seed: 34310, systems,
    updateOrder: [cargo, economy, stationServices, salvageTender, ...(native ? [physics] : []), combat] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  state.player.credits = credits;
  state.player.cargo.capVolume = 100;
  state.player.cargo.capMass = 10000;
  const pilotSpec = makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: state.player });
  state.player.ownedShips = [{ defId: 'ship_kestrel', vesselId: 'test:salvageTender:pilot', fittings: pilotSpec.data.fittings }];
  const player = sim.spawn({ ...pilotSpec,
    type: 'ship', team: 0, isPlayer: true, radius: 6, mass: 100,
    pos: { x: 100, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0, angVel: 0,
    hull: 100, hullMax: 100, armorHp: 0, armorMax: 0, shield: 0, shieldMax: 0,
    flags: {}, data: { ...pilotSpec.data, defId: 'ship_kestrel' },
    physicsBody: { schemaVersion: 1, radius: 6, mass: 100, inertiaY: 400,
      dynamic: true, shape: 'ball', ccd: true, revision: 0 },
  });
  state.playerId = player.id;
  state.fuel = { current: 20, max: 100 };
  const tender = sim.registry.get('salvageTender');
  if (discover) tender.discover({ sectorId: SECTOR, anchor: { x: 0, z: 0 } });
  const p = native ? sim.registry.get('physics') : null;
  if (p) assert.equal(await p.prepareBackend(state), true, 'real native physics must initialize');
  return {
    sim, state, bus, tender, physics: p,
    get player() { return state.entities.get(state.playerId); },
    get row() { return state.salvageTender; },
    get body() { return findTenderBody(state); },
    action(action, options = {}) { return tender.act(action, state.salvageTender.revision, options); },
    advance(seconds) { for (let i = 0; i < Math.ceil(seconds / DT); i++) sim.step(DT); },
    close() {
      for (const system of [...sim.registry.systems].reverse()) system.destroy?.();
      p?._sg02?.dispose?.();
      sim.dispose();
    },
  };
}

test('departure plan names finite originals, plots only and conserves all supplies', async()=>{
 const h=await boot({native:true});try{
 h.row.owned=true; h.row.stage=2; h.player.hull=60;
 const before=JSON.stringify(h.row.physical.recovery.map(r=>r.manifest));
 const credits=h.state.player.credits; let course;h.bus.on('ui:setCourse',p=>course=p);
 assert.equal(h.tender.inspect('service').ok,true);
 assert.ok(h.tender._offer.choices.find(c=>c.id==='departure_menu'));
 h.action('menu',{page:'departure'});
 const c=h.tender._offer.choices.find(c=>c.options.action==='supply_course');assert.ok(c);
 assert.match(h.tender._offer.detail,/80.0 fuel/); assert.match(h.tender._offer.detail,/40.0 hull/);
 const source=h.state.entities.get(c.options.bodyId);
 assert.equal(h.action('supply_course',c.options).ok,true);
 assert.equal(course.autopilot,false);assert.deepEqual(course.pos,{x:source.pos.x,z:source.pos.z});
 assert.equal(h.row.service,null);assert.equal(h.state.player.credits,credits);
 assert.equal(JSON.stringify(h.row.physical.recovery.map(r=>r.manifest)),before);
 }finally{h.close();}
});
test('departed pilot and depleted or replaced locker refuse stale supply course', async()=>{
 const h=await boot({native:true});try{
 h.row.owned=true;h.row.stage=2;h.tender.inspect('departure');
 const c=h.tender._offer.choices.find(c=>c.options.action==='supply_course');assert.ok(c);
 let count=0;h.bus.on('ui:setCourse',()=>count++);
 h.player.pos.x=10000;assert.equal(h.action('supply_course',c.options).ok,false);h.player.pos.x=100;
 const source=h.state.entities.get(c.options.bodyId);
 const manifest=source.data.cargoManifest;for(const l of manifest.lines)l.qty=0;manifest.totalQty=0;
 assert.equal(h.action('supply_course',c.options).ok,false);assert.equal(count,0);
 h.tender.inspect('departure');assert.ok(!h.tender._offer.choices.some(x=>x.options.sourceId===c.options.sourceId));
 }finally{h.close();}
});
test('booked work is disclosed without double booking and full ship does not invent a supply need',async()=>{
 const h=await boot({native:true});try{
 h.row.owned=true;h.row.stage=2;
 addCargo(h.state,'cmdty_fuel_cells',1);assert.equal(h.action('refuel').ok,true);
 const paid=JSON.stringify(h.row.service);h.tender.inspect('departure');
 assert.match(h.tender._offer.detail,/not subtracted/);assert.equal(JSON.stringify(h.row.service),paid);
 h.state.fuel.current=h.state.fuel.max;h.player.hull=h.player.hullMax;
 h.tender.inspect('departure');assert.equal(h.tender._offer.choices.filter(c=>c.options.action==='supply_course').length,0);
 assert.match(h.tender._offer.detail,/nothing is replenished/);
 }finally{h.close();}
});
test('cold restore recomputes supply routes from original manifests without storing a parallel plan',async()=>{
 const h=await boot({native:true,saving:true});let envelope;
 try{h.row.owned=true;h.row.stage=2;h.tender.inspect('departure');envelope=clone(h.sim.registry.get('save').serialize('departure-plan'));}finally{h.close();}
 const g=await boot({native:true,saving:true,discover:false});try{
 assert.equal(g.sim.registry.get('save').loadEnvelope(envelope,'departure-plan'),true);g.advance(DT*2);
 assert.equal(g.tender.inspect('departure').ok,true);
 const c=g.tender._offer.choices.find(c=>c.options.action==='supply_course');assert.ok(c);
 let course;g.bus.on('ui:setCourse',p=>course=p);assert.equal(g.action('supply_course',c.options).ok,true);
 assert.equal(course.targetEntityId,c.options.bodyId);assert.equal(g.row.service,null);
 }finally{g.close();}
});
test('planned fuel run reaches the marked original using starter flight and ordinary single-supply recovery',async()=>{
 const flags=snapshotFeatureMaps();let sim,native;
 try{
 applyFeatureConfigToMaps(PRODUCTION_FEATURES);
 sim=createSimulation({seed:34310,systems:[physics,combat,cargo,economy,stationServices,ships,flightV3,salvageTender],updateOrder:[combat,flightV3,salvageTender,physics,cargo,economy,stationServices],runtimeConfig:{profileId:'production',features:PRODUCTION_FEATURES}});
 const s=sim.state;s.mode='flight';s.world.currentSectorId=NEW_GAME.startingSectorId;
 sim.registry.get('ships').newGame();const owned=s.player.ownedShips[0];
 const player=sim.spawn(makeShipEntitySpec(owned.defId,{isPlayer:true,team:0,player:s.player,fittings:owned.fittings,pos:{x:20,z:80},rot:0}));s.playerId=player.id;
 const owner=sim.registry.get('salvageTender');assert.equal(owner.discover({sectorId:s.world.currentSectorId,anchor:{x:0,z:0}}).ok,true);
 native=sim.registry.get('physics');assert.equal(await native.prepareBackend(s),true);sim.step(DT);
 s.salvageTender.owned=true;s.salvageTender.stage=2;s.fuel.current=20;
 let marked;sim.bus.on('ui:setCourse',p=>marked=p);
 const departure=owner.inspect('departure').offer;const target=departure.choices.find(c=>c.options.action==='supply_course');assert.ok(target);
 assert.equal(owner.act('supply_course',departure.revision,target.options).ok,true);assert.equal(marked.autopilot,false);
 const pod=s.entities.get(marked.targetEntityId),origin={...player.pos};let reached=false;
 for(let tick=0;tick<60/DT;tick++){
 const gap=pod.pos.x-player.pos.x;
 s.input.moveZ=gap>65?0.12:0;s.input.moveX=0;s.input.turnIntent=0;s.input.brake=gap<85;s.input.boost=false;sim.step(DT);
 if(!owner.physical.canUnload(s.salvageTender,pod.id).ok)continue;
 const card=owner.inspect('cargo').offer;const take=card.choices.find(c=>c.id==='take_cmdty_fuel_cells');assert.ok(take);
 assert.equal(owner.act(take.options.action,card.revision,take.options).ok,true);reached=true;break;
 }
 assert.equal(reached,true);assert.ok(Math.hypot(player.pos.x-origin.x,player.pos.z-origin.z)>50);
 assert.equal(s.player.cargo.items.cmdty_fuel_cells,1);assert.equal(pod.data.cargoManifest.totalQty,10);
 console.log(JSON.stringify({nativeSelectiveLocker:{seconds:s.simTime,travel:Math.hypot(player.pos.x-origin.x,player.pos.z-origin.z),remaining:pod.data.cargoManifest.totalQty}}));
 }finally{for(const sys of [...(sim?.registry.systems||[])].reverse())sys.destroy?.();native?._sg02?.dispose?.();sim?.dispose();restoreFeatureMaps(flags);}
});

test('replaced locker and synchronous replacement cards cannot be acted on by old departure actions',async()=>{
 for(const change of ['generation','newGame','inspect']){
 const h=await boot({native:true});try{
 h.row.owned=true;h.row.stage=2;h.tender.inspect('departure');
 const c=h.tender._offer.choices.find(c=>c.options.action==='supply_course');
 if(change==='generation'){
 h.state.entities.get(c.options.bodyId).occupantGeneration++;
 assert.equal(h.action('supply_course',c.options).ok,false);
 }else{
 let replacement;h.bus.on('ui:setCourse',()=>{
 if(change==='newGame')h.tender.newGame();else h.tender.inspect('service');
 replacement=h.tender._offer;
 });
 assert.equal(h.action('supply_course',c.options).ok,true);
 assert.equal(h.tender._dismissed,false);assert.equal(h.tender._offer,replacement);
 }
 }finally{h.close();}
 }
});
