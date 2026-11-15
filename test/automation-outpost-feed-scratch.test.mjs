// AUDIT-03 — live outpost production keeps its shared-feed allocation without per-tick arrays.
import test from 'node:test';
import assert from 'node:assert/strict';

import { automation } from '../src/systems/automation.js';
import { OUTPOSTS } from '../src/data/automation.js';

const { retiredInto: _retired, ...BOOK } = OUTPOSTS.find((def) => def.id === 'outpost_refinery');
const HOME = 'sector_helios_prime';

function boot() {
  const state = {
    simTime: 120,
    meta: { seed: 0xA03 },
    playerId: 1,
    mode: 'flight',
    player: { credits: 0, stats: {}, cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 200, capMass: 200 }, ownedShips: [] },
    world: { currentSectorId: HOME, activeSector: null },
    entities: new Map(),
    entityList: [],
    automation: null,
  };
  const inst = Object.create(automation);
  inst.init({ state, bus: { on() {}, off() {}, emit() {} }, helpers: {}, registry: null });
  inst.newGame();
  inst._orePrice = () => 28;
  const a = state.automation;
  const feed = (id, oreType, buffer, extra = {}) => a.drones.push({
    id, defId: 'drone_mk1', count: 1, sectorId: HOME, oreType, buffer, bufferCap: 400,
    fuel: 240, fuelMax: 240, durability: 40, status: 'mining', entityIds: [], ...extra,
  });
  feed('feed_d_iron', 'cmdty_ore_iron', 3);
  feed('feed_a_iron', 'cmdty_ore_iron', 5);
  feed('feed_c_copper', 'cmdty_ore_copper', 7);
  feed('feed_b_down', 'cmdty_ore_iron', 50, { status: 'distressed' });
  feed('feed_e_far', 'cmdty_ore_iron', 50, { sectorId: 'sector_frontier_remote' });
  const outpost = (id, extra = {}) => a.outposts.push({
    ...BOOK, id, defId: 'fixture_canonical_book', level: 1, sectorId: HOME, storage: 0,
    storageCap: BOOK.storageCap, autoSell: false, raidCooldown: 0, status: 'producing', ratePerMin: 0, ...extra,
  });
  outpost('outpost_z');
  outpost('outpost_m');
  outpost('outpost_composite', {
    defId: 'outpost_composite_test', recipe: { inputs: { cmdty_ore_iron: 2, cmdty_ore_copper: 1 }, output: { cmdty_composite_test: 1 } },
    outRate: 0.5, storageCap: 100,
  });
  return { state, inst, a };
}

function trace(a) {
  return {
    feeds: a.drones.map((g) => [g.id, +g.buffer.toFixed(9)]),
    outposts: a.outposts.map((o) => [o.id, +o.storage.toFixed(9), o.status, o.production.localFeeders]),
  };
}

test('live outpost production over many ticks matches the established shared-feed allocation', () => {
  const { inst, a } = boot();
  const out = [];
  for (let tick = 0; tick < 20; tick++) {
    a.drones[tick % 3].buffer += 1.25;
    inst._updateOutposts(0.5, a);
    if (tick % 4 === 3) out.push(trace(a));
  }
  assert.deepEqual(out, EXPECTED);
});

test('live outpost production does not build feed or outpost arrays each tick', () => {
  const { inst, a } = boot();
  let filters = 0;
  for (const list of [a.drones, a.outposts]) {
    Object.defineProperty(list, 'filter', { value(...args) { filters++; return Array.prototype.filter.apply(this, args); } });
  }
  inst._updateOutposts(0.5, a);
  inst._updateOutposts(0.5, a);
  assert.equal(filters, 0, 'the hot path filters neither the drone nor the outpost list');
  const feeders = inst._outpostFeeders(HOME, a);
  inst._updateOutposts(0.5, a);
  assert.equal(inst._outpostFeeders(HOME, a), feeders, 'the feeder list is one retained array');
  assert.deepEqual(feeders.map((g) => g.id), ['feed_a_iron', 'feed_c_copper', 'feed_d_iron']);
});

// Recorded from the pre-AUDIT-03 filter/sort implementation; the retained-array path must match it.
const STILL = [['feed_b_down', 50], ['feed_e_far', 50]];
const snap = (d, a, c, outposts) => ({
  feeds: [['feed_d_iron', d], ['feed_a_iron', a], ['feed_c_copper', c], ...STILL],
  outposts: outposts.map(([id, storage, status]) => [id, storage, status, 3]),
});
const EXPECTED = [
  snap(5.5, 0.25, 7.25, [['outpost_z', 1, 'producing'], ['outpost_m', 1, 'producing'], ['outpost_composite', 1, 'producing']]),
  snap(3.5, 0, 7.5, [['outpost_z', 2, 'producing'], ['outpost_m', 2, 'producing'], ['outpost_composite', 2, 'producing']]),
  snap(0, 0, 9, [['outpost_z', 3, 'producing'], ['outpost_m', 3, 'producing'], ['outpost_composite', 3, 'producing']]),
  snap(0, 0, 8.5, [['outpost_z', 3.625, 'starved'], ['outpost_m', 4, 'producing'], ['outpost_composite', 3.75, 'producing']]),
  snap(0, 0, 8, [['outpost_z', 4.25, 'starved'], ['outpost_m', 5, 'producing'], ['outpost_composite', 4.5, 'producing']]),
];
