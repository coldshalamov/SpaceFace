import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { wrapAngle } from '../src/ai/contracts.js';
import { createBus } from '../src/core/eventBus.js';
import {
  consumePeriodicClock,
  normalizePeriodicAccumulator,
  MAX_PERIODIC_STEPS,
} from '../src/core/periodicClock.js';
import { economy } from '../src/systems/economy.js';
import { claims as claimsBase } from '../src/systems/claims.js';
import { automation } from '../src/systems/automation.js';

const WORKER = resolve(dirname(fileURLToPath(import.meta.url)), 'numeric-update-liveness.worker.mjs');
const READY_TIMEOUT_MS = 60_000;
const OP_TIMEOUT_MS = 1_500;

function runOp(op, extra = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const worker = new Worker(WORKER);
    worker.unref();
    let settled = false;
    let opTimer = null;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(readyTimer);
      if (opTimer) clearTimeout(opTimer);
      Promise.resolve(worker.terminate()).then(() => fn(value), () => fn(value));
    };
    const readyTimer = setTimeout(
      () => settle(rejectRun, new Error(`worker never reported READY for op=${op}`)),
      READY_TIMEOUT_MS,
    );
    worker.on('message', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'ready') {
        opTimer = setTimeout(
          () => settle(rejectRun, new Error(`op ${op} did not return within ${OP_TIMEOUT_MS}ms`)),
          OP_TIMEOUT_MS,
        );
      } else if (msg.type === 'done') {
        settle(resolveRun, msg);
      }
    });
    worker.on('error', (error) => settle(rejectRun, error));
    worker.on('exit', (code) => {
      if (code !== 0) settle(rejectRun, new Error(`worker exited with code ${code}`));
    });
    worker.postMessage({ op, ...extra });
  });
}

function priorWrapAngle(value) {
  let out = Number.isFinite(value) ? value : 0;
  while (out > Math.PI) out -= Math.PI * 2;
  while (out < -Math.PI) out += Math.PI * 2;
  return out;
}

function priorConsume(accumulator, dt, period, epsilon = 0, cap = Infinity) {
  let total = accumulator + dt;
  let steps = 0;
  while (steps < cap && total + epsilon >= period) {
    total -= period;
    steps++;
  }
  return { steps, accumulator: total };
}

function makeEconHost() {
  const econ = Object.create(economy);
  econ.state = {
    meta: { seed: 47 },
    simTime: 1000,
    player: {},
    entities: new Map(),
    economy: {
      markets: {},
      cycles: {},
      econEvents: [],
      econClock: { accumulator: 0, lastTickT: 0, ticksElapsed: 0 },
      marketIntel: {},
      rngSeed: 123,
    },
  };
  econ.bus = createBus();
  econ._nextEventId = 1;
  econ._eventAccumulator = 0;
  econ._installRngFunction();
  return econ;
}

function makeClaimsHost() {
  const sys = { ...claimsBase };
  sys.state = {
    meta: { seed: 5 },
    simTime: 100,
    player: { credits: 1000000 },
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: 'sector_a' },
    claims: {
      bodies: [{
        id: 'b1',
        owned: true,
        modules: [],
        spec: {
          id: 'spec_bastion',
          status: 'active',
          upkeepDebt: 0,
          store: { input: {}, output: {} },
          receipts: [],
          totals: {},
          defense: null,
        },
      }],
      meta: { rngSeed: 3, upkeepAccum: 0, raidAccum: 0, nextRaidId: 1 },
    },
  };
  sys.bus = createBus();
  sys._resumeDefenseIds = new Set();
  return sys;
}

function withCapturedWarns(fn) {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(' '));
  try {
    return fn(warnings);
  } finally {
    console.warn = original;
  }
}

for (const value of [1e30, -1e30, Number.MAX_VALUE, -Number.MAX_VALUE, Infinity, -Infinity, NaN]) {
  test(`wrapAngle(${value}) returns a bounded finite angle in a worker`, async () => {
    const msg = await runOp('wrapAngle', { value });
    assert.equal(msg.error, undefined, `op must not throw: ${JSON.stringify(msg.error)}`);
    const out = msg.result.value;
    assert.equal(Number.isFinite(out), true, `wrapAngle(${value}) must be finite`);
    assert.ok(out <= Math.PI && out >= -Math.PI, `wrapAngle(${value}) = ${out} must be inside [-PI, PI]`);
  });
}

