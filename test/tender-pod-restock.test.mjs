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
import { findTenderBody, TENDER_BODY_ID, createTenderPhysical } from '../src/features/salvageTender/physical.js';
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
const ELECTRONICS='cmdty_salvage_electronics', SCRAP='cmdty_scrap_metal';
async function locker(options={}) {
 const h=await boot({native:true,...options});
 const crate=h.tender.physical.recoveryBodies(h.row)[0];
 // Initial approach fixture, before first native step. No flight-route claim.
 h.player.pos.x=crate.pos.x+50;h.player.pos.z=crate.pos.z;
 h.advance(DT*2);
 return Object.assign(h,{crate, take:(id=ELECTRONICS,quantity=1)=>h.action('unload',{bodyId:crate.id,sourceId:crate.data.worldRecordId,commodityId:id,quantity})});
}

const pack=(h,id=ELECTRONICS)=>h.action('restock',{bodyId:h.crate.id,generation:h.crate.occupantGeneration,sourceId:h.crate.data.worldRecordId,commodityId:id});
async function ownedLocker(options={}){const h=await locker(options);h.row.owned=true;h.row.stage=3;h.row.revision++;h.player.pos.x=h.crate.pos.x-50;h.advance(DT*2);return h;}
test('actual home menu packs one unsealed supply into an emptied original compartment and takes it back without purchase',async()=>{
 const deck={current:null,offerDecision(s){this.current=s;return true;},resolveDecision(){this.current=null;return true;}};setPromptDeck(deck);
 const h=await ownedLocker({prompts:true});try{
  assert.equal(h.take().ok,true);h.advance(DT*2);const total=h.crate.data.cargoManifest.totalQty;
  h.tender.inspect('home');assert.ok(deck.current.choices.length<=9);assert.ok(deck.current.choices.some(c=>c.id==='restock_menu'));
  h.tender.inspect('cargo');assert.ok(deck.current.choices.length<=9);assert.ok(deck.current.choices.some(c=>c.id==='leave'));deck.current.onChoose('restock_menu');
  assert.ok(deck.current.choices.length<=9);assert.ok(deck.current.choices.some(c=>c.id==='leave'));
  deck.current.onChoose('pack_initial');assert.ok(deck.current.choices.length<=9);assert.ok(deck.current.choices.some(c=>c.id==='pods'));
  const card=deck.current;card.onChoose(`deposit_${ELECTRONICS}`);
  assert.equal(h.state.player.cargo.items[ELECTRONICS],undefined);assert.equal(h.crate.data.cargoManifest.totalQty,total+1);
  assert.equal(card.onChoose(`deposit_${ELECTRONICS}`),false);h.advance(DT*2);assert.equal(h.state.player.credits,1000);
  assert.equal(h.take().ok,true);h.advance(DT*2);assert.equal(h.state.player.cargo.items[ELECTRONICS],1);
 }finally{h.close();setPromptDeck(null);}
});
test('full compartments, sealed freight, missing ownership, stale generation and moving originals refuse without debit',async()=>{
 const h=await ownedLocker();try{
  addCargo(h.state,ELECTRONICS,2);assert.equal(pack(h).ok,false,'full original');assert.equal(h.take().ok,true);h.advance(DT*2);
  h.state.missions.active.push({id:'seal',status:'active',preloadedCargo:true,params:{cmdtyId:ELECTRONICS,qty:3}});
  assert.equal(pack(h).ok,false);assert.equal(h.state.player.cargo.items[ELECTRONICS],3);
  h.state.ui.docked=true;assert.equal(pack(h).ok,false);h.state.ui.docked=false;
  h.state.missions.active=[];h.row.owned=false;assert.equal(pack(h).ok,false);h.row.owned=true;
  const args={bodyId:h.crate.id,generation:h.crate.occupantGeneration-1,sourceId:h.crate.data.worldRecordId,commodityId:ELECTRONICS};
  assert.equal(h.action('restock',args).ok,false);h.crate.vel.x=100;assert.equal(pack(h).ok,false);h.crate.vel.x=0;
  assert.equal(pack(h).ok,true);assert.equal(h.state.player.cargo.items[ELECTRONICS],2);
  assert.equal(pack(h).ok,false,'capacity remains original, not unlimited');
 }finally{h.close();}
});
test('cargo callback sees atomic destination and debit, cannot reenter, and actual fresh save retains the same stock',async()=>{
 const h=await ownedLocker({saving:true});let cold;try{
  assert.equal(h.take().ok,true);h.advance(DT*2);let nested,snapshot,observed;
  const off=h.bus.on('cargo:changed',()=>{
   observed={hold:h.state.player.cargo.items[ELECTRONICS]||0,stored:h.crate.data.cargoManifest.lines.find(l=>l.commodityId===ELECTRONICS).qty};
   nested=pack(h);snapshot=clone(h.sim.registry.get('save').serialize('packed-callback'));
  });
  assert.equal(pack(h).ok,true);off();assert.equal(nested.ok,false);assert.deepEqual(observed,{hold:0,stored:3});
  cold=await boot({native:true,saving:true,discover:false});assert.equal(cold.sim.registry.get('save').loadEnvelope(snapshot,'packed-callback'),true);cold.advance(DT*2);
  const body=cold.tender.physical.recoveryBodies(cold.row)[0];assert.equal(cold.state.player.cargo.items[ELECTRONICS]||0,0);
  assert.equal(body.data.cargoManifest.lines.find(l=>l.commodityId===ELECTRONICS).qty,3);
  assert.equal(cold.action('unload',{bodyId:body.id,sourceId:body.data.worldRecordId,commodityId:ELECTRONICS,quantity:1}).ok,true);
  assert.equal(cold.state.player.cargo.items[ELECTRONICS],1);
 }finally{cold?.close();h.close();}
});
test('empty original shell accepts paid inventory, updates real native mass and remains finite through interrupted transfer',async()=>{
 const h=await ownedLocker();try{
  assert.equal(h.action('unload',{bodyId:h.crate.id}).ok,true);assert.equal(h.crate.data.cargoManifest.totalQty,0);assert.equal(h.row.physical.recovery[0].status,'empty');h.advance(DT*2);
  const id=h.crate.id,beforeMass=h.crate.mass;assert.equal(pack(h).ok,true);h.advance(DT*2);
  assert.equal(h.crate.id,id);assert.equal(h.row.physical.recovery[0].status,'loose');assert.equal(h.crate.mass,beforeMass+.4);
  assert.ok(Math.abs(h.physics._sg02.records.get(id).body.mass()-h.crate.mass)<.001);
  const before=h.state.player.cargo.items[ELECTRONICS];const off=h.bus.on('cargo:changed',()=>{h.state.mode='menu';});
  assert.equal(pack(h).ok,true);off();assert.equal(h.state.player.cargo.items[ELECTRONICS],before-1);
  assert.equal(pack(h).ok,false);assert.equal(h.crate.data.cargoManifest.totalQty,2);
 }finally{h.close();}
});
test('starter flight reaches original pod, recovers a supply and physically repacks it through the owner',async()=>{
 const flags=snapshotFeatureMaps();let sim,native;
 try{
 applyFeatureConfigToMaps(PRODUCTION_FEATURES);
 sim=createSimulation({seed:34310,systems:[physics,combat,cargo,economy,stationServices,ships,flightV3,salvageTender],updateOrder:[combat,flightV3,salvageTender,physics,cargo,economy,stationServices],runtimeConfig:{profileId:'production',features:PRODUCTION_FEATURES}});
 const s=sim.state;s.mode='flight';s.world.currentSectorId=NEW_GAME.startingSectorId;
 sim.registry.get('ships').newGame();const owned=s.player.ownedShips[0];
 const player=sim.spawn(makeShipEntitySpec(owned.defId,{isPlayer:true,team:0,player:s.player,fittings:owned.fittings,pos:{x:20,z:80},rot:0}));s.playerId=player.id;
 const owner=sim.registry.get('salvageTender');assert.equal(owner.discover({sectorId:s.world.currentSectorId,anchor:{x:0,z:0}}).ok,true);
 native=sim.registry.get('physics');assert.equal(await native.prepareBackend(s),true);sim.step(DT);
 s.salvageTender.owned=true;s.salvageTender.stage=3; // Prepared claimed-home fixture, not a claim journey.
 const pod=owner.physical.recoveryBodies(s.salvageTender)[0],origin={...player.pos};let reached=false;
 for(let tick=0;tick<60/DT;tick++){
 const gap=pod.pos.x-player.pos.x;
 s.input.moveZ=gap>65?0.12:0;s.input.moveX=0;s.input.turnIntent=0;s.input.brake=gap<85;s.input.boost=false;sim.step(DT);
 if(!owner.physical.canUnload(s.salvageTender,pod.id).ok)continue;
 const card=owner.inspect('cargo').offer;const take=card.choices.find(c=>c.id===`take_${ELECTRONICS}`);assert.ok(take);
 assert.equal(owner.act(take.options.action,card.revision,take.options).ok,true);reached=true;break;
 }
 assert.equal(reached,true);assert.ok(Math.hypot(player.pos.x-origin.x,player.pos.z-origin.z)>50);
 assert.equal(s.player.cargo.items[ELECTRONICS],1);assert.equal(pod.data.cargoManifest.totalQty,10);
 for(let i=0;i<3;i++)sim.step(DT);
 const beforeMass=pod.mass;
 const packed=owner.act('restock',s.salvageTender.revision,{bodyId:pod.id,generation:pod.occupantGeneration,sourceId:pod.data.worldRecordId,commodityId:ELECTRONICS});
 assert.equal(packed.ok,true,packed.reason);for(let i=0;i<3;i++)sim.step(DT);
 assert.equal(s.player.cargo.items[ELECTRONICS]||0,0);assert.equal(pod.data.cargoManifest.totalQty,11);assert.ok(Math.abs(pod.mass-beforeMass-.4)<1e-6);
 assert.ok(Math.abs(native._sg02.records.get(pod.id).body.mass()-pod.mass)<.001);
 console.log(JSON.stringify({nativePodRestock:{seconds:s.simTime,travel:Math.hypot(player.pos.x-origin.x,player.pos.z-origin.z),remaining:pod.data.cargoManifest.totalQty}}));
 }finally{for(const sys of [...(sim?.registry.systems||[])].reverse())sys.destroy?.();native?._sg02?.dispose?.();sim?.dispose();restoreFeatureMaps(flags);}
});

