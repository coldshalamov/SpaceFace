// M03 — a buyer posts one Ice Volatiles run with a named handling limit.
// Gentle flight pays the posted price. A hard knock spoils units off the manifest
// and the paycheck drops by exactly those units. Docking again does not pay twice.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { WARM_CARGO_CONTRACT } from '../src/data/economyContractTemplates.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import {
  FRAGILE_CARGO_HARD_DELTA_V,
  applyFragileCargoImpact,
  fragileCargoReadout,
} from '../src/systems/fragileCargo.js';

const SEED = 4242;
const LIMIT = FRAGILE_CARGO_HARD_DELTA_V;

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

function cardText(limit = LIMIT) {
  return WARM_CARGO_CONTRACT.boardText.replace('{limit}', String(limit));
}

function offerFromTemplate() {
  const text = cardText(WARM_CARGO_CONTRACT.handlingLimit);
  const qty = WARM_CARGO_CONTRACT.qty;
  return {
    id: `warm_cargo_${SEED}`,
    source: WARM_CARGO_CONTRACT.source,
    type: WARM_CARGO_CONTRACT.offerType,
    stationId: WARM_CARGO_CONTRACT.stationId,
    factionId: WARM_CARGO_CONTRACT.factionId,
    reward_cr: WARM_CARGO_CONTRACT.paysCr,
    time_limit_s: 1200,
    duration_s: 1200,
    collateral_cr: 0,
    riskTier: 0,
    minRep: 0,
    preloadedCargo: true,
    destStationId: WARM_CARGO_CONTRACT.destStationId,
    destSectorId: WARM_CARGO_CONTRACT.destSectorId,
    distance: WARM_CARGO_CONTRACT.distance,
    params: {
      cmdtyId: WARM_CARGO_CONTRACT.cmdtyId,
      qty,
      handlingLimit: WARM_CARGO_CONTRACT.handlingLimit,
      cargoValue: qty,
      fValue: 1,
      taskTime: 20,
      passengers: 0,
    },
    title: text,
    brief: text,
    summary: text,
    cause: { tag: WARM_CARGO_CONTRACT.key, axis: 'handling', line: text },
    expiresAtEpoch: 999999,
    storyTag: null,
  };
}

function boot() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.simTime = 10;
  state.tick = 600;
  state.player.credits = 5000;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 120 };
  state.world = state.world || {};
  state.world.currentSectorId = 'sector_helios_prime';
  state.ui = state.ui || {};
  state.missions.active = [];
  state.missions.boards = {};
  state.missions.completedLog = [];
  state.missions.receipts = [];
  state.missions.nextId = 1;
  state.missions.config = { refreshSec: 600, maxActive: 8 };
  state.playerId = 1;
  state.entities.set(1, {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  });
  const bus = makeBus();
  bus.on('economy:grantCredits', (p) => {
    state.player.credits += Math.max(0, Math.round(Number(p && p.amount) || 0));
  });
  const missions = Object.assign({}, missionsProto);
  missions.init({
    state, bus,
    helpers: { voice: { say: () => true }, hash32: () => 1, mulberry32: () => () => 0.5 },
    registry: { get: () => null },
  });
  bus.emit('game:started');
  state.missions.active = [];
  state.missions.boards = {};
  state.missions.receipts = [];
  state.missions.nextId = 1;
  state.ui.trackedMissionId = null;
  if (state.nav) state.nav.waypoint = null;
  state.player.credits = 5000;
  return { state, bus, missions };
}

function held(state) {
  return Math.max(0, Math.floor(Number(state.player.cargo.items[WARM_CARGO_CONTRACT.cmdtyId]) || 0));
}

function post(h) {
  const offer = offerFromTemplate();
  const posted = h.missions.postBoardOffer(offer);
  assert.equal(posted.ok, true, 'the buyer posts the volatile lot on the board');
  const row = h.state.missions.boards[offer.stationId].slots.find((slot) => slot && slot.id === offer.id);
  assert.ok(row, 'the station board is showing the run');
  return row;
}

