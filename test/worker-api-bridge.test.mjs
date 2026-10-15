import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { applyDomainPathUpdate, createDomainDiffer, DOMAIN_MIRROR_KEYS } from '../scripts/lib/simReadModel.mjs';
import { CRUCIBLE_ARENA_ID } from '../src/ui/crucibleLaunch.js';

test('worker career/site hydration preserves records and exposes the current read generation', async (t) => {
  for (const key of ['careers', 'sites.order', 'survivalResultsPublic']) assert.ok(DOMAIN_MIRROR_KEYS.includes(key));
  const state = { entities: new Map(), entityList: [], settings: {}, meta: { seed: 1 },
    tick: 0, simTime: 0, accumulator: 0, timeScale: 0, ui: { screenStack: [] }, sites: { localPresentation: true } };
  const helpers = {};
  const bus = createBus();
  const resultReads = [];
  bus.on('run:resultsReady', () => resultReads.push(structuredClone(state.survivalResultsPublic)));
  const posts = [];
  let receive;
  const lane = createSimLaneRuntime({ state, helpers, registry: {}, bus,
    flags: { lane: 'worker', sab: false, warnings: [] }, clockMode: 'worker-local',
    channelFactory: () => ({ post: (message) => posts.push(message), onMessage: (handler) => { receive = handler; }, terminate() {} }),
  });
  t.after(() => lane.close());
  receive({ kind: 'ready', seq: posts[0].seq, stateTick: 0, domainUpdates: [
    { segs: ['careers'], v: { origins: { status: 'offered' }, ladders: { hauler: { stepId: 'first_delivery' } } } },
    { segs: ['sites.order'], v: ['site_a'] },
  ] });
  await lane.readyPromise;
  const careers = state.careers;
  const origins = careers.origins;
  const order = state.sites.order;
  assert.equal(helpers.workerReadGeneration(), 0);
  lane.runner.setLifecycleGeneration(7);
  assert.equal(helpers.workerReadGeneration(), 7, 'the bridge read epoch advances before the next worker reply');
  receive({ kind: 'clockTick', stateTick: 1, simTime: 1 / 60, domainUpdates: [
    { segs: ['careers', 'origins', 'status'], v: 'active' },
    { segs: ['careers', 'ladders', 'hauler', 'stepId'], v: 'second_delivery' },
    { segs: ['sites.order'], v: ['site_a', 'site_b'] },
    { segs: ['survivalResultsPublic'], v: { result: { outcome: 'victory' }, revision: 2, generation: 7 } },
  ], events: [{ t: 'run:resultsReady', p: { outcome: 'victory' } }] });
  assert.equal(state.careers, careers);
  assert.equal(state.careers.origins, origins);
  assert.equal(state.careers.origins.status, 'active');
  assert.equal(state.careers.ladders.hauler.stepId, 'second_delivery');
  assert.equal(state.sites.order, order);
  assert.deepEqual(order, ['site_a', 'site_b']);
  assert.equal(state.sites.localPresentation, true);
  assert.deepEqual(resultReads, [{ result: { outcome: 'victory' }, revision: 2, generation: 7 }],
    'the fresh authority receipt must reach synchronous readers before its results event');
  lane.close();
  assert.equal(helpers.workerReadGeneration(), -1, 'closed bridges cannot authorize stale read receipts');
});

test('large replacement result receipts bypass cold signing on their own reply', () => {
  const differ = createDomainDiffer();
  const domains = new Map();
  const state = { survivalResultsPublic: { result: { title: 'first', history: 'x'.repeat(300_000) }, revision: 1, generation: 2 } };
  const apply = (tick) => {
    for (const update of differ.diff(state, tick).updates) applyDomainPathUpdate(domains, update, new WeakSet());
  };
  apply(0);
  state.survivalResultsPublic = { result: { title: 'fresh', history: 'y'.repeat(300_000) }, revision: 2, generation: 2 };
  apply(1);
  assert.equal(domains.get('survivalResultsPublic').result.title, 'fresh');
  assert.equal(domains.get('survivalResultsPublic').result.history[0], 'y');
  assert.equal(domains.get('survivalResultsPublic').revision, 2);
});

test('native result receipts and asteroid commits cross the bridge without exposing private methods', async () => {
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 7, bridgeAll: true,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const state = lane.host.state;
    const native = lane.host.registry.get('survivalResults');
    const domains = new Map();
    const apply = (reply) => { for (const update of reply.domainUpdates) applyDomainPathUpdate(domains, update, new WeakSet()); };
    apply(init);
    assert.equal(domains.get('survivalResultsPublic').result, null);
    let tick = 0;
    const send = async (descriptors = [], generation = 0) => {
      const ring = createSimCommandRing();
      for (const descriptor of descriptors) pushLaneCommand(ring, descriptor);
      const reply = await lane.tick({ tick: ++tick, steps: 0, generation,
        ackEnd: init.initRebuild?.end ?? 0, commands: structuredClone(ring.drain()) });
      apply(reply);
      return reply;
    };
    lane.host.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: 7, arenaId: CRUCIBLE_ARENA_ID });
    lane.host.bus.emit('run:ended', { outcome: 'defeat' });
    const ended = await send();
    assert.ok(ended.events.some((event) => event.t === 'run:resultsReady'));
    assert.deepEqual(domains.get('survivalResultsPublic').result, native.lastResult());
    assert.equal(domains.get('survivalResultsPublic').revision, native.resultRevision());
    assert.equal(domains.get('survivalResultsPublic').result.outcome, 'defeat');
    const published = state.survivalResultsPublic;
    await send();
    assert.equal(state.survivalResultsPublic, published, 'unchanged frames do not clone the native receipt again');
    await send([], 4);
    assert.equal(domains.get('survivalResultsPublic').generation, 4);
    lane.host.bus.emit('run:started', {});
    await send([], 5);
    assert.equal(domains.get('survivalResultsPublic').result, null, 'a new run clears the previous native receipt');
    assert.equal(domains.get('survivalResultsPublic').generation, 5);

    const site = { id: 'bridge_site', exportOff: {}, fleet: { podTarget: 1 } };
    state.sites.byId[site.id] = site;
    state.sites.order.push(site.id);
    const call = (id, method, args) => ({ kind: 'rpc', id, op: 'asteroidSitesCall', args: { method, args } });
    const reply = await send([
      call('export', 'setExportFlag', [site.id, 'cmdty_silicate', false]),
      call('missing', 'setExportFlag', ['missing_site', 'cmdty_silicate', false]),
      call('private', '_consumeMaterials', [site, {}]),
      call('prototype', 'constructor', []),
      call('bad-args', 'setExportFlag', 'not-an-array'),
    ], 5);
    const result = (id) => reply.rpcAcks.find((ack) => ack.id === id).result;
    assert.equal(site.exportOff.cmdty_silicate, true, 'the native site owner committed the requested write');
    assert.deepEqual(result('export'), { ok: true, result: { ok: true, reason: null } });
    assert.deepEqual(result('missing'), { ok: true, result: { ok: false, reason: 'no-site' } });
    assert.deepEqual(result('private'), { ok: false, reason: 'unknown-asteroid-sites-method' });
    assert.deepEqual(result('prototype'), { ok: false, reason: 'unknown-asteroid-sites-method' });
    assert.deepEqual(result('bad-args'), { ok: false, reason: 'bad-asteroid-sites-args' });
  } finally {
    lane.shutdown();
  }
});
