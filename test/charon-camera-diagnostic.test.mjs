import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { charonCameraEnabled, charonCameraPageOperation, captureCharonCameraDiagnostic, runOptionalCharonCameraDiagnostic } from '../scripts/lib/charonCameraDiagnostics.mjs';

const snapshot=(ready=true,missing=false)=>({subjects:[{missing,assetState:ready?'authored':'authored-prepared'}],ready,presentCount:1});
function fakePage({ready=true,missing=false}={}) {
  const calls=[];let count=0;
  return {calls, async evaluate(fn,action){calls.push(action);if(action==='read')return {...snapshot(ready,missing),presentCount:++count};return {};},async screenshot(opts){calls.push('screenshot');assert.ok(opts.timeout<=4000);assert.equal(opts.animations,undefined);}};
}
function fakeOptions(){let clock=0;return {budgetMs:20000,now:()=>clock,sleep:async ms=>{clock+=ms;},mkdirFn:async()=>{},writeFileFn:async()=>{},outputDir:'/tmp/charon-test'};}
test('opt in only, failures isolated',async()=>{
 assert.equal(charonCameraEnabled([]),false);assert.equal(charonCameraEnabled(['--charon-camera-diagnostic']),true);
 let calls=0;await runOptionalCharonCameraDiagnostic({}, {argv:[],capture:async()=>{calls++;}});assert.equal(calls,0);
 const logs=[];assert.equal(await runOptionalCharonCameraDiagnostic({}, {argv:['--charon-camera-diagnostic'],capture:async()=>{throw Error('staging broke');},warn:x=>logs.push(x)}),null);assert.match(logs[0],/staging broke/);
});
test('hook follows all original acceptance and successful log, before cleanup',async()=>{
 const s=await readFile(new URL('../scripts/check-47a-live-cold-open.mjs',import.meta.url),'utf8');
 const hook=s.indexOf('await runOptionalCharonCameraDiagnostic(page, { commandDeadline })');
 assert.ok(hook>s.indexOf("assert.deepEqual(issues.errorIssues()"));assert.ok(hook>s.indexOf('console.log(`47-A live cold open OK'));
 assert.ok(hook<s.indexOf('} finally {',hook));
});
test('same-page two views, actual screenshots retain HUD and animations',async()=>{
 const p=fakePage(),r=await captureCharonCameraDiagnostic(p,fakeOptions());
 assert.equal(r.report.status,'authored-subjects-captured-not-visual-acceptance');assert.equal(r.report.screenshots.length,2);
 assert.equal(p.calls[0],'enter');assert.equal(p.calls.filter(x=>x==='frame').length,1);assert.equal(r.report.visualAcceptance,false);
});
test('unresolved authored-prepared state stays unresolved, no forced upgrades',async()=>{
 const p=fakePage({ready:false}),r=await captureCharonCameraDiagnostic(p,fakeOptions());
 assert.equal(r.report.status,'unresolved-assets-captured');assert.equal(r.report.screenshots.length,2);
});
test('absent original subjects are reported, never framed or synthesized',async()=>{
 const p=fakePage({missing:true}),r=await captureCharonCameraDiagnostic(p,fakeOptions());
 assert.equal(r.report.status,'subjects-unavailable');assert.ok(!p.calls.includes('frame'));assert.ok(!p.calls.includes('screenshot'));
});
test('late screenshot mkdir cannot dispatch after diagnostic deadline',async()=>{
 const p=fakePage();let clock=0;
 const r=await captureCharonCameraDiagnostic(p,{...fakeOptions(),budgetMs:1000,now:()=>clock,mkdirFn:async()=>{clock=1001;}});
 assert.equal(r.report.status,'diagnostic-timeout');assert.ok(!p.calls.includes('screenshot'));
});
test('wedged page times out and starts no later page operations',async()=>{
 let operations=0;const p={evaluate:()=>{operations++;return new Promise(()=>{});}};
 const r=await captureCharonCameraDiagnostic(p,{...fakeOptions(),now:()=>Date.now(),budgetMs:30});
 assert.equal(r.report.status,'diagnostic-timeout');assert.ok(operations<=1, 'deadline may expire before first dispatch; never dispatch again');
});
test('wedged report persistence cannot strand browser cleanup',async()=>{
 const p=fakePage({missing:true});const started=Date.now();
 await captureCharonCameraDiagnostic(p,{now:()=>Date.now(),budgetMs:30,mkdirFn:()=>new Promise(()=>{}),writeFileFn:async()=>{}});
 assert.ok(Date.now()-started<500);
});
function stateFixture(status='authored'){
 const make=(id,data,x,z)=>({id,alive:true,occupantGeneration:1,pos:{x,z},radius:2,mesh:{visible:true,userData:{authoredAssetState:status}},data});
 const colony=make(1,{poiId:'poi_colony',sectorId:'sector_charon_expanse',placeId:'place_conveyor_barge'},0,0);
 const hauler=make(2,{activityActorSlotId:'charon_colony_hauler',worldRecordId:'h'},-40,45);
 const cutter=make(3,{activityActorSlotId:'charon_colony_salvor',worldRecordId:'s'},35,-30);
 const pod=make(4,{charonSupplyPod:{id:'charon_colony_air_pod'},activityObjectSlotId:'charon_colony_air_pod',amount:6,commodityId:'cmdty_consumer_goods'},38.8,-53.4);
 const player=make(5,{},100,100),list=[colony,hauler,cutter,pod,player];const calls=[];
 const world={relocatePlayerInSector:(pose,opts)=>{calls.push({pose,opts});return true;}};
 const state={mode:'flight',playerId:5,entityList:list,entities:new Map(list.map(e=>[e.id,e])),traffic:{charonSalvageSupply:{original:6,haulerId:'h',salvorId:'s',pods:[{id:'charon_colony_air_pod',original:6,loose:6}]}},world:{currentSectorId:'sector_charon_expanse'},render:{cameraCtrl:{obj:{fov:50,aspect:16/9},snapToPlayer:()=>true}}};
 globalThis.window={SF:{state,registry:{get:()=>world},bus:{emit:(name,value)=>calls.push({name,value})}}};return {state,calls};
}
test('real identity and asset-specific readiness; owner framing uses measured world positions',()=>{
 try {const {state,calls}=stateFixture();assert.equal(charonCameraPageOperation('read').ready,true);
 state.entityList[1].mesh.userData.authoredAssetState='authored-prepared';assert.equal(charonCameraPageOperation('read').ready,false);
 state.entityList[1].mesh.userData.authoredAssetState='fallback-after-error';assert.equal(charonCameraPageOperation('read').ready,false);
 const before={...state.entityList[4].pos};const framing=charonCameraPageOperation('frame');assert.ok(framing.zoom>=45&&framing.zoom<=330);assert.deepEqual(state.entityList[4].pos,before);
 assert.equal(calls[0].opts.reason,'charon-camera-diagnostic');assert.equal(calls[1].name,'camera:zoom');
 state.entityList[1].data.worldRecordId='replacement';assert.equal(charonCameraPageOperation('read').subjects[1].missing,true);
 assert.throws(()=>charonCameraPageOperation('frame'),/missing or ambiguous/);
 }finally{delete globalThis.window;}
});
test('dominant colony envelope has clear edge candidate; noncolliding FX cannot block it',()=>{
 try {const {state}=stateFixture();state.entityList[0].radius=200;
 const fx={id:6,alive:true,collides:false,pos:{x:0,z:0},radius:10000,data:{}};
 state.entities.set(6,fx);state.entityList.push(fx);
 const framing=charonCameraPageOperation('frame');assert.ok(framing.pose.z < -214);assert.equal(framing.fitClamped,true);
 }finally{delete globalThis.window;}
});
test('nonfinite framing values fail closed before owner mutation',()=>{
 try {const {state,calls}=stateFixture();state.entityList[0].pos.x=NaN;
 assert.throws(()=>charonCameraPageOperation('frame'),/Nonfinite framing/);assert.equal(calls.length,0);
 state.entityList[0].pos.x=0;state.entityList[0].radius=Infinity;
 assert.throws(()=>charonCameraPageOperation('frame'),/Nonfinite subject/);assert.equal(calls.length,0);
 }finally{delete globalThis.window;}
});
test('missing or blocked ledger, duplicate record and mismatched source fail original identity',()=>{
 try {const {state}=stateFixture();const book=state.traffic.charonSalvageSupply;
 state.traffic.charonSalvageSupply=null;assert.equal(charonCameraPageOperation('read').ready,false);
 state.traffic.charonSalvageSupply=book;book.blocked=true;assert.equal(charonCameraPageOperation('read').ready,false);delete book.blocked;
 state.entityList[3].data.amount=5;assert.equal(charonCameraPageOperation('read').subjects[3].missing,true);state.entityList[3].data.amount=6;
 const imposter={...state.entityList[1],id:7,data:{worldRecordId:'h',activityActorSlotId:'other'}};
 state.entities.set(7,imposter);state.entityList.push(imposter);assert.equal(charonCameraPageOperation('read').subjects[1].missing,true);
 }finally{delete globalThis.window;}
});
test('post telemetry queried at most twice, immediately before screenshots, never during polling',async()=>{
 const p=fakePage({ready:false}),r=await captureCharonCameraDiagnostic(p,fakeOptions());
 assert.ok(p.calls.filter(x=>x==='read').length>2);assert.equal(p.calls.filter(x=>x==='post').length,2);
 for(let i=0;i<p.calls.length;i++)if(p.calls[i]==='post')assert.equal(p.calls[i+1],'screenshot');
 assert.equal(r.report.postSamples.length,2);
});
test('cheap reads do not call getReport; post reports absent/failed telemetry honestly',()=>{
 try {const {state}=stateFixture();let calls=0;
 state.render.gpu={renderer:'test-gpu'};state.render.softwareRenderer=true;state.render.dynResScale=.7;
 window.__THREE_GAME_DIAGNOSTICS__={getReport:()=>{calls++;return {post:{effectiveSceneScale:.5,bloom:{contentWidth:640,contentHeight:360}}};}};
 const r=charonCameraPageOperation('read');assert.equal(calls,0);assert.equal(r.dynResScale,.7);assert.equal(r.softwareRenderer,true);assert.equal(r.gpu.renderer,'test-gpu');
 assert.equal(charonCameraPageOperation('post').post.effectiveSceneScale,.5);assert.equal(calls,1);
 window.__THREE_GAME_DIAGNOSTICS__.getReport=()=>{throw Error('telemetry broken');};
 assert.match(charonCameraPageOperation('post').error,/telemetry broken/);
 delete window.__THREE_GAME_DIAGNOSTICS__;assert.deepEqual(charonCameraPageOperation('post'),{boundaryFailures:null,boundaryFailureError:null,available:false,error:null,post:null});
 }finally{delete globalThis.window;}
});
test('post telemetry deadline prevents subsequent screenshot dispatch',async()=>{
 const p=fakePage();let clock=0;const original=p.evaluate;
 p.evaluate=async(fn,action)=>{const result=await original(fn,action);if(action==='post')clock=20001;return result;};
 const r=await captureCharonCameraDiagnostic(p,{...fakeOptions(),now:()=>clock});
 assert.equal(r.report.status,'diagnostic-timeout');assert.equal(p.calls.filter(x=>x==='post').length,1);assert.ok(!p.calls.includes('screenshot'));
});
test('hard-enter admission keeps arrival unchanged and reports unframed captures within original budget',async()=>{
 const p=fakePage({ready:false}),original=p.evaluate;let reads=0;
 p.evaluate=async(fn,action)=>{const r=await original(fn,action);if(action==='read'){reads++;r.transition={pending:true,sectorShellAdmission:true};}return r;};
 const r=await captureCharonCameraDiagnostic(p,fakeOptions());
 assert.equal(r.report.status,'sector-admission-pending-unframed-captured');
 assert.equal(r.report.setup,null);assert.equal(p.calls.includes('frame'),false);
 assert.equal(r.report.screenshots.length,2);assert.ok(reads>2);assert.ok(r.report.elapsedMs<20000);
 assert.equal(r.report.transitionSamples[1].pending,true);
});
test('finished hard-enter admission permits only then the owner relocation',async()=>{
 const p=fakePage(),original=p.evaluate;let reads=0;
 p.evaluate=async(fn,action)=>{const r=await original(fn,action);if(action==='read')r.transition={pending:++reads<3};if(action==='frame')assert.ok(reads>=3);return r;};
 const r=await captureCharonCameraDiagnostic(p,fakeOptions());
 assert.equal(r.report.status,'authored-subjects-captured-not-visual-acceptance');
 assert.equal(p.calls.filter(x=>x==='frame').length,1);
 assert.equal(r.report.transitionSamples[0].pending,true);assert.equal(r.report.transitionSamples[1].pending,false);
});
test('live admission guard rejects camera mutation even when every subject is authored',()=>{
 try {const {state,calls}=stateFixture();state.render.sectorShellAdmission=true;
 let r=charonCameraPageOperation('read');assert.equal(r.ready,false);assert.equal(r.transition.pending,true);
 assert.throws(()=>charonCameraPageOperation('frame'),/admission pending/);assert.equal(calls.length,0);
 state.render.sectorShellAdmission=false;state.render.liveSectorGpuAdmission=true;
 assert.throws(()=>charonCameraPageOperation('frame'),/admission pending/);assert.equal(calls.length,0);
 state.render.liveSectorGpuAdmission=false;assert.equal(charonCameraPageOperation('read').ready,true);
 }finally{delete globalThis.window;}
});
test('missing subject root exposes build evidence without declaring an asset load failure',()=>{
 try {const {state}=stateFixture();const e=state.entityList[0];delete e.mesh;
 e._meshBuildFailures=2;e._meshBuildLastError='sample failure';e.activity={presentationTier:'R1_RUNWAY'};
 state.render.liveSectorFirstFlightIds=new Set([e.id]);
 const r=charonCameraPageOperation('read').subjects[0];
 assert.equal(r.meshPresent,false);assert.equal(r.buildFailures,2);assert.equal(r.buildError,'sample failure');
 assert.equal(r.inFirstFlight,true);assert.equal(r.presentationTier,'R1_RUNWAY');assert.equal(r.noMesh,false);
 }finally{delete globalThis.window;}
});

