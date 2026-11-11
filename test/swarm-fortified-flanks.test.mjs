import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createSimulation } from '../src/core/sim.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { planSwarmFortifiedFlanks } from '../src/systems/swarmFortifiedFlanks.js';
import { createBroodEngine } from '../src/systems/swarmBrood.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { runSession } from '../src/systems/runSession.js';
import { fields } from '../src/systems/fields.js';
import { swarmFortify } from '../src/systems/swarmFortify.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { physics } from '../src/core/physics.js';
import { weapons } from '../src/systems/weapons.js';
import { combat } from '../src/systems/combat.js';
import { SWARM_FORTIFY_DEVICES } from '../src/data/swarmFortify.js';
import { firstSwarmIntermission } from '../src/ui/screens/crucibleDraft.js';

const DT = 1 / 60, TOTAL = 115;
const plan = wave => planWave({ seed: 4242, wave, arenaId: 'helios_core', ruleset: 'swarm' });
function fixture() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'active', wave: 2, arenaId: 'helios_core' };
  const add = spec => {
    const e = { id: state.nextEntityId++, alive: true, collides: true,
      radius: 8, mass: 40, vel: { x: 0, z: 0 }, data: {}, ...spec };
    state.entities.set(e.id, e); state.entityList.push(e); return e;
  };
  const player = add({ type: 'ship', pos: { x: 0, z: 0 }, hull: 100 });
  resolvePhysicsBodySpec(player);
  state.playerId = player.id;
  const ingress = { gateGroupPolicy: 'fortify-three-corridor-v1', anchor: { x: 0, z: 0, rotation: 0 } };
  const engine = createBroodEngine({ getState: () => state, fortifyIngress: () => ingress });
  engine.prepareWave(state.run, 2, plan(2));
  const tick = (n = 1) => { for (let i = 0; i < n; i++) {
    state.tick++; state.simTime += DT; engine.step(state);
  } };
  return { state, add, player, ingress, engine, tick };
}
const course = h => planSwarmFortifiedFlanks(h.state, h.state.run, h.state.run.wave,
  [{ id: 'mite', count: TOTAL }], 2.4, h.ingress);
function lives(h, after = 0) {
  const b = h.engine._bodies;
  return Array.from(b.alive, (_, i) => i).filter(i => b.alive[i] && b.serial[i] > after)
    .map(i => ({ x: b.px[i], z: b.pz[i], life: b.serial[i] }));
}
const packet = (h, after, x, z, count = 18) => {
  const rows = lives(h, after); assert.equal(rows.length, count);
  for (const body of rows) assert.ok(Math.hypot(body.x - x, body.z - z) <= 30.001);
};

test('the paid-field layout is read-only, outside both socket depths, and follows the fixed rotation', () => {
  const h = fixture(), before = structuredClone(h.state.entityList);
  const c = course(h);
  assert.equal(c.distance, 470); assert.equal(c.maxPlayerDistance, 620);
  assert.deepEqual(c.gates, ['front', 'rear', 'diagonal_a']);
  assert.deepEqual(h.state.entityList, before);
  h.ingress.anchor = { x: 900, z: -500, rotation: Math.PI / 2 };
  h.player.pos = { x: 900, z: -500 };
  assert.ok(Math.abs(course(h).ux) < 1e-10); assert.equal(course(h).uz, 1);
  noteSwarmPilotAction(h.state); h.engine.spawnWave(h.state); packet(h, 0, 900, -30);
  h.tick(45); packet(h, 18, 900, -970);
  h.tick(45); packet(h, 36, 1370, -500);
});

for (const [name, mutate] of [
  ['unpaid field', h => { h.ingress.gateGroupPolicy = null; }],
  ['unknown policy', h => { h.ingress.gateGroupPolicy = 'other'; }],
  ['other wave', h => { h.state.run.wave = 3; }],
  ['other arena', h => { h.state.run.arenaId = 'the_hive'; }],
  ['mutator', h => { h.state.run.arenaMutators = ['dense']; }],
  ['Circuit', h => { h.state.run.telemetry.circuit = {}; }],
  ['dead pilot', h => { h.player.alive = false; }],
  ['departed field', h => { h.player.pos.x = 121; }],
  ['invalid rotation', h => { h.ingress.anchor.rotation = NaN; }],
]) test(`${name} cannot acquire the fortified lesson`, () => {
  const h = fixture(); mutate(h); assert.equal(course(h), null);
});

