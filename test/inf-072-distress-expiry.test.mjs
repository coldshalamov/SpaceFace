// INF-072 — one distress call points to a real, expiring situation. A tracked wreck that
// leaves the world outside the decision flow — beam-stripped or destroyed — closes its call
// with a truthful receipt instead of marking an immortal position. Stripping pays nothing
// new (the beam already paid in cargo); destruction fails the call with the last-known pos.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { recoveryEncounter } from '../src/systems/recoveryEncounter.js';

const SECTOR_ID = 'sector_ceres_belt';

function boot() {
  const sim = createSimulation({ seed: 7214, systems: [recoveryEncounter] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world = state.world || {};
  state.world.currentSectorId = SECTOR_ID;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const events = { completed: [], credits: [], rep: [] };
  bus.on('recovery:completed', (p) => events.completed.push(p));
  bus.on('economy:grantCredits', (p) => events.credits.push(p));
  bus.on('faction:repDelta', (p) => events.rep.push(p));
  return { sim, state, bus, events };
}

function trackWreck(harness, tag) {
  const wreck = harness.sim.spawn({
    type: 'wreck', team: 2, pos: { x: 300, z: 100 }, vel: { x: 0, z: 0 },
    radius: 9, hull: 1, hullMax: 1, data: {},
  });
  harness.bus.emit('signal:investigated', {
    sourceKind: 'distress',
    entityId: wreck.id,
    sectorId: SECTOR_ID,
    pos: { x: 300, z: 100 },
    signalId: tag,
  });
  return wreck;
}

function openRecord(harness) {
  const own = harness.state.recoveryEncounters;
  const ids = Object.keys(own.records);
  assert.equal(ids.length, 1, 'one tracked call');
  assert.ok(!own.outcomes[ids[0]], 'the call starts open');
  return own.records[ids[0]];
}

test('a beam-stripped wreck closes its call as a strip with no new payout', () => {
  const harness = boot();
  const wreck = trackWreck(harness, 'sig-strip');
  const record = openRecord(harness);
  assert.equal(record.entityId, wreck.id, 'the call tracks the live wreck');
  harness.bus.emit('salvage:completed', {
    wreckId: wreck.id,
    loot: { cmdty_scrap_metal: 3 },
  });
  const own = harness.state.recoveryEncounters;
  assert.ok(own.outcomes[record.id], 'the call closes on the salvage event');
  assert.equal(harness.events.completed.length, 1, 'one completion receipt');
  assert.equal(harness.events.completed[0].outcome, 'strip', 'stripped, not rescued');
  assert.deepEqual(harness.events.completed[0].cargo, { cmdty_scrap_metal: 3 }, 'the receipt names what came out');
  assert.equal(harness.events.credits.length, 0, 'no desk payout replays the beam loot');
  assert.equal(harness.events.rep.length, 0, 'no standing moves on a bypassed decision');
});

test('a destroyed wreck fails its call with its last-known position', () => {
  const harness = boot();
  const wreck = trackWreck(harness, 'sig-gone');
  const record = openRecord(harness);
  harness.bus.emit('entity:destroyed', { id: wreck.id, pos: { x: 300, z: 100 } });
  const own = harness.state.recoveryEncounters;
  assert.ok(own.outcomes[record.id], 'the call closes on the destroy event');
  assert.equal(harness.events.completed.length, 1, 'one completion receipt');
  assert.equal(harness.events.completed[0].outcome, 'failed', 'failed, never immortal');
  assert.equal(harness.events.completed[0].failure, 'wreck_destroyed', 'the truthful aftermath');
  assert.deepEqual(harness.events.completed[0].pos, { x: 300, z: 100 }, 'the last-known position rides along');
});

test('restore teardown never closes calls, and settled calls never re-settle', () => {
  const harness = boot();
  const wreck = trackWreck(harness, 'sig-restore');
  openRecord(harness);
  harness.bus.emit('entity:destroyed', { id: wreck.id, reason: 'save_restore' });
  assert.equal(harness.events.completed.length, 0, 'restore teardown is not a situation ending');
  harness.bus.emit('salvage:completed', { wreckId: wreck.id, loot: {} });
  harness.bus.emit('salvage:completed', { wreckId: wreck.id, loot: {} });
  assert.equal(harness.events.completed.length, 1, 'one close, however many echoes');
});
