import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { applyFrameOrigin } from '../src/core/coordinates.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { combat } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import { cargo as cargoSystem } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';
import { world } from '../src/systems/world.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { asteroidFormations } from '../src/systems/asteroidFormations.js';
import { scanner } from '../src/systems/scanner.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { serializeCombatState, restoreCombatState } from '../src/combat/persistence.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { shipbreakingYard } from '../src/features/shipbreakingYard/runtime.js';
import { SHIPBREAKING_LAYOUTS, SHIPBREAKING_YARD_SITE as SITE, createYardLayout } from '../src/features/shipbreakingYard/layouts.js';
import { yardBodyIdentity } from '../src/features/shipbreakingYard/physics.js';
import { createShipbreakingYardPresentation, shipbreakingDecisionSpec, SHIPBREAKING_DECISION_ID } from '../src/features/shipbreakingYard/presentation.js';
import { createShipbreakingYardAudio } from '../src/features/shipbreakingYard/audio.js';
import { normalizeYardState } from '../src/features/shipbreakingYard/model.js';
import { save } from '../src/save/saveSystem.js';
import { buildEncounterCatalog } from '../src/data/encounters/catalog.js';
import * as yardEncounter from '../src/data/encounters/8201-pro-yard.js';
import * as THREE from 'three';
import { createShipbreakingYardRenderer, YARD_CUE_COLORS } from '../src/features/shipbreakingYard/render.js';
import { createShipbreakingYardSystemEntries, SHIPBREAKING_YARD_CAPABILITIES,
  SHIPBREAKING_YARD_MAIN_TO_SIM_EVENTS } from '../src/features/shipbreakingYard/integration.js';
import { serializeShipbreakingYard, shipbreakingYardSavePlanEntry, serializeShipbreakingYardSteps,
  restoreShipbreakingYardSteps, afterContinueShipbreakingYard } from '../src/features/shipbreakingYard/save.js';
