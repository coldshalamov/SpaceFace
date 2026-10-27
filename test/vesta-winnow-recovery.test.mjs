import test from 'node:test';
import assert from 'node:assert/strict';
import { vestaWinnowRecoveryFixture } from './fixtures/vesta-winnow-recovery-native.mjs';
import { winnowRecoveryFacts, registerWinnowPod, finishWinnowBatch, admitWinnowRecovery, beginWinnowBatch, normalizeWinnowRecovery } from '../src/world/vestaWinnowRecovery.js';

test('original Winnow pods and original Tann custody survive real Save/Continue before movement', async () => {
  const f = await vestaWinnowRecoveryFixture();
  try {
    const { state, owner, tann, pods, batchId } = f;
    const priorJob = tann.data.jobId;
    const priorWork=JSON.stringify({manifest:tann.data.cargoManifest,job:priorJob,itinerary:tann.data.itinerary,intent:tann.data.intent,route:f.record.worldSiteRoute});
    assert.equal(pods.length, 5);
    assert.equal(winnowRecoveryFacts(state, batchId).original, 10);
    assert.equal(admitWinnowRecovery(owner, tann, f.record), false, 'occupied original Tann is not confiscated');
    finishWinnowBatch(state, batchId, 'claim_broken');
    assert.equal(admitWinnowRecovery(owner, tann, f.record), false, 'episode clearance cannot erase his prior manifest');
    assert.ok(priorJob, 'original Tann is doing his preexisting authored haul');
    assert.equal(tann.data.jobId, priorJob);
    assert.equal(JSON.stringify({manifest:tann.data.cargoManifest,job:tann.data.jobId,itinerary:tann.data.itinerary,intent:tann.data.intent,route:f.record.worldSiteRoute}),priorWork);
    const envelope = f.save.serialize('winnow-before-pickup');
    assert.ok(envelope);
    assert.equal(f.save.loadEnvelope(envelope), true);
    const facts = winnowRecoveryFacts(state, batchId);
    assert.equal(facts.original, 10);
    assert.equal(facts.loose, 10);
    const restored = state.entityList.filter(e => e.alive && e.data?.vestaWinnowPod?.batchId === batchId);
    assert.equal(restored.length, 5);
    for (const pod of restored) assert.equal(registerWinnowPod(state, batchId, pod, pod.data.vestaWinnowPod.podId), false, 'registration retry cannot mint another source');
    assert.equal(winnowRecoveryFacts(state, batchId).original, 10);
  } finally { f.close(); }
});

test('player partial recovery remains legal salvage with exact supported lot provenance', async () => {
  const f=await vestaWinnowRecoveryFixture();
  try {
    finishWinnowBatch(f.state,f.batchId,'claim_broken');
    const player=f.state.entities.get(f.state.playerId),pod=f.pods[0];
    pod.data.salvorClaimedBy=f.tann.data.worldRecordId; // player may still take offered salvage
    let claimJumps=0;f.runtime.bus.on('salvage:claimJumped',()=>claimJumps++);
    const legal=()=>JSON.stringify({heat:f.state.player.heat,rep:Object.fromEntries(Object.entries(f.state.factions).map(([id,v])=>[id,v.rep])),incidents:f.state.lawSecurity.reportedIncidents});
    const before=legal();
    f.state.player.cargo.capVolume=f.state.player.cargo.usedVolume+1;
    assert.equal(f.runtime.getSystem('mining')._collectPayload(pod,player),true);
    assert.equal(pod.data.amount,1);
    const facts=winnowRecoveryFacts(f.state,f.batchId);
    assert.equal(facts.playerHeld,1);
    assert.equal(facts.playerRecovered,1);
    assert.equal(facts.loose,9);
    assert.equal(legal(),before);assert.equal(claimJumps,0);
    const envelope=f.save.serialize('partial-original-copper');
    assert.equal(f.save.loadEnvelope(envelope),true);
    assert.equal(winnowRecoveryFacts(f.state,f.batchId).playerHeld,1);
    assert.equal(winnowRecoveryFacts(f.state,f.batchId).loose,9);
  } finally {f.close();}
});

test('actual mining split moves original custody into durable children without changing total', async () => {
  const f=await vestaWinnowRecoveryFixture();
  try {
    const original=f.pods[0],sourceId=original.data.vestaWinnowPod.podId;
    f.runtime.getSystem('mining')._splitCargoPod(f.state.entities.get(f.state.playerId),original);
    assert.equal(original.alive,false);
    const children=f.state.entityList.filter(e=>e.alive&&e.data?.vestaWinnowPod?.podId.startsWith(`${sourceId}:split:`));
    assert.equal(children.length,2);
    assert.equal(children.reduce((n,p)=>n+p.data.amount,0),2);
    assert.ok(children.every(p=>p.flags.persistent && p.data.richLotSource.provenanceId===f.batchId));
    assert.equal(winnowRecoveryFacts(f.state,f.batchId).original,10);
    assert.equal(winnowRecoveryFacts(f.state,f.batchId).loose,10);
    assert.equal(f.save.loadEnvelope(f.save.serialize('split-original-copper')),true);
    assert.equal(f.state.entityList.filter(e=>e.alive&&e.data?.vestaWinnowPod?.podId.startsWith(`${sourceId}:split:`)).length,2);
    const replay=f.runtime.spawn({type:'payload',pos:{...original.pos},vel:{x:0,z:0},radius:original.radius,mass:original.mass,
      data:{commodityId:original.data.commodityId,amount:2}});
    assert.equal(registerWinnowPod(f.state,f.batchId,replay,sourceId),false,
      'the retained original source identity refuses producer replay after its split parent is normalized away');
    assert.equal(replay.data.vestaWinnowPod,undefined);
    assert.equal(winnowRecoveryFacts(f.state,f.batchId).original,10);
  } finally {f.close();}
});

