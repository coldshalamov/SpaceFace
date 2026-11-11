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
import {foundrySecondExitIntermission,foundryForemanIntermission,swarmForecastForRun,swarmNextLine} from '../src/ui/screens/crucibleDraft.js';
const DT=1/60,seed=4242;
const planFor=(wave,extra={})=>planWave({seed,wave,arenaId:'helios_core',ruleset:'swarm',...extra});
function fixture(t,wave,{rock=true}={}){
 const sim=createSimulation({seed,systems:[runSession,spawnBudget,swarmArena,survivalWave,survivalArena]});t.after(()=>sim.dispose());
 const {state,bus}=sim;state.mode='flight';state.rockCore={ratingT:0};
 const player=sim.spawn({type:'ship',team:0,pos:{x:0,z:0},vel:{x:0,z:0},radius:8,mass:40,hull:100,collides:true,data:{}});state.playerId=player.id;resolvePhysicsBodySpec(player);
 let surface=rock?sim.spawn({type:'asteroid',pos:{x:70,z:0},vel:{x:0,z:0},radius:4,mass:16,collides:true,data:{swarmArenaDebris:true}}):null;
 if(surface)resolvePhysicsBodySpec(surface);
 const events=[];for(const type of ['run:waveCleared','swarm:eventTelegraphed','swarm:broodKills','run:awardRequested'])bus.on(type,payload=>events.push({type,payload,tick:state.tick}));
 const start=()=>{sim.registry.get('runSession').newGame();bus.emit('run:beginRequested',{kind:'survival',ruleset:'swarm',seed,arenaId:'helios_core'});state.run.wave=wave;state.run.phase='wave_intro';bus.emit('run:wavePlanned',{wave,plan:planFor(wave)});state.run.phase='active';state.mode='flight';bus.emit('run:waveStarted',{wave});};start();
 const owner=sim.registry.get('survivalWave'),engine=sim.registry.get('swarmArena')._brood;
 return {sim,state,bus,player,surface,start,events,owner,engine,tick(n=1){for(let i=0;i<n;i++)sim.step(DT);},ships:()=>state.entityList.filter(e=>e.alive&&e.type==='ship'&&e.id!==player.id&&owner._cohort.has(e.id))};
}
const census=e=>{const b=e._bodies,result={};for(let i=0;i<b.alive.length;i++)if(b.alive[i]){const f=b.liveFamilyId[b.family[i]];result[f]=(result[f]||0)+1;}return result;};

