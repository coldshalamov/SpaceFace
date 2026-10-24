// SWARM-08 B5 (row 270) — the finite four-stage Circuit journey, end to end.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { survivalArenaById } from '../src/data/survivalArenas.js';
import { SWARM_CLEANUP_TICKS } from '../src/data/swarmMode.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { MAX_LINES_PER_WAVE, NAMED_KILL_PRIORITY, survivalAnnounce } from '../src/systems/survivalAnnounce.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import {
  CIRCUIT_BOSS_SEQUENCE,
  CIRCUIT_DESTINATIONS,
  CIRCUIT_STAGE_COUNT,
  CIRCUIT_DEFEND_TICKS,
  CIRCUIT_SURVIVE_TICKS,
  CIRCUIT_TOTAL_ROUNDS,
  CIRCUIT_VIEW_AHEAD,
  circuitArenaLine,
  circuitBossFor,
  circuitChoiceId,
  circuitChoicesFor,
  circuitEntryBlocker,
  circuitFor,
  circuitRoundFor,
  circuitRouteView,
  normalizeCircuitState,
} from '../src/systems/survivalCircuit.js';
import { queueSurvivalChallenge } from '../src/systems/survivalMutators.js';
import {
  compactRunResult,
  loadCrucibleMeta,
  recordRulesFor,
  recordKey,
  settleCrucibleRun,
  useCrucibleMetaStorage,
} from '../src/systems/survivalRecords.js';
import { survivalResults } from '../src/systems/survivalResults.js';
import { survivalRewards } from '../src/systems/survivalRewards.js';
import { buildShareBand, resultHero } from '../src/ui/screens/crucible.js';
import { circuitPanelLines, crucibleDraftScreen } from '../src/ui/screens/crucibleDraft.js';
import { OBJECTIVE_WORDS, objectiveWord, waveCountdownClock } from '../src/ui/survivalHud.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';

const DT = 1 / 60;
const SEED = 4242;
const ARENA = 'helios_core';
const START_ID = circuitChoiceId('start', { wave: 0, revision: 1 });

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(String(key), String(value)),
    removeItem: (key) => map.delete(key),
  };
}

function makeHarness({ withBudget = true } = {}) {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const budget = makeBudgetApi(state);
  const spawned = [];
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 400, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  raw.on('entity:destroyed', (payload) => {
    if (withBudget) budget.releaseEntity(payload && payload.id);
  });
  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalWave.init(ctx);
  survivalRun.init(ctx);
  return { state, bus, emitted, helpers, budget, spawned, ctx, player, raw };
}

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
}

function step(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.tick += 1;
    h.state.simTime += DT;
    survivalWave.update(DT);
    survivalRun.update(DT);
  }
}

function tickUntil(h, predicate, max = 5000) {
  for (let i = 0; i < max; i++) {
    step(h, 1);
    if (predicate()) return true;
  }
  return false;
}

function transition(h, expectedPhase, nextPhase) {
  h.bus.emit('run:transitionRequested', {
    expectedPhase, nextPhase, reason: 't', tick: 0,
  });
}

function beginSwarm(h) {
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA,
  });
  return h.state.run;
}

/** Reach the opening armory, where the Circuit is offered for the first time. */
function openArmory(h) {
  beginSwarm(h);
  assert.equal(h.state.run.phase, 'loadout');
  transition(h, 'loadout', 'draft');
  assert.equal(h.state.run.phase, 'draft');
  return h.state.run;
}

function choose(h, offerId) {
  const before = named(h.emitted, 'run:circuitChoiceApplied').length;
  h.bus.emit('run:circuitChoiceRequested', { offerId });
  const rows = named(h.emitted, 'run:circuitChoiceApplied');
  assert.equal(rows.length, before + 1, 'a Circuit request always answers with one receipt');
  return rows[rows.length - 1].payload;
}

function enterCircuit(h) {
  openArmory(h);
  const applied = choose(h, START_ID);
  assert.equal(applied.accepted, true, applied.reason);
  h.bus.emit('run:draftResolved', {});
  assert.ok(tickUntil(h, () => h.state.run.phase === 'wave_intro'), 'draft resolves into round one');
  return h.state.run;
}

function reachActive(h) {
  assert.equal(h.state.run.phase, 'wave_intro');
  h.bus.emit('run:waveIntroComplete', {});
  assert.ok(tickUntil(h, () => h.state.run.phase === 'active'), 'the round materializes');
}

function killEverything(h) {
  const killed = [];
  for (const entity of [...h.state.entities.values()]) {
    if (entity.id === h.player.id) continue;
    if (!entity.alive) continue;
    entity.alive = false;
    h.state.entities.delete(entity.id);
    killed.push(entity.id);
  }
  for (const id of killed) h.bus.emit('entity:destroyed', { id });
  return killed.length;
}

function clearedCount(h) {
  return named(h.emitted, 'run:waveCleared').length;
}

function lastPlan(h) {
  const rows = named(h.emitted, 'run:wavePlanned');
  return rows.length ? rows[rows.length - 1].payload.plan : null;
}

function clearCohortRound(h) {
  const before = clearedCount(h);
  // A finite round can never be cleared by a single sweep: the concurrency cap holds part of the
  // quota back until slots free. Kill the room, let the refill admit the rest, and repeat — the
  // round clears when the last owed body resolves, exactly as it does in play.
  // Schedule batches land at authored ticks and the concurrency cap holds the rest back, so
  // advance in slices: kill what is on the board, let the next batch land, repeat.
  for (let i = 0; i < 160; i++) {
    killEverything(h);
    step(h, 10);
    if (clearedCount(h) > before) return;
  }
  assert.fail('the cohort never resolved');
}

function reachDraft(h) {
  assert.ok(tickUntil(h, () => h.state.run.phase === 'draft', 400), 'cleanup opens the armory');
}

/** Resolve the armory and let the next round plan; wave ten also opens the ordinary refit bench. */
function advanceFromDraft(h) {
  h.bus.emit('run:draftResolved', {});
  assert.ok(tickUntil(h, () => h.state.run.phase === 'wave_intro' || h.state.run.phase === 'refit'),
    'the draft advances the run');
  if (h.state.run.phase === 'refit') {
    h.bus.emit('run:refitClosed', {});
    assert.ok(tickUntil(h, () => h.state.run.phase === 'wave_intro'), 'the refit bench closes');
  }
}

function circuitFixture(overrides = {}) {
  const base = {
    outcome: 'victory',
    seed: SEED,
    arenaId: ARENA,
    ruleset: 'swarm',
    wave: 16,
    deepestWave: 16,
    wavesCleared: 16,
    kills: 40,
    score: 4242,
    credits: 80,
    xp: 320,
    picks: [],
    circuit: {
      version: 1,
      startArenaId: ARENA,
      route: [
        { stage: 1, arenaId: ARENA, nodeId: ARENA },
        { stage: 2, arenaId: 'lagrange_crucible', nodeId: 'lagrange_crucible' },
        { stage: 3, arenaId: 'cryo_drift', nodeId: 'cryo_drift' },
        { stage: 4, arenaId: 'the_hive', nodeId: 'the_hive' },
      ],
      clearedStages: 4,
      status: 'completed',
      wonAtWave: 16,
    },
    ...overrides,
  };
  return base;
}

// ── 1 — ordinary Swarm is untouched ──────────────────────────────────────────
test('without a Circuit, plans, openings and boss cadence are byte-identical', () => {
  for (const wave of [1, 4, 10, 16, 17]) {
    const input = { seed: SEED, arenaId: ARENA, wave, mode: 'swarm' };
    assert.deepEqual(planWave({ ...input, circuitRound: null }), planWave(input));
  }
  const ten = planWave({ seed: SEED, arenaId: ARENA, wave: 10, mode: 'swarm' });
  assert.equal(ten.swarm.requireBoss, true, 'the ordinary wave-10 champion still arrives');
  const sixteen = planWave({ seed: SEED, arenaId: ARENA, wave: 16, mode: 'swarm' });
  assert.equal(sixteen.swarm.requireBoss, false, 'wave 16 is not an ordinary cadence boss');

  const run = { ruleset: 'swarm', phase: 'draft', wave: 0, arenaId: ARENA };
  assert.equal(circuitFor(run), null);
  assert.equal(circuitRoundFor(run, 1), null);
  assert.deepEqual(circuitChoicesFor({ ...run, ruleset: 'scored' }), []);
  assert.deepEqual(circuitChoicesFor({ ...run, wave: 1 }), [], 'entry is only offered in the opening');
});

// ── 2 — entry is offered, accepted once, and refuses locked runs ─────────────
test('Start Circuit is offered at the opening and commits revision one', () => {
  const h = makeHarness();
  const run = openArmory(h);
  const choices = circuitChoicesFor(run);
  assert.equal(choices.length, 1);
  assert.equal(choices[0].id, START_ID);
  const credits = h.state.player.credits;
  const fittings = JSON.stringify(h.state.player.ownedShips);
  const applied = choose(h, START_ID);
  assert.equal(applied.accepted, true);
  assert.equal(applied.kind, 'start');
  assert.equal(run.phase, 'draft');
  assert.equal(h.state.player.credits, credits, 'entry does not buy anything');
  assert.equal(JSON.stringify(h.state.player.ownedShips), fittings, 'entry does not refit');
  const circuit = circuitFor(run);
  assert.equal(circuit.revision, 2);
  assert.equal(circuit.status, 'running');
  assert.equal(circuit.startArenaId, ARENA);
  assert.deepEqual(circuit.route, [{ stage: 1, arenaId: ARENA, nodeId: ARENA }]);

  const replay = choose(h, START_ID);
  assert.equal(replay.accepted, false);
  assert.match(replay.reason, /no longer available/);
});

