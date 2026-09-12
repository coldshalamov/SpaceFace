// PQ-155.02 — repairs, fines, insurance, restitution, and impound each print with a cause.
// Seed 15520. Economy writes the debit. The ledger only reads it.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { addCargo } from '../src/systems/cargo.js';
import {
  ECONOMY_CURVE_SINK_RECIPE,
  INSURANCE_DEFAULTS,
  SERVICE_PRICES,
  SESSION_SINK_CAUSES,
  SESSION_SINK_KINDS,
  classifySessionSink,
  economy,
} from '../src/systems/economy.js';
import { buildShipLedger } from '../src/systems/shipLedger.js';
import { createTelemetry } from '../src/systems/telemetry.js';

const SEED = 15520;
const START_CREDITS = 20000;
const RESTITUTION_CR = 180;
const IMPOUND_CR = 900;

const LIVE_CAUSES = Object.freeze({
  repair: SESSION_SINK_CAUSES.repair,
  fine: SESSION_SINK_CAUSES.fine,
  insurance: SESSION_SINK_CAUSES.insurance,
  restitution: SESSION_SINK_CAUSES.restitution,
  impound: SESSION_SINK_CAUSES.impound,
});

function boot() {
  const bus = createBus();
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.player.credits = START_CREDITS;
  const hull = {
    id: 1,
    type: 'ship',
    alive: true,
    isPlayer: true,
    hull: 50,
    hullMax: 200,
    armorHp: 0,
    armorMax: 0,
  };
  state.playerId = 1;
  state.entities.set(1, hull);
  const sys = Object.assign({}, economy);
  sys.init({ state, bus, helpers: {} });
  sys._rng = () => 0;
  const telemetry = createTelemetry(bus, state);
  return { bus, state, hull, sys, telemetry };
}

function citedSinks(state) {
  const page = buildShipLedger(state, { page: 0, pageSize: 24 });
  return page.entries.filter((entry) => (
    entry
    && SESSION_SINK_KINDS.includes(entry.beat)
    && typeof entry.cause === 'string'
    && typeof entry.text === 'string'
    && entry.text.includes(`because of the ${entry.cause}`)
  ));
}

function fireFiveSinks(ctx) {
  const { bus, state, sys } = ctx;
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_helios';
  sys._lastDockedStation = 'station_helios';
  state.simTime = 10;
  sys.handleService({ type: 'repair' });
  state.simTime = 20;
  addCargo(state, 'cmdty_narcotics', 1);
  sys.runScan({ security: 1, scannerCloak: 0, factionId: 'faction_scn' });
  state.simTime = 30;
  sys.handleService({ type: 'insurance', amount: 1 });
  state.simTime = 40;
  bus.emit('freight:cargoSpilled', {
    playerCaused: true,
    levyCr: RESTITUTION_CR,
    commodityId: 'cmdty_ore_iron',
    qty: 40,
    cause: 'combat_fire',
  });
  state.simTime = 50;
  bus.emit('economy:chargeCredits', { amount: IMPOUND_CR, reason: 'impound:pay' });
}

test('PQ-155.02 seed 15520: five sinks stay silent before the wire', () => {
  const { state, telemetry } = boot();
  try {
    const rows = citedSinks(state);
    assert.equal(rows.length, 0);
    assert.equal((state.player.sessionSinks || []).length, 0);
    assert.equal(telemetry.getRecentEvents().filter((e) => e.type === 'economy:sinkCharged').length, 0);
  } finally {
    telemetry.dispose();
  }
});

test('PQ-155.02 seed 15520: each sink appears in the session ledger with its cause', () => {
  const ctx = boot();
  const { state, telemetry } = ctx;
  try {
    const creditsBefore = state.player.credits;
    fireFiveSinks(ctx);
    const receipts = state.player.sessionSinks || [];
    assert.equal(receipts.length, 5, 'economy wrote five sink receipts');
    assert.deepEqual(receipts.map((row) => row.kind), SESSION_SINK_KINDS.slice());
    for (const kind of SESSION_SINK_KINDS) {
      const receipt = receipts.find((row) => row.kind === kind);
      assert.ok(receipt, kind);
      assert.equal(receipt.cause, LIVE_CAUSES[kind], kind);
    }

    const rows = citedSinks(state);
    assert.equal(rows.length, 5, 'ledger printed five cause-cited sinks');
    const byBeat = new Map(rows.map((row) => [row.beat, row]));
    for (const kind of SESSION_SINK_KINDS) {
      const row = byBeat.get(kind);
      assert.ok(row, `ledger missing ${kind}`);
      assert.equal(row.cause, LIVE_CAUSES[kind]);
      assert.match(row.text, new RegExp(`because of the ${LIVE_CAUSES[kind]}`));
    }

    const ring = telemetry.getRecentEvents().filter((e) => e.type === 'economy:sinkCharged');
    assert.equal(ring.length, 5);
    assert.deepEqual(ring.map((e) => e.data.kind), SESSION_SINK_KINDS.slice());
    for (const event of ring) {
      assert.equal(event.data.cause, LIVE_CAUSES[event.data.kind]);
    }

    const story = telemetry.getStorySoFar();
    assert.match(story.so, /because of the /);
    assert.ok(state.player.credits < creditsBefore, 'economy spent credits');
    assert.equal(state.player.credits, creditsBefore - (
      Math.round((200 - 50) * SERVICE_PRICES.repairCrPerHp)
      + 330
      + INSURANCE_DEFAULTS.deductibleCr
      + RESTITUTION_CR
      + IMPOUND_CR
    ));
  } finally {
    telemetry.dispose();
  }
});

test('PQ-155.02: ledger is a read-only projection and curve rates stay put', () => {
  const ctx = boot();
  const { state, telemetry } = ctx;
  try {
    fireFiveSinks(ctx);
    const before = JSON.stringify(state.player.sessionSinks);
    const first = citedSinks(state);
    const again = citedSinks(state);
    assert.equal(JSON.stringify(state.player.sessionSinks), before);
    assert.equal(again.length, 5);
    assert.deepEqual(again.map((row) => row.id), first.map((row) => row.id));
    assert.equal(classifySessionSink('service:repair'), 'repair');
    assert.equal(classifySessionSink('fine:contraband'), 'fine');
    assert.equal(classifySessionSink('service:insurance'), 'insurance');
    assert.equal(classifySessionSink('restitution:spill'), 'restitution');
    assert.equal(classifySessionSink('impound:pay'), 'impound');
    assert.equal(ECONOMY_CURVE_SINK_RECIPE.repairHpPerHour.hunter, 80);
    assert.equal(ECONOMY_CURVE_SINK_RECIPE.repairHpPerHour.trader, 16);
    assert.equal(ECONOMY_CURVE_SINK_RECIPE.repairHpPerHour.miner, 24);
    assert.equal(ECONOMY_CURVE_SINK_RECIPE.insuranceHour.hunter, 1);
    assert.equal(ECONOMY_CURVE_SINK_RECIPE.fineChancePerHour.trader, 0.2);
    assert.equal(SERVICE_PRICES.repairCrPerHp, 0.9);
    assert.equal(INSURANCE_DEFAULTS.deductibleCr, 500);
  } finally {
    telemetry.dispose();
  }
});