test('replayed exact pickup receipt cannot move the remainder a second time', async () => {
  const {winnowPickupReceipt}=await import('../src/world/vestaWinnowRecovery.js');
  const {writePickupRemainder}=await import('../src/core/pickupAcceptance.js');
  const f=await vestaWinnowRecoveryFixture();
  try {
    const p=f.pods[0];let receipt;
    f.runtime.bus.on('pickup:collected',event=>{if(event.pickupId===p.id) receipt=event;});
    f.state.player.cargo.capVolume=f.state.player.cargo.usedVolume+1;
    f.runtime.getSystem('mining')._collectPayload(p,f.state.entities.get(f.state.playerId));
    assert.equal(p.data.amount,1);
    winnowPickupReceipt(f.owner,receipt);
    assert.equal(winnowRecoveryFacts(f.state,f.batchId).playerRecovered,1);
    assert.equal(winnowRecoveryFacts(f.state,f.batchId).loose,9);
  } finally {f.close();}
});

test('pre-terminal Continue retains actual threat evidence and can clear without a duplicated episode reward', async () => {
  const {reconcileWinnowRecovery}=await import('../src/world/vestaWinnowRecovery.js');
  const f=await vestaWinnowRecoveryFixture();
  try {
    assert.equal(winnowRecoveryFacts(f.state,f.batchId).phase,'episode');
    assert.equal(f.save.loadEnvelope(f.save.serialize('before-episode-clear')),true);
    const threat=f.state.entityList.find(e=>e.alive&&e.data?.vestaWinnowThreat?.batchId===f.batchId);
    assert.ok(threat,'the actual surviving threat, not absence after load, determines safe recovery');
    const credits=f.state.player.credits;
    for(const e of f.state.entityList.filter(e=>e.alive&&e.data?.vestaWinnowThreat?.batchId===f.batchId)) f.runtime.bus.emit('entity:killed',{id:e.id,targetHostileToPlayer:true});
    reconcileWinnowRecovery(f.owner);
    assert.equal(winnowRecoveryFacts(f.state,f.batchId).phase,'available');
    assert.equal(f.state.player.credits,credits,'recovery safety does not replay encounter rewards');
  } finally {f.close();}
});

 test('rejected-only ordinary NPC receipt does not consume original custody', async()=>{
 const {winnowPickupReceipt}=await import('../src/world/vestaWinnowRecovery.js');
 const f=await vestaWinnowRecoveryFixture();try {
 winnowPickupReceipt(f.owner,{pickupId:f.pods[0].id,collectorId:-1,amount:2,rejectedAmount:2});
 assert.equal(winnowRecoveryFacts(f.state,f.batchId).otherConsumed,0);
 assert.equal(winnowRecoveryFacts(f.state,f.batchId).loose,10);
 }finally{f.close();}
});
test('Continue inside cargo changed cannot apply an old original-pod receipt to restored custody', async()=>{
 const f=await vestaWinnowRecoveryFixture();try {
 const envelope=f.save.serialize('before-reentrant-pickup');let loaded=false;
 f.runtime.bus.on('cargo:changed',()=>{if(!loaded){loaded=true;assert.equal(f.save.loadEnvelope(envelope),true);}});
 f.runtime.getSystem('mining')._collectPayload(f.pods[0],f.state.entities.get(f.state.playerId));
 assert.equal(loaded,true);
 assert.equal(winnowRecoveryFacts(f.state,f.batchId).playerRecovered,0);
 assert.equal(winnowRecoveryFacts(f.state,f.batchId).loose,10);
 }finally{f.close();}
});

