import test from 'node:test';
import assert from 'node:assert/strict';
import {createBus} from '../src/core/eventBus.js';
import {createGameState} from '../src/core/gameState.js';
import {createRunState} from '../src/core/runState.js';
import {swarmJuice} from '../src/systems/swarmJuice.js';
function boot(t,extra={}){
 const state=createGameState(4242),bus=createBus(),calls=[];
 state.mode='flight';state.run={...createRunState({kind:'survival',ruleset:'swarm',seed:4242}),arenaId:'helios_core',wave:11,phase:'active',...extra};
 const owner=Object.create(swarmJuice);owner.init({state,bus});t.after(()=>owner.destroy());
 bus.on('swarm:announce',p=>calls.push(p));
 return {state,bus,owner,calls,send:(p={})=>bus.emit('swarm:broodCounter',{kind:'scrape',familyId:'leecher',wave:state.run.wave,...p})};
}
test('recovery payoff is bounded per verb/round and resets on new run',t=>{
 const h=boot(t);h.send();h.send();assert.equal(h.calls.length,1);assert.equal(h.calls[0].text,'LEECHER SHED');
 h.bus.emit('run:waveStarted',{});h.send();assert.equal(h.calls.length,1);
 h.state.run.wave=12;h.send();assert.equal(h.calls.length,2);
 h.state.run.wave=13;h.send({kind:'shell',familyId:'glassback'});h.send({kind:'shell',familyId:'glassback'});assert.equal(h.calls.length,3);
 assert.equal(h.calls[2].text,'SHELL BROKEN · LEAVE THE SHARDS');
 h.bus.emit('run:started',{});h.send({kind:'shell',familyId:'glassback'});assert.equal(h.calls.length,4);
});
for(const [name,extra,mode] of [['other ruleset',{ruleset:'standard'}],['other arena',{arenaId:'the_hive'}],['later wave',{wave:21}],['draft',{phase:'draft'}],['ended',{phase:'ended'}],['mutator',{arenaMutators:['heavies_only']}],['circuit',{telemetry:{circuit:{kind:'survive'}}}],['pause',{},'pause']])test(`no recovery call in ${name}`,t=>{
 const h=boot(t,extra);if(mode)h.state.mode=mode;h.send();assert.equal(h.calls.length,0);
});
test('stale, unknown and mismatched receipts do not consume the real payoff',t=>{
 const h=boot(t);for(const p of [{wave:12},{kind:'shell',familyId:'glassback'},{familyId:'mite'},{kind:'unknown'}])h.send(p);
 assert.equal(h.calls.length,0);h.send();assert.equal(h.calls.length,1);
});
test('recovery words do not change wallet, stock, time or sound',t=>{
 const h=boot(t),before=JSON.stringify(h.state.run),effects=[];
 for(const name of ['run:awardRequested','audio:cue','camera:shake','time:effect'])h.bus.on(name,p=>effects.push({name,p}));
 h.send();assert.equal(JSON.stringify(h.state.run),before);assert.deepEqual(effects,[]);
});
