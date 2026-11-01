import test from 'node:test';
// Current-source regression: queuing is not presentation; an unseen scene may retry.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { firstBuoyReceiptFields, firstBuoyReceivingReceipt, firstBuoyReceivingItem } from '../src/missions/starterBuoyAftermath.js';
import { ceresFurnaceInspectionItem, ceresFurnaceInspectionReceipt } from '../src/missions/ceresFurnaceAftermath.js';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const STEP_REWARD = { 1:520, 2:760, 3:960 };
const mission = (step=1,id=`buoy-${step}`) => ({ id, source:'starterJob', type:'tow_recovery', destStationId:'station_helios', destSectorId:'sector_helios_prime', reward_cr:STEP_REWARD[step] || 520,
 params:{ starterWorkdayVersion:1, starterJobId:'starter_pelican', starterStep:step, requiredModule:'mod_winch_hd', completionMethod:'tow_in' } });
const ms = read('src/systems/missions.js');
const receiptSource = ms.slice(ms.indexOf('export function missionReceiptFor('), ms.indexOf('export const CLEAN_PHYSICAL_RELEASE'));
const receiptFor = Function('firstBuoyReceiptFields','receiptTitle','missionRepDeltaFor','SET_PIECE_MISSION_SOURCE',receiptSource.replace('export ', '')+';return missionReceiptFor;')(firstBuoyReceiptFields,()=> '44-C',()=>0,'authored');
const receipt = (step=1,at_s=100,id=`buoy-${step}`) => receiptFor(mission(step,id),'completed',null,{at_s,rewardCr:STEP_REWARD[step] || 520});
const station = {id:42,alive:true,type:'station',pos:{x:1280,z:-420},data:{stationId:'station_helios'}};
const state = (receipts=[receipt()]) => ({mode:'flight',simTime:110,player:{flags:{}},world:{currentSectorId:'sector_helios_prime'},missions:{receipts}});
const ds = read('src/systems/stationSideEventDirector.js').replace(/^import[^;]+;\n/gm,'').replace(/export default stationSideEventDirector;/,'').replace(/export /g,'');
const deps = {firstBuoyReceivingItem,firstBuoyReceivingReceipt,ceresFurnaceInspectionItem,ceresFurnaceInspectionReceipt,planStationSideEvents:()=>[],rushHourSideEvents:()=>[],SIDE_EVENTS:{},SIDE_EVENT_IDS:[],bubblesFor:()=>({traffic:{radius:100},docking:{radius:20},noFire:{radius:40}}),tableSimAuthorityWuFromState:()=>100,sessionRhythmOf:()=>null,sessionRhythmAllowsCombat:()=>true};
const stationModule = Function(...Object.keys(deps),ds+';return {stationSideEventDirector,ensureState};')(...Object.values(deps));
const director = stationModule.stationSideEventDirector, ensureStationState = stationModule.ensureState;
function fixture(s=state()) {const events=[];const d=Object.create(director);d.state=s;d.bus={emit:(name,p)=>events.push({name,p})};d.helpers={spawnEntity:()=>assert.fail('no physical spawn'),spawnBudget:{request:()=>assert.fail('no budget')}};s.playerId=1;const player={id:1,type:'ship',alive:true,pos:{...station.pos}};s.entities=new Map([[1,player],[station.id,station]]);s.entityIndex={stations:[station]};return {s,d,events};}

