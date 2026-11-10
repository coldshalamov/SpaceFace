import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { swarmQuota, swarmConcurrent } from '../src/data/swarmMode.js';
import { swarmBroodPopulation } from '../src/data/swarmBrood.js';
import { swarmFoundryRound } from '../src/data/swarmFoundryScore.js';
import { swarmRoundPreview } from '../src/data/swarmLadder.js';
import { foundryLancerIntermission } from '../src/ui/screens/crucibleDraft.js';

const DT = 1 / 60;
const planFor = (extra = {}) => planWave({ seed: 4242, wave: 8, arenaId: 'helios_core', ruleset: 'swarm', ...extra });
function fixture(t) {
  const sim = createSimulation({ seed: 4242, systems: [spawnBudget, swarmArena, survivalWave] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight'; state.rockCore = { ratingT: 0 };
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 40, hull: 100, hullMax: 100, collides: true, data: {} });
  state.playerId = player.id; resolvePhysicsBodySpec(player);
  const start = () => {
    state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
      arenaId: 'helios_core', wave: 8, phase: 'wave_intro' };
    bus.emit('run:wavePlanned', { wave: 8, plan: planFor() });
    state.run.phase = 'active'; bus.emit('run:waveStarted', { wave: 8 });
  };
  start();
  const ships = () => state.entityList.filter(e => e.alive && e.type === 'ship' && e.id !== player.id);
  return { sim, state, bus, player, start, ships, owner: sim.registry.get('survivalWave'),
    engine: sim.registry.get('swarmArena')._brood,
    tick(n = 1) { for (let i = 0; i < n; i++) sim.step(DT); } };
}

test('the eighth score spends the existing Lancer and debt, then keeps the normal packet gaps', () => {
  const plan = planFor(), score = swarmFoundryRound({ arenaId: 'helios_core', wave: 8 });
  assert.equal(score.id, 'slip_the_lance'); assert.deepEqual(plan.swarm.foundry, score);
  assert.equal(plan.swarm.killTarget, swarmQuota(8)); assert.equal(plan.swarm.concurrent, swarmConcurrent(8));
  assert.equal(plan.arenaPhase, 'loose_plate'); assert.equal(plan.completionRules.kind, 'cohort');
  const debut = plan.schedule.filter(x => x.debut);
  assert.equal(debut.length, 1); assert.equal(debut[0].enemyId, 'lancer_sniper');
  assert.equal(debut[0].count, 1); assert.equal(debut[0].atTick, 0); assert.equal(debut[0].readAfterTicks, 1);
  assert.ok(plan.schedule.filter(x => !x.debut).every(x => x.readAfterTicks === 480));
  const preview = swarmRoundPreview({ arenaId: 'helios_core', wave: 8, seed: 4242, plan });
  assert.equal(preview.foreground.title, score.title); assert.equal(preview.event, null);
});

for (const idle of [600, 4000]) test(`after ${idle} idle ticks the lone real Lancer retains its full read and finite Brood debt`, t => {
  const h = fixture(t); h.tick(idle);
  assert.equal(h.ships().length, 0); assert.equal(h.engine.view.aliveCount, 0);
  assert.equal(h.engine.view.pendingCount, swarmBroodPopulation(8));
  assert.equal(h.state.run.credits, 0);
  noteSwarmPilotAction(h.state); h.tick();
  assert.equal(h.ships().length, 1);
  const lancer = h.ships()[0];
  assert.equal(lancer.data.lootTableId, 'lancer_sniper');
  assert.equal(lancer.data.ai.combatDoctrineId, 'ranged_disengager');
  assert.notEqual(lancer.data.ai.swarmLastStand, true);
  h.tick(478);
  assert.equal(h.ships().length, 1); assert.equal(h.engine.view.aliveCount, 0);
  assert.equal(h.engine.view.pendingCount, swarmBroodPopulation(8));
  assert.equal(lancer.data.ai.combatDoctrineId, 'ranged_disengager');
  h.tick(); assert.ok(h.ships().length > 1);
  // The existing Brood half-second admission poll may finish just after the read.
  h.tick(45); assert.ok(h.engine.view.aliveCount > 0);
  assert.equal(h.engine.view.aliveCount + h.engine.view.pendingCount, swarmBroodPopulation(8));
  const ordinary = h.owner._pending.filter(x => !x.entry.debut).map(x => x.entry.readAfterTicks);
  for (let i = 1; i < ordinary.length; i++) assert.ok(ordinary[i] - ordinary[i - 1] >= 80);
});

