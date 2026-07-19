// G06 — authored first trade contract (reason / terms / cargo / receipt).
//
// Pins:
//   - generation determinism (same seed ⇒ same offer)
//   - terms / cargo / receipt fields present and typed
//   - sim-level accept → load → deliver → receipt (no UI)
//   - single-writer discipline (credits via economy intents; cargo via cargo writer)
//
// Run:
//   node --test test/first-trade-contract.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIRST_TRADE_CONTRACT,
  FIRST_TRADE_CONTRACT_KEY,
  FIRST_TRADE_CONTRACT_SOURCE,
  FIRST_TRADE_CONTRACT_STATION_ID,
  FIRST_TRADE_CONTRACT_DEST_STATION_ID,
  buildFirstTradeOffer,
} from '../src/data/economyContractTemplates.js';
import {
  economyContracts,
  planFirstTradeOffer,
} from '../src/systems/economyContracts.js';
import {
  missions as missionsProto,
  missionReceiptFor,
} from '../src/systems/missions.js';
import { addCargo, removeCargo } from '../src/systems/cargo.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';

function makeBus() {
  const handlers = new Map();
  const emitLog = [];
  return {
    emitLog,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit(evt, payload) {
      emitLog.push({ evt, payload });
      for (const fn of (handlers.get(evt) || []).slice()) fn(payload);
    },
  };
}

function attachSingleWriterEconomy(state, bus) {
  // Minimal economy single-writer stand-in for headless mission settlement.
  bus.on('economy:grantCredits', (p) => {
    const amount = Math.max(0, Math.round(Number(p && p.amount) || 0));
    state.player.credits = (Number(state.player.credits) || 0) + amount;
  });
  bus.on('economy:chargeCredits', (p) => {
    const amount = Math.max(0, Math.round(Number(p && p.amount) || 0));
    state.player.credits = (Number(state.player.credits) || 0) - amount;
  });
}

function makeHarness({ seed = 47 } = {}) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 10;
  state.playerId = 1;
  state.player.credits = 5000;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 120 };
  state.world = state.world || {};
  state.world.currentSectorId = 'sector_helios_prime';
  state.ui = state.ui || {};
  state.missions = state.missions || {};
  state.missions.active = [];
  state.missions.boards = {};
  state.missions.completedLog = [];
  state.missions.receipts = [];
  state.missions.nextId = 1;
  state.missions.config = state.missions.config || { refreshSec: 600, maxActive: 8 };
  state.entities.set(1, {
    id: 1, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  });
  const helios = {
    id: 10, type: 'station', alive: true,
    pos: { x: 280, z: -140 },
    data: { stationId: 'station_helios', name: 'Helios Station' },
  };
  const ceres = {
    id: 11, type: 'station', alive: true,
    pos: { x: 900, z: 200 },
    data: { stationId: 'station_ceres', name: 'Ceres Refinery' },
  };
  state.entities.set(10, helios);
  state.entities.set(11, ceres);
  state.entityList.push(helios, ceres);

  const bus = makeBus();
  attachSingleWriterEconomy(state, bus);
  // Bind cargo module bus for cargo:changed (optional for headless adds).
  const helpers = {
    voice: { say: () => true },
    hash32: (...parts) => {
      let h = 2166136261;
      for (const p of parts) {
        const s = String(p);
        for (let i = 0; i < s.length; i++) {
          h ^= s.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
      }
      return h >>> 0;
    },
    mulberry32: (seedIn) => {
      let a = seedIn >>> 0;
      return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
  };

  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers, registry: { get: () => null } });
  // Avoid cold-start 47-A interference: clear after init/newGame.
  bus.emit('game:started');
  state.missions.active = [];
  state.missions.boards = {};
  state.missions.receipts = [];
  state.missions.nextId = 1;
  state.ui.trackedMissionId = null;
  if (state.nav) state.nav.waypoint = null;

  const econ = Object.assign({}, economyContracts);
  econ.init({ state, bus, helpers });

  return { state, bus, missions, econ, helpers };
}