test('sector exit before a queued receiving scene fires does not consume the scene',()=>{
 const {s,d,events}=fixture();
 d._planBuoyReceiving(s,station,110);
 d._planBuoyReceiving(s,station,110);
 assert.equal(s.stationSideEvents.pending.length,1);
 assert.equal(events.length,0);
 d._onSectorExit();
 d.update(1,s);
 assert.equal(events.length,1);
 d._onSectorExit();d.update(1,s);
 assert.equal(events.length,1);
});
test('a newer pending settlement supersedes the older queue without duplicating either seam',()=>{
 const {s,d,events}=fixture(state([receipt(1,100)]));
 d._planBuoyReceiving(s,station,110);assert.deepEqual(s.stationSideEvents.pending.map(x=>x.receivingMissionId),['buoy-1']);
 const two=receipt(2,120);s.missions.receipts=[two,receipt(1,100)];
 d._planBuoyReceiving(s,station,130);
 assert.deepEqual(s.stationSideEvents.pending.map(x=>x.receivingMissionId),['buoy-2']);
 assert.equal(events.length,0);s.stationSideEvents.anchorId=String(station.id);s.simTime=130;
 d._pump(s,station,130);assert.equal(events.length,1);assert.equal(events[0].p.receivingMissionId,'buoy-2');
 s.missions.receipts=[receipt(1,100),two,two];d._planBuoyReceiving(s,station,130);
 assert.equal(s.stationSideEvents.pending.length,0);d._pump(s,station,130);assert.equal(events.length,1);
});
test('a shown job never replays when a newer receipt is invalid or the newer queue expires',()=>{
 const {s,d,events}=fixture(state([receipt(1,100)]));d.update(1,s);assert.equal(events.length,1);
 s.simTime=160;s.missions.receipts=[{...receipt(2,150),rewardCr:0},receipt(1,100)];d.update(1,s);
 assert.equal(events.length,1);assert.equal(s.stationSideEvents.pending.length,0);
 s.missions.receipts=[receipt(2,120),receipt(1,100)];s.simTime=301;d.update(1,s);
 assert.equal(events.length,1);assert.equal(s.stationSideEvents.pending.length,0);
});
test('ensureState keeps a valid bounded seen-list allocation-stable and normalizes malformed input once',()=>{
 const valid=state([]);valid.stationSideEvents={buoyReceivingSeenMissionIds:['one','two','three']};
 const stable=valid.stationSideEvents.buoyReceivingSeenMissionIds;
 ensureStationState(valid);assert.strictEqual(valid.stationSideEvents.buoyReceivingSeenMissionIds,stable);
 ensureStationState(valid);assert.strictEqual(valid.stationSideEvents.buoyReceivingSeenMissionIds,stable);
 const malformed=state([]);const external=['old','old','',7,...Array.from({length:12},(_,i)=>`id-${i}`)];
 malformed.stationSideEvents={buoyReceivingSeenMissionIds:external};
 ensureStationState(malformed);const clean=malformed.stationSideEvents.buoyReceivingSeenMissionIds;
 assert.notStrictEqual(clean,external);assert.deepEqual(clean,Array.from({length:10},(_,i)=>`id-${i+2}`));
 ensureStationState(malformed);assert.strictEqual(malformed.stationSideEvents.buoyReceivingSeenMissionIds,clean);
});
test('canonical receipt adds exact successful physical provenance only',()=>{
 const r=receipt();assert.deepEqual(r.starterBuoyRecovery,{version:1,jobId:'starter_pelican',step:1,completionMethod:'tow_in'});
 for(const outcome of ['failed','expired','abandoned']) assert.equal(receiptFor(mission(),outcome).starterBuoyRecovery,undefined);
 for(const step of [1,2,3]) {
  const m=mission(step);assert.deepEqual(firstBuoyReceiptFields(m,'completed').starterBuoyRecovery,
   {version:1,jobId:'starter_pelican',step,completionMethod:'tow_in'});
  m.params.completionMethod='sling_in';assert.equal(firstBuoyReceiptFields(m,'completed').starterBuoyRecovery.completionMethod,'sling_in');
 }
 for(const [key,value] of [['starterStep',0],['starterStep',4],['starterStep','1'],['starterWorkdayVersion',2],['starterWorkdayVersion',undefined],['starterJobId','starter_hitch'],['completionMethod','cut_down'],['requiredModule','mod_drill_amp']]) {const m=mission();m.params[key]=value;assert.deepEqual(firstBuoyReceiptFields(m,'completed'),{});}
 for(const key of ['source','type','destStationId','destSectorId']) {const m=mission();m[key]='wrong';assert.deepEqual(firstBuoyReceiptFields(m,'completed'),{});}
});
test('legacy counter, wrong station, unpaid, missing, malformed and future history cannot manufacture receiving work',()=>{
 const s=state();s.missions={starterJobStep:{starter_pelican:3},completedLog:[{type:'tow_recovery',success:3}]};assert.equal(firstBuoyReceivingReceipt(s,110),null);
 for(const [key,value] of [['rewardCr',0],['rewardCr','520'],['at_s',NaN],['at_s',111],['at_s',-1],['outcome','failed'],['destStationId','station_coalition'],['source','other'],['missionId','']]){const s=state();s.missions.receipts[0][key]=value;assert.equal(firstBuoyReceivingReceipt(s,110),null,key);}
 const far=state();far.world.currentSectorId='sector_ceres_belt';assert.equal(firstBuoyReceivingReceipt(far,110),null);
 assert.equal(firstBuoyReceivingItem(state(),{...station,data:{stationId:'station_coalition'}},110),null);
 assert.equal(firstBuoyReceivingItem(state(),{...station,id:'station_helios',data:{stationId:'station_coalition'}},110),null);
 const capped=state();capped.missions.receipts=Array(10).fill({}).concat(receipt());assert.equal(firstBuoyReceivingReceipt(capped,110),null);
});
test('steps 1–3 select the newest genuine receipt independent of duplicate or reordered history',()=>{
 const one=receipt(1,100),two=receipt(2,125),three=receipt(3,140);
 for(const rows of [[one,two,three],[three,two,one],[two,one,three,three]]) {
  assert.equal(firstBuoyReceivingReceipt(state(rows),150).missionId,'buoy-3');
 }
 const tieZ=receipt(2,140,'buoy-z'),tieA=receipt(3,140,'buoy-a');
 assert.equal(firstBuoyReceivingReceipt(state([tieZ,tieA]),150).missionId,'buoy-a');
 // A pre-extension, already-saved step-1 receipt retains its original schema and scene identity.
 const savedFirst={...receipt(),starterBuoyRecovery:{version:1,jobId:'starter_pelican',step:1,completionMethod:'tow_in'}};
 assert.equal(firstBuoyReceivingReceipt(state([savedFirst]),110),savedFirst);
 assert.equal(firstBuoyReceivingItem(state([savedFirst]),station,110).eventId,'sse:44c-receiving:buoy-1');
 for(const invalid of [
  {...receipt(2),rewardCr:0},
  {...receipt(2),source:'foreign'},
  {...receipt(2),starterBuoyRecovery:{version:1,jobId:'starter_hitch',step:2,completionMethod:'tow_in'}},
  {...receipt(2),starterBuoyRecovery:{version:1,jobId:'starter_pelican',step:4,completionMethod:'tow_in'}},
  {...receipt(3),starterBuoyRecovery:{version:1,jobId:'starter_pelican',step:3,completionMethod:'cut_down'}},
 ]) assert.equal(firstBuoyReceivingReceipt(state([invalid]),160),null);
});
test('settlement produces one visible existing repair scene, zero entities and no economy side effects',()=>{
 const {s,d,events}=fixture();d.update(1,s);d.update(1,s);
 assert.equal(events.length,1);const {name,p}=events[0];assert.equal(name,'station:sideEvent');assert.equal(p.kind,'repair_drone');assert.equal(p.path,'hull-crawl');assert.equal(p.budget,0);assert.deepEqual(p.entityIds,[]);assert.equal(p.durationS,90);assert.equal(p.receivingMissionId,'buoy-1');assert.equal(p.stationId,'42');assert.equal(p.bearing,0);assert.deepEqual(p.from,{x:1320,z:-420});assert.deepEqual(p.to,{x:1322,z:-420});
 assert.equal(p.eventId,'sse:44c-receiving:buoy-1');assert.equal(p.contextLabel,'44-C receiving check — berth intake');
 assert.equal(s.missions.receipts[0].rewardCr,520);assert.equal(s.stationSideEvents.pending.length,0);
});
test('each later authored return reuses the same budget-free crawler/gantry packet once',()=>{
 const {s,d,events}=fixture(state([receipt(1,100)]));
 d.update(1,s);assert.equal(events.length,1);
 s.simTime=140;s.missions.receipts=[receipt(2,130),receipt(1,100)];d.update(1,s);
 assert.equal(events.length,2);
 s.simTime=170;s.missions.receipts=[receipt(3,160),receipt(2,130),receipt(1,100)];d.update(1,s);
 assert.equal(events.length,3);
 for(const [index,stepLabel] of [[0,'44-C'],[1,'Claim-rim'],[2,'Outer-yard']]) {
  const p=events[index].p;
  assert.equal(events[index].name,'station:sideEvent');assert.equal(p.kind,'repair_drone');
  assert.equal(p.path,'hull-crawl');assert.equal(p.budget,0);assert.deepEqual(p.entityIds,[]);
  assert.equal(p.stationId,'42');assert.equal(p.bearing,0);assert.equal(p.durationS,90);
  assert.deepEqual(p.from,{x:1320,z:-420});assert.deepEqual(p.to,{x:1322,z:-420});
  assert.equal(p.receivingMissionId,`buoy-${index+1}`);
  assert.equal(p.eventId,`sse:44c-receiving:buoy-${index+1}`);
  assert.equal(p.contextLabel,`${stepLabel} receiving check — berth intake`);
 }
 assert.deepEqual(s.stationSideEvents.buoyReceivingSeenMissionIds,['buoy-1','buoy-2','buoy-3']);
});
test('visibility, docking and tutorial gates preserve the scene until ordinary flight can show it',()=>{
 for(const blocked of ['dock','tutorial','invisible']) {const {s,d,events}=fixture();if(blocked==='dock')s.player.flags.docked=true;if(blocked==='tutorial')s.onboarding={active:true};if(blocked==='invisible')d._resolveAnchor=()=>null;d.update(1,s);assert.equal(events.length,0);s.player.flags.docked=false;s.onboarding=null;d._resolveAnchor=()=>station;d.update(1,s);assert.equal(events.length,1);}
});
test('ordinary pacing remains; queued scene is revalidated against expiry and receipt eviction',()=>{
 for(const invalid of ['expired','evicted']) {const {s,d,events}=fixture();d._planBuoyReceiving(s,station,110);s.stationSideEvents.anchorId=String(station.id);s.stationSideEvents.nextFireAt=130;d._pump(s,station,110);assert.equal(events.length,0);if(invalid==='expired')s.simTime=280;else s.missions.receipts=[];d._pump(s,station,s.simTime);assert.equal(events.length,0);}
 const {s,d,events}=fixture();d._planBuoyReceiving(s,station,110);s.stationSideEvents.anchorId=String(station.id);d._pump(s,station,270);assert.equal(events[0].p.durationS,10);
});
test('Continue projects ongoing receiving only inside original simulation-time window',()=>{
 const {s,d,events}=fixture();d.update(1,s);d._onSaveLoaded();s.simTime=200;d.update(1,s);assert.equal(events.length,2);assert.equal(events[1].p.durationS,80);d._onSaveLoaded();s.simTime=280;d.update(1,s);assert.equal(events.length,2);
});
test('sector exit cannot multiply a previously shown operation; normal side-events keep their payload',()=>{
 const {s,d,events}=fixture();d.update(1,s);d._onSectorExit();d.update(1,s);assert.equal(events.length,1);
 d._fire(s,station,{eventId:'ordinary',kind:'repair_drone',path:'hull-crawl',budget:0,durationS:90,bearing:0},130);assert.equal(events.length,2);assert.equal(Object.hasOwn(events[1].p,'receivingMissionId'),false);assert.equal(Object.hasOwn(events[1].p,'contextLabel'),false);
});
test('receipt normalization preserves evidence without turning presentation into receipt consumption',()=>{
 const start=ms.indexOf('export function normalizeMissionReceipts('),end=ms.indexOf('function setPieceEpochFrom(',start);
 const normalize=Function('MISSION_RECEIPT_LIMIT',ms.slice(start,end).replace('export ','')+';return normalizeMissionReceipts;')(10);
 assert.deepEqual(normalize(JSON.parse(JSON.stringify([receipt()])))[0].starterBuoyRecovery,receipt().starterBuoyRecovery);
});

