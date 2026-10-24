// SEED-SW-34 — a stage offer can be a mystery box: a sealed card on the armory counter that
// sells one seeded, hull-legal fitting for run credits; refusing it still runs the stage. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { runSession } from '../src/systems/runSession.js';
import { ships } from '../src/systems/ships.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import {
  CIRCUIT_MYSTERY,
  CIRCUIT_SURVIVE_TICKS,
  circuitChoiceId,
  circuitChoicesFor,
  circuitFor,
  circuitMysteryOffer,
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
    id: state.nextEntityId++, alive: true, pos: { x: 400, z: 0 }, type: 'ship',
    hull: 100, hullMax: 100,
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
  for (let i = 0; i < n; i += 1) {
    h.state.tick += 1;
    h.state.simTime += DT;
    survivalWave.update(DT);
    survivalRun.update(DT);
  }
}

function tickUntil(h, predicate, max = 5000) {
  for (let i = 0; i < max; i += 1) {
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
  for (let i = 0; i < 160; i += 1) {
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
  clearCohort(h);
}

function openNext(h, wave) {
  assert.ok(tickUntil(h, () => h.state.run.phase === 'draft', 400), `draft after ${wave}`);
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

function reachFirstRoute(h) {
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA });
  h.bus.emit('run:transitionRequested', { expectedPhase: 'loadout', nextPhase: 'draft', reason: 't', tick: 0 });
  h.bus.emit('run:circuitChoiceRequested', { offerId: START_ID });
  h.bus.emit('run:draftResolved', {});
  assert.ok(tickUntil(h, () => h.state.run.phase === 'wave_intro'));
  h.bus.emit('run:waveIntroComplete', {});
  assert.ok(tickUntil(h, () => h.state.run.phase === 'active'));
  for (let wave = 1; wave <= 4; wave += 1) {
    const kind = circuitRoundFor(h.state.run, wave).kind;
    const before = cleared(h);
    finishSpecial(h, kind);
    assert.ok(cleared(h) > before, `wave ${wave} (${kind}) clears`);
    if (wave < 4) openNext(h, wave);
  }
  assert.ok(tickUntil(h, () => h.state.run.phase === 'draft', 400), 'the first route opens');
  assert.equal(circuitFor(h.state.run).status, 'route');
  assert.equal(circuitFor(h.state.run).clearedStages, 1);
}

function armHull(h) {
  h.player.data = { defId: 'ship_kestrel' };
  const registry = { get(name) { return name === 'ships' ? ships : null; } };
  ships.init({ state: h.state, bus: h.bus, helpers: {} });
  assert.equal(ships.buyShip({ defId: 'ship_kestrel', setActive: true, grant: true }), true);
  survivalDraft.init({ state: h.state, bus: h.bus, helpers: {}, registry });
  // Init resets the armory to "already resolved". The route draft is already open, so say so.
  h.bus.emit('run:transitioned', { phase: 'draft', wave: h.state.run.wave });
}

function pick(h, offerId) {
  const before = named(h, 'run:circuitChoiceApplied').length;
  h.bus.emit('run:draftPickRequested', { offerId });
  const rows = named(h, 'run:circuitChoiceApplied');
  assert.equal(rows.length, before + 1, 'the draft answers the node through the run');
  return rows.at(-1).payload;
}

function mysteryChoice(h) {
  return circuitChoicesFor(h.state.run).find((entry) => entry.node === 'mystery') || null;
}

test('seed 4242: the box sells one seeded hull-legal fitting and the stage still fights', () => {
  const h = makeHarness();
  reachFirstRoute(h);
  const box = mysteryChoice(h);
  assert.ok(box, 'the route offers the mystery box beside the rooms');
  assert.equal(box.kind, 'route', 'the box is a stage pick, not a second screen');
  assert.equal(box.label, CIRCUIT_MYSTERY.label);

  armHull(h);
  const applied = pick(h, box.id);
  assert.equal(applied.accepted, true, applied.reason);
  const committed = circuitFor(h.state.run);
  assert.equal(committed.status, 'running');
  const stop = committed.route[committed.route.length - 1];
  assert.equal(stop.nodeId, CIRCUIT_MYSTERY.id, 'the stop is recorded on the route');
  assert.equal(stop.arenaId, ARENA, 'the stage fights where the run already stands');
  assert.equal(h.state.run.arenaId, ARENA, 'no relocation');
  assert.equal(h.state.run.phase, 'draft');

  // The sealed card sits on the service counter for this armory only.
  const row = survivalDraft.currentOffers().find((entry) => entry.id === 'svc_mystery_box');
  assert.ok(row, 'the sealed card is on the counter');
  assert.equal(row.price, CIRCUIT_MYSTERY.cost);
  assert.equal(row.service, 'mystery');
  assert.equal(row.available, false, 'an empty purse cannot buy the crate');
  assert.match(row.unavailableReason, /Save \d+ more cr/);

  const expected = circuitMysteryOffer(h.state, SEED, 2);
  assert.ok(expected && expected.defId, 'seed 4242 has a legal pull for the kestrel');
  assert.deepEqual(circuitMysteryOffer(h.state, SEED, 2), expected, 'the pull is seeded');

  h.bus.emit('run:awardRequested', { credits: 100, reason: 'test:chip' });
  assert.equal(h.state.run.credits, 100);
  assert.equal(survivalDraft.currentOffers().find((entry) => entry.id === 'svc_mystery_box').available, true);
  const spentBefore = named(h, 'run:spent').length;
  h.bus.emit('run:draftPickRequested', { offerId: 'svc_mystery_box' });
  assert.equal(h.state.run.credits, 100 - CIRCUIT_MYSTERY.cost);
  assert.equal(named(h, 'run:spent').length, spentBefore + 1);
  const owned = h.state.player.ownedShips[h.state.player.activeShipIndex];
  assert.equal(owned.fittings[expected.slotIndex], expected.defId, 'the pull bolts on where the box said');
  assert.equal(named(h, 'run:awarded').filter((entry) => entry.payload
    && /refund/i.test(String(entry.payload.reason || ''))).length, 0, 'a delivered pull is not refunded');
  const rebought = survivalDraft.currentOffers().find((entry) => entry.id === 'svc_mystery_box');
  assert.equal(rebought.available, false, 'one crate per stop');

  h.bus.emit('run:draftResolved', {});
  assert.ok(tickUntil(h, () => h.state.run.phase === 'wave_intro', 800), 'the stage still plans');
  assert.equal(circuitRoundFor(h.state.run, 5).stage, 2);
});

test('seed 4242: refusing the box leaves the stage as a plain fight', () => {
  const h = makeHarness();
  reachFirstRoute(h);
  armHull(h);
  const applied = pick(h, mysteryChoice(h).id);
  assert.equal(applied.accepted, true, applied.reason);
  h.bus.emit('run:awardRequested', { credits: 100, reason: 'test:chip' });
  const spentBefore = named(h, 'run:spent').length;
  const fittings = JSON.stringify(h.state.player.ownedShips[0].fittings);
  // Never touch the crate — launch straight into the stage.
  h.bus.emit('run:draftResolved', {});
  assert.equal(named(h, 'run:spent').length, spentBefore, 'a refused box charges nothing');
  assert.equal(JSON.stringify(h.state.player.ownedShips[0].fittings), fittings, 'nothing was fitted');
  assert.ok(tickUntil(h, () => h.state.run.phase === 'wave_intro', 800), 'the stage plans');
  const round = circuitRoundFor(h.state.run, 5);
  assert.equal(round.stage, 2);
  assert.equal(round.fight, null, 'no pressure tag rides the stop — a plain fight');
  assert.equal(round.pressureMul, 1);
});