test('deterministic first dispatch timeout starts exactly once and never schedules a later operation',async()=>{
 let operations=0,clock=0;
 const p={evaluate:()=>{operations++;clock=1001;return new Promise(()=>{});}};
 const r=await captureCharonCameraDiagnostic(p,{...fakeOptions(),now:()=>clock,budgetMs:1000});
 assert.equal(r.report.status,'diagnostic-timeout');assert.equal(operations,1);
});
test('software observation distinguishes hidden prepared boundary from absent mesh and reads activity membership',()=>{
 try {const {state}=stateFixture();const e=state.entityList[0];delete e.mesh;
 const record={state:'preparing',active:true,generation:8,boundary:{visible:false,userData:{authoredAssetState:'loading'}}};
 const world=window.SF.registry.get('world');
 const owner={_sectorBoundaryPreparations:{get:id=>id===e.id?record:null},_reconcileIter:{},_reconcileEpoch:5,
 _firstFlightDeferredHold:true,_postOpeningPipelineAdmissionReleased:false,_authoredSectorPrewarmPendingId:'sector_charon_expanse'};
 window.SF.registry.get=name=>name==='render'?owner:world;
 state.render.softwareRenderer=true;state.render.activityFrame={complete:true,renderGlassIds:new Set([e.id]),renderRunwayIds:[]};
 state.render.firstFlightDeferredHoldUntil=20;state.simTime=2.5;
 let r=charonCameraPageOperation('read');
 assert.equal(r.transition.pending,false);assert.equal(r.transition.reconcileActive,true);
 assert.equal(r.transition.deferredHoldUntil,20);assert.equal(r.transition.simTime,2.5);
 assert.equal(r.subjects[0].meshPresent,false);assert.equal(r.subjects[0].boundaryPreparation.assetState,'loading');
 assert.equal(r.subjects[0].boundaryPreparation.visible,false);assert.equal(r.subjects[0].inActivityGlass,true);
 assert.equal(r.subjects[0].inActivityRunway,false);assert.equal(r.ready,false);
 record.error=new Error('decode failed');assert.equal(charonCameraPageOperation('read').subjects[0].boundaryPreparation.error,'decode failed');
 state.render.sectorBoundaryPrewarm={failures:()=>[{id:e.id,state:'disposed',error:'prior failure'}]};
 assert.equal(charonCameraPageOperation('post').boundaryFailures[0].error,'prior failure');
 }finally{delete globalThis.window;}
});

