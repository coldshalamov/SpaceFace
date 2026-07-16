import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { canonicalStringify, snapshotSimState } from '../src/core/simSnapshot.js';

function makeState() {
  return {
    meta: { version: 1, seed: 47 },
    tick: 600,
    simTime: 10,
    mode: 'flight',
    playerId: 1,
    player: {
      credits: 5000,
      history: [{ kind: 'authoritative-player-record', at: 5 }],
    },
    input: {},
    economy: {
      markets: {
        station_test: {
          cmdty_iron: {
            stock: 720,
            equilibrium: 760,
            baseEq: 800,
            role: 'consume',
            lastMid: 42,
            lastBuy: 44,
            lastSell: 40,
            demandMult: 1.22,
            demandDrivers: [{ id: 'war-footing', delta: 0.22 }],
            eventMods: [],
            history: [{ t: -15, mid: 40 }, { t: 0, mid: 42 }],
          },
        },
      },
      cycles: {
        station_test: {
          cmdty_iron: { family: 'wave', phase: 0.25, amplitude: 0.12 },
        },
      },
      econEvents: [],
      econClock: { accumulator: 0, lastTickT: 5, ticksElapsed: 1 },
      marketIntel: {},
      rngSeed: 1234,
    },
    missions: {},
    scenario: {},
    story: {},
    combat: { beams: [] },
    entityList: [],
    settings: { gameplay: { physicsBackend: 'custom' } },
  };
}

function clone(value) {
  return structuredClone(value);
}

function snapshotHash(state) {
  return createHash('sha256')
    .update(canonicalStringify(snapshotSimState(state)))
    .digest('hex');
}

test('canonical sim snapshot ignores only derived market price-history caches', () => {
  const baseline = makeState();
  const reseeded = clone(baseline);
  reseeded.economy.markets.station_test.cmdty_iron.history = [
    { t: -5, mid: 37 },
    { t: 10, mid: 42 },
  ];

  assert.equal(snapshotHash(reseeded), snapshotHash(baseline),
    'formula-reseeded chart history must not break authoritative replay parity');

  const changedPlayerRecord = clone(baseline);
  changedPlayerRecord.player.history.push({ kind: 'authoritative-player-record', at: 9 });
  assert.notEqual(snapshotHash(changedPlayerRecord), snapshotHash(baseline),
    'history outside economy market entries must remain part of the canonical snapshot');
});

test('canonical sim snapshot retains current economy authority and persistent-demand state', () => {
  const baseline = makeState();
  const baselineHash = snapshotHash(baseline);
  const cases = [
    ['stock', (state) => { state.economy.markets.station_test.cmdty_iron.stock += 1; }],
    ['current quote', (state) => { state.economy.markets.station_test.cmdty_iron.lastBuy += 1; }],
    ['cycle', (state) => { state.economy.cycles.station_test.cmdty_iron.phase += 0.1; }],
    ['demand multiplier', (state) => { state.economy.markets.station_test.cmdty_iron.demandMult = 1.14; }],
    ['demand cause', (state) => { state.economy.markets.station_test.cmdty_iron.demandDrivers[0].id = 'blockade-relief'; }],
  ];

  for (const [label, mutate] of cases) {
    const changed = clone(baseline);
    mutate(changed);
    assert.notEqual(snapshotHash(changed), baselineHash, `${label} must remain authoritative`);
  }
});
