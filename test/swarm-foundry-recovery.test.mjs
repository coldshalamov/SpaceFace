import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {createRunState} from '../src/core/runState.js';
import {resolvePhysicsBodySpec,markPhysicsBodyNativeFailure} from '../src/core/physicsAuthority.js';
import {planWave} from '../src/systems/survivalWavePlanner.js';
import {survivalWave} from '../src/systems/survivalWave.js';
import {survivalArena} from '../src/systems/survivalArena.js';
import {spawnBudget} from '../src/systems/spawnBudget.js';
import {swarmArena} from '../src/systems/swarmArena.js';
import {runSession} from '../src/systems/runSession.js';
import {noteSwarmPilotAction} from '../src/systems/swarmSafety.js';
import {planSwarmOpeningLeecher} from '../src/systems/swarmOpeningLeecher.js';
import {swarmQuota,swarmConcurrent} from '../src/data/swarmMode.js';
import {swarmBroodPopulation} from '../src/data/swarmBrood.js';
import {swarmRoundPreview} from '../src/data/swarmLadder.js';
import {foundryFirstExitIntermission,foundryRecoveryIntermission,swarmForecastForRun,swarmNextLine} from '../src/ui/screens/crucibleDraft.js';
const DT=1/60,seed=73311;
const planFor=(wave,extra={})=>planWave({seed,wave,arenaId:'helios_core',ruleset:'swarm',...extra});
function fixture(t,wave,{rock=true}={}){
 const sim=createSimulation({seed,systems:[runSession,spawnBudget,swarmArena,survivalWave,survivalArena]});t.after(()=>sim.dispose());
 const {state,bus}=sim;state.mode='flight';state.rockCore={ratingT:0};
 const player=sim.spawn({type:'ship',team:0,pos:{x:0,z:0},vel:{x:0,z:0},radius:8,mass:40,hull:100,collides:true,data:{}});state.playerId=player.id;resolvePhysicsBodySpec(player);
 let surface=rock?sim.spawn({type:'asteroid',pos:{x:100,z:0},vel:{x:0,z:0},radius:18,mass:500,collides:true,data:{swarmArenaDebris:true}}):null;
 if(surface)resolvePhysicsBodySpec(surface);
 const events=[];for(const type of ['run:waveCleared','swarm:eventTelegraphed','swarm:broodKills','run:awardRequested'])bus.on(type,payload=>events.push({type,payload,tick:state.tick}));
 const start=()=>{sim.registry.get('runSession').newGame();bus.emit('run:beginRequested',{kind:'survival',ruleset:'swarm',seed,arenaId:'helios_core'});state.run.wave=wave;state.run.phase='wave_intro';bus.emit('run:wavePlanned',{wave,plan:planFor(wave)});state.run.phase='active';state.mode='flight';bus.emit('run:waveStarted',{wave});};start();
 const owner=sim.registry.get('survivalWave'),engine=sim.registry.get('swarmArena')._brood;
 return {sim,state,bus,player,surface,start,events,owner,engine,tick(n=1){for(let i=0;i<n;i++)sim.step(DT);},ships:()=>state.entityList.filter(e=>e.alive&&e.type==='ship'&&e.id!==player.id&&owner._cohort.has(e.id))};
}
const census=e=>{const b=e._bodies,result={};for(let i=0;i<b.alive.length;i++)if(b.alive[i]){const f=b.liveFamilyId[b.family[i]];result[f]=(result[f]||0)+1;}return result;};
for(const wave of [11,12])test(`round ${wave}: finite recovery score, truthful forecast, no competing event`,()=>{
 const p=planFor(wave);assert.equal(p.swarm.foundry.id,wave===11?'shed_the_drag':'turn_the_hunt');
 assert.equal(p.swarm.killTarget,swarmQuota(wave));assert.equal(p.swarm.concurrent,swarmConcurrent(wave));assert.equal(p.completionRules.kind,'cohort');
 const preview=swarmRoundPreview({arenaId:'helios_core',wave,seed,plan:p});assert.equal(preview.event,null);assert.equal(preview.foreground.title,p.swarm.foundry.title);
 const run={...createRunState({kind:'survival',ruleset:'swarm',seed}),arenaId:'helios_core',wave:wave-1,phase:'draft'};
 const next=swarmNextLine(swarmForecastForRun(run,wave));assert.match(next,wave===11?/scrape/:/switches flank/);assert.doesNotMatch(next,/invisib|unseen/i);
 if(wave===12){const debut=p.schedule.filter(e=>e.debut);assert.equal(debut.length,1);assert.equal(debut[0].enemyId,'quiet_ghost');assert.equal(debut[0].atTick,0);assert.equal(debut[0].readAfterTicks,1);}
 for(const options of [{arenaId:'the_hive'},{mutators:['heavies_only']},{circuitRound:{kind:'survive'}}])assert.equal(planFor(wave,options).swarm.foundry,undefined);
 assert.equal(planFor(13).swarm.foundry,undefined);
});
for(const wave of [11,12])test(`round ${wave}: idle, staged latch and finite paced reserve use active time`,t=>{
 const h=fixture(t,wave);h.tick(1200);assert.equal(h.engine.view.aliveCount,0);assert.equal(h.ships().length,0);assert.equal(h.engine.view.pendingCount,swarmBroodPopulation(wave));
 noteSwarmPilotAction(h.state);h.tick();if(wave===12){assert.equal(h.ships().length,1);assert.equal(h.ships()[0].data.lootTableId,'quiet_ghost');h.tick(598);assert.equal(h.engine.view.aliveCount,0);h.tick(2);}
 assert.deepEqual(census(h.engine),{leecher:1});assert.equal(h.engine.view.pendingCount,swarmBroodPopulation(wave)-1);assert.equal(h.engine._bank(),null);assert.equal(h.events.length,0);
 const ticks=h.owner._foundryTicks;h.state.mode='pause';h.tick(200);assert.equal(h.owner._foundryTicks,ticks);assert.equal(h.engine.view.aliveCount,1);
 h.state.mode='flight';h.tick();for(let i=0;i<10;i++){h.owner.update();h.engine.step(h.state);}assert.equal(h.owner._foundryTicks,ticks+1);
 // Kill the foreground through the ordinary player damage seam, not deletion.
 const b=h.engine._bodies,slot=b.alive.findIndex(Boolean);h.engine.damageSegment({from:{x:b.px[slot]-5,z:b.pz[slot]},to:{x:b.px[slot]+5,z:b.pz[slot]},damage:100,ownerId:h.player.id});
 const releasedAt=h.owner._foundry.shipReadTicks;h.tick(Math.max(0,releasedAt-h.owner._foundryTicks-1));assert.equal(h.ships().length,wave===12?1:0);assert.equal(h.engine.view.pendingCount,swarmBroodPopulation(wave)-1);
 h.tick(2);assert.ok(h.ships().length>(wave===12?1:0));assert.ok(h.engine.view.aliveCount<=18);h.tick(200);
 const killed=h.events.filter(e=>e.type==='swarm:broodKills').reduce((n,e)=>n+e.payload.removedCount,0);assert.equal(h.engine.view.aliveCount+h.engine.view.pendingCount+killed,swarmBroodPopulation(wave));assert.equal(h.events.filter(e=>e.type==='swarm:eventTelegraphed').length,0);assert.equal(h.events.filter(e=>e.type==='run:waveCleared').length,0);
});
for(const kind of ['missing','blocked_route','moving','sensor','native_failure','expired','unpaid'])test(`scrape placement rejects ${kind} without moving scenery`,t=>{
 const h=fixture(t,11),p=[{id:'leecher',count:1}];
 // Fixture uses actual host geometry; reject every other eligible rock to isolate this original.
 for(const e of h.state.entityList)if(e.type==='asteroid'&&e!==h.surface)e.collides=false;
 if(kind==='missing')h.surface.alive=false;
 if(kind==='blocked_route')h.sim.spawn({type:'station',pos:{x:45,z:0},vel:{x:0,z:0},radius:20,collides:true});
 if(kind==='moving')h.surface.vel.x=20;
 if(kind==='sensor')h.surface.physicsBody={...h.surface.physicsBody,material:'massline_sensor'};
 if(kind==='native_failure')markPhysicsBodyNativeFailure(h.surface,{});
 if(kind==='expired')h.surface.data.despawnAt=10;
 if(kind==='unpaid')p[0].count=0;
 const before=JSON.stringify(h.state.entityList.map(e=>({id:e.id,pos:e.pos,vel:e.vel})));
 assert.equal(planSwarmOpeningLeecher(h.state,h.state.run,11,p,3),null);assert.equal(JSON.stringify(h.state.entityList.map(e=>({id:e.id,pos:e.pos,vel:e.vel}))),before);
});
for(const wave of [11,12])test(`round ${wave}: missing surface falls back without losing debt, retry retires read`,t=>{
 const h=fixture(t,wave);for(const e of h.state.entityList)if(e.type==='asteroid')e.collides=false;
 noteSwarmPilotAction(h.state);h.tick(wave===11?1:601);assert.ok(h.engine.view.aliveCount>0);assert.ok(h.engine.view.aliveCount<=18);
 h.tick(60);assert.ok(h.engine.view.aliveCount>0);assert.equal(h.engine.view.aliveCount+h.engine.view.pendingCount,swarmBroodPopulation(wave));
 h.bus.emit('run:endRequested',{outcome:'aborted',reason:'retry'});h.start();h.tick(1200);assert.equal(h.engine.view.aliveCount,0);assert.equal(h.owner._foundryTicks,0);assert.equal(h.engine.view.pendingCount,swarmBroodPopulation(wave));
});
test('the actual exit bench prepares the recoverable latch without inventing a clear',()=>{
 const run={...createRunState({kind:'survival',ruleset:'swarm',seed}),arenaId:'helios_core',wave:10,phase:'refit',credits:137};
 assert.match(foundryFirstExitIntermission(run),/scrape solid rock at speed/);assert.match(foundryFirstExitIntermission(run),/not the end/);
 run.telemetry={...run.telemetry,startWave:11};assert.equal(foundryFirstExitIntermission(run),null);
});

