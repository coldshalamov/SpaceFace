import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPECIAL500, SPECIAL500_COMPLETE, validateSpecial500, special500ById,
} from '../src/data/special500/index.js';
import { SECTORS } from '../src/data/sectors.js';
import { special500Director, seededChance } from '../src/systems/special500Director.js';
import { CAL_DAY_S, CAL_YEAR_DAYS } from '../src/data/worldCalendar.js';

const SECTOR_IDS = new Set(SECTORS.map((s) => s.id));

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
    deliver(event) {
      for (const fn of handlers.get(event) || []) fn({});
    },
  };
}

function fixtureState() {
  return {
    simTime: 0,
    tick: 0,
    mode: 'flight',
    meta: { seed: 2011 },
    // Live shapes: sector on state.world, hull position on the player entity's pos,
    // stations published by the world owner on state.world.active.
    playerId: 1,
    player: {},
    world: {
      currentSectorId: 'sector_helios_prime',
      active: { stations: [{ id: 7, stationId: 'station_tethys', pos: { x: 5000, z: -2000 } }], pois: [] },
    },
    story: { flags: {} },
    entities: new Map([[1, { id: 1, type: 'player', alive: true, pos: { x: 0, z: 0 } }]]),
  };
}

test('special500 catalog is schema-valid', () => {
  const problems = validateSpecial500();
  assert.deepEqual(problems, []);
  const ids = SPECIAL500.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate ids');
  for (const e of SPECIAL500) {
    for (const s of e.sectors || []) {
      assert.ok(SECTOR_IDS.has(s), `${e.id}: unknown sector ${s}`);
    }
  }
});

test('slice proves the delivery channels', () => {
  const byId = (id) => SPECIAL500.find((e) => e.id === id);
  assert.ok(byId('SP3-019'), 'news channel entry present');
  assert.equal(byId('SP3-019').channel, 'news');
  assert.ok(byId('SP3-002'), 'spectacle channel entry present');
  assert.ok(byId('SP1-097'), 'comms channel entry present');
  assert.ok(byId('SP3-033'), 'sectorEntry trigger present');
});

test('calendar news fires on the wire day and re-arms yearly', () => {
  const bus = stubBus();
  special500Director.init({ bus });
  const state = fixtureState();
  // day 10: nothing yet
  state.simTime = 10 * CAL_DAY_S + 50;
  special500Director.update(0.5, state);
  assert.equal(bus.seen.filter((s) => s.event === 'news:publish').length, 0);
  // day 11: bulletin
  state.simTime = 11 * CAL_DAY_S + 50;
  special500Director.update(0.5, state);
  const news = bus.seen.filter((s) => s.event === 'news:publish' && /umbra transit tomorrow/.test(s.payload.text));
  assert.equal(news.length, 1);
  assert.match(news[0].payload.text, /umbra transit tomorrow/);
  assert.equal(state.story.flags['special500.SP3-019'], state.simTime);
  // same year, day 12 window: umbra minute spectacle + memory record
  state.simTime = 12 * CAL_DAY_S + 120;
  special500Director.update(0.5, state);
  const logs = bus.seen.filter((s) => s.event === 'comms:log' && /key light fails/.test(s.payload.text));
  assert.equal(logs.length, 1);
  assert.match(logs[0].payload.text, /key light fails/);
  const memory = state.story.depthProgramEncounters.completed['special500.SP3-002'];
  assert.ok(memory, 'memory record written');
  assert.equal(memory.outcome, 'observed');
  // next year day 11: re-armed, fires again
  state.simTime = (CAL_YEAR_DAYS + 11) * CAL_DAY_S + 50;
  special500Director.update(0.5, state);
  assert.equal(bus.seen.filter((s) => s.event === 'news:publish' && /umbra transit tomorrow/.test(s.payload.text)).length, 2);
});

test('sectorEntry and proximity triggers fire once per save', () => {
  const bus = stubBus();
  special500Director.init({ bus });
  const state = fixtureState();
  state.world.currentSectorId = 'sector_ceres_belt';
  special500Director.update(0.5, state);
  let logs = bus.seen.filter((s) => s.event === 'comms:log' && /eleven real cargo tethers/.test(s.payload.text));
  assert.equal(logs.length, 1);
  assert.equal(state.story.flags['special500.SP3-033'], state.simTime);
  // second check in the same sector: no refire
  state.simTime += 2;
  special500Director.update(0.5, state);
  assert.equal(bus.seen.filter((s) => s.event === 'comms:log' && /eleven real cargo tethers/.test(s.payload.text)).length, 1);

  // proximity: near the tethys buoy line (advance past the check throttle)
  state.simTime += 2;
  state.world.currentSectorId = 'sector_tethys_junction';
  state.entities.get(1).pos = { x: 5200, z: -2100 };
  special500Director.update(0.5, state);
  const popups = bus.seen.filter((s) => s.event === 'comms:popup' && s.payload.sender === 'Unregistered buoy');
  assert.equal(popups.length, 1);
  assert.equal(popups[0].payload.sender, 'Unregistered buoy');
  assert.ok(state.story.flags['special500.SP1-097']);
});

test('hashDaily is stable for a seed and inside [0,1)', () => {
  const a = seededChance('SPX|120|2011');
  const b = seededChance('SPX|120|2011');
  const c = seededChance('SPX|121|2011');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(a >= 0 && a < 1);
});

test('catalog completion constant gates the full-count assertion', () => {
  if (SPECIAL500_COMPLETE) {
    assert.equal(SPECIAL500.length, 500, 'catalog must hold exactly 500 entries when complete');
    assert.ok(special500ById('SP3-002'));
  } else {
    assert.ok(SPECIAL500.length > 0, 'slice entries present');
  }
});