for (const reverse of [false,true]) test(`actual paired death owners conserve a staged finite load (loot first: ${reverse})`,async()=>{
  const {reconcileWinnowRecovery}=await import('../src/world/vestaWinnowRecovery.js');
  const f=await vestaWinnowRecoveryFixture();try {
    // Death-path fixture only: stages an already transferred original 4u, not motion proof.
    const b=f.state.traffic.vestaWinnowRecovery.batches[0],r=b.pods[0],e=f.tann;
    for(let i=0;i<2;i++){b.pods[i].loose=0;b.pods[i].aboard=2;f.pods[i].alive=false;}b.carrierId=e.data.worldRecordId;b.phase='deliver';
    e.data.vestaWinnowRecovery={batchId:b.id,saved:{persistent:false}};
    e.data.itinerary={kind:'vesta_winnow_recovery',batchId:b.id};
    f.owner._setTrafficManifest(e,f.record,{finiteSource:'vesta_winnow_recovery',manifestId:`${b.id}:load`,freighterKey:b.carrierId,lotId:b.id,lines:[{commodityId:'cmdty_ore_copper',qty:4}],totalQty:4,totalValue:0});
    const aftermath=f.runtime.getSystem('aftermathWrecks');
    if(reverse){f.runtime.bus.off('entity:killed',aftermath._onKilled);f.runtime.bus.on('entity:killed',aftermath._onKilled);}
    const result=f.runtime.getSystem('combat').onHit({targetId:e.id,ownerId:null,damage:100000,damageType:'kinetic',pos:{...e.pos}});
    assert.equal(result.ok,true);assert.ok(e.hull<=0);
    reconcileWinnowRecovery(f.owner);
    const facts=winnowRecoveryFacts(f.state,b.id);
    assert.equal(facts.original,10);assert.equal(facts.aboard,0);assert.equal(facts.loose+facts.lost,10);
    const spills=f.state.entityList.filter(x=>x.alive&&x.data?.vestaWinnowPod?.podId.includes(':spill:'));
    assert.equal(spills.reduce((n,x)=>n+x.data.amount,0),4);
    const markers=Object.values(f.state.aftermathWrecks.bySector).flat();
    assert.ok(markers.length);
    assert.ok(markers.every(m=>!m.manifestResidue?.cmdty_ore_copper));
  }finally{f.close();}
});

test('ordinary and malformed foreign four-unit freight keep existing wreck residue',async()=>{
 for(const foreign of [false,true]){
 const f=await vestaWinnowRecoveryFixture();try{
 const e=f.tann,b=f.state.traffic.vestaWinnowRecovery.batches[0];
 if(foreign){b.carrierId=e.data.worldRecordId;e.data.vestaWinnowRecovery={batchId:b.id};}
 f.owner._setTrafficManifest(e,f.record,{finiteSource:foreign?'vesta_winnow_recovery':'ordinary',manifestId:foreign?`${b.id}:load`:'ordinary-load',freighterKey:e.data.worldRecordId,lotId:'foreign-lot',lines:[{commodityId:'cmdty_ore_copper',qty:4}],totalQty:4,totalValue:0});
 // Invoke the unchanged wreck owner before ordinary panic-jettison can empty this control manifest.
 e.hull=0;e.alive=false;f.runtime.getSystem('aftermathWrecks')._onKilled({id:e.id,type:'ship',pos:{...e.pos}});
 const markers=Object.values(f.state.aftermathWrecks.bySector).flat();
 assert.ok(markers.some(m=>m.manifestResidue?.cmdty_ore_copper===1),JSON.stringify({foreign,markers}));
 }finally{f.close();}
 }
});

test('encounter prewarm agrees with the actual original pod renderer selector',async()=>{
 const {authoredPayloadFileForEntity}=await import('../src/render/partsLibrary.js');
 const source=await import('../src/data/encounters/355-the-winnow-throw.js');
 const f=await vestaWinnowRecoveryFixture();try{
 const file=authoredPayloadFileForEntity(f.pods[0]);
 assert.equal(file,'places/place_cargo_pod_standard.glb');
 assert.ok(source.default.warmAssets.includes(file));
 }finally{f.close();}
});

for(const foreign of [false,true]) test(`release restores only owned transient state (foreign replacement: ${foreign})`,async()=>{
 const {stepWinnowRecovery}=await import('../src/world/vestaWinnowRecovery.js');
 const f=await vestaWinnowRecoveryFixture();try{
 const e=f.tann,b=f.state.traffic.vestaWinnowRecovery.batches[0];
 // Boundary-unit setup: admission itself remains covered as occupied/refused above.
 const priorIntent={moveX:.25},priorScan='prior label';
 e.data.jobId=null;e.data.civilianReaction=null;f.record.civilianReaction=null;
 e.flags={...e.flags};delete e.flags.persistent;
 e.data.vestaWinnowRecovery={batchId:b.id,saved:{persistent:false,scanLabel:priorScan,intent:priorIntent}};
 e.data.itinerary={kind:'vesta_winnow_recovery',batchId:b.id,destinationStationId:'station_forge'};b.carrierId=e.data.worldRecordId;b.phase='collect';
 e.data.cargoManifest={finiteSource:'vesta_winnow_recovery',manifestId:`${b.id}:load`,freighterKey:b.carrierId,lotId:b.id,lines:[],totalQty:0,totalValue:0};
 e.flags.persistent=true;e.data.scanLabel='SLAG-RUN · WINNOW REMAINDER → FORGE';e.data.intent={vestaWinnowOwned:true};
 stepWinnowRecovery(f.owner,e,f.record); // acquire current restoration lease
 if(foreign){e.flags={...e.flags,persistent:true};e.data.intent={foreign:true};e.data.scanLabel='foreign label';}
 b.phase='delivered';stepWinnowRecovery(f.owner,e,f.record);
 assert.equal(e.flags.persistent===true,foreign);
 assert.deepEqual(e.data.intent,foreign?{foreign:true}:priorIntent);
 assert.equal(e.data.scanLabel,foreign?'foreign label':priorScan);
 assert.equal(e.data.vestaWinnowRecovery,undefined);
 }finally{f.close();}
});

