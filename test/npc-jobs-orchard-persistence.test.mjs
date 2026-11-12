import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { ORCHARD_GEOMETRY as G, orchardFrameBodySpec, orchardPodBodySpec } from '../src/data/anvilOrchardBody.js';
import { isOrchardFrame, isOrchardPod } from '../src/data/anvilOrchardIdentity.js';

function source(sim) {
  return sim.spawn({ type: 'wreck', radius: G.radius, hull: 300, flags: { persistent: true },
    physicsBody: orchardFrameBodySpec(), data: {
      orchardId: 'anvil_storm_orchard', orchardKind: 'frame', worldRecordId: G.worldRecordId,
      placeId: 'place_anvil_storm_orchard', authoredAssetId: G.assetId,
      authoredPayloadAssetId: G.assetId, masslineTetherable: false,
    } });
}
function pod(sim, dynamic) {
  return sim.spawn({ type: 'payload', radius: G.pod.radius, hull: 100, flags: { persistent: true },
    physicsBody: orchardPodBodySpec({ dynamic }), data: {
      orchardId: 'anvil_storm_orchard', orchardKind: 'pod', worldRecordId: 'anvil_storm_orchard:0:1',
      identityKey: 'anvil_storm_orchard:0:1', authoredAssetId: G.pod.assetId,
      authoredPayloadAssetId: G.pod.assetId, amount: 2, commodityId: 'cmdty_gas_hydrogen',
    } });
}

test('NPC idle cleanup retains the canonical Orchard source owner persistence', () => {
  const sim = createSimulation({ systems: [npcJobsRuntime] });
  try {
    const frame = source(sim), flags = frame.flags;
    assert.equal(isOrchardFrame(frame), true);
    sim.registry.get('npcJobsRuntime')._sweepJobOwnedPersistence();
    assert.equal(frame.flags.persistent, true, 'a finite source body is not an idle job stamp');
    assert.equal(frame.flags, flags, 'cleanup does not rewrite the independent owner flags');
  } finally { sim.dispose(); }
});

for (const dynamic of [false, true]) {
  test(`NPC idle cleanup retains the canonical ${dynamic ? 'drifting' : 'stowed'} Orchard pod`, () => {
    const sim = createSimulation({ systems: [npcJobsRuntime] });
    try {
      const payload = pod(sim, dynamic), flags = payload.flags;
      assert.equal(isOrchardPod(payload), true);
      sim.registry.get('npcJobsRuntime')._sweepJobOwnedPersistence();
      assert.equal(payload.flags.persistent, true, 'finite lot custody independently owns persistence');
      assert.equal(payload.flags, flags);
      assert.equal(payload.data.amount, 2);
    } finally { sim.dispose(); }
  });
}

test('Orchard labels without canonical bodies and ordinary idle bodies keep existing cleanup', () => {
  const sim = createSimulation({ systems: [npcJobsRuntime] });
  try {
    const frame = source(sim), payload = pod(sim, true);
    frame.physicsBody.mass = 1;
    payload.data.identityKey = 'unrelated';
    assert.equal(isOrchardFrame(frame), false);
    assert.equal(isOrchardPod(payload), false);
    const wrongRecord = source(sim), wrongAsset = pod(sim, false);
    wrongRecord.data.worldRecordId = 'unrelated-source';
    wrongAsset.data.authoredAssetId = 'unrelated-asset';
    const ordinary = ['ship', 'wreck', 'payload'].map((type, i) => sim.spawn({ type,
      flags: { persistent: true }, data: { durable: true, worldRecordId: `ordinary-${i}` } }));
    const landmark = sim.spawn({ type: 'wreck', flags: { persistent: true },
      data: { isLandmark: true, landmark: true, worldRecordId: 'ordinary-landmark' } });
    sim.registry.get('npcJobsRuntime')._sweepJobOwnedPersistence();
    for (const entity of [frame, payload, wrongRecord, wrongAsset, landmark, ...ordinary]) {
      assert.equal(entity.flags.persistent, undefined);
    }
  } finally { sim.dispose(); }
});

test('identity retention preserves malformed mutable state for its existing validation owner', () => {
  const sim = createSimulation({ systems: [npcJobsRuntime] });
  try {
    const frame = source(sim), payload = pod(sim, true);
    frame.data.orchardCollars = { progress: [31, 0, 0], cycles: [0, 0, 0] };
    payload.data.amount = -1;
    assert.equal(isOrchardFrame(frame), true, 'source identity is separate from motor-state validity');
    assert.equal(isOrchardPod(payload), true, 'source identity grants no amount/custody authority');
    const beforeFrame = structuredClone(frame.data), beforePod = structuredClone(payload.data);
    sim.registry.get('npcJobsRuntime')._sweepJobOwnedPersistence();
    assert.equal(frame.flags.persistent, true);
    assert.equal(payload.flags.persistent, true);
    assert.deepEqual(frame.data, beforeFrame);
    assert.deepEqual(payload.data, beforePod);
  } finally { sim.dispose(); }
});
