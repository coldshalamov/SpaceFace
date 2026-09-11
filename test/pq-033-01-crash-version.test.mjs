// PQ-033.01 — crash reporting, auto-update, and the version/build string. Headless.
// Pause and title paint the shared version/build label. Electron main starts the
// crashReporter into userData/crashes with the build hash in extras, writes readable
// JSON crash reports on process-gone faults, and wires electron-updater fail-closed
// to the packaged route.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { CREDITS } from '../src/data/credits.js';
import {
  leftoverBuildToken,
  leftoverVersionLabel,
  leftoverVersionToken,
  loadLeftoverVersionPayload,
  paintLeftoverVersion,
  resetLeftoverVersionCache,
} from '../src/ui/screens/mainMenu.js';
import { pauseScreen } from '../src/ui/screens/pause.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAIN_PATH = path.join(ROOT, 'electron', 'main.cjs');
const realRequire = createRequire(MAIN_PATH);
const releaseIdentity = realRequire('./releaseIdentity.cjs');
const autoUpdate = realRequire('./autoUpdate.cjs');
const leftoverPkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const leftoverVersion = leftoverVersionToken(leftoverPkg);
const leftoverLabel = leftoverVersionLabel(leftoverPkg);

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
  });
}

function installMiniDom() {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    fetch: globalThis.fetch,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    matchMedia: globalThis.matchMedia,
  };

  class Mini {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.parentElement = null;
      this.attributes = new Map();
      this._class = new Set();
      this._text = '';
      this.hidden = false;
      this.type = '';
      this.title = '';
      this.tabIndex = 0;
        this.style = {
        _props: Object.create(null),
        setProperty(name, value) { this._props[name] = value; },
        removeProperty(name) { delete this._props[name]; },
      };
      const owner = this;
      this.classList = {
        add(...names) { for (const name of names) if (name) owner._class.add(name); },
        remove(...names) { for (const name of names) owner._class.delete(name); },
        contains(name) { return owner._class.has(name); },
        toggle(name, force) {
          const on = force === undefined ? !owner._class.has(name) : !!force;
          if (on) owner._class.add(name);
          else owner._class.delete(name);
          return on;
        },
      };
      this.dataset = new Proxy(Object.create(null), {
        set(target, key, value) {
          target[key] = value;
          owner.attributes.set('data-' + String(key), String(value));
          return true;
        },
        deleteProperty(target, key) {
          delete target[key];
          owner.attributes.delete('data-' + String(key));
          return true;
        },
      });
    }
    get className() { return [...this._class].join(' '); }
    set className(value) {
      this._class.clear();
      for (const part of String(value || '').split(/\s+/)) if (part) this._class.add(part);
    }
    get textContent() {
      if (this.children.length) return this.children.map((child) => child.textContent).join('');
      return this._text;
    }
    set textContent(value) {
      this._text = String(value ?? '');
      for (const child of this.children) child.parentElement = null;
      this.children = [];
    }
    set innerHTML(value) {
      if (value === '') this.textContent = '';
    }
    getAttribute(name) {
      if (name === 'class') return this.className;
      return this.attributes.has(name) ? this.attributes.get(name) : null;
    }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
      if (name === 'class') this.className = value;
    }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) { this.attributes.delete(name); }
    addEventListener() {}
    removeEventListener() {}
    focus() {}
    appendChild(child) { return this.append(child); }
    append(...nodes) {
      for (const node of nodes) {
        if (!node) continue;
        if (node.parentElement) {
          node.parentElement.children = node.parentElement.children.filter((item) => item !== node);
        }
        node.parentElement = this;
        this.children.push(node);
      }
      return nodes[0] || this;
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
    querySelectorAll(selector) {
      const out = [];
      const walk = (node) => {
        if (matches(node, selector)) out.push(node);
        for (const child of node.children) walk(child);
      };
      for (const child of this.children) walk(child);
      return out;
    }
  }

  function matches(node, selector) {
    const attr = /\[([^\s\]=]+)=["']([^"']*)["']\]/.exec(selector);
    const classes = [...selector.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((match) => match[1]);
    const tag = /^([a-zA-Z][a-zA-Z0-9_-]*)/.exec(selector);
    if (tag && node.tagName !== tag[1].toUpperCase()) return false;
    for (const name of classes) if (!node._class.has(name)) return false;
    if (attr && (node.attributes.get(attr[1]) || '') !== attr[2]) return false;
    return true;
  }

  const documentElement = new Mini('html');
  const body = new Mini('body');
  const document = {
    documentElement,
    body,
    createElement(tag) { return new Mini(tag); },
    getElementById() { return null; },
    querySelector() { return null; },
  };

  globalThis.document = document;
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.requestAnimationFrame = (fn) => { fn(0); return 1; };
  globalThis.fetch = async () => {
    throw new Error('leftover version must not fetch /package.json');
  };

  return {
    Mini,
    restore() {
      if (previous.document === undefined) delete globalThis.document;
      else globalThis.document = previous.document;
      if (previous.window === undefined) delete globalThis.window;
      else globalThis.window = previous.window;
      if (previous.fetch === undefined) delete globalThis.fetch;
      else globalThis.fetch = previous.fetch;
      if (previous.requestAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
      else globalThis.requestAnimationFrame = previous.requestAnimationFrame;
      if (previous.matchMedia === undefined) delete globalThis.matchMedia;
      else globalThis.matchMedia = previous.matchMedia;
    },
  };
}

