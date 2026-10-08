import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { combat } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { towlineTable, towlineCrewPresentation } from '../src/systems/towlineTable.js';
import { towlineTablePrompt } from '../src/ui/towlineTablePrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';
import { TOWLINE_TABLE as C, TOWLINE_MEMBERS, towlineCleanupId, isTowlineCleanupTarget, normalizeTowlineTable } from '../src/data/towlineTable.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { resolveCollisionProxyManifest, resolveDockAnchor } from '../src/data/collisionProxyManifests.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';

let flags;test.before(()=>{flags=snapshotFeatureMaps();applyFeatureConfigToMaps(PRODUCTION_FEATURES);});test.after(()=>restoreFeatureMaps(flags));
function fixture({native=false}={}){
  const sim=createSimulation({seed:806,systems:[ships,spawnBudget,economy,...(native?[physics,aiPorts,flightV3,combat]:[]),npcJobsRuntime,towlineTable],
    helpers:native?{}:{combatPhysics:{createAttachment:r=>({id:r.attachmentId}),cutAttachment:()=>true}}});
  const s=sim.state;s.mode='flight';s.world.currentSectorId=C.sectorId;if(!native)s.settings.gameplay.physicsBackend='legacy';
  sim.registry.get('ships').newGame();s.missions={completedLog:[{type:'salvage_retrieval',success:1,count:1,totalCr:0}]};
  const player=sim.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:s.player,pos:{x:0,z:330},fittings:[]}));s.playerId=player.id;
  const station=sim.spawn({type:'station',team:2,pos:{x:0,z:0},radius:40,mass:1e9,hull:1e9,hullMax:1e9,
    physicsBody:{schemaVersion:1,dynamic:false,shape:'ball',radius:40,mass:1e9},data:{stationId:C.stationId,dockRadius:110}});
  const owner=sim.registry.get('towlineTable'),jobs=sim.registry.get('npcJobsRuntime');owner.update(1/60,s);
  function tick(n=1){for(let i=0;i<n;i++){s.tick++;s.simTime=s.tick/60;
    if(native)sim.registry.get(flightV3.name).update(1/60,s);owner.update(1/60,s);jobs.update(1/60,s);
    if(native){sim.registry.get('aiPorts').update(1/60,s);sim.registry.get('combat').update(1/60,s);sim.registry.get('physics').update(1/60,s);}}}
  function receiver(e=player){const p=resolveDockAnchor(station,resolveCollisionProxyManifest(station),e)||{x:70,z:0};e.pos.set(p.x,0,p.z);e.vel.set(0,0,0);}
  function take(id='mara'){const body=owner._find(id,'cleanup');player.pos.set(body.pos.x+35,0,body.pos.z);return owner.take(id,owner._row.revision);}
  function line(a,b,defId='attachment_massline'){return getCombatKernel(owner.ctx).attachments.create({defId,ownerId:a.id,targetId:b.id,sourceWorld:a.pos,targetWorld:b.pos});}
  function earn(id='mara'){assert.equal(take(id).ok,true);const body=owner._find(id,'cleanup'),crew=owner._find(id);
    receiver(player);receiver(body);body.pos.x+=20;receiver(crew);crew.pos.z+=65;
    if(native)sim.registry.get('physics').update(1/60,s);
    const l=line(player,body);assert.equal(l.ok,true,l.reason);const out=owner.deliver(id,owner._row.revision);assert.equal(out.ok,true,out.reason);return out;}
  function load(worldRecordId='towline-fixture:freight',mass=70){return sim.spawn({type:'payload',team:2,pos:{x:80,z:80},radius:4,mass,hull:35,hullMax:35,
    physicsBody:{schemaVersion:1,dynamic:true,shape:'ball',radius:4,mass,inertiaY:mass*8},flags:{persistent:true},
    data:{worldRecordId,identityKey:worldRecordId,sectorId:C.sectorId,towable:true,salvagePool:{cmdty_scrap_metal:1}}});}
  return {sim,s,owner,jobs,player,station,tick,receiver,take,line,earn,load,close:()=>sim.dispose()};
}

