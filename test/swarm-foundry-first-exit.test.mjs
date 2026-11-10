import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { runSession } from '../src/systems/runSession.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { swarmQuota, swarmConcurrent } from '../src/data/swarmMode.js';
import { swarmBroodPopulation } from '../src/data/swarmBrood.js';
import { swarmEventFor } from '../src/data/swarmEvents.js';
import { swarmRoundPreview } from '../src/data/swarmLadder.js';
import { foundryFirstExitIntermission, swarmArmoryExitLabel, swarmForecastForRun, swarmNextLine,
  refitFootLines } from '../src/ui/screens/crucibleDraft.js';

const DT=1/60;
const planFor=(seed=73311,extra={})=>planWave({seed,wave:10,arenaId:'helios_core',ruleset:'swarm',...extra});
function fixture(t,seed=73311) {
  const sim=createSimulation({seed,systems:[runSession,spawnBudget,swarmArena,survivalWave,survivalArena]});
  t.after(()=>sim.dispose());
  const {state,bus}=sim;state.mode='flight';state.rockCore={ratingT:0};
  const player=sim.spawn({type:'ship',team:0,pos:{x:0,z:0},vel:{x:0,z:0},radius:8,mass:40,
    hull:100,hullMax:100,collides:true,data:{}});state.playerId=player.id;resolvePhysicsBodySpec(player);
  const events=[];for(const type of ['swarm:eventTelegraphed','swarm:event','run:awardRequested','mines:placeRequest','run:waveCleared'])
    bus.on(type,payload=>events.push({type,payload,tick:state.tick}));
  const start=()=>{
    sim.registry.get('runSession').newGame();
    bus.emit('run:beginRequested',{kind:'survival',ruleset:'swarm',seed,arenaId:'helios_core'});
    state.run.wave=10;state.run.phase='wave_intro';
    bus.emit('run:wavePlanned',{wave:10,plan:planFor(seed)});
    state.run.phase='active';state.mode='flight';bus.emit('run:waveStarted',{wave:10});
  };
  start();
  return {sim,state,bus,player,events,start,owner:sim.registry.get('survivalWave'),
    host:sim.registry.get('survivalArena'),engine:sim.registry.get('swarmArena')._brood,
    ships:()=>state.entityList.filter(e=>e.alive&&e.type==='ship'&&e.id!==player.id&&sim.registry.get('survivalWave')._cohort.has(e.id)),
    tick(n=1){for(let i=0;i<n;i++)sim.step(DT);}};
}

