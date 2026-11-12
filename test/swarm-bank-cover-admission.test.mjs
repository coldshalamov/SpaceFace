import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { resolvePhysicsBodySpec, markPhysicsBodyNativeFailure } from '../src/core/physicsAuthority.js';
import { recordImpulseProvenance } from '../src/combat/impulseKernel.js';
import { createBroodEngine, BROOD_PHASE_WINDUP, BROOD_PHASE_DASH } from '../src/systems/swarmBrood.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { planSwarmBank } from '../src/systems/swarmBank.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
const DT = 1 / 60;
const bankPlan = [{ id: 'charger', count: 2 }, { id: 'spitter', count: 1 }];
const wavePlan = wave => planWave({ seed: 4242, wave, arenaId: 'helios_core', ruleset: 'swarm' });

// State/contacts below are focused fixtures. The final native case uses real flight,
// body integration and Charger attacks after admission, without relocating any actor.
function fixture(t, { count = 64, native = false } = {}) {
  const sim = createSimulation({ seed: 4242, systems: native ? [flightV3, physics, combat] : [] });
  t.after(() => sim.dispose());
  const s = sim.state, events = [];
  s.mode = 'flight'; s.rockCore = { ratingT: 0 }; s.render.sectorShellAdmission = false;
  s.settings.gameplay.physicsBackend = 'rapier-dynamic';
  s.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'active', wave: 7, arenaId: 'helios_core' };
  const add = spec => { const e = sim.spawn({ alive: true, collides: true, vel: { x: 0, z: 0 }, ...spec }); resolvePhysicsBodySpec(e); return e; };
  const player = add({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 8, mass: 40, hull: 100, hullMax: 100, data: {} });
  s.playerId = player.id;
  const ordinary = Array.from({ length: count }, (_, i) => add({ type: 'asteroid', radius: 3,
    pos: { x: 2000 + i * 30, z: 2000 }, data: { swarmArenaDebris: true } }));
  const cover = add({ type: 'asteroid', radius: 7, mass: 35, pos: { x: 88, z: 0 },
    physicsBody: { dynamic: true, radius: 7, mass: 35 }, data: { swarmArenaDebris: true } });
  sim.bus.on('swarm:broodKills', e => events.push({ tick: s.tick, ...e }));
  const engine = createBroodEngine({ getState: () => s, bus: sim.bus });
  const start = (wave = 7) => {
    s.run.wave = wave; engine.prepareWave(s.run, wave, wavePlan(wave)); engine.spawnWave(s); noteSwarmPilotAction(s);
  };
  const tick = () => { if (native) sim.step(DT); else { s.tick++; s.simTime += DT; } engine.step(s); };
  const b = engine._bodies;
  const contact = (body = cover, { moving = false, slot = 0 } = {}) => {
    for (let i = 0; i < b.alive.length; i++) if (b.alive[i]) {
      b.px[i] = -4000 - i * 40; b.pz[i] = -4000; b.vx[i] = b.vz[i] = 0;
      b.phase[i] = BROOD_PHASE_WINDUP; b.timer[i] = 100;
    }
    assert.equal(b.alive[slot], 1);
    b.family[slot] = b.liveFamilyId.indexOf('charger');
    b.px[slot] = body.pos.x - 6; b.pz[slot] = body.pos.z;
    if (moving) body.vel.x = 100; else b.vx[slot] = 200;
    tick(); return b.alive[slot];
  };
  return { sim, s, player, cover, ordinary, events, add, engine, b, start, tick, contact };
}