for(const wave of [13,14,15])test(`round ${wave}: source-owned foreground, finite quota and endless continuation`,()=>{
 const p=planFor(wave);assert.ok(p.swarm.foundry);assert.equal(p.swarm.killTarget,swarmQuota(wave));assert.equal(p.swarm.concurrent,swarmConcurrent(wave));assert.equal(p.completionRules.kind,'cohort');
 const preview=swarmRoundPreview({arenaId:'helios_core',wave,seed,plan:p});assert.equal(preview.event,null);assert.equal(preview.foreground.title,p.swarm.foundry.title);
 const run={...createRunState({kind:'survival',ruleset:'swarm',seed}),arenaId:'helios_core',wave:wave-1,phase:'draft'};
 const next=swarmNextLine(swarmForecastForRun(run,wave));assert.match(next,wave===13?/Guns cannot crack/:wave===14?/screen/i:/locked charge/);assert.doesNotMatch(next,/cop(?:y|ies).*gun|shoots down|hold missiles/i);
 for(const extra of [{arenaId:'the_hive'},{mutators:['dense']},{mutators:['heavies_only']},{circuitRound:{kind:'survive'}}])assert.equal(planFor(wave,extra).swarm.foundry,undefined);
 for(const extra of [{swarmStake:'high'},{swarmThreats:['thick_pack']},{buildSummary:{dominant:'massline'}},{buildSummary:{dominant:'gunnery'}}]){const variant=planFor(wave,extra);assert.ok(variant.swarm.foundry);assert.equal(variant.schedule.filter(x=>x.debut).reduce((n,x)=>n+x.count,0),1);}
 assert.equal(planFor(21).swarm.foundry,undefined);
});
test('PD companion spends one ordinary seat; Foreman and its Lawman retain their actual owners',()=>{
 const p=planFor(14);const pair=p.schedule.filter(x=>x.debut||x.staged);assert.deepEqual(pair.map(x=>x.enemyId),['pd_screen_escort','customs_cutter']);assert.ok(pair.every(x=>x.count===1&&x.atTick===0&&x.readAfterTicks===1));assert.equal(pair[0].gateGroup,pair[1].gateGroup);
 const boss=planFor(15);assert.equal(boss.schedule.find(x=>x.champion).enemyId,'mirrorjaw_foreman');assert.equal(boss.swarm.bossScoreId,'capital_boss_foreman');assert.equal(boss.schedule.find(x=>x.debut).enemyId,'patrol_lawman');assert.equal(boss.schedule.find(x=>x.debut).readAfterTicks,1200);
});
for(const wave of [13,14,15])test(`round ${wave}: idle/pause/repeated clock, finite reserve and retry`,t=>{
 const h=fixture(t,wave);h.tick(900);assert.equal(h.owner._foundryTicks,0);assert.equal(h.engine.view.aliveCount,0);assert.equal(h.ships().length,wave===15?1:0);
 noteSwarmPilotAction(h.state);h.tick();assert.equal(h.ships().length,wave===14?2:1);
 const ticks=h.owner._foundryTicks;h.state.mode='pause';h.tick(100);assert.equal(h.owner._foundryTicks,ticks);h.state.mode='flight';h.tick();for(let i=0;i<10;i++){h.owner.update();h.engine.step(h.state);}assert.equal(h.owner._foundryTicks,ticks+1);
 if(wave===13){h.tick(479-h.owner._foundryTicks);assert.equal(h.engine.view.aliveCount,0);h.tick(2);assert.deepEqual(census(h.engine),{glassback:1});assert.equal(h.engine.view.pendingCount,swarmBroodPopulation(wave)-1);}
 else{h.tick(h.owner._foundry.shipReadTicks-h.owner._foundryTicks-1);assert.equal(h.engine.view.aliveCount,0);assert.equal(h.ships().length,wave===14?2:1);}
 assert.equal(h.engine._bank(),null);h.tick(Math.max(0,h.owner._foundry.shipReadTicks-h.owner._foundryTicks)+2);assert.ok(h.engine.view.aliveCount<=19);assert.ok(h.ships().length>(wave===14?2:1));
 const killed=h.events.filter(e=>e.type==='swarm:broodKills').reduce((n,e)=>n+e.payload.removedCount,0);assert.equal(h.engine.view.aliveCount+h.engine.view.pendingCount+killed,swarmBroodPopulation(wave));assert.equal(h.events.filter(e=>e.type==='run:waveCleared').length,0);
 h.bus.emit('run:endRequested',{outcome:'aborted',reason:'retry'});h.start();h.tick(900);assert.equal(h.owner._foundryTicks,0);assert.equal(h.engine.view.aliveCount,0);assert.equal(h.ships().length,wave===15?1:0);
});
for(const kind of ['missing','moving','oversize','heavy','sensor','native_failure','expiring','blocked_shot','blocked_grab','unpaid','held'])test(`shell scene rejects ${kind} without spending or moving anything`,t=>{
 const h=fixture(t,13),plan=[{id:'glassback',count:1}];for(const e of h.state.entityList)if(['asteroid','wreck'].includes(e.type)&&e!==h.surface)e.collides=false;
 if(kind==='missing')h.surface.alive=false;
 if(kind==='moving')h.surface.vel.x=20;
 if(kind==='oversize')h.surface.physicsBody={...h.surface.physicsBody,radius:20};
 if(kind==='heavy')h.surface.physicsBody={...h.surface.physicsBody,mass:100};
 if(kind==='sensor')h.surface.physicsBody={...h.surface.physicsBody,material:'massline_sensor'};
 if(kind==='native_failure')markPhysicsBodyNativeFailure(h.surface,{});
 if(kind==='expiring')h.surface.data.despawnAt=10;
 if(kind==='blocked_shot')h.sim.spawn({type:'station',pos:{x:110,z:0},radius:10,collides:true});
 if(kind==='blocked_grab')h.sim.spawn({type:'asteroid',pos:{x:35,z:0},radius:12,mass:300,collides:true});
 if(kind==='unpaid')plan[0].count=0;
 if(kind==='held'){h.state.player??={};h.state.player.tether={active:true,targetId:h.surface.id};}
 const before=JSON.stringify(h.state.entityList.map(e=>({id:e.id,pos:e.pos,vel:e.vel})));
 assert.equal(planSwarmOpeningGlassback(h.state,h.state.run,13,plan,6.2),null);assert.equal(JSON.stringify(h.state.entityList.map(e=>({id:e.id,pos:e.pos,vel:e.vel}))),before);
});
test('the lone shell rejects direct gun damage, retaining the exact finite life',t=>{
 const h=fixture(t,13);noteSwarmPilotAction(h.state);h.tick(481);const b=h.engine._bodies,i=b.alive.findIndex(Boolean);assert.equal(b.liveFamilyId[b.family[i]],'glassback');const hp=b.hp[i];
 h.engine.damageSegment({from:{x:b.px[i]-20,z:b.pz[i]},to:{x:b.px[i]+20,z:b.pz[i]},damage:999,ownerId:h.player.id});assert.equal(b.hp[i],hp);assert.equal(b.alive[i],1);assert.equal(h.events.filter(e=>e.type==='swarm:broodKills').length,0);assert.equal(h.engine.view.pendingCount,swarmBroodPopulation(13)-1);
});
test('unavailable mass falls back in bounded ordinary packets, without an empty eighteen-second wait',t=>{
 const h=fixture(t,13);for(const e of h.state.entityList)if(['asteroid','wreck'].includes(e.type))e.collides=false;noteSwarmPilotAction(h.state);h.tick(481);assert.ok(h.engine.view.aliveCount>0&&h.engine.view.aliveCount<=18);assert.equal(h.engine.view.aliveCount+h.engine.view.pendingCount,swarmBroodPopulation(13));h.tick(100);assert.ok(h.engine.view.aliveCount>18);assert.equal(h.ships().length,1);
});
test('Armory prepares the actual next fight and never claims a checkpoint clear',()=>{
 const run={...createRunState({kind:'survival',ruleset:'swarm',seed}),arenaId:'helios_core',wave:12,phase:'draft',credits:137};
 for(const [wave,re] of [[12,/Glassback/],[13,/Point-Defense/],[14,/locked charge lane/],[15,/continues to round 16/]]){run.wave=wave;const before=JSON.stringify(run);assert.match((foundryForemanIntermission(run) ?? foundrySecondExitIntermission(run)),re);assert.equal(JSON.stringify(run),before);assert.equal(foundryForemanIntermission({...run,telemetry:{...run.telemetry,startWave:wave+1}}),null);}
 for(const extra of [{phase:'active'},{arenaId:'the_hive'},{arenaMutators:['dense']},{telemetry:{circuit:{}}}])assert.equal(foundryForemanIntermission({...run,...extra}),null);
});

