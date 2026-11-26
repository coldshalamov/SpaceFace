import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { swarmDrops } from '../src/systems/swarmDrops.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { createSwarmEventDirector } from '../src/systems/swarmEvents.js';

// Victory reaches the next run through run:started with no run:ended. Anything a run:ended
// reset covered must reset there too, or run N leaks into run N+1.

test('run:started resets swarm drop state the same as run:ended', () => {
  const bus = createBus();
  const sys = Object.create(swarmDrops);
  sys.init({ state: createGameState(4242), bus, helpers: {}, registry: null });
  sys._dropIndex = 7;
  sys._spent.add('drop_shield_pack');
  bus.emit('run:started', {});
  assert.equal(sys._dropIndex, 0, 'the seeded drop index resets');
  assert.equal(sys._spent.size, 0, 'spent unique-drop flags clear');
  bus.emit('run:ended', {});
  assert.equal(sys._dropIndex, 0);
});

test('survivalWave.destroy detaches a live capital fight record like the character fight', () => {
  const bus = createBus();
  const sys = Object.create(survivalWave);
  sys.bus = bus; sys._unsubs = []; sys._capitalFightId = 'swarm:w5';
  let detach = null;
  bus.on('capitalBoss:detach', (p) => { detach = p; });
  sys.destroy();
  assert.equal(detach?.fightId, 'swarm:w5', 'destroy releases the champion fight record');
  assert.equal(sys._capitalFightId, null);
});

test('run:started tears down armed swarm event timers like run:ended', () => {
  const bus = createBus();
  const d = createSwarmEventDirector({ state: createGameState(4242), bus, helpers: {}, registry: null });
  d.init();
  let reason = null;
  const orig = d.teardown.bind(d);
  d.teardown = (r) => { reason = r; return orig(r); };
  bus.emit('run:started', {});
  assert.equal(reason, 'run_started');
});
