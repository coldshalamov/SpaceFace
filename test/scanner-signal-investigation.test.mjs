import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  recordAnomalyBearing,
  scanner,
  signalClassLabel,
  signalClassificationStage,
  signalStrengthFor,
} from '../src/systems/scanner.js';
import { world } from '../src/systems/world.js';
import { SECTORS } from '../src/data/sectors.js';
import { signalMetaText } from '../src/ui/signalInvestigationPrompt.js';

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

function bootAnomaly(seed = 4702) {
  const t = boot(seed);
  t.state.ambushSignatures.tells = {};
  const definition = SECTORS.find((sector) => sector.id === 'sector_veil_nebula')
    .pois.find((poi) => poi.id === 'poi_anomaly');
  const anomaly = t.sim.spawn({
    type: 'fx', team: 2, pos: { x: 1200, z: 0 }, radius: 10, mass: 0, collides: false,
    data: {
      poi: true,
      poiId: definition.id,
      poiType: definition.type,
      hidden: true,
      requiresTriangulation: true,
      triangulation: { ...definition.triangulation },
      anomalyTriangulated: false,
    },
  });
  t.state.world.activeSector = {
    id: 'sector_test_signals',
    pois: [{
      id: anomaly.id,
      poiId: definition.id,
      type: definition.type,
      pos: { ...anomaly.pos },
      hidden: true,
      requiresTriangulation: true,
      triangulation: { ...definition.triangulation },
      anomalyTriangulated: false,
    }],
  };
  const anomalyEvents = [];
  const discovered = [];
  const worldOwner = Object.create(world);
  worldOwner.state = t.state;
  worldOwner.bus = t.bus;
  t.bus.on('anomaly:triangulated', (payload) => {
    anomalyEvents.push(payload);
    worldOwner._onAnomalyTriangulated(payload);
  });
  t.bus.on('poi:discovered', (payload) => discovered.push(payload));
  return { ...t, anomaly, anomalyEvents, discovered };
}

test('signal helpers improve by proximity or repeated scans and remain bounded', () => {
  assert.equal(signalClassificationStage(1, 900), 1);
  assert.equal(signalClassificationStage(2, 900), 2);
  assert.equal(signalClassificationStage(1, 250), 3);
  assert.equal(signalStrengthFor(0, 1200), 1);
  assert.equal(signalStrengthFor(1200, 1200), 0);
  assert.equal(signalStrengthFor(600, 1200), 0.5);
});

test('anomaly bearing admission requires movement and a changed bearing', () => {
  const first = recordAnomalyBearing(null, { x: 0, z: 0 }, { x: 1200, z: 0 }, {}, 1);
  assert.equal(first.accepted, true);
  assert.equal(first.sampleCount, 1);
  assert.equal(first.record.fixedPos, null, 'the hidden target position is not retained before triangulation');
  const tooClose = recordAnomalyBearing(first.record, { x: 100, z: 0 }, { x: 1200, z: 0 }, {}, 2);
  assert.equal(tooClose.accepted, false);
  assert.equal(tooClose.reason, 'baseline_short');
  assert.equal(tooClose.sampleCount, 1);
  const sameBearing = recordAnomalyBearing(first.record, { x: -400, z: 0 }, { x: 1200, z: 0 }, {}, 3);
  assert.equal(sameBearing.accepted, false);
  assert.equal(sameBearing.reason, 'bearing_too_similar');
  assert.equal(sameBearing.sampleCount, 1);
});

test('Veil anomaly requires three distinct bearings before the canonical course seam unlocks', () => {
  const t = bootAnomaly();
  pulse(t);
  const signalId = t.events.results[0].primary.id;
  assert.equal(t.events.results[0].primary.classification, 'ANOMALY BEARING');
  assert.equal(t.events.results[0].primary.trackable, false);
  assert.equal(t.events.results[0].primary.triangulation.sampleCount, 1);
  assert.equal(signalMetaText(t.events.results[0].primary), 'BEARING 090° · FIX 1/3');
  t.bus.emit('signal:track', { signalId, source: 'premature-test' });
  assert.equal(t.events.courses.length, 0, 'a bearing is not an exact waypoint');

  clearCooldown(t);
  t.player.pos = { x: 0, z: 400 };
  pulse(t);
  assert.equal(t.events.results[1].primary.classification, 'ANOMALY BEARING');
  assert.equal(t.events.results[1].primary.triangulation.sampleCount, 2);

  const saved = t.sim.registry.get('scanner').serialize();
  assert.equal(saved.triangulations.poi_anomaly.samples.length, 2);
  assert.equal(saved.triangulations.poi_anomaly.fixedPos, null);

  const restored = bootAnomaly();
  restored.sim.registry.get('scanner').deserialize(saved);
  restored.player.pos = { x: 0, z: -400 };
  pulse(restored);
  assert.equal(restored.anomalyEvents.length, 1);
  assert.equal(restored.events.results[0].primary.classification, 'ANOMALOUS PHENOMENON');
  assert.equal(restored.anomaly.data.anomalyTriangulated, true);
  assert.equal(restored.state.world.discovery.sector_test_signals.pois.poi_anomaly.triangulated, true);
  assert.equal(restored.discovered.length, 1);
  restored.bus.emit('signal:track', { signalId, source: 'earned-test' });
  assert.equal(restored.events.courses.length, 1);
  assert.deepEqual(restored.events.courses[0].pos, { x: 1200, z: 0 });
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
