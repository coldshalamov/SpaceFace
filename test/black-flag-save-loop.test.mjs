// Focused source integration, not browser or production-manifest acceptance.
// Core performs canonical spawn/remove; real save envelopes traverse loadEnvelope(),
// including checksum preparation, owner deserialization, entity remapping and save:loaded.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { ships, makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { cargo, addCargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { combat } from '../src/systems/combat.js';
import { missions } from '../src/systems/missions.js';
import { shipjack } from '../src/systems/shipjack.js';
import { save } from '../src/save/saveSystem.js';
import { BLACK_FLAG_ENCOUNTER_BY_ID } from '../src/data/blackFlag.js';
import { SECTORS } from '../src/data/sectors.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { quoteYardOperation } from '../src/shipjack/yardOperations.js';

function boot(encounterId) {
  // No save.update()/file store and no synthetic world owner. These explicit owners
  // exercise the persistence transaction while the two source bodies remain stable.
  const sim=createSimulation({seed:4242,systems:[ships,cargo,economy,combat,missions,shipjack,save],updateOrder:[shipjack]});
  const {state,bus}=sim,row=BLACK_FLAG_ENCOUNTER_BY_ID.get(encounterId);
  const receiverId=row.stationId;
  const receiver=SECTORS.find(s=>s.id===row.sectorId).stations.find(s=>s.id===receiverId);
  state.mode='flight';state.onboarding={active:false,finished:true};
  const startingCredits=row.id==='black_flag_blackbird'?10000:5000;
  state.meta.createdAt='black-flag-save-loop-4242';state.player.credits=startingCredits;
  state.world.currentSectorId=row.sectorId;
  state.ui.docked=false;state.ui.dockedStationId=null;
  const get=name=>sim.registry.get(name),owner=get('ships'),jack=get('shipjack');
  owner.newGame();
  const receiverPos=sectorLocalToGlobalForSector(receiver.pos,row.sectorId);
  const base={x:receiverPos.x,z:receiverPos.z-100};
  const starter=sim.spawn(makeShipEntitySpec(state.player.ownedShips[0].defId,{isPlayer:true,player:state.player,
    fittings:state.player.ownedShips[0].fittings,pos:base}));
  state.playerId=starter.id;owner.recomputeActiveShip();
  assert.equal(addCargo(state,'cmdty_ore_iron',7),7);
  const target=sim.spawn(makeShipEntitySpec(row.defId,{team:2,factionId:row.factionId,
    fittings:fittingsFromDefaultModules(row.defId,row.fitted),pos:{x:base.x+60,z:base.z},ai:{archetype:'trader',passive:true,fsm:'idle'}}));
  target.data.name=row.name;target.data.shipjackEncounterId=row.id;
  target.data.shipjackUncrewed=row.crew==='evacuated';target.shield=0;
  target.hull=target.hullMax*(row.id==='black_flag_blackbird'?0.5:row.condition);
  if(row.id==='black_flag_blackbird')target.data.cargo={items:{cmdty_electronics:2},usedVolume:2,usedMass:2};
  const vessel=jack.admit(target,{origin:row.id,name:row.name,ownerId:row.ownerId,
    profile:row.id==='black_flag_blackbird'?'corporate':'civilian',crew:row.crew,legalCategory:row.legalCategory});
  vessel.recoveryAuthorized=row.legalCategory==='recovery';vessel.materializationOwner='shipjack';
  state.player.shipjack.encounters[row.id]={admitted:true,vesselId:vessel.vesselId,outcome:'open'};
  const station=sim.spawn({type:'station',pos:receiverPos,radius:50,hull:100000,hullMax:100000,
    flags:{persistent:true},data:{stationId:receiverId,name:receiver.name}});
  sim.helpers.disableShipjackSubsystem({entityId:target.id,subsystemId:'subsystem_drive'});
  sim.runTicks(1);get('combat').kernel.prePhysics(SIM_DT);
  const advance=seconds=>sim.runTicks(Math.ceil(seconds/SIM_DT));
  const command=action=>{
    const result=jack.command({action,targetId:target.id,generation:vessel.generation});
    assert.equal(result.ok,true,`${action}: ${result.reason}`);return result;
  };
  const dock=()=>{state.mode='flight';state.ui.docked=true;state.ui.dockedStationId=receiverId;bus.emit('dock:docked',{stationId:receiverId});};
  const undock=()=>{state.ui.docked=false;state.ui.dockedStationId=null;bus.emit('dock:undocked',{stationId:receiverId});};
  const roundTrip=label=>{
    const envelope=JSON.parse(JSON.stringify(get('save').serialize(label)));
    assert.equal(get('save').loadEnvelope(envelope,label),true,`real save envelope restored: ${label}`);
    state.mode='flight';sim.runTicks(1);
    return envelope;
  };
  const yard=(action,operationId,extra={})=>{
    const request={action,vesselId:vessel.vesselId,...extra};
    const quoted=quoteYardOperation(state,request);assert.equal(quoted.ok,true,quoted.reason);
    const payload={...request,operationId,quote:quoted.quote};
    const receipt=jack.command(payload);assert.equal(receipt.ok,true,receipt.reason);
    return {payload,receipt};
  };
  return {sim,state,bus,get,row,receiverId,startingCredits,starter,target,vessel,station,advance,command,dock,undock,roundTrip,yard};
}

