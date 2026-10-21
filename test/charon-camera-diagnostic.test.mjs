import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { charonCameraEnabled, charonCameraPageOperation, captureCharonCameraDiagnostic, runOptionalCharonCameraDiagnostic } from '../scripts/lib/charonCameraDiagnostics.mjs';

const snapshot=(ready=true,missing=false)=>({subjects:[{missing,assetState:ready?'authored':'authored-prepared'}],ready,presentCount:1});
function fakePage({ready=true,missing=false}={}) {
  const calls=[];let count=0;
  return {calls, async evaluate(fn,action){calls.push(action);if(action==='read')return {...snapshot(ready,missing),presentCount:++count};return {};},async screenshot(opts){calls.push('screenshot');assert.ok(opts.timeout<=4000);assert.equal(opts.animations,undefined);}};
}
function fakeOptions(){let clock=0;return {now:()=>clock,sleep:async ms=>{clock+=ms;},mkdirFn:async()=>{},writeFileFn:async()=>{},outputDir:'/tmp/charon-test'};}
test('opt in only, failures isolated',async()=>{
 assert.equal(charonCameraEnabled([]),false);assert.equal(charonCameraEnabled(['--charon-camera-diagnostic']),true);
 let calls=0;await runOptionalCharonCameraDiagnostic({}, {argv:[],capture:async()=>{calls++;}});assert.equal(calls,0);
 const logs=[];assert.equal(await runOptionalCharonCameraDiagnostic({}, {argv:['--charon-camera-diagnostic'],capture:async()=>{throw Error('staging broke');},warn:x=>logs.push(x)}),null);assert.match(logs[0],/staging broke/);
});
test('hook follows all original acceptance and successful log, before cleanup',async()=>{
 const s=await readFile(new URL('../scripts/check-47a-live-cold-open.mjs',import.meta.url),'utf8');
 const hook=s.indexOf('await runOptionalCharonCameraDiagnostic(page)');
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
 assert.equal(r.report.status,'diagnostic-timeout');assert.equal(operations,1);
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
 delete window.__THREE_GAME_DIAGNOSTICS__;assert.deepEqual(charonCameraPageOperation('post'),{available:false,error:null,post:null});
 }finally{delete globalThis.window;}
});
test('post telemetry deadline prevents subsequent screenshot dispatch',async()=>{
 const p=fakePage();let clock=0;const original=p.evaluate;
 p.evaluate=async(fn,action)=>{const result=await original(fn,action);if(action==='post')clock=20001;return result;};
 const r=await captureCharonCameraDiagnostic(p,{...fakeOptions(),now:()=>clock});
 assert.equal(r.report.status,'diagnostic-timeout');assert.equal(p.calls.filter(x=>x==='post').length,1);assert.ok(!p.calls.includes('screenshot'));
});
