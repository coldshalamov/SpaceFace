import test from 'node:test';
import assert from 'node:assert/strict';
import { survivalArena } from '../src/systems/survivalArena.js';

function room(deferred) {
  const sys = Object.create(survivalArena);
  const ship = { id: 7, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  sys.state = { simTime: 1, tick: 60, entities: new Map([[7, ship]]) };
  sys._toys = [{ kind: 'current', id: 'c', at: { x: 0, z: 0 }, center: { x: 0, z: 0 }, radius: 500, dir: { x: 1, z: 0 }, strength: 400 }];
  sys._installedFields = [];
  sys._installedAt = 0;
  sys._deferredFields = deferred;
  return { sys, ship };
}

test('the opening lesson room is still: currents wait for the lesson release', () => {
  const { sys, ship } = room([{ kind: 'cone' }]);
  sys._tickToys(1 / 60, sys.state);
  assert.equal(Math.hypot(ship.vel.x, ship.vel.z), 0, 'no shove before the pack is released');
});
