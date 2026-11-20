// FIX-05 — Swarm leaks and the boss bar's one truth.
//   1. createAftermathChoicePrompt is gated at the source with isSwarmGlass: the
//      AFTERMATH / FIELD RESPONSE card never mounts inside a live Swarm round.
//      Adventure is unchanged.
//   2. swarm:bossHp is the boss bar's one truth — pooled hull across every champion
//      body, and a census change (alive/total) emits even at an unchanged fraction.
//      The freeze the receipt caught had a second half: survivalResults stamped an
//      unknown top-level `run.recentKillerLabels`, validateRunState rejected the run
//      envelope, and every liveSwarmRun consumer (swarmJuice included) went deaf
//      mid-fight. The ledger rides `run.telemetry` now.
//   3. The pause flight brief and the OFFICIAL DENIAL scenario toast are gated with
//      isSwarmGlass at their owners.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState, validateRunState } from '../src/core/runState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { runSession } from '../src/systems/runSession.js';
import { swarmJuice } from '../src/systems/swarmJuice.js';
import { survivalResults } from '../src/systems/survivalResults.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { attackerLabel } from '../src/combat/playerDefeat.js';
import { createAftermathChoicePrompt } from '../src/ui/aftermathChoicePrompt.js';
import { pauseStatusLines } from '../src/ui/screens/pause.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';

const DT = 1 / 60;

function swarmRun(wave = 10) {
  const run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: 4242 });
  run.phase = 'active';
  run.wave = wave;
  return run;
}

// ── 1. The field-response card stays in Adventure ────────────────────────────

function promptHarness(run) {
  const state = {
    mode: 'flight',
    run,
    simTime: 10,
    tick: 600,
    world: { currentSectorId: 'sector_tethys_junction' },
    entities: new Map(),
    player: {},
    ui: {},
  };
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(1, player);
  state.playerId = 1;
  const bus = createBus();
  const calls = [];
  const deck = {
    offerDecision(spec) { calls.push({ offered: spec }); return true; },
    resolveDecision(id) { calls.push({ resolved: id }); return true; },
    updateDecision(id) { calls.push({ updated: id }); return true; },
  };
  const prompt = createAftermathChoicePrompt({ bus, state, deck });
  const offer = {
    sectorId: 'sector_tethys_junction',
    custody: [{ entityId: 9 }],
    choices: [
      { id: 'salvage', label: 'Salvage the wreck', context: 'Wreck available' },
      { id: 'escape', label: 'Leave the field', context: 'Leave the field' },
    ],
  };
  return { state, bus, deck, calls, prompt, offer };
}

test('the AFTERMATH / FIELD RESPONSE card never mounts inside a live Swarm round', () => {
  const h = promptHarness(swarmRun(10));
  assert.equal(h.prompt.show(h.offer), false, 'the source gates the offer');
  assert.equal(h.calls.filter((c) => c.offered).length, 0, 'no deck card minted');
  assert.ok(h.calls.some((c) => c.resolved === 'aftermath:field'),
    'a stale card is resolved out, not left mounted');
  // The bus path is the same gate: a recorded field cannot queue the card either.
  h.bus.emit('combat:aftermathChoices', h.offer);
  h.bus.emit('combat:outcome', {
    entityId: 9, sectorId: 'sector_tethys_junction', killerId: 1,
    outcome: 'killed',
  });
  h.bus.emit('combat:aftermathChoices', h.offer);
  assert.equal(h.calls.filter((c) => c.offered).length, 0, 'no card through the bus path');
  h.prompt.destroy();
});

test('the same offer still mounts in Adventure — sender, headline, verbs intact', () => {
  const h = promptHarness(null);
  assert.equal(h.prompt.show(h.offer), true);
  const spec = h.calls.filter((c) => c.offered).at(-1).offered;
  assert.equal(spec.id, 'aftermath:field');
  assert.equal(spec.sender, 'WRECK FOUND');
  assert.equal(spec.headline, 'CHOOSE A RESPONSE');
  assert.deepEqual(spec.choices.map((c) => c.id), ['salvage', 'escape']);
  h.prompt.destroy();
});

