import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { recordImpulseProvenance } from '../src/combat/impulseKernel.js';
import { createBroodEngine, BROOD_PHASE_WINDUP } from '../src/systems/swarmBrood.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';

// Focused production-owner collision/admission tests. Poses and provenance are fixtures,
// not claimed player maneuvers; the actual Brood engine supplies deaths and award receipts.
function fixture(t, count = 64, wave = 1) {
  const sim = createSimulation({ seed: 4242, systems: [] }); t.after(() => sim.dispose());
  const s = sim.state, events = [];
  s.mode = 'flight'; s.tick = 1000; s.simTime = 1000 / 60; s.rockCore = { ratingT: 0 };
  s.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'active', wave, arenaId: 'helios_core' };
  const add = spec => { const e = sim.spawn({ alive: true, collides: true, vel: { x: 0, z: 0 }, ...spec }); resolvePhysicsBodySpec(e); return e; };
  const p = add({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 8, mass: 40, hull: 100 });
  s.playerId = p.id;
  const rock = (x, z = 0) => add({ type: 'asteroid', pos: { x, z }, radius: 6, mass: 84, vel: { x: 100, z: 0 } });
  const ordinary = Array.from({ length: count }, (_, i) => rock(10000 + i * 30, 10000));
  const own = (e, actorId = p.id, appliedTick = s.tick) => recordImpulseProvenance(e, { actorId, appliedTick, tag: 'collision', magnitude: 100 });
  const engine = createBroodEngine({ getState: () => s, bus: { emit: (event, payload) => events.push({ event, ...payload }) } });
  engine.prepareWave(s.run, wave, planWave({ seed: 4242, wave, arenaId: 'helios_core', ruleset: 'swarm' }));
  engine.spawnWave(s); noteSwarmPilotAction(s);
  const b = engine._bodies, slots = [];
  for (let i = 0; i < b.alive.length; i++) if (b.alive[i]) {
    slots.push(i); b.px[i] = -10000 - i * 30; b.pz[i] = -10000;
    b.vx[i] = b.vz[i] = 0; b.phase[i] = BROOD_PHASE_WINDUP; b.timer[i] = 100;
    b.family[i] = b.liveFamilyId.indexOf('mite');
  }
  assert.ok(slots.length >= 10);
  const place = (e, n = 0, offset = 0) => { const i = slots[n]; b.px[i] = e.pos.x + offset; b.pz[i] = e.pos.z; return i; };
  const tick = () => { s.tick++; s.simTime += 1 / 60; engine.step(s); };
  const kills = () => events.filter(e => e.event === 'swarm:broodKills').reduce((n, e) => n + e.count, 0);
  return { s, p, add, rock, ordinary, own, engine, b, slots, place, tick, kills, events };
}
for (const mode of ['active line', 'recent provenance']) test(`late asteroid earns real collision and reward through ${mode}`, t => {
  const h = fixture(t), r = h.rock(200); const i = h.place(r, 0, 7); // Beyond cable endpoint4.4, inside rock contact8.7.
  if (mode === 'active line') h.s.player.tether = { active: true, targetId: r.id }; else h.own(r);
  h.tick(); assert.equal(h.b.alive[i], 0); assert.equal(h.kills(), 1);
  const paid = h.events.filter(e => e.event === 'swarm:broodKills');
  assert.equal(paid[0].cause, 'collision'); assert.equal(paid[0].credits, 1); assert.equal(paid[0].score, 12);
  assert.equal(h.events.filter(e => e.event === 'run:awardRequested').length, 1);
  const before = structuredClone(h.events); h.engine.step(h.s); assert.deepEqual(h.events, before, 'same tick cannot pay twice');
});
for (const mode of ['missing', 'expired', 'other actor', 'dead', 'noncolliding']) test(`${mode} overflow is not admitted`, t => {
  const h = fixture(t), r = h.rock(200), i = h.place(r);
  if (mode !== 'missing') h.own(r, mode === 'other actor' ? 987654 : h.p.id, mode === 'expired' ? h.s.tick - 181 : h.s.tick);
  if (mode === 'dead') r.alive = false;
  if (mode === 'noncolliding') r.collides = false;
  h.tick(); assert.equal(h.b.alive[i], 1); assert.equal(h.kills(), 0);
  assert.equal(h.events.filter(e => e.event === 'run:awardRequested').length, 0);
});
test('multiple released originals can each earn a collision in the same tick', t => {
  const h = fixture(t); const indices = [200, 240, 280].map((x, j) => { const r = h.rock(x); h.own(r); return h.place(r, j); });
  h.tick(); for (const i of indices) assert.equal(h.b.alive[i], 0); assert.equal(h.kills(), 3);
});
test('saturation retains nearest released bodies and prioritizes a farther active line', t => {
  const h = fixture(t), rocks = Array.from({ length: 9 }, (_, j) => h.rock(200 + j * 40));
  rocks[8].pos.z = -500; // Keep the active cable clear of released-rock contact fixtures.
  for (const r of rocks) h.own(r);
  h.s.player.tether = { active: true, targetId: rocks[8].id };
  const ids = rocks.map((r, j) => h.place(r, j));
  // Outward of the active endpoint: contact is the rock, not the whip line.
  h.b.px[ids[8]] += 5; h.b.pz[ids[8]] -= 5; h.tick();
  ids.forEach((i, j) => assert.equal(h.b.alive[i], j === 7 ? 1 : 0, `candidate ${j}`)); assert.equal(h.kills(), 8);
});
test('equal-distance overflow keeps deterministic index order at saturation', t => {
  const h = fixture(t), rocks = Array.from({ length: 9 }, (_, j) => h.rock(200, j * 40));
  // Distances tie by making pilot coordinates nonfinite would be invalid; instead
  // exact cardinal positions give a real tie at the capacity boundary.
  rocks[7].pos = { x: 0, z: 600 }; rocks[8].pos = { x: 0, z: -600 };
  for (const r of rocks) h.own(r);
  const a = h.place(rocks[7]), b = h.place(rocks[8], 1); h.tick();
  assert.equal(h.b.alive[a], 0); assert.equal(h.b.alive[b], 1);
});
test('all64 ordinary seats remain available beside eight handled overflow rocks', t => {
  const h = fixture(t); for (let j = 0; j < 8; j++) h.own(h.rock(200 + j * 40));
  const first = h.place(h.ordinary[0]), last = h.place(h.ordinary[63], 1); h.tick();
  assert.equal(h.b.alive[first], 0); assert.equal(h.b.alive[last], 0);
});
test('unsaturated ordinary custody remains one collision and one award', t => {
  const h = fixture(t, 3), r = h.ordinary[2]; h.own(r); const i = h.place(r);
  h.tick(); assert.equal(h.b.alive[i], 0); assert.equal(h.kills(), 1);
  assert.equal(h.events.filter(e => e.event === 'run:awardRequested').length, 1);
});
test('reserved native offcut remains solid after64 ordinary and8 handled seats', t => {
  const h = fixture(t, 64, 6); for (let j = 0; j < 8; j++) h.own(h.rock(200 + j * 40));
  const offcut = h.add({ type: 'wreck', pos: { x: 800, z: 0 }, radius: 7, mass: 35,
    physicsBody: { dynamic: true, radius: 7, mass: 35 }, data: { swarmBossChunk: true, physicalRole: 'throw_mass', capitalBossEncounterId: 'capital_boss_hulk', capitalBossActorKey: 'swarm:w5/boss_chunk/0' } });
  h.s.run.telemetry.foundryMawOffcut = { id: offcut.id, generation: offcut.occupantGeneration, fightId: 'swarm:w5' };
  const i = h.place(offcut, 0, 8); h.tick();
  assert.equal(h.b.alive[i], 1); assert.ok(h.b.px[i] >= offcut.pos.x + 9.4 - 1e-4);
});
