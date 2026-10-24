// SEED-SW-30 — stage four, round three escorts one unarmed freighter. Seed 4242.
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
  CIRCUIT_ESCORT_SPEED,
  CIRCUIT_SURVIVE_TICKS,
  circuitChoiceId,
  circuitChoicesFor,
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
  const player = {
    id: state.nextEntityId++, alive: true, pos: { x: 400, z: 0 }, type: 'ship', hull: 100, hullMax: 100,
  };
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

function cleared(h) {
  return named(h, 'run:waveCleared').length;
}

function killIds(h, ids) {
  for (const id of ids) {
    const entity = h.state.entities.get(id);
    if (entity) entity.alive = false;
    h.state.entities.delete(id);
    h.bus.emit('entity:destroyed', { id });
  }
}

function killHostiles(h) {
  const ids = [];
  for (const entity of h.state.entities.values()) {
    if (entity.id === h.player.id) continue;
    if (entity.data && (entity.data.circuitBeacon || entity.data.circuitEscort || entity.data.circuitMark)) continue;
    if (entity.alive === false) continue;
    ids.push(entity.id);
  }
  killIds(h, ids);
}

function clearCohort(h) {
  const before = cleared(h);
  for (let i = 0; i < 160; i++) {
    killHostiles(h);
    step(h, 10);
    if (cleared(h) > before) return;
  }
  assert.fail('the cohort never resolved');
}

function finishSpecial(h, kind) {
  if (kind === 'survive') {
    const before = cleared(h);
    step(h, CIRCUIT_SURVIVE_TICKS);
    assert.equal(cleared(h), before + 1, 'survive clock');
    return;
  }
  if (kind === 'defend') {
    assert.ok(tickUntil(h, () => [...h.state.entities.values()].some((entity) => entity.data
      && entity.data.circuitBeacon), 30));
    const beacon = [...h.state.entities.values()].find((entity) => entity.data && entity.data.circuitBeacon);
    killIds(h, [beacon.id]);
    step(h, 2);
    return;
  }
  if (kind === 'hold' || kind === 'reach') {
    const spot = kind === 'hold' ? survivalWave._swarm.circuit.zone : survivalWave._swarm.circuit.gate;
    h.player.pos.x = spot.x;
    h.player.pos.z = spot.z;
    const before = cleared(h);
    step(h, survivalWave._swarm.circuit.need);
    assert.equal(cleared(h), before + 1, kind);
    return;
  }
  if (kind === 'collect') {
    const need = survivalWave._swarm.circuit.coreCount;
    for (let i = 0; i < 80 && (survivalWave._circuitCores?.length || 0) < need; i++) {
      killHostiles(h);
      step(h, 10);
    }
    for (const core of survivalWave._circuitCores) {
      h.player.pos.x = core.x;
      h.player.pos.z = core.z;
      step(h, 1);
    }
    return;
  }
  if (kind === 'nodes') {
    assert.ok(tickUntil(h, () => [...h.state.entities.values()].filter((entity) => entity.data
      && entity.data.circuitNode && entity.alive !== false).length >= 3, 800));
    const ids = [...h.state.entities.values()].filter((entity) => entity.data && entity.data.circuitNode)
      .map((entity) => entity.id);
    for (const id of ids) {
      const entity = h.state.entities.get(id);
      if (entity) entity.alive = false;
      h.bus.emit('entity:killed', { id });
    }
    step(h, 5);
    return;
  }
  clearCohort(h);
}

function openNext(h, wave) {
  assert.ok(tickUntil(h, () => h.state.run.phase === 'draft', 400), `draft after ${wave}`);
  if (wave % 4 === 0 && wave < 16) {
    const choice = circuitChoicesFor(h.state.run).find((entry) => entry.kind === 'route' && !entry.fight);
    assert.ok(choice, 'a room is offered');
    h.bus.emit('run:circuitChoiceRequested', { offerId: choice.id });
  }
  h.bus.emit('run:draftResolved', {});
  assert.ok(tickUntil(h, () => h.state.run.phase === 'wave_intro' || h.state.run.phase === 'refit', 800),
    `wave ${wave + 1} plans`);
  if (h.state.run.phase === 'refit') {
    h.bus.emit('run:refitClosed', {});
    assert.ok(tickUntil(h, () => h.state.run.phase === 'wave_intro'), 'bench closes');
  }
  h.bus.emit('run:waveIntroComplete', {});
  assert.ok(tickUntil(h, () => h.state.run.phase === 'active'), 'the round starts');
}

