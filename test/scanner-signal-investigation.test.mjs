import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  scanner,
  signalClassLabel,
  signalClassificationStage,
  signalStrengthFor,
} from '../src/systems/scanner.js';

function boot(seed = 4701) {
  const sim = createSimulation({ seed, systems: [scanner] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input.actions = state.input.actions || {};
  state.world.currentSectorId = 'sector_test_signals';
  state.world.activeSector = { id: 'sector_test_signals', pois: [] };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  state.ambushSignatures = {
    schemaVersion: 1,
    tells: {
      'ambushTell:quiet-hook': {
        id: 'ambushTell:quiet-hook',
        active: true,
        sectorId: 'sector_test_signals',
        pos: { x: 900, z: 0 },
        label: 'Do not leak this authored ambush label',
        hint: 'Do not leak hostile intent',
      },
    },
    lastScan: null,
  };
  const events = { results: [], courses: [], tracked: [], investigated: [], receipts: [] };
  bus.on('signal:scanResults', (p) => events.results.push(p));
  bus.on('ui:setCourse', (p) => events.courses.push(p));
  bus.on('signal:tracked', (p) => events.tracked.push(p));
  bus.on('signal:investigated', (p) => events.investigated.push(p));
  bus.on('signal:receipt', (p) => events.receipts.push(p));
  return { sim, state, bus, player, events };
}

function pulse(t) {
  t.state.input.actions.scanPulse = true;
  t.sim.runTicks(2);
}

function clearCooldown(t) {
  t.sim.runTicks(Math.ceil(8.1 / SIM_DT));
}

test('signal helpers improve by proximity or repeated scans and remain bounded', () => {
  assert.equal(signalClassificationStage(1, 900), 1);
  assert.equal(signalClassificationStage(2, 900), 2);
  assert.equal(signalClassificationStage(1, 250), 3);
  assert.equal(signalStrengthFor(0, 1200), 1);
  assert.equal(signalStrengthFor(1200, 1200), 0);
  assert.equal(signalStrengthFor(600, 1200), 0.5);
});

test('ambush investigation never reveals hostility and repeated pulse improves uncertainty', () => {
  const t = boot();
  pulse(t);
  assert.equal(t.events.results.length, 1);
  assert.equal(t.events.results[0].primary.classification, 'SHIP SIGNATURE');
  assert.doesNotMatch(`${t.events.results[0].primary.classification} ${t.events.results[0].primary.detail}`, /hostile|pirate|ambush/i);

  clearCooldown(t);
  pulse(t);
  assert.equal(t.events.results.length, 2);
  assert.equal(t.events.results[1].primary.classification, 'UNCERTAIN TRAFFIC');
  assert.equal(t.events.results[1].primary.scanCount, 2);
  assert.doesNotMatch(`${t.events.results[1].primary.classification} ${t.events.results[1].primary.detail}`, /hostile|pirate|ambush/i);
  assert.equal(signalClassLabel('ambush', 3), 'MULTIPLE DRIVE ECHOES');
});

test('Track emits canonical course and investigation receipt only once', () => {
  const t = boot();
  pulse(t);
  const signalId = t.events.results[0].primary.id;
  t.bus.emit('signal:track', { signalId, source: 'test' });
  assert.equal(t.events.courses.length, 1);
  assert.deepEqual(t.events.courses[0], {
    pos: { x: 900, z: 0 },
    targetEntityId: null,
    label: 'SHIP SIGNATURE',
    reason: 'Investigate ship signature',
    waypointKind: 'signal',
    arrivalRadius: 150,
    autopilot: true,
  });
  assert.equal(t.state.signalInvestigation.trackedId, signalId);

  t.player.pos.x = 800;
  t.sim.runTicks(2);
  assert.equal(t.events.investigated.length, 1);
  assert.equal(t.events.receipts.length, 1);
  assert.equal(t.state.signalInvestigation.trackedId, null);
  assert.equal(t.state.signalInvestigation.completed[signalId].outcome, 'investigated');

  t.sim.runTicks(20);
  t.bus.emit('signal:track', { signalId, source: 'duplicate-test' });
  assert.equal(t.events.courses.length, 1, 'completed signal cannot plot a second course');
  assert.equal(t.events.investigated.length, 1, 'proximity update cannot duplicate completion');
  assert.equal(t.events.receipts.length, 1, 'receipt is exactly once');
});

test('tracked local signal cannot complete from matching coordinates in another sector', () => {
  const t = boot();
  pulse(t);
  const signalId = t.events.results[0].primary.id;
  t.bus.emit('signal:track', { signalId });
  t.state.world.currentSectorId = 'sector_elsewhere';
  t.player.pos.x = 800;
  t.sim.runTicks(2);
  assert.equal(t.events.investigated.length, 0);
  assert.equal(t.state.signalInvestigation.trackedId, signalId, 'return stays tracked for navigation back to its sector');
});

test('scanner sidecar preserves completion across save/load without duplicate reward authority', () => {
  const a = boot(91);
  pulse(a);
  const signalId = a.events.results[0].primary.id;
  a.bus.emit('signal:track', { signalId });
  a.player.pos.x = 800;
  a.sim.runTicks(2);
  const saved = a.sim.registry.get('scanner').serialize();
  assert.ok(saved.completed[signalId]);
  assert.equal(saved.receipts.length, 1);

  const b = boot(91);
  b.sim.registry.get('scanner').deserialize(saved);
  assert.ok(b.state.signalInvestigation.completed[signalId]);
  assert.equal(b.state.signalInvestigation.receipts.length, 1);
  pulse(b);
  assert.equal(b.events.results.length, 0, 'completed signal is not offered again after load');
  b.bus.emit('signal:track', { signalId });
  b.sim.runTicks(2);
  assert.equal(b.events.investigated.length, 0);
  assert.equal(b.events.receipts.length, 0);
});

test('save system serializes and restores the scanner sidecar through registry authority', () => {
  const source = readFileSync(new URL('../src/save/saveSystem.js', import.meta.url), 'utf8');
  assert.match(source, /data\.signalInvestigation\s*=\s*this\._callSerialize\('scanner'\)/);
  assert.match(source, /this\._callDeserialize\('scanner',\s*data\.signalInvestigation\)/);
  assert.doesNotMatch(source, /state\.signalInvestigation\s*=\s*data\.signalInvestigation/,
    'save restore never bypasses scanner normalization');
});