async function loadMainWithCrashReporter({ isPackaged = false, isolatedEvidence = false, updaterSpy = null } = {}) {
  const crashStarts = [];
  const consoleErrors = [];
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'sf-pq033-'));
  const paths = {
    userData: path.join(tmpRoot, 'userData'),
    exe: path.join(tmpRoot, 'electron.exe'),
  };
  const windows = [];
  const receipts = [];
  const processEvents = emitter({
    env: {},
    platform: 'win32',
    execPath: paths.exe,
    resourcesPath: path.join(tmpRoot, 'resources'),
    versions: { electron: '43.2.0', chrome: '150.0.0', node: '24.18.0', v8: '15.0.0' },
    pid: 4242,
    uptime() { return 12; },
    exitCodes: [],
    exit(code) { this.exitCodes.push(code); },
  });
  const powerMonitor = emitter();
  const ipcHandlers = new Map();
  const ipcMain = emitter({
    handle(channel, handler) { ipcHandlers.set(channel, handler); },
  });
  const crashReporter = {
    start(options) { crashStarts.push(options); },
  };
  const app = emitter({
    isPackaged,
    commandLine: { appendSwitch() {} },
    getVersion() { return leftoverVersion; },
    getPath(name) { return paths[name] || path.join(tmpRoot, `.electron-${name}`); },
    setPath(name, value) { paths[name] = value; },
    requestSingleInstanceLock() { return true; },
    whenReady() { return Promise.resolve(); },
    quit() { this.emit('before-quit'); },
    exit(code) {
      throw new Error(`unexpected app.exit(${code}); tail receipts=${JSON.stringify(receipts.slice(-3))}`);
    },
  });

  function FakeBrowserWindow(options) {
    const webContents = emitter({
      destroyed: false,
      session: {
        setPermissionCheckHandler() {},
        setPermissionRequestHandler() {},
      },
      isDestroyed() { return this.destroyed; },
      getURL() { return this.url || 'about:blank'; },
      setWindowOpenHandler() {},
      send() {},
    });
    const win = emitter({
      options,
      webContents,
      visible: false,
      minimized: false,
      focused: false,
      destroyed: false,
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
        webContents.url = url;
        webContents.emit('did-finish-load');
      },
    });
    windows.push(win);
    return win;
  }
  FakeBrowserWindow.getAllWindows = () => windows.filter((win) => !win.destroyed);

  const sandbox = {
    __dirname: path.join(ROOT, 'electron'),
    console: { ...console, error: (...args) => consoleErrors.push(args) },
    URL,
    module: { exports: {} },
    exports: {},
    process: processEvents,
    require(specifier) {
      if (specifier === 'electron') {
        return { app, BrowserWindow: FakeBrowserWindow, powerMonitor, ipcMain, crashReporter };
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
      if (specifier === './autoUpdate.cjs' && updaterSpy) return updaterSpy;
      if (specifier === '../scripts/lib/electronLaunchProtocol.cjs') {
        return {
          appendLaunchReceipt(_receiptPath, status, details) { receipts.push({ status, details }); },
          isAllowedElectronListenerPort() { return true; },
          isAssetPreloadFailureMessage() { return false; },
          resolveElectronLaunchConfig() {
            return {
              isolatedEvidence,
              port: 41788,
              userDataDir: paths.userData,
              lockNamespace: 'player',
            };
          },
          resolveWebRoot({ projectRoot }) { return projectRoot; },
        };
      }
      // Real builtins (fs, path, child_process) and the electron/*.cjs neighbours load for real:
      // the crash-report writer genuinely writes report files under the temp userData dir, and
      // release identity genuinely resolves this repo's git HEAD in the unpackaged fake.
      return realRequire(specifier);
    },
  };

  vm.runInNewContext(readFileSync(MAIN_PATH, 'utf8'), sandbox, { filename: MAIN_PATH });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  return {
    app, consoleErrors, crashStarts, ipcHandlers, paths, processEvents, receipts, tmpRoot,
    exports: sandbox.module.exports,
    cleanup() { rmSync(tmpRoot, { recursive: true, force: true }); },
  };
}

