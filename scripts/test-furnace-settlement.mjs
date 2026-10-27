// Current-production source projections: no copied positive implementation.
// Default: node --experimental-vm-modules scripts/test-furnace-settlement.mjs
// Settlement additionally extracts actual completion body, receipt helpers, clause settlement,
// and story advancement; presentation/research/rep are explicit non-payout adapters.
// Sparse only: FURNACE_CLAUSES_SOURCE may name the independently pinned clauses source.
// Sparse read-only review overrides: CERES_ROUTE_SOURCE_ROOT, CERES_ROUTE_INTEGRATION_ROOT,
// CERES_ROUTE_AUX_SOURCES (gzip JSON path->pinned source). Not required or used by default CI.
// Explicit adapters: unrelated B7/validation leaves; nav/mission registries; canonical
// Ceres origin + two-sector membership. No native import/browser/pixel claim.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';
const root=new URL('../',import.meta.url);
const explicitRoot=process.env.CERES_ROUTE_SOURCE_ROOT ? new URL('file://'+process.env.CERES_ROUTE_SOURCE_ROOT.replace(/\/$/,'')+'/') : root;
const integrationRoot=process.env.CERES_ROUTE_INTEGRATION_ROOT ? new URL('file://'+process.env.CERES_ROUTE_INTEGRATION_ROOT.replace(/\/$/,'')+'/') : explicitRoot;
const sparse=process.env.CERES_ROUTE_AUX_SOURCES ? JSON.parse(gunzipSync(fs.readFileSync(process.env.CERES_ROUTE_AUX_SOURCES))) : {};
const auxRoots=(process.env.CERES_ROUTE_AUX_ROOTS||'').split(':').filter(Boolean).map(p=>new URL('file://'+p.replace(/\/$/,'')+'/'));
function read(p){const base=p==='src/systems/missions.js'||p==='src/story/campaign47a/embodiedMissions.js'?integrationRoot:explicitRoot;const url=new URL(p,base);if(fs.existsSync(url))return fs.readFileSync(url,'utf8');for(const root of auxRoots){const url=new URL(p,root);if(fs.existsSync(url))return fs.readFileSync(url,'utf8');}if(sparse[p])return sparse[p];throw Error('Missing production source '+url+'; sparse review may explicitly set CERES_ROUTE_AUX_SOURCES');}
const context=vm.createContext({console});const mods=new Map();
const add=(p,s)=>mods.set(p,new vm.SourceTextModule(s,{context,identifier:p}));
for(const p of ['src/story/campaign47a/campaignData.js','src/story/campaign47a/campaignTransitions.js','src/story/campaign47a/campaignSchema.js','src/story/campaign47a/storySpine.js','src/story/campaign47a/campaignIntents.js','src/story/campaign47a/campaignReceipts.js','src/core/rng.js','src/story/campaign47a/embodiedMissions.js'])add(p,read(p));
// Unrelated B7/validation-only dependencies. These are not called by the B1 path.
add('src/story/campaign47a/reckoningCallbacks.js','export function reckoningCallbacks(){throw Error("B7 outside test")}');
add('src/data/missions.js','export const BRANCH_HEADLINE_VERBS={},PQ032_BEAT_SET_PIECES=[],STORY_BEATS=[];');
add('src/story/endings/endingDefs.js','export const ENDING_DEFS=[];');
add('src/missions/furnaceWorksite.js',read('src/missions/furnaceWorksite.js'));
add('src/data/furnace.js',read('src/data/furnace.js'));
add('src/data/sectorCoordinates.js',"export function sectorLocalToGlobalForSector(p,s){if(s!=='sector_ceres_belt')throw Error(s);return {x:p.x-12288,z:p.z+8192}} export function sectorMembershipAtGlobal(p){return p.x>8000?'sector_tethys_junction':'sector_ceres_belt'}");
for(const p of ['src/missions/cinderRoute.js','src/characters/rookRules.js','src/data/rook.js'])add(p,read(p));
// B1 never enters Cinder's zone path. Fail loudly rather than fake a positive route.
add('src/data/sectorZones.js','export function zonesForSector(){throw Error("Cinder zones outside B1 regression")}');
const production=read('src/systems/missions.js');
function method(name){const at=production.indexOf('  '+name+'(');if(at<0)throw Error(name);const end=production.indexOf('\n  },',at);return production.slice(at,end+5);}
add('src/systems/routeProjection.js',`import { cinderRouteFocus } from '../missions/cinderRoute.js';
import { furnaceWorksiteFocus } from '../missions/furnaceWorksite.js';
const TYPE_BY_ID=new Map([['patrol_clear',{}]]),SECTOR_BY_ID=new Map([['sector_ceres_belt',{name:'Ceres Belt'}]]),STATION_INFO=new Map([['station_ceres',{name:'Ceres Refinery'}]]);
const BULK_HAUL_TYPE='bulk_haul',PQ019C_HEIST_TYPE='heist',BREAKAWAY_RECOVERY_TYPE='breakaway',COUNTERWEIGHT_WATCH_TYPE='counterweight',SPLIT_MANIFEST_TYPE='split',QUIET_BERTH_TYPE='quiet',PHYSICAL_TYPE_SET=new Set();const setPieceCauseOf=()=>false,deferredEnterNow=s=>s.simTime,missionNavReason=()=> 'station fallback';
export const ops={${['_instanceFromOffer','_objectiveTarget','_typeSpawnsTargets','_missionWaypoint'].map(method).join('\n')}};`);

