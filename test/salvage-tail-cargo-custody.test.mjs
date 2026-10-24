import {admitCapturedVessel} from '../src/systems/shipControlTransfer.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {combat} from '../src/systems/combat.js';
import {cargo} from '../src/systems/cargo.js';
import {spawnBudget} from '../src/systems/spawnBudget.js';
import {encounterDirector} from '../src/systems/encounterDirector.js';
import {save} from '../src/save/saveSystem.js';
function boot(shape='salvage_tail') {
 const sim=createSimulation({seed:4242,systems:[combat,cargo,spawnBudget,encounterDirector,save]});
 const {state,bus}=sim;state.mode='flight';state.world.currentSectorId='sector_helios_prime';state.story.beatIndex=7;
 state.story.depthProgramEncounters={completed:{opening_hauler_raid:{outcome:'defended'}}};
 const player=sim.spawn({type:'ship',team:0,pos:{x:0,z:200},vel:{x:0,z:0},radius:8,hull:200,hullMax:200,data:{intent:{},ai:{}}});state.playerId=player.id;
 const d=sim.registry.get('encounterDirector');const req=d.requestAuthoredEncounter({shapeId:shape,encounterId:'tail-test:'+shape,sectorId:state.world.currentSectorId,anchor:{x:0,z:0},zoneType:'trade_lane',zoneRadius:800,force:true});assert.equal(req.ok,true,JSON.stringify(req));
 const live=state.encounterDirector.live[req.encounterId],m=d.entsOf(live,'hauler')[0],rs=d.entsOf(live,'raider');
 const events=[];for(const n of ['faction:repDelta','economy:grantCredits','news:publish','encounter:resolved','freight:custodyReceipt'])bus.on(n,p=>events.push({n,p:structuredClone(p)}));
 return {sim,state,bus,player,d,live,m,rs,events};
}
const total=r=>r.carrierQty+r.playerCollectedQty+r.raiderSecuredQty+r.stationRecoveredQty+r.deliveredQty+r.lostQty+r.pods.filter(p=>p.status==='live').reduce((n,p)=>n+p.qty,0);
const kill=h=>h.sim.registry.get('combat').kill(h.m,h.rs[0].id);
test('authored custody leaves the shadow helm, hold and revenge motive intact',()=>{
 const h=boot();assert.equal(h.live.data.predationStatus,'authored');assert.equal(h.live.plan.predation.engagementOwner,'encounter');
 assert.equal(h.m.data.intent.moveZ,.22);for(const r of h.rs){assert.notEqual(r.data.ai.passive,true);assert.equal(r.data.ai.arrivalHoldUntil,26);assert.equal(r.data.ai.motive,'revenge_raid');}
});
test('stock cold and hot convoy composition retains its engagement behavior',()=>{
 for(const [shape,expected] of [['curtain_convoy','telegraph'],['opening_hauler_raid','active']]) {
 const h=boot(shape);assert.equal(h.live.data.predationStatus,expected);const thief=h.state.entities.get(h.live.data.predationRaiderId);
 assert.equal(thief.data.predationEngagementOwner,undefined);assert.equal(thief.data.ai.predationStatus,expected);
 if(expected==='telegraph')assert.equal(thief.data.ai.passive,true);
 }
});
test('lethal damage spills one conserved lot and duplicate kill cannot mint more',()=>{
 const h=boot(),qty=h.m.data.cargoManifest.totalQty;kill(h);const r=h.live.data.freightCargoCustody;assert.ok(r);assert.equal(total(r),qty);
 const ids=r.pods.map(p=>p.entityId);h.bus.emit('entity:killed',{id:h.m.id,killerId:h.rs[0].id,type:'ship',pos:{...h.m.pos}});
 assert.deepEqual(r.pods.map(p=>p.entityId),ids);assert.equal(h.m.data.cargoManifest.totalQty,0);h.sim.runTicks(120);
 assert.notEqual(h.live.outcome,'interrupted');assert.equal(h.rs.every(e=>e.data.ai.arrivalHoldUntil===undefined),true);
});
test('zero-capacity spill preserves finite carrier quantity until owner loss accounting',()=>{
 const h=boot(),qty=h.m.data.cargoManifest.totalQty;h.d.spawnFreightPickup=()=>null;kill(h);const r=h.live.data.freightCargoCustody;
 assert.equal(r.pods.length,0);assert.equal(r.carrierQty,qty);assert.equal(total(r),qty);
 h.bus.emit('entity:killed',{id:h.m.id,killerId:h.rs[0].id,type:'ship'});assert.equal(r.pods.length,0);
 h.state.simTime=r.deadlineAt+1;h.sim.runTicks(120);assert.equal(total(r),qty);assert.equal(r.lostQty,qty);assert.equal(h.live.outcome,'hauler_lost');
});
test('capture closes thief control without duplicating ledger cargo into existing inventory',()=>{
 const h=boot();kill(h);const r=h.live.data.freightCargoCustody,p=r.pods[0],thief=h.state.entities.get(r.raiderId);
 const receipt={collectorId:thief.id,pickupId:p.entityId,kind:'cargo',commodityId:r.commodityId,amount:p.qty,acceptedAmount:0,rejectedAmount:p.qty};h.bus.emit('pickup:collected',receipt);assert.equal(receipt.acceptedAmount,p.qty);assert.equal(r.raiderSecuredQty,p.qty);
 thief.data.vesselId='owned-tail';thief.data.cargo={items:{cmdty_food:2}};h.state.player.ownedShips=[{vesselId:'owned-tail',cargo:{items:{cmdty_food:2}}}];thief.flags.persistent=true;
 const ai=thief.data.ai,packet=structuredClone(ai),inventory=structuredClone(thief.data.cargo);delete packet.arrivalHoldUntil;
 h.sim.runTicks(120);assert.equal(r.raiderSecuredQty,0);assert.equal(total(r),r.initialQty);assert.equal(r.raiderEscaped,false);assert.equal(thief.data.ai,ai);assert.deepEqual(ai,packet);assert.deepEqual(thief.data.cargo,inventory);assert.equal(thief.flags.persistent,true);
});
test('binding cleanup preserves authored and captured helm while removing its annotations',()=>{
 const h=boot(),r=h.rs[0],ai=r.data.ai,packet=structuredClone(ai);h.d.clearPredation(h.live,'save_restoring');
 assert.equal(r.data.ai,ai);assert.deepEqual(ai,packet);assert.equal(r.data.predationEncounterId,undefined);assert.equal(r.data.predationEngagementOwner,undefined);
 const stock=boot('curtain_convoy'),thief=stock.state.entities.get(stock.live.data.predationRaiderId);thief.data.vesselId='owned-stock';stock.state.player.ownedShips=[{vesselId:'owned-stock'}];const stockAI=structuredClone(thief.data.ai);stock.d.clearPredation(stock.live,'save_restoring');assert.deepEqual(thief.data.ai,stockAI);
});
test('terminal loss stops emitting into a replacement world during synchronous Continue',()=>{
 const h=boot();kill(h);const r=h.live.data.freightCargoCustody,s=h.sim.registry.get('save');let replaced=false;
 h.bus.on('faction:repDelta',p=>{if(p.reason!=='salvage_tail_lost')return;const env=JSON.parse(JSON.stringify(s.serialize('reentry')));assert.equal(s.loadEnvelope(env,'reentry'),true);replaced=true;});
 h.state.simTime=r.deadlineAt+1;h.sim.runTicks(120);assert.equal(replaced,true);assert.equal(h.events.filter(e=>e.n==='news:publish').length,0);assert.equal(h.events.filter(e=>e.n==='encounter:resolved').length,0);
 assert.equal(h.events.filter(e=>e.n==='faction:repDelta'&&e.p.reason==='salvage_tail_lost').length,1);
});