test('three finite originals are narrow NPC tow targets; forged labels, unavailable budgets and terminal fates create no phantom jobs',()=>{
  const h=fixture();try{assert.equal(h.s.spawnBudget.used,3);assert.equal(h.s.entityList.filter(e=>e.data?.persistenceOwner===C.owner).length,6);
    for(const m of TOWLINE_MEMBERS){const e=h.owner._find(m.id,'cleanup');assert.equal(e.mass,m.cleanupMass);assert.equal(isTowlineCleanupTarget(h.s,e),true);
      assert.deepEqual(e.data.salvagePool,{});assert.equal(h.owner._lease(m.id).towAssist.targetId,e.id);}
    const original=h.owner._find('mara','cleanup'),fake=h.sim.spawn({type:'payload',mass:180,physicsBody:original.physicsBody,data:{...original.data}});
    fake.data.identityKey='forged';assert.equal(isTowlineCleanupTarget(h.s,fake),false);h.sim.helpers.removeEntity(fake.id);
    h.owner._row.members.mara.source.status='lost';h.sim.helpers.removeEntity(original.id);h.tick();assert.equal(h.owner._find('mara','cleanup'),null);
    const old=h.owner._find('kit');h.owner.newGame();h.sim.bus.emit('entity:destroyed',{id:old.id,entity:old});
    assert.equal(h.owner._row.members.kit.status,'live','stale reset callback never kills the next original');
    const budget=h.sim.helpers.spawnBudget;budget.request(budget.available(),'other');h.tick();assert.equal(h.owner._find('mara'),null);
  }finally{h.close();}
});

test('canonical hire reserves one target before a second worker can promise it or bill another fee',()=>{
  const h=fixture();try{for(const id of ['mara','odo']){h.owner._cancel(id);h.owner._assign(h.owner._find(id),id);}
    h.sim.registry.get('economy').grantCredits(25,'towline_fixture');
    const target=h.load(),a=h.owner._find('mara'),b=h.owner._find('odo'),credits=h.s.player.credits;
    const first=h.jobs.requestTowAssist(a.id,target.id,{x:70,z:0},{feeCr:5});assert.equal(first.granted,true);
    const second=h.jobs.requestTowAssist(b.id,target.id,{x:70,z:0},{feeCr:5});assert.equal(second.granted,false);assert.equal(second.reason,'target_already_hired');
    assert.ok(!h.owner._lease('odo').control);assert.equal(h.s.player.credits,credits-5);
  }finally{h.close();}
});

test('current native joint, slow receiver and living witness produce one exhaustible receipt before recursive retirement',async()=>{
  const h=fixture({native:true});try{assert.equal(h.take().ok,true);const e=h.owner._find('mara','cleanup'),crew=h.owner._find('mara');
    h.receiver();h.receiver(e);e.pos.x+=20;h.receiver(crew);crew.pos.z+=65;
    await h.sim.registry.get('physics').prepareBackend(h.s);h.sim.registry.get('physics').update(1/60,h.s);
    const out=h.line(h.player,e);assert.equal(out.ok,true,out.reason);assert.ok(h.owner._deliveryGate('mara'));
    assert.equal(h.sim.helpers.combatPhysics.cutAttachment({attachmentId:out.attachment.id,physicsHandle:out.attachment.physicsHandle,reason:'missing_native_fixture'}),true);
    assert.equal(out.attachment.state,'active');assert.equal(h.owner.deliver('mara',h.owner._row.revision).ok,false);
    getCombatKernel(h.owner.ctx).attachments.reconcilePhysics();assert.ok(h.owner._deliveryGate('mara'));
    let accepted=0;h.sim.bus.on('towlineTable:cleanupAccepted',()=>{accepted++;assert.equal(h.owner.deliver('mara',h.owner._row.revision).ok,false);});
    const credits=h.s.player.credits,r=h.owner.deliver('mara',h.owner._row.revision);assert.equal(r.ok,true);assert.equal(accepted,1);
    assert.equal(h.owner._row.members.mara.benefit.status,'earned');assert.equal(h.owner._find('mara','cleanup'),null);h.tick(5);
    assert.equal(h.owner._row.members.mara.source.status,'cleared');assert.equal(h.s.player.credits,credits);
    assert.equal(towlineCrewPresentation(h.s,e),null);
  }finally{h.close();}
});

