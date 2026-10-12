import test from 'node:test';
import assert from 'node:assert/strict';
import { swarmArena, SWARM_VIEW_KEEP_RADIUS } from '../src/systems/swarmArena.js';

test('a released rock in view waits; one off camera, a ship, and hive geometry keep their deadlines', () => {
  const sys = Object.create(swarmArena);
  const rock = (id, x, data = {}) => [id, { id, type: 'asteroid', alive: true, pos: { x, z: 0 }, data: { despawnAt: 10.1, ...data } }];
  sys.state = {
    simTime: 10,
    playerId: 1,
    entities: new Map([
      [1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: {} }],
      rock(2, 300),
      rock(3, SWARM_VIEW_KEEP_RADIUS + 200),
      rock(4, 200, { swarmHiveReleased: true }),
      rock(5, 250, { despawnAt: 40 }),
      [6, { id: 6, type: 'ship', alive: true, pos: { x: 100, z: 0 }, data: { despawnAt: 10.1 } }],
    ]),
  };
  sys._holdInViewReleases(sys.state);
  const due = (id) => sys.state.entities.get(id).data.despawnAt;
  assert.ok(due(2) > 10.5, 'in view: held');
  assert.equal(due(3), 10.1, 'off camera: ordinary sweep');
  assert.equal(due(4), 10.1, 'hive geometry keeps its lifecycle');
  assert.equal(due(5), 40, 'a distant deadline is untouched');
  assert.equal(due(6), 10.1, 'not a solid body');
  sys.state.entities.get(1).pos.x = 5000;
  sys.state.simTime = 11;
  sys._holdInViewReleases(sys.state);
  assert.ok(due(2) <= 12, 'the fight moved on: released on the ordinary deadline');
});
