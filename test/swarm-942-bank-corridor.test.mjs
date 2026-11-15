// PRI-11f / PR #942 F28 — the Bank's dodge corridor and its chosen shelter.
//
// Corridor half (commit cb43fbb6, test/swarm-bank-escape.test.mjs): a clear
// endpoint is not an escape if the pilot must cross a solid on the way. The
// planner must sweep the whole 65 WU sidestep with the native pilot envelope and
// the room's moving-disc law, ignore bodyless/ghost/sensor sentinels without
// waking them, and pick the other flank or honestly refuse.
//
// Shelter half (commit 1d6e9ec3, test/swarm-bank-cover-admission.test.mjs): the
// stone the Bank chose is physical cover for the rest of the round even when the
// asteroid cache overflows past 64 — a selected seat the crowded room cannot make
// transparent, with body-identity/generation law against recycled ids.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { resolvePhysicsBodySpec, markPhysicsBodyNativeFailure } from '../src/core/physicsAuthority.js';
import { recordImpulseProvenance } from '../src/combat/impulseKernel.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { combat } from '../src/systems/combat.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { planSwarmBank } from '../src/systems/swarmBank.js';
import { createBroodEngine, BROOD_PHASE_WINDUP, BROOD_PHASE_DASH } from '../src/systems/swarmBrood.js';
import { swarmBroodPopulation } from '../src/data/swarmBrood.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';

const DT = 1 / 60;
const PLAN = [{ id: 'charger', count: 2 }, { id: 'spitter', count: 1 }];

/* ------------------------------- corridor ------------------------------- */

function fixture() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'active', wave: 7, arenaId: 'helios_core', arenaMutators: [] };
  const add = spec => {
    const entity = { id: state.nextEntityId++, alive: true, collides: true,
      vel: { x: 0, z: 0 }, ...spec };
    state.entities.set(entity.id, entity); state.entityList.push(entity); return entity;
  };
  const player = add({ type: 'ship', pos: { x: 0, z: 0 }, radius: 8, mass: 40,
    physicsBody: { schemaVersion: 1, dynamic: true, radius: 8, mass: 40 } });
  const rock = add({ type: 'asteroid', pos: { x: 88, z: 0 }, radius: 8, mass: 50,
    physicsBody: { schemaVersion: 1, dynamic: true, radius: 8, mass: 50 },
    data: { swarmArenaDebris: true } });
  state.playerId = player.id;
  resolvePhysicsBodySpec(player); resolvePhysicsBodySpec(rock);
  return { state, add, player, rock };
}
const layout = h => planSwarmBank(h.state, h.state.run, 7, PLAN);
const block = (h, side = -1, overrides = {}) => h.add({ type: 'asteroid',
  pos: { x: 0, z: 32 * side }, radius: 6, mass: 50, ...overrides });

test('an obstacle halfway through the default sidestep chooses the other clear flank', () => {
  const h = fixture();
  assert.equal(layout(h).flankZ, 1);
  block(h);
  assert.equal(layout(h).flankZ, -1, 'the escape is opposite the marked Spitter flank');
});

test('both obstructed corridors fall back without moving terrain or spending the finite wave', () => {
  const h = fixture(); block(h); block(h, 1);
  const before = h.state.entityList.map(e => ({ pos: { ...e.pos }, vel: { ...e.vel } }));
  assert.equal(layout(h), null);
  const engine = createBroodEngine({ getState: () => h.state, bus: { emit() {} } });
  engine.prepareWave(h.state.run, 7); engine.spawnWave(h.state);
  assert.equal(engine.view.aliveCount + engine.view.pendingCount, swarmBroodPopulation(7));
  assert.notEqual(engine._bodies.liveFamilyId[engine._bodies.family[0]], 'charger');
  assert.deepEqual(h.state.entityList.map(e => ({ pos: { ...e.pos }, vel: { ...e.vel } })), before);
});

test('the actual pilot envelope, not just its display radius, clears the whole path', () => {
  const h = fixture(); block(h, -1, { pos: { x: 19, z: -32 }, radius: 2 });
  assert.equal(layout(h).flankZ, 1);
  h.player.physicsBody.radius = 15; h.player.physicsBody.revision++;
  assert.equal(layout(h).flankZ, -1);
});