test('labor lease reserves its immutable original before reentry; Continue and retry cannot reset time or select another load',()=>{
  const h=fixture();try{h.earn();const load=h.load(),other=h.load('towline-fixture:other'),m=h.owner._find('mara');m.pos.set(80,0,180);
    h.player.pos.set(110,0,80);let recursion;
    const canonical=h.sim.helpers.npcJobs.requestTowAssist;h.sim.helpers.npcJobs.requestTowAssist=(...args)=>{
      recursion=h.owner.assist('mara',h.owner._row.revision,other.id);return canonical(...args);};
    assert.equal(h.owner.assist('mara',h.owner._row.revision,load.id).ok,true);assert.equal(recursion.ok,false);
    const before=h.owner._row.members.mara.benefit,deadline=before.deadline,identity=before.target.worldRecordId;
    const saved=h.owner.serialize();h.sim.bus.emit('save:restoring');h.owner._cancel('mara');h.owner.deserialize(saved);h.owner.afterContinue();
    assert.equal(h.owner._row.members.mara.benefit.status,'paused');assert.equal(h.owner._row.members.mara.benefit.deadline,deadline);
    assert.equal(h.owner._targetGate('mara',other),'receipt_already_bound_to_another_original');
    h.owner._assign(m,'mara');assert.equal(h.owner.assist('mara',h.owner._row.revision,other.id).ok,true,'resume uses saved original, never submitted replacement');
    assert.equal(h.owner._row.members.mara.benefit.target.worldRecordId,identity);assert.equal(h.owner._row.members.mara.benefit.deadline,deadline);
    h.s.simTime=deadline+1;h.owner._observeAssist('mara');assert.equal(h.owner._row.members.mara.benefit.status,'spent');
    assert.equal(h.owner.assist('mara',h.owner._row.revision,load.id).ok,false);
  }finally{h.close();}
});

test('loss, deliberate harm and malformed receipts never revive a member or mint labor; unwitnessed recovery still clears the original',()=>{
  const h=fixture();try{h.earn('odo');const odo=h.owner._find('odo');h.sim.bus.emit('combat:damage',{targetId:odo.id,attackerId:h.player.id,hullDamage:2,origin:{kind:'physics_collision'}});
    assert.equal(h.owner._row.members.odo.betrayed,false,'an accident is not deliberate weapon harm');
    h.sim.bus.emit('combat:damage',{targetId:odo.id,attackerId:h.player.id,hullDamage:2,origin:{kind:'projectile'}});
    assert.equal(h.owner._row.members.odo.betrayed,true);assert.equal(h.owner._row.members.odo.benefit.status,'void');
    const kit=h.owner._find('kit');h.sim.bus.emit('entity:killed',{targetId:kit.id});h.sim.helpers.removeEntity(kit.id);h.tick();
    assert.equal(h.owner._row.members.kit.status,'lost');assert.equal(h.owner._find('kit'),null);
    assert.equal(h.take('kit').ok,false,'a dead crew cannot volunteer its line');
    h.owner._row.members.kit.source.status='player';const body=h.owner._find('kit','cleanup');h.receiver();h.receiver(body);body.pos.x+=20;
    assert.equal(h.line(h.player,body).ok,true);assert.equal(h.owner.deliver('kit',h.owner._row.revision).ok,true);
    assert.equal(h.owner._row.members.kit.source.status,'cleared');assert.equal(h.owner._row.members.kit.benefit,null);
    const raw=h.owner.serialize();raw.members.mara.benefit={receiptId:'fake',status:'earned'};assert.equal(normalizeTowlineTable(raw).members.mara.benefit,null);
    h.owner.deserialize(raw);h.owner.afterContinue();h.tick();assert.equal(h.owner._find('kit'),null);
  }finally{h.close();}
});

