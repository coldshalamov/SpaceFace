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
import {planSwarmOpeningGlassback} from '../src/systems/swarmOpeningGlassback.js';
import {swarmQuota,swarmConcurrent} from '../src/data/swarmMode.js';
import {swarmBroodPopulation} from '../src/data/swarmBrood.js';
import {swarmRoundPreview} from '../src/data/swarmLadder.js';
import {foundrySecondExitIntermission,swarmArmoryExitLabel,refitFootLines,swarmForecastForRun,swarmNextLine} from '../src/ui/screens/crucibleDraft.js';
import {planSwarmBellowsPocket} from '../src/systems/swarmBellowsPocket.js';
import {swarmEventFor} from '../src/data/swarmEvents.js';
import {resolvePdCharge} from '../src/ai/pdScreen.js';
const DT=1/60,seed=4242;
const planFor=(wave,extra={})=>planWave({seed,wave,arenaId:'helios_core',ruleset:'swarm',...extra});
function fixture(t,wave,{rock=true}={}){
 const sim=createSimulation({seed,systems:[runSession,spawnBudget,swarmArena,survivalWave,survivalArena]});t.after(()=>sim.dispose());
 const {state,bus}=sim;state.mode='flight';state.rockCore={ratingT:0};
 const player=sim.spawn({type:'ship',team:0,pos:{x:0,z:0},vel:{x:0,z:0},radius:8,mass:40,hull:100,collides:true,data:{}});state.playerId=player.id;resolvePhysicsBodySpec(player);
 let surface=rock?sim.spawn({type:'asteroid',pos:{x:270,z:0},vel:{x:0,z:0},radius:28,mass:460,collides:true,data:{swarmArenaDebris:true}}):null;
 if(surface)resolvePhysicsBodySpec(surface);
 const events=[];for(const type of ['run:waveCleared','swarm:eventTelegraphed','swarm:broodKills','run:awardRequested','swarm:broodTelegraph','swarm:broodBurst'])bus.on(type,payload=>events.push({type,payload,tick:state.tick}));
 const start=()=>{sim.registry.get('runSession').newGame();bus.emit('run:beginRequested',{kind:'survival',ruleset:'swarm',seed,arenaId:'helios_core'});state.run.wave=wave;state.run.phase='wave_intro';bus.emit('run:wavePlanned',{wave,plan:planFor(wave)});state.run.phase='active';state.mode='flight';bus.emit('run:waveStarted',{wave});};start();
 const owner=sim.registry.get('survivalWave'),engine=sim.registry.get('swarmArena')._brood;
 return {sim,state,bus,player,surface,start,events,owner,engine,tick(n=1){for(let i=0;i<n;i++)sim.step(DT);},ships:()=>state.entityList.filter(e=>e.alive&&e.type==='ship'&&e.id!==player.id&&owner._cohort.has(e.id))};
}
const census=e=>{const b=e._bodies,result={};for(let i=0;i<b.alive.length;i++)if(b.alive[i]){const f=b.liveFamilyId[b.family[i]];result[f]=(result[f]||0)+1;}return result;};

