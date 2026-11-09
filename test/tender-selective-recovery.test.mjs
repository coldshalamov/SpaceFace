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
const ELECTRONICS='cmdty_salvage_electronics', SCRAP='cmdty_scrap_metal';
async function locker(options={}) {
 const h=await boot({native:true,...options});
 const crate=h.tender.physical.recoveryBodies(h.row)[0];
 // Initial approach fixture, before first native step. No flight-route claim.
 h.player.pos.x=crate.pos.x+50;h.player.pos.z=crate.pos.z;
 h.advance(DT*2);
 return Object.assign(h,{crate, take:(id=ELECTRONICS,quantity=1)=>h.action('unload',{bodyId:crate.id,sourceId:crate.data.worldRecordId,commodityId:id,quantity})});
}
test('ordinary cargo decision takes chosen electronics with room for only one, not earlier manifest scrap',async()=>{
 const deck={current:null,offerDecision(s){this.current=s;return true;},resolveDecision(){this.current=null;return true;}};
 setPromptDeck(deck);const h=await locker({prompts:true});
 try{
 h.state.player.cargo.capVolume=cargoUnitVolume(ELECTRONICS);
 const original=clone(h.crate.data.cargoManifest);assert.equal(h.tender.inspect('cargo').ok,true);
 const card=deck.current;assert.ok(card.choices.some(c=>c.id===`take_${ELECTRONICS}`));
 assert.equal(card.onChoose(`take_${ELECTRONICS}`),true);
 assert.equal(h.state.player.cargo.items[ELECTRONICS],1);assert.equal(h.state.player.cargo.items[SCRAP],undefined);
 assert.equal(h.crate.data.cargoManifest.totalQty,original.totalQty-1);
 assert.equal(h.crate.data.cargoManifest.lines.find(l=>l.commodityId===SCRAP).qty,6);
 assert.equal(card.onChoose(`take_${ELECTRONICS}`),false,'stale card cannot replay');
 assert.equal(h.take().ok,false,'full hold leaves all other stock');
 assert.equal(h.state.player.credits,1000);assert.equal(h.row.owned,false);
 }finally{h.close();setPromptDeck(null);}
});
test('selected supply conserves untouched stock, existing sealed freight, and rejects callback reentry',async()=>{
 const h=await locker();try{
 addCargo(h.state,ELECTRONICS,2);h.state.missions.active.push({id:'seal',status:'active',preloadedCargo:true,params:{cmdtyId:ELECTRONICS,qty:2}});
 const nested=[];const off=h.bus.on('cargo:changed',()=>nested.push(h.take()));
 const before=h.crate.data.cargoManifest.totalQty;assert.equal(h.take().ok,true);off();
 assert.ok(nested.length);assert.ok(nested.every(r=>!r.ok));assert.equal(h.state.player.cargo.items[ELECTRONICS],3);
 assert.equal(sellableCargoQuantity(h.state,ELECTRONICS),1);assert.equal(h.crate.data.cargoManifest.totalQty,before-1);
 assert.equal(h.row.physical.recovery[0].manifest.totalQty,before-1);
 h.advance(DT*2);assert.equal(h.action('unload',{bodyId:h.crate.id}).ok,true,'existing mixed-load transfer remains available');
 assert.equal(h.crate.data.cargoManifest.totalQty,0);assert.equal(h.take().ok,false);
 }finally{h.close();}
});
test('invalid selection and wrong original fail closed without consuming a different commodity',async()=>{
 const h=await locker();try{
 const before=clone(h.crate.data.cargoManifest);
 for(const [id,q] of [['cmdty_iron',1],[ELECTRONICS,0],[ELECTRONICS,1.5],[ELECTRONICS,NaN],[null,1]])assert.equal(h.take(id,q).ok,false);
 assert.equal(h.action('unload',{bodyId:h.crate.id,sourceId:'wrong',commodityId:ELECTRONICS,quantity:1}).ok,false);
 assert.deepEqual(h.crate.data.cargoManifest,before);
 h.player.vel.x=20;assert.equal(h.take().ok,false,'relative speed gate remains authoritative');
 }finally{h.close();}
});
test('real save envelope cold restore retains selected remainder and exact cargo without refill',async()=>{
 const h=await locker({saving:true});let envelope;
 try{assert.equal(h.take().ok,true);envelope=clone(h.sim.registry.get('save').serialize('selective-locker'));}finally{h.close();}
 const g=await boot({native:true,saving:true,discover:false});try{
 assert.equal(g.sim.registry.get('save').loadEnvelope(envelope,'selective-locker'),true);g.advance(DT*2);
 assert.equal(g.state.player.cargo.items[ELECTRONICS],1);
 const crate=g.tender.physical.recoveryBodies(g.row)[0];assert.equal(crate.data.cargoManifest.lines.find(l=>l.commodityId===ELECTRONICS).qty,2);
 assert.equal(g.action('unload',{bodyId:crate.id,sourceId:crate.data.worldRecordId,commodityId:ELECTRONICS,quantity:1}).ok,true);
 assert.equal(g.state.player.cargo.items[ELECTRONICS],2);assert.equal(crate.data.cargoManifest.lines.find(l=>l.commodityId===ELECTRONICS).qty,1);
 }finally{g.close();}
});
test('starter flight reaches the original locker and chooses a single needed supply through the public action',async()=>{
 const flags=snapshotFeatureMaps();let sim,native;
 try{
 applyFeatureConfigToMaps(PRODUCTION_FEATURES);
 sim=createSimulation({seed:34310,systems:[physics,combat,cargo,economy,stationServices,ships,flightV3,salvageTender],updateOrder:[combat,flightV3,salvageTender,physics,cargo,economy,stationServices],runtimeConfig:{profileId:'production',features:PRODUCTION_FEATURES}});
 const s=sim.state;s.mode='flight';s.world.currentSectorId=NEW_GAME.startingSectorId;
 sim.registry.get('ships').newGame();const owned=s.player.ownedShips[0];
 const player=sim.spawn(makeShipEntitySpec(owned.defId,{isPlayer:true,team:0,player:s.player,fittings:owned.fittings,pos:{x:20,z:80},rot:0}));s.playerId=player.id;
 const owner=sim.registry.get('salvageTender');assert.equal(owner.discover({sectorId:s.world.currentSectorId,anchor:{x:0,z:0}}).ok,true);
 native=sim.registry.get('physics');assert.equal(await native.prepareBackend(s),true);sim.step(DT);
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
 console.log(JSON.stringify({nativeSelectiveLocker:{seconds:s.simTime,travel:Math.hypot(player.pos.x-origin.x,player.pos.z-origin.z),remaining:pod.data.cargoManifest.totalQty}}));
 }finally{for(const sys of [...(sim?.registry.systems||[])].reverse())sys.destroy?.();native?._sg02?.dispose?.();sim?.dispose();restoreFeatureMaps(flags);}
});
test('a faster nearest locker does not hide take-one choices for a farther accessible original',async()=>{
 const h=await boot({native:true});try{
 const [near,far]=h.tender.physical.recoveryBodies(h.row);
 h.player.pos.x=200;h.player.pos.z=80;
 near.pos.x=170;near.pos.z=80;near.vel.x=20;
 far.pos.x=200;far.pos.z=140;far.vel.x=0;far.vel.z=0;
 h.advance(DT*2);
 // Owner-gate velocity fixture after admission; not a simulated flight trajectory.
 near.vel.x=20;
 assert.equal(h.tender.physical.canUnload(h.row,near.id).ok,false);assert.equal(h.tender.physical.canUnload(h.row,far.id).ok,true);
 const card=h.tender.inspect('cargo').offer;
 const take=card.choices.find(c=>c.id===`take_${ELECTRONICS}`);assert.equal(take.options.bodyId,far.id);
 assert.equal(h.tender.act(take.options.action,card.revision,take.options).ok,true);
 assert.equal(near.data.cargoManifest.totalQty,11);assert.equal(far.data.cargoManifest.totalQty,17);
 }finally{h.close();}
});