test('source forks and duplicate named Tann identities fail closed at idle admission',async()=>{
 const f=await vestaWinnowRecoveryFixture();try{
 for(const fork of ['source','carrier']){
 const e={...f.tann,data:{...f.tann.data,jobId:null,itinerary:null,cargoManifest:null,civilianReaction:null},flags:{...f.tann.flags}};
 const record={id:e.id,manifest:null};
 const pods=f.pods.map(p=>({...p,data:{...p.data}}));
 const copies=fork==='source'?pods.map(p=>({...p,id:p.id+100000,data:{...p.data}})):[{...e,id:e.id+100000,data:{...e.data}}];
 const list=[e,...pods,...copies];
 const state={...f.state,entityList:list,entities:new Map(list.map(x=>[x.id,x])),traffic:{...f.state.traffic,vestaWinnowRecovery:structuredClone(f.state.traffic.vestaWinnowRecovery)}};
 state.traffic.vestaWinnowRecovery.batches[0].phase='available';
 let writes=0;const owner={state,bus:f.runtime.bus,_setTrafficManifest(){writes++;return true;}};
 assert.equal(admitWinnowRecovery(owner,e,record),false,fork);assert.equal(writes,0);
 }
 }finally{f.close();}
});

test('split-child copied provenance rejects a stale receipt after reentrant Continue',async()=>{
 const f=await vestaWinnowRecoveryFixture();try{
 const mining=f.runtime.getSystem('mining'),player=f.state.entities.get(f.state.playerId),original=f.pods[0];
 mining._splitCargoPod(player,original);
 const child=f.state.entityList.find(e=>e.alive&&e.data?.vestaWinnowPod?.podId.startsWith(`${original.data.vestaWinnowPod.podId}:split:`));
 const envelope=f.save.serialize('split-before-reentrant-pickup');let loaded=false;
 f.runtime.bus.on('cargo:changed',()=>{if(!loaded){loaded=true;assert.equal(f.save.loadEnvelope(envelope),true);}});
 mining._collectPickupViaEvent(child,player);
 assert.equal(loaded,true);assert.equal(winnowRecoveryFacts(f.state,f.batchId).loose,10);
 assert.equal(winnowRecoveryFacts(f.state,f.batchId).playerRecovered,0);
 }finally{f.close();}
});

test('station contact detour keeps a side, clears without orbit, and permits actual final Forge berth',async()=>{
 const {winnowSteeringTarget,winnowReceiverAnchor}=await import('../src/world/vestaWinnowRecovery.js');
 const f=await vestaWinnowRecoveryFixture();try{
 const e={...f.tann,pos:{x:-826.976,z:16640.233},data:{...f.tann.data,vestaWinnowRecovery:{}}};
 const target={x:-502.455,z:16933.436};
 const detour=winnowSteeringTarget(f.owner,e,target);
 assert.notDeepEqual(detour,target);assert.equal(e.data.vestaWinnowRecovery.detour.stationId,'station_vesta_outlying_yard');
 const side=e.data.vestaWinnowRecovery.detour.side;
 e.pos={...detour};winnowSteeringTarget(f.owner,e,target); // pure geometry, not movement proof
 if(e.data.vestaWinnowRecovery.detour)assert.equal(e.data.vestaWinnowRecovery.detour.side,side);
 let clear=false;
 for(let i=0;i<30;i++){const waypoint=winnowSteeringTarget(f.owner,e,target);if(waypoint===target){clear=true;break;}e.pos={...waypoint};}
 assert.equal(clear,true);assert.equal(e.data.vestaWinnowRecovery.detour,undefined);
 const forge=f.state.entityList.find(x=>x.data?.stationId==='station_forge'),anchor=winnowReceiverAnchor(forge,e);
 e.pos={x:anchor.x,z:anchor.z-5};
 assert.equal(winnowSteeringTarget(f.owner,e,anchor,'station_forge'),anchor);
 e.pos={x:forge.pos.x-(anchor.x-forge.pos.x)*2,z:forge.pos.z-(anchor.z-forge.pos.z)*2};
 assert.notEqual(winnowSteeringTarget(f.owner,e,anchor,'station_forge'),anchor,'destination name alone does not bypass its far-side hull');
 }finally{f.close();}
});

