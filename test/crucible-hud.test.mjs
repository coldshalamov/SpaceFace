// Survival run readout — the figures a player reads while flying, and the census behind them.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { RUN_PHASES, runXpForLevel } from '../src/core/runState.js';
import {
  PRODUCTION_INIT_ORDER,
  PRODUCTION_UPDATE_ORDER,
  SYSTEM_CAPABILITIES,
} from '../src/runtime/authoritativeSystemManifest.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { survivalRun, SURVIVAL_ARENA_INTRO_TICKS, SURVIVAL_WAVE_INTRO_TICKS } from '../src/systems/survivalRun.js';
import { waveOpeningLine } from '../src/systems/survivalAnnounce.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';
import { collectWaveHullDecodeKeys } from '../src/world/presentationSources.js';
import {
  PHASE_WORDS,
  arenaLabel,
  circuitMarkGlyph,
  phaseWord,
  objectiveWord,
  earnLine,
  heroManeuverHudCue,
  levelProgress,
  survivalHud,
  threatCensus,
} from '../src/ui/survivalHud.js';

const DT = 1 / 60;
const ARENA = 'helios_core';
const SEED = 7;

class HudTestNode {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.style = {};
    this.dataset = {};
    this.hidden = false;
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  appendChild(child) { child.parentNode = this; child.isConnected = true; this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter((entry) => entry !== child); child.parentNode = null; child.isConnected = false; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
}

function withHudDocument(fn) {
  const previous = globalThis.document;
  const body = new HudTestNode('body');
  const head = new HudTestNode('head');
  const findById = (root, id) => root.children.find((child) => child.attributes.id === id)
    || root.children.map((child) => findById(child, id)).find(Boolean);
  globalThis.document = {
    body, head,
    querySelector: () => null,
    getElementById: (id) => findById(body, id) || findById(head, id) || null,
    createElement: (tagName) => new HudTestNode(tagName),
  };
  try { return fn(); }
  finally {
    survivalHud.destroy();
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

function boot(seed = SEED) {
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
  const budget = makeBudgetApi(state);
  const spawned = [];
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: { x: spec.pos.x, z: spec.pos.z } };
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
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));

  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalWave.init(ctx);
  survivalRun.init(ctx);
  survivalHud.init(ctx);
  return { state, bus, emitted, helpers, budget, spawned, ctx, player };
}

function tick(harness, n = 1) {
  for (let i = 0; i < n; i++) {
    survivalWave.update(DT);
    survivalRun.update(DT);
    survivalHud.update(DT, harness.state);
  }
}

function reachActive(harness) {
  harness.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: ARENA });
  harness.bus.emit('run:loadoutReady', {});
  tick(harness, 1);
  tick(harness, SURVIVAL_ARENA_INTRO_TICKS);
  tick(harness, SURVIVAL_WAVE_INTRO_TICKS);
  return harness.state.run;
}

test('every visible run phase has a word a player can read — no raw phase ids on the glass', () => {
  for (const phase of RUN_PHASES) {
    // 'inactive' hides the readout entirely, so it needs no word.
    if (phase === 'inactive') continue;
    assert.equal(typeof PHASE_WORDS[phase], 'string', `${phase} has a word`);
    assert.ok(PHASE_WORDS[phase].length > 0);
    assert.ok(!PHASE_WORDS[phase].includes('_'), `${phase} word is not the id`);
  }
  // Even a phase this file has never heard of renders as words, not as an id.
  assert.equal(phaseWord('some_future_phase'), 'SOME FUTURE PHASE');
  assert.equal(phaseWord(null), 'RUN');
});

test('a boss or elite wave says which it is instead of reading as an ordinary fight', () => {
  assert.equal(objectiveWord('boss'), 'BOSS');
  assert.equal(objectiveWord('elite_hunt'), 'ELITE');
  // The ordinary case stays null on purpose: the phase word already says FIGHT, and a second
  // label saying the same thing is noise.
  assert.equal(objectiveWord('resolve_hostiles'), null);
  assert.equal(objectiveWord('something_new'), null, 'an unknown objective invents no label');
  assert.equal(objectiveWord(undefined), null);
});

