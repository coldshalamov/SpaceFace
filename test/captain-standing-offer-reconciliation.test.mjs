import test from 'node:test';
import assert from 'node:assert/strict';
import { syncCaptainStandingOrders } from '../src/systems/captainStandingOrders.js';
import { hash32 } from '../src/core/rng.js';

const info = { id: 'station_helios', name: 'Helios', factionId: 'faction_mts' };
const captain = id => ({ id, name: id, alive: true, outcomes: { rescued: 1 },
  homeStationId: info.id, orderDueAtS: 1800 });
const offerId = (id, cycle = 0) => `captain-order:${hash32(id).toString(36)}:${cycle}`;
function setup(n = 1) {
  const host = { state: { simTime: 1800, traffic: { captainRoster: Array.from({ length: n }, (_, i) => captain(`c${i}`)) },
    missions: { active: [], receipts: [], standingOrders: [], captainOrderCycles: {} } } };
  return { host, board: { slots: [] } };
}
const sync = ({ host, board }) => syncCaptainStandingOrders(host, info, board);
const ids = rt => rt.board.slots.map(row => row.id);

test('known captain death withdraws only the unaccepted relief row on cached synchronization', () => {
  const rt = setup(); sync(rt);
  const unrelated = { id: 'authored', source: 'ecology' };
  rt.board.slots.push(unrelated);
  rt.host.state.traffic.captainRoster[0].alive = false;
  assert.equal(sync(rt), true);
  assert.deepEqual(rt.board.slots, [unrelated]);
  assert.equal(sync(rt), false);
});

test('eviction and unknown alive state do not withdraw earned offers', () => {
  for (const mode of ['evicted', 'unknown']) {
    const rt = setup(); sync(rt); const before = JSON.stringify(rt.board);
    if (mode === 'evicted') rt.host.state.traffic.captainRoster = [];
    else delete rt.host.state.traffic.captainRoster[0].alive;
    assert.equal(sync(rt), false);
    assert.equal(JSON.stringify(rt.board), before);
  }
});

test('positive cycle advance withdraws old offer during cooldown and posts only the new cycle when due', () => {
  const rt = setup(); sync(rt);
  rt.host.state.missions.captainOrderCycles.c0 = { cycle: 1, dueAtS: 2400 };
  assert.equal(sync(rt), true); assert.deepEqual(ids(rt), []);
  rt.host.state.simTime = 2400;
  assert.equal(sync(rt), true); assert.deepEqual(ids(rt), [offerId('c0', 1)]);
  assert.equal(sync(rt), false);
});

test('known cycle supersedes an old offer even after roster eviction', () => {
  const rt = setup(); sync(rt); rt.host.state.traffic.captainRoster = [];
  rt.host.state.missions.captainOrderCycles.c0 = { cycle: 1, dueAtS: 2400 };
  assert.equal(sync(rt), true); assert.deepEqual(ids(rt), []);
});

test('unknown, malformed and future offer cycles are preserved without destructive inference', () => {
  for (const id of ['foreign', offerId('c0', '01'), offerId('c0', 'broken'), offerId('c0', 2)]) {
    const rt = setup(); sync(rt); rt.board.slots[0].id = id;
    rt.host.state.missions.captainOrderCycles.c0 = { cycle: 1, dueAtS: 2400 };
    assert.equal(sync(rt), false); assert.deepEqual(ids(rt), [id]);
  }
});

test('active and receipted early clients do not starve the eligible fourth client', () => {
  for (const mode of ['active', 'receipt']) {
    const rt = setup(4);
    if (mode === 'active') rt.host.state.missions.active = [0, 1, 2].map(i => ({ giverId: `c${i}` }));
    else rt.host.state.missions.receipts = [0, 1, 2].map(i => ({ sourceOfferId: offerId(`c${i}`) }));
    assert.equal(sync(rt), true); assert.deepEqual(ids(rt), [offerId('c3')]);
  }
});

test('accepted first offer frees capacity for the next eligible client without exceeding three', () => {
  const rt = setup(6); sync(rt); rt.board.slots.shift();
  rt.host.state.missions.active.push({ giverId: 'c0' });
  assert.equal(sync(rt), true);
  assert.deepEqual(ids(rt), ['c1', 'c2', 'c3'].map(id => offerId(id)));
  assert.equal(sync(rt), false); assert.equal(rt.board.slots.length, 3);
});

test('existing valid legacy extras are retained but admit no additional standing offers', () => {
  const rt = setup(6); sync(rt);
  rt.board.slots.push({ ...rt.board.slots[0], id: offerId('c3'), giverId: 'c3', cause: { tag: 'remembered_captain', captainId: 'c3' } });
  const before = JSON.stringify(rt.board);
  assert.equal(sync(rt), false); assert.equal(JSON.stringify(rt.board), before);
});

test('desk client and unrelated authored rows survive captain cleanup and consume standing capacity only', () => {
  const rt = setup(); sync(rt);
  const desk = { id: 'desk:0', source: 'captainStandingOrder', cause: { tag: 'standing_client', standingOrderId: 'desk' } };
  const authored = { id: 'authored', source: 'ecology', cause: { tag: 'remembered_captain', captainId: 'c0' } };
  rt.board.slots.push(desk, authored); rt.host.state.traffic.captainRoster[0].alive = false;
  assert.equal(sync(rt), true); assert.deepEqual(rt.board.slots, [desk, authored]);
});

test('ordinary earned desk clients can fill behind blocked captain candidates', () => {
  const rt = setup(3);
  rt.host.state.missions.active = [0, 1, 2].map(i => ({ giverId: `c${i}` }));
  rt.host.state.missions.standingOrders.push({ id: 'standing:desk', stationId: info.id,
    type: 'cargo_delivery', count: 3, cycle: 0, template: { type: 'cargo_delivery' } });
  assert.equal(sync(rt), true); assert.deepEqual(ids(rt), ['standing:desk:0']);
});

test('active contracts, receipts and progression remain byte-for-byte unchanged across death and cycle cleanup', () => {
  const rt = setup(2); sync(rt);
  const missions = rt.host.state.missions;
  missions.active = [{ ...rt.board.slots[0], status: 'active', acceptedAtS: 1800, cargo: { qty: 2 } }];
  missions.receipts = [{ sourceOfferId: 'unrelated', reward_cr: 360 }];
  missions.captainOrderCycles.c1 = { cycle: 1, dueAtS: 2400 };
  const before = JSON.stringify(missions), activeRef = missions.active;
  rt.host.state.traffic.captainRoster[0].alive = false;
  assert.equal(sync(rt), true); assert.deepEqual(ids(rt), []);
  assert.equal(JSON.stringify(missions), before); assert.equal(missions.active, activeRef);
});

test('JSON-restored cached board reconciles once and remains idempotent', () => {
  let rt = setup(4); sync(rt);
  rt.host.state.traffic.captainRoster[0].alive = false;
  rt = JSON.parse(JSON.stringify(rt));
  assert.equal(sync(rt), true);
  assert.deepEqual(ids(rt), ['c1', 'c2', 'c3'].map(id => offerId(id)));
  const before = JSON.stringify(rt);
  assert.equal(sync(rt), false); assert.equal(JSON.stringify(rt), before);
});
