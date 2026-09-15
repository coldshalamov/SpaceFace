// PQ-033.03 — the Steamworks adapter: a clean, explained no-op without the SDK; strict validation of
// what the renderer may send; one real activation through a fake SDK; and the main.cjs + preload
// wiring (two allowlisted channels, the Steam build skips the GitHub self-updater). Headless: no
// Electron, no Steam client, no native module.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { ACHIEVEMENTS } from '../src/data/achievements.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAIN_PATH = path.join(ROOT, 'electron', 'main.cjs');
const PRELOAD_PATH = path.join(ROOT, 'electron', 'preload.cjs');
const realRequire = createRequire(MAIN_PATH);
const steamworks = realRequire('./steamworks.cjs');

function emitter(base = {}) {
  const listeners = new Map();
  return Object.assign(base, {
    on(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
      return this;
    },
    once(type, listener) {
      const wrapped = (...args) => { listeners.get(type)?.delete(wrapped); listener(...args); };
      return this.on(type, wrapped);
    },
    emit(type, ...args) {
      for (const listener of [...(listeners.get(type) || [])]) listener(...args);
    },
  });
}

function fakeSdk({ throwOnInit = false, incomplete = false } = {}) {
  const calls = [];
  const activated = new Set();
  return {
    calls,
    init(appId) {
      calls.push(['init', appId === undefined ? null : appId]);
      if (throwOnInit) throw new Error('SteamAPI_Init() failed: no Steam client');
      if (incomplete) return {};
      return {
        achievement: {
          isActivated: (name) => activated.has(name),
          activate: (name) => { calls.push(['activate', name]); activated.add(name); return true; },
        },
        cloud: { isEnabledForAccount: () => true, isEnabledForApp: () => false },
      };
    },
    electronEnableSteamOverlay() { calls.push(['overlay']); },
  };
}

test('without the steamworks.js binding every call is a clean, explained no-op', () => {
  assert.throws(() => realRequire.resolve('steamworks.js'), /Cannot find module/, 'the binding is not a dependency of this build');
  assert.equal(steamworks.loadSteamworksBinding(), null);

  const adapter = steamworks.createSteamworksAdapter({ env: {} });
  assert.deepEqual(adapter.publicStatus(), {
    available: false,
    reason: 'sdk-absent',
    distribution: 'direct',
    achievements: ACHIEVEMENTS.length,
    cloud: null,
  });
  assert.deepEqual(adapter.unlockAchievement({ id: 'berth_assigned' }), {
    ok: false, available: false, reason: 'sdk-absent', id: 'berth_assigned',
  });
  assert.deepEqual(adapter.enableOverlay(), { enabled: false, reason: 'not-steam-distribution' });
  const steamBuildWithoutSdk = steamworks.createSteamworksAdapter({ env: {}, distribution: 'steam', loadBinding: () => null });
  assert.deepEqual(steamBuildWithoutSdk.enableOverlay(), { enabled: false, reason: 'sdk-absent' });
  console.log(`PQ-033.03 steam adapter without SDK: ${JSON.stringify(adapter.publicStatus())}`);
});

test('the unlock channel accepts exactly { id } for a known achievement and nothing else', () => {
  const table = steamworks.loadSteamAchievementTable();
  assert.equal(table.size, ACHIEVEMENTS.length);
  const refused = [
    undefined, null, 'berth_assigned', 42, [], {},
    { id: 'unknown_feat' },
    { id: '../../steam_api64.dll' },
    { id: 'C:\\Windows\\System32' },
    { id: 'BERTH_ASSIGNED' },
    { id: 'SF_BERTH_ASSIGNED' },
    { id: 'berth_assigned', apiName: 'SF_SIX_FIGURES' },
    { id: 'berth_assigned', path: '/tmp/x' },
    { id: 'x'.repeat(80) },
    { id: 7 },
  ];
  for (const payload of refused) {
    const verdict = steamworks.normalizeAchievementUnlockPayload(payload, table);
    assert.equal(verdict.ok, false, `refuses ${JSON.stringify(payload)}`);
    assert.equal(typeof verdict.error, 'string');
  }
  for (const def of ACHIEVEMENTS) {
    assert.deepEqual(steamworks.normalizeAchievementUnlockPayload({ id: def.id }, table), { ok: true, id: def.id, apiName: def.steamApiName });
  }
});

