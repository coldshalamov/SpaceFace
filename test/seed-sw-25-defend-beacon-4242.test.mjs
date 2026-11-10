// SEED-SW-25 — stage one, round three defends a real beacon. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { waveOpeningLine } from '../src/systems/survivalAnnounce.js';
import {
  CIRCUIT_DEFEND_TICKS,
  CIRCUIT_SURVIVE_TICKS,
  circuitChoiceId,
  circuitRoundFor,
} from '../src/systems/survivalCircuit.js';

const DT = 1 / 60;
const SEED = 4242;
const ARENA = 'helios_core';
const START_ID = circuitChoiceId('start', { wave: 0, revision: 1 });

function makeHarness() {
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
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 400, z: 0 }, type: 'ship', hull: 100, hullMax: 100 };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  raw.on('entity:destroyed', (payload) => budget.releaseEntity(payload && payload.id));
  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalWave.init(ctx);
  survivalRun.init(ctx);
  return { state, bus, emitted, player };
}

function named(h, event) {
  return h.emitted.filter((entry) => entry.event === event);
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

function killHostiles(h) {
  const killed = [];
  for (const entity of [...h.state.entities.values()]) {
    if (entity.id === h.player.id) continue;
    if (entity.data && entity.data.circuitBeacon) continue;
    if (!entity.alive) continue;
    entity.alive = false;
    h.state.entities.delete(entity.id);
    killed.push(entity.id);
  }
  for (const id of killed) h.bus.emit('entity:destroyed', { id });
}

function clearCohort(h) {
  const before = named(h, 'run:waveCleared').length;
  for (let i = 0; i < 160; i++) {
    killHostiles(h);
    step(h, 10);
    if (named(h, 'run:waveCleared').length > before) return;
  }
  assert.fail('the cohort never resolved');
}

function reachDefend(h) {
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA,
  });
  h.bus.emit('run:transitionRequested', { expectedPhase: 'loadout', nextPhase: 'draft', reason: 't', tick: 0 });
  h.bus.emit('run:circuitChoiceRequested', { offerId: START_ID });
  h.bus.emit('run:draftResolved', {});
  assert.ok(tickUntil(h, () => h.state.run.phase === 'wave_intro'), 'round one plans');
  h.bus.emit('run:waveIntroComplete', {});
  assert.ok(tickUntil(h, () => h.state.run.phase === 'active'), 'round one starts');
  assert.equal(circuitRoundFor(h.state.run, 1).kind, 'cohort');
  clearCohort(h);
  assert.ok(tickUntil(h, () => h.state.run.phase === 'draft', 400), 'the armory opens');
  h.bus.emit('run:draftResolved', {});
  assert.ok(tickUntil(h, () => h.state.run.phase === 'wave_intro'), 'the survive round plans');
  h.bus.emit('run:waveIntroComplete', {});
  assert.ok(tickUntil(h, () => h.state.run.phase === 'active'), 'the survive round starts');
  assert.equal(circuitRoundFor(h.state.run, 2).kind, 'survive');
  const before = named(h, 'run:waveCleared').length;
  step(h, CIRCUIT_SURVIVE_TICKS);
  assert.equal(named(h, 'run:waveCleared').length, before + 1, 'survive ends on its clock');
  assert.ok(tickUntil(h, () => h.state.run.phase === 'draft', 400), 'the armory opens after survive');
  h.bus.emit('run:draftResolved', {});
  assert.ok(tickUntil(h, () => h.state.run.phase === 'wave_intro'), 'the defend round plans');
  h.bus.emit('run:waveIntroComplete', {});
  assert.ok(tickUntil(h, () => h.state.run.phase === 'active'), 'the defend round starts');
  assert.equal(h.state.run.wave, 3);
  assert.equal(circuitRoundFor(h.state.run, 3).kind, 'defend');
}

