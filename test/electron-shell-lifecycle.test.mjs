import assert from 'node:assert/strict';
import fs, { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAIN_PATH = path.join(ROOT, 'electron', 'main.cjs');
const PRELOAD_PATH = path.join(ROOT, 'electron', 'preload.cjs');
// Startup-failure tests write a crash report under the stubbed userData/crashDumps; keep those out of the repo.
const SHELL_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-lifecycle-'));
process.on('exit', () => { try { fs.rmSync(SHELL_TMP, { recursive: true, force: true }); } catch {} });
const CHANNEL = 'spaceface:shell-lifecycle';
const windowStateModule = createRequire(import.meta.url)('../electron/windowState.cjs');
const { configureAutoUpdate } = createRequire(import.meta.url)('../electron/autoUpdate.cjs');

function emitter(base = {}) {
  const listeners = new Map();
  return Object.assign(base, {
    on(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
      return this;
    },
    once(type, listener) {
      const wrapped = (...args) => {
        listeners.get(type)?.delete(wrapped);
        listener(...args);
      };
      return this.on(type, wrapped);
    },
    removeListener(type, listener) { listeners.get(type)?.delete(listener); },
    emit(type, ...args) {
      for (const listener of [...(listeners.get(type) || [])]) listener(...args);
    },
    listenerCount(type) { return listeners.get(type)?.size || 0; },
  });
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

async function loadMain({
  isolatedEvidence = false,
  allowBackgroundExecution = false,
  platform = 'win32',
  activateBeforeServerReady = 0,
  failWindowLoads = 0,
  windowLoadFailure = null,
  paintBeforeFirstLoadSettles = false,
  allowStartupFailure = false,
  updateDialogResponse = null,
  updaterWillQuit = true,
  deferFirstPaint = false,
  hangInitialNavigation = false,
  omitShowEvent = false,
} = {}) {
  const windows = [];
  const commands = [];
  const receipts = [];
  const quitRequests = [];
  const nativeUpdater = emitter();
  const updater = emitter({
    installs: 0,
    checkForUpdates() {},
    quitAndInstall() {
      this.installs += 1;
      if (!updaterWillQuit) return;
      setImmediate(() => {
        nativeUpdater.emit('before-quit-for-update');
        app.quit();
      });
    },
  });
  const pendingServerListens = [];
  const timers = [];
  const serverStats = { created: 0, listens: 0, quits: 0, exits: [] };
  const security = {
    permissionCheckHandler: null,
    permissionRequestHandler: null,
  };
  const powerMonitor = emitter();
  const crashReporter = {
    starts: [],
    start(options) { this.starts.push(options); },
  };
  const ipcMain = emitter();
  const ipcHandlers = new Map();
  ipcMain.handle = (channel, handler) => { ipcHandlers.set(channel, handler); };
  ipcMain.handlerCount = (channel) => (ipcHandlers.has(channel) ? 1 : 0);
  ipcMain.invokeHandler = (channel, ...args) => {
    if (!ipcHandlers.has(channel)) throw new Error(`no ipcMain handler for ${channel}`);
    return ipcHandlers.get(channel)(...args);
  };
  const dialog = {
    saveCalls: [],
    messageCalls: [],
    async showMessageBox(parent, options) {
      this.messageCalls.push({ parent, options });
      return { response: options?.title === 'Update ready' ? updateDialogResponse : 0 };
    },
    showSaveDialog(parent, options) {
      this.saveCalls.push({ parent, options });
      return Promise.resolve({ canceled: true, filePath: '' });
    },
  };
  const workshop = {
    created: 0,
    userContentDir: undefined,
    publishes: [],
    statusCalls: 0,
    syncCalls: 0,
  };
  const app = emitter({
    isPackaged: updateDialogResponse !== null,
    commandLine: { appendSwitch() {} },
    getPath(name) { return path.join(SHELL_TMP, `.electron-${name}`); },
    setPath(name, value) { this.pathSets.push([name, value]); },
    getVersion() { return '0.0.0-test'; },
    pathSets: [],
    requestSingleInstanceLock() { return true; },
    whenReady() { return Promise.resolve(); },
    quit() {
      serverStats.quits += 1;
      this.emit('before-quit');
      if (this.isPackaged) for (const win of windows) if (!win.destroyed) win.close();
    },
    exit(code) {
      serverStats.exits.push(code);
      if (!allowStartupFailure) throw new Error(`unexpected app.exit(${code})`);
    },
  });

  function FakeBrowserWindow(options) {
    let currentUrl = 'about:blank';
    const webContents = emitter({
      destroyed: false,
      windowOpenHandler: null,
      session: {
        setPermissionCheckHandler(handler) { security.permissionCheckHandler = handler; },
        setPermissionRequestHandler(handler) { security.permissionRequestHandler = handler; },
      },
      isDestroyed() { return this.destroyed; },
      getURL() { return currentUrl; },
      setWindowOpenHandler(handler) { this.windowOpenHandler = handler; },
      send(channel, command) {
        if (channel === 'spaceface:prepare-quit') { quitRequests.push(command); return; }
        assert.equal(channel, CHANNEL);
        commands.push(command);
      },
    });
    const win = emitter({
      options,
      webContents,
      visible: false,
      minimized: false,
      focused: false,
      focusCount: 0,
      destroyed: false,
      loadRequests: [],
      fullscreen: options?.fullscreen === true,
      isFullScreen() { return this.fullscreen; },
      setFullScreen(val) { this.fullscreen = !!val; },
      removeMenu() {},
      isDestroyed() { return this.destroyed; },
      isVisible() { return this.visible; },
      isMinimized() { return this.minimized; },
      isFocused() { return this.focused; },
      show() { this.visible = true; if (!omitShowEvent) this.emit('show'); },
      hide() { this.visible = false; this.focused = false; this.emit('hide'); },
      minimize() { this.minimized = true; this.emit('minimize'); },
      restore() { this.minimized = false; this.visible = true; this.emit('restore'); },
      focus() { this.focusCount += 1; this.visible = true; this.focused = true; this.emit('focus'); },
      blur() { this.focused = false; this.emit('blur'); },
      close() {
        let prevented = false;
        this.emit('close', { preventDefault() { prevented = true; } });
        if (prevented) return;
        this.destroyed = true;
        webContents.destroyed = true;
        this.emit('closed');
      },
      async loadURL(url) {
        this.loadedUrl = url;
        this.loadRequests.push(url);
        currentUrl = url;
        if (hangInitialNavigation) await new Promise(() => {});
        if (failWindowLoads > 0) {
          failWindowLoads -= 1;
          throw new Error('injected window load failure');
        }
        const failure = this.loadRequests.length <= (windowLoadFailure?.times ?? Infinity)
          ? windowLoadFailure : null;
        if (failure?.phase === 'before-commit') {
          const error = Object.assign(new Error('injected pre-commit navigation failure'), {
            code: failure.code,
            url: failure.rejectedUrl || currentUrl,
          });
          webContents.emit('did-fail-load', {}, failure.eventCode ?? error.code, error.message, error.url, true);
          if (paintBeforeFirstLoadSettles && this.loadRequests.length === 1) {
            this.emit('ready-to-show');
            this.visibleBeforeLoadSettled = this.isVisible();
          }
          throw error;
        }
        webContents.emit('did-finish-load');
        if (failure?.phase === 'after-commit') {
          currentUrl = failure.currentUrl || currentUrl;
          if (failure.destroyWindow) {
            this.destroyed = true;
            webContents.destroyed = true;
          }
          const error = Object.assign(new Error('injected post-commit navigation failure'), {
            code: failure.code,
            url: failure.rejectedUrl || currentUrl,
          });
          webContents.emit('did-fail-load', {}, error.code, error.message, error.url, true);
          throw error;
        }
        if (!deferFirstPaint) this.emit('ready-to-show');
      },
    });
    webContents.loadURL = (url) => win.loadURL(url);
    windows.push(win);
    return win;
  }
  FakeBrowserWindow.getAllWindows = () => windows.filter((win) => !win.destroyed);

  function createGameServer() {
    serverStats.created += 1;
    return emitter({
      listen(port, _host, callback) {
        serverStats.listens += 1;
        this.port = port;
        if (activateBeforeServerReady > 0) pendingServerListens.push(callback);
        else callback();
      },
      address() { return { port: this.port }; },
      close(callback) { callback(); },
    });
  }

  const sandbox = {
    __dirname: path.join(ROOT, 'electron'),
    console,
    setTimeout(callback, delay) {
      const timer = { callback, delay, cleared: false, unref() {} };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) { timer.cleared = true; },
    URL,
    module: { exports: {} },
    exports: {},
    process: {
      env: {
        SPACEFACE_DEV_SIM_WORKER_BUNDLE: '0',
        ...(allowBackgroundExecution ? { SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION: '1' } : {}),
      },
      platform,
      execPath: path.join(ROOT, 'electron.exe'),
      resourcesPath: path.join(ROOT, 'resources'),
      versions: {
        electron: '43.2.0',
        chrome: '150.0.7871.129',
        node: '24.18.0',
        v8: '15.0.0',
      },
    },
    require(specifier) {
      if (specifier === 'electron') return { app, BrowserWindow: FakeBrowserWindow, powerMonitor, ipcMain, dialog, crashReporter, autoUpdater: nativeUpdater };
      if (specifier === 'http') return { get() { throw new Error('unexpected HTTP probe'); } };
      if (specifier === 'path') return path;
      if (specifier === 'fs') return fs;
      if (specifier === './releaseIdentity.cjs') {
        return {
          resolveReleaseIdentity() {
            return Object.freeze({ version: '0.0.0-test', build: 'test-build', packaged: false, source: 'dev' });
          },
          publicBuildInfo(identity) {
            return Object.freeze({
              version: identity.version,
              build: identity.build,
              packaged: !!identity.packaged,
              channel: 'dev',
            });
          },
        };
      }
      if (specifier === './autoUpdate.cjs') {
        if (updateDialogResponse !== null) {
          return {
            configureAutoUpdate(options) {
              return configureAutoUpdate({ ...options, updaterModule: { autoUpdater: updater } });
            },
          };
        }
        return { configureAutoUpdate() { return { enabled: false, reason: 'test-disabled' }; } };
      }
      if (specifier === './windowState.cjs') {
        // FB-106: the real pure module. With no state file under the stubbed userData it reads
        // null, so the sandbox exercises the launch-default path (nothing remembered).
        return windowStateModule;
      }
      if (specifier === './steamworks.cjs') {
        return {
          ACHIEVEMENT_UNLOCK_CHANNEL: 'spaceface:achievement-unlock',
          STEAM_STATUS_CHANNEL: 'spaceface:steam-status',
          DISTRIBUTION_STEAM: 'steam',
          DISTRIBUTION_DIRECT: 'direct',
          resolveDistribution() { return 'direct'; },
          createSteamworksAdapter() {
            return Object.freeze({
              distribution: 'direct',
              init() { return Object.freeze({ available: false, reason: 'test-no-steam' }); },
              enableOverlay() { return { enabled: false, reason: 'not-steam-distribution' }; },
              unlockAchievement(payload) {
                return { ok: false, available: false, reason: 'test-no-steam', id: payload && payload.id };
              },
              publicStatus() {
                return { available: false, reason: 'test-no-steam', distribution: 'direct', achievements: 0, cloud: null };
              },
            });
          },
        };
      }
      if (specifier === '../scripts/lib/gameServer.cjs') return { createGameServer };
      if (specifier === '../scripts/lib/userContentStore.cjs') {
        return { resolveMountedUserContentDir() { return null; } };
      }
      if (specifier === '../scripts/lib/playerSaveStore.cjs') {
        return {
          LOCAL_STORAGE_DUMP_SOURCE: '({})',
          PLAYER_STORE_ORIGIN_ROUTE: '/__spaceface_player_store/origin',
          resolvePlayerSaveDir() { return path.join(ROOT, '.tmp-player-saves'); },
          writePlayerStoreKeysSync() { return {}; },
        };
      }
      if (specifier === '../scripts/lib/electronLaunchProtocol.cjs') {
        return {
          ELECTRON_STARTUP_TIMEOUT_MS: 90_000,
          appendLaunchReceipt(_receiptPath, status, details) { receipts.push({ status, details }); },
          isAllowedElectronListenerPort() { return true; },
          isAssetPreloadFailureMessage(message) { return /authored preload failed/i.test(String(message || '')); },
          resolveElectronLaunchConfig() {
            return {
              isolatedEvidence,
              port: isolatedEvidence ? 41991 : 41788,
              userDataDir: path.join(ROOT, '.tmp-electron-lifecycle'),
              lockNamespace: isolatedEvidence ? 'evidence' : 'player',
            };
          },
          resolveWebRoot({ projectRoot }) { return projectRoot; },
        };
      }
      if (specifier === './workshopMods.cjs') {
        return {
          WORKSHOP_STATUS_CHANNEL: 'spaceface:workshop-status',
          WORKSHOP_PUBLISH_CHANNEL: 'spaceface:workshop-publish',
          WORKSHOP_SYNC_CHANNEL: 'spaceface:workshop-sync',
          createWorkshopBridge({ userContentDir }) {
            workshop.created += 1;
            workshop.userContentDir = userContentDir;
            return {
              status() {
                workshop.statusCalls += 1;
                return { available: false, reason: 'test-no-steam', items: 0 };
              },
              publishMod(payload) {
                workshop.publishes.push(payload);
                return { ok: false, available: false, reason: 'test-no-steam', modId: payload?.modId ?? null };
              },
              syncSubscribed() {
                workshop.syncCalls += 1;
                return { ok: false, available: false, reason: 'test-no-steam', synced: 0 };
              },
            };
          },
        };
      }
      throw new Error(`unexpected require: ${specifier}`);
    },
  };

  vm.runInNewContext(readFileSync(MAIN_PATH, 'utf8'), sandbox, { filename: MAIN_PATH });
  if (activateBeforeServerReady > 0) {
    await Promise.resolve();
    await Promise.resolve();
    for (let index = 0; index < activateBeforeServerReady; index += 1) app.emit('activate');
    for (const release of pendingServerListens.splice(0)) release();
  }
  await settle();
  assert.equal(windows.length, 1);
  return { app, powerMonitor, crashReporter, ipcMain, ipcHandlers, dialog, win: windows[0], windows, commands, receipts, security, serverStats, workshop, updater, quitRequests, timers };
}

function loadPreload() {
  const ipcListeners = new Map();
  const exposed = new Map();
  let outboundCalls = 0;
  const outboundChannels = [];
  const invocations = [];
  const contextBridge = {
    exposeInMainWorld(name, value) { exposed.set(name, value); },
  };
  const ipcRenderer = {
    on(channel, listener) {
      if (!ipcListeners.has(channel)) ipcListeners.set(channel, new Set());
      ipcListeners.get(channel).add(listener);
    },
    send(channel) {
      outboundCalls++;
      outboundChannels.push(channel);
    },
    invoke(channel, payload) {
      outboundCalls++;
      invocations.push([channel, payload]);
      return Promise.resolve(null);
    },
  };
  vm.runInNewContext(readFileSync(PRELOAD_PATH, 'utf8'), {
    console,
    module: { exports: {} },
    exports: {},
    require(specifier) {
      if (specifier === 'electron') return { contextBridge, ipcRenderer };
      throw new Error(`unexpected require: ${specifier}`);
    },
  }, { filename: PRELOAD_PATH });
  return {
    exposed,
    ipcListeners,
    outboundCalls: () => outboundCalls,
    outboundChannels: () => [...outboundChannels],
    invocations: () => invocations.map(([channel, payload]) => [
      channel,
      payload === undefined ? undefined : plain(payload),
    ]),
    emit(command) {
      for (const listener of [...(ipcListeners.get(CHANNEL) || [])]) listener({}, command);
    },
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('normal player window restores Chromium background throttling and starts in fullscreen', async () => {
  const h = await loadMain({ allowBackgroundExecution: true });
  assert.equal(h.win.options.fullscreen, true, 'player desktop window should start in fullscreen');
  assert.equal(h.win.options.webPreferences.contextIsolation, true);
  assert.equal(h.win.options.webPreferences.nodeIntegration, false);
  assert.equal(h.win.options.webPreferences.sandbox, true);
  assert.equal(h.win.options.webPreferences.webSecurity, true);
  assert.equal(h.win.options.webPreferences.allowRunningInsecureContent, false);
  assert.equal(h.win.options.webPreferences.experimentalFeatures, false);
  assert.equal(h.win.options.webPreferences.backgroundThrottling, true,
    'the evidence env var alone must not disable player throttling');
  assert.equal(h.win.options.webPreferences.preload, PRELOAD_PATH);

  // Test F11 toggle
  let defaultPrevented = false;
  const preventDefault = () => { defaultPrevented = true; };
  h.win.webContents.emit('before-input-event', { preventDefault }, { type: 'keyDown', key: 'F11' });
  assert.equal(h.win.isFullScreen(), false);
  assert.equal(defaultPrevented, true);

  defaultPrevented = false;
  h.win.webContents.emit('before-input-event', { preventDefault }, { type: 'keyDown', key: 'Enter', alt: true });
  assert.equal(h.win.isFullScreen(), true);
  assert.equal(defaultPrevented, true);
});

test('isolated evidence window does not force fullscreen', async () => {
  const h = await loadMain({ isolatedEvidence: true });
  assert.equal(h.win.options.fullscreen, false, 'isolated evidence window should not force fullscreen');
});

test('desktop shell denies popups, foreign navigation, and every permission except owned pointer lock', async () => {
  const h = await loadMain();
  assert.equal(h.win.loadedUrl, 'http://127.0.0.1:41788/');
  assert.deepEqual(
    plain(h.win.webContents.windowOpenHandler({ url: 'https://example.com/' })),
    { action: 'deny' },
  );

  const blockedNavigation = {
    prevented: false,
    preventDefault() { this.prevented = true; },
  };
  h.win.webContents.emit('will-navigate', blockedNavigation, 'https://example.com/');
  assert.equal(blockedNavigation.prevented, true);
  const canonicalNavigation = {
    prevented: false,
    preventDefault() { this.prevented = true; },
  };
  h.win.webContents.emit('will-navigate', canonicalNavigation, h.win.loadedUrl);
  assert.equal(canonicalNavigation.prevented, false);

  assert.equal(typeof h.security.permissionCheckHandler, 'function');
  assert.equal(typeof h.security.permissionRequestHandler, 'function');
  assert.equal(
    h.security.permissionCheckHandler(h.win.webContents, 'pointerLock', 'http://127.0.0.1:41788', {}),
    true,
  );
  assert.equal(
    h.security.permissionCheckHandler(h.win.webContents, 'pointerLock', 'https://example.com', {}),
    false,
  );
  assert.equal(
    h.security.permissionCheckHandler(h.win.webContents, 'media', 'http://127.0.0.1:41788', {}),
    false,
  );
  assert.equal(
    h.security.permissionCheckHandler({}, 'pointerLock', 'http://127.0.0.1:41788', {}),
    false,
  );

  let requestDecision = null;
  h.security.permissionRequestHandler(
    h.win.webContents,
    'pointerLock',
    (allowed) => { requestDecision = allowed; },
    { requestingUrl: 'http://127.0.0.1:41788/' },
  );
  assert.equal(requestDecision, true);
  h.security.permissionRequestHandler(
    h.win.webContents,
    'notifications',
    (allowed) => { requestDecision = allowed; },
    { requestingUrl: 'http://127.0.0.1:41788/' },
  );
  assert.equal(requestDecision, false);
  assert(h.receipts.some((entry) => entry.status === 'window-open-blocked'));
  assert(h.receipts.some((entry) => entry.status === 'navigation-blocked'));
  assert(h.receipts.some((entry) => entry.status === 'permission-denied'));
});

test('shell starts the local crash reporter with build identity and an owned dumps dir', async () => {
  const h = await loadMain();
  assert.equal(h.crashReporter.starts.length, 1, 'main process starts the crash reporter once at boot');
  const options = h.crashReporter.starts[0];
  assert.equal(options.productName, 'SpaceFace');
  assert.equal(options.uploadToServer, false, 'crash reports stay local — no silent upload');
  assert.equal(options.extra.build, 'test-build', 'report extra carries the resolved build id');
  assert.equal(options.extra.version, '0.0.0-test', 'report extra carries the app version');
  assert.deepEqual(options.extra, options.globalExtra, 'globalExtra mirrors the report identity');
  const crashDumps = h.app.pathSets.find(([name]) => name === 'crashDumps');
  assert.deepEqual(crashDumps, ['crashDumps', path.join(SHELL_TMP, '.electron-userData', 'crashes')],
    'dumps land under the owned userData crashes dir');
});

test('Electron 43 console details and runtime identity remain diagnostic-only receipts', async () => {
  const h = await loadMain();
  h.win.webContents.emit('console-message', { message: 'authored preload failed: timeout' });
  assert.equal(
    h.receipts.find((entry) => entry.status === 'asset-preload-failed')?.details.message,
    'authored preload failed: timeout',
  );
  assert.deepEqual(
    plain(h.receipts.find((entry) => entry.status === 'starting')?.details.runtime),
    {
      electron: '43.2.0',
      chromium: '150.0.7871.129',
      node: '24.18.0',
      v8: '15.0.0',
      packaged: false,
      executablePath: path.join(SHELL_TMP, '.electron-exe'),
      resourcesPath: path.join(ROOT, 'resources'),
      userDataPath: path.join(SHELL_TMP, '.electron-userData'),
    },
  );
});

test('only an isolated evidence process may disable background throttling', async () => {
  const ordinaryEvidence = await loadMain({ isolatedEvidence: true });
  assert.equal(ordinaryEvidence.win.options.webPreferences.backgroundThrottling, true);

  const explicitOverride = await loadMain({
    isolatedEvidence: true,
    allowBackgroundExecution: true,
  });
  assert.equal(explicitOverride.win.options.webPreferences.backgroundThrottling, false);
  assert.equal(
    explicitOverride.receipts.find((entry) => entry.status === 'starting')?.details.evidenceBackgroundOverride,
    true,
  );
});

test('macOS Dock activation recreates a window on the one process-owned server', async () => {
  const h = await loadMain({ platform: 'darwin' });
  const firstUrl = h.win.loadedUrl;
  assert.equal(h.serverStats.created, 1);
  assert.equal(h.serverStats.listens, 1);

  h.win.destroyed = true;
  h.win.webContents.destroyed = true;
  h.app.emit('window-all-closed');
  assert.equal(h.serverStats.quits, 0, 'macOS keeps the application process alive without windows');
  h.app.emit('activate');
  h.app.emit('activate');
  await settle();

  assert.equal(h.windows.length, 2, 'Dock activation creates one replacement window');
  assert.equal(h.windows[1].loadedUrl, firstUrl, 'replacement window preserves the fixed save origin');
  assert.equal(h.serverStats.created, 1, 'replacement window reuses the existing server instance');
  assert.equal(h.serverStats.listens, 1, 'replacement window does not attempt a second fixed-port bind');
});

test('a packaged update Restart waits for a matching durable save and can retry after a refused close', async () => {
  const h = await loadMain({ updateDialogResponse: 0 });
  const download = () => h.updater.emit('update-downloaded', { version: '0.2.0' });
  const reply = (token, result, sender = h.win.webContents) => {
    h.ipcMain.emit('spaceface:quit-prepared', { sender }, token, result);
  };
  download();
  await settle();
  assert.equal(h.updater.installs, 0, 'Restart cannot start NSIS before a save receipt');
  assert.equal(h.quitRequests.length, 1);
  reply(h.quitRequests[0], { ok: true }, {});
  assert.equal(h.updater.installs, 0, 'another renderer cannot release the install');
  reply(h.quitRequests[0], { ok: false, reason: 'exit-save-failed' });
  await settle();
  assert.equal(h.updater.installs, 0);
  assert.equal(h.win.destroyed, false);
  assert.ok(h.dialog.messageCalls.some(({ options }) => options.title === 'Save not finished'));

  download();
  await settle();
  assert.equal(h.quitRequests.length, 2);
  reply(h.quitRequests[0], { ok: true });
  assert.equal(h.updater.installs, 0, 'the refused close token cannot release the retry');
  reply(h.quitRequests[1], { ok: true });
  await settle();
  assert.equal(h.updater.installs, 1);
  assert.equal(h.win.destroyed, true, 'the updater closes using the save it already received');
  assert.equal(h.quitRequests.length, 2, 'the successful restart does not request a second save');
});

test('packaged update Later leaves the normal install-on-quit path armed', async () => {
  const h = await loadMain({ updateDialogResponse: 1 });
  h.updater.emit('update-downloaded', { version: '0.2.0' });
  await settle();
  assert.equal(h.updater.autoInstallOnAppQuit, true);
  assert.equal(h.updater.installs, 0);
  assert.deepEqual(h.quitRequests, []);
  assert.equal(h.win.destroyed, false);
});

test('renderer death during update preparation cancels the installer and keeps recovery active', async () => {
  const h = await loadMain({ updateDialogResponse: 0 });
  h.updater.emit('update-downloaded', { version: '0.2.0' });
  await settle();
  assert.equal(h.quitRequests.length, 1);
  h.win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
  await settle();
  h.ipcMain.emit('spaceface:quit-prepared', { sender: h.win.webContents }, h.quitRequests[0], { ok: true });
  assert.equal(h.updater.installs, 0);
  assert.equal(h.win.destroyed, false);
  assert.ok(h.receipts.some(({ status }) => status === 'renderer-auto-reload'));
});

test('an updater that does not confirm shutdown leaves later normal close save-protected', async () => {
  const h = await loadMain({ updateDialogResponse: 0, updaterWillQuit: false });
  h.updater.emit('update-downloaded', { version: '0.2.0' });
  await settle();
  h.ipcMain.emit('spaceface:quit-prepared', { sender: h.win.webContents }, h.quitRequests[0], { ok: true });
  await settle();
  assert.equal(h.updater.installs, 1);
  h.win.close();
  assert.equal(h.win.destroyed, false);
  assert.equal(h.quitRequests.length, 2, 'a normal close still needs a new save');
  h.ipcMain.emit('spaceface:quit-prepared', { sender: h.win.webContents }, h.quitRequests[1], { ok: true });
  assert.equal(h.win.destroyed, true);
});

test('a second macOS launch focuses a live window or single-flights its replacement', async () => {
  const h = await loadMain({ platform: 'darwin' });
  const firstUrl = h.win.loadedUrl;
  h.win.minimized = true;
  h.app.emit('second-instance');
  assert.equal(h.win.minimized, false, 'an existing minimized player window is restored');
  assert.equal(h.win.focused, true, 'an existing player window receives focus');
  assert.equal(h.windows.length, 1, 'focusing never creates a rival window');

  h.win.destroyed = true;
  h.win.webContents.destroyed = true;
  h.app.emit('window-all-closed');
  h.app.emit('second-instance');
  h.app.emit('second-instance');
  await settle();

  assert.equal(h.windows.length, 2, 'two concurrent relaunch signals create one replacement');
  assert.equal(h.windows[1].loadedUrl, firstUrl, 'replacement preserves the fixed save origin');
  assert.equal(h.serverStats.created, 1, 'relaunch reuses the process-owned game server');
  assert.equal(h.serverStats.listens, 1, 'relaunch never attempts a rival fixed-port bind');
});

test('second Windows launch waits for the existing window to finish loading and painting', async () => {
  const h = await loadMain({ deferFirstPaint: true });
  assert.equal(h.win.isVisible(), false);
  h.app.emit('second-instance');
  h.app.emit('second-instance');
  assert.equal(h.win.focusCount, 0, 'relaunch leaves the unpainted window hidden');
  assert.equal(h.win.isVisible(), false);
  assert.ok(!h.receipts.some(({ status }) => status === 'window-ready'));

  h.win.emit('ready-to-show');
  assert.equal(h.win.isVisible(), true);
  assert.equal(h.win.focusCount, 1, 'queued relaunches focus the ready window once');
  assert.equal(h.windows.length, 1);
  assert.equal(h.serverStats.listens, 1);
  assert.equal(h.receipts.filter(({ status }) => status === 'window-ready').length, 1);
});

test('a hidden shell with an unsettled navigation reaches a terminal startup failure', async () => {
  const h = await loadMain({ hangInitialNavigation: true, allowStartupFailure: true });
  assert.equal(h.win.isVisible(), false);
  assert.deepEqual(h.serverStats.exits, []);
  const startup = h.timers.find((timer) => !timer.cleared && timer.delay === 90_000);
  assert.ok(startup, 'the in-process shell owns the same bound as the launch wrapper');
  startup.callback();
  await settle();
  assert.equal(h.receipts.filter(({ status }) => status === 'startup-failed').length, 1);
  assert.deepEqual(h.serverStats.exits, [1]);
  assert.ok(!h.receipts.some(({ status }) => status === 'window-ready'));
});

test('first window deadline covers absent paint and clears for a ready window', async () => {
  const h = await loadMain({ deferFirstPaint: true, allowStartupFailure: true });
  assert.equal(h.win.isVisible(), false);
  const timer = h.timers.find((row) => row.delay === 90_000);
  assert.ok(timer && !timer.cleared);
  timer.callback();
  await settle();
  h.win.emit('ready-to-show');
  assert.equal(h.win.isVisible(), false, 'a late paint cannot revive abandoned startup');
  assert.equal(h.receipts.filter(({ status }) => status === 'startup-failed').length, 1);
  assert.deepEqual(h.serverStats.exits, [1]);

  const ready = await loadMain();
  assert.equal(ready.win.isVisible(), true);
  assert.ok(ready.timers.find((row) => row.delay === 90_000)?.cleared);
});

test('shutdown never recreates a zero-window application', async () => {
  const h = await loadMain({ platform: 'win32' });
  h.win.destroyed = true;
  h.win.webContents.destroyed = true;
  h.app.emit('window-all-closed');
  assert.equal(h.serverStats.quits, 1, 'non-macOS last-window close begins application shutdown');

  h.app.emit('second-instance');
  h.app.emit('activate');
  await settle();

  assert.equal(h.windows.length, 1, 'shutdown does not construct a replacement window');
  assert.equal(h.serverStats.created, 1, 'shutdown does not create a second game server');
  assert.equal(h.serverStats.listens, 1, 'shutdown does not attempt another fixed-port bind');
});

test('macOS startup and early activation share one server and one in-flight window creation', async () => {
  const h = await loadMain({ platform: 'darwin', activateBeforeServerReady: 2 });
  assert.equal(h.windows.length, 1);
  assert.equal(h.serverStats.created, 1);
  assert.equal(h.serverStats.listens, 1);
  assert.deepEqual(h.serverStats.exits, []);
});

test('a coalesced macOS window failure is classified fatally exactly once', async () => {
  const h = await loadMain({
    platform: 'darwin',
    activateBeforeServerReady: 2,
    failWindowLoads: 1,
    allowStartupFailure: true,
  });
  assert.equal(h.receipts.filter((entry) => entry.status === 'startup-failed').length, 1);
  assert.deepEqual(h.serverStats.exits, [1]);
});

test('a committed canonical reload abort settles startup without hiding real failures', async () => {
  for (const code of ['ERR_ABORTED', -3]) {
    const h = await loadMain({
      windowLoadFailure: { phase: 'after-commit', code },
      allowStartupFailure: true,
    });
    assert.deepEqual(h.serverStats.exits, [], `canonical committed ${code} must not exit`);
    assert.equal(h.receipts.filter((entry) => entry.status === 'navigation-failed').length, 0);
    assert.equal(h.receipts.filter((entry) => entry.status === 'startup-failed').length, 0);
    assert.equal(h.receipts.filter((entry) => entry.status === 'canonical-reload-aborted-after-commit').length, 1);
  }

  const fatalCases = [
    { phase: 'before-commit', code: 'ERR_ABORTED' },
    { phase: 'after-commit', code: 'ERR_FAILED' },
    {
      phase: 'after-commit',
      code: 'ERR_ABORTED',
      currentUrl: 'https://example.invalid/',
    },
    {
      phase: 'after-commit',
      code: 'ERR_ABORTED',
      rejectedUrl: 'https://example.invalid/',
    },
    { phase: 'after-commit', code: 'ERR_ABORTED', destroyWindow: true },
  ];
  for (const windowLoadFailure of fatalCases) {
    const h = await loadMain({ windowLoadFailure, allowStartupFailure: true });
    assert.deepEqual(h.serverStats.exits, [1], JSON.stringify(windowLoadFailure));
    assert.equal(h.receipts.filter((entry) => entry.status === 'navigation-failed').length, 1);
    assert.equal(h.receipts.filter((entry) => entry.status === 'startup-failed').length, 1);
    assert.equal(h.receipts.filter((entry) => entry.status === 'canonical-reload-aborted-after-commit').length, 0);
  }

  const later = await loadMain();
  later.win.webContents.emit(
    'did-fail-load',
    {},
    -3,
    'ERR_ABORTED',
    later.win.loadedUrl,
    true,
  );
  assert.equal(later.receipts.filter((entry) => entry.status === 'navigation-failed').length, 1);
  assert.equal(later.receipts.filter((entry) => entry.status === 'startup-failed').length, 0);
  assert.equal(later.receipts.filter((entry) => entry.status === 'canonical-reload-aborted-after-commit').length, 0);
});

test('desktop retries one pre-commit canonical ERR_FAILED without publishing failure or readiness early', async () => {
  const canonicalUrl = 'http://127.0.0.1:41788/';
  const failure = { phase: 'before-commit', code: 'ERR_FAILED', eventCode: -2 };
  const recovered = await loadMain({
    windowLoadFailure: { ...failure, times: 1 },
    paintBeforeFirstLoadSettles: true,
    allowStartupFailure: true,
  });
  assert.deepEqual(recovered.win.loadRequests, [canonicalUrl, canonicalUrl]);
  assert.equal(recovered.serverStats.listens, 1);
  assert.deepEqual(recovered.serverStats.exits, []);
  assert.equal(recovered.win.visibleBeforeLoadSettled, false);
  assert.equal(recovered.win.isVisible(), true);
  assert.equal(recovered.receipts.filter((entry) => entry.status === 'window-ready').length, 1);
  assert.ok(!recovered.receipts.some((entry) => ['navigation-failed', 'startup-failed'].includes(entry.status)));

  const fatal = await loadMain({
    windowLoadFailure: failure,
    paintBeforeFirstLoadSettles: true,
    allowStartupFailure: true,
  });
  assert.deepEqual(fatal.win.loadRequests, [canonicalUrl, canonicalUrl]);
  assert.deepEqual(fatal.serverStats.exits, [1]);
  assert.equal(fatal.win.isVisible(), false);
  assert.equal(fatal.receipts.filter((entry) => entry.status === 'navigation-failed').length, 1);
  assert.ok(!fatal.receipts.some((entry) => entry.status === 'window-ready'));

  const isolated = await loadMain({ isolatedEvidence: true, windowLoadFailure: failure, allowStartupFailure: true });
  assert.deepEqual(isolated.win.loadRequests, ['http://127.0.0.1:41991/']);
  assert.deepEqual(isolated.serverStats.exits, [1]);
  const foreign = await loadMain({
    windowLoadFailure: { ...failure, rejectedUrl: 'https://example.invalid/' },
    allowStartupFailure: true,
  });
  assert.deepEqual(foreign.win.loadRequests, [canonicalUrl]);
  assert.deepEqual(foreign.serverStats.exits, [1]);
});

test('window hide, minimize, focus, and blur publish normalized lifecycle states', async () => {
  const h = await loadMain();
  h.commands.length = 0;
  h.win.show();
  h.win.focus();
  h.win.blur();
  h.win.hide();
  h.win.show();
  h.win.minimize();

  const byReason = new Map(h.commands.map((command) => [command.reason, command.state]));
  assert.equal(byReason.get('focus'), 'foreground-visible');
  assert.equal(byReason.get('blur'), 'foreground-occluded');
  assert.equal(byReason.get('hide'), 'hidden-or-minimized');
  assert.equal(byReason.get('minimize'), 'hidden-or-minimized');
  for (let index = 1; index < h.commands.length; index++) {
    assert.ok(h.commands[index].sequence > h.commands[index - 1].sequence);
  }
});

test('the ready window publishes its actual visibility when the native show event is absent', async () => {
  const h = await loadMain({ deferFirstPaint: true, omitShowEvent: true });
  assert.equal(h.commands.at(-1)?.state, 'hidden-or-minimized');
  h.win.emit('ready-to-show');
  assert.equal(h.win.isVisible(), true);
  assert.equal(h.commands.at(-1)?.state, 'foreground-occluded');
});

test('power suspend and screen lock publish system suspension through one listener set', async () => {
  const h = await loadMain();
  h.win.show();
  h.win.focus();
  h.commands.length = 0;

  for (const event of ['suspend', 'resume', 'lock-screen', 'unlock-screen']) {
    assert.equal(h.powerMonitor.listenerCount(event), 1);
    h.powerMonitor.emit(event);
  }

  assert.deepEqual(
    h.commands.map((command) => [command.reason, command.state]),
    [
      ['suspend', 'system-suspended'],
      ['resume', 'foreground-visible'],
      ['lock-screen', 'system-suspended'],
      ['unlock-screen', 'foreground-visible'],
    ],
  );
});

test('main accepts only the documented quit send channel and invoke IPC set', async () => {
  const h = await loadMain();
  assert.equal(h.ipcMain.listenerCount('spaceface:quit'), 1);
  assert.equal(h.ipcMain.listenerCount('spaceface:shell-lifecycle'), 0);
  assert.deepEqual([...h.ipcHandlers.keys()].sort(), [
    'spaceface:achievement-unlock',
    'spaceface:build-info',
    'spaceface:perf-metrics',
    'spaceface:save-clip',
    'spaceface:steam-status',
    'spaceface:window-mode-get',
    'spaceface:window-mode-set',
    'spaceface:workshop-publish',
    'spaceface:workshop-status',
    'spaceface:workshop-sync',
  ]);

  h.ipcMain.emit('spaceface:shell-lifecycle');
  assert.equal(h.serverStats.quits, 0);
  h.ipcMain.emit('spaceface:quit');
  assert.equal(h.serverStats.quits, 1);
  h.ipcMain.emit('spaceface:quit-extra');
  assert.equal(h.serverStats.quits, 1);

  // save-clip rejects a non-clip basename before any dialog or disk write.
  const rejected = await h.ipcMain.invokeHandler('spaceface:save-clip', {}, {
    filename: 'notes.txt', bytesB64: 'QUJD',
  });
  assert.equal(rejected.ok, false);
  assert.equal(h.dialog.saveCalls.length, 0);
  const info = await h.ipcMain.invokeHandler('spaceface:build-info', {});
  assert.deepEqual(info, { version: '0.0.0-test', build: 'test-build', packaged: false, channel: 'dev' });
  const unlock = await h.ipcMain.invokeHandler('spaceface:achievement-unlock', {}, { id: 'ace_pilot' });
  assert.deepEqual(unlock, { ok: false, available: false, reason: 'test-no-steam', id: 'ace_pilot' });
  const status = await h.ipcMain.invokeHandler('spaceface:steam-status', {});
  assert.deepEqual(status, {
    available: false, reason: 'test-no-steam', distribution: 'direct', achievements: 0, cloud: null,
  });

  // Workshop channels route to the one bridge with the shell-resolved directory; only a mod id crosses.
  assert.equal(h.workshop.created, 1);
  assert.equal(typeof h.workshop.userContentDir, 'function');
  assert.equal(h.workshop.userContentDir(), null);
  const workshopStatus = await h.ipcMain.invokeHandler('spaceface:workshop-status', {});
  assert.deepEqual(workshopStatus, { available: false, reason: 'test-no-steam', items: 0 });
  const workshopPublish = await h.ipcMain.invokeHandler('spaceface:workshop-publish', {}, { modId: 'content-pack.01' });
  assert.deepEqual(workshopPublish, { ok: false, available: false, reason: 'test-no-steam', modId: 'content-pack.01' });
  const workshopSync = await h.ipcMain.invokeHandler('spaceface:workshop-sync', {});
  assert.deepEqual(workshopSync, { ok: false, available: false, reason: 'test-no-steam', synced: 0 });
  assert.deepEqual(h.workshop.publishes, [{ modId: 'content-pack.01' }]);
  assert.equal(h.workshop.statusCalls, 1);
  assert.equal(h.workshop.syncCalls, 1);
});

test('preload exposes one monotonic one-way subscription and replays the latest command', () => {
  const h = loadPreload();
  assert.deepEqual([...h.exposed.keys()], ['spacefaceLifecycle', 'spacefaceShell', 'spacefaceQuit']);
  assert.deepEqual([...h.ipcListeners.keys()], [CHANNEL, 'spaceface:prepare-quit']);
  const lifecycle = h.exposed.get('spacefaceLifecycle');
  assert.deepEqual(Object.keys(lifecycle), ['subscribe', 'quit']);
  assert.deepEqual(
    Object.keys(h.exposed.get('spacefaceShell')),
    ['quit', 'onPrepareQuit', 'saveClip', 'buildInfo', 'unlockAchievement', 'steamStatus', 'workshopStatus', 'workshopPublish', 'workshopSync', 'perfMetrics', 'getWindowMode', 'setWindowMode'],
  );
  assert.equal(typeof h.exposed.get('spacefaceQuit'), 'function');

  h.emit({ state: 'hidden-or-minimized', sequence: 4, reason: 'hide' });
  h.emit({ state: 'foreground-visible', sequence: 3, reason: 'focus' });
  h.emit({ state: 'not-allowed', sequence: 5, reason: 'show' });
  const received = [];
  const unsubscribe = lifecycle.subscribe((command) => received.push(plain(command)));
  assert.deepEqual(received, [
    { state: 'hidden-or-minimized', sequence: 4, reason: 'hide' },
  ]);

  h.emit({ state: 'foreground-visible', sequence: 5, reason: 'show' });
  h.emit({ state: 'foreground-occluded', sequence: 5, reason: 'blur' });
  assert.deepEqual(received[1], { state: 'foreground-visible', sequence: 5, reason: 'show' });
  assert.equal(received.length, 2);
  unsubscribe();
  h.emit({ state: 'foreground-occluded', sequence: 6, reason: 'blur' });
  assert.equal(received.length, 2);
  assert.equal(h.outboundCalls(), 0);

  lifecycle.quit();
  h.exposed.get('spacefaceShell').quit();
  h.exposed.get('spacefaceQuit')();
  assert.deepEqual(h.outboundChannels(), ['spaceface:quit', 'spaceface:quit', 'spaceface:quit']);

  // The remaining bridge methods each invoke exactly their own allowlisted channel; the
  // achievement id is wrapped to { id } and truncated at 64 chars before it crosses.
  const shell = h.exposed.get('spacefaceShell');
  shell.saveClip({ filename: 'clip.gif', bytesB64: 'QUJD' });
  shell.buildInfo();
  shell.unlockAchievement('x'.repeat(80));
  shell.steamStatus();
  shell.workshopStatus();
  shell.workshopPublish('pack.' + 'x'.repeat(90));
  shell.workshopSync();
  assert.deepEqual(h.invocations(), [
    ['spaceface:save-clip', { filename: 'clip.gif', bytesB64: 'QUJD' }],
    ['spaceface:build-info', undefined],
    ['spaceface:achievement-unlock', { id: 'x'.repeat(64) }],
    ['spaceface:steam-status', undefined],
    ['spaceface:workshop-status', undefined],
    ['spaceface:workshop-publish', { modId: ('pack.' + 'x'.repeat(90)).slice(0, 80) }],
    ['spaceface:workshop-sync', undefined],
  ]);
});