test('with a Steam client the adapter activates the mapped API name exactly once', () => {
  const sdk = fakeSdk();
  const receipts = [];
  const adapter = steamworks.createSteamworksAdapter({
    env: { SPACEFACE_STEAM_APP_ID: '480' },
    argv: ['SpaceFace.exe'],
    distribution: 'steam',
    loadBinding: () => sdk,
    receipt: (status) => receipts.push(status),
  });
  assert.deepEqual(adapter.enableOverlay(), { enabled: true });
  assert.deepEqual(adapter.publicStatus(), {
    available: true, reason: 'ok', distribution: 'steam', achievements: ACHIEVEMENTS.length,
    cloud: { enabledForAccount: true, enabledForApp: false },
  });
  assert.deepEqual(adapter.unlockAchievement({ id: 'razor_release' }), { ok: true, available: true, id: 'razor_release', already: false });
  assert.deepEqual(adapter.unlockAchievement({ id: 'razor_release' }), { ok: true, available: true, id: 'razor_release', already: true });
  assert.deepEqual(adapter.unlockAchievement({ id: 'not_a_feat' }), { ok: false, error: 'unknown achievement id' });
  assert.deepEqual(sdk.calls, [['overlay'], ['init', 480], ['activate', 'SF_RAZOR_RELEASE']], 'one init, one activation, nothing for a refused id');
  assert.ok(receipts.includes('steam-ready') && receipts.includes('steam-achievement'));
});