function beaconOf(h) {
  return [...h.state.entities.values()].find((entity) => entity && entity.data && entity.data.circuitBeacon);
}

test('seed 4242: the beacon lasts the authored clock and the run continues', () => {
  const h = makeHarness();
  reachDefend(h);
  const planRows = named(h, 'run:wavePlanned');
  const plan = planRows[planRows.length - 1].payload.plan;
  assert.equal(plan.swarm.killTarget, 0);
  assert.equal(plan.objective.kind, 'defend');
  assert.equal(plan.completionRules.durationTicks, CIRCUIT_DEFEND_TICKS);
  assert.match(waveOpeningLine(3, plan), /Defend the beacon/);
  const spawned = tickUntil(h, () => {
    const beacon = beaconOf(h);
    return beacon && beacon.alive !== false;
  }, 20);
  assert.ok(spawned, 'a beacon is on the field');
  const beacon = beaconOf(h);
  assert.equal(beacon.collides, true);
  assert.ok(beacon.hull > 0 && Number.isFinite(beacon.hullMax));
  const before = named(h, 'run:waveCleared').length;
  const endsBefore = named(h, 'run:endRequested').length;
  while (survivalWave._cursor < CIRCUIT_DEFEND_TICKS - 1) step(h, 1);
  assert.equal(named(h, 'run:waveCleared').length, before, 'the clock has not finished');
  assert.equal(beaconOf(h).alive, true);
  step(h, 1);
  assert.equal(named(h, 'run:waveCleared').length, before + 1);
  const receipt = named(h, 'run:waveCleared').at(-1).payload;
  assert.equal(receipt.completionKind, 'defend');
  assert.equal(receipt.tick, CIRCUIT_DEFEND_TICKS);
  assert.equal(named(h, 'run:spent').length, 0, 'a living beacon does not cut the purse');
  assert.equal(named(h, 'run:endRequested').length, endsBefore, 'the run does not end');
  assert.equal(h.state.run.phase === 'ended', false);
});

test('seed 4242: a dead beacon cuts the purse and ends the round early', () => {
  const h = makeHarness();
  reachDefend(h);
  assert.ok(tickUntil(h, () => beaconOf(h), 20), 'the beacon spawns');
  const beacon = beaconOf(h);
  const aimed = tickUntil(h, () => [...h.state.entities.values()].some((entity) => entity
    && entity.alive !== false && entity.id !== beacon.id && entity.data && entity.data.ai
    && entity.data.ai.focusTargetId === beacon.id), 120);
  assert.ok(aimed, 'hostiles are pointed at the beacon');
  h.bus.emit('run:awardRequested', { credits: 100, reason: 'circuit_purse' });
  assert.equal(h.state.run.credits, 100);
  const endsBefore = named(h, 'run:endRequested').length;
  const clearedBefore = named(h, 'run:waveCleared').length;
  beacon.hull = 0;
  beacon.alive = false;
  h.state.entities.delete(beacon.id);
  h.bus.emit('entity:destroyed', { id: beacon.id });
  step(h, 1);
  assert.equal(named(h, 'run:waveCleared').length, clearedBefore + 1);
  const receipt = named(h, 'run:waveCleared').at(-1).payload;
  assert.equal(receipt.completionKind, 'defend');
  assert.ok(receipt.tick < CIRCUIT_DEFEND_TICKS, 'death ends the round before the clock');
  const spent = named(h, 'run:spent').at(-1);
  assert.ok(spent, 'the purse is cut through the spend seam');
  assert.equal(spent.payload.credits, 40);
  assert.equal(spent.payload.reason, 'circuit_beacon_lost');
  assert.equal(h.state.run.credits, 60);
  assert.equal(named(h, 'run:endRequested').length, endsBefore);
  const endless = circuitRoundFor({ ruleset: 'swarm', phase: 'active', wave: 30 }, 30);
  assert.equal(endless, null, 'endless swarm has no defend round');
});
