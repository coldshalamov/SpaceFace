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

async function loadMain({ isolatedEvidence = false, allowBackgroundExecution = false } = {}) {
  const windows = [];
  const commands = [];
  const receipts = [];
  const powerMonitor = emitter();
  const app = emitter({
    isPackaged: false,
    commandLine: { appendSwitch() {} },
    setPath() {},
    requestSingleInstanceLock() { return true; },
    whenReady() { return Promise.resolve(); },
    quit() {},
    exit(code) { throw new Error(`unexpected app.exit(${code})`); },
  });

  function FakeBrowserWindow(options) {
    const webContents = emitter({
      destroyed: false,
      isDestroyed() { return this.destroyed; },
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
      async loadURL() { webContents.emit('did-finish-load'); },
    });
    windows.push(win);
    return win;
  }
  FakeBrowserWindow.getAllWindows = () => windows.filter((win) => !win.destroyed);

  function createGameServer() {
    return emitter({
      listen(port, _host, callback) { this.port = port; callback(); },
      address() { return { port: this.port }; },
      close(callback) { callback(); },
    });
  }

  const sandbox = {
    __dirname: path.join(ROOT, 'electron'),
    console,
    module: { exports: {} },
    exports: {},
    process: {
      env: allowBackgroundExecution
        ? { SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION: '1' }
        : {},
      platform: 'win32',
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
          isAssetPreloadFailureMessage() { return false; },
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
  await settle();
  assert.equal(windows.length, 1);
  return { app, powerMonitor, win: windows[0], windows, commands, receipts };
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
  assert.equal(h.win.options.webPreferences.backgroundThrottling, true,
    'the evidence env var alone must not disable player throttling');
  assert.equal(h.win.options.webPreferences.preload, PRELOAD_PATH);
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