test('Steam not running, disabled, incomplete or an evidence launch: available false with the reason', () => {
  assert.equal(steamworks.createSteamworksAdapter({ env: {}, loadBinding: () => fakeSdk({ throwOnInit: true }) }).publicStatus().reason, 'steam-not-running');
  assert.equal(steamworks.createSteamworksAdapter({ env: { SPACEFACE_STEAM: '0' }, loadBinding: () => fakeSdk() }).publicStatus().reason, 'disabled-by-env');
  assert.equal(steamworks.createSteamworksAdapter({ env: {}, loadBinding: () => fakeSdk({ incomplete: true }) }).publicStatus().reason, 'sdk-incomplete');
  const evidence = steamworks.createSteamworksAdapter({
    env: {},
    distribution: 'steam',
    disabledReason: 'isolated-evidence',
    loadBinding: () => { throw new Error('an evidence launch must never load the binding'); },
  });
  assert.equal(evidence.publicStatus().reason, 'isolated-evidence');
  assert.deepEqual(evidence.enableOverlay(), { enabled: false, reason: 'isolated-evidence' });

  // The overlay opt-outs. Windows Steam launch options carry arguments, not environment variables.
  const overlaySdk = fakeSdk();
  const byArgument = steamworks.createSteamworksAdapter({
    env: {},
    argv: ['SpaceFace.exe', steamworks.STEAM_OVERLAY_OFF_ARGUMENT],
    distribution: 'steam',
    loadBinding: () => overlaySdk,
  });
  assert.equal(steamworks.STEAM_OVERLAY_OFF_ARGUMENT, '--no-steam-overlay');
  assert.deepEqual(byArgument.enableOverlay(), { enabled: false, reason: 'disabled-by-argument' });
  const byEnv = steamworks.createSteamworksAdapter({
    env: { SPACEFACE_STEAM_OVERLAY: '0' },
    argv: ['SpaceFace.exe'],
    distribution: 'steam',
    loadBinding: () => overlaySdk,
  });
  assert.deepEqual(byEnv.enableOverlay(), { enabled: false, reason: 'disabled-by-env' });
  assert.deepEqual(overlaySdk.calls, [], 'an opted-out Steam build never arms the overlay switches');
  assert.equal(byArgument.unlockAchievement({ id: 'walked_out' }).ok, true, 'achievements still unlock with the overlay off');

  assert.equal(steamworks.resolveDistribution({ env: { SPACEFACE_DISTRIBUTION: 'steam' } }), 'steam');
  assert.equal(steamworks.resolveDistribution({ env: {} }), 'direct', 'this repository package.json is the direct build');
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pq03303-dist-'));
  try {
    const stamped = path.join(tmp, 'package.json');
    writeFileSync(stamped, JSON.stringify({ name: 'spaceface', spacefaceDistribution: 'steam' }));
    assert.equal(steamworks.resolveDistribution({ env: {}, packageJsonPath: stamped }), 'steam', 'dist:steam stamps the packaged package.json');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  assert.equal(steamworks.resolveSteamAppId({ SPACEFACE_STEAM_APP_ID: '480' }), 480);
  assert.equal(steamworks.resolveSteamAppId({ SPACEFACE_STEAM_APP_ID: '0480' }), null);
  assert.equal(steamworks.resolveSteamAppId({ SPACEFACE_STEAM_APP_ID: 'abc' }), null);
});

async function loadMain({ env = {}, isPackaged = false, isolatedEvidence = false } = {}) {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'sf-pq03303-'));
  const paths = { userData: path.join(tmpRoot, 'userData'), exe: path.join(tmpRoot, 'electron.exe') };
  const receipts = [];
  const updaterCalls = [];
  const switches = [];
  const ipcHandlers = new Map();
  const windows = [];
  const processEvents = emitter({
    env,
    platform: 'win32',
    execPath: paths.exe,
    resourcesPath: path.join(tmpRoot, 'resources'),
    versions: { electron: '43.2.0', chrome: '150.0.0', node: '24.18.0', v8: '15.0.0' },
    pid: 4343,
    uptime() { return 3; },
    exit() {},
  });
  const app = emitter({
    isPackaged,
    commandLine: { appendSwitch(name) { switches.push(name); } },
    getVersion() { return '0.1.0'; },
    getPath(name) { return paths[name] || path.join(tmpRoot, `.electron-${name}`); },
    setPath(name, value) { paths[name] = value; },
    requestSingleInstanceLock() { return true; },
    whenReady() { return Promise.resolve(); },
    quit() { this.emit('before-quit'); },
    exit(code) { throw new Error(`unexpected app.exit(${code})`); },
  });
  function FakeBrowserWindow(options) {
    const webContents = emitter({
      session: { setPermissionCheckHandler() {}, setPermissionRequestHandler() {} },
      isDestroyed() { return false; },
      getURL() { return this.url || 'about:blank'; },
      setWindowOpenHandler() {},
      send() {},
    });
    const win = emitter({
      options,
      webContents,
      isFullScreen() { return false; },
      setFullScreen() {},
      removeMenu() {},
      isDestroyed() { return false; },
      isVisible() { return true; },
      isMinimized() { return false; },
      isFocused() { return true; },
      show() {},
      async loadURL(url) { webContents.url = url; webContents.emit('did-finish-load'); },
    });
    windows.push(win);
    return win;
  }
  FakeBrowserWindow.getAllWindows = () => windows;
  const sandbox = {
    __dirname: path.join(ROOT, 'electron'),
    console,
    URL,
    module: { exports: {} },
    exports: {},
    process: processEvents,
    require(specifier) {
      if (specifier === 'electron') {
        return {
          app,
          BrowserWindow: FakeBrowserWindow,
          powerMonitor: emitter(),
          ipcMain: emitter({ handle(channel, handler) { ipcHandlers.set(channel, handler); } }),
          crashReporter: { start() {} },
        };
      }
      if (specifier === '../scripts/lib/gameServer.cjs') {
        return {
          createGameServer() {
            return emitter({
              listen(port, _host, callback) { this.port = port; callback(); },
              address() { return { port: this.port }; },
              close(callback) { callback(); },
            });
          },
        };
      }
      if (specifier === '../scripts/lib/playerSaveStore.cjs') {
        return {
          LOCAL_STORAGE_DUMP_SOURCE: '({})',
          PLAYER_STORE_ORIGIN_ROUTE: '/__spaceface_player_store/origin',
          resolvePlayerSaveDir() { return path.join(tmpRoot, 'player-saves'); },
          writePlayerStoreKeysSync() { return {}; },
        };
      }
      if (specifier === './autoUpdate.cjs') {
        return { configureAutoUpdate(options) { updaterCalls.push(options); return Object.freeze({ enabled: true }); } };
      }
      if (specifier === '../scripts/lib/electronLaunchProtocol.cjs') {
        return {
          appendLaunchReceipt(_receiptPath, status, details) { receipts.push({ status, details }); },
          isAllowedElectronListenerPort() { return true; },
          isAssetPreloadFailureMessage() { return false; },
          resolveElectronLaunchConfig() {
            return { isolatedEvidence, port: 41788, userDataDir: paths.userData, lockNamespace: 'player' };
          },
          resolveWebRoot({ projectRoot }) { return projectRoot; },
        };
      }
      return realRequire(specifier);
    },
  };
  vm.runInNewContext(readFileSync(MAIN_PATH, 'utf8'), sandbox, { filename: MAIN_PATH });
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setImmediate(resolve));
  return {
    ipcHandlers, receipts, updaterCalls, switches,
    cleanup() { rmSync(tmpRoot, { recursive: true, force: true }); },
  };
}

