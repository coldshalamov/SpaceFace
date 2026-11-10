import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { stationServices } from '../src/systems/stationServices.js';

function harness() {
  const hull = { id: 1, type: 'ship', hull: 20, hullMax: 100, armorHp: 0, armorMax: 0,
    data: { defId: 'ship_kestrel' }, flags: { docked: true } };
  const state = { meta: { seed: 42 }, simTime: 0, timeScale: 0,
    playerId: 1, entities: new Map([[1, hull]]),
    player: { activeShipIndex: 0, ownedShips: [{ defId: 'ship_kestrel' }, { defId: 'ship_kestrel' }] },
    ui: { docked: true, dockedStationId: 'station_helios' }, fuel: { current: 20, max: 100 } };
  const bus = createBus();
  const refunds = [];
  const aborts = [];
  bus.on('economy:grantCredits', receipt => refunds.push(receipt.amount));
  bus.on('service:aborted', receipt => aborts.push(receipt));
  const yard = Object.create(stationServices);
  yard.init({ state, bus, helpers: {} });
  yard.enqueuePlayerJob({ type: 'repair', units: 80, stationId: 'station_helios', meta: { cost: 800 } });
  return { state, hull, yard, refunds, aborts, bus };
}

test('a paid repair cannot jump to a different owned hull with the same definition', () => {
  const h = harness();
  h.state.player.activeShipIndex = 1;
  h.hull.hull = 50;
  h.yard.update(1, h.state);
  assert.equal(h.hull.hull, 50);
  assert.deepEqual(h.refunds, [800]);
  assert.equal(h.aborts[0]?.reason, 'ship_changed');
  assert.equal(h.state.stationServices.player.jobs.length, 0);
  h.yard.update(1, h.state);
  assert.deepEqual(h.refunds, [800], 'a cancelled job refunds once');
  h.yard.destroy();
});

test('Shipworks stats publication refunds the outgoing job before another service click', () => {
  const h = harness();
  h.state.player.activeShipIndex = 1;
  h.bus.emit('ship:statsChanged', { shipId: 1 });
  assert.deepEqual(h.refunds, [800]);
  assert.deepEqual(h.yard.pendingPlayerService('repair'), { units: 0, hull: 0, armor: 0 });
  assert.equal(h.yard.enqueuePlayerJob({ type: 'repair', units: 80,
    stationId: 'station_helios', meta: { cost: 800 } }), true);
  h.yard.update(1, h.state);
  assert.ok(h.hull.hull > 20, 'the incoming hull can book its own new job');
  assert.deepEqual(h.refunds, [800]);
  h.yard.destroy();
});

test('repair ownership survives Continue and still permits work on the original hull', () => {
  const h = harness();
  const packed = JSON.parse(JSON.stringify(h.yard.serialize()));
  h.yard.deserialize(packed);
  h.yard.update(1, h.state);
  assert.ok(h.hull.hull > 20);
  assert.deepEqual(h.refunds, []);
  h.state.player.activeShipIndex = 1;
  const repaired = h.hull.hull;
  const applied = h.state.stationServices.player.jobs[0].applied;
  h.yard.update(1, h.state);
  assert.equal(h.hull.hull, repaired);
  assert.deepEqual(h.refunds, [Math.round(800 * (80 - applied) / 80)]);
  h.yard.destroy();
});
