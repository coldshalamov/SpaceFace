import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {createGameState} from '../src/core/gameState.js';
import {physics} from '../src/core/physics.js';
import {combat} from '../src/systems/combat.js';
import {cargo,deliverTallyThreeCrate} from '../src/systems/cargo.js';
import {economy} from '../src/systems/economy.js';
import {salvage} from '../src/systems/salvage.js';
import {scanner} from '../src/systems/scanner.js';
import {tallyThree} from '../src/systems/tallyThree.js';
import {save} from '../src/save/saveSystem.js';
import {spawnBudget} from '../src/systems/spawnBudget.js';
import {serializeCombatState} from '../src/combat/persistence.js';
import {contactHailAvailability} from '../src/data/contactHail.js';
import {TALLY_THREE as T,tallyThreeBody,tallyThreeSource} from '../src/data/tallyThree.js';
import {TALLY_THREE_RADIUS,tallyThreePhysicalBody} from '../src/data/tallyThreeBody.js';
import {PRODUCTION_FEATURES} from '../src/runtime/runtimeProfiles.js';
import {snapshotFeatureMaps,applyFeatureConfigToMaps,restoreFeatureMaps} from '../src/data/featureFlags.js';
import {createAuthoritativeRuntime} from '../src/runtime/createAuthoritativeRuntime.js';
import {makeShipEntitySpec} from '../src/systems/ships.js';

let originalFeatures;
test.before(()=>{originalFeatures=snapshotFeatureMaps();applyFeatureConfigToMaps(PRODUCTION_FEATURES);});
test.after(()=>restoreFeatureMaps(originalFeatures));
const clone=v=>JSON.parse(JSON.stringify(v));

async function boot({wire=null}={}){
  const state=createGameState(503);state.mode='flight';state.world.currentSectorId=T.sectorId;
  if(wire)state.nextEntityId=700;
  const sim=createSimulation({state,seed:503,systems:[physics,combat,cargo,economy,salvage,scanner,spawnBudget,tallyThree,save]});
  const receiver=sim.spawn({type:'station',team:2,factionId:'faction_dmc',pos:{x:T.pos.x-55,z:T.pos.z},
    vel:{x:0,z:0},radius:42,mass:1e9,hull:1e9,data:{stationId:T.homeStationId,dockRadius:72},physicsBody:{dynamic:false,radius:42}});
  const player=sim.spawn({type:'ship',team:0,pos:{x:T.pos.x+20,z:T.pos.z},radius:6,mass:100,hull:100,
    data:{defId:'ship_kestrel',derived:{},intent:{},ai:{}}});state.playerId=player.id;
  const sources=sim.registry.get('salvage');
  if(wire)sources.deserialize(clone(wire.salvage));
  const remap=new Map();
  if(wire){
    remap.set(String(wire.playerId),player.id);
    for(const spec of wire.entities.persistent){const e=sim.spawn({...clone(spec),id:undefined});remap.set(String(spec.id),e.id);}
  }
  sim.bus.emit('sector:enter',{sectorId:T.sectorId});
  const crate=tallyThreeBody(state,T.worldRecordId);assert.ok(crate);
  const system=sim.registry.get('tallyThree');system.update(1/60,state);
  assert.equal(await sim.registry.get('physics').prepareBackend(state),true);
  if(wire){sim.registry.get('save')._restoreCombat(clone(wire.combat),remap);sim.registry.get('combat').kernel.attachments.reconcilePhysics();}
  const offers=[],responses=[];sim.bus.on('contactHail:offer',p=>offers.push(p));sim.bus.on('contactHail:response',p=>responses.push(p));
  const attach=()=>{
    const result=sim.registry.get('combat').kernel.attachments.create({defId:'tether_standard',ownerId:player.id,targetId:crate.id,
      sourceWorld:{x:player.pos.x,z:player.pos.z},targetWorld:{x:crate.pos.x,z:crate.pos.z}});
    assert.equal(result.ok,true,result.reason);return result.attachment;
  };
  const hail=(target=crate)=>{state.player.targetId=target.id;sim.bus.emit('contactHail:request',{targetId:target.id});
    assert.ok(offers.length,'ordinary selected-contact hail produces an offer');return offers.at(-1);};
  const choose=(offer,choice)=>{sim.bus.emit('contactHail:choice',{requestId:offer.requestId,targetId:offer.targetId,choice});return responses.at(-1);};
  return {state,sim,crate,player,receiver,system,sources,offers,responses,attach,hail,choose,
    quote:offer=>system._offers.get(offer.requestId).quote,close:()=>sim.dispose()};
}

