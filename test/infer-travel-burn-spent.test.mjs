// A travel burn that empties the tank says so once. The boost hold does not repeat it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { TRAVEL_FLAGS } from '../src/data/featureFlags.js';
import { debitTravelBurn, flightV3 } from '../src/systems/flightV3.js';

let previousTravelBurn = false;
test.before(() => {
  previousTravelBurn = TRAVEL_FLAGS.travelBurn;
  TRAVEL_FLAGS.travelBurn = true;
});
test.after(() => { TRAVEL_FLAGS.travelBurn = previousTravelBurn; });

function rig(energy) {
  const events = [];
  const host = {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    _travelSpentTold: false,
  };
  const entity = { boost: { energy, drainRate: 40, max: 100 } };
  const input = { travelDrive: { state: 'engaged' } };
  const state = {
    player: {},
    runtime: {},
  };
  return { host, entity, input, state, events };
}

function texts(events) {
  return events.filter((event) => event.name === 'toast').map((event) => event.payload.text);
}

test('running the tank out says the burn is spent, once', () => {
  const pack = rig(2);
  debitTravelBurn(pack.host, pack.entity, pack.input, 1, pack.state);
  debitTravelBurn(pack.host, pack.entity, pack.input, 1, pack.state);
  assert.equal(pack.entity.boost.energy, 0);
  assert.equal(pack.input.travelDrive.state, 'cooldown');
  assert.equal(pack.input.travelDrive.breakReason, 'energy');
  assert.equal(pack.state.player.travelDrive.disruptReason, 'energy');
  assert.deepEqual(texts(pack.events), ['Travel burn spent']);
});

test('a later burn can say it again', () => {
  const pack = rig(2);
  debitTravelBurn(pack.host, pack.entity, pack.input, 1, pack.state);
  pack.input.travelDrive = { state: 'off' };
  debitTravelBurn(pack.host, pack.entity, pack.input, 1, pack.state);
  pack.entity.boost.energy = 2;
  pack.input.travelDrive = { state: 'engaged' };
  debitTravelBurn(pack.host, pack.entity, pack.input, 1, pack.state);
  assert.deepEqual(texts(pack.events), ['Travel burn spent', 'Travel burn spent']);
});

test('the next held boost tick does not add a second line', () => {
  const pack = rig(0.6);
  pack.host._travelSpentTold = true;
  pack.host._prevBoost = true;
  pack.entity.id = 1;
  pack.entity.boost.regenRate = 0;
  pack.entity.boost.dashImpulse = 0;
  pack.entity.boost.dashCost = 28;
  pack.entity.boost.dashCd = 3;
  pack.entity.boost.dashCdT = 0;
  pack.entity.boost.burnDurS = 0;
  pack.entity.boost.burnCdS = 0;
  pack.entity.boost._boostArmed = true;
  pack.host._suppressBoostUntilRelease = false;
  flightV3._stepPlayerBoost.call(pack.host, pack.entity, true, 1 / 60, { playerId: 1 });
  assert.equal(pack.entity.boost._boostArmed, false);
  assert.deepEqual(texts(pack.events), []);
});

test('a boost cut-out during an engaged burn does not stack a second line', () => {
  const events = [];
  const host = Object.assign(Object.create(flightV3), {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    _prevBoost: true,
    _suppressBoostUntilRelease: false,
    _travelSpentTold: false,
  });
  const entity = {
    id: 1,
    boost: {
      energy: 1.5, max: 100, regenRate: 0, drainRate: 60,
      dashImpulse: 0, dashCost: 28, dashCd: 3, dashCdT: 0,
      burnDurS: 0, burnCdS: 0, _boostArmed: true,
    },
  };
  const state = { playerId: 1, player: {}, input: { travelDrive: { state: 'engaged' } } };
  flightV3._stepPlayerBoost.call(host, entity, true, 1 / 60, state);
  debitTravelBurn(host, entity, { travelDrive: state.input.travelDrive }, 1 / 60, state);
  assert.equal(entity.boost._boostArmed, false);
  assert.equal(entity.boost.energy, 0);
  assert.deepEqual(texts(events), ['Travel burn spent']);
});

test('a dash that empties the tank during a burn says the burn is spent', () => {
  const events = [];
  const host = Object.assign(Object.create(flightV3), {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    _prevBoost: false,
    _suppressBoostUntilRelease: false,
    _travelSpentTold: false,
  });
  const entity = {
    id: 1,
    rot: 0,
    boost: {
      energy: 28, max: 100, regenRate: 0, drainRate: 30,
      dashImpulse: 80, dashCost: 28, dashCd: 3, dashCdT: 0,
      burnDurS: 0, burnCdS: 0, _boostArmed: true,
    },
  };
  const state = { playerId: 1, player: {}, input: { travelDrive: { state: 'engaged' } } };
  flightV3._stepPlayerBoost.call(host, entity, true, 1 / 60, state);
  debitTravelBurn(host, entity, { travelDrive: state.input.travelDrive }, 1 / 60, state);
  assert.deepEqual(texts(events), ['Travel burn spent']);
});

test('a burn with charge left stays engaged and quiet', () => {
  const pack = rig(50);
  debitTravelBurn(pack.host, pack.entity, pack.input, 1 / 60, pack.state);
  assert.ok(pack.entity.boost.energy > 0);
  assert.equal(pack.input.travelDrive.state, 'engaged');
  assert.equal(pack.state.player.travelDrive, undefined);
  assert.deepEqual(texts(pack.events), []);
});