test('wrapAngle keeps the prior wrapping arithmetic bit-for-bit on ordinary angles', () => {
  const ordinary = [0, 1, -1, 3.14, -3.14, Math.PI, -Math.PI, 4, -4, 6.5, -6.5,
    Math.PI * 2, -Math.PI * 2, 7, -7, Math.PI * 3, -Math.PI * 3, 9.4, -9.4, 0.001, -0.001];
  for (const v of ordinary) {
    assert.equal(wrapAngle(v), priorWrapAngle(v), `wrapAngle(${v}) must match the prior while-loop result`);
  }
});

test('ShipUtilitySelector returns with a huge finite self rotation on the escape-alignment path', async () => {
  const msg = await runOp('selectorHugeRot');
  assert.equal(msg.error, undefined, `selector op failed: ${JSON.stringify(msg.error)}`);
  assert.ok(msg.result.actionId === null || typeof msg.result.actionId === 'string',
    `selector must return a selection, got ${JSON.stringify(msg.result)}`);
});

test('specialist counterplay resolves a corrupted committed bearing without wedging', async () => {
  const msg = await runOp('counterplayHugeBearing');
  assert.equal(msg.error, undefined, `counterplay op failed: ${JSON.stringify(msg.error)}`);
  assert.equal(msg.result.committed, true, 'the spool cue must create the committed pass');
  assert.ok(msg.result.second === null || msg.result.second === 'cut_line' || msg.result.second === 'result',
    `committed pass must resolve, got ${JSON.stringify(msg.result)}`);
});

test('economy.update rejects a corrupted huge accumulator instead of hanging', async () => {
  const msg = await runOp('econUpdateHuge');
  assert.equal(msg.error, undefined);
  assert.equal(msg.result.threw, 'RangeError', `expected RangeError, got ${JSON.stringify(msg.result)}`);
  assert.equal(msg.result.accumulator, 1e30, 'corrupt time must not be dropped silently');
});

test('economy.econTick rejects a corrupted huge event accumulator instead of hanging', async () => {
  const msg = await runOp('econTickHuge');
  assert.equal(msg.error, undefined);
  assert.equal(msg.result.threw, 'RangeError', `expected RangeError, got ${JSON.stringify(msg.result)}`);
  assert.equal(msg.result.eventAccumulator, 1e30);
});

for (const field of ['upkeepAccum', 'raidAccum']) {
  test(`claims.update rejects a corrupted huge meta.${field} instead of hanging`, async () => {
    const msg = await runOp('claimsUpdateHuge', { field });
    assert.equal(msg.error, undefined);
    assert.equal(msg.result.threw, 'RangeError', `expected RangeError, got ${JSON.stringify(msg.result)}`);
    assert.equal(msg.result.value, 1e30);
  });
}

test('automation._updateOffscreenNetwork rejects a corrupted huge accumulator instead of hanging', async () => {
  const msg = await runOp('autoOffscreenHuge');
  assert.equal(msg.error, undefined);
  assert.equal(msg.result.threw, 'RangeError', `expected RangeError, got ${JSON.stringify(msg.result)}`);
  assert.equal(msg.result.value, 1e30);
});

for (const field of ['sell', 'raid']) {
  test(`automation._updateOutposts rejects a corrupted huge ${field} accumulator instead of hanging`, async () => {
    const msg = await runOp('autoOutpostsHuge', { field });
    assert.equal(msg.error, undefined);
    assert.equal(msg.result.threw, 'RangeError', `expected RangeError, got ${JSON.stringify(msg.result)}`);
    assert.equal(msg.result[field === 'sell' ? 'sell' : 'raid'], 1e30);
  });
}

