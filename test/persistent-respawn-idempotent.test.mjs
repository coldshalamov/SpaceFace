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

// D136 — durable-record carriers got a duplicate generation from a different seam: sector
// re-entry rematerialized the world record (unflagged shell) before the persistent envelope
// respawned, so two live hulls shared one data.worldRecordId and both ended up persistent
// (manifest/job anchors then pinned the mark). The envelope respawn must yield to a live
// carrier, and a stale envelope that already carries two copies must collapse to one.
test('a saved record carrier yields to a live carrier and envelope duplicates collapse', () => {
  const { sim, state, saveOwner } = scene();
  // World records deliberately carry no flags, so the shell a record rematerializes before
  // the envelope arrives is not persistent — it survives the stale-clear that precedes the
  // respawn and is exactly the twin D136 kept alive.
  const shell = sim.spawn({
    type: 'ship', team: 2, pos: { x: 10, z: 20 },
    data: { worldRecordId: 'wr-d136-a', stableId: 'carrier-a' },
  });
  const remap = new Map();
  const envelope = [
    { id: 9001, type: 'ship', team: 2, pos: { x: 1, z: 1 }, flags: { persistent: true }, data: { worldRecordId: 'wr-d136-a', stableId: 'carrier-a' } },
    { id: 9002, type: 'ship', team: 2, pos: { x: 2, z: 2 }, flags: { persistent: true }, data: { worldRecordId: 'wr-d136-b', stableId: 'carrier-b' } },
    { id: 9003, type: 'ship', team: 2, pos: { x: 3, z: 3 }, flags: { persistent: true }, data: { worldRecordId: 'wr-d136-b', stableId: 'carrier-b' } },
  ];
  save._spawnPersistentEntities.call(saveOwner, envelope, remap);

  const carriersA = state.entityList.filter(
    (e) => e && e.alive !== false && e.data && e.data.worldRecordId === 'wr-d136-a');
  assert.equal(carriersA.length, 1, 'one live hull per worldRecordId');
  assert.equal(carriersA[0].id, shell.id, 'the live carrier is kept, not a respawned twin');
  assert.equal(remap.get('9001'), shell.id, 'saved id remaps onto the live carrier');

  const carriersB = state.entityList.filter(
    (e) => e && e.alive !== false && e.data && e.data.worldRecordId === 'wr-d136-b');
  assert.equal(carriersB.length, 1, 'a leaked envelope collapses to one carrier per record');
  assert.equal(remap.get('9003'), carriersB[0].id, 'the stale duplicate remaps onto its carrier');
  assert.equal(carriersB[0].flags.persistent, true, 'the surviving carrier keeps the saved mark');
});
