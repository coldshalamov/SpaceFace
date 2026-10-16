import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { save, preflightSaveImport } from '../src/save/saveSystem.js';
import { encodeSavePayloadFinal, restorePrepareSaveJsonAsync } from '../src/save/saveWorker.js';
import { expandNativeAttestationTables } from '../src/save/nativeAttestationTables.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';

// Focused production implementations; no replacement serializers, restore stubs or private fixtures.
const body = (x, player = false) => ({ type: 'ship', alive: true, isPlayer: player,
  radius: 3, mass: 24, pos: { x, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0, angVel: 0,
  hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' }, flags: player ? {} : { persistent: true },
  physicsBody: { schemaVersion: 1, radius: 3, mass: 24, inertiaY: 48, dynamic: true,
    shape: player ? 'capsule' : 'ball', ccd: false, revision: 0 } });

async function encodeAndPrepare(envelope) {
  const { data, ...descriptor } = envelope;
  const encoded = await encodeSavePayloadFinal({ descriptor, data });
  assert.equal(encoded.ok, true, JSON.stringify(encoded));
  const prepared = await restorePrepareSaveJsonAsync(encoded.json, CURRENT_VERSION);
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  assert.equal(preflightSaveImport(prepared.env).ok, true);
  return prepared.env;
}

test('real SaveSystem compact capture encode and normal load restore the native world and cargo',
  { skip: process.env.COMPACT_PURE_ONLY === '1' }, async () => {
  const sim = createSimulation({ seed: 47, systems: [physics, save] });
  sim.state.mode = 'flight';
  const player = sim.spawn(body(0, true)); sim.state.playerId = player.id;
  sim.spawn(body(50));
  sim.state.player.cargo.items = { cmdty_scrap_metal: 3 };
  const system = sim.registry.get('physics'), saver = sim.registry.get('save');
  let completionCalls = 0;
  const complete = system.completeRestoreSteps;
  system.completeRestoreSteps = function* (...args) { completionCalls++; return yield* complete.apply(this, args); };
  try {
    assert.equal(await system.prepareBackend(sim.state), true);
    assert.equal(system._sg02.records.size, 2);
    const captured = saver.serialize('compact-roundtrip');
    assert.equal(captured.version, 16);
    assert.equal(captured.data.physics.schema, 4);
    assert.equal(Object.keys(captured.data.physics.bodies).length, 2);
    assert.ok(captured.data.physics.snapshot.length > 0);
    const exactExpanded = expandNativeAttestationTables(captured.data.physics);
    assert.equal(exactExpanded.schema, 3);
    assert.equal(exactExpanded.snapshot, captured.data.physics.snapshot);
    const cargo = structuredClone(captured.data.cargo);
    const prepared = await encodeAndPrepare(captured);
    assert.deepEqual(prepared.data.physics, captured.data.physics, 'worker wire roundtrip loses no native observation');
    assert.deepEqual(prepared.data.cargo, cargo);
    sim.state.player.cargo.items = { cmdty_scrap_metal: 99 };
    assert.equal(saver.loadEnvelope(prepared, 'compact-roundtrip'), true);
    assert.equal(completionCalls, 1, 'normal SaveSystem epilogue called real physics completeRestoreSteps');
    assert.deepEqual(sim.state.physicsRuntime.nativeRestore, { mode: 'native', exact: true, reason: null });
    assert.equal(system._nativeRestorePending, false);
    assert.equal(system._nativeRestoreDeferred, false);
    assert.equal(system._pendingSg02Snapshot, null);
    assert.equal(system._sg02.records.size, 2);
    assert.equal(sim.state.entityList.filter(e => e.alive && e.type === 'ship').length, 2);
    assert.deepEqual(sim.state.player.cargo.items, cargo.items);
    assert.equal(system._sg02.records.get(sim.state.playerId).colliders.length > 1, true);
    for (const record of system._sg02.records.values()) {
      assert.equal(record.body.isValid(), true); assert.ok(Math.abs(record.body.mass() - 24) < 1e-5);
      assert.equal(record.body.isSleeping(), false);
    }
    const recaptured = saver.serialize('compact-roundtrip-after');
    assert.equal(recaptured.data.physics.schema, 4, 'snapshot remains saveable after normal load');
    assert.equal(Object.keys(recaptured.data.physics.bodies).length, 2);
    assert.deepEqual(recaptured.data.cargo, cargo);

    // Scalar compatibility is deliberate: only this explicit missing-snapshot branch may reconstruct.
    const scalar = structuredClone(recaptured); scalar.data.physics = null;
    const preparedScalar = await encodeAndPrepare(scalar);
    assert.equal(saver.loadEnvelope(preparedScalar, 'compact-roundtrip-scalar'), true);
    assert.equal(completionCalls, 2);
    assert.deepEqual(sim.state.physicsRuntime.nativeRestore, { mode: 'scalar', exact: false, reason: 'legacy_missing' });
    assert.equal(system._sg02.records.size, 2);
    assert.deepEqual(sim.state.player.cargo.items, cargo.items);
    console.log(JSON.stringify({ compactSchema: 4, bodies: 2, nativeExact: true, scalarReason: 'legacy_missing', completionCalls, cargoItems: cargo.items, solverTicks: 0 }));
  } finally { system._sg02?.dispose(); sim.dispose(); }
});