test('one longer observation stops on real readiness before its 90 second cap',async()=>{
 const p=fakePage({ready:false}),original=p.evaluate;let clock=0;
 p.evaluate=async(fn,action)=>{const r=await original(fn,action);if(action==='read'){r.ready=clock>=30000;r.subjects[0].assetState=r.ready?'authored':'loading';}return r;};
 const opts=fakeOptions();delete opts.budgetMs;
 const r=await captureCharonCameraDiagnostic(p,{...opts,now:()=>clock,sleep:async ms=>{clock+=ms;}});
 assert.equal(r.report.budgetMs,90000);assert.ok(r.report.elapsedMs>=30000&&r.report.elapsedMs<32000);
 assert.equal(r.report.observationStop,'original-subjects-authored');assert.equal(r.report.status,'authored-subjects-captured-not-visual-acceptance');
 assert.equal(p.calls.filter(x=>x==='enter').length,1);assert.equal(p.calls.filter(x=>x==='frame').length,1);
});
test('long observation remains capped and unresolved when authored preparation never finishes',async()=>{
 const p=fakePage({ready:false});const r=await captureCharonCameraDiagnostic(p,{...fakeOptions(),budgetMs:900000});
 assert.equal(r.report.budgetMs,90000);assert.ok(r.report.elapsedMs<90000);
 assert.equal(r.report.observationStop,'readiness-window-exhausted');assert.equal(r.report.status,'unresolved-assets-captured');
 assert.equal(r.report.screenshots.length,2);assert.equal(r.report.visualAcceptance,false);
});
test('source consumed during longer observation is captured honestly without replacement or continued readiness wait',async()=>{
 const p=fakePage({ready:false}),original=p.evaluate;let clock=0;
 p.evaluate=async(fn,action)=>{const r=await original(fn,action);if(action==='read'&&clock>=5000){r.subjects=[{subject:'original-pod',missing:true}];r.ledger={phase:'delivered',pods:[{loose:0,aboard:0,delivered:6,consumed:0}]};}return r;};
 const r=await captureCharonCameraDiagnostic(p,{...fakeOptions(),budgetMs:90000,now:()=>clock,sleep:async ms=>{clock+=ms;}});
 assert.equal(r.report.status,'original-subject-unavailable-captured');assert.equal(r.report.observationStop,'original-subject-unavailable');
 assert.ok(r.report.elapsedMs<7000);assert.equal(r.report.samples[0].ledger.pods[0].delivered,6);
 assert.equal(p.calls.filter(x=>x==='enter').length,1);assert.equal(p.calls.filter(x=>x==='frame').length,1);
});
test('raw gameplay radius and actual mesh scale remain distinct from conservative framing envelope',()=>{
 try {const {state}=stateFixture();const e=state.entityList[0];e.radius=2;
 e.mesh.scale={x:3,y:4,z:5};e.mesh.userData.visualBounds={size:[10,10,10]};
 const r=charonCameraPageOperation('read').subjects[0];
 assert.equal(r.entityRadius,2);assert.deepEqual(r.meshScale,{x:3,y:4,z:5});assert.ok(r.radius>30);
 delete e.mesh;const absent=charonCameraPageOperation('read').subjects[0];assert.equal(absent.entityRadius,2);assert.equal(absent.meshScale,null);
 }finally{delete globalThis.window;}
});

