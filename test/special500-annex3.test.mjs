// Annex wave 3 (SPX-F-*): THE DOCK REMEMBERS — receipt entries filtered by
// where.stationId and fired on the Nth dock:docked. These proofs pin the
// wave's size/id space, schema validity inside the sweep set, that every
// `where.stationId` names a real station id, that `nth` orders the second-visit
// and fifth-visit tiers without `after` gates, and a live director proof that
// the counter (not the calendar) is the memory.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SPECIAL500,
  SPECIAL500_ALL,
  validateSpecial500,
  special500ById,
} from '../src/data/special500/index.js';
import { ENTRIES_ANNEX_3 } from '../src/data/special500/entries-annex3.js';
import { SECTORS } from '../src/data/sectors.js';
import { special500Director } from '../src/systems/special500Director.js';

const STATION_IDS = new Set(
  SECTORS.flatMap((s) => (s.stations || []).map((st) => st.id)),
);

function stubBus() {
  const handlers = new Map();
  return {
    on(ev, fn) { (handlers.get(ev) || handlers.set(ev, []).get(ev)).push(fn); },
    emit() {},
    deliver(ev, payload = {}) { for (const fn of handlers.get(ev) || []) fn(payload); },
  };
}

function fixtureState() {
  return {
    simTime: 10,
    tick: 42,
    seed: 7,
    world: { currentSectorId: 'sector_helios_prime', active: { stations: [], pois: [] } },
    entities: new Map([[1, { id: 1, pos: { x: 0, z: 0 } }]]),
    playerId: 1,
    story: { flags: {} },
    meta: { seed: 7 },
  };
}

test('annex wave 3 is 17 SPX-F entries, schema-valid and id-unique inside the sweep set', () => {
  assert.equal(SPECIAL500.length, 500, 'the ratified catalog still reads 500');
  assert.equal(ENTRIES_ANNEX_3.length, 17, 'wave 3 lands at 17');
  assert.equal(SPECIAL500_ALL.length, 767, 'the sweep set is the union');
  assert.deepEqual([...new Set(SPECIAL500_ALL.map((e) => e.id))].length, 767, 'no id collisions');
  for (const e of ENTRIES_ANNEX_3) assert.match(e.id, /^SPX-F-\d{2}$/, `${e.id} follows the wave-3 convention`);
  assert.deepEqual(validateSpecial500(SPECIAL500_ALL), []);
  const titles = new Set(SPECIAL500_ALL.map((e) => e.title));
  assert.equal(titles.size, 767, 'no title collisions');
});

test('every wave-3 where.stationId names a real station and nth orders without after gates', () => {
  for (const e of ENTRIES_ANNEX_3) {
    const t = e.trigger;
    assert.equal(t.type, 'receipt', `${e.id} is a receipt entry`);
    assert.equal(t.event, 'dock:docked', `${e.id} rides the dock receipt`);
    assert.ok(STATION_IDS.has(t.where?.stationId), `${e.id} where.stationId ${t.where?.stationId} exists`);
    assert.ok(t.nth === 2 || t.nth === 5, `${e.id} fires on a meaningful visit count`);
    assert.equal(e.after, undefined, `${e.id}: nth itself orders the sequence — no after gate`);
    assert.deepEqual(e.sectors, [], `${e.id} is station-scoped via where, not sector-gated`);
  }
  const fifth = ENTRIES_ANNEX_3.filter((e) => e.trigger.nth === 5).map((e) => e.trigger.where.stationId);
  assert.deepEqual([...fifth].sort(), ['station_drift', 'station_helios', 'station_sker'],
    'the regular tier covers the three signature ports');
});

test('the berth files you on the second dock, not the first — the counter is the memory', () => {
  const bus = stubBus();
  special500Director.init({ bus });
  const state = fixtureState();
  const entry = special500ById('SPX-F-01');
  assert.ok(entry, 'SPX-F-01 resolves');
  const flag = () => state.story.flags['special500.SPX-F-01'];

  state.simTime = 10;
  bus.deliver('dock:docked', { stationId: 'station_beltout' });
  special500Director.update(0.5, state);
  assert.equal(flag(), undefined, 'a different station does not count toward Helios');

  state.simTime = 20;
  bus.deliver('dock:docked', { stationId: 'station_helios' });
  special500Director.update(0.5, state);
  assert.equal(flag(), undefined, 'first Helios dock counts, does not fire');

  state.simTime = 30;
  bus.deliver('dock:docked', { stationId: 'station_helios' });
  special500Director.update(0.5, state);
  assert.ok(flag() != null, 'second Helios dock fires the acknowledgment');
  assert.equal(state.story.flags['special500.SPX-F-01.n'], 2, 'counter saturates at nth');
});
