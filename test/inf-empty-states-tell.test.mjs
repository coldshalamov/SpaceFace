// Empty states that tell a tiny story (seed: "empty states that tell a tiny story"). The bar's
// quiet rail and empty stage carry the contracts-board treatment — why it is quiet and a way out
// — and the mission log's settlement and corridor tapes say what writes their first line. The
// bar's empty branches are real edges (Borrowed Sun before its projection exists); the mission
// log's are every new save's first minute. Local DOM double follows INF-095; no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createBarScreen } from '../src/ui/station/screens/bar.js';

let domWrites = 0;

class FakeEl {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.parentNode = null;
    this.hidden = false;
    this.isConnected = true;
    this.className = '';
    this._listeners = {};
    this._bySel = new Map();
    this._cls = new Set();
    let text = '';
    let html = '';
    Object.defineProperty(this, 'textContent', {
      get: () => text,
      set: (v) => { text = String(v); domWrites += 1; },
      configurable: true,
    });
    Object.defineProperty(this, 'innerHTML', {
      get: () => html,
      set: (v) => { html = String(v); this._hasHtml = html.length > 0; domWrites += 1; },
      configurable: true,
    });
    this.classList = {
      add: (...n) => n.forEach((x) => this._cls.add(x)),
      remove: (...n) => n.forEach((x) => this._cls.delete(x)),
      toggle: (n, force) => {
        const on = force === undefined ? !this._cls.has(n) : !!force;
        if (on) this._cls.add(n); else this._cls.delete(n);
        return on;
      },
      contains: (n) => this._cls.has(n),
    };
  }
  get firstChild() {
    if (this.children.length) return this.children[0];
    if (this._hasHtml) {
      if (!this._implicit) { this._implicit = new FakeEl('div'); this._implicit.parentNode = this; }
      return this._implicit;
    }
    return null;
  }
  querySelector(sel) {
    if (!this._bySel.has(sel)) {
      const child = new FakeEl('div');
      child._hasHtml = true;
      this._bySel.set(sel, child);
    }
    return this._bySel.get(sel);
  }
  querySelectorAll() { return []; }
  getElementsByClassName() { return []; }
  appendChild(child) { this.children.push(child); if (child) child.parentNode = this; return child; }
  append(...nodes) { nodes.flat().forEach((n) => { if (typeof n === 'string') return; this.appendChild(n); }); }
  prepend(...nodes) { nodes.flat().forEach((n) => { if (typeof n === 'string') return; this.appendChild(n); }); }
  replaceChildren(...nodes) {
    for (const c of this.children) if (c) c.parentNode = null;
    this.children = [];
    this.append(...nodes);
  }
  removeChild(child) { const at = this.children.indexOf(child); if (at >= 0) this.children.splice(at, 1); return child; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  removeEventListener() {}
  setAttribute(k, v) { this.attributes[String(k)] = String(v); }
  getAttribute(k) { return this.attributes[String(k)] ?? null; }
  removeAttribute(k) { delete this.attributes[String(k)]; }
  hasAttribute(k) { return String(k) in this.attributes; }
  closest() { return null; }
  contains() { return false; }
  focus() {}
  insertAdjacentElement(pos, node) { this.parentNode ? this.parentNode.appendChild(node) : this.appendChild(node); return node; }
}

/** Deep text of a mounted FakeEl subtree — the data state nests headline/fills two levels down. */
function deepText(node) {
  if (!node) return '';
  const own = typeof node.textContent === 'string' ? node.textContent : '';
  return (own + ' ' + (node.children || []).map(deepText).join(' ')).trim();
}

/** Find the real mounted data-state node in a children tree (querySelector mints empty doubles). */
function findState(node) {
  if (!node) return null;
  if (node.attributes && node.attributes['data-sf-state']) return node;
  for (const c of node.children || []) {
    const hit = findState(c);
    if (hit) return hit;
  }
  return null;
}

function installDom() {
  const prev = {
    document: globalThis.document,
    window: globalThis.window,
    raf: globalThis.requestAnimationFrame,
    caf: globalThis.cancelAnimationFrame,
    gcs: globalThis.getComputedStyle,
  };
  const head = new FakeEl('head');
  const body = new FakeEl('body');
  globalThis.document = {
    createElement: (tag) => new FakeEl(tag),
    getElementById: () => null,
    head,
    body,
    activeElement: null,
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
  };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  return () => {
    if (prev.document === undefined) delete globalThis.document; else globalThis.document = prev.document;
    if (prev.window === undefined) delete globalThis.window; else globalThis.window = prev.window;
    if (prev.raf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = prev.raf;
    if (prev.caf === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = prev.caf;
    if (prev.gcs === undefined) delete globalThis.getComputedStyle; else globalThis.getComputedStyle = prev.gcs;
  };
}

function emptyBarState() {
  const state = createGameState(4242);
  state.player.name = 'Wren';
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [] }];
  state.player.activeShipIndex = 0;
  state.ui.docked = true;
  // Borrowed Sun before its sector projection exists: the one real empty bar (generateContacts
  // returns [] exactly here).
  state.ui.dockedStationId = 'station_borrowed_sun';
  state.ui.screenStack = ['station'];
  state.mode = 'flight';
  return state;
}

test('the quiet bar rail says why it is quiet and offers the way out', () => {
  const restore = installDom(); try {
    const screen = createBarScreen({ state: emptyBarState(), bus: createBus() });
    screen.onShow();
    const rail = screen.el.querySelector('.sx-bar__rail');
    assert.match(rail.innerHTML || '', /Here tonight/);
    const stateEl = findState(rail);
    assert.ok(stateEl, 'the compact state mounts under the rail header');
    const text = deepText(stateEl);
    assert.match(text, /Nobody in tonight/, 'the quiet headline');
    assert.match(text, /day shift at busier berths/, 'the why');
    assert.match(text, /Open the Chart/, 'the way out');
    screen.dispose();
  } finally { restore(); }
});

test('the empty bar stage keeps its story and its verb', () => {
  const restore = installDom(); try {
    const screen = createBarScreen({ state: emptyBarState(), bus: createBus() });
    screen.onShow();
    const stage = screen.el.querySelector('.sx-bar__stage');
    const stateEl = findState(stage);
    assert.ok(stateEl, 'the stage mounts the data state');
    const text = deepText(stateEl);
    assert.match(text, /The bar is empty tonight/, 'the headline');
    assert.match(text, /larger station keeps its regulars later/, 'the why');
    assert.match(text, /Open the Chart/, 'the way out');
    screen.dispose();
  } finally { restore(); }
});

test('the mission log tapes say what writes their first line', async () => {
  const restore = installDom(); try {
    const mod = await import('../src/ui/screens/missionLog.js');
    const screen = Object.create(mod.missionLogScreen);
    screen._compListEl = globalThis.document.createElement('div');
    screen._ctx = { state: { simTime: 0, missions: {}, encounterDirector: {} } };
    screen._renderCompleted();
    assert.match(screen._compListEl.innerHTML, /No settlement receipts yet\. The ledger writes its first line the first time a job pays out\./);
    screen._corrListEl = globalThis.document.createElement('div');
    screen._renderCorridorLog();
    assert.match(screen._corrListEl.innerHTML, /Nothing in the corridor log yet\. What happens out there writes itself in here\./);
  } finally { restore(); }
});