add('src/missions/furnaceWorksiteRuntime.js',read('src/missions/furnaceWorksiteRuntime.js'));
add('src/core/sectorEnterDefer.js','export function deferSectorEnterMaterialization(){return false}');
add('src/systems/furnaceIntake.js',read('src/systems/furnaceIntake.js'));
const objective=read('src/systems/missionObjectiveOps.js'), storyOps=read('src/systems/missionStoryOps.js');
function fromSource(source,name){const at=source.indexOf('  '+name+'(');const end=source.indexOf('\n  },',at);if(at<0||end<0)throw Error(name);return source.slice(at,end+5);}
const clauseSource=fs.readFileSync(process.env.FURNACE_CLAUSES_SOURCE || new URL('src/data/contractClauses.js',explicitRoot),'utf8');
const clause=clauseSource.slice(clauseSource.indexOf('export function settleContractClauses'),clauseSource.indexOf('/**',clauseSource.indexOf('export function settleContractClauses')));
const receipts=production.slice(production.indexOf('export function normalizeMissionReceipts'),production.indexOf('export const CLEAN_PHYSICAL_RELEASE'));
const cleanup=storyOps.slice(storyOps.indexOf('  _cleanupTargets(m) {'),storyOps.indexOf('    // Capital boss contracts',storyOps.indexOf('  _cleanupTargets(m) {')))+'},';
add('src/systems/completionProjection.js',`import { authoredCinderRoute, observeCinderKill, cinderExtrasSatisfied, retainCinderRetry } from '../missions/cinderRoute.js';
import { prepareFurnaceSettlement, recordFurnaceAftermathFact, retireFurnaceWorksite } from '../missions/furnaceWorksiteRuntime.js';
import { furnaceDetail, authoredFurnaceWorksite, furnaceAccounting, isFurnaceOwnedLot, furnaceLots, furnaceReceiptMatches } from '../missions/furnaceWorksite.js';
import { CAMPAIGN_BEATS, CAMPAIGN_BEATS as STORY_BEATS } from '../story/campaign47a/campaignData.js';
import { recordBeatStep,isBeatStepsComplete,completeBeatStepsForLegacy } from '../story/campaign47a/campaignTransitions.js';
const CONTRACT_47A_B0_TAG='b0',CONTRACT_47A_B1_TAG='b1legacy',CONTRACT_47A_B2_TAG='b2legacy',CONTRACT_47A_B3_TAG='b3legacy';
const contractTermById=()=>{throw Error('No authored furnace clauses expected')},coldburnDeliveryBonus=()=>0,noteStandingOrderCompletion=()=>{},setPieceEventFields=()=>({}),CLAUSE_HONOR_RP=0,clauseGambitMeta=()=>null,isZeroPayLandmarkMission=()=>false;
const MISSION_RECEIPT_LIMIT=10,SET_PIECE_MISSIONS=[],SET_PIECE_MISSION_SOURCE='setPiece',MISSION_TUNING={BASE_REP:{patrol_clear:5}},round=Math.round,WARM_CARGO_CONTRACT={source:'warmCargo'},isShortageGateRepair=()=>false;
${clause}\n${receipts}\nexport const ops={${['_completeMission','_completeMissionBody','_dropSettledRow','_settleOptional','_recordMissionReceipt'].map(method).join('\n')}\n${['_onKill','_onFurnaceFed','_bookExtrasSatisfied'].map(n=>fromSource(objective,n)).join('\n')}\n${fromSource(storyOps,'_advanceEmbodiedStoryMission')}\n${cleanup}};`);
const resolve=(name,ref)=>{const parts=ref.identifier.split('/');parts.pop();for(const p of name.split('/')){if(p==='..')parts.pop();else if(p!=='.')parts.push(p)}const id=parts.join('/');if(!mods.has(id))add(id,read(id));return mods.get(id);};
for(const m of mods.values())if(m.status==='unlinked')await m.link(resolve);for(const m of mods.values())if(m.status==='linked')await m.evaluate();
const trans=mods.get('src/story/campaign47a/campaignTransitions.js').namespace;const builder=mods.get('src/story/campaign47a/embodiedMissions.js').namespace;const ops=mods.get('src/systems/routeProjection.js').namespace.ops;
const state={run:{kind:'adventure'},story:{beatIndex:1,flags:{}},missions:{nextId:1,active:[]},world:{currentSectorId:'sector_tethys_junction'},entities:new Map(),entityList:[],simTime:10};
trans.initCampaignSidecar(state,0);
assert.equal(builder.buildMissionBoardContract(1,{state}).storyTag,'campaign47a:b1:alloy_run');
assert.equal(trans.recordBeatStep(state,'mission:completed',{storyTag:'campaign47a:b1:alloy_run'},1).ok,true);
assert.equal(builder.buildMissionBoardContract(1,{state}),null);
assert.equal(trans.recordBeatStep(state,'kesslerPod:weighed',{variance:true},2).ok,true);
const offer=builder.buildMissionBoardContract(1,{state});assert.equal(offer.storyTag,'campaign47a:b1:infested');assert.equal(offer.params.furnaceWorksiteVersion,1);assert.equal(offer.params.clearCount,4);assert.equal(offer.stationId,'station_tethys');assert.equal(offer.destSectorId,'sector_ceres_belt');assert.equal(offer.reward_cr,480);
const owner={...ops,state};const m=owner._instanceFromOffer(offer);state.missions.active=[m];assert.equal(m.objectiveTarget,4);assert.equal(m.needsTargets,true);assert.equal(m.params.furnaceWorksiteVersion,1);assert.notEqual(m.params,offer.params);
let nav=owner._missionWaypoint(m);assert.equal(nav.stationId,null);assert.equal(nav.sectorId,'sector_ceres_belt');assert.deepEqual({...nav.pos},{x:1880-12288,z:1810+8192});assert.match(nav.label,/repair-mite/);
const mite={id:9,type:'fauna',alive:true,pos:{x:-10600,z:9900},data:{ecology:{speciesId:'suture_mite',faunaKey:'closed_refinery:suture_mite:1'}}};state.entityList=[mite];state.entities.set(9,mite);state.world.currentSectorId='sector_ceres_belt';nav=owner._missionWaypoint(m);assert.equal(nav.targetEntityId,9);assert.deepEqual({...nav.pos},mite.pos);
m.objectiveProgress=4;nav=owner._missionWaypoint(m);assert.match(nav.label,/disposal pods/);assert.equal(m.params.furnaceLots.length,3);const pod={id:10,alive:true,pos:{x:-10000,z:9800},flags:{tethered:true}};m.params.furnaceLots[0].entityId=10;state.entities.set(10,pod);nav=owner._missionWaypoint(m);assert.equal(nav.targetEntityId,null);assert.deepEqual({...nav.pos},{x:-10808,z:9832});
assert.equal(trans.recordBeatStep(state,'mission:completed',{storyTag:m.storyTag,rewardCr:0,furnaceOutcome:'clearance_only_cargo_lost'},3).stepsComplete,true);
assert.equal(builder.buildMissionBoardContract(1,{state}),null);
console.log('PASS actual B1 builder: alloy -> world Scale4 gate -> version1 clear4 furnace offer -> actual instance params/target -> actual nav Ceres worksite/fauna/pod/held-ring; real step recorder accepts zero-pay completed story and no repeat offer. Projections/adapters as declared; no native/browser claim.');