test('nonadvancing presentation never manufactures the second view, even in longer window',async()=>{
 const p=fakePage(),original=p.evaluate;
 p.evaluate=async(fn,action)=>{const r=await original(fn,action);if(action==='read')r.presentCount=7;return r;};
 const r=await captureCharonCameraDiagnostic(p,{...fakeOptions(),budgetMs:90000});
 assert.equal(r.report.status,'diagnostic-timeout');assert.equal(r.report.screenshots.length,1);
 assert.equal(p.calls.filter(x=>x==='screenshot').length,1);assert.ok(r.report.elapsedMs<=90000);
});

test('owner phase and queue observations are bounded raw snapshots without publishing',()=>{
 try {const {state}=stateFixture();const world=window.SF.registry.get('world');
 const timings={decodeMs:12,composeMs:Infinity,secret:'not copied'};
 const boundary={visible:false,userData:{authoredAssetState:'loading',authoredPreparePhase:'awaiting-publication',__admissionPhaseTimings:timings}};
 const jobs=Array.from({length:200},(_,i)=>({sequence:i,entityId:1,slot:'hull',key:'x'.repeat(500),status:i===100?'running':'ready',startedAtMs:10,endedAtMs:i===100?null:20,phases:timings,assetUrls:['not copied']}));
 const diagnostics={activeJobs:1,activeAdmissionSlots:1,jobs,partLoads:jobs};
 const owner={scene:{userData:{authoredUpgradeDiagnostics:diagnostics}},_sectorBoundaryPreparations:{get:id=>id===1?{boundary,state:'preparing'}:null}};
 window.SF.registry.get=name=>name==='render'?owner:world;
 const before=JSON.stringify(diagnostics),r=charonCameraPageOperation('read');
 assert.equal(r.authoredQueue.partLoads[0].slot,'hull');
 assert.equal(r.authoredQueue.jobs.length,16);assert.equal(r.authoredQueue.partLoads.length,16);
 assert.equal(r.authoredQueue.jobs[0].sequence,100);assert.equal(r.authoredQueue.jobs[0].endedAtMs,null);
 assert.equal(r.authoredQueue.jobs[0].key.length,240);assert.equal(r.authoredQueue.jobRecordCount,200);
 assert.equal(r.authoredQueue.jobs[0].assetUrls,undefined);assert.equal(r.authoredQueue.jobs[0].phases.secret,undefined);
 assert.equal(r.authoredQueue.jobs[0].phases.composeMs,null);
 assert.equal(r.subjects[0].boundaryPreparation.preparePhase,'awaiting-publication');
 assert.equal(r.subjects[0].boundaryPreparation.phaseTimings.decodeMs,12);
 assert.equal(boundary.visible,false);assert.equal(JSON.stringify(diagnostics),before);
 delete owner.scene;assert.equal(charonCameraPageOperation('read').authoredQueue,null);
 }finally{delete globalThis.window;}
});

