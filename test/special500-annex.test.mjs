// Annex wave contract: 50 entries riding the special500 director alongside the
// ratified 500 — the 20 consensus bench spares (ranks 501-520, own ids kept) plus
// 30 SPX-D proposals. The ratified catalog stays exactly 500; SPECIAL500_ALL is
// the director's sweep set, so `after` gates may chain annex->base entries.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPECIAL500, SPECIAL500_ANNEX, SPECIAL500_ALL, SPECIAL500_COMPLETE,
  validateSpecial500, special500ById,
} from '../src/data/special500/index.js';
import { SECTORS } from '../src/data/sectors.js';
import { special500Director } from '../src/systems/special500Director.js';
import { CAL_DAY_S } from '../src/data/worldCalendar.js';

const SECTOR_IDS = new Set(SECTORS.map((s) => s.id));

const BENCH_IDS = [
  'SP3-047', 'SP3-149', 'SP3-153', 'SP3-059', 'SP3-111', 'SP3-069', 'SP3-075',
  'SP1-152', 'SP1-178', 'SP3-184', 'SP1-128', 'SP1-129', 'SP1-131', 'SP3-140',
  'SP3-125', 'SP3-191', 'SP3-152', 'SP3-175', 'SP1-051', 'SP3-185',
];

function stubBus() {
  const handlers = new Map();
  const seen = [];
  return {
    seen,
    emit(event, payload) { seen.push({ event, payload }); },
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
      return () => handlers.get(event).delete(fn);
    },
    deliver(event) { for (const fn of handlers.get(event) || []) fn({}); },
  };
}

function fixtureState() {
  return {
    simTime: 0,
    tick: 0,
    mode: 'flight',
    meta: { seed: 2011 },
    playerId: 1,
    player: {},
    world: {
      currentSectorId: 'sector_helios_prime',
      active: { stations: [], pois: [] },
    },
    story: { flags: {} },
    entities: new Map([[1, { id: 1, type: 'player', alive: true, pos: { x: 0, z: 0 } }]]),
  };
}

test('annex is exactly 50 entries: the 20 ratified bench ids plus 30 SPX-D ids', () => {
  assert.equal(SPECIAL500_ANNEX.length, 50);
  assert.equal(SPECIAL500.length, 500, 'the ratified catalog stays exactly 500');
  assert.equal(SPECIAL500_ALL.length, 750, 'the sweep set is base + annex + annex wave 2');
  assert.ok(SPECIAL500_COMPLETE);

  const annexIds = new Set(SPECIAL500_ANNEX.map((e) => e.id));
  for (const id of BENCH_IDS) {
    assert.ok(annexIds.has(id), `bench spare ${id} is implemented in the annex`);
  }
  const newIds = SPECIAL500_ANNEX.map((e) => e.id).filter((id) => id.startsWith('SPX-D-'));
  assert.equal(newIds.length, 30, 'thirty new SPX-D proposals');
});

test('annex is schema-valid inside the full sweep set and id-unique against the 500', () => {
  assert.deepEqual(validateSpecial500(SPECIAL500_ALL), []);
  const allIds = SPECIAL500_ALL.map((e) => e.id);
  assert.equal(new Set(allIds).size, allIds.length, 'no id collision with the ratified 500');
  for (const e of SPECIAL500_ANNEX) {
    for (const s of e.sectors || []) {
      assert.ok(SECTOR_IDS.has(s), `${e.id}: unknown sector ${s}`);
    }
  }
  // every after-gate in the annex points at a real entry in the sweep set
  for (const e of SPECIAL500_ANNEX) {
    for (const dep of e.after || []) {
      assert.ok(special500ById(dep) || SPECIAL500_ANNEX.some((x) => x.id === dep), `${e.id}: after ${dep} missing`);
    }
  }
});

test('an annex entry fires through the same director seam and writes the same flag shape', () => {
  const bus = stubBus();
  special500Director.init({ bus });
  const state = fixtureState();
  state.world.currentSectorId = 'sector_ceres_belt';
  special500Director.update(0.5, state);
  // SP1-152 The Tumbleweed: sectorEntry commsLog in the belt
  const logs = bus.seen.filter((s) => s.event === 'comms:log' && /tumbling through the belt/.test(s.payload.text));
  assert.equal(logs.length, 1);
  assert.equal(state.story.flags['special500.SP1-152'], state.simTime);
  // and SP3-175 stays quiet in the wrong sector
  assert.equal(state.story.flags['special500.SP3-175'], undefined);
});

test('the after-chain holds: the Favor Ledger follow-up waits for SP1-097 and a dock', () => {
  const bus = stubBus();
  special500Director.init({ bus });
  const state = fixtureState();
  state.world.currentSectorId = 'sector_tethys_junction';
  state.world.active.stations = [{ id: 7, stationId: 'station_tethys', pos: { x: 5000, z: -2000 } }];
  state.entities.get(1).pos = { x: 5200, z: -2100 };
  special500Director.update(0.5, state);
  assert.ok(state.story.flags['special500.SP1-097'] != null, 'the Favor Ledger fires first');
  assert.equal(state.story.flags['special500.SPX-D-02'], undefined, 'the second line waits for the first');
  // a dock receipt in a later check delivers the second line
  state.simTime += 2;
  bus.deliver('dock:docked');
  special500Director.update(0.5, state);
  const second = bus.seen.filter((s) => s.event === 'comms:popup' && /RETURNED, ONCE, TO LOOK/.test(s.payload.text));
  assert.equal(second.length, 1, 'the ledger posts its second entry only after the first visit and a return');
  assert.equal(state.story.flags['special500.SPX-D-02'], state.simTime);
});

test('recurring annex calendar rituals re-arm per world year', () => {
  const bus = stubBus();
  special500Director.init({ bus });
  const state = fixtureState();
  // Founders' Lie: day 1, first two minutes
  state.simTime = 1 * CAL_DAY_S + 60;
  special500Director.update(0.5, state);
  const founders = () => bus.seen.filter((s) => s.event === 'news:publish' && /ORIGIN DISPUTED/.test(s.payload.text));
  assert.equal(founders().length, 1);
  // same save, next year day 1: re-arms
  state.simTime = 41 * CAL_DAY_S + 60;
  special500Director.update(0.5, state);
  assert.equal(founders().length, 2, 'the ritual returns on the next year cycle');
});
