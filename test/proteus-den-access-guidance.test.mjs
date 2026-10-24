import test from 'node:test';
import assert from 'node:assert/strict';
import { dockDenyReason, stationMinRepFor } from '../src/data/dockDeny.js';
import { resolveDockDeny } from '../src/core/dockAccess.js';
import { dockDenyBanner } from '../src/ui/dockDenyBanner.js';

const ID = 'station_proteus';
const TEXT = 'You. No. Earn positive Quiet standing before requesting a berth.';
const raw = (extra = {}) => ({ id: ID, name: 'Proteus Den', factionId: 'faction_quiet', repGated: true, ...extra });
const meta = (rep, id = 'faction_quiet') => ({ id, rep });
const live = (extra = {}) => ({
  id: 17, alive: true, type: 'station', factionId: 'faction_quiet',
  data: { stationId: ID, name: 'Proteus Den', factionId: 'faction_quiet', repGated: true, minRep: 1, ...extra },
});
const stateAt = (rep, station = live()) => ({
  simTime: 20, ui: {}, factions: { faction_quiet: { rep } }, entityList: [station],
});
const expected = { reason: 'hostile_rep', text: TEXT };

for (const rep of [-1, 0, 1]) {
  test('Den raw and live standing boundary ' + rep, () => {
    const station = raw();
    const before = JSON.stringify(station);
    assert.equal(stationMinRepFor(station), 1);
    assert.deepEqual(dockDenyReason(station, meta(rep)), rep < 1 ? expected : null);
    const state = stateAt(rep);
    const beforeState = JSON.stringify(state);
    const resolved = resolveDockDeny(state, ID);
    if (rep < 1) {
      assert.equal(resolved.text, TEXT);
      assert.equal(resolved.reason, 'hostile_rep');
      assert.equal(resolved.stationId, ID);
      assert.equal(resolved.factionId, 'faction_quiet');
    } else assert.equal(resolved, null);
    assert.equal(JSON.stringify(station), before);
    assert.equal(JSON.stringify(state), beforeState);
  });
}

test('station identity is exact; ordinary and other gated Quiet stations retain their voice', () => {
  for (const id of ['station_nyx_march', 'station_eris_margin', 'station_proteus_annex']) {
    assert.deepEqual(dockDenyReason(raw({ id }), meta(0)),
      { reason: 'hostile_rep', text: 'You. No.' });
  }
  assert.equal(dockDenyReason(raw({ id: 'station_open', repGated: false }), meta(-500)), null);
  assert.deepEqual(dockDenyReason(raw(), meta(0, 'faction_scn')),
    dockDenyReason(raw({ id: 'station_other' }), meta(0, 'faction_scn')));
  assert.deepEqual(dockDenyReason({ ...raw(), stationId: 'station_other' }, meta(0)),
    { reason: 'hostile_rep', text: 'You. No.' });
  assert.deepEqual(dockDenyReason({ ...raw(), id: 17, stationId: ID }, meta(0)), expected);
});

test('explicit standing floors and missing reputation are not relabeled as the positive gate', () => {
  assert.equal(dockDenyReason(raw({ minRep: -30 }), meta(-1)), null);
  assert.deepEqual(dockDenyReason(raw({ minRep: 50 }), meta(1)),
    { reason: 'hostile_rep', text: 'You. No.' });
  assert.equal(dockDenyReason(raw(), { id: 'faction_quiet' }), null);
  assert.deepEqual(dockDenyReason(raw({ playerRep: 0 }), 'faction_quiet'), expected);
  assert.equal(dockDenyReason(raw({ playerRep: 0 }), meta(1)), null);
  assert.equal(dockDenyReason(null, meta(0)), null);
});