function secure(h) {
  h.command('scan');
  h.bus.emit('shipjack:opportunity',{encounterId:h.row.id,vesselId:h.vessel.vesselId});
  const offer=Object.values(h.state.missions.boards).flatMap(b=>b.slots || []).find(m=>m.source==='blackFlag'&&m.params.vesselId===h.vessel.vesselId&&m.params.blackFlagPattern===(h.row.id==='black_flag_blackbird'?'blackbird_prize':'intact_return'));
  assert.ok(offer);assert.equal(h.get('missions').acceptMission(offer.id),true);
  h.command('hail');h.advance(1.7);h.command('port');h.advance(1.3);h.command('helm');
  assert.equal(h.state.player.ownedShips.length,2);
  return h.state.player.ownedShips.find(s=>s.vesselId===h.vessel.vesselId);
}
function vessel(state,id){return state.player.shipjack.vesselsById[id];}
function moduleIds(owned){return Object.values(owned.fittedInstances || {}).map(m=>m.instanceId).sort();}

test('lawful recovery crosses the actual save envelope before and after return without duplicating wages, hulls or fittings',t=>{
  const h=boot('black_flag_empty_seat');t.after(()=>h.sim.dispose());
  const owned=secure(h),id=h.vessel.vesselId,ids=moduleIds(owned);
  assert.ok(ids.length>=2);assert.equal(vessel(h.state,id).signature.broadcastFlagged,undefined);
  h.dock();assert.equal(vessel(h.state,id).location.kind,'berth');
  h.roundTrip('black-flag-lawful-before-return');
  const restored=h.state.player.ownedShips.find(s=>s.vesselId===id);
  assert.deepEqual(moduleIds(restored),ids);assert.equal(vessel(h.state,id).title,'disputed');
  assert.equal(vessel(h.state,id).custodian,'player');assert.equal(vessel(h.state,id).crewSafe,true);
  assert.equal(vessel(h.state,id).condition.hull,0.68);
  assert.equal(h.state.player.cargo.items.cmdty_ore_iron,7);
  h.dock();const returned=h.yard('return','save-loop:lawful:return');
  const after=h.state.player.credits;
  assert.equal(after,5000+returned.receipt.amount+300);
  assert.equal(h.state.player.ownedShips.length,1);assert.equal(h.state.player.moduleInventory.length,0);
  assert.equal(vessel(h.state,id).title,'returned');assert.equal(vessel(h.state,id).custodian,h.row.ownerId);
  h.roundTrip('black-flag-lawful-after-return');
  h.dock();assert.equal(h.get('shipjack').command(returned.payload).ok,true);
  assert.equal(h.state.player.credits,after);assert.equal(h.state.player.ownedShips.length,1);
  assert.equal(h.state.player.moduleInventory.length,0);assert.equal(h.state.player.cargo.items.cmdty_ore_iron,7);
  assert.equal(h.state.player.shipjack.yardReceipts.filter(r=>r.operationId===returned.payload.operationId).length,1);
  assert.ok(h.state.missions.blackFlagJobs.byVessel[id].finished.includes('intact_return'));
  t.diagnostic(`SOURCE INTEGRATION: hail Empty Seat → honor crew passage → secure damaged hull → receive at ${h.row.stationId} → save/load → return for ${returned.receipt.amount} cr plus 300 cr employer wage → save/load → replay return; credits ${after}, owned hulls 1, loose modules 0, original iron 7, claimant title returned.`);
});

