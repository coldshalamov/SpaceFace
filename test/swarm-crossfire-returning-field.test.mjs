import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { physics } from '../src/core/physics.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { combat } from '../src/systems/combat.js';
import { swarmArena, SWARM_DEBRIS_MAX } from '../src/systems/swarmArena.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { swarmBroodPopulation } from '../src/data/swarmBrood.js';

const DT = 1 / 60;
function fixture(t, { wave = 3, arenaId = 'helios_core', ruleset = 'swarm', tier = 0, mutators = [], phase = 'active', native = false } = {}) {
  const sim = createSimulation({ seed: 4242, systems: native ? [swarmArena, combat, physics] : [swarmArena] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight'; state.rockCore = { ratingT: tier };
  state.run = { ...createRunState({ kind: 'survival', ruleset, seed: 4242 }), wave, arenaId, arenaMutators: mutators, phase };
  const player = sim.spawn({ type: 'ship', pos: { x: -1500, z: -2000 }, vel: { x: 0, z: 0 },
    rot: 0, radius: 8, mass: 40, hull: 100, hullMax: 100, collides: true, data: {} });
  state.playerId = player.id;
  const arena = sim.registry.get('swarmArena'), engine = arena._brood;
  engine.prepareWave(state.run, wave);
  const add = (pos, data = {}, extra = {}) => sim.spawn({ type: 'asteroid', pos, vel: { x: 0, z: 0 },
    radius: 6, mass: 50, hull: 100, hullMax: 100, collides: true, data, ...extra });
  const old = add({ x: 88, z: 0 }, { swarmArenaDebris: true, openingPocket: true });
  const continued = () => state.entityList.filter(e => e.alive && e.data?.openingContinuation);
  return { sim, state, bus, player, arena, engine, add, old, continued };
}
const census = engine => {
  const b = engine._bodies, result = {};
  for (let i = 0; i < b.alive.length; i++) if (b.alive[i]) {
    const family = b.liveFamilyId[b.family[i]]; result[family] = (result[family] || 0) + 1;
  }
  return result;
};
const prepare = f => f.arena._prepareOpeningContinuation(f.state.run, f.state.simTime);


function populate(f,{near=13,far=29,fragments=18,ttl=10,material=true,chunk=true}={}){
 for(let i=0;i<near+far;i++){
  const distant=i>=near,fragment=distant&&i-near<fragments;
  f.add({x:f.player.pos.x+(distant?1200:300),z:f.player.pos.z+i*0.01},
   {swarmArenaDebris:true,...(fragment?{isChunk:chunk,materialFragment:material,despawnAt:f.state.simTime+ttl}:{despawnAt:f.state.simTime+900})});
 }
 // The fixture's unrelated original court remains physical and is counted too.
}

test('a retiring fractured field leaves one real light payload for the fourth-round mixed scene',t=>{
 const f=fixture(t,{wave:4});populate(f);
 const originals=f.state.entityList.map(e=>({e,s:JSON.stringify(e)}));
 const count=f.state.entityList.length;
 f.bus.emit('run:waveStarted',{wave:4});
 assert.equal(f.continued().length,1);assert.equal(f.state.entityList.length,count+1);
 assert.deepEqual(census(f.engine),{mite:3,spitter:1});assert.equal(f.engine.view.pendingCount,141);
 assert.ok(resolvePhysicsBodySpec(f.continued()[0]).mass<=220);
 for(const {e,s} of originals){const before=JSON.parse(s);assert.deepEqual({...e.pos},before.pos);assert.equal(e.alive,before.alive);assert.equal(e.data.despawnAt,before.data.despawnAt);}
 f.bus.emit('run:waveStarted',{wave:4});assert.equal(f.continued().length,1);assert.equal(f.state.entityList.length,count+1);
});

for(const [label,options,wave] of [
 ['ordinary full distant field',{fragments:0},4],
 ['full local field',{near:20,far:22,fragments:22},4],
 ['long-lived fragments',{ttl:900},4],
 ['unknown fragment lifetime',{ttl:Infinity},4],
 ['chunk flag alone',{material:false},4],
 ['material flag alone',{chunk:false},4],
 ['third-round contracts unchanged',{},3],
])test(label+' cannot borrow the continuation allowance',t=>{
 const f=fixture(t,{wave});populate(f,options);const before=f.state.entityList.length;
 assert.equal(prepare(f),null);assert.equal(f.continued().length,0);assert.equal(f.state.entityList.length,before);
});

test('a crowded native placement still refuses the mixed scene even with retiring fragments',t=>{
 const f=fixture(t,{wave:4});populate(f);f.add({...f.player.pos},{},{radius:300,physicsBody:{radius:300,dynamic:false}});
 const count=f.state.entityList.length;assert.equal(prepare(f),null);assert.equal(f.state.entityList.length,count);
});

test('a scene-ready original light stone is reused without adding a continuation body',t=>{
 const f=fixture(t,{wave:4});populate(f);const original=f.add({x:f.player.pos.x+88,z:f.player.pos.z},{swarmArenaDebris:true,openingPocket:true});
 assert.ok(f.engine.planOpeningContinuation(f.state));const count=f.state.entityList.length;
 f.bus.emit('run:waveStarted',{wave:4});assert.equal(f.continued().length,0);assert.equal(f.state.entityList.length,count);
 assert.deepEqual(census(f.engine),{mite:3,spitter:1});assert.equal(original.alive,true);
});