test('pause and repeated owner calls preserve the remaining read; retry requires a fresh act', t => {
  const h = fixture(t); noteSwarmPilotAction(h.state); h.tick(120);
  const ticks = h.owner._foundryTicks;
  h.state.mode = 'pause'; h.tick(300); assert.equal(h.owner._foundryTicks, ticks);
  h.state.mode = 'flight'; h.tick();
  for (let i = 0; i < 200; i++) h.owner.update();
  assert.equal(h.owner._foundryTicks, ticks + 1); assert.equal(h.ships().length, 1);
  h.bus.emit('run:ended', { reason: 'retry' }); h.start(); h.tick(600);
  assert.equal(h.owner._foundryTicks, 0); assert.equal(h.engine.view.aliveCount, 0);
  assert.equal(h.engine.view.pendingCount, swarmBroodPopulation(8));
});

test('a surviving Bank stone cannot introduce a competing Charger vignette at eight', t => {
  const h = fixture(t);
  // This is an untouched original court fixture, not relocated encounter targets.
  const rock = h.sim.spawn({ type: 'asteroid', pos: { x: 88, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 50, collides: true, data: { swarmArenaDebris: true } });
  resolvePhysicsBodySpec(rock);
  noteSwarmPilotAction(h.state); h.engine.spawnWave(h.state); h.tick(240);
  assert.equal(h.engine.view.aliveCount, 0); assert.equal(h.engine.view.pendingCount, 205);
  assert.equal(h.state.entities.get(rock.id), rock);
});

test('round-seven preparation is conditional and leaves other modes and checkpoint history honest', () => {
  const run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'draft', wave: 7, arenaId: 'helios_core' };
  assert.match(foundryLancerIntermission(run), /A Lancer opens next/);
  assert.match(foundryLancerIntermission(run), /save your purse/);
  for (const patch of [{ wave: 6 }, { wave: 8 }, { phase: 'active' }, { arenaId: 'the_hive' },
    { arenaMutators: ['dense'] }, { telemetry: { circuit: {} } }, { telemetry: { startWave: 8 } }])
    assert.equal(foundryLancerIntermission({ ...run, ...patch }), null);
  for (const extra of [{ arenaId: 'the_hive' }, { mutators: ['heavies_only'] },
    { circuitRound: { kind: 'survive' } }, { wave: 13 }]) assert.equal(planFor(extra).swarm.foundry, undefined);
});

test('native Lancer charges and fires; a cue-triggered ordinary strafe beats the first rail shot', async t => {
  const { bootRealPath } = await import('../scripts/lib/bench/realPath.mjs');
  const { input } = await import('../src/systems/input.js');
  const { runSession } = await import('../src/systems/runSession.js');
  const { combat } = await import('../src/systems/combat.js');
  const { COMBAT_LAB_STARTER_PACKAGES } = await import('../src/data/combatLabSetups.js');
  const kit = COMBAT_LAB_STARTER_PACKAGES.find(k => k.id === 'ricochet_runner');
  const fittings = Array(13).fill(null); for (const row of kit.loadout) fittings[row.slotIndex] = row.defId;
  async function play(dodge) {
    const h = await bootRealPath({ seed: 4242,
      systems: [input, runSession, spawnBudget, survivalWave, swarmArena, combat,
        'tacticalAI', 'actions', 'weapons', 'flightV3', 'aiPorts', 'physics'],
      hulls: [{ hullId: kit.hullId, fittings, isPlayer: true, pos: { x: 0, z: 0 } }] });
    try {
      const s = h.state, p = h.player, cues = [], hits = [], inputs = [];
      // Explicit earlier-round/starting-pose fixture. The ordinary round owner
      // places the Lancer, and no actor pose, impulse, hit or reward is injected.
      s.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
        arenaId: 'helios_core', wave: 8, phase: 'wave_intro' };
      s.input.autoFire = false; // Isolate evasion, not a gunfight or an earned-run claim.
      h.bus.emit('run:wavePlanned', { wave: 8, plan: planFor() });
      s.run.phase = 'active'; h.bus.emit('run:waveStarted', { wave: 8 });
      h.bus.on('ai:telegraph', e => { if (e.doctrineId === 'ranged_disengager') cues.push({ tick: s.tick, ...e }); });
      h.bus.on('combat:damage', e => { if (e.targetId === p.id) hits.push({ tick: s.tick, ...e }); });
      const inp = h.runtime.getSystem('input');
      const key = (code, pressed) => { const e = { type: pressed ? 'keydown' : 'keyup', code, pressed, blocked: false };
        inputs.push({ tick: s.tick, ...e }); inp.ingestLaneDomEvent(e); };
      key('Digit0', true); h.step(1); key('Digit0', false);
      let cue = null;
      for (let i = 0; i < 470; i++) {
        h.step(1);
        if (!cue && cues.length) { cue = cues[0]; if (dodge) key('KeyE', true); }
        if (dodge && cue && s.tick === cue.tick + 40) { key('KeyE', false); key('Digit0', true); }
      }
      const lancer = s.entityList.find(e => e.data?.lootTableId === 'lancer_sniper');
      assert.ok(lancer?.alive); assert.equal(lancer.data.ai.combatDoctrineId, 'ranged_disengager');
      assert.equal(s.run.spawnedThreat, 1); assert.equal(s.run.resolvedThreat, 0);
      assert.equal(h.runtime.getSystem('swarmArena')._brood.view.pendingCount, 205);
      assert.equal(h.runtime.getSystem('swarmArena')._brood.view.aliveCount, 0);
      assert.equal(s.run.credits, 0); assert.equal(s.run.score, 0);
      assert.equal(h.proof().backend, 'rapier-dynamic'); assert.equal(h.proof().flightBackend, 'v3');
      assert.equal(p.hull, 260); assert.ok(cue?.durationTicks >= 36);
      return { cues, hits: hits.filter(x => x.attackerId === lancer.id), inputs,
        position: { ...p.pos }, shield: p.shield, proof: h.proof() };
    } finally { h.dispose(); }
  }
  const stationary = await play(false), strafe = await play(true);
  assert.deepEqual(strafe.cues[0], stationary.cues[0]);
  const first = stationary.hits[0]; assert.ok(first); assert.equal(first.weaponId, 'wpn_railgun_m');
  assert.ok(first.tick > stationary.cues[0].tick + stationary.cues[0].durationTicks);
  assert.equal(strafe.hits.filter(x => x.tick <= first.tick + 25).length, 0);
  assert.ok(Math.hypot(strafe.position.x, strafe.position.z) > 60);
  assert.ok(strafe.hits.length > 0, 'stopping after one dodge still leaves a live sniper threat');
  assert.ok(strafe.shield > stationary.shield);
  t.diagnostic(JSON.stringify({ cueTick: stationary.cues[0].tick, cueDuration: stationary.cues[0].durationTicks,
    stationaryHits: stationary.hits.map(h => h.tick), strafeHits: strafe.hits.map(h => h.tick),
    strafePosition: strafe.position, inputs: strafe.inputs, proof: strafe.proof }));
});