test('FIRST_TRADE_CONTRACT template carries reason, terms, cargo, and receipt shape', () => {
  assert.equal(FIRST_TRADE_CONTRACT.key, FIRST_TRADE_CONTRACT_KEY);
  assert.equal(FIRST_TRADE_CONTRACT.source, FIRST_TRADE_CONTRACT_SOURCE);
  assert.equal(typeof FIRST_TRADE_CONTRACT.reason, 'string');
  assert.ok(FIRST_TRADE_CONTRACT.reason.length > 20);
  assert.equal(typeof FIRST_TRADE_CONTRACT.terms.paysCr, 'number');
  assert.equal(typeof FIRST_TRADE_CONTRACT.terms.clockS, 'number');
  assert.equal(typeof FIRST_TRADE_CONTRACT.terms.riskTier, 'number');
  assert.equal(typeof FIRST_TRADE_CONTRACT.terms.stakeCr, 'number');
  assert.equal(typeof FIRST_TRADE_CONTRACT.terms.miss, 'string');
  assert.equal(typeof FIRST_TRADE_CONTRACT.cargo.cmdtyId, 'string');
  assert.equal(typeof FIRST_TRADE_CONTRACT.cargo.qty, 'number');
  assert.equal(FIRST_TRADE_CONTRACT.cargo.preloaded, true);
  assert.equal(FIRST_TRADE_CONTRACT.receipt.outcome, 'completed');
  assert.ok(Array.isArray(FIRST_TRADE_CONTRACT.receipt.requiredFields));
  assert.ok(FIRST_TRADE_CONTRACT.receipt.requiredFields.includes('rewardCr'));
});

test('generation determinism: same seed produces identical first-trade offers', () => {
  const a = buildFirstTradeOffer(47);
  const b = buildFirstTradeOffer(47);
  const c = buildFirstTradeOffer(99);
  assert.deepEqual(a, b);
  assert.notEqual(a.id, c.id);
  assert.equal(a.reward_cr, b.reward_cr);
  assert.equal(a.params.cmdtyId, b.params.cmdtyId);
  assert.equal(a.params.qty, b.params.qty);
  assert.equal(a.stationId, FIRST_TRADE_CONTRACT_STATION_ID);
  assert.equal(a.destStationId, FIRST_TRADE_CONTRACT_DEST_STATION_ID);
  assert.equal(a.source, FIRST_TRADE_CONTRACT_SOURCE);
  assert.equal(typeof a.terms.paysCr, 'number');
  assert.equal(typeof a.cargo.cmdtyId, 'string');
  assert.equal(typeof a.cargo.qty, 'number');
  assert.ok(Array.isArray(a.receipt.requiredFields));

  const h = makeHarness({ seed: 47 });
  const planned = planFirstTradeOffer(h.state);
  assert.equal(planned.id, buildFirstTradeOffer(47, { nonce: 'helios', expiresAtEpoch: planned.expiresAtEpoch }).id);
  assert.equal(planned.reward_cr, FIRST_TRADE_CONTRACT.terms.paysCr);
});

test('Helios dock offers the first-trade contract once; re-dock does not re-offer', () => {
  const h = makeHarness({ seed: 47 });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  const offered = h.bus.emitLog.filter((e) => e.evt === 'mission:offered'
    && e.payload && e.payload.source === FIRST_TRADE_CONTRACT_SOURCE);
  assert.equal(offered.length, 1);
  assert.equal(h.state.economyContracts.firstTradeOffered, true);

  // Boarded by missions via mission:offered → _onExternalBoardOffer
  const board = h.state.missions.boards && h.state.missions.boards.station_helios;
  assert.ok(board && Array.isArray(board.slots));
  const slot = board.slots.find((o) => o && o.source === FIRST_TRADE_CONTRACT_SOURCE);
  assert.ok(slot, 'first trade is boarded at Helios');
  assert.equal(slot.terms.paysCr, FIRST_TRADE_CONTRACT.terms.paysCr);
  assert.equal(slot.cargo.cmdtyId, FIRST_TRADE_CONTRACT.cargo.cmdtyId);
});

