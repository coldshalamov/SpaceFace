import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './fixtures/anvil-orchard-custody-source.mjs';
import { planetRuntime, readPlayerOrchardFeed } from '../src/systems/planetRuntime.js';
import { mining as miningDefinition } from '../src/systems/mining.js';
import { input as inputDefinition } from '../src/systems/input.js';
import { describeEntity } from '../src/systems/interactionDescriptors.js';
import { PLANET_SITE } from '../src/data/planets.js';
import { createOrchardHarvestEncounter } from '../src/world/anvilOrchardHarvestEncounter.js';
import { cargo as cargoDefinition } from '../src/systems/cargo.js';
import { ANVIL_ORCHARD } from '../src/data/anvilOrchard.js';

const DT = 1 / 60;
function inputHarness() {
  const input = Object.create(inputDefinition);
  Object.assign(input, { _keys: Object.create(null), _ndc:{x:0,y:0}, _screen:{x:0,y:0,active:false},
    _m0:false,_m1:false,_m2:false,_lastKbmMs:0,helpers:{raycastToPlane:()=>({x:0,z:0})},bus:{emit(){}} });
  return input;
}
async function harness() {
  const h = await setup(), state=h.sim.state, player=h.worker, frame=h.frame;
  delete player.data.anvilSlingWitness; delete player.data.itinerary;
  player.pos.x=frame.pos.x; player.pos.z=frame.pos.z-180;
  player.vel.x=100; player.vel.z=0;
  player.data.miningBeam={tierId:'beam_mk1'};
  Object.assign(frame.data, {worldSiteTargetable:true,isLandmark:true,landmarkId:ANVIL_ORCHARD.id});
  h.facade._syncSg02DynamicAuthorityEntities(state);
  const cargo={amount:0,addCargo(_id,qty){this.amount+=qty;return qty;}};
  const registry={get(name){ if(name==='cargo')return cargo;if(name==='planetRuntime')return planet;return h.sim.registry.get(name); }};
  const planet=Object.create(planetRuntime);
  planet.init({state,bus:h.sim.bus,helpers:h.sim.helpers,registry});
  Object.assign(state.planet,{active:true,siteId:ANVIL_ORCHARD.planetId,center:{x:player.pos.x-950,z:player.pos.z}});
  Object.assign(state.planet.player,{region:'skim',collectorOn:true});
  state.player.targetId=frame.id;
  state.ui.componentSelection={targetId:frame.id,stableKey:describeEntity(state,frame).stableKey,componentId:'orchard_socket_1'};
  const mining=Object.create(miningDefinition);mining.init({state,bus:h.sim.bus,helpers:h.sim.helpers,registry});
  const input=inputHarness();input._keys.KeyB=true;
  return {...h,state,player,frame,cargo,planet,mining,input};
}
function tick(h, seconds=1) {
  h.input.update(DT,h.state);
  h.planet._tickHarvest(seconds,h.state,h.state.planet,PLANET_SITE);
  h.mining.update(DT,h.state);
}
test('real B feeds earned skim into one native player pod; hold cannot release, fresh B can',async()=>{
 const h=await harness();try{
  assert.deepEqual(readPlayerOrchardFeed(h.state,h.frame,1),{eligible:true,reason:null});
  tick(h);
  assert.equal(h.state.input.actions.siteBeam,true);
  assert.equal(h.cargo.amount,0);
  const pod=h.state.entityList.find(e=>e.data?.orchardKind==='pod');assert.ok(pod);
  assert.equal(pod.data.amount,1);assert.equal(pod.data.orchardContributor,'player');
  assert.equal(h.state.sites.anvilOrchard.lots[0].contributor,'player');
  assert.equal(h.state.sites.anvilOrchard.sourceRemaining,47);
  tick(h);assert.equal(pod.data.amount,2);assert.equal(h.state.sites.anvilOrchard.lots.length,1);
  assert.equal(h.state.sites.anvilOrchard.sockets[1].status,'stowed','held feed never opens first pod');
  h.state.planet.player.collectorOn=false;tick(h,0);assert.equal(h.state.sites.anvilOrchard.sockets[1].status,'stowed');
  h.input._keys.KeyB=false;tick(h,0);h.input._keys.KeyB=true;tick(h,0);
  assert.equal(h.state.sites.anvilOrchard.sockets[1].status,'releasing');
  // Complete the ordinary native opening and handoff before the cargo owner retires this pod.
  for(let t=1;t<=ANVIL_ORCHARD.openingSteps;t++){
    h.state.tick=t;h.owner.step(DT,t);
    h.owner.publishCompletedOrchardContacts(h.owner.completedOrchardTail(),()=>h.owner.drainContactImpacts());
    h.mining.update(DT,h.state);
  }
  assert.equal(h.state.sites.anvilOrchard.sockets[1].status,'drifting');
  assert.ok(h.facade.readOrchardPodReady(pod));
  const cargoOwner=Object.create(cargoDefinition);
  cargoOwner.init({state:h.state,bus:h.sim.bus,helpers:h.sim.helpers,registry:h.sim.registry});
  const receipt={collectorId:h.player.id,pickupId:pod.id,kind:'cargo',commodityId:ANVIL_ORCHARD.commodityId,amount:2};
  h.sim.bus.emit('pickup:collected',receipt);
  assert.equal(receipt.acceptedAmount,2);assert.equal(receipt.rejectedAmount,0);
  assert.equal(h.state.player.cargo.items[ANVIL_ORCHARD.commodityId],2);
  assert.equal(h.state.sites.anvilOrchard.lots[0].outcome,'delivered');
  assert.equal(h.state.sites.anvilOrchard.lots[0].contributor,'player');
  cargoOwner.destroy?.();
 }finally{h.planet.destroy();h.close();}
});
test('native refusal falls back once to normal cargo; no foreign harvest or free pod',async()=>{
 const h=await harness();try{
  const read=h.facade.readOrchardFramePose;h.facade.readOrchardFramePose=()=>null;
  tick(h);h.facade.readOrchardFramePose=read;
  assert.equal(h.cargo.amount,1);assert.equal(h.state.sites.anvilOrchard.sourceRemaining,48);
  assert.equal(h.state.entityList.filter(e=>e.data?.orchardKind==='pod').length,0);
  assert.equal(h.machine.acceptPlayerOrchardHarvest(h.player,{frame:h.frame,socket:1,qty:4,commodityId:ANVIL_ORCHARD.commodityId}),0);
 }finally{h.planet.destroy();h.close();}
});

