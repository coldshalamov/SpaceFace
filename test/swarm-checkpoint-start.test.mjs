// SWARM-04 — the checkpoint-start contract, pinned end to end.
//
// A ladder checkpoint launch must land two things together: the wave index the player
// bought (a Round-11 start fights Round 11, never Round 1 fast-forwarded) AND a wallet the
// depth calls for — "a typical run's purse at that point" (SWARM_ARCADE §6.2), seeded
// through the same award seam as the stake before the opening armory can spend it. A
// checkpoint that starts broke and unarmed at a deep wave is a restart in disguise.
//
// Covered pieces of the chain, one assertion per seam:
//   door pick      → crucibleSetupFor carries `wave` on the validated setup
//   staged config  → applySandboxSetup emits begin{startWave} + award{swarm:checkpoint:wN}
//   runSession     → run.wave parks at startWave-1; telemetry.startWave stamps the fact
//   survivalRun    → the planner's run.wave+1 IS the bought wave — the first plan, not a skip
//   the gate       → stars are the only currency that opens a checkpoint; the door lists
//                    zones 0..rec.checkpoint and clamps startWave to them
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { fields } from '../src/systems/fields.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { installSandboxGameStartedHook } from '../src/ui/sandbox/sandboxSetup.js';
import {
  applySwarmLadderResult,
  emptySwarmLadder,
  migrateSwarmLadder,
  swarmArcadeSeedFor,
  swarmArenaIsUnlocked,
  swarmCheckpointPurseFor,
  swarmCheckpointStartWave,
  swarmLadderZonesCleared,
  swarmZoneIndexFor,
} from '../src/data/swarmLadder.js';
import { offerDraft } from '../src/data/survivalDraft.js';
import { swarmStakeFor } from '../src/data/swarmStakes.js';
import {
  loadCrucibleMeta,
  resetCrucibleMetaForTests,
  useCrucibleMetaClock,
  useCrucibleMetaStorage,
} from '../src/systems/survivalRecords.js';
import { clearQueuedChallenge } from '../src/systems/survivalMutators.js';
import { crucibleSetupFor, requestCrucibleRun } from '../src/ui/crucibleLaunch.js';

const LADDER_SEED = swarmArcadeSeedFor('helios_core');
const DT = 1 / 60;

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(String(key), String(value)),
    removeItem: (key) => map.delete(key),
  };
}

function resetMeta() {
  resetCrucibleMetaForTests();
  clearQueuedChallenge();
  useCrucibleMetaClock(() => '2026-10-05T00:00:00.000Z');
  useCrucibleMetaStorage(memoryStorage());
}

// Same real launch harness as test/swarm-ladder.test.mjs: requestCrucibleRun stages the
// config, game:started runs applySandboxSetup, and the true owners (runSession,
// survivalRun, survivalWave, swarmArena) answer every bus seam.
let launchBus = null;
let launchCtx = null;

function bootDoor(seed = LADDER_SEED) {
  const state = createGameState(seed);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const budget = makeBudgetApi(state);
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: spec.pos ? { ...spec.pos } : { x: 0, z: 0 } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));
  const registry = { get: (name) => (name === 'fields' ? fields : null) };
  const ctx = { state, bus, helpers, registry };
  fields.init(ctx);
  runSession.init(ctx);
  survivalWave.init(ctx);
  survivalRun.init(ctx);
  swarmArena.init(ctx);
  launchCtx = ctx;
  if (!launchBus) {
    launchBus = bus;
    installSandboxGameStartedHook(bus, () => launchCtx);
  }
  return { state, bus, emitted, ctx };
}

function awardsOf(h, prefix) {
  return h.emitted
    .filter((e) => e.event === 'run:awardRequested' && String(e.payload.reason).startsWith(prefix));
}

function launch(h, opts) {
  const setup = crucibleSetupFor({ starterId: 'ricochet_runner', seed: LADDER_SEED, ...opts });
  assert.equal(setup.ok, true, JSON.stringify(setup.issues));
  assert.equal(requestCrucibleRun(h.bus, setup.value), true);
  launchBus.emit('game:started');
}

