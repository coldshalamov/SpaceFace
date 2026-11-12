import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createBus} from '../src/core/eventBus.js';
import {createGameState} from '../src/core/gameState.js';
import {createRunState} from '../src/core/runState.js';
import {swarmArena} from '../src/systems/swarmArena.js';
import {HIVE_ARENA_ID,HIVE_SAC_TAG,HIVE_SAC_PERIOD_S} from '../src/systems/theHiveArena.js';
const DT=1/60,SEED=4242;
function boot({ wave = 1, arenaId = HIVE_ARENA_ID, seed = SEED } = {}) {
  const state = createGameState(seed);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
        vel: spec.vel ? { x: spec.vel.x, z: spec.vel.z } : { x: 0, z: 0 },
        data: { ...(spec.data || {}) },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = {
    id: state.nextEntityId++, alive: true, type: 'ship', team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6, mass: 400,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed });
  state.run.arenaId = arenaId;
  state.run.phase = 'active';
  state.run.wave = wave;
  state.mode = 'flight';
  return { state, bus, emitted, helpers, spawned, player };
}

function arenaBoot(opts) {
  const h = boot(opts);
  const ctx = { state: h.state, bus: h.bus, helpers: h.helpers, registry: { get: () => null } };
  swarmArena.init(ctx);
  return h;
}

function ticks(h, seconds) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    h.state.simTime += DT;
    h.state.tick += 1;
    swarmArena.update();
  }
}


function start(){const h=arenaBoot();h.bus.emit('run:wavePlanned',{wave:1,plan:{}});h.bus.emit('run:waveStarted',{wave:1});return h;}
for(const receipt of [null,'entity:killed','entity:destroyed'])test(`thrown sac bursts at final original body location: ${receipt||'dead body retained'}`,()=>{
 const h=start();try{const sac=h.spawned.find(e=>e.data?.[HIVE_SAC_TAG]);assert.ok(sac);
 const original={...sac.pos};sac.pos={x:original.x+190,z:original.z-110};sac.alive=false;
 if(receipt){h.bus.emit(receipt,{id:sac.id,pos:{x:99999,z:99999}});h.state.entities.delete(sac.id);}
 let bursts=0;h.bus.on('swarm:hiveSacKilled',p=>{if(p.sacId===sac.id){bursts++;swarmArena._hiveTick(h.state,h.state.run);}});
 const engine=swarmArena._brood;const before=engine.view.poolCount;swarmArena._hiveTick(h.state,h.state.run);
 assert.equal(bursts,1);assert.equal(engine.view.poolCount,before+1);assert.ok(Math.abs(engine._pools.x[before]-sac.pos.x)<0.0001);assert.ok(Math.abs(engine._pools.z[before]-sac.pos.z)<0.0001);
 swarmArena._hiveTick(h.state,h.state.run);assert.equal(bursts,1);
 }finally{swarmArena.destroy();}});

test('recycled id cannot become the carried sac, and ending the room during receipt stops old births',()=>{
 const h=start();try{const sacs=h.spawned.filter(e=>e.data?.[HIVE_SAC_TAG]);const dead=sacs[0];dead.pos={x:500,z:600};dead.alive=false;const replacement={...dead,alive:true,pos:{x:-900,z:-800},data:{}};h.state.entities.set(dead.id,replacement);
 const engine=swarmArena._brood;const before=engine.view.poolCount;let deaths=0;h.bus.on('swarm:hiveSacKilled',()=>{deaths++;h.bus.emit('run:ended',{});});
 h.state.simTime=swarmArena._hive.sacs.get(dead.id).nextBirthAt;swarmArena._hiveTick(h.state,h.state.run);
 assert.equal(deaths,1);assert.equal(swarmArena._hive,null);assert.equal(replacement.alive,true);assert.deepEqual(replacement.data,{});assert.equal(h.emitted.filter(e=>e.event==='swarm:hiveBirth').length,0);
 }finally{swarmArena.destroy();}});

test('ending before the next room tick does not release a recycled sac id',()=>{
 const h=start();try{const [id]=swarmArena._hive.sacs.keys();const replacement={id,alive:true,data:{},pos:{x:900,z:800}};h.state.entities.set(id,replacement);h.bus.emit('run:ended',{});assert.deepEqual(replacement.data,{});}finally{swarmArena.destroy();}
});

test('a consumed dead sac never owns a later occupant during cleanup',()=>{
 const h=start();try{const [id]=swarmArena._hive.sacs.keys();const dead=h.state.entities.get(id);dead.alive=false;swarmArena._hiveTick(h.state,h.state.run);const replacement={id,alive:true,data:{},pos:{x:900,z:800}};h.state.entities.set(id,replacement);h.bus.emit('run:ended',{});assert.deepEqual(replacement.data,{});}finally{swarmArena.destroy();}
});