for(const wave of [16,17,18,19,20])test(`post-Foreman ${wave}: finite source-owned act, genuine forecast and later endless continuation`,()=>{
 const p=planFor(wave);assert.ok(p.swarm.foundry);assert.equal(p.swarm.killTarget,swarmQuota(wave));assert.equal(p.swarm.concurrent,swarmConcurrent(wave));assert.equal(p.completionRules.kind,'cohort');assert.equal(p.swarm.boss,false);
 const preview=swarmRoundPreview({arenaId:'helios_core',wave,seed,plan:p});assert.equal(preview.foreground.title,p.swarm.foundry.title);
 if(wave===20)assert.equal(preview.event.name,swarmEventFor({arenaId:'helios_core',wave,seed}).name);else assert.equal(preview.event,null);
 for(const extra of [{arenaId:'the_hive'},{mutators:['dense']},{mutators:['heavies_only']},{circuitRound:{kind:'survive'}},{ruleset:'scored'}])assert.equal(planFor(wave,extra).swarm?.foundry,undefined);
 assert.equal(planFor(21).swarm.foundry,undefined);
});
for(const wave of [16,17,18,19,20])test(`post-Foreman ${wave}: idle, pause, duplicate tick, finite reserve, retry`,t=>{
 const h=fixture(t,wave);h.tick(900);assert.equal(h.owner._foundryTicks,0);assert.equal(h.engine.view.aliveCount,0);assert.equal(h.ships().length,0);
 noteSwarmPilotAction(h.state);h.tick();const expected=wave===17?0:wave===20?2:1;assert.equal(h.ships().length,expected);
 const names=h.ships().map(x=>x.data.lootTableId).sort();
 if(wave===16)assert.deepEqual(names,['tether_control_raider']);if(wave===18)assert.deepEqual(names,['bruiser_brawler']);
 if(wave===19)assert.deepEqual(names,['enemy_iron_kraken']);
 if(wave===20){assert.deepEqual(names,['pd_screen_escort','tether_control_raider']);const screen=h.ships().find(x=>x.data.lootTableId==='pd_screen_escort');assert.equal(resolvePdCharge(screen,h.state)?.data.lootTableId,'tether_control_raider');}
 const ticks=h.owner._foundryTicks;h.state.mode='pause';h.tick(100);assert.equal(h.owner._foundryTicks,ticks);h.state.mode='flight';h.tick();for(let i=0;i<10;i++){h.owner.update();h.engine.step(h.state);}assert.equal(h.owner._foundryTicks,ticks+1);
 if(wave===17)assert.deepEqual(census(h.engine),{bellows:1,mite:3});
 if(wave===20){h.tick(359-h.owner._foundryTicks);assert.equal(h.ships().length,2);h.tick();assert.equal(h.ships().length,3);assert.ok(h.ships().some(x=>x.data.lootTableId==='bruiser_brawler'));}
 h.tick(Math.max(0,h.owner._foundry.shipReadTicks-h.owner._foundryTicks)+61);assert.ok(h.engine.view.aliveCount>0);assert.ok(h.ships().length>expected);assert.equal(h.engine._bank(),null);
 const killed=h.events.filter(e=>e.type==='swarm:broodKills').reduce((n,e)=>n+e.payload.removedCount,0);assert.equal(h.engine.view.aliveCount+h.engine.view.pendingCount+killed,swarmBroodPopulation(wave));assert.equal(h.events.filter(e=>e.type==='run:waveCleared').length,0);
 h.bus.emit('run:endRequested',{outcome:'aborted',reason:'retry'});h.start();h.tick(900);assert.equal(h.owner._foundryTicks,0);assert.equal(h.engine.view.aliveCount,0);assert.equal(h.ships().length,0);
});
for(const kind of ['missing','moving','small','sensor','native_failure','expiring','blocked_shot','blocked_escape','unpaid','held','wreck'])test(`Bellows bank rejects ${kind} without moving matter or minting lives`,t=>{
 const h=fixture(t,17),plan=[{id:'bellows',count:1},{id:'mite',count:3}];for(const e of h.state.entityList)if(['asteroid','wreck'].includes(e.type)&&e!==h.surface)e.collides=false;
 if(kind==='missing')h.surface.alive=false;if(kind==='moving')h.surface.vel.x=10;if(kind==='small'){h.surface.radius=10;h.surface.physicsBody=null;}
 if(kind==='sensor')h.surface.physicsBody={...h.surface.physicsBody,material:'massline_sensor'};if(kind==='native_failure')markPhysicsBodyNativeFailure(h.surface,{});if(kind==='expiring')h.surface.data.despawnAt=10;
 if(kind==='blocked_shot')h.sim.spawn({type:'station',pos:{x:80,z:0},radius:12,collides:true});
 if(kind==='blocked_escape')for(const z of [-70,70])h.sim.spawn({type:'station',pos:{x:0,z},radius:25,collides:true});
 if(kind==='unpaid')plan[1].count=2;if(kind==='held'){h.state.player??={};h.state.player.tether={active:true,targetId:h.surface.id};}if(kind==='wreck')h.surface.type='wreck';
 const before=JSON.stringify(h.state.entityList.map(e=>({id:e.id,pos:e.pos,vel:e.vel})));assert.equal(planSwarmBellowsPocket(h.state,h.state.run,17,plan,5.6,3),null);assert.equal(JSON.stringify(h.state.entityList.map(e=>({id:e.id,pos:e.pos,vel:e.vel}))),before);
});
test('Bellows pocket uses a native bank and full escape, keeps exact debt, and first projectile damage does not invent a two-shot kill',t=>{
 const h=fixture(t,17);for(const e of h.state.entityList)if(['asteroid','wreck'].includes(e.type)&&e!==h.surface)e.collides=false;
 const plan=[{id:'bellows',count:1},{id:'mite',count:3}],scene=planSwarmBellowsPocket(h.state,h.state.run,17,plan,5.6,3);assert.ok(scene);assert.equal(scene.bankId,h.surface.id);assert.ok(scene.bellows.x>=130);noteSwarmPilotAction(h.state);h.tick();assert.deepEqual(census(h.engine),{bellows:1,mite:3});assert.equal(h.engine.view.pendingCount,swarmBroodPopulation(17)-4);
 const b=h.engine._bodies,i=b.alive.findIndex((v,j)=>v&&b.liveFamilyId[b.family[j]]==='bellows'),hp=b.hp[i];
 h.engine.damageSegment({from:{x:b.px[i]-10,z:b.pz[i]},to:{x:b.px[i]+10,z:b.pz[i]},damage:1,ownerId:h.player.id});assert.ok(b.hp[i]<hp);assert.equal(b.alive[i],1);assert.equal(h.events.filter(x=>x.type==='swarm:broodTelegraph').length,0);
 h.engine.damageSegment({from:{x:b.px[i]-10,z:b.pz[i]},to:{x:b.px[i]+10,z:b.pz[i]},damage:999,ownerId:h.player.id});assert.equal(b.alive[i],1);assert.equal(h.events.filter(x=>x.type==='swarm:broodTelegraph').length,1);
 h.engine.damageSegment({from:{x:b.px[i]-10,z:b.pz[i]},to:{x:b.px[i]+10,z:b.pz[i]},damage:999,ownerId:h.player.id});assert.equal(b.alive[i],0);assert.equal(h.events.filter(x=>x.type==='swarm:broodBurst').length,1);
});
for(const wave of [17,19])test(`round ${wave}: missing bank falls through to ordinary bounded debt`,t=>{
 const h=fixture(t,wave);for(const e of h.state.entityList)if(['asteroid','wreck'].includes(e.type))e.collides=false;noteSwarmPilotAction(h.state);h.tick(wave===17?2:481);if(wave===19){assert.equal(h.engine.view.aliveCount,0);h.tick(660);}assert.ok(h.engine.view.aliveCount>0&&h.engine.view.aliveCount<=18);assert.equal(h.engine.view.aliveCount+h.engine.view.pendingCount,swarmBroodPopulation(wave));h.tick(100);assert.ok(h.engine.view.aliveCount>18);
});
for(const accept of [false,true])test(`second-exit wager ${accept?'accepted':'refused'} retains real event, timing and wallet owner`,t=>{
 const h=fixture(t,20);noteSwarmPilotAction(h.state);h.tick(719);assert.equal(h.events.filter(x=>x.type==='swarm:eventTelegraphed').length,0);h.tick(2);const cue=h.events.find(x=>x.type==='swarm:eventTelegraphed').payload;assert.equal(cue.eventId,swarmEventFor({arenaId:'helios_core',wave:20,seed}).id);h.bus.emit('swarm:eventVerdict',{eventId:cue.eventId,wave:20,accept});h.tick(500);assert.equal(h.events.filter(x=>x.type==='run:awardRequested'&&x.payload.reason==='swarm:eventBounty').length,accept?1:0);assert.equal(h.events.filter(x=>x.type==='run:waveCleared').length,0);
});

