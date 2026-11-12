import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import { swarmArena, SWARM_WRECK_KEEP } from '../src/systems/swarmArena.js';
import { combat } from '../src/systems/combat.js';
import { FOUNDRY_MAW_OFFCUT, isFoundryWreckKept } from '../src/data/swarmFoundryWreck.js';

function fixture(t, options = {}) {
  const sim = createSimulation({ seed: options.seed ?? 4242,
    systems: [swarmArena, combat, createProductionCapitalBossEncounters()] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: options.seed ?? 4242 }),
    arenaId: 'helios_core', phase: 'active', wave: 5, ...options.run };
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: -150, z: 0 },
    radius: 8, mass: 40, hull: 100, hullMax: 100, collides: true, data: {} });
  state.playerId = player.id;
  const boss = sim.spawn({ type: 'ship', team: 1, pos: { x: 0, z: 0 },
    radius: 28, mass: 1000, hull: 1000, hullMax: 1000, collides: true,
    data: { scanLabel: 'Iron Maw' } });
  const owner = sim.registry.get('capitalBossEncounters');
  const fightId = `swarm:w${state.run.wave}:iron_maw`;
  owner.start({ encounterId: 'capital_boss_hulk', fightId, bossId: boss.id, targetId: player.id });
  if(options.packed)sim.spawn({type:'station',pos:{x:0,z:0},radius:1000,hull:1000,hullMax:1000,collides:true,data:{scatterBlocker:true}});
  sim.registry.get('combat').onHit({ targetId: boss.id, ownerId: player.id,
    damage: 100000, damageType: 'kinetic', pos: { ...boss.pos } });
  const record = state.capitalBossEncounters.fights[fightId];
  const chunks = record.swarmAmmoChunks.map(id => state.entities.get(id));
  return { sim, state, bus, player, boss, owner, record, chunks, offcut: chunks[0],
    arena: sim.registry.get('swarmArena') };
}


import { seatSwarmMawFragment } from '../src/systems/swarmMawWreckScatter.js';
import { sweptDiscsOverlap } from '../src/systems/swarmSafety.js';

for (const seed of [1, 42, 91, 4242, 7, 19, 81, 100, 555, 98765]) test(`seed ${seed}: original fragments have clear native birth and outward paths`, t => {
 const h=fixture(t,{seed});
 assert.ok(h.chunks.length>=4&&h.chunks.length<=7);
 for(let i=0;i<h.chunks.length;i++){
  const a=h.chunks[i],body=resolvePhysicsBodySpec(a);
  assert.ok(Math.hypot(a.pos.x-h.boss.pos.x,a.pos.z-h.boss.pos.z)<=160.000001);
  assert.ok(!sweptDiscsOverlap(a.pos,body.radius,h.player,{velocity:a.vel,horizon:.75,clearance:4}));
  for(let j=i+1;j<h.chunks.length;j++)assert.ok(!sweptDiscsOverlap(a.pos,body.radius,h.chunks[j],{velocity:a.vel,horizon:.75,clearance:4}),`${i}/${j}`);
 }
});
function seatFixture(){
 const boss={pos:{x:0,z:0},vel:{x:8,z:-3}};
 const spec={type:'wreck',pos:{x:30,z:0},vel:{x:18,z:-3},radius:7,mass:35,physicsBody:{radius:7,mass:35,dynamic:true}};
 return {boss,spec,state:{entities:new Map()}};
}
test('clear authored seat is retained by reference and helper reads no RNG',()=>{
 const h=seatFixture();h.state.rng=()=>{throw Error('random draw');};
 const result=seatSwarmMawFragment(h.state,h.boss,h.spec);
 assert.equal(result.pos,h.spec.pos);assert.equal(result.vel,h.spec.vel);
});
test('blocked native body and crossing motion receive a local initial alternative, without moving old matter',()=>{
 const h=seatFixture();const blocker={alive:true,type:'wreck',pos:{x:30,z:70},vel:{x:0,z:-100},radius:1,physicsBody:{radius:18,mass:100,dynamic:true}};
 h.state.entities.set(1,blocker);resolvePhysicsBodySpec(blocker);resolvePhysicsBodySpec(h.spec);const before=structuredClone(blocker),original=structuredClone(h.spec);
 const result=seatSwarmMawFragment(h.state,h.boss,h.spec);
 assert.ok(result);assert.notDeepEqual(result.pos,h.spec.pos);assert.deepEqual(blocker,before);assert.deepEqual(h.spec,original);
 assert.ok(Math.abs(Math.hypot(result.vel.x-h.boss.vel.x,result.vel.z-h.boss.vel.z)-10)<1e-10);
 assert.ok(!sweptDiscsOverlap(result.pos,7,blocker,{velocity:result.vel,horizon:.75,clearance:4}));
});
test('a packed death site refuses a slot rather than issuing inside a solid or far away',()=>{
 const h=seatFixture();h.state.entities.set(1,{alive:true,type:'station',pos:{x:0,z:0},radius:1000});
 assert.equal(seatSwarmMawFragment(h.state,h.boss,h.spec),null);
});
test('invalid geometry fails closed',()=>{
 const h=seatFixture();h.spec.pos.x=NaN;assert.equal(seatSwarmMawFragment(h.state,h.boss,h.spec),null);
});

test('packed real death spends all original slots once; removing the obstacle cannot dispense them later', t=>{
 const h=fixture(t,{packed:true});assert.deepEqual(h.record.swarmAmmoChunks,[]);
 assert.equal(h.state.run.telemetry.foundryMawOffcut,undefined);
 for(const e of h.state.entityList)if(e.data?.scatterBlocker)e.alive=false;
 const count=h.state.entityList.length;
 h.bus.emit('entity:killed',{id:h.boss.id});
 assert.deepEqual(h.record.swarmAmmoChunks,[]);assert.equal(h.state.entityList.length,count);
 assert.equal(h.state.run.telemetry.foundryMawOffcut,undefined);
});
