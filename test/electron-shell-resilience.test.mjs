// Desktop shell resilience: a double-clicked build never silently vanishes or sits on a blank
// window. Drives electron/main.cjs inside a vm sandbox with mocked electron (app, dialog,
// BrowserWindow, webContents), a fake clock and fake timers. Electron itself is never launched.
//   1. startup failure (taken port, failed page load, any createWindow throw) shows an error box
//      that names the crash report BEFORE the process exits; the uncaught-exception path shows one.
//   2. a dead renderer reloads once (bounded), then asks Reload / Quit; a hung one asks Wait / Reload.
//   3. a fresh renderer/GPU crash report (or --safe-graphics) drops the three forced GPU switches.
import assert from 'node:assert/strict';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAIN_PATH = path.join(ROOT, 'electron', 'main.cjs');
const realRequire = createRequire(MAIN_PATH);

const EPOCH = Date.parse('2026-10-22T12:00:00.000Z');
const MIN = 60 * 1000;
const FORCED_GPU_SWITCHES = ['ignore-gpu-blocklist', 'enable-zero-copy', 'force_high_performance_gpu'];

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

async function settle(rounds = 6) {
  for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

function makeFakeDate(clock) {
  return class FakeDate extends Date {
    constructor(...args) {
      if (args.length) super(...args);
      else super(clock.now);
    }

    static now() { return clock.now; }
  };
}

function reportEvent(processType, reason = 'crashed') {
  return { processType, reason, exitCode: 1 };
}

function seedReport(reportsDir, name, { event, writtenAt, schema = 'spaceface.crashReport.v1' }) {
  mkdirSync(reportsDir, { recursive: true });
  const body = { schema, version: '0.0.0', build: 'seeded', event };
  if (writtenAt !== undefined) body.writtenAt = new Date(writtenAt).toISOString();
  const file = path.join(reportsDir, name);
  writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  return file;
}

async function loadShell({
  isolatedEvidence = false,
  argv,
  listenError = null,
  probe = 'spaceface',
  loadFailures = [],
  dialogResponses = [],
  showErrorBoxThrows = false,
  noDialog = false,
  seed = null,
} = {}) {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'sf-resilience-'));
  const paths = {
    userData: path.join(tmpRoot, 'userData'),
    exe: path.join(tmpRoot, 'electron.exe'),
  };
  const clock = { now: EPOCH };
  const events = [];
  const receipts = [];
  const logs = [];
  const switches = [];
  const timers = [];
  const windows = [];
  const exits = [];
  const quits = { count: 0 };
  const pendingLoadFailures = [...loadFailures];

  if (seed) seed({ reportsDir: path.join(paths.userData, 'crashes', 'reports'), clock });

  const dialog = {
    errorBoxes: [],
    messageBoxes: [],
    responses: [...dialogResponses],
    showErrorBox(title, content) {
      events.push('showErrorBox');
      this.errorBoxes.push({ title, content });
      if (showErrorBoxThrows) throw new Error('native dialog failed');
    },
    async showMessageBox(...args) {
      const options = args[args.length - 1];
      events.push('showMessageBox');
      this.messageBoxes.push({ options, parented: args.length > 1 });
      const response = this.responses.length ? this.responses.shift() : 0;
      return { response, checkboxChecked: false };
    },
  };

  const processEvents = emitter({
    env: { SPACEFACE_BUILD_HASH: 'cafe1234beef' },
    platform: 'win32',
    execPath: paths.exe,
    resourcesPath: path.join(tmpRoot, 'resources'),
    versions: { electron: '43.2.0', chrome: '150.0.0', node: '24.18.0', v8: '15.0.0' },
    pid: 4242,
    uptime() { return 12; },
    exit(code) { events.push('process.exit'); this.exitCodes.push(code); },
    exitCodes: [],
  });
  if (argv) processEvents.argv = argv;

  const powerMonitor = emitter();
  const ipcMain = emitter({ handle() {} });
  const crashReporter = { start() {} };
  const app = emitter({
    isPackaged: false,
    commandLine: { appendSwitch(name) { switches.push(name); } },
    getVersion() { return '0.0.0-test'; },
    getPath(name) { return paths[name] || path.join(tmpRoot, `.electron-${name}`); },
    setPath(name, value) { paths[name] = value; },
    requestSingleInstanceLock() { return true; },
    whenReady() { return Promise.resolve(); },
    quit() { quits.count += 1; events.push('app.quit'); this.emit('before-quit'); },
    exit(code) { events.push('app.exit'); exits.push(code); },
  });

  function FakeBrowserWindow(options) {
    const webContents = emitter({
      destroyed: false,
      session: { setPermissionCheckHandler() {}, setPermissionRequestHandler() {} },
      forcefulKills: 0,
      isDestroyed() { return this.destroyed; },
      getURL() { return this.url || 'about:blank'; },
      setWindowOpenHandler() {},
      send() {},
      forcefullyCrashRenderer() { this.forcefulKills += 1; events.push('forcefullyCrashRenderer'); },
    });
    const win = emitter({
      options,
      webContents,
      loads: [],
      destroyed: false,
      visible: false,
      minimized: false,
      focused: false,
      fullscreen: options?.fullscreen === true,
      isFullScreen() { return this.fullscreen; },
      setFullScreen(value) { this.fullscreen = !!value; },
      removeMenu() {},
      isDestroyed() { return this.destroyed; },
      isVisible() { return this.visible; },
      isMinimized() { return this.minimized; },
      isFocused() { return this.focused; },
      show() { this.visible = true; },
      hide() { this.visible = false; },
      async loadURL(url) {
        events.push('loadURL');
        this.loads.push(url);
        webContents.url = url;
        const failure = pendingLoadFailures.shift();
        if (failure) throw failure;
        webContents.emit('did-finish-load');
      },
    });
    // Electron exposes loadURL on both the window and its webContents; the shell reloads through the latter.
    webContents.loadURL = (url) => win.loadURL(url);
    windows.push(win);
    return win;
  }
  FakeBrowserWindow.getAllWindows = () => windows.filter((win) => !win.destroyed);

  const electronApi = { app, BrowserWindow: FakeBrowserWindow, powerMonitor, ipcMain, crashReporter };
  if (!noDialog) electronApi.dialog = dialog;

  const sandbox = {
    __dirname: path.join(ROOT, 'electron'),
    console: { ...console, log: (...args) => logs.push(args.join(' ')), error() {} },
    URL,
    Date: makeFakeDate(clock),
    setTimeout(fn, ms) {
      const timer = { fn, ms, cleared: false, unref() {} };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) { if (timer) timer.cleared = true; },
    module: { exports: {} },
    exports: {},
    process: processEvents,
    require(specifier) {
      if (specifier === 'electron') return electronApi;
      if (specifier === '../scripts/lib/gameServer.cjs') {
        return {
          createGameServer() {
            return emitter({
              listen(port, _host, callback) {
                this.port = port;
                if (listenError) {
                  setImmediate(() => this.emit('error', Object.assign(new Error(`listen ${listenError} 127.0.0.1:${port}`), { code: listenError })));
                  return;
                }
                callback();
              },
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
      if (specifier === '../scripts/lib/electronLaunchProtocol.cjs') {
        return {
          appendLaunchReceipt(_receiptPath, status, details) { receipts.push({ status, details }); },
          isAllowedElectronListenerPort() { return true; },
          isAssetPreloadFailureMessage() { return false; },
          async probeSpaceFacePort() {
            if (probe === 'throws') throw new Error('probe exploded');
            return probe === 'spaceface';
          },
          resolveElectronLaunchConfig() {
            return {
              isolatedEvidence,
              port: isolatedEvidence ? 41991 : 41788,
              userDataDir: paths.userData,
              lockNamespace: isolatedEvidence ? 'evidence' : 'player',
            };
          },
          resolveWebRoot({ projectRoot }) { return projectRoot; },
        };
      }
      // Real builtins and the electron/*.cjs neighbours load for real (crash reports genuinely
      // land under the temp userData dir).
      return realRequire(specifier);
    },
  };

  vm.runInNewContext(readFileSync(MAIN_PATH, 'utf8'), sandbox, { filename: MAIN_PATH });
  await settle();
  return {
    app, dialog, events, exits, logs, paths, powerMonitor, processEvents, quits, receipts, switches,
    timers, tmpRoot, windows, clock,
    win: windows[0],
    exports: sandbox.module.exports,
    reportsDir: path.join(paths.crashDumps || path.join(paths.userData, 'crashes'), 'reports'),
    cleanup() { rmSync(tmpRoot, { recursive: true, force: true }); },
  };
}

// ── 1. A failed start is seen, not silent ─────────────────────────────────────────────────────

test('a taken port shows a plain error box that names the crash report, before the app exits', async () => {
  const h = await loadShell({ listenError: 'EADDRINUSE', probe: 'spaceface' });
  try {
    assert.equal(h.dialog.errorBoxes.length, 1, 'exactly one error box');
    const { title, content } = h.dialog.errorBoxes[0];
    assert.equal(title, 'SpaceFace could not start');
    assert.match(content, /Another copy of SpaceFace, or another program/);
    assert.match(content, /port 41788/);
    assert.match(content, /Close it and try again/);
    assert.ok(h.events.indexOf('showErrorBox') >= 0 && h.events.indexOf('showErrorBox') < h.events.indexOf('app.exit'),
      `box before exit, got ${h.events.join(',')}`);
    assert.deepEqual(h.exits, [1]);
    assert.equal(h.windows.length, 0, 'no window was ever created');

    const reportPath = /A crash report was saved to:\n(.+)$/m.exec(content)?.[1];
    assert.ok(reportPath, 'the box names the report file');
    assert.ok(existsSync(reportPath), 'the named report exists on disk');
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    assert.equal(report.schema, 'spaceface.crashReport.v1');
    assert.equal(report.event.processType, 'main');
    assert.equal(report.event.reason, 'startup-failed');
    assert.equal(report.event.code, 'EADDRINUSE');
    assert.match(report.writtenAt, /^2026-10-22T12:00:00\.000Z$/, 'reports carry their write time');
    assert.ok(h.receipts.some((entry) => entry.status === 'port-conflict' && entry.details.owner === 'spaceface'));
  } finally {
    h.cleanup();
  }
});

test('a port probe that throws still settles the bind: the player gets the box, not a silent hang', async () => {
  const h = await loadShell({ listenError: 'EADDRINUSE', probe: 'throws' });
  try {
    assert.equal(h.dialog.errorBoxes.length, 1);
    assert.match(h.dialog.errorBoxes[0].content, /Another copy of SpaceFace/);
    assert.deepEqual(h.exits, [1]);
    const conflict = h.receipts.find((entry) => entry.status === 'port-conflict');
    assert.equal(conflict.details.owner, 'unknown');
  } finally {
    h.cleanup();
  }
});

test('a failed page load shows the box with the cause and exits', async () => {
  const failure = Object.assign(new Error('net::ERR_CONNECTION_REFUSED loading the game'), { code: 'ERR_CONNECTION_REFUSED' });
  const h = await loadShell({ loadFailures: [failure] });
  try {
    assert.equal(h.dialog.errorBoxes.length, 1);
    const { title, content } = h.dialog.errorBoxes[0];
    assert.equal(title, 'SpaceFace could not start');
    assert.match(content, /The game window could not be opened\./);
    assert.match(content, /ERR_CONNECTION_REFUSED loading the game/);
    assert.match(content, /A crash report was saved to:/);
    assert.ok(h.events.indexOf('showErrorBox') < h.events.indexOf('app.exit'));
    assert.deepEqual(h.exits, [1]);
  } finally {
    h.cleanup();
  }
});

test('a dialog that cannot be shown never stops the exit', async () => {
  const failure = new Error('boom');
  const throwing = await loadShell({ loadFailures: [failure], showErrorBoxThrows: true });
  try {
    assert.deepEqual(throwing.exits, [1], 'a throwing native box still ends in app.exit');
  } finally {
    throwing.cleanup();
  }
  const missing = await loadShell({ loadFailures: [failure], noDialog: true });
  try {
    assert.deepEqual(missing.exits, [1], 'no dialog module at all still ends in app.exit');
  } finally {
    missing.cleanup();
  }
});

test('isolated evidence never raises a blocking box or recovers over a crash', async () => {
  const failed = await loadShell({ isolatedEvidence: true, loadFailures: [new Error('probe load failed')] });
  try {
    assert.equal(failed.dialog.errorBoxes.length, 0, 'an unattended probe must not hang on a modal box');
    assert.deepEqual(failed.exits, [1]);
  } finally {
    failed.cleanup();
  }
  const live = await loadShell({ isolatedEvidence: true });
  try {
    assert.equal(live.win.loads.length, 1);
    live.win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
    live.win.webContents.emit('unresponsive');
    await settle();
    assert.equal(live.win.loads.length, 1, 'a probe sees the crash instead of an automatic reload');
    assert.equal(live.dialog.messageBoxes.length, 0);
    assert.equal(live.timers.length, 0);
  } finally {
    live.cleanup();
  }
});

test('an uncaught main-process exception shows one error box before the process exits', async () => {
  const h = await loadShell();
  try {
    h.processEvents.emit('uncaughtException', new Error('kaboom in the main process'));
    assert.equal(h.dialog.errorBoxes.length, 1);
    const { title, content } = h.dialog.errorBoxes[0];
    assert.equal(title, 'SpaceFace has stopped');
    assert.match(content, /unexpected problem and has to close/);
    assert.match(content, /kaboom in the main process/);
    const reportPath = /A crash report was saved to:\n(.+)$/m.exec(content)?.[1];
    assert.ok(reportPath && existsSync(reportPath), 'the box names a report that exists');
    assert.equal(JSON.parse(readFileSync(reportPath, 'utf8')).event.reason, 'uncaughtException');
    assert.deepEqual(h.events.filter((name) => name === 'showErrorBox' || name === 'process.exit'),
      ['showErrorBox', 'process.exit']);
    assert.deepEqual(h.processEvents.exitCodes, [1]);

    h.processEvents.emit('uncaughtException', new Error('a second fault while dying'));
    assert.equal(h.dialog.errorBoxes.length, 1, 'never a second stacked box');
    assert.deepEqual(h.processEvents.exitCodes, [1, 1], 'still exits every time');
  } finally {
    h.cleanup();
  }
});

test('a fault while the player is already quitting exits without a box', async () => {
  const h = await loadShell();
  try {
    h.app.quit();
    h.processEvents.emit('uncaughtException', new Error('late fault during shutdown'));
    assert.equal(h.dialog.errorBoxes.length, 0);
    assert.deepEqual(h.processEvents.exitCodes, [1]);
  } finally {
    h.cleanup();
  }
});

test('failure copy: plain cause, no internal ids, report location or folder', async () => {
  const h = await loadShell();
  try {
    const { describeStartupFailure, describeUnexpectedFailure } = h.exports;
    const bundle = describeStartupFailure(Object.assign(new Error('missing index'), { code: 'SPACEFACE_PACKAGED_BUNDLE_MISSING' }),
      { reportDir: 'C:\\Users\\p\\crashes\\reports' });
    assert.match(bundle.message, /game files are missing or incomplete/);
    assert.match(bundle.message, /Crash reports are kept in:\nC:\\Users\\p\\crashes\\reports/);
    assert.doesNotMatch(bundle.message, /SPACEFACE_PACKAGED_BUNDLE_MISSING/);
    const noReport = describeUnexpectedFailure(new Error('x'));
    assert.doesNotMatch(noReport.message, /crash report/i, 'no promise of a report that was not written');
    const long = describeStartupFailure(new Error(`${'a'.repeat(900)}\nsecond line`), {});
    assert.ok(long.message.length < 600, 'a huge message is cut to one short line');
    assert.doesNotMatch(long.message, /second line/);
  } finally {
    h.cleanup();
  }
});

// ── 2. A dead or hung renderer is recovered, boundedly ────────────────────────────────────────

test('a dead renderer reloads once, then asks Reload / Quit instead of looping', async () => {
  const h = await loadShell({ dialogResponses: [0, 1] });
  try {
    const { win } = h;
    assert.equal(win.loads.length, 1);
    assert.equal(win.loads[0], 'http://127.0.0.1:41788/');

    win.webContents.emit('render-process-gone', {}, { reason: 'clean-exit', exitCode: 0 });
    await settle();
    assert.equal(win.loads.length, 1, 'a clean exit is not a crash');

    win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 3 });
    await settle();
    assert.equal(win.loads.length, 2, 'first death: one automatic reload of the canonical game URL');
    assert.equal(win.loads[1], 'http://127.0.0.1:41788/');
    assert.equal(h.dialog.messageBoxes.length, 0, 'no dialog yet');
    assert.ok(h.receipts.some((entry) => entry.status === 'renderer-auto-reload'));

    h.clock.now += 30 * 1000;
    win.webContents.emit('render-process-gone', {}, { reason: 'oom', exitCode: 9 });
    await settle();
    assert.equal(h.dialog.messageBoxes.length, 1, 'second death inside the window: ask the player');
    const asked = h.dialog.messageBoxes[0];
    assert.deepEqual([...asked.options.buttons], ['Reload', 'Quit']);
    assert.equal(asked.parented, true, 'the box belongs to the game window');
    assert.equal(win.loads.length, 3, 'Reload (the default answer) loads the game again');

    h.clock.now += 20 * 1000;
    win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 3 });
    await settle();
    assert.equal(h.dialog.messageBoxes.length, 2);
    assert.equal(h.quits.count, 1, 'Quit leaves the app');
    assert.equal(win.loads.length, 3, 'and does not reload');
  } finally {
    h.cleanup();
  }
});

