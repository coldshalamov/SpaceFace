import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {resolvePhysicsBodySpec,markPhysicsBodyNativeFailure} from '../src/core/physicsAuthority.js';
import {planWave} from '../src/systems/survivalWavePlanner.js';
import {survivalWave} from '../src/systems/survivalWave.js';
import {survivalArena} from '../src/systems/survivalArena.js';
import {spawnBudget} from '../src/systems/spawnBudget.js';
import {swarmArena} from '../src/systems/swarmArena.js';
import {runSession} from '../src/systems/runSession.js';
import {noteSwarmPilotAction} from '../src/systems/swarmSafety.js';
import {planSwarmOpeningLeecher} from '../src/systems/swarmOpeningLeecher.js';
const DT=1/60,seed=73311;
const planFor=(wave,extra={})=>planWave({seed,wave,arenaId:'helios_core',ruleset:'swarm',...extra});
function fixture(t,wave,{rock=true,old=64}={}){
 const sim=createSimulation({seed,systems:[runSession,spawnBudget,swarmArena,survivalWave,survivalArena]});t.after(()=>sim.dispose());
 const {state,bus}=sim;state.mode='flight';state.rockCore={ratingT:0};
 const player=sim.spawn({type:'ship',team:0,pos:{x:0,z:0},vel:{x:0,z:0},radius:8,mass:40,hull:100,collides:true,data:{}});state.playerId=player.id;resolvePhysicsBodySpec(player);
 for(let n=0;n<old;n++)resolvePhysicsBodySpec(sim.spawn({type:'asteroid',pos:{x:2000+n*100,z:2000},vel:{x:0,z:0},radius:18,mass:500,collides:true,data:{}}));
 let surface=rock?sim.spawn({type:'asteroid',pos:{x:100,z:0},vel:{x:0,z:0},radius:18,mass:500,collides:true,data:{swarmArenaDebris:true}}):null;
 if(surface)resolvePhysicsBodySpec(surface);
 const events=[];for(const type of ['run:waveCleared','swarm:eventTelegraphed','swarm:broodKills','run:awardRequested'])bus.on(type,payload=>events.push({type,payload,tick:state.tick}));
 const start=()=>{sim.registry.get('runSession').newGame();bus.emit('run:beginRequested',{kind:'survival',ruleset:'swarm',seed,arenaId:'helios_core'});state.run.wave=wave;state.run.phase='wave_intro';bus.emit('run:wavePlanned',{wave,plan:planFor(wave)});state.run.phase='active';state.mode='flight';bus.emit('run:waveStarted',{wave});};start();
 const owner=sim.registry.get('survivalWave'),engine=sim.registry.get('swarmArena')._brood;
 return {sim,state,bus,player,surface,start,events,owner,engine,tick(n=1){for(let i=0;i<n;i++)sim.step(DT);},ships:()=>state.entityList.filter(e=>e.alive&&e.type==='ship'&&e.id!==player.id&&owner._cohort.has(e.id))};
}

for(const mutation of ['none','disabled','body_disabled','dead','native_failure','sensor','generation','replacement','wave'])test(`crowded selected surface lifecycle: ${mutation}`,t=>{
 const h=fixture(t,11);noteSwarmPilotAction(h.state);h.tick();const b=h.engine._bodies,i=b.alive.findIndex(Boolean);
 b.px[i]=-11.2;b.pz[i]=0;b.vx[i]=54;b.vz[i]=0;h.tick();assert.equal(b.phase[i],4);
 if(mutation==='disabled')h.surface.collides=false;
 if(mutation==='body_disabled')h.surface.physicsBody=false;
 if(mutation==='dead')h.surface.alive=false;
 if(mutation==='native_failure')markPhysicsBodyNativeFailure(h.surface,{});
 if(mutation==='sensor')h.surface.physicsBody={...h.surface.physicsBody,material:'massline_sensor'};
 if(mutation==='generation')h.surface.occupantGeneration=(h.surface.occupantGeneration||0)+1;
 if(mutation==='replacement')h.state.entities.set(h.surface.id,{...h.surface});
 if(mutation==='wave')h.state.run.wave=12;
 h.player.pos.x=100-18-8;h.player.vel.x=10;h.tick();
 const kills=h.events.filter(x=>x.type==='swarm:broodKills');
 assert.equal(kills.length,mutation==='none'?1:0);
 if(mutation==='none'){assert.equal(kills[0].payload.credits,2);assert.equal(kills[0].payload.score,22);h.tick();assert.equal(h.events.filter(x=>x.type==='swarm:broodKills').length,1);}
});

test('retry clears the old selected surface and paid scene before fresh input',t=>{
 const h=fixture(t,11);noteSwarmPilotAction(h.state);h.tick();assert.equal(h.engine.view.aliveCount,1);
 h.start();assert.equal(h.engine.view.aliveCount,0);h.tick(100);assert.equal(h.engine.view.aliveCount,0);
 assert.equal(h.events.filter(x=>x.type==='swarm:broodKills').length,0);
 assert.equal(h.state.run.credits,0);assert.equal(h.state.run.score,0);
});