test('radial detour keeps thrust through the former ten-unit braking dead zone',async()=>{
 const {winnowSteeringTarget,stepWinnowRecovery}=await import('../src/world/vestaWinnowRecovery.js');
 const f=await vestaWinnowRecoveryFixture();try{
 const e=f.tann,b=f.state.traffic.vestaWinnowRecovery.batches[0];
 e.data.jobId=null;e.data.civilianReaction=null;f.record.civilianReaction=null;
 e.data.vestaWinnowRecovery={batchId:b.id,saved:{persistent:true}};
 e.data.itinerary={kind:'vesta_winnow_recovery',batchId:b.id,destinationStationId:'station_forge'};b.carrierId=e.data.worldRecordId;b.phase='collect';
 e.data.cargoManifest={finiteSource:'vesta_winnow_recovery',manifestId:`${b.id}:load`,freighterKey:b.carrierId,lotId:b.id,lines:[],totalQty:0,totalValue:0};
 e.pos={x:-826.976,y:0,z:16640.233};e.vel={x:0,y:0,z:0};
 const target={x:-502.455,z:16933.436},exit=winnowSteeringTarget(f.owner,e,target);
 const yard=f.state.entityList.find(x=>x.data?.stationId==='station_vesta_outlying_yard');
 const dx=exit.x-yard.pos.x,dz=exit.z-yard.pos.z,d=Math.hypot(dx,dz);
 e.pos={x:exit.x-dx/d*9,y:0,z:exit.z-dz/d*9};e.rot=Math.atan2(dz,dx);
 e.data.civilianReaction='dump_cargo';f.record.civilianReaction='dump_cargo';
 e.data.violenceAlarmed=false;f.record.violenceAlarmed=false;
 stepWinnowRecovery(f.owner,e,f.record);
 assert.equal(e.data.vestaWinnowRecovery.detour.exit,true);
 assert.equal(e.data.intent.brake,false);assert.ok(e.data.intent.moveZ>0);
 // Unnamed ordinary stations must neither alias an absent detour nor throw.
 const unnamed={...yard,id:999999,data:{},pos:{...yard.pos}};
 f.state.entityList=[unnamed];f.state.entities.set(unnamed.id,unnamed);
 delete e.data.vestaWinnowRecovery.detour;
 assert.doesNotThrow(()=>winnowSteeringTarget(f.owner,e,target));
 }finally{f.close();}
});

test('cast and cleanup exemption requires the actual current finite Tann owner',async()=>{
 const {ownsWinnowRecoveryHull,stepWinnowRecovery}=await import('../src/world/vestaWinnowRecovery.js');
 const f=await vestaWinnowRecoveryFixture();try{
 const e=f.tann,b=f.state.traffic.vestaWinnowRecovery.batches[0];
 e.data.vestaWinnowRecovery={batchId:b.id,saved:{persistent:false}};
 e.data.itinerary={kind:'vesta_winnow_recovery',batchId:b.id,destinationStationId:'station_forge'};
 b.carrierId=e.data.worldRecordId;b.phase='collect';
 e.data.cargoManifest={finiteSource:'vesta_winnow_recovery',manifestId:`${b.id}:load`,freighterKey:b.carrierId,lotId:b.id,lines:[],totalQty:0,totalValue:0};
 assert.equal(ownsWinnowRecoveryHull(f.state,e),true);
 for(const corrupt of [()=>e.data.itinerary.batchId='foreign',()=>e.data.itinerary.destinationStationId='foreign',()=>e.data.cargoManifest.finiteSource='foreign',()=>b.carrierId='foreign',()=>b.phase='episode']){
 const route=structuredClone(e.data.itinerary),manifest=structuredClone(e.data.cargoManifest),carrierId=b.carrierId,phase=b.phase;
 corrupt();assert.equal(ownsWinnowRecoveryHull(f.state,e),false);
 const before=JSON.stringify(e),intent=e.data.intent;
 assert.equal(stepWinnowRecovery(f.owner,e,f.record),false);
 assert.equal(JSON.stringify(e),before);assert.equal(e.data.intent,intent);
 e.data.itinerary=route;e.data.cargoManifest=manifest;b.carrierId=carrierId;b.phase=phase;
 }
 const foreign={...e,id:999998,data:{...e.data,namedLaneContactId:'not_tann',ai:{}}};
 f.state.entityList.push(foreign);f.state.entities.set(foreign.id,foreign);
 assert.equal(ownsWinnowRecoveryHull(f.state,foreign),false);
 assert.equal(ownsWinnowRecoveryHull(f.state,e),false,'duplicate world identity fails closed');
 }finally{f.close();}
});