test('practice, checkpoint, mutator, wager and queued challenge entries carry a reason', () => {
  const cases = [
    { name: 'practice', mutate: (run) => { run.practice = true; }, expected: /Practice/ },
    { name: 'checkpoint', mutate: (run) => { run.telemetry.startWave = 11; }, expected: /checkpoint/ },
    { name: 'mutator', mutate: (run) => { run.arenaMutators = ['hot']; }, expected: /mutator/ },
    { name: 'wager', mutate: (run) => { run.telemetry.threats = ['no_rerolls']; }, expected: /wager/i },
  ];
  for (const row of cases) {
    const h = makeHarness();
    const run = openArmory(h);
    row.mutate(run);
    assert.ok(circuitEntryBlocker(run), `${row.name} is blocked by the pure gate`);
    const applied = choose(h, START_ID);
    assert.equal(applied.accepted, false, row.name);
    assert.match(applied.reason, row.expected, row.name);
    assert.equal(circuitFor(run), null, `${row.name} writes no Circuit state`);
  }
  queueSurvivalChallenge({ seed: SEED, mutators: ['draftless'], ruleset: 'swarm' });
  const h = makeHarness();
  const run = openArmory(h);
  const applied = choose(h, START_ID);
  assert.equal(applied.accepted, false, 'a queued challenge owns the run contract');
  assert.match(applied.reason, /queued challenge/i);
  assert.equal(circuitFor(run), null);
});

// ── 3 — the choice crosses the worker boundary and reaches the main mirror ───
test('the worker publishes Circuit telemetry to the main-thread mirror', async () => {
  const lane = createSimHost();
  const domains = new Map();
  const touched = new Set();
  const apply = (reply) => {
    for (const update of reply.domainUpdates || []) {
      touched.clear();
      applyDomainPathUpdate(domains, update, touched);
    }
    return reply;
  };
  let directive = 0;
  const send = async (commands) => apply(await lane.tick({ tick: ++directive, steps: 0, commands }));
  try {
    await lane.init({
      profile: 'production',
      seed: SEED,
      scenarioContract: JSON.parse(readFileSync(
        new URL('../src/data/scenarios/47a.scenario.json', import.meta.url),
      )),
    });
    const ring = createSimCommandRing();
    pushLaneCommand(ring, { kind: 'mode', mode: 'loading' });
    ring.pushBus({ emit: 'run:beginRequested', payload: {
      kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA,
    } });
    ring.pushBus({ emit: 'run:transitionRequested', payload: {
      expectedPhase: 'loadout', nextPhase: 'draft', reason: 't', tick: 0,
    } });
    ring.pushBus({ emit: 'run:draftPickRequested', payload: { offerId: START_ID } });
    await send(ring.drain());
    const live = lane.host.state.run.telemetry.circuit;
    assert.ok(live, 'the sim owns the whole Circuit state');
    assert.equal(live.revision, 2);

    for (let i = 0; i < 32; i++) await send([]);
    const mirrored = domains.get('run');
    assert.ok(mirrored && mirrored.telemetry && mirrored.telemetry.circuit,
      'the run domain carries Circuit telemetry to the facade');
    assert.equal(mirrored.telemetry.circuit.status, 'running');
    assert.equal(mirrored.telemetry.circuit.startArenaId, ARENA);
  } finally {
    lane.shutdown();
  }
});