test('native-sized collidable dressing blocks the corridor even with a tiny display radius', () => {
  const h = fixture();
  block(h, -1, { type: 'fx', radius: 1,
    physicsBody: { schemaVersion: 1, radius: 9, mass: 100, dynamic: false } });
  assert.equal(layout(h).flankZ, -1);
});

for (const [label, overrides] of [
  ['dead', { alive: false }], ['noncolliding', { collides: false }],
  ['bodyless', { physicsBody: false }], ['decoration', { type: 'fx' }],
  ['sensor', { physicsBody: { schemaVersion: 1, radius: 6, mass: 1, material: 'sensor' } }],
  ['line sensor', { physicsBody: { schemaVersion: 1, radius: 6, mass: 1, material: 'massline_sensor' } }],
]) test(`${label} does not pretend to block a clear physical sidestep`, () => {
  const h = fixture(); block(h, -1, overrides); assert.equal(layout(h).flankZ, 1);
});

test('a currently clear moving blocker is considered at its crossing time', () => {
  const h = fixture(); block(h, -1, { pos: { x: 55, z: -32 }, vel: { x: -110, z: 0 } });
  assert.equal(layout(h).flankZ, -1);
});

for (const type of ['asteroid', 'ship', 'drone', 'wreck', 'station'])
  test(`bodyless ${type} remains disabled through repeated preview and admission queries`, () => {
    for (const pos of [{ x: 0, z: -32 }, { x: 0, z: -65 }, { x: -90, z: 0 }, { x: 0, z: 150 }]) {
      const h = fixture(), expected = layout(h);
      const sentinel = block(h, -1, { type, pos, physicsBody: false });
      const before = structuredClone(sentinel), count = h.state.entities.size;
      for (let query = 0; query < 3; query++) {
        assert.deepEqual(layout(h), expected);
        assert.deepEqual(sentinel, before, 'a read-only Bank query cannot enable or move this body');
        assert.equal(h.state.entities.size, count);
        assert.equal(h.state.entities.get(sentinel.id), sentinel);
      }
    }
  });

test('a bodyless pilot cannot be normalized into a physical Bank participant', () => {
  const h = fixture(); h.player.physicsBody = false;
  assert.equal(layout(h), null); assert.equal(layout(h), null);
  assert.equal(h.player.physicsBody, false);
});

for (const material of ['projectile', 'massline_sensor', 'sensor'])
  test(`${material} collision material never becomes a physical corridor or endpoint obstruction`, () => {
    for (const pos of [{ x: 0, z: -32 }, { x: 0, z: -65 }, { x: -90, z: 0 }, { x: 0, z: 150 }]) {
      const h = fixture(), expected = layout(h);
      const ghost = block(h, -1, { type: 'projectile', pos,
        physicsBody: { schemaVersion: 1, radius: 6, mass: 1, material, dynamic: true } });
      const before = structuredClone(ghost);
      assert.deepEqual(layout(h), expected); assert.deepEqual(layout(h), expected);
      assert.deepEqual(ghost, before);
    }
  });

test('a disabled or ghost original stone cannot stage a Bank counter', () => {
  for (const material of ['projectile', 'massline_sensor', 'sensor']) {
    const h = fixture(); h.rock.physicsBody.material = material; h.rock.physicsBody.revision++;
    assert.equal(layout(h), null); assert.equal(layout(h), null);
  }
});

test('a body moving away does not block an otherwise clear path', () => {
  const h = fixture(); block(h, -1, { pos: { x: 55, z: -32 }, vel: { x: 110, z: 0 } });
  assert.equal(layout(h).flankZ, 1);
});

test('removing the original obstruction restores the original composition deterministically', () => {
  const h = fixture(), base = layout(h), obstacle = block(h);
  assert.equal(layout(h).flankZ, -1);
  h.state.entities.delete(obstacle.id);
  assert.deepEqual(layout(h), base);
});

