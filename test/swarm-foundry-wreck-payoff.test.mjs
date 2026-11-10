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
  sim.registry.get('combat').onHit({ targetId: boss.id, ownerId: player.id,
    damage: 100000, damageType: 'kinetic', pos: { ...boss.pos } });
  const record = state.capitalBossEncounters.fights[fightId];
  const chunks = record.swarmAmmoChunks.map(id => state.entities.get(id));
  return { sim, state, bus, player, boss, owner, record, chunks, offcut: chunks[0],
    arena: sim.registry.get('swarmArena') };
}

test('the first Foundry Maw leaves one genuinely light original inside its existing finite drops', t => {
  const h = fixture(t), body = resolvePhysicsBodySpec(h.offcut);
  assert.equal(h.boss.alive, false); assert.ok(h.chunks.length >= 4 && h.chunks.length <= 7);
  assert.equal(body.mass, FOUNDRY_MAW_OFFCUT.mass); assert.equal(body.radius, FOUNDRY_MAW_OFFCUT.radius);
  assert.equal(h.offcut.mass, body.mass); assert.equal(body.dynamic, true);
  assert.equal(h.offcut.data.scanLabel, 'IRON MAW OFFCUT');
  assert.ok(h.chunks.slice(1).every(e => resolvePhysicsBodySpec(e).mass > 250));
  assert.equal(h.chunks.filter(e => isFoundryWreckKept(h.state, e)).length, 1);
  const stamp = structuredClone(h.state.run.telemetry.foundryMawOffcut), count = h.state.entityList.length;
  h.bus.emit('entity:killed', { id: h.boss.id });
  assert.equal(h.state.entityList.length, count); assert.deepEqual(h.state.run.telemetry.foundryMawOffcut, stamp);
});

for (const [name, run] of [
  ['other arena', { arenaId: 'the_hive' }], ['mutator', { arenaMutators: ['dense'] }],
  ['Circuit', { telemetry: { circuit: {} } }], ['later Maw', { wave: 35 }],
  ['Adventure', { kind: 'adventure' }],
]) test(`${name} keeps the original large fragment field`, t => {
  const h = fixture(t, { run });
  assert.equal(h.state.run.telemetry.foundryMawOffcut, undefined);
  assert.ok(h.chunks.every(e => resolvePhysicsBodySpec(e).mass > 250));
});

test('the offcut shape consumes no new random draws and leaves every other original unchanged', t => {
  const snapshots = [];
  for (const arenaId of ['helios_core', 'the_hive']) {
    const h = fixture(t, { run: { arenaId } });
    snapshots.push({ chunks: h.chunks.map(e => ({ pos: e.pos, vel: e.vel, radius: e.radius, mass: e.mass })),
      next: h.state.rng() });
    h.sim.dispose();
  }
  assert.deepEqual(snapshots[0].chunks.slice(1), snapshots[1].chunks.slice(1));
  assert.deepEqual(snapshots[0].chunks[0].pos, snapshots[1].chunks[0].pos);
  assert.deepEqual(snapshots[0].chunks[0].vel, snapshots[1].chunks[0].vel);
  assert.equal(snapshots[0].next, snapshots[1].next);
});

function crowd(h) {
  h.offcut.pos = { x: 900, z: 0 }; // cull boundary fixture, not a flight claim
  for (let i = 0; i < 45; i++) h.sim.spawn({ type: 'wreck', pos: { x: i, z: 50 },
    radius: 4, mass: 10, hull: 100, collides: true, data: {} });
}

test('the same offcut takes one of forty slots through round seven, then ordinary culling resumes', t => {
  const h = fixture(t); crowd(h);
  const original = h.offcut;
  for (const wave of [5, 6, 7]) {
    if (wave === 6) h.owner.detach(h.record.fightId);
    h.state.run.wave = wave; h.arena._cullWrecks();
    assert.equal(original.data.despawnAt, undefined);
    assert.equal(h.state.entityList.filter(e => e.type === 'wreck' && e.alive
      && !Number.isFinite(e.data?.despawnAt)).length, SWARM_WRECK_KEEP);
  }
  h.state.run.wave = 8;
  h.sim.spawn({ type: 'wreck', pos: { x: 0, z: 60 }, radius: 4, hull: 100, data: {} });
  h.arena._cullWrecks();
  assert.ok(Number.isFinite(original.data.despawnAt)); assert.equal(h.state.entities.get(original.id), original);
});

