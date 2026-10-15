import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { aftermathChoices, applyAftermathChoice } from '../src/combat/aftermathChoices.js';
import { combatOutcome, setCombatOutcomeQuietLatchForBench } from '../src/systems/combatOutcome.js';
import { createAftermathChoicePrompt } from '../src/ui/aftermathChoicePrompt.js';

const SECTOR = 'sector_tethys_junction';

function makeHarness() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.tick = 40;
  state.simTime = 1;
  state.ui = {};
  state.world = { currentSectorId: SECTOR, sectors: {} };
  const bus = createBus();
  const helpers = {};
  const said = [];
  helpers.voice = { say(line) { said.push(line); return true; } };
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, team: 0,
    hull: 100, hullMax: 100, data: { ai: { passive: true } },
  });
  state.playerId = player.id;
  player.isPlayer = true;
  const ships = [player];
  Object.assign(state.entityIndex, {
    ready: true, __spacefaceEntityIndexV1: true, ships, shipLike: ships, version: 1,
  });
  const sys = Object.create(combatOutcome);
  sys.init({ state, bus, helpers, registry: null });
  return { state, bus, sys, helpers, ships, said };
}

function spawnHostile(h, x) {
  const ship = h.helpers.spawnEntity({
    type: 'ship', pos: { x, z: 20 }, vel: { x: 0, z: 0 }, team: 1,
    hull: 80, hullMax: 80,
    data: { ai: { passive: true, hostileTeams: [0] }, name: 'Bandit' },
  });
  h.ships.push(ship);
  h.state.entityIndex.ships = h.ships;
  h.state.entityIndex.shipLike = h.ships;
  return ship;
}

function idsOf(offer) {
  return (offer && offer.choices || []).map((choice) => choice.id);
}

test('the same field facts always name the same live verbs', () => {
  const facts = {
    sectorId: SECTOR,
    outcomes: [
      { outcome: 'disabled', entityId: 4, sectorId: SECTOR, alive: true },
      { outcome: 'killed', entityId: 5, sectorId: SECTOR, alive: false },
      { outcome: 'fled', entityId: 6, sectorId: SECTOR, alive: true },
      { outcome: 'fled', entityId: 7, sectorId: 'sector_other', alive: true },
    ],
    wreckIds: ['wreck-a'],
    binary: ['save them', 'let them die'],
  };
  const first = aftermathChoices(facts);
  const second = aftermathChoices(facts);
  assert.deepEqual(first, second);
  assert.deepEqual(idsOf(first), ['rescue', 'salvage', 'pursuit', 'escape']);
  assert.equal(first.paused, false);
  assert.equal(first.targets.rescue, 4);
  assert.equal(first.targets.salvage, 5);
  assert.equal(first.targets.pursuit, 6);
  assert.equal(first.targets.escape, null);
  for (const choice of first.choices) {
    assert.equal(choice.viable, true);
    assert.doesNotMatch(choice.label, /damn|condemn|abandon|moral|evil|let them die/i);
  }
});

test('an empty field is escape only', () => {
  const offer = aftermathChoices({ sectorId: SECTOR, outcomes: [], wreckIds: [] });
  assert.deepEqual(idsOf(offer), ['escape']);
  assert.equal(offer.paused, false);
});

test('a dead surrender is salvage, and a gone fleer is not a chase', () => {
  const offer = aftermathChoices({
    sectorId: SECTOR,
    outcomes: [
      { outcome: 'surrendered', entityId: 8, sectorId: SECTOR, alive: false, dead: true },
      { outcome: 'fled', entityId: 9, sectorId: SECTOR, alive: false },
    ],
    wreckIds: [],
  });
  assert.deepEqual(idsOf(offer), ['salvage', 'escape']);
  assert.equal(offer.targets.salvage, 8);
});