import { projectShipbreakingYardView, SHIPBREAKING_YARD_EVENT_BRIDGE_ADAPTERS } from '../src/features/shipbreakingYard/bridge.js';
import { createShipbreakingYardBrowser, presentShipbreakingYardFrame, releaseShipbreakingYardPresentation } from '../src/features/shipbreakingYard/browser.js';
import { EVENT_BRIDGE_ADAPTERS, projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';
import { sectorLocalToGlobalForSector, globalToSectorLocalForSector } from '../src/data/sectorCoordinates.js';
import { hullEnvelopeWu, proxyOuterRadiusWu } from '../src/data/collisionProxyManifests.js';
import { asteroidColliderRadius } from '../src/data/asteroidColliders.js';
import { forEachFieldRock } from '../src/world/livingWorldViews.js';
import { WORLD_SITE_MANIFESTS } from '../src/data/worldSiteManifests.js';

// Focused explicit production-owner composition. This is not a whole-game or visual verdict.
let previousFlags;
test.before(() => { previousFlags = snapshotFeatureMaps(); applyFeatureConfigToMaps(PRODUCTION_FEATURES); });
test.after(() => restoreFeatureMaps(previousFlags));
const DT = 1 / 60;
const copy = value => JSON.parse(JSON.stringify(value));
const sumMomentum = bodies => bodies.reduce((out, body) => ({ x: out.x + body.mass * body.vel.x, z: out.z + body.mass * body.vel.z }), { x: 0, z: 0 });
const okay = result => assert.equal(result?.ok, true, result?.reason || JSON.stringify(result));
function installYardBridgeAdapter() {
  const previous = new Map(Object.keys(SHIPBREAKING_YARD_EVENT_BRIDGE_ADAPTERS).map(key => [key, EVENT_BRIDGE_ADAPTERS[key]]));
  Object.assign(EVENT_BRIDGE_ADAPTERS, SHIPBREAKING_YARD_EVENT_BRIDGE_ADAPTERS);
  return () => { for (const [key, value] of previous) { if (value === undefined) delete EVENT_BRIDGE_ADAPTERS[key]; else EVENT_BRIDGE_ADAPTERS[key] = value; } };
}

async function fixture({ discover = true, seed = 8201, playerTow = false, collectors = false, worldOwner = false } = {}) {
  const sim = createSimulation({ seed, systems: [ships, economy, ...(worldOwner ? [world] : []), ...(collectors ? [cargoSystem, mining] : []), physics, combat, scanner, ...(playerTow ? [tetherGameplay] : []), shipbreakingYard] });
  const s = sim.state; s.mode = 'flight'; s.world.currentSectorId = SITE.sectorId;
  s.input.actions ||= {};
  s.settings.gameplay.physicsBackend = 'rapier-dynamic'; s.ui.docked = false; s.ui.screenStack = [];
  sim.registry.get('ships').newGame();
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: s.player, pos: { x: 500, z: 580 }, fittings: [] }));
  s.playerId = player.id; sim.registry.get('economy').grantCredits(10_000, 'shipbreaking-fixture');
  const owner = sim.registry.get('shipbreakingYard'), native = sim.registry.get('physics'), kernel = getCombatKernel(owner.ctx);
  const offers = [], cues = [], receipts = [];
  sim.bus.on('shipbreakingYard:offer', row => offers.push(row));
  sim.bus.on('shipbreakingYard:cue', row => cues.push(row));
  sim.bus.on('shipbreakingYard:receipt', row => receipts.push(row));
  function tick(count = 1) {
    for (let i = 0; i < count; i++) {
      s.tick++; s.simTime = s.tick * DT;
      sim.registry.get('combat').update(DT, s);
      if (playerTow) sim.registry.get('tetherGameplay').update(DT, s);
      owner.update(DT, s);
      native.update(DT, s);
    }
  }
  async function admit() { assert.equal(await native.prepareBackend(s), true, 'real Rapier backend must admit originals'); native.update(DT, s); tick(3); }
  function job(id = 'lark') { return owner.getJob(id); }
  function body(id = 'engine', layout = 'lark') { return owner.physics.body(job(layout), id); }
  function near(entity) {
    assert.ok(entity, 'expected an original body');
    const offset = [[0, -70], [-70, 0], [0, 70], [70, 0], [-48, -48], [48, 48]].find(([x, z]) =>
      !s.entityList.some(other => other !== player && other.alive && Math.hypot(other.pos.x - entity.pos.x - x, other.pos.z - entity.pos.z - z) < other.radius + player.radius + 8));
    assert.ok(offset, 'fixture approach must not shove the wreck while positioning the pilot');
    player.pos.set(entity.pos.x + offset[0], 0, entity.pos.z + offset[1]); player.vel.copy(entity.vel); native.update(DT, s);
  }
  function accept(id = 'lark') { near(body(createYardLayout(id).modules[0].id, id)); return owner.accept(id, s.shipbreakingYard.revision); }
  function disconnect(id = 'engine-clamp', layout = 'lark') {
    const def = createYardLayout(layout).couplings.find(row => row.id === id); near(body(def.b, layout));
    return owner.disconnect(id, s.shipbreakingYard.revision, job(layout).id);
  }
  function receiver(entity) {
    const target = owner.receiver(); assert.ok(target?.pos, 'live receiver required');
    entity.pos.set(target.pos.x, 0, target.pos.z); entity.vel.set(0, 0, 0); entity.angVel = 0;
    player.pos.set(target.pos.x + 52, 0, target.pos.z); player.vel.set(0, 0, 0);
    native.update(DT, s); return target;
  }
  function tow(entity) {
    const result = kernel.attachments.create({ defId: 'attachment_massline', ownerId: player.id, targetId: entity.id, sourceWorld: player.pos, targetWorld: entity.pos });
    okay(result); return result.attachment;
  }
  function deliver(moduleId = 'engine', layout = 'lark') {
    const entity = body(moduleId, layout); receiver(entity); if (!owner.physics.towLine(entity)) tow(entity);
    return owner.deliver(moduleId, s.shipbreakingYard.revision, job(layout).id);
  }
  function close() { owner.destroy?.(); native._disableSg02DynamicAuthority?.(); sim.dispose(); }
  if (discover) { owner.discover({ anchor: { x: 500, z: 500 }, sectorId: SITE.sectorId }); await admit(); }
  return { sim, s, owner, player, native, kernel, offers, cues, receipts, tick, admit, job, body, near, accept, disconnect, receiver, tow, deliver, close };
}