test('consumePeriodicClock matches the prior subtract loop bit-for-bit on ordinary values', () => {
  const cases = [];
  for (const period of [5, 60, 90, 600]) {
    for (const accumulator of [0, 0.5, 1 / 60, period - 1e-9, period, period + 0.25,
      period * 2 + 0.5, period * 3 - 0.125, period * 4]) {
      for (const dt of [0, 1 / 60, 0.5, 1.75]) {
        cases.push({ accumulator, dt, period, epsilon: 0 });
        cases.push({ accumulator, dt, period, epsilon: 1e-9 });
      }
    }
  }
  for (const { accumulator, dt, period, epsilon } of cases) {
    const due = Math.floor((accumulator + dt) / period);
    if (!Number.isSafeInteger(due)) continue;
    const expected = priorConsume(accumulator, dt, period, epsilon, MAX_PERIODIC_STEPS);
    const actual = consumePeriodicClock(accumulator, dt, period, { epsilon });
    assert.equal(actual.steps, expected.steps,
      `steps differ for acc=${accumulator} dt=${dt} period=${period} eps=${epsilon}`);
    assert.equal(actual.accumulator, expected.accumulator,
      `remainder differs for acc=${accumulator} dt=${dt} period=${period} eps=${epsilon}`);
  }
});

test('consumePeriodicClock defers backlog past the cap without losing a single period', () => {
  const expected = priorConsume(100, 0, 5);
  assert.equal(expected.steps, 20);
  let remaining = 100;
  let steps = 0;
  let calls = 0;
  while (true) {
    const out = consumePeriodicClock(remaining, 0, 5);
    assert.ok(out.steps <= MAX_PERIODIC_STEPS);
    steps += out.steps;
    calls++;
    remaining = out.accumulator;
    if (out.steps === 0) break;
    assert.ok(calls < 8, 'a 20-period backlog must drain in five bounded calls');
  }
  assert.equal(steps, 20);
  assert.equal(remaining, expected.accumulator);
});

test('consumePeriodicClock raises RangeError on unsafe or malformed inputs before any work', () => {
  const bad = [
    [1e30, 0.5, 5],
    [Number.MAX_VALUE, 0, 60],
    [Infinity, 0.5, 5],
    [NaN, 0.5, 5],
    [-1, 0.5, 5],
    [0, -0.5, 5],
    [0, NaN, 5],
    [0, 0.5, 0],
    [0, 0.5, -5],
    [0, 0.5, NaN],
    [0, 0.5, Infinity],
  ];
  for (const [acc, dt, period] of bad) {
    assert.throws(() => consumePeriodicClock(acc, dt, period), RangeError,
      `consumePeriodicClock(${acc}, ${dt}, ${period}) must throw RangeError`);
  }
  assert.throws(() => consumePeriodicClock(0, 0.5, 60, { epsilon: -1 }), RangeError);
  assert.throws(() => consumePeriodicClock(0, 0.5, 60, { epsilon: NaN }), RangeError);
  assert.equal(consumePeriodicClock(-0.5e-9, 0, 60, { epsilon: 1e-9 }).steps, 0,
    'an accumulator within epsilon tolerance is accepted');
});

test('normalizePeriodicAccumulator repairs only impossible imported clocks', () => {
  assert.equal(normalizePeriodicAccumulator(0, 60), 0);
  assert.equal(normalizePeriodicAccumulator(180.25, 60), 180.25, 'a valid long backlog is preserved exactly');
  assert.equal(normalizePeriodicAccumulator(4.999999999, 5), 4.999999999);
  assert.equal(normalizePeriodicAccumulator(600, 600), 600);
  assert.equal(normalizePeriodicAccumulator(1e30, 5), 1e30 % 5);
  assert.equal(normalizePeriodicAccumulator(1e30, 60), 1e30 % 60);
  assert.equal(normalizePeriodicAccumulator(Number.MAX_VALUE, 60), Number.MAX_VALUE % 60);
  assert.equal(normalizePeriodicAccumulator(-3, 5), 0);
  assert.equal(normalizePeriodicAccumulator(NaN, 5), 0);
  assert.equal(normalizePeriodicAccumulator(Infinity, 5), 0);
  assert.equal(normalizePeriodicAccumulator('abc', 5), 0);
  assert.equal(normalizePeriodicAccumulator(undefined, 5), 0);
  assert.throws(() => normalizePeriodicAccumulator(1, 0), RangeError);
  assert.throws(() => normalizePeriodicAccumulator(1, -60), RangeError);
  assert.throws(() => normalizePeriodicAccumulator(1, NaN), RangeError);
});