// In a full source tree use the real neighbors; the small proof bundle carries exact read-only copies.
function neighbor(path) {try {return read('src/'+path);} catch {return read('evidence/'+path.split('/').at(-1));}}
test('original target physical delivery gates feed canonical receipt; unrelated, remote or unwinched bodies do not',()=>{
 const src=neighbor('systems/missionObjectiveOps.js');
 // Slice individual object methods without evaluating the unrelated objective graph.
 const extract=(name,next,deps)=>Function(...Object.keys(deps),'return ({'+src.slice(src.indexOf('  '+name+'('),src.indexOf('  '+next+'(',src.indexOf('  '+name+'('))).replace(/\n\s*\/\*\*[\s\S]*$/,'')+'});')(...Object.values(deps))[name];
 const completeStart=src.indexOf('  _completePhysical('),completeEnd=src.indexOf('\n  /**',completeStart);
 const complete=Function('isCampaign47aB2Rescue','return ({'+src.slice(completeStart,completeEnd)+'});')(()=>false)._completePhysical;
 const dock=extract('_tryPhysicalDockComplete','_onPhysicalTetherLatched',{AUTHORED_SET_PIECE_TYPE:'authored',shipCarriesModule:(ship,mod)=>ship?.fittings?.includes(mod),activeOwnedShip:s=>s.ship,PHYSICAL_ROLE:{SLAG_CORE:'slag_core'}});
 const latch=extract('_playerLatchedTo','_entityNearDestBerth',{physicalRoleOf:e=>e.data?.physicalRole});
 const near=extract('_entityNearDestBerth','_storyDestStation',{PHYSICAL_BERTH_WU:700});
 const m=mission();m.status='active';m.objectiveTarget=1;m.targetEntityIds=['original'];const core={id:'original',alive:true,pos:{x:1280,z:-420},data:{physicalRole:'slag_core'}};
 const s=state();s.missions.receipts=[];s.ship={fittings:['mod_winch_hd']};s.entities=new Map([['original',core],['unrelated',{...core,id:'unrelated'}]]);s.player.tether={targetId:'original'};
 const ctx={state:s,_playerLatchedTo:latch,_entityNearDestBerth:near,_missionBerthPos:()=>station.pos,_bookExtrasSatisfied:()=>true,_offerSetPieceFollowOn:()=>{},_completePhysical:complete,_completeMission(m){m.status='completed';s.missions.receipts=[receiptFor(m,'completed',null,{at_s:110,rewardCr:520})];}};
 core.pos.x=3000;assert.equal(dock.call(ctx,m,0),false);core.pos.x=1280;s.ship.fittings=[];assert.equal(dock.call(ctx,m,0),false);s.ship.fittings=['mod_winch_hd'];s.player.tether.targetId='unrelated';assert.equal(dock.call(ctx,m,0),false);s.player.tether.targetId='original';assert.equal(dock.call(ctx,m,0),true);assert.equal(m.objectiveProgress,1);assert.equal(firstBuoyReceivingReceipt(s,110).starterBuoyRecovery.completionMethod,'tow_in');
});
test('emitted receiving event drives existing crawler frames and named station gantry, then settles',()=>{
 const v=Function(neighbor('render/stationSideEventVfx.js').replace(/export /g,'')+';return {resolveStationSideEventVfxProfile,writeStationSideEventVfxFrame};')();
 const infra=Function('resolveStationSideEventVfxProfile',neighbor('render/infrastructureMotion.js').replace(/^import[^;]+;\n/gm,'').replace(/export /g,'')+';return createInfrastructureMotionTracker;')(v.resolveStationSideEventVfxProfile)();
 const handlers={};infra.bindEvents({on:(name,fn)=>{handlers[name]=fn;return ()=>delete handlers[name];}});
 const arm={name:'gantry',rotation:{y:0,z:0},position:{x:0,y:0,z:0}};const mesh={children:[arm],userData:{}};
 infra.updateStationMotion(station,mesh,110,1/60);
 const {s,d,events}=fixture();d.bus.emit=(name,p)=>{events.push({name,p});handlers[name]?.(p);};d.update(1,s);
 const p=events[0].p,profile=v.resolveStationSideEventVfxProfile(p.kind);assert.equal(profile.silhouette,'crawler-and-stitch');assert.equal(profile.arm.id,'gantry-slide');
 const frame=t=>v.writeStationSideEventVfxFrame(profile,t,p.durationS,p.from.x,p.from.z,p.to.x,p.to.z,station.pos.x,station.pos.z,p.bearing,false,{});
 assert.notEqual(frame(0).z,frame(3.5).z);assert.equal(infra.stationArmRecord(station.id).eventId,p.eventId);
 infra.updateStationMotion(station,mesh,140,1/60);assert.ok(arm.position.x>0);infra.updateStationMotion(station,mesh,201,1/60);assert.equal(arm.position.x,0);assert.equal(infra.stationArmRecord(station.id).settledS,201);infra.unbindEvents();assert.equal(infra.stationArmRecord(station.id),null);
});
test('canonical completion source pays, records, then cleans target; no invented settlement owner',()=>{
 const start=ms.indexOf("    if (m.params && m.params.starterJobId) {"),end=ms.indexOf("    this._removeActive(m.id, index);",start);
 const body=ms.slice(start,end);const pay=body.indexOf("this.bus.emit('economy:grantCredits'"),record=body.indexOf("this._recordMissionReceipt(m, 'completed'"),cleanup=body.indexOf('this._cleanupTargets(m)');
 assert.ok(pay>=0 && record>pay && cleanup>record);
});
test('dead, absent and recycled station anchors never display the queued receiving scene',()=>{
 for(const invalid of ['dead','absent','recycled']) {
  const {s,d,events}=fixture();d._planBuoyReceiving(s,station,110);
  const anchor={...station,data:{...station.data}};
  if(invalid==='dead')anchor.alive=false;
  if(invalid==='recycled')anchor.data.stationId='station_coalition';
  s.entityIndex.stations=invalid==='absent'?[]:[anchor];d.update(1,s);assert.equal(events.length,0,invalid);
 }
});
