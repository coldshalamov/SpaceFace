import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stepHeliosClaimOpening, isHeliosClaimCutter, heliosClaimAwaitingWitness, heliosClaimVisualEpoch, HELIOS_CLAIM_OPENING as D } from '../src/systems/heliosClaimOpening.js';
import { claimRichSeamOpportunity, expireRichSeamOpportunities, openRichSeamOpportunity, richSeamOpportunityReadout, recordFieldExtraction, fieldDepletion } from '../src/systems/fieldDepletion.js';

function fixture() {
  const face = { id: 2, type: 'asteroid', alive: true, pos: {x: 200,z: 0}, hull: 10, hullMax: 10,
    data: {fieldId: D.fieldId, activityObjectSlotId: D.slotId, oreHP: 10, oreHPMax: 10, yieldU: 2} };
  const player = {id: 1, alive: true, pos: {x: 0,z: 0}, data: {}};
  const state = {world: {currentSectorId: D.sectorId}, playerId: 1, entities: new Map([[1,player],[2,face]]),
    simTime: 20, tick: 1200, onboarding: {active: false}, meta: {seed:47}};
  const events=[];
  const owner = {state, bus: {emit:(type,payload)=>events.push({type,payload})}, _ceresCausal: {seeds:{claim_staked:true}}};
  return {face,player,state,events,owner,step:()=>stepHeliosClaimOpening(owner,()=>face)};
}

// Execute the production physical extraction method, not a synthetic award shortcut. Only
// render/seam/fracture adapters are stubbed; ore HP, finite claim, release and receipts are real.
const source=fs.readFileSync(new URL('../src/systems/mining.js',import.meta.url),'utf8');
const start=source.indexOf('  applyMining(targetId,');
const end=source.indexOf('\n  // Release `units`',start);
assert.ok(start>=0 && end>start);
const applyMining=vm.runInNewContext('({' + source.slice(start,end) + '}).applyMining', {
  isOpticLatticeCellData:()=>false, AST_BY_ID:new Map([['ast_common_rock',{id:'ast_common_rock'}]]),
  bulkChunkMass:()=>0, BULK_HAUL_MIN_U:10, claimRichSeamOpportunity, recordFieldExtraction,
  isHeliosClaimCutter, persistTouchedResourceBody:()=>{},
});
function mine(f, minerId=1, dps=10,dt=1) {
  const releases=[];
  const system={state:f.state,bus:f.owner.bus, _ensureAsteroidSeams(){}, _beamContactPoint(){return {};},
    _seamYield(){return {onSeam:false,speedMult:1,yieldMult:1};}, _dominantOre(){return 'cmdty_ore_iron';},
    _releaseOre(ast,def,units,miner,lot){releases.push({units,minerId:miner.id,lot});},
    _fractureAsteroid(){}, _maybeExposeRichCore(){}, _pulseOre:0};
  const units=applyMining.call(system,2,dps,dt,minerId);
  return {units,releases};
}