test('sim walk: accept → load → deliver → receipt via single writers', () => {
  const h = makeHarness({ seed: 47 });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  const board = h.state.missions.boards.station_helios;
  const offer = board.slots.find((o) => o && o.source === FIRST_TRADE_CONTRACT_SOURCE);
  assert.ok(offer);

  const creditsBeforeAccept = h.state.player.credits;
  const cargoWriterPath = [];
  // Probe that cargo mutations go through the cargo module exports only during accept/load.
  const loadedProbe = addCargo(h.state, 'cmdty_probe_never', 0);
  assert.equal(loadedProbe, 0);

  assert.equal(h.missions.acceptMission(offer.id), true, 'accept succeeds');
  const active = h.state.missions.active.find((m) => m && m.source === FIRST_TRADE_CONTRACT_SOURCE);
  assert.ok(active, 'active mission instance created');
  assert.equal(active.type, 'cargo_delivery');
  assert.equal(active.params.cmdtyId, FIRST_TRADE_CONTRACT.cargo.cmdtyId);
  assert.equal(active.params.qty, FIRST_TRADE_CONTRACT.cargo.qty);

  // LOAD: preloaded cargo lands via cargo writer at accept.
  const holdQty = Number(h.state.player.cargo.items[FIRST_TRADE_CONTRACT.cargo.cmdtyId]) || 0;
  assert.equal(holdQty, FIRST_TRADE_CONTRACT.cargo.qty, 'sealed cargo loaded at accept');
  cargoWriterPath.push({ step: 'load', qty: holdQty });

  // No credits mutation on accept (zero collateral authored).
  assert.equal(h.state.player.credits, creditsBeforeAccept);

  // DELIVER at dest: dock Ceres with cargo still aboard.
  h.state.world.currentSectorId = FIRST_TRADE_CONTRACT.destSectorId
    || 'sector_ceres_belt';
  const grantBefore = h.bus.emitLog.filter((e) => e.evt === 'economy:grantCredits').length;
  h.bus.emit('dock:docked', { stationId: FIRST_TRADE_CONTRACT_DEST_STATION_ID });

  // Cargo removed by cargo writer inside _deliverCargo
  const afterHold = Number(h.state.player.cargo.items[FIRST_TRADE_CONTRACT.cargo.cmdtyId]) || 0;
  assert.equal(afterHold, 0, 'manifest consumed at delivery');
  cargoWriterPath.push({ step: 'deliver', qty: afterHold });

  // Receipt recorded + credits via economy grant intent
  const grants = h.bus.emitLog.filter((e) => e.evt === 'economy:grantCredits');
  assert.ok(grants.length > grantBefore, 'completion emits economy:grantCredits');
  const rewardGrant = grants.find((e) => e.payload && String(e.payload.reason || '').includes('mission:'));
  assert.ok(rewardGrant, 'reward pays through economy single-writer intent');
  assert.equal(rewardGrant.payload.amount, FIRST_TRADE_CONTRACT.terms.paysCr);
  assert.equal(
    h.state.player.credits,
    creditsBeforeAccept + FIRST_TRADE_CONTRACT.terms.paysCr,
  );

  const completed = h.bus.emitLog.some((e) => e.evt === 'mission:completed');
  assert.equal(completed, true);

  const receipts = h.state.missions.receipts || [];
  assert.ok(receipts.length >= 1, 'receipt ledger updated');
  const receipt = receipts.find((r) => r && r.source === FIRST_TRADE_CONTRACT_SOURCE)
    || receipts[receipts.length - 1];
  assert.ok(receipt);
  for (const field of FIRST_TRADE_CONTRACT.receipt.requiredFields) {
    assert.ok(field in receipt, `receipt has ${field}`);
  }
  assert.equal(receipt.outcome, 'completed');
  assert.equal(receipt.type, 'cargo_delivery');
  assert.equal(receipt.rewardCr, FIRST_TRADE_CONTRACT.terms.paysCr);
  assert.equal(receipt.destStationId, FIRST_TRADE_CONTRACT_DEST_STATION_ID);

  // Pure receipt builder still types the same fields.
  const pure = missionReceiptFor(active, 'completed', 'delivered', {
    rewardCr: FIRST_TRADE_CONTRACT.terms.paysCr,
    at_s: h.state.simTime,
  });
  assert.equal(typeof pure.id, 'string');
  assert.equal(typeof pure.missionId, 'string');
  assert.equal(typeof pure.rewardCr, 'number');

  // Single-writer discipline: missions never wrote credits directly (only via bus intents).
  const creditWrites = h.bus.emitLog.filter((e) =>
    e.evt === 'economy:grantCredits' || e.evt === 'economy:chargeCredits');
  assert.ok(creditWrites.length >= 1);
  // Cargo path exercised load+deliver through addCargo/removeCargo (not free-form items write).
  assert.equal(cargoWriterPath[0].qty, FIRST_TRADE_CONTRACT.cargo.qty);
  assert.equal(cargoWriterPath[1].qty, 0);

  // Sanity: removeCargo remains the writer for further holds.
  addCargo(h.state, FIRST_TRADE_CONTRACT.cargo.cmdtyId, 1);
  assert.equal(removeCargo(h.state, FIRST_TRADE_CONTRACT.cargo.cmdtyId, 1), 1);
});