const earlier = [
  ['explicit abandoned', { dockDeny: 'abandoned' }, 'abandoned', 'Empty. Leave.'],
  ['explicit private', { dockDeny: 'private' }, 'private', 'Not for you.'],
  ['explicit military', { dockDeny: 'military_only' }, 'military_only', 'Closed. Move.'],
  ['explicit construction', { dockDeny: 'under_construction' }, 'under_construction', 'Not ready. Later.'],
  ['explicit quarantine', { dockDeny: 'quarantine' }, 'quarantine', 'Sealed. Don’t.'],
  ['explicit hostility', { dockDeny: 'hostile_rep' }, 'hostile_rep', 'You. No.'],
  ['abandoned', { abandoned: true }, 'abandoned', 'Empty. Leave.'],
  ['construction', { underConstruction: true }, 'under_construction', 'Not ready. Later.'],
  ['uncommissioned', { commissioned: false }, 'under_construction', 'Not ready. Later.'],
  ['quarantine', { quarantine: true }, 'quarantine', 'Sealed. Don’t.'],
  ['quarantined', { quarantined: true }, 'quarantine', 'Sealed. Don’t.'],
  ['hostile flag', { hostile: true }, 'hostile_rep', 'You. No.'],
];
for (const [name, flags, reason, text] of earlier) {
  test('earlier denial priority: ' + name, () => {
    for (const rep of [-1, 0, 1, 50]) {
      assert.deepEqual(dockDenyReason(raw(flags), meta(rep)), { reason, text });
    }
  });
}

test('later access restrictions preserve the existing priority over and under the standing floor', () => {
  for (const [flags, reason, text] of [
    [{ militaryOnly: true }, 'military_only', 'Closed. Move.'],
    [{ private: true }, 'private', 'Not for you.'],
    [{ public: false }, 'private', 'Not for you.'],
  ]) {
    assert.deepEqual(dockDenyReason(raw(flags), meta(0)), expected);
    assert.deepEqual(dockDenyReason(raw(flags), meta(1)), { reason, text });
  }
  assert.equal(dockDenyReason(raw({ minRep: 0 }), meta(0)), null);
});

test('live grudge remains the refusal instead of promising reputation alone opens the berth', () => {
  const state = stateAt(0);
  state.player = { debt: 121 };
  state.economy = { stationConditions: { [ID]: { grudge: { slams: 3, untilPaidCr: 120, fineCr: 120, since: 0 } } } };
  const denial = resolveDockDeny(state, ID);
  assert.equal(denial.reason, 'grudge');
  assert.notEqual(denial.text, TEXT);
  assert.equal(denial.text, 'Dock control: pay your note before you come through our ring again');
});

test('actual banner forwards the same requirement to UI, denial event and comms, debounces and stays quiet after access opens', () => {
  const state = stateAt(0);
  const listeners = new Map(), events = [], speech = [];
  const bus = {
    on(name, fn) { const set = listeners.get(name) || new Set(); set.add(fn); listeners.set(name, set); },
    off(name, fn) { listeners.get(name)?.delete(fn); },
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of listeners.get(name) || []) fn(payload);
    },
  };
  const banner = { ...dockDenyBanner };
  banner.init({ state, bus, helpers: { voice: { say: (line) => speech.push(line) } } });
  try {
    bus.emit('dock:attempt', { stationId: ID });
    assert.equal(state.ui.dockDeny.text, TEXT);
    assert.deepEqual(events.filter(e => e.name === 'dock:denied').map(e => e.payload),
      [{ stationId: ID, reason: 'hostile_rep', text: TEXT }]);
    assert.deepEqual(speech, [{ channel: 'comms', text: TEXT, kind: 'dockDeny', factionId: 'faction_quiet' }]);
    bus.emit('dock:docked', { stationId: ID });
    assert.equal(speech.length, 1);
    state.simTime += 3;
    state.factions.faction_quiet.rep = 1;
    bus.emit('dock:attempt', { stationId: ID });
    assert.equal(speech.length, 1);
    assert.equal(events.filter(e => e.name === 'dock:denied').length, 1);
    assert.equal(events.filter(e => e.name === 'toast').length, 0);
  } finally { banner.destroy(); }
  assert.equal(listeners.get('dock:attempt').size, 0);
  assert.equal(listeners.get('dock:docked').size, 0);
});
