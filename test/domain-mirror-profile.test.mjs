import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { resolveSimLaneFlags, createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { powerPreviewPlan } from '../src/data/powerPreview.js';
import { readRailModel } from '../src/ui/powerRail.js';
import {
  createDomainMirroringProfile,
  configureDomainMirroring,
  createDomainDiffer, DOMAIN_COLD_TICKS,
} from '../scripts/lib/simReadModel.mjs';

test('named domain profiles preserve station shape and commodity history', () => {
  configureDomainMirroring({});
  const station = createDomainMirroringProfile();
  assert.deepEqual(station, createDomainMirroringProfile('station'));
  assert.deepEqual(station.leafViews, [{
    segs: ['economy', 'markets'], leafSegs: 3,
    project: 'marketLive', minCadenceTicks: DOMAIN_COLD_TICKS,
  }]);
  assert.equal(station.staggerCold, true);

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

test('worker facade mirrors the selected Frag, preview readiness and loaded count without repeat transfers', async (t) => {
  const state = { entities: new Map(), entityList: [],
    settings: {}, meta: { seed: 1 }, tick: 0, simTime: 0, accumulator: 0, timeScale: 0, ui: { screenStack: [] } };
  const bodies = { selectedId: 'bomb_frag', bombChosen: true, cooldownUntil: 0, cooldowns: { bomb_frag: 0 },
    rack: { sockets: 2, cells: [{ id: 'bomb_frag', count: 3 }] }, stock: { bomb_frag: 120 } };
  const worker = { mode: 'flight', playerId: 1, input: { actions: { bomb: { held: true } } }, bombs: bodies,
    player: { cargo: { items: { cmdty_impulse_charge: 1 } } },
    ui: { trackedMissionId: 'detail' }, world: { currentSectorId: 'sector_ceres_belt' },
    missions: { active: [{ id: 'detail', status: 'active', storyTag: 'campaign47a:b1:infested',
      destSectorId: 'sector_ceres_belt', objectiveProgress: 1, objectiveTarget: 4,
      params: { furnaceWorksiteVersion: 1, furnaceFeedsNeeded: 3 } }] } };
  const posts = [];
  let receive;
  const lane = createSimLaneRuntime({ state, registry: {}, bus: createBus(),
    flags: resolveSimLaneFlags('?simLane=worker'), clockMode: 'worker-local',
    channelFactory: () => ({ post: message => posts.push(message), onMessage: handler => { receive = handler; }, terminate() {} }) });
  t.after(() => lane.close());
  const differ = createDomainDiffer();
  const updates = tick => differ.diff(worker, tick).updates;
  receive({ kind: 'ready', seq: posts[0].seq, stateTick: 0, simTime: 0, domainUpdates: updates(0), spawnInfos: [
    { entityId: 1, type: 'ship', team: 0, isPlayer: true, radius: 14, data: {} },
    { entityId: 2, type: 'fauna', radius: 12, x: 65,
      data: { ecology: { speciesId: 'casket_worm', siteId: 'closed_refinery' } } },
  ] });
  await lane.readyPromise;

  const snapshot = state.bombs;
  assert.equal(snapshot?.selectedId, 'bomb_frag');
  assert.equal(snapshot.stock, undefined, 'hangar inventory stays with its owner');
  assert.equal(snapshot.rack.sockets, undefined);
  assert.match(readRailModel(state, 0)[4].description, /Frag cassette ×3 loaded/);
  const plan = powerPreviewPlan(state);
  assert.ok(plan.areas.some(area => area.role === 'casket-risk'));
  assert.ok(!updates(1).some(update => update.segs[0].startsWith('bombs.')), 'unchanged stock ships no updates');

  bodies.rack.cells[0].count = 2;
  bodies.cooldownUntil = 1.25;
  receive({ kind: 'clockTick', stateTick: 2, simTime: 2 / 60, domainUpdates: updates(2) });
  assert.equal(state.bombs, snapshot);
  assert.equal(state.bombs.rack.cells[0].count, 2);
  assert.equal(readRailModel(state, state.simTime)[4].state, 'cooling');
  assert.equal(powerPreviewPlan(state).blocked?.startsWith('Recharging'), true);
});