function accept(h, row) {
  const ok = h.missions.acceptMission(row.id);
  assert.equal(ok, true, 'accepting the posted run loads the lot');
  const mission = h.state.missions.active.find((m) => m && m.status === 'active' && m.cause && m.cause.tag === WARM_CARGO_CONTRACT.key);
  assert.ok(mission, 'the run is underway');
  assert.equal(held(h.state), WARM_CARGO_CONTRACT.qty);
  return mission;
}

function knock(state, deltaV) {
  return applyFragileCargoImpact(state, {
    playerInvolved: true,
    playerDeltaV: deltaV,
    simTime: state.simTime,
    tick: state.tick,
    aId: state.playerId,
    bId: 'lane-rock',
  }, { cooldown: false });
}

function dock(h) {
  const before = h.state.player.credits;
  h.bus.emit('dock:docked', { stationId: WARM_CARGO_CONTRACT.destStationId });
  return h.state.player.credits - before;
}

const grants = (h) => h.bus.emitLog.filter((e) => e.evt === 'economy:grantCredits');

test('M03 seed 4242: the board names the handling limit, and a gentle run pays the posted price', () => {
  const h = boot();
  const row = post(h);
  const readout = fragileCargoReadout(h.state);
  const card = readout.find((item) => item && item.text);
  assert.ok(card, 'the preflight card readout names the lot');
  assert.equal(card.text, row.title);
  assert.match(card.text, /Ice Volatiles/);
  assert.match(card.text, new RegExp(`Handling limit ${LIMIT}`));
  assert.doesNotMatch(card.text, /cmdty_|volatile_lot|snake/);
  assert.equal(WARM_CARGO_CONTRACT.handlingLimit, LIMIT, 'the card limit is the fragile handling constant');
  assert.equal(row.reward_cr, WARM_CARGO_CONTRACT.paysCr);

  const mission = accept(h, row);
  assert.equal(knock(h.state, LIMIT - 1), null, 'a knock under the limit leaves the lot intact');
  assert.equal(held(h.state), WARM_CARGO_CONTRACT.qty);

  const paid = dock(h);
  assert.equal(mission.status, 'completed');
  assert.notEqual(mission.params.completionMethod, 'partial_delivery');
  assert.equal(paid, WARM_CARGO_CONTRACT.paysCr, 'careful flying pays the posted price');
  assert.equal(held(h.state), 0);
  assert.equal(h.state.player.credits, 5000 + WARM_CARGO_CONTRACT.paysCr);
});

test('M03 seed 4242: a hard knock spoils units and the paycheck drops by exactly those units', () => {
  const h = boot();
  const mission = accept(h, post(h));
  const posted = mission.reward_cr;
  const qty = WARM_CARGO_CONTRACT.qty;
  assert.equal(posted % qty, 0, 'posted price divides across the lot');

  const receipt = knock(h.state, LIMIT);
  assert.ok(receipt, 'the hard knock cracks the lot');
  const spoiled = qty - held(h.state);
  assert.equal(spoiled, receipt.totalQty);
  assert.ok(spoiled > 0);
  assert.equal(spoiled, 1, 'the handling limit cracks one unit off a ten-unit lot');

  const paid = dock(h);
  const unit = posted / qty;
  assert.equal(mission.status, 'completed');
  assert.equal(mission.params.completionMethod, 'partial_delivery');
  assert.equal(mission.params.deliveredUnits, qty - spoiled);
  assert.equal(paid, posted - spoiled * unit, 'payout drops by the spoiled units and nothing more');
  assert.equal(h.state.player.credits, 5000 + paid);

  const again = dock(h);
  assert.equal(again, 0, 'the shortfall is written off, not paid on a second docking');
  assert.equal(grants(h).length, 1);
});

test('M03 seed 4242: delivery settles once when the destination is re-entered', () => {
  const h = boot();
  accept(h, post(h));
  const first = dock(h);
  assert.equal(first, WARM_CARGO_CONTRACT.paysCr);
  const second = dock(h);
  assert.equal(second, 0);
  assert.equal(grants(h).length, 1);
  assert.equal(h.state.missions.active.some((m) => m && m.cause && m.cause.tag === WARM_CARGO_CONTRACT.key), false);
  assert.equal(h.state.player.credits, 5000 + WARM_CARGO_CONTRACT.paysCr);
});
