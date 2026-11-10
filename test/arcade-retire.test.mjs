import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalResults } from '../src/systems/survivalResults.js';
import { resultTitle, resultRows } from '../src/ui/screens/crucible.js';

function fixture() {
 const sim=createSimulation({seed:4242,systems:[runSession,survivalResults],updateOrder:[]});
 sim.state.mode='flight';const owner=sim.registry.get('runSession'), results=sim.registry.get('survivalResults');
 const p=sim.spawn({type:'ship',alive:true,isPlayer:true,team:0,pos:{x:0,z:0},vel:{x:0,z:0},radius:10,hull:100,hullMax:100,data:{}});
 sim.state.playerId=p.id;return {sim,owner,results,p,state:sim.state};
}
function start(h) {
 h.owner.begin({kind:'survival',ruleset:'swarm',seed:4242});
 for(const [expectedPhase,nextPhase] of [['loadout','arena_intro'],['arena_intro','wave_intro'],['wave_intro','active']])
  h.owner.transition({expectedPhase,nextPhase});
}
test('retirement is token-bound, unranked, truthful and never invents death or payout',()=>{
 const h=fixture();try {
  start(h);const {state,sim,owner,results,p}=h;state.run.wave=4;state.run.threatBudget=30;state.run.resolvedThreat=12;
  owner.award({credits:80,xp:15});const token=state.run.retireToken;
  let deaths=0,cleared=0,ready=0;sim.bus.on('player:death',()=>deaths++);sim.bus.on('run:waveCleared',()=>cleared++);sim.bus.on('run:resultsReady',()=>ready++);
  assert.equal(owner.retire({token:token+1}),false);assert.equal(state.run.phase,'active');
  assert.equal(owner.retire({token}),true);const result=results.lastResult();
  assert.equal(state.run.result.reason,'player_retired');assert.equal(result.outcome,'aborted');assert.equal(result.stopReason,'player_retired');
  assert.equal(result.unranked,true);assert.equal(result.credits,80);assert.equal(result.wave,4);assert.equal(result.remainingEnemies,18);
  assert.equal(result.wavesCleared,0);assert.equal(result.defeat,null);assert.equal(result.death,null);
  assert.equal(result.bankedBounty,undefined);assert.match(result.bankLine,/unbanked/i);assert.equal(resultTitle(result),'Run Retired');
  assert.ok(resultRows(result).some(([k,v])=>k==='Outcome' && /unranked/i.test(v)));
  assert.equal(p.alive,true);assert.equal(deaths,0);assert.equal(cleared,0);assert.equal(ready,1);
  assert.equal(owner.retire({token}),false);assert.equal(ready,1,'no second settlement');
  owner.newGame();results.newGame();start(h);const retryToken=state.run.retireToken;
  assert.notEqual(retryToken,token);assert.equal(state.run.seed,4242);assert.equal(owner.retire({token}),false);
  assert.equal(state.run.phase,'active','a stale confirmation cannot retire a same-seed retry');
 } finally {h.sim.dispose()}
});

test('adventure menu exit retains campaign-owned state and does not publish a retirement',()=>{
 const h=fixture();try {
  h.owner.begin({kind:'adventure',seed:7});h.state.player.credits=729;h.state.save.currentSlot='quick';
  let ready=0;h.sim.bus.on('run:resultsReady',()=>ready++);const before=structuredClone({player:h.state.player,save:h.state.save});
  h.sim.bus.emit('game:exitToMenu',{source:'pause'});
  assert.deepEqual({player:h.state.player,save:h.state.save},before);assert.equal(h.state.run.phase,'inactive');assert.equal(ready,0);
 } finally {h.sim.dispose()}
});