test('actual NPC tow uses selected native force and only current physical arrival settles the labor without selling foreign cargo',async()=>{
  const h=fixture({native:true});try{await h.sim.registry.get('physics').prepareBackend(h.s);h.earn();const target=h.load(),crew=h.owner._find('mara');
    crew.pos.set(175,0,80);crew.rot=Math.PI;crew.vel.set(0,0,0);h.player.pos.set(90,0,145);
    await h.sim.registry.get('physics').prepareBackend(h.s);h.sim.registry.get('physics').update(1/60,h.s);
    const credits=h.s.player.credits,initial={x:target.pos.x,z:target.pos.z};assert.equal(h.owner.assist('mara',h.owner._row.revision,target.id).ok,true);
    h.tick(600);const entry=h.owner._lease('mara');assert.ok(entry.towAttachmentId);assert.ok(h.owner._line(crew,target));
    assert.ok(Math.hypot(target.pos.x-initial.x,target.pos.z-initial.z)>1,'actual native line transmitted the worker force to its original load');
    const view=towlineCrewPresentation(h.s,crew);assert.equal(view.nativeJointReady,true);assert.ok(Number.isFinite(view.relativeLineSpeed));
    assert.equal(view.nativeBodyReady,true);assert.equal(view.ownerLife,crew.occupantGeneration);assert.equal(view.simTime,h.s.simTime);
    const sg=h.sim.registry.get('physics')._sg02,oldTick=sg._simTick;sg._simTick=h.s.tick-3;
    assert.equal(towlineCrewPresentation(h.s,crew).nativeBodyReady,false);assert.equal(towlineCrewPresentation(h.s,crew).nativeJointReady,false);sg._simTick=oldTick;
    h.receiver(target);target.pos.x+=12;target.vel.set(0,0,0);h.sim.registry.get('physics').update(1/60,h.s);h.owner._observeAssist('mara');
    assert.equal(h.owner._row.members.mara.benefit.status,'spent');assert.equal(target.alive,true);assert.deepEqual(target.data.salvagePool,{cmdty_scrap_metal:1});
    assert.equal(h.s.player.credits,credits);assert.equal(towlineCrewPresentation(h.s,crew).nativeJointReady,false);
  }finally{h.close();}
});

test('ordinary prompt exposes every live choice and closes stale state on Continue, docking and sector exit',()=>{
  let row,resolved=0;setPromptDeck({offerDecision:r=>{row=r;return true;},resolveDecision:()=>resolved++});
  const sim=createSimulation({seed:6,systems:[towlineTablePrompt]});try{const chosen=[];
    for(const action of ['take','deliver','assist','release','course'])sim.bus.on(`towlineTable:${action}`,p=>chosen.push({action,...p}));
    const offer={memberId:'mara',name:'Mara',revision:12,targetId:77,status:'PLAYER',headline:'Clamp tug',text:'Original and receipt',
      canTake:true,canDeliver:true,canAssist:true,canRelease:true,canCourse:true};
    for(const action of ['take','deliver','assist','release','course','leave']){sim.bus.emit('towlineTable:offer',offer);
      assert.deepEqual(row.choices.map(c=>c.id),['take','deliver','assist','release','course','leave']);row.onChoose(action);}
    assert.equal(chosen.length,5);assert.ok(chosen.every(p=>p.memberId==='mara'&&p.revision===12&&p.targetId===77));
    for(const event of ['save:restoring','dock:docked','sector:exit'])sim.bus.emit(event);assert.equal(resolved,9);
  }finally{sim.dispose();setPromptDeck(null);}
});