// Fixture positions target the temporal contact seam, not a claimed flown journey.
for(const radius of [6,16,28])test(`Leecher meets a ${radius}-WU hull at current contact, not a pre-step miss`,t=>{
 const h=fixture(t,11);h.player.radius=radius;h.player.physicsBody=null;resolvePhysicsBodySpec(h.player);noteSwarmPilotAction(h.state);h.tick();
 const b=h.engine._bodies,i=b.alive.findIndex(Boolean);assert.ok(i>=0);
 b.px[i]=-(radius+3+0.2);b.pz[i]=0;b.vx[i]=54;b.vz[i]=0;
 h.tick();assert.equal(b.alive[i],1);assert.equal(b.phase[i],4);assert.equal(h.events.filter(e=>e.type==='swarm:broodKills').length,0);
 h.player.vel.x=6;h.player.pos.x=h.surface.pos.x-h.surface.radius-radius;h.tick();assert.equal(b.alive[i],1,'slow surface contact does not shed');
 h.player.vel.x=10;h.tick();assert.equal(b.alive[i],0,'the existing speed threshold sheds the same latch');
});
for(const radius of [16,28])test(`a deliberate fast closing ${radius}-WU hull retains its real ram`,t=>{
 const h=fixture(t,11);h.player.radius=radius;h.player.physicsBody=null;resolvePhysicsBodySpec(h.player);noteSwarmPilotAction(h.state);h.tick();
 const b=h.engine._bodies,i=b.alive.findIndex(Boolean);b.px[i]=-(radius+3+0.2);b.pz[i]=0;b.vx[i]=54;b.vz[i]=0;h.player.vel.x=-40;
 h.tick();assert.equal(b.alive[i],0);assert.ok(h.events.some(e=>e.type==='swarm:broodKills'&&e.payload.cause==='collision'));
});

