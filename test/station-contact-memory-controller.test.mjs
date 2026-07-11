import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import {
  normalizeStationContactRecord,
  stationContactMemoryFor,
  stationContactMemoryLine,
  stationContactStanding,
} from '../src/data/stationContacts.js';
import { stationContacts } from '../src/systems/stationContacts.js';
import { stationContactLoadBoundary } from '../src/systems/stationContactLoadBoundary.js';
import { save } from '../src/save/saveSystem.js';

test('contact memory normalizes and presents without mutating inputs', () => {
  const source = { talkCount: 2.9, standing: 99, lastChoice: 'Routes <script>', flags: { ok: true, nope: 'yes' } };
  const before = structuredClone(source);
  const rec = normalizeStationContactRecord(source);
  assert.deepEqual(source, before);
  assert.equal(rec.talkCount, 2);
  assert.equal(rec.standing, 3);
  assert.equal(rec.lastChoice, 'routes_script');
  assert.deepEqual(rec.flags, { ok: true });
  assert.equal(stationContactMemoryFor({ player: {} }, 'missing'), null);
  assert.deepEqual([0, 1, 2, 3].map((standing) => stationContactStanding({ standing })), [
    'New', 'Recognized', 'Established', 'Trusted',
  ]);
  assert.equal(stationContactMemoryLine(null, 'Original line.'), 'Original line.');
  assert.equal(stationContactMemoryLine({ met: true, talkCount: 2, lastChoice: 'ore_price' }, 'x'), 'Met 2 times · last discussed ore price.');
});

test('talk persists through player save blob without foreign writes', () => {
  const bus = createBus();
  const state = {
    simTime: 42.25,
    player: { credits: 5000, heat: 0.1, cargo: { items: { cmdty_iron_ore: 3 } }, stationContacts: {} },
    stationLife: { traffic: [] },
    factions: { faction_scn: { rep: 0 } },
    missions: { boards: { station_helios: { slots: [] } } },
  };
  const before = structuredClone({ credits: state.player.credits, heat: state.player.heat, cargo: state.player.cargo, factions: state.factions, missions: state.missions });
  stationContacts.init({ state, bus });
  const payload = { contactId: 'contact_station_helios_kessler', canonicalKey: 'kessler', stationId: 'station_helios', name: 'Kessler', choiceId: 'routes' };
  bus.emit('ui:talkContact', payload);
  bus.emit('ui:talkContact', payload);
  const rec = stationContactMemoryFor(state, payload.contactId);
  assert.equal(rec.talkCount, 2);
  assert.equal(rec.standing, 1);
  assert.deepEqual({ credits: state.player.credits, heat: state.player.heat, cargo: state.player.cargo, factions: state.factions, missions: state.missions }, before);
  save.state = state;
  assert.equal(save._serializePlayer().stationContacts[payload.contactId].talkCount, 2);
  stationContacts.destroy();
});

test('freight receipts are idempotent and bounded', () => {
  const bus = createBus();
  const state = { simTime: 1, player: { stationContacts: {} }, stationLife: { traffic: [] } };
  stationContacts.init({ state, bus });
  for (let i = 0; i < 12; i++) bus.emit('freight:arrival', { intentId: `arrival-${i}`, stationId: 'station_helios', totalQty: i + 1, trades: [{ commodityId: 'cmdty_iron_ore' }] });
  bus.emit('freight:arrival', { intentId: 'arrival-11', stationId: 'station_helios', totalQty: 12, trades: [{ commodityId: 'cmdty_iron_ore' }] });
  assert.equal(state.stationLife.traffic.length, 8);
  assert.match(state.stationLife.traffic[0].text, /iron ore shipment cleared berth/i);
  assert.equal(new Set(state.stationLife.traffic.map((entry) => entry.intentId)).size, 8);
  stationContacts.destroy();
});

test('restore boundary clears stale runs and normalizes loaded contact records', () => {
  const bus = createBus();
  const state = {
    player: { stationContacts: { stale: { met: true, talkCount: 9 } } },
    stationLife: { traffic: [{ stationId: 'old' }] },
  };
  stationContactLoadBoundary.init({ state, bus });
  bus.emit('save:restoring', {});
  assert.deepEqual(state.player.stationContacts, {});
  assert.deepEqual(state.stationLife, { traffic: [] });
  state.player.stationContacts.loaded = { talkCount: 2.8, standing: 99, lastChoice: 'Market Route' };
  state.stationLife.traffic.push({ stationId: 'load-leak' });
  bus.emit('save:loaded', {});
  assert.equal(state.player.stationContacts.loaded.talkCount, 2);
  assert.equal(state.player.stationContacts.loaded.standing, 3);
  assert.deepEqual(state.stationLife, { traffic: [] });
  stationContactLoadBoundary.destroy();
});
