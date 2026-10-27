import test from 'node:test';
import assert from 'node:assert/strict';
import { swarmArena, SWARM_VIEW_KEEP_RADIUS } from '../src/systems/swarmArena.js';
import { createSimulation } from '../src/core/sim.js';
import { createRunState, validateRunState } from '../src/core/runState.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';

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

test('visible released debris survives the moving inter-wave clock, then expires off camera', () => {
  const sim = createSimulation({ seed: 4242, systems: [] });
  try {
    const state = sim.state; state.mode = 'flight';
    state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: 4242 });
    state.run.wave = 2;
    const player = sim.spawn({ type: 'ship', pos: { x: 0, z: 0 } }); state.playerId = player.id;
    const rock = sim.spawn({ type: 'asteroid', pos: { x: 100, z: 0 }, data: { despawnAt: 10.1 } });
    const sys = Object.create(swarmArena); sys.state = state; sys._nextTerrainCheck = Infinity;
    const core = sim.registry.get('core');
    let time = 10;
    for (const phase of ['cleanup', 'draft', 'refit', 'wave_intro', 'active']) {
      state.run.phase = phase;
      for (let i = 0; i < 60; i++) {
        state.simTime = time; time += 1 / 60;
        sys.update(1 / 60, state); core.lifetimeSweep(1 / 60, state);
        assert.equal(state.entities.get(rock.id), rock, `${phase}: the original visible rock remains`);
      }
    }
    player.pos.x = 5000;
    for (let i = 0; i < 90; i++) {
      state.simTime = time; time += 1 / 60;
      sys.update(1 / 60, state); core.lifetimeSweep(1 / 60, state);
    }
    assert.equal(state.entities.has(rock.id), false, 'ordinary expiry resumes after the pilot leaves');
  } finally { sim.dispose(); }
});

for (const phase of ['ended', 'victory']) test(`${phase} does not keep released debris alive`, () => {
  const sim = createSimulation({ seed: 4242, systems: [] });
  try {
    const state = sim.state; state.mode = 'flight'; state.simTime = 10;
    state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: 4242 });
    state.run.phase = phase; state.run.wave = 2;
    assert.equal(validateRunState(state.run).ok, true, 'the terminal envelope is a valid live run');
    const player = sim.spawn({ type: 'ship', pos: { x: 0, z: 0 } }); state.playerId = player.id;
    const rock = sim.spawn({ type: 'asteroid', pos: { x: 100, z: 0 }, data: { despawnAt: 10.1 } });
    const sys = Object.create(swarmArena); sys.state = state; sys._nextTerrainCheck = Infinity;
    sys.update(1 / 60, state); state.simTime = 10.2;
    sim.registry.get('core').lifetimeSweep(1 / 60, state);
    assert.equal(state.entities.has(rock.id), false);
  } finally { sim.dispose(); }
});