test('a fight publishes salvage and pursuit while physics keeps stepping', () => {
  const h = makeHarness();
  const offers = [];
  const deck = {
    offerDecision(spec) { offers.push(spec); return true; },
    resolveDecision(id) { offers.push({ resolved: id }); return true; },
  };
  const prompt = createAftermathChoicePrompt({ bus: h.bus, state: h.state, deck });
  const wreck = spawnHostile(h, 400);
  const runner = spawnHostile(h, 800);
  h.bus.emit('entity:killed', { id: wreck.id, killerId: h.state.playerId });
  h.bus.emit('ai:flee', { entityId: runner.id });
  const offer = h.state.combatOutcome.aftermath;
  assert.deepEqual(idsOf(offer), ['salvage', 'pursuit', 'escape']);
  assert.equal(offer.paused, false);
  assert.equal(h.state.paused, undefined);
  const spec = offers[offers.length - 1];
  assert.ok(spec);
  assert.equal(spec.deadlineAt, null);
  assert.ok(offers.every((row) => row.deadlineAt == null));
  assert.deepEqual(spec.choices.map((choice) => choice.id), ['salvage', 'pursuit', 'escape']);
  const tickBefore = h.state.tick;
  h.state.tick += 1;
  h.sys.update(1 / 60, h.state);
  assert.ok(h.state.tick > tickBefore);
  assert.equal(h.state.paused, undefined);
  spec.onChoose('pursuit');
  assert.equal(h.state.combatOutcome.chosen.id, 'pursuit');
  assert.equal(h.state.combatOutcome.chosen.entityId, runner.id);
  assert.equal(h.state.combatOutcome.chosen.paused, false);
  assert.equal(h.state.paused, undefined);
  assert.equal(applyAftermathChoice(h.state, 'rescue'), null);
  assert.equal(h.state.combatOutcome.chosen.id, 'pursuit');
  prompt.destroy();
});

test('a disabled ship that dies becomes salvage, not a rescue of a corpse', () => {
  const h = makeHarness();
  const ship = spawnHostile(h, 500);
  h.bus.emit('combat:subsystemDisabled', { targetId: ship.id, subsystemId: 'subsystem_drive' });
  assert.deepEqual(idsOf(h.state.combatOutcome.aftermath), ['rescue', 'escape']);
  ship.alive = false;
  h.bus.emit('entity:killed', { id: ship.id, killerId: h.state.playerId });
  assert.equal(h.state.combatOutcome.byEntity[ship.id].outcome, 'disabled');
  assert.deepEqual(idsOf(h.state.combatOutcome.aftermath), ['salvage', 'escape']);
  assert.equal(h.state.combatOutcome.aftermath.targets.salvage, ship.id);
  assert.equal(h.state.paused, undefined);
});

test('a fled ship that despawns is not a chase and not a wreck', () => {
  const h = makeHarness();
  const calls = [];
  const deck = {
    offerDecision(spec) { calls.push(spec); return true; },
    resolveDecision(id) { calls.push({ resolved: id }); return true; },
  };
  createAftermathChoicePrompt({ bus: h.bus, state: h.state, deck });
  const runner = spawnHostile(h, 800);
  h.bus.emit('ai:flee', { entityId: runner.id });
  assert.deepEqual(idsOf(h.state.combatOutcome.aftermath), ['pursuit', 'escape']);
  runner.alive = false;
  h.state.entities.delete(runner.id);
  h.bus.emit('entity:destroyed', { id: runner.id, reason: 'egress' });
  assert.deepEqual(idsOf(h.state.combatOutcome.aftermath), ['escape']);
  assert.equal(h.state.combatOutcome.byEntity[runner.id].dead, undefined);
  assert.equal(calls[calls.length - 1].resolved, 'aftermath:field');
  assert.equal(applyAftermathChoice(h.state, 'pursuit'), null);
  assert.equal(applyAftermathChoice(h.state, 'salvage'), null);
  assert.equal(h.state.paused, undefined);
});

