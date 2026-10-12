import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { economy } from '../src/systems/economy.js';
import { stationServices } from '../src/systems/stationServices.js';

const STATION = 'station_helios';
function rig(credits = 10000) {
  const state = createGameState(4242), bus = createBus();
  const ship = { id: 1, type: 'ship', alive: true, hull: 50, hullMax: 140, armorHp: 0, armorMax: 0,
    pos: { x: 0, z: 0 }, flags: { docked: true }, data: {} };
  state.entities = new Map([[1, ship]]); state.entityList = [ship]; state.playerId = 1;
  state.player.credits = credits; state.player.debt = 0; state.player.flags = { docked: true };
  state.ui = { docked: true, dockedStationId: STATION };
  state.world = { currentSectorId: 'sector_helios_prime' };
  state.fuel = { current: 20, max: 100 }; state.factions = { faction_scn: { rep: 0 } };
  const econ = Object.create(economy), yard = Object.create(stationServices);
  const ctx = { state, bus, helpers: {}, registry: { get: n => n === 'economy' ? econ : n === 'stationServices' ? yard : null } };
  yard.init(ctx); econ.init(ctx); bus.emit('dock:docked', { stationId: STATION });
  const toasts = []; bus.on('toast', t => toasts.push(t));
  return { state, bus, ship, econ, yard, toasts, jobs: () => state.stationServices.player.jobs };
}
for (const type of ['refuel', 'repair']) {
  for (const status of ['queued', 'active']) {
    test(`${type}: a repeated ${status} booking does not charge for work already bought`, () => {
      const r = rig(); r.econ.handleService({ type });
      const job = r.jobs()[0], credits = r.state.player.credits;
      job.status = status;
      for (let i = 0; i < 4; i++) r.econ.handleService({ type });
      assert.equal(r.jobs().length, 1); assert.equal(r.jobs()[0], job);
      assert.equal(r.state.player.credits, credits);
      assert.equal(r.ship.hull, 50); assert.equal(r.state.fuel.current, 20, 'refusal must not take the instant fallback');
      assert.match(r.toasts.at(-1).text, /already (queued|underway)/i);
    });
  }
}
test('a repeated hardship refuel books one note, not a stack of undeliverable debt', () => {
  const r = rig(0); r.econ.handleService({ type: 'refuel' }); const debt = r.state.player.debt;
  assert.ok(debt > 0); r.econ.handleService({ type: 'refuel' });
  assert.equal(r.state.player.debt, debt); assert.equal(r.jobs().length, 1);
});
test('repair and refuel can coexist; a completed partial pump can be topped up', () => {
  const r = rig(); r.econ.handleService({ type: 'refuel', amount: 10 });
  r.econ.handleService({ type: 'repair' });
  assert.deepEqual(r.jobs().map(j => j.type), ['refuel', 'repair']);
  for (let i = 0; i < 40 && r.jobs().some(j => j.type === 'refuel'); i++) {
    r.state.simTime += 1; r.yard.update(1, r.state);
  }
  assert.ok(!r.jobs().some(j => j.type === 'refuel'));
  assert.equal(r.state.fuel.current, 30);
  r.econ.handleService({ type: 'refuel', amount: 10 });
  assert.equal(r.jobs().filter(j => j.type === 'refuel').length, 1);
});
test('legacy non-production docks retain the instant delivery contract', () => {
  const r = rig(); r.state.ui.docked = false;
  r.econ.handleService({ type: 'refuel', amount: 10 });
  assert.equal(r.state.fuel.current, 30); assert.equal(r.jobs().length, 0);
});