test('actual civilian alarm owns escape until its owner expires it, then recovery resumes',async()=>{
 const {stepWinnowRecovery}=await import('../src/world/vestaWinnowRecovery.js');
 const f=await vestaWinnowRecoveryFixture();try{
 const e=f.tann,b=f.state.traffic.vestaWinnowRecovery.batches[0],rec=f.record;
 e.data.jobId=null;e.data.vestaWinnowRecovery={batchId:b.id,saved:{persistent:true}};
 e.data.itinerary={kind:'vesta_winnow_recovery',batchId:b.id,destinationStationId:'station_forge'};
 b.carrierId=e.data.worldRecordId;b.phase='collect';
 e.data.cargoManifest={finiteSource:'vesta_winnow_recovery',manifestId:`${b.id}:load`,freighterKey:b.carrierId,lotId:b.id,lines:[],totalQty:0,totalValue:0};rec.manifest=e.data.cargoManifest;
 f.owner._recordViolence(e.pos.x+10,e.pos.z,null,null,f.state.simTime);
 assert.equal(f.owner._reactCivilianViolence(e,rec,[],f.state),true);
 assert.equal(e.data.violenceAlarmed,true);assert.equal(e.data.intent.boost,true);
 const escape=structuredClone(e.data.intent);stepWinnowRecovery(f.owner,e,rec);
 assert.deepEqual(e.data.intent,escape,'active actual alarm is not suppressed');
 f.state.simTime+=100;
 assert.equal(f.owner._reactCivilianViolence(e,rec,[],f.state),false);
 assert.equal(e.data.violenceAlarmed,false);assert.equal(rec.violenceAlarmed,false);
 assert.equal(e.data.civilianReaction,'dump_cargo','historical reaction intentionally remains');
 stepWinnowRecovery(f.owner,e,rec);
 assert.equal(e.data.intent.vestaWinnowOwned,true);assert.equal(e.data.intent.boost,false);
 }finally{f.close();}
});

test('waiting area brakes and holds with hysteresis without changing cargo admission',async()=>{
 const {stepWinnowRecovery}=await import('../src/world/vestaWinnowRecovery.js');
 const {resolveCollisionProxyManifest,resolveCorridorAxisWorld,proxyOuterRadiusWu,hullEnvelopeWu}=await import('../src/data/collisionProxyManifests.js');
 const f=await vestaWinnowRecoveryFixture();try{
 const e=f.tann,b=f.state.traffic.vestaWinnowRecovery.batches[0],station=f.state.entityList.find(x=>x.data?.stationId==='station_forge');
 e.data.jobId=null;e.data.civilianReaction=null;f.record.civilianReaction=null;
 e.data.vestaWinnowRecovery={batchId:b.id,saved:{persistent:true}};
 e.data.itinerary={kind:'vesta_winnow_recovery',batchId:b.id,destinationStationId:'station_forge'};b.carrierId=e.data.worldRecordId;b.phase='collect';
 e.data.cargoManifest={finiteSource:'vesta_winnow_recovery',manifestId:`${b.id}:load`,freighterKey:b.carrierId,lotId:b.id,lines:[],totalQty:0,totalValue:0};
 const proxy=resolveCollisionProxyManifest(station),axis=resolveCorridorAxisWorld(station,proxy),radius=proxyOuterRadiusWu(proxy,station)+hullEnvelopeWu(e)+80;
 const waiting={x:station.pos.x+axis.x*radius,z:station.pos.z+axis.z*radius};
 const place=d=>{e.pos={x:waiting.x+axis.x*d,y:0,z:waiting.z+axis.z*d};};
 place(30);e.vel={x:20,y:0,z:0};stepWinnowRecovery(f.owner,e,f.record);
 assert.equal(e.data.vestaWinnowRecovery.waitingHold,true);assert.equal(e.data.intent.brake,true);assert.equal(e.vel.x,20,'intent only, no velocity clamp');
 place(60);stepWinnowRecovery(f.owner,e,f.record);assert.equal(e.data.vestaWinnowRecovery.waitingHold,true);
 place(90);stepWinnowRecovery(f.owner,e,f.record);assert.equal(e.data.vestaWinnowRecovery.waitingHold,undefined);
 assert.equal(winnowRecoveryFacts(f.state,b.id).loose,10);assert.equal(winnowRecoveryFacts(f.state,b.id).aboard,0);
 }finally{f.close();}
});