for(const wave of [12,13,14,15])test(`mounted Foreman Armory launches ${wave+1} in the same endless run`,async()=>{
 const {fakeDom,textLines}=await import('./helpers/fake-dom.mjs');const {createGameState}=await import('../src/core/gameState.js');const {createBus}=await import('../src/core/eventBus.js');const {survivalRun}=await import('../src/systems/survivalRun.js');const {survivalDraft}=await import('../src/systems/survivalDraft.js');const {crucibleDraftScreen}=await import('../src/ui/screens/crucibleDraft.js');
 const previous=globalThis.document,doc=fakeDom();globalThis.document=doc;const make=doc.createElement;doc.createElement=tag=>{const n=make(tag);Object.defineProperty(n,'parentElement',{get(){return this.parentNode;}});return n;};
 const state=createGameState(seed),bus=createBus(),session=Object.create(runSession),machine=Object.create(survivalRun),shop=Object.create(survivalDraft);const registry={get:n=>n==='runSession'?session:n==='survivalRun'?machine:n==='survivalDraft'?shop:null};const ctx={state,bus,registry,helpers:{}};const screen=Object.create(crucibleDraftScreen),ended=[];bus.on('run:ended',x=>ended.push(x));
 try{session.init(ctx);machine.init(ctx);shop.init(ctx);bus.emit('run:beginRequested',{kind:'survival',ruleset:'swarm',seed,arenaId:'helios_core'});
  // A completed-round fixture exercises real UI/phase owners; it is not earned combat.
  state.run.wave=wave;bus.emit('run:awardRequested',{credits:137,reason:'fixture'});bus.emit('run:transitionRequested',{expectedPhase:'loadout',nextPhase:'draft',reason:'fixture',tick:0});
  const root=doc.createElement('div');screen.mount(root,ctx);screen.update?.(0,ctx);assert.match(screen._sub.textContent,wave===12?/Glassback/:wave===13?/Point-Defense/:wave===14?/Mirrorjaw/:/round 16/);assert.match(textLines(root).join(' '),new RegExp(`Launch round ${wave+1}`));
  screen._skip.click();machine.update(DT);assert.equal(state.run.phase,'wave_intro');assert.equal(state.run.wave,wave+1);assert.equal(state.run.credits,137);assert.equal(state.run.ruleset,'swarm');assert.equal(ended.length,0);
  state.run.wave=wave;state.run.phase='draft';state.run.telemetry={...state.run.telemetry,startWave:wave+1};assert.equal(foundryForemanIntermission(state.run),null);
 }finally{screen.unmount?.();shop.destroy();machine.destroy();session.destroy();globalThis.document=previous;}
});


test('Foreman-act phases preserve campaign saves; live Swarm does not invent save/Continue',async()=>{
 const {save}=await import('../src/save/saveSystem.js');const {createGameState}=await import('../src/core/gameState.js');const {createBus}=await import('../src/core/eventBus.js');
 const previous=globalThis.localStorage,bytes=new Map([['sf.save.auto','campaign'],['sf.save.index','index']]);globalThis.localStorage={getItem:k=>bytes.get(k)??null,setItem:(k,v)=>bytes.set(k,String(v)),removeItem:k=>bytes.delete(k),key:i=>[...bytes.keys()][i],get length(){return bytes.size;}};
 const state=createGameState(seed),bus=createBus(),owner=Object.create(save),before=new Map(bytes);
 try{owner.init({state,bus,helpers:{},registry:{get:()=>null}});for(const [wave,phase] of [[12,'draft'],[13,'active'],[13,'draft'],[14,'active'],[14,'draft'],[15,'active'],[15,'draft'],[16,'wave_intro']]){state.run={...createRunState({kind:'survival',ruleset:'swarm',seed}),wave,phase,arenaId:'helios_core'};assert.equal(owner._campaignSaveSuppressed(),true);assert.equal(owner.save('auto'),false);assert.equal(owner.save('manual1'),false);assert.deepEqual(bytes,before);}}
 finally{owner.destroy?.();if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});

