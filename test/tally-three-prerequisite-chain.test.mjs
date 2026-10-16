import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {createGameState} from '../src/core/gameState.js';
import {cargo,deliverTallyThreeCrate} from '../src/systems/cargo.js';
import {economy} from '../src/systems/economy.js';
import {salvage} from '../src/systems/salvage.js';
import {scanner} from '../src/systems/scanner.js';
import {spawnBudget} from '../src/systems/spawnBudget.js';
import {tallyThree} from '../src/systems/tallyThree.js';
import {towlineTable} from '../src/systems/towlineTable.js';
import {TALLY_THREE as T,tallyThreeBody,tallyThreeSource} from '../src/data/tallyThree.js';
import {getCombatKernel} from '../src/combat/kernel.js';
import {PRODUCTION_FEATURES} from '../src/runtime/runtimeProfiles.js';
import {snapshotFeatureMaps,applyFeatureConfigToMaps,restoreFeatureMaps} from '../src/data/featureFlags.js';

// Non-native transaction fixture: initial poses are authored and native telemetry is
// an explicit test port. It proves real owner/command transactions, never organic travel.
test('real Tally command settlement enables Towline once without duplicate finite rewards', () => {
  const flags=snapshotFeatureMaps();applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  let telemetry=false;
  const physicsPort={name:'physics',_sg02CombatPhysics:{getAttachmentTelemetry:()=>telemetry?{active:true}:null}};
  const state=createGameState(503);state.mode='flight';state.world.currentSectorId=T.sectorId;
  state.settings.gameplay.physicsBackend='legacy';
  const sim=createSimulation({state,seed:503,systems:[physicsPort,cargo,economy,salvage,scanner,spawnBudget,tallyThree,towlineTable],helpers:{combatPhysics:{createAttachment:r=>({id:r.attachmentId}),cutAttachment:()=>true}}});
  try {
    const receiver=sim.spawn({type:'station',team:2,pos:{x:T.pos.x-55,z:T.pos.z},radius:42,mass:1e9,hull:1e9,data:{stationId:T.homeStationId,dockRadius:72}});
    const player=sim.spawn({type:'ship',team:0,pos:{x:T.pos.x+20,z:T.pos.z},radius:6,mass:100,hull:100,data:{defId:'ship_kestrel',derived:{},intent:{},ai:{}}});state.playerId=player.id;
    sim.bus.emit('sector:enter',{sectorId:T.sectorId});
    const crate=tallyThreeBody(state,T.worldRecordId);assert.ok(crate);
    const owner=sim.registry.get('tallyThree');owner.update(1/60,state);
    const towline=sim.registry.get('towlineTable');assert.equal(towline._row.eligible,false);
    const line=getCombatKernel(towline.ctx).attachments.create({defId:'tether_standard',ownerId:player.id,targetId:crate.id,sourceWorld:player.pos,targetWorld:crate.pos});assert.equal(line.ok,true,line.reason);
    const offers=[],responses=[],events=[];
    sim.bus.on('contactHail:offer',p=>offers.push(p));sim.bus.on('contactHail:response',p=>responses.push(p));
    sim.bus.on('cargo:tallyThreeDelivered',p=>{assert.ok(tallyThreeSource(state).delivery);assert.ok(state.economy.committedIntents[p.receiptId]);events.push(p);});
    state.player.targetId=crate.id;
    const hail=()=>{sim.bus.emit('contactHail:request',{targetId:crate.id});assert.ok(offers.length);return offers.at(-1);};
    const choose=o=>sim.bus.emit('contactHail:choice',{requestId:o.requestId,targetId:o.targetId,choice:'tally_deliver'});
    choose(hail());assert.equal(responses.at(-1).accepted,false);assert.equal(towline._row.eligible,false);assert.equal(tallyThreeSource(state).delivery,null);
    telemetry=true;state.simTime+=1;state.tick+=60;
    const offer=hail(),quote=owner._offers.get(offer.requestId).quote,credits=state.player.credits;
    choose(offer);assert.equal(responses.at(-1).accepted,true);assert.equal(towline._row.eligible,true);assert.equal(events.length,1);
    const source=tallyThreeSource(state);assert.equal(source.extractedBy,'player');assert.deepEqual(source.remainingPool,{});assert.equal(source.delivery.qty,4);
    assert.equal(state.player.credits-credits,state.economy.committedIntents[source.delivery.receiptId].result.creditedCr);
    const conservation = () => structuredClone({credits:state.player.credits, cargo:state.player.cargo,
      salvage:state.salvage, committedIntents:state.economy.committedIntents});
    const beforeRepeats = conservation();
    for(let i=0;i<3;i++) {
      assert.equal(deliverTallyThreeCrate(state,quote,sim.registry).duplicate,true);
      assert.deepEqual(conservation(),beforeRepeats,'repeat must preserve full wallet/cargo/salvage/intents');
    }
    assert.equal(events.length,1);
    assert.equal(towline._row.members.mara.source.receipt,null);
  } finally {sim.dispose();restoreFeatureMaps(flags);}
});