test('the automatic reload budget comes back after two minutes', async () => {
  const h = await loadShell();
  try {
    const { win } = h;
    win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
    h.clock.now += 2 * MIN + 1;
    win.webContents.emit('render-process-gone', {}, { reason: 'killed', exitCode: 1 });
    await settle();
    assert.equal(win.loads.length, 3, 'two quiet minutes later a new death reloads again');
    assert.equal(h.dialog.messageBoxes.length, 0);
  } finally {
    h.cleanup();
  }
});

test('a dead renderer during shutdown is left alone', async () => {
  const h = await loadShell();
  try {
    h.app.quit();
    h.win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
    await settle();
    assert.equal(h.win.loads.length, 1);
    assert.equal(h.dialog.messageBoxes.length, 0);
  } finally {
    h.cleanup();
  }
});

test('a hung renderer is offered Wait / Reload after 15 s, and Reload restarts it without spending the crash budget', async () => {
  const h = await loadShell({ dialogResponses: [0, 1] });
  try {
    const { win } = h;
    win.webContents.emit('unresponsive');
    assert.equal(h.timers.length, 1);
    assert.equal(h.timers[0].ms, 15 * 1000);

    win.webContents.emit('responsive');
    assert.equal(h.timers[0].cleared, true, 'recovering on its own cancels the prompt');

    win.webContents.emit('unresponsive');
    assert.equal(h.timers.length, 2);
    h.timers[1].fn();
    await settle();
    assert.equal(h.dialog.messageBoxes.length, 1);
    const asked = h.dialog.messageBoxes[0].options;
    assert.deepEqual([...asked.buttons], ['Wait', 'Reload']);
    assert.match(asked.message, /not responding/);
    assert.equal(win.loads.length, 1, 'Wait changes nothing');
    assert.equal(h.timers.length, 3, 'still hung after Wait: ask again later');
    assert.ok(h.timers[2].ms > 15 * 1000);

    h.timers[2].fn();
    await settle();
    assert.equal(h.dialog.messageBoxes.length, 2);
    assert.equal(win.webContents.forcefulKills, 1, 'Reload ends the stuck renderer first');
    assert.equal(win.loads.length, 2);
    assert.ok(h.events.lastIndexOf('forcefullyCrashRenderer') < h.events.lastIndexOf('loadURL'));

    // The renderer we ended on purpose reports in as gone: that is the reload already under way.
    win.webContents.emit('render-process-gone', {}, { reason: 'killed', exitCode: 1 });
    await settle();
    assert.equal(win.loads.length, 2, 'no second reload');
    assert.equal(h.dialog.messageBoxes.length, 2, 'no crash dialog');
    // ...and it did not consume the crash budget: the next real death still reloads automatically.
    win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
    await settle();
    assert.equal(win.loads.length, 3);
    assert.equal(h.dialog.messageBoxes.length, 2);
  } finally {
    h.cleanup();
  }
});

