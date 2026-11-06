// S4 — "one press to the fight", pinned seam by seam.
//
// The title's SWARM verb must (a) build a validated setup out of the frozen quick-start
// record, (b) reach run telemetry through the SAME begin request the Crucible door rides —
// never a side channel — and (c) enter round 1 in flight: loadout -> arena_intro ->
// wave_intro -> active, with the draft stop never entered. The door's own launch keeps its
// authored opening: without the flag the first stop stays the armory.
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
import { swarmArcadeSeedFor } from '../src/data/swarmLadder.js';
import {
  resetCrucibleMetaForTests,
  useCrucibleMetaClock,
  useCrucibleMetaStorage,
} from '../src/systems/survivalRecords.js';
import { clearQueuedChallenge } from '../src/systems/survivalMutators.js';
import { crucibleSetupFor, requestCrucibleRun } from '../src/ui/crucibleLaunch.js';
import {
  SWARM_QUICK_START,
  swarmQuickStartExtras,
  swarmQuickStartValid,
} from '../src/data/swarmQuickStart.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';

const SEED = swarmArcadeSeedFor('helios_core');
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
  useCrucibleMetaClock(() => '2026-11-05T00:00:00.000Z');
  useCrucibleMetaStorage(memoryStorage());
}

// The real launch harness: requestCrucibleRun stages the config, game:started runs
// applySandboxSetup, and the true owners answer every bus seam — the same calls the
// title's SWARM verb makes.
let launchBus = null;
let launchCtx = null;

function bootDoor() {
  const state = createGameState(SEED);
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

// The title's press, distilled: the quick-start extras through the same setup builder and
// launch request the door uses.
function pressSwarm(h) {
  const extras = swarmQuickStartExtras();
  assert.ok(extras, 'the record validates on this catalog');
  const setup = crucibleSetupFor({ ...extras, seed: SEED });
  assert.equal(setup.ok, true, JSON.stringify(setup.issues));
  assert.equal(requestCrucibleRun(h.bus, setup, SWARM_QUICK_START.ruleset), true);
  launchBus.emit('game:started');
}

function driveOpening(h) {
  h.state.mode = 'loading';
  h.bus.emit('run:loadoutReady', { source: 'test' });
  h.bus.emit('run:openingPrepareRequested', { source: 'test' });
  for (let i = 0; i < 6 && h.state.run.phase !== 'wave_intro' && h.state.run.phase !== 'active'; i += 1) {
    survivalRun.update(DT);
    if (h.state.run.phase === 'refit') h.bus.emit('run:refitClosed', {});
  }
}

test('the quick-start record is frozen, complete, and every id resolves', () => {
  assert.equal(Object.isFrozen(SWARM_QUICK_START), true);
  assert.equal(swarmQuickStartValid(SWARM_QUICK_START), true);
  const extras = swarmQuickStartExtras();
  assert.equal(extras.ruleset, SWARM_RULESET);
  assert.equal(extras.arenaId, 'helios_core');
  assert.equal(extras.swarmStake, 'contender');
  assert.equal(extras.starterId, 'ricochet_runner');
  assert.equal(extras.openArmoryBeforeRound1, false);
  // A record that names a dead id fails loudly, never silently.
  assert.equal(swarmQuickStartValid({ ...SWARM_QUICK_START, arenaId: 'no_such_arena' }), false);
  assert.equal(swarmQuickStartValid({ ...SWARM_QUICK_START, starterPackageId: 'no_such_kit' }), false);
});

test('quick-start: the flag rides the ordinary begin request and round 1 opens in flight', () => {
  resetMeta();
  const h = bootDoor();
  pressSwarm(h);

  // Seam 1: the begin request itself carried the opt-out — no hidden flag, no second path.
  const begin = h.emitted.filter((e) => e.event === 'run:beginRequested').at(-1);
  assert.equal(begin.payload.openArmoryBeforeRound1, false);
  assert.equal(begin.payload.ruleset, SWARM_RULESET);
  // Seam 2: runSession stamped it on run telemetry where the phase machine reads it.
  assert.equal(h.state.run.telemetry.openArmoryBeforeRound1, false);
  assert.equal(h.state.run.phase, 'loadout');

  // Seam 3: the opening drives straight to the first fight — the draft stop is never entered.
  const phases = [];
  h.bus.on('run:phaseChanged', (p) => phases.push(p && (p.phase || p.next || p)));
  driveOpening(h);

  assert.notEqual(h.state.run.phase, 'draft', 'the opening stop is the fight, not the armory');
  assert.ok(
    h.state.run.phase === 'wave_intro' || h.state.run.phase === 'active',
    `round 1 in flight, got phase ${h.state.run.phase}`,
  );
  assert.equal(phases.includes('draft'), false, `draft was entered: ${JSON.stringify(phases)}`);
  const planned = h.emitted.filter((e) => e.event === 'run:wavePlanned').at(-1);
  assert.equal(planned.payload.wave, 1, 'the first fight is still round 1');
});

test('the door keeps its authored opening: no flag still means the armory first', () => {
  resetMeta();
  const h = bootDoor();
  const setup = crucibleSetupFor({ starterId: 'ricochet_runner', seed: SEED });
  assert.equal(setup.ok, true);
  assert.equal(requestCrucibleRun(h.bus, setup.value, SWARM_RULESET), true);
  launchBus.emit('game:started');

  const begin = h.emitted.filter((e) => e.event === 'run:beginRequested').at(-1);
  assert.equal(begin.payload.openArmoryBeforeRound1 ?? null, null, 'the door never sends the opt-out');
  assert.equal(h.state.run.telemetry.openArmoryBeforeRound1 ?? null, null);

  h.state.mode = 'loading';
  h.bus.emit('run:loadoutReady', { source: 'test' });
  h.bus.emit('run:openingPrepareRequested', { source: 'test' });
  assert.equal(h.state.run.phase, 'draft', 'the authored opening stop is the armory');
});