test('player contribution survives real Save/Continue and cannot be filled by the worker route',async()=>{
 const h=await harness();try{
  tick(h);
  const save=h.sim.registry.get('save');
  const envelope=JSON.parse(JSON.stringify(save.serialize('player-orchard-feed')));delete envelope.checksum;
  assert.equal(save.loadEnvelope(envelope),true);h.facade._finishNativeRestore();
  assert.equal(await h.facade.prepareBackend(h.state),true);
  const pod=h.state.entityList.find(e=>e.data?.orchardKind==='pod');
  const frame=h.state.entityList.find(e=>e.data?.orchardKind==='frame');
  const player=h.state.entities.get(h.state.playerId);
  assert.equal(h.state.sites.anvilOrchard.lots[0].contributor,'player');
  assert.equal(pod.data.orchardContributor,'player');
  assert.equal(h.facade._sg02.records.get(pod.id).body.isFixed(),true);
  player.data.anvilSlingWitness=true;player.data.itinerary={kind:'anvil_work',role:'collector',phase:'collect'};
  assert.equal(h.machine.acceptOrchardHarvest(player,{frame,socket:1,qty:1,commodityId:ANVIL_ORCHARD.commodityId}),0);
  assert.equal(pod.data.amount,1);assert.equal(h.state.sites.anvilOrchard.sourceRemaining,47);
 }finally{h.planet.destroy();h.close();}
});
test('full hold and refused insertion discard that yield once, with no later retroactive pod',async()=>{
 const h=await harness();try{
  h.state.player.cargo.capVolume=0;
  h.cargo.addCargo=(id,qty)=>cargoDefinition.addCargo.call({state:h.state},id,qty);
  const read=h.facade.readOrchardFramePose;h.facade.readOrchardFramePose=()=>null;
  tick(h);h.facade.readOrchardFramePose=read;
  assert.equal(h.state.planet.player.pendingShallow,0);
  tick(h,0);
  assert.equal(h.state.sites.anvilOrchard.sourceRemaining,48);
  assert.equal(h.state.entityList.filter(e=>e.data?.orchardKind==='pod').length,0);
 }finally{h.planet.destroy();h.close();}
});

test('feed admission reports real skim, speed, beam reach and weather',async()=>{
 const h=await harness();try{
  h.player.vel.x=7;assert.equal(readPlayerOrchardFeed(h.state,h.frame,1).reason,'increase-speed');
  h.player.vel.x=8;assert.equal(readPlayerOrchardFeed(h.state,h.frame,1).eligible,true);
  h.state.planet.center.x=h.player.pos.x-1040;assert.equal(readPlayerOrchardFeed(h.state,h.frame,1).reason,'enter-skim');
  h.state.planet.center.x=h.player.pos.x-879;assert.equal(readPlayerOrchardFeed(h.state,h.frame,1).reason,'enter-skim');
  h.state.planet.center.x=h.player.pos.x-950;h.player.pos.z=h.frame.pos.z-1000;h.state.planet.center.z=h.player.pos.z;
  assert.equal(readPlayerOrchardFeed(h.state,h.frame,1).reason,'beam-reach');
  h.player.pos.z=h.frame.pos.z-180;h.state.planet.center.z=h.player.pos.z;h.state.tick=720;
  assert.equal(readPlayerOrchardFeed(h.state,h.frame,1).reason,'wait-calm');
 }finally{h.planet.destroy();h.close();}
});
test('foreman release guidance follows the Scoop and current beam binding',async()=>{
 const h=await harness();try{
  tick(h);h.state.planet.orchardFrameId=h.frame.id;
  h.state.player.hints.anvilOrchardAlin={heard:{intro:true},lastSpokeAt:-20};
  h.state.settings.controls.bindings={...h.state.settings.controls.bindings,siteBeam:['KeyN']};
  const said=[],ctx=h.sim.registry.ctx;ctx.helpers.voice={say(line){said.push(line);return true;},cancel(){}};
  const encounter=createOrchardHarvestEncounter(ctx);h.state.tick=60;h.state.simTime=1;encounter.update(h.state);
  assert.match(said.at(-1).text,/Close the Scoop, release N, then hold it again/);
  assert.equal(said.at(-1).valid(),true);h.state.planet.player.collectorOn=false;
  assert.equal(said.at(-1).valid(),false);encounter.destroy();
 }finally{h.planet.destroy();h.close();}
});
