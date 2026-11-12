import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunState} from '../src/core/runState.js';
import {planWave} from '../src/systems/survivalWavePlanner.js';
import {survivalWave} from '../src/systems/survivalWave.js';
import {survivalArena} from '../src/systems/survivalArena.js';
import {spawnBudget} from '../src/systems/spawnBudget.js';
import {swarmArena} from '../src/systems/swarmArena.js';
import {runSession} from '../src/systems/runSession.js';
import {planSwarmOpeningLeecher} from '../src/systems/swarmOpeningLeecher.js';
import {swarmBroodPopulation} from '../src/data/swarmBrood.js';
const DT=1/60,seed=73311;
const planFor=(wave,extra={})=>planWave({seed,wave,arenaId:'helios_core',ruleset:'swarm',...extra});
test('native ordinary input sheds against the original selected bank in early and crowded terrain orders',async t=>{
 const {bootRealPath}=await import('../scripts/lib/bench/realPath.mjs');const {input}=await import('../src/systems/input.js');const {combat}=await import('../src/systems/combat.js');const {COMBAT_LAB_STARTER_PACKAGES}=await import('../src/data/combatLabSetups.js');
 const kit=COMBAT_LAB_STARTER_PACKAGES.find(k=>k.id==='ricochet_runner'),fittings=Array(13).fill(null);for(const row of kit.loadout)fittings[row.slotIndex]=row.defId;
 const report=[];
 for(const old of [0,64]){const mode='scrape';
  const h=await bootRealPath({seed,systems:[input,runSession,spawnBudget,survivalWave,swarmArena,survivalArena,combat,'tacticalAI','actions','weapons','flightV3','aiPorts','physics'],hulls:[{hullId:kit.hullId,fittings,isPlayer:true,pos:{x:0,z:0}}]});
  try{
   const s=h.state,p=h.player,tells=[],kills=[],actions=[],awards=[];s.run={...createRunState({kind:'survival',ruleset:'swarm',seed}),arenaId:'helios_core',wave:11,phase:'wave_intro'};s.input.autoFire=false;
   for(let n=0;n<old;n++)h.spawnObstacle({pos:{x:10000+n*100,z:10000},radius:18,mass:500,hull:1000});
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
   report.push({old,mode,latch:latch[0]?.tick,kill:kills[0]?.tick,purse:s.run.credits,score:s.run.score,hull:p.hull,position:{...p.pos},actions,surfaceId:identity.id});
  }finally{h.dispose();}
 }
 t.diagnostic(JSON.stringify({report,limit:'Round entry, kit and initial pilot pose are staged; the latch, movement, scrape, kill and award use ordinary production owners. No earlier earned rounds or rendered acceptance.'}));
});