test('translation and rotation preserve flank choice without consuming shared RNG or stock', () => {
  const h = fixture(), control = fixture(); block(h);
  const before = structuredClone(h.state.run), base = layout(h);
  for (const entity of h.state.entities.values()) {
    const { x, z } = entity.pos; entity.pos = { x: 900 - z, z: -600 + x };
  }
  const rotated = layout(h);
  assert.deepEqual(rotated.first, { x: 900 - base.first.z, z: -600 + base.first.x });
  assert.equal(rotated.flankX, -base.flankZ);
  assert.ok(Math.abs(rotated.flankZ - base.flankX) < 1e-12);
  assert.equal(h.state.rng(), control.state.rng()); assert.deepEqual(h.state.run, before);
});

/* ------------------------- selected shelter seat ------------------------- */

const bankPlan = [{ id: 'charger', count: 2 }, { id: 'spitter', count: 1 }];
const wavePlan = wave => planWave({ seed: 4242, wave, arenaId: 'helios_core', ruleset: 'swarm' });

// State/contacts below are focused fixtures. The final native case uses real flight,
// body integration and Charger attacks after admission, without relocating any actor.
function coverFixture(t, { count = 64, native = false } = {}) {
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
    s.run.wave = wave; engine.prepareWave(s.run, wave); engine.spawnWave(s); noteSwarmPilotAction(s);
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
  const h = coverFixture(t); const before = structuredClone(h.cover);
  assert.equal(planSwarmBank(h.s, h.s.run, 7, bankPlan).rockId, h.cover.id);
  h.start(); assert.equal(h.contact(), 0);
  assert.deepEqual(structuredClone(h.cover), before, 'the admission owner does not move or claim the stone');
  assert.equal(h.events.length, 1); assert.equal(h.events[0].environmentalCount, 1);
  assert.equal(h.events[0].cause, 'terrain'); assert.equal(h.events[0].count, 0);
  assert.equal(h.events[0].credits, 0); assert.equal(h.events[0].score, 0);
  const events = structuredClone(h.events); h.engine.step(h.s); assert.deepEqual(h.events, events);
});

test('selected cover remains physical after attack sequencing expires', t => {
  const h = coverFixture(t); h.start();
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
  const h = coverFixture(t); h.start(); change(h); assert.equal(h.contact(), 1); assert.equal(h.events.length, 0);
});

for (const reason of ['wave_planned', 'wave_cleared', 'new_game', 'run_ended']) test(`${reason} retires the selected-cover lifetime`, t => {
  const h = coverFixture(t); h.start(); h.engine.clear(reason); h.cover.pos.x = 800;
  h.start(); assert.equal(h.engine._bank(), null); assert.equal(h.contact(), 1);
});

test('same-seed retry can select a fresh original but cannot inherit the prior reserve', t => {
  const h = coverFixture(t); h.start(); h.engine.clear('new_game'); h.cover.pos.x = 800;
  const fresh = h.add({ type: 'asteroid', radius: 7, mass: 35, pos: { x: 88, z: 0 },
    physicsBody: { dynamic: true, radius: 7, mass: 35 }, data: { swarmArenaDebris: true } });
  h.start(); assert.equal(planSwarmBank(h.s, h.s.run, 7, bankPlan).rockId, fresh.id);
  assert.equal(h.contact(h.cover), 1); assert.equal(h.contact(fresh), 0);
});

for (const owner of ['missing', 'player', 'other', 'expired']) test(`selected moving cover retains ${owner} provenance law`, t => {
  const h = coverFixture(t); h.s.tick = 1000; h.s.simTime = 1000 * DT; h.start();
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
  const h = coverFixture(t, { count: 3 }); h.start();
  recordImpulseProvenance(h.cover, { actorId: h.player.id, appliedTick: h.s.tick, tag: 'collision', magnitude: 100 });
  assert.equal(h.contact(h.cover, { moving: true }), 0); assert.equal(h.events.length, 1); assert.equal(h.events[0].count, 1);
});