test('round ten retains the original finite cohort and actual seed-selected event',()=>{
  for(const seed of [1,42,91,4242,73311]){
    const p=planFor(seed),event=swarmEventFor({arenaId:'helios_core',wave:10,seed});
    assert.equal(p.swarm.foundry.id,'reach_the_exit');assert.equal(p.swarm.foundry.events,'seeded');
    assert.equal(p.swarm.killTarget,swarmQuota(10));assert.equal(p.swarm.concurrent,swarmConcurrent(10));
    assert.equal(p.completionRules.kind,'cohort');assert.equal(p.swarm.boss,false);
    const debut=p.schedule.filter(e=>e.debut);assert.equal(debut.length,1);
    assert.equal(debut[0].enemyId,'corsair_raider');assert.equal(debut[0].atTick,0);assert.equal(debut[0].readAfterTicks,1);
    assert.ok(p.schedule.filter(e=>!e.debut).every(e=>e.readAfterTicks===840));
    const preview=swarmRoundPreview({arenaId:'helios_core',wave:10,seed,plan:p});
    assert.equal(preview.event.name,event.name);assert.equal(preview.foreground.title,p.swarm.foundry.title);
    const run={...createRunState({kind:'survival',ruleset:'swarm',seed}),arenaId:'helios_core',wave:9,phase:'draft'};
    const before=JSON.stringify(run),next=swarmForecastForRun(run,10);
    assert.equal(next.event.name,event.name);assert.match(swarmNextLine(next),new RegExp(event.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    assert.equal(JSON.stringify(run),before);
  }
});

for(const seed of [1,42,91,4242,73311])test(`seed ${seed}: Corsair, real wager, then finite crowd, even after a long idle`,t=>{
  const h=fixture(t,seed),event=swarmEventFor({arenaId:'helios_core',wave:10,seed});
  h.tick(1200);assert.equal(h.ships().length,0);assert.equal(h.engine.view.aliveCount,0);
  assert.equal(h.engine.view.pendingCount,swarmBroodPopulation(10));assert.equal(h.events.length,0);
  noteSwarmPilotAction(h.state);h.tick();assert.equal(h.ships().length,1);
  assert.equal(h.ships()[0].data.lootTableId,'corsair_raider');
  h.tick(478);assert.equal(h.events.filter(e=>e.type==='swarm:eventTelegraphed').length,0);
  h.tick(2);
  const cues=h.events.filter(e=>e.type==='swarm:eventTelegraphed');assert.equal(cues.length,1);
  assert.equal(cues[0].payload.eventId,event.id);assert.equal(cues[0].payload.name,event.name);
  assert.equal(cues[0].payload.telegraph,event.telegraph);assert.deepEqual(cues[0].payload.wager,event.wager);
  assert.equal(h.ships().length,1);assert.equal(h.engine.view.aliveCount,0);
  h.bus.emit('swarm:eventVerdict',{eventId:event.id,wave:10,accept:true});
  h.tick(Math.ceil(event.windupS*60)+1);
  assert.equal(h.events.filter(e=>e.type==='run:awardRequested'&&e.payload.reason==='swarm:eventBounty').length,1);
  assert.equal(h.state.run.score,event.wager.score);
  h.tick(200);assert.ok(h.ships().length>1);assert.ok(h.engine.view.aliveCount>0);
  assert.equal(h.engine.view.aliveCount+h.engine.view.pendingCount,swarmBroodPopulation(10));
  const packages=h.owner._pending.filter(x=>!x.entry.debut).map(x=>x.entry.readAfterTicks);
  for(let i=1;i<packages.length;i++)assert.ok(packages[i]-packages[i-1]>=80);
  assert.equal(h.events.filter(e=>e.type==='run:waveCleared').length,0);
});

test('pause, repeated callbacks and wallet clones cannot consume or duplicate the delayed wager',t=>{
  const h=fixture(t);noteSwarmPilotAction(h.state);h.tick(120);
  const director=h.host._swarmEvents;assert.ok(director);
  const clock=director._firstExit.ticks;
  h.state.mode='pause';h.tick(240);assert.equal(director._firstExit.ticks,clock);
  h.state.mode='flight';h.tick();
  for(let i=0;i<20;i++){director.update(DT,h.state);h.bus.emit('run:waveStarted',{wave:10});}
  assert.equal(director._firstExit.ticks,clock+1);
  h.bus.emit('run:awardRequested',{credits:7,reason:'fixture'});h.tick(400);
  assert.equal(h.events.filter(e=>e.type==='swarm:eventTelegraphed').length,1);
  h.bus.emit('run:waveStarted',{wave:10});h.tick(100);
  assert.equal(h.events.filter(e=>e.type==='swarm:eventTelegraphed').length,1);
});

test('refusing the actual wager pays nothing and leaves the ordinary crowd debt intact',t=>{
  const h=fixture(t);noteSwarmPilotAction(h.state);h.tick(481);
  const cue=h.events.find(e=>e.type==='swarm:eventTelegraphed').payload;
  h.bus.emit('swarm:eventVerdict',{eventId:cue.eventId,wave:10,accept:false});h.tick(800);
  assert.equal(h.events.filter(e=>e.type==='run:awardRequested').length,0);
  assert.equal(h.events.filter(e=>e.type==='mines:placeRequest').length,0);
  assert.equal(h.engine.view.aliveCount+h.engine.view.pendingCount,swarmBroodPopulation(10));
  assert.equal(h.events.filter(e=>e.type==='swarm:event'&&e.payload.verb==='declined').length,1);
});

test('clear and same-seed retry retire the old read, wager, bodies and unpaid debt',t=>{
  const h=fixture(t);noteSwarmPilotAction(h.state);h.tick(200);
  h.bus.emit('run:endRequested',{outcome:'aborted',reason:'retry'});h.start();h.events.length=0;h.tick(1200);
  assert.equal(h.host._swarmEvents._firstExit.ticks,0);assert.equal(h.ships().length,0);
  assert.equal(h.engine.view.pendingCount,swarmBroodPopulation(10));
  noteSwarmPilotAction(h.state);h.tick(481);assert.equal(h.events.filter(e=>e.type==='swarm:eventTelegraphed').length,1);
  h.state.run.phase='cleanup';h.bus.emit('run:waveCleared',{wave:10});h.tick(900);
  assert.equal(h.events.filter(e=>e.type==='run:awardRequested'&&e.payload.reason==='swarm:eventBounty').length,0);
  assert.equal(h.host._swarmEvents._firstExit,null);
});

test('the shop names the real bench before its bank, extract and keep-flying choices',()=>{
  const run={...createRunState({kind:'survival',ruleset:'swarm',seed:73311}),arenaId:'helios_core',wave:9,phase:'draft',credits:137};
  assert.match(foundryFirstExitIntermission(run),/event in your forecast/);
  run.wave=10;const before=JSON.stringify(run);
  assert.match(foundryFirstExitIntermission(run),/137 cr/);assert.match(foundryFirstExitIntermission(run),/Spending here reduces/);
  assert.equal(swarmArmoryExitLabel(run),'Open exit bench');assert.equal(refitFootLines(run).extract,'');
  run.phase='refit';assert.match(foundryFirstExitIntermission(run),/Launch round 11/);
  assert.equal(refitFootLines(run).primary,'Launch round 11');assert.equal(refitFootLines(run).bank,'Bank 68 cr, keep flying');
  assert.equal(refitFootLines(run).extract,'Extract — end the run here');
  run.phase='draft';assert.equal(JSON.stringify(run),before);
  for(const extra of [{arenaId:'the_hive'},{arenaMutators:['dense']},{telemetry:{circuit:{}}},{ruleset:'scored'}])
    assert.equal(foundryFirstExitIntermission({...run,...extra}),null);
  for(const extra of [{arenaId:'the_hive'},{mutators:['heavies_only']},{circuitRound:{kind:'survive'}},{wave:21}])
    assert.equal(planFor(73311,extra).swarm.foundry,undefined);
});

test('checkpoint openings never claim an unplayed clear, but clearing a round-ten start earns the exit copy',async()=>{
  const {createGameState}=await import('../src/core/gameState.js');
  const {createBus}=await import('../src/core/eventBus.js');
  const {survivalRun}=await import('../src/systems/survivalRun.js');
  const {survivalDraft}=await import('../src/systems/survivalDraft.js');
  for(const startWave of [10,11]){
    const state=createGameState(73311),bus=createBus(),session=Object.create(runSession),machine=Object.create(survivalRun),shop=Object.create(survivalDraft);
    const registry={get:name=>name==='runSession'?session:name==='survivalRun'?machine:name==='survivalDraft'?shop:null};
    const ctx={state,bus,registry,helpers:{}};
    try{
      session.init(ctx);machine.init(ctx);shop.init(ctx);
      bus.emit('run:beginRequested',{kind:'survival',ruleset:'swarm',seed:73311,arenaId:'helios_core',startWave});
      bus.emit('run:transitionRequested',{expectedPhase:'loadout',nextPhase:'draft',reason:'fixture',tick:0});
      assert.equal(state.run.wave,startWave-1);assert.equal(state.run.telemetry.startWave,startWave);
      assert.equal(foundryFirstExitIntermission(state.run),null);
      assert.equal(swarmArmoryExitLabel(state.run),`Launch round ${startWave}`);
      if(startWave===10){
        bus.emit('run:draftPickRequested',{offerId:null});machine.update(DT);
        assert.equal(state.run.phase,'wave_intro');assert.equal(state.run.wave,10);
        bus.emit('run:waveIntroComplete',{});machine.update(DT);assert.equal(state.run.phase,'active');
        // A synthetic clear isolates the public phase owners, not an earned gameplay claim.
        bus.emit('run:waveCleared',{wave:10});machine.update(DT);
        for(let i=0;i<600&&state.run.phase==='cleanup';i++){state.tick++;machine.update(DT);}
        assert.equal(state.run.phase,'draft');assert.equal(state.run.wave,10);
        assert.match(foundryFirstExitIntermission(state.run),/Round 10 cleared/);
        assert.equal(swarmArmoryExitLabel(state.run),'Open exit bench');
        bus.emit('run:draftPickRequested',{offerId:null});machine.update(DT);assert.equal(state.run.phase,'refit');
        assert.match(foundryFirstExitIntermission(state.run),/First exit reached/);
      }
    }finally{shop.destroy();machine.destroy();session.destroy();}
  }
});

test('native Corsair charge, ordinary strafe and the ladder seed’s four real mines use production owners',async t=>{
  const {bootRealPath}=await import('../scripts/lib/bench/realPath.mjs');
  const {input}=await import('../src/systems/input.js');
  const {combat}=await import('../src/systems/combat.js');
  const {mines}=await import('../src/systems/mines.js');
  const {fields}=await import('../src/systems/fields.js');
  const {COMBAT_LAB_STARTER_PACKAGES}=await import('../src/data/combatLabSetups.js');
  const kit=COMBAT_LAB_STARTER_PACKAGES.find(k=>k.id==='ricochet_runner');
  const fittings=Array(13).fill(null);for(const row of kit.loadout)fittings[row.slotIndex]=row.defId;
  async function play(strafe){
    const h=await bootRealPath({seed:73311,systems:[input,runSession,spawnBudget,survivalWave,swarmArena,survivalArena,combat,
      'tacticalAI','actions','weapons','flightV3','aiPorts',mines,fields,'physics'],
      hulls:[{hullId:kit.hullId,fittings,isPlayer:true,pos:{x:0,z:0}}]});
    try{
      const s=h.state,p=h.player,cues=[],hits=[],tells=[],inputLog=[];
      // Earlier clears and starting loadout/pose are explicit fixtures. Enemy and mine placement,
      // locomotion, attacks and damage are real. No target pose, health or payout is injected.
      s.run={...createRunState({kind:'survival',ruleset:'swarm',seed:73311}),arenaId:'helios_core',wave:10,phase:'wave_intro'};
      s.input.autoFire=false;h.bus.emit('run:wavePlanned',{wave:10,plan:planFor()});s.run.phase='active';h.bus.emit('run:waveStarted',{wave:10});
      h.bus.on('swarm:eventTelegraphed',e=>cues.push({tick:s.tick,...e}));
      h.bus.on('combat:damage',e=>{if(e.targetId===p.id)hits.push({tick:s.tick,...e});});
      h.bus.on('ai:telegraph',e=>tells.push({tick:s.tick,...e}));
      const inp=h.runtime.getSystem('input');const key=(code,pressed)=>{const e={type:pressed?'keydown':'keyup',code,pressed,blocked:false};inputLog.push({tick:s.tick,...e});inp.ingestLaneDomEvent(e);};
      key('Digit0',true);h.step(1);key('Digit0',false);if(strafe)key('KeyE',true);
      h.step(780);if(strafe)key('KeyE',false);h.step(10);
      const corsair=s.entityList.find(e=>e.data?.lootTableId==='corsair_raider');
      assert.ok(corsair?.alive);assert.equal(corsair.data.ai.combatDoctrineId,'shield_breaker');
      assert.ok(tells.some(e=>e.entityId===corsair.id&&e.kind==='shield_lance'&&e.durationTicks>=36));
      assert.equal(cues.length,1);assert.equal(cues[0].eventId,'mine_drift');assert.equal(cues[0].tick,480);
      const actualMines=s.entityList.filter(e=>e.type==='mine'&&e.ownerId==='survival-arena');
      assert.equal(actualMines.length,4);assert.ok(actualMines.every(e=>Math.abs(e.data.armedAt-e.data.placedAt-3)<1e-9));
      assert.equal(s.run.spawnedThreat,1);assert.equal(s.run.resolvedThreat,0);
      assert.equal(h.runtime.getSystem('swarmArena')._brood.view.aliveCount,0);
      assert.equal(h.runtime.getSystem('swarmArena')._brood.view.pendingCount,swarmBroodPopulation(10));
      assert.equal(s.run.score,30);assert.equal(s.run.credits,0);assert.ok(p.alive&&p.hull>0);
      assert.equal(h.proof().backend,'rapier-dynamic');assert.equal(h.proof().flightBackend,'v3');
      return {hull:p.hull,shield:p.shield,pos:{...p.pos},hits:hits.length,inputLog};
    }finally{h.dispose();}
  }
  const stationary=await play(false),moving=await play(true);
  assert.ok(stationary.hits>0,'the Corsair actually attacks an acted pilot');
  assert.ok(moving.pos.z-stationary.pos.z>500,'ordinary strafe moves the real hull');
  assert.ok(moving.shield>=stationary.shield,'this strafe leaves more shield at the observed instant');
  t.diagnostic(JSON.stringify({stationary,moving,limit:'No earned prior rounds, Corsair kill, full clear or rendered human-input acceptance is claimed.'}));
});

test('round-nine, ten and eleven saves still protect the campaign; no run Continue is invented',async()=>{
  const {save}=await import('../src/save/saveSystem.js');
  const {createGameState}=await import('../src/core/gameState.js');
  const {createBus}=await import('../src/core/eventBus.js');
  const previous=globalThis.localStorage,bytes=new Map([['sf.save.auto','campaign'],['sf.save.index','index']]);
  globalThis.localStorage={getItem:k=>bytes.get(k)??null,setItem:(k,v)=>bytes.set(k,String(v)),removeItem:k=>bytes.delete(k),key:i=>[...bytes.keys()][i],get length(){return bytes.size;}};
  const state=createGameState(73311),bus=createBus(),owner=Object.create(save),before=new Map(bytes);
  try{
    owner.init({state,bus,helpers:{},registry:{get:()=>null}});
    for(const [wave,phase] of [[9,'draft'],[10,'active'],[10,'draft'],[10,'refit'],[11,'wave_intro']]){
      state.run={...createRunState({kind:'survival',ruleset:'swarm',seed:73311}),wave,phase,arenaId:'helios_core'};
      assert.equal(owner._campaignSaveSuppressed(),true);assert.equal(owner.save('auto'),false);assert.equal(owner.save('manual1'),false);assert.deepEqual(bytes,before);
    }
  }finally{owner.destroy?.();if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});

for(const choice of ['continue','bank_then_continue','extract'])test(`mounted round-ten Armory and Refit drive the real ${choice} owners`,async()=>{
  const {fakeDom,textLines}=await import('./helpers/fake-dom.mjs');
  const {createGameState}=await import('../src/core/gameState.js');
  const {createBus}=await import('../src/core/eventBus.js');
  const {survivalRun}=await import('../src/systems/survivalRun.js');
  const {survivalDraft}=await import('../src/systems/survivalDraft.js');
  const {crucibleDraftScreen,crucibleRefitScreen}=await import('../src/ui/screens/crucibleDraft.js');
  const prev=globalThis.document,doc=fakeDom();globalThis.document=doc;
  const make=doc.createElement;doc.createElement=tag=>{const node=make(tag);Object.defineProperty(node,'parentElement',{get(){return this.parentNode;}});return node;};
  const state=createGameState(73311),bus=createBus(),session=Object.create(runSession),machine=Object.create(survivalRun),shop=Object.create(survivalDraft);
  const registry={get:name=>name==='runSession'?session:name==='survivalRun'?machine:name==='survivalDraft'?shop:null};
  const ctx={state,bus,registry,helpers:{}};const screens=[];const ended=[];bus.on('run:ended',e=>ended.push(e));
  try{
    session.init(ctx);machine.init(ctx);shop.init(ctx);
    bus.emit('run:beginRequested',{kind:'survival',ruleset:'swarm',seed:73311,arenaId:'helios_core'});
    // Earlier clears and purse are fixture setup, not an earned journey claim.
    state.run.wave=10;bus.emit('run:awardRequested',{credits:137,reason:'fixture'});
    bus.emit('run:transitionRequested',{expectedPhase:'loadout',nextPhase:'draft',reason:'fixture',tick:0});
    const draft=Object.create(crucibleDraftScreen),root=doc.createElement('div');screens.push(draft);
    draft.mount(root,ctx);draft.update?.(0,ctx);
    assert.match(textLines(root).join(' '),/Open exit bench/);assert.equal(draft._fortifyBtn.hidden,false);
    assert.match(draft._sub.textContent,/137 cr/);draft._skip.click();machine.update(DT);
    assert.equal(state.run.phase,'refit');assert.equal(state.run.wave,10);assert.equal(state.run.credits,137);
    const refit=Object.create(crucibleRefitScreen),bench=doc.createElement('div');screens.push(refit);
    refit.mount(bench,ctx);refit.refresh(ctx);
    assert.match(refit._sub.textContent,/First exit reached/);assert.match(textLines(bench).join(' '),/Bank 68 cr/);
    if(choice==='extract'){
      refit._feedEndHold(true,0.6);assert.equal(ended.length,1);assert.equal(ended[0].reason,'extracted');
      refit._feedEndHold(true,0.9);assert.equal(ended.length,1,'one hold cannot settle twice');
    }else{
      if(choice==='bank_then_continue'){
        refit._bank.click();assert.equal(state.run.credits,69);assert.equal(state.run.telemetry.securedBounty,68);
        assert.equal(state.run.phase,'refit');assert.match(textLines(bench).join(' '),/Bank 34 cr/);
      }
      refit._done.click();machine.update(DT);assert.equal(state.run.phase,'wave_intro');assert.equal(state.run.wave,11);
      assert.equal(state.run.ruleset,'swarm');assert.equal(ended.length,0);assert.equal(state.run.telemetry.securedBounty||0,choice==='bank_then_continue'?68:0);
    }
  }finally{
    for(const screen of screens.reverse())screen.unmount?.();shop.destroy();machine.destroy();session.destroy();globalThis.document=prev;
  }
});

test('surviving Bank geometry cannot add a second foreground to the exit round',t=>{
  const h=fixture(t);
  const rock=h.sim.spawn({type:'asteroid',pos:{x:88,z:0},vel:{x:0,z:0},radius:8,mass:50,collides:true,data:{swarmArenaDebris:true}});
  resolvePhysicsBodySpec(rock);noteSwarmPilotAction(h.state);h.tick(900);
  assert.equal(h.engine._bank(),null);assert.ok(h.engine.view.aliveCount>3);
  assert.equal(h.engine.view.aliveCount+h.engine.view.pendingCount,swarmBroodPopulation(10));
  assert.equal(h.state.entities.get(rock.id),rock);
});

test('finite ship receipts clear once only after all owed ships, and HUD counts that same cohort',async t=>{
  const {threatCensus}=await import('../src/ui/survivalHud.js');
  const h=fixture(t);noteSwarmPilotAction(h.state);h.tick();
  assert.deepEqual(threatCensus(h.state.run),{alive:1,total:swarmQuota(10),remaining:swarmQuota(10),resolved:0});
  const seen=new Set();
  for(let step=0;step<6000&&!h.owner._cleared;step++){
    for(const e of h.ships()){
      seen.add(e);
      // Synthetic deaths isolate admission/clear accounting; not a claimed earned victory.
      e.alive=false;h.bus.emit('entity:killed',{id:e.id,sourceId:h.player.id});h.sim.helpers.removeEntity(e.id);
    }
    h.tick();
  }
  assert.equal(h.owner._cleared,true);assert.equal(seen.size,swarmQuota(10));
  assert.equal(h.owner._pending.length,0);assert.equal(h.events.filter(e=>e.type==='run:waveCleared').length,1);
  assert.deepEqual(threatCensus(h.state.run),{alive:0,total:swarmQuota(10),remaining:0,resolved:swarmQuota(10)});
  h.tick(600);assert.equal(h.events.filter(e=>e.type==='run:waveCleared').length,1);
});