test('selected unhandled overflow cover spends a real charge without granting player credit', t => {
  const h = fixture(t); const before = structuredClone(h.cover);
  assert.equal(planSwarmBank(h.s, h.s.run, 7, bankPlan).rockId, h.cover.id);
  h.start(); assert.equal(h.contact(), 0);
  assert.deepEqual(structuredClone(h.cover), before, 'the admission owner does not move or claim the stone');
  assert.equal(h.events.length, 1); assert.equal(h.events[0].environmentalCount, 1);
  assert.equal(h.events[0].cause, 'terrain'); assert.equal(h.events[0].count, 0);
  assert.equal(h.events[0].credits, 0); assert.equal(h.events[0].score, 0);
  const events = structuredClone(h.events); h.engine.step(h.s); assert.deepEqual(h.events, events);
});

test('selected cover remains physical after attack sequencing expires', t => {
  const h = fixture(t); h.start();
  for (let i = 0; i < 490; i++) h.tick();
  assert.equal(h.engine._bank(), null);
  const slot = Array.from(h.b.alive).findIndex(Boolean); assert.ok(slot >= 0);
  assert.equal(h.contact(h.cover, { slot }), 0);
});

for (const [name, change] of [
  ['dead original', h => { h.cover.alive = false; }],
  ['noncolliding original', h => { h.cover.collides = false; }],
  ['bodyless original', h => { h.cover.physicsBody = false; }],
  ['failed native original', h => { markPhysicsBodyNativeFailure(h.cover, 'test'); }],
  ['new generation on same object', h => { h.cover.occupantGeneration++; }],
  ['replacement object at same id', h => { h.s.entities.set(h.cover.id, { ...h.cover }); }],
  ['sensor body', h => { h.cover.physicsBody.material = 'sensor'; h.cover.physicsBody.revision++; }],
  ['ghost body', h => { h.cover.physicsBody.material = 'projectile'; h.cover.physicsBody.revision++; }],
  ['static body', h => { h.cover.physicsBody.dynamic = false; h.cover.physicsBody.revision++; }],
]) test(`${name} cannot borrow the selected-cover reserve`, t => {
  const h = fixture(t); h.start(); change(h); assert.equal(h.contact(), 1); assert.equal(h.events.length, 0);
});

for (const reason of ['wave_planned', 'wave_cleared', 'new_game', 'run_ended']) test(`${reason} retires the selected-cover lifetime`, t => {
  const h = fixture(t); h.start(); h.engine.clear(reason); h.cover.pos.x = 800;
  h.start(); assert.equal(h.engine._bank(), null); assert.equal(h.contact(), 1);
});

test('same-seed retry can select a fresh original but cannot inherit the prior reserve', t => {
  const h = fixture(t); h.start(); h.engine.clear('new_game'); h.cover.pos.x = 800;
  const fresh = h.add({ type: 'asteroid', radius: 7, mass: 35, pos: { x: 88, z: 0 },
    physicsBody: { dynamic: true, radius: 7, mass: 35 }, data: { swarmArenaDebris: true } });
  h.start(); assert.equal(planSwarmBank(h.s, h.s.run, 7, bankPlan).rockId, fresh.id);
  assert.equal(h.contact(h.cover), 1); assert.equal(h.contact(fresh), 0);
});

for (const owner of ['missing', 'player', 'other', 'expired']) test(`selected moving cover retains ${owner} provenance law`, t => {
  const h = fixture(t); h.s.tick = 1000; h.s.simTime = 1000 * DT; h.start();
  if (owner !== 'missing') recordImpulseProvenance(h.cover, {
    actorId: owner === 'other' ? 999999 : h.player.id,
    appliedTick: owner === 'expired' ? h.s.tick - 181 : h.s.tick, tag: 'collision', magnitude: 100,
  });
  assert.equal(h.contact(h.cover, { moving: true }), 0);
  assert.equal(h.events.length, 1); assert.equal(h.events[0].cause, 'collision');
  assert.equal(h.events[0].count, owner === 'player' ? 1 : 0);
  assert.equal(h.events[0].environmentalCount, owner === 'player' ? 0 : 1);
});