test('same-ID replacement is not a restock target, and mode/save interruptions cannot resume a stale deposit',async()=>{
 const h=await ownedLocker();try{
  h.take();h.advance(DT*2);const before=h.state.player.cargo.items[ELECTRONICS];
  const old=h.crate,replacement={...old,data:clone(old.data)};h.state.entities.set(old.id,replacement);
  assert.equal(pack(h).ok,false);assert.equal(h.state.player.cargo.items[ELECTRONICS],before);
  assert.equal(h.row.physical.recovery[0].status,'lost');assert.equal(pack(h).ok,false);
 }finally{h.close();}
 const g=await ownedLocker();try{
  g.take();g.advance(DT*2);g.bus.emit('save:restoring',{});
  assert.equal(pack(g).ok,false);assert.equal(g.state.player.cargo.items[ELECTRONICS],1);
 }finally{g.close();}
});

test('reverse bulk unload blocks second-owner restock and callback saves conserve partially accepted stock',async()=>{
 const h=await ownedLocker({saving:true});let cold,other;
 try{
  h.take();h.advance(DT*2);other=createTenderPhysical(h.tender.ctx);
  h.state.player.cargo.capVolume=h.state.player.cargo.usedVolume+cargoUnitVolume(h.state,SCRAP)*2;
  let nested,snapshot;const off=h.bus.on('cargo:changed',()=>{
   if(snapshot)return;
   nested=other.restockRecovery(h.row,h.crate.id,h.crate.occupantGeneration,h.crate.data.worldRecordId,ELECTRONICS);
   snapshot=clone(h.sim.registry.get('save').serialize('reverse-transfer'));
  });
  const result=h.action('unload',{bodyId:h.crate.id});off();assert.equal(result.ok,true);assert.equal(nested.ok,false);
  const held=id=>h.state.player.cargo.items[id]||0,stored=id=>h.crate.data.cargoManifest.lines.find(l=>l.commodityId===id)?.qty||0;
  assert.equal(held(SCRAP)+stored(SCRAP),6);assert.equal(held(ELECTRONICS)+stored(ELECTRONICS),3);
  cold=await boot({native:true,saving:true,discover:false});assert.equal(cold.sim.registry.get('save').loadEnvelope(snapshot,'reverse-transfer'),true);cold.advance(DT*2);
  const body=cold.tender.physical.recoveryBodies(cold.row)[0];
  for(const [id,total] of [[SCRAP,6],[ELECTRONICS,3],['cmdty_fuel_cells',2]])assert.equal((cold.state.player.cargo.items[id]||0)+(body.data.cargoManifest.lines.find(l=>l.commodityId===id)?.qty||0),total);
 }finally{cold?.close();other?.dispose(h.row);h.close();}
});
test('throwing ordinary cargo listeners cannot duplicate stock or leave either direction locked',async()=>{
 const h=await ownedLocker();try{
  h.take();h.advance(DT*2);
  const off=h.bus.on('cargo:changed',()=>{throw new Error('expected restock listener failure');});
  assert.equal(pack(h).ok,true);off();h.advance(DT*2);
  assert.equal(h.state.player.cargo.items[ELECTRONICS]||0,0);assert.equal(h.crate.data.cargoManifest.lines.find(l=>l.commodityId===ELECTRONICS).qty,3);
  const off2=h.bus.on('cargo:changed',()=>{throw new Error('expected unload listener failure');});
  assert.equal(h.take().ok,true);off2();h.advance(DT*2);
  assert.equal(h.state.player.cargo.items[ELECTRONICS],1);assert.equal(h.crate.data.cargoManifest.lines.find(l=>l.commodityId===ELECTRONICS).qty,2);
  assert.equal(pack(h).ok,true);
 }finally{h.close();}
});
