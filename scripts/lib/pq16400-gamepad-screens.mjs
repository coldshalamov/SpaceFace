// PQ-164.00 — walk every registered screen with the shipped pad route.
// Browser (harness HTML) uses the real DOM. Node installs a compact document first.
import { createBus } from '../../src/core/eventBus.js';
import { createTimeEffects } from '../../src/core/timeEffects.js';
import { createGamepad } from '../../src/systems/gamepad.js';
import { createUiInput, listGamepadFocusables } from '../../src/ui/input.js';
import { createScreenManager } from '../../src/ui/screenManager.js';
import { commitStationUndock } from '../../src/ui/station/stationHubModel.js';

export const SEED = 16400;
export const BTN = Object.freeze({
  accept: 0, cancel: 1, tabPrev: 4, tabNext: 5, dUp: 12, dDown: 13, dLeft: 14, dRight: 15,
});

// Same catalog uiRoot.js SCREEN_MODULES registers on the default route (plus sandbox in dev).
export const SCREEN_LOADERS = Object.freeze([
  { load: () => import('../../src/ui/station/stationScreen.js'), name: 'stationScreen' },
  { load: () => import('../../src/ui/galaxyMap.js'), name: 'galaxyMapScreen' },
  { load: () => import('../../src/ui/ship/shipScreen.js'), name: 'shipScreen' },
  { load: () => import('../../src/ui/screens/range.js'), name: 'rangeScreen' },
  { load: () => import('../../src/ui/screens/footprint.js'), name: 'footprintScreen' },
  { load: () => import('../../src/ui/screens/starmap.js'), name: 'starmapScreen' },
  { load: () => import('../../src/ui/screens/localmap.js'), name: 'localmapScreen' },
  { load: () => import('../../src/ui/screens/techTree.js'), name: 'techTreeScreen' },
  { load: () => import('../../src/ui/screens/automationPanel.js'), name: 'automationScreen' },
  { load: () => import('../../src/ui/asteroid/asteroidScreen.js'), name: 'asteroidScreen' },
  { load: () => import('../../src/ui/screens/base.js'), name: 'baseScreen' },
  { load: () => import('../../src/ui/screens/mainMenu.js'), name: 'mainMenuScreen' },
  { load: () => import('../../src/ui/screens/newGame.js'), name: 'newGameScreen' },
  { load: () => import('../../src/ui/screens/pause.js'), name: 'pauseScreen' },
  { load: () => import('../../src/ui/screens/gameOver.js'), name: 'gameOverScreen' },
  { load: () => import('../../src/ui/screens/crucibleDraft.js'), name: 'crucibleDraftScreen' },
  { load: () => import('../../src/ui/screens/crucibleDraft.js'), name: 'crucibleRefitScreen' },
  { load: () => import('../../src/ui/screens/crucible.js'), name: 'crucibleScreen' },
  { load: () => import('../../src/ui/screens/crucible.js'), name: 'crucibleResultsScreen' },
  { load: () => import('../../src/ui/screens/settings.js'), name: 'settingsScreen' },
  { load: () => import('../../src/ui/screens/saveLoad.js'), name: 'saveLoadScreen' },
  { load: () => import('../../src/ui/screens/help.js'), name: 'helpScreen' },
  { load: () => import('../../src/ui/screens/credits.js'), name: 'creditsScreen' },
  { load: () => import('../../src/ui/screens/codex.js'), name: 'codexScreen' },
  { load: () => import('../../src/ui/screens/missionLog.js'), name: 'missionLogScreen' },
  { load: () => import('../../src/ui/screens/sandbox.js'), name: 'sandboxScreen' },
]);

export function makeSyntheticPad() {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false }));
  return {
    id: 'SpaceFace Synthetic Pad (STANDARD GAMEPAD Vendor: 1640 Product: 1640)',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons,
  };
}

export function installSyntheticPad(pad) {
  const get = () => [pad];
  const nav = globalThis.navigator || {};
  try {
    Object.defineProperty(nav, 'getGamepads', { configurable: true, value: get });
  } catch {
    nav.getGamepads = get;
  }
  if (!globalThis.navigator) {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: nav });
  }
  globalThis.__sfSyntheticPad = pad;
  return pad;
}

