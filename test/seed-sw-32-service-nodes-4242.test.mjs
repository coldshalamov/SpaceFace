// SEED-SW-32 — a stage offer can be Armory, Repair, or Treasure, and resolving it skips the wave.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { ownedSwarmLegendaryIds } from '../src/data/swarmDraft.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { runSession } from '../src/systems/runSession.js';
import { ships } from '../src/systems/ships.js';
import { SWARM_WELD_PRICE, survivalDraft } from '../src/systems/survivalDraft.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import {
  CIRCUIT_SERVICES,
  CIRCUIT_SURVIVE_TICKS,
  circuitChoiceId,
  circuitChoicesFor,
  circuitFor,
  circuitRoundFor,
  circuitTreasurePick,
} from '../src/systems/survivalCircuit.js';
import { circuitPanelLines } from '../src/ui/screens/crucibleDraft.js';

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
  h.bus.emit('run:transitioned', { phase: 'draft', wave: h.state.run.wave });
}

function pick(h, offerId) {
  const before = named(h, 'run:circuitChoiceApplied').length;
  h.bus.emit('run:draftPickRequested', { offerId });
  const rows = named(h, 'run:circuitChoiceApplied');
  assert.equal(rows.length, before + 1, 'the draft answers the stop through the run');
  return rows.at(-1).payload;
}

function serviceChoice(run, serviceId) {
  return circuitChoicesFor(run).find((entry) => entry.kind === 'service' && entry.serviceId === serviceId);
}

function skipped(h, serviceId) {
  const circuit = circuitFor(h.state.run);
  assert.equal(circuit.status, 'route');
  assert.equal(circuit.clearedStages, 2);
  assert.equal(circuit.route.length, 2);
  assert.equal(circuit.service, undefined, 'the stop does not stay open after it resolves');
  assert.equal(circuit.route[1].nodeKind, 'service');
  assert.equal(circuit.route[1].arenaId, serviceId);
  assert.equal(circuit.route[1].nodeId, serviceId);
  assert.equal(h.state.run.wave, 8, 'the skipped stage is not fought');
  assert.equal(h.state.run.arenaId, ARENA, 'a service stop does not install a fight room');
  assert.equal(h.state.run.phase, 'draft');
}

test('seed 4242: the armory opens the bench, and leaving it skips the stage', () => {
  const h = makeHarness();
  reachFirstRoute(h);
  const offered = circuitChoicesFor(h.state.run);
  assert.equal(offered.filter((entry) => entry.kind === 'route' && !entry.fight && !entry.node).length, 2);
  assert.equal(offered.filter((entry) => entry.kind === 'event').length, 1);
  assert.deepEqual(
    offered.filter((entry) => entry.kind === 'service').map((entry) => entry.serviceId),
    ['armory', 'repair', 'treasure'],
  );
  const repair = CIRCUIT_SERVICES.find((svc) => svc.id === 'repair');
  assert.equal(repair.cost, SWARM_WELD_PRICE, 'repair charges the same purse as a weld');

  armHull(h);
  const planned = named(h, 'run:wavePlanned').length;
  const ends = named(h, 'run:endRequested').length;
  const credits = h.state.run.credits;
  const opened = pick(h, serviceChoice(h.state.run, 'armory').id);
  assert.equal(opened.accepted, true, opened.reason);
  assert.equal(h.state.run.phase, 'draft');
  assert.equal(circuitFor(h.state.run).service.id, 'armory');
  assert.equal(h.state.run.credits, credits, 'opening the bench is free');
  assert.equal(named(h, 'run:wavePlanned').length, planned);
  const bench = circuitChoicesFor(h.state.run);
  assert.deepEqual(bench.map((entry) => entry.kind), ['service_done']);
  const panel = circuitPanelLines(h.state.run);
  assert.equal(panel.status, CIRCUIT_SERVICES.find((svc) => svc.id === 'armory').line);
  const stock = named(h, 'run:draftOffered').at(-1).payload;
  assert.equal(stock.notice, 'The bench is open. Buy, then leave the bench to skip this stage.');
  assert.ok(Array.isArray(stock.offers) && stock.offers.length > 0, 'the bench still has rows to buy');

  const left = pick(h, bench[0].id);
  assert.equal(left.accepted, true, left.reason);
  assert.equal(named(h, 'run:draftOffered').at(-1).payload.notice, 'Bench closed. Choose the next stage.');
  skipped(h, 'armory');
  assert.equal(named(h, 'run:wavePlanned').length, planned, 'leaving the bench does not start a wave');
  assert.equal(named(h, 'run:endRequested').length, ends);

  const next = circuitChoicesFor(h.state.run).find((entry) => entry.kind === 'route' && !entry.fight);
  const room = pick(h, next.id);
  assert.equal(room.accepted, true, room.reason);
  const running = circuitFor(h.state.run);
  assert.equal(running.status, 'running');
  assert.equal(running.route.length, 3);
  assert.equal(running.clearedStages, 2);
  assert.equal(h.state.run.arenaId, next.arenaId);
  h.bus.emit('run:draftResolved', {});
  assert.ok(tickUntil(h, () => h.state.run.phase === 'wave_intro', 800), 'the following stage plans');
  assert.equal(h.state.run.wave, 9);
  assert.equal(circuitRoundFor(h.state.run, h.state.run.wave).stage, 3);
});

