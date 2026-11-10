import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createSimulation } from '../src/core/sim.js';
import { ships, makeShipEntitySpec, buildSlotList, shipworksStationAccess } from '../src/systems/ships.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { sableVenn } from '../src/systems/sableVenn.js';
import { SABLE_VENN as S, sableVennWorkshop, sableVennServiceAvailable, sableVennPresentation } from '../src/data/sableVenn.js';
import { SHIPS } from '../src/data/ships.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { SABLE_VENN_RADIUS } from '../src/data/sableVennBody.js';

let previous;test.before(()=>{previous=snapshotFeatureMaps();applyFeatureConfigToMaps(PRODUCTION_FEATURES);});test.after(()=>restoreFeatureMaps(previous));
function boot(){const state=createGameState(401),sim=createSimulation({state,seed:401,systems:[ships,cargo,economy,spawnBudget,sableVenn]});
  state.mode='flight';state.world.currentSectorId='sector_helios_prime';const owner=sim.registry.get('ships');owner.newGame();
  const player=sim.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:state.player,fittings:state.player.ownedShips[0].fittings,pos:{x:0,z:0}}));state.playerId=player.id;
  sim.spawn({type:'station',team:2,factionId:'faction_dmc',pos:{x:0,z:0},radius:50,mass:1e9,hull:1e9,data:{stationId:S.stationId,dockRadius:100}});
  sim.spawn({type:'station',team:2,factionId:'faction_scn',pos:{x:0,z:0},radius:50,mass:1e9,hull:1e9,data:{stationId:'station_helios',dockRadius:100}});
  state.ui.docked=true;state.ui.dockedStationId='station_helios';state.player.credits=100000;
  const system=sim.registry.get('sableVenn'),visit=()=>{state.world.currentSectorId=S.sectorId;state.ui.dockedStationId=S.stationId;state.tick+=60;system.update(1/60,state);};
  return {state,sim,owner,system,visit,close:()=>sim.dispose()};}
