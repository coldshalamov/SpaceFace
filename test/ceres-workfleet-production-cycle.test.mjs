import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { CERES_WORKFLEET_CONTRACT as C } from '../src/data/ceresWorkfleet.js';
import {getHeapStatistics as heapStatistics} from 'node:v8';
import {snapshotFeatureMaps,applyFeatureConfigToMaps,restoreFeatureMaps,combatFlag} from '../src/data/featureFlags.js';
import {realPathProof} from '../scripts/lib/bench/realPath.mjs';
const DT=1/60;
function withFeatures(runtime,fn){const prior=snapshotFeatureMaps();applyFeatureConfigToMaps(runtime.config.features);try{return fn();}finally{restoreFeatureMaps(prior);}}
async function prepareNative(runtime){const prior=snapshotFeatureMaps();applyFeatureConfigToMaps(runtime.config.features);try{const result=await runtime.getSystem('physics').prepareBackend(runtime.state);assert.equal(combatFlag('weaponImpulseConsequences'),true);assert.equal(runtime.getSystem('physics')._sg02.captureContactImpacts,true,'production construction captures contact consequences');assert.ok(runtime.getSystem('physics')._sg02._eventQueue,'native event queue must exist before stepping');assert.equal(typeof runtime.getSystem('physics')._sg02._eventQueue.drainContactForceEvents,'function');return result;}finally{restoreFeatureMaps(prior);}}


