// INF-3 (WF-04/WF-16): a station whose repair bay is down says so on its dossier, with the time
// left, before the pilot flies there. economy owns the outage record; the dossier only reads it.
import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveEntity } from '../src/ui/entityResolver.js';

const STATION = 'station_helios';
const servicesLine = (state) => resolveEntity(state, `station:${STATION}`).lines.find((l) => l.label === 'Services').text;
const PLAIN = 'trade \u00b7 shipyard \u00b7 refuel \u00b7 repair \u00b7 missions';

function stateWith(outage, simTime = 1000) {
  return { simTime, economy: outage ? { stationOutages: { [STATION]: outage } } : {}, entities: new Map(), player: {} };
}

test('an active repair outage rides the services line with a rounded remaining time', () => {
  const text = servicesLine(stateWith({ repairUntil: 1000 + 6 * 60 - 10, cause: 'dock_slam', atT: 900 }));
  assert.equal(text, 'trade \u00b7 shipyard \u00b7 refuel \u00b7 repair (bay down ~6 min) \u00b7 missions');
});

test('under a minute still reads as one minute, never zero', () => {
  assert.match(servicesLine(stateWith({ repairUntil: 1000 + 12 })), /repair \(bay down ~1 min\)/);
});

test('an expired outage is plain again', () => {
  assert.equal(servicesLine(stateWith({ repairUntil: 999, cause: 'dock_slam' })), PLAIN);
  assert.equal(servicesLine(stateWith({ repairUntil: 1000 })), PLAIN, 'the exact boundary is already over');
});

test('no outage record is plain', () => {
  assert.equal(servicesLine(stateWith(null)), PLAIN);
  assert.equal(servicesLine({ simTime: 5 }), PLAIN, 'a bare state reads plain too');
});

test('another station\'s outage never leaks onto this one', () => {
  const state = stateWith(null);
  state.economy = { stationOutages: { station_coalition: { repairUntil: 5000 } } };
  assert.equal(servicesLine(state), PLAIN);
});

test('every service kind the outage record supports is rendered when it is down', () => {
  const text = servicesLine(stateWith({ repairUntil: 1000 + 180, tradeUntil: 1000 + 600, refuelUntil: 1000 + 61 }));
  assert.match(text, /trade \(down ~10 min\)/);
  assert.match(text, /refuel \(down ~2 min\)/);
  assert.match(text, /repair \(bay down ~3 min\)/);
  assert.match(text, /shipyard(?! \()/, 'a service with no outage is untouched');
});