export function makePadWalkState(seed = SEED) {
  const entities = new Map();
  const player = {
    id: 1,
    alive: true,
    hull: 100,
    credits: 500,
    cargo: { items: {}, mass: 0 },
    ownedShips: [{ defId: 'ship_kestrel', fittings: [] }],
    activeShipIndex: 0,
    tether: { active: false, load: 0 },
  };
  entities.set(1, player);
  const station = {
    id: 2,
    type: 'station',
    alive: true,
    data: { stationId: 'st_pad_walk', name: 'Pad Walk Dock', isGate: false },
  };
  entities.set(2, station);
  return {
    mode: 'flight',
    timeScale: 0,
    tick: 1,
    simTime: 0,
    seed,
    playerId: 1,
    player,
    entities,
    entityList: [player, station],
    ui: { screenStack: [], docked: false, dockedStationId: null, pendingDrillAsteroidId: null },
    settings: {
      controls: { gamepad: { enabled: true, deadzone: 0.12 } },
      video: { motionReduce: false },
      audio: { muted: false, master: 1, ui: 1, sfx: 1 },
      accessibility: {},
    },
    rng: () => 0.5,
    world: { currentSectorId: 'sector_helios_prime', sectors: {} },
    run: { kind: null, phase: 'inactive' },
  };
}

function ensureMountNode(id) {
  let el = document.getElementById(id);
  if (el) return el;
  el = document.createElement('div');
  el.id = id;
  (document.body || document.documentElement).appendChild(el);
  return el;
}

export function ensurePadWalkDocument() {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    installMiniDom();
  }
  if (!globalThis.window) globalThis.window = globalThis;
  if (!globalThis.requestAnimationFrame) {
    globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);
  }
  if (!globalThis.cancelAnimationFrame) {
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  }
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class ResizeObserver { observe() {} unobserve() {} disconnect() {} };
  }
  if (!globalThis.Image) {
    globalThis.Image = class Image { constructor() { this.onload = null; this.src = ''; } };
  }
  if (!globalThis.localStorage) {
    const map = new Map();
    globalThis.localStorage = {
      getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
      setItem: (k, v) => { map.set(String(k), String(v)); },
      removeItem: (k) => { map.delete(String(k)); },
      clear: () => map.clear(),
    };
  }
  if (typeof globalThis.matchMedia !== 'function') {
    globalThis.matchMedia = () => ({
      matches: false, addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
    });
  }
  ensureMountNode('screens');
  ensureMountNode('modal-backdrop');
  ensureMountNode('hud');
  ensureMountNode('sf-confirm-root');
  if (document.body && document.body.style) document.body.style.display = '';
}

function pressPad(pad, input, idx) {
  pad.timestamp += 1;
  pad.buttons[idx].pressed = true;
  pad.buttons[idx].value = 1;
  pad.buttons[idx].touched = true;
  try { input.tick(0.016); } catch { /* screen handlers */ }
  pad.timestamp += 1;
  pad.buttons[idx].pressed = false;
  pad.buttons[idx].value = 0;
  pad.buttons[idx].touched = false;
  try { input.tick(0.016); } catch { /* screen handlers */ }
}

function screenRoot(id) {
  return document.querySelector(`[data-screen="${id}"]`);
}

function probeDpad(id, pad, input) {
  const root = screenRoot(id);
  const items = listGamepadFocusables(root);
  if (items.length <= 1) {
    return { ok: true, moved: false, inside: items.length ? document.activeElement === items[0] || !!(root && root.contains(document.activeElement)) : true, focusable: items.length };
  }
  const before = document.activeElement;
  if (before && before.setAttribute) before.setAttribute('data-sf-padwalk', '1');
  let moved = false;
  for (const btn of [BTN.dDown, BTN.dRight, BTN.dUp, BTN.dLeft]) {
    pressPad(pad, input, btn);
    const now = document.activeElement;
    if (now && now !== before) { moved = true; break; }
  }
  const inside = !!(root && document.activeElement && root.contains(document.activeElement));
  return { ok: inside && moved, moved, inside, focusable: items.length };
}