// ── 4 + 5 + 8 + 9 — the whole sixteen-round journey over real waves ──────────
test('sixteen real rounds: survive boundaries, stage routes, champions, and one victory', () => {
  const h = makeHarness();
  enterCircuit(h);
  reachActive(h);
  assert.equal(h.state.run.wave, 1);
  assert.equal(lastPlan(h).swarm.circuit.kind, 'cohort');

  const surviveWaves = [];
  const bossWaves = [];
  let routedStages = 0;

  for (let wave = 1; wave <= CIRCUIT_TOTAL_ROUNDS; wave++) {
    const run = h.state.run;
    const circuit = circuitFor(run);
    const round = circuitRoundFor(run, wave);
    assert.equal(run.wave, wave);
    assert.equal(round.stage, Math.floor((wave - 1) / 4) + 1);
    assert.equal(round.localRound, ((wave - 1) % 4) + 1);
    const plan = lastPlan(h);
    assert.equal(plan.swarm.boss, round.kind === 'boss', `wave ${wave} champion presence`);
    assert.equal(plan.swarm.requireBoss, round.kind === 'boss', `wave ${wave} requireBoss`);
    assert.equal(plan.swarm.circuit.stage, round.stage);
    assert.equal(plan.swarm.circuit.localRound, round.localRound);
    assert.equal(plan.swarm.circuit.kind, round.kind);

    if (round.kind === 'boss') {
      bossWaves.push(wave);
      const boss = circuitBossFor(CIRCUIT_BOSS_SEQUENCE[round.stage - 1]);
      assert.ok(boss, `stage ${round.stage} has an authored champion`);
      assert.equal(plan.swarm.bossId, boss.id);
      assert.equal(plan.swarm.bossLabel, boss.label);
      assert.ok(plan.swarm.bossScoreId || plan.swarm.bossTrickId,
        'the champion carries its authored score or trick id');
    } else {
      assert.equal(plan.swarm.bossId, null);
    }

    if (round.kind === 'survive') {
      surviveWaves.push(wave);
      assert.equal(plan.objective.kind, 'survive');
      assert.equal(plan.swarm.killTarget, 0);
      assert.equal(plan.completionRules.kind, 'duration');
      assert.equal(plan.completionRules.durationTicks, CIRCUIT_SURVIVE_TICKS);
      const before = clearedCount(h);
      // 3,599 active ticks is one short of the sixty-second boundary; the 3,600th clears.
      step(h, 600);
      killEverything(h);
      step(h, CIRCUIT_SURVIVE_TICKS - 1 - 600);
      assert.equal(clearedCount(h), before,
        'killing every enemy does not manufacture a clear before sixty seconds');
      step(h, 1);
      assert.equal(clearedCount(h), before + 1, 'the boundary tick clears exactly once');
      const receipt = named(h.emitted, 'run:waveCleared').at(-1).payload;
      assert.equal(receipt.completionKind, 'duration');
      assert.equal(receipt.tick, CIRCUIT_SURVIVE_TICKS);
      assert.ok(receipt.survivors > 0, 'survivors are left flying, not deleted for a clear');
      assert.equal(h.player.alive, true);
    } else if (round.kind === 'hold' || round.kind === 'reach') {
      const before = clearedCount(h);
      const zone = round.kind === 'hold' ? lastPlan(h).swarm.circuit.zone : lastPlan(h).swarm.circuit.gate;
      const mark = [...h.state.entities.values()].find((entity) => entity.data && entity.data.circuitMark);
      assert.ok(mark, `${round.kind} plants a beacon on the spot`);
      assert.equal(mark.physicsBody, false, 'the mark is not a solid body');
      assert.equal(mark.collides, false);
      assert.equal(mark.data.ringRadius, zone.radius, 'the drawn circle is the circle the clock uses');
      assert.ok(Math.hypot(mark.pos.x - zone.x, mark.pos.z - zone.z) < 1, 'the beacon sits on the spot');
      const shipDist = Math.hypot(h.player.pos.x - zone.x, h.player.pos.z - zone.z);
      assert.ok(shipDist > zone.radius, 'the ship is not already standing in the spot');
      assert.ok(shipDist + zone.radius <= CIRCUIT_VIEW_AHEAD, 'the whole ring is in the picture the ship sees');
      h.player.pos.x = 0;
      h.player.pos.z = 0;
      killEverything(h);
      step(h, 30);
      assert.equal(clearedCount(h), before, 'kills do not finish a zone round');
      h.player.pos.x = zone.x;
      h.player.pos.z = zone.z;
      step(h, 40);
      const dipped = survivalWave._swarm.circuit.fill;
      assert.ok(dipped >= 30, 'standing in the spot fills the clock');
      h.player.pos.x = 0;
      h.player.pos.z = 0;
      step(h, 30);
      assert.ok(survivalWave._swarm.circuit.fill < dipped, 'leaving the spot drains the clock');
      assert.equal(clearedCount(h), before, 'a dip does not finish the sit');
      h.player.pos.x = zone.x;
      h.player.pos.z = zone.z;
      step(h, lastPlan(h).swarm.circuit.need);
      assert.equal(clearedCount(h), before + 1, `${round.kind} fills on presence`);
      const receipt = named(h.emitted, 'run:waveCleared').at(-1).payload;
      assert.equal(receipt.completionKind, round.kind);
    } else if (round.kind === 'collect') {
      const before = clearedCount(h);
      const need = lastPlan(h).swarm.circuit.coreCount;
      for (let i = 0; i < 80 && (survivalWave._circuitCores?.length || 0) < need; i++) {
        killEverything(h);
        step(h, 10);
      }
      assert.equal(clearedCount(h), before, 'cores on the field do not finish the round');
      const planted = survivalWave._circuitCores || [];
      assert.equal(planted.length, need, 'the round spills one marker per core');
      for (const core of planted) {
        const mark = [...h.state.entities.values()].find((entity) => entity.data && entity.data.circuitCore
          && entity.alive !== false && entity.pos
          && Math.hypot(entity.pos.x - core.x, entity.pos.z - core.z) < 1);
        assert.ok(mark, 'each core is a marker in the fight');
        assert.equal(mark.physicsBody, false, 'a core is not a solid body');
        assert.equal(mark.collides, false);
        assert.notEqual(mark.data.wallet, 'run', 'a core is not a credit chip');
        const dist = Math.hypot(core.x - h.player.pos.x, core.z - h.player.pos.z);
        assert.ok(dist > 12, 'a core is not sitting on the ship');
        assert.ok(core.z > h.player.pos.z, 'a core is ahead of the ship');
        assert.ok(dist + 6 <= CIRCUIT_VIEW_AHEAD + 0.01, 'a core stays inside the swarm picture');
      }
      for (const core of planted) {
        h.player.pos.x = core.x;
        h.player.pos.z = core.z;
        step(h, 1);
      }
      assert.equal(clearedCount(h), before + 1, 'the last core finishes the round');
      const receipt = named(h.emitted, 'run:waveCleared').at(-1).payload;
      assert.equal(receipt.completionKind, 'collect');
      assert.equal(receipt.found, need);
    } else if (round.kind === 'nodes') {
      const landed = tickUntil(h, () => {
        let n = 0;
        for (const entity of h.state.entities.values()) {
          if (entity && entity.alive !== false && entity.data && entity.data.circuitNode) n += 1;
        }
        return n >= 3;
      }, 800);
      assert.ok(landed, 'three hive nodes take the field');
      const nodes = [...h.state.entities.values()].filter((entity) => entity && entity.alive !== false
        && entity.data && entity.data.circuitNode);
      assert.equal(nodes.length, 3, 'the nodes are this wave\'s own bodies');
      for (const node of nodes) {
        const dist = Math.hypot(node.pos.x - h.player.pos.x, node.pos.z - h.player.pos.z);
        const radius = Number(node.radius) > 0 ? node.radius : 8;
        assert.ok(dist > 4, 'a node is planted ahead of the ship');
        assert.ok(dist + radius <= CIRCUIT_VIEW_AHEAD + 0.01, 'a node stays inside the swarm picture');
        assert.equal(node.data.scanLabel, 'Hive node');
        if (node.data.ai) assert.equal(node.data.ai.swarmFireHeld, true, 'a node does not shoot');
      }
      const packBefore = [...h.state.entities.values()].filter((entity) => entity && entity.alive !== false
        && entity.id !== h.player.id && !(entity.data && entity.data.circuitNode));
      const before = clearedCount(h);
      for (const node of nodes) {
        node.alive = false;
        h.bus.emit('entity:killed', { id: node.id });
      }
      step(h, 5);
      assert.equal(clearedCount(h), before + 1, 'the last node ends the round');
      const receipt = named(h.emitted, 'run:waveCleared').at(-1).payload;
      assert.equal(receipt.completionKind, 'nodes');
      if (packBefore.length > 0) {
        const still = [...h.state.entities.values()].filter((entity) => entity && entity.alive !== false
          && entity.id !== h.player.id && !(entity.data && entity.data.circuitNode));
        assert.ok(still.length > 0, 'the pack is still flying when the nodes are gone');
      }
    } else if (round.kind === 'commander') {
      const landed = tickUntil(h, () => {
        for (const entity of h.state.entities.values()) {
          if (entity && entity.alive !== false && entity.data && entity.data.circuitCommander) return true;
        }
        return false;
      }, 800);
      assert.ok(landed, 'the commander takes the field');
      const commander = [...h.state.entities.values()].find((entity) => entity && entity.alive !== false
        && entity.data && entity.data.circuitCommander);
      assert.equal(commander.data.scanLabel, round.commanderName);
      assert.equal(commander.data.callsign, round.commanderName);
      assert.notEqual(commander.data.swarmChampion, true, 'the commander is not a second stage boss');
      survivalAnnounce.init(h.ctx);
      survivalAnnounce._wave = h.state.run.wave;
      survivalAnnounce._linesThisWave = MAX_LINES_PER_WAVE;
      clearCohortRound(h);
      const receipt = named(h.emitted, 'run:waveCleared').at(-1).payload;
      assert.equal(receipt.completionKind, 'commander');
      assert.equal(receipt.objectiveName, round.commanderName);
      assert.equal(receipt.killWord, `${round.commanderName} down`);
      const down = named(h.emitted, 'voice:say').find((entry) => entry.payload
        && entry.payload.text === `${round.commanderName} down`);
      assert.ok(down, 'the kill line is spoken');
      assert.equal(down.payload.priority, NAMED_KILL_PRIORITY, 'the kill line speaks over a line that is already up');
      survivalAnnounce.destroy();
    } else if (round.kind === 'defend') {
      const beforeEnds = named(h.emitted, 'run:endRequested').length;
      const spawned = tickUntil(h, () => [...h.state.entities.values()].some((entity) => entity
        && entity.alive !== false && entity.data && entity.data.circuitBeacon), 40);
      assert.ok(spawned, 'the beacon takes the field');
      const beacon = [...h.state.entities.values()].find((entity) => entity && entity.data
        && entity.data.circuitBeacon);
      assert.equal(beacon.collides, true, 'the beacon is a body');
      assert.ok(beacon.hull > 0 && beacon.hullMax > 0, 'the beacon can be destroyed');
      assert.notEqual(beacon.physicsBody, false, 'the beacon is not the non-colliding ring mark');
      const aimed = tickUntil(h, () => [...h.state.entities.values()].some((entity) => entity
        && entity.alive !== false && entity.data && entity.data.ai
        && entity.data.ai.focusTargetId === beacon.id), 120);
      assert.ok(aimed, 'the pack re-aims at the beacon');
      if (!(h.state.run.credits > 0)) {
        h.bus.emit('run:awardRequested', { credits: 80, reason: 'circuit_purse' });
      }
      const creditsBefore = h.state.run.credits;
      assert.ok(creditsBefore > 0, 'the purse can be cut');
      beacon.alive = false;
      h.state.entities.delete(beacon.id);
      h.bus.emit('entity:destroyed', { id: beacon.id });
      step(h, 2);
      const receipt = named(h.emitted, 'run:waveCleared').at(-1).payload;
      assert.equal(receipt.completionKind, 'defend');
      assert.equal(named(h.emitted, 'run:endRequested').length, beforeEnds, 'losing the beacon does not end the run');
      const spent = named(h.emitted, 'run:spent').at(-1);
      assert.ok(spent && spent.payload.credits > 0, 'a lost beacon cuts the purse');
      assert.ok(spent.payload.credits <= creditsBefore);
      assert.equal(h.state.run.credits, creditsBefore - spent.payload.credits);
    } else if (round.kind === 'escort') {
      const beforeEnds = named(h.emitted, 'run:endRequested').length;
      const spawned = tickUntil(h, () => [...h.state.entities.values()].some((entity) => entity
        && entity.alive !== false && entity.data && entity.data.circuitEscort), 40);
      assert.ok(spawned, 'the freighter takes the field');
      const freight = [...h.state.entities.values()].find((entity) => entity && entity.data
        && entity.data.circuitEscort);
      assert.equal(freight.type, 'freighter');
      assert.notEqual(freight.id, h.player.id, 'the freighter is not the player ship');
      assert.equal(freight.data.unarmed, true);
      assert.deepEqual(freight.data.weapons, []);
      assert.equal(freight.collides, true);
      assert.ok(freight.hull > 0 && Number.isFinite(freight.hullMax));
      const laneStart = { x: freight.pos.x, z: freight.pos.z };
      const fromShip = Math.hypot(laneStart.x - h.player.pos.x, laneStart.z - h.player.pos.z);
      assert.ok(fromShip >= 80 && fromShip <= 120, 'the lane starts near the ship');
      const before = clearedCount(h);
      assert.ok(tickUntil(h, () => clearedCount(h) > before, 500), 'the freighter arrives');
      const receipt = named(h.emitted, 'run:waveCleared').at(-1).payload;
      assert.equal(receipt.completionKind, 'escort');
      const end = survivalWave._swarm.circuit.laneEnd;
      assert.ok(Math.hypot(freight.pos.x - end.x, freight.pos.z - end.z) < 1, 'it finished on the lane');
      const lane = Math.hypot(end.x - laneStart.x, end.z - laneStart.z);
      assert.ok(lane > 40 && lane < 120, 'the lane stays a short crossing');
      assert.equal(named(h.emitted, 'run:endRequested').length, beforeEnds, 'arrival does not end the run');
      assert.equal(named(h.emitted, 'run:spent').filter((entry) => entry.payload
        && entry.payload.reason === 'circuit_escort_lost').length, 0, 'a living freighter is not a fine');
    } else {
      clearCohortRound(h);
      const receipt = named(h.emitted, 'run:waveCleared').at(-1).payload;
      assert.equal(receipt.completionKind, 'cohort');
    }

    reachDraft(h);
    assert.equal(h.state.run.phase, 'draft');
    const after = circuitFor(h.state.run);
    if (wave % 4 === 0 && wave < CIRCUIT_TOTAL_ROUNDS) {
      assert.equal(after.status, 'route');
      assert.equal(after.clearedStages, wave / 4);
      const choices = circuitChoicesFor(h.state.run);
      assert.equal(choices.filter((entry) => !entry.fight).length, 2, 'each stage offers two ordinary destinations');
      assert.equal(choices.length, 6, 'elite and challenge sit beside them and can be refused');
      const choice = choices.find((entry) => !entry.fight);
      const applied = choose(h, choice.id);
      assert.equal(applied.accepted, true, applied.reason);
      assert.equal(h.state.run.arenaId, choice.arenaId, 'the destination is installed before the next plan');
      routedStages += 1;
    } else if (wave === CIRCUIT_TOTAL_ROUNDS) {
      assert.equal(after.status, 'finale');
      assert.equal(after.clearedStages, 4);
      assert.equal(after.wonAtWave, CIRCUIT_TOTAL_ROUNDS);
      const choices = circuitChoicesFor(h.state.run);
      assert.deepEqual(choices.map((c) => c.kind), ['finish', 'overtime']);
      const finish = choose(h, choices[0].id);
      assert.equal(finish.accepted, true, finish.reason);
      assert.equal(circuitFor(h.state.run).status, 'completed');
      const endRows = named(h.emitted, 'run:endRequested');
      assert.equal(endRows.length, 1, 'Finish asks for exactly one ending');
      assert.equal(endRows[0].payload.outcome, 'victory');
      assert.equal(endRows[0].payload.reason, 'circuit_complete');
      assert.ok(tickUntil(h, () => h.state.run.phase === 'victory', 60), 'the run session lands the victory');
      assert.equal(h.state.run.wave, CIRCUIT_TOTAL_ROUNDS);
      assert.equal(named(h.emitted, 'run:wavePlanned').length, CIRCUIT_TOTAL_ROUNDS,
        'no seventeenth round is planned after Finish');
      break;
    }
    h.bus.emit('run:draftResolved', {});
    if (wave < CIRCUIT_TOTAL_ROUNDS) {
      assert.ok(tickUntil(h, () => h.state.run.phase === 'wave_intro' || h.state.run.phase === 'refit'),
        `wave ${wave + 1} plans`);
      if (h.state.run.phase === 'refit') {
        h.bus.emit('run:refitClosed', {});
        assert.ok(tickUntil(h, () => h.state.run.phase === 'wave_intro'), `wave ${wave + 1} bench closes`);
      }
      assert.equal(h.state.run.wave, wave + 1);
      reachActive(h);
    }
  }

  assert.deepEqual(surviveWaves, [2, 6, 10, 14]);
  assert.deepEqual(bossWaves, [4, 8, 12, 16]);
  assert.equal(routedStages, 3);
  assert.equal(h.state.run.phase, 'victory');
});