test('ordinary approach opens one physical face with hints skipped, no waypoint mutation or actor spawn',()=>{
  const f=fixture(); f.state.nav={waypoint:{reason:'My route'}};
  assert.equal(f.step().state,'open'); assert.equal(f.state.entities.size,2);
  assert.equal(f.state.nav.waypoint.reason,'My route');
  assert.equal(f.events.filter(e=>e.type==='field:richSeamOpened').length,1);
  f.step(); assert.equal(f.events.length,3);
});
test('unseen distance and optional rail do not burn the finite window',()=>{
  const f=fixture(); f.player.pos.x=1000; f.state.simTime=5000; assert.equal(f.step(),null);
  f.player.pos.x=0; f.state.onboarding.active=true; assert.equal(f.step(),null);
  f.state.onboarding.finished=true; assert.equal(f.step().expiresAtT,5180);
});
test('missing, exhausted, unstaked or wrong slot never mints an opportunity',()=>{
  const f=fixture(); f.owner._ceresCausal.seeds={}; assert.equal(f.step(),null);
  f.owner._ceresCausal.seeds.claim_staked=true; f.face.data.oreHP=0; assert.equal(f.step(),null);
  f.face.data.oreHP=10; f.face.data.activityObjectSlotId='other'; assert.equal(f.step(),null);
  assert.equal(stepHeliosClaimOpening(f.owner,()=>null),null);
});
test('player must physically finish clast: partial cut pays ordinary ore; finish releases eight real bonus units exactly once',()=>{
  const f=fixture(); f.step(); const partial=mine(f,1,5); assert.equal(partial.units,1);
  assert.equal(f.step().state,'open'); const finish=mine(f,1,5); assert.equal(finish.units,9);
  assert.equal(finish.releases[0].lot.richBonusU,8); assert.equal(f.face.alive,false);
  assert.equal(f.step().claimedByKind,'player'); assert.equal(mine(f).units,0);
  assert.equal(f.events.filter(e=>e.type==='field:richSeamWorked').length,1);
});
test('existing named physical cutter can win the same clast without duplicate work-timer ore',()=>{
  const f=fixture(); f.step(); const npc={id:3,type:'ship',alive:true,data:{worldRecordId:'worker:47',
    activityActorSlotId:'helios_seam_miner',minerShiftRockId:2}}; f.state.entities.set(3,npc);
  const cut=mine(f,3); assert.equal(cut.units,10); assert.equal(cut.releases[0].lot.sourceOwner,'npc');
  assert.equal(f.step().claimedByKind,'npc'); assert.equal(mine(f,1).units,0);
});
test('unassigned or unrelated NPC cannot claim Helios bonus',()=>{
  for(const slot of ['helios_seam_fence','ceres_seam_miner']) {
    const f=fixture(); f.step(); f.state.entities.set(3,{id:3,type:'ship',alive:true,
      data:{worldRecordId:'worker:47',activityActorSlotId:slot,minerShiftRockId:2}});
    assert.equal(mine(f,3).units,2); assert.equal(f.step().state,'open');
  }
});
test('miss persists across JSON save and later chain cycles; ordinary ore stays mineable',()=>{
  const f=fixture(); f.step(); f.state.simTime=201; expireRichSeamOpportunities(f.state);
  const saved=JSON.parse(JSON.stringify(f.state.fieldDepletion));
  f.state.fieldDepletion=saved; f.owner._ceresCausal.cycle=99; f.owner._heliosClaimOpeningRead=null;
  assert.equal(f.step().state,'missed'); assert.equal(mine(f).units,2);
  assert.equal(f.events.filter(e=>e.type==='field:richSeamOpened').length,1);
});
test('worked return retains claimant and cannot re-arm; no offscreen clock reset',()=>{
  const f=fixture(); f.step(); mine(f); const expiry=f.step().expiresAtT;
  f.state.fieldDepletion=JSON.parse(JSON.stringify(f.state.fieldDepletion));
  f.state.simTime=9999; f.owner._ceresCausal.cycle=999;
  assert.equal(f.step().state,'worked'); assert.equal(f.step().expiresAtT,expiry);
});
test('Ceres negative control: opening stages nothing; existing player extraction still pays its own rich face',()=>{
  const f=fixture(); f.state.world.currentSectorId='sector_ceres_belt'; assert.equal(f.step(),null);
  f.face.data.fieldId='f_ceres_1'; f.face.data.activityObjectSlotId='ceres_seam_ore_clast';
  openRichSeamOpportunity(f.state,{fieldId:f.face.data.fieldId,activityObjectSlotId:f.face.data.activityObjectSlotId,bonusU:12});
  assert.equal(mine(f).units,14);
  assert.equal(richSeamOpportunityReadout(f.state,'f_ceres_1','ceres_seam_ore_clast').claimedByKind,'player');
});
test('ordinary player and unrelated NPC mining without an opportunity retain ordinary yield',()=>{
  for(const minerId of [1,3]) {
    const f=fixture(); f.state.entities.set(3,{id:3,type:'ship',alive:true,data:{}});
    assert.equal(mine(f,minerId).units,2);
    assert.equal(f.events.filter(e=>e.type==='field:richSeamWorked').length,0);
  }
});
test('Continue rebinds the same visible open face without extending its deadline',()=>{
  const f=fixture(); const first=f.step(); f.owner._heliosClaimOpeningRead=null;
  f.state.simTime=100; f.state.fieldDepletion=JSON.parse(JSON.stringify(f.state.fieldDepletion));
  assert.equal(f.step().expiresAtT,first.expiresAtT);
  assert.equal(f.events.filter(e=>e.type==='field:richSeamOpened').length,2);
});
test('real fieldDepletion save owner retains terminal state and New Game releases old suppression',()=>{
  const f=fixture(); f.step(); mine(f);
  const fd={...fieldDepletion,state:f.state};
  const saved=JSON.parse(JSON.stringify(fd.serialize()));
  fd.newGame(); fd.deserialize(saved);
  assert.equal(f.step().state,'worked');
  fd.newGame(); f.face.alive=true; f.face.data.oreHP=10;
  assert.equal(f.step().state,'open');
  fd.newGame(); assert.equal(f.step().state,'open');
  assert.equal(f.events.filter(e=>e.type==='field:richSeamOpened').length,3);
});
test('early player may lawfully cut ordinary face: no bonus and no phantom first opportunity',()=>{
  const f=fixture(); f.state.onboarding.active=true;
  assert.equal(mine(f).units,2); f.state.onboarding.finished=true;
  assert.equal(f.step(),null); assert.equal(f.events.filter(e=>e.type==='field:richSeamOpened').length,0);
});
test('ordinary traffic update owns staging, not New Game hints or board acceptance',()=>{
  const traffic=fs.readFileSync(new URL('../src/systems/trafficCausalChainOps.js',import.meta.url),'utf8');
  const method=traffic.slice(traffic.indexOf('  _stepCeresCausalChain(dt)'),traffic.indexOf('  /** Test/support seam:'));
  assert.match(method,/stepHeliosClaimOpening\(this/); assert.match(method,/forEachFieldRock/);
  assert.doesNotMatch(method,/mission:accepted|tutorial:finished|tutorialHints/);
});

test('ordinary world materializer binds exactly one of 42 budgeted rocks; real spawn carries slot into mining',()=>{
  const world=fs.readFileSync(new URL('../src/systems/world.js',import.meta.url),'utf8');
  // Existing authored geography: sectorZones Sanctioned Claim (720,-260), activity slot
  // offset (-62,24); sectors.js starter field explicitly has count:42. Nonzero origin tests
  // the production local→global callback rather than accidentally passing at Helios origin.
  const globals={HELIOS_ACTIVITY_POCKETS:[{id:'helios_starter_seam',activityAnchor:{localPos:{x:720,z:-260}},
    objectSlots:[{id:D.slotId,offset:{x:-62,z:24}}]}]};
  const bStart=world.indexOf('export function heliosOpeningFaceBinding(');
  const bEnd=world.indexOf('\nfunction ceresActivityObjectBinding',bStart);
  const bind=vm.runInNewContext(world.slice(bStart,bEnd).replace('export ','')+';heliosOpeningFaceBinding',globals);
  const toGlobal=p=>({x:p.x+10000,z:p.z-4000});
  const selection=world.slice(world.indexOf('        const activityBinding = sector.id'),world.indexOf('        const collisionAnchorBinding',world.indexOf('        const activityBinding = sector.id')));
  const bindings=[];
  for(let i=0;i<42;i++) bindings.push(vm.runInNewContext('(function(){'+selection+'return activityBinding;}).call(owner)',{
    sector:{id:D.sectorId},fdef:{id:D.fieldId},i,CERES_ACTIVITY_SECTOR_ID:'sector_ceres_belt',
    heliosOpeningFaceBinding:bind,owner:{_toGlobal:toGlobal},
  }));
  assert.equal(bindings.filter(Boolean).length,1); assert.equal(bindings[0],null);
  assert.equal(bindings[1].id,D.slotId); assert.equal(bindings[1].pos.x,10658); assert.equal(bindings[1].pos.z,-4236);
  assert.equal(bind('sector_ceres_belt',D.fieldId,1,toGlobal),null);
  const sStart=world.indexOf('  _spawnAsteroid(\n'); const sEnd=world.indexOf('\n  // An authored heavy boulder',sStart);
  let draws=0; const rng=()=>{draws++;return .5;};
  const spawn=vm.runInNewContext('({'+world.slice(sStart,sEnd)+'})._spawnAsteroid',{
    AST_BY_ID:new Map([['ast_common_rock',{id:'ast_common_rock',hp:[10,10],sizeRange:[8,8],yieldU:[2,2],tierCap:1}]]),
    regionalResourceYieldMultiplier:()=>1, regionalEcologyReadout:()=>null,
    environmentSurfaceData:(material,data)=>data,adventureMaterialFor:()=>null,
    applyRockSubstance:()=>1,rockSubstanceForSlot:()=>null,asteroidMass:()=>220,
    asteroidColliderRadius:()=>8,shouldKeepLiveAsteroid:({activityBinding})=>!!activityBinding,
    deriveAsteroidSeams:()=>[],insertAsteroidFieldRock:()=>{throw Error('bound face must stay live');},
  });
  const f=fixture(); const owner={state:f.state,helpers:{spawnEntity:s=>({...s,id:2,alive:true})},
    _stampHomeSector(){},_restoreResourceBody(){}};
  const face=spawn.call(owner,{id:D.fieldId,type:'ast_common_rock'},{_homeSectorId:D.sectorId,tierCap:1},
    {x:10720,z:-4260},240,rng,null,bindings[1],null,1,null);
  assert.equal(draws,5); assert.equal(face.data.activityObjectSlotId,D.slotId); assert.equal(face.data.oreHP,10);
  f.state.entities.set(2,face); f.player.pos={x:10600,z:-4236};
  assert.equal(stepHeliosClaimOpening(f.owner,()=>face).state,'open'); assert.equal(mine(f).units,10);
});

test('production NPC picker/current target/beam reselect other real work before witness, admit face after arming',()=>{
  const source=fs.readFileSync(new URL('../src/systems/npcJobsRuntime.js',import.meta.url),'utf8');
  const start=source.indexOf('  _ensureHeliosStarterMiner() {');
  const end=source.indexOf('  // ── per-tick drive',start);
  const methods=vm.runInNewContext('({'+source.slice(start,end)+'})',{
    heliosClaimAwaitingWitness, NPC_JOB_KIND:{MINER:'miner'}, NPC_JOB_PHASE:{WORK:'work'},
    HELIOS_STARTER_SECTOR_ID:D.sectorId, HELIOS_SEAM_MINER_SLOT_ID:'helios_seam_miner',
    HELIOS_STARTER_MINER_SHIFT_S:20,NPC_MINER_BASE_WORK_S:30,BEAM_MK1:{dps:1,range:1000},
    HELIOS_STARTER_MINER_REASON:'Cutting claim',finite:(n,d)=>Number.isFinite(n)?n:d,
    starterRockMineable:r=>!!r && r.alive!==false && r.type==='asteroid' && r.data.oreHP>0,
    forEachFieldRock:(state,fn)=>{for(const e of state.entities.values())if(e.type==='asteroid')fn(e);},
    forEachLivingWorldActor:(state,fn)=>{for(const e of state.entities.values())if(e.type==='ship')fn(e);},
    promoteAsteroidFieldRock:(state,id)=>state.entities.get(id),
    syncEntityActivitySlotMembership(){},requestActivityReclassify(){},
    ensureHeliosMinerBeam:()=>({dps:1,range:1000}), isHeliosCuttingMiner:e=>e.type==='ship',
  });
  const f=fixture(); f.player.pos.x=1000;
  const npc={id:3,type:'ship',alive:true,pos:{x:200,z:0},data:{worldRecordId:'worker:47',activityActorSlotId:'helios_seam_miner',minerShiftRockId:2,minerShiftActive:true}};
  f.state.entities.set(3,npc);
  const other={id:4,type:'asteroid',alive:true,pos:{x:250,z:0},data:{fieldId:D.fieldId,oreHP:10}};f.state.entities.set(4,other);
  const entry={worldRecordId:'worker:47',entityId:3,job:{kind:'miner',phase:'work',progress:0,workS:30,
    route:[{id:'field:2',pos:{...f.face.pos}}]}};
  const cuts=[]; const owner={...methods,state:f.state,_heliosStarterMinerRecordId:'worker:47',_heliosStarterRockId:2,
    helpers:{},_byId:()=>({'job:worker:47':entry}), _minerFieldRetargetSafe:()=>true,
    _fieldWaypointForMinerJob:job=>({index:0,waypoint:job.route[0]}),
    _asteroidForFieldWaypoint:field=>f.state.entities.get(Number(field.id.slice(6))),
    registry:{get:()=>({applyMining:(id)=>cuts.push(id)})}};
  assert.equal(owner._pickHeliosStarterRock(npc.pos).id,4);
  assert.equal(owner._starterRockForMinerJob(entry),null);
  owner._holdHeliosStarterMinerBeam(entry,npc,1); assert.equal(npc.data.minerShiftActive,false); assert.equal(cuts.length,0);
  owner._ensureHeliosStarterMiner(); assert.equal(owner._heliosStarterRockId,4);
  assert.equal(entry.job.route[0].id,'field:4'); assert.equal(npc.pos.x,200);
  owner._holdHeliosStarterMinerBeam(entry,npc,1); assert.deepEqual(cuts,[4]);
  other.alive=false; owner._heliosStarterRockId=2; entry.heliosShiftStopped=false;
  assert.equal(owner._pickHeliosStarterRock(npc.pos),null);
  owner._holdHeliosStarterMinerBeam(entry,npc,1); assert.equal(npc.data.minerShiftActive,false); assert.deepEqual(cuts,[4]);
  other.alive=true; f.player.pos.x=0;f.step();assert.equal(owner._pickHeliosStarterRock(npc.pos).id,2);
  f.state.world.currentSectorId='sector_ceres_belt';assert.equal(heliosClaimAwaitingWitness(f.state,f.face),false);
});

test('unopened claim with no other mineable rock leaves existing NPC honestly idle, never a phantom cut',()=>{
  const f=fixture(); assert.equal(heliosClaimAwaitingWitness(f.state,f.face),true);
  f.step(); assert.equal(heliosClaimAwaitingWitness(f.state,f.face),false);
  f.state.simTime=201;expireRichSeamOpportunities(f.state);
  assert.equal(heliosClaimAwaitingWitness(f.state,f.face),false);
});

test('actual default Helios chain advances hunt→stake at20s, not an injected seed',()=>{
  const data=fs.readFileSync(new URL('../src/data/sectorCausalChains.js',import.meta.url),'utf8');
  const a=data.indexOf("const HELIOS_SEAM_MINER =");const b=data.indexOf('function heliosCycleNewsText',a);
  const chain=vm.runInNewContext(data.slice(a,b).replace('export const HELIOS_CAUSAL_CHAIN','const HELIOS_CAUSAL_CHAIN')+';HELIOS_CAUSAL_CHAIN');
  const spec={schema:'spaceface.sectorCausalChain.v1',chain,byId:new Map(chain.map(r=>[r.id,r])),maxConcurrent:2,cycleGapS:45};
  const text=fs.readFileSync(new URL('../src/systems/trafficCausalChainOps.js',import.meta.url),'utf8');
  // Imports may legally follow the declaration. This fixture supplies the
  // exercised Helios bindings below; do not evaluate trailing ESM as a script.
  const declarations=text.replace(/^import[\s\S]*?;\r?\n/gm,'');
  const methods=vm.runInNewContext(declarations.slice(declarations.indexOf('export const trafficCausalChainOps =')).replace('export const ','const ')+';trafficCausalChainOps',{
    SECTOR_CAUSAL_CHAINS:new Map([[D.sectorId,spec]]),CERES_ACTIVITY_SECTOR_ID:'sector_ceres_belt',
    TETHYS_ACTIVITY_SECTOR_ID:'sector_tethys_junction',deferredEnterNow:s=>s.simTime,
    stepHeliosClaimOpening,forEachFieldRock:(s,fn)=>{for(const e of s.entities.values())if(e.type==='asteroid')fn(e);},
  });
  const f=fixture();delete f.owner._ceresCausal;
  Object.assign(f.owner,methods,{
    _emitCeresCausalReceipt(){},_stampCeresCausalCue(){},_applyCeresCausalJobHints(){},
    _ceresCausalRequiredActorsLive:()=>true,_ceresCausalRequiredActorsTerminallyGone:()=>false,_ceresCausalActorBySlot:()=>null,
  });
  f.state.simTime=0;f.owner._stepCeresCausalChain(.2);
  assert.equal(f.owner._ceresCausal.active[0].phase,'hunt');assert.equal(f.state.fieldDepletion.opportunitiesOpen,0);
  assert.equal(f.events.filter(e=>e.type==='field:richSeamVisible').length,0);
  assert.match(f.events.find(e=>e.type==='news:publish').payload.text,/first survey pending/);
  f.state.simTime=19.9;f.owner._stepCeresCausalChain(.2);assert.equal(f.state.fieldDepletion.opportunitiesOpen,0);
  f.state.simTime=20;f.owner._stepCeresCausalChain(.1);
  assert.equal(f.owner._ceresCausal.seeds.claim_staked,true);
  assert.equal(f.owner._ceresCausal.active[0].phase,'stake');
  assert.equal(richSeamOpportunityReadout(f.state,D.fieldId,D.slotId).openedAtT,20);
  assert.equal(f.events.filter(e=>e.type==='field:richSeamVisible').length,1);
});

test('visible mark is six-second bounded and never repeats news or crosses invalid body/range/deadline',()=>{
  const f=fixture();f.step();
  for(let i=1;i<60;i++){f.state.simTime=20+i*.1;f.step();}
  assert.equal(f.events.filter(e=>e.type==='field:richSeamVisible').length,1);
  f.state.simTime=26;f.step();
  const marks=f.events.filter(e=>e.type==='field:richSeamVisible');
  assert.equal(marks.length,2);assert.equal(marks[0].payload.announce,true);assert.equal(marks[1].payload.announce,false);
  assert.equal(f.events.filter(e=>e.type==='news:publish').length,1);
  f.player.pos.x=1000;f.state.simTime=32;f.step();assert.equal(f.events.filter(e=>e.type==='field:richSeamVisible').length,2);
  f.player.pos.x=0;f.face.alive=false;f.state.simTime=38;f.step();assert.equal(f.events.filter(e=>e.type==='field:richSeamVisible').length,2);
  f.face.alive=true;f.state.simTime=201;f.step();assert.equal(f.events.filter(e=>e.type==='field:richSeamVisible').length,2);
});

test('actual subscribe→admission→ActionVfx builds attached capture geometry, including reduced modes',async(t)=>{
  const {presentationOrchestrator}=await import(process.env.HELIOS_ORCHESTRATOR_MODULE
    || new URL('../src/systems/presentationOrchestrator.js',import.meta.url).href);
  const renderRoot=process.env.HELIOS_RENDER_ROOT || new URL('../src/render/',import.meta.url).href;
  const {ActionVfx,ACTION_VFX_EVENTS}=await import(new URL('actionVfx.js',renderRoot).href);
  const THREE=await import('three');
  assert.ok(ACTION_VFX_EVENTS.includes('presentation:cue'));
  for(const reduced of [false,true]) {
    const f=fixture();f.state.mode='flight';f.state.settings={video:{motionReduce:reduced,flashReduce:reduced}};
    const listeners=new Map();const bus={on(name,fn){const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list);return()=>{};},
      emit(name,p){for(const fn of listeners.get(name)||[])fn(p);}};
    f.owner.bus=bus;const cues=[];const vfx=new ActionVfx(new THREE.Scene());
    bus.on('presentation:cue',p=>{cues.push(p);vfx.emit('presentation:cue',p,f.state);});
    const orchestrator={...presentationOrchestrator};orchestrator.init({state:f.state,bus});
    assert.equal((listeners.get('field:richSeamVisible')||[]).length,1);
    const facts=[];bus.on('field:richSeamVisible',p=>facts.push(p));f.step();
    assert.equal(cues.length,1);assert.equal(cues[0].id,'mining.survey.tracked');
    assert.equal(cues[0].sourceEvent,'field:richSeamVisible');assert.equal(cues[0].targetId,2);
    assert.match(cues[0].accessibilityText,/Finish this rock/);
    f.state.simTime+=.1;vfx.update(f.state);
    const read=vfx.inspect();assert.ok(read.surfaces>0);assert.equal(read.instances[0].primitive,'capture');
    assert.equal(read.instances[0].id,2);assert.equal(read.instances[0].x,f.face.pos.x);
    if(reduced)assert.equal(read.particles,0);
    t.diagnostic(JSON.stringify({mode:reduced?'reduced-motion-and-flash':'standard',surfaces:read.surfaces,particles:read.particles,primitive:read.instances[0].primitive,targetId:read.instances[0].id}));
    f.state.simTime=26;f.state.tick=1560;f.step();assert.equal(cues.length,2);
    assert.ok(cues[1].playerRelevance<.8,'world pulse must not repeat player caption/UI lanes');
    const stale=facts[1];
    f.state.world.currentSectorId='sector_ceres_belt';bus.emit('field:richSeamVisible',stale);assert.equal(cues.length,2);
    f.state.world.currentSectorId=D.sectorId;f.state.fieldDepletion.opportunities=structuredClone(f.state.fieldDepletion.opportunities);
    bus.emit('field:richSeamVisible',stale);assert.equal(cues.length,2,'restore epoch rejects old deferred fact');
    f.face.alive=false;bus.emit('field:richSeamVisible',{...stale,visualEpoch:heliosClaimVisualEpoch(f.state)});assert.equal(cues.length,2);
    f.face.alive=true;f.state.simTime=201;bus.emit('field:richSeamVisible',{...stale,atS:201,visualEpoch:heliosClaimVisualEpoch(f.state)});assert.equal(cues.length,2);
    vfx.dispose();
  }
});
