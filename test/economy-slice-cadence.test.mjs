// E2 economy-slice cadence and save-cursor regressions.
//
// The economy owner is a 2 Hz calendar system. Before the per-fixed-tick drain, a pass sized for
// the owner's own cadence outlived its 5 s due period and the next due tick replaced it: the
// 60 s production profile emitted one economy:tick, drift ran once, and every later pass was
// dropped. These tests drive the real economy system under the production calendar and assert:
//   - one receipt per due period (2100 ticks / 35 s and 60 s),
//   - drift and slice sub-phases actually run,
//   - no due tick ever enters while a pass is in flight,
//   - serialize() neither advances nor emits, and the saved cursor resumes the pass.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { getSimStepProfiler } from '../src/core/simStepProfiler.js';
import { resetSimCoreFlags, setSimCoreFlags, simCoreFlagDefaults } from '../src/core/simCoreFlags.js';
import { SECTORS } from '../src/data/sectors.js';
import { allRegionalPressureRecipes } from '../src/economy/regionalSupply.js';
import { economy } from '../src/systems/economy.js';

const REGIONAL_RECIPES = Object.values(allRegionalPressureRecipes()).flat();
const DT = 1 / 60;

function bootEconomy(seed = 0xEC07_CADE) {
  const sim = createSimulation({ seed, systems: [economy] });
  sim.state.runtime = { profileId: 'production' };
  const econ = sim.registry.get('economy');
  econ.newGame();
  for (const sector of SECTORS) econ.populateSector({ sectorId: sector.id, sector });
  return { sim, state: sim.state, econ };
}

function instrument(econ) {
  const observed = {
    events: 0,
    started: 0,
    completed: 0,
    clobbered: 0,
    advances: 0,
    firstPass: null,
  };
  const realEconTick = econ.econTick;
  const realAdvance = econ._advanceEconPass;
  const realFinish = econ._finishEconTick;
  econ.econTick = function measuredEconTick(dt, state, options) {
    if (this._econPass) observed.clobbered++;
    observed.started++;
    return realEconTick.call(this, dt, state, options);
  };
  econ._advanceEconPass = function measuredAdvance(state) {
    if (!observed.firstPass && this._econPass) {
      const pass = this._econPass;
      observed.firstPass = {
        recipeStep: pass.recipeStep,
        stationStep: pass.stationStep,
        stationCount: pass.stationIds.length,
      };
    }
    observed.advances++;
    return realAdvance.call(this, state);
  };
  econ._finishEconTick = function measuredFinish(...args) {
    observed.completed++;
    return realFinish.apply(this, args);
  };
  return observed;
}

function countEvents(sim) {
  let events = 0;
  sim.bus.on('economy:tick', () => { events++; });
  return () => events;
}

test.before(() => {
  setSimCoreFlags({ ...simCoreFlagDefaults(), economySlicing: true });
});

test.after(() => {
  resetSimCoreFlags();
});

test('2100 production ticks: one economy receipt per 5 s, a completed pass, and no clobber', () => {
  const { sim, state, econ } = bootEconomy();
  const events = countEvents(sim);
  const observed = instrument(econ);
  const profiler = getSimStepProfiler();
  profiler.reset();
  profiler.setEnabled(true);
  try {
    for (let i = 0; i < 2100; i++) sim.step(DT);
    const report = profiler.snapshot();
    const drift = report.systems.find((row) => row.id === 'economy.drift');
    const slice = report.systems.find((row) => row.id === 'economy.slice');

    assert.equal(observed.clobbered, 0, 'a due tick must never be entered while a pass is in flight');
    assert.equal(events(), Math.floor((state.simTime + 1e-6) / 5),
      `receipt count must match the due periods (simTime ${state.simTime})`);
    assert.ok(observed.started >= 6, `expected one pass per due period, got ${observed.started}`);
    assert.ok(observed.completed >= observed.started - 1,
      `only the final in-flight pass may be uncompleted (${observed.completed}/${observed.started})`);
    assert.ok(drift && drift.calls > 0, 'the drift phase must actually run');
    assert.ok(slice && slice.calls > 0, 'the slice advance sub-phase must actually run');

    // The quantum covers each phase inside its three advances. This is the production data check
    // for the current recipe and station counts, not a hard-coded assumption in the test.
    assert.ok(observed.firstPass, 'the first due pass was captured');
    assert.ok(observed.firstPass.recipeStep * 3 >= REGIONAL_RECIPES.length,
      `recipe quantum ${observed.firstPass.recipeStep} x 3 must cover ${REGIONAL_RECIPES.length}`);
    assert.ok(observed.firstPass.stationStep * 3 >= observed.firstPass.stationCount,
      `station quantum ${observed.firstPass.stationStep} x 3 must cover ${observed.firstPass.stationCount}`);
    assert.ok(observed.advances / Math.max(1, observed.started) <= 9,
      `a pass must finish inside 9 advances, got ${observed.advances}/${observed.started}`);
  } finally {
    profiler.setEnabled(false);
    sim.dispose();
  }
});

