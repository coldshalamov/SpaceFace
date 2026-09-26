import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { scanner } from '../src/systems/scanner.js';
import {
  PLANET_SIGNAL_ANCHOR_DIST,
  PLANET_STATE_ASSIGNMENTS,
  planetSignalAnchor,
  planetStatesForSector,
} from '../src/data/planetStates.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';

// INFERENCE-26 (WF-10): every W1 planet-state assignment carries an authored scannerSignal —
// 'Pulsing DMC distress signature' on Shatterstone, the Razor-Ring ore band, the Crown of Thorns
// wreck ring — and collectSignalCandidates never read it. The dead world dominated the sky and
// the scanner said nothing. Now each assignment emits a far, non-trackable signal row that
// resolves to the planet's own name on full classification.
//
// Review tail: sim positions are galactic-GLOBAL (player.pos shares the space sectorGlobalOrigin
// offsets into — every spawned POI is translated the same way), so the anchor must be emitted
// around the sector's seat or the return is dead code outside Helios.

function boot(sectorId = 'sector_charon_expanse', seed = 4701, playerOffset = { x: 120, z: 80 }) {
  const sim = createSimulation({ seed, systems: [scanner] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input.actions = state.input.actions || {};
  state.world.currentSectorId = sectorId;
  state.world.activeSector = { id: sectorId, pois: [] };
  const origin = sectorGlobalOrigin(sectorId);
  const player = sim.spawn({
    type: 'ship', team: 0,
    pos: { x: origin.x + (playerOffset ? playerOffset.x : 0), z: origin.z + (playerOffset ? playerOffset.z : 0) },
    radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const events = { results: [], courses: [], tracked: [], investigated: [] };
  bus.on('signal:scanResults', (p) => events.results.push(p));
  bus.on('ui:setCourse', (p) => events.courses.push(p));
  bus.on('signal:tracked', (p) => events.tracked.push(p));
  bus.on('signal:investigated', (p) => events.investigated.push(p));
  return { sim, state, bus, player, events, origin };
}

function pulse(t) {
  t.state.input.actions.scanPulse = true;
  t.sim.runTicks(2);
}

function clearCooldown(t) {
  t.sim.runTicks(Math.ceil(8.1 / SIM_DT));
}

function lastEvent(events) {
  return events.results[events.results.length - 1];
}

function planetRow(events, bodyId) {
  const last = lastEvent(events);
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
    assert.notEqual(row.classification, 'SHATTERSTONE', 'stage 1 stays generic — the name is earned');
    assert.ok(row.distance > 8000 && row.distance < 10000,
      `the anchor hangs on the 9000-unit ring (got ${row.distance})`);
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
    assert.equal(record.stage, 3);
    assert.equal(record.classification, 'SHATTERSTONE',
      'full classification lets the sky name itself');
  } finally {
    t.sim.dispose();
  }
});

test('a shared archetype still names its own body — the Crown of Thorns is not the Razor-Ring', () => {
  const t = boot('sector_sker_haven');
  try {
    for (let i = 0; i < 3; i++) { pulse(t); if (i < 2) clearCooldown(t); }
    const records = t.state.signalInvestigation.records;
    assert.equal(records['signal:planet:planet_crown_of_thorns'].classification, 'CROWN OF THORNS',
      'the Sker wreck ring names itself, not Vesta’s Razor-Ring');
    assert.equal(records['signal:planet:planet_reach_scrawl_sker'].classification, 'THE SKER SCRAWL',
      'the Sker scrawl is its own canvas, not the archetype definite article');
  } finally {
    t.sim.dispose();
  }
});

test('the authored reveal stays authored — stage 1 detail is generic, stage 2 reads the signature', () => {
  const t = boot();
  try {
    pulse(t);
    let record = t.state.signalInvestigation.records['signal:planet:planet_shatterstone'];
    assert.equal(record.stage, 1);
    assert.notEqual(record.detail, 'Pulsing DMC distress signature',
      'stage 1 must not leak the authored signature (the ace-tag worlds pre-leak an ambush)');
    clearCooldown(t);
    pulse(t);
    record = t.state.signalInvestigation.records['signal:planet:planet_shatterstone'];
    assert.equal(record.stage, 2);
    assert.equal(record.detail, 'Pulsing DMC distress signature');
  } finally {
    t.sim.dispose();
  }
});

test('the anchor ring is visitable but never shortcuts — parking on it still earns three passes', () => {
  const t = boot();
  try {
    const assignment = PLANET_STATE_ASSIGNMENTS.find((a) => a.bodyId === 'planet_shatterstone');
    const anchor = planetSignalAnchor(assignment);
    t.player.pos.x = anchor.x;
    t.player.pos.z = anchor.z;
    pulse(t);
    const record = t.state.signalInvestigation.records['signal:planet:planet_shatterstone'];
    assert.equal(record.stage, 1,
      'distance 0 would shortcut to stage 3 — a world names itself on scans, not proximity');
    assert.ok(record.distance < 50);
  } finally {
    t.sim.dispose();
  }
});

test('the anchor is a pure hash in galactic space — ring offset from the sector seat, not Helios', () => {
  const assignment = PLANET_STATE_ASSIGNMENTS.find((a) => a.bodyId === 'planet_shatterstone');
  const origin = sectorGlobalOrigin('sector_charon_expanse');
  const a1 = planetSignalAnchor(assignment);
  const a2 = planetSignalAnchor(assignment);
  assert.deepEqual(a1, a2);
  const ringDist = Math.hypot(a1.x - origin.x, a1.z - origin.z);
  assert.ok(Math.abs(ringDist - PLANET_SIGNAL_ANCHOR_DIST) < 1,
    `anchor sits on the ring around the sector seat (got ${ringDist})`);
  assert.ok(Math.hypot(a1.x, a1.z) > 20000,
    'the Charon anchor must not collapse onto the Helios seat (the local-space bug)');
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

test('every outer-sector placement is reachable from its own seat', () => {
  for (const assignment of PLANET_STATE_ASSIGNMENTS) {
    const anchor = planetSignalAnchor(assignment);
    const origin = sectorGlobalOrigin(assignment.sectorId);
    const ringDist = Math.hypot(anchor.x - origin.x, anchor.z - origin.z);
    assert.ok(Math.abs(ringDist - PLANET_SIGNAL_ANCHOR_DIST) < 1,
      `${assignment.bodyId} anchor rings its own sector seat (got ${ringDist})`);
  }
});

test('a trackable return outranks the planet for the headline — the read never pins the deck', () => {
  const t = boot();
  try {
    // A derelict within near radius is a trackable salvage return — it, not the planet,
    // must headline the results deck (the planet row carries no verb).
    const origin = sectorGlobalOrigin('sector_charon_expanse');
    t.sim.spawn({
      type: 'wreck', team: -1,
      pos: { x: origin.x + 300, z: origin.z + 200 }, radius: 20, hull: 1, hullMax: 1,
      data: { kind: 'wreck' },
    });
    pulse(t);
    const last = lastEvent(t.events);
    assert.ok(last.primary, 'a results card is emitted');
    assert.equal(last.primary.id.startsWith('signal:planet:'), false,
      `primary must not be the untrackable planet (got ${last.primary.id})`);
    assert.notEqual(last.primary.trackable, false);
    assert.ok(last.signals.some((row) => String(row.id).startsWith('signal:planet:')),
      'the planet row is still in the list — a read, not the headline');
  } finally {
    t.sim.dispose();
  }
});

test('survey-filing a planet fails closed — a non-trackable world can never be investigated', () => {
  const t = boot();
  try {
    pulse(t);
    t.bus.emit('signal:surveyFiled', { signalId: 'signal:planet:planet_shatterstone' });
    t.sim.runTicks(2);
    const record = t.state.signalInvestigation.records['signal:planet:planet_shatterstone'];
    assert.equal(record.status, 'detected');
    assert.equal(t.events.investigated.length, 0);
    assert.equal(t.state.signalInvestigation.completed['signal:planet:planet_shatterstone'], undefined);
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