test('captured stock sweeper cannot collect or escape and its existing cargo/control survive respill',()=>{
 const h=boot('vael_warden_convoy');kill(h);const r=h.live.data.freightCargoCustody;
 for(const e of h.d.entsOf(h.live,'escort'))h.sim.registry.get('combat').kill(e,h.player.id);
 h.sim.runTicks(61);const sweeper=h.d.entsOf(h.live,'raider').find(e=>e.id!==r.raiderId&&e.data.freightSweeperCustodyId===r.custodyId);assert.ok(sweeper);
 const pod=r.pods.find(p=>p.status==='live'),payload={pickupId:pod.entityId,collectorId:sweeper.id,kind:'cargo',commodityId:r.commodityId,amount:pod.qty};
 h.bus.emit('pickup:collected',payload);assert.equal(payload.acceptedAmount,pod.qty);
 sweeper.data.vesselId='owned-sweeper';sweeper.data.cargo={items:{cmdty_food:2}};h.state.player.ownedShips=[{vesselId:'owned-sweeper'}];
 sweeper.data.freightSweepEscape={origin:{x:sweeper.pos.x-10,z:sweeper.pos.z},target:{x:sweeper.pos.x+900,z:sweeper.pos.z},radius:1,startedAt:h.state.simTime};
 const ai=structuredClone(sweeper.data.ai);h.sim.runTicks(61);
 assert.equal(r.sweepEscapees?.[sweeper.id]===true,false);assert.equal(r.raiderSecuredQty,0);assert.equal(total(r),r.initialQty);
 assert.deepEqual(sweeper.data.ai,ai);assert.deepEqual(sweeper.data.cargo,{items:{cmdty_food:2}});assert.equal(sweeper.flags.persistent,true);
 const next=r.pods.find(p=>p.status==='live');const denied={pickupId:next.entityId,collectorId:sweeper.id,kind:'cargo',commodityId:r.commodityId,amount:next.qty};
 h.bus.emit('pickup:collected',denied);assert.equal(denied.acceptedAmount,0);assert.equal(r.raiderSecuredQty,0);
});