test('the surviving cohort carries into the next round and still has to be resolved', () => {
  const h = makeHarness();
  enterCircuit(h);
  reachActive(h);
  // Round one is a cohort; kill it and step into the survive round.
  clearCohortRound(h);
  reachDraft(h);
  advanceFromDraft(h);
  reachActive(h);
  step(h, CIRCUIT_SURVIVE_TICKS + 1);
  const receipt = named(h.emitted, 'run:waveCleared').at(-1).payload;
  assert.ok(receipt.survivors > 0);
  assert.equal(h.state.run.wave, 2);
  reachDraft(h);
  const survivorIds = new Set(survivalWave._cohort.keys());
  assert.equal(survivorIds.size, receipt.survivors, 'every survivor is still on the board');
  advanceFromDraft(h);
  assert.equal(lastPlan(h).swarm.circuit.kind, 'defend');
  assert.equal(lastPlan(h).swarm.killTarget, 0, 'the beacon round is not a kill quota');
  assert.equal(survivalWave._carriedAdmitted, survivorIds.size,
    'the survive survivors are carried into the beacon round');
  reachActive(h);
  const beforeDefend = clearedCount(h);
  assert.ok(tickUntil(h, () => clearedCount(h) > beforeDefend, CIRCUIT_DEFEND_TICKS + 5),
    'the beacon clock closes the round');
  assert.equal(named(h.emitted, 'run:waveCleared').at(-1).payload.completionKind, 'defend');
  assert.equal(named(h.emitted, 'run:waveCleared').at(-1).payload.tick, CIRCUIT_DEFEND_TICKS);
  reachDraft(h);
  const still = new Set(survivalWave._cohort.keys());
  for (const id of survivorIds) assert.ok(still.has(id), 'a survivor of the clock is still in the room');
  advanceFromDraft(h);
  assert.equal(lastPlan(h).swarm.circuit.kind, 'boss');
  assert.ok(lastPlan(h).swarm.killTarget > 0, 'the champion round is a quota again');
  assert.equal(survivalWave._plannedBodies, lastPlan(h).swarm.killTarget + still.size);
  assert.equal(survivalWave._carriedAdmitted, still.size,
    'the carried cohort is stamped as already admitted');
  reachActive(h);
  assert.ok(survivalWave._admittedTotal >= still.size,
    'carried bodies count once when the round goes active');
  const before = clearedCount(h);
  // Kill only the carried survivors: the new cohort still owes its quota.
  for (const id of still) {
    const entity = h.state.entities.get(id);
    if (entity) entity.alive = false;
    h.state.entities.delete(id);
    h.bus.emit('entity:destroyed', { id });
  }
  step(h, 2);
  assert.equal(clearedCount(h), before, 'an unresolved new cohort keeps the round open');
  for (let i = 0; i < 160 && clearedCount(h) === before; i++) {
    killEverything(h);
    step(h, 10);
  }
  assert.ok(clearedCount(h) > before, 'the new cohort then clears');
});

test('death at the boundary is a death, not a surviving-wave award', () => {
  const h = makeHarness();
  useCrucibleMetaStorage(memoryStorage());
  survivalResults.init(h.ctx);
  survivalRewards.init(h.ctx);
  try {
    enterCircuit(h);
    reachActive(h);
    clearCohortRound(h);
    reachDraft(h);
    advanceFromDraft(h);
    reachActive(h);
    step(h, CIRCUIT_SURVIVE_TICKS - 1);
    assert.equal(survivalWave._cursor, 3599);
    assert.equal(h.state.run.phase, 'active');
    const before = clearedCount(h);
    const awardsBefore = named(h.emitted, 'run:awardRequested').length;
    const walletBefore = { credits: h.state.run.credits, score: h.state.run.score, xp: h.state.run.xp };
    h.player.alive = false;
    // Exercise the wave owner's living-player guard on tick 3,600 before the death receipt
    // terminates the run; a terminal phase alone must not hide a missing guard.
    h.state.tick += 1;
    h.state.simTime += DT;
    survivalWave.update(DT);
    assert.equal(clearedCount(h), before, 'a dead pilot cannot earn the boundary clear');
    h.bus.emit('player:death', { cause: 'combat' });
    survivalRun.update(DT);
    step(h, 5);
    assert.equal(clearedCount(h), before, 'a dead pilot never clears the survive round');
    assert.equal(named(h.emitted, 'run:awardRequested').length, awardsBefore,
      'the boundary pays no survival or round-clear reward');
    assert.deepEqual({ credits: h.state.run.credits, score: h.state.run.score, xp: h.state.run.xp }, walletBefore);
    assert.equal(h.state.run.phase, 'ended');
    const ending = named(h.emitted, 'run:endRequested').at(-1).payload;
    assert.equal(ending.outcome, 'defeat');
    assert.equal(ending.reason, 'player_death');
    assert.equal(named(h.emitted, 'run:resultsReady').at(-1).payload.outcome, 'defeat');
  } finally {
    survivalRewards.destroy();
    survivalResults.destroy();
    useCrucibleMetaStorage(null);
  }
});

test('Circuit survival clears at tick 3600 with an advancing clock starting at ten seconds', () => {
  const h = makeHarness();
  enterCircuit(h);
  reachActive(h);
  clearCohortRound(h);
  reachDraft(h);
  advanceFromDraft(h);
  h.state.simTime = 10 - DT;
  reachActive(h);
  assert.equal(survivalWave._waveStartedSimTime, 10);
  const before = clearedCount(h);
  step(h, CIRCUIT_SURVIVE_TICKS - 1);
  assert.equal(clearedCount(h), before);
  step(h);
  assert.equal(clearedCount(h), before + 1, 'tick 3600 clears despite fractional-second rounding');
  const receipt = named(h.emitted, 'run:waveCleared').at(-1).payload;
  assert.equal(receipt.tick, CIRCUIT_SURVIVE_TICKS);
  assert.equal(named(h.emitted, 'run:waveProgress').at(-1).payload.remainingTicks, 0);
  step(h, 5);
  assert.equal(clearedCount(h), before + 1, 'the boundary clears once');
});