test('checkpoint openings never claim an unplayed clear, but clearing a round-twenty start earns the exit copy',async()=>{
  const {createGameState}=await import('../src/core/gameState.js');
  const {createBus}=await import('../src/core/eventBus.js');
  const {survivalRun}=await import('../src/systems/survivalRun.js');
  const {survivalDraft}=await import('../src/systems/survivalDraft.js');
  for(const startWave of [20,21]){
    const state=createGameState(73311),bus=createBus(),session=Object.create(runSession),machine=Object.create(survivalRun),shop=Object.create(survivalDraft);
    const registry={get:name=>name==='runSession'?session:name==='survivalRun'?machine:name==='survivalDraft'?shop:null};
    const ctx={state,bus,registry,helpers:{}};
    try{
      session.init(ctx);machine.init(ctx);shop.init(ctx);
      bus.emit('run:beginRequested',{kind:'survival',ruleset:'swarm',seed:73311,arenaId:'helios_core',startWave});
      bus.emit('run:transitionRequested',{expectedPhase:'loadout',nextPhase:'draft',reason:'fixture',tick:0});
      assert.equal(state.run.wave,startWave-1);assert.equal(state.run.telemetry.startWave,startWave);
      assert.equal(foundrySecondExitIntermission(state.run),null);
      assert.equal(swarmArmoryExitLabel(state.run),`Launch round ${startWave}`);
      if(startWave===20){
        bus.emit('run:draftPickRequested',{offerId:null});machine.update(DT);
        assert.equal(state.run.phase,'wave_intro');assert.equal(state.run.wave,20);
        bus.emit('run:waveIntroComplete',{});machine.update(DT);assert.equal(state.run.phase,'active');
        // A synthetic clear isolates the public phase owners, not an earned gameplay claim.
        bus.emit('run:waveCleared',{wave:20});machine.update(DT);
        for(let i=0;i<600&&state.run.phase==='cleanup';i++){state.tick++;machine.update(DT);}
        assert.equal(state.run.phase,'draft');assert.equal(state.run.wave,20);
        assert.match(foundrySecondExitIntermission(state.run),/Round 20 cleared/);
        assert.equal(swarmArmoryExitLabel(state.run),'Open exit bench');
        bus.emit('run:draftPickRequested',{offerId:null});machine.update(DT);assert.equal(state.run.phase,'refit');
        assert.match(foundrySecondExitIntermission(state.run),/Second exit reached/);
      }
    }finally{shop.destroy();machine.destroy();session.destroy();}
  }
});