test('Ceres production source is a real claim crate; towing and receiver proximity do not sell it',async()=>{
  const h=await boot();try{
    const source=tallyThreeSource(h.state),before=h.state.player.credits;
    assert.equal(h.crate.mass,180);assert.equal(source.claimId,T.claimId);
    h.attach();h.state.player.targetId=h.crate.id;
    assert.equal(contactHailAvailability(h.state).kind,'tally_three');
    assert.equal(h.sim.registry.get('physics')._sg02.records.get(h.crate.id).body.mass(),180);
    const offer=h.hail();assert.match(offer.lines.join(' '),/OWNED.*4u.*cr/);assert.match(offer.lines.join(' '),/CERES-RECOVERY-03/);
    assert.equal(source.extracted,false);assert.equal(h.state.player.credits,before);
    const actor=tallyThreeBody(h.state,T.assessorId),body=h.sim.registry.get('physics')._sg02.records.get(actor.id);
    assert.equal(actor.data.placeId,'place_tally_three');assert.equal(actor.data.placeScale,1);
    assert.equal(actor.radius,TALLY_THREE_RADIUS);assert.equal(body.body.mass(),actor.mass);
    const authored=tallyThreePhysicalBody(actor.mass);
    assert.deepEqual(actor.physicsBody.collisionProxyManifest,authored.collisionProxyManifest);
    assert.equal(actor.physicsBody.inertiaY,authored.inertiaY);
    assert.equal(body.colliders.length,1,'authored pressure spine collides; the articulated arms do not');
  }finally{h.close();}
});

test('one explicit accepted delivery pays once under ten repeats and a recursive credit observer',async()=>{
  const h=await boot();try{
    const line=h.attach(),offer=h.hail(),quote=h.quote(offer),before=h.state.player.credits;
    const market=h.sim.registry.get('economy').state.economy.markets[T.homeStationId].cmdty_salvage_electronics;
    const stock=market.stock;let recursive=null;
    h.sim.bus.on('credits:changed',p=>{if(p.reason==='salvage:tally-three-return')recursive=deliverTallyThreeCrate(h.state,quote,h.sim.registry);});
    const response=h.choose(offer,'tally_deliver');assert.equal(response.accepted,true,response.lines.join(' '));
    const receipt=tallyThreeSource(h.state).delivery;assert.ok(receipt);
    assert.equal(h.state.player.credits-before,quote.quoteCr);assert.equal(market.stock-stock,4);
    assert.equal(recursive.duplicate,true);assert.equal(recursive.creditedCr,quote.quoteCr);
    for(let i=0;i<10;i++){const duplicate=deliverTallyThreeCrate(h.state,quote,h.sim.registry);assert.equal(duplicate.duplicate,true);}
    assert.equal(h.state.player.credits-before,quote.quoteCr);assert.equal(market.stock-stock,4);
    assert.equal(h.crate.alive,false);assert.notEqual(line.state,'active');
    assert.equal(tallyThreeBody(h.state,T.assessorId).data.tallyThree.receiptId,receipt.receiptId);
  }finally{h.close();}
});

test('changed claimant invalidates an offer; only a scan of the surviving actual manifest corrects it',async()=>{
  const h=await boot();try{
    h.attach();const offer=h.hail(),before=h.state.player.credits;
    assert.equal(h.sim.helpers.salvage.releaseSourceClaim({sourceKey:T.sourceKey,claimantId:T.claimId}).ok,true);
    assert.equal(h.sim.helpers.salvage.claimSource({sourceKey:T.sourceKey,claimantId:'station_beltout'}).ok,true);
    const refused=h.choose(offer,'tally_deliver');assert.equal(refused.accepted,false);assert.match(refused.lines.join(' '),/old quote is void/);
    assert.equal(h.state.player.credits,before);assert.equal(h.crate.alive,true);
    assert.equal(h.sources._contestTallyClaim().reason,'manifest-not-observed');
    h.sim.bus.emit('scan:completed',{targetId:h.crate.id});
    const corrected=h.choose(h.hail(),'tally_contest');assert.equal(corrected.accepted,true,corrected.lines.join(' '));
    assert.equal(tallyThreeSource(h.state).claimId,T.claimId);assert.equal(h.state.player.credits,before);
  }finally{h.close();}
});

