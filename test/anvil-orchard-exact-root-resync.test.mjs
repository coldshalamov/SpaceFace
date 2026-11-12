import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { createOrchardMotorState } from '../src/core/anvilOrchardNative.js';
import { ORCHARD_GEOMETRY as G, orchardFrameBodySpec } from '../src/data/anvilOrchardBody.js';
import { ANVIL_ORCHARD, createOrchardRecord } from '../src/data/anvilOrchard.js';

async function setup() {
  const sim = createSimulation({ systems: [asteroidSites, physics, environmentalMachinery] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = ANVIL_ORCHARD.sectorId;
  const worker = sim.spawn({ type: 'ship', isPlayer: true, pos: { x: 14000, z: 9000 },
    radius: 6, hull: 100, data: { defId: 'ship_kestrel', fittings: [], anvilSlingWitness: true,
      itinerary: { kind: 'anvil_work', role: 'collector', phase: 'collect' } } });
  sim.state.playerId = worker.id;
  // This authored angle's descriptor quaternion changes if Rapier normalizes it again.
  const frame = sim.spawn({ type: 'wreck', pos: { x: 13200, z: 8300 }, rot: Math.PI / 9,
    radius: G.radius, hull: 300, flags: { persistent: true }, physicsBody: orchardFrameBodySpec(),
    data: { orchardId: ANVIL_ORCHARD.id, orchardKind: 'frame', worldRecordId: G.worldRecordId,
      placeId: 'place_anvil_storm_orchard', authoredAssetId: G.assetId,
      authoredPayloadAssetId: G.assetId, masslineTetherable: false,
      orchardCollars: createOrchardMotorState() } });
  const facade = sim.registry.get('physics');
  assert.equal(await facade.prepareBackend(sim.state), true);
  sim.state.sites.anvilOrchard = createOrchardRecord(0);
  return { sim, worker, frame, facade, owner: facade._sg02,
    machine: sim.registry.get('environmentalMachinery') };
}

test('exact authored root no-op preserves quaternion and clears noInterp', async () => {
  const h = await setup();
  try {
    const rec = h.owner.records.get(h.frame.id), before = rec.body.rotation();
    h.frame.flags.noInterp = true;
    const changed = h.owner._maybeResyncBodyPose(rec, h.frame);
    assert.deepEqual(rec.body.rotation(), before);
    assert.equal(changed, false);
    assert.equal(h.frame.flags.noInterp, false);
    assert.ok(h.facade.readOrchardFramePose(h.frame));
  } finally { h.sim.dispose(); }
});

test('noncanonical Orchard root does not take the no-op guard', async () => {
  const h = await setup();
  try {
    const rec = h.owner.records.get(h.frame.id), position = rec.body.translation();
    rec.body.setTranslation({ ...position, x: position.x + 1 }, true);
    h.frame.flags.noInterp = true;
    assert.equal(h.owner._maybeResyncBodyPose(rec, h.frame), true);
  } finally { h.sim.dispose(); }
});

test('value-equal replacement source cannot regain authority through root resync', async () => {
  const h = await setup();
  try {
    assert.equal(h.machine.acceptOrchardNewPod(h.worker,
      { frame: h.frame, socket: 1, qty: 4, commodityId: ANVIL_ORCHARD.commodityId }), 4);
    const rec = h.owner.records.get(h.frame.id);
    h.frame.data = { ...h.frame.data };
    h.frame.flags.noInterp = true;
    h.owner._maybeResyncBodyPose(rec, h.frame);
    assert.equal(h.facade.readOrchardFramePose(h.frame), null);
    assert.equal(h.machine.requestOrchardRelease(h.frame, 1), false);
  } finally { h.sim.dispose(); }
});

function fillPod(h) {
  assert.equal(h.machine.acceptOrchardNewPod(h.worker,
    { frame: h.frame, socket: 1, qty: 4, commodityId: ANVIL_ORCHARD.commodityId }), 4);
  const pod = h.sim.state.entityList.find(e => e.alive !== false && e.data?.orchardKind === 'pod');
  assert.ok(pod);
  const rec = h.owner.records.get(pod.id);
  assert.ok(rec && !rec.spec.dynamic && rec.body.isFixed());
  return { pod, rec };
}

test('exact fixed pod no-op preserves quaternion and release authority', async () => {
  const h = await setup();
  try {
    const { pod, rec } = fillPod(h), before = rec.body.rotation();
    pod.flags.noInterp = true;
    const changed = h.owner._maybeResyncBodyPose(rec, pod);
    assert.deepEqual(rec.body.rotation(), before);
    assert.equal(changed, false);
    assert.equal(pod.flags.noInterp, false);
    assert.equal(h.machine.requestOrchardRelease(h.frame, 1), true);
  } finally { h.sim.dispose(); }
});

test('noncanonical fixed pod does not take the no-op guard', async () => {
  const h = await setup();
  try {
    const { pod, rec } = fillPod(h), position = rec.body.translation();
    rec.body.setTranslation({ ...position, x: position.x + 1 }, true);
    pod.flags.noInterp = true;
    assert.equal(h.owner._maybeResyncBodyPose(rec, pod), true);
  } finally { h.sim.dispose(); }
});

test('fixed pod resync cannot revive a replaced frame source', async () => {
  const h = await setup();
  try {
    const { pod, rec } = fillPod(h);
    h.frame.data = { ...h.frame.data };
    pod.flags.noInterp = true;
    assert.equal(h.owner._maybeResyncBodyPose(rec, pod), true);
    assert.equal(h.machine.requestOrchardRelease(h.frame, 1), false);
    assert.equal(h.facade.readOrchardPodReady(pod), null);
  } finally { h.sim.dispose(); }
});
