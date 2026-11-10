import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunState } from '../src/core/runState.js';
import { createSimulation } from '../src/core/sim.js';
import { resolvePhysicsBodySpec, markPhysicsBodyNativeFailure } from '../src/core/physicsAuthority.js';
import { createBroodEngine, BROOD_PHASE_WINDUP, BROOD_PHASE_DASH } from '../src/systems/swarmBrood.js';
import { planSwarmBank } from '../src/systems/swarmBank.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { swarmBroodPopulation } from '../src/data/swarmBrood.js';
import { isFoundryWreckKept } from '../src/data/swarmFoundryWreck.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { combat } from '../src/systems/combat.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { physics } from '../src/core/physics.js';

const DT = 1 / 60;
const BANK_PLAN = [{ id: 'charger', count: 2 }, { id: 'spitter', count: 1 }];
const roundPlan = wave => planWave({ seed: 4242, wave, arenaId: 'helios_core', ruleset: 'swarm' });
function fixture() {
  const sim = createSimulation({ seed: 4242, systems: [] });
  const { state } = sim, events = [];
  state.mode = 'flight'; state.rockCore = { ratingT: 0 };
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'active', wave: 7, arenaId: 'helios_core' };
  const add = spec => {
    const e = sim.spawn({ alive: true, collides: true, vel: { x: 0, z: 0 }, ...spec });
    resolvePhysicsBodySpec(e); return e;
  };
  const player = add({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 8, mass: 40, hull: 100, hullMax: 100 });
  state.playerId = player.id;
  const offcut = add({ type: 'wreck', pos: { x: 88, z: 0 }, radius: 7, mass: 35,
    physicsBody: { dynamic: true, radius: 7, mass: 35 },
    data: { swarmBossChunk: true, physicalRole: 'throw_mass',
      capitalBossEncounterId: 'capital_boss_hulk', capitalBossActorKey: 'swarm:w5/boss_chunk/0' } });
  state.run.telemetry.foundryMawOffcut = { id: offcut.id, generation: offcut.occupantGeneration, fightId: 'swarm:w5' };
  const engine = createBroodEngine({ getState: () => state,
    bus: { emit: (event, payload) => events.push({ event, tick: state.tick, ...payload }) } });
  const tick = () => { state.tick++; state.simTime += DT; engine.step(state); };
  const start = () => { engine.prepareWave(state.run, state.run.wave, roundPlan(state.run.wave)); engine.spawnWave(state); };
  return { state, events, add, player, offcut, engine, tick, start };
}
const layout = h => planSwarmBank(h.state, h.state.run, 7, BANK_PLAN);

test('round seven uses the surviving original before a nearby anonymous pebble, without moving or spending anything', () => {
  const h = fixture();
  h.add({ type: 'asteroid', radius: 7, pos: { x: 0, z: 82 }, data: { swarmArenaDebris: true } });
  const before = structuredClone({ run: h.state.run, entities: h.state.entityList });
  for (let i = 0; i < 3; i++) assert.equal(layout(h).rockId, h.offcut.id);
  assert.deepEqual(structuredClone({ run: h.state.run, entities: h.state.entityList }), before);
  h.start();
  assert.equal(h.engine.view.aliveCount, 3);
  assert.equal(h.engine.view.pendingCount, swarmBroodPopulation(7) - 3);
  assert.deepEqual(Array.from(h.engine._bodies.family.slice(0, 3), f => h.engine._bodies.liveFamilyId[f]),
    ['charger', 'spitter', 'charger']);
});

