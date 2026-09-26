import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  combatOutcome,
  combatOutcomeForEntity,
  setCombatOutcomeQuietLatchForBench,
  getCombatOutcomeQuietLatchForBench,
} from '../src/systems/combatOutcome.js';

function makeHarness({ n = 12 } = {}) {
  const state = createGameState(1631);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  state.ui = {};
  state.world = { currentSectorId: 'sector_ceres_belt', sectors: {} };
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, team: 0,
    hull: 100, hullMax: 100, data: { ai: { passive: true } },
  });
  state.playerId = player.id;
  player.isPlayer = true;
  const ships = [player];
  for (let i = 0; i < n; i++) {
    ships.push(helpers.spawnEntity({
      type: 'ship', pos: { x: 300 + i * 40, z: 0 }, vel: { x: 0, z: 0 },
      team: i % 3 === 0 ? 1 : 0, hull: 80, hullMax: 80,
      data: { ai: { passive: true, hostileTeams: i % 3 === 0 ? [0] : [] } },
    }));
  }
  Object.assign(state.entityIndex, {
    ready: true, __spacefaceEntityIndexV1: true, ships, shipLike: ships, version: 1,
  });
  const outcomes = [];
  bus.on('combat:outcome', (r) => outcomes.push(r));
  const sys = Object.create(combatOutcome);
  sys.init({ state, bus, helpers, registry: null });
  return { state, bus, sys, ships, outcomes };
}

function step(h, ticks = 1) {
  for (let i = 0; i < ticks; i++) {
    h.state.tick++;
    h.state.simTime += 1 / 60;
    h.sys.update(1 / 60, h.state);
  }
}

test('bench toggle defaults ON and round-trips', () => {
  assert.equal(getCombatOutcomeQuietLatchForBench(), true);
  setCombatOutcomeQuietLatchForBench(false);
  assert.equal(getCombatOutcomeQuietLatchForBench(), false);
  setCombatOutcomeQuietLatchForBench(true);
  assert.equal(getCombatOutcomeQuietLatchForBench(), true);
});

test('quiet open flight arms latch after first empty flee scan', () => {
  setCombatOutcomeQuietLatchForBench(true);
  const h = makeHarness();
  step(h, 8);
  assert.equal(h.state.combatOutcomeRuntime?.quietLatched, true);
  assert.ok(h.sys._combatOutcomeQuiet);
  assert.equal(h.outcomes.length, 0);
});

test('latched ticks skip the scan inside the 0.5 s rescan window', () => {
  setCombatOutcomeQuietLatchForBench(true);
  const h = makeHarness();
  step(h, 8);
  const armed = h.sys._combatOutcomeQuiet.armedSimT;
  step(h, 12);
  assert.equal(h.sys._combatOutcomeQuiet.armedSimT, armed);
  assert.equal(h.state.combatOutcomeRuntime?.quietLatched, true);
});

test('silent forceFlee stamp is still recorded by the 0.5 s rescan', () => {
  setCombatOutcomeQuietLatchForBench(true);
  const h = makeHarness();
  step(h, 8);
  const target = h.ships[1];
  target.data.ai.forceFlee = true; // no event — e.g. pirateParley suppressRobbery
  step(h, 40); // > 0.5 s + one 4-tick cadence
  const rec = combatOutcomeForEntity(h.state, target.id);
  assert.ok(rec, 'fled record expected after rescan');
  assert.equal(rec.outcome, 'fled');
  assert.equal(rec.reason, 'forceFlee');
});

for (const [event, payload] of [
  ['combat:damage', { targetId: 1, attackerId: 2, applied: 5 }],
  ['ai:stateChange', { npcId: 2, from: 'patrol', to: 'flee' }],
  ['surrender:escaped', { entityId: 2 }],
  ['difficulty:pinReleased', { entityId: 2 }],
  ['pirateParley:resolved', { squadId: 'sq' }],
  ['pirateParley:started', { squadId: 'sq' }],
  ['pirateDisengage:triggered', { squadId: 'sq' }],
  ['entity:destroyed', { id: 99 }],
  ['sector:enter', { sectorId: 'x' }],
  ['save:loaded', {}],
  ['game:new', {}],
]) {
  test(`${event} wakes the latch and a fresh flee stamp records on the 4-tick cadence`, () => {
    setCombatOutcomeQuietLatchForBench(true);
    const h = makeHarness();
    step(h, 8);
    assert.ok(h.sys._combatOutcomeQuiet);
    const target = h.ships[4];
    target.data.ai.fsm = 'flee';
    h.bus.emit(event, payload);
    assert.equal(h.sys._combatOutcomeQuiet, null);
    step(h, 4);
    const rec = combatOutcomeForEntity(h.state, target.id);
    assert.ok(rec, `fled record expected within 4 ticks after ${event}`);
    assert.equal(rec.reason, 'fsm:flee');
  });
}

test('membership change (spawn) invalidates the latch', () => {
  setCombatOutcomeQuietLatchForBench(true);
  const h = makeHarness();
  step(h, 8);
  assert.ok(h.sys._combatOutcomeQuiet);
  const fresh = { id: 9001, type: 'ship', alive: true, team: 1, data: { ai: { forceFlee: true, hostileTeams: [0] } } };
  h.state.entities.set(fresh.id, fresh);
  h.state.entityIndex.shipLike.push(fresh);
  h.state.entityIndex.version += 1;
  step(h, 4);
  assert.ok(combatOutcomeForEntity(h.state, fresh.id));
});

test('ai:flee event path still records immediately while latched', () => {
  setCombatOutcomeQuietLatchForBench(true);
  const h = makeHarness();
  step(h, 8);
  const target = h.ships[1];
  h.bus.emit('ai:flee', { entityId: target.id });
  assert.equal(combatOutcomeForEntity(h.state, target.id)?.reason, 'ai:flee');
});

test('bench OFF never arms latch and records identically', () => {
  setCombatOutcomeQuietLatchForBench(false);
  try {
    const h = makeHarness();
    step(h, 40);
    assert.equal(h.sys._combatOutcomeQuiet, null);
    assert.equal(!!h.state.combatOutcomeRuntime?.quietLatched, false);
    h.ships[2].data.ai.forceFlee = true;
    step(h, 4);
    assert.ok(combatOutcomeForEntity(h.state, h.ships[2].id));
  } finally {
    setCombatOutcomeQuietLatchForBench(true);
  }
});

test('destroy unsubscribes wake listeners', () => {
  setCombatOutcomeQuietLatchForBench(true);
  const h = makeHarness();
  step(h, 8);
  h.sys.destroy();
  h.bus.emit('combat:damage', { applied: 1 });
  assert.equal(h.sys._combatOutcomeWakeSeq, 0);
});
