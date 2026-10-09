// FB-039 — a wanted fine at a lawful dock is a decision, not a silent deduction.
// Docking at SCAN or BOUNTY tier now emits `law:fineAssessed` with `offer: true` and
// charges nothing; the reply comes back on `law:fineChoice` and the engine re-derives
// tier, price and credits against the live offer before it acts. Pay clears heat and
// debits once; work clears after the shift accrues; leave keeps the warrant; a stale
// or wrong-berth reply is refused, never charged. Seed 4242, law owner only.
import test from 'node:test';
import assert from 'node:assert/strict';

import { lawSecurity } from '../src/systems/lawSecurity.js';

function makeBus() {
  const handlers = new Map();
  const log = [];
  return {
    emitLog: log,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      handlers.set(evt, list.filter((h) => h !== fn));
    },
    emit(evt, payload) {
      log.push({ evt, payload });
      for (const fn of handlers.get(evt) || []) fn(payload);
      return true;
    },
  };
}

function makeLaw(player = {}) {
  const entities = new Map();
  const state = {
    meta: { seed: 4242 },
    simTime: 40,
    tick: 80,
    mode: 'flight',
    playerId: 'player',
    player: { heat: 0, credits: 5000, cargo: { items: {} }, ...player },
    world: { currentSectorId: 'sector_helios_prime' },
    entities,
    entityList: [],
  };
  const bus = makeBus();
  const law = Object.create(lawSecurity);
  law.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  return { state, bus, law, entities };
}

function add(run, entity) {
  run.entities.set(entity.id, entity);
  run.state.entityList.push(entity);
  return entity;
}

function events(bus, name) {
  return bus.emitLog.filter((row) => row.evt === name);
}

function lawfulStation(id = 'station_tethys') {
  return {
    id, type: 'station', alive: true, factionId: 'faction_scn',
    pos: { x: 0, z: 0 }, data: { stationId: id },
  };
}

test('FB-039: docking offers the fine — no silent charge, no free clear', () => {
  const run = makeLaw({ heat: 0.2, credits: 5000 });
  add(run, lawfulStation());

  run.bus.emit('dock:docked', { stationId: 'station_tethys' });

  const offers = events(run.bus, 'law:fineAssessed').filter((row) => row.payload.offer === true);
  assert.equal(offers.length, 1, 'the assessment is an offer, not a deduction');
  assert.equal(offers[0].payload.paid, false);
  assert.equal(offers[0].payload.amount, 250); // 150 base + 100 * heat level 1
  assert.equal(offers[0].payload.wantedTier, 'scan');
  assert.equal(events(run.bus, 'economy:chargeCredits').length, 0, 'nothing is charged before the answer');
  assert.equal(events(run.bus, 'heat:clear').length, 0, 'heat is not cleared for free');
  assert.equal(run.state.lawSecurity.fineOffer.status, 'offered');
  // The warrant obligation is on the books while the offer stands.
  const warrant = run.law.composedDisposition().find((row) => row.kind === 'warrant');
  assert.equal(warrant.advertisePay, true);
  assert.equal(warrant.amountCr, 250);
});

test('FB-039: pay clears heat and debits exactly once, even across a re-dock', () => {
  const run = makeLaw({ heat: 0.2, credits: 5000 });
  add(run, lawfulStation());

  run.bus.emit('dock:docked', { stationId: 'station_tethys' });
  run.bus.emit('law:fineChoice', { choice: 'pay', stationId: 'station_tethys' });

  const charges = events(run.bus, 'economy:chargeCredits');
  assert.equal(charges.length, 1);
  assert.equal(charges[0].payload.amount, 250);
  assert.equal(charges[0].payload.reason, 'fine:wanted_clearance');
  assert.equal(events(run.bus, 'heat:clear').length, 1);
  assert.equal(events(run.bus, 'heat:clear')[0].payload.reason, 'station_fine');
  const settled = events(run.bus, 'law:fineAssessed').find((row) => row.payload.paid === true);
  assert.equal(settled.payload.choice, 'pay');
  assert.equal(run.state.lawSecurity.fineOffer.status, 'paid');

  // Re-dock while the warrant is still warm: echo of the settled fine, never a second charge.
  run.bus.emit('dock:docked', { stationId: 'station_tethys' });
  assert.equal(events(run.bus, 'economy:chargeCredits').length, 1, 'the same fine is not charged twice');
  const echo = events(run.bus, 'law:fineAssessed').at(-1);
  assert.equal(echo.payload.alreadySettled, true);
  assert.equal(echo.payload.paid, true);
});