test('60 s production profile: 12 receipts, non-zero drift, no dropped pass', () => {
  const { sim, state, econ } = bootEconomy(0xEC07_CAFE);
  const events = countEvents(sim);
  const observed = instrument(econ);
  const profiler = getSimStepProfiler();
  profiler.reset();
  profiler.setEnabled(true);
  try {
    for (let i = 0; i < 3600; i++) sim.step(DT);
    const report = profiler.snapshot();
    const drift = report.systems.find((row) => row.id === 'economy.drift');
    assert.equal(observed.clobbered, 0);
    assert.equal(events(), 12, '60 s of production time must emit 12 economy receipts');
    assert.equal(Math.floor((state.simTime + 1e-6) / 5), 12);
    assert.ok(drift && drift.calls > 0, 'drift must run on the shipped 60 s profile');
    assert.ok(state.economy.econClock.ticksElapsed >= 11,
      `completed passes must track the receipts, got ${state.economy.econClock.ticksElapsed}`);
  } finally {
    profiler.setEnabled(false);
    sim.dispose();
  }
});

test('serialize snapshots an in-flight pass without advancing, emitting, or changing stock', () => {
  const { sim, state, econ } = bootEconomy(0xEC07_BEEF);
  const events = countEvents(sim);
  // Run until a pass is genuinely in flight, then stop.
  let guard = 0;
  while (!econ._econPass && guard++ < 3600) sim.step(DT);
  assert.ok(econ._econPass, 'a due pass is in flight');
  const cursor = { phase: econ._econPass.phase, index: econ._econPass.index };
  const beforeMarkets = JSON.stringify(state.economy.markets);
  const beforeEvents = events();
  const data = econ.serialize();
  assert.ok(data.econPass, 'the save carries the pass cursor');
  assert.equal(econ._econPass.phase, cursor.phase, 'serialize must not advance the phase');
  assert.equal(econ._econPass.index, cursor.index, 'serialize must not advance the index');
  assert.equal(JSON.stringify(state.economy.markets), beforeMarkets,
    'a save must not change stock or prices');
  assert.equal(events(), beforeEvents, 'a save must not emit economy:tick');
  sim.dispose();
});

test('a saved in-flight pass resumes and matches an uninterrupted pass', () => {
  const a = bootEconomy(0xEC07_D00D);
  const b = bootEconomy(0xEC07_D00D);
  let guard = 0;
  while (!a.econ._econPass && guard++ < 3600) a.sim.step(DT);
  assert.ok(a.econ._econPass);
  const saved = a.econ.serialize();
  b.econ.deserialize(saved);
  b.state.tick = a.state.tick;
  b.state.simTime = a.state.simTime;
  // Run both through the rest of the pass and a little beyond.
  for (let i = 0; i < 30; i++) {
    a.sim.step(DT);
    b.sim.step(DT);
  }
  const priced = (state) => Object.fromEntries(Object.entries(state.economy.markets).map(([sid, market]) =>
    [sid, Object.fromEntries(Object.entries(market).map(([cid, row]) => [cid, {
      stock: row.stock, lastMid: row.lastMid, lastBuy: row.lastBuy, lastSell: row.lastSell,
      equilibrium: row.equilibrium, demandMult: row.demandMult,
    }]))]));
  assert.deepEqual(priced(b.state), priced(a.state),
    'the restored cursor must not replay or drop the pass remainder');
  assert.equal(b.state.economy.econClock.ticksElapsed, a.state.economy.econClock.ticksElapsed,
    'completed-pass counts must agree after resume');
  a.sim.dispose();
  b.sim.dispose();
});
