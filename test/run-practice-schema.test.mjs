// A queued Best Line practice run must stay a valid run envelope. Before `practice` joined the
// runState schema, survivalRun stamped `run.practice = true` at run:started and every later
// validateRunState read (liveSurvivalRun, runSession._liveRun) failed on the unknown key: the
// machine froze at loadout and run:endRequested was ignored, stranding the launch.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState, validateRunState } from '../src/core/runState.js';
import { runSession } from '../src/systems/runSession.js';
import {
  SURVIVAL_ARENA_INTRO_TICKS,
  SURVIVAL_WAVE_INTRO_TICKS,
  survivalRun,
} from '../src/systems/survivalRun.js';
import { clearQueuedChallenge, queuePracticeRun } from '../src/systems/survivalMutators.js';
import { loadCrucibleMeta, settleCrucibleRun, useCrucibleMetaStorage } from '../src/systems/survivalRecords.js';
import { clearCrucibleSetup } from '../src/ui/crucibleLaunch.js';
import { crucibleResultsScreen, crucibleScreen } from '../src/ui/screens/crucible.js';
import { mountScreen, textLines } from './helpers/fake-dom.mjs';

const DT = 1 / 60;

function boot(seed) {
  const state = createGameState(seed);
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
  runSession.init({ state, bus });
  survivalRun.init({ state, bus });
  return { state, bus, emitted };
}

function tick(n = 1) {
  for (let i = 0; i < n; i++) survivalRun.update(DT);
}

function beginSurvival(bus, seed) {
  bus.emit('run:beginRequested', {
    kind: 'survival',
    ruleset: 'scored',
    seed,
    arenaId: 'helios_core',
  });
}

test('a queued practice run stays valid, walks to active, and can still end', () => {
  const { state, bus, emitted } = boot(7);
  queuePracticeRun();
  beginSurvival(bus, 7);

  assert.equal(state.run.phase, 'loadout');
  assert.equal(state.run.practice, true);
  assert.equal(validateRunState(state.run).ok, true);

  bus.emit('run:loadoutReady', {});
  tick(1);
  tick(SURVIVAL_ARENA_INTRO_TICKS);
  tick(SURVIVAL_WAVE_INTRO_TICKS);

  assert.equal(state.run.phase, 'active');
  assert.equal(state.run.wave, 1);
  assert.equal(state.run.practice, true, 'the flag survives transition clone-commits');
  assert.equal(emitted.filter((e) => e.event === 'run:wavePlanned').length, 1);

  bus.emit('run:endRequested', { outcome: 'defeat', reason: 'probe', tick: 9 });
  assert.equal(state.run.phase, 'ended');
  assert.equal(state.run.result.outcome, 'defeat');
  assert.equal(state.run.practice, true, 'the settlement record still reads the practice flag');
});

test('an ordinary run carries practice:false and validates', () => {
  const { state, bus } = boot(11);
  clearQueuedChallenge();
  beginSurvival(bus, 11);
  assert.equal(state.run.practice, false);
  assert.equal(validateRunState(state.run).ok, true);
});

test('a non-boolean practice value is rejected by the envelope contract', () => {
  const run = createRunState({ kind: 'survival', seed: 5 });
  run.practice = 'yes';
  const verdict = validateRunState(run);
  assert.equal(verdict.ok, false);
  assert.ok(verdict.issues.some((issue) => issue.startsWith('practice:')));
});