test('the arena label is derived, so a new arena needs no edit here', () => {
  assert.equal(arenaLabel('helios_core'), 'HELIOS CORE');
  assert.equal(arenaLabel('ceres_belt'), 'CERES BELT');
  assert.equal(arenaLabel(null), 'ARENA');
});

test('the threat census reports how many are still out there', () => {
  assert.deepEqual(threatCensus({ threatBudget: 6, spawnedThreat: 6, resolvedThreat: 2 }),
    { alive: 4, total: 6, remaining: 4, resolved: 2 });
  // A wave still owing bodies counts them: 6 planned, 4 admitted so far, 1 dead -> 5 to go.
  assert.equal(threatCensus({ threatBudget: 6, spawnedThreat: 4, resolvedThreat: 1 }).remaining, 5);
  // Nothing negative, ever.
  assert.equal(threatCensus({ threatBudget: 0, spawnedThreat: 0, resolvedThreat: 9 }).remaining, 0);
  assert.equal(threatCensus(null).remaining, 0);
});

test('level progress is a real fraction of the current level band', () => {
  assert.equal(levelProgress({ xp: 0, level: 1 }), 0);
  assert.equal(levelProgress({ xp: runXpForLevel(2), level: 2 }), 0);
  const mid = levelProgress({ xp: Math.round((runXpForLevel(2) + runXpForLevel(3)) / 2), level: 2 });
  assert.ok(mid > 0.4 && mid < 0.6, `midpoint reads as ${mid}`);
  assert.equal(levelProgress(null), 0);
});

test('an earn receipt names what was earned, and says nothing when nothing was', () => {
  assert.equal(earnLine({ credits: 2, score: 10, xp: 3 }), '+2 CR   +10 SCORE   +3 XP');
  assert.equal(earnLine({ credits: 0, score: 25, xp: 0 }), '+25 SCORE');
  assert.equal(earnLine({ credits: 0, score: 0, xp: 0 }), null);
  assert.equal(earnLine(null), null);
});

test('Hero HUD cue follows the fitted move and worker projection without sim internals', () => {
  const state = {
    mode: 'flight', run: { kind: 'survival', phase: 'active' },
    player: { ownedShips: [{ fittings: ['mod_pinball_rush'] }] }, playerId: 7,
    entities: new Map([[7, { alive: true }]]),
    heroManeuverReadModel: { mode: 'pinball', phase: 'ready', status: 'armed',
      text: 'ready · Needle · 28 cap', targetName: 'Needle' },
  };
  const pinball = heroManeuverHudCue(state);
  assert.equal(pinball.mode, 'pinball');
  assert.equal(pinball.status, 'armed');
  assert.match(pinball.text, /PINBALL RUSH.*hold \/ release.*ready · Needle/);
  assert.doesNotMatch(pinball.text, /lock a live hostile/,
    'the main-side HUD uses the worker readiness projection, not private targets');
  state.heroManeuverReadModel.status = 'blocked';
  state.heroManeuverReadModel.text = '';
  state.heroManeuverReadModel.reason = 'face_clear_approach';
  assert.match(heroManeuverHudCue(state).text, /face clear approach/,
    'an alignment refusal is readable instead of leaking an internal enum');

  state.player.ownedShips[0].fittings = ['mod_boomerang_run'];
  state.heroManeuverReadModel = { mode: 'boomerang', phase: 'bank', status: 'armed',
    targetName: 'Needle', attackCommitted: false, energyRequired: 196.2 };
  const bank = heroManeuverHudCue(state);
  assert.equal(bank.mode, 'boomerang');
  assert.match(bank.text, /Needle.*physical bank.*bomb reserved/);
  assert.match(bank.text, /197 cap budget/,
    'active readiness shows the full phase-return and bank-dash budget, not the phase reserve alone');
  state.heroManeuverReadModel = { mode: 'boomerang', phase: 'attack_region_missed', status: 'blocked',
    targetName: 'Needle', text: 'attack region missed · no bomb released', energyRequired: 196.2 };
  const missed = heroManeuverHudCue(state);
  assert.match(missed.text, /Needle.*attack region missed.*no bomb released.*197 cap budget/);
  assert.doesNotMatch(missed.text, /4\/Y start/,
    'a terminal result does not look like a fresh activation prompt');

  state.player.ownedShips[0].fittings = ['mod_veil_step'];
  state.heroManeuverReadModel = { mode: 'veil_step', phase: 'aiming', status: 'armed',
    text: '84 WU · release to step', distance: 84, validLanding: true,
    veil: { phase: 'aiming', status: 'armed', text: '84 WU · release to step', validLanding: true } };
  const veil = heroManeuverHudCue(state);
  assert.equal(veil.mode, 'veil_step');
  assert.equal(veil.status, 'armed');
  assert.match(veil.text, /VEIL STEP.*84 WU.*release to step/);
  assert.equal(heroManeuverHudCue({ mode: 'flight', run: { kind: 'adventure' } }), null);
});