test('existing admission lane reader distinguishes queued blanket hold and tolerates unavailable telemetry',()=>{
 try {const {state}=stateFixture();let calls=0;
 state.render.sampleOpeningCookLane=()=>{calls++;return {upgradeJobs:3,upgradeInFlight:0,upgradeOpeningHeld:true,upgradeFirstFlightHeld:false,upgradeFrameScheduled:false,upgradeRunning:true,secret:'not copied'};};
 const r=charonCameraPageOperation('read');assert.equal(calls,1);
 assert.equal(r.admissionLane.upgradeJobs,3);assert.equal(r.admissionLane.upgradeOpeningHeld,true);
 assert.equal(r.admissionLane.upgradeFirstFlightHeld,false);assert.equal(r.admissionLane.secret,undefined);
 state.render.sampleOpeningCookLane=()=>{throw Error('x'.repeat(500));};
 const failed=charonCameraPageOperation('read');assert.equal(failed.admissionLane,null);assert.equal(failed.admissionLaneError.length,240);
 delete state.render.sampleOpeningCookLane;assert.equal(charonCameraPageOperation('read').admissionLane,null);
 }finally{delete globalThis.window;}
});


test('optional capture uses only remaining command budget and skips late staging without dispatch',async()=>{
 const logs=[];const budgets=[];const opts={argv:['--charon-camera-diagnostic'],now:()=>100000,warn:x=>logs.push(x),log:()=>{},capture:async(page,options)=>{budgets.push(options.budgetMs);return {path:'fixture',report:{status:'captured'}};}};
 await runOptionalCharonCameraDiagnostic({}, {...opts,commandDeadline:180000});assert.deepEqual(budgets,[57500]);
 await runOptionalCharonCameraDiagnostic({}, {...opts,commandDeadline:420000});assert.deepEqual(budgets,[57500,77500]);
 for(const commandDeadline of [121999,110000,90000])assert.equal(await runOptionalCharonCameraDiagnostic({}, {...opts,commandDeadline}),null);
 assert.equal(budgets.length,2);assert.equal(logs.length,3);assert.match(logs[0],/skipped.*minimum useful/);
 await runOptionalCharonCameraDiagnostic({}, {...opts,commandDeadline:122000});assert.equal(budgets.at(-1),12000);
});