test('economy.update consumes at most four due ticks and carries the remainder backlog', () => {
  const econ = makeEconHost();
  let ticks = 0;
  econ.econTick = () => { ticks++; };
  const clock = econ.state.economy.econClock;
  clock.accumulator = 25;
  econ.update(0.5, econ.state);
  assert.equal(ticks, 4, 'a 25.5s backlog runs exactly four ticks');
  assert.equal(clock.accumulator, 5.5, 'the fifth due period stays queued as backlog');
  assert.equal(econ._eventAccumulator, 0.5, 'event accumulation still lands at the original site');
  econ.update(0, econ.state);
  assert.equal(ticks, 5, 'the deferred period is paid on the next update');
  assert.equal(clock.accumulator, 0.5);
  econ.update(0.5, econ.state);
  assert.equal(ticks, 5);
  assert.equal(clock.accumulator, 1);
});

test('economy real econTick rolls at most four due event periods and defers the rest', () => {
  const econ = makeEconHost();
  econ.ensureMarket('station_test');
  let rolls = 0;
  const realRoll = econ.rollSpontaneousEvent;
  econ.rollSpontaneousEvent = (state) => { rolls++; return realRoll.call(econ, state); };
  econ._eventAccumulator = 90.5 + 4 * 90;
  econ.econTick(5, econ.state);
  assert.equal(rolls, 4, 'a 450.5s event backlog rolls four times this tick');
  assert.equal(econ._eventAccumulator, 90.5, 'the remainder stays queued');
  econ.econTick(5, econ.state);
  assert.equal(rolls, 5, 'the deferred fifth interval rolls next tick');
  assert.ok(econ._eventAccumulator < 1);
});

test('economy spontaneous rolls keep identical seeded ordering across identical runs', () => {
  const run = () => {
    const econ = makeEconHost();
    econ.ensureMarket('station_test');
    econ._eventAccumulator = 181;
    econ.econTick(5, econ.state);
    econ.econTick(5, econ.state);
    return JSON.parse(JSON.stringify(econ.state.economy.econEvents));
  };
  const first = run();
  const second = run();
  assert.ok(first.length >= 1, 'due event intervals still roll real events');
  assert.deepEqual(first, second, 'seeded event ordering is deterministic through the bounded loop');
});

test('economy.deserialize repairs impossible clocks, preserves valid metadata, and never mutates the payload', () => {
  const econ = makeEconHost();
  const data = {
    econClock: { accumulator: 1e30, lastTickT: 700, ticksElapsed: 41 },
    eventAccumulator: 1e30,
    rngSeed: 77,
  };
  withCapturedWarns((warnings) => {
    econ.deserialize(data);
    assert.ok(warnings.some((w) => w.includes('econClock.accumulator')),
      `repair warns with the field name, got ${JSON.stringify(warnings)}`);
    assert.ok(warnings.some((w) => w.includes('eventAccumulator')),
      `repair warns with the field name, got ${JSON.stringify(warnings)}`);
  });
  const clock = econ.state.economy.econClock;
  assert.equal(clock.accumulator, 1e30 % 5);
  assert.equal(clock.lastTickT, 700, 'other clock metadata survives');
  assert.equal(clock.ticksElapsed, 41);
  assert.equal(econ._eventAccumulator, 1e30 % 90);
  assert.equal(data.econClock.accumulator, 1e30, 'the raw save payload is not mutated');
  assert.notEqual(clock, data.econClock, 'restored clock must not alias the save payload');
});

test('economy.deserialize repairs a deep-frozen impossible clock without throwing or mutating it', () => {
  const econ = makeEconHost();
  const data = Object.freeze({
    econClock: Object.freeze({ accumulator: 1e30, lastTickT: 700, ticksElapsed: 41 }),
    eventAccumulator: 1e30,
    rngSeed: 77,
  });
  withCapturedWarns(() => {
    econ.deserialize(data);
  });
  const clock = econ.state.economy.econClock;
  assert.equal(clock.accumulator, 1e30 % 5);
  assert.equal(clock.lastTickT, 700, 'valid clock metadata survives the frozen repair');
  assert.equal(clock.ticksElapsed, 41);
  assert.equal(econ._eventAccumulator, 1e30 % 90);
  assert.equal(data.econClock.accumulator, 1e30, 'the frozen payload is untouched');
});