test('leftover version label matches the title payload', () => {
  assert.ok(leftoverVersion, 'leftover package.json version must exist');
  assert.equal(leftoverLabel, 'SpaceFace v' + leftoverVersion);
  assert.equal(leftoverVersionLabel(null), 'SpaceFace');
  assert.equal(CREDITS.version, leftoverVersion, 'leftover credits version matches leftover package version');
  console.log('PQ-033.01 version: ' + leftoverLabel);
});

test('pause copy includes leftover version', async () => {
  const pauseSrc = readFileSync(path.join(ROOT, 'src', 'ui', 'screens', 'pause.js'), 'utf8');
  assert.match(pauseSrc, /leftoverVersionLabel/);
  assert.match(pauseSrc, /paintLeftoverVersion/);
  assert.match(pauseSrc, /dataset\.role = 'version'/);

  const dom = installMiniDom();
  try {
    const root = globalThis.document.createElement('div');
    const ctx = {
      state: { mode: 'flight', missions: { active: [] }, nav: {}, save: {}, meta: {}, ui: {}, run: { phase: 'inactive' } },
      bus: { emit() {}, on() { return () => {}; } },
      screenManager: { pushScreen() {}, popScreen() {}, hasScreen() { return true; } },
    };
    pauseScreen.mount(root, ctx);

    const versionNode = root.querySelector('[data-role="version"]');
    assert.ok(versionNode, 'pause must paint leftover version fine print');
    const target = versionNode.querySelector('span') || versionNode;
    const painted = await paintLeftoverVersion(target);
    assert.equal(painted, leftoverLabel);
    assert.match(versionNode.textContent, new RegExp('SpaceFace v' + leftoverVersion.replace(/\./g, '\\.')));
    assert.equal(versionNode.textContent, leftoverLabel);
    console.log('PQ-033.01 pause: ' + versionNode.textContent);
  } finally {
    dom.restore();
  }
});

