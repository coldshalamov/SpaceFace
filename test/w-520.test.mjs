// W-520 — The Bloom tide (build_map §34 row 520)
// A per-sector infestation level spreads along lanes with unclaimed wrecks, falls
// with clears and gardens, persists, and is deterministic under a fixed seed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { worldPressure } from '../src/systems/worldPressure.js';
import { TIDE, tideBand, WORLD_PRESSURE_CAPS } from '../src/data/worldPressure.js';
import { SECTORS } from '../src/data/sectors.js';
import { CAL_DAY_S } from '../src/data/worldCalendar.js';

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));

function makeBus() {
  const emitted = [];
  return {
    emitted,
    emit(event, payload) { emitted.push({ event, payload }); },
    on() { return () => {}; },
    off() {},
  };
}

function makeState(simTime = 0) {
  return {
    simTime,
    tick: 0,
    playerId: 'player_1',
    world: {
      currentSectorId: 'sector_sker_haven',
      discovery: Object.fromEntries(SECTORS.map((s) => [s.id, { discovered: true }])),
      sectors: {},
    },
    entities: new Map(),
    entityList: [],
    aftermathWrecks: { bySector: {} },
    understory: { gardens: {}, compost: {}, tidePushback: {} },
  };
}

function makeSystem(state, bus = makeBus()) {
  const sys = Object.create(worldPressure);
  sys.init({ state, bus, helpers: { spawnEntity: () => null } });
  sys.newGame();
  return sys;
}

/** Advance whole days, ticking the system once at each day's start. */
function runDays(sys, state, days) {
  for (let i = 0; i < days; i++) {
    state.simTime += CAL_DAY_S;
    sys.update(1 / 60, state);
  }
}

function wreckMarker(id, units = { cmdty_scrap_metal: 2 }) {
  return { markerId: id, salvagePool: units, sectorId: null };
}

test('w-520: a sector with unclaimed wrecks climbs the tide over N days', () => {
  const state = makeState();
  const bus = makeBus();
  const sys = makeSystem(state, bus);
  state.aftermathWrecks.bySector['sector_kepler_scar'] = [wreckMarker('m1'), wreckMarker('m2'), wreckMarker('m3')];

  runDays(sys, state, 10);
  const level = state.worldPressure.tide['sector_kepler_scar'] || 0;
  assert.ok(level > 0.15, `tide should climb with rot on the lane (got ${level})`);
  assert.equal(tideBand(level) !== 'clear', true);
});

test('w-520: the tide bleeds along lanes whose endpoints hold wrecks', () => {
  const state = makeState();
  const sys = makeSystem(state);
  // Rot in Kepler; Sker Haven is its lane neighbor.
  state.aftermathWrecks.bySector['sector_kepler_scar'] = [wreckMarker('m1'), wreckMarker('m2')];
  runDays(sys, state, 15);
  const source = state.worldPressure.tide['sector_kepler_scar'] || 0;
  const lane = state.worldPressure.tide['sector_sker_haven'] || 0;
  assert.ok(source > 0.1, `source sector infested (got ${source})`);
  assert.ok(lane > 0, `tide should bleed onto the lane neighbor (got ${lane})`);
  assert.ok(lane < source, 'spread stays a fraction of the source field');
});

test('w-520: a cleared lane drops its level vs. the neglected control', () => {
  // Two identical fixed-seed runs; the only difference is one salvage:completed.
  const runA = { state: makeState() };
  const runB = { state: makeState() };
  runA.bus = makeBus(); runB.bus = makeBus();
  runA.sys = makeSystem(runA.state, runA.bus);
  runB.sys = makeSystem(runB.state, runB.bus);
  for (const r of [runA, runB]) {
    r.state.aftermathWrecks.bySector['sector_kepler_scar'] = [wreckMarker('m1'), wreckMarker('m2')];
    runDays(r.sys, r.state, 8);
  }
  // Run A clears a wreck — the receipt lands in the day's buffer.
  runA.bus.emit('salvage:completed', { sectorId: 'sector_kepler_scar', markerId: 'm1' });
  // …and the marker is drained (the pool reads cleared).
  runA.state.aftermathWrecks.bySector['sector_kepler_scar'][0].salvagePool = {};
  for (const r of [runA, runB]) runDays(r.sys, r.state, 4);
  const cleared = runA.state.worldPressure.tide['sector_kepler_scar'] || 0;
  const neglected = runB.state.worldPressure.tide['sector_kepler_scar'] || 0;
  assert.ok(cleared < neglected, `cleared lane (${cleared}) must drop below neglected (${neglected})`);
  assert.ok(neglected > 0, 'the neglected lane keeps rising');
});