test('a machine waking from sleep is not asked about a hang', async () => {
  const h = await loadShell();
  try {
    h.powerMonitor.emit('suspend');
    h.win.webContents.emit('unresponsive');
    h.timers[0].fn();
    await settle();
    assert.equal(h.dialog.messageBoxes.length, 0);
    assert.equal(h.timers.length, 2, 'asks again after the grace period instead');
    h.powerMonitor.emit('resume');
    h.timers[1].fn();
    await settle();
    assert.equal(h.dialog.messageBoxes.length, 1);
  } finally {
    h.cleanup();
  }
});

test('recovery unit: unarmed, destroyed, failed reloads and a missing dialog are all safe', async () => {
  const h = await loadShell();
  try {
    const { createRendererRecovery } = h.exports;
    const make = (extra = {}) => {
      const loads = [];
      const boxes = [];
      const receiptLog = [];
      let clockNow = EPOCH;
      const contents = emitter({
        destroyed: false,
        isDestroyed() { return this.destroyed; },
        loadURL(url) {
          loads.push(url);
          const failure = (extra.loadFailures || []).shift();
          return failure ? Promise.reject(failure) : Promise.resolve();
        },
      });
      const win = emitter({ webContents: contents, destroyed: false, isDestroyed() { return this.destroyed; } });
      const recovery = createRendererRecovery({
        win,
        gameUrl: 'http://127.0.0.1:41788/',
        dialogApi: extra.noDialog ? null : {
          async showMessageBox(...args) { boxes.push(args[args.length - 1]); return { response: 1 }; },
        },
        quitApp() { receiptLog.push('quit'); },
        onReceipt(status) { receiptLog.push(status); },
        now: () => clockNow,
        setTimer: () => ({ unref() {} }),
        clearTimer() {},
      });
      return { recovery, win, contents, loads, boxes, receiptLog, tick(ms) { clockNow += ms; } };
    };

    // Before the first load settles the startup path owns failures.
    const early = make();
    early.recovery.onGone({}, { reason: 'crashed' });
    await settle();
    assert.equal(early.loads.length, 0, 'not armed: no reload');

    // A destroyed window is never reloaded or asked about.
    const gone = make();
    gone.recovery.arm();
    gone.win.destroyed = true;
    gone.recovery.onGone({}, { reason: 'crashed' });
    await settle();
    assert.equal(gone.loads.length, 0);

    // A reload that fails for a real reason asks the player; an aborted one (superseded) does not.
    const failing = make({ loadFailures: [Object.assign(new Error('refused'), { code: 'ERR_CONNECTION_REFUSED' })] });
    failing.recovery.arm();
    failing.recovery.onGone({}, { reason: 'crashed' });
    await settle();
    assert.equal(failing.boxes.length, 1);
    assert.match(failing.boxes[0].message, /could not be restarted/);
    assert.ok(failing.receiptLog.includes('renderer-reload-failed'));
    assert.ok(failing.receiptLog.includes('quit'), 'the answer (Quit) is honoured');

    const aborted = make({ loadFailures: [Object.assign(new Error('superseded'), { code: 'ERR_ABORTED' })] });
    aborted.recovery.arm();
    aborted.recovery.onGone({}, { reason: 'crashed' });
    await settle();
    assert.equal(aborted.boxes.length, 0);

    // No dialog module: still reloads once, never throws on the second death.
    const quiet = make({ noDialog: true });
    quiet.recovery.arm();
    quiet.recovery.onGone({}, { reason: 'crashed' });
    quiet.tick(10 * 1000);
    quiet.recovery.onGone({}, { reason: 'crashed' });
    quiet.recovery.onUnresponsive();
    await settle();
    assert.equal(quiet.loads.length, 1);
  } finally {
    h.cleanup();
  }
});

