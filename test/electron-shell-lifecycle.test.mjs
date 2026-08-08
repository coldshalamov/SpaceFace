import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAIN_PATH = path.join(ROOT, 'electron', 'main.cjs');
const PRELOAD_PATH = path.join(ROOT, 'electron', 'preload.cjs');
const CHANNEL = 'spaceface:shell-lifecycle';

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
  allowStartupFailure = false,
} = {}) {
  const windows = [];
  const commands = [];
  const receipts = [];
  const pendingServerListens = [];
  const serverStats = { created: 0, listens: 0, quits: 0, exits: [] };
  const security = {
    permissionCheckHandler: null,
    permissionRequestHandler: null,
  };
  const powerMonitor = emitter();
  const app = emitter({
    isPackaged: false,
    commandLine: { appendSwitch() {} },
    getPath(name) { return path.join(ROOT, `.electron-${name}`); },
    setPath() {},
    requestSingleInstanceLock() { return true; },
    whenReady() { return Promise.resolve(); },
    quit() { serverStats.quits += 1; this.emit('before-quit'); },
    exit(code) {
      serverStats.exits.push(code);
      if (!allowStartupFailure) throw new Error(`unexpected app.exit(${code})`);
    },
  });

  function FakeBrowserWindow(options) {
    const webContents = emitter({
      destroyed: false,
      windowOpenHandler: null,
      session: {
        setPermissionCheckHandler(handler) { security.permissionCheckHandler = handler; },
        setPermissionRequestHandler(handler) { security.permissionRequestHandler = handler; },
      },
      isDestroyed() { return this.destroyed; },
      setWindowOpenHandler(handler) { this.windowOpenHandler = handler; },
      send(channel, command) {
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
      destroyed: false,
      removeMenu() {},
      isDestroyed() { return this.destroyed; },
      isVisible() { return this.visible; },
      isMinimized() { return this.minimized; },
      isFocused() { return this.focused; },
      show() { this.visible = true; this.emit('show'); },
      hide() { this.visible = false; this.focused = false; this.emit('hide'); },
      minimize() { this.minimized = true; this.emit('minimize'); },
      restore() { this.minimized = false; this.visible = true; this.emit('restore'); },
      focus() { this.visible = true; this.focused = true; this.emit('focus'); },
      blur() { this.focused = false; this.emit('blur'); },
      async loadURL(url) {
        this.loadedUrl = url;
        if (failWindowLoads > 0) {
          failWindowLoads -= 1;
          throw new Error('injected window load failure');
        }
        webContents.emit('did-finish-load');
      },
    });
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
    URL,
    module: { exports: {} },
    exports: {},
    process: {
      env: allowBackgroundExecution
        ? { SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION: '1' }
        : {},
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
      if (specifier === 'electron') return { app, BrowserWindow: FakeBrowserWindow, powerMonitor };
      if (specifier === 'http') return { get() { throw new Error('unexpected HTTP probe'); } };
      if (specifier === 'path') return path;
      if (specifier === '../scripts/lib/gameServer.cjs') return { createGameServer };
      if (specifier === '../scripts/lib/electronLaunchProtocol.cjs') {
        return {
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
  return { app, powerMonitor, win: windows[0], windows, commands, receipts, security, serverStats };
}

function loadPreload() {
  const ipcListeners = new Map();
  const exposed = new Map();
  let outboundCalls = 0;
  const contextBridge = {
    exposeInMainWorld(name, value) { exposed.set(name, value); },
  };
  const ipcRenderer = {
    on(channel, listener) {
      if (!ipcListeners.has(channel)) ipcListeners.set(channel, new Set());
      ipcListeners.get(channel).add(listener);
    },
    send() { outboundCalls++; },
    invoke() { outboundCalls++; },
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
    emit(command) {
      for (const listener of [...(ipcListeners.get(CHANNEL) || [])]) listener({}, command);
    },
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('normal player window restores Chromium background throttling', async () => {
  const h = await loadMain({ allowBackgroundExecution: true });
  assert.equal(h.win.options.webPreferences.contextIsolation, true);
  assert.equal(h.win.options.webPreferences.nodeIntegration, false);
  assert.equal(h.win.options.webPreferences.sandbox, true);
  assert.equal(h.win.options.webPreferences.webSecurity, true);
  assert.equal(h.win.options.webPreferences.allowRunningInsecureContent, false);
  assert.equal(h.win.options.webPreferences.experimentalFeatures, false);
  assert.equal(h.win.options.webPreferences.backgroundThrottling, true,
    'the evidence env var alone must not disable player throttling');
  assert.equal(h.win.options.webPreferences.preload, PRELOAD_PATH);
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
      executablePath: path.join(ROOT, '.electron-exe'),
      resourcesPath: path.join(ROOT, 'resources'),
      userDataPath: path.join(ROOT, '.electron-userData'),
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

test('preload exposes one monotonic one-way subscription and replays the latest command', () => {
  const h = loadPreload();
  assert.deepEqual([...h.exposed.keys()], ['spacefaceLifecycle']);
  assert.deepEqual([...h.ipcListeners.keys()], [CHANNEL]);
  const lifecycle = h.exposed.get('spacefaceLifecycle');
  assert.deepEqual(Object.keys(lifecycle), ['subscribe']);

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
});
