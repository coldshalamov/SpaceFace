import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { save } from '../src/save/saveSystem.js';

async function fixture() {
  const sim = createSimulation({ seed: 47, systems: [physics, save] });
  sim.state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', isPlayer: true, alive: true, radius: 3, mass: 24,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0, angVel: 0,
    hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' }, flags: { persistent: true },
    physicsBody: { schemaVersion: 1, radius: 3, mass: 24, inertiaY: 48,
      dynamic: true, shape: 'ball', ccd: false, revision: 0 },
  });
  sim.state.playerId = player.id;
  const system = sim.registry.get('physics'), saver = sim.registry.get('save');
  assert.equal(await system.prepareBackend(sim.state), true);
  const envelope = saver.serialize('newer');
  return { sim, system, saver, envelope };
}

for (const fails of [true, false]) {
  test(`a ${fails ? 'failed' : 'successful'} older save session preserves the newer native restore`, async () => {
    const { sim, system, saver, envelope } = await fixture();
    const registry = saver.registry;
    let calls = 0, newerWorld = null, queued = 0;
    // The real save owner calls economy before physics deserialization. A queued newer
    // load must win even when the older session fails before its physics barrier starts.
    saver.registry = { get(name) {
      if (name !== 'economy') return registry.get(name);
      return {
        serialize() { return {}; },
        deserialize() {
          if (++calls !== 1) return;
          assert.equal(saver.deferRunTransition(() => {
            queued++;
            assert.equal(saver.loadEnvelope(envelope, 'newer'), true);
            assert.deepEqual(sim.state.physicsRuntime.nativeRestore,
              { mode: 'native', exact: true, reason: null });
            assert.equal(system._nativeRestorePending, false);
            newerWorld = system._sg02.world;
            return true;
          }), true);
          if (fails) throw new Error('injected older restore failure');
        },
      };
    } };
    try {
      assert.equal(saver.loadEnvelope(envelope, 'older'), true);
      assert.equal(queued, 1);
      assert.equal(sim.state.save.currentSlot, 'newer');
      assert.equal(system._nativeRestorePending, false,
        'the older epilogue must not schedule scalar reconstruction over the new world');
      assert.equal(system._nativeRestoreDeferred, false);
      assert.equal(system._finishNativeRestore(), false);
      assert.equal(system._sg02.world, newerWorld);
      assert.deepEqual(sim.state.physicsRuntime.nativeRestore,
        { mode: 'native', exact: true, reason: null });
      assert.equal(system._sg02.records.get(sim.state.playerId).body.isValid(), true);
    } finally { sim.dispose(); }
  });
}

test('an unqueued failed restore still cancels its staged native snapshot and releases the barrier', async () => {
  const { sim, system, saver, envelope } = await fixture();
  const registry = saver.registry;
  let reachedBarrier = false;
  saver.registry = { get(name) {
    if (name !== 'fields') return registry.get(name);
    return { deserialize() {
      reachedBarrier = true;
      assert.equal(system._nativeRestoreDeferred, true);
      assert.ok(system._pendingSg02Snapshot);
      throw new Error('injected unqueued restore failure');
    } };
  } };
  try {
    assert.throws(() => saver._restore(envelope.data, 'failed'), /injected unqueued restore failure/);
    assert.equal(reachedBarrier, true);
    assert.equal(saver._restoring, false);
    assert.equal(system._nativeRestoreDeferred, false);
    assert.equal(system._pendingSg02Snapshot, null);
    assert.equal(system._nativeRestorePending, true);
    assert.equal(system._finishNativeRestore(), false);
    assert.equal(system._nativeRestorePending, false);
    assert.deepEqual(sim.state.physicsRuntime.nativeRestore,
      { mode: 'scalar', exact: false, reason: 'legacy_missing' });
    assert.equal(system._sg02.records.get(sim.state.playerId).body.isValid(), true);
  } finally { sim.dispose(); }
});
