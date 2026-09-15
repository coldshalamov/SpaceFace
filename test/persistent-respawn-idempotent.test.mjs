// Regression — save→load must not grow a duplicate generation of flags.persistent actors.
// Sector regen deliberately keeps persistent actors alive; the save owner then re-spawned the
// saved copies on top, doubling the persistent set every roundtrip. The serialized envelope grew
// ~+40KB per quick-load in the release soak until the localStorage quota refused writes.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';

const SYSTEMS = [physics, world];

function scene(seed = 7) {
  const bus = createBus();
  const sim = createSimulation({ seed, bus, systems: SYSTEMS });
  const { state } = sim;
  state.mode = 'flight';
  const saveOwner = { state, bus, helpers: sim.registry.ctx.helpers, registry: sim.registry };
  return { sim, state, saveOwner };
}

const livePersistent = (state) => state.entityList.filter(
  (e) => e && e.alive !== false && e.flags && e.flags.persistent === true,
);

test('persistent actors respawn exactly once per load — no duplicate generation', () => {
  const { sim, state, saveOwner } = scene();
  sim.spawn({ type: 'ship', team: 2, pos: { x: 10, z: 20 }, flags: { persistent: true }, data: { stableId: 'probe-a' } });
  sim.spawn({ type: 'ship', team: 2, pos: { x: -5, z: 8 }, flags: { persistent: true }, data: { stableId: 'probe-b' } });
  const snapshot = save._serializeEntities.call(saveOwner);
  assert.equal(snapshot.persistent.length, 2, 'both persistent actors serialize');

  // The real load path re-materializes the sector first — persistent actors survive that despawn —
  // then the save owner restores the envelope. The surviving generation must be cleared, not doubled.
  save._spawnPersistentEntities.call(saveOwner, snapshot.persistent, new Map());
  assert.equal(livePersistent(state).length, 2, 'first restore leaves exactly the saved actors');

  save._spawnPersistentEntities.call(saveOwner, snapshot.persistent, new Map());
  assert.equal(livePersistent(state).length, 2, 'second restore is idempotent — no duplicate generation');

  const snapshot2 = save._serializeEntities.call(saveOwner);
  assert.equal(snapshot2.persistent.length, 2, 'the serialized envelope stays flat across roundtrips');
});
