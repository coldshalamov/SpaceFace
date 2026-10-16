import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './fixtures/anvil-orchard-custody-source.mjs';
import { tail } from './fixtures/anvil-orchard-custody-ready.mjs';
import { ensureActivityClassified, physicsPartitionEpoch } from '../src/world/activityRuntime.js';

for (const flying of [false, true]) test(`fixed-to-dynamic handoff wakes warmed ${flying ? 'flying' : 'parked'} activity partitions`, async () => {
  const h = await setup();
  try {
    assert.equal(h.accept(), 4);
    assert.equal(h.owner.requestOrchardFiniteRelease(h.frame, 1, h.sim.state), true);
    for (let tick = 1; tick <= 30; tick++) tail(h, tick);
    const state = h.sim.state;
    const pod = state.entityList.find(e => e.alive !== false && e.data?.orchardKind === 'pod');
    if (flying) h.worker.vel.x = 1;
    const modes = [];
    for (let i = 0; i < 4; i++) {
      state.tick++;
      modes.push(ensureActivityClassified(state).classifyMode);
    }
    console.log({ flying, modes });
    assert.ok(modes.includes(flying ? 'flying-frame-retain' : 'frame-retain'));
    if (!flying) assert.ok(modes.includes('early-quiet-latch'));
    assert.equal(pod._physicsPartition, 1);
    const epoch = physicsPartitionEpoch();
    const stage = h.owner.prepareOrchardPodHandoff(h.frame, pod, 1, state);
    assert.ok(stage);
    assert.equal(stage.commit(), true);
    assert.equal(pod._physicsPartition, undefined);
    const record = h.owner.records.get(pod.id);
    state.tick++;
    const activity = ensureActivityClassified(state);
    assert.equal(pod._physicsPartition, 2, 'a whole-frame retain must not reuse the invalidated static partition');
    assert.ok(physicsPartitionEpoch() > epoch);
    assert.equal(activity.physicsStatics.includes(pod), false);
    assert.equal(activity.physicsDynamics.includes(pod), true);
    h.facade._syncSg02DynamicAuthorityEntities(state);
    assert.equal(h.owner.records.get(pod.id), record);
    assert.ok(h.owner.readOrchardPodReady(pod, state));
  } finally { h.close(); }
});

async function opened() {
  const h = await setup();
  assert.equal(h.accept(), 4);
  assert.equal(h.owner.requestOrchardFiniteRelease(h.frame, 1, h.sim.state), true);
  for (let tick = 1; tick <= 30; tick++) tail(h, tick);
  h.pod = h.sim.state.entityList.find(e => e.alive !== false && e.data?.orchardKind === 'pod');
  ensureActivityClassified(h.sim.state);
  assert.equal(h.pod._physicsPartition, 1);
  return h;
}

for (const blocked of ['readonly', 'accessor']) test(`handoff refuses ${blocked} partition storage before native retirement`, async () => {
  const h = await opened();
  let reads = 0;
  try {
    const old = h.owner.records.get(h.pod.id), row = h.sim.state.sites.anvilOrchard;
    if (blocked === 'readonly') Object.defineProperty(h.pod, '_physicsPartition', { value: 1, writable: false });
    else Object.defineProperty(h.pod, '_physicsPartition', { get() { reads++; return 1; }, configurable: true });
    assert.equal(h.owner.prepareOrchardPodHandoff(h.frame, h.pod, 1, h.sim.state), null);
    assert.equal(reads, 0);
    assert.equal(h.owner.records.get(h.pod.id), old);
    assert.equal(old.body.isFixed(), true);
    assert.equal(h.sim.state.sites.anvilOrchard, row);
    assert.equal(row.sockets[1].handoff, 'fixed');
  } finally { h.close(); }
});

test('partition change after preparation refuses commit without overwriting the new value', async () => {
  const h = await opened();
  try {
    const old = h.owner.records.get(h.pod.id);
    const stage = h.owner.prepareOrchardPodHandoff(h.frame, h.pod, 1, h.sim.state);
    assert.ok(stage);
    h.pod._physicsPartition = 0;
    assert.equal(stage.commit(), false);
    assert.equal(h.pod._physicsPartition, 0);
    assert.equal(h.owner.records.get(h.pod.id), old);
    assert.equal(old.body.isFixed(), true);
    assert.equal(h.sim.state.sites.anvilOrchard.sockets[1].handoff, 'fixed');
    assert.equal(stage.abort(), true);
  } finally { h.close(); }
});
