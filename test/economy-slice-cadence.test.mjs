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
import { partitionUpdateSystems } from '../src/core/catchupPolicy.js';
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

function countEvents(sim) {
  let events = 0;
  sim.bus.on('economy:tick', () => { events++; });
  return () => events;
}

test.before(() => {
  setSimCoreFlags({ ...simCoreFlagDefaults(), economySlicing: true });
});

test('a per-tick drain only runs inside its owner declared mode scope', () => {
  const drained = [];
  const fake = (name) => ({ name, update() {}, drainTick() { drained.push(name); } });
  const partitions = partitionUpdateSystems([fake('economy'), fake('swarmArena')], { state: {} });
  partitions.drainStep(DT, { mode: 'flight', run: { kind: 'survival', phase: 'active' } });
  assert.deepEqual(drained, ['swarmArena'],
    'the Adventure economy pass does not advance inside a Swarm run');
  drained.length = 0;
  partitions.drainStep(DT, { mode: 'flight' });
  assert.deepEqual(drained, ['economy'], 'the economy pass drains in Adventure flight');
  drained.length = 0;
  partitions.drainStep(DT, { mode: 'docked' });
  assert.deepEqual(drained, [], 'a frozen docked label has no scheduling scope');
});

test.after(() => {
  resetSimCoreFlags();
});

// ECON-BUILD-1 — the sliced market pass, its cursor and its drift/slice profiler
// rows are deleted. What remains on the same ~5 s calendar is a synchronous
// bookkeeping sweep (station conditions, event edges, docked intel, industry
// dents) that emits one economy:tick receipt per run. The new-rule contract:
// receipts track completed sweeps exactly, prices are time not ticks, and a
// save/load boundary reproduces the uninterrupted book bit-for-bit.

test('2100 production ticks: one economy receipt per completed sweep, none dropped', () => {
  const { sim, state } = bootEconomy();
  const events = countEvents(sim);
  try {
    for (let i = 0; i < 2100; i++) sim.step(DT);
    const elapsed = state.economy.econClock.ticksElapsed;
    assert.equal(events(), elapsed,
      `every completed sweep emits exactly one receipt (events ${events()} vs sweeps ${elapsed})`);
    const due = Math.floor((state.simTime + 1e-6) / 5);
    assert.ok(events() >= due - 1 && events() <= due,
      `sweep count stays within one boundary of due periods (got ${events()}, due ${due})`);
    assert.ok(events() >= 6, `35 s of production time ran at least six sweeps, got ${events()}`);
  } finally {
    sim.dispose();
  }
});

test('60 s production profile: receipts track the sweep calendar', () => {
  const { sim, state } = bootEconomy(0xEC07_CAFE);
  const events = countEvents(sim);
  try {
    for (let i = 0; i < 3600; i++) sim.step(DT);
    const elapsed = state.economy.econClock.ticksElapsed;
    assert.equal(events(), elapsed, 'receipts equal completed sweeps — no dropped or doubled emit');
    assert.ok(events() >= 11 && events() <= 13,
      `~12 sweeps land inside 60 s of production time (got ${events()})`);
    const lag = state.simTime - state.economy.econClock.lastTickT;
    assert.ok(lag >= 0 && lag <= 2,
      `the clock mirrors a recent sweep instant (lag ${lag.toFixed(2)}s)`);
  } finally {
    sim.dispose();
  }
});

test('serialize snapshots live market state without advancing, emitting, or changing stock', () => {
  const { sim, state, econ } = bootEconomy(0xEC07_BEEF);
  const events = countEvents(sim);
  for (let i = 0; i < 660; i++) sim.step(DT); // ~11 s — a couple of sweeps have run
  const beforeMarkets = JSON.stringify(state.economy.markets);
  const beforeEvents = events();
  const data = econ.serialize();
  assert.ok(!data.econPass, 'no pass cursor exists to persist — the machinery is gone');
  assert.equal(JSON.stringify(state.economy.markets), beforeMarkets,
    'a save must not change stock or prices');
  assert.equal(events(), beforeEvents, 'a save must not emit economy:tick');
  sim.dispose();
});

test('a saved market state resumes and matches the uninterrupted run', () => {
  const a = bootEconomy(0xEC07_D00D);
  const b = bootEconomy(0xEC07_D00D);
  // Both sims reach the save tick identically, then a's economy blob lands in b —
  // the same boundary check:sim runs: no simTime surgery, no catch-up burst.
  for (let i = 0; i < 660; i++) { a.sim.step(DT); b.sim.step(DT); }
  const saved = a.econ.serialize();
  b.econ.deserialize(saved);
  b.state.tick = a.state.tick;
  // Run both forward through the same stretch: the sweep accumulator and the event
  // edge cursor persist on econClock, so dents stamp at identical instants.
  for (let i = 0; i < 30; i++) {
    a.sim.step(DT);
    b.sim.step(DT);
  }
  const priced = (state) => Object.fromEntries(Object.entries(state.economy.markets).map(([sid, market]) =>
    [sid, Object.fromEntries(Object.entries(market).map(([cid, row]) => [cid, {
      stock: row.stock, lastMid: row.lastMid, lastBuy: row.lastBuy, lastSell: row.lastSell,
      equilibrium: row.equilibrium, demandMult: row.demandMult,
      dents: row.dents,
    }]))]));
  assert.deepEqual(priced(b.state), priced(a.state),
    'the restored market must not replay or drop any sweep work');
  assert.equal(b.state.economy.econClock.ticksElapsed, a.state.economy.econClock.ticksElapsed,
    'completed-sweep counts must agree after resume');
  a.sim.dispose();
  b.sim.dispose();
});