test('mounted Armory preparation keeps Fortify, the purse and the ordinary launch request', async () => {
  const { fakeDom, textLines } = await import('./helpers/fake-dom.mjs');
  const { crucibleDraftScreen } = await import('../src/ui/screens/crucibleDraft.js');
  const { createBus } = await import('../src/core/eventBus.js');
  const previous = globalThis.document, doc = fakeDom(); globalThis.document = doc;
  const bus = createBus(), requests = [];
  bus.on('run:draftPickRequested', p => requests.push(p));
  const run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'draft', arenaId: 'helios_core', wave: 7, credits: 280 };
  const owner = { currentOffers: () => [], currentWave: () => run.wave, lastNotice: () => null,
    rerollState: () => null, recommendedOffers: () => [] };
  const ctx = { bus, state: { run, player: { ownedShips: [] } },
    registry: { get: name => name === 'survivalDraft' ? owner : null } };
  const screen = Object.create(crucibleDraftScreen), root = doc.createElement('div');
  try {
    screen.mount(root, ctx); screen.update?.(0, ctx);
    assert.match(screen._sub.textContent, /A Lancer opens next/);
    assert.match(screen._preview.textContent, /Slip the rail shot/);
    assert.match(textLines(root).join(' '), /Launch round 8/);
    assert.equal(screen._fortifyBtn.hidden, false);
    screen._skip.click(); assert.equal(requests.length, 1);
    assert.equal(run.credits, 280); assert.equal(run.phase, 'draft');
  } finally { screen.unmount?.(); globalThis.document = previous; }
});

test('the actual save owner refuses round-seven/eight writes and protects the existing campaign slot', async () => {
  const { save } = await import('../src/save/saveSystem.js');
  const { createGameState } = await import('../src/core/gameState.js');
  const { createBus } = await import('../src/core/eventBus.js');
  const previous = globalThis.localStorage;
  const bytes = new Map([['sf.save.auto', 'existing campaign bytes'], ['sf.save.index', 'existing campaign index']]);
  globalThis.localStorage = { getItem: k => bytes.get(k) ?? null, setItem: (k, v) => bytes.set(k, String(v)),
    removeItem: k => bytes.delete(k), key: i => [...bytes.keys()][i], get length() { return bytes.size; } };
  const state = createGameState(4242), bus = createBus(), owner = Object.create(save), before = new Map(bytes);
  try {
    owner.init({ state, bus, helpers: {}, registry: { get: () => null } });
    for (const [wave, phase] of [[7, 'draft'], [8, 'wave_intro'], [8, 'active']]) {
      state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
        wave, phase, arenaId: 'helios_core' };
      assert.equal(owner._campaignSaveSuppressed(), true);
      assert.equal(owner.save('auto'), false); assert.equal(owner.save('manual1'), false);
      assert.deepEqual(bytes, before);
    }
  } finally { owner.destroy?.(); if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; }
});