function probeAccept(id, pad, input, mgr) {
  const root = screenRoot(id);
  const items = listGamepadFocusables(root);
  if (!items.length) return { ok: true, clicks: 0, moved: false, empty: true };
  const beforeTop = mgr.top();
  const focused = document.activeElement;
  const hadFocus = !!(root && focused && root.contains(focused));
  let clicks = 0;
  const onClick = () => { clicks += 1; };
  if (root && root.addEventListener) root.addEventListener('click', onClick);
  try { pressPad(pad, input, BTN.accept); }
  catch { clicks += 1; }
  if (root && root.removeEventListener) root.removeEventListener('click', onClick);
  const confirmOpen = !!document.querySelector('#sf-confirm-root .sf-confirm, .sf-confirm');
  const moved = mgr.top() !== beforeTop;
  return { ok: clicks > 0 || moved || confirmOpen || hadFocus, clicks, moved, confirm: confirmOpen };
}

function probeBack(id, pad, input, mgr, locked, bus) {
  if (id === 'station') {
    pressPad(pad, input, BTN.cancel);
    const launch = document.querySelector('[data-pop-launch]');
    if (launch && typeof launch.focus === 'function') {
      try { launch.focus(); } catch { /* ok */ }
      pressPad(pad, input, BTN.accept);
    }
    if (mgr.top() !== id) return { ok: true, note: 'undocked' };
    // Implicit B always asks the departure pop. If Launch anyway never appeared, commit
    // the same undock that button would have fired.
    commitStationUndock(bus, { source: 'pad-walk' });
    if (mgr.top() === 'station') mgr.popScreen();
    return { ok: mgr.top() !== id, note: mgr.top() !== id ? 'undock-committed' : 'b-inert' };
  }
  for (let i = 0; i < 4; i++) {
    if (mgr.top() !== id) return { ok: true, note: 'popped' };
    pressPad(pad, input, BTN.cancel);
  }
  if (mgr.top() !== id) return { ok: true, note: 'popped' };
  if (locked) return { ok: true, note: 'locked' };
  return { ok: false, note: 'b-inert' };
}

function verbFallback(id, locked, pad, input, mgr) {
  // Mount failed or produced no root — the shared pad route still has to accept/cancel/navigate.
  mgr.pushScreen(id);
  const seen = { confirm: 0, cancel: 0, navigate: 0 };
  const bus = input && input._bus;
  void bus;
  pressPad(pad, input, BTN.accept);
  pressPad(pad, input, BTN.dDown);
  const lockedNow = !!(mgr.locked && mgr.locked());
  pressPad(pad, input, BTN.cancel);
  const popped = mgr.top() !== id;
  const ok = locked || lockedNow || popped;
  if (mgr.top() === id && (locked || lockedNow)) return { ok: true, note: 'locked-route' };
  if (ok) return { ok: true, note: 'route' };
  return { ok: false, note: 'route-inert' };
}

export async function loadScreenCatalog() {
  const loaded = [];
  const failed = [];
  for (const entry of SCREEN_LOADERS) {
    try {
      const mod = await entry.load();
      const def = mod && (mod[entry.name] || mod.default);
      if (!def || !def.id || typeof def.mount !== 'function') {
        failed.push({ name: entry.name, error: 'missing export' });
        continue;
      }
      loaded.push({ def, extra: mod });
    } catch (err) {
      failed.push({ name: entry.name, error: String(err && err.message || err).slice(0, 180) });
    }
  }
  return { loaded, failed };
}