test('seed 4242: repair tops a damaged hull for run credits and skips the stage', () => {
  const h = makeHarness();
  reachFirstRoute(h);
  armHull(h);
  const planned = named(h, 'run:wavePlanned').length;
  const sound = pick(h, serviceChoice(h.state.run, 'repair').id);
  assert.equal(sound.accepted, false);
  assert.match(sound.reason, /sound/);
  assert.equal(named(h, 'run:spent').length, 0);
  assert.equal(circuitFor(h.state.run).clearedStages, 1);

  h.player.hull = 40;
  const broke = pick(h, serviceChoice(h.state.run, 'repair').id);
  assert.equal(broke.accepted, false);
  assert.match(broke.reason, /credits/);
  assert.equal(h.player.hull, 40, 'a refused repair leaves the damage');
  assert.equal(h.state.run.credits, 0);
  assert.equal(named(h, 'run:spent').length, 0);

  h.bus.emit('run:awardRequested', { credits: 100, reason: 'test:chip' });
  const paid = pick(h, serviceChoice(h.state.run, 'repair').id);
  assert.equal(paid.accepted, true, paid.reason);
  assert.equal(h.player.hull, h.player.hullMax);
  assert.equal(h.state.run.credits, 60);
  assert.equal(named(h, 'run:spent').filter((entry) => entry.payload
    && entry.payload.reason === 'circuit_repair').length, 1);
  assert.equal(named(h, 'run:awarded').filter((entry) => entry.payload
    && entry.payload.reason === 'circuit_repair_refund').length, 0);
  assert.equal(named(h, 'run:draftOffered').at(-1).payload.notice, 'Hull topped. This stage is skipped.');
  skipped(h, 'repair');
  assert.equal(named(h, 'run:wavePlanned').length, planned);
});

test('seed 4242: treasure sells one seeded legendary for its own purse and skips the stage', () => {
  const h = makeHarness();
  reachFirstRoute(h);
  armHull(h);
  const choice = serviceChoice(h.state.run, 'treasure');
  const expected = circuitTreasurePick(h.state.run.seed, choice.stage, h.state.run.wave, []);
  assert.ok(expected && expected.price > 0, 'the box has a priced legendary');
  const planned = named(h, 'run:wavePlanned').length;
  const broke = pick(h, choice.id);
  assert.equal(broke.accepted, false);
  assert.match(broke.reason, /credits/);
  assert.deepEqual(ownedSwarmLegendaryIds(h.state.run), []);
  assert.equal(named(h, 'run:spent').length, 0);
  assert.equal(circuitFor(h.state.run).clearedStages, 1);

  h.bus.emit('run:awardRequested', { credits: expected.price, reason: 'test:chip' });
  const paid = pick(h, serviceChoice(h.state.run, 'treasure').id);
  assert.equal(paid.accepted, true, paid.reason);
  assert.equal(paid.treasure.id, expected.id);
  assert.equal(h.state.run.credits, 0, 'the purse pays the legendary price, not zero');
  assert.ok(ownedSwarmLegendaryIds(h.state.run).includes(expected.id));
  assert.equal(named(h, 'run:spent').filter((entry) => entry.payload
    && entry.payload.reason === 'circuit_treasure' && entry.payload.credits === expected.price).length, 1);
  assert.equal(named(h, 'run:awarded').filter((entry) => entry.payload
    && entry.payload.reason === 'circuit_treasure_refund').length, 0, 'a kept legendary is not refunded');
  assert.match(named(h, 'run:draftOffered').at(-1).payload.notice, new RegExp(expected.name));
  skipped(h, 'treasure');
  assert.equal(named(h, 'run:wavePlanned').length, planned);
});