function productionSourceClosure() {
  const root=new URL('../',import.meta.url),seen=new Map();
  function visit(url) {
    if(!url.pathname.startsWith(root.pathname)||seen.has(url.href))return;
    const source=readFileSync(url,'utf8');seen.set(url.href,createHash('sha256').update(source).digest('hex'));
    for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.{1,2}\/[^'"]+\.(?:js|mjs|json))['"]/g))visit(new URL(match[1],url));
  }
  visit(new URL(import.meta.url));visit(new URL('../src/runtime/createAuthoritativeRuntime.js',import.meta.url));
  visit(new URL('../package.json',import.meta.url));visit(new URL('../package-lock.json',import.meta.url));
  visit(new URL('../scripts/probe-ceres-production-cycle.mjs',import.meta.url));
  const files=Object.fromEntries([...seen].map(([url,hash])=>[new URL(url).pathname.slice(root.pathname.length),hash]).sort(([a],[b])=>a.localeCompare(b)));
  return {hash:createHash('sha256').update(JSON.stringify(files)).digest('hex'),files};
}
test('complete production factory secures the original plate through the full ambient and AI cycle',async()=>{
  const observer={x:C.sitePlacement.pos.x-600,z:C.sitePlacement.pos.z-160,heading:-Math.PI/2};
  const observerRoute=[[-600,-950],[1600,-950],[2200,-950],[2200,-100],[1400,-100],[1400,-950]].map(([x,z])=>({x:x+C.sitePlacement.pos.x,z:z+C.sitePlacement.pos.z}));
  const sources=productionSourceClosure(),runtime=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:48});
  const traceFolder=new URL('../.devshots/ceres-workfleet/',import.meta.url);mkdirSync(traceFolder,{recursive:true});
  const traceFile=new URL('runtime-full-factory-live-samples-v1.jsonl',traceFolder);writeFileSync(traceFile,'');
  const processFile=new URL('runtime-full-factory-process.jsonl',traceFolder),started=Date.now();
  let finished=false,disposed=false,lastNativeCounts={};
  const diagnostic=(event,extra={})=>{
    const n=runtime.getSystem('physics')?._sg02,state=runtime.state;
    if(!disposed)lastNativeCounts={nativeRecords:n?.records.size,nativeBodies:n?.world?.bodies.len(),nativeColliders:n?.world?.colliders.len(),nativeAttachments:n?.attachments.size,pendingRebuilds:n?._pendingNativeRebuilds.size};
    const row={event,at:new Date().toISOString(),elapsedMs:Date.now()-started,pid:process.pid,ppid:process.ppid,
      tick:state.tick,simTime:state.simTime,mode:state.mode,phase:state.npcJobs?.ceresWorkfleet?.phase,
      memory:process.memoryUsage(),heap:heapStatistics(),cpu:process.cpuUsage(),combatQueryScratch:state.combatTable?._hashScratch?.length,fieldCandidateScratch:runtime.getSystem('fields')?._combatTableScratch?.length,entities:state.entities.size,entityList:state.entityList.length,
      disposed,captureContactImpacts:n?.captureContactImpacts,eventQueuePresent:!!n?._eventQueue,...lastNativeCounts,...extra};
    appendFileSync(processFile,JSON.stringify(row)+'\n');console.log('CERES_PROCESS',JSON.stringify(row));
  };
  writeFileSync(new URL('runtime-full-factory-start-v1.json',traceFolder),JSON.stringify({
    schema:'ceres.workfleet.full-production-cycle-start.v1',at:new Date().toISOString(),seed:48,observer,observerRoute,
    maxTicks:85000,oldSpaceBudgetMiB:256,execArgv:process.execArgv,node:process.version,pid:process.pid,sourceClosure:sources,profile:runtime.config.profileId,
    fingerprint:runtime.fingerprint,selectedSlots:runtime.manifest.selectedSlots,
    registry:runtime.manifest.authoritativeUpdateOrder.map(s=>s.name)},null,2)+'\n');
  const onUncaught=(error,origin)=>diagnostic('uncaught-error',{origin,message:error.message,stack:error.stack});
  const onExit=code=>diagnostic('process-exit',{code,finished});
  process.on('uncaughtExceptionMonitor',onUncaught);process.once('exit',onExit);
  diagnostic('start');
  const phases=[],operations=[],events=[],firstEvents=[],samples=[];let lastPhase=null,routeIndex=-1,nativeFailure=null,trackedHardware=null;
  try {
    const state=runtime.state;state.mode='flight';state.ui.screenStack=[];
    const describe=id=>{const e=state.entities.get(id),rec=runtime.getSystem('physics')?._sg02?.records.get(id);return e?{nativeMass:rec?.body.mass(),nativeProxyId:rec?.proxyId,nativeColliderCount:rec?.colliders.length,nativeDynamic:rec?.spec.dynamic,nativeEntityMatches:rec?.entity===e,id:e.id,type:e.type,worldRecordId:e.data?.worldRecordId,role:e.data?.ceresWorkfleetRole,name:e.data?.name,shipId:e.shipId??e.data?.shipId,factionId:e.factionId,team:e.team,spawnContext:e.data?.ai?.spawnContext,mass:e.mass,life:e.occupantGeneration,rot:e.rot,angVel:e.angVel,pos:{...e.pos},vel:{...e.vel}}:{id};};
    for(const event of ['physics:impact','combat:damage','tether:attached','tether:broken','ceresWorkfleet:interrupted'])runtime.bus.on(event,p=>{
      if(![p.targetId,p.attackerId,p.actorId,p.ownerId,p.aId,p.bId].some(id=>{const e=state.entities.get(id);return e?.data?.ceresWorkfleetRole||e?.data?.worldRecordId===C.identities.payload;})&&event!=='ceresWorkfleet:interrupted')return;
      const entry={tick:state.tick,event,p:structuredClone(p),actor:describe(p.attackerId??p.actorId??p.ownerId??p.aId),target:describe(p.targetId??p.bId)};appendFileSync(new URL('runtime-full-factory-events.jsonl',traceFolder),JSON.stringify(entry)+'\n');events.push(entry);if(firstEvents.length<100)firstEvents.push(entry);if(events.length>200)events.shift();
    });
    const player=withFeatures(runtime,()=>runtime.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:state.player,pos:{x:0,z:0}})));state.playerId=player.id;
    const w=runtime.getSystem('world');withFeatures(runtime,()=>w.enterSector(C.sectorId));
    withFeatures(runtime,()=>w.relocatePlayerInSector(observer,{reason:'ceres-workfleet-full-cycle-proof'}));
    const sites=runtime.getSystem('asteroidSites');assert.ok(sites.getWorldSite(C.siteId));
    const original=state.entityList.find(e=>e.alive&&e.data?.worldRecordId===C.identities.payload);assert.ok(original);
    const originalId=original.id,originalLife=original.occupantGeneration;
    assert.equal(await prepareNative(runtime),true);
    runtime.bus.on('worldSite:operationReceipt',p=>{if(p.siteId===C.siteId&&p.receipt?.complete)operations.push({tick:state.tick,operationId:p.operationId,stream:p.receipt.requestStreamId});});
    assert.equal(withFeatures(runtime,()=>sites.applyWorldSiteBeamOperation({siteId:C.siteId,componentId:'long_plate_clamp',verb:'repair',amount:24,
      requestStreamId:'player-industrial-beam',requestSequence:state.tick})).ok,true);
    for(let i=0;i<85000;i++) {
      runtime.step(DT);const phase=state.npcJobs?.ceresWorkfleet?.phase;
      if(original.id!==originalId||original.occupantGeneration!==originalLife||original.data?.worldRecordId!==C.identities.payload||state.world.currentSectorId!==C.sectorId){nativeFailure={kind:'original-life-or-sector-lost',tick:state.tick,id:original.id,life:original.occupantGeneration,worldRecordId:original.data?.worldRecordId,sector:state.world.currentSectorId};break;}
      if(!trackedHardware&&phase==='extract')trackedHardware=state.entityList.filter(e=>e.alive&&e.data?.ceresWorkfleetRole).map(e=>({entity:e,id:e.id,life:e.occupantGeneration,record:e.data.worldRecordId}));
      if(trackedHardware)for(const h of [{entity:original,id:originalId,life:originalLife,record:C.identities.payload},...trackedHardware]){
        const e=h.entity,rec=runtime.getSystem('physics')._sg02.records.get(h.id);
        if(e.id!==h.id||e.occupantGeneration!==h.life||e.data?.worldRecordId!==h.record||!rec||rec.entity!==e){nativeFailure={kind:'coupled-native-life-lost',tick:state.tick,id:h.id,record:h.record};break;}
        const role=e.data.ceresWorkfleetRole,expectedMass=role?C.assets[role].mass:1800,expectedBoxes=role?(C.assets[role].states?.open.boxes||C.assets[role].boxes).length:C.existing.section.boxes.length;
        if(e.mass!==expectedMass||rec.spec.mass!==expectedMass||rec.colliders.length!==expectedBoxes||rec.body.isEnabled()===false){nativeFailure={kind:'coupled-native-shape-or-mass-changed',tick:state.tick,id:e.id,mass:e.mass,nativeMass:rec.spec.mass,colliders:rec.colliders.length,expectedMass,expectedBoxes};break;}
      }
      if(routeIndex<0&&phase==='extract')routeIndex=0;
      if(routeIndex>=0&&(!state.nav.autopilot?.active||state.nav.autopilot?.label!=='Ceres observation route')) {
        withFeatures(runtime,()=>runtime.bus.emit('ui:setCourse',{pos:observerRoute[routeIndex],label:'Ceres observation route',arrivalRadius:36,autopilot:true}));
        routeIndex=routeIndex===observerRoute.length-1?2:routeIndex+1;
      }
      if(state.tick%600===0){samples.push(structuredClone({player:{pos:{...player.pos},vel:{...player.vel},hull:player.hull,alive:player.alive,autopilot:state.nav.autopilot},fields:runtime.getSystem('fields')._kernel.list(),tick:state.tick,phase,section:describe(original.id),hardware:state.entityList.filter(e=>e.alive&&e.data?.ceresWorkfleetRole).map(e=>({...describe(e.id),rot:e.rot,hull:e.hull,nativePresent:runtime.getSystem('physics')._sg02?.records.has(e.id),activity:e.activity,frame:e._flightFrame,nativeForce:runtime.getSystem('physics')._sg02?.records.get(e.id)?.controlForce,control:e.data.controlLease,disabled:e.data.disabled,ai:e.data.ai,intent:e.data.intent})),lines:Object.values(state.combat?.attachments?.byId||{}).filter(a=>[state.npcJobs.ceresWorkfleet.mountId,state.npcJobs.ceresWorkfleet.towId,state.npcJobs.ceresWorkfleet.receiverId].includes(a.id)).map(a=>({...a}))}));appendFileSync(traceFile,JSON.stringify(samples.at(-1))+'\n');}
      if(state.tick%600===0&&['extract','seat','loaded','receiver','unshoe','withdraw','pads','secured'].includes(phase))for(const e of [original,...state.entityList.filter(e=>e.alive&&e.data?.ceresWorkfleetRole)])if(!runtime.getSystem('physics')._sg02.records.has(e.id))nativeFailure={id:e.id,tick:state.tick,role:e.data?.ceresWorkfleetRole,activity:{...e.activity}};
      if(state.tick%6000===0)diagnostic('progress');
      if(state.tick%6000===0)console.log('CERES_FULL_CYCLE_PROGRESS',state.tick,phase,state.npcJobs?.ceresWorkfleet?.blockedReason,JSON.stringify(original.pos));
      if(phase!==lastPhase){phases.push({tick:state.tick,phase});lastPhase=phase;console.log('CERES_FULL_CYCLE_PHASE',state.tick,phase);}
      if(nativeFailure||['secured','player-retained','section-destroyed','worker-disabled','head-disabled'].includes(phase)||state.mode!=='flight')break;
    }
    const job=state.npcJobs?.ceresWorkfleet,payload=sites.getWorldSite(C.siteId)?.payloads.long_plate;
    const bodies=state.entityList.filter(e=>e.alive&&e.data?.ceresWorkfleetRole);
    const receipt={schema:'ceres.workfleet.full-production-cycle.v1',seed:48,observer,observerRoute,nativeFailure,profile:runtime.config.profileId,
      observerDeparture:'real-tow-attached',evidenceClass:runtime.config.evidenceClass,fingerprint:runtime.fingerprint,selectedSlots:runtime.manifest.selectedSlots,
      sourceClosure:sources,sourceUnchanged:productionSourceClosure().hash===sources.hash,
      registry:runtime.manifest.authoritativeUpdateOrder.map(s=>s.name),backend:runtime.getSystem('physics')._diag.backend,captureContactImpacts:runtime.getSystem('physics')._sg02.captureContactImpacts,eventQueuePresent:!!runtime.getSystem('physics')._sg02._eventQueue,realPathProof:realPathProof(runtime),featureScope:'async preparation and all external setup/action/Continue calls use runtime.config.features',
      tick:state.tick,simTime:state.simTime,mode:state.mode,sector:state.world.currentSectorId,originalId,originalLife,phases,operations,firstEvents,events,samples,job:structuredClone(job),payload:structuredClone(payload),
      originalBodyRetained:state.entities.get(originalId)===original&&original.alive&&original.occupantGeneration===originalLife&&original.data?.worldRecordId===C.identities.payload,
      hardware:bodies.map(e=>({id:e.id,worldRecordId:e.data.worldRecordId,role:e.data.ceresWorkfleetRole,mass:e.mass,hull:e.hull,
        pos:{x:e.pos.x,z:e.pos.z},vel:{x:e.vel.x,z:e.vel.z},rot:e.rot,slide:e.data.ceresWorkfleetSlide,blocked:e.data.ceresWorkfleetSlideBlocked,blocker:e.data.ceresWorkfleetSlideBlocker}))};
    const folder=new URL('../.devshots/ceres-workfleet/',import.meta.url);mkdirSync(folder,{recursive:true});
    writeFileSync(new URL('runtime-full-factory-secured-v1.json',folder),JSON.stringify(receipt,null,2)+'\n');
    console.log('CERES_FULL_CYCLE_RESULT',JSON.stringify({tick:receipt.tick,mode:receipt.mode,phase:job?.phase,sourceHash:sources.hash,sourceCount:Object.keys(sources.files).length,sourceUnchanged:receipt.sourceUnchanged,retained:payload?.retained}));
    assert.equal(receipt.nativeFailure,null,JSON.stringify(receipt.nativeFailure));
    assert.equal(receipt.sourceUnchanged,true,'all simulation import owners remain pinned during the independent full cycle');
    assert.equal(job.phase,'secured',JSON.stringify({phases,job,payload,hardware:receipt.hardware}));
    assert.equal(receipt.originalBodyRetained,true);assert.equal(original.mass,1800);assert.equal(bodies.length,3);
    assert.equal(payload.retained.receiverWorldRecordId,C.identities.cradle);assert.equal(payload.status,'released');
    assert.deepEqual(original.data.salvagePool,{});assert.equal(original.data.salvageAction,undefined);
    const beforeContinue={id:original.id,life:original.occupantGeneration,pos:{...original.pos},vel:{...original.vel},rot:original.rot,mass:original.mass};
    const envelope=withFeatures(runtime,()=>runtime.getSystem('save').serialize('ceres-secured-full-factory'));
    assert.equal(withFeatures(runtime,()=>runtime.getSystem('save').loadEnvelope(JSON.parse(JSON.stringify(envelope)),'ceres-secured-full-factory')),true);
    state.mode='flight';state.ui.screenStack=[];assert.equal(await prepareNative(runtime),true);
    const restored=state.entityList.filter(e=>e.alive&&e.data?.worldRecordId===C.identities.payload);
    assert.equal(restored.length,1);const retained=restored[0];assert.equal(retained.mass,1800);
    assert.notEqual(retained.occupantGeneration,beforeContinue.life);
    assert.ok(Math.hypot(retained.pos.x-beforeContinue.pos.x,retained.pos.z-beforeContinue.pos.z)<1e-6,'Continue begins at the measured retained pose');
    const continuedJob=state.npcJobs.ceresWorkfleet,receiver=runtime.getSystem('combat').kernel.attachments.get(continuedJob.receiverId);
    assert.equal(continuedJob.phase,'secured');assert.equal(receiver.state,'active');assert.equal(receiver.targetId,retained.id);
    for(let i=0;i<240;i++)runtime.step(DT);
    assert.ok(Math.hypot(retained.pos.x-C.sitePlacement.pos.x-C.route.receiverPose.x,retained.pos.z-C.sitePlacement.pos.z-C.route.receiverPose.z)<=2);
    assert.equal(retained.mass,1800);assert.equal(sites.getWorldSite(C.siteId).payloads.long_plate.retained.receiverWorldRecordId,C.identities.cradle);
    assert.equal(state.entityList.filter(e=>e.alive&&e.data?.worldRecordId===C.identities.payload).length,1);
    assert.equal(runtime.getSystem('physics')._sg02.records.get(retained.id)?.colliders.length,5);
    receipt.continue={before:beforeContinue,after:{id:retained.id,life:retained.occupantGeneration,pos:{...retained.pos},vel:{...retained.vel},rot:retained.rot,mass:retained.mass},receiverId:receiver.id,phase:continuedJob.phase,tick:state.tick};
    receipt.sourceUnchangedAfterContinue=productionSourceClosure().hash===sources.hash;
    assert.equal(receipt.sourceUnchangedAfterContinue,true);
    writeFileSync(new URL('runtime-full-factory-secured-v1.json',folder),JSON.stringify(receipt,null,2)+'\n');

  }catch(error){diagnostic('test-error',{name:error.name,message:error.message,stack:error.stack});throw error;}finally{finished=true;diagnostic('test-finish');disposed=true;runtime.dispose();process.removeListener('uncaughtExceptionMonitor',onUncaught);}
});

