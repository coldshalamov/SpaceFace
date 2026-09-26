import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { scanner, signalClassificationStage } from '../src/systems/scanner.js';
import {
  PLANET_STATE_ASSIGNMENTS,
  planetSignalAnchor,
  planetStatesForSector,
} from '../src/data/planetStates.js';

// INFERENCE-26 (WF-10): every W1 planet-state assignment carries an authored scannerSignal —
// 'Pulsing DMC distress signature' on Shatterstone, the Razor-Ring ore band, the Crown of Thorns
// wreck ring — and collectSignalCandidates never read it. The dead world dominated the sky and
// the scanner said nothing. Now each assignment emits a far, non-trackable signal row that
// resolves to the planet's own name on full classification.

function boot(sectorId = 'sector_charon_expanse', seed = 4701) {
  const sim = createSimulation({ seed, systems: [scanner] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input.actions = state.input.actions || {};
  state.world.currentSectorId = sectorId;
  state.world.activeSector = { id: sectorId, pois: [] };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const events = { results: [], courses: [], tracked: [] };
  bus.on('signal:scanResults', (p) => events.results.push(p));
  bus.on('ui:setCourse', (p) => events.courses.push(p));
  bus.on('signal:tracked', (p) => events.tracked.push(p));
  return { sim, state, bus, player, events };
}

function pulse(t) {
  t.state.input.actions.scanPulse = true;
  t.sim.runTicks(2);
}

function clearCooldown(t) {
  t.sim.runTicks(Math.ceil(8.1 / SIM_DT));
}

function planetRow(events, bodyId) {
  const last = events.results[events.results.length - 1];
  return last && last.signals && last.signals.find((row) => row.sourceId === bodyId);
}

test('the dead planet answers a pulse as a far, authored, non-trackable return', () => {
  const t = boot();
  try {
    pulse(t);
    const row = planetRow(t.events, 'planet_shatterstone');
    assert.ok(row, 'Shatterstone appears in the scan results');
    assert.equal(row.id, 'signal:planet:planet_shatterstone');
    assert.equal(row.sourceKind, 'distress');
    assert.equal(row.trackable, false);
    assert.equal(row.detail, 'Pulsing DMC distress signature');
    assert.notEqual(row.classification, 'SHATTERSTONE', 'stage 1 stays generic — the name is earned');
    assert.ok(row.distance > 3400 && row.distance < 14600,
      `the anchor hangs outside the rim (got ${row.distance})`);
    assert.ok(row.strength > 0 && row.strength < 1);
  } finally {
    t.sim.dispose();
  }
});

test('a planet is a read, not a waypoint — signal:track books no course', () => {
  const t = boot();
  try {
    pulse(t);
    const row = planetRow(t.events, 'planet_shatterstone');
    t.bus.emit('signal:track', { signalId: row.id });
    t.sim.runTicks(2);
    assert.equal(t.events.courses.length, 0, 'no autopilot course is plotted to a planet');
    assert.equal(t.events.tracked.length, 0);
  } finally {
    t.sim.dispose();
  }
});

test('the third pass names the world — classification resolves to SHATTERSTONE', () => {
  const t = boot();
  try {
    for (let i = 0; i < 3; i++) { pulse(t); if (i < 2) clearCooldown(t); }
    const record = t.state.signalInvestigation.records['signal:planet:planet_shatterstone'];
    assert.equal(record.scanCount, 3);
    assert.equal(record.stage, signalClassificationStage(3, record.distance));
    assert.equal(record.classification, 'SHATTERSTONE',
      'full classification lets the sky name itself');
  } finally {
    t.sim.dispose();
  }
});

test('the anchor is a pure hash — identical across boots and equal to the emitted position', () => {
  const assignment = PLANET_STATE_ASSIGNMENTS.find((a) => a.bodyId === 'planet_shatterstone');
  const a1 = planetSignalAnchor(assignment);
  const a2 = planetSignalAnchor(assignment);
  assert.deepEqual(a1, a2);
  const t = boot();
  try {
    pulse(t);
    const row = planetRow(t.events, 'planet_shatterstone');
    assert.equal(row.pos.x, a1.x);
    assert.equal(row.pos.z, a1.z);
    assert.ok(Object.isFrozen(assignment), 'the authored row stays frozen');
  } finally {
    t.sim.dispose();
  }
});

test('Vesta Forge reads both bodies at once, distress-class anomaly before ore', () => {
  const t = boot('sector_vesta_forge');
  try {
    pulse(t);
    const signals = t.events.results[t.events.results.length - 1].signals;
    const burn = signals.findIndex((row) => row.sourceId === 'planet_vestas_burn');
    const ring = signals.findIndex((row) => row.sourceId === 'planet_razor_ring');
    assert.ok(burn >= 0 && ring >= 0, 'both Vesta bodies answer the same pulse');
    assert.ok(burn < ring, 'the anomaly-class Burn outranks the ore-class ring on the board');
  } finally {
    t.sim.dispose();
  }
});

test('a sector with no assignment emits no planet rows', () => {
  const t = boot('sector_helios_prime');
  try {
    pulse(t);
    const rows = t.events.results
      .flatMap((event) => event.signals || [])
      .filter((row) => String(row.id || '').startsWith('signal:planet:'));
    assert.equal(rows.length, 0);
    assert.equal(planetStatesForSector('sector_helios_prime').length, 0);
  } finally {
    t.sim.dispose();
  }
});

test('planet rows survive save round-trip with scan count and fields intact', () => {
  const t = boot();
  try {
    pulse(t);
    clearCooldown(t);
    pulse(t);
    const snapshot = t.sim.registry.get('scanner').serialize();
    t.sim.dispose();

    const t2 = boot();
    try {
      t2.sim.registry.get('scanner').deserialize(snapshot);
      const record = t2.state.signalInvestigation.records['signal:planet:planet_shatterstone'];
      assert.equal(record.scanCount, 2, 'the signal log remembers across saves');
      assert.equal(record.trackable, false);
      assert.equal(record.detail, 'Pulsing DMC distress signature');
    } finally {
      t2.sim.dispose();
    }
  } finally {
  }
});
