import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { flybyFocus } from '../src/systems/flybyFocus.js';

test('a recycled hostile does not inherit the previous occupant flyby cooldown', () => {
  const sim = createSimulation({ seed: 29, systems: [flybyFocus] });
  const owner = sim.registry.get('flybyFocus');
  try {
    sim.state.mode = 'flight';
    const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 },
      vel: { x: 120, z: 0 }, hull: 100 });
    sim.state.playerId = player.id;
    const spec = { type: 'ship', team: 1, pos: { x: 120, z: 0 },
      vel: { x: -20, z: 0 }, radius: 12, hull: 100,
      data: { ai: { huntPlayer: true } } };
    const first = sim.spawn(spec);
    owner.update(1 / 60, sim.state);
    assert.equal(sim.state.player.flybyFocus.targetId, first.id);
    const generation = first.occupantGeneration;
    sim.helpers.removeEntity(first.id, { immediate: true });
    const next = sim.spawn(spec);
    assert.equal(next.id, first.id, 'exercise the actual entity recycler');
    assert.notEqual(next.occupantGeneration, generation);
    sim.state.simTime = 5;
    owner.update(1 / 60, sim.state);
    assert.equal(sim.state.player.flybyFocus.targetId, next.id,
      'after the global anti-spam floor, this new hostile life can open its own window');
  } finally {
    owner.destroy(); sim.dispose();
  }
});