test('main.cjs answers both Steam channels and validates the renderer payload', async () => {
  const loaded = await loadMain();
  try {
    const unlock = loaded.ipcHandlers.get(steamworks.ACHIEVEMENT_UNLOCK_CHANNEL);
    const status = loaded.ipcHandlers.get(steamworks.STEAM_STATUS_CHANNEL);
    assert.equal(steamworks.ACHIEVEMENT_UNLOCK_CHANNEL, 'spaceface:achievement-unlock');
    assert.equal(steamworks.STEAM_STATUS_CHANNEL, 'spaceface:steam-status');
    assert.equal(typeof unlock, 'function');
    assert.equal(typeof status, 'function');
    assert.deepEqual(unlock({}, { id: '../../etc/passwd' }), { ok: false, error: 'id must be a known lowercase achievement id' });
    assert.deepEqual(unlock({}, { id: 'berth_assigned', extra: 1 }), { ok: false, error: 'payload may carry only id' });
    assert.deepEqual(unlock({}, { id: 'berth_assigned' }), { ok: false, available: false, reason: 'sdk-absent', id: 'berth_assigned' });
    assert.deepEqual(status({}), { available: false, reason: 'sdk-absent', distribution: 'direct', achievements: ACHIEVEMENTS.length, cloud: null });
    assert.equal(loaded.updaterCalls.length, 1, 'the direct build still wires the GitHub updater');
    assert.equal(loaded.switches.includes('in-process-gpu'), false, 'a direct build never takes the overlay switches');
  } finally {
    loaded.cleanup();
  }
});

test('a Steam-stamped packaged build skips the GitHub self-updater; evidence launches never touch Steam', async () => {
  const steamBuild = await loadMain({ env: { SPACEFACE_DISTRIBUTION: 'steam' }, isPackaged: true });
  try {
    assert.equal(steamBuild.updaterCalls.length, 0, 'Steam delivers updates for Steam builds');
    assert.ok(steamBuild.receipts.some((r) => r.status === 'update-skipped' && r.details.reason === 'steam-distribution'));
    const status = steamBuild.ipcHandlers.get(steamworks.STEAM_STATUS_CHANNEL)({});
    assert.equal(status.distribution, 'steam');
    assert.equal(status.reason, 'sdk-absent', 'no binding installed in this checkout');
  } finally {
    steamBuild.cleanup();
  }
  const evidence = await loadMain({ env: { SPACEFACE_DISTRIBUTION: 'steam' }, isPackaged: true, isolatedEvidence: true });
  try {
    assert.equal(evidence.ipcHandlers.get(steamworks.STEAM_STATUS_CHANNEL)({}).reason, 'isolated-evidence');
    assert.equal(evidence.updaterCalls.length, 0);
  } finally {
    evidence.cleanup();
  }
});

test('preload exposes unlockAchievement and steamStatus on the allowlisted bridge only', async () => {
  const exposed = {};
  const invokes = [];
  const electronFake = {
    contextBridge: { exposeInMainWorld(name, api) { exposed[name] = api; } },
    ipcRenderer: {
      on() {},
      send() {},
      invoke: async (channel, payload) => { invokes.push([channel, payload]); return { ok: true }; },
    },
  };
  vm.runInNewContext(readFileSync(PRELOAD_PATH, 'utf8'), {
    console,
    require(specifier) {
      if (specifier === 'electron') return electronFake;
      throw new Error(`preload must not require ${specifier}`);
    },
  }, { filename: PRELOAD_PATH });
  const shell = exposed.spacefaceShell;
  assert.deepEqual(Object.keys(shell).sort(), ['buildInfo', 'quit', 'saveClip', 'steamStatus', 'unlockAchievement']);
  await shell.unlockAchievement('berth_assigned');
  await shell.unlockAchievement({ path: 'C:/Windows' });
  await shell.steamStatus();
  // The payloads are created inside the sandbox realm, so compare their serialized shape.
  assert.deepEqual(invokes.map(([channel, payload]) => [channel, payload === undefined ? '(none)' : JSON.stringify(payload)]), [
    ['spaceface:achievement-unlock', '{"id":"berth_assigned"}'],
    ['spaceface:achievement-unlock', '{"id":""}'],
    ['spaceface:steam-status', '(none)'],
  ]);
});
