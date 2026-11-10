// The saved freighter sends cargo (the seed's literal shape). The relief loop already turned a
// rescue into repeat work; the gratitude gift is the gratuitous half — after the third completed
// relief run (then every fourth), the captain's own goods wait at their home dock and land in
// your hold when you next dock there. Driven through the real completion + dock paths.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { noteStandingOrderCompletion, captainGratitudeDue } from '../src/systems/captainStandingOrders.js';
import { missions } from '../src/systems/missions.js';

function captainMission(cycle) {
  return {
    id: `relief-${cycle}`, status: 'completed', source: 'captainStandingOrder',
    stationId: 'station_helios', type: 'cargo_delivery',
    cause: { tag: 'remembered_captain', captainId: 'cap-wren' },
    params: { cmdtyId: 'cmdty_food', qty: 2 },
  };
}

function host() {
  const state = createGameState(4242);
  state.simTime = 5000;
  state.traffic = { captainRoster: [{ id: 'cap-wren', name: 'Wren Vahl', alive: true, homeStationId: 'station_helios' }] };
  state.player.cargo = { items: {}, capVolume: 40, usedVolume: 0 };
  const bus = createBus();
  const toasts = [];
  const gifts = [];
  const sys = Object.create(missions);
  sys.state = state;
  sys.bus = {
    emit: (ev, payload) => {
      if (ev === 'toast') toasts.push(payload);
      if (ev === 'freight:gratitudeGift') gifts.push(payload);
    },
  };
  return { state, sys, toasts, gifts };
}

test('the third completed relief run earns the gift; the first two do not', () => {
  assert.equal(captainGratitudeDue(0), false);
  assert.equal(captainGratitudeDue(2), false);
  assert.equal(captainGratitudeDue(3), true);
  assert.equal(captainGratitudeDue(4), false);
  assert.equal(captainGratitudeDue(7), true);
});

test('the gift waits at the home dock and lands in the hold on dock', () => {
  const { state, sys, toasts, gifts } = host();
  for (let cycle = 0; cycle < 3; cycle++) noteStandingOrderCompletion(state, captainMission(cycle));
  const rec = state.missions.captainOrderCycles['cap-wren'];
  assert.equal(rec.cycle, 3);
  assert.deepEqual(rec.gratitude, { stationId: 'station_helios', cmdtyId: 'cmdty_food', qty: 2, paid: false });

  sys._settleCaptainGratitude('station_helios');
  assert.equal(state.player.cargo.items.cmdty_food, 2, 'two units of the run\'s goods land');
  assert.equal(rec.gratitude.paid, true);
  assert.match(toasts[0].text, /Wren Vahl's gratitude/);
  assert.equal(gifts.length, 1);
});

test('docking anywhere else leaves the gift waiting', () => {
  const { state, sys } = host();
  for (let cycle = 0; cycle < 3; cycle++) noteStandingOrderCompletion(state, captainMission(cycle));
  sys._settleCaptainGratitude('station_tethys');
  assert.equal(state.player.cargo.items.cmdty_food, undefined);
  assert.equal(state.missions.captainOrderCycles['cap-wren'].gratitude.paid, false);
  // then the home dock pays it
  sys._settleCaptainGratitude('station_helios');
  assert.equal(state.player.cargo.items.cmdty_food, 2);
});

test('a full hold keeps the gift waiting for the next dock', () => {
  const { state, sys } = host();
  state.player.cargo.capVolume = 1;
  state.player.cargo.usedVolume = 1;
  for (let cycle = 0; cycle < 3; cycle++) noteStandingOrderCompletion(state, captainMission(cycle));
  sys._settleCaptainGratitude('station_helios');
  assert.equal(state.player.cargo.items.cmdty_food, undefined, 'nothing lands into a full hold');
  assert.equal(state.missions.captainOrderCycles['cap-wren'].gratitude.paid, false);
});

test('a dead captain ships nothing and the stamp closes', () => {
  const { state, sys } = host();
  state.traffic.captainRoster[0].alive = false;
  for (let cycle = 0; cycle < 3; cycle++) noteStandingOrderCompletion(state, captainMission(cycle));
  sys._settleCaptainGratitude('station_helios');
  assert.equal(state.player.cargo.items.cmdty_food, undefined);
  assert.equal(state.missions.captainOrderCycles['cap-wren'].gratitude.paid, true);
});
