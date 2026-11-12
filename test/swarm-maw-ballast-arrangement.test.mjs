import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { planSwarmMawBallast } from '../src/systems/swarmMawBallast.js';
import { spawnSwarmCapitalBallast, capitalBossBallastPosition } from '../src/missions/capitalBossSpawn.js';
import { requireCapitalBossEncounter } from '../src/data/encounters/capital-boss.js';
import { sweptDiscsOverlap } from '../src/systems/swarmSafety.js';
import { combat } from '../src/systems/combat.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
const encounter = requireCapitalBossEncounter('capital_boss_hulk');
function fixture(t, systems = []) {
  const sim = createSimulation({ seed: 1, systems }); t.after(() => sim.dispose());
  const s = sim.state; s.mode = 'flight';
  s.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 1 }), arenaId: 'helios_core', wave: 5, phase: 'active' };
  const player = sim.spawn({ type: 'ship', pos: { x: 0, z: 0 }, radius: 8, mass: 40, hull: 100, collides: true }); s.playerId = player.id;
  const boss = sim.spawn({ type: 'ship', pos: { x: 350, z: 0 }, radius: 28, mass: 420, hull: 680, hullMax: 680, collides: true });
  return { sim, s, player, boss, spawn: spec => sim.spawn(spec) };
}
function issue(h, ledger = {}) {
  return spawnSwarmCapitalBallast({ state: h.s, fightId: 'swarm:w5', encounter, boss: h.boss, ledger, spawnEntity: h.spawn });
}
test('first Maw seats one of the same three ballast within reach with a full-width throw route and escape', t => {
  const h = fixture(t), before = structuredClone(h.boss), ids = issue(h);
  assert.equal(ids.length, 3);
  const balls = ids.map(id => h.s.entities.get(id)), first = balls[0];
  assert.ok(Math.hypot(first.pos.x, first.pos.z) < 120);
  assert.equal(first.mass, 180); assert.equal(first.radius, 12); assert.equal(first.data.scanLabel, 'KEEL BALLAST');
  assert.deepEqual({...h.boss.pos}, before.pos); assert.deepEqual({...h.boss.vel}, before.vel);
  assert.ok(!balls.slice(1).some(e => sweptDiscsOverlap(first.pos, first.radius, e,
    { horizon: 1, clearance: 4, velocity: { x: h.boss.pos.x-first.pos.x, z: h.boss.pos.z-first.pos.z } })));
  assert.ok(!balls.concat(h.boss).some(e => sweptDiscsOverlap(h.player.pos, h.player.radius, e,
    { horizon: 1, clearance: 4, velocity: { x: 0, z: -100 } })));
});
test('blocked authored ballast is seated clear of the bank instead of overlapping it', t => {
  const h=fixture(t), p=capitalBossBallastPosition(encounter,h.boss,0);
  const bank=h.spawn({type:'asteroid',pos:p,radius:34,mass:500,hull:500,collides:true});
  const before={...bank.pos}; const ids=issue(h);
  assert.equal(ids.length,3);assert.deepEqual({...bank.pos},before);
  for(const id of ids){const b=h.s.entities.get(id);assert.ok(Math.hypot(b.pos.x-bank.pos.x,b.pos.z-bank.pos.z)>=b.radius+bank.radius+8);}
});
for(const [name,change] of [
 ['other arena',h=>h.s.run.arenaId='the_hive'],['other wave',h=>h.s.run.wave=35],
 ['mutator',h=>h.s.run.arenaMutators=['dense']],['circuit',h=>h.s.run.telemetry.circuit={}],
 ['Adventure',h=>h.s.run.kind='adventure'],['scored',h=>h.s.run.ruleset='scored'],
 ['missing player',h=>h.s.playerId=-1],['dead boss',h=>h.boss.alive=false],
])test(`${name} retains the original arrangement contract`,t=>{const h=fixture(t);change(h);assert.equal(planSwarmMawBallast(h.s,h.boss,encounter),null);});
test('other capital score is untouched',t=>{const h=fixture(t);assert.equal(planSwarmMawBallast(h.s,h.boss,requireCapitalBossEncounter('capital_boss_foreman')),null);});
test('duplicate and consumed slots never mint replacement ammunition',t=>{
 const h=fixture(t),ledger={},ids=issue(h,ledger);h.s.entities.get(ids[0]).alive=false;
 const count=h.s.entityList.length;assert.deepEqual(issue(h,ledger),[]);assert.equal(h.s.entityList.length,count);
 assert.equal(Object.keys(ledger).length,3);
});
test('a saturated room spends impossible seats once without creating overlapping actors',t=>{
 const h=fixture(t);const wall=h.spawn({type:'asteroid',pos:{x:175,z:0},radius:2000,mass:10000,hull:1000,collides:true});
 const ledger={};assert.deepEqual(issue(h,ledger),[]);assert.equal(Object.keys(ledger).length,3);
 assert.ok(Object.values(ledger).every(x=>x.state==='unplaced'&&x.entityId===null));
 wall.alive=false;assert.deepEqual(issue(h,ledger),[]);
});
test('failed spawn remains retryable but issued slots remain consumed',t=>{
 const h=fixture(t),ledger={};let calls=0;
 spawnSwarmCapitalBallast({state:h.s,fightId:'swarm:w5',encounter,boss:h.boss,ledger,spawnEntity:spec=>++calls===1?null:h.spawn(spec)});
 assert.equal(Object.keys(ledger).length,2);assert.equal(issue(h,ledger).length,1);assert.equal(Object.keys(ledger).length,3);
});
test('actual capital start passes state and uses the existing issuance ledger',t=>{
 const h=fixture(t,[combat,createProductionCapitalBossEncounters()]),owner=h.sim.registry.get('capitalBossEncounters');
 const request={encounterId:encounter.id,fightId:'swarm:w5',bossId:h.boss.id,targetId:h.player.id};owner.start(request);
 const balls=h.s.entityList.filter(e=>e.data?.physicalRole==='throw_mass');assert.equal(balls.length,3);
 assert.ok(Math.hypot(balls[0].pos.x,balls[0].pos.z)<120);const count=h.s.entityList.length;
 owner.start(request);assert.equal(h.s.entityList.length,count);
});