test('actual capture of a secondary sweeper releases only custody activity before subscribers save',()=>{
 const h=boot('vael_warden_convoy');kill(h);const r=h.live.data.freightCargoCustody;
 for(const e of h.d.entsOf(h.live,'escort'))h.sim.registry.get('combat').kill(e,h.player.id);
 h.sim.runTicks(61);const e=h.d.entsOf(h.live,'raider').find(x=>x.id!==r.raiderId&&x.data.freightSweeperCustodyId===r.custodyId);assert.ok(e);assert.ok(e.data.ai.activity.reason.includes('freight_pod_sweep'));
 const pod=r.pods.find(x=>x.status==='live'),p={pickupId:pod.entityId,collectorId:e.id,kind:'cargo',commodityId:r.commodityId,amount:pod.qty};h.bus.emit('pickup:collected',p);assert.equal(p.acceptedAmount,pod.qty);
 e.data.vesselId='actual-sweeper';e.data.shipjackGeneration=1;e.data.cargo={items:{cmdty_food:2},capacity:50};h.state.run={kind:'adventure'};h.state.player.ownedShips||=[];
 const owner={state:h.state,bus:h.bus,helpers:h.d.helpers,validateTransferFittings:()=>true,nextInstanceId:()=>'sweeper-instance',getTransferCargoCapacity:()=>100,recomputeEntity(){},publishActiveRoleContext(){}};
 let saw=false;h.bus.on('ship:captured',()=>{assert.equal(e.data.ai.activity,null);assert.equal(e.data.ai.passive,true);const envelope=h.sim.registry.get('save').serialize('sweeper-callback');assert.ok(envelope);saw=true;});
 const result=admitCapturedVessel(owner,{targetId:e.id,targetGeneration:1,vesselId:e.data.vesselId,operationId:'actual-sweeper-capture'});assert.equal(result.ok,true,JSON.stringify(result));assert.ok(saw);
 h.sim.runTicks(61);assert.equal(total(r),r.initialQty);assert.equal(r.raiderSecuredQty,0);assert.equal(r.sweepEscapees?.[e.id]===true,false);assert.deepEqual(e.data.cargo.items,{cmdty_food:2});assert.equal(e.flags.persistent,true);
});
