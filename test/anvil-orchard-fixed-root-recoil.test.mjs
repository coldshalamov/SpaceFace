import test from 'node:test';
import assert from 'node:assert/strict';
import { ready, tail } from './fixtures/anvil-orchard-custody-ready.mjs';
import { fieldBodyProfile } from '../src/systems/fields.js';
import { normalizeField, sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { isAnchoredPhysicalBody } from '../src/core/physicalResponse.js';

test('fixed Orchard root refuses landmark recoil while its released original pod keeps normal field coupling', async () => {
  const h = await ready();
  try {
    h.frame.data.isLandmark = true; // Same authored landmark classification as planetRuntime.
    assert.equal(h.frame.physicsBody.anchorRecoil, false);
    assert.equal(isAnchoredPhysicalBody(h.frame), true, 'fixed recoil policy preserves landmark material semantics');
    const beforeFrame = { ...h.frame.pos };
    assert.equal(queuePhysicsImpulse(h.frame, { x: 1e6, z: 0 }), false);
    assert.equal(h.frame.physicsBody.anchorRecoil, false);
    const podProfile = fieldBodyProfile(h.pod, h.sim.state);
    assert.equal(podProfile.dynamic, true);
    assert.ok(podProfile.fieldResponseMult > 0);
    const field = normalizeField({ id: 'orchard-original-pod-field-proof', kind: 'cone',
      center: { x: h.pod.pos.x - 100, z: h.pod.pos.z }, dir: { x: 1, z: 0 },
      radius: 360, strength: 180, falloff: 1.1, halfAngleRad: .42, edgeSoftRad: .12 });
    assert.ok(field);
    const acceleration = sampleFieldAcceleration(h.pod.pos, h.pod.vel, [field], h.sim.state.simTime, podProfile, { ax: 0, az: 0 });
    assert.ok(acceleration.ax > 0);
    const before = h.owner.records.get(h.pod.id).body.linvel().x;
    assert.equal(queuePhysicsImpulse(h.pod, { x: acceleration.ax * h.pod.physicsBody.mass / 60, z: 0 }), true);
    tail(h, 31);
    assert.deepEqual({ ...h.frame.pos }, beforeFrame);
    assert.ok(h.owner.readOrchardFramePose(h.frame));
    assert.ok(h.owner.records.get(h.pod.id).body.linvel().x > before);
    assert.equal(h.pod.physicsBody.anchorRecoil, undefined);
  } finally { h.close(); }
});