test('the other ballast cannot obstruct the composed throw or line-catch route',t=>{
 const h=fixture(t);h.boss.pos.x=220;h.boss.rot=Math.PI/16;
 const balls=issue(h).map(id=>h.s.entities.get(id)),first=balls[0];
 assert.ok(Math.hypot(first.pos.x,first.pos.z)<120);
 for(const e of balls.slice(1)){
 assert.equal(sweptDiscsOverlap(first.pos,first.radius,e,{horizon:1,clearance:4,velocity:{x:h.boss.pos.x-first.pos.x,z:h.boss.pos.z-first.pos.z}}),false);
 assert.equal(sweptDiscsOverlap(h.player.pos,2,e,{horizon:1,clearance:2,velocity:{x:first.pos.x,z:first.pos.z}}),false);
 }
});

test('a distant pilot gets a local approach opportunity without a false straight-flight promise',t=>{
 const h=fixture(t);h.boss.pos.x=600;
 const bank=h.spawn({type:'asteroid',pos:{x:150,z:0},radius:60,mass:500,hull:500,collides:true});
 const balls=issue(h).map(id=>h.s.entities.get(id)),first=balls[0],origin={x:380,z:0};
 assert.equal(balls.length,3);assert.ok(first.pos.x>380&&first.pos.x<500);
 assert.ok(Math.hypot(first.pos.x-origin.x,first.pos.z-origin.z)<120);
 assert.ok(Math.hypot(first.pos.x-h.boss.pos.x,first.pos.z-h.boss.pos.z)<200);
 assert.equal(sweptDiscsOverlap(h.player.pos,2,bank,{horizon:1,clearance:2,velocity:{x:first.pos.x,z:first.pos.z}}),true,
  'intervening bank remains real: this is not a direct-flight claim');
 for(const e of [bank,...balls.slice(1)]){
  assert.equal(sweptDiscsOverlap(first.pos,first.radius,e,{horizon:1,clearance:4,velocity:{x:h.boss.pos.x-first.pos.x,z:-first.pos.z}}),false);
  assert.equal(sweptDiscsOverlap(origin,2,e,{horizon:1,clearance:2,velocity:{x:first.pos.x-origin.x,z:first.pos.z}}),false);
 }
});
