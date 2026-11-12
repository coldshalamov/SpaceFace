import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createBus } from '../src/core/eventBus.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { createBroodEngine } from '../src/systems/swarmBrood.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { swarmQuota, swarmConcurrent, resetSwarmPressureState } from '../src/data/swarmMode.js';
import { swarmBroodPopulation } from '../src/data/swarmBrood.js';
import { SWARM_FOUNDRY_SCORE, swarmFoundryRound } from '../src/data/swarmFoundryScore.js';
import { swarmRoundPreview } from '../src/data/swarmLadder.js';

const DT = 1 / 60;
const planFor = (wave, extra = {}) => planWave({ seed: 4242, arenaId: 'helios_core', wave, ruleset: 'swarm', ...extra });
function fixture(wave, withShipOwner = false) {
  resetSwarmPressureState();
  const state = createGameState(4242), bus = createBus(), events = [];
  state.mode = 'flight'; state.rockCore = { ratingT: 0 };
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'active', wave, arenaId: 'helios_core' };
  const emit = bus.emit.bind(bus);
  bus.emit = (type, payload) => { events.push({ type, payload, tick: state.tick }); emit(type, payload); };
  const add = spec => {
    const e = { id: state.nextEntityId++, alive: true, collides: true, vel: { x: 0, z: 0 }, ...spec };
    state.entities.set(e.id, e); state.entityList.push(e); return e;
  };
  const player = add({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 8, mass: 40,
    hull: 10000, data: {} });
  state.playerId = player.id;
  const rock = add({ type: 'asteroid', pos: { x: 88, z: 0 }, radius: 8, mass: 50,
    data: { swarmArenaDebris: true, openingPocket: true } });
  resolvePhysicsBodySpec(player); resolvePhysicsBodySpec(rock);
  const plan = planFor(wave);
  const engine = createBroodEngine({ getState: () => state, bus });
  engine.prepareWave(state.run, wave, plan);
  let ships;
  if (withShipOwner) {
    const budget = makeBudgetApi(state);
    ships = Object.create(survivalWave);
    ships.init({ state, bus, helpers: { spawnBudget: budget, spawnEntity: add } });
    bus.emit('run:wavePlanned', { wave, plan });
    bus.emit('run:waveStarted', { wave });
  }
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      state.tick++; state.simTime += DT;
      ships?.update(); engine.step(state);
    }
  };
  return { state, bus, events, add, player, rock, plan, engine, ships, tick };
}
function census(engine) {
  const b = engine._bodies, counts = {};
  for (let i = 0; i < b.alive.length; i++) if (b.alive[i]) {
    const id = b.liveFamilyId[b.family[i]]; counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}
const admitted = h => h.state.entityList.filter(e => e.data?.runCohort === 'survival' && e.type !== 'beacon');


for (const wave of [29,30]) test(`authored bridge ${wave} preserves finite debt and preview`,()=>{
 const p=planFor(wave);assert.ok(!p.error,JSON.stringify(p));
 assert.equal(p.swarm.killTarget,swarmQuota(wave));assert.equal(p.swarm.concurrent,swarmConcurrent(wave));
 assert.equal(p.completionRules.kind,'cohort');
 const next=swarmRoundPreview({arenaId:'helios_core',wave,seed:4242,plan:p});
 assert.equal(next.foreground.title,p.swarm.foundry.title);if(wave===29) assert.equal(next.event,null);
 for(const extra of [{arenaId:'the_hive'},{mutators:['dense']},{circuitRound:1}]) assert.equal(swarmFoundryRound({arenaId:'helios_core',wave,...extra}),null);
});
for (const wave of [29,30]) test(`live owner stages round ${wave} and releases its remaining debt`,()=>{
 const h=fixture(wave,true);try{
 const reserved=()=>h.engine._splitter().reserve+h.engine._mother().reserve+h.engine._reserve().left+h.engine._hive().sacBudget+h.engine.view.machineReserve;
 assert.equal(h.engine.view.aliveCount+h.engine.view.pendingCount+reserved(),swarmBroodPopulation(wave));
 h.tick(300);assert.equal(admitted(h).length,0);assert.equal(h.engine.view.aliveCount,0);assert.ok(h.engine.view.pendingCount>0 && h.engine.view.pendingCount<=swarmBroodPopulation(wave));
 noteSwarmPilotAction(h.state);h.engine.spawnWave(h.state);h.tick(2);
 const expected={29:['lancer_sniper'],30:['pd_screen_escort','corsair_raider']}[wave];
 assert.deepEqual(admitted(h).map(e=>e.data.lootTableId).sort(),expected.sort());
 assert.equal(h.engine.view.aliveCount,0);
 h.tick(480);assert.equal(admitted(h).length,expected.length+1);
 h.state.mode="menu";h.tick(400);assert.equal(h.engine.view.aliveCount,0);h.state.mode="flight";
 h.tick(1250);assert.ok(h.engine.view.aliveCount>0);assert.ok(admitted(h).length>expected.length);
 const removed=h.events.filter(e=>e.type==='swarm:broodKills').reduce((n,e)=>n+(e.payload.removedCount||0),0);assert.equal(h.engine.view.aliveCount+h.engine.view.pendingCount+reserved()+removed,swarmBroodPopulation(wave));
 assert.equal(h.events.filter(e=>e.type==='run:waveCleared').length,0);
 }finally{h.ships.destroy();h.engine.destroy?.();}
});
test('later act and boss cadence preserved',()=>{assert.equal(planFor(29).packages.some(p=>p.role==='boss'),false);assert.equal(planFor(30).packages.some(p=>p.role==='boss'),false);assert.equal(planFor(32).swarm.act.id,'breaker_yard');});

import {createSimulation} from '../src/core/sim.js';
import {survivalArena} from '../src/systems/survivalArena.js';
import {spawnBudget} from '../src/systems/spawnBudget.js';
import {swarmArena} from '../src/systems/swarmArena.js';
import {runSession} from '../src/systems/runSession.js';
import {swarmEventFor} from '../src/data/swarmEvents.js';
const seed=4242;
function eventFixture(t,wave,{rock=true}={}){
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

for(const accept of [false,true])test(`third-exit event verdict ${accept}`,t=>{
 const h=eventFixture(t,30);h.tick(300);assert.equal(h.events.filter(x=>x.type==='swarm:eventTelegraphed').length,0);
 noteSwarmPilotAction(h.state);h.tick(839);assert.equal(h.events.filter(x=>x.type==='swarm:eventTelegraphed').length,0);
 h.tick(2);const cue=h.events.find(x=>x.type==='swarm:eventTelegraphed').payload;
 assert.equal(cue.eventId,swarmEventFor({arenaId:'helios_core',wave:30,seed}).id);
 h.bus.emit('swarm:eventVerdict',{eventId:cue.eventId,wave:30,accept});h.tick(500);
 assert.equal(h.events.filter(x=>x.type==='run:awardRequested'&&x.payload.reason==='swarm:eventBounty').length,accept?1:0);
 assert.equal(h.events.filter(x=>x.type==='run:waveCleared').length,0);
});