test('first actual catalog purchase introduces a single budgeted workshop with the accepted instance receipt',()=>{
  const h=boot();try{
    assert.equal(sableVennWorkshop(h.state),null);const credits=h.state.player.credits;
    h.sim.bus.emit('ui:buyModule',{defId:'mod_shield_booster_s',shipIndex:0});
    assert.equal(h.state.player.credits,credits-6000);const item=h.state.player.moduleInventory.at(-1);
    assert.equal(h.system.serialize().lastReceiptId,'module:'+item.instanceId);assert.equal(h.system.serialize().met,true);
    assert.equal(sableVennWorkshop(h.state),null);h.visit();
    const actor=sableVennWorkshop(h.state);assert.ok(actor);assert.equal(h.sim.helpers.spawnBudget.ownerForEntity(actor.id),S.worldRecordId);
    assert.equal(sableVennServiceAvailable(h.state),true);
    for(let i=0;i<3;i++){h.state.tick+=60;h.system.update(1/60,h.state);}assert.equal(h.sim.helpers.spawnBudget.current(),1);
    h.sim.bus.emit('sable:demonstrated',{moduleId:'mod_shield_booster_s'});h.sim.bus.emit('sable:demonstrated',{moduleId:'mod_shield_booster_s'});
    assert.deepEqual(h.system.serialize().demonstratedItemIds,['mod_shield_booster_s']);
    assert.equal(sableVennPresentation(h.state,actor).phase,'demonstrate');
    assert.equal(sableVennPresentation(h.state,{...actor}),null);
    actor.data.sableVenn={phase:'receipt',tick:h.state.tick,receiptId:'invented'};assert.equal(sableVennPresentation(h.state,actor),null);
  }finally{h.system.destroy();h.close();}
});
test('denied purchases never introduce a receipt; a fitted inactive hull keeps its true instance identity',()=>{
  const h=boot();try{
    h.state.player.credits=0;h.sim.bus.emit('ui:buyModule',{defId:'mod_shield_booster_s',shipIndex:0});assert.equal(h.system.serialize().met,false);
    h.state.player.credits=100000;h.state.player.ownedShips.push({...h.state.player.ownedShips[0],fittings:[...h.state.player.ownedShips[0].fittings],fittedInstances:{}});
    const slot=buildSlotList(SHIPS.find(s=>s.id==='ship_kestrel')).findIndex(s=>s.type==='shield');
    h.sim.bus.emit('ui:buyModule',{defId:'mod_shield_booster_s',shipIndex:1,fitSlotIndex:slot});
    const instance=h.state.player.ownedShips[1].fittedInstances[slot];assert.ok(instance);assert.equal(h.system.serialize().lastReceiptId,'module:'+instance.instanceId);
  }finally{h.system.destroy();h.close();}
});
test('saved character memory stays bounded and workshop loss never deletes paid gear',()=>{
  const h=boot();try{
    h.sim.bus.emit('ui:buyModule',{defId:'mod_shield_booster_s',shipIndex:0});h.visit();const memory=h.system.serialize(),item=h.state.player.moduleInventory.at(-1),actor=sableVennWorkshop(h.state);
    actor.alive=false;h.sim.bus.emit('entity:killed',{entityId:actor.id});assert.ok(h.state.player.moduleInventory.some(i=>i.instanceId===item.instanceId));
    const lost=h.system.serialize();assert.equal(lost.workshopLost,true);
    h.system.deserialize({...lost,demonstratedItemIds:['invented',...new Array(40).fill('mod_shield_booster_s')]});
    assert.deepEqual(h.system.serialize().demonstratedItemIds,['mod_shield_booster_s']);assert.equal(h.system.serialize().lastReceiptId,memory.lastReceiptId);
    h.sim.helpers.spawnBudget.setMax(1);h.sim.helpers.spawnBudget.request(1,'other');h.state.tick+=60;h.system.update(1/60,h.state);
    assert.equal(sableVennWorkshop(h.state),null);h.system.newGame();assert.equal(h.system.serialize().met,false);
  }finally{h.system.destroy();h.close();}
});
test('the live budgeted Patchwork grants only outfitting; loss or wrong body immediately refuses the same counter',()=>{
  const h=boot();try{
    h.sim.bus.emit('ui:buyModule',{defId:'mod_shield_booster_s',shipIndex:0});h.visit();
    const access=shipworksStationAccess(h.state);assert.equal(access.outfit,true);assert.equal(access.hull,false);
    const actor=sableVennWorkshop(h.state);h.sim.helpers.spawnBudget.release(S.worldRecordId);assert.equal(shipworksStationAccess(h.state).outfit,false);
    h.sim.helpers.spawnBudget.request(1,S.worldRecordId);h.sim.helpers.spawnBudget.bindEntity(actor.id,S.worldRecordId);assert.equal(shipworksStationAccess(h.state).outfit,true);
    actor.alive=false;assert.equal(shipworksStationAccess(h.state).outfit,false);
  }finally{h.system.destroy();h.close();}
});