test('illicit Blackbird keeps both bodies and cargo across real Continue, then repaired unique extraction settles once after a second save',t=>{
  const h=boot('black_flag_blackbird');t.after(()=>h.sim.dispose());
  const owned=secure(h),id=h.vessel.vesselId,ids=moduleIds(owned);
  assert.equal(vessel(h.state,id).title,'disputed');assert.equal(vessel(h.state,id).signature.broadcastFlagged,true);
  h.command('transfer');h.advance(2.1);
  assert.equal(h.state.player.ownedShips[h.state.player.activeShipIndex].vesselId,id);
  assert.equal(h.state.player.cargo.items.cmdty_electronics,2);
  const oldHullId=h.state.player.ownedShips[0].vesselId;
  assert.equal(h.state.player.ownedShips[0].cargo.items.cmdty_ore_iron,7);
  const beforeHull=h.state.entities.get(h.state.playerId).hull;
  h.roundTrip('black-flag-blackbird-helm');
  assert.equal(h.state.player.ownedShips.length,2);
  assert.deepEqual(moduleIds(h.state.player.ownedShips.find(s=>s.vesselId===id)),ids);
  assert.equal(h.state.entities.get(h.state.playerId).hull,beforeHull);
  assert.equal(h.state.player.cargo.items.cmdty_electronics,2);
  assert.equal(vessel(h.state,id).title,'disputed');assert.equal(vessel(h.state,id).signature.broadcastFlagged,true);
  const bodies=h.state.entityList.filter(e=>e.alive&&e.type==='ship'&&[id,oldHullId].includes(e.data?.vesselId));
  assert.equal(bodies.length,2);assert.equal(new Set(bodies.map(e=>e.data.vesselId)).size,2);
  const oldBody=bodies.find(e=>e.data.vesselId===oldHullId);
  const reverse=h.get('ships').captureAndTransfer({targetId:oldBody.id,targetGeneration:oldBody.data.shipjackGeneration,vesselId:oldHullId,operationId:'save-loop:blackbird:reverse'});
  assert.equal(reverse.ok,true,reverse.reason);assert.equal(h.state.player.cargo.items.cmdty_ore_iron,7);
  h.dock();
  const parkedIndex=h.state.player.ownedShips.findIndex(s=>s.vesselId===id);
  h.bus.emit('ui:transferParkedCargo',{shipIndex:parkedIndex,direction:'load'});
  assert.equal(h.state.player.cargo.items.cmdty_electronics,2);
  const denial=quoteYardOperation(h.state,{vesselId:id,action:'sell'});
  assert.equal(denial.ok,false);assert.match(denial.reason,/title/);
  const titleDenial=quoteYardOperation(h.state,{vesselId:id,action:'register'});
  assert.equal(titleDenial.ok,false);assert.match(titleDenial.reason,/custody alone is not title/);
  const prize=h.state.player.ownedShips[parkedIndex],slot=prize.fittings.findIndex(d=>d==='unique_blackbird_governor');
  assert.ok(slot>=0);const governorId=prize.fittedInstances[slot].instanceId;
  assert.equal(prize.fittedInstances[slot].condition,0);
  const repaired=h.yard('repair_module','save-loop:blackbird:repair',{slotIndex:slot});
  assert.equal(prize.fittedInstances[slot].condition,1);
  const extraction=h.yard('extract','save-loop:blackbird:extract',{slotIndex:slot});
  assert.equal(extraction.receipt.status,'processing');
  h.undock();h.advance(19);h.dock();h.advance(SIM_DT);
  const module=h.state.player.moduleInventory.find(m=>m.instanceId===governorId);
  assert.ok(module,JSON.stringify({job:h.state.player.shipjack.yards[id],receipt:h.state.player.shipjack.yardReceipts.at(-1),location:vessel(h.state,id).location,simTime:h.state.simTime}));
  assert.equal(module.defId,'unique_blackbird_governor');assert.equal(module.condition,1);
  assert.equal(module.provenance.sourceVesselId,id);assert.equal(module.provenance.titleAtExtraction,'disputed');
  assert.equal(prize.shipjackDriveRemoved,true);
  const after=h.state.player.credits;
  assert.equal(after,h.startingCredits+600+repaired.receipt.amount+extraction.receipt.quote.amount);
  h.roundTrip('black-flag-blackbird-stripped');h.dock();
  assert.equal(h.get('shipjack').command(extraction.payload).ok,true);
  assert.equal(h.get('shipjack').command(repaired.payload).ok,true);
  assert.equal(h.state.player.credits,after);
  assert.equal(h.state.player.moduleInventory.filter(m=>m.instanceId===governorId).length,1);
  assert.equal(h.state.player.ownedShips.find(s=>s.vesselId===id).fittings[slot],null);
  assert.equal(h.state.player.ownedShips.find(s=>s.vesselId===id).shipjackDriveRemoved,true);
  assert.equal(vessel(h.state,id).title,'disputed');
  assert.equal(h.state.player.cargo.items.cmdty_ore_iron,7);
  assert.equal(h.state.player.cargo.items.cmdty_electronics,2);
  assert.equal(h.state.player.shipjack.yardReceipts.filter(r=>r.operationId===extraction.payload.operationId).length,1);
  t.diagnostic(`SOURCE INTEGRATION: coerce Blackbird after real drive disable → secure disputed custody → transfer physical helm, leave Hitch with 7 iron → save/load → reverse into retained Hitch → receive at ${h.receiverId}; honest yard refuses title → unload 2 electronics → repair governor ${repaired.receipt.amount} cr → extract same governor ${extraction.receipt.quote.amount} cr → save/load → replay repair/extraction; credits ${after}, owned hulls 2, unique governor 1 at condition 1, Blackbird drive missing and title disputed.`);
});