test('an oversized native or moving obstacle on any approach refuses without moving it', () => {
  for (const pos of [{ x: 470, z: 0 }, { x: -470, z: 0 }, { x: 0, z: -470 }]) {
    const h = fixture(); const blocker = h.add({ type: 'asteroid', pos: { x: pos.x, z: pos.z + 100 },
      radius: 1, physicsBody: { schemaVersion: 1, radius: 75, mass: 50, dynamic: true } });
    assert.equal(course(h), null);
    const g = fixture(); g.add({ type: 'wreck', pos: { x: pos.x, z: pos.z + 100 }, radius: 1,
      vel: { x: 0, z: -100 } });
    assert.equal(course(g), null);
    assert.deepEqual(blocker.pos, { x: pos.x, z: pos.z + 100 });
  }
});

test('waiting keeps the paid crossings intact; first action releases finite opposed packets', () => {
  const h = fixture(); assert.equal(h.engine.spawnWave(h.state), 0);
  h.tick(600); assert.equal(h.engine.view.aliveCount, 0); assert.equal(h.engine.view.pendingCount, TOTAL);
  noteSwarmPilotAction(h.state); h.tick(31);
  assert.equal(h.engine.view.aliveCount, 18);
  assert.ok(lives(h).every(b => b.x > 420));
  h.tick(45); assert.equal(h.engine.view.aliveCount, 36);
  assert.ok(lives(h, 18).every(b => b.x < -420));
  h.tick(300); assert.equal(h.engine.view.pendingCount, 0);
  assert.equal(lives(h).length, TOTAL); assert.equal(new Set(lives(h).map(b => b.life)).size, TOTAL);
});

test('pause, duplicate ticks and late obstructions retain the exact finite debt', () => {
  const h = fixture(); noteSwarmPilotAction(h.state); h.engine.spawnWave(h.state);
  h.state.mode = 'pause'; h.tick(600); assert.equal(h.engine.view.pendingCount, TOTAL - 18);
  h.state.mode = 'flight';
  const blocker = h.add({ type: 'asteroid', pos: { x: -470, z: 0 }, radius: 80 });
  h.tick(45); assert.equal(h.engine.view.pendingCount, TOTAL - 18);
  for (let i = 0; i < 100; i++) h.engine.step(h.state);
  assert.equal(h.engine.view.pendingCount, TOTAL - 18);
  blocker.alive = false; h.tick(300);
  assert.equal(h.engine.view.pendingCount, 0); assert.equal(lives(h).length, TOTAL);
});

test('departing or replacing the pilot retires the field course even after returning', () => {
  for (const replace of [false, true]) {
    const h = fixture(); noteSwarmPilotAction(h.state); h.engine.spawnWave(h.state);
    if (replace) h.state.entities.set(h.player.id, { ...h.player, pos: { x: 0, z: 0 } });
    else { h.player.pos.x = 121; h.tick(); h.player.pos.x = 0; }
    h.tick(45); const second = lives(h, 18);
    assert.equal(second.length, 18); assert.ok(second.every(b => Math.hypot(b.x, b.z) <= 195.001));
  }
});

test('a blocked field uses the surviving court; later waves and legacy plans do not inherit it', () => {
  const h = fixture();
  [[150, -100], [150, 100], [-150, -100], [-150, 100]].forEach(([x, z], slot) =>
    h.add({ type: 'asteroid', pos: { x, z }, radius: 9,
      data: { swarmArenaDebris: true, openingTerrainSlot: slot } }));
  h.add({ type: 'asteroid', pos: { x: 470, z: 0 }, radius: 80 });
  h.engine.spawnWave(h.state); packet(h, 0, 180, 0);
  h.engine.clear('wave_cleared'); h.state.run.wave = 3; h.engine.prepareWave(h.state.run, 3, plan(3));
  noteSwarmPilotAction(h.state); h.engine.spawnWave(h.state);
  assert.ok(lives(h).every(b => Math.hypot(b.x, b.z) <= 195.001));
  const legacy = fixture(); legacy.engine.prepareWave(legacy.state.run, 2);
  assert.equal(legacy.engine.spawnWave(legacy.state), TOTAL, 'no scored plan retains legacy admission');
});