function reachEscort(h) {
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA });
  h.bus.emit('run:transitionRequested', { expectedPhase: 'loadout', nextPhase: 'draft', reason: 't', tick: 0 });
  h.bus.emit('run:circuitChoiceRequested', { offerId: START_ID });
  h.bus.emit('run:draftResolved', {});
  assert.ok(tickUntil(h, () => h.state.run.phase === 'wave_intro'));
  h.bus.emit('run:waveIntroComplete', {});
  assert.ok(tickUntil(h, () => h.state.run.phase === 'active'));
  for (let wave = 1; wave < 15; wave++) {
    const kind = circuitRoundFor(h.state.run, wave).kind;
    const before = cleared(h);
    finishSpecial(h, kind);
    assert.ok(cleared(h) > before, `wave ${wave} (${kind}) cleared`);
    openNext(h, wave);
    assert.equal(h.state.run.wave, wave + 1);
  }
  assert.equal(circuitRoundFor(h.state.run, 15).kind, 'escort');
}

test('seed 4242: the freighter crossing is the round, and a loss cuts the purse', () => {
  const h = makeHarness();
  reachEscort(h);
  assert.equal(h.state.playerId, h.player.id, 'the player is still the only ship under control');
  const plan = named(h, 'run:wavePlanned').at(-1).payload.plan;
  assert.equal(plan.objective.kind, 'escort');
  assert.equal(plan.swarm.killTarget, 0);
  assert.equal(plan.swarm.circuit.escortSpeed, CIRCUIT_ESCORT_SPEED);
  assert.match(waveOpeningLine(15, plan), /Escort the freighter/);
  assert.ok(tickUntil(h, () => [...h.state.entities.values()].some((entity) => entity.data
    && entity.data.circuitEscort), 30));
  const freight = [...h.state.entities.values()].find((entity) => entity.data && entity.data.circuitEscort);
  assert.equal(freight.type, 'freighter');
  assert.equal(freight.data.unarmed, true);
  assert.deepEqual(freight.data.weapons, []);
  assert.notEqual(freight.id, h.state.playerId);
  const fromShip = Math.hypot(freight.pos.x - h.player.pos.x, freight.pos.z - h.player.pos.z);
  assert.ok(fromShip >= 80 && fromShip <= 130, 'the lane starts inside the room, near the ship');
  const origin = { x: freight.pos.x, z: freight.pos.z };
  step(h, 60);
  const moved = Math.hypot(freight.pos.x - origin.x, freight.pos.z - origin.z);
  assert.ok(Math.abs(moved - CIRCUIT_ESCORT_SPEED) < 0.5, 'one second of travel is the authored speed');
  h.bus.emit('run:awardRequested', { credits: 100, reason: 'circuit_purse' });
  const endsBefore = named(h, 'run:endRequested').length;
  const before = cleared(h);
  killIds(h, [freight.id]);
  step(h, 1);
  assert.equal(cleared(h), before + 1);
  const receipt = named(h, 'run:waveCleared').at(-1).payload;
  assert.equal(receipt.completionKind, 'escort');
  assert.equal(receipt.found, 0, 'it did not arrive');
  const spent = named(h, 'run:spent').at(-1);
  assert.equal(spent.payload.credits, 40);
  assert.equal(spent.payload.reason, 'circuit_escort_lost');
  assert.equal(h.state.run.credits, 60);
  assert.equal(named(h, 'run:endRequested').length, endsBefore, 'the run continues');
  assert.equal(circuitRoundFor({ ruleset: 'swarm', phase: 'active', wave: 40 }, 40), null);
});