test('economy.deserialize preserves a valid long backlog and repeated restore never replays it', () => {
  const econ = makeEconHost();
  let ticks = 0;
  econ.econTick = () => { ticks++; };
  withCapturedWarns((warnings) => {
    econ.deserialize({ econClock: { accumulator: 23.25, lastTickT: 9, ticksElapsed: 3 }, eventAccumulator: 91, rngSeed: 77 });
    assert.equal(warnings.length, 0, `valid clocks restore without warnings, got ${JSON.stringify(warnings)}`);
  });
  const clock = econ.state.economy.econClock;
  assert.equal(clock.accumulator, 23.25, 'a valid backlog survives the restore');
  econ.update(0.5, econ.state);
  assert.equal(ticks, 4);
  assert.equal(clock.accumulator, 3.75);
  withCapturedWarns(() => {
    econ.deserialize({ econClock: { accumulator: 0, lastTickT: 9, ticksElapsed: 3 }, eventAccumulator: 0, rngSeed: 77 });
  });
  assert.equal(econ.state.economy.econClock.accumulator, 0);
  econ.update(0.5, econ.state);
  assert.equal(ticks, 4, 'a later restore must not replay the first payload backlog');
  assert.equal(econ.state.economy.econClock.accumulator, 0.5);
});

test('claims.update consumes bounded upkeep and raid periods and carries the remainder', () => {
  const sys = makeClaimsHost();
  let upkeep = 0;
  let raids = 0;
  sys._settleUpkeep = () => { upkeep++; };
  sys._rollRaids = () => { raids++; };
  const meta = sys.state.claims.meta;
  meta.upkeepAccum = 245;
  meta.raidAccum = 605.5;
  sys.update(0.5, sys.state);
  assert.equal(upkeep, 4, 'upkeep backlog runs four settlements');
  assert.equal(raids, 1, 'one due raid window rolls once');
  assert.equal(meta.upkeepAccum, 5.5);
  assert.equal(meta.raidAccum, 6);
  sys.update(0, sys.state);
  assert.equal(upkeep, 4);
  assert.equal(raids, 1);
  meta.upkeepAccum = 60;
  sys.update(0, sys.state);
  assert.equal(upkeep, 5, 'carried backlog is paid once it matures');
});

test('claims.deserialize repairs impossible accumulators, preserves parked refinery work and the payload', () => {
  const sys = makeClaimsHost();
  const data = {
    bodies: [{
      id: 'b1',
      owned: true,
      modules: [],
      pos: { x: 0, z: 0 },
      spec: {
        id: 'spec_refinery',
        status: 'active',
        acc: 17.5,
        store: { input: {}, output: {} },
        receipts: [],
        totals: {},
        defense: null,
      },
    }],
    meta: { rngSeed: 3, upkeepAccum: 1e30, raidAccum: 180.25, nextRaidId: 4 },
  };
  withCapturedWarns((warnings) => {
    sys.deserialize(data);
    assert.ok(warnings.some((w) => w.includes('meta.upkeepAccum')),
      `repair warns with the field name, got ${JSON.stringify(warnings)}`);
  });
  const meta = sys.state.claims.meta;
  assert.equal(meta.upkeepAccum, 1e30 % 60);
  assert.equal(meta.raidAccum, 180.25, 'a valid raid backlog survives');
  assert.equal(meta.nextRaidId, 4);
  assert.equal(sys.state.claims.bodies[0].spec.acc, 17.5, 'parked refinery work is not normalized');
  assert.equal(data.meta.upkeepAccum, 1e30, 'the raw save payload is not mutated');
  assert.notEqual(meta, data.meta, 'restored meta must not alias the save payload');
});

test('automation._updateOffscreenNetwork consumes bounded periods with the existing epsilon', () => {
  const auto = Object.create(automation);
  const settled = [];
  auto._settleOffscreenNetwork = (elapsed) => settled.push(elapsed);
  const a = { accumulators: { offscreenNetworkS: 245 } };
  auto._updateOffscreenNetwork(0.5, a);
  assert.equal(settled.length, 4);
  assert.ok(settled.every((s) => s === 60), 'each settle receives the period, not the backlog');
  assert.equal(a.accumulators.offscreenNetworkS, 5.5);
  settled.length = 0;
  auto._updateOffscreenNetwork(0, a);
  assert.equal(settled.length, 0);
  a.accumulators.offscreenNetworkS = 59.999999999;
  auto._updateOffscreenNetwork(0, a);
  const expectedBoundary = priorConsume(59.999999999, 0, 60, 1e-9);
  assert.equal(settled.length, expectedBoundary.steps, 'the epsilon boundary matches the prior algorithm');
  assert.equal(a.accumulators.offscreenNetworkS, expectedBoundary.accumulator);
});