const completion=mods.get('src/systems/completionProjection.js').namespace.ops,run=mods.get('src/missions/furnaceWorksiteRuntime.js').namespace,intake=mods.get('src/systems/furnaceIntake.js').namespace;
for(let delivered=0;delivered<=3;delivered++){
 const state={story:{beatIndex:1,flags:{}},missions:{nextId:1,active:[],receipts:[]},world:{currentSectorId:'sector_ceres_belt'},entities:new Map(),entityList:[],player:{stats:{}},playerId:'pilot',simTime:30};
 trans.initCampaignSidecar(state,0);trans.recordBeatStep(state,'mission:completed',{storyTag:'campaign47a:b1:alloy_run'},1);trans.recordBeatStep(state,'kesslerPod:weighed',{variance:true},2);
 const events=[],listeners=new Map();const bus={on(k,f){const xs=listeners.get(k)||[];xs.push(f);listeners.set(k,xs);return()=>{}},emit(k,p){events.push([k,p]);for(const f of listeners.get(k)||[])f(p)}};let id=100;
 const helpers={spawnEntity(spec){const e={...structuredClone(spec),id:id++,alive:true};state.entities.set(e.id,e);state.entityList.push(e);return e},removeEntity(id){const e=state.entities.get(id);if(e)e.alive=false;state.entities.delete(id)}};
 const noop=()=>{};const owner={...ops,...completion,state,bus,helpers,_bookExtrasSatisfied:completion._bookExtrasSatisfied,_refuseTurnInIfBlocked:()=>false,_compileSetPieceTransition:()=>null,_clearMissionNav:noop,_grantCappedResearchContract:()=>0,_grantCareerContractResearch:()=>0,_logCompletion:noop,_boardSetPieceTransition:noop,_completeContract47aB4Intro:noop,_resolveContract47aB4Doubled:noop,_advanceStoryChain:noop,_completeContract47aB7Operation:noop,_emitMissionDebrief:noop,_refreshTrackedMissionNav:noop,_sayStoryLine:noop,_voidLostBountyTargets:noop,_ensureCampaignSidecar:noop,_advanceStory(beat,opts){assert.equal(opts.skipCredits,true);state.story.beatIndex=beat.next},_removeActive(mid){state.missions.active=state.missions.active.filter(x=>x.id!==mid)}};
 const m=owner._instanceFromOffer(builder.buildMissionBoardContract(1,{state}));state.missions.active=[m];bus.on('furnace:fed',p=>owner._onFurnaceFed(p));bus.on('entity:killed',p=>owner._onKill(p));run.syncFurnaceWorksite(owner,m);const pods=state.entityList.filter(e=>e.type==='payload');const furnace=intake.createFurnaceIntake();furnace.init({state,bus,helpers});
 for(let i=0;i<delivered;i++){pods[i].pos={x:-10808,z:9832};furnace.update()}
 for(let i=delivered;i<3;i++){pods[i].alive=false;bus.emit('entity:killed',{id:pods[i].id,killerId:'npc'})}
 assert.equal(m.status,'active');assert.equal(events.filter(([k])=>k==='economy:grantCredits').length,0);
 state.world.alienEcology={sites:{closed_refinery:{deadFauna:Object.fromEntries([0,1,2,3].map(i=>['closed_refinery:suture_mite:'+i,true]))}}};run.syncFurnaceWorksite(owner,m);
 for(const p of pods)bus.emit('entity:killed',{id:p.id,killerId:'npc'});owner._completeMission(m,0);run.syncFurnaceWorksite(owner,m);
 assert.equal(m.status,'completed');assert.equal(state.missions.active.length,0);assert.equal(m.params.furnaceFeeds,delivered);assert.equal(m.params.furnaceLosses,3-delivered);assert.equal(state.missions.receipts.length,1);assert.equal(state.missions.receipts[0].rewardCr,160*delivered);assert.equal(events.filter(([k])=>k==='economy:grantCredits').reduce((a,[k,p])=>a+p.amount,0),160*delivered);assert.equal(events.filter(([k])=>k==='mission:completed').length,1);assert.equal(state.story.beatIndex,2);assert.equal(state.missions.furnaceWorksiteAftermath.lots.length,3);if(delivered<3)assert.match(state.missions.receipts[0].title,/lost/);
 console.log('PASS actual completion body/receipt/clauses/story projection:',delivered,'received;',3-delivered,'lost;',160*delivered,'credits once');
}