test('electron main starts crashReporter with the build hash in extras', async () => {
  const mainSrc = readFileSync(MAIN_PATH, 'utf8');
  assert.match(mainSrc, /startLeftoverCrashReporter\(electron,\s*releaseIdentity\)/);
  assert.match(mainSrc, /crashReporter\.start\(/);
  assert.match(mainSrc, /uploadToServer:\s*false/);
  assert.match(mainSrc, /leftoverCrashDumpDir/);
  assert.match(mainSrc, /['"]crashes['"]/);
  assert.match(mainSrc, /require\(['"]\.\/releaseIdentity\.cjs['"]\)/);
  assert.match(mainSrc, /require\(['"]\.\/autoUpdate\.cjs['"]\)/);
  assert.match(mainSrc, /configureAutoUpdate\(/);

  const loaded = await loadMainWithCrashReporter();
  try {
    assert.equal(loaded.crashStarts.length, 1, 'crashReporter.start must run at boot');
    const options = loaded.crashStarts[0];
    assert.equal(options.uploadToServer, false);
    assert.equal(options.extra.version, leftoverVersion);
    assert.equal(options.globalExtra.version, leftoverVersion);
    assert.match(options.extra.build, /^[0-9a-f]{12}$/, 'crash extras carry the dev build hash (git HEAD)');
    assert.equal(options.extra.build, options.globalExtra.build);
    assert.equal(loaded.paths.crashDumps, path.join(loaded.paths.userData, 'crashes'));

    const helper = loaded.exports.startLeftoverCrashReporter;
    assert.equal(typeof helper, 'function');
    const helperStarts = [];
    const helperPaths = { userData: mkdtempSync(path.join(os.tmpdir(), 'sf-pq033-helper-')) };
    try {
      const helperResult = helper({
        crashReporter: { start(o) { helperStarts.push(o); } },
        app: {
          getVersion() { return leftoverVersion; },
          getPath(name) { return helperPaths[name] || ''; },
          setPath(name, value) { helperPaths[name] = value; },
        },
      }, { version: leftoverVersion, build: 'b001dc0ffee7' });
      assert.equal(helperResult.started, true);
      assert.equal(helperResult.dumpDir, path.join(helperPaths.userData, 'crashes'));
      assert.equal(helperResult.extra.version, leftoverVersion);
      assert.equal(helperResult.extra.build, 'b001dc0ffee7', 'a supplied build id lands in crash extras');
      assert.equal(helperStarts.length, 1);
    } finally {
      rmSync(helperPaths.userData, { recursive: true, force: true });
    }
    console.log('PQ-033.01 crashReporter: userData/crashes version=' + leftoverVersion + ' build=' + options.extra.build);
  } finally {
    loaded.cleanup();
  }
});

test('a forced process fault writes a readable crash report carrying the build hash', async () => {
  const loaded = await loadMainWithCrashReporter();
  try {
    const reportDir = path.join(loaded.paths.crashDumps, 'reports');
    const reportFiles = () => readdirSync(reportDir).filter((name) => /^report-.*\.json$/.test(name)).sort();

    // Renderer gone — the crash the player would actually hit.
    loaded.app.emit('render-process-gone', {}, { id: 7, isDestroyed: () => false }, { reason: 'crashed', exitCode: 3 });
    // GPU/utility child gone with a real fault.
    loaded.app.emit('child-process-gone', {}, { type: 'GPU', reason: 'crashed', exitCode: 34 });
    // Main-process uncaught exception: report written, stderr kept loud, then the shell exits.
    loaded.processEvents.emit('uncaughtException', new Error('synthetic pq033.01 fault'));
    assert.deepEqual(loaded.processEvents.exitCodes, [1], 'main fault still terminates after reporting');
    assert.equal(loaded.consoleErrors.length, 1, 'the handler does not swallow the dev-mode stack dump');

    const latest = JSON.parse(readFileSync(path.join(reportDir, 'latest.json'), 'utf8'));
    assert.equal(latest.schema, loaded.exports.CRASH_REPORT_SCHEMA);
    assert.equal(latest.version, leftoverVersion);
    assert.match(latest.build, /^[0-9a-f]{12}$/, 'the report carries the build hash');
    assert.equal(latest.event.processType, 'main');
    assert.equal(latest.event.reason, 'uncaughtException');
    assert.equal(latest.event.message, 'synthetic pq033.01 fault');
    assert.match(latest.event.stack, /synthetic pq033\.01 fault/, 'the report keeps the stack');
    assert.equal(latest.packaged, false);

    let written = reportFiles();
    assert.equal(written.length, 3, 'one report file per fault');
    const rendererReport = JSON.parse(readFileSync(path.join(reportDir, written[0]), 'utf8'));
    assert.equal(rendererReport.event.processType, 'renderer');
    assert.equal(rendererReport.event.reason, 'crashed');
    assert.equal(rendererReport.event.exitCode, 3);
    assert.equal(rendererReport.event.webContentsId, 7);
    assert.equal(rendererReport.build, latest.build, 'every report names the same build');
    assert.ok(loaded.receipts.some((entry) => entry.status === 'crash-report-written'));

    // Ordinary teardown is not a crash: clean-exit renderers, routine Chromium child kills, a
    // destroyed webContents mid-teardown, and anything after before-quit write nothing — and the
    // half-dead webContents id read cannot bounce into the uncaughtException report path.
    loaded.app.emit('render-process-gone', {}, { id: 8, isDestroyed: () => false }, { reason: 'clean-exit', exitCode: 0 });
    loaded.app.emit('render-process-gone', {}, { isDestroyed() { throw new Error('Object has been destroyed'); } }, { reason: 'crashed', exitCode: 9 });
    loaded.app.emit('child-process-gone', {}, { type: 'GPU', reason: 'killed', exitCode: 0 });
    loaded.app.quit();
    loaded.app.emit('render-process-gone', {}, { id: 9, isDestroyed: () => false }, { reason: 'crashed', exitCode: 1 });
    written = reportFiles();
    assert.equal(written.length, 4, 'teardown noise writes no reports; a real fault still does');
    assert.deepEqual(loaded.processEvents.exitCodes, [1], 'a torn-down webContents read never reaches process.exit');

    const tornDownReport = JSON.parse(readFileSync(path.join(reportDir, written[written.length - 1]), 'utf8'));
    assert.equal(tornDownReport.event.webContentsId, null, 'destroyed webContents reports a null id');
    console.log('PQ-033.01 forced crash: ' + written.length + ' reports, latest build=' + latest.build);
  } finally {
    loaded.cleanup();
  }
});

test('release identity resolves env pin, packaged receipt, and dev git head', async () => {
  const { readReleaseReceiptDigest, resolveReleaseIdentity } = releaseIdentity;

  const envId = resolveReleaseIdentity({
    appApi: { isPackaged: false, getVersion: () => '0.1.0' },
    projectRoot: ROOT,
    env: { SPACEFACE_BUILD_HASH: 'cafe1234beef' },
  });
  assert.equal(envId.build, 'cafe1234beef');
  assert.equal(envId.source, 'env');

  const devId = resolveReleaseIdentity({
    appApi: { isPackaged: false, getVersion: () => leftoverVersion },
    projectRoot: ROOT,
    env: {},
  });
  assert.equal(devId.version, leftoverVersion);
  assert.match(devId.build, /^[0-9a-f]{12}$/, 'dev build hash is the git short HEAD');
  assert.equal(devId.source, 'git-head');

  // Packaged identity comes from the bundle's release receipt — a fixture keeps this
  // independent of whether a build has happened in this checkout (build/ is not committed).
  const fakeProject = mkdtempSync(path.join(os.tmpdir(), 'sf-pq033-pkg-'));
  try {
    const digest = 'ab'.repeat(32);
    mkdirSync(path.join(fakeProject, 'build', 'web'), { recursive: true });
    writeFileSync(
      path.join(fakeProject, 'build', 'web', 'spaceface-release-build.json'),
      JSON.stringify({ output: { digest } }),
    );
    const packagedId = resolveReleaseIdentity({
      appApi: { isPackaged: true, getVersion: () => leftoverVersion },
      projectRoot: fakeProject,
      env: {},
    });
    assert.equal(packagedId.build, 'abababababab', 'packaged build hash is the receipt digest prefix');
    assert.equal(packagedId.source, 'release-receipt');
    const publicView = releaseIdentity.publicBuildInfo(packagedId);
    assert.deepEqual(Object.keys(publicView).sort(), ['build', 'channel', 'packaged', 'version']);
    assert.equal(publicView.channel, 'release');
  } finally {
    rmSync(fakeProject, { recursive: true, force: true });
  }

  // If this checkout has actually built the bundle, the real receipt must resolve too.
  const realReceipt = path.join(ROOT, 'build', 'web', 'spaceface-release-build.json');
  if (existsSync(realReceipt)) {
    assert.match(readReleaseReceiptDigest(realReceipt) || '', /^[0-9a-f]{12}$/,
      'an on-disk release receipt resolves to a build hash');
  }

  const noReceipt = resolveReleaseIdentity({
    appApi: { isPackaged: true, getVersion: () => leftoverVersion },
    projectRoot: mkdtempSync(path.join(os.tmpdir(), 'sf-pq033-noreceipt-')),
    env: {},
  });
  assert.equal(noReceipt.build, '', 'unreceipted package reports no build rather than lying');
  console.log('PQ-033.01 identity: dev=' + devId.build + ' packaged=fixture abababababab');
});

test('auto-update wires only on the packaged route and installs on confirm', async () => {
  const { configureAutoUpdate } = autoUpdate;

  const off = configureAutoUpdate({ appApi: { isPackaged: false } });
  assert.equal(off.enabled, false);
  assert.equal(off.reason, 'unpackaged');

  const missing = [];
  const missingResult = configureAutoUpdate({
    appApi: { isPackaged: true },
    receipt: (status, details) => missing.push({ status, details }),
    loadUpdater: () => null,
  });
  assert.equal(missingResult.enabled, false);
  assert.equal(missingResult.reason, 'module-missing');
  assert.ok(missing.some((entry) => entry.status === 'update-unavailable'));

  const calls = { checks: 0, installs: 0 };
  const fakeUpdater = emitter({
    autoDownload: false,
    autoInstallOnAppQuit: false,
    checkForUpdates() { calls.checks += 1; return Promise.resolve(); },
    quitAndInstall() { calls.installs += 1; },
  });
  const updateReceipts = [];
  const dialogs = [];
  const gameWindow = { id: 'game-window' };
  const on = configureAutoUpdate({
    appApi: { isPackaged: true },
    receipt: (status, details) => updateReceipts.push({ status, details }),
    browserWindowApi: { getAllWindows: () => [gameWindow] },
    dialogApi: {
      showMessageBox(...args) {
        const options = args[args.length - 1];
        dialogs.push({ parent: args.length > 1 ? args[0] : undefined, options });
        return Promise.resolve({ response: 0 });
      },
    },
    updaterModule: { autoUpdater: fakeUpdater },
  });
  assert.equal(on.enabled, true);
  assert.equal(fakeUpdater.autoDownload, true);
  assert.equal(fakeUpdater.autoInstallOnAppQuit, true, 'a deferred prompt still applies on quit');
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.checks, 1, 'packaged boot checks the update feed once');

  fakeUpdater.emit('update-available', { version: '0.2.0' });
  fakeUpdater.emit('update-downloaded', { version: '0.2.0' });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dialogs.length, 1, 'a downloaded update offers the restart prompt');
  assert.equal(dialogs[0].parent, gameWindow, 'the prompt is parented to the fullscreen game window');
  assert.deepEqual(dialogs[0].options.buttons, ['Restart', 'Later']);
  assert.equal(calls.installs, 1, 'Restart applies the downloaded update');
  assert.ok(updateReceipts.some((entry) => entry.status === 'update-downloaded'));
  assert.ok(updateReceipts.some((entry) => entry.status === 'update-install-requested'));
  console.log('PQ-033.01 updater: packaged check + download + restart apply wired');
});

test('isolated evidence launches never touch the update feed', async () => {
  const updaterCalls = [];
  const updaterSpy = {
    configureAutoUpdate(options) { updaterCalls.push(options); return Object.freeze({ enabled: true }); },
  };
  const isolated = await loadMainWithCrashReporter({ isPackaged: true, isolatedEvidence: true, updaterSpy });
  try {
    assert.equal(updaterCalls.length, 0, 'isolated probe boots configure nothing on the feed');
    assert.ok(!isolated.receipts.some((entry) => /^update-/.test(entry.status)),
      'no update receipts appear on an evidence run');
  } finally {
    isolated.cleanup();
  }

  const normal = await loadMainWithCrashReporter({ isPackaged: true, updaterSpy });
  try {
    assert.equal(updaterCalls.length, 1, 'a normal packaged boot wires the updater once');
    const opts = updaterCalls[0];
    assert.equal(opts.appApi.isPackaged, true);
    assert.equal(typeof opts.browserWindowApi, 'function', 'the window class is passed for prompt parenting');
    assert.equal(typeof opts.receipt, 'function');
  } finally {
    normal.cleanup();
  }
});

test('packaged packaging metadata ships the updater, modules, and feed', async () => {
  assert.equal(leftoverPkg.dependencies['electron-updater'], '6.2.1',
    'updater is pinned to the electron-builder 24-train sibling (6.2.1 fixes the 6.2.0 mac critical)');
  assert.ok(leftoverPkg.build.files.includes('electron/autoUpdate.cjs'));
  assert.ok(leftoverPkg.build.files.includes('electron/releaseIdentity.cjs'));
  assert.deepEqual(leftoverPkg.build.publish, {
    provider: 'github',
    owner: 'coldshalamov',
    repo: 'SpaceFace',
  }, 'electron-updater feed resolves to the project GitHub releases');
  assert.match(leftoverPkg.scripts['check:pq033:release-closeout'], /pq-033-01-crash-version/);

  const loaded = await loadMainWithCrashReporter();
  try {
    const buildInfoHandler = loaded.ipcHandlers.get('spaceface:build-info');
    assert.equal(typeof buildInfoHandler, 'function', 'preload channel is handled in main');
    const info = buildInfoHandler();
    assert.equal(info.version, leftoverVersion);
    assert.match(info.build, /^[0-9a-f]{12}$/);
    assert.equal(info.packaged, false);
    assert.equal(info.channel, 'dev');
    assert.deepEqual(Object.keys(info).sort(), ['build', 'channel', 'packaged', 'version'],
      'the bridge payload is the public view only — no paths, env, or process internals');
  } finally {
    loaded.cleanup();
  }

  const preloadSrc = readFileSync(path.join(ROOT, 'electron', 'preload.cjs'), 'utf8');
  assert.match(preloadSrc, /buildInfo\(\)/);
  assert.match(preloadSrc, /spaceface:build-info/);
  const updaterSrc = readFileSync(path.join(ROOT, 'electron', 'autoUpdate.cjs'), 'utf8');
  assert.match(updaterSrc, /require\(['"]electron-updater['"]\)/);
  assert.match(updaterSrc, /autoInstallOnAppQuit\s*=\s*true/);
  console.log('PQ-033.01 packaging: files + publish feed + bridge present');
});

// Packaged builds serve build/web and never copy package.json there. The version still comes from
// bundled credits; the build hash comes from the release receipt at the web root when the Electron
// bridge is absent (a statically served bundle) — and that is the only fetch the screen makes.
test('version paints from bundled credits plus the release receipt on the packaged route', async () => {
  const { RELEASE_COPY_MAPPINGS } = await import('../scripts/lib/releasePackaging.mjs');
  const deliversPackageJson = RELEASE_COPY_MAPPINGS.some(
    (mapping) => mapping.source === 'package.json' || mapping.destination === 'package.json',
  );
  assert.equal(deliversPackageJson, false, 'packaged web root still does not ship package.json');
  assert.equal(
    existsSync(path.join(ROOT, 'build', 'web', 'package.json')),
    false,
    'the packaged web root still carries no package.json',
  );
  assert.equal(CREDITS.version, leftoverVersion, 'bundled credits carry the package version');

  const dom = installMiniDom();
  try {
    const fetchedUrls = [];
    globalThis.fetch = async (url) => {
      fetchedUrls.push(String(url));
      return { ok: false, status: 404, async json() { throw new Error('404 Not Found'); } };
    };
    resetLeftoverVersionCache();

    const root = globalThis.document.createElement('div');
    const ctx = {
      state: { mode: 'flight', missions: { active: [] }, nav: {}, save: {}, meta: {}, ui: {}, run: { phase: 'inactive' } },
      bus: { emit() {}, on() { return () => {}; } },
      screenManager: { pushScreen() {}, popScreen() {}, hasScreen() { return true; } },
    };
    pauseScreen.mount(root, ctx);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const versionNode = root.querySelector('[data-role="version"]');
    assert.ok(versionNode, 'pause still paints the version fine print');
    assert.equal(versionNode.textContent, leftoverLabel);
    assert.deepEqual(fetchedUrls, ['spaceface-release-build.json'],
      'the only fetch is the build receipt at the web root — never /package.json');
    console.log('PQ-033.01 packaged route: pause version = "' + versionNode.textContent + '"');
  } finally {
    dom.restore();
    resetLeftoverVersionCache();
  }
});

test('version label gains the build hash from the shell bridge or the receipt', async () => {
  const dom = installMiniDom();
  try {
    // Electron route: the preload bridge answers from the shell's resolved identity.
    globalThis.window.spacefaceShell = {
      buildInfo: async () => ({ version: leftoverVersion, build: 'deedbeef1234', packaged: true, channel: 'release' }),
    };
    resetLeftoverVersionCache();
    let payload = await loadLeftoverVersionPayload();
    assert.equal(payload.build, 'deedbeef1234');
    assert.equal(leftoverVersionLabel(payload), 'SpaceFace v' + leftoverVersion + ' · deedbeef1234');

    // Statically served packaged bundle (no bridge): the web-root receipt supplies the digest.
    delete globalThis.window.spacefaceShell;
    const digest = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ output: { digest } }) });
    resetLeftoverVersionCache();
    payload = await loadLeftoverVersionPayload();
    assert.equal(payload.build, '0123456789ab', 'build label uses the receipt digest prefix');

    // A malformed receipt never becomes a build claim.
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ output: { digest: 'not-a-hash' } }) });
    resetLeftoverVersionCache();
    payload = await loadLeftoverVersionPayload();
    assert.equal(payload.build, '');
    assert.equal(leftoverVersionLabel(payload), leftoverLabel);
    console.log('PQ-033.01 label: "' + leftoverVersionLabel({ version: leftoverVersion, build: 'deedbeef1234' }) + '"');
  } finally {
    dom.restore();
    resetLeftoverVersionCache();
  }
});