for (const [label, invalidate] of [
  ['missing receipt', h => { delete h.state.run.telemetry.foundryMawOffcut; }],
  ['reused generation', h => { h.offcut.occupantGeneration++; }],
  ['copied metadata on another life', h => {
    h.add({ type: 'wreck', pos: { ...h.offcut.pos }, radius: 7, mass: 35,
      physicsBody: { ...h.offcut.physicsBody }, data: { ...h.offcut.data } });
    h.offcut.alive = false;
  }],
  ['retiring original', h => { h.offcut.data.despawnAt = 1; }],
  ['destroyed original', h => { h.offcut.alive = false; }],
  ['noncolliding original', h => { h.offcut.collides = false; }],
  ['bodyless original', h => { h.offcut.physicsBody = false; }],
  ['failed native body', h => { markPhysicsBodyNativeFailure(h.offcut, 'test'); }],
  ['sensor original', h => { h.offcut.physicsBody.material = 'sensor'; h.offcut.physicsBody.revision++; }],
  ['ghost projectile original', h => { h.offcut.physicsBody.material = 'projectile'; h.offcut.physicsBody.revision++; }],
  ['line sensor original', h => { h.offcut.physicsBody.material = 'massline_sensor'; h.offcut.physicsBody.revision++; }],
  ['still flying original', h => { h.offcut.vel.x = 40; }],
  ['remote original', h => { h.offcut.pos.x = 500; }],
]) test(`${label} cannot stage an offcut Bank`, () => {
  const h = fixture(); invalidate(h); assert.equal(layout(h), null);
  const rock = h.add({ type: 'asteroid', radius: 7, pos: { x: 0, z: 88 }, data: { swarmArenaDebris: true } });
  assert.equal(layout(h).rockId, rock.id, 'the ordinary pebble fallback is unchanged');
});

test('both blocked escape corridors decline the offcut composition with all finite lives still owed', () => {
  const h = fixture();
  for (const z of [-32, 32]) h.add({ type: 'asteroid', radius: 9, pos: { x: 0, z } });
  assert.equal(layout(h), null); h.start();
  assert.equal(h.engine.view.aliveCount + h.engine.view.pendingCount, swarmBroodPopulation(7));
});

test('the three staged lives keep moving through idle without paying, and pause does not advance their bodies', () => {
  const h = fixture(); h.start(); const b = h.engine._bodies;
  const initial = [b.px[0], b.pz[0]];
  for (let i = 0; i < 600; i++) h.tick();
  assert.equal(h.engine.view.aliveCount, 3); assert.equal(b.phase[0], 0);
  assert.notDeepEqual([b.px[0], b.pz[0]], initial, 'the first-action hold does not park native or virtual motion');
  assert.equal(h.engine.view.pendingCount, swarmBroodPopulation(7) - 3);
  assert.equal(h.events.filter(e => e.event === 'swarm:broodKills').length, 0);
  assert.equal(h.events.filter(e => e.event === 'run:awardRequested').length, 0);
  h.state.mode = 'pause';
  const paused = { x: Array.from(b.px), z: Array.from(b.pz), phase: Array.from(b.phase), events: structuredClone(h.events) };
  for (let i = 0; i < 60; i++) h.tick();
  assert.deepEqual({ x: Array.from(b.px), z: Array.from(b.pz), phase: Array.from(b.phase), events: h.events }, paused);
  assert.equal(h.offcut.alive, true); assert.equal(h.state.entities.get(h.offcut.id), h.offcut);
});

for (const indexed of [true, false]) test(`first input restores the existing player-ram law (${indexed ? 'native index' : 'unindexed fallback'})`, () => {
  const h = fixture(); h.start(); const b = h.engine._bodies;
  if (!indexed) h.state.entityIndex.ready = false;
  // Isolate the owner seam, not a player maneuver: the real staged Charger
  // overlaps the pilot with enough relative speed to trigger the existing ram law.
  const overlap = () => {
    b.px[0] = h.player.pos.x; b.pz[0] = h.player.pos.z;
    b.vx[0] = 100; b.vz[0] = 0; b.phase[0] = BROOD_PHASE_WINDUP; b.timer[0] = 100;
  };
  overlap(); h.tick(); assert.equal(b.alive[0], 1);
  assert.equal(h.events.filter(e => e.event === 'swarm:broodKills').length, 0);
  noteSwarmPilotAction(h.state); overlap(); h.tick(); assert.equal(b.alive[0], 0);
  const kills = h.events.filter(e => e.event === 'swarm:broodKills');
  assert.equal(kills.length, 1); assert.equal(kills[0].count, 1);
  assert.equal(kills[0].credits, 2); assert.equal(kills[0].score, 30);
  assert.equal(h.events.filter(e => e.event === 'run:awardRequested').length, 1);
  const once = structuredClone(h.events); h.engine.step(h.state); assert.deepEqual(h.events, once);
});

