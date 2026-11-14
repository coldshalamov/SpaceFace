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

import { normalizeTenderService } from '../src/features/salvageTender/model.js';
import { rebindTenderService } from '../src/features/salvageTender/services.js';
async function bench(options={}){
 const h=await boot({native:true,prompts:true,...options});
 h.row.owned=true;h.row.stage=2;h.row.physical.mode='secured';h.row.revision++;
 h.player.pos.x=h.body.pos.x+60;h.player.pos.z=h.body.pos.z;
 h.player.hull=80;h.player.hullMax=100;h.player.armorHp=80;h.player.armorMax=100;
 addCargo(h.state,'cmdty_scrap_metal',2);h.advance(DT*2);
 return h;
}

const hold=(h,paused)=>h.action('hold_service',{paused,jobId:h.row.service?.id});
test('native service deck pauses paid repair in place, keeps its exact budget and resumes once without charge',async()=>{
 const deck={current:null,offerDecision(s){this.current=s;return true;},resolveDecision(){this.current=null;return true;}};setPromptDeck(deck);
 const h=await bench();try{
 h.action('repair',{priority:'hull'});h.advance(.5);h.tender.inspect('service');
 const before={hull:h.player.hull,armor:h.player.armorHp,remaining:h.row.service.remaining,delivered:h.row.service.delivered,id:h.row.service.id,cargo:clone(h.state.player.cargo.items)};
 const card=deck.current;assert.ok(card.choices.length<=9);assert.ok(card.choices.some(c=>c.id==='back'));assert.ok(card.choices.some(c=>c.id==='leave'));
 assert.equal(card.onChoose('hold_service'),true);assert.equal(h.row.service.manualPaused,true);
 h.advance(5);assert.equal(h.player.hull,before.hull);assert.equal(h.player.armorHp,before.armor);
 assert.equal(h.row.service.remaining,before.remaining);assert.equal(h.row.service.delivered,before.delivered);
 assert.match(h.row.service.pauseReason,/Held by you/);assert.equal(card.onChoose('hold_service'),false);
 const heldJob=clone(h.row.service);const refused=h.action('refuel');
 assert.equal(refused.ok,false);assert.match(refused.reason,/Finish or cancel/);
 assert.deepEqual(h.row.service,heldJob);assert.deepEqual(h.state.player.cargo.items,before.cargo);
 h.tender.inspect('service');assert.match(deck.current.choices.find(c=>c.id==='hold_service').label,/Resume prepaid/);
 assert.equal(deck.current.onChoose('hold_service'),true);h.advance(3);
 assert.equal(h.row.service,null);assert.ok(Math.abs(h.player.hull+h.player.armorHp-180)<1e-6);
 assert.deepEqual(h.state.player.cargo.items,before.cargo);assert.equal(h.state.player.credits,1000);
 }finally{h.close();setPromptDeck(null);}
});
test('manual hold survives automatic berth interruption; ordinary automatic pause still resumes',async()=>{
 const h=await bench();try{
 h.action('repair');assert.equal(hold(h,true).ok,true);
 h.row.physical.mode='released';h.advance(1);assert.equal(h.row.service.delivered,0);assert.equal(h.row.service.manualPaused,true);
 h.row.physical.mode='secured';h.advance(1);assert.equal(h.row.service.delivered,0);assert.match(h.row.service.pauseReason,/Held by you/);
 assert.equal(hold(h,false).ok,true);h.row.physical.mode='released';h.advance(1);assert.equal(h.row.service.delivered,0);
 h.row.physical.mode='secured';h.advance(.25);assert.ok(h.row.service.delivered>0);
 }finally{h.close();}
});
test('untouched held fuel refunds once, used held work remains spent, and invalid jobs cannot redirect a hold',async()=>{
 const h=await bench();try{
 addCargo(h.state,'cmdty_fuel_cells',1);assert.equal(h.action('refuel').ok,true);assert.equal(hold(h,true).ok,true);
 const fuel=h.state.fuel.current;h.advance(2);assert.equal(h.state.fuel.current,fuel);
 assert.equal(h.action('cancel_service').ok,true);assert.equal(h.state.player.cargo.items.cmdty_fuel_cells,1);
 assert.equal(h.action('cancel_service').ok,false);
 h.action('repair');h.advance(.25);hold(h,true);assert.equal(h.action('cancel_service').ok,true);
 assert.equal(h.state.player.cargo.items.cmdty_scrap_metal,1);
 h.action('repair');const id=h.row.service.id;
 assert.equal(h.action('hold_service',{paused:true,jobId:id+'old'}).ok,false);
 assert.equal(h.action('hold_service',{paused:'true',jobId:id}).ok,false);
 h.player.occupantGeneration++;assert.equal(hold(h,true).ok,false);h.advance(2);assert.equal(h.row.service.delivered,0);
 }finally{h.close();}
});
test('fresh native save envelope retains deliberate hold until explicit resume, while old saves default to automatic service',async()=>{
 const h=await bench({saving:true});let cold;try{
 h.action('repair',{priority:'armor'});h.advance(.5);hold(h,true);
 const remaining=h.row.service.remaining,delivered=h.row.service.delivered;
 const envelope=clone(h.sim.registry.get('save').serialize('held-service'));
 cold=await boot({native:true,saving:true,discover:false,credits:0});
 assert.equal(cold.sim.registry.get('save').loadEnvelope(envelope,'held-service'),true);
 cold.advance(3);assert.equal(cold.row.service.manualPaused,true);assert.equal(cold.row.service.remaining,remaining);assert.equal(cold.row.service.delivered,delivered);
 assert.equal(hold(cold,false).ok,true);cold.advance(3);assert.equal(cold.row.service,null);
 const raw=clone(h.row.service);delete raw.manualPaused;assert.equal(normalizeTenderService(raw).manualPaused,false);
 assert.equal(normalizeTenderService({...raw,manualPaused:'true'}).manualPaused,false);
 }finally{cold?.close();h.close();}
});
test('starter emergency weld can be held without consuming its one-time benefit twice',async()=>{
 const h=await bench();try{
 h.player.hull=20;h.row.emergencyAvailable=true;assert.equal(h.action('emergency').ok,true);
 hold(h,true);h.advance(2);assert.equal(h.player.hull,20);assert.equal(h.row.emergencyAvailable,false);
 assert.equal(h.action('cancel_service').ok,true);assert.equal(h.row.emergencyAvailable,true);
 assert.equal(h.action('emergency').ok,true);h.advance(3);assert.equal(h.player.hull,35);
 assert.equal(h.action('emergency').ok,false);
 }finally{h.close();}
});