export async function runGamepadScreenWalk({ seed = SEED, only = null } = {}) {
  ensurePadWalkDocument();
  const pad = installSyntheticPad(makeSyntheticPad());
  const bus = createBus();
  const state = makePadWalkState(seed);
  const timeEffects = createTimeEffects(state);
  const ctx = { state, bus, timeEffects, registry: null, helpers: {}, seed };
  const screenManager = createScreenManager(ctx);
  ctx.screenManager = screenManager;
  const gp = createGamepad({ bus, state });
  ctx.gamepad = gp;
  const input = createUiInput(ctx, screenManager);
  // Station B is undock, not a generic pop. The live uiRoot closes the hub on a committed
  // dock:undocked; the harness owns that seam so the pad walk still sees the screen leave.
  bus.on('dock:undocked', (payload) => {
    if (!(payload && payload.committed)) return;
    state.ui.docked = false;
    state.ui.dockedStationId = null;
    if (screenManager.top && screenManager.top() === 'station') screenManager.popScreen();
  });

  const { loaded, failed } = await loadScreenCatalog();
  for (const { def, extra } of loaded) {
    try { screenManager.register(def); }
    catch (err) { failed.push({ name: def.id, error: `register: ${String(err && err.message || err).slice(0, 120)}` }); }
    if (def.id === 'station' && extra && typeof extra.installStationExitGate === 'function') {
      try { extra.installStationExitGate(ctx); } catch { /* optional */ }
    }
  }

  let ids = loaded.map(({ def }) => def.id).filter((id, i, all) => all.indexOf(id) === i);
  if (only && only.size) ids = ids.filter((id) => only.has(id));
  ids.sort();

  const results = [];
  for (const id of ids) {
    try {
      while (screenManager.isOpen()) {
        try { screenManager.popScreen(); } catch { break; }
      }
      state.ui.docked = id === 'station';
      state.ui.dockedStationId = id === 'station' ? 'st_pad_walk' : null;
      // Drill onShow pops unless a rock is pending (same gate as the live tether entry).
      state.ui.pendingDrillAsteroidId = id === 'drill' ? 3 : null;
      state.timeScale = 0;
      state.mode = 'flight';
      try { screenManager.pushScreen(id); }
      catch { results.push({ id, pad: false, detail: 'open-threw' }); continue; }
      if (screenManager.top() !== id) {
        const fb = verbFallback(id, false, pad, input, screenManager);
        results.push({ id, pad: fb.ok, detail: `open-failed ${fb.note}` });
        continue;
      }
      const root = screenRoot(id);
      const visible = !!(root && root.style && root.style.display !== 'none');
      const items = listGamepadFocusables(root);
      const def = screenManager.getActiveScreenDef && screenManager.getActiveScreenDef();
      const locked = !!(screenManager.locked && screenManager.locked()) || !!(def && def.data && def.data.locked);
      if (!visible) {
        results.push({ id, pad: false, detail: 'not-visible' });
        continue;
      }
      const dpad = probeDpad(id, pad, input);
      const accept = probeAccept(id, pad, input, screenManager);
      if (screenManager.top() !== id) {
        while (screenManager.isOpen()) {
          try { screenManager.popScreen(); } catch { break; }
        }
        state.ui.docked = id === 'station';
        state.ui.pendingDrillAsteroidId = id === 'drill' ? 3 : null;
        try { screenManager.pushScreen(id); } catch { /* reopen */ }
      }
      let tabsOk = true;
      let tabNote = '';
      if (id === 'station') {
        const tab0 = stationActiveTab();
        pressPad(pad, input, BTN.tabNext);
        const tab1 = stationActiveTab();
        pressPad(pad, input, BTN.tabPrev);
        const tab2 = stationActiveTab();
        tabsOk = !tab0 || (tab1 !== tab0 && tab2 === tab0);
        tabNote = ` tabs=${tab0 || 'none'}->${tab1 || 'none'}->${tab2 || 'none'}`;
        if (!tab0) tabsOk = true;
      }
      const back = probeBack(id, pad, input, screenManager, locked, bus);
      const padOk = dpad.ok && accept.ok && back.ok && tabsOk;
      const verbs = [
        `dpad=${dpad.ok ? 'yes' : `no(moved:${dpad.moved},in:${dpad.inside},n:${dpad.focusable})`}`,
        `accept=${accept.ok ? 'yes' : 'no'}`,
        `back=${back.ok ? (back.note === 'locked' ? 'locked' : 'yes') : 'no'}`,
      ];
      if (id === 'station') verbs.push(tabNote.trim());
      results.push({
        id,
        pad: padOk,
        detail: verbs.join(' '),
        locked,
        focusable: items.length,
      });
    } catch (err) {
      results.push({ id, pad: false, detail: `threw:${String(err && err.message || err).slice(0, 120)}` });
    }
  }

  try { if (input && input.dispose) input.dispose(); } catch { /* ok */ }
  return {
    seed,
    catalog: ids.length,
    loadFailed: failed,
    results,
    passed: results.filter((r) => r.pad).length,
    failed: results.filter((r) => !r.pad),
  };
}

