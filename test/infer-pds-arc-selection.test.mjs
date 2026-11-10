import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { countermeasures } from '../src/systems/countermeasures.js';

test('flak chooses a reachable forward shot even when a nearer missile crosses astern', () => {
  const ship = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, rot: 0,
    cap: 20, data: { weapons: [{ defId: 'wpn_flak_turret_s' }] } };
  const aft = { id: 2, type: 'projectile', alive: true, team: 1, pos: { x: -20, z: 0 }, data: { kind: 'missile' } };
  const front = { id: 3, type: 'projectile', alive: true, team: 1, pos: { x: 120, z: 0 }, data: { kind: 'bolt' } };
  const state = { mode: 'flight', tick: 1, simTime: 1 / 60, input: {}, rng: () => 0,
    entityList: [ship, aft, front], entities: new Map([[1, ship], [2, aft], [3, front]]) };
  const bus = createBus();
  const receipts = [];
  bus.on('pds:intercept', (p) => receipts.push(p));
  const system = Object.create(countermeasures);
  system.init({ state, bus, helpers: {} });
  system.update(1 / 60, state);
  assert.equal(aft.alive, true, 'the authored rear blind spot stays real');
  assert.equal(front.alive, false, 'a rear contact cannot hide the forward threat from the battery');
  assert.equal(ship.cap, 19);
  assert.equal(receipts[0]?.projectileId, front.id);
  system.destroy();
});

for (const flag of ['destroyed', 'effectiveDisabled']) {
  test(`a ${flag} flak turret cannot intercept through the live countermeasure path`, () => {
    const ship = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, rot: 0,
      cap: 20, data: { weapons: [{ defId: 'wpn_flak_turret_s', subsystemId: 'turret_port' }] } };
    const shot = { id: 3, type: 'projectile', alive: true, team: 1,
      pos: { x: 120, z: 0 }, data: { kind: 'bolt' } };
    const state = { mode: 'flight', tick: 1, simTime: 1 / 60, input: {}, rng: () => 0,
      combat: { entities: { 1: { subsystems: { turret_port: { [flag]: true } } } } },
      entityList: [ship, shot], entities: new Map([[1, ship], [3, shot]]) };
    const system = Object.create(countermeasures);
    system.init({ state, bus: createBus(), helpers: {} });
    system.update(1 / 60, state);
    assert.equal(shot.alive, true, 'disarming the actual gun also removes its defensive fire');
    assert.equal(ship.cap, 20, 'a dark battery spends no defensive charge');
    state.combat.entities[1].subsystems.turret_port[flag] = false;
    state.tick++; state.simTime += 1 / 60;
    system.update(1 / 60, state);
    assert.equal(shot.alive, false, 'the same channel resumes when its hardware is restored');
    system.destroy();
  });
}

test('disarming flak preserves the separately fitted point-defense servo ring', () => {
  const ship = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, rot: 0,
    cap: 20, data: { fittings: ['mod_pds_servo_s'],
      weapons: [{ defId: 'wpn_flak_turret_s', subsystemId: 'turret_port' }] } };
  const shot = { id: 3, type: 'projectile', alive: true, team: 1,
    pos: { x: -40, z: 0 }, data: { kind: 'missile' } };
  const state = { mode: 'flight', tick: 1, simTime: 1 / 60, input: {}, rng: () => 0,
    combat: { entities: { 1: { subsystems: { turret_port: { destroyed: true } } } } },
    entityList: [ship, shot], entities: new Map([[1, ship], [3, shot]]) };
  const system = Object.create(countermeasures);
  system.init({ state, bus: createBus(), helpers: {} });
  system.update(1 / 60, state);
  assert.equal(shot.alive, false, 'the independent servo retains its all-around coverage');
  assert.equal(ship.cap, 20);
  system.destroy();
});