// A focused terrain-law seam, not a claimed player maneuver: prepare real original lives,
// then put one existing Mite against the actual native offcut envelope.
function contact(h, { speed = 0, offset = 8, mutate = null, crowded = false } = {}) {
  h.state.run.wave = 6;
  h.offcut.pos = { x: 0, z: 0 };
  h.player.pos = { x: 1000, z: 1000 };
  if (crowded) for (let i = 0; i < 64; i++) h.add({ type: 'asteroid', radius: 3,
    pos: { x: 2000 + i * 30, z: 2000 } });
  h.start(); const b = h.engine._bodies;
  for (let i = 0; i < b.alive.length; i++) if (b.alive[i]) { b.px[i] = 4000 + i * 30; b.pz[i] = 4000; }
  b.family[0] = b.liveFamilyId.indexOf('mite'); b.px[0] = offset; b.pz[0] = 0;
  b.vx[0] = speed; b.vz[0] = 0; b.phase[0] = BROOD_PHASE_WINDUP; b.timer[0] = 100;
  mutate?.(h); noteSwarmPilotAction(h.state); h.tick(); return b;
}

test('a slow Mite slides outside the original native envelope without dying or paying', () => {
  const h = fixture(), b = contact(h);
  assert.ok(b.px[0] >= 7 + b.liveFamilyRadius[b.family[0]] - 1e-5);
  assert.equal(b.alive[0], 1); assert.equal(h.events.filter(e => e.event === 'swarm:broodKills').length, 0);
});

test('the reserved cover seat keeps all sixty-four ordinary rock seats and still blocks a Mite', () => {
  const h = fixture(), b = contact(h, { crowded: true });
  assert.ok(b.px[0] >= 7 + b.liveFamilyRadius[b.family[0]] - 1e-5); assert.equal(b.alive[0], 1);
});

for (const [label, mutate] of [
  ['wrong round', h => { h.state.run.wave = 8; }],
  ['invalid receipt', h => { h.state.run.telemetry.foundryMawOffcut.generation++; }],
  ['bodyless', h => { h.offcut.physicsBody = false; }],
  ['failed native', h => { markPhysicsBodyNativeFailure(h.offcut, 'test'); }],
  ['noncolliding', h => { h.offcut.collides = false; }],
  ['retiring', h => { h.offcut.data.despawnAt = 1; }],
  ['sensor', h => { h.offcut.physicsBody.material = 'sensor'; h.offcut.physicsBody.revision++; }],
  ['line sensor', h => { h.offcut.physicsBody.material = 'massline_sensor'; h.offcut.physicsBody.revision++; }],
  ['ghost projectile', h => { h.offcut.physicsBody.material = 'projectile'; h.offcut.physicsBody.revision++; }],
]) test(`${label} offcut does not invent a cover collision`, () => {
  const h = fixture(), b = contact(h, { mutate }); assert.ok(b.px[0] < 8.1); assert.equal(b.alive[0], 1);
});