// Walk the phase machine the way the loading gate walks it: the armory opens on draft
// entry, resolves, and the tick carries the run to wave_intro — where the planner stamps
// the first fight. A checkpoint parked on a boss boundary also earns the bench stop.
function driveToFirstPlan(h) {
  h.state.mode = 'loading';
  h.bus.emit('run:loadoutReady', { source: 'test' });
  h.bus.emit('run:openingPrepareRequested', { source: 'test' });
  assert.equal(h.state.run.phase, 'draft', 'the opening stop is the armory');
  h.bus.emit('run:draftResolved', {});
  for (let i = 0; i < 6 && h.state.run.phase !== 'wave_intro'; i += 1) {
    survivalRun.update(DT);
    if (h.state.run.phase === 'refit') h.bus.emit('run:refitClosed', {});
  }
  assert.equal(h.state.run.phase, 'wave_intro', 'the machine reaches the first fight');
}

test('a Round-1 ladder start is untouched: no checkpoint fact, stake purse only, wave 1 fights first', () => {
  resetMeta();
  const h = bootDoor();
  launch(h, {});

  const begin = h.emitted.filter((e) => e.event === 'run:beginRequested').at(-1);
  assert.equal(begin.payload.startWave ?? null, null, 'no checkpoint picked, no startWave rides');
  assert.equal(h.state.run.wave, 0, 'the counter opens at the top');
  assert.equal(h.state.run.telemetry?.startWave ?? null, null);
  assert.equal(awardsOf(h, 'swarm:checkpoint').length, 0, 'a fresh run draws no checkpoint purse');
  assert.equal(
    h.state.run.credits,
    swarmStakeFor('contender').purse,
    'the wallet is exactly the stake purse — fresh profile, no war chest',
  );

  driveToFirstPlan(h);
  const planned = h.emitted.filter((e) => e.event === 'run:wavePlanned').at(-1);
  assert.equal(planned.payload.wave, 1, 'the first fight is the first wave');
  assert.match(planned.payload.plan.id, /^swarm:w1:/);
  assert.equal(h.state.run.wave, 1);
});

test('a zone-2 checkpoint start enters at Round 11 with the mid-build purse already banked', () => {
  resetMeta();
  const h = bootDoor();
  launch(h, { startWave: swarmCheckpointStartWave(1) });

  const begin = h.emitted.filter((e) => e.event === 'run:beginRequested').at(-1);
  assert.equal(begin.payload.startWave, 11, 'the bought entry point rides the begin request');
  assert.equal(h.state.run.wave, 10, 'parked one wave back — the planner adds the first fight');
  assert.equal(h.state.run.telemetry.startWave, 11, 'settlement reads the honest entry');

  // The authored purse rule (SWARM_ARCADE §6.2): 800 cr at the first checkpoint, +350 a
  // zone — on top of the stake, through the same wallet seam, before the armory opens.
  const checkpoint = awardsOf(h, 'swarm:checkpoint:').at(-1);
  assert.ok(checkpoint, 'the checkpoint purse lands through the wallet seam');
  assert.equal(checkpoint.payload.reason, 'swarm:checkpoint:w11');
  assert.equal(checkpoint.payload.credits, swarmCheckpointPurseFor(1));
  assert.equal(
    h.state.run.credits,
    swarmStakeFor('contender').purse + swarmCheckpointPurseFor(1),
    'a bought Round 11 never opens on a Round-1 wallet',
  );
  assert.ok(h.state.run.credits > swarmStakeFor('contender').purse, 'not wave-1 trivial');

  driveToFirstPlan(h);
  const planned = h.emitted.filter((e) => e.event === 'run:wavePlanned').at(-1);
  assert.equal(planned.payload.wave, 11, 'the run fights its authored wave — not a fast-forward from 1');
  assert.match(planned.payload.plan.id, /^swarm:w11:/);
  assert.equal(h.state.run.wave, 11);
});

test('deeper checkpoints scale on the same authored rule — Round 21 parks at 20 and banks 1150', () => {
  resetMeta();
  const h = bootDoor();
  launch(h, { startWave: swarmCheckpointStartWave(2) });

  const begin = h.emitted.filter((e) => e.event === 'run:beginRequested').at(-1);
  assert.equal(begin.payload.startWave, 21);
  assert.equal(h.state.run.wave, 20);
  const checkpoint = awardsOf(h, 'swarm:checkpoint:').at(-1);
  assert.equal(checkpoint.payload.reason, 'swarm:checkpoint:w21');
  assert.equal(h.state.run.credits, swarmStakeFor('contender').purse + swarmCheckpointPurseFor(2));

  driveToFirstPlan(h);
  const planned = h.emitted.filter((e) => e.event === 'run:wavePlanned').at(-1);
  assert.equal(planned.payload.wave, 21, 'a deep checkpoint plans its own wave');
  assert.match(planned.payload.plan.id, /^swarm:w21:/);
});

