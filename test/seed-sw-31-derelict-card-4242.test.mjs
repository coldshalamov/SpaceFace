// SEED-SW-31 — a stage offer can open a two-answer derelict card on the same draft. Seed 4242.
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
  CIRCUIT_DESTINATIONS,
  CIRCUIT_EVENT,
  CIRCUIT_SURVIVE_TICKS,
  circuitChoiceId,
  circuitChoicesFor,
  circuitFor,
  circuitRoundFor,
  circuitSalvageOffer,
} from '../src/systems/survivalCircuit.js';
import { circuitPanelLines } from '../src/ui/screens/crucibleDraft.js';

const DT = 1 / 60;
const SEED = 4242;
const ARENA = 'helios_core';
const START_ID = circuitChoiceId('start', { wave: 0, revision: 1 });
const STAGE_ROOM = CIRCUIT_DESTINATIONS[2][0].arenaId;

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
  assert.equal(rows.length, before + 1, 'the draft answers the card through the run');
  return rows.at(-1).payload;
}

test('seed 4242: salvaging the derelict pays, fits a part, and the stage still fights', () => {
  const h = makeHarness();
  reachFirstRoute(h);
  const offered = circuitChoicesFor(h.state.run);
  const event = offered.find((entry) => entry.kind === 'event');
  assert.ok(event, 'the route offers the derelict beside the rooms');
  assert.equal(event.line, CIRCUIT_EVENT.line);
  assert.equal(offered.filter((entry) => entry.kind === 'route' && !entry.fight && !entry.node).length, 2);

  armHull(h);
  const opened = pick(h, event.id);
  assert.equal(opened.accepted, true, opened.reason);
  assert.equal(h.state.run.phase, 'draft', 'the card stays on the draft');
  const card = circuitFor(h.state.run);
  assert.equal(card.status, 'route');
  assert.equal(card.card.id, 'derelict');
  const answers = circuitChoicesFor(h.state.run);
  assert.deepEqual(answers.map((entry) => entry.kind), ['salvage', 'leave']);
  const panel = circuitPanelLines(h.state.run);
  assert.equal(panel.status, CIRCUIT_EVENT.line);
  assert.deepEqual(panel.choices.map((entry) => entry.kind), ['salvage', 'leave']);

  const broke = pick(h, answers[0].id);
  assert.equal(broke.accepted, false);
  assert.match(broke.reason, /credits/);
  assert.equal(circuitFor(h.state.run).card.id, 'derelict', 'a refused salvage leaves the card up');
  assert.equal(h.state.run.credits, 0);

  h.bus.emit('run:awardRequested', { credits: 100, reason: 'test:chip' });
  assert.equal(h.state.run.credits, 100);
  const offer = circuitSalvageOffer(h.state);
  assert.ok(offer && offer.defId, 'the hull has a legal salvage fitting');
  const shieldBefore = Number(h.player.shield) || 0;
  const endsBefore = named(h, 'run:endRequested').length;
  const resolvedBefore = named(h, 'run:draftResolved').length;
  const paid = pick(h, circuitChoicesFor(h.state.run).find((entry) => entry.kind === 'salvage').id);
  assert.equal(paid.accepted, true, paid.reason);
  assert.equal(h.state.run.credits, 70);
  assert.equal(named(h, 'run:spent').filter((entry) => entry.payload
    && entry.payload.reason === 'circuit_derelict_salvage').length, 1);
  assert.equal(named(h, 'run:awarded').filter((entry) => entry.payload
    && entry.payload.reason === 'circuit_derelict_refund').length, 0, 'a fitted salvage is not refunded');
  const owned = h.state.player.ownedShips[h.state.player.activeShipIndex];
  assert.equal(owned.fittings[offer.slotIndex], offer.defId);
  assert.ok((Number(h.player.shield) || 0) > shieldBefore, 'the fitted part changes the ship');
  const running = circuitFor(h.state.run);
  assert.equal(running.status, 'running');
  assert.equal(running.card, undefined);
  assert.equal(h.state.run.arenaId, STAGE_ROOM);
  assert.equal(running.route[1].arenaId, STAGE_ROOM);
  assert.equal(h.state.run.phase, 'draft');
  assert.equal(named(h, 'run:draftResolved').length, resolvedBefore, 'answering does not auto-launch');
  assert.equal(named(h, 'run:endRequested').length, endsBefore);

  h.bus.emit('run:draftResolved', {});
  assert.ok(tickUntil(h, () => h.state.run.phase === 'wave_intro', 800), 'the stage fight plans');
  assert.equal(h.state.run.arenaId, STAGE_ROOM);
  assert.equal(circuitRoundFor(h.state.run, 5).stage, 2);
});

test('seed 4242: leaving the derelict pays nothing and still installs the stage', () => {
  const h = makeHarness();
  reachFirstRoute(h);
  armHull(h);
  const event = circuitChoicesFor(h.state.run).find((entry) => entry.kind === 'event');
  const opened = pick(h, event.id);
  assert.equal(opened.accepted, true, opened.reason);
  h.bus.emit('run:awardRequested', { credits: 50, reason: 'test:chip' });
  const endsBefore = named(h, 'run:endRequested').length;
  const spentBefore = named(h, 'run:spent').length;
  const leave = circuitChoicesFor(h.state.run).find((entry) => entry.kind === 'leave');
  const fittings = JSON.stringify(h.state.player.ownedShips[0].fittings);
  const applied = pick(h, leave.id);
  assert.equal(applied.accepted, true, applied.reason);
  assert.equal(h.state.run.credits, 50, 'leaving pays nothing');
  assert.equal(named(h, 'run:spent').length, spentBefore);
  assert.equal(JSON.stringify(h.state.player.ownedShips[0].fittings), fittings, 'leaving fits nothing');
  const running = circuitFor(h.state.run);
  assert.equal(running.status, 'running');
  assert.equal(running.card, undefined);
  assert.equal(h.state.run.arenaId, STAGE_ROOM);
  assert.equal(h.state.run.phase, 'draft');
  assert.equal(named(h, 'run:endRequested').length, endsBefore);
  h.bus.emit('run:draftResolved', {});
  assert.ok(tickUntil(h, () => h.state.run.phase === 'wave_intro', 800), 'the stage fight plans');
  assert.equal(circuitRoundFor(h.state.run, 5).stage, 2);
});
