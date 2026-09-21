// INF-074 — one later meeting remembers one real act. A rescue completion posts bar
// gossip; the first barkeep talked to in that sector claims it onto their own record and
// names it once beside their standing work tags. Merchants and other roles never inherit
// it, strips and failures post nothing, and the memory never writes rep, credits, or cargo.
import test from 'node:test';
import assert from 'node:assert/strict';

import { stationContacts } from '../src/systems/stationContacts.js';
import { stationContactMemoryFor } from '../src/data/stationContacts.js';
import { barContactIntelTags } from '../src/ui/station/barContacts.js';
import { SECTORS } from '../src/data/sectors.js';

const SECTOR = SECTORS[0];
const STATION_ID = SECTOR.stations[0].id;
const BARKEEP = 'contact_test_barkeep';
const MERCHANT = 'contact_test_merchant';

function boot() {
  const traffic = [];
  const bus = {
    _handlers: {},
    on(event, handler) {
      (this._handlers[event] = this._handlers[event] || []).push(handler);
    },
    emit(event, payload) {
      traffic.push({ event, payload });
      for (const handler of this._handlers[event] || []) handler(payload);
    },
  };
  const state = { simTime: 500, player: {} };
  stationContacts.init({ state, bus });
  return { state, bus, traffic };
}
function talk(harness, contactId, role, choiceId = 'ask') {
  harness.bus.emit('ui:talkContact', { contactId, role, stationId: STATION_ID, choiceId, name: 'Test' });
}
function rescue(harness, outcome = 'rescue') {
  harness.bus.emit('recovery:completed', {
    id: 'recovery-receipt:rec-1',
    recoveryId: 'rec-1',
    sectorId: SECTOR.id,
    outcome,
    pos: { x: 1, z: 2 },
    credits: 0,
    repDelta: 0,
    cargo: {},
    completedAt: 500,
  });
}

test('a rescue posts gossip that only the sector barkeep claims and names once', () => {
  const harness = boot();
  rescue(harness);
  assert.ok(harness.state.stationLife.rescueNotices[SECTOR.id], 'the rescue posts a sector notice');

  talk(harness, MERCHANT, 'merchant');
  assert.ok(harness.state.stationLife.rescueNotices[SECTOR.id], 'a merchant never claims gossip');
  assert.equal(stationContactMemoryFor(harness.state, MERCHANT)?.rescueMemory, undefined, 'no memory leaks across roles');

  talk(harness, BARKEEP, 'barkeep');
  assert.equal(harness.state.stationLife.rescueNotices[SECTOR.id], undefined, 'the barkeep claims the notice');
  const memory = stationContactMemoryFor(harness.state, BARKEEP);
  assert.equal(memory?.rescueMemory?.recordId, 'rec-1', 'the record names the real receipt');
  assert.equal(memory?.rescueMemory?.acknowledged, false, 'unacknowledged until a later meeting');

  const tags = barContactIntelTags({ id: BARKEEP, role: 'barkeep' }, harness.state, STATION_ID);
  const rescueTag = tags.find((tag) => tag.label === 'Rescue');
  assert.ok(rescueTag, 'the later meeting names the act beside the standing tags');
  assert.match(rescueTag.text, /pulled crew/, 'the line states the act');
  assert.match(rescueTag.text, new RegExp(SECTOR.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the line names where');

  talk(harness, BARKEEP, 'barkeep');
  assert.equal(stationContactMemoryFor(harness.state, BARKEEP)?.rescueMemory?.acknowledged, true, 'the meeting acknowledges it');
  const later = barContactIntelTags({ id: BARKEEP, role: 'barkeep' }, harness.state, STATION_ID);
  assert.equal(later.some((tag) => tag.label === 'Rescue'), false, 'never repeated');
});

test('only rescues write memory, and memory writes nothing else', () => {
  const harness = boot();
  for (const outcome of ['blackbox', 'strip', 'failed']) rescue(harness, outcome);
  assert.deepEqual(harness.state.stationLife.rescueNotices, {}, 'non-rescues post nothing');
  rescue(harness, 'rescue');
  talk(harness, BARKEEP, 'barkeep');
  const writes = harness.traffic.filter(({ event }) => /^(economy|faction|cargo|reputation):/.test(event));
  assert.equal(writes.length, 0, 'no rep, credit, or cargo writer runs on the memory path');
  const changed = harness.traffic.filter(({ event }) => event === 'stationContact:changed');
  assert.ok(changed.length >= 1, 'the claim publishes through the existing contact channel');
});

test('the memory survives Continue and validates on load', () => {
  const harness = boot();
  rescue(harness);
  talk(harness, BARKEEP, 'barkeep');
  const revived = JSON.parse(JSON.stringify(harness.state));
  const again = { state: revived, bus: harness.bus, traffic: harness.traffic };
  stationContacts.init({ state: revived, bus: harness.bus });
  harness.bus.emit('save:loaded', {});
  const memory = stationContactMemoryFor(revived, BARKEEP);
  assert.equal(memory?.rescueMemory?.recordId, 'rec-1', 'Continue keeps the correct act on the correct contact');
  revived.stationLife.rescueNotices = { [SECTOR.id]: { garbage: true }, junk: null };
  harness.bus.emit('save:loaded', {});
  assert.deepEqual(revived.stationLife.rescueNotices, {}, 'corrupt notices drop on load');
});