test('production owners retain the live Ceres workshop service, accepted fit and named finish through Continue',async()=>{
  const runtime=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:612});
  try{
    const state=runtime.state,world=runtime.getSystem('world'),owner=runtime.getSystem('ships');
    state.mode='flight';state.ui.screenStack=[];owner.newGame();state.player.credits=100000;
    const player=runtime.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:state.player,fittings:state.player.ownedShips[0].fittings}));state.playerId=player.id;
    world.enterSector('sector_helios_prime');state.ui.docked=true;state.ui.dockedStationId='station_helios';
    runtime.bus.emit('ui:buyModule',{defId:'mod_shield_booster_s',shipIndex:0});assert.equal(state.sableVenn.met,true);
    runtime.bus.emit('ui:setShipName',{shipIndex:0,name:'Long Measure'});
    runtime.bus.emit('ui:setShipAppearance',{shipIndex:0,appearance:{hullColor:'#527889',accentColor:'#e3ab56',finish:'satin',wear:0.35,decalId:'industrial'}});
    world.enterSector(S.sectorId);const station=state.entityList.find(e=>e.alive&&e.data?.stationId===S.stationId);assert.ok(station);
    world.relocatePlayerInSector({x:station.pos.x+station.radius+150,z:station.pos.z+70},{reason:'sable-route-fixture'});
    state.ui.docked=false;state.ui.dockedStationId=null;assert.equal(await runtime.getSystem('physics').prepareBackend(state),true);
    runtime.runTicks(600);
    const actor=sableVennWorkshop(state);assert.ok(actor);assert.equal(state.entities.get(actor.id),actor);
    const native=runtime.getSystem('physics')._sg02.records.get(actor.id);assert.equal(native?.entity,actor);
    assert.equal(native.colliders.length,5);assert.equal(actor.radius,SABLE_VENN_RADIUS);assert.equal(native.spec.mass,actor.mass);
    state.ui.docked=true;state.ui.dockedStationId=S.stationId;assert.equal(shipworksStationAccess(state).outfit,true,JSON.stringify({sector:state.world.currentSectorId,actor:{id:actor.id,pos:actor.pos,vel:actor.vel,ai:actor.data.ai,intent:actor.data.intent},station:{pos:station.pos,radius:station.radius},owner:runtime.sim?.helpers?.spawnBudget?.ownerForEntity(actor.id),budget:state.spawnBudget?.entityOwners?.get(String(actor.id)),reference:state.spawnBudget?.entityRefs?.get(String(actor.id))===actor,memory:state.sableVenn,access:shipworksStationAccess(state)}));assert.equal(shipworksStationAccess(state).hull,false);
    const slot=buildSlotList(SHIPS.find(s=>s.id==='ship_kestrel')).findIndex(s=>s.type==='engine');
    const receiptBefore=state.sableVenn.lastReceiptId;runtime.bus.emit('ui:buyModule',{defId:'mod_engine_ion_m',shipIndex:0,fitSlotIndex:slot});
    const owned=state.player.ownedShips[0],instance=owned.fittedInstances[slot];assert.ok(instance);assert.notEqual(state.sableVenn.lastReceiptId,receiptBefore);
    assert.equal(state.sableVenn.lastReceiptId,'module:'+instance.instanceId);assert.equal(sableVennPresentation(state,actor).phase,'receipt');
    const expected=JSON.parse(JSON.stringify({credits:state.player.credits,owned,memory:state.sableVenn}));
    const save=runtime.getSystem('save'),envelope=JSON.parse(JSON.stringify(save.serialize('quick')));assert.equal(save.loadEnvelope(envelope,'quick'),true);
    assert.deepEqual(state.player.ownedShips[0],expected.owned);assert.equal(state.player.credits,expected.credits);assert.deepEqual(state.sableVenn,expected.memory);
    state.mode='flight';state.ui.screenStack=[];state.ui.docked=false;assert.equal(await runtime.getSystem('physics').prepareBackend(state),true);runtime.runTicks(60);
    const resumed=sableVennWorkshop(state);assert.ok(resumed,JSON.stringify({sector:state.world.currentSectorId,tick:state.tick,memory:state.sableVenn,actors:state.entityList.filter(e=>e.data?.worldRecordId===S.worldRecordId).map(e=>({id:e.id,alive:e.alive,pos:e.pos,hull:e.hull,budget:state.spawnBudget?.entityOwners?.get(String(e.id))})),budget:{max:state.spawnBudget?.max,ownerCounts:[...(state.spawnBudget?.byRequester||new Map())]}}));assert.notEqual(resumed,actor);assert.equal(sableVennPresentation(state,actor),null);
    const resumedNative=runtime.getSystem('physics')._sg02.records.get(resumed.id);assert.equal(resumedNative?.entity,resumed);assert.equal(resumedNative.colliders.length,5);assert.equal(resumed.radius,SABLE_VENN_RADIUS);
    state.ui.docked=true;state.ui.dockedStationId=S.stationId;assert.equal(shipworksStationAccess(state).outfit,true);
    console.log('SABLE_PRODUCTION_CONTINUE',JSON.stringify({tick:state.tick,nativeBody:true,berthDistance:Math.hypot(resumed.pos.x-station.pos.x,resumed.pos.z-station.pos.z),receipt:state.sableVenn.lastReceiptId,name:state.player.ownedShips[0].name,finish:state.player.ownedShips[0].appearance.finish}));
  }finally{runtime.dispose();}
});
