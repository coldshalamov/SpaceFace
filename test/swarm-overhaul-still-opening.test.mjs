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

test('the lesson well is planted asleep and wakes when the lesson releases the pack', async () => {
  const { swarmArena } = await import('../src/systems/swarmArena.js');
  const sys = Object.create(swarmArena);
  const registered = [];
  const updates = [];
  const fields = {
    registerEnvironmental: (spec) => { registered.push(spec); return spec; },
    updateExternal: (id, patch) => { updates.push({ id, patch }); return true; },
  };
  sys._fieldsSystem = () => fields;
  sys.state = { simTime: 0, tick: 0, entities: new Map(), entityList: [], player: { pos: { x: 0, z: 0 } } };
  sys.helpers = null;
  sys._ids = [];
  sys._wellIds = [];
  sys._installOpeningLesson({ holdTicks: 600, rock: { x: 78, z: 16, radius: 6 }, well: { x: -24, z: 108, radius: 96, strength: 90 } });
  assert.equal(registered.length, 1);
  assert.equal(registered[0].strength, 0, 'no pull before the pilot has the room');
  sys._broodHeldUntil = 10;
  sys._onOpeningLessonReleased();
  assert.deepEqual(updates, [{ id: 'swarm-opening-lesson-well', patch: { strength: 90 } }]);
  sys._onOpeningLessonReleased();
  assert.equal(updates.length, 1, 'wakes once');
});

test('a later round holds its field law through the arrival breath, then installs it once', () => {
  const { sys, ship } = room([{ kind: 'cone' }]);
  const installed = [];
  sys._installFields = (specs) => installed.push(specs);
  sys._deferredUntil = 5;
  sys.state.simTime = 4.9;
  sys._releaseRoundFields(sys.state);
  sys._tickToys(1 / 60, sys.state);
  assert.equal(installed.length, 0, 'no law during the breath');
  assert.equal(Math.hypot(ship.vel.x, ship.vel.z), 0, 'no shove during the breath');
  sys.state.simTime = 5;
  sys._releaseRoundFields(sys.state);
  sys._releaseRoundFields(sys.state);
  assert.deepEqual(installed, [[{ kind: 'cone' }]]);
  assert.equal(sys._deferredFields, null);
});