test('the wave census reaches state.run through runSession, written by nobody else', () => {
  const harness = boot();
  const run = reachActive(harness);
  assert.equal(run.phase, 'active');
  // Wave 1 is six waspers; all six admitted, none dead yet.
  assert.equal(run.threatBudget, 6);
  assert.equal(run.spawnedThreat, 6);
  assert.equal(run.resolvedThreat, 0);
  assert.equal(threatCensus(run).remaining, 6);

  // Kill two the way core's sweep reports it.
  const cohort = harness.spawned.slice(0, 2);
  for (const entity of cohort) {
    entity.alive = false;
    harness.state.entities.delete(entity.id);
    harness.bus.emit('entity:destroyed', { id: entity.id });
  }
  assert.equal(harness.state.run.resolvedThreat, 2);
  assert.equal(threatCensus(harness.state.run).remaining, 4);
});

test('a recycled entity id never drops a live hostile out of the wave census', () => {
  // core recycles a dead body's id immediately but queues its entity:destroyed to end of tick, so
  // a batch dispatched the same tick can be handed that id. Acting on the stale receipt would
  // shrink the census by a body that is alive and shooting — and could clear the wave.
  const harness = boot();
  reachActive(harness);
  const victim = harness.spawned[0];
  const recycledId = victim.id;

  // The old body dies and its id is immediately reissued to a fresh cohort hostile...
  victim.alive = false;
  harness.state.entities.delete(recycledId);
  const replacement = {
    id: recycledId, alive: true, type: 'ship', team: 1, pos: { x: 10, z: 10 },
    data: { runCohort: 'survival', runWave: 1, runRole: 'mass', level: 1 },
  };
  harness.state.entities.set(recycledId, replacement);

  // ...and only THEN does the old body's queued receipt arrive.
  harness.bus.emit('entity:destroyed', { id: recycledId });

  assert.equal(harness.state.run.resolvedThreat, 0, 'the live occupant was not counted as dead');
  assert.equal(threatCensus(harness.state.run).remaining, 6, 'still six hostiles to fight');

  // When the replacement itself dies for real, the receipt lands normally.
  replacement.alive = false;
  harness.state.entities.delete(recycledId);
  harness.bus.emit('entity:destroyed', { id: recycledId });
  assert.equal(harness.state.run.resolvedThreat, 1);
});

test('a starved wave never asks the player to kill bodies that were never admitted', () => {
  const harness = boot();
  // Ambient traffic holds every slot, so wave 1 admits nothing.
  harness.budget.request(harness.budget.max(), 'ambient-flood');
  const run = reachActive(harness);
  assert.equal(harness.spawned.length, 0);
  assert.equal(run.spawnedThreat, 0);
  assert.equal(run.threatBudget, 0, 'the refused bodies left the census');
  assert.equal(threatCensus(run).remaining, 0);
});