test('the authored checkpoint table: zone index → wave, zone index → purse', () => {
  assert.equal(swarmCheckpointStartWave(1), 11, 'zone 2 opens at Round 11');
  assert.equal(swarmCheckpointStartWave(13), 131, 'zone 14 opens at Round 131');
  assert.equal(swarmCheckpointPurseFor(0), 0, 'Round 1 is not a checkpoint');
  assert.equal(swarmCheckpointPurseFor(1), 800);
  assert.equal(swarmCheckpointPurseFor(2), 800 + 350);
  assert.equal(swarmCheckpointPurseFor(13), 800 + 350 * 12);
});

test('the checkpoint armory stocks a deeper shelf than wave 0 — never an empty shop', () => {
  // The opening armory sits at the parked wave (cleared-waves count): wave-3+ authored
  // cards are already on the shelf a Round-1 shopper cannot see. The pool only grows.
  const atZero = offerDraft({
    seed: LADDER_SEED, wave: 0, hullId: 'ship_hornet', fittings: [], pickCount: 0,
    count: 100, ruleset: 'swarm',
  });
  const atCheckpoint = offerDraft({
    seed: LADDER_SEED, wave: 10, hullId: 'ship_hornet', fittings: [], pickCount: 0,
    count: 100, ruleset: 'swarm',
  });
  assert.equal(atZero.ok, true);
  assert.equal(atCheckpoint.ok, true);
  assert.ok(atCheckpoint.offers.length > 0, 'the checkpoint armory deals');
  assert.ok(
    atCheckpoint.eligibleCount > atZero.eligibleCount,
    `the shelf deepens with the depth bought (${atZero.eligibleCount} → ${atCheckpoint.eligibleCount})`,
  );
  assert.ok(
    atCheckpoint.offers.some((o) => o.fromWave != null && o.fromWave > 1),
    'wave-gated cards are already stock — the re-entered run sees the grown shelf',
  );
  assert.ok(
    atZero.offers.every((o) => o.fromWave == null || o.fromWave <= 1),
    'a Round-1 shop never fronts a card it has not earned',
  );
});

test('the gate: an unearned checkpoint stays locked — stars are the only key', () => {
  resetMeta();
  // A fresh ladder banks no checkpoint: the only zone row the door can offer is Round 1.
  const fresh = emptySwarmLadder();
  assert.equal(swarmArenaIsUnlocked(fresh, 'helios_core'), true, 'the Foundry is always open');
  assert.equal(swarmArenaIsUnlocked(fresh, 'lagrange_crucible'), false, 'stars gate the next room');

  // The door's own rule — zones 0..rec.checkpoint, anything deeper clamps back to the
  // earned deepest pick. On a fresh ladder every bought-wave pick fails that test.
  const rec = migrateSwarmLadder(fresh).arenas.helios_core
    || { checkpoint: 0 };
  assert.equal(rec.checkpoint ?? 0, 0);
  for (let z = 1; z <= 13; z += 1) {
    const wave = swarmCheckpointStartWave(z);
    assert.ok(
      swarmZoneIndexFor(wave) > rec.checkpoint,
      `Round ${wave} is beyond the earned checkpoints — the door never lists it`,
    );
  }
  assert.equal(swarmZoneIndexFor(swarmCheckpointStartWave(0)), 0, 'Round 1 is always legal');

  // And nothing but a zone boss writes the row: dying at wave 9 banks no checkpoint.
  const died = applySwarmLadderResult(emptySwarmLadder(), {
    arenaId: 'helios_core', startWave: 1, lastClearedWave: 9, deepestWave: 9,
    zoneChains: {}, zoneDeaths: {},
  });
  assert.deepEqual(swarmLadderZonesCleared(1, 9), [], 'mid-zone deaths clear no zone');
  assert.equal(died.ladder.arenas.helios_core.checkpoint ?? 0, 0, 'no boss, no checkpoint');
  assert.equal(died.delta.newCheckpoint, null);

  // The profile the door reads on boot says the same thing after a save/load round trip.
  const profile = loadCrucibleMeta();
  const doorRec = profile.ladder.arenas.helios_core;
  assert.equal(doorRec?.checkpoint ?? 0, 0, 'a fresh profile offers only the top');
});
