import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';
import { crucibleSetupFor, requestCrucibleRun } from '../src/ui/crucibleLaunch.js';

test('default production worker retires only the selected run and ships result before wakeup',async()=>{
 const lane=createSimHost(),domains=new Map();let tick=0;
 try {
  const init=await lane.init({profile:'production',seed:4242,scenarioContract:JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json',import.meta.url)))});
  for(const update of init.domainUpdates)applyDomainPathUpdate(domains,structuredClone(update),new WeakSet());
  const {state,registry,runtime,bus}=lane.host;state.mode='flight';state.run={...state.run};
  const actor=runtime.spawn({type:'ship',alive:true,isPlayer:true,team:0,pos:{x:0,z:0},vel:{x:0,z:0},radius:10,hull:100,hullMax:100,collides:true,data:{}});state.playerId=actor.id;
  const owner=registry.get('runSession');owner.begin({kind:'survival',ruleset:'swarm',seed:4242});
  for(const [expectedPhase,nextPhase] of [['loadout','arena_intro'],['arena_intro','wave_intro'],['wave_intro','active']])owner.transition({expectedPhase,nextPhase});
  state.run.wave=4;state.run.threatBudget=30;state.run.resolvedThreat=12;owner.award({credits:80});state.mode='paused';
  const token=state.run.retireToken,send=async payload=>{const ring=createSimCommandRing();if(payload)pushLaneCommand(ring,{kind:'busEmit',emit:'run:retireRequested',payload});
   const reply=await lane.tick({tick:++tick,steps:0,ackEnd:init.initRebuild?.end??0,commands:structuredClone(ring.drain())});
   for(const update of reply.domainUpdates)applyDomainPathUpdate(domains,structuredClone(update),new WeakSet());return reply;};
  await send();assert.equal(domains.get('run').retireToken,token,'retire identity reaches the main read model');
  const stale=await send({token:token+1});assert.equal(state.run.phase,'active');assert.equal(stale.events.some(e=>e.t==='run:resultsReady'),false);
  globalThis.localStorage.setItem('sf.save.crucible_meta',JSON.stringify({priorSecuredBounty:37}));
  await send();const priorMeta=globalThis.localStorage.getItem('sf.save.crucible_meta');
  let death=0,clear=0;bus.on('player:death',()=>death++);bus.on('run:waveCleared',()=>clear++);
  const reply=await send({token});const event=reply.events.find(e=>e.t==='run:resultsReady');
  assert.ok(event,'default host forwards the result wakeup');const result=domains.get('survivalResultsPublic').result;
  assert.equal(event.p.stopReason,'player_retired');assert.equal(result.stopReason,'player_retired');assert.equal(result.unranked,true);
  assert.equal(result.wave,4);assert.equal(result.remainingEnemies,18);assert.equal(result.credits,80);
  assert.equal(globalThis.localStorage.getItem('sf.save.crucible_meta'),priorMeta,'retirement neither overwrites earlier settlement nor pays again');
  assert.equal((reply.storageOps||[]).some(op=>op.key==='sf.save.crucible_meta'),false);
  assert.equal(actor.alive,true);assert.equal(death,0);assert.equal(clear,0);
  const duplicate=await send({token});assert.equal(duplicate.events.some(e=>e.t==='run:resultsReady'),false);
  let opts;const setup=crucibleSetupFor({starterId:'kinetic_baseline',seed:4242,ruleset:'swarm'});
  requestCrucibleRun({emit(name,payload){if(name==='game:new')opts=structuredClone(payload);}},setup,'swarm');
  const boot=createSimCommandRing();pushLaneCommand(boot,{kind:'mode',mode:'loading'});
  pushLaneCommand(boot,{kind:'rpc',id:'retired-retry',op:'newGameBoot',args:{opts}});
  const bootReply=await lane.tick({tick:++tick,steps:0,ackEnd:init.initRebuild?.end??0,commands:structuredClone(boot.drain())});
  assert.equal(bootReply.rpcAcks.find(x=>x.id==='retired-retry')?.ok,true,'real New Game boot accepts Retry transport');
  const newer=state.run.retireToken;assert.notEqual(newer,token);assert.equal(state.run.seed,4242);
  const retryPhase=state.run.phase;await send({token});assert.equal(state.run.phase,retryPhase);
  state.settings.gameplay.difficulty='ironman';const retryPlayer=state.entities.get(state.playerId);
  assert.ok(retryPlayer?.alive);registry.get('combat').kill(retryPlayer,null,{});
  const defeat=await send();assert.ok(defeat.events.some(e=>e.t==='run:resultsReady' && e.p.outcome==='defeat'));
  assert.equal(domains.get('survivalResultsPublic').result.outcome,'defeat','natural combat defeat uses the same snapshot-before-wakeup path');

 } finally {lane.shutdown();}
});

test('Adventure menu exit preserves the real serialized campaign snapshot',async()=>{
 const lane=createSimHost();
 try {
  await lane.init({profile:'production',seed:4242,scenarioContract:JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json',import.meta.url)))});
  const {state,registry,bus}=lane.host;const owner=registry.get('runSession'),save=registry.get('save');
  state.player.credits=729;state.save.currentSlot='quick';owner.begin({kind:'adventure',seed:4242});
  const before=save.serializeData();let ready=0;bus.on('run:resultsReady',()=>ready++);
  bus.emit('game:exitToMenu',{source:'pause'});
  const after=save.serializeData();
  // The serializer stamps each newly built envelope with wall-clock time.
  before.meta.lastSavedAt=after.meta.lastSavedAt;
  assert.deepEqual(after,before,'real save data survives the Adventure exit');
  assert.equal(ready,0);assert.equal(state.run.phase,'inactive');
 } finally {lane.shutdown();}
});

