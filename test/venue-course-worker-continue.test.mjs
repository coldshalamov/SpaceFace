import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { installRealmFs } from '../scripts/lib/simRealm.mjs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { laneRpc } from '../src/core/simLaneCommands.js';
import { resolveGalaxyMapPrimaryAction, emitGalaxyMapPrimaryAction } from '../src/ui/galaxyMap.js';
import { VX_FREE_DRIVE_POI, VX_FREE_DRIVE_SECTOR_ID } from '../src/data/vxFreeDriveRing.js';
import { resolveWaypointPresentationPosition } from '../src/ui/navigationWaypoint.js';

const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));

function browserWorker() {
  const entry = new URL('../src/core/wholeSimBrowserWorker.js', import.meta.url).href;
  return new Worker(new URL(`data:text/javascript,${encodeURIComponent(`
    import { parentPort } from 'node:worker_threads';
    const pending = [];
    globalThis.self = globalThis;
    globalThis.postMessage = (message, transfer) => {
      parentPort.postMessage(message, Array.isArray(transfer) ? transfer : []);
      if (message.kind === 'bye') parentPort.close();
    };
    parentPort.on('message', data => typeof self.onmessage === 'function'
      ? self.onmessage({ data }) : pending.push(data));
    await import(${JSON.stringify(entry)});
    for (const data of pending.splice(0)) self.onmessage({ data });
  `)}`), { type: 'module' });
}

test('captured public venue course survives tracked-mission Continue and reaches main in the restore reply', async (t) => {
  installRealmFs({ readFileSync, resolve });
  const source = createSimHost();
  let json, expected, native, savedSeed;
  try {
    await source.init({ profile: 'production', seed: 4242, scenarioContract });
    await source.tick({ steps: 0, commands: [{ t: 'rpc', seq: 1, p: {
      id: 'boot', op: 'newGameBoot', payload: { opts: { seed: 4242 } },
    } }] });
    const { state, bus, registry } = source.host;
    assert.ok(state.missions.active.some(m => m.status === 'active'), 'ordinary boot retains the starter mission');
    // Bounded public catalog selection, independent of ignored pilot artifacts and
    // the host's realm-scoped mutable Atlas. No pilot/world position is imported.
    const target = { id: VX_FREE_DRIVE_POI.id, name: VX_FREE_DRIVE_POI.name, kind: 'poi',
      sectorId: VX_FREE_DRIVE_SECTOR_ID, x: VX_FREE_DRIVE_POI.pos.x, z: VX_FREE_DRIVE_POI.pos.z };
    const action = resolveGalaxyMapPrimaryAction(state, target);
    assert.equal(action.kind, 'waypoint');
    // A manually flown course remains selected after its burn stops, as in the report.
    action.coursePayload.autopilot = false;
    assert.equal(emitGalaxyMapPrimaryAction(bus, action), true);
    const saver = registry.get('save');
    const envelope = saver.serialize('venue-course');
    expected = structuredClone(envelope.data.nav);
    savedSeed = envelope.data.meta.seed;
    assert.equal(expected.waypoint.kind, 'local');
    assert.equal(expected.waypoint.label, 'Cracker Run');
    assert.deepEqual(expected.waypoint.pos, resolveWaypointPresentationPosition(state, state.nav.waypoint),
      'canonical capture retains the selected public fix');
    json = JSON.stringify({ fmt: 'spaceface-save-gz', gz: 1, version: envelope.version,
      savedAt: envelope.savedAt, checksum: envelope.checksum,
      payload: gzipSync(JSON.stringify(envelope)).toString('base64') });
    assert.equal(await saver.importString(json, 'venue-course'), true);
    native = saver._serializeNav();
  } finally { source.shutdown(); }

  const previousStorage = globalThis.localStorage, rows = new Map();
  globalThis.localStorage = {
    get length() { return rows.size; }, key: i => [...rows.keys()][i] ?? null,
    getItem: key => rows.get(String(key)) ?? null,
    setItem: (key, value) => rows.set(String(key), String(value)), removeItem: key => rows.delete(String(key)),
  };
  const worker = browserWorker(), state = createGameState(123), bus = createBus(), receipts = [];
  state.timeScale = 0;
  const snapshot = () => ({ nav: structuredClone(state.nav),
    target: structuredClone(resolveWaypointPresentationPosition(state, state.nav?.waypoint)), seed: state.meta.seed });
  bus.on('save:loaded', () => receipts.push(snapshot()));
  let receive, lane;
  const exit = new Promise((done, reject) => {
    worker.once('exit', code => code === 0 ? done() : reject(new Error(`test worker exited ${code}`)));
    worker.once('error', reject);
  });
  try {
    worker.on('message', message => receive?.(message));
    lane = createSimLaneRuntime({ state, registry: {}, bus,
      flags: { lane: 'worker', warnings: [], sab: false }, clockMode: 'worker-local', helpers: { scenarioContract },
      channelFactory: () => ({ post: message => worker.postMessage(message),
        onMessage: handler => { receive = handler; }, terminate() {} }),
    });
    await lane.readyPromise;
    assert.equal((await laneRpc('newGameBoot', { opts: { seed: 123 } })).ok, true);
    assert.equal((await laneRpc('saveImport', { json, slot: 'venue-course' })).ok, true);
    const imported = snapshot();
    assert.equal((await laneRpc('saveLoad', { slot: 'venue-course' })).ok, true);
    const continued = snapshot();
    assert.ok(receipts.length > 0, 'a restored-save receipt crosses the actual browser-worker transport');
    t.diagnostic(JSON.stringify({ captured: expected.waypoint?.label, native: native.waypoint?.label,
      imported: imported.nav?.waypoint?.label, continued: continued.nav?.waypoint?.label,
      receiptLabels: receipts.map(r => r.nav?.waypoint?.label) }));
    const wanted = { nav: expected, target: expected.waypoint.pos, seed: savedSeed };
    assert.deepEqual({ native, imported, continued, receipts }, {
      native: expected, imported: wanted, continued: wanted, receipts: receipts.map(() => wanted),
    }, 'capture, native restore and same-reply main readers must agree without a new navigation action or later tick');
  } finally {
    lane?.close();
    await exit;
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
