import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { combat } from '../src/systems/combat.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { economy } from '../src/systems/economy.js';
import { missions } from '../src/systems/missions.js';
import { ilexArk, ilexArkPresentation } from '../src/systems/ilexArk.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { ILEX_ARK as C, ILEX_START, ILEX_RECEIVER, ILEX_VAULT_IDS, ilexReleasePose, ilexOutcomeText } from '../src/data/ilexArk.js';
import { ilexVaultSocket } from '../src/data/ilexArkBody.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { resolveCollisionProxyManifest, resolveDockAnchor } from '../src/data/collisionProxyManifests.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { ilexArkPrompt } from '../src/ui/ilexArkPrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';

let previous;test.before(()=>{previous=snapshotFeatureMaps();applyFeatureConfigToMaps(PRODUCTION_FEATURES);});test.after(()=>restoreFeatureMaps(previous));
function fixture({native=false}={}){
  const sim=createSimulation({seed:804,systems:[ships,spawnBudget,...(native?[physics,aiPorts,flightV3,combat]:[]),economy,missions,ilexArk],
    helpers:native?{}:{combatPhysics:{createAttachment:s=>({id:s.attachmentId}),cutAttachment:()=>true}}});
  const s=sim.state;s.mode='flight';s.world.currentSectorId=C.originSectorId;if(!native)s.settings.gameplay.physicsBackend='legacy';
  sim.registry.get('ships').newGame();s.missions.completedLog=[{type:'cargo_delivery',success:1,count:1,totalCr:0}];
  const player=sim.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:s.player,pos:{x:ILEX_START.x+100,z:ILEX_START.z+60},fittings:[]}));s.playerId=player.id;
  const station=sim.spawn({type:'station',team:2,pos:{...ILEX_RECEIVER},radius:40,mass:1e9,hull:1e9,hullMax:1e9,
    physicsBody:{schemaVersion:1,dynamic:false,shape:'ball',radius:40,mass:1e9},data:{stationId:C.stationId,dockRadius:110}});
  const system=sim.registry.get('ilexArk');system.update(1/60,s);
  function tick(n=1){for(let i=0;i<n;i++){s.tick++;s.simTime=s.tick/60;
    if(native)sim.registry.get(flightV3.name).update(1/60,s);system.update(1/60,s);
    if(native){sim.registry.get('aiPorts').update(1/60,s);sim.registry.get('combat').update(1/60,s);sim.registry.get('physics').update(1/60,s);}}}
  function accept(){assert.equal(system.accept(system._row.revision).ok,true);}
  function receiver(e=player){const p=resolveDockAnchor(station,resolveCollisionProxyManifest(station),e)||{x:ILEX_RECEIVER.x+90,z:ILEX_RECEIVER.z};e.pos.set(p.x,0,p.z);e.vel.set(0,0,0);}
  function finish(){receiver();return system.finish(system._row.revision);}
  return {sim,s,system,player,station,tick,accept,receiver,finish,carrier:()=>system._find('carrier'),close:()=>sim.dispose()};
}
test('optional scanner choice binds one finite carrier and six source identities; stale choices and budget denial stay harmless',()=>{
  const h=fixture();try{const e=h.carrier();assert.ok(e);assert.equal(h.s.spawnBudget.used,1);assert.equal(e.physicsBody.mass,420);
    assert.equal(e.physicsBody.collisionProxyManifest.convexParts.length,7);assert.equal(h.system.accept(99).ok,false);
    let offered;h.sim.bus.on('ilexArk:offer',p=>offered=p);h.sim.bus.emit('scan:completed',{targetId:e.id});
    assert.equal(offered.canAccept,true);h.accept();assert.equal(h.system.accept(h.system._row.revision).ok,false);
    assert.equal(h.system._row.deadline,h.system._row.acceptedAt+3000);
    h.tick(5);assert.equal(h.s.entityList.filter(e=>e.data?.ilexBodyKey?.endsWith(':carrier')).length,1);
  }finally{h.close();}
  const denied=fixture();try{const old=denied.carrier();denied.system.newGame();
    denied.sim.bus.emit('entity:destroyed',{id:old.id,entity:old});assert.equal(denied.system._row.carrierStatus,'live','old reset receipts cannot kill the next voyage');
    const b=denied.sim.helpers.spawnBudget;b.request(b.available(),'other');denied.system._row.eligible=true;denied.tick();assert.equal(denied.carrier(),null);}finally{denied.close();}
});
test('native severance removes the exact compound part before one rotating moving vault exists, conserving420 mass',async()=>{
  const h=fixture({native:true});try{
    const carrier=h.carrier();carrier.rot=.31;carrier.angVel=.09;carrier.vel.set(7,0,-3);
    await h.sim.registry.get('physics').prepareBackend(h.s);
    const native=h.system._native(carrier);assert.ok(native);assert.equal(native.colliders.length,7);
    const expected=ilexReleasePose(carrier,ilexVaultSocket('vault_4'),native.body);
    assert.equal(h.system.sever('vault_4').ok,true);assert.equal(carrier.physicsBody.mass,402);
    h.system._materialize();assert.equal(h.system._find('vault_4'),null,'old native vault collider still owns the material');
    h.sim.registry.get('physics').update(1/60,h.s);h.system._materialize();
    const vault=h.system._find('vault_4');assert.ok(vault);assert.equal(h.system._row.vaults.vault_4.status,'drifting');
    assert.equal(h.system._native(carrier).colliders.length,6);assert.equal(h.system.sever('vault_4').ok,false);
    assert.ok(Math.abs(vault.vel.x-expected.vx)<1e-5);assert.ok(Math.abs(vault.vel.z-expected.vz)<1e-5);
    assert.equal(carrier.physicsBody.mass+vault.physicsBody.mass,420);
    const saved=h.system.serialize();h.system.deserialize(JSON.parse(JSON.stringify(saved)));h.system.afterContinue();h.system._materialize();
    assert.equal(h.system._find('vault_4'),vault);assert.equal(h.s.entityList.filter(e=>e.data?.ilexVaultId==='vault_4').length,1);
  }finally{h.close();}
});
test('carrier loss releases only surviving identities; terminal vault loss and original deadline persist through Continue',()=>{
  const h=fixture();try{h.accept();const e=h.carrier();h.system.sever('vault_2');h.system._materialize();const v=h.system._find('vault_2');
    v.alive=false;h.sim.bus.emit('entity:killed',{targetId:v.id});assert.equal(h.system._row.vaults.vault_2.status,'destroyed');
    e.alive=false;h.sim.bus.emit('entity:killed',{targetId:e.id});h.system._materialize();
    assert.equal(h.system._row.carrierStatus,'lost');assert.equal(h.system._find('vault_2'),null);
    assert.equal(ILEX_VAULT_IDS.filter(id=>h.system._find(id)).length,5);
    const memory=JSON.parse(JSON.stringify(h.system.serialize()));h.system.deserialize(memory);h.system.afterContinue();h.tick();
    assert.equal(h.carrier(),null);assert.equal(h.system._row.vaults.vault_2.status,'destroyed');assert.equal(h.system._row.deadline,memory.deadline);
    h.s.tick=Math.ceil(memory.deadline*60);h.s.simTime=h.s.tick/60;h.system.update(1/60,h.s);
    assert.equal(h.system._row.phase,'settled');assert.equal(h.system._row.settlement.deliveredVaultIds.length,0);
    h.tick();assert.equal(h.s.entityList.filter(e=>e.alive&&e.data?.ilexId===C.id).length,0);
  }finally{h.close();}
});
test('actual hull damage at one collar releases that vault; native propulsion advances the physical convoy without pose writes',async()=>{
  const h=fixture({native:true});try{h.accept();const e=h.carrier();await h.sim.registry.get('physics').prepareBackend(h.s);
    const q=ilexReleasePose(e,ilexVaultSocket('vault_3'));
    const packet=scalarHitToDamagePacket({damage:40,damageType:'kinetic',pos:{x:q.x,z:q.z},source:{kind:'fixture_collar_hit'}});
    packet.flags={ignoreFriendlyFire:true,allowAnyTarget:true};getCombatKernel(h.system.ctx).routeDamage({targetId:e.id,packet,origin:{kind:'fixture_collar_hit'}});
    assert.equal(h.system._row.vaults.vault_3.status,'releasing');assert.equal(h.system._row.vaults.vault_4.status,'attached');
    const x=e.pos.x,z=e.pos.z;h.tick(600);assert.ok(dist({x,z},e.pos)>100,'ordinary selected native flight must actually move the escort');
    assert.ok(Math.hypot(e.vel.x,e.vel.z)<100,'finite convoy travel remains bounded');assert.equal(h.system._row.vaults.vault_3.status,'drifting');
    assert.equal(h.system._find('carrier'),e);console.log('ILEX_NATIVE_ROUTE',JSON.stringify({distance:dist({x,z},e.pos),speed:Math.hypot(e.vel.x,e.vel.z),vault:'vault_3'}));
  }finally{h.close();}
});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
for(const arrived of [0,1,5,6])test(`actual receiver custody produces an honest${arrived}/6 immutable outcome, one reward and one delayed finite planting`,()=>{
  const h=fixture();try{h.accept();const carrier=h.carrier();
    for(const id of ILEX_VAULT_IDS.slice(arrived))h.system.sever(id);
    h.system._materialize();h.receiver(carrier);assert.equal(h.system._acceptCarrier(),true);
    assert.equal(h.system._row.carrierStatus,'received');assert.equal(h.system._delivered().length,arrived);
    // A late destruction callback from the physically received carrier cannot release accepted seeds.
    h.sim.bus.emit('entity:killed',{targetId:carrier.id});assert.equal(h.system._delivered().length,arrived);
    const before=h.s.player.credits;let recursive;h.sim.bus.on('credits:changed',()=>recursive=h.sim.registry.get('missions').settleIlexArk(`${C.id}:outcome`));
    assert.equal(h.finish().ok,true);const receipt=h.system._row.settlement;
    assert.equal(receipt.deliveredVaultIds.length,arrived);assert.equal(receipt.rewardCr,arrived?1200+300*arrived:0);
    assert.equal(h.s.player.credits-before,receipt.rewardCr);if(arrived)assert.equal(recursive.duplicate,true);
    assert.equal(h.system.finish(h.system._row.revision).ok,false);assert.equal(h.system.sever('vault_1').ok,false);
    const econ=h.sim.registry.get('economy'),entry=econ.ensureMarket(C.stationId).cmdty_food,stock=entry.stock;
    assert.equal(econ.applyIlexSeedHarvest(receipt.id).reason,'planting_pending');
    h.s.simTime=receipt.harvestAt;const harvest=econ.applyIlexSeedHarvest(receipt.id);
    assert.equal(harvest.qty,12*arrived);assert.equal(entry.stock-stock,12*arrived);
    assert.equal(econ.applyIlexSeedHarvest(receipt.id).duplicate,true);assert.equal(entry.stock-stock,12*arrived);
    assert.match(ilexOutcomeText(receipt.deliveredVaultIds),arrived===6?/All six/:arrived===0?/cannot begin/:new RegExp(`${arrived}/6`));
    const memory=JSON.parse(JSON.stringify(h.system.serialize())),missionSave=h.sim.registry.get('missions').serialize(),econSave=econ.serialize();
    h.system.deserialize(memory);h.system.afterContinue();h.sim.registry.get('missions').deserialize(missionSave);econ.deserialize(econSave);
    assert.equal(h.sim.registry.get('missions').settleIlexArk(receipt.id).duplicate,true);assert.equal(econ.applyIlexSeedHarvest(receipt.id).duplicate,true);
    assert.equal(h.s.player.credits-before,receipt.rewardCr);h.system._materialize();assert.equal(h.carrier(),null);
  }finally{h.close();}
});
test('a disconnected vault stays physical and refuses receiver surrender; accepted current Massline retires it once',()=>{
  const h=fixture();try{h.accept();h.system.sever('vault_1');h.system._materialize();const v=h.system._find('vault_1');h.receiver();h.receiver(v);
    assert.equal(h.system.deliverVault().ok,false);const a=getCombatKernel(h.system.ctx).attachments.create({defId:'attachment_massline',ownerId:h.player.id,targetId:v.id,
      sourceWorld:{x:h.player.pos.x-20,z:h.player.pos.z},targetWorld:{x:v.pos.x+20,z:v.pos.z}});assert.equal(a.ok,true,a.reason);
    const kernel=getCombatKernel(h.system.ctx);kernel.attachments.cut(a.attachment.id,h.player.id);assert.equal(h.system.deliverVault().ok,false);
    const second=kernel.attachments.create({defId:'attachment_massline',ownerId:h.player.id,targetId:v.id,sourceWorld:h.player.pos,targetWorld:v.pos});assert.equal(second.ok,true,second.reason);
    assert.equal(h.system.deliverVault().ok,true);assert.equal(h.system._row.vaults.vault_1.status,'delivered');assert.equal(h.system.deliverVault().ok,false);
  }finally{h.close();}
});
test('selected native receiver refuses a semantic line without its physical joint and accepts the restored original once',async()=>{
  const h=fixture({native:true});try{h.accept();h.system.sever('vault_1');h.receiver();
    await h.sim.registry.get('physics').prepareBackend(h.s);h.system._materialize();const v=h.system._find('vault_1');h.receiver(v);v.pos.x+=16;
    h.sim.registry.get('physics').update(1/60,h.s);
    const kernel=getCombatKernel(h.system.ctx),a=kernel.attachments.create({defId:'attachment_massline',ownerId:h.player.id,targetId:v.id,
      sourceWorld:h.player.pos,targetWorld:v.pos});assert.equal(a.ok,true,a.reason);assert.equal(h.system._towGate().ok,true);
    assert.equal(h.sim.helpers.combatPhysics.cutAttachment({attachmentId:a.attachment.id,physicsHandle:a.attachment.physicsHandle,reason:'fixture_native_missing'}),true);
    assert.equal(a.attachment.state,'active');assert.equal(h.system.deliverVault().ok,false);assert.equal(h.system._row.vaults.vault_1.status,'drifting');
    kernel.attachments.reconcilePhysics();assert.equal(h.system._towGate().ok,true);assert.equal(h.system.deliverVault().ok,true);
    assert.equal(h.system._row.vaults.vault_1.status,'delivered');assert.equal(h.system.deliverVault().ok,false);
  }finally{h.close();}
});
test('prompt exposes actual optional escort/recovery/close choices and discards stale menus on lifecycle transitions',()=>{
  let row,resolved=0;setPromptDeck({offerDecision:r=>{row=r;return true;},resolveDecision:()=>resolved++});
  const sim=createSimulation({seed:4,systems:[ilexArkPrompt]});try{
    let accepted;sim.bus.on('ilexArk:accept',p=>accepted=p);sim.bus.emit('ilexArk:offer',{revision:2,canAccept:true,status:'SIX ORIGINALS',text:'Optional',delivered:0});
    assert.equal(row.choices[0].id,'accept');row.onChoose('accept');assert.equal(accepted.revision,2);
    sim.bus.emit('ilexArk:offer',{revision:4,canDeliver:true,canFinish:true,status:'1/6',text:'Partial',delivered:1});
    assert.deepEqual(row.choices.map(c=>c.id),['deliver','finish','leave']);sim.bus.emit('save:restoring');assert.ok(resolved>0);
  }finally{sim.dispose();setPromptDeck(null);}
});
test('production default owners expose the optional voyage and Continue preserves five attached parts plus the original loose vault',async()=>{
  const runtime=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:804});
  try{const s=runtime.state,world=runtime.getSystem('world'),owner=runtime.getSystem('ilexArk');
    s.mode='flight';s.ui.screenStack=[];runtime.getSystem('ships').newGame();
    // Explicit prior-delivery fixture; the production optional-offer gate reads the canonical
    // mission owner's history, rather than a feature flag or an automatically accepted escort.
    s.missions.completedLog=[{type:'cargo_delivery',success:1,count:1,totalCr:1200}];
    const p=runtime.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:s.player,fittings:s.player.ownedShips[0].fittings}));s.playerId=p.id;
    world.enterSector(C.originSectorId);world.relocatePlayerInSector({x:ILEX_START.x+100,z:ILEX_START.z+60},{reason:'ilex-prior-delivery-fixture'});
    assert.equal(await runtime.getSystem('physics').prepareBackend(s),true);runtime.runTicks(60);
    const carrier=owner._find('carrier');assert.ok(carrier);let menu;runtime.bus.on('ilexArk:offer',r=>menu=r);
    runtime.bus.emit('scan:completed',{targetId:carrier.id});assert.equal(menu.canAccept,true);runtime.bus.emit('ilexArk:accept',{revision:menu.revision});
    assert.equal(owner._row.phase,'active');const start={...carrier.pos},deadline=owner._row.deadline;
    runtime.runTicks(600);assert.ok(dist(start,carrier.pos)>100);assert.equal(ilexArkPresentation(s,carrier).nativeBodyReady,true);
    assert.equal(owner.sever('vault_4').ok,true);assert.equal(ilexArkPresentation(s,carrier).nativeBodyReady,false);runtime.runTicks(3);
    const vault=owner._find('vault_4');assert.ok(vault);assert.equal(owner._row.vaults.vault_4.status,'drifting');
    assert.equal(ilexArkPresentation(s,carrier).attachedVaultIds.length,5);assert.equal(owner._native(carrier).colliders.length,6);
    const saved=JSON.parse(JSON.stringify(runtime.getSystem('save').serialize('quick')));
    assert.equal(runtime.getSystem('save').loadEnvelope(saved,'quick'),true);s.mode='flight';s.ui.screenStack=[];s.ui.docked=false;
    assert.equal(await runtime.getSystem('physics').prepareBackend(s),true);runtime.runTicks(60);
    const resumed=owner._find('carrier'),loose=owner._find('vault_4');assert.ok(resumed);assert.ok(loose);assert.notEqual(resumed,carrier);
    assert.notEqual(loose,vault);assert.equal(ilexArkPresentation(s,carrier),null);assert.equal(owner._row.deadline,deadline);
    assert.equal(owner._row.vaults.vault_4.status,'drifting');assert.equal(owner._native(resumed).colliders.length,6);
    assert.equal(resumed.physicsBody.mass+loose.physicsBody.mass,420);assert.equal(resumed.flightModel.mass,402);
    assert.equal(s.entityList.filter(e=>e.alive&&e.data?.ilexVaultId==='vault_4').length,1);
    console.log('ILEX_PRODUCTION_CONTINUE',JSON.stringify({tick:s.tick,deadline,attached:5,loose:'vault_4',carrierMass:402,vaultMass:18,
      movedWu:dist(start,resumed.pos),nativeReady:ilexArkPresentation(s,resumed).nativeBodyReady}));
  }finally{runtime.dispose();}
});
