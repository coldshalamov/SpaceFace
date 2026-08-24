// check-gamepad-mission-log-reachability.mjs
//
// Deterministic contract check: a gamepad-only player can reach the Mission Log from flight
// using only shipped actions. Because src/ui/input.js and src/systems/input.js are owned by the
// lead, this route cannot add a direct gamepad Mission Log binding from here; the allowed product
// contract is Start → Pause → Mission Log. This check proves that route by driving
// createUiInput + createScreenManager with gamepad actions and asserting stack/focus transitions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { BINDINGS } from '../src/ui/bindings.js';
import { createUiInput } from '../src/ui/input.js';
import { createScreenManager } from '../src/ui/screenManager.js';
import { pauseScreen } from '../src/ui/screens/pause.js';
import { missionLogScreen } from '../src/ui/screens/missionLog.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function stripJsComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function parseArgs(argv) {
  const out = { copyFixture: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--copy-fixture') {
      out.copyFixture = argv[++i];
      assert.ok(out.copyFixture, '--copy-fixture requires a path');
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attrs = Object.create(null);
    this.style = {};
    this.listeners = new Map();
    this.disabled = false;
    this.hidden = false;
    this.inert = false;
    this._text = '';
    this._classes = new Set();
    this.classList = {
      add: (...names) => { for (const n of names) if (n) this._classes.add(n); },
      remove: (...names) => { for (const n of names) this._classes.delete(n); },
      contains: (c) => this._classes.has(c),
      toggle: (c, on) => {
        if (on === true) this._classes.add(c);
        else if (on === false) this._classes.delete(c);
        else if (this._classes.has(c)) this._classes.delete(c);
        else this._classes.add(c);
        return this._classes.has(c);
      },
    };
    const data = Object.create(null);
    this.dataset = new Proxy(data, {
      set: (obj, key, value) => {
        obj[key] = String(value);
        const attr = 'data-' + String(key).replace(/[A-Z]/g, (ch) => '-' + ch.toLowerCase());
        this.attrs[attr] = String(value);
        return true;
      },
      get: (obj, key) => obj[key],
    });
  }

  get id() { return this.attrs.id || ''; }
  set id(v) { this.attrs.id = String(v); }

  get className() { return [...this._classes].join(' '); }
  set className(v) {
    this._classes = new Set(String(v || '').split(/\s+/).filter(Boolean));
    this.attrs.class = v;
  }

  get textContent() {
    if (this.children.length) {
      return this.children.map((c) => c.textContent).join('') + this._text;
    }
    return this._text;
  }
  set textContent(v) {
    this.children = [];
    this._text = String(v);
  }

  get innerHTML() { return this._inner || ''; }
  set innerHTML(html) {
    this.children = [];
    this._text = '';
    this._inner = String(html);
    for (const child of parseHtml(String(html))) this.appendChild(child);
  }

  setAttribute(name, value) {
    const key = String(name);
    this.attrs[key] = String(value);
    if (key === 'class') this.className = value;
    if (key === 'id') this.id = value;
    if (key === 'hidden') this.hidden = true;
  }

  getAttribute(name) {
    if (name === 'class') return this.className || null;
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }

  removeAttribute(name) {
    delete this.attrs[name];
    if (name === 'hidden') this.hidden = false;
    if (name === 'class') this.className = '';
  }

  appendChild(child) {
    if (!child) return child;
    if (child.nodeType === 11) {
      for (const nested of [...child.children]) this.appendChild(nested);
      child.children = [];
      return child;
    }
    if (child.parentNode && typeof child.parentNode.removeChild === 'function') {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    child.parentNode = null;
    return child;
  }

  insertBefore(child, ref) {
    if (child.parentNode && typeof child.parentNode.removeChild === 'function') {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    const i = this.children.indexOf(ref);
    if (i < 0) this.children.push(child);
    else this.children.splice(i, 0, child);
    return child;
  }

  contains(other) {
    for (let n = other; n; n = n.parentNode) if (n === this) return true;
    return false;
  }

  closest(selector) {
    for (let n = this; n; n = n.parentNode) if (matchesAny(n, selector)) return n;
    return null;
  }

  descendants(out = []) {
    for (const c of this.children) { out.push(c); c.descendants(out); }
    return out;
  }

  querySelectorAll(selector) {
    return this.descendants().filter((el) => matchesAny(el, selector));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

  addEventListener(type, fn) {
    const list = this.listeners.get(type) || [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  removeEventListener(type, fn) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((f) => f !== fn));
  }

  dispatchEvent(event) {
    const ev = event && typeof event === 'object' ? event : { type: String(event) };
    if (!ev.target) ev.target = this;
    if (typeof ev.preventDefault !== 'function') ev.preventDefault = () => { ev.defaultPrevented = true; };
    if (typeof ev.stopPropagation !== 'function') ev.stopPropagation = () => {};
    for (const fn of this.listeners.get(ev.type) || []) fn(ev);
    return true;
  }

  getBoundingClientRect() {
    const buttons = collectButtons(this);
    const selfButtons = this.tagName === 'BUTTON' ? [this] : [];
    const docButtons = globalThis.document && globalThis.document.documentElement
      ? globalThis.document.documentElement.descendants().filter((el) => el.tagName === 'BUTTON')
      : buttons;
    const idx = Math.max(0, docButtons.indexOf(this) >= 0 ? docButtons.indexOf(this) : selfButtons.length);
    const y = idx * 40;
    return { left: 24, top: y, width: 280, height: 32, right: 304, bottom: y + 32 };
  }

  focus() {
    if (globalThis.document) globalThis.document.activeElement = this;
  }
  blur() {
    if (globalThis.document && globalThis.document.activeElement === this) {
      globalThis.document.activeElement = globalThis.document.body;
    }
  }
  click() {
    this.dispatchEvent({ type: 'click', target: this, bubbles: true });
  }

  get isConnected() {
    let n = this;
    while (n) {
      if (globalThis.document && (n === globalThis.document.documentElement || n === globalThis.document.body)) {
        return true;
      }
      n = n.parentNode;
    }
    return false;
  }
}

function collectButtons(root) {
  if (!root || typeof root.descendants !== 'function') return [];
  return root.descendants().filter((el) => el.tagName === 'BUTTON');
}

function matchesAny(el, selector) {
  return String(selector).split(',').some((part) => matchesOne(el, part.trim()));
}

function matchesOne(el, sel) {
  if (!sel || !el || !el.tagName) return false;
  let rest = sel;
  const tagMatch = rest.match(/^[a-zA-Z][\w-]*/);
  if (tagMatch) {
    if (el.tagName !== tagMatch[0].toUpperCase()) return false;
    rest = rest.slice(tagMatch[0].length);
  }
  rest = rest.replace(/:not\(([^)]*)\)/g, (_, inner) => {
    if (inner.startsWith('[') && el.getAttribute(inner.slice(1, inner.indexOf('='))) === inner.split('=')[1]?.replace(/["\]]/g, '')) {
      return '__FAIL__';
    }
    return '';
  });
  if (rest.includes('__FAIL__')) return false;
  const tokens = rest.match(/(#[\w-]+|\.[\w-]+|\[[^\]]+\])/g) || [];
  if (!tagMatch && !tokens.length) return false;
  for (const t of tokens) {
    if (t[0] === '#') { if (el.id !== t.slice(1)) return false; continue; }
    if (t[0] === '.') { if (!el.classList.contains(t.slice(1))) return false; continue; }
    const m = t.slice(1, -1).match(/^([\w-]+)(?:([*^$]?=)"?([^"\]]*)"?)?$/);
    if (!m) return false;
    const val = el.getAttribute(m[1]);
    if (val == null) return false;
    if (m[2] && m[3] !== undefined && val !== m[3]) return false;
  }
  return true;
}

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input']);
function parseHtml(html) {
  const roots = [];
  const stack = [];
  const re = /<\/?([a-zA-Z][\w-]*)((?:\s+[\w-]+(?:=(?:"[^"]*"|'[^']*'))?)*)\s*\/?>|([^<]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[3] !== undefined) {
      if (stack.length && m[3].trim()) stack[stack.length - 1]._text += m[3];
      continue;
    }
    const tag = m[1].toLowerCase();
    if (m[0].startsWith('</')) { stack.pop(); continue; }
    const el = new El(tag);
    for (const a of String(m[2] || '').matchAll(/([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'))?/g)) {
      el.setAttribute(a[1], a[2] != null ? a[2] : (a[3] != null ? a[3] : ''));
    }
    if (stack.length) stack[stack.length - 1].appendChild(el);
    else roots.push(el);
    if (!VOID_TAGS.has(tag) && !m[0].endsWith('/>')) stack.push(el);
  }
  return roots;
}

function installDom() {
  const winListeners = new Map();
  const docListeners = new Map();
  const html = new El('html');
  const head = new El('head');
  const body = new El('body');
  html.appendChild(head);
  html.appendChild(body);

  const doc = {
    documentElement: html,
    head,
    body,
    activeElement: body,
    createElement: (tag) => new El(tag),
    createDocumentFragment() {
      const frag = new El('#fragment');
      frag.nodeType = 11;
      return frag;
    },
    getElementById: (id) => html.descendants().find((el) => el.id === id) || null,
    querySelector: (s) => html.querySelector(s) || body.querySelector(s),
    querySelectorAll: (s) => html.querySelectorAll(s),
    addEventListener(type, fn) {
      const list = docListeners.get(type) || [];
      list.push(fn);
      docListeners.set(type, list);
    },
    removeEventListener(type, fn) {
      docListeners.set(type, (docListeners.get(type) || []).filter((f) => f !== fn));
    },
  };

  const nav = { getGamepads: () => [] };
  const win = {
    innerWidth: 1280,
    innerHeight: 800,
    navigator: nav,
    document: doc,
    requestAnimationFrame(cb) { cb(0); return 0; },
    addEventListener(type, fn) {
      const list = winListeners.get(type) || [];
      list.push(fn);
      winListeners.set(type, list);
    },
    removeEventListener(type, fn) {
      winListeners.set(type, (winListeners.get(type) || []).filter((f) => f !== fn));
    },
  };

  globalThis.window = win;
  globalThis.document = doc;
  Object.defineProperty(globalThis, 'navigator', {
    value: nav, configurable: true, writable: true, enumerable: true,
  });
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  globalThis.addEventListener = win.addEventListener.bind(win);
  globalThis.removeEventListener = win.removeEventListener.bind(win);

  return { doc, body, docListeners };
}

function assertNoStalePauseLogCopy(text, label) {
  assert.doesNotMatch(
    String(text),
    /Start pause\/log|Start opens pause\/log/,
    `${label} must not claim Start directly opens pause/log`,
  );
}

// Player-facing copy (fatal): the route is Start → Pause → Mission Log, never "Start pause/log".
const promptsSrc = read('src/ui/controlPrompts.js');
const helpSrc = read('src/ui/screens/help.js');
const settingsSrc = read('src/ui/screens/settings.js');
assertNoStalePauseLogCopy(promptsSrc, 'controlPrompts.js');
assertNoStalePauseLogCopy(helpSrc, 'help.js');
assertNoStalePauseLogCopy(settingsSrc, 'settings.js');
if (args.copyFixture) {
  assertNoStalePauseLogCopy(readFileSync(args.copyFixture, 'utf8'), args.copyFixture);
}

const uiInputScan = stripJsComments(read('src/ui/input.js'));
const pauseScan = stripJsComments(read('src/ui/screens/pause.js'));
const helpScan = stripJsComments(helpSrc);
const promptsScan = stripJsComments(promptsSrc);
const missionLogScan = stripJsComments(read('src/ui/screens/missionLog.js'));
const screenManagerScan = stripJsComments(read('src/ui/screenManager.js'));

assert.match(promptsScan, /Start → Pause → Mission Log/,
  'gamepad flight prompt must state the truthful Start → Pause → Mission Log route');
assert.match(helpScan, /Start \/ Options → Pause → Mission Log/,
  'Help Controls must document the truthful gamepad route through Pause');
assert.doesNotMatch(uiInputScan, /gp\.actions\.missionLog/,
  'gamepad must not expose a direct missionLog action (route goes through Pause)');
assert.match(uiInputScan, /gp\.actions\.pause[\s\S]*?screenManager\.pushScreen\('pause'\)/,
  'gamepad Start/Options must open the Pause screen');
assert.match(pauseScan, /pushScreen', 'missionLog'|pushScreen\('missionLog'\)/,
  'pause menu must push the Mission Log screen');
assert.match(missionLogScan, /mgr\.popScreen\(\)/,
  'Mission Log must pop back to Pause');
assert.match(screenManagerScan, /function _focusableInside/,
  'ScreenManager must enumerate focusable elements for modal navigation');
assert.match(screenManagerScan, /function _ensureFocusIn/,
  'ScreenManager must keep focus trapped inside the active modal');

const { docListeners } = installDom();
const screens = document.createElement('div');
screens.id = 'screens';
document.body.appendChild(screens);
const backdrop = document.createElement('div');
backdrop.id = 'modal-backdrop';
backdrop.hidden = true;
document.body.appendChild(backdrop);
const hud = document.createElement('div');
hud.id = 'hud';
document.body.appendChild(hud);

const bus = createBus();
const state = {
  mode: 'flight',
  timeScale: 1,
  simTime: 10,
  ui: { docked: false, screenStack: [], trackedMissionId: null },
  settings: { controls: { gamepad: { enabled: true, deadzone: 0.12 } } },
  player: { credits: 0, cargo: { items: {}, usedVolume: 0, capVolume: 20 } },
  playerId: 'player',
  entities: new Map(),
  entityList: [],
  missions: { active: [], completedLog: [] },
  story: {},
  world: { currentSectorId: 'sector_helios' },
  fuel: { current: 80, max: 100 },
  nav: {},
};

const gp = {
  isConnected: () => true,
  tick() {},
  axes: { leftX: 0, leftY: 0 },
  actions: {
    pause: { pressed: false },
    accept: { pressed: false },
    cancel: { pressed: false },
    map: { pressed: false },
    codex: { pressed: false },
    cycleTarget: { pressed: false },
    tabPrev: { pressed: false },
    tabNext: { pressed: false },
  },
};

const ctx = {
  state,
  bus,
  gamepad: gp,
  registry: { get() { return null; } },
};

const manager = createScreenManager(ctx);
ctx.screenManager = manager;
manager.register(pauseScreen);
manager.register(missionLogScreen);

const input = createUiInput(ctx, manager);

function press(name) {
  for (const key of Object.keys(gp.actions)) gp.actions[key].pressed = false;
  gp.actions[name].pressed = true;
  input.tick(0.016);
  gp.actions[name].pressed = false;
}

function stickDown() {
  gp.axes.leftY = 1;
  input.tick(0.016);
  gp.axes.leftY = 0;
  input.tick(0.016);
}

function dispatchKey(key, code = key) {
  const ev = {
    key,
    code,
    target: document.body,
    shiftKey: false,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
  };
  for (const fn of docListeners.get('keydown') || []) fn(ev);
  return ev;
}

function pauseButtons() {
  const root = document.getElementById('screens');
  const screen = root && root.querySelectorAll('.screen').find((el) => el.dataset.screen === 'pause' && el.style.display !== 'none')
    || root && root.querySelectorAll('.screen').find((el) => el.dataset.screen === 'pause');
  return (screen ? screen.querySelectorAll('button') : []).filter((b) => !b.hidden && !b.disabled);
}

function missionLogButton() {
  return pauseButtons().find((b) => /Mission Log/i.test(b.textContent || ''));
}

assert.equal(manager.isOpen(), false, 'flight starts with an empty screen stack');
press('pause');
assert.equal(manager.top(), 'pause', 'gamepad Start must push Pause');
assert.match(String(document.activeElement && document.activeElement.textContent || ''), /Resume/i,
  'Pause onShow must focus Resume so controller navigation starts deterministically');

const logBtn = missionLogButton();
assert.ok(logBtn, 'Pause menu must expose a Mission Log button');
let hops = 0;
while (document.activeElement !== logBtn && hops < 24) {
  stickDown();
  hops += 1;
}
assert.equal(document.activeElement, logBtn,
  `gamepad down from Resume must reach Mission Log (stopped on "${document.activeElement && document.activeElement.textContent}")`);

press('accept');
assert.equal(manager.top(), 'missionLog', 'activating Mission Log on Pause must push the Mission Log screen');
console.log('ok    Start → Pause → focus Mission Log → Accept opens Mission Log');

press('cancel');
assert.equal(manager.top(), 'pause', 'gamepad B/Circle must pop Mission Log back to Pause');
console.log('ok    gamepad cancel pops Mission Log back to Pause');

press('accept');
assert.equal(manager.top(), 'missionLog', 're-activating Mission Log must open it again');
dispatchKey(BINDINGS.missionLog.key, BINDINGS.missionLog.code);
assert.equal(manager.top(), 'pause', 'Mission Log close key must pop back to Pause');
console.log('ok    Mission Log close key pops back to Pause');

press('cancel');
assert.equal(manager.top(), null, 'gamepad B from Pause must return to flight');
assert.equal(manager.isOpen(), false, 'back-nav from Pause must empty the stack');

input.dispose();
console.log('ok gamepad mission log reachability');
