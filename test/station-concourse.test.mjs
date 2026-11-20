// SCREENS-1-STATION Part A — station arrival concourse model tests.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { serviceQuote } from '../src/ui/station/serviceQuotes.js';
import {
  SERVICE_MUNITIONS_TARGET,
  resolveStationIdentity,
  buildServiceBundle,
  buildConcourseNews,
  hasWorksAtStation,
  buildConcourseDoors,
} from '../src/ui/station/concourseModel.js';

function makeDockedState(stationId = 'station_helios') {
  const state = createGameState(4242);
  const ship = {
    id: 1, type: 'ship', alive: true,
    hull: 86, hullMax: 100, armorHp: 0, armorMax: 0,
  };
  state.playerId = ship.id;
  state.entities = new Map([[ship.id, ship]]);
  state.entityList = [ship];
  state.fuel = { current: 80, max: 100 };
  state.player.credits = 5000;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 40 };
  state.ui = { ...(state.ui || {}), docked: true, dockedStationId: stationId };
  return { state, ship };
}

test('resolveStationIdentity returns station name, authority, and character chartNote', () => {
  const { state } = makeDockedState('station_helios');
  const id = resolveStationIdentity(state, 'station_helios');
  assert.equal(id.name, 'Helios Station');
  assert.match(id.factionName, /Concord/i);
  assert.match(id.chartNote, /Everything in stock/i);
});

test('buildServiceBundle combines repair, refuel, and capped rearm into one button and flips to Ship is ready when topped off', () => {
  const { state, ship } = makeDockedState('station_helios');
  const first = buildServiceBundle(state, ship, serviceQuote);
  assert.equal(first.ready, false);
  assert.match(first.primaryLabel, /^Service ship · [\d,]+ cr$/);
  assert.equal(first.items.length, 3);
  assert.equal(first.actionableItems.length, 3);
  const rearm = first.items.find((i) => i.id === 'resupply');
  assert.equal(rearm.amount, SERVICE_MUNITIONS_TARGET, 'bundled rearm tops up to sane target without filling hold');

  // After services complete, the button reads "Ship is ready".
  ship.hull = ship.hullMax;
  state.fuel.current = state.fuel.max;
  state.player.cargo.items.cmdty_munitions = SERVICE_MUNITIONS_TARGET;
  const ready = buildServiceBundle(state, ship, serviceQuote);
  assert.equal(ready.ready, true);
  assert.equal(ready.primaryLabel, 'Ship is ready');
  assert.equal(ready.actionableItems.length, 0);
});

test('concourse shows 4 doors at Helios without player industry and 5 doors when Works applies', () => {
  const { state } = makeDockedState('station_helios');
  const helios = resolveStationIdentity(state, 'station_helios');
  assert.equal(hasWorksAtStation(state, 'station_helios', helios), false);
  const doors4 = buildConcourseDoors(state, 'station_helios', helios);
  assert.deepEqual(doors4.map((d) => d.label), ['Market', 'Jobs', 'Shipyard', 'People']);
  for (const d of doors4) {
    assert.ok(d.summary && d.summary.length > 5, `${d.label} has a live one-line summary`);
  }

  // Docking at a refinery or owning a claimed base adds Door 5: Works.
  const ceres = resolveStationIdentity(state, 'station_ceres');
  assert.equal(hasWorksAtStation(state, 'station_ceres', ceres), true);
  state.player.cargo.items.cmdty_ore_iron = 40;
  const doors5 = buildConcourseDoors(state, 'station_ceres', ceres);
  assert.deepEqual(doors5.map((d) => d.label), ['Market', 'Jobs', 'Shipyard', 'People', 'Works']);
  assert.match(doors5[4].summary, /40 ore waiting/i);
});

test('buildConcourseNews returns one prioritized line and elevates Law Desk fines', () => {
  const { state } = makeDockedState('station_helios');
  const helios = resolveStationIdentity(state, 'station_helios');
  const calm = buildConcourseNews(state, 'station_helios', helios);
  assert.ok(calm.tag && calm.text, 'calm arrival still carries one news or wire line');

  state.player.heat = 0.25;
  state.lawSecurity = {
    fineOffer: { stationId: 'station_helios', status: 'offered', amount: 350, causeId: 'test', wantedTier: 'scan', offerSerial: 1 },
  };
  const urgent = buildConcourseNews(state, 'station_helios', helios);
  assert.equal(urgent.priority, 'urgent');
  assert.match(urgent.text, /350 cr/);
});