async function paidScene(deviceId) {
  const state = createGameState(4242); state.mode = 'flight';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'draft', wave: 1, arenaId: 'helios_core', credits: 750 };
  const sim = createSimulation({ state, systems: [runSession, fields, swarmFortify, swarmArena, weapons, combat, physics] });
  const player = sim.spawn({ type: 'ship', team: 0, factionId: 'faction_player',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, mass: 40,
    hull: 100, hullMax: 100, collides: true, data: { defId: 'ship_kestrel' } });
  state.playerId = player.id;
  const fort = sim.registry.get('swarmFortify'), phys = sim.registry.get('physics');
  const engine = sim.registry.get('swarmArena')._brood;
  const hits = [], kills = [], shots = [];
  sim.bus.on('swarm:broodTeslaHit', p => hits.push(p));
  sim.bus.on('swarm:broodProjectileHit', p => hits.push(p));
  sim.bus.on('swarm:broodKills', p => kills.push(p));
  sim.bus.on('combat:fire', p => { if (p.fortifyDeviceId === deviceId) shots.push(p); });
  const request = { deviceId, socketId: 'starboard-near', requestId: 1, runToken: fort.getReadModel().runToken };
  assert.equal(fort.build(request).accepted, true);
  assert.equal(state.run.credits, 750 - SWARM_FORTIFY_DEVICES[deviceId].cost);
  fort.build(request); assert.equal(state.run.credits, 750 - SWARM_FORTIFY_DEVICES[deviceId].cost);
  const original = fort.getReadModel().structures[0].entityIds.map(id => state.entities.get(id));
  assert.equal(await phys.prepareBackend(state), true);
  assert.equal(state.settings.gameplay.physicsBackend, 'rapier-dynamic');
  state.run.wave = 2; state.run.phase = 'active'; engine.prepareWave(state.run, 2, plan(2));
  const tick = n => { for (let i = 0; i < n; i++) {
    state.tick++; state.simTime += DT;
    sim.registry.get('fields').update(DT, state); engine.step(state); fort.update(); phys.update(DT, state);
  } };
  return { sim, state, player, fort, engine, original, hits, kills, shots, tick };
}
for (const deviceId of ['tesla_pair', 'kinetic_turret']) test(`paid ${deviceId} intercepts the real outside-in round, with native bodies and honest wallet`, async () => {
  const h = await paidScene(deviceId);
  try {
    h.engine.spawnWave(h.state); h.tick(120);
    assert.equal(h.shots.length, 0); assert.equal(h.engine.view.aliveCount, 0);
    noteSwarmPilotAction(h.state); h.tick(900);
    assert.ok(h.hits.length > 0, 'ordinary arrival, flocking and weapon owners produce contacts without placing target lives');
    assert.equal(h.engine.view.pendingCount, 0);
    const credited = h.kills.reduce((n, p) => n + p.count, 0);
    assert.ok(credited > 0);
    assert.equal(h.state.run.credits, 750 - SWARM_FORTIFY_DEVICES[deviceId].cost + credited,
      'only real credited mite deaths return one credit each; no manufactured round-clear cash');
    for (const entity of h.original) assert.equal(h.state.entities.get(entity.id), entity);
    if (deviceId === 'kinetic_turret') assert.equal(h.original[0].data.swarmFortify.ammo, 32 - h.shots.length);
    else assert.ok(h.hits.every(hit => Math.abs(hit.pos.x - 280) <= 7), 'Tesla only earns hits at its purchased crossing');
    const ammo = h.original[0].data.swarmFortify.ammo, shots = h.shots.length;
    h.engine.clear('wave_cleared'); h.state.run.phase = 'draft'; h.tick(90);
    h.state.run.wave = 3; h.engine.prepareWave(h.state.run, 3, plan(3));
    h.state.run.phase = 'active'; h.engine.spawnWave(h.state); h.tick(90);
    assert.equal(h.original[0].data.swarmFortify.ammo, ammo);
    assert.equal(h.shots.length, shots, 'the same hardware conserves its next opening until action');
  } finally { h.sim.dispose(); }
});

test('first preparation quotes canonical prices and contrasts crossing fire with finite ammunition', () => {
  const run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'draft', wave: 1, arenaId: 'helios_core', credits: 750 };
  const line = firstSwarmIntermission(run, []);
  assert.match(line, /no purchase is available on this armory shelf/);
  assert.match(line, /Tesla Pair \(150 cr\) cuts crossings/);
  assert.match(line, /Kinetic Turret \(180 cr\) spends 32 rounds/);
  assert.match(line, /Rearrange loadout for spares/); assert.match(line, /Launch round 2 when ready/);
  assert.doesNotMatch(firstSwarmIntermission({ ...run, credits: 0 }, []), /Tesla Pair/);
  assert.doesNotMatch(firstSwarmIntermission({ ...run, arenaId: 'the_hive' }, []), /Tesla Pair/);
  assert.doesNotMatch(firstSwarmIntermission({ ...run, arenaMutators: ['dense'] }, []), /Tesla Pair/);
});