for (const [name, mutate] of [
  ['destroyed original', h => { h.offcut.alive = false; }],
  ['recycled id', h => { h.offcut.occupantGeneration++; }],
  ['replacement object', h => { h.state.entities.set(h.offcut.id, { ...h.offcut }); }],
  ['new run', h => { h.state.run = { ...h.state.run, telemetry: {} }; }],
  ['ended run', h => { h.state.run.phase = 'ended'; }],
  ['missing run receipt', h => { delete h.state.run.telemetry.foundryMawOffcut; }],
  ['forged role', h => { h.offcut.data.capitalBossActorKey = 'other/boss_chunk/0'; }],
  ['wave-fifty receipt', h => { h.state.run.telemetry.foundryMawOffcut.fightId = 'swarm:w50';
    h.offcut.data.capitalBossActorKey = 'swarm:w50/boss_chunk/0'; }],
]) test(`${name} cannot inherit the temporary wreck priority`, t => {
  const h = fixture(t); assert.equal(isFoundryWreckKept(h.state, h.offcut), true);
  mutate(h); assert.equal(isFoundryWreckKept(h.state, h.offcut), false);
});

test('a destroyed or previously retiring offcut is neither replaced nor rescued by culling', t => {
  const h = fixture(t); crowd(h); const count = h.state.entityList.length;
  h.offcut.data.despawnAt = h.state.simTime + 1; h.arena._cullWrecks();
  assert.equal(h.offcut.data.despawnAt, h.state.simTime + 1);
  h.offcut.alive = false; h.arena._cullWrecks();
  assert.equal(h.state.entityList.length, count); assert.equal(h.offcut.alive, false);
});