test('Best Line and same-seed Retry stay out of ranked records and payouts across worker boot', async () => {
  const seed = 4242;
  const arenaId = 'helios_core';
  const saved = new Map();
  const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  useCrucibleMetaStorage(storage);
  const lane = createSimHost();
  const door = Object.create(crucibleScreen);
  const debrief = Object.create(crucibleResultsScreen);
  const oldDocument = globalThis.document;
  try {
    const record = settleCrucibleRun({ storage, result: {
      outcome: 'defeat', seed, ruleset: 'swarm', arenaId, score: 100,
      bestLine: { points: 50, seed, acts: [{ episodeId: 'practice-line', trickId: 'bolas', name: 'Bolas',
        tick: 180, evidence: [{ kind: 'collision', victimLifeId: 'life:1' }] }] },
    } });
    assert.ok(record.profile.bestLines.length, 'the previous run earned an actual saved Best Line');
    const match = mountScreen(door, { ctx: { state: createGameState(seed) } });
    const click = (mounted, label) => {
      const button = mounted.buttons.find(b => b.textContent === label);
      assert.ok(button, `missing action ${label}`);
      globalThis.document = mounted.doc;
      try { button.listeners.click[0](); } finally { globalThis.document = oldDocument; }
    };
    click(match, 'Practice this line');
    click(match, 'Launch Swarm');
    const bootRequest = (mounted) => {
      const receipt = mounted.emitted.find(e => e.event === 'game:new');
      assert.ok(receipt, 'launch must use the normal New Game request');
      return structuredClone(receipt.payload);
    };
    const original = bootRequest(match);
    const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url)));
    const init = await lane.init({ profile: 'production', seed, scenarioContract });
    const { state, registry } = lane.host;
    let tick = 0;
    let ackEnd = init.initRebuild?.end ?? 0;
    async function send(commands, steps = 0) {
      const ring = createSimCommandRing();
      for (const command of commands) pushLaneCommand(ring, command);
      const reply = await lane.tick({ tick: ++tick, steps, ackEnd, commands: ring.drain() });
      ackEnd = reply.rebuild?.end ?? ackEnd;
      return reply;
    }
    async function prepare(opts, practice) {
      clearQueuedChallenge(); // The worker does not see UI module globals.
      const reply = await send([{ kind: 'mode', mode: 'loading' },
        { kind: 'rpc', id: 'practice-boot', op: 'newGameBoot', args: { opts } }]);
      assert.equal(reply.rpcAcks.find(r => r.id === 'practice-boot')?.ok, true);
      assert.equal(state.run.practice, practice);
      assert.equal(state.run.seed, seed);
      assert.equal(state.run.phase, 'draft', 'preparing the first round still uses the ordinary armory');
    }
    async function finishPractice() {
      await send([{ kind: 'mode', mode: 'flight' },
        { kind: 'busEmit', emit: 'run:draftPickRequested', payload: { offerId: null } }], SURVIVAL_WAVE_INTRO_TICKS + 2);
      assert.equal(state.run.phase, 'active');
      assert.equal(state.run.wave, 1);
      await send([{ kind: 'domEvent', d: { type: 'keydown', code: 'KeyW', pressed: true } }], 1);
      registry.get('runSession').award({ score: 700, credits: 80, reason: 'practice_fixture' });
      const earnedScore = state.run.score;
      assert.ok(earnedScore > 100, 'the attempt earns enough score to challenge the existing record');
      registry.get('combat').kill(state.entities.get(state.playerId), null, { context: 'collision_terrain' });
      const owner = registry.get('survivalResults');
      const result = owner.lastResult();
      assert.equal(result.stopReason, 'player_death');
      assert.equal(result.recordRules.mode, 'practice');
      assert.equal(result.score, earnedScore, 'the attempt still reports its own score');
      assert.equal(result.bankedBounty, 0);
      assert.equal(result.cabinetEntryId, undefined);
      return owner;
    }

    await prepare(original, true);
    const owner = await finishPractice();
    const plate = mountScreen(debrief, { ctx: { state }, registryGet: name => name === 'survivalResults' ? owner : null });
    const debriefCopy = textLines(plate.root).join(' ');
    assert.match(debriefCopy, /Practice run\. No ranked score or rewards\./);
    assert.doesNotMatch(debriefCopy, /Defeat banks/);
    click(plate, 'Run it again — same seed');
    const retry = bootRequest(plate);
    assert.deepEqual(retry.crucibleSetup.survivalSetup, original.crucibleSetup.survivalSetup);
    await prepare(retry, true);
    assert.equal(state.run.score, 0, 'Retry starts a fresh practice attempt');
    await finishPractice();

    const profile = loadCrucibleMeta(storage);
    assert.deepEqual(profile.cabinet, record.profile.cabinet);
    assert.deepEqual(profile.hangar, record.profile.hangar);
    assert.deepEqual(profile.ladder, record.profile.ladder);
    assert.deepEqual(profile.records.lifetime, record.profile.records.lifetime);
    for (const [key, ranked] of Object.entries(record.profile.records.byKey)) {
      assert.deepEqual(profile.records.byKey[key], ranked, 'practice cannot replace the earned record');
    }

    const ordinaryDoor = Object.create(crucibleScreen);
    try {
      const ordinary = mountScreen(ordinaryDoor, { ctx: { state: createGameState(seed) } });
      click(ordinary, 'Launch Swarm');
      await prepare(bootRequest(ordinary), false);
    } finally { ordinaryDoor.dispose(); }
  } finally {
    lane.shutdown();
    door.dispose();
    debrief.dispose();
    useCrucibleMetaStorage(null);
    clearQueuedChallenge();
    clearCrucibleSetup();
  }
});
