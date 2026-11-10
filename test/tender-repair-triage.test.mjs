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
test('actual service deck books hull-first work and redirects its prepaid remainder to armor without charging again',async()=>{
 const deck={current:null,offerDecision(s){this.current=s;return true;},resolveDecision(){this.current=null;return true;}};setPromptDeck(deck);
 const h=await bench();try{
 assert.equal(h.tender.inspect('service').ok,true);assert.ok(deck.current.choices.length<=9);
 assert.ok(deck.current.choices.some(c=>c.id==='back'));assert.ok(deck.current.choices.some(c=>c.id==='leave'));
 const stale=deck.current;assert.equal(stale.onChoose('repair_hull'),true);
 assert.equal(h.row.service.repairPriority,'hull');assert.equal(h.state.player.cargo.items.cmdty_scrap_metal,1);
 h.advance(.5);assert.ok(h.player.hull>80);assert.equal(h.player.armorHp,80);
 const delivered=h.row.service.delivered, id=h.row.service.id;
 h.tender.inspect('service');assert.equal(deck.current.onChoose('priority_armor'),true);
 assert.equal(h.row.service.id,id);assert.equal(h.row.service.delivered,delivered);
 assert.equal(h.state.player.cargo.items.cmdty_scrap_metal,1);
 assert.equal(stale.onChoose('repair_hull'),false);
 h.advance(3);assert.equal(h.row.service,null);
 assert.ok(h.player.armorHp>80);assert.ok(Math.abs(h.player.hull+h.player.armorHp-180)<1e-6);
 assert.equal(h.state.player.credits,1000);
 }finally{h.close();setPromptDeck(null);}
});
test('priority spills into the other deficit within the same paid tick and untouched cancellation refunds once',async()=>{
 const h=await bench();try{
 h.player.hull=99;h.player.armorHp=70;
 assert.equal(h.action('repair',{priority:'hull'}).ok,true);h.advance(.25);
 assert.equal(h.player.hull,100);assert.ok(h.player.armorHp>70);
 assert.equal(h.action('cancel_service').ok,true);assert.equal(h.state.player.cargo.items.cmdty_scrap_metal,1);
 assert.equal(h.action('repair',{priority:'armor'}).ok,true);
 assert.equal(h.action('cancel_service').ok,true);assert.equal(h.state.player.cargo.items.cmdty_scrap_metal,1);
 assert.equal(h.action('cancel_service').ok,false);
 }finally{h.close();}
});
test('saved priority and remainder require trusted original-hull rebind; stale life cannot redirect work',async()=>{
 const h=await bench();try{
 h.action('repair',{priority:'armor'});h.advance(.5);
 const raw=JSON.parse(JSON.stringify(h.row.service)), left=raw.remaining;
 h.row.service=normalizeTenderService(raw);assert.equal(h.row.service.repairPriority,'armor');
 assert.equal(rebindTenderService(h.tender.ctx,h.row),true);h.advance(.25);
 assert.ok(h.row.service.remaining<left);assert.equal(h.player.hull,80);
 const id=h.row.service.id;h.player.occupantGeneration++;
 assert.equal(h.action('repair_priority',{priority:'hull',jobId:id}).ok,false);
 const before=h.player.hull+h.player.armorHp;h.advance(1);assert.equal(h.player.hull+h.player.armorHp,before);
 const legacy={...raw};delete legacy.repairPriority;
 assert.equal(normalizeTenderService(legacy).repairPriority,'balanced');
 assert.equal(normalizeTenderService({...raw,repairPriority:'bogus'}).repairPriority,'balanced');
 }finally{h.close();}
});

test('sealed scrap and invalid priority cannot book work; callback reentry cannot spend twice',async()=>{
 const h=await bench();try{
 h.state.missions.active.push({id:'sealed-triage',status:'active',preloadedCargo:true,params:{cmdtyId:'cmdty_scrap_metal',qty:2}});
 assert.equal(h.action('repair',{priority:'hull'}).ok,false);assert.equal(h.row.service,null);
 h.state.missions.active.length=0;
 assert.equal(h.action('repair',{priority:'invalid'}).ok,false);
 assert.equal(h.state.player.cargo.items.cmdty_scrap_metal,2);
 let nested;h.bus.on('cargo:changed',()=>{nested=h.action('repair',{priority:'armor'});});
 assert.equal(h.action('repair',{priority:'hull'}).ok,true);
 assert.equal(h.state.player.cargo.items.cmdty_scrap_metal,1);
 assert.equal(nested?.ok,false, 'actual cargo callback reentry is refused');
 h.advance(3);assert.ok(Math.abs(h.player.hull+h.player.armorHp-180)<1e-6);
 }finally{h.close();}
});
test('real save envelope cold-restores priority and paid remainder without another scrap debit',async()=>{
 const h=await bench({saving:true});let envelope,expected;let cold;
 try{
 h.action('repair',{priority:'armor'});h.advance(.5);
 expected={id:h.row.service.id,remaining:h.row.service.remaining,delivered:h.row.service.delivered,cargo:clone(h.state.player.cargo.items)};
 envelope=clone(h.sim.registry.get('save').serialize('triage'));
 cold=await boot({native:true,saving:true,discover:false,credits:0});
 assert.equal(cold.sim.registry.get('save').loadEnvelope(envelope,'triage'),true);
 assert.equal(cold.row.service.id,expected.id);assert.equal(cold.row.service.repairPriority,'armor');
 assert.equal(cold.row.service.remaining,expected.remaining);
 cold.advance(3);assert.equal(cold.row.service,null);
 assert.deepEqual(cold.state.player.cargo.items,expected.cargo);
 }finally{cold?.close();h.close();}
});