test('tethered Continue keeps the same durable crate, claim, motion and custody references',async()=>{
  const h=await boot();let resumed;
  try{
    h.attach();h.crate.vel.set(.25,0,.1);h.crate.pos.x+=3;
    const saver=h.sim.registry.get('save');
    const wire={salvage:h.sources.serialize(),entities:saver._serializeEntities(),combat:serializeCombatState(h.state),playerId:h.player.id};
    resumed=await boot({wire});
    const source=tallyThreeSource(resumed.state);
    assert.equal(resumed.crate.data.worldRecordId,T.worldRecordId);assert.equal(source.claimId,T.claimId);
    assert.equal(resumed.crate.pos.x,h.crate.pos.x);assert.equal(resumed.crate.vel.x,.25);
    assert.equal(resumed.state.entityList.filter(e=>e.alive&&e.data?.worldRecordId===T.worldRecordId).length,1);
    assert.ok(Object.values(resumed.state.combat.attachments.byId).some(a=>a.state==='active'&&a.ownerId===resumed.player.id&&a.targetId===resumed.crate.id));
    const response=resumed.choose(resumed.hail(),'tally_deliver');assert.equal(response.accepted,true,response.lines.join(' '));
  }finally{resumed?.close();h.close();}
});

test('assessor loss preserves ordinary station delivery; a refused payment consumer leaves a durable pending receipt',async()=>{
  const h=await boot();try{
    h.attach();const assessor=tallyThreeBody(h.state,T.assessorId);
    h.sim.registry.get('combat').kill(assessor,h.player.id);assert.equal(tallyThreeSource(h.state).assessorLost,true);
    const economyOwner=h.sim.registry.get('economy'),settle=economyOwner.settleTallyThreeDelivery;
    economyOwner.settleTallyThreeDelivery=()=>({ok:false,reason:'temporary-consumer-refusal'});
    const before=h.state.player.credits,response=h.choose(h.hail(h.receiver),'tally_deliver');
    assert.equal(response.accepted,false);assert.match(response.lines.join(' '),/Crate accepted.*Payment is pending/);
    assert.ok(tallyThreeSource(h.state).delivery);assert.equal(h.state.player.credits,before);
    economyOwner.settleTallyThreeDelivery=settle;h.state.tick+=60;h.system.update(1/60,h.state);
    assert.ok(h.state.player.credits>before);const paid=h.state.player.credits;
    h.state.tick+=60;h.system.update(1/60,h.state);assert.equal(h.state.player.credits,paid);
    assert.equal(tallyThreeBody(h.state,T.assessorId),null,'lost assessor never remints');
  }finally{h.close();}
});

test('a fast crate or stale occupant cannot settle; cap-clamped zero is an honest payment receipt',async()=>{
  const h=await boot();try{
    h.attach();let offer=h.hail();h.crate.vel.x=8.01;
    assert.equal(h.choose(offer,'tally_deliver').accepted,false);assert.equal(h.crate.alive,true);
    h.crate.vel.x=0;offer=h.hail();const quote=h.quote(offer);h.crate.occupantGeneration+=1;
    assert.equal(deliverTallyThreeCrate(h.state,quote,h.sim.registry).reason,'body-or-receiver-changed');
    h.crate.occupantGeneration-=1;
    h.state.player.credits=Number.MAX_SAFE_INTEGER;
    const response=h.choose(h.hail(),'tally_deliver');assert.equal(response.accepted,true,response.lines.join(' '));
    assert.match(response.lines.join(' '),/0 cr credited/);assert.equal(h.state.player.credits,Number.MAX_SAFE_INTEGER);
  }finally{h.close();}
});

test('pending native custody cannot deliver; canonical reconcile restores the same live Massline',async()=>{
  const h=await boot();try{
    const line=h.attach(),offer=h.hail(),quote=h.quote(offer);
    assert.equal(h.sim.registry.get('physics')._sg02.cutAttachment({attachmentId:line.id}),true);
    assert.equal(line.state,'active');
    assert.equal(deliverTallyThreeCrate(h.state,quote,h.sim.registry).reason,'player-custody-required');
    assert.equal(h.crate.alive,true);assert.equal(tallyThreeSource(h.state).extracted,false);
    h.sim.registry.get('combat').kernel.attachments.reconcilePhysics();
    assert.equal(deliverTallyThreeCrate(h.state,quote,h.sim.registry).ok,true);
  }finally{h.close();}
});

test('assessor uses one shared slot, respects denial, and releases its slot and subscriptions on destruction',async()=>{
  const h=await boot();try{
    const budget=h.sim.helpers.spawnBudget,actor=tallyThreeBody(h.state,T.assessorId);
    assert.equal(budget.ownerForEntity(actor.id),T.assessorId);
    assert.equal(budget.current(),1);
    for(let i=0;i<3;i++){h.state.tick+=60;h.system.update(1/60,h.state);}
    assert.equal(budget.current(),1);
    h.sim.registry.get('combat').kill(actor,h.player.id);assert.equal(budget.current(),0);
    h.sources.newGame();h.system.newGame();h.sim.registry.get('salvage')._planForSector(T.sectorId);
    budget.setMax(1);budget.request(1,'test:other-owner');h.state.tick+=60;h.system.update(1/60,h.state);
    assert.equal(tallyThreeBody(h.state,T.assessorId),null);assert.equal(budget.current(),1);
    h.system.destroy();assert.equal(budget.ownerForEntity(actor.id),null);assert.equal(h.system._unsubs.length,0);
  }finally{h.close();}
});

