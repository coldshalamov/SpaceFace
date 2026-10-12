import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { countermeasures } from '../src/systems/countermeasures.js';
import { WEAPONS } from '../src/data/weapons.js';

const flak = WEAPONS.find(w => w.id === 'wpn_flak_turret_s');
function rig(rot = 0) {
  const ship = { id: 1, type: 'ship', team: 0, alive: true, pos: { x: 0, z: 0 }, rot,
    cap: 100, data: { fittings: [], weapons: [{ ...flak }] } };
  let rolls = 0;
  const state = { meta: { seed: 4242 }, mode: 'flight', tick: 1, simTime: 1, input: {},
    entityList: [ship], entities: new Map([[1, ship]]), rng: () => { rolls++; return 0; } };
  const bus = createBus(), receipts = [];
  bus.on('pds:intercept', p => receipts.push(p));
  const sys = Object.create(countermeasures); sys.init({ state, bus, helpers: {} });
  const add = (id, distance, angle, kind = 'missile', team = 1, ownerId = 99) => {
    const p = { id, type: 'projectile', team, ownerId, alive: true,
      pos: { x: Math.cos(angle) * distance, z: Math.sin(angle) * distance }, data: { kind } };
    state.entityList.push(p); state.entities.set(id, p); return p;
  };
  return { ship, state, receipts, add, rolls: () => rolls,
    step: () => sys.update(1 / 60, state) };
}
for (const rot of [0, Math.PI / 2, -Math.PI + 0.1]) {
  test(`a nearer blind-side missile cannot suppress flak inside its real arc at yaw ${rot}`, () => {
    const r = rig(rot);
    const blind = r.add(2, 30, rot + Math.PI);
    const reachable = r.add(3, 180, rot);
    r.step();
    assert.equal(blind.alive, true, 'blind-side counterplay remains real');
    assert.equal(reachable.alive, false, 'the reachable threat receives the paid shot');
    assert.equal(r.receipts[0]?.projectileId, reachable.id);
    assert.equal(r.ship.cap, 100 - flak.energyCost);
    assert.equal(r.rolls(), 1);
    assert.equal(r.ship.data.pds.weaponCooldownT, flak.interceptCooldownS);
  });
}
test('a blind-side missile cannot suppress a reachable bolt when no reachable seeker exists', () => {
  const r = rig(); const blind = r.add(2, 30, Math.PI); const bolt = r.add(3, 100, 0, 'bolt');
  r.step(); assert.equal(blind.alive, true); assert.equal(bolt.alive, false);
});
test('reachable missiles retain priority over closer reachable bolts', () => {
  const r = rig(); const bolt = r.add(2, 20, 0, 'bolt'); const seeker = r.add(3, 200, 0);
  r.step(); assert.equal(bolt.alive, true); assert.equal(seeker.alive, false);
});
test('no legal target spends no energy, cooldown or random draw', () => {
  const r = rig();
  for (const [id, distance, angle, kind, team, owner] of [
    [2, 20, Math.PI, 'missile', 1, 99], [3, 20, 0, 'missile', 0, 99],
    [4, 20, 0, 'bolt', 1, 1], [5, flak.range + 1, 0, 'missile', 1, 99],
  ]) r.add(id, distance, angle, kind, team, owner);
  r.step(); assert.equal(r.receipts.length, 0); assert.equal(r.ship.cap, 100);
  assert.equal(r.ship.data.pds.weaponCooldownT || 0, 0); assert.equal(r.rolls(), 0);
});
test('the 360-degree servo still intercepts its nearest threat behind the hull', () => {
  const r = rig(); r.ship.data.weapons = []; r.ship.data.fittings = ['mod_pds_servo_s'];
  const rear = r.add(2, 20, Math.PI); const front = r.add(3, 50, 0);
  r.step(); assert.equal(rear.alive, false); assert.equal(front.alive, true);
  assert.equal(r.receipts[0]?.source, 'servo');
});