test('the readout is a strict no-op headless and outside a live survival run', () => {
  const harness = boot();
  assert.equal(typeof document, 'undefined', 'this test runs without a DOM');
  for (let i = 0; i < 200; i++) {
    assert.doesNotThrow(() => survivalHud.update(DT, harness.state));
  }
  reachActive(harness);
  for (let i = 0; i < 200; i++) {
    assert.doesNotThrow(() => survivalHud.update(DT, harness.state));
  }
  // It reads; it never writes.
  const before = JSON.stringify(harness.state.run);
  for (let i = 0; i < 50; i++) survivalHud.update(DT, harness.state);
  assert.equal(JSON.stringify(harness.state.run), before);
});

test('wave plan projection preserves the live Swarm quota, hull runway, and main HUD readout', () => {
  const original = planWave({ seed: 4242, arenaId: ARENA, wave: 3, ruleset: 'swarm' });
  assert.equal(original.error, undefined);
  const wire = projectBridgeEvent('run:wavePlanned', { wave: 3, tick: 91, plan: original });
  assert.equal(wire.dropped, false);
  assert.equal(wire.reason, 'adapter');
  assert.equal(wire.flat.plan.swarm.killTarget, 26);
  assert.equal(wire.flat.plan.objective.population, 'ships');
  assert.equal(waveOpeningLine(3, wire.flat.plan), waveOpeningLine(3, original),
    'the main-side opening copy retains its authored objective and arrival wording');
  assert.deepEqual(
    collectWaveHullDecodeKeys(wire.flat.plan).map((row) => row.key),
    collectWaveHullDecodeKeys(original).map((row) => row.key),
    'projected schedule, packages, and roster retain every required authored hull identity',
  );
  assert.equal(wire.flat.plan.swarm.roster[0].weight, undefined,
    'the bounded bridge carries hull identity, not the planner roster ledger');

  withHudDocument(() => {
    const state = createGameState(SEED);
    state.mode = 'flight';
    state.entities = new Map();
    state.entityList = [];
    state.run = { kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 3,
      arenaId: ARENA, score: 0, credits: 0, level: 1,
      threatBudget: 26, spawnedThreat: 26, resolvedThreat: 0 };
    const bus = createBus();
    survivalHud.init({ state, bus });
    bus.emit('run:wavePlanned', wire.flat);
    survivalHud.update(DT, state);
    assert.equal(survivalHud._dom.threatWord.textContent, 'HOSTILE SHIPS');
    assert.equal(survivalHud._dom.threatFig.textContent, '26 / 26');
    state.run.resolvedThreat = 1;
    survivalHud.update(DT, state);
    assert.equal(survivalHud._dom.threatFig.textContent, '25 / 26');
  });
});

test('late cohort progress restores the ship-count HUD while a circuit timer stays timed', () => {
  withHudDocument(() => {
    const state = createGameState(SEED);
    state.mode = 'flight';
    state.entities = new Map();
    state.entityList = [];
    state.run = { kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 3,
      arenaId: ARENA, score: 0, credits: 0, level: 1,
      threatBudget: 26, spawnedThreat: 26, resolvedThreat: 0 };
    const bus = createBus();
    survivalHud.init({ state, bus });
    survivalHud.update(DT, state);
    assert.equal(survivalHud._dom.threatWord.textContent, 'HOSTILE SHIPS',
      'a positive projected cohort budget is enough while the plan event is still late');
    bus.emit('run:waveProgress', { wave: 3, completionKind: 'cohort', remaining: 26, total: 26 });
    survivalHud.update(DT, state);
    assert.equal(survivalHud._dom.threatWord.textContent, 'HOSTILE SHIPS');

    const timed = planWave({ seed: 4242, arenaId: ARENA, wave: 1, ruleset: 'swarm',
      circuitRound: { stage: 1, localRound: 2, kind: 'survive' } });
    assert.equal(timed.error, undefined);
    const projected = projectBridgeEvent('run:wavePlanned', { wave: 1, tick: 92, plan: timed });
    assert.equal(projected.dropped, false);
    assert.equal(projected.flat.plan.objective.kind, 'survive');
    assert.equal(projected.flat.plan.swarm.circuit.kind, 'survive');
    assert.equal(projected.flat.plan.swarm.killTarget, 0);
    assert.equal(projected.flat.plan.swarm.circuit.localRound, 2);
    state.run.wave = 1;
    bus.emit('run:wavePlanned', projected.flat);
    bus.emit('run:waveProgress', { wave: 1, completionKind: 'duration', durationTicks: 3600, remainingTicks: 3540 });
    survivalHud.update(DT, state);
    assert.equal(survivalHud._dom.threatWord.textContent, 'SURVIVE');
    assert.equal(survivalHud._dom.threatFig.textContent, '0:59',
      'the cohort fallback must not turn a circuit clock into a kill quota');
  });
});

