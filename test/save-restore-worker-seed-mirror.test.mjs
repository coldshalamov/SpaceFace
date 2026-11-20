import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { installRealmFs } from '../scripts/lib/simRealm.mjs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { laneRpc } from '../src/core/simLaneCommands.js';
import { pauseRunSeedOf } from '../src/ui/screens/pause.js';

const SAVED_SEED = 4242, TITLE_SEED = 698239137;
const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
const { createGameServer } = createRequire(import.meta.url)('../scripts/lib/gameServer.cjs');

async function publicExportFixture() {
  installRealmFs({ readFileSync, resolve });
  const source = createSimHost();
  try {
    await source.init({ profile: 'production', seed: SAVED_SEED, scenarioContract });
    await source.tick({ steps: 0, commands: [{ t: 'rpc', seq: 1, p: {
      id: 'source-boot', op: 'newGameBoot', payload: { opts: { seed: SAVED_SEED } },
    } }] });
    const env = source.host.registry.get('save').serialize('seed-mirror-regression');
    assert.equal(env.data.meta.seed, SAVED_SEED);
    return JSON.stringify({ fmt: 'spaceface-save-gz', gz: 1, version: env.version,
      savedAt: env.savedAt, checksum: env.checksum, payload: gzipSync(JSON.stringify(env)).toString('base64') });
  } finally { source.shutdown(); }
}

function finiteBrowserWorker(origin = null) {
  // Same actual browser worker entrypoint and separate native realm as the existing
  // whole-sim browser fixtures. Its own normal shutdown closes only this test port;
  // no process/worker is killed or terminated.
  const entry = new URL('../src/core/wholeSimBrowserWorker.js', import.meta.url).href;
  const script = `
    import { parentPort, workerData } from 'node:worker_threads';
    const pending = [];
    if (workerData.origin) {
      globalThis.location = new URL(workerData.origin);
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (input, options) => originalFetch(new URL(input, location), options);
    }
    globalThis.self = globalThis;
    globalThis.postMessage = (message, transfer) => {
      parentPort.postMessage(message, Array.isArray(transfer) ? transfer : []);
      if (message.kind === 'bye') parentPort.close();
    };
    parentPort.on('message', data => typeof self.onmessage === 'function'
      ? self.onmessage({ data }) : pending.push(data));
    await import(${JSON.stringify(entry)});
    for (const data of pending.splice(0)) self.onmessage({ data });
  `;
  return new Worker(new URL(`data:text/javascript,${encodeURIComponent(script)}`), {
    type: 'module', workerData: { origin },
  });
}

test('default worker boot mirrors a save that only the returning browser has', { timeout: 15000 }, async () => {
  const playerStoreDir = await mkdtemp(join(tmpdir(), 'sf-worker-boot-store-'));
  const server = createGameServer({ root: process.cwd(), playerStoreDir });
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const key = 'sf.save.3';
  const raw = JSON.stringify({ fmt: 'spaceface-save', version: 14, savedAt: '2026-06-27T13:15:00Z' });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { length: 1, key: () => key, getItem: (name) => name === key ? raw : null },
  });
  const worker = finiteBrowserWorker(origin);
  const state = createGameState(TITLE_SEED);
  state.timeScale = 1;
  const bus = createBus();
  const synced = new Promise((ready) => bus.on('save:store-synced', ready));
  const exit = new Promise((resolveExit) => worker.once('exit', resolveExit));
  let lane;
  try {
    lane = createSimLaneRuntime({ state, registry: {}, bus,
      flags: { lane: 'worker', warnings: [], sab: false }, clockMode: 'worker-local',
      helpers: { scenarioContract },
      channelFactory: () => ({ post: (message) => worker.postMessage(message),
        onMessage: (handler) => worker.on('message', handler), terminate() {} }),
    });
    await lane.readyPromise;
    lane.runner.setClockActive(true);
    const result = await Promise.race([
      synced,
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('worker did not publish store readiness')), 7000);
        timer.unref();
      }),
    ]);
    assert.equal(result.ok, true);
    const response = await fetch(origin + '/__spaceface_player_store');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).keys[key], raw, 'public-route boot persists the browser-only save');
  } finally {
    lane?.close();
    await exit;
    await new Promise((closed) => server.close(closed));
    await rm(playerStoreDir, { recursive: true, force: true });
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  }
});

test('default worker Import and Load publish the canonical saved seed before the main Pause receipt', async () => {
  const json = await publicExportFixture();
  const previousStorage = globalThis.localStorage, rows = new Map();
  globalThis.localStorage = {
    get length() { return rows.size; }, key: i => [...rows.keys()][i] ?? null,
    getItem: key => rows.get(String(key)) ?? null,
    setItem: (key, value) => rows.set(String(key), String(value)), removeItem: key => rows.delete(String(key)),
  };
  const worker = finiteBrowserWorker(), replies = [], state = createGameState(TITLE_SEED), bus = createBus();
  state.timeScale = 0;
  let receive, lane;
  const receivedSeeds = [];
  bus.on('save:loaded', () => receivedSeeds.push(pauseRunSeedOf(state)));
  const exit = new Promise((resolveExit, reject) => {
    worker.once('exit', code => code === 0 ? resolveExit() : reject(new Error(`test worker exited ${code}`)));
    worker.once('error', reject);
  });
  try {
    worker.on('message', message => { replies.push(message); receive?.(message); });
    lane = createSimLaneRuntime({ state, registry: {}, bus,
      flags: { lane: 'worker', warnings: [], sab: false }, clockMode: 'worker-local',
      helpers: { scenarioContract },
      channelFactory: () => ({ post: message => worker.postMessage(message),
        onMessage: handler => { receive = handler; }, terminate() {} }),
    });
    await lane.readyPromise;
    assert.equal((await laneRpc('newGameBoot', { opts: { seed: TITLE_SEED } })).ok, true);
    assert.equal(pauseRunSeedOf(state), TITLE_SEED, 'the title has a different genuine initial worker seed');
    const imported = await laneRpc('saveImport', { json, slot: 'seed-mirror' });
    assert.equal(imported.ok, true);
    const importedAuthority = (await laneRpc('probeState')).result.seed;
    const importFooter = pauseRunSeedOf(state);
    const loaded = await laneRpc('saveLoad', { slot: 'seed-mirror' });
    assert.equal(loaded.ok, true);
    const loadedAuthority = (await laneRpc('probeState')).result.seed;
    const loadFooter = pauseRunSeedOf(state);
    assert.ok(receivedSeeds.length > 0, 'an actual restored-save receipt crosses the wire');
    assert.deepEqual({ importedAuthority, importFooter, loadedAuthority, loadFooter, receivedSeeds }, {
      importedAuthority: SAVED_SEED, importFooter: SAVED_SEED,
      loadedAuthority: SAVED_SEED, loadFooter: SAVED_SEED, receivedSeeds: receivedSeeds.map(() => SAVED_SEED),
    }, 'real restored identity must reach the main footer in the restore reply, without waiting for a cold mirror pass');
    assert.equal(replies.some(reply => reply.kind === 'error'), false);
  } finally {
    lane?.close();
    await exit;
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