test('second exit honestly names purse, spending, bank and endless continuation',()=>{
 const run={...createRunState({kind:'survival',ruleset:'swarm',seed}),arenaId:'helios_core',wave:20,phase:'draft',credits:137};assert.match(foundrySecondExitIntermission(run),/137 cr/);assert.equal(swarmArmoryExitLabel(run),'Open exit bench');run.phase='refit';assert.match(foundrySecondExitIntermission(run),/Launch round 21/);assert.equal(refitFootLines(run).primary,'Launch round 21');assert.equal(refitFootLines(run).bank,'Bank 68 cr, keep flying');assert.equal(refitFootLines(run).extract,'Extract — end the run here');
 for(const wave of [15,16,17,18,19]){run.wave=wave;run.phase='draft';assert.match(foundrySecondExitIntermission(run),new RegExp(`Round ${wave} cleared`));assert.equal(foundrySecondExitIntermission({...run,telemetry:{startWave:wave+1}}),null);}
 for(const extra of [{arenaId:'the_hive'},{arenaMutators:['dense']},{telemetry:{circuit:{}}},{ruleset:'scored'},{phase:'active'}])assert.equal(foundrySecondExitIntermission({...run,...extra}),null);
});
for(const wave of [15,16,17,18,19,20])test(`mounted post-Foreman Armory opens next phase after ${wave} without spending`,async()=>{
 const {fakeDom,textLines}=await import('./helpers/fake-dom.mjs');const {createGameState}=await import('../src/core/gameState.js');const {createBus}=await import('../src/core/eventBus.js');const {survivalRun}=await import('../src/systems/survivalRun.js');const {survivalDraft}=await import('../src/systems/survivalDraft.js');const {crucibleDraftScreen}=await import('../src/ui/screens/crucibleDraft.js');
 const previous=globalThis.document,doc=fakeDom();globalThis.document=doc;const make=doc.createElement;doc.createElement=tag=>{const n=make(tag);Object.defineProperty(n,'parentElement',{get(){return this.parentNode;}});return n;};
 const state=createGameState(seed),bus=createBus(),session=Object.create(runSession),machine=Object.create(survivalRun),shop=Object.create(survivalDraft);const registry={get:n=>n==='runSession'?session:n==='survivalRun'?machine:n==='survivalDraft'?shop:null};const ctx={state,bus,registry,helpers:{}};const screen=Object.create(crucibleDraftScreen),ended=[];bus.on('run:ended',x=>ended.push(x));
 try{session.init(ctx);machine.init(ctx);shop.init(ctx);bus.emit('run:beginRequested',{kind:'survival',ruleset:'swarm',seed,arenaId:'helios_core'});state.run.wave=wave;bus.emit('run:awardRequested',{credits:137,reason:'fixture'});bus.emit('run:transitionRequested',{expectedPhase:'loadout',nextPhase:'draft',reason:'fixture',tick:0});const root=doc.createElement('div');screen.mount(root,ctx);screen.update?.(0,ctx);assert.match(screen._sub.textContent,new RegExp(`Round ${wave} cleared`));assert.match(textLines(root).join(' '),wave===20?/Open exit bench/:new RegExp(`Launch round ${wave+1}`));screen._skip.click();machine.update(DT);assert.equal(state.run.credits,137);assert.equal(state.run.phase,wave===20?'refit':'wave_intro');assert.equal(state.run.wave,wave===20?20:wave+1);assert.equal(ended.length,0);
 }finally{screen.unmount?.();shop.destroy();machine.destroy();session.destroy();globalThis.document=previous;}
});