test('native ordinary input earns a latch, fast scrape, and one award while a deliberate ram remains an alternative',async t=>{
 const {bootRealPath}=await import('../scripts/lib/bench/realPath.mjs');const {input}=await import('../src/systems/input.js');const {combat}=await import('../src/systems/combat.js');const {COMBAT_LAB_STARTER_PACKAGES}=await import('../src/data/combatLabSetups.js');
 const kit=COMBAT_LAB_STARTER_PACKAGES.find(k=>k.id==='ricochet_runner'),fittings=Array(13).fill(null);for(const row of kit.loadout)fittings[row.slotIndex]=row.defId;
 const report=[];
 for(const mode of ['stay','scrape','ram']){
  const h=await bootRealPath({seed,systems:[input,runSession,spawnBudget,survivalWave,swarmArena,survivalArena,combat,'tacticalAI','actions','weapons','flightV3','aiPorts','physics'],hulls:[{hullId:kit.hullId,fittings,isPlayer:true,pos:{x:0,z:0}}]});
  try{
   const s=h.state,p=h.player,tells=[],kills=[],actions=[],awards=[];s.run={...createRunState({kind:'survival',ruleset:'swarm',seed}),arenaId:'helios_core',wave:11,phase:'wave_intro'};s.input.autoFire=false;
   h.bus.emit('run:wavePlanned',{wave:11,plan:planFor(11)});s.run.phase='active';h.bus.emit('run:waveStarted',{wave:11});
   const e=h.runtime.getSystem('swarmArena')._brood;
   h.bus.on('swarm:broodTelegraph',x=>tells.push({tick:s.tick,...x}));h.bus.on('swarm:broodKills',x=>kills.push({tick:s.tick,...x}));h.bus.on('run:awardRequested',x=>awards.push(x));
   const ingress=h.runtime.getSystem('input');const key=(code,pressed)=>{actions.push({tick:s.tick,code,pressed});ingress.ingestLaneDomEvent({type:pressed?'keydown':'keyup',code,pressed,blocked:false});};
   const original=planSwarmOpeningLeecher(s,s.run,11,[{id:'leecher',count:1}],3);assert.ok(original);const surface=s.entities.get(original.rockId);const identity=surface;
   key('Digit0',true);h.step(1);key('Digit0',false);
   for(let i=0;i<400;i++){
    if(mode==='scrape'&&i===250)key('KeyE',true);
    if(mode==='ram'&&i===140)key('KeyQ',true);
    h.step(1);
   }
   assert.equal(h.proof().backend,'rapier-dynamic');assert.equal(h.proof().flightBackend,'v3');assert.equal(s.entities.get(identity.id),identity);assert.equal(p.hull,260);
   const latch=tells.filter(x=>x.familyId==='leecher');
   if(mode==='stay'){assert.equal(latch.length,1);assert.equal(kills.length,0);assert.equal(e.view.aliveCount,1);assert.equal(e._bodies.phase[e._bodies.alive.findIndex(Boolean)],4);}
   else {assert.equal(kills.length,1);assert.equal(kills[0].removedCount,1);assert.equal(kills[0].cause,'collision');assert.equal(kills[0].credits,2);assert.equal(kills[0].score,22);assert.equal(s.run.credits,2);assert.equal(s.run.score,22);assert.equal(awards.filter(x=>x.credits===2&&x.score===22).length,1);assert.equal(latch.length,mode==='scrape'?1:0);}
   assert.equal(e.view.pendingCount,swarmBroodPopulation(11)-1);assert.equal(s.run.spawnedThreat,0);
   report.push({mode,latch:latch[0]?.tick,kill:kills[0]?.tick,purse:s.run.credits,score:s.run.score,hull:p.hull,position:{...p.pos},actions,surfaceId:identity.id});
  }finally{h.dispose();}
 }
 t.diagnostic(JSON.stringify({report,limit:'Round entry, kit and initial pilot pose are staged; the latch, movement, scrape, kill and award use ordinary production owners. No earlier earned rounds or rendered acceptance.'}));
});