test('a finalised Circuit may continue into Overtime as ordinary Swarm', () => {
  const h = makeHarness();
  enterCircuit(h);
  const run = h.state.run;
  const circuit = circuitFor(run);
  Object.assign(circuit, {
    status: 'finale',
    clearedStages: 4,
    wonAtWave: CIRCUIT_TOTAL_ROUNDS,
    revision: 5,
    route: [
      { stage: 1, arenaId: ARENA, nodeId: ARENA },
      { stage: 2, arenaId: 'lagrange_crucible', nodeId: 'lagrange_crucible' },
      { stage: 3, arenaId: 'cryo_drift', nodeId: 'cryo_drift' },
      { stage: 4, arenaId: 'the_hive', nodeId: 'the_hive' },
    ],
  });
  run.telemetry.circuit = circuit;
  run.wave = CIRCUIT_TOTAL_ROUNDS;
  run.phase = 'draft';
  // The fixture skips fifteen rounds, so clear the intro latch the run would normally have
  // cleared on the way into this armory.
  survivalRun._waveIntroHandled = false;
  const credits = h.state.player.credits;
  const overtime = circuitChoicesFor(run).find((choice) => choice.kind === 'overtime');
  assert.ok(overtime, 'Overtime is offered at the finale');
  const applied = choose(h, overtime.id);
  assert.equal(applied.accepted, true, applied.reason);
  assert.equal(circuitFor(h.state.run).status, 'overtime');
  assert.equal(circuitChoicesFor(h.state.run).length, 0, 'no route gate survives Overtime');
  assert.equal(circuitRoundFor(h.state.run, 17), null, 'round 17 is no longer a Circuit round');
  assert.equal(h.state.player.credits, credits, 'Overtime keeps the purse');
  h.bus.emit('run:draftResolved', {});
  assert.ok(tickUntil(h, () => h.state.run.phase === 'wave_intro'), 'round seventeen plans as Swarm');
  assert.equal(h.state.run.wave, 17);
  const plan = lastPlan(h);
  assert.equal(plan.swarm.circuit, undefined, 'the plan carries no Circuit descriptor');
  assert.notEqual(plan.objective.kind, 'survive');
  assert.equal(named(h.emitted, 'run:endRequested').length, 0, 'Overtime is not an ending');
});

// ── 7 — bosses are Circuit champions and wave 10 is not ─────────────────────
test('Circuit boss rounds force their stage champion and wave ten suppresses the cadence boss', () => {
  const run = {
    ruleset: 'swarm', phase: 'draft', wave: 0, arenaId: ARENA,
    telemetry: {
      circuit: {
        version: 1,
        startArenaId: ARENA,
        route: [{ stage: 1, arenaId: ARENA, nodeId: ARENA }],
        clearedStages: 0,
        revision: 2,
        status: 'running',
        wonAtWave: null,
      },
    },
  };
  for (const wave of [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15]) {
    const plan = planWave({
      seed: SEED, arenaId: ARENA, wave, mode: 'swarm', circuitRound: circuitRoundFor(run, wave),
    });
    assert.equal(plan.swarm.requireBoss, false, `wave ${wave} has no cadence champion`);
    assert.equal(plan.swarm.bossId, null);
    const specialObjective = {
      3: 'defend', 5: 'nodes', 7: 'hold', 9: 'collect', 11: 'commander', 13: 'reach', 15: 'escort',
    };
    assert.equal(plan.objective.kind, wave === 2 || wave === 6 || wave === 10 || wave === 14
      ? 'survive' : (specialObjective[wave] || 'resolve_hostiles'));
  }
  for (const wave of [4, 8, 12, 16]) {
    const round = circuitRoundFor(run, wave);
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave, mode: 'swarm', circuitRound: round });
    assert.equal(plan.swarm.requireBoss, true);
    assert.equal(plan.swarm.bossId, CIRCUIT_BOSS_SEQUENCE[round.stage - 1]);
    assert.equal(plan.objective.kind, 'boss');
    const boss = circuitBossFor(round.bossId);
    assert.equal(plan.swarm.bossLabel, boss.label);
    assert.equal(plan.swarm.bossRoom, boss.room);
  }
});

// ── 11 — stale, duplicate, wrong-wave and out-of-phase choices change nothing ─
test('stale and duplicate Circuit requests are refused without moving the run', () => {
  const h = makeHarness();
  const run = openArmory(h);
  assert.equal(choose(h, START_ID).accepted, true);
  const revision = circuitFor(run).revision;
  const stale = choose(h, circuitChoiceId('route', { arenaId: 'the_hive', wave: 4, revision }));
  assert.equal(stale.accepted, false);
  assert.equal(circuitFor(run).revision, revision);

  // A valid-shaped finish while the Circuit is still running is still not on offer.
  const early = choose(h, circuitChoiceId('finish', { wave: 0, revision }));
  assert.equal(early.accepted, false);
  assert.match(early.reason, /no longer available/);

  // Active phase ignores the request entirely.
  h.bus.emit('run:draftResolved', {});
  assert.ok(tickUntil(h, () => h.state.run.phase === 'wave_intro'));
  reachActive(h);
  const before = named(h.emitted, 'run:circuitChoiceApplied').length;
  h.bus.emit('run:circuitChoiceRequested', { offerId: START_ID });
  assert.equal(named(h.emitted, 'run:circuitChoiceApplied').length, before,
    'a choice outside the armory is not even answered');
});

test('a route choice answers once; replaying it is stale', () => {
  const h = makeHarness();
  const run = enterCircuit(h);
  const circuit = circuitFor(run);
  Object.assign(circuit, { status: 'route', clearedStages: 1, revision: 4 });
  run.telemetry.circuit = circuit;
  run.wave = 4;
  run.phase = 'draft';
  const choice = circuitChoicesFor(run)[0];
  const first = choose(h, choice.id);
  assert.equal(first.accepted, true, first.reason);
  const second = choose(h, choice.id);
  assert.equal(second.accepted, false);
  assert.match(second.reason, /no longer available/);
  assert.equal(circuitFor(run).route.find((row) => row.stage === 2).arenaId, choice.arenaId);
  assert.equal(run.arenaId, choice.arenaId);
});

// ── 12 — presentation reads the journey without inventing reproduction ───────
test('presentation names survive rounds, stages, route progress and the finale', () => {
  assert.equal(OBJECTIVE_WORDS.survive, 'SURVIVE');
  assert.equal(objectiveWord('survive'), 'SURVIVE');
  assert.equal(waveCountdownClock(CIRCUIT_SURVIVE_TICKS), '0:60');
  assert.equal(waveCountdownClock(3599), '0:60');

  const run = {
    ruleset: 'swarm', phase: 'draft', wave: 4, arenaId: ARENA,
    telemetry: {
      circuit: {
        version: 1,
        startArenaId: ARENA,
        route: [{ stage: 1, arenaId: ARENA, nodeId: ARENA }],
        clearedStages: 1,
        revision: 4,
        status: 'route',
        wonAtWave: null,
      },
    },
  };
  const panel = circuitPanelLines(run);
  assert.equal(panel.heading, 'The Circuit');
  assert.match(panel.status, /Choose where stage 2 fights/);
  assert.deepEqual(panel.choices.filter((c) => !c.fight).map((c) => c.kind), ['route', 'route']);
  assert.equal(panel.choices.filter((c) => c.fight === 'elite').length, 2);
  assert.equal(panel.choices.filter((c) => c.fight === 'challenge').length, 2);
  const names = panel.choices.map((c) => c.label);
  assert.ok(names.includes(CIRCUIT_DESTINATIONS[2][0].label));
  assert.ok(names.includes(CIRCUIT_DESTINATIONS[2][1].label));
  assert.equal(panel.stages.length, 4);
  assert.equal(panel.stages[0].status, 'complete');
  assert.equal(panel.stages[1].status, 'current');
  assert.ok(panel.stages[0].boss, 'the stage champion is part of the progress row');

  const route = circuitRouteView(run);
  assert.equal(route.stages[0].label, 'Helios Core');
  assert.equal(route.stages[1].label, '—', 'a stage not yet chosen has no destination name');
  assert.equal(route.stages[1].boss.label, circuitBossFor(CIRCUIT_BOSS_SEQUENCE[1]).label);
  assert.equal(route.wonAtWave, null);

  // Route progress is drawn as ORRERY nodes, not a second kind of widget.
  const host = { children: [], appendChild(child) { this.children.push(child); }, textContent: '' };
  const oldDocument = globalThis.document;
  globalThis.document = {
    createElementNS(_ns, tag) {
      return {
        tag, attrs: {}, children: [], textContent: '',
        setAttribute(name, value) { this.attrs[name] = value; },
        appendChild(child) { this.children.push(child); },
      };
    },
  };
  try {
    crucibleDraftScreen._paintCircuitRoute.call({ _circuit: { graphic: host } }, panel.stages);
  } finally {
    globalThis.document = oldDocument;
  }
  assert.equal(host.children.length, 1, 'one route graphic');
  const svgRoot = host.children[0];
  assert.equal(svgRoot.tag, 'svg');
  assert.match(svgRoot.attrs.class, /\borr-svg\b/, 'route svg sits under the ORRERY stroke rules or its lines render invisible');
  const flat = [];
  const walk = (node) => {
    flat.push(node);
    for (const child of node.children || []) walk(child);
  };
  walk(svgRoot);
  const labels = flat.filter((node) => node.tag === 'text').map((node) => node.textContent);
  assert.equal(labels.length, 4);
  assert.match(labels[0], /1 Helios Core/);
  assert.equal(labels[1], '2 —', 'an unchosen stage is a placeholder, not an invented destination');

  const victory = resultHero({ ...circuitFixture(), outcome: 'victory' });
  assert.deepEqual(victory, { number: '16', word: 'rounds · Circuit cleared' });
  const overtime = resultHero({
    ...circuitFixture(), outcome: 'defeat', wave: 19, deepestWave: 19,
    circuit: { ...circuitFixture().circuit, status: 'overtime', wonAtWave: 16 },
  });
  assert.equal(overtime.word, 'rounds · overtime');
  assert.equal(overtime.number, '19');
  assert.equal(resultHero({ ...circuitFixture(), outcome: 'defeat', wave: 9, deepestWave: 9,
    circuit: { ...circuitFixture().circuit, status: 'running', clearedStages: 2, wonAtWave: null } }).word,
    '2 of 4 stages');
});