test('boss wave projection preserves the announced champion and its renderer hull identity', () => {
  const original = planWave({ seed: 4242, arenaId: ARENA, wave: 10, ruleset: 'swarm' });
  const projected = projectBridgeEvent('run:wavePlanned', { wave: 10, tick: 600, plan: original });
  assert.equal(projected.dropped, false);
  assert.equal(projected.flat.plan.objective.kind, 'boss');
  assert.equal(projected.flat.plan.swarm.boss, true);
  assert.equal(projected.flat.plan.swarm.bossLabel, original.swarm.bossLabel);
  assert.equal(projected.flat.plan.swarm.bossLine, original.swarm.bossLine);
  assert.equal(projected.flat.plan.swarm.bossScoreId, original.swarm.bossScoreId);
  assert.deepEqual(
    collectWaveHullDecodeKeys(projected.flat.plan).map((row) => row.key),
    collectWaveHullDecodeKeys(original).map((row) => row.key),
  );
});

test('hold and reach circuit markers retain their coordinates and point the HUD the same way', () => {
  const player = { pos: { x: 0, z: 0 } };
  const cases = [
    { kind: 'hold', field: 'zone', marker: { x: 100, z: 0, radius: 44 }, expected: '←' },
    { kind: 'reach', field: 'gate', marker: { x: 0, z: 120, radius: 30 }, expected: '↑' },
  ];
  for (const [index, item] of cases.entries()) {
    const original = planWave({ seed: 4242, arenaId: ARENA, wave: 1, ruleset: 'swarm',
      circuitRound: { stage: 2, localRound: index ? 4 : 3, kind: item.kind, [item.field]: item.marker } });
    assert.equal(original.error, undefined);
    const projected = projectBridgeEvent('run:wavePlanned', { wave: 1, tick: 120 + index, plan: original });
    assert.equal(projected.dropped, false);
    assert.deepEqual(projected.flat.plan.swarm.circuit[item.field], item.marker);
    const originalGlyph = circuitMarkGlyph(player, original.swarm.circuit[item.field]);
    const projectedGlyph = circuitMarkGlyph(player, projected.flat.plan.swarm.circuit[item.field]);
    assert.equal(originalGlyph, item.expected);
    assert.equal(projectedGlyph, originalGlyph);
  }
});

test('the readout is registered as a DOM-guarded sim system, after the phase machine', () => {
  assert.ok(PRODUCTION_INIT_ORDER.includes('survivalHud'), 'in init order');
  const hud = PRODUCTION_UPDATE_ORDER.indexOf('survivalHud');
  assert.ok(hud >= 0, 'in update order');
  assert.ok(hud > PRODUCTION_UPDATE_ORDER.indexOf('survivalRun'), 'after the phase machine');
  assert.ok(hud > PRODUCTION_UPDATE_ORDER.indexOf('survivalWave'), 'after the wave owner');
  assert.deepEqual(SYSTEM_CAPABILITIES.survivalHud,
    { nodeSafe: true, phase: 'sim', capability: 'hud', domGuarded: true });
});