for (const target of ['ordinary first', 'ordinary last', 'handled last', 'selected cover', 'Maw offcut']) test(`all old seats remain beside reserved cover: ${target}`, t => {
  const h = coverFixture(t); h.start();
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

/* --------------------------- native evidence --------------------------- */

async function native(t) {
  const sim = createSimulation({ seed: 4242, systems: [swarmArena, flightV3, physics, combat] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight'; state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.render.sectorShellAdmission = false;
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'active', wave: 7, arenaId: 'helios_core', arenaMutators: [] };
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 40, hull: 100, hullMax: 100, collides: true, data: {} });
  state.playerId = player.id;
  const rock = sim.spawn({ type: 'asteroid', pos: { x: 88, z: 0 }, radius: 8, mass: 50,
    hull: 100, collides: true, data: { swarmArenaDebris: true } });
  const obstruction = sim.spawn({ type: 'asteroid', pos: { x: 0, z: -32 }, radius: 6, mass: 500,
    hull: 100, collides: true, physicsBody: { schemaVersion: 1, dynamic: false, radius: 6, mass: 500 } });
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
  const lane = planSwarmBank(state, state.run, 7, PLAN); assert.ok(lane);
  const engine = sim.registry.get('swarmArena')._brood;
  engine.prepareWave(state.run, 7); engine.spawnWave(state);
  const b = engine._bodies;
  assert.equal(b.liveFamilyId[b.family[0]], 'charger');
  // Keep the real finite roster, placing unrelated bodies outside this isolated native beat.
  for (let i = 3; i < b.alive.length; i++) if (b.alive[i]) { b.px[i] = 4000 + i * 50; b.pz[i] = 4000; }
  const contacts = [], awards = [];
  bus.on('physics:contact', p => contacts.push(p)); bus.on('run:awardRequested', p => awards.push(p));
  noteSwarmPilotAction(state);
  return { sim, state, bus, player, rock, obstruction, lane, engine, b, contacts, awards };
}

test('native strafe and brake use the clear flank while the real Charger passes into the original stone', async t => {
  const h = await native(t); let moved = false, stopped = false, dashed = false;
  for (let tick = 0; tick < 400 && h.b.alive[0]; tick++) {
    if (h.b.phase[0] === BROOD_PHASE_WINDUP && !moved) {
      h.state.input.moveX = -h.lane.flankZ; moved = true;
    }
    if (moved && !stopped && Math.abs(h.player.pos.z) > 40) {
      h.state.input.moveX = 0; h.state.input.brake = true; stopped = true;
    }
    h.sim.step(DT); dashed ||= h.b.phase[0] === BROOD_PHASE_DASH;
  }
  assert.ok(moved && stopped && dashed);
  assert.ok(h.player.pos.z > 40); assert.equal(h.player.hull, 100);
  assert.equal(h.contacts.length, 0); assert.equal(h.b.alive[0], 0);
  assert.equal(h.rock.alive, true); assert.deepEqual({ ...h.obstruction.pos }, { x: 0, y: 0, z: -32 });
  assert.deepEqual(h.awards, [], 'an unassisted terrain death is not a free player award');
  t.diagnostic(`Native Bank: z ${h.player.pos.z.toFixed(2)}, hull ${h.player.hull}, tick ${h.state.tick}, contacts ${h.contacts.length}.`);
});

test('native no-dodge control still receives the unchanged Charger attack', async t => {
  const h = await native(t); let dashed = false;
  for (let tick = 0; tick < 400 && h.player.hull === 100; tick++) {
    h.sim.step(DT); dashed ||= h.b.phase[0] === BROOD_PHASE_DASH;
  }
  assert.ok(dashed); assert.ok(h.player.hull < 100, `hull ${h.player.hull}`);
  t.diagnostic(`Native Bank no-dodge: hull ${h.player.hull}, tick ${h.state.tick}.`);
});

async function nativeCover(t, crowded) {
  const h = coverFixture(t, { count: crowded ? 64 : 0, native: true });
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

test('native sidestep spends the same first Charger on selected cover before and beyond 64 terrain entries', async t => {
  const ordinary = await nativeCover(t, false), crowded = await nativeCover(t, true);
  assert.deepEqual(crowded, ordinary, 'unrelated remote terrain cannot make the chosen shelter transparent');
  t.diagnostic(`Controlled native round7, ${crowded.length} matching frames; no earned prior rounds, hardware or rendered claim.`);
});