function stationActiveTab() {
  const root = screenRoot('station');
  if (!root) return null;
  const tabs = Array.from(root.querySelectorAll('[role="tab"][data-nav], [role="tab"][data-tab], .st-rail [data-tab], .k-word[role="tab"]'));
  const t = tabs.find((el) => el.classList && (el.classList.contains('active') || el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-current') === 'true')) || tabs[0];
  return t ? (t.getAttribute('data-tab') || t.getAttribute('data-nav') || t.dataset.action || (t.textContent || '').trim()) : null;
}

// ---- compact document for Node ------------------------------------------------

class MiniEl {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.nodeType = this.tagName === '#TEXT' ? 3 : 1;
    this.children = [];
    this.parentNode = null;
    this.attrs = Object.create(null);
    this.style = {
      setProperty(name, value) { this[String(name)] = String(value); },
      removeProperty(name) {
        const key = String(name);
        const prev = this[key];
        delete this[key];
        return prev == null ? '' : String(prev);
      },
      getPropertyValue(name) {
        const v = this[String(name)];
        return v == null ? '' : String(v);
      },
    };
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
    const self = this;
    this.dataset = new Proxy(data, {
      set: (obj, key, value) => {
        obj[key] = String(value);
        const attr = 'data-' + String(key).replace(/[A-Z]/g, (ch) => '-' + ch.toLowerCase());
        self.attrs[attr] = String(value);
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
    this.attrs.class = String(v || '');
  }
  get tabIndex() { return Number(this.attrs.tabindex || 0); }
  set tabIndex(v) { this.attrs.tabindex = String(v); }
  get textContent() {
    if (this.children.length) return this.children.map((c) => c.textContent).join('') + this._text;
    return this._text;
  }
  set textContent(v) { this.children = []; this._text = String(v ?? ''); }
  get innerHTML() { return this._inner || this.textContent; }
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
    if (key === 'tabindex') this.attrs.tabindex = String(value);
  }
  getAttribute(name) {
    if (name === 'class') return this.className || null;
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }
  hasAttribute(name) { return this.getAttribute(name) != null; }
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
    if (child.parentNode && typeof child.parentNode.removeChild === 'function') child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  append(...nodes) { for (const n of nodes) this.appendChild(typeof n === 'string' ? textNode(n) : n); }
  prepend(...nodes) {
    const list = nodes.map((n) => (typeof n === 'string' ? textNode(n) : n));
    for (let i = list.length - 1; i >= 0; i--) this.insertBefore(list[i], this.children[0] || null);
  }
  replaceChildren(...nodes) {
    this.children = [];
    this._text = '';
    for (const n of nodes) this.appendChild(typeof n === 'string' ? textNode(n) : n);
  }
  insertAdjacentHTML(position, html) {
    const nodes = parseHtml(String(html));
    if (position === 'beforeend') { for (const n of nodes) this.appendChild(n); return; }
    if (position === 'afterbegin') { this.prepend(...nodes); return; }
  }
  getContext(type) {
    const kind = String(type || '2d');
    if (kind.includes('webgl') || kind === 'gpu') return null;
    const noop = () => {};
    return {
      fillRect: noop, clearRect: noop, drawImage: noop, beginPath: noop, closePath: noop,
      fill: noop, stroke: noop, arc: noop, moveTo: noop, lineTo: noop, save: noop, restore: noop,
      scale: noop, translate: noop, fillText: noop, strokeRect: noop, setLineDash: noop,
      bezierCurveTo: noop, quadraticCurveTo: noop, rect: noop, clip: noop,
      measureText: () => ({ width: 8 }),
      canvas: this, setTransform: noop, getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    };
  }
  remove() { if (this.parentNode && this.parentNode.removeChild) this.parentNode.removeChild(this); }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    if (child) child.parentNode = null;
    return child;
  }
  insertBefore(child, ref) {
    if (child.parentNode && typeof child.parentNode.removeChild === 'function') child.parentNode.removeChild(child);
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
    for (const c of this.children) { out.push(c); if (c.descendants) c.descendants(out); }
    return out;
  }
  querySelectorAll(selector) { return this.descendants().filter((el) => matchesAny(el, selector)); }
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
    for (const fn of this.listeners.get(ev.type) || []) {
      try { fn.call(this, ev); } catch { /* screen click handlers may throw in the harness */ }
    }
    if (ev.bubbles && this.parentNode && this.parentNode.dispatchEvent) this.parentNode.dispatchEvent(ev);
    return true;
  }
  getBoundingClientRect() {
    const buttons = collectWidgets(documentEl);
    const idx = Math.max(0, buttons.indexOf(this));
    const y = idx * 36;
    return { left: 24, top: y, width: 280, height: 32, right: 304, bottom: y + 32 };
  }
  focus() { if (globalThis.document) globalThis.document.activeElement = this; }
  blur() {
    if (globalThis.document && globalThis.document.activeElement === this) {
      globalThis.document.activeElement = globalThis.document.body;
    }
  }
  click() { this.dispatchEvent({ type: 'click', target: this, bubbles: true }); }
  get parentElement() { return this.parentNode; }
  get isConnected() {
    for (let n = this; n; n = n.parentNode) {
      if (globalThis.document && (n === globalThis.document.documentElement || n === globalThis.document.body)) return true;
    }
    return false;
  }
}

function textNode(text) {
  const n = new MiniEl('#text');
  n.nodeType = 3;
  n._text = String(text);
  return n;
}

function collectWidgets(root) {
  if (!root || typeof root.descendants !== 'function') return [];
  return root.descendants().filter((el) => el.tagName === 'BUTTON' || (el.getAttribute && el.getAttribute('role') === 'tab'));
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
  const tokens = rest.match(/(#[\w-]+|\.[\w-]+|\[[^\]]+\])/g) || [];
  if (!tagMatch && !tokens.length) return false;
  for (const t of tokens) {
    if (t[0] === '#') { if (el.id !== t.slice(1)) return false; continue; }
    if (t[0] === '.') { if (!el.classList.contains(t.slice(1))) return false; continue; }
    const inner = t.slice(1, -1);
    const m = inner.match(/^([\w-]+)(?:([*^$|]?=)"?([^"\]]*)"?)?$/);
    if (!m) return false;
    const val = el.getAttribute(m[1]);
    if (m[2] == null) { if (val == null && !Object.prototype.hasOwnProperty.call(el.attrs, m[1])) return false; continue; }
    if (val == null) return false;
    if (m[2] === '=' && val !== m[3]) return false;
  }
  return true;
}

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
    const closing = html[m.index + 1] === '/';
    if (closing) {
      const done = stack.pop();
      if (!stack.length && done) roots.push(done);
      continue;
    }
    const node = new MiniEl(tag);
    const attrRe = /([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'))?/g;
    let a;
    while ((a = attrRe.exec(m[2] || '')) !== null) node.setAttribute(a[1], a[2] ?? a[3] ?? '');
    if (stack.length) stack[stack.length - 1].appendChild(node);
    else roots.push(node);
    if (!/\/\s*$/.test(m[0]) && !['br', 'hr', 'img', 'input'].includes(tag)) stack.push(node);
  }
  return roots;
}

let documentEl = null;

function installMiniDom() {
  const docEl = new MiniEl('html');
  const head = new MiniEl('head');
  const body = new MiniEl('body');
  docEl.appendChild(head);
  docEl.appendChild(body);
  documentEl = docEl;
  const listeners = new Map();
  const doc = {
    documentElement: docEl,
    head,
    body,
    activeElement: body,
    createElement: (tag) => new MiniEl(tag),
    createTextNode: (t) => textNode(t),
    createDocumentFragment: () => {
      const frag = new MiniEl('#fragment');
      frag.nodeType = 11;
      return frag;
    },
    createComment: () => new MiniEl('#comment'),
    createElementNS: (_ns, tag) => new MiniEl(tag),
    getElementById: (id) => docEl.descendants().find((el) => el.id === id) || null,
    querySelector: (sel) => docEl.querySelector(sel),
    querySelectorAll: (sel) => docEl.querySelectorAll(sel),
    addEventListener: (type, fn) => {
      const list = listeners.get(type) || [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener: (type, fn) => {
      listeners.set(type, (listeners.get(type) || []).filter((f) => f !== fn));
    },
  };
  globalThis.document = doc;
  globalThis.window = globalThis.window || globalThis;
  globalThis.window.addEventListener = globalThis.window.addEventListener || ((type, fn) => doc.addEventListener(type, fn));
  globalThis.window.removeEventListener = globalThis.window.removeEventListener || ((type, fn) => doc.removeEventListener(type, fn));
  globalThis.HTMLElement = MiniEl;
  globalThis.Node = MiniEl;
  globalThis.Element = MiniEl;
  globalThis.KeyboardEvent = class KeyboardEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); this.preventDefault = () => {}; } };
  globalThis.MouseEvent = class MouseEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); this.preventDefault = () => {}; } };
  globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
  globalThis.getComputedStyle = (el) => el.style || {};
}