// ── 3. Safe graphics after a GPU fault ────────────────────────────────────────────────────────

const freshRenderer = ({ reportsDir, clock }) => seedReport(reportsDir, 'latest.json', {
  event: reportEvent('renderer'), writtenAt: clock.now - 2 * MIN,
});

test('a fresh renderer crash report skips exactly the three forced GPU switches and logs one line', async () => {
  const h = await loadShell({ seed: freshRenderer });
  try {
    for (const name of FORCED_GPU_SWITCHES) assert.ok(!h.switches.includes(name), `${name} skipped`);
    assert.ok(h.switches.includes('enable-gpu-rasterization'), 'rasterization is not one of the three');
    assert.ok(h.switches.includes('disable-background-networking'), 'unrelated shell switches stay');
    const lines = h.logs.filter((line) => /safe graphics launch/.test(line));
    assert.equal(lines.length, 1);
    assert.match(lines[0], /renderer fault 120s ago/);
    const receipt = h.receipts.find((entry) => entry.status === 'safe-graphics');
    assert.equal(receipt.details.why, 'recent-crash');
  } finally {
    h.cleanup();
  }
});

test('a stale or non-GPU crash report leaves every GPU switch on', async () => {
  const cases = {
    'stale renderer report (30 min)': ({ reportsDir, clock }) => seedReport(reportsDir, 'latest.json', {
      event: reportEvent('renderer'), writtenAt: clock.now - 30 * MIN,
    }),
    'main-process fault just now': ({ reportsDir, clock }) => seedReport(reportsDir, 'latest.json', {
      event: { processType: 'main', reason: 'uncaughtException' }, writtenAt: clock.now - MIN,
    }),
    'renderer killed on purpose': ({ reportsDir, clock }) => seedReport(reportsDir, 'latest.json', {
      event: reportEvent('renderer', 'killed'), writtenAt: clock.now - MIN,
    }),
    'wrong schema': ({ reportsDir, clock }) => seedReport(reportsDir, 'latest.json', {
      event: reportEvent('renderer'), writtenAt: clock.now - MIN, schema: 'something.else.v1',
    }),
    'no reports at all': null,
  };
  for (const [label, seed] of Object.entries(cases)) {
    const h = await loadShell({ seed });
    try {
      for (const name of FORCED_GPU_SWITCHES) assert.ok(h.switches.includes(name), `${label}: ${name} stays on`);
      assert.equal(h.logs.filter((line) => /safe graphics launch/.test(line)).length, 0, label);
      assert.equal(h.receipts.some((entry) => entry.status === 'safe-graphics'), false, label);
    } finally {
      h.cleanup();
    }
  }
});