test('already ordinary selected cover remains one physical kill, not duplicate credit', t => {
  const h = fixture(t, { count: 3 }); h.start();
  recordImpulseProvenance(h.cover, { actorId: h.player.id, appliedTick: h.s.tick, tag: 'collision', magnitude: 100 });
  assert.equal(h.contact(h.cover, { moving: true }), 0); assert.equal(h.events.length, 1); assert.equal(h.events[0].count, 1);
});

for (const target of ['ordinary first', 'ordinary last', 'handled last', 'selected cover', 'Maw offcut']) test(`all old seats remain beside reserved cover: ${target}`, t => {
  const h = fixture(t); h.start();
  const handled = Array.from({ length: 8 }, (_, i) => h.add({ type: 'asteroid', radius: 6, mass: 84,
    pos: { x: 300 + i * 40, z: 500 }, vel: { x: 100, z: 0 } }));
  for (const e of handled) recordImpulseProvenance(e, { actorId: h.player.id, appliedTick: h.s.tick, tag: 'collision', magnitude: 100 });
  const offcut = h.add({ type: 'wreck', pos: { x: 900, z: 0 }, radius: 7, mass: 35,
    physicsBody: { dynamic: true, radius: 7, mass: 35 }, data: { swarmBossChunk: true, physicalRole: 'throw_mass',
      capitalBossEncounterId: 'capital_boss_hulk', capitalBossActorKey: 'swarm:w5/boss_chunk/0' } });
  h.s.run.telemetry.foundryMawOffcut = { id: offcut.id, generation: offcut.occupantGeneration, fightId: 'swarm:w5' };
  const e = { 'ordinary first': h.ordinary[0], 'ordinary last': h.ordinary[63], 'handled last': handled[7],
    'selected cover': h.cover, 'Maw offcut': offcut }[target];
  assert.equal(h.contact(e), 0);
});

async function native(t, crowded) {
  const h = fixture(t, { count: crowded ? 64 : 0, native: true });
  assert.equal(await h.sim.registry.get('physics').prepareBackend(h.s), true); h.sim.step(DT);
  const lane = planSwarmBank(h.s, h.s.run, 7, bankPlan); assert.equal(lane.rockId, h.cover.id); h.start();
  let moved = false, stopped = false, dashed = false; const frames = [];
  for (let i = 0; i < 300 && h.b.alive[0]; i++) {
    if (!moved && h.b.phase[0] === BROOD_PHASE_WINDUP) { h.s.input.moveX = -lane.flankZ; moved = true; }
    if (moved && !stopped && Math.abs(h.player.pos.z) > 40) { h.s.input.moveX = 0; h.s.input.brake = true; stopped = true; }
    h.tick(); dashed ||= h.b.phase[0] === BROOD_PHASE_DASH;
    frames.push({ tick: h.s.tick, pilot: { x: h.player.pos.x, z: h.player.pos.z },
      charger: { x: h.b.px[0], z: h.b.pz[0], phase: h.b.phase[0], alive: h.b.alive[0] } });
  }
  assert.ok(moved && stopped && dashed); assert.equal(h.b.alive[0], 0);
  assert.equal(h.player.hull, 100); assert.equal(h.cover.alive, true);
  assert.equal(h.sim.registry.get('physics')._sg02.records.get(h.cover.id).body.mass(), 35);
  assert.equal(h.events.length, 1); assert.equal(h.events[0].cause, 'terrain');
  assert.equal(h.events[0].environmentalCount, 1); assert.equal(h.events[0].count, 0);
  assert.equal(h.events[0].credits, 0); assert.equal(h.events[0].score, 0);
  return frames;
}

test('native sidestep spends the same first Charger on selected cover before and beyond64 terrain entries', async t => {
  const ordinary = await native(t, false), crowded = await native(t, true);
  assert.deepEqual(crowded, ordinary, 'unrelated remote terrain cannot make the chosen shelter transparent');
  t.diagnostic(`Controlled native round7, ${crowded.length} matching frames; no earned prior rounds, hardware or rendered claim.`);
});
