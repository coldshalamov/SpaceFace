// Current production-owner composition. Defaults read this repo, never copied positive code.
// Sparse review: repeat --aux-root <independently pinned source root> for omitted dependencies.
// Explicit adapters cover engine/entity creation, ship fittings, unrelated mission kinds and
// presentation. Actual offer/spawn/slot/kill/marker/sale/receipt/story/save code is evaluated.
// This is not a browser, native physics, full-registry or exact-head full-import-graph claim.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const roots = [root];
for (let i = 2; i < process.argv.length; i++) if (process.argv[i] === '--aux-root') roots.push(path.resolve(process.argv[++i]));
const { loadClearanceGeometry } = await import(pathToFileURL(path.join(root, 'scripts/compost-clearance-geometry.mjs')).href);
const clearanceGeometry = await loadClearanceGeometry({ root, auxRoots: roots.slice(1) });
const inventory = new Map();
function read(name) {
  const file = roots.map(r => path.join(r, name)).find(f => fs.existsSync(f));
  assert.ok(file, `Missing CURRENT source ${name}; sparse review must explicitly supply --aux-root`);
  const bytes = fs.readFileSync(file);
  inventory.set(name, { file, sha256: createHash('sha256').update(bytes).digest('hex'),
    gitBlob: createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`),bytes])).digest('hex') });
  return bytes.toString('utf8').replace(/\r\n/g, '\n');
}
const strip = source => source.replace(/^import[\s\S]*?;\n/gm, '')
  .replace(/\bexport\s+(?=(const|function|class))/g, '').replace(/^export default .*;$/gm, '');
function method(source, name) {
  const start = Math.max(source.indexOf(`  ${name}(`), source.indexOf(`  *${name}(`)), end = source.indexOf('\n  },', start);
  assert.ok(start >= 0 && end > start, `Current method missing: ${name}`);
  return source.slice(start, end + 5);
}
function fn(source, name) {
  const start = source.indexOf(`function ${name}(`), end = source.indexOf('\n}', start);
  assert.ok(start >= 0 && end > start, `Current function missing: ${name}`);
  return source.slice(start, end + 2);
}
const context = vm.createContext({ console }), modules = new Map();
const add = (name, source) => modules.set(name, new vm.SourceTextModule(source, { context, identifier: name }));
const real = name => add(name, read(name));
for (const name of ['src/missions/cinderRoute.js', 'src/characters/rookRules.js', 'src/systems/rookBooth.js', 'src/data/rook.js',
  'src/data/storySpine.js', 'src/data/sectorCoordinates.js', 'src/core/coordinates.js', 'src/data/sectorZones.js', 'src/core/rng.js',
  'src/combat/rewardEligibility.js', 'src/story/campaign47a/campaignData.js', 'src/story/campaign47a/campaignTransitions.js',
  'src/story/campaign47a/campaignSchema.js', 'src/story/campaign47a/storySpine.js', 'src/story/campaign47a/campaignIntents.js',
  'src/story/campaign47a/campaignReceipts.js', 'src/story/campaign47a/embodiedMissions.js', 'src/data/enemies.js',
  'src/data/understoryReceiver.js', 'src/data/factions/understory.js', 'src/systems/faction_understory.js',
  'src/data/nestVisit.js', 'src/combat/impulseKernel.js']) real(name);
// The Rook Booth market (cc96d0cdc9c) reads lawful station ownership and the WANTED flag. The
// faction index and its kits are import-free data, so they load whole; heat.js drags the whole
// heat system's graph, so only its real `isPlayerWanted` + threshold are projected from source.
for (const kit of ['index', 'scn', 'mts', 'dmc', 'reach', 'quiet', 'vael', 'free', 'choir', 'helix',
  'fulfillment', 'archive', 'pitborn', 'vergelayers']) real(`src/data/factions/${kit}.js`);
{
  const heatSource = read('src/systems/heat.js');
  const threshold = heatSource.match(/^const WANTED_THRESHOLD = [^;]+;/m);
  assert.ok(threshold, 'Current heat.js WANTED_THRESHOLD missing');
  add('src/systems/heat.js', `${threshold[0]}\nexport ${fn(heatSource, 'isPlayerWanted')}\n`);
}
// Existing geometry owners are projected by the shared thin-review loader, never fake-clearance ports.
for (const [name, exports] of Object.entries({
  'src/data/collisionProxyManifests.js': ['hullEnvelopeWu', 'proxyOuterRadiusWu', 'COLLISION_PROXY_MANIFESTS'],
  'src/data/modelTruth.js': ['modelTruthProxyManifest'],
    'src/data/physicsMaterials.js': ['PHYSICS_MATERIALS'],
  'src/core/physicsAuthority.js': ['shouldSyncPhysicsBodyEntity', 'substanceFor'],
})) modules.set(name, new vm.SyntheticModule(exports, function () {
  for (const key of exports) { assert.equal(typeof clearanceGeometry[key] !== 'undefined', true, `Actual geometry export ${key}`); this.setExport(key, clearanceGeometry[key]); }
}, { context, identifier: name }));
add('src/data/frontierRegions/index.js', 'export const FRONTIER_ORIGINS={}, FRONTIER_SECTOR_IDS=[], FRONTIER_ZONES={};');
add('src/data/theBolus.js', 'export const BOLUS_ZONES={};');
add('src/data/authoredPlaces.js', 'export const ZONE_CERES_THROUGHLINE={center:{x:0,z:0}}; export const appendAuthoredZones=x=>x;');
add('src/data/userContent.js', 'export const userContentCandidates=()=>[],claimUserContentId=()=>false,acceptUserContent=()=>{},rejectUserContent=()=>{};');
// Materialization stays immediate (adapter); the Rook Booth's clock read is the real function.
add('src/core/sectorEnterDefer.js', 'export const deferSectorEnterMaterialization=()=>false;\n'
  + `export ${fn(read('src/core/sectorEnterDefer.js'), 'deferredEnterNow')}\n`);
add('src/story/campaign47a/reckoningCallbacks.js', 'export function reckoningCallbacks(){throw Error("B7 outside Cinder test")}');
add('src/data/missions.js', 'export const BRANCH_HEADLINE_VERBS={},PQ032_BEAT_SET_PIECES=[],STORY_BEATS=[];');
add('src/story/endings/endingDefs.js', 'export const ENDING_DEFS=[];');
for (const [file, name] of [['lastArgument','LAST_ARGUMENT_ENEMY'],['kilnback','KILNBACK_ENEMY'],['mothlight','MOTH_ENEMY'],['palletJack','PALLET_JACK_ENEMY']])
  add(`src/data/${file}.js`, `export const ${name}={id:'unrelated_${file}'};`);
for (const mod of modules.values()) if (mod.status === 'unlinked') await mod.link((name, ref) => {
  const id = path.posix.normalize(path.posix.join(path.posix.dirname(ref.identifier), name));
  assert.ok(modules.has(id), `Undeclared module port ${id}`); return modules.get(id);
});
for (const mod of modules.values()) if (mod.status === 'linked') await mod.evaluate();
const ns = name => modules.get(name).namespace;
const route = ns('src/missions/cinderRoute.js'), builder = ns('src/story/campaign47a/embodiedMissions.js');
const trans = ns('src/story/campaign47a/campaignTransitions.js'), canon = ns('src/story/campaign47a/campaignData.js');
const coords = ns('src/data/sectorCoordinates.js'), zones = ns('src/data/sectorZones.js'), rng = ns('src/core/rng.js');
const rook = ns('src/systems/rookBooth.js'), rules = ns('src/characters/rookRules.js');
const source = read('src/systems/missions.js'), spawning = read('src/systems/missionSpawningOps.js');
const objective = read('src/systems/missionObjectiveOps.js'), story = read('src/systems/missionStoryOps.js');
const aftermath = read('src/systems/aftermathWrecks.js'), combat = read('src/systems/combat.js');
const worldRecords = read('src/world/worldRecords.js'), clauses = read('src/data/contractClauses.js');
const bounty = read('src/data/bountyMarks.js');
const damageSource = read('src/combat/damage.js'), miningSource = read('src/systems/mining.js');
const noop = () => {}, no = () => false, plain = value => JSON.parse(JSON.stringify(value));
const stations = new Map([
  ['station_tethys', { name: 'Tethys Junction', sectorId: 'sector_tethys_junction' }],
  ['station_expanse', { name: 'Expanse Refinery', sectorId: 'sector_charon_expanse' }],
  ['station_ceres', { name: 'Ceres Refinery', sectorId: 'sector_ceres_belt' }],
]);
const sectors = new Map(['sector_tethys_junction','sector_charon_expanse','sector_ceres_belt'].map(id => [id,{name:id,enemyLevel:[2,4]}]));
const mc = vm.createContext({ console, ...route, ...builder, ...trans, ...coords, ...rng,
  ...ns('src/data/understoryReceiver.js'), ...ns('src/data/factions/understory.js'),
  ...ns('src/data/storySpine.js'),...ns('src/story/campaign47a/campaignSchema.js'),
  resetRacingGhostSession:noop,restoreFurnaceAftermath:noop, normalizeBlackFlagJobs:()=>null,normalizeStandingOrders:()=>[],ADVENTURE_SPEED_CONTRACTS:[],
  CAMPAIGN_BEATS: canon.CAMPAIGN_BEATS, STORY_BEATS: canon.CAMPAIGN_BEATS,
  TYPE_BY_ID: new Map([['patrol_clear',{}],['bounty_hunt',{}]]), SECTOR_BY_ID: sectors, STATION_INFO: stations,
  PHYSICAL_TYPE_SET: new Set(), PHYSICAL_ROLE: {}, RECORD_KIND: { MISSION_TARGET: 'mission_target' },
  BULK_HAUL_TYPE:'bulk_haul', PQ019C_HEIST_TYPE:'heist', BREAKAWAY_RECOVERY_TYPE:'breakaway', COUNTERWEIGHT_WATCH_TYPE:'counterweight',
  SPLIT_MANIFEST_TYPE:'split', QUIET_BERTH_TYPE:'quiet', AUTHORED_SET_PIECE_TYPE:'authored', CAPITAL_BOSS_TYPE:'capital',
  CONTRACT_47A_B0_TAG:'b0legacy', CONTRACT_47A_B1_TAG:'b1legacy', CONTRACT_47A_B2_TAG:'b2legacy', CONTRACT_47A_B3_TAG:'b3legacy',
  MISSION_TUNING:{BASE_REP:{patrol_clear:5},maxActive:8}, MISSION_RECEIPT_LIMIT:10, SET_PIECE_MISSIONS:[], SET_PIECE_MISSION_SOURCE:'setPiece',
  WARM_CARGO_CONTRACT:{source:'warmCargo'}, CLAUSE_GAMBIT_SOURCE:'clauseGambit', ONBOARDING_CHOICE_SOURCE:'onboardingChoice',
  SET_PIECE_DISPOSITION_OBJECTIVES:new Set(), DOCK_SETTLED_TYPES:new Set(), ONE_LOAD_CARGO_TYPES:new Set(),
  MISSION_HOSTILE_SPAWN_ATTEMPTS:24,MISSION_HOSTILE_SPAWN_MIN_WU:1700,MISSION_HOSTILE_SPAWN_MAX_WU:2600,outsideMissionPortSafety:()=>true, CLAUSE_HONOR_RP:0, HOME_FACTION:'faction_scn',
  round:Math.round, deferredEnterNow:s=>s.simTime, deferredEnterTick:s=>s.tick,
  setPieceCauseOf:no, setPieceUpfrontCost:()=>0, setPieceEventFields:()=>({}), clauseGambitMeta:()=>null, isShortageGateRepair:no,
  missionNavReason:()=> 'generic mission destination', contractTermById:()=>{throw Error('No Cinder clauses authored');},
  coldburnDeliveryBonus:()=>0, noteStandingOrderCompletion:noop, isZeroPayLandmarkMission:no,
  missionOfferMinRep:o=>o.minRep||0, missionRequiredCargoVolume:()=>0,
  spawnReckoning:no, syncFurnaceWorksite:no, authoredFurnaceWorksite:no, recordFurnaceAftermathFact:noop, snapshotFurnaceWorksite:noop,
  snapshotFurnaceAftermath:noop, snapshotReckoning:noop, normalizeSetPieceSettlements:()=>({}),
  missionObservesClauseEvent:no, contractClaimSiteMission:no, isCampaign47aB2Rescue:no,
  forEachLivingWorldActor:(s,f)=>s.entityList.filter(e=>e.alive!==false && ['ship','drone','fauna'].includes(e.type)).forEach(f),
  forEachJobInteractable:(s,f)=>s.entityList.filter(e=>e.alive!==false).forEach(f),
  syncEntitySectorMembership:noop, registerEntityWorldRecordId:noop, protectedStationAt:()=>null,
  campaign47aOutcomeKey:()=>null, campaign47aRouteKind:()=> 'live', kesslerScaleWaypoint:()=>null,
  // Unrelated mission kinds' tow-lease registrars (starter buoy, mass-scale audit): each owner
  // refuses a mission that is not its own, so the adapter is that refusal.
  registerStarterBuoyTow:no, registerMassScaleTow:no,
});
const receiptStart = source.indexOf('export function normalizeMissionReceipts');
const receiptEnd = source.indexOf('export const CLEAN_PHYSICAL_RELEASE');
const hintStart = source.indexOf('export const BEAT_HINT ='), hintEnd = source.indexOf('\n};',hintStart)+3;
const clauseStart = clauses.indexOf('export function settleContractClauses');
const clauseEnd = clauses.indexOf('/**',clauseStart);
vm.runInContext([
  strip(source.slice(receiptStart, receiptEnd)), strip(source.slice(hintStart, hintEnd)), fn(source,'storyBeatTitle'),
  ...['missionHostileSpawnPos','missionTargetSlotOf','completedMissionTargetSlots','lowestVacantSlot','stableEntityId','mulberryLocal'].map(n=>fn(source,n)),
  fn(worldRecords,'stableRecordId'), fn(worldRecords,'missionIdentityOf'), fn(bounty,'markArchetypePoolFor'),
  // _acceptPreflight's remembered-captain refusal is the real reader (hash32 rides ...rng).
  fn(read('src/systems/captainStandingOrders.js'),'captainStandingOfferPreflight'),
  strip(clauses.slice(clauseStart,clauseEnd)),
  `this.coreOps={${['abandonMission','acceptMission','_acceptPreflight','_instanceFromOffer','_objectiveTarget','_typeSpawnsTargets','trackMission',
    '_refreshTrackedMissionNav','_missionWaypoint','_reconcileCompostGrowth','_storyWaypointForBeat','_completeMission','_completeMissionBody',
    '_dropSettledRow','_settleOptional','_recordMissionReceipt','_logCompletion'].map(n=>method(source,n)).join('\n')}};`,
  strip(spawning), 'this.spawnOps=missionSpawningOps;', strip(objective), 'this.objectiveOps=missionObjectiveOps;',
  `this.storyOps={${['_advanceEmbodiedStoryMission','_advanceStory','_syncCampaignSidecarAfterAdvance','_activateBookContractOnDeparture','_recordCampaignBookSignal',
    '_cleanupTargets','_onSectorExit','newGame','serialize','deserialize','deserializeChunked'].map(n=>method(story,n)).join('\n')}};`,
].join('\n'), mc, { filename: 'current-mission-owner-projections.js' });

// Production enemy recipe + spawn constructor; unrelated fittings/AI setup are declared ports.
const enemyContext = vm.createContext({ console, ENEMY_TYPES:ns('src/data/enemies.js').ENEMY_TYPES,
  ENEMY:new Map(ns('src/data/enemies.js').ENEMY_TYPES.map(row=>[row.id,row])), SHIP:new Map(), SHIPS:[],
  factionBehaviorForCombatSpawn:()=>({}), makeShipEntitySpec:(id,o)=>({type:'ship',...o,vel:{x:0,z:0},data:{defId:id}}),
  resolveEnemyWeapon:w=>({...w}), normalizeCombatDoctrineId:x=>x, tacticalCapabilitiesFor:()=>({}), doctrineTelegraphFor:()=>null,
  contactGrammarFor:()=>null,applyLastArgumentSpawnSpec:s=>s,
  MIN_AI_RESPONSE_WINDOW_S:1, DOCTRINE_TELEGRAPH_TICKS:60, defaultDoctrineFor:()=>({activity:{},roe:'weapons_free'}),
});
vm.runInContext(`${fn(combat,'scaleCombatant')}\n${fn(combat,'makeEnemySpawnSpec')}\nthis.makeEnemy=makeEnemySpawnSpec;`,enemyContext);
mc.makeEnemySpawnSpec = enemyContext.makeEnemy;

let checks=0, failures=0;
function test(name, run) { try { run(); console.log(`PASS ${++checks} ${name}`); } catch(error) { failures++; console.error(`FAIL ${name}\n${error.stack}`); } }
function harness({beat=2,sector='sector_tethys_junction',missionFirst=false}={}) {
  const state={meta:{seed:4242},tick:1,simTime:10,run:{kind:'adventure'},playerId:1,player:{credits:1000,stats:{}},
    story:{beatIndex:beat,flags:{},chainProgress:0},missions:{nextId:1,active:[],boards:{},receipts:[],completedLog:[]},
    world:{currentSectorId:sector},entities:new Map(),entityList:[],ui:{},nav:{},combat:{}};
  trans.initCampaignSidecar(state,0);
  const events=[],listeners=new Map();
  const bus={on(name,f){const list=listeners.get(name)||[];list.push(f);listeners.set(name,list);return()=>listeners.set(name,list.filter(x=>x!==f));},
    off(name,f){listeners.set(name,(listeners.get(name)||[]).filter(x=>x!==f));},
    emit(name,p){events.push([name,p]);for(const f of [...(listeners.get(name)||[])])f(p);}};
  let next=10;
  const helpers={hash32:rng.hash32,mulberry32:rng.mulberry32,spawnEntity(spec){const e={...structuredClone(spec),id:next++,alive:true};state.entities.set(e.id,e);state.entityList.push(e);return e;},
    removeEntity(id){const e=state.entities.get(id);if(e)e.alive=false;state.entities.delete(id);},player:()=>state.entities.get(1)};
  const player={id:1,type:'ship',isPlayer:true,alive:true,team:0,pos:{x:12000,z:8000},vel:{x:0,z:0},data:{}};state.entities.set(1,player);state.entityList.push(player);
  const owner={...mc.coreOps,...mc.spawnOps,...mc.objectiveOps,...mc.storyOps,state,bus,helpers,_spawnSeq:0,
    _installThreadBFragment:noop,_installContract47aColdStart:noop,_tutorialOwnsOpening:()=>true,
    _heistEach:noop,_counterweightEach:noop,_reattachCapitalBossCastTargets:noop,_noteMissionSpawnDeferred:noop,_onboardingOwnsOpeningNav:no,_epoch:()=>0,_repOf:()=>0,
    _shortageOfferStale:no,_withdrawClauseGambitPair:()=>[],_missionConditions:()=>[],_maybeSetBranch:noop,_onBookContractAccepted:noop,
    _startLongReadObjective:noop,_startWreckBoundStageObjective:noop,_refuseTurnInIfBlocked:no,_compileSetPieceTransition:()=>null,
    _clearMissionNav(id){if(state.nav.waypoint?.missionId===id)state.nav.waypoint=null;},
    _grantCappedResearchContract:()=>0,_grantCareerContractResearch:()=>0,_boardSetPieceTransition:noop,
    _completeContract47aB4Intro:noop,_resolveContract47aB4Doubled:noop,_advanceStoryChain:noop,_completeContract47aB7Operation:noop,_emitMissionDebrief:noop,
    _sayStoryLine(text){bus.emit('test:storyLine',{text});},_ensureCampaignSidecar(){trans.initCampaignSidecar(state,state.simTime);},
    _setNavWaypoint(w){state.nav.waypoint=w;bus.emit('nav:waypoint',w);},_liveStation:()=>null,
    _removeActive(id){state.missions.active=state.missions.active.filter(m=>m.id!==id);},
    _refreshNavigation(){const m=state.missions.active.find(m=>m.status==='active');this._setNavWaypoint(m?this._missionWaypoint(m):this._storyWaypointForBeat(canon.CAMPAIGN_BEATS[state.story.beatIndex]));},
    _refreshEmbodiedStoryBoards(){const o=builder.buildMissionBoardContract(state.story.beatIndex,{state,seed:4242});if(o)state.missions.boards[o.stationId]={slots:[o]};},
    ensureBoard(id){this._refreshEmbodiedStoryBoards();return state.missions.boards[id]||{slots:[]};},
    _findOffer(id){for(const board of Object.values(state.missions.boards)){const offer=board.slots.find(o=>o.id===id);if(offer)return{offer,board};}return{};},
  };
  const ac=vm.createContext({console,...rng,...coords,...route,...ns('src/data/factions/understory.js'),...ns('src/data/understoryReceiver.js'),SECTORS:[],syncEntitySectorMembership:noop,
    deferSectorEnterMaterialization:no,deferredEnterNow:s=>s.simTime,validateRunState:()=>({ok:false}),salvagePoolFromManifest:()=>({}),
    peekPendingSlam:()=>null,IMPACT_TEAROFF_LAW:{},combatFlag:no,indexedTypeScan:(s,l)=>s.entityList.filter(e=>l!=='wrecks'||e.type==='wreck'),
    zoneAt:zones.zoneAt,zoneThreat:zones.zoneThreat,wreckClassById:id=>({id,label:id}),WRECK_COLLIDER_PROPORTIONS:{},normalizeCausalAftermath:()=>null,
    // Finite-manifest owners of unrelated routes (Vesta winnow, Charon supply) never own a Cinder hull.
    ownsFiniteWinnowManifest:no,ownsFiniteCharonSupplyManifest:no});
  vm.runInContext(`${strip(aftermath)}\nthis.owner=aftermathWrecks;`,ac,{filename:'current-aftermathWrecks.js'});
  const aft=ac.owner, registry={get:name=>name==='aftermathWrecks'?aft:null};owner.registry=registry;
  const wire=()=>{
    bus.on('aftermathWreck:recorded',p=>route.observeCinderMarker(owner,p));
    for(const signal of ['aftermathWreck:completed','aftermathWreck:retired'])bus.on(signal,p=>route.observeCinderRetirement?.(owner,p,signal));
    bus.on('entity:killed',p=>owner._onKill(p));bus.on('rookWreck:delivered',p=>owner._onRookWreckDelivered(p));
  };
  if(missionFirst)wire();aft.init({state,bus,helpers,registry});if(!missionFirst)wire();
  const booth=rook.createRookBooth();booth.init({state,bus,helpers,registry});
  const kc=vm.createContext({console,...ns('src/combat/rewardEligibility.js'),isHostileToPlayer:()=>true,
    buildKillPresentationReceipt:()=>({}),killImpactorId:()=>null,massline2Flag:no});
  vm.runInContext(`this.kill=({${method(combat,'kill')}}).kill;`,kc);
  const fighter={kill:kc.kill,state,bus,helpers,rollLoot:()=>({credits:0,items:[]})};
  const dc=vm.createContext({console,...ns('src/combat/rewardEligibility.js'),
    ...Object.fromEntries(['isCeresWorkfleetHardware','selectHitSubsystem','syncCombatantBounds','damageSubsystem','appendCombatTrace',
      'publishHitstunImpulse','recordImpulseProvenance','signedHitSide','readPlayerFirstHitTruth','writePlayerFirstHitTruth',
      'wardScreenTarget','deliverPhysicalImpulseDetailed','isEnvironmentalBody','isPhysicalMissionBody','resolvePhysicsBodySpec',
      'addEnvironmentHeat','crossfireDisciplineFor'].map(name=>[name,()=>null])),
    ensureCombatant:()=>({heat:0,heatMax:100,subsystems:{}}),difficultyDamageScale:()=>1,combatFlag:no,verbAcceptsType:()=>true,
    GRAVITY_MARK_STATUS_ID:'gravity_mark',swarmPilotHasActed:()=>true,isHostileToPlayer:()=>true,
  });
  vm.runInContext(`${strip(damageSource)}\nthis.makeDamage=createDamageRouter;`,dc,{filename:'current-damage.js'});
  const hit=dc.makeDamage({state,bus,helpers,catalog:{damageModel:{channelOrder:['kinetic'],shieldMultipliers:{},armorMultipliers:{},hullMultipliers:{},subsystemShare:0}}},
    {schedule:noop},{onKill:(target,killer,lethal)=>fighter.kill(target,killer,lethal)});
  const kill=(e,killer=1)=>{state.tick++;assert.equal(hit({attackerId:killer,targetId:e.id,
    packet:{channels:{kinetic:1000000},flags:{allowAnyTarget:true,ignoreFriendlyFire:true}},origin:{kind:'bomb',id:'bomb_frag'}}).ok,true);assert.equal(e.alive,false);};
  const mine=vm.createContext({isCeresWorkfleetHardware:no,SALVAGE_TIME_DEFAULT:8,
    consumePendingSlam:()=>null,consumeLethalBlow:()=>null,peekPendingSlam:()=>null,consumePendingSlamIfFresh:()=>null,
    overkillNoteForKill:()=>null,spawnFracturePieces:()=>null,victimVisualFor:()=>null,WRECK_COLLIDER_PROPORTIONS:{}});
  vm.runInContext(`this.ops={${method(miningSource,'_drainWreck')}${method(miningSource,'_onShipDestroyed')}};`,mine,{filename:'current-mining-drain.js'});
  const miner={state,bus,helpers,registry,...mine.ops,_lootToPool:()=>({cmdty_scrap_metal:3}),_spawnPickup:(_e,_id,qty)=>qty,
    _protestClaimJump:noop,_crackDebrisCache:noop,_noteBeamRefusal:noop,_stopBeam:noop};
  bus.on('entity:killed',p=>miner._onShipDestroyed(p));
  const stripHull=e=>miner._drainWreck(player,e,18,30);
  const offer=()=>builder.buildMissionBoardContract(state.story.beatIndex,{state,seed:4242});
  const accept=()=>{const o=offer();assert.ok(o);state.missions.boards[o.stationId]={slots:[o]};assert.equal(owner.acceptMission(o.id),true);return state.missions.active.at(-1);};
  const arrive=m=>{state.world.currentSectorId=m.destSectorId;booth._sync();owner._ensureMissionTargets(m);};
  const hull=(m,slot=0)=>{const ref=m.params.cinderMarkedWrecks.find(r=>r.slot===slot);return ref&&aft._resolveBoundWreck(ref.markerId);};
  const sale=(e)=>{e.pos=plain(rules.rookPadPosition());e.vel={x:0,z:0};booth.update();};
  return {state,bus,events,helpers,owner,aft,booth,kill,stripHull,offer,accept,arrive,hull,sale};
}

test('Ceres story-handoff projection directs to Tethys; departure cannot accept Cinder at Ceres',()=>{
  const h=harness({beat:1,sector:'sector_ceres_belt'});
  trans.recordBeatStep(h.state,'mission:completed',{storyTag:'campaign47a:b1:alloy_run'},1);
  trans.recordBeatStep(h.state,'kesslerPod:weighed',{variance:true},2);
  const offer=h.offer();assert.equal(offer.storyTag,'campaign47a:b1:infested');
  assert.equal(h.owner._advanceEmbodiedStoryMission({...offer,id:'ceres-done',status:'completed'}),true);
  assert.equal(h.state.story.beatIndex,2);assert.equal(h.state.nav.waypoint.stationId,'station_tethys');
  assert.equal(h.state.nav.waypoint.sectorId,'sector_tethys_junction');assert.match(h.state.nav.waypoint.reason,/accept Cinder/i);
  assert.equal(h.owner._activateBookContractOnDeparture(2,'station_ceres'),false);
  h.state.world.currentSectorId='sector_tethys_junction';assert.equal(h.owner._activateBookContractOnDeparture(2,'station_tethys'),true);
  const m=h.state.missions.active[0];assert.equal(m.objectiveTarget,3);assert.equal(m.targetEntityIds.length,0);
  h.arrive(m);assert.equal(m.targetEntityIds.length,3);assert.deepEqual(plain(h.owner._missionTargetArchetypes(m)),['wasp_swarmer']);
  const targets=m.targetEntityIds.map(id=>h.state.entities.get(id));
  assert.deepEqual(plain(targets.map(e=>e.data.name)),plain(route.CINDER_WASPS.map(n=>n+' · marked Wasp')));
  for(let i=0;i<3;i++){assert.equal(targets[i].data.lootTableId,'wasp_swarmer');assert.equal(targets[i].data.defId,'ship_wasp');assert.deepEqual(targets[i].pos,plain(route.cinderWaspPosition(i)));}
  h.owner._ensureMissionTargets(m);assert.equal(m.targetEntityIds.length,3);
});

for(const deliveredSlot of [0,1,2])for(const early of [false,true])for(const missionFirst of [false,true])test(`real kills and Rook sale settle once (hull ${deliveredSlot+1}; ${early?'tow under fire':'clear then tow'}; ${missionFirst?'mission':'aftermath'} listener first)`,()=>{
  const h=harness({missionFirst}),m=h.accept();h.arrive(m);const targets=m.targetEntityIds.map(id=>h.state.entities.get(id));
  h.kill(targets[deliveredSlot]);assert.equal(m.objectiveProgress,1);assert.ok(h.hull(m,deliveredSlot));
  if(early){h.sale(h.hull(m,deliveredSlot));assert.equal(m.status,'active');assert.equal(m.params.rookDeliveries,1);}
  targets.filter((_e,i)=>i!==deliveredSlot).forEach(e=>h.kill(e));assert.equal(m.objectiveProgress,3);
  if(!early){assert.equal(m.status,'active');assert.equal(h.events.filter(([k])=>k==='mission:completed').length,0);h.sale(h.hull(m,deliveredSlot));}
  assert.equal(m.status,'completed');assert.equal(h.state.missions.active.length,0);
  assert.equal(h.events.filter(([k])=>k==='mission:completed').length,1);
  assert.equal(h.events.filter(([k,p])=>k==='economy:grantCredits'&&p.reason===`mission:${m.id}`).length,1);
  assert.equal(h.events.find(([k,p])=>k==='economy:grantCredits'&&p.reason===`mission:${m.id}`)[1].amount,700);
  assert.equal(h.state.missions.receipts.length,1);assert.equal(h.state.missions.receipts[0].rewardCr,700);
  assert.equal(m.params.completionMethod,early?'tow_under_fire':'clear_and_tow');
  const receipt=h.events.find(([k])=>k==='rookWreck:delivered')[1];
  const spoken=h.events.find(([k,p])=>k==='comms:popup'&&p.id===`rook_receipt_${receipt.entityId}`)[1];
  assert.ok(spoken.text.startsWith(route.CINDER_WASPS[deliveredSlot]+' · marked Wasp: '));assert.ok(spoken.text.includes(String(receipt.payoutCr)));
  assert.equal(receipt.payoutCr,rules.rookPayoutCr(receipt.mass));
  h.bus.emit('rookWreck:delivered',receipt);h.owner._completeMission(m,0);
  assert.equal(h.events.filter(([k])=>k==='mission:completed').length,1);
  assert.equal(h.offer(),null,'Compost is world work; no premature Nest/Elroy offer');
  assert.equal(trans.getBeatStepStatus(h.state,2).completed.includes('cinder_board'),true);
  assert.equal(trans.getBeatStepStatus(h.state,2).completed.includes('compost'),false);
  assert.match(h.state.nav.waypoint.label,/Compost Run/);assert.equal(h.state.story.flags.elroy_outcome,undefined);
});

test('wrong/foreign/fast/raw-local/replayed receipts fail while correct physical material remains',()=>{
  const h=harness(),m=h.accept();h.arrive(m);const targets=m.targetEntityIds.map(id=>h.state.entities.get(id));targets.forEach(e=>h.kill(e));
  const correct=h.hull(m,0),markerId=correct.data.markerId;
  const fake={source:'rook:booth',markerId,entityId:correct.id,sectorId:'sector_charon_expanse',pos:plain(rules.rookPadPosition())};
  h.bus.emit('rookWreck:delivered',fake);assert.equal(m.params.rookDeliveries||0,0);
  correct.pos=plain(rules.rookPadPosition());correct.data.rookClaimed=true;
  for(const changed of [{source:'foreign:booth'},{markerId:'wrong_marker'},{entityId:'wrong_body'},
    {sectorId:'sector_tethys_junction'},{pos:{x:1040,z:-540}}]){
    h.bus.emit('rookWreck:delivered',{...fake,...changed});assert.equal(m.params.rookDeliveries||0,0);
  }
  correct.data.missionId='foreign_contract';h.bus.emit('rookWreck:delivered',fake);assert.equal(m.params.rookDeliveries||0,0);delete correct.data.missionId;
  correct.vel={x:9,z:0};h.bus.emit('rookWreck:delivered',fake);assert.equal(m.params.rookDeliveries||0,0);correct.data.rookClaimed=false;
  correct.pos=plain(rules.rookPadPosition());correct.vel={x:9,z:0};h.booth.update();assert.equal(m.params.rookDeliveries||0,0);
  correct.pos={x:1040,z:-540};correct.vel={x:0,z:0};h.booth.update();assert.equal(m.params.rookDeliveries||0,0);
  const foreign=h.helpers.spawnEntity({type:'wreck',pos:plain(rules.rookPadPosition()),vel:{x:0,z:0},mass:16,data:{missionId:'other'}});
  h.booth.update();assert.equal(foreign.alive,true);assert.equal(m.params.rookDeliveries||0,0);
  const wrong=h.helpers.spawnEntity({type:'ship',pos:plain(rules.rookPadPosition()),vel:{x:0,z:0},hull:1,mass:16,radius:12,data:{defId:'ship_wasp'}});
  h.kill(wrong,99);const unrelated=Object.values(h.state.aftermathWrecks.bySector).flat().find(row=>row.victimId===wrong.id);
  h.sale(h.aft._resolveBoundWreck(unrelated.markerId));assert.equal(m.params.rookDeliveries||0,0);assert.equal(m.status,'active');
  h.sale(correct);assert.equal(m.status,'completed');h.bus.emit('rookWreck:delivered',fake);assert.equal(h.events.filter(([k])=>k==='mission:completed').length,1);
});

test('missing markers are unknown, not all-lost completion; real destruction/strip receipts settle zero once',()=>{
  const h=harness(),m=h.accept();h.arrive(m);const targets=m.targetEntityIds.map(id=>h.state.entities.get(id));targets.forEach(e=>h.kill(e));
  const saved=h.state.aftermathWrecks.bySector;h.state.aftermathWrecks.bySector={};route.driveCinderRoute(h.owner,m);
  assert.equal(m.status,'active');h.state.aftermathWrecks.bySector=saved;
  const hulls=[0,1,2].map(i=>h.hull(m,i));
  h.kill(hulls[0]);assert.equal(m.status,'active');assert.equal(h.aft._markerById(hulls[0].data.markerId),null);
  h.stripHull(hulls[1]);
  assert.equal(m.status,'active');h.kill(hulls[2]);
  assert.equal(m.status,'completed');assert.equal(m.params.rookDeliveries||0,0);assert.equal(m.params.cinderOutcome,'clearance_only_hulls_lost');
  assert.equal(h.state.missions.receipts[0].rewardCr,0);assert.match(h.state.missions.receipts[0].title,/lost/i);
  assert.equal(h.events.filter(([k,p])=>k==='economy:grantCredits'&&p.reason===`mission:${m.id}`).length,0);
  h.aft._spawnForSector(m.destSectorId);h.aft._spawnForSector(m.destSectorId);assert.equal(h.hull(m,0),null);assert.equal(h.hull(m,2),null);
  assert.match(h.state.nav.waypoint.label,/Compost Run/);
});

test('public story contract cannot be abandoned; hard jump preserves finite squad for return',()=>{
  const h=harness(),m=h.accept();h.arrive(m);const targets=m.targetEntityIds.map(id=>h.state.entities.get(id));h.kill(targets[0]);
  const before=plain(h.owner.serialize()),survivors=targets.slice(1).map(e=>e.id);
  assert.equal(h.owner.abandonMission(m.id),false);assert.deepEqual(plain(h.owner.serialize()),before);
  assert.match(h.events.at(-1)[1].text,/stays on your log/i);
  h.owner._onSectorExit({sectorId:m.destSectorId,reason:'jump'});h.state.world.currentSectorId='sector_tethys_junction';h.booth._sync();
  assert.equal(m.status,'active');for(const id of survivors)assert.equal(h.state.entities.get(id).alive,true);
  // The booth is a market now (cc96d0cdc9c): one pad per stand returns with the sector, and
  // nothing else — no respawned Wasp, no replacement marker.
  const before2=new Set(h.state.entityList);h.arrive(m);assert.deepEqual(m.targetEntityIds,survivors);
  const fresh=h.state.entityList.filter(e=>!before2.has(e));
  assert.equal(fresh.length,rook.ROOK_MARKET_STANDS.length,'only the returning booth pads may materialize');
  for(const e of fresh)assert.notEqual(e.type,'ship','no mission hull respawns on return');
});

test('internal-failure retry preserves the living squad owner, cleared slot and existing real marker',()=>{
  const h=harness(),m=h.accept();h.arrive(m);const targets=m.targetEntityIds.map(id=>h.state.entities.get(id));h.kill(targets[0]);
  const markerId=m.params.cinderMarkedWrecks[0].markerId,survivorIds=targets.slice(1).map(e=>e.id),records=targets.slice(1).map(e=>e.data.worldRecordId);
  m.status='failed';h.owner._cleanupTargets(m);h.state.missions.active=[];
  const saved=plain(h.owner.serialize());assert.ok(saved.cinderRetry);assert.equal(saved.cinderRetry.params.cinderMarkedWrecks[0].markerId,markerId);
  const retry=h.accept();h.arrive(retry);
  assert.equal(retry.params.cinderTargetOwnerId,m.id);assert.deepEqual(retry.targetEntityIds,survivorIds);
  assert.deepEqual(retry.targetEntityIds.map(id=>h.state.entities.get(id).data.worldRecordId),records);
  assert.deepEqual(plain(retry.completedTargetSlots),[0]);assert.deepEqual(plain(retry.params.cinderIssuedSlots),[0,1,2]);
  assert.equal(retry.objectiveProgress,1);assert.equal(retry.params.cinderMarkedWrecks[0].markerId,markerId);
  h.owner._ensureMissionTargets(retry);assert.equal(retry.targetEntityIds.length,2);
});

test('save snapshot and Continue adoption preserve marked pose/damage and do not respawn cleared targets',()=>{
  const h=harness(),m=h.accept();h.arrive(m);const targets=m.targetEntityIds.map(id=>h.state.entities.get(id));h.kill(targets[0]);
  const wreck=h.hull(m,0);wreck.pos={x:9411,z:28205};wreck.vel={x:2,z:-1};wreck.hull=0.4;
  const save=plain(h.owner.serialize()),wreckSave=plain(h.aft.serialize());
  assert.deepEqual(save.active[0].targetEntityIds,[]);assert.equal(save.active[0].params.cinderMarkedWrecks[0].markerId,wreck.data.markerId);
  assert.equal(Object.keys(save.active[0].params).some(k=>/pose|hull|maxHull|velocity/i.test(k)),false,'missions must not become a wreck-body ledger');
  h.helpers.removeEntity(wreck.id);h.aft.deserialize(wreckSave);h.aft._spawnForSector(m.destSectorId);
  h.owner.deserialize(save);const restored=h.state.missions.active[0];h.owner._ensureMissionTargets(restored);
  assert.deepEqual(restored.targetEntityIds,targets.slice(1).map(e=>e.id));
  const restoredHull=h.hull(restored,0);assert.ok(restoredHull);assert.deepEqual(plain(restoredHull.pos),{x:9411,z:28205});assert.equal(restoredHull.hull,0.4);
  h.aft._spawnForSector(m.destSectorId);assert.equal(h.state.entityList.filter(e=>e.alive&&e.data?.markerId===restoredHull.data.markerId).length,1);
  restoredHull.flags={tethered:true};h.owner._refreshTrackedMissionNav(restored);
  assert.deepEqual(plain(h.state.nav.waypoint.pos),plain(rules.rookPadPosition()));assert.equal(h.state.nav.waypoint.targetEntityId,null);
  targets.slice(1).forEach(e=>h.kill(e));h.sale(restoredHull);assert.equal(restored.status,'completed');
  const terminal=plain(h.owner.serialize());h.owner.deserialize(terminal);h.owner._ensureMissionTargets(restored);
  assert.equal(h.state.missions.active.length,0);assert.equal(h.events.filter(([k])=>k==='mission:completed').length,1);
  assert.equal(h.events.filter(([k,p])=>k==='economy:grantCredits'&&p.reason===`mission:${m.id}`).length,1);
});

for(const [sector,pos] of [['sector_vesta_forge',{x:300,z:16504}],['sector_io_reach',{x:20480,z:20480}]])
test(`real marked hull tow/Continue follows physical ${sector}, not incident bucket`,()=>{
  const h=harness(),m=h.accept();h.arrive(m);m.targetEntityIds.map(id=>h.state.entities.get(id)).forEach(e=>h.kill(e));
  const wreck=h.hull(m,0),markerId=wreck.data.markerId;wreck.pos={...pos};h.state.world.currentSectorId=sector;
  const missions=plain(h.owner.serialize()),aftermath=plain(h.aft.serialize());
  const incident=aftermath.bySector.sector_charon_expanse.find(row=>row.markerId===markerId);
  assert.ok(incident);assert.deepEqual(incident.pos,pos);assert.equal(incident.sectorId,'sector_charon_expanse');
  h.helpers.removeEntity(wreck.id);h.aft.deserialize(aftermath);h.owner.deserialize(missions);
  const restored=h.state.missions.active[0];h.owner._refreshTrackedMissionNav(restored);
  assert.equal(h.state.nav.waypoint.sectorId,sector);assert.deepEqual(plain(h.state.nav.waypoint.pos),pos);
  assert.match(h.state.nav.waypoint.label,/recovery pending/i);assert.match(h.state.nav.waypoint.reason,/if.*capacity/i);
  h.aft._spawnForSector(sector);const live=h.hull(restored,0);assert.ok(live,'physical sector Continue rematerializes real marked hull');
  assert.deepEqual(plain(live.pos),pos);assert.equal(live.homeSectorId,sector);assert.equal(live.data.provenance.sectorId,'sector_charon_expanse');
  h.aft._spawnForSector(sector);assert.equal(h.state.entityList.filter(e=>e.alive&&e.data?.markerId===markerId).length,1);
  h.owner._refreshTrackedMissionNav(restored);assert.equal(h.state.nav.waypoint.sectorId,sector);assert.equal(h.state.nav.waypoint.targetEntityId,live.id);
  assert.equal(restored.status,'active');assert.equal(h.events.filter(([name])=>name==='mission:completed').length,0);
  live.pos=plain(rules.rookPadPosition());h.state.world.currentSectorId='sector_charon_expanse';h.booth._sync();h.sale(live);
  assert.equal(restored.status,'completed');assert.equal(h.events.filter(([name])=>name==='mission:completed').length,1);
});

test('Continue rejects duplicate/completed/out-of-range slots without inventing replacement identity',()=>{
  const h=harness(),m=h.accept();h.arrive(m);const targets=m.targetEntityIds.map(id=>h.state.entities.get(id));h.kill(targets[0]);
  const stale=h.helpers.spawnEntity({...plain(targets[0]),alive:true});
  const duplicate=h.helpers.spawnEntity({...plain(targets[1]),alive:true});
  const invalid=h.helpers.spawnEntity({...plain(targets[2]),data:{...plain(targets[2].data),missionTargetSlot:3,identityKey:`mission:${m.id}:3`}});
  const saved=plain(h.owner.serialize());h.owner.deserialize(saved);const restored=h.state.missions.active[0];
  h.owner._ensureMissionTargets(restored);assert.equal(restored.targetEntityIds.length,2);
  assert.deepEqual(plain(restored.targetEntityIds.map(id=>h.state.entities.get(id).data.missionTargetSlot)),[1,2]);
  assert.equal(stale.alive,false);assert.equal([targets[1],duplicate].filter(e=>e.alive).length,1);
  assert.equal(restored.targetEntityIds.includes(invalid.id),false);assert.equal(invalid.data.missionTargetSlot,3);
  assert.deepEqual(plain(restored.params.cinderIssuedSlots),[0,1,2]);
  assert.equal(h.events.filter(([k])=>k==='mission:completed').length,0);
});

test('actual newGame clears Cinder retry and published Ceres aftermath snapshots',()=>{
  const h=harness();h.state.missions.cinderRetry={sentinel:'old Cinder'};h.state.missions.furnaceWorksiteAftermath={sentinel:'old Ceres'};
  h.owner.newGame();assert.equal(h.state.missions.cinderRetry,undefined);assert.equal(h.state.missions.furnaceWorksiteAftermath,undefined);
  assert.equal(h.state.story.beatIndex,0);assert.equal(h.state.missions.active.length,0);
});

test('legacy accepted contract retains four-clearance quota and unbound booth-receipt behavior',()=>{
  const h=harness();const old=h.offer();delete old.params.cinderRouteVersion;old.params.clearCount=4;
  const m=h.owner._instanceFromOffer(old);h.state.missions.active=[m];h.state.world.currentSectorId=m.destSectorId;
  h.owner._ensureMissionTargets(m);assert.equal(m.targetEntityIds.length,4);assert.equal(m.objectiveTarget,4);
  const targets=m.targetEntityIds.map(id=>h.state.entities.get(id));targets.slice(0,3).forEach(e=>h.kill(e));
  h.owner._onRookWreckDelivered({entityId:'legacy-receipt'});assert.equal(m.status,'active');assert.equal(m.objectiveProgress,3);assert.equal(m.params.rookDeliveries,1);
});

console.log(JSON.stringify({sourceInventory:Object.fromEntries(inventory)},null,2));
console.log(`Cinder route: ${checks} passed; ${failures} failed. Explicit source-owner composition; no browser/native-physics acceptance.`);
if(failures)process.exitCode=1;