test('FB-039: work clears after the shift accrues — broke players still have a door', () => {
  const run = makeLaw({ heat: 0.2, credits: 10 });
  add(run, lawfulStation());

  run.bus.emit('dock:docked', { stationId: 'station_tethys' });
  assert.equal(events(run.bus, 'economy:chargeCredits').length, 0, 'no silent charge even when broke');

  run.bus.emit('law:fineChoice', { choice: 'work', stationId: 'station_tethys' });
  assert.equal(run.state.lawSecurity.fineOffer.status, 'working');
  assert.equal(events(run.bus, 'economy:chargeCredits').length, 0);
  assert.equal(events(run.bus, 'heat:clear').length, 0, 'the shift is not instant');

  run.law.update(3.9, run.state);
  assert.equal(events(run.bus, 'heat:clear').length, 0, 'under the accrual window the warrant stands');
  run.law.update(0.2, run.state);
  assert.equal(events(run.bus, 'heat:clear').length, 1);
  assert.equal(events(run.bus, 'heat:clear')[0].payload.reason, 'station_fine_work');
  const settled = events(run.bus, 'law:fineAssessed').find((row) => row.payload.paid === true);
  assert.equal(settled.payload.choice, 'work');
  assert.equal(run.state.player.heat, 0.2, 'law asks the heat owner; it never zeroes heat itself');
});

test('FB-039: leave keeps the warrant and the offer survives the next dock', () => {
  const run = makeLaw({ heat: 0.2, credits: 5000 });
  add(run, lawfulStation());

  run.bus.emit('dock:docked', { stationId: 'station_tethys' });
  run.bus.emit('law:fineChoice', { choice: 'leave', stationId: 'station_tethys' });
  assert.equal(events(run.bus, 'economy:chargeCredits').length, 0);
  assert.equal(events(run.bus, 'heat:clear').length, 0);
  assert.equal(run.state.player.heat, 0.2, 'the warrant stands');
  assert.equal(run.state.lawSecurity.fineOffer.status, 'left');

  // The next lawful dock re-opens the same assessment instead of charging or forgetting.
  run.bus.emit('dock:docked', { stationId: 'station_tethys' });
  const offers = events(run.bus, 'law:fineAssessed').filter((row) => row.payload.offer === true);
  assert.equal(offers.length, 2, 'the berth asks again while the warrant stands');
  assert.equal(run.state.lawSecurity.fineOffer.status, 'offered');

  // A late change of heart still resolves — pay after leaving clears once.
  run.bus.emit('law:fineChoice', { choice: 'pay', stationId: 'station_tethys' });
  assert.equal(events(run.bus, 'economy:chargeCredits').length, 1);
  assert.equal(events(run.bus, 'heat:clear').length, 1);
});

test('FB-039: a short pay answer keeps the offer open and never charges the attempt', () => {
  const run = makeLaw({ heat: 0.2, credits: 10 });
  add(run, lawfulStation());

  run.bus.emit('dock:docked', { stationId: 'station_tethys' });
  run.bus.emit('law:fineChoice', { choice: 'pay', stationId: 'station_tethys' });
  assert.equal(events(run.bus, 'economy:chargeCredits').length, 0, 'a refused pay attempt is free');
  assert.ok(events(run.bus, 'law:response').some((row) => row.payload.action === 'fine_unpaid'));
  assert.equal(run.state.lawSecurity.fineOffer.status, 'offered', 'the offer stays open');
  assert.equal(run.state.player.heat, 0.2);
});

test('FB-039: stale panels and wrong berths are refused, never charged', () => {
  const run = makeLaw({ heat: 0.2, credits: 5000 });
  add(run, lawfulStation());
  add(run, lawfulStation('station_forge'));

  // A reply with no offer on the counter resolves nothing.
  run.bus.emit('law:fineChoice', { choice: 'pay', stationId: 'station_tethys' });
  assert.equal(events(run.bus, 'economy:chargeCredits').length, 0);
  assert.ok(events(run.bus, 'law:fineRefused').some((row) => row.payload.reason === 'no_open_fine'));

  // Open the offer at Tethys; a reply naming Forge answers nothing there.
  run.bus.emit('dock:docked', { stationId: 'station_tethys' });
  run.bus.emit('law:fineChoice', { choice: 'pay', stationId: 'station_forge' });
  assert.equal(events(run.bus, 'economy:chargeCredits').length, 0, 'the wrong berth cannot settle the fine');
  assert.equal(run.state.lawSecurity.fineOffer.status, 'offered');

  // Settle it; a replayed stale reply afterwards still cannot charge.
  run.bus.emit('law:fineChoice', { choice: 'pay', stationId: 'station_tethys' });
  assert.equal(events(run.bus, 'economy:chargeCredits').length, 1);
  run.bus.emit('law:fineChoice', { choice: 'pay', stationId: 'station_tethys' });
  assert.equal(events(run.bus, 'economy:chargeCredits').length, 1, 'a replayed answer never double-charges');
});