test('existing worker STATUS hail recalls finite Winnow facts after Continue without a job stamp or reward',async()=>{
 const {contactHailAvailability,createContactHailOffer,createContactHailResponse}=await import('../src/data/contactHail.js');
 const {winnowRecoveryHailLines}=await import('../src/world/vestaWinnowRecovery.js');
 const f=await vestaWinnowRecoveryFixture();try{
 const b=f.state.traffic.vestaWinnowRecovery.batches[0],recordId=f.tann.data.worldRecordId;
 // Presentation fixture only: committed ledger facts, not a movement/settlement proof.
 b.carrierId=recordId;b.phase='delivered';b.pods[0].loose=0;b.pods[0].delivered=2;
 const before=f.save.serialize('hail-before');assert.equal(f.save.loadEnvelope(before),true);
 const e=f.state.entityList.find(x=>x.alive&&x.data?.worldRecordId===recordId);
 assert.equal(e.data.vestaWinnowRecovery,undefined,'durable story does not require active job stamp');
 f.state.player.targetId=e.id;const player=f.state.entities.get(f.state.playerId);player.pos={...e.pos,x:e.pos.x+50};
 const availability=contactHailAvailability(f.state);assert.equal(availability.enabled,true);assert.equal(availability.kind,'worker');
 const offer=createContactHailOffer(f.state,availability,'winnow-hail',f.state.simTime+30);assert.ok(offer.actions.some(x=>x.id==='status'));
 const untouched=JSON.stringify({traffic:f.state.traffic,credits:f.state.player.credits,cargo:f.state.player.cargo,economy:f.state.economy});
 const response=createContactHailResponse(f.state,offer,'status');assert.equal(response.lines.length,3);
 assert.ok(response.lines[0]);assert.match(response.lines[1],/10u original.*Forge accepted 2u.*loose 8u/);
 assert.match(response.lines[2],/0u recovered.*Confirmed lost 0u/);
 assert.deepEqual(createContactHailResponse(f.state,offer,'status').lines,response.lines);
 assert.equal(JSON.stringify({traffic:f.state.traffic,credits:f.state.player.credits,cargo:f.state.player.cargo,economy:f.state.economy}),untouched);
 const old=e.data.worldRecordId;e.data.worldRecordId='foreign';assert.equal(winnowRecoveryHailLines(f.state,e),null);e.data.worldRecordId=old;
 const data=e.data;e.data={...data,jobId:null,jobPhase:null};
 const legacy=contactHailAvailability(f.state);assert.equal(legacy.kind,'trader');
 const legacyOffer=createContactHailOffer(f.state,legacy,'legacy-tann',f.state.simTime+30);
 assert.ok(legacyOffer.actions.some(x=>x.id==='route'));
 assert.match(createContactHailResponse(f.state,legacyOffer,'route').lines[1],/Forge accepted 2u/);
 e.data=data;
 const restored=f.state.traffic.vestaWinnowRecovery.batches[0];restored.phase='collect';
 e.data.vestaWinnowRecovery={batchId:restored.id,saved:{persistent:false}};
 e.data.itinerary={kind:'vesta_winnow_recovery',batchId:restored.id,destinationStationId:'station_forge'};
 e.data.cargoManifest={finiteSource:'vesta_winnow_recovery',manifestId:`${restored.id}:load`,freighterKey:old,lotId:restored.id,lines:[],totalQty:0,totalValue:0};
 f.state.simTime=10;assert.match(winnowRecoveryHailLines(f.state,e).at(-1),/WINNOW NOW · CALM/);
 f.state.simTime=0;assert.match(winnowRecoveryHailLines(f.state,e).at(-1),/WINNOW NOW · GATHER/);
 }finally{f.close();}
});


test('legacy absent/null optional ledger stays absent and malformed finite history refuses restore', async () => {
  const f = await vestaWinnowRecoveryFixture();
  try {
    for (const value of [undefined, null]) {
      const snapshot = structuredClone(f.owner.serialize());
      if (value === undefined) delete snapshot.vestaWinnowRecovery;
      else snapshot.vestaWinnowRecovery = value;
      f.owner.deserialize(snapshot);
      assert.equal(f.state.traffic.vestaWinnowRecovery, null);
    }
    const bad = structuredClone(f.owner.serialize());
    bad.vestaWinnowRecovery = { schema: 'vesta_winnow_recovery_v1', batches: [{}] };
    assert.throws(() => f.owner.deserialize(bad), /Invalid finite Vesta Winnow recovery ledger/);
  } finally { f.close(); }
});

test('the bounded book retains completed episode identities rather than pruning them into fresh sources', () => {
  const state = { world: { currentSectorId: 'sector_vesta_forge' }, traffic: {}, entities: new Map() };
  const ids = [];
  for (let i = 0; i < 24; i++) {
    const id = beginWinnowBatch(state, `actual-episode:${i}`); ids.push(id);
    assert.ok(id); assert.equal(finishWinnowBatch(state, id, 'shift_ended'), true);
  }
  const before = JSON.stringify(state.traffic.vestaWinnowRecovery);
  assert.equal(beginWinnowBatch(state, 'overflow'), null);
  assert.equal(beginWinnowBatch(state, 'actual-episode:0'), ids[0]);
  assert.equal(JSON.stringify(state.traffic.vestaWinnowRecovery), before);
  const replay = { id: 1, alive: true, data: { amount: 2, commodityId: 'cmdty_ore_copper' } };
  state.entities.set(1, replay);
  assert.equal(registerWinnowPod(state, ids[0], replay, 'original-0'), false);
  assert.equal(JSON.stringify(state.traffic.vestaWinnowRecovery), before);
  assert.deepEqual(normalizeWinnowRecovery(state.traffic.vestaWinnowRecovery), state.traffic.vestaWinnowRecovery);
});