// ── 2. One boss-bar truth ────────────────────────────────────────────────────

function bootJuice(wave) {
  const state = createGameState(9);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const player = {
    id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship',
    hull: 200, hullMax: 200,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.simTime = 0;
  const ctx = { state, bus, helpers: {}, timeEffects: createTimeEffects(state) };
  runSession.init(ctx);
  swarmJuice.init(ctx);
  state.run = swarmRun(wave);
  return { state, bus, emitted };
}

function spawnAce(h, wave, { hull = 200, hullMax = 200, alive = true } = {}) {
  const body = {
    id: h.state.nextEntityId++, alive, type: 'ship', pos: { x: 40, z: 0 },
    hull, hullMax,
    data: {
      runCohort: SURVIVAL_COHORT_TAG, runWave: wave, swarmChampion: true,
      stuntThreat: { baseScore: 120, credits: 4 },
    },
  };
  h.state.entities.set(body.id, body);
  h.state.entityList.push(body);
  return body;
}

function bossHpEmissions(h) {
  return h.emitted.filter((e) => e.event === 'swarm:bossHp').map((e) => e.payload);
}

function advance(h, ticks = 1) {
  for (let i = 0; i < ticks; i++) {
    h.state.simTime += DT;
    swarmJuice.update(DT, h.state);
  }
}

test('a five-ace wing publishes pooled hull and the census on every change', () => {
  const h = bootJuice(10);
  h.state.run.phase = 'wave_intro';
  h.bus.emit('run:wavePlanned', { wave: 10, plan: {} });
  h.state.run.phase = 'active';
  const wing = [
    spawnAce(h, 10), spawnAce(h, 10), spawnAce(h, 10), spawnAce(h, 10), spawnAce(h, 10),
  ];
  advance(h, 20); // the collector sweeps on its 15-tick cadence
  let hps = bossHpEmissions(h);
  assert.ok(hps.length >= 1, 'the bar publishes once the wing is found');
  assert.equal(hps.at(-1).name, 'Corsair Wing');
  assert.equal(hps.at(-1).wave, 10);
  assert.equal(hps.at(-1).alive, 5);
  assert.equal(hps.at(-1).total, 5);
  assert.ok(Math.abs(hps.at(-1).frac - 1) < 0.001, 'full wing, full bar');

  // Kill a full-health ace: the pooled fraction re-norms to an identical 1.0, so the
  // OLD emit gate dropped this frame while the card's 5/5 → 4/5 should have moved.
  const before = hps.length;
  wing[4].alive = false;
  h.bus.emit('entity:killed', {
    id: wing[4].id, killerId: h.state.playerId, type: 'ship', pos: { x: 40, z: 0 },
    presentation: { cause: 'direct' },
  });
  advance(h);
  hps = bossHpEmissions(h);
  assert.ok(hps.length > before, 'a census change emits even at an unchanged fraction');
  assert.equal(hps.at(-1).alive, 4);
  assert.equal(hps.at(-1).total, 5);
  assert.ok(Math.abs(hps.at(-1).frac - 1) < 0.001, 'the survivors are still at full hull');

  // Damage two bodies: pooled hull drops, the census holds.
  wing[0].hull = 100;
  wing[1].hull = 150;
  advance(h);
  hps = bossHpEmissions(h);
  assert.equal(hps.at(-1).alive, 4);
  assert.ok(Math.abs(hps.at(-1).frac - ((100 + 150 + 200 + 200) / 800)) < 0.001,
    `pooled over the living (${hps.at(-1).frac})`);

  // A champion felled between sweeps still counts toward the census — its entity ref
  // stays in the ledger even after the world reaps it.
  wing[3].alive = false;
  h.state.entities.delete(wing[3].id);
  const ghost = spawnAce(h, 10, { alive: false, hull: 0 }); // dead before the sweep
  assert.ok(ghost.alive === false);
  advance(h, 20);
  hps = bossHpEmissions(h);
  assert.equal(hps.at(-1).total, 6, 'a pre-scan casualty still counts toward the wing');

  // The last aces falling says BOSS DOWN once.
  for (const body of [wing[0], wing[1], wing[2], ghost]) {
    body.alive = false;
    h.bus.emit('entity:killed', {
      id: body.id, killerId: h.state.playerId, type: 'ship', pos: { x: 40, z: 0 },
      presentation: { cause: 'direct' },
    });
  }
  advance(h);
  const downs = h.emitted.filter((e) => e.event === 'swarm:bossDown');
  assert.equal(downs.length, 1);
  assert.equal(downs[0].payload.name, 'Corsair Wing');
  swarmJuice.destroy();
});

test('a live straggler holds the wing alive; a champion felled uncollected still says BOSS DOWN', () => {
  const h = bootJuice(10);
  h.state.run.phase = 'wave_intro';
  h.bus.emit('run:wavePlanned', { wave: 10, plan: {} });
  h.state.run.phase = 'active';
  const wing = [spawnAce(h, 10), spawnAce(h, 10)];
  advance(h, 20); // both collected by the sweep
  const late = spawnAce(h, 10); // lands after the sweeps — uncollected
  for (const body of wing) {
    body.alive = false;
    h.bus.emit('entity:killed', {
      id: body.id, killerId: h.state.playerId, type: 'ship', pos: { x: 40, z: 0 },
      presentation: { cause: 'direct' },
    });
  }
  advance(h);
  let downs = h.emitted.filter((e) => e.event === 'swarm:bossDown');
  assert.equal(downs.length, 0, 'a live champion the sweep missed is swept at kill time');
  assert.equal(bossHpEmissions(h).at(-1).alive, 1, 'the straggler joined the census');
  late.alive = false;
  h.state.entities.delete(late.id);
  h.bus.emit('entity:killed', {
    id: late.id, killerId: h.state.playerId, type: 'ship', pos: { x: 40, z: 0 },
    presentation: { cause: 'direct' },
  });
  advance(h);
  downs = h.emitted.filter((e) => e.event === 'swarm:bossDown');
  assert.equal(downs.length, 1, 'the last champion falling says BOSS DOWN once');
  swarmJuice.destroy();
});

test('a champion killed inside the first scan window still counts and still says BOSS DOWN', () => {
  const h = bootJuice(10);
  h.state.run.phase = 'wave_intro';
  h.bus.emit('run:wavePlanned', { wave: 10, plan: {} });
  h.state.run.phase = 'active';
  const ace = spawnAce(h, 10);
  advance(h, 2); // never reaches the 15-tick sweep
  ace.alive = false;
  h.bus.emit('entity:killed', {
    id: ace.id, killerId: h.state.playerId, type: 'ship', pos: { x: 40, z: 0 },
    presentation: { cause: 'direct' },
  });
  advance(h, 20);
  const downs = h.emitted.filter((e) => e.event === 'swarm:bossDown');
  assert.equal(downs.length, 1, 'BOSS DOWN even though no sweep ever collected the ace');
  const hps = bossHpEmissions(h);
  assert.equal(hps.at(-1).alive, 0, 'the census reads 0, not the intro seed');
  assert.equal(hps.at(-1).total, 1);
  swarmJuice.destroy();
});

test('a labelled kill cannot invalidate the run envelope mid-fight', () => {
  const h = bootJuice(10);
  const results = Object.create(survivalResults);
  results.init({ state: h.state, bus: h.bus, helpers: {} });
  const ace = spawnAce(h, 10);
  assert.equal(validateRunState(h.state.run).ok, true, 'the run starts valid');
  h.bus.emit('entity:killed', {
    id: ace.id, killerId: 77, type: 'ship', pos: { x: 40, z: 0 },
    presentation: { cause: 'direct' },
  });
  assert.equal(validateRunState(h.state.run).ok, true,
    'the recent-killer ledger cannot poison validateRunState');
  const ledger = h.state.run.telemetry && h.state.run.telemetry.recentKillerLabels;
  assert.ok(ledger && ledger[String(ace.id)], 'the label is banked on telemetry');
  // The reader: the body is reaped, the name survives for the defeat receipt.
  ace.alive = false;
  h.state.entities.delete(ace.id);
  assert.equal(attackerLabel(h.state, ace.id), ledger[String(ace.id)].label);
  results.destroy();
  swarmJuice.destroy();
});

// ── 3. Pause brief and world news stay in Adventure ──────────────────────────

function contract47aMission() {
  return {
    id: 'mission-47a', title: 'Contract 47-A: Mass Variance Sample',
    type: 'salvage_retrieval', status: 'active',
    objectiveProgress: 0, objectiveTarget: 1,
    params: { scenarioId: '47a' },
  };
}

test('the pause brief shows the Swarm round, never the Adventure contract', () => {
  const state = {
    run: swarmRun(10),
    missions: { active: [contract47aMission()] },
    ui: { trackedMissionId: 'mission-47a' },
    simTime: 30, tick: 1800,
    playerId: 1,
    entities: new Map(),
  };
  const lines = pauseStatusLines(state);
  assert.ok(!/Contract 47-A/.test(lines.objective), `objective: ${lines.objective}`);
  assert.ok(!/Contract 47-A/.test(lines.next || ''), `next: ${lines.next}`);
  assert.ok(/ROUND 10/.test(lines.objective), `the brief names the round (${lines.objective})`);
});

test('the same tracked mission still owns the Adventure pause brief', () => {
  const state = {
    run: null,
    missions: { active: [contract47aMission()] },
    ui: { trackedMissionId: 'mission-47a' },
    simTime: 30, tick: 1800,
    playerId: 1,
    entities: new Map(),
  };
  const lines = pauseStatusLines(state);
  assert.ok(/TRACKED · Contract 47-A/.test(lines.objective), `objective: ${lines.objective}`);
});

test('a paused Swarm Circuit names the rule that closes it, not the pack', () => {
  const state = {
    run: swarmRun(10),
    missions: { active: [contract47aMission()] },
    ui: { trackedMissionId: 'mission-47a' },
    simTime: 30, tick: 1800,
    playerId: 1,
    entities: new Map(),
  };
  state.run.telemetry = { circuit: { kind: 'escort', stage: 2, localRound: 3 } };
  const lines = pauseStatusLines(state);
  assert.ok(/Escort the freighter\./.test(lines.next), `next: ${lines.next}`);
  state.run.telemetry = { circuit: { kind: 'survive', stage: 1, localRound: 1 } };
  assert.ok(/Survive sixty seconds\./.test(pauseStatusLines(state).next), 'survive names its clock');
  state.run.telemetry = {};
  assert.ok(/Break the pack\./.test(pauseStatusLines(state).next), 'an ordinary round closes the pack, the announcer word');
});

test('a scenario beat mints no OFFICIAL DENIAL cue inside a live Swarm round', () => {
  const emitted = [];
  const orch = Object.create(presentationOrchestrator);
  orch._emitCue = (cueId, payload, meta) => { emitted.push({ cueId, payload, meta }); };
  const beat = {
    scenarioId: '47a', beatId: 'beat_denial',
    presentationEventIds: ['scenario.comms.denial'],
  };
  orch.state = { run: swarmRun(10), scenario: {} };
  orch._onScenarioBeat(beat);
  assert.equal(emitted.length, 0, 'no scenario cue (toast, audio, caption) inside Swarm');
  orch.state = { run: null, scenario: {} };
  orch._onScenarioBeat(beat);
  assert.equal(emitted.length, 1, 'Adventure still emits the cue');
  assert.equal(emitted[0].cueId, 'scenario.comms.denial');
});
