import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {createRunState} from '../src/core/runState.js';
import {resolvePhysicsBodySpec} from '../src/core/physicsAuthority.js';
import {planWave} from '../src/systems/survivalWavePlanner.js';
import {survivalWave} from '../src/systems/survivalWave.js';
import {survivalArena} from '../src/systems/survivalArena.js';
import {spawnBudget} from '../src/systems/spawnBudget.js';
import {swarmArena} from '../src/systems/swarmArena.js';
import {runSession} from '../src/systems/runSession.js';
import {noteSwarmPilotAction} from '../src/systems/swarmSafety.js';
import {swarmQuota,swarmConcurrent} from '../src/data/swarmMode.js';
import {swarmBroodPopulation} from '../src/data/swarmBrood.js';
import {swarmFoundryRound,foundryScoreFromPlan} from '../src/data/swarmFoundryScore.js';
import {swarmRoundPreview} from '../src/data/swarmLadder.js';
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

test('Regent gets a truthful finite boss read without stealing adjacent rooms',()=>{
 const p=planFor(25);assert.equal(p.swarm.foundry.id,'cross_the_crown');assert.equal(p.swarm.bossId,'forge_regent');assert.equal(p.swarm.bossScoreId,'capital_boss_regent');assert.equal(p.arenaPhase,'boss');assert.equal(p.swarm.killTarget,swarmQuota(25));assert.equal(p.swarm.concurrent,swarmConcurrent(25));assert.equal(p.swarm.requireBoss,true);
 const champions=p.schedule.filter(x=>x.champion);assert.equal(champions.length,1);assert.equal(champions[0].readAfterTicks,0);assert.ok(p.schedule.filter(x=>!x.champion).every(x=>x.readAfterTicks===1200));
 assert.equal(swarmRoundPreview({arenaId:'helios_core',wave:25,seed,plan:p}).foreground.title,'Cross the crown');
 assert.equal(planFor(24).swarm.foundry,undefined);assert.ok(planFor(24).swarm.massGap);for(const w of [26,27,28]){assert.equal(planFor(w).swarm.act.id,'mooring_line');assert.equal(planFor(w).swarm.foundry.wave,w);}
 for(const extra of [{arenaId:'the_hive'},{mutators:['dense']},{circuitRound:{kind:'survive'}},{ruleset:'scored'}])assert.equal(planFor(25,extra).swarm?.foundry,undefined);
});
test('Regent foreground waits for action, protects first read and repays the entire Brood debt',t=>{
 const h=fixture(t,25);const reserved=()=>h.engine._splitter().reserve+h.engine._mother().reserve+h.engine._reserve().left+h.engine._hive().sacBudget+h.engine.view.machineReserve;const planned=h.engine.view.aliveCount+h.engine.view.pendingCount+reserved();assert.equal(planned,swarmBroodPopulation(25));h.tick(180);assert.equal(h.owner._foundryTicks,0);assert.equal(h.engine.view.aliveCount,0);assert.equal(h.ships().length,1); // Champion admission remains independent of first-action clock.

 noteSwarmPilotAction(h.state);h.tick();assert.equal(h.ships().length,1);assert.equal(h.ships()[0].data.lootTableId,'forge_regent');assert.equal(h.engine.view.aliveCount,0);
 h.tick(1198);assert.equal(h.ships().length,1);assert.equal(h.engine.view.aliveCount,0);assert.equal(h.owner._foundryTicks,1199);
 h.state.mode='pause';h.tick(90);assert.equal(h.owner._foundryTicks,1199);h.state.mode='flight';h.tick(62);assert.ok(h.ships().length>1);assert.ok(h.engine.view.aliveCount>0);assert.equal(h.engine._bank(),null);
 const killed=h.events.filter(e=>e.type==='swarm:broodKills').reduce((n,e)=>n+e.payload.removedCount,0);assert.equal(h.engine.view.aliveCount+h.engine.view.pendingCount+reserved()+killed,planned);assert.equal(h.events.filter(e=>e.type==='run:waveCleared').length,0);
 h.bus.emit('run:endRequested',{outcome:'aborted',reason:'retry'});h.start();h.tick(120);assert.equal(h.owner._foundryTicks,0);assert.equal(h.engine.view.aliveCount,0);assert.equal(h.ships().length,1); // Champion admission remains independent of first-action clock.

});
test('sparse room gap and old or malformed plans never acquire a score',()=>{
 assert.equal(swarmFoundryRound({arenaId:'helios_core',wave:24}),null);
 assert.equal(foundryScoreFromPlan({swarm:{foundry:{id:'cross_the_crown',wave:24}}},24),null);
 assert.equal(foundryScoreFromPlan({swarm:{}},25),null);
 assert.equal(foundryScoreFromPlan({swarm:{foundry:{id:'wrong',wave:25}}},25),null);
 assert.equal(foundryScoreFromPlan({swarm:{foundry:{id:'cross_the_crown',wave:24}}},25),null);
});