// ── 13 — the settled row keeps its journey and banks like Swarm ───────────────
test('settlement records a Circuit mode, banks the purse, and leaves ladder bags alone', () => {
  const rules = recordRulesFor(circuitFixture(), {});
  assert.equal(rules.mode, 'swarm_circuit');
  const plain = recordRulesFor({ ...circuitFixture(), circuit: undefined }, {});
  assert.equal(plain.mode, 'swarm');
  assert.notEqual(recordRulesFor(circuitFixture(), {}).mode, plain.mode);

  const compact = compactRunResult(circuitFixture(), {}, []);
  assert.equal(compact.circuit.status, 'completed');
  assert.equal(compact.circuit.clearedStages, 4);
  assert.equal(compact.circuit.wonAtWave, CIRCUIT_TOTAL_ROUNDS);
  assert.deepEqual(JSON.parse(JSON.stringify(compact)), compact);

  const winStorage = memoryStorage();
  const beforeWin = loadCrucibleMeta(winStorage);
  const win = settleCrucibleRun({
    result: { ...circuitFixture(), runId: 'circuit-win' },
    run: {},
    storage: winStorage,
  });
  assert.equal(win.profile.hangar.bounty, beforeWin.hangar.bounty + 80,
    'a completed Circuit banks its earned purse in full');
  assert.deepEqual(win.profile.ladder, beforeWin.ladder, 'the Swarm ladder gains no stars');
  assert.deepEqual(win.profile.crossover, beforeWin.crossover, 'no crossover proof is written');
  assert.deepEqual(win.profile.daily, beforeWin.daily, 'the daily board is not written');
  assert.deepEqual(win.profile.challenges, beforeWin.challenges, 'no daily/weekly payout is claimed');
  assert.deepEqual(recordRulesFor({ ...circuitFixture(), recordRules: rules }, {}), rules,
    'stamping the same Circuit rules again is idempotent');
  assert.equal(win.result.ladderDelta, undefined);
  assert.equal(win.result.crossoverEarned, undefined);

  const deathStorage = memoryStorage();
  const beforeDeath = loadCrucibleMeta(deathStorage);
  const death = settleCrucibleRun({
    result: { ...circuitFixture(), outcome: 'defeat', wave: 12, deepestWave: 12,
      wavesCleared: 12, runId: 'circuit-death',
      circuit: { ...circuitFixture().circuit, status: 'running', clearedStages: 3, wonAtWave: null } },
    storage: deathStorage,
  });
  assert.equal(death.profile.hangar.bounty, beforeDeath.hangar.bounty + 40,
    'a Circuit death still banks half');

  const again = settleCrucibleRun({
    result: { ...circuitFixture(), runId: 'circuit-win' },
    storage: winStorage,
  });
  assert.equal(again.profile.hangar.bounty, win.profile.hangar.bounty,
    'the same settled Circuit run cannot bank twice');

  const persisted = loadCrucibleMeta(winStorage);
  const saved = persisted.history[persisted.history.length - 1];
  assert.equal(saved.circuit.status, 'completed');
  assert.equal(saved.recordRules.mode, 'swarm_circuit');

  const oldStorage = memoryStorage();
  const oldProfile = JSON.parse(JSON.stringify(loadCrucibleMeta(oldStorage)));
  const old = settleCrucibleRun({
    result: circuitFixture({ circuit: undefined, runId: 'plain-swarm' }),
    storage: oldStorage,
  });
  assert.equal(old.result.circuit, undefined, 'an ordinary Swarm run writes no Circuit row');
  assert.equal(oldProfile.schemaVersion, old.profile.schemaVersion);
});

test('a normalized Circuit state never invents progress from a partial object', () => {
  assert.equal(normalizeCircuitState(null), null);
  assert.equal(normalizeCircuitState({ version: 1 }), null, 'no start arena, no journey');
  assert.equal(normalizeCircuitState({ version: 2, startArenaId: ARENA }), null, 'wrong version');
  const corrupt = normalizeCircuitState({
    version: 1,
    startArenaId: ARENA,
    route: [
      { stage: 1, arenaId: ARENA, nodeId: ARENA },
      { stage: 99, arenaId: 'bogus', nodeId: 'bogus' },
      { arenaId: '' },
    ],
    clearedStages: 99,
    revision: -4,
    status: 'invented',
    wonAtWave: 'x',
  });
  assert.equal(corrupt, null, 'progress beyond the route actually walked is rejected, not clamped up');
  const bounded = normalizeCircuitState({
    version: 1,
    startArenaId: ARENA,
    route: [
      { stage: 1, arenaId: ARENA, nodeId: ARENA },
      { stage: 99, arenaId: 'bogus', nodeId: 'bogus' },
      { arenaId: '' },
    ],
    clearedStages: -4,
    revision: -4,
    status: 'invented',
    wonAtWave: 'x',
  });
  assert.equal(bounded, null, 'malformed route rows, negative counts and unknown statuses are refused, not repaired into a live journey');
});

// ── 4 + 5 — both branches at every boundary are real rooms, and wiring installs one ─────────
test('both destinations at every boundary are authored arenas with their own law line', () => {
  const walkedRoute = [{ stage: 1, arenaId: ARENA, nodeId: ARENA }];
  for (const stage of [2, 3, 4]) {
    const destinations = CIRCUIT_DESTINATIONS[stage];
    assert.equal(destinations.length, 2, `stage ${stage} offers exactly two branches`);
    for (const dest of destinations) {
      assert.ok(survivalArenaById(dest.arenaId), `${dest.arenaId} is an existing arena`);
      assert.ok(dest.label && dest.label.length > 0);
      assert.ok(circuitArenaLine(dest.arenaId), `${dest.arenaId} carries its physical-law line`);
      const prior = walkedRoute.slice();
      for (let earlier = 2; earlier < stage; earlier++) {
        const picked = CIRCUIT_DESTINATIONS[earlier][0];
        prior.push({ stage: earlier, arenaId: picked.arenaId, nodeId: picked.nodeId });
      }
      const run = {
        ruleset: 'swarm', phase: 'draft', wave: (stage - 1) * 4, arenaId: ARENA,
        telemetry: {
          circuit: {
            version: 1,
            startArenaId: ARENA,
            route: prior,
            clearedStages: stage - 1,
            revision: 4,
            status: 'route',
            wonAtWave: null,
          },
        },
      };
      const first = circuitChoicesFor(run);
      const second = circuitChoicesFor(run);
      assert.deepEqual(first, second, 'identical state yields identical descriptors');
      assert.equal(first.filter((entry) => !entry.fight).length, 2);
      assert.equal(first.length, 6);
      const choice = first.find((entry) => entry.arenaId === dest.arenaId && !entry.fight);
      assert.ok(choice, `${dest.arenaId} is offered at stage ${stage}`);
      assert.equal(choice.line, dest.line);
      const wave = run.wave + 1;
      const round = circuitRoundFor(run, wave);
      const planA = planWave({ seed: SEED, arenaId: dest.arenaId, wave, mode: 'swarm', circuitRound: round });
      const planB = planWave({ seed: SEED, arenaId: dest.arenaId, wave, mode: 'swarm', circuitRound: round });
      assert.deepEqual(planA, planB, 'identical choices yield identical semantic plans');
      assert.equal(planA.swarm.circuit.stage, stage);
    }
  }
  // Launch + three route choices is the only way to reach the finale: four route entries.
  const finishedRoute = {
    ruleset: 'swarm', phase: 'draft', wave: CIRCUIT_TOTAL_ROUNDS, arenaId: 'the_hive',
    telemetry: {
      circuit: {
        version: 1,
        startArenaId: ARENA,
        route: [
          { stage: 1, arenaId: ARENA, nodeId: ARENA },
          { stage: 2, arenaId: 'lagrange_crucible', nodeId: 'lagrange_crucible' },
          { stage: 3, arenaId: 'cryo_drift', nodeId: 'cryo_drift' },
          { stage: 4, arenaId: 'the_hive', nodeId: 'the_hive' },
        ],
        clearedStages: 4,
        revision: 6,
        status: 'finale',
        wonAtWave: CIRCUIT_TOTAL_ROUNDS,
      },
    },
  };
  assert.equal(circuitFor(finishedRoute).route.length, CIRCUIT_STAGE_COUNT);
  assert.deepEqual(circuitChoicesFor(finishedRoute).map((entry) => entry.kind), ['finish', 'overtime']);
});