test('automation._updateOutposts consumes bounded autosell and raid periods', () => {
  const auto = Object.create(automation);
  auto.state = { world: { currentSectorId: 'sector_a' } };
  let sells = 0;
  let raids = 0;
  auto._outpostAutosell = () => { sells++; };
  auto._outpostRaids = () => { raids++; };
  const a = { outposts: [{ id: 'o1', sectorId: 'sector_b' }] };
  auto._outpostSellAccum = 245;
  auto._outpostRaidAccum = 605.5;
  auto._updateOutposts(0.5, a);
  assert.equal(sells, 4);
  assert.equal(raids, 1);
  assert.equal(auto._outpostSellAccum, 5.5);
  assert.equal(auto._outpostRaidAccum, 6);
  auto._updateOutposts(0, a);
  assert.equal(sells, 4);
  assert.equal(raids, 1);
});

test('automation._flushOffscreenNetworkBeforeSectorTransition settles valid pending exactly and repairs impossible fields', () => {
  const auto = Object.create(automation);
  const settled = [];
  auto._settleOffscreenNetwork = (elapsed, aRef, sector) => settled.push({ elapsed, sector });
  auto.state = { world: { currentSectorId: 'sector_a' }, automation: { accumulators: { offscreenNetworkS: 180.25 } } };
  auto._flushOffscreenNetworkBeforeSectorTransition('sector_a');
  assert.equal(settled.length, 1);
  assert.equal(settled[0].elapsed, 180.25, 'a valid pending time settles in full, never truncated');
  assert.equal(settled[0].sector, 'sector_a');
  assert.equal(auto.state.automation.accumulators.offscreenNetworkS, 0);
  settled.length = 0;
  auto.state.automation.accumulators.offscreenNetworkS = 1e30;
  withCapturedWarns((warnings) => {
    auto._flushOffscreenNetworkBeforeSectorTransition('sector_a');
    assert.ok(warnings.some((w) => w.includes('offscreenNetworkS')),
      `repair warns with the field name, got ${JSON.stringify(warnings)}`);
  });
  assert.equal(settled.length, 1);
  assert.equal(settled[0].elapsed, 1e30 % 60, 'an impossible pending field is bounded before settlement');
  assert.equal(auto.state.automation.accumulators.offscreenNetworkS, 0);
});

test('automation.deserialize repairs an impossible offscreen accumulator without mutating the payload', () => {
  const auto = Object.create(automation);
  auto.state = {
    meta: { seed: 1 },
    simTime: 50,
    world: { currentSectorId: 'sector_a' },
    automation: { outposts: [] },
  };
  const data = {
    accumulators: { offscreenNetworkS: 1e30, creditBuffer: 12, upkeepDebt: 3 },
    drones: [],
    traders: [],
    outposts: [],
    fleet: [],
    meta: { rngSeed: 9 },
  };
  withCapturedWarns((warnings) => {
    auto.deserialize(data);
    assert.ok(warnings.some((w) => w.includes('offscreenNetworkS')),
      `repair warns with the field name, got ${JSON.stringify(warnings)}`);
  });
  const acc = auto.state.automation.accumulators;
  assert.equal(acc.offscreenNetworkS, 1e30 % 60);
  assert.equal(acc.creditBuffer, 12);
  assert.equal(acc.upkeepDebt, 3);
  assert.equal(data.accumulators.offscreenNetworkS, 1e30, 'the raw save payload is not mutated');
  assert.notEqual(acc, data.accumulators, 'restored accumulators must not alias the save payload');
  auto.state.automation.accumulators.offscreenNetworkS = 180.25;
  withCapturedWarns((warnings) => {
    auto.deserialize({ accumulators: { offscreenNetworkS: 0, creditBuffer: 0, upkeepDebt: 0 } });
    assert.equal(warnings.length, 0);
  });
  assert.equal(auto.state.automation.accumulators.offscreenNetworkS, 0,
    'a second restore must not replay the previous backlog');
});