test('--safe-graphics always skips the three switches, with or without a crash report', async () => {
  const h = await loadShell({ argv: ['SpaceFace.exe', '--safe-graphics'] });
  try {
    for (const name of FORCED_GPU_SWITCHES) assert.ok(!h.switches.includes(name), `${name} skipped`);
    assert.ok(h.switches.includes('enable-gpu-rasterization'));
    assert.match(h.logs.find((line) => /safe graphics launch/.test(line)), /--safe-graphics/);
  } finally {
    h.cleanup();
  }
});

test('a startup-failure report written after a GPU crash does not hide the GPU fault', async () => {
  const h = await loadShell({
    seed: ({ reportsDir, clock }) => {
      seedReport(reportsDir, 'report-2026-10-22T11-57-00-000Z-4242-1.json', {
        event: reportEvent('child:GPU'), writtenAt: clock.now - 3 * MIN,
      });
      seedReport(reportsDir, 'latest.json', {
        event: { processType: 'main', reason: 'startup-failed' }, writtenAt: clock.now - 2 * MIN,
      });
    },
  });
  try {
    for (const name of FORCED_GPU_SWITCHES) assert.ok(!h.switches.includes(name), `${name} skipped`);
    assert.match(h.logs.find((line) => /safe graphics launch/.test(line)), /child:GPU fault/);
  } finally {
    h.cleanup();
  }
});

