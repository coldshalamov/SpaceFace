import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { resolveSimLaneFlags, createSimLaneRuntime } from '../src/core/simLaneMain.js';
import {
  createDomainMirroringProfile,
  configureDomainMirroring,
  createDomainDiffer,
} from '../scripts/lib/simReadModel.mjs';

test('named domain profiles preserve station default and commodity history', () => {
  configureDomainMirroring({});
  assert.deepEqual(createDomainMirroringProfile(), {});
  assert.deepEqual(createDomainMirroringProfile('station'), {});

  const commodity = createDomainMirroringProfile('commodity');
  assert.deepEqual(commodity.expandPaths, [
    { segs: ['economy', 'markets'], depth: 3 },
    { segs: ['economy', 'cycles'], depth: 3 },
  ]);
  assert.deepEqual(commodity.leafViews[0].drop, [], 'commodity keeps inline price history');
  assert.equal(commodity.leafViews[0].deferFirstSign, true);
  assert.equal(commodity.leafViews[1].deferFirstSign, true);

  const noHistory = createDomainMirroringProfile('commodity-nohist');
  assert.deepEqual(noHistory.leafViews[0].drop, ['history']);
  assert.throws(() => createDomainMirroringProfile('unknown'), /unknown domain mirror profile/);
});

test('native diagnostic selector accepts only station or history-bearing commodity', () => {
  const commodity = resolveSimLaneFlags('?simLane=worker&domainProfile=commodity');
  assert.equal(commodity.domainProfile, 'commodity');
  assert.equal(commodity.domainProfileRequested, 'commodity');
  assert.deepEqual(commodity.warnings, []);

  const noHistory = resolveSimLaneFlags('?simLane=worker&domainProfile=commodity-nohist');
  assert.equal(noHistory.domainProfile, null);
  assert.equal(noHistory.domainProfileRequested, 'commodity-nohist');
  assert.match(noHistory.warnings[0], /station profile serves by default/);
});

test('selected profile reaches facade config and worker init before first tick', async (t) => {
  const flags = resolveSimLaneFlags('?simLane=worker&domainProfile=commodity');
  const state = {
    entities: new Map(), entityList: [], settings: {}, meta: { seed: 1 },
    tick: 0, simTime: 0, accumulator: 0, timeScale: 0, ui: { screenStack: [] },
  };
  const posts = [];
  let receive;
  const lane = createSimLaneRuntime({
    state, registry: {}, bus: createBus(), flags,
    channelFactory: () => ({
      post(message) { posts.push(message); },
      onMessage(handler) { receive = handler; },
      terminate() {},
    }),
  });
  t.after(() => lane.close());

  assert.deepEqual(posts[0].domainMirroring, createDomainMirroringProfile('commodity'));
  receive({ kind: 'ready', seq: posts[0].seq });
  await lane.readyPromise;
  assert.equal(lane.getDiagnostics().domainProfile, 'commodity');
  assert.equal(lane.getDiagnostics().domainProfileRequested, 'commodity');

  // The facade and worker use the same path shape; a fresh differ is enough to
  // prove the profile remains consumable after the boot configuration call.
  const differ = createDomainDiffer();
  const result = differ.diff({ economy: { markets: {}, cycles: {} } }, 0);
  assert.ok(Array.isArray(result.updates));
});

test('worker lane preserves domain root and nested identities across consecutive snapshots', async (t) => {
  const flags = resolveSimLaneFlags('?simLane=worker');
  const state = {
    entities: new Map(), entityList: [], settings: {}, meta: { seed: 1 },
    tick: 0, simTime: 0, accumulator: 0, timeScale: 0, ui: { screenStack: [] },
  };
  const posts = [];
  let receive;
  const lane = createSimLaneRuntime({
    state, registry: {}, bus: createBus(), flags,
    clockMode: 'worker-local',
    channelFactory: () => ({
      post(message) { posts.push(message); },
      onMessage(handler) { receive = handler; },
      terminate() {},
    }),
  });
  t.after(() => lane.close());

  const first = {
    active: [{ id: 'm1', status: 'active' }],
    progress: { activeId: 'm1', amount: 1 },
  };
  const second = {
    active: [{ id: 'm2', status: 'accepted' }],
    progress: { activeId: 'm2', amount: 2 },
  };
  const init = posts[0];
  receive({ kind: 'ready', seq: init.seq, stateTick: 0, simTime: 0,
    domainUpdates: [{ segs: ['missions'], v: first }] });
  await lane.readyPromise;

  const root = state.missions;
  const nested = root.progress;
  const active = root.active;
  receive({ kind: 'clockTick', stateTick: 1, simTime: 1 / 60,
    domainUpdates: [{ segs: ['missions'], v: second }] });

  assert.strictEqual(state.missions, root, 'a later root snapshot must mutate the existing facade root');
  assert.strictEqual(state.missions.progress, nested, 'a later nested snapshot must mutate the existing nested object');
  assert.strictEqual(state.missions.active, active, 'same-kind arrays must retain their facade identity');
  assert.equal(state.missions.active[0].id, 'm2');
  assert.equal(state.missions.progress.activeId, 'm2');
  assert.equal(state.missions.progress.amount, 2);
});