test('selected payload metadata follows real URL arrays and slot arrays with bounded immutable snapshots',()=>{
 try {const {state}=stateFixture();const e=state.entityList[0];e.data.trafficRole='salvage_cutter';
 const parts=Array.from({length:20},(_,i)=>`asset-${i}-${'x'.repeat(180)}.glb`);
 const slots=Object.fromEntries(Array.from({length:10},(_,i)=>['slot'+i,parts.slice(0,6)]));
 e.mesh.userData={authoredParts:parts,authoredSlots:slots,renderContract:{wholeShip:true},visualBounds:{center:[1,2,3],size:[3,4,5]}};
 const before=JSON.stringify(e.mesh.userData);const subject=charonCameraPageOperation('read').subjects[0],p=subject.selectedPayload;
 assert.equal(subject.trafficRole,'salvage_cutter');assert.equal(p.authoredParts.length,16);assert.equal(p.authoredPartCount,20);assert.equal(p.authoredPartsTruncated,true);assert.equal(p.authoredParts[0].length,160);
 assert.equal(p.authoredSlots.length,8);assert.equal(p.authoredSlotCount,10);assert.equal(p.authoredSlotsTruncated,true);assert.equal(p.authoredSlots[0].values.length,4);assert.equal(p.authoredSlots[0].count,6);assert.equal(p.authoredSlots[0].truncated,true);
 assert.equal(p.wholeShip,true);assert.deepEqual(p.visualBounds.center,[1,2,3]);assert.deepEqual(p.visualBounds.size,[3,4,5]);assert.equal(JSON.stringify(e.mesh.userData),before);
 e.mesh.userData={renderContract:{authoredParts:['actual.glb'],authoredSlots:{hull:['actual.glb']},wholeShip:false}};
 assert.equal(charonCameraPageOperation('read').subjects[0].selectedPayload.partsSource,'userData.renderContract.authoredParts');
 }finally{delete globalThis.window;}
});

test('VFX attribution uses preallocated shared deadline only after baseline pair, persists separately and preserves verdict',async()=>{
 let clock=1000;const baseline={path:'/tmp/fixture-charon.json',report:{status:'unresolved-assets-captured',screenshots:['a.png','b.png']}};
 const before=JSON.stringify(baseline);const calls=[],writes=[];
 const opts={argv:['--charon-camera-diagnostic'],now:()=>clock,log:()=>{},warn:()=>{},capture:async()=>{clock=78000;return baseline;},isolate:async(page,options)=>{calls.push(options);return {status:'skipped',reason:'fixture',visualAcceptance:false};},persistIsolation:async(path,text)=>writes.push({path,text})};
 const result=await runOptionalCharonCameraDiagnostic({},opts);
 assert.equal(calls[0].deadline,90500);assert.equal(writes[0].path,'/tmp/fixture-charon.vfx-isolation.json');assert.equal(result.report.status,baseline.report.status);assert.equal(JSON.stringify(baseline),before);
 clock=1000;await runOptionalCharonCameraDiagnostic({}, {...opts,commandDeadline:180000});assert.equal(calls[1].deadline,90500);
 clock=1000;await runOptionalCharonCameraDiagnostic({}, {...opts,capture:async()=>({path:'/tmp/x.json',report:{status:'timeout',screenshots:['a.png']}})});assert.equal(calls.length,2);
});
test('VFX attribution failure cannot replace accepted baseline diagnostic result',async()=>{
 const baseline={path:'/tmp/fixture.json',report:{status:'baseline',screenshots:['a','b']}};const warnings=[];
 const result=await runOptionalCharonCameraDiagnostic({}, {argv:['--charon-camera-diagnostic'],capture:async()=>baseline,isolate:async()=>{throw Error('isolation failed');},warn:x=>warnings.push(x),log:()=>{},persistIsolation:async()=>{throw Error('must not write');}});
 assert.equal(result,baseline);assert.match(warnings[0],/isolation failed/);
});

