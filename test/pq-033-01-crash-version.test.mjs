// PQ-033.01 — leftover crash reporting and version. Headless.
// Pause paints the leftover title version string. Electron main starts
// leftover crashReporter into userData/crashes. Updater is NOT DONE.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { CREDITS } from '../src/data/credits.js';
import {
  leftoverVersionLabel,
  leftoverVersionToken,
  paintLeftoverVersion,
} from '../src/ui/screens/mainMenu.js';
import { pauseScreen } from '../src/ui/screens/pause.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAIN_PATH = path.join(ROOT, 'electron', 'main.cjs');
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
  globalThis.fetch = async (url) => {
    assert.equal(String(url), '/package.json');
    return { ok: true, async json() { return leftoverPkg; } };
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

async function loadMainWithCrashReporter() {
  const crashStarts = [];
  const paths = {
    userData: path.join(ROOT, '.tmp-pq033-userData'),
    exe: path.join(ROOT, 'electron.exe'),
  };
  const windows = [];
  const receipts = [];
  const powerMonitor = emitter();
  const ipcMain = emitter();
  const crashReporter = {
    start(options) { crashStarts.push(options); },
  };
  const app = emitter({
    isPackaged: false,
    commandLine: { appendSwitch() {} },
    getVersion() { return leftoverVersion; },
    getPath(name) { return paths[name] || path.join(ROOT, `.electron-${name}`); },
    setPath(name, value) { paths[name] = value; },
    requestSingleInstanceLock() { return true; },
    whenReady() { return Promise.resolve(); },
    quit() { this.emit('before-quit'); },
    exit(code) { throw new Error(`unexpected app.exit(${code})`); },
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
    console,
    URL,
    module: { exports: {} },
    exports: {},
    process: {
      env: {},
      platform: 'win32',
      execPath: paths.exe,
      resourcesPath: path.join(ROOT, 'resources'),
      versions: { electron: '43.2.0', chrome: '150.0.0', node: '24.18.0', v8: '15.0.0' },
    },
    require(specifier) {
      if (specifier === 'electron') {
        return { app, BrowserWindow: FakeBrowserWindow, powerMonitor, ipcMain, crashReporter };
      }
      if (specifier === 'path') return path;
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
          resolvePlayerSaveDir() { return path.join(ROOT, '.tmp-player-saves'); },
          writePlayerStoreKeysSync() { return {}; },
        };
      }
      if (specifier === '../scripts/lib/electronLaunchProtocol.cjs') {
        return {
          appendLaunchReceipt(_receiptPath, status, details) { receipts.push({ status, details }); },
          isAllowedElectronListenerPort() { return true; },
          isAssetPreloadFailureMessage() { return false; },
          resolveElectronLaunchConfig() {
            return {
              isolatedEvidence: false,
              port: 41788,
              userDataDir: paths.userData,
              lockNamespace: 'player',
            };
          },
          resolveWebRoot({ projectRoot }) { return projectRoot; },
        };
      }
      throw new Error(`unexpected require: ${specifier}`);
    },
  };

  vm.runInNewContext(readFileSync(MAIN_PATH, 'utf8'), sandbox, { filename: MAIN_PATH });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  return { crashStarts, paths, exports: sandbox.module.exports };
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

test('electron main starts leftover crashReporter into userData', async () => {
  const mainSrc = readFileSync(MAIN_PATH, 'utf8');
  assert.match(mainSrc, /startLeftoverCrashReporter\(electron\)/);
  assert.match(mainSrc, /crashReporter\.start\(/);
  assert.match(mainSrc, /uploadToServer:\s*false/);
  assert.match(mainSrc, /leftoverCrashDumpDir/);
  assert.match(mainSrc, /['"]crashes['"]/);
  assert.doesNotMatch(mainSrc, /require\(['"]electron-updater['"]\)/);
  assert.doesNotMatch(mainSrc, /\bautoUpdater\b/);

  const loaded = await loadMainWithCrashReporter();
  assert.equal(loaded.crashStarts.length, 1, 'leftover crashReporter.start must run at boot');
  const options = loaded.crashStarts[0];
  assert.equal(options.uploadToServer, false);
  assert.equal(options.extra.version, leftoverVersion);
  assert.equal(options.globalExtra.version, leftoverVersion);
  assert.equal(loaded.paths.crashDumps, path.join(loaded.paths.userData, 'crashes'));

  const helper = loaded.exports.startLeftoverCrashReporter;
  assert.equal(typeof helper, 'function');
  const helperStarts = [];
  const helperPaths = { userData: path.join(ROOT, '.tmp-pq033-helper-userData') };
  const helperResult = helper({
    crashReporter: { start(options) { helperStarts.push(options); } },
    app: {
      getVersion() { return leftoverVersion; },
      getPath(name) { return helperPaths[name] || ''; },
      setPath(name, value) { helperPaths[name] = value; },
    },
  });
  assert.equal(helperResult.started, true);
  assert.equal(helperResult.dumpDir, path.join(helperPaths.userData, 'crashes'));
  assert.equal(helperResult.extra.version, leftoverVersion);
  assert.equal(helperStarts.length, 1);

  console.log('PQ-033.01 crashReporter: started leftover userData/crashes version=' + leftoverVersion);
  console.log('PQ-033.01 updater: NOT DONE');
});