test('choosing either alternative installs that room and its law before the next plan', () => {
  for (const dest of CIRCUIT_DESTINATIONS[2]) {
    const h = makeHarness();
    const run = enterCircuit(h);
    run.telemetry.circuit = { ...circuitFor(run), status: 'route', clearedStages: 1, revision: 4 };
    run.wave = 4;
    run.phase = 'draft';
    // The fixture skips the cleanup that would normally clear the intro latch.
    survivalRun._waveIntroHandled = false;
    survivalArena.init(h.ctx);
    const choice = circuitChoicesFor(run).find((entry) => entry.arenaId === dest.arenaId);
    const applied = choose(h, choice.id);
    assert.equal(applied.accepted, true, `${dest.arenaId}: ${applied.reason}`);
    assert.equal(h.state.run.arenaId, dest.arenaId);
    h.bus.emit('run:draftResolved', {});
    assert.ok(tickUntil(h, () => h.state.run.phase === 'wave_intro'), `${dest.arenaId} plans wave five`);
    const installed = named(h.emitted, 'survivalArena:installed').at(-1);
    assert.ok(installed, `${dest.arenaId} installs a room`);
    assert.equal(installed.payload.arenaId, dest.arenaId);
    assert.equal(installed.payload.lawId, dest.arenaId, 'the chosen room keeps its authored law');
    assert.ok(installed.payload.fieldSpecs.length + installed.payload.toySpecs.length > 0,
      `${dest.arenaId} authors physical furniture`);
    assert.equal(lastPlan(h).swarm.circuit.stage, 2);
    survivalArena.destroy();
  }
});

// ── 11 — reset and repeated initialization cannot double-advance ─────────────
test('New Game clears the journey and repeated initialization answers exactly once', () => {
  const h = makeHarness();
  const run = enterCircuit(h);
  run.telemetry.circuit = { ...circuitFor(run), status: 'route', clearedStages: 1, revision: 4 };
  run.wave = 4;
  run.phase = 'draft';
  survivalRun._waveIntroHandled = false;

  // Repeated init must not leave two handlers behind: one request, one receipt, one revision.
  survivalRun.init(h.ctx);
  survivalWave.init(h.ctx);
  survivalDraft.init(h.ctx);
  const choice = circuitChoicesFor(h.state.run)[0];
  const beforeRevision = circuitFor(h.state.run).revision;
  const beforeReceipts = named(h.emitted, 'run:circuitChoiceApplied').length;
  const applied = choose(h, choice.id);
  assert.equal(applied.accepted, true, applied.reason);
  assert.equal(circuitFor(h.state.run).revision, beforeRevision + 1, 'exactly one advance');
  assert.equal(named(h.emitted, 'run:circuitChoiceApplied').length, beforeReceipts + 1);

  // New Game discards the run; a stale replay writes nothing and answers nothing.
  runSession.newGame();
  const receipts = named(h.emitted, 'run:circuitChoiceApplied').length;
  h.bus.emit('run:circuitChoiceRequested', { offerId: choice.id });
  assert.equal(named(h.emitted, 'run:circuitChoiceApplied').length, receipts);
  assert.equal(circuitFor(h.state.run), null, 'a fresh run carries no Circuit');
  assert.equal(h.state.run.phase, 'inactive');
});

// ── 12 — finale controls, objective preview, and no false reproduction claim ──
test('the panel shows finale controls and the coming objective without a share code', () => {
  const run = {
    ruleset: 'swarm', phase: 'draft', wave: CIRCUIT_TOTAL_ROUNDS, arenaId: 'the_hive',
    telemetry: {
      circuit: {
        version: 1,
        startArenaId: ARENA,
        route: [
          { stage: 1, arenaId: ARENA, nodeId: ARENA },
          { stage: 2, arenaId: 'lagrange_crucible', nodeId: 'lagrange_crucible' },
          { stage: 3, arenaId: 'cryo_drift', nodeId: 'cryo_drift' },
          { stage: 4, arenaId: 'the_hive', nodeId: 'the_hive' },
        ],
        clearedStages: 4,
        revision: 6,
        status: 'finale',
        wonAtWave: CIRCUIT_TOTAL_ROUNDS,
      },
    },
  };
  const finale = circuitPanelLines(run);
  assert.match(finale.status, /Finish the Circuit/);
  assert.equal(finale.next, null, 'the finale owes a choice, not a next-round preview');
  assert.deepEqual(finale.choices.map((choice) => choice.kind), ['finish', 'overtime']);
  assert.match(finale.choices[0].line, /Bank the run/);
  assert.match(finale.choices[1].line, /endless Swarm/);

  const survive = circuitPanelLines({
    ...run,
    wave: 5,
    telemetry: { circuit: { ...run.telemetry.circuit, route: run.telemetry.circuit.route.slice(0, 2),
      clearedStages: 1, status: 'running', wonAtWave: null } },
  });
  assert.match(survive.next, /survive sixty seconds/);
  assert.equal(survive.choices.length, 0);

  assert.equal(buildShareBand(circuitFixture()), null,
    'a Circuit result makes no reproduction claim the run code cannot honour');
});

test('Circuit choice controls are native buttons and activate through the draft-pick intent', () => {
  const makeNode = (tag) => ({
    tag, className: '', textContent: '', title: '', hidden: false, type: '',
    dataset: {}, attrs: {}, children: [], listeners: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; },
    addEventListener(name, fn) { this.listeners[name] = fn; },
  });
  const oldDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => makeNode(tag) };
  const emitted = [];
  try {
    const list = makeNode('ul');
    const screen = { _circuit: { choices: list } };
    const choices = circuitChoicesFor({
      ruleset: 'swarm', phase: 'draft', wave: 4, arenaId: ARENA,
      telemetry: {
        circuit: {
          version: 1, startArenaId: ARENA,
          route: [{ stage: 1, arenaId: ARENA, nodeId: ARENA }],
          clearedStages: 1, revision: 4, status: 'route', wonAtWave: null,
        },
      },
    });
    crucibleDraftScreen._paintCircuitChoices.call(screen, {
      bus: { emit: (event, payload) => emitted.push({ event, payload }) },
    }, choices);
    assert.equal(list.children.length, choices.length);
    assert.equal(choices.filter((choice) => !choice.fight).length, 2);
    for (const [index, item] of list.children.entries()) {
      const button = item.children[0];
      assert.equal(button.tag, 'button');
      assert.equal(button.type, 'button', 'a real button keeps native Enter/Space activation');
      assert.equal(button.dataset.circuitChoice, 'route');
      assert.equal(button.title, choices[index].line);
      assert.ok(button.textContent.length > 0, 'the destination name is visible');
      assert.equal(item.children[1].tag, 'span');
      assert.equal(item.children[1].textContent, choices[index].line,
        'the physical-law line is visible before commitment');
      button.listeners.click();
    }
    assert.deepEqual(emitted.map((row) => row.event), choices.map(() => 'run:draftPickRequested'));
    assert.deepEqual(emitted.map((row) => row.payload.offerId), choices.map((choice) => choice.id));
  } finally {
    globalThis.document = oldDocument;
  }
});

// ── 8 — a living champion keeps its boss round open ─────────────────────────
test('a living stage champion prevents completion; the round clears when it dies', () => {
  const h = makeHarness();
  enterCircuit(h);
  reachActive(h);
  clearCohortRound(h);
  reachDraft(h);
  advanceFromDraft(h);
  reachActive(h);
  step(h, CIRCUIT_SURVIVE_TICKS + 1);
  reachDraft(h);
  advanceFromDraft(h);
  reachActive(h);
  clearCohortRound(h);
  reachDraft(h);
  advanceFromDraft(h);
  reachActive(h);
  const plan = lastPlan(h);
  assert.equal(plan.swarm.requireBoss, true);
  assert.equal(h.state.run.wave, 4);
  assert.ok(tickUntil(h, () => survivalWave._bossIds.size > 0, 400), 'the champion is on the board');
  const bossId = [...survivalWave._bossIds][0];
  const boss = h.state.entities.get(bossId);
  assert.ok(boss, 'the champion body is live');
  const before = clearedCount(h);
  for (const entity of [...h.state.entities.values()]) {
    if (entity.id === h.player.id || entity.id === boss.id || !entity.alive) continue;
    entity.alive = false;
    h.state.entities.delete(entity.id);
    h.bus.emit('entity:destroyed', { id: entity.id });
  }
  step(h, 20);
  assert.equal(clearedCount(h), before, 'chaff deaths cannot end the champion round');
  boss.alive = false;
  h.state.entities.delete(boss.id);
  h.bus.emit('entity:destroyed', { id: boss.id });
  clearCohortRound(h);
  assert.ok(clearedCount(h) > before, 'the champion dies and the round clears');
});