test('public worker purchase and launch retain the same native defense through the real round-two transition', async () => {
  const { readFileSync } = await import('node:fs');
  const { createSimHost } = await import('../scripts/lib/simWorkerHost.mjs');
  const { createSimCommandRing, pushLaneCommand } = await import('../scripts/lib/simCommandChannel.mjs');
  const { createBus } = await import('../src/core/eventBus.js');
  const { crucibleSetupFor, crucibleLaunchConfig } = await import('../src/ui/crucibleLaunch.js');
  const { requestSandboxGame } = await import('../src/ui/sandbox/sandboxSetup.js');
  const { swarmPilotHasActed } = await import('../src/systems/swarmSafety.js');
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 4242, bridgeAll: true,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const bus = createBus(); let opts;
    bus.on('game:new', value => { opts = structuredClone(value); });
    const setup = crucibleSetupFor({ starterId: 'ricochet_runner', ruleset: 'swarm', seed: 4242 }).value;
    requestSandboxGame(bus, crucibleLaunchConfig(setup, 'swarm'));
    let tick = 0;
    const send = async (...commands) => {
      const ring = createSimCommandRing();
      for (const d of commands) pushLaneCommand(ring, d);
      return lane.tick({ tick: ++tick, steps: 0, ackEnd: init.initRebuild?.end ?? 0, commands: ring.drain() });
    };
    await send({ kind: 'mode', mode: 'loading' }, { kind: 'rpc', id: 'new', op: 'newGameBoot', args: { opts } });
    const { state, registry, bus: workerBus } = lane.host;
    const machine = registry.get('survivalRun'), fort = registry.get('swarmFortify');
    const arena = registry.get('swarmArena'), player = state.entities.get(state.playerId);
    assert.equal(state.run.phase, 'draft');
    // Fixture the first earned stop. This proves its public purchase/launch boundary,
    // not a historical round-one clear or an earned seven-round economy.
    state.run.wave = 1;
    workerBus.emit('run:transitioned', { phase: 'draft' });
    const viewReply = await send({ kind: 'busEmit', emit: 'swarm:fortifyStateRequested', payload: { requestId: 100 } });
    const view = viewReply.events.find(e => e.t === 'swarm:fortifyState')?.p;
    assert.ok(view); assert.equal(view.sockets.find(s => s.id === 'starboard-near').devices.tesla_pair.blocked, false);
    const wallet = state.run.credits;
    const build = await send({ kind: 'busEmit', emit: 'swarm:fortifyBuildRequested', payload: {
      requestId: 101, runToken: view.runToken, deviceId: 'tesla_pair', socketId: 'starboard-near',
    } });
    const receipt = build.events.find(e => e.t === 'swarm:fortifyBuildResolved')?.p;
    assert.equal(receipt?.accepted, true); assert.equal(receipt.readModel.credits, wallet - 150);
    const original = receipt.structureIds.map(id => state.entities.get(id));
    assert.equal(original.length, 2);
    const anchor = fort.getArenaAnchor();
    await send({ kind: 'mode', mode: 'flight' },
      { kind: 'busEmit', emit: 'run:draftPickRequested', payload: { offerId: null } });
    machine.update(DT, state); assert.equal(state.run.phase, 'wave_intro');
    workerBus.emit('run:waveIntroComplete', { wave: 2 }); machine.update(DT, state);
    assert.equal(state.run.phase, 'active'); assert.equal(state.run.wave, 2);
    assert.equal(arena._brood.view.aliveCount, 0, 'paid crossings await a deliberate action');
    await send({ kind: 'uiFold', p: { modalActive: false, screenStackLen: 0 } },
      { kind: 'inputFold', path: 'input.blocked', value: false }, { kind: 'keepalive', wallDt: DT });
    await send({ kind: 'domEvent', d: { type: 'keydown', code: 'KeyW', pressed: true, repeat: false, blocked: false } },
      { kind: 'keepalive', wallDt: DT });
    assert.equal(swarmPilotHasActed(state), true);
    for (let i = 0; i < 31; i++) { state.tick++; state.simTime += DT; arena._brood.step(state); }
    registry.get('physics').update(DT, state);
    const bodies = arena._brood._bodies;
    assert.equal(arena._brood.view.aliveCount, 18);
    for (let i = 0; i < bodies.alive.length; i++) if (bodies.alive[i]) {
      assert.ok(Math.hypot(bodies.px[i] - anchor.x, bodies.pz[i] - anchor.z) > 420,
        'real production provider is consumed, not the old inside-defense arrival');
    }
    for (const entity of original) {
      assert.equal(state.entities.get(entity.id), entity);
      assert.equal(registry.get('physics')._sg02.records.get(entity.id)?.entity, entity,
        'the round admission retained the actual paid native endpoint');
    }
    assert.equal(state.run.credits, wallet - 150); assert.equal(state.entities.get(player.id), player);
  } finally { lane.shutdown(); }
});