test('VFX persistence is bounded and no write starts after shared deadline',async()=>{
 let clock=1000,writes=0;const baseline={path:'/tmp/fixture.json',report:{status:'baseline',screenshots:['a','b']}};
 const opts={argv:['--charon-camera-diagnostic'],now:()=>clock,log:()=>{},warn:()=>{},capture:async()=>baseline,persistIsolation:async()=>{writes++;}};
 assert.equal(await runOptionalCharonCameraDiagnostic({}, {...opts,isolate:async()=>{clock=92000;return {status:'skipped'};}}),baseline);assert.equal(writes,0);
 clock=1000;assert.equal(await runOptionalCharonCameraDiagnostic({}, {...opts,isolate:async()=>({large:'x'.repeat(65536)})}),baseline);assert.equal(writes,0);
});


test('baseline and full attribution window share the original optional ceiling with no fresh budget',async()=>{
 for(const total of [24500,85140,90000]){
  let clock=1000,baselineBudget,isolations=0;const writes=[];
  const result=await runOptionalCharonCameraDiagnostic({}, {argv:['--charon-camera-diagnostic'],commandDeadline:1000+total+10000,now:()=>clock,log:()=>{},warn:()=>{},
   capture:async(page,{budgetMs})=>{baselineBudget=budgetMs;clock+=budgetMs;return {path:'/tmp/allocation.json',report:{budgetMs,status:'baseline',screenshots:['a','b']}};},
   isolate:async(page,{deadline,maxBudgetMs})=>{isolations++;assert.equal(maxBudgetMs,12000);assert.equal(deadline-clock,12000);clock=deadline;return {status:'diagnostic-pair-captured'};},
   persistIsolation:async(path,text)=>{writes.push(path);clock+=500;},
  });
  assert.equal(baselineBudget,total-12500);assert.equal(result.report.budgetMs,total-12500);assert.equal(isolations,1);assert.equal(writes.length,1);assert.equal(clock,1000+total);
 }
});
test('short optional budget prioritizes baseline and explicitly skips attribution even after early readiness',async()=>{
 let budget,isolations=0;const warnings=[];
 const result=await runOptionalCharonCameraDiagnostic({}, {argv:['--charon-camera-diagnostic'],commandDeadline:34499,now:()=>0,log:()=>{},warn:x=>warnings.push(x),
 capture:async(page,{budgetMs})=>{budget=budgetMs;return {path:'/tmp/short.json',report:{status:'baseline',screenshots:['a','b']}};},
 isolate:async()=>{isolations++;},persistIsolation:async()=>{throw Error('unexpected write');}});
 assert.equal(budget,24499);assert.equal(isolations,0);assert.equal(result.report.status,'baseline');assert.match(warnings[0],/attribution skipped.*full 12s/);
});
test('baseline overrun cannot start attribution with a partial reserved window',async()=>{
 let clock=0,isolations=0;const warnings=[];
 await runOptionalCharonCameraDiagnostic({}, {argv:['--charon-camera-diagnostic'],now:()=>clock,log:()=>{},warn:x=>warnings.push(x),
 capture:async()=>{clock=77501;return {path:'/tmp/late.json',report:{status:'baseline',screenshots:['a','b']}};},
 isolate:async()=>{isolations++;}});
 assert.equal(isolations,0);assert.match(warnings[0],/attribution skipped/);
});