test('a recycled id does not revive the chase', () => {
  const h = makeHarness();
  const runner = spawnHostile(h, 800);
  const oldId = runner.id;
  const oldGeneration = runner.occupantGeneration;
  assert.ok(oldGeneration);
  h.bus.emit('ai:flee', { entityId: oldId });
  runner.alive = false;
  h.state.entities.delete(oldId);
  h.bus.emit('entity:destroyed', { id: oldId, entity: runner, reason: 'egress' });
  assert.deepEqual(idsOf(h.state.combatOutcome.aftermath), ['escape']);

  const next = h.helpers.spawnEntity({
    id: oldId,
    type: 'ship', pos: { x: 900, z: 20 }, vel: { x: 0, z: 0 }, team: 1,
    hull: 80, hullMax: 80,
    data: { ai: { passive: true, hostileTeams: [0] }, name: 'Next' },
  });
  h.ships.push(next);
  assert.equal(next.id, oldId);
  assert.notEqual(next.occupantGeneration, oldGeneration);

  const other = spawnHostile(h, 1400);
  h.bus.emit('entity:killed', { id: other.id, killerId: h.state.playerId });
  assert.deepEqual(idsOf(h.state.combatOutcome.aftermath), ['salvage', 'escape']);
  assert.equal(h.state.combatOutcome.aftermath.targets.pursuit, null);
  assert.notEqual(h.state.combatOutcome.byEntity[oldId].dead, true);

  h.bus.emit('ai:flee', { entityId: next.id });
  const replaced = h.state.combatOutcome.byEntity[oldId];
  assert.equal(replaced.occupantGeneration, next.occupantGeneration);
  assert.equal(replaced.outcome, 'fled');
  assert.equal(h.state.combatOutcome.aftermath.targets.pursuit, next.id);
  assert.equal(h.state.paused, undefined);
});

test('a recycled id that bolts without a flee event becomes the chase', () => {
  setCombatOutcomeQuietLatchForBench(false);
  try {
    const h = makeHarness();
    const runner = spawnHostile(h, 800);
    const oldId = runner.id;
    const oldGeneration = runner.occupantGeneration;
    h.bus.emit('ai:flee', { entityId: oldId });
    runner.alive = false;
    h.state.entities.delete(oldId);
    h.bus.emit('entity:destroyed', { id: oldId, entity: runner, reason: 'egress' });
    const next = h.helpers.spawnEntity({
      id: oldId,
      type: 'ship', pos: { x: 960, z: 20 }, vel: { x: 0, z: 0 }, team: 1,
      hull: 80, hullMax: 80,
      data: { ai: { passive: true, hostileTeams: [0], forceFlee: true }, name: 'Next' },
    });
    h.ships.push(next);
    h.state.entityIndex.ships = h.ships;
    h.state.entityIndex.shipLike = h.ships;
    for (let i = 0; i < 4; i++) {
      h.state.tick += 1;
      h.state.simTime += 1 / 60;
      h.sys.update(1 / 60, h.state);
    }
    const receipt = h.state.combatOutcome.byEntity[oldId];
    assert.equal(receipt.occupantGeneration, next.occupantGeneration);
    assert.notEqual(receipt.occupantGeneration, oldGeneration);
    assert.equal(receipt.outcome, 'fled');
    assert.equal(h.state.combatOutcome.aftermath.targets.pursuit, next.id);
    assert.equal(h.state.paused, undefined);
  } finally {
    setCombatOutcomeQuietLatchForBench(true);
  }
});

test('a wreck in the sector is salvage without a fresh kill, and the player hull is not', () => {
  const h = makeHarness();
  h.state.aftermathWrecks = {
    bySector: {
      [SECTOR]: [
        { markerId: 'player-hull', playerWreck: true },
        { markerId: 'bandit-hull', kind: 'battle-aftermath' },
      ],
    },
  };
  h.bus.emit('sector:enter', { sectorId: SECTOR });
  assert.deepEqual(idsOf(h.state.combatOutcome.aftermath), ['salvage', 'escape']);
  const chosen = applyAftermathChoice(h.state, 'salvage');
  assert.equal(chosen.entityId, 'bandit-hull');
  assert.equal(h.state.paused, undefined);
  const leave = applyAftermathChoice(h.state, 'escape');
  assert.equal(leave.entityId, null);
  assert.equal(h.state.combatOutcome.aftermath.departing, true);
  assert.equal(h.state.combatOutcome.aftermath.focus, null);
  assert.equal(h.state.paused, undefined);
});