test('registered production owners preserve the native claim crate through Continue and accept an explicit refinery return',async()=>{
  const runtime=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:503});
  const state=runtime.state;
  const external=fn=>{const prior=snapshotFeatureMaps();applyFeatureConfigToMaps(runtime.config.features);try{return fn();}finally{restoreFeatureMaps(prior);}};
  const prepare=async()=>{const prior=snapshotFeatureMaps();applyFeatureConfigToMaps(runtime.config.features);
    try{assert.equal(await runtime.getSystem('physics').prepareBackend(state),true);}finally{restoreFeatureMaps(prior);}};
  try{
    state.mode='flight';state.ui.screenStack=[];
    const player=runtime.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:state.player,pos:{x:0,z:0}}));state.playerId=player.id;
    external(()=>runtime.getSystem('world').enterSector(T.sectorId));
    const crate=tallyThreeBody(state,T.worldRecordId),receiver=state.entityList.find(e=>e.alive&&e.type==='station'&&e.data?.stationId===T.homeStationId);
    assert.ok(crate);assert.ok(receiver);
    // Scenario setup at the actual authored receiver; all interaction and transfer below
    // uses the ordinary registered owners and the real native bodies.
    crate.pos.x=receiver.pos.x+receiver.radius+crate.radius+2;crate.pos.z=receiver.pos.z;crate.vel.set(0,0,0);crate.flags.noInterp=true;
    player.pos.x=crate.pos.x+24;player.pos.z=crate.pos.z;player.vel.set(0,0,0);player.flags.noInterp=true;
    await prepare();
    external(()=>runtime.getSystem('tallyThree').update(1/60,state));
    const actor=tallyThreeBody(state,T.assessorId);assert.ok(actor);assert.equal(actor.data.placeId,'place_tally_three');
    runtime.getSystem('physics')._sg02.syncFromEntities(state.entityList);
    assert.equal(runtime.getSystem('physics')._sg02.records.get(actor.id).colliders.length,1);
    const attachment=external(()=>runtime.getSystem('combat').kernel.attachments.create({defId:'tether_standard',ownerId:player.id,targetId:crate.id,
      sourceWorld:{x:player.pos.x,z:player.pos.z},targetWorld:{x:crate.pos.x,z:crate.pos.z}}));assert.equal(attachment.ok,true,attachment.reason);
    const before=state.player.credits,saver=runtime.getSystem('save'),wire=external(()=>saver.serialize('tally-production'));
    assert.equal(external(()=>saver.loadEnvelope(clone(wire),'tally-production')),true);
    await prepare();runtime.step(1/60);
    const restored=tallyThreeBody(state,T.worldRecordId),pilot=state.entities.get(state.playerId);
    assert.ok(restored);assert.equal(restored.data.worldRecordId,T.worldRecordId);assert.equal(tallyThreeSource(state).claimId,T.claimId);
    assert.equal(state.entityList.filter(e=>e.alive&&e.data?.worldRecordId===T.worldRecordId).length,1);
    assert.equal(runtime.getSystem('physics')._sg02.records.get(restored.id).body.mass(),180);
    const offers=[],responses=[];runtime.bus.on('contactHail:offer',p=>offers.push(p));runtime.bus.on('contactHail:response',p=>responses.push(p));
    state.player.targetId=restored.id;external(()=>runtime.bus.emit('contactHail:request',{targetId:restored.id}));
    const offer=offers.at(-1);assert.ok(offer);assert.equal(offer.kind,'tally_three');
    external(()=>runtime.bus.emit('contactHail:choice',{requestId:offer.requestId,targetId:offer.targetId,choice:'tally_deliver'}));
    const response=responses.at(-1);assert.equal(response.accepted,true,response.lines.join(' '));
    const receipt=tallyThreeSource(state).delivery;assert.ok(receipt);assert.equal(restored.alive,false);
    const credited=state.player.credits-before;assert.equal(credited,receipt.quoteCr);assert.ok(credited>0);
    assert.ok(pilot.alive);console.log('TALLY_PRODUCTION_RETURN',JSON.stringify({receiptId:receipt.receiptId,creditedCr:credited,claimId:T.claimId,nativeCrateMass:180}));
  }finally{runtime.dispose();}
});