test('w-520: a fed Understory garden pushes the tide back', () => {
  const runA = { state: makeState() };
  const runB = { state: makeState() };
  runA.sys = makeSystem(runA.state, makeBus());
  runB.sys = makeSystem(runB.state, makeBus());
  for (const r of [runA, runB]) {
    r.state.aftermathWrecks.bySector['sector_kepler_scar'] = [wreckMarker('m1')];
  }
  // The garden fact: understoryGardens owns this sum; the tide only reads it.
  runA.state.understory.tidePushback['sector_kepler_scar'] = 0.24;
  runDays(runA.sys, runA.state, 10);
  runDays(runB.sys, runB.state, 10);
  const gardened = runA.state.worldPressure.tide['sector_kepler_scar'] || 0;
  const feral = runB.state.worldPressure.tide['sector_kepler_scar'] || 0;
  assert.ok(gardened < feral, `garden pushback (${gardened}) beats feral rot (${feral})`);
});

test('w-520: deterministic — identical inputs produce identical tide fields', () => {
  const runs = [makeState(), makeState()];
  const systems = runs.map((s) => makeSystem(s, makeBus()));
  for (const s of runs) {
    s.aftermathWrecks.bySector['sector_io_reach'] = [wreckMarker('mA'), wreckMarker('mB')];
  }
  for (const sys of systems) runDays(sys, runs[systems.indexOf(sys)], 12);
  assert.deepEqual(runs[0].worldPressure.tide, runs[1].worldPressure.tide);
});

test('w-520: the tide persists through serialize/deserialize', () => {
  const state = makeState();
  const sys = makeSystem(state);
  state.aftermathWrecks.bySector['sector_nereid_shoal'] = [wreckMarker('m1')];
  runDays(sys, state, 10);
  const before = state.worldPressure.tide;
  const snap = JSON.parse(JSON.stringify(sys.serialize()));
  // Bound: every persisted key is a real sector, every level inside [0,1].
  for (const [id, v] of Object.entries(snap.tide)) {
    assert.ok(SECTOR_BY_ID.has(id), `tide key ${id} is a real sector`);
    assert.ok(v > 0 && v <= TIDE.max, `tide ${v} bounded`);
  }
  const restored = makeState();
  const sys2 = makeSystem(restored);
  sys2.deserialize(snap);
  assert.deepEqual(restored.worldPressure.tide, before);
});

test('w-520: band crossings on charted sectors leave a bounded notice trail', () => {
  const state = makeState();
  const bus = makeBus();
  const sys = makeSystem(state, bus);
  state.aftermathWrecks.bySector['sector_kepler_scar'] = [wreckMarker('m1'), wreckMarker('m2'), wreckMarker('m3')];
  runDays(sys, state, 20);
  const notices = state.worldPressure.tideNotices;
  assert.ok(notices.length <= WORLD_PRESSURE_CAPS.tideNotices, 'trivial notices stay capped');
  const emitted = bus.emitted.filter((e) => e.event === 'worldPressure:tideChanged');
  assert.ok(emitted.length > 0, 'a band crossing reports where the player can hear it');
  const impulses = bus.emitted.filter((e) => e.event === 'sectorsim:impulse' && e.payload.kind === 'bloom_tide');
  assert.ok(impulses.length > 0, 'infested sectors feed the danger field');
});