async function released(){
 const h=await fixture();okay(h.accept());okay(h.disconnect());
 const part=h.body(),frame=h.body('frame');h.near(part);h.tow(part);h.tick(3);
 return Object.assign(h,{part,frame,resecure:()=>h.owner.resecure('engine-clamp',h.s.shipbreakingYard.revision,h.job().id)});
}
test('actual part offer requests native re-securing of the same LARK originals without hull repair or payment',async()=>{
 const h=await released();try{
  const before={hull:h.part.hull,credits:h.s.player.credits,pos:{x:h.part.pos.x,z:h.part.pos.z},id:h.part.id};
  okay(h.owner.inspectPart('engine',h.job().id));const offer=h.offers.at(-1);
  assert.ok(offer.actions.length<=9);assert.ok(offer.actions.some(a=>a.id==='leave'));
  const action=offer.actions.find(a=>a.id==='resecure');assert.ok(action);assert.equal(action.disabled,false,action.title);
  let result;const card=shipbreakingDecisionSpec(offer,payload=>{result=h.owner.command(payload);});
  assert.ok(card.choices.length<=8);assert.ok(card.choices.some(c=>c.id==='leave'));assert.equal(card.onChoose('resecure'),true);okay(result);
  h.tick(4);const status=h.owner.physics.lineStatus(h.job(),'engine-clamp');assert.equal(status.connected,true);assert.equal(status.admitted,true);
  assert.equal(h.part.id,before.id);assert.equal(h.part.hull,before.hull);assert.equal(h.s.player.credits,before.credits);
  assert.equal(h.owner.physics.deliveryGate(h.job(),'engine',h.owner.receiver()).reason,'component_still_attached');
  queuePhysicsImpulse(h.frame,{x:100,z:0});h.tick(30);assert.ok(Math.hypot(h.part.pos.x-before.pos.x,h.part.pos.z-before.pos.z)>.001);
  h.near(h.part);okay(h.disconnect());assert.equal(h.job().couplings['engine-clamp'].status,'released');
 }finally{h.close();}
});
test('broken or hazardous couplings, foreign lines, moving loads and stale originals cannot re-secure',async()=>{
 const h=await released();try{
  h.job().couplings['engine-clamp'].status='broken';assert.equal(h.resecure().ok,false);h.job().couplings['engine-clamp'].status='released';
  h.part.vel.x+=20;assert.equal(h.resecure().ok,false);h.part.vel.copy(h.frame.vel);
  const other=h.sim.spawn(makeShipEntitySpec('ship_kestrel',{pos:{x:h.part.pos.x+50,z:h.part.pos.z},fittings:[]}));
  h.tick(2);const foreign=h.kernel.attachments.create({defId:'attachment_massline',ownerId:other.id,targetId:h.part.id,sourceWorld:other.pos,targetWorld:h.part.pos});okay(foreign);
  assert.equal(h.resecure().ok,false);h.kernel.attachments.cut(foreign.attachment.id,null,'fixture');
  h.part.occupantGeneration++;assert.equal(h.resecure().ok,false);
  assert.equal(h.owner.physics.resecureGate(h.job('meridian'),'coolant-return').ok,false);
 }finally{h.close();}
});
test('attachment callback cannot duplicate request; callback save cold-recreates one same-span clamp',async()=>{
 const h=await released();let cold;try{
  let nested,snapshot;const off=h.sim.bus.on('tether:attached',e=>{if(e.controlMode!=='shipbreakingYard')return;nested=h.resecure();snapshot=copy(h.owner.serialize());});
  okay(h.resecure());off();h.tick(4);assert.equal(nested.ok,false);assert.ok(snapshot);
  const token=`shipbreaking:${h.job().id}:engine-clamp`;
  assert.equal(h.kernel.attachments.listForEntity(h.frame.id).filter(l=>l.state==='active'&&l.actionInstanceId===token).length,1);
  cold=await fixture({discover:false});cold.owner.deserialize(snapshot);cold.owner.afterContinue();await cold.admit();cold.tick(4);
  const status=cold.owner.physics.lineStatus(cold.job(),'engine-clamp');assert.equal(status.connected,true);assert.equal(status.admitted,true);
  assert.ok(Math.abs(status.line.restLength-h.owner.physics.lineStatus(h.job(),'engine-clamp').line.restLength)<.001);
  assert.equal(cold.job().recoveredCr,0);assert.equal(cold.job().modules.engine.hull,h.job().modules.engine.hull);
 }finally{cold?.close();h.close();}
});
test('attachment callback replacing a life or leaving flight aborts without a surviving new clamp or receipt',async()=>{
 for(const mutate of [h=>h.part.occupantGeneration++,h=>h.player.occupantGeneration++,h=>h.s.mode='menu',h=>h.s.ui.docked=true,h=>h.s.world.currentSectorId='sector_helios_prime',h=>h.owner.physics.dispose()]){
 const h=await released();try{
  const before=h.s.player.credits;const off=h.sim.bus.on('tether:attached',e=>{if(e.controlMode==='shipbreakingYard')mutate(h);});
  assert.equal(h.resecure().ok,false);off();
  assert.equal(h.s.player.credits,before);assert.equal(h.job().couplings['engine-clamp'].status,'released');
  assert.equal(h.kernel.attachments.listForEntity(h.frame.id).filter(l=>l.state==='active'&&l.actionInstanceId===`shipbreaking:${h.job().id}:engine-clamp`).length,0);
 }finally{h.close();}
 }
});

test('callback cutting the newly created clamp fails and a callback save cannot remint that canceled restraint',async()=>{
 const h=await released();let cold;try{
  let snapshot,calls=0;const off=h.sim.bus.on('tether:attached',event=>{
   if(event.controlMode!=='shipbreakingYard')return;calls++;
   h.kernel.attachments.cut(event.attachmentId,null,'review_cancel');snapshot=copy(h.owner.serialize());
  });
  assert.equal(h.resecure().ok,false);off();assert.equal(calls,1);assert.notEqual(h.job().couplings['engine-clamp'].status,'connected');
  assert.equal(h.owner.physics.lineStatus(h.job(),'engine-clamp').connected,false);
  cold=await fixture({discover:false});cold.owner.deserialize(snapshot);cold.owner.afterContinue();await cold.admit();cold.tick(5);
  assert.notEqual(cold.job().couplings['engine-clamp'].status,'connected');assert.equal(cold.owner.physics.lineStatus(cold.job(),'engine-clamp').connected,false);
 }finally{cold?.close();h.close();}
});