async function native(t, { dodge = true, removeCover = false } = {}) {
  const sim = createSimulation({ seed: 4242,
    systems: [swarmArena, flightV3, physics, combat, createProductionCapitalBossEncounters()] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight'; state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.render.sectorShellAdmission = false;
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'active', wave: 5, arenaId: 'helios_core' };
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: -150, z: 0 },
    radius: 8, mass: 40, hull: 100, hullMax: 100, collides: true, data: {} });
  state.playerId = player.id;
  const boss = sim.spawn({ type: 'ship', team: 1, pos: { x: 0, z: 0 },
    radius: 28, mass: 1000, hull: 1000, hullMax: 1000, collides: true, data: {} });
  const capital = sim.registry.get('capitalBossEncounters');
  capital.start({ encounterId: 'capital_boss_hulk', fightId: 'swarm:w5', bossId: boss.id, targetId: player.id });
  sim.registry.get('combat').onHit({ targetId: boss.id, ownerId: player.id,
    damage: 100000, damageType: 'kinetic', pos: { ...boss.pos } });
  const offcut = state.entities.get(state.run.telemetry.foundryMawOffcut.id);
  const original = { id: offcut.id, generation: offcut.occupantGeneration, pos: { ...offcut.pos } };
  player.pos.set(offcut.pos.x + 88, 0, offcut.pos.z);
  player.prevPos.copy(player.pos);
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
  sim.step(DT); // Native bodies must exist before the real boundary can settle their drift.
  state.run.wave = 7; state.run.phase = 'wave_intro';
  // The historical death and starting pose are fixtures. The actual round boundary
  // settles the original debris, and no body or target is repositioned after admission.
  bus.emit('run:wavePlanned', { wave: 7, plan: roundPlan(7) });
  const lane = planSwarmBank(state, state.run, 7, BANK_PLAN);
  assert.equal(lane?.rockId, offcut.id, 'the actual settled death original supplies the Bank');
  assert.ok(Math.hypot(offcut.vel.x, offcut.vel.z) < 6);
  state.run.phase = 'active'; bus.emit('run:waveStarted', { wave: 7 });
  const engine = sim.registry.get('swarmArena')._brood, b = engine._bodies;
  assert.equal(engine.view.aliveCount, 3); assert.equal(engine.view.pendingCount, 187);
  const events = [], contacts = [];
  bus.on('swarm:broodKills', e => events.push({ tick: state.tick, ...e }));
  bus.on('physics:contact', e => contacts.push(e));
  if (removeCover) offcut.data.physicalRole = 'cover_control'; // same body, remove only its Brood role after admission
  noteSwarmPilotAction(state);
  const start = { ...player.pos }; let moved = false, stopped = false, dashed = false;
  for (let i = 0; i < 300 && b.alive[0] && (dodge || player.hull === 100); i++) {
    if (dodge && !moved && b.phase[0] === BROOD_PHASE_WINDUP) {
      state.input.moveX = -lane.flankZ; moved = true;
    }
    if (moved && !stopped && Math.abs(player.pos.z - start.z) > 40) {
      state.input.moveX = 0; state.input.brake = true; stopped = true;
    }
    sim.step(DT); dashed ||= b.phase[0] === BROOD_PHASE_DASH;
  }
  const nativeBody = sim.registry.get('physics')._sg02.records.get(offcut.id);
  return { state, player, offcut, original, b, events, contacts, moved, stopped, dashed, start,
    mass: nativeBody.body.mass(), radius: nativeBody.collider.radius() };
}

test('native flight sidesteps the real round-seven charge into the original Maw offcut with a matched shelter-removal control', async t => {
  const h = await native(t), control = await native(t, { removeCover: true });
  assert.ok(h.moved && h.stopped && h.dashed); assert.equal(h.b.alive[0], 0);
  assert.equal(h.player.hull, 100); assert.equal(h.offcut.alive, true);
  assert.equal(h.mass, 35); assert.equal(h.radius, 7);
  assert.equal(h.state.entities.get(h.original.id), h.offcut); assert.equal(h.offcut.occupantGeneration, h.original.generation);
  assert.equal(isFoundryWreckKept(h.state, h.offcut), true);
  assert.equal(h.events.filter(e => e.cause === 'terrain').reduce((n, e) => n + e.environmentalCount, 0), 1);
  assert.equal(h.events.reduce((n, e) => n + e.count, 0), 0);
  assert.equal(control.b.alive[0], 1, 'same physical body without shelter admission does not spend the charge');
  assert.equal(control.events.filter(e => e.cause === 'terrain').length, 0);
  t.diagnostic(JSON.stringify({ tick: h.state.tick, hull: h.player.hull,
    nativeMass: h.mass, nativeRadius: h.radius, original: h.original,
    end: h.offcut.pos, playerTravel: Math.hypot(h.player.pos.x - h.start.x, h.player.pos.z - h.start.z),
    contacts: h.contacts.length, deaths: h.events, controlTick: control.state.tick }));
});

test('native no-dodge control still takes the real Charger hit before it reaches cover', async t => {
  const h = await native(t, { dodge: false }); assert.ok(h.dashed); assert.ok(h.player.hull < 100);
  t.diagnostic(`No dodge: hull ${h.player.hull}, tick ${h.state.tick}.`);
});
