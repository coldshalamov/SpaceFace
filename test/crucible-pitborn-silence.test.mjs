import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { pitbornCull, ensurePitbornState } from '../src/systems/faction_pitborn.js';

test('Pitborn crowd does not react to Crucible kills and resumes after the run', () => {
  const bus = createBus();
  const sim = createSimulation({ seed: 4242, bus, systems: [pitbornCull] });
  try {
    const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24, hull: 100, hullMax: 100 });
    sim.state.playerId = player.id;
    const pit = ensurePitbornState(sim.state), logs = [];
    bus.on('comms:log', p => logs.push(p));
    sim.state.run = { kind: 'survival', phase: 'active' };
    for (let i = 0; i < 20; i++) bus.emit('entity:killed', { id: 9000 + i, killerId: player.id });
    assert.equal(pit.crowd.score, 0);
    assert.equal(logs.length, 0);
    sim.state.run = { kind: 'survival', phase: 'inactive' };
    bus.emit('entity:killed', { id: 9100, killerId: player.id });
    assert.ok(pit.crowd.score > 0);
  } finally { sim.dispose(); }
});

