import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { runSession } from '../src/systems/runSession.js';
import { swarmFortify } from '../src/systems/swarmFortify.js';
import { fields } from '../src/systems/fields.js';
import { combat } from '../src/systems/combat.js';
import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';
import { fortifyReadiness } from '../src/ui/swarmFortifyReadiness.js';

function fixture(t,deviceId='kinetic_turret'){
 const sim=createSimulation({seed:4242,systems:[runSession,fields,combat,swarmFortify]});t.after(()=>sim.dispose());
 const {state,bus}=sim;state.mode='flight';state.settings.gameplay.physicsBackend='custom';
 bus.emit('run:beginRequested',{kind:'survival',ruleset:'swarm',seed:4242,arenaId:'helios_core'});
 state.run.phase='draft';state.run.wave=1;state.run.credits=1000;
 const player=sim.spawn({type:'ship',team:0,factionId:'faction_player',pos:{x:0,z:0},vel:{x:0,z:0},rot:0,radius:8,mass:20,hull:100,hullMax:100,data:{}});state.playerId=player.id;
 bus.emit('run:wavePlanned',{wave:1});const owner=sim.registry.get('swarmFortify');let receipt;
 bus.on('swarm:fortifyBuildResolved',r=>receipt=r);
 const build=(id=1)=>{bus.emit('swarm:fortifyBuildRequested',{requestId:id,runToken:owner.getReadModel().runToken,deviceId,socketId:'front-near'});return receipt;};
 const initial=build();assert.equal(initial.accepted,true,JSON.stringify(initial));state.run.phase='active';state.run.wave=2;
 const entities=receipt.structureIds.map(id=>state.entities.get(id));
 const kill=entity=>{entity.hull=0;entity.alive=false;sim.helpers.removeEntity(entity.id,{immediate:true,reason:'combat_killed'});bus.flush();};
 return {sim,state,bus,owner,entities,build,kill};
}

test('canonical destruction reaches the wire as one lost purchase, never a repairable phantom',t=>{
 const h=fixture(t),original=h.entities[0],wallet=h.state.run.credits;h.kill(original);
 h.state.run.phase='draft';let view;h.bus.on('swarm:fortifyState',x=>view=x);
 h.bus.emit('swarm:fortifyStateRequested',{requestId:'fortify-preparation-test'});
 assert.deepEqual(view.structures,[]);assert.deepEqual(view.lostDevices,[{deviceId:'kinetic_turret',socketId:'front-near',wave:2}]);
 const wire=projectBridgeEvent('swarm:fortifyState',view);assert.equal(wire.dropped,false);
 assert.equal(wire.flat.requestId,'fortify-preparation-test');assert.equal(fortifyReadiness(wire.flat).label,'Fortify · 1 lost');
 assert.equal(h.state.run.credits,wallet);assert.equal(h.state.entities.has(original.id),false);
 h.bus.emit('entity:destroyed',{id:original.id,entity:original});assert.equal(h.owner.getReadModel().lostDevices.length,1);
 h.bus.emit('run:wavePlanned',{wave:2});assert.equal(h.owner.getReadModel().lostDevices.length,1,'duplicate planning does not erase the receipt');
});

test('a lost socket clears only after successful paid replacement and expires from next-round display',t=>{
 const h=fixture(t);h.kill(h.entities[0]);h.state.run.phase='draft';
 const purse=h.state.run.credits;h.state.run.credits=0;assert.equal(h.build(2).accepted,false);
 assert.equal(h.owner.getReadModel().lostDevices.length,1);
 h.state.run.credits=purse;assert.equal(h.build(3).accepted,true);assert.deepEqual(h.owner.getReadModel().lostDevices,[]);
 const replacement=h.state.entityList.find(e=>e.alive&&e.data?.swarmFortify);
 h.state.run.phase='active';h.kill(replacement);assert.equal(h.owner.getReadModel().lostDevices.length,1);
 h.state.run.wave=3;assert.deepEqual(h.owner.getReadModel().lostDevices,[]);
});

test('Tesla endpoint loss stays a serviceable pair until both original endpoints are gone',t=>{
 const h=fixture(t,'tesla_pair');h.kill(h.entities[0]);h.state.run.phase='draft';
 let model=h.owner.getReadModel();assert.equal(model.structures[0].missingEndpoint,true);assert.deepEqual(model.lostDevices,[]);
 assert.equal(fortifyReadiness(model).label,'Fortify · service needed');
 h.state.run.phase='active';h.kill(h.entities[1]);h.state.run.phase='draft';
 model=h.owner.getReadModel();assert.equal(model.structures.length,0);assert.equal(model.lostDevices.length,1);
 assert.equal(fortifyReadiness(model).label,'Fortify · 1 lost');
});

test('stale identities and administrative retirement cannot fabricate a combat loss',t=>{
 const h=fixture(t),original=h.entities[0];
 h.bus.emit('entity:destroyed',{id:original.id,entity:{...original,hull:0}});
 assert.equal(h.owner.getReadModel().structures.length,1);assert.deepEqual(h.owner.getReadModel().lostDevices,[]);
 h.sim.helpers.removeEntity(original.id,{immediate:true,reason:'administrative'});h.bus.flush();assert.deepEqual(h.owner.getReadModel().lostDevices,[]);
 h.bus.emit('run:endRequested',{outcome:'aborted'});assert.deepEqual(h.owner.getReadModel().lostDevices,[]);
});

for (const event of ['run:ended','game:new','game:exitToMenu','save:restoring','save:loaded']) test(`a recorded loss is retired by ${event}`,t=>{
 const h=fixture(t);h.kill(h.entities[0]);assert.equal(h.owner.getReadModel().lostDevices.length,1);
 h.bus.emit(event,{});assert.deepEqual(h.owner.getReadModel().lostDevices,[]);
});
