// §22 A8 — a swarm kill by shove, throw, slam, or field prints that stunt's name
// on the results. Nothing clears the name when time passes.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createRunState } from '../src/core/runState.js';
import { createSimulation } from '../src/core/sim.js';
import { survivalResults } from '../src/systems/survivalResults.js';

const CAUSES = [
  ['shove', 'Rock Discovery'],
  ['throw', 'Bolas'],
  ['slam', 'Wrecking Ball'],
  ['field', 'Well Golf'],
];

function boot(seed) {
  const sim = createSimulation({ seed, systems: [survivalResults] });
  const run = createRunState({ kind: 'survival', seed });
  run.phase = 'active';
  sim.state.run = run;
  sim.state.playerId = 1;
  sim.state.mode = 'flight';
  const ready = [];
  sim.bus.on('run:resultsReady', (result) => ready.push(result));
  return { sim, ready };
}

function kill(sim, id, cause) {
  const victim = sim.spawn({
    type: 'ship',
    team: 1,
    pos: { x: id * 20, z: 0 },
    hull: 0,
    hullMax: 40,
    radius: 6,
  });
  victim.data = { runCohort: 'survival' };
  sim.bus.emit('entity:killed', {
    id: victim.id,
    killerId: sim.state.playerId,
    cause,
    pos: { x: victim.pos.x, z: victim.pos.z },
  });
}

test('shove, throw, slam, and field each keep their name on the results', () => {
  for (const seed of [4242, 8008]) {
    const { sim, ready } = boot(seed);
    CAUSES.forEach(([cause], index) => kill(sim, index + 2, cause));
    sim.state.simTime = 600;
    for (let i = 0; i < 120; i++) sim.step(1 / 60);
    sim.bus.emit('run:ended', { outcome: 'defeat', reason: 'player_death' });
    assert.equal(ready.length, 1, `seed ${seed} publishes one results model`);
    const names = ready[0].stuntKills.map((row) => row.name);
    for (const [, name] of CAUSES) {
      assert.ok(names.includes(name), `seed ${seed} results name ${name}, saw ${names.join(', ')}`);
    }
    assert.equal(new Set(names.filter((name) => CAUSES.some(([, expected]) => expected === name))).size, 4);
    sim.dispose();
  }
});

test('a recognized trick replaces the provisional cause name for that body', () => {
  const { sim, ready } = boot(4242);
  const victim = sim.spawn({
    type: 'ship', team: 1, pos: { x: 40, z: 0 }, hull: 0, hullMax: 40, radius: 6,
  });
  victim.data = { runCohort: 'survival' };
  sim.bus.emit('entity:killed', {
    id: victim.id, killerId: sim.state.playerId, cause: 'shove', pos: { x: 40, z: 0 },
  });
  sim.bus.emit('stunt:trickDetected', {
    name: 'One-Two',
    trickId: 'one_two',
    actorId: sim.state.playerId,
    targetId: victim.id,
    episodeId: 'ep-shove',
    consequence: { killed: true },
  });
  sim.bus.emit('run:ended', { outcome: 'defeat', reason: 'player_death' });
  const names = ready[0].stuntKills.map((row) => row.name);
  assert.deepEqual(names, ['One-Two']);
  sim.dispose();
});