test('carrier casualty preserves legal player recovery and one ordinary Forge sale through Continue', async () => {
  const { reconcileWinnowRecovery } = await import('../src/world/vestaWinnowRecovery.js');
  const f = await vestaWinnowRecoveryFixture();
  try {
    const s=f.state,b=s.traffic.vestaWinnowRecovery.batches[0],e=f.tann,recordId=e.data.worldRecordId;
    // Death/custody fixture: stage an admitted empty original carrier, not motion or prior-haul proof.
    b.carrierId=recordId;b.phase='collect';
    e.data.vestaWinnowRecovery={batchId:b.id,saved:{persistent:false}};
    e.data.itinerary={kind:'vesta_winnow_recovery',batchId:b.id,destinationStationId:'station_forge'};
    f.owner._setTrafficManifest(e,f.record,{finiteSource:'vesta_winnow_recovery',manifestId:`${b.id}:load`,freighterKey:recordId,lotId:b.id,lines:[],totalQty:0,totalValue:0});
    for(const pod of f.pods)pod.data.salvorClaimedBy=recordId;
    const notices=[];f.runtime.bus.on('comms:log',p=>{if(p.from==='FORGE TRAFFIC'&&/Tann.*carrier.*lost/i.test(p.text))notices.push(p);});
    const roster=s.entityList;s.entityList=roster.filter(x=>x!==e);
    reconcileWinnowRecovery(f.owner);s.entityList=roster;
    assert.equal(b.phase,'collect','residency absence is not a death');assert.equal(notices.length,0);
    const killed=f.runtime.getSystem('combat').onHit({targetId:e.id,ownerId:null,damage:100000,damageType:'kinetic',pos:{...e.pos}});
    assert.equal(killed.ok,true);assert.ok(e.hull<=0);
    reconcileWinnowRecovery(f.owner);reconcileWinnowRecovery(f.owner);
    assert.equal(b.phase,'carrier_lost');assert.equal(notices.length,1);
    assert.match(notices[0].text,/10u.*loose.*legal salvage.*Forge/i);
    assert.equal(winnowRecoveryFacts(s,b.id).original,10);assert.equal(winnowRecoveryFacts(s,b.id).loose,10);
    assert.ok(f.pods.every(p=>p.data.salvorClaimedBy==null));
    const beforeLegal=JSON.stringify({heat:s.player.heat,rep:Object.fromEntries(Object.entries(s.factions).map(([id,v])=>[id,v.rep])),incidents:s.lawSecurity.reportedIncidents});
    s.player.cargo.capVolume=s.player.cargo.usedVolume+2;
    assert.equal(f.runtime.getSystem('mining')._collectPayload(f.pods[0],s.entities.get(s.playerId)),true);
    let facts=winnowRecoveryFacts(s,b.id);
    assert.equal(facts.original,10);assert.equal(facts.loose,8);assert.equal(facts.playerRecovered,2);assert.equal(facts.playerHeld,2);
    assert.equal(JSON.stringify({heat:s.player.heat,rep:Object.fromEntries(Object.entries(s.factions).map(([id,v])=>[id,v.rep])),incidents:s.lawSecurity.reportedIncidents}),beforeLegal);
    // Dock-context fixture only: exercise the actual Market entry and economy/cargo owners, not arrival.
    const dock=()=>{s.ui.docked=true;s.ui.dockedStationId='station_forge';f.runtime.bus.emit('dock:docked',{stationId:'station_forge'});};
    dock();const economy=f.runtime.getSystem('economy'),stock=()=>s.economy.markets.station_forge.cmdty_ore_copper.stock;
    const creditsBefore=s.player.credits,stockBefore=stock(),opts={intentId:`${b.id}:player-casualty-sale`,sourceStationId:'station_forge',requireFullQuantity:true};
    const sold=economy.handleTrade('cmdty_ore_copper','sell',2,opts);
    assert.equal(sold.ok,true,JSON.stringify(sold));assert.equal(sold.qty,2);assert.ok(sold.total>0);
    assert.equal(s.player.credits,creditsBefore+sold.total);assert.equal(stock(),stockBefore+2);
    facts=winnowRecoveryFacts(s,b.id);assert.equal(facts.original,10);assert.equal(facts.loose,8);assert.equal(facts.playerHeld,0);assert.equal(facts.playerDisposed,2);assert.equal(facts.delivered,0,'player trade is not Tann freight');
    const paidCredits=s.player.credits,paidStock=stock(),paidFacts=structuredClone(facts);
    assert.equal(economy.handleTrade('cmdty_ore_copper','sell',2,opts).duplicate,true);
    assert.equal(s.player.credits,paidCredits);assert.equal(stock(),paidStock);
    assert.equal(f.save.loadEnvelope(f.save.serialize('winnow-casualty-player-sale')),true);
    reconcileWinnowRecovery(f.owner);
    assert.equal(notices.length,1,'durable terminal phase prevents another Continue notice');
    assert.deepEqual(winnowRecoveryFacts(s,b.id),paidFacts);assert.equal(s.player.credits,paidCredits);assert.equal(stock(),paidStock);
    assert.equal(s.entityList.filter(x=>x.alive&&x.hull>0&&x.data?.worldRecordId===recordId).length,0,'actual casualty never revives Tann');
    dock();assert.equal(economy.handleTrade('cmdty_ore_copper','sell',2,opts).duplicate,true);
    assert.equal(s.player.credits,paidCredits);assert.equal(stock(),paidStock);assert.equal(notices.length,1);
  } finally { f.close(); }
});