test('recovery phases preserve campaign saves; live Swarm does not invent save/Continue',async()=>{
 const {save}=await import('../src/save/saveSystem.js');const {createGameState}=await import('../src/core/gameState.js');const {createBus}=await import('../src/core/eventBus.js');
 const previous=globalThis.localStorage,bytes=new Map([['sf.save.auto','campaign'],['sf.save.index','index']]);globalThis.localStorage={getItem:k=>bytes.get(k)??null,setItem:(k,v)=>bytes.set(k,String(v)),removeItem:k=>bytes.delete(k),key:i=>[...bytes.keys()][i],get length(){return bytes.size;}};
 const state=createGameState(seed),bus=createBus(),owner=Object.create(save),before=new Map(bytes);
 try{owner.init({state,bus,helpers:{},registry:{get:()=>null}});for(const [wave,phase] of [[10,'refit'],[11,'active'],[11,'draft'],[12,'active'],[12,'draft'],[13,'wave_intro']]){state.run={...createRunState({kind:'survival',ruleset:'swarm',seed}),wave,phase,arenaId:'helios_core'};assert.equal(owner._campaignSaveSuppressed(),true);assert.equal(owner.save('auto'),false);assert.equal(owner.save('manual1'),false);assert.deepEqual(bytes,before);}}
 finally{owner.destroy?.();if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});

for(const wave of [11,12])test(`mounted recovery Armory launches ${wave+1} in the same endless run`,async()=>{
 const {fakeDom,textLines}=await import('./helpers/fake-dom.mjs');const {createGameState}=await import('../src/core/gameState.js');const {createBus}=await import('../src/core/eventBus.js');const {survivalRun}=await import('../src/systems/survivalRun.js');const {survivalDraft}=await import('../src/systems/survivalDraft.js');const {crucibleDraftScreen}=await import('../src/ui/screens/crucibleDraft.js');
 const previous=globalThis.document,doc=fakeDom();globalThis.document=doc;const make=doc.createElement;doc.createElement=tag=>{const n=make(tag);Object.defineProperty(n,'parentElement',{get(){return this.parentNode;}});return n;};
 const state=createGameState(seed),bus=createBus(),session=Object.create(runSession),machine=Object.create(survivalRun),shop=Object.create(survivalDraft);const registry={get:n=>n==='runSession'?session:n==='survivalRun'?machine:n==='survivalDraft'?shop:null};const ctx={state,bus,registry,helpers:{}};const screen=Object.create(crucibleDraftScreen),ended=[];bus.on('run:ended',x=>ended.push(x));
 try{session.init(ctx);machine.init(ctx);shop.init(ctx);bus.emit('run:beginRequested',{kind:'survival',ruleset:'swarm',seed,arenaId:'helios_core'});
  // A completed-round fixture exercises real UI/phase owners; it is not earned combat.
  state.run.wave=wave;bus.emit('run:awardRequested',{credits:137,reason:'fixture'});bus.emit('run:transitionRequested',{expectedPhase:'loadout',nextPhase:'draft',reason:'fixture',tick:0});
  const root=doc.createElement('div');screen.mount(root,ctx);screen.update?.(0,ctx);assert.match(screen._sub.textContent,wave===11?/changes flank/:/Swarm continues/);assert.match(textLines(root).join(' '),new RegExp(`Launch round ${wave+1}`));
  screen._skip.click();machine.update(DT);assert.equal(state.run.phase,'wave_intro');assert.equal(state.run.wave,wave+1);assert.equal(state.run.credits,137);assert.equal(state.run.ruleset,'swarm');assert.equal(ended.length,0);
  state.run.wave=wave;state.run.phase='draft';state.run.telemetry={...state.run.telemetry,startWave:wave+1};assert.equal(foundryRecoveryIntermission(state.run),null);
 }finally{screen.unmount?.();shop.destroy();machine.destroy();session.destroy();globalThis.document=previous;}
});

test('native Ghost keeps its real charge and opposite-flank relocation; timed ordinary controls reduce sampled hits',async t=>{
 const {bootRealPath}=await import('../scripts/lib/bench/realPath.mjs');const {input}=await import('../src/systems/input.js');const {combat}=await import('../src/systems/combat.js');const {COMBAT_LAB_STARTER_PACKAGES}=await import('../src/data/combatLabSetups.js');
 const kit=COMBAT_LAB_STARTER_PACKAGES.find(k=>k.id==='ricochet_runner'),fittings=Array(13).fill(null);for(const row of kit.loadout)fittings[row.slotIndex]=row.defId;
 const reports=[];
 for(const dodge of [false,true]){
  const h=await bootRealPath({seed,systems:[input,runSession,spawnBudget,survivalWave,swarmArena,survivalArena,combat,'tacticalAI','actions','weapons','flightV3','aiPorts','physics'],hulls:[{hullId:kit.hullId,fittings,isPlayer:true,pos:{x:0,z:0}}]});
  try{
   const s=h.state,p=h.player,tells=[],hits=[],switches=[],actions=[];s.run={...createRunState({kind:'survival',ruleset:'swarm',seed}),arenaId:'helios_core',wave:12,phase:'wave_intro'};s.input.autoFire=false;
   h.bus.emit('run:wavePlanned',{wave:12,plan:planFor(12)});s.run.phase='active';h.bus.emit('run:waveStarted',{wave:12});
   h.bus.on('ai:telegraph',x=>{if(x.kind==='sensor_ghost')tells.push({tick:s.tick,...x});});h.bus.on('combat:damage',x=>{if(x.targetId===p.id)hits.push({tick:s.tick,amount:x.amount,attacker:x.attackerId});});
   const ingress=h.runtime.getSystem('input'),key=(code,pressed)=>{actions.push({tick:s.tick,code,pressed});ingress.ingestLaneDomEvent({type:pressed?'keydown':'keyup',code,pressed,blocked:false});};
   key('Digit0',true);h.step(1);key('Digit0',false);let seen=0,lastCue=null,direction='KeyW',prior=null,ghost;
   for(let i=0;i<1050;i++){
    if(dodge&&lastCue!=null&&s.tick===lastCue+40){key(direction,false);key('Digit0',true);}
    h.step(1);ghost||=s.entityList.find(e=>e.data?.lootTableId==='quiet_ghost');
    if(tells.length>seen){seen=tells.length;lastCue=s.tick;if(dodge){key('Digit0',false);key(direction,false);direction=seen%2?'KeyW':'KeyS';key(direction,true);}}
    const live=ghost&&h.runtime.getSystem('tacticalAI').stack.combatDoctrine.inspect(ghost.id);
    if(live&&prior&&live.phase==='relocate'&&prior.phase==='fire_window')switches.push({tick:s.tick,before:prior.side,after:live.side});
    if(live)prior=live;
    if(i<598)assert.equal(h.runtime.getSystem('swarmArena')._brood.view.aliveCount,0,'Ghost owns the first ten seconds');
    assert.equal(s.run.spawnedThreat,1,'no competing ship crowd before tick 1080');
   }
   assert.equal(ghost.data.ai.combatDoctrineId,'ranged_stalker');assert.ok(tells.length>=3);assert.ok(tells.every(x=>x.durationTicks>=36));assert.ok(switches.length>0);assert.ok(switches.every(x=>x.after===-x.before));assert.ok(hits.some(x=>x.attacker===ghost.id),'real rail/EMP attack remains dangerous');
   reports.push({dodge,cues:tells.map(x=>x.tick),switches,hits:hits.filter(x=>x.attacker===ghost.id),position:{...p.pos},actions,hull:p.hull});
  }finally{h.dispose();}
 }
 assert.ok(reports[1].hits.length<reports[0].hits.length);t.diagnostic(JSON.stringify({reports,limit:'Staged round/kit/pose, not prior earned play; sampled controls improve this seed but are not perfect evasion or rendered/hardware feel.'}));
});

for(const velocity of [{x:0,z:40},{x:-28,z:28},{x:20,z:0}])test(`fast oblique/escaping pilot motion retains existing plow ${JSON.stringify(velocity)}`,t=>{
 const h=fixture(t,11);h.player.radius=28;h.player.physicsBody=null;resolvePhysicsBodySpec(h.player);noteSwarmPilotAction(h.state);h.tick();const b=h.engine._bodies,i=b.alive.findIndex(Boolean);
 b.px[i]=-31.2;b.pz[i]=0;b.vx[i]=54;b.vz[i]=0;Object.assign(h.player.vel,velocity);h.tick();assert.equal(b.alive[i],0);assert.ok(h.events.some(e=>e.type==='swarm:broodKills'&&e.payload.cause==='collision'));
});

test('production room leases remain usable; imminently retiring surfaces do not',t=>{
 const h=fixture(t,11);for(const e of h.state.entityList)if(e.type==='asteroid'&&e!==h.surface)e.collides=false;
 const p=[{id:'leecher',count:1}];h.surface.data.despawnAt=h.state.simTime+900;
 assert.equal(planSwarmOpeningLeecher(h.state,h.state.run,11,p,3)?.rockId,h.surface.id);
 h.surface.data.despawnAt=h.state.simTime+30;assert.equal(planSwarmOpeningLeecher(h.state,h.state.run,11,p,3),null);
 h.surface.data.despawnAt=h.state.simTime+30.01;assert.equal(planSwarmOpeningLeecher(h.state,h.state.run,11,p,3)?.rockId,h.surface.id);
});

test('Leecher sheds at the real larger bank proxy, without widening the general terrain law',t=>{
 const h=fixture(t,11);h.surface.physicsBody={...h.surface.physicsBody,radius:25};
 assert.equal(resolvePhysicsBodySpec(h.surface).radius,25);for(const e of h.state.entityList)if(e.type==='asteroid'&&e!==h.surface)e.collides=false;
 assert.equal(planSwarmOpeningLeecher(h.state,h.state.run,11,[{id:'leecher',count:1}],3)?.rockId,h.surface.id);
 noteSwarmPilotAction(h.state);h.tick();const b=h.engine._bodies,i=b.alive.findIndex(Boolean);b.px[i]=8;b.pz[i]=0;b.vx[i]=0;b.vz[i]=0;h.tick();assert.equal(b.phase[i],4);
 h.player.pos.x=h.surface.pos.x-25-h.player.radius;h.player.vel.x=10;h.tick();assert.equal(b.alive[i],0);assert.equal(h.events.filter(e=>e.type==='swarm:broodKills').length,1);
});