test('the real ship owner detaches its Maw record on round-six planning without retiring the offcut', async t => {
  const { survivalWave } = await import('../src/systems/survivalWave.js');
  const { physics } = await import('../src/core/physics.js');
  const { flightV3 } = await import('../src/systems/flightV3.js');
  const { makeShipEntitySpec } = await import('../src/systems/ships.js');
  const { spawnBudget } = await import('../src/systems/spawnBudget.js');
  const { planWave } = await import('../src/systems/survivalWavePlanner.js');
  const { noteSwarmPilotAction } = await import('../src/systems/swarmSafety.js');
  const sim = createSimulation({ seed: 4242, systems: [spawnBudget, combat, survivalWave,
    swarmArena, createProductionCapitalBossEncounters(), flightV3, physics] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight'; state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'active', wave: 5, arenaId: 'helios_core' };
  const player = sim.spawn(makeShipEntitySpec('ship_hornet', { isPlayer: true, player: state.player, pos: { x: 0, z: 0 } })); state.playerId = player.id;
  const plan = wave => planWave({ seed: 4242, wave, ruleset: 'swarm', arenaId: 'helios_core' });
  for (const wave of [1, 2, 3, 4, 5]) { state.run.wave = wave; bus.emit('run:wavePlanned', { wave, plan: plan(wave) }); }
  bus.emit('run:waveStarted', { wave: 5 }); noteSwarmPilotAction(state);
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  await sim.registry.get('physics').prepareBackend(state);
  state.input.moveZ = 1;
  for (let i = 0; i < 600 && !state.capitalBossEncounters.fights['swarm:w5']; i++) sim.step(1 / 60);
  const record = state.capitalBossEncounters.fights['swarm:w5']; assert.ok(record, JSON.stringify({pending:sim.registry.get('survivalWave')._pending,spawns:state.entityList.map(e=>[e.id,e.type,e.data?.enemyTypeId])}));
  const boss = state.entities.get(record.bossId);
  sim.registry.get('combat').onHit({ targetId: boss.id, ownerId: player.id,
    damage: 100000, damageType: 'kinetic', pos: { ...boss.pos } });
  const offcut = state.entities.get(state.run.telemetry.foundryMawOffcut?.id); assert.ok(offcut);
  assert.equal(offcut.data.scanLabel, 'IRON MAW OFFCUT');
  assert.equal(isFoundryWreckKept(state, offcut), true);
  crowd({ sim, state, offcut });
  // The historical clear is a fixture. The plan teardown, native owner record,
  // original wreck census and cull decision below are the actual production seams.
  state.run.wave = 6; state.run.phase = 'wave_intro';
  bus.emit('run:wavePlanned', { wave: 6, plan: plan(6) });
  assert.equal(state.capitalBossEncounters.fights['swarm:w5'], undefined);
  assert.equal(state.entities.get(offcut.id), offcut);
  assert.equal(isFoundryWreckKept(state, offcut), true);
  assert.equal(offcut.data.despawnAt, undefined);
});

test('starter catches after real round-six planning, carries with W, then cuts the original for credited contact', async t => {
  const { bootRealPath } = await import('../scripts/lib/bench/realPath.mjs');
  const { input } = await import('../src/systems/input.js');
  const { runSession } = await import('../src/systems/runSession.js');
  const { actions } = await import('../src/systems/actions.js');
  const { tetherGameplay } = await import('../src/systems/tetherGameplay.js');
  const { masslineThrow } = await import('../src/systems/masslineThrow.js');
  const { tumbleStates } = await import('../src/systems/tumbleStates.js');
  const { planWave } = await import('../src/systems/survivalWavePlanner.js');
  const { noteSwarmPilotAction } = await import('../src/systems/swarmSafety.js');
  const { COMBAT_LAB_STARTER_PACKAGES } = await import('../src/data/combatLabSetups.js');
  const kit = COMBAT_LAB_STARTER_PACKAGES.find(k => k.id === 'ricochet_runner');
  const fittings = Array(13).fill(null);
  for (const row of kit.loadout) fittings[row.slotIndex] = row.defId;
  async function runCase(control) {
    const h = await bootRealPath({ seed: 4242, systems: [input, runSession, combat, actions,
      tetherGameplay, masslineThrow, tumbleStates, swarmArena, createProductionCapitalBossEncounters(),
      'flightV3', 'physics'], hulls: [{ hullId: kit.hullId, fittings, isPlayer: true, pos: { x: -150, z: 0 } }] });
    try {
      const s = h.state, p = h.player;
      s.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
        phase: 'active', wave: 5, arenaId: 'helios_core' };
      // Historical champion death is a fixture, not a claim that rounds 1–5 were played.
      // Drop creation, original identity, native physics, input and the R6 population are real.
      const boss = h.runtime.spawn({ type: 'ship', team: 1, pos: { x: 0, z: 0 }, radius: 28,
        mass: 1000, hull: 1000, hullMax: 1000, collides: true, data: { scanLabel: 'Iron Maw' } });
      h.runtime.getSystem('capitalBossEncounters').start({ encounterId: 'capital_boss_hulk',
        fightId: 'swarm:w5', bossId: boss.id, targetId: p.id });
      h.withFeatures(() => h.runtime.getSystem('combat').onHit({ targetId: boss.id,
        ownerId: p.id, damage: 100000, damageType: 'kinetic', pos: { ...boss.pos } }));
      const c = s.entities.get(s.run.telemetry.foundryMawOffcut.id);
      const original = { id: c.id, generation: c.occupantGeneration, pos: { ...c.pos } };
      const kills = [], lines = [], denials = [], inputTrace = [], samples = [];
      for (const event of ['tether:latched', 'tether:released', 'tether:broke'])
        h.bus.on(event, payload => lines.push({ event, tick: s.tick, ...payload }));
      h.bus.on('tether:latchDenied', payload => denials.push(payload));
      h.bus.on('swarm:broodKills', payload => kills.push({ tick: s.tick,
        chunkPos: { ...c.pos }, chunkSpeed: Math.hypot(c.vel.x, c.vel.z), pilotPos: { ...p.pos }, ...payload }));
      const inp = h.runtime.getSystem('input');
      const ingest = event => { inputTrace.push({ tick: s.tick, ...event }); inp.ingestLaneDomEvent(event); };
      const rmb = pressed => ingest({ type: pressed ? 'mousedown' : 'mouseup', button: 2,
        clientX: 600, clientY: 400, blocked: false, offCanvas: false });
      s.input.autoFire = false; // gun-off handling fixture, not an autofire/full-run proof
      ingest({ type: 'pointermove', clientX: 600, clientY: 400 });
      ingest({ type: 'cursorProjection', x: c.pos.x, z: c.pos.z });
      h.step(1); // Let the native owner create the just-dropped body before acquiring it.
      const native = h.runtime.getSystem('physics')._sg02.records.get(c.id);
      const body = { mass: native.body.mass(), radius: native.collider.radius(), playerMass: p.mass };
      assert.equal(body.mass, 35); assert.equal(body.radius, 7); assert.equal(body.playerMass, 46);
      // The actual next-round boundary cuts old lines and settles anonymous drift.
      // Plan/start BEFORE catch, so this proof cannot smuggle a held line across it.
      s.run.wave = 6; s.run.phase = 'wave_intro';
      h.bus.emit('run:wavePlanned', { wave: 6, plan: planWave({ seed: 4242, wave: 6,
        arenaId: 'helios_core', ruleset: 'swarm' }) });
      s.run.phase = 'active'; h.bus.emit('run:waveStarted', { wave: 6 });
      assert.ok(Math.hypot(c.vel.x, c.vel.z) < 6);
      assert.equal(lines.length, 0); assert.equal(isFoundryWreckKept(s, c), true);
      noteSwarmPilotAction(s); rmb(true); h.step(1); rmb(false);
      ingest({ type: 'keydown', code: 'KeyW', pressed: true, blocked: false });
      for (let i = 0; i < 386; i++) {
        // Matched attribution control: remove only this mover's Brood admission.
        // Its body, pilot input, other wrecks and the unmodified targets stay native.
        if (control && i === 378) c.data.physicalRole = 'cover';
        if (i === 375) rmb(true);
        if (i === 376) rmb(false);
        h.step(1);
        if (s.tick >= 378) samples.push({ tick: s.tick, pilotPos: { ...p.pos },
          chunkPos: { ...c.pos }, chunkVel: { ...c.vel }, credits: s.run.credits, score: s.run.score });
      }
      assert.equal(s.entities.get(original.id), c); assert.equal(c.occupantGeneration, original.generation);
      return { original, body, kills, lines, denials, inputTrace, samples,
        credits: s.run.credits, score: s.run.score, proof: h.proof(), lastThrow: s.massline2?.throw?.lastThrow ?? null };
    } finally { h.dispose(); }
  }
  const actual = await runCase(false), control = await runCase(true);
  assert.deepEqual(actual.inputTrace, control.inputTrace);
  assert.deepEqual(actual.lines, control.lines); assert.equal(actual.denials.length, 0);
  assert.deepEqual(actual.samples.filter(s => s.tick < 384), control.samples.filter(s => s.tick < 384));
  assert.deepEqual(actual.kills.filter(k => k.tick < 384), control.kills.filter(k => k.tick < 384));
  const latch = actual.lines.find(x => x.event === 'tether:latched');
  assert.equal(latch.targetId, actual.original.id); assert.equal(latch.previewMatched, true);
  assert.equal(latch.massRatio, 35 / 46);
  assert.equal(actual.lines.find(x => x.event === 'tether:released').tick, 379);
  assert.equal(actual.lastThrow, null); // This is ordinary RMB cut, not the throw-owner gesture.
  // Isolate the post-cut contact. Earlier held collisions also involve other
  // moving chunks, so their aggregate wallet is intentionally not credited here.
  const paid = actual.kills.filter(k => k.tick > 379 && k.count > 0
    && Math.hypot(k.pos.x - k.chunkPos.x, k.pos.z - k.chunkPos.z) < 16
    && Math.hypot(k.pos.x - k.pilotPos.x, k.pos.z - k.pilotPos.z) > 150);
  assert.deepEqual(paid.map(k => [k.count, k.credits, k.score]), [[1, 1, 12]]);
  assert.ok(paid[0].tick > 379);
  assert.ok(paid.every(k => k.cause === 'collision'));
  assert.equal(actual.credits - control.credits, 1); assert.equal(actual.score - control.score, 12);
  assert.equal(actual.proof.backend, 'rapier-dynamic'); assert.equal(actual.proof.flightBackend, 'v3');
  t.diagnostic(JSON.stringify({ original: actual.original, body: actual.body, lines: actual.lines,
    inputTrace: actual.inputTrace, paid, actualWallet: actual.credits, controlWallet: control.credits,
    attributedCredits: 1, attributedScore: 12, proof: actual.proof }));
});