test('safe-graphics decision: ages, clock skew, mtime fallback, and process kinds', async () => {
  const h = await loadShell();
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sf-safe-decision-'));
  try {
    const { decideSafeGraphics, findRecentGpuFault } = h.exports;
    const now = EPOCH;
    const at = (minutesAgo) => now - minutesAgo * MIN;
    const decide = (reportsDir, extra = {}) => decideSafeGraphics({ reportsDir, now, ...extra });
    const reset = (name) => {
      const d = path.join(dir, name.replace(/[^\w.-]+/g, '_'));
      rmSync(d, { recursive: true, force: true });
      return d;
    };

    // 9 min 59 s is fresh; 10 min 1 s is stale.
    let d = reset('edge-fresh');
    seedReport(d, 'latest.json', { event: reportEvent('renderer'), writtenAt: now - 10 * MIN + 1000 });
    assert.equal(decide(d).safe, true);
    d = reset('edge-stale');
    seedReport(d, 'latest.json', { event: reportEvent('renderer'), writtenAt: now - 10 * MIN - 1000 });
    assert.equal(decide(d).safe, false);

    // Child processes: only the GPU process counts, case-insensitively.
    for (const [kind, safe] of [['child:GPU', true], ['child:gpu', true], ['child:Utility', false], ['child', false], ['main', false]]) {
      d = reset(`kind-${kind}`);
      seedReport(d, 'latest.json', { event: reportEvent(kind), writtenAt: at(1) });
      assert.equal(decide(d).safe, safe, kind);
    }

    // A report stamped far in the future (clock moved back) is not trusted; a tiny skew is.
    d = reset('future');
    seedReport(d, 'latest.json', { event: reportEvent('renderer'), writtenAt: now + 30 * MIN });
    assert.equal(decide(d).safe, false);
    d = reset('skew');
    seedReport(d, 'latest.json', { event: reportEvent('renderer'), writtenAt: now + 5 * 1000 });
    assert.equal(decide(d).safe, true);

    // Older reports without writtenAt fall back to the file's modified time.
    d = reset('mtime');
    const file = seedReport(d, 'latest.json', { event: reportEvent('renderer') });
    utimesSync(file, new Date(at(3)), new Date(at(3)));
    assert.equal(decide(d).safe, true, 'fresh mtime counts');
    utimesSync(file, new Date(at(45)), new Date(at(45)));
    assert.equal(decide(d).safe, false, 'old mtime is stale');

    // Missing or unreadable report folders and junk files never throw.
    assert.equal(decide(path.join(dir, 'does-not-exist')).safe, false);
    d = reset('junk');
    mkdirSync(d, { recursive: true });
    writeFileSync(path.join(d, 'latest.json'), '{ not json', 'utf8');
    assert.equal(decide(d).safe, false);
    assert.equal(decide('').safe, false);
    assert.equal(findRecentGpuFault({ reportsDir: '' }), null);

    // The flag wins regardless of the folder, and so does the --safe-graphics switch form.
    assert.deepEqual(JSON.parse(JSON.stringify(decide('', { argv: ['x', '--safe-graphics'] }))), { safe: true, why: 'flag' });
    const viaSwitch = decide('', { commandLine: { hasSwitch: (name) => name === 'safe-graphics' } });
    assert.equal(viaSwitch.safe, true);
    assert.equal(viaSwitch.why, 'flag');
    assert.equal(decide('', { argv: ['x', '--safe-graphics-not'] }).safe, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    h.cleanup();
  }
});

test('applyGpuHintSwitches: safe launch keeps rasterization and nothing else forced', async () => {
  const h = await loadShell();
  try {
    const { applyGpuHintSwitches } = h.exports;
    const run = (decision) => {
      const names = [];
      applyGpuHintSwitches({ appendSwitch(name) { names.push(name); } }, decision);
      return names;
    };
    assert.deepEqual(run({ safe: false }),
      ['ignore-gpu-blocklist', 'enable-gpu-rasterization', 'enable-zero-copy', 'force_high_performance_gpu']);
    assert.deepEqual(run({ safe: true }), ['enable-gpu-rasterization']);
    assert.deepEqual(run(undefined),
      ['ignore-gpu-blocklist', 'enable-gpu-rasterization', 'enable-zero-copy', 'force_high_performance_gpu']);
  } finally {
    h.cleanup();
  }
});

test('the safe-graphics decision happens before the app is ready, at module load', async () => {
  const src = readFileSync(MAIN_PATH, 'utf8');
  const decide = src.indexOf('const safeGraphics = decideSafeGraphics(');
  const apply = src.indexOf('applyGpuHintSwitches(app.commandLine, safeGraphics)');
  const ready = src.indexOf('app.whenReady()');
  assert.ok(decide > 0 && apply > decide && ready > apply, 'decide and apply run before the first whenReady()');
  assert.doesNotMatch(src, /webContents\.reload|location\.reload/, 'recovery loads the canonical URL (launch policy)');
});