test('initial original cohort appearing after five seconds uses remaining observation budget', async()=>{
 let clock=0;
 const p=fakePage(); const original=p.evaluate;
 p.evaluate=async(fn,action)=>{const r=await original(fn,action);if(action==='read'){
   r.subjects=[{subject:'original-pod',id:4,generation:1,missing:clock<5000,assetState:'authored'}];
   r.ready=clock>=5000;r.originalDiscovery={state:clock<5000?'awaiting-ledger':'observed'};
 }return r;};
 const r=await captureCharonCameraDiagnostic(p,{...fakeOptions(),now:()=>clock,sleep:async ms=>{clock+=ms;}});
 assert.equal(r.report.screenshots.length,2);assert.ok(r.report.elapsedMs>=5000&&r.report.elapsedMs<20000);
 assert.equal(r.report.status,'authored-subjects-captured-not-visual-acceptance');
});
test('never-observed originals remain unverified without consuming capture reserve',async()=>{
 let clock=0;const p=fakePage({missing:true});
 const r=await captureCharonCameraDiagnostic(p,{...fakeOptions(),now:()=>clock,sleep:async ms=>{clock+=ms;}});
 assert.equal(r.report.observationStop,'initial-original-cohort-not-observed');
 assert.ok(clock>=9000&&clock<=9700);assert.ok(!p.calls.includes('frame'));assert.ok(!p.calls.includes('screenshot'));
});
for(const terminal of ['invalid-ledger','source-exhausted'])test(`initial ${terminal} is terminal, not retried`,async()=>{
 const p=fakePage({missing:true});const original=p.evaluate;
 p.evaluate=async(fn,action)=>{const r=await original(fn,action);if(action==='read')r.originalDiscovery={state:terminal};return r;};
 const r=await captureCharonCameraDiagnostic(p,fakeOptions());
 assert.equal(r.report.observationStop,'original-ledger-terminal');assert.equal(r.report.elapsedMs,0);
 assert.equal(p.calls.filter(x=>x==='read').length,1);assert.ok(!p.calls.includes('frame'));
});
test('known original identity replacement stops rather than restarting initial discovery',async()=>{
 let clock=0;const p=fakePage({ready:false});const original=p.evaluate;
 p.evaluate=async(fn,action)=>{const r=await original(fn,action);if(action==='read')r.subjects=[{
   subject:'original-pod',id:clock>=1000?44:4,generation:1,assetState:'loading',worldRecordId:'source',
 }];return r;};
 const r=await captureCharonCameraDiagnostic(p,{...fakeOptions(),now:()=>clock,sleep:async ms=>{clock+=ms;}});
 assert.equal(r.report.observationStop,'original-subject-unavailable');
 assert.equal(r.report.samples[0].subjects[0].identityChanged,true);assert.ok(r.report.elapsedMs<3000);
});
test('initial discovery deadline expiry dispatches no subsequent reads or frame',async()=>{
 let clock=0;const p=fakePage({missing:true});const original=p.evaluate;
 p.evaluate=async(fn,action)=>{const r=await original(fn,action);if(action==='read')clock=20000;return r;};
 const r=await captureCharonCameraDiagnostic(p,{...fakeOptions(),now:()=>clock});
 assert.equal(p.calls.filter(x=>x==='read').length,1);assert.ok(!p.calls.includes('frame'));assert.ok(!p.calls.includes('screenshot'));
 assert.ok(r.report.elapsedMs<=20000);
});
test('absent ledger exposes metadata counts without asserting original identities',()=>{
 try{const{state}=stateFixture();state.traffic.charonSalvageSupply=null;
 window.SF.bus.pendingEmitSliceCount=()=>7;window.SF.bus.pendingPresentationCount=()=>3;
 const r=charonCameraPageOperation('read');
 assert.equal(r.originalDiscovery.state,'awaiting-ledger');assert.equal(r.originalDiscovery.haulerSlotMetadataCount,1);
 assert.equal(r.subjects[1].missing,true);assert.equal(r.originalDiscovery.pendingEmitCount,7);
 assert.match(r.originalDiscovery.evidenceScope,/not original identity proof/);
 state.traffic.charonSalvageSupply={blocked:true};assert.equal(charonCameraPageOperation('read').originalDiscovery.state,'invalid-ledger');
 }finally{delete globalThis.window;}
});

test('partially observed original cannot be replaced while another original is still absent',async()=>{
 let clock=0;const p=fakePage({missing:true});const original=p.evaluate;
 p.evaluate=async(fn,action)=>{const r=await original(fn,action);if(action==='read'){
   r.subjects=[{subject:'original-hauler',id:clock>=600?22:2,generation:1,worldRecordId:'h'},
     {subject:'original-pod',missing:true}];r.originalDiscovery={state:'awaiting-originals'};
 }return r;};
 const r=await captureCharonCameraDiagnostic(p,{...fakeOptions(),now:()=>clock,sleep:async ms=>{clock+=ms;}});
 assert.equal(r.report.observationStop,'original-subject-unavailable');assert.equal(clock,600);assert.ok(!p.calls.includes('frame'));
});
for(const change of ['ledger','epoch','sector'])test(`initial discovery stops on changed ${change} authority`,async()=>{
 let clock=0;const p=fakePage({missing:true});const original=p.evaluate;
 p.evaluate=async(fn,action)=>{const r=await original(fn,action);if(action==='read'){
   r.sectorId=change==='sector'&&clock>=600?'other':'charon';
   r.transition={enterSerial:change==='epoch'&&clock>=600?4:3};
   r.ledger={haulerId:change==='ledger'&&clock>=600?'replacement':'h',salvorId:'s',original:6,pods:[{id:'charon_colony_air_pod'}]};
   r.originalDiscovery={state:'awaiting-originals',ledgerValid:true};
 }return r;};
 const r=await captureCharonCameraDiagnostic(p,{...fakeOptions(),now:()=>clock,sleep:async ms=>{clock+=ms;}});
 assert.equal(r.report.observationStop,'original-subject-unavailable');assert.equal(clock,600);assert.ok(!p.calls.includes('frame'));
});