// ── 11 — a route-owed launch and a wrong-wave id are refused ────────────────
test('a null launch and a wrong-wave choice cannot skip the destination gate', () => {
  const h = makeHarness();
  survivalDraft.init(h.ctx);
  const run = enterCircuit(h);
  run.telemetry.circuit = { ...circuitFor(run), status: 'route', clearedStages: 1, revision: 4 };
  run.wave = 4;
  run.phase = 'draft';
  survivalRun._waveIntroHandled = false;
  const resolvedBefore = named(h.emitted, 'run:draftResolved').length;
  h.bus.emit('run:draftPickRequested', { offerId: null });
  assert.equal(h.state.run.phase, 'draft', 'a null pick cannot launch past an owed route');
  assert.equal(named(h.emitted, 'run:draftResolved').length, resolvedBefore);
  assert.match(survivalDraft._notice, /Choose a destination/);

  const wrongWave = circuitChoiceId('route', { arenaId: 'lagrange_crucible', wave: 5, revision: 4 });
  h.bus.emit('run:draftPickRequested', { offerId: wrongWave });
  assert.equal(h.state.run.phase, 'draft');
  assert.equal(circuitFor(h.state.run).status, 'route');
  assert.equal(h.state.run.arenaId, ARENA, 'a wrong-wave id writes no destination');
  assert.match(survivalDraft._notice, /no longer available/);
});

// Round 1 regressions: exercise the normal refresh path, not just the choice painter.
function withDraftDom(h, callback) {
  const oldDocument = globalThis.document;
  const node = (tag = 'div') => ({
    tag, className: '', dataset: {}, attrs: {}, children: [], hidden: false, style: {}, listeners: {},
    classList: { toggle() {}, add() {}, remove() {} },
    set textContent(value) { this.text = value; this.children = []; },
    get textContent() { return this.text || this.children.map(child => child.textContent).join(''); },
    setAttribute(key, value) { this.attrs[key] = String(value); },
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    append(...children) { children.forEach(child => this.appendChild(child)); },
    insertBefore(child, before) {
      const index = this.children.indexOf(before);
      assert.ok(index >= 0);
      this.children.splice(index, 0, child);
      child.parentNode = this;
      return child;
    },
    addEventListener(key, fn) { this.listeners[key] = fn; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    focus() {},
  });
  globalThis.document = { createElement: node };
  const screen = Object.create(crucibleDraftScreen);
  for (const key of ['root', 'cards', 'title', 'filters', 'refitBtn', 'sub', 'preview',
    'note', 'skip', 'rerollBtn', 'wallet', 'hint']) screen[`_${key}`] = node();
  screen._reading = null;
  screen._visualArmory = null;
  screen._category = 'All';
  screen._clipRailToWholeRows = () => {};
  screen._circuit = Object.fromEntries(['el', 'status', 'graphic', 'route', 'next', 'choices']
    .map(key => [key, node()]));
  const ctx = { ...h.ctx, registry: { get: () => ({
    currentOffers: () => [], currentWave: () => h.state.run.wave,
    lastNotice: () => survivalDraft.lastNotice(),
  }) } };
  try { callback(screen, ctx); } finally { globalThis.document = oldDocument; }
}

test('Circuit choices occupy bounded space inside the shopping stage', () => {
  const h = makeHarness();
  openArmory(h);
  withDraftDom(h, (screen, ctx) => {
    screen.mount(screen._root, ctx);
    try {
      const panel = screen._circuit.el;
      const stage = screen._regions.stage;
      assert.equal(panel.parentNode, stage);
      assert.equal(panel.className.split(' ').includes('k-stage'), false);
      assert.equal(screen._root.children.filter(child => child.className.split(' ').includes('k-stage')).length, 1);
      assert.ok(stage.children.indexOf(panel) < stage.children.indexOf(screen._filters));
      assert.ok(stage.children.includes(screen._cards), 'shopping remains in the same column');
      assert.equal(panel.style.maxHeight, '40%', 'Circuit choices reserve a bounded share of the shelf');
      assert.equal(panel.style.overflow, 'auto', 'long destination choices remain scrollable');
      assert.equal(panel.hidden, false);
      assert.match(panel.textContent, /Start Circuit/);
    } finally { screen.dispose(); }
  });
});

test('normal opening screen refresh exposes Start Circuit and its button enters through draft-pick', () => {
  const h = makeHarness();
  survivalDraft.init(h.ctx);
  const run = openArmory(h);
  const before = JSON.stringify({ credits: run.credits, ships: h.state.player.ownedShips });
  withDraftDom(h, (screen, ctx) => {
    screen.refresh(ctx);
    assert.equal(screen._circuit.el.hidden, false);
    const button = screen._circuit.choices.children[0]?.children[0];
    assert.ok(button, 'refresh renders the opening choice without Circuit telemetry');
    assert.equal(button.tag, 'button');
    assert.match(button.textContent, /Start Circuit/);
    button.listeners.click();
    assert.equal(named(h.emitted, 'run:draftPickRequested').at(-1).payload.offerId, START_ID);
    assert.equal(circuitFor(run).status, 'running');
    assert.equal(run.phase, 'draft');
    assert.equal(JSON.stringify({ credits: run.credits, ships: h.state.player.ownedShips }), before);
    screen.refresh(ctx);
    assert.match(screen._circuit.status.textContent, /Stage 1/);
    assert.equal(screen._circuit.choices.hidden, true, 'accepted entry is no longer offered');
  });
});

test('Circuit record keys include the ordered route and remain identical when stamped repeatedly', () => {
  const first = circuitFixture();
  const second = circuitFixture({ circuit: { ...first.circuit,
    route: first.circuit.route.map(row => row.stage === 2
      ? { stage: 2, arenaId: 'cinder_sluice', nodeId: 'cinder_sluice' } : row),
  } });
  assert.notEqual(recordKey(first), recordKey(second));
  const rules = recordRulesFor(first);
  assert.equal(rules.circuit.version, 1);
  assert.equal(rules.circuit.startArenaId, ARENA);
  assert.deepEqual(rules.circuit.route, first.circuit.route);
  assert.deepEqual(recordRulesFor({ ...first, recordRules: rules }), rules);
  assert.deepEqual(recordRulesFor({ recordRules: rules }), rules, 'stamp-only records retain route identity');
  assert.equal(recordKey({ ...first, recordRules: rules }), recordKey(first));
});

test('inconsistent Circuit completion and broken routes cannot bank a victory or enter ordinary bags', () => {
  const valid = circuitFixture().circuit;
  const cases = [
    { ...valid, route: valid.route.slice(0, 1), clearedStages: 0, wonAtWave: null },
    { ...valid, wonAtWave: null },
    { ...valid, clearedStages: 3 },
    { ...valid, route: [valid.route[0], valid.route[2], valid.route[3]] },
    { ...valid, startArenaId: 'cinder_sluice' },
    { ...valid, route: valid.route.map(row => row.stage === 2 ? { ...row, arenaId: 'the_hive' } : row) },
    { ...valid, route: [...valid.route, valid.route[3]] },
    { ...valid, status: 'running', wonAtWave: null },
  ];
  for (const [index, circuit] of cases.entries()) {
    assert.equal(normalizeCircuitState(circuit), null, `malformed completion ${index}`);
    const storage = memoryStorage();
    const before = loadCrucibleMeta(storage);
    const settled = settleCrucibleRun({
      result: circuitFixture({ circuit, cashOut: true, runId: `invalid-${index}` }), storage,
    });
    assert.equal(settled.result.bankedBounty, 0, `invalid Circuit ${index} cannot cash out`);
    assert.equal(settled.result.recordRules.circuit, 'invalid');
    assert.equal(buildShareBand(settled.result), null, 'invalid Circuit never advertises ordinary replay');
    assert.match(resultHero(settled.result).word, /Circuit data invalid/);
    for (const key of ['ladder', 'daily', 'challenges', 'crossover']) {
      assert.deepEqual(settled.profile[key], before[key], `${key} remains isolated`);
    }
  }
});

test('malformed active Circuit visibly refuses entry and launch instead of falling back to Swarm', () => {
  const h = makeHarness();
  survivalDraft.init(h.ctx);
  const run = openArmory(h);
  run.telemetry.circuit = { version: 1 };
  const before = JSON.stringify(run.telemetry.circuit);
  assert.deepEqual(circuitChoicesFor(run), [], 'invalid telemetry cannot offer Start again');
  h.bus.emit('run:draftPickRequested', { offerId: null });
  assert.match(survivalDraft.lastNotice(), /Circuit.*invalid/i);
  assert.equal(run.phase, 'draft');
  withDraftDom(h, (screen, ctx) => {
    screen.refresh(ctx);
    assert.equal(screen._circuit.el.hidden, false);
    assert.match(screen._circuit.status.textContent, /Circuit.*invalid/i);
    assert.equal(screen._circuitGate(ctx), true);
    assert.equal(screen._skip.attrs['aria-disabled'], 'true');
    assert.equal(screen._preview.hidden, true, 'no ordinary preview for a damaged Circuit');
  });
  h.bus.emit('run:draftResolved', {});
  step(h, 3);
  assert.equal(run.phase, 'draft', 'a direct resolution receipt cannot bypass the native guard');
  assert.equal(JSON.stringify(run.telemetry.circuit), before);
  useCrucibleMetaStorage(memoryStorage());
  try {
    survivalResults.init(h.ctx);
    h.bus.emit('run:endRequested', { outcome: 'aborted', reason: 'invalid_circuit', tick: 0 });
    const result = named(h.emitted, 'run:resultsReady').at(-1).payload;
    assert.equal(result.recordRules.mode, 'swarm_circuit');
    assert.equal(result.recordRules.circuit, 'invalid');
    assert.match(resultHero(result).word, /Circuit data invalid/);
    assert.equal(buildShareBand(result), null);
  } finally {
    survivalResults.destroy();
    useCrucibleMetaStorage(null);
  }
});






