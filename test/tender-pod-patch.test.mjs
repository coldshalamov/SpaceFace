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

async function patchFixture(options={}) {
 const h=await boot({native:true,...options});h.row.owned=true;h.row.stage=3;h.row.physical.mode='secured';
 const crate=h.tender.physical.recoveryBodies(h.row)[0];
 // Initial fixture: original hauled alongside secured tender before native admission.
 crate.pos.x=h.body.pos.x+65;crate.pos.z=h.body.pos.z;
 h.player.pos.x=h.body.pos.x+(options.far?135:45);h.player.pos.z=h.body.pos.z+30;
 h.advance(DT*3);
 return Object.assign(h,{crate,patch:()=>h.action('pod_patch',{bodyId:crate.id,generation:crate.occupantGeneration,
  sourceId:crate.data.worldRecordId,tenderGeneration:h.body.occupantGeneration})});
}
test('actual original pod patches tender with full hold, no cargo or credit transfer, bounded menu',async()=>{
 const deck={current:null,offerDecision(s){this.current=s;return true;},resolveDecision(){this.current=null;return true;}};setPromptDeck(deck);
 const h=await patchFixture({prompts:true});try{
  h.state.player.cargo.capVolume=h.state.player.cargo.usedVolume;
  const hull=h.body.hull, credits=h.state.player.credits, cargo=clone(h.state.player.cargo), m=clone(h.crate.data.cargoManifest);
  h.action('packing',{bodyId:h.crate.id,generation:h.crate.occupantGeneration,sourceId:h.crate.data.worldRecordId});
  assert.ok(deck.current.choices.length<=9);assert.ok(deck.current.choices.some(c=>c.id==='leave'));
  assert.equal(deck.current.onChoose('pod_patch'),true);
  assert.equal(h.body.hull,hull+30);assert.equal(h.crate.data.cargoManifest.totalQty,m.totalQty-1);
  assert.deepEqual(h.state.player.cargo,cargo);assert.equal(h.state.player.credits,credits);
  assert.equal(h.row.physical.tender.hull,h.body.hull);h.advance(DT*3);
  assert.ok(h.physics._sg02.records.get(h.crate.id).body.mass()>0);
 }finally{h.close();setPromptDeck(null);}
});
test('callback sees committed repair/source and cross-adapter transfer is fenced; save cannot repeat spent plate',async()=>{
 const h=await patchFixture({saving:true});let cold;try{
  let snapshot,nested;const hull=h.body.hull,qty=h.crate.data.cargoManifest.totalQty;
  h.bus.on('salvageTender:podPatched',()=>{
   snapshot=clone(h.sim.registry.get('save').serialize('pod-patch'));
   const other=createTenderPhysical(h.tender.ctx);nested=other.patchFromRecovery(h.row,h.crate.id,h.crate.occupantGeneration,h.crate.data.worldRecordId,h.body.occupantGeneration);
  });
  assert.equal(h.patch().ok,true);assert.equal(nested.reason,'transfer_busy');
  assert.equal(h.body.hull,hull+30);assert.equal(h.crate.data.cargoManifest.totalQty,qty-1);assert.ok(snapshot);
  const raw=h.tender.serialize(); const saved=clone(raw);assert.equal(saved.physical.tender.hull,hull+30);
  assert.equal(saved.physical.recovery[0].manifest.totalQty,qty-1);
  cold=await boot({native:true,saving:true,discover:false});
  assert.equal(cold.sim.registry.get('save').loadEnvelope(snapshot,'pod-patch'),true);cold.advance(DT*3);
  assert.equal(cold.body.hull,hull+30);assert.equal(cold.row.physical.recovery[0].manifest.totalQty,qty-1);
  const original=cold.tender.physical.recoveryBodies(cold.row).find(e=>e.data.worldRecordId===h.crate.data.worldRecordId);
  assert.equal(original.data.cargoManifest.totalQty,qty-1);
 }finally{cold?.close();h.close();}
});
test('disabled original reactivates before pod repair receipt and immediate save',async()=>{
 const h=await patchFixture({saving:true});try{
  // Damage-boundary fixture feeds the real lifecycle owner before repair.
  h.body.hull=24;h.tender.physical.handleDamage(h.row,{targetId:h.body.id});
  assert.equal(h.row.physical.disabled,true);assert.equal(h.body.flags.invuln,true);
  let received=false;
  h.bus.on('salvageTender:podPatched',()=>{
   received=true;
   assert.equal(h.row.physical.disabled,false);
   assert.equal(h.body.flags.invuln,false);
   const saved=clone(h.tender.serialize());
   assert.equal(saved.physical.disabled,false);
   assert.equal(saved.physical.tender.hull,54);
  });
  assert.equal(h.patch().ok,true);assert.equal(received,true);
  assert.equal(h.row.physical.disabled,false);
  assert.equal(h.body.flags.invuln,false);
 }finally{h.close();}
});
test('stale lives, sealed contents, out-of-range, unowned and intact tender refuse without consumption',async()=>{
 for(const kind of ['stale','sealed','range','unowned','intact','moving','menu']) {
  const h=await patchFixture();try{
   const opts={bodyId:h.crate.id,generation:h.crate.occupantGeneration,sourceId:h.crate.data.worldRecordId,tenderGeneration:h.body.occupantGeneration};
   if(kind==='stale')h.crate.occupantGeneration++;
   if(kind==='sealed')h.crate.data.cargoManifest.sealed=true;
   if(kind==='range')h.crate.pos.x+=200;
   if(kind==='unowned')h.row.owned=false;
   if(kind==='intact')h.body.hull=h.body.hullMax;
   if(kind==='moving')h.crate.vel.x=30;
   if(kind==='menu')h.state.mode='menu';
   const hull=h.body.hull,qty=h.crate.data.cargoManifest.totalQty;
   assert.equal(h.action('pod_patch',opts).ok,false,kind);assert.equal(h.body.hull,hull);assert.equal(h.crate.data.cargoManifest.totalQty,qty);
  }finally{h.close();}
 }
});

test('native pilot approaches prepared original pod and patches damaged tender with finite scrap',async()=>{
 const h=await patchFixture({far:true});try{
  const start={...h.player.pos},qty=h.crate.data.cargoManifest.totalQty,hull=h.body.hull;
  assert.equal(h.patch().ok,false);
  const goal={x:h.body.pos.x+45,z:h.body.pos.z+30};
  for(let i=0;i<1200;i++) {
   const dx=goal.x-h.player.pos.x,dz=goal.z-h.player.pos.z,d=Math.hypot(dx,dz);
   const desired=Math.min(7,d*.8); const ax=(dx/Math.max(d,.001)*desired-h.player.vel.x)*2;
   const az=(dz/Math.max(d,.001)*desired-h.player.vel.z)*2; const scale=Math.min(1,5/Math.max(.001,Math.hypot(ax,az)));
   writePhysicsControl(h.player,{source:'tender-pod-patch-flight',force:{x:ax*scale*h.player.mass,y:0,z:az*scale*h.player.mass},torque:0});
   h.advance(DT);
   if(d<3 && Math.hypot(h.player.vel.x,h.player.vel.z)<2)break;
  }
  assert.ok(Math.hypot(h.player.pos.x-start.x,h.player.pos.z-start.z)>70);
  assert.equal(h.patch().ok,true);assert.equal(h.body.hull,hull+30);
  assert.equal(h.crate.data.cargoManifest.totalQty,qty-1);
 }finally{h.close();}
});