test('production default scanner reaches the original native recovery and repeated Continue retains its finite receipt and crew loss',async()=>{
  const runtime=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:806});
  try{const s=runtime.state,world=runtime.getSystem('world'),owner=runtime.getSystem('towlineTable'),p=runtime.getSystem('physics');
    assert.ok(owner,'the normal production registry owns Towline');s.mode='flight';s.ui.screenStack=[];runtime.getSystem('ships').newGame();
    // A genuine prior-recovery history is this fixture's explicit precondition. The production
    // offer reads the existing mission receipt, never a Towline feature flag or autoaccepted job.
    s.missions.completedLog=[{type:'salvage_retrieval',success:1,count:1,totalCr:0}];
    const player=runtime.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:s.player,fittings:[]}));s.playerId=player.id;
    world.enterSector(C.sectorId);assert.equal(await p.prepareBackend(s),true);runtime.runTicks(60);
    const body=owner._find('mara','cleanup'),crew=owner._find('mara');assert.ok(body);assert.ok(crew);
    world.relocatePlayerInSector({x:body.pos.x+36,z:body.pos.z},{reason:'towline-prior-recovery-fixture'});runtime.runTicks(1);
    let menu;runtime.bus.on('towlineTable:offer',row=>menu=row);runtime.bus.emit('scan:completed',{targetId:body.id});
    assert.equal(menu.canTake,true);runtime.bus.emit('towlineTable:take',{memberId:'mara',revision:menu.revision});assert.equal(owner._row.members.mara.source.status,'player');
    const startedAt=owner._row.members.mara.source.startedAt;runtime.runTicks(600);
    // The receiver fixture places this original at the live station's exact hull-specific anchor.
    // Native body/joint custody, not this placement or a completed advisory event, decides acceptance.
    const station=owner._station(),manifest=resolveCollisionProxyManifest(station),bodyAnchor=resolveDockAnchor(station,manifest,body),pilotAnchor=resolveDockAnchor(station,manifest,player);
    assert.ok(bodyAnchor);assert.ok(pilotAnchor);body.pos.set(bodyAnchor.x+7,0,bodyAnchor.z);body.vel.set(0,0,0);
    world.relocatePlayerInSector({x:pilotAnchor.x,z:pilotAnchor.z},{reason:'towline-current-receiver-fixture'});
    const crewAnchor=resolveDockAnchor(station,manifest,crew);crew.pos.set(crewAnchor.x+40,0,crewAnchor.z+30);crew.vel.set(0,0,0);p.update(1/60,s);
    const joint=getCombatKernel(owner.ctx).attachments.create({defId:'attachment_massline',ownerId:player.id,targetId:body.id,sourceWorld:player.pos,targetWorld:body.pos});
    assert.equal(joint.ok,true,joint.reason);const credits=s.player.credits;runtime.bus.emit('towlineTable:deliver',{memberId:'mara',revision:owner._row.revision});
    assert.equal(owner._row.members.mara.source.status,'cleared');assert.equal(owner._row.members.mara.benefit.status,'earned');assert.equal(s.player.credits,credits);
    const kit=owner._find('kit');runtime.bus.emit('entity:killed',{targetId:kit.id});runtime.getHelpers().removeEntity(kit.id);
    for(let i=0;i<2;i++){const saved=JSON.parse(JSON.stringify(runtime.getSystem('save').serialize('quick')));assert.ok(saved);
      assert.equal(runtime.getSystem('save').loadEnvelope(saved,'quick'),true);s.mode='flight';s.ui.screenStack=[];s.ui.docked=false;
      assert.equal(await p.prepareBackend(s),true);runtime.runTicks(60);
      assert.equal(owner._row.members.mara.source.status,'cleared');assert.equal(owner._row.members.mara.source.startedAt,startedAt);
      assert.equal(owner._row.members.mara.benefit.status,'earned');assert.equal(owner._find('mara','cleanup'),null);assert.equal(owner._find('kit'),null);
      assert.equal(owner._row.members.kit.status,'lost');assert.equal(owner._find('odo').physicsBody.collisionProxyManifest.convexParts.length,2);
    }
    assert.equal(towlineCrewPresentation(s,crew),null,'old pre-Continue actor never supplies presentation authority');
    console.log(JSON.stringify({towlineProduction:{tick:s.tick,source:towlineCleanupId('mara'),receipt:owner._row.members.mara.source.receipt.id,
      benefit:owner._row.members.mara.benefit.status,kit:owner._row.members.kit.status,startedAt,credits:s.player.credits}}));
  }finally{runtime.dispose();}
});
