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


test('recovery-side return check conserves cargo and plots live home without booking',async()=>{
 const h=await boot();try{
 h.row.owned=true;h.row.stage=2;const crate=h.tender.physical.recoveryBodies(h.row)[0];
 h.player.pos.copy(crate.pos);h.player.vel.set(0,0,0);crate.vel.set(0,0,0);
 // Prepared recovered hold; the separate native flight test exercises actual unloading.
 addCargo(h.state,'cmdty_fuel_cells',1);
 h.tender.inspect('cargo');assert.ok(h.tender._offer.choices.some(c=>c.id==='supply_return_menu'));
 const before=JSON.stringify({cargo:h.state.player.cargo,service:h.row.service,credits:h.state.player.credits,stock:h.row.physical.recovery});
 assert.equal(h.tender.inspect('supply_return').ok,true);assert.match(h.tender._offer.detail,/1 unsealed fuel cells/);assert.match(h.tender._offer.detail,/Nothing is booked/);
 let course;h.bus.on('ui:setCourse',p=>course=p);h.body.pos.x+=20;
 assert.equal(h.action('supply_return_course').ok,true);assert.equal(course.autopilot,false);assert.equal(course.pos.x,h.body.pos.x);
 assert.equal(JSON.stringify({cargo:h.state.player.cargo,service:h.row.service,credits:h.state.player.credits,stock:h.row.physical.recovery}),before);
 }finally{h.close();}
});
test('return check respects unavailable bench, moving home and stale locality',async()=>{
 const h=await boot();try{h.row.owned=true;h.row.stage=1;h.row.physical.mode='released';
 h.tender.inspect('supply_return');assert.match(h.tender._offer.detail,/Working Bench/);assert.match(h.tender._offer.detail,/moving/);
 const rev=h.row.revision;h.player.pos.set(9000,0,9000);let courses=0;h.bus.on('ui:setCourse',()=>courses++);
 assert.equal(h.tender.inspect('supply_return').ok,false);assert.equal(h.tender.act('supply_return_course',rev).ok,false);assert.equal(courses,0);
 }finally{h.close();}
});
test('prepaid service is not duplicated or silently netted from supply check',async()=>{
 const h=await boot();try{h.row.owned=true;h.row.stage=2;h.row.service={id:'existing',type:'refuel',requested:20,delivered:5,paused:true,manualPaused:true};
 const before=JSON.stringify(h.row.service);assert.equal(h.tender.inspect('supply_return').ok,true);assert.match(h.tender._offer.detail,/still booked/);assert.match(h.tender._offer.detail,/Resume prepaid work/);assert.match(h.tender._offer.detail,/does not subtract/);assert.equal(JSON.stringify(h.row.service),before);
 }finally{h.close();}
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
 const returnCard=owner.inspect('supply_return').offer;assert.ok(returnCard);assert.match(returnCard.detail,/1 unsealed fuel cells/);assert.equal(owner.act('supply_return_course',returnCard.revision).ok,true);assert.equal(marked.autopilot,false);assert.equal(marked.targetEntityId,findTenderBody(s).id);assert.equal(s.salvageTender.service,null);
 console.log(JSON.stringify({nativeSelectiveLocker:{seconds:s.simTime,travel:Math.hypot(player.pos.x-origin.x,player.pos.z-origin.z),remaining:pod.data.cargoManifest.totalQty}}));
 }finally{for(const sys of [...(sim?.registry.systems||[])].reverse())sys.destroy?.();native?._sg02?.dispose?.();sim?.dispose();restoreFeatureMaps(flags);}
});

test('return course preserves synchronous replacement cards and reset ownership',async()=>{
 for(const change of ['newGame','inspect']){
 const h=await boot({native:true});try{
 h.row.owned=true;h.row.stage=2;h.tender.inspect('supply_return');
 let replacement;h.bus.on('ui:setCourse',()=>{
 if(change==='newGame')h.tender.newGame();else h.tender.inspect('service');
 replacement=h.tender._offer;
 });
 assert.equal(h.action('supply_return_course').ok,true);
 assert.equal(h.tender._dismissed,false);assert.equal(h.tender._offer,replacement);
 }finally{h.close();}
 }
});
test('cold restore recomputes recovered hold and plots current home without booking work',async()=>{
 const h=await boot({native:true,saving:true});let envelope;
 try{h.row.owned=true;h.row.stage=2;addCargo(h.state,'cmdty_fuel_cells',1);
 envelope=clone(h.sim.registry.get('save').serialize('return-supply'));}finally{h.close();}
 const g=await boot({native:true,saving:true,discover:false});try{
 assert.equal(g.sim.registry.get('save').loadEnvelope(envelope,'return-supply'),true);g.advance(DT*2);
 assert.equal(g.tender.inspect('supply_return').ok,true);assert.match(g.tender._offer.detail,/1 unsealed fuel cells/);
 let course;g.bus.on('ui:setCourse',p=>course=p);assert.equal(g.action('supply_return_course').ok,true);
 assert.equal(course.targetEntityId,findTenderBody(g.state).id);assert.equal(course.autopilot,false);assert.equal(g.row.service,null);
 }finally{g.close();}
});
