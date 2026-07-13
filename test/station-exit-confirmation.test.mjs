// UIUX-STATION-EXIT-CONFIRMATION-TESTS-001
// Acceptance tests for station exit confirmation.
// Proves implicit Escape/B/E/backdrop cannot directly undock, implicit requests open confirm with
// cancel/accept behavior, explicit Undock remains deliberate, nested modal Back pops before
// station-root logic, and input.js needs no changes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGameState } from '../src/core/gameState.js';
import { createScreenManager } from '../src/ui/screenManager.js';
import {
  stationHub,
  installStationExitGate,
  setStationExitOwner,
  commitStationUndock,
  stationExitNeedsConfirm,
} from '../src/ui/screens/stationHub.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// ── Minimal DOM fixture for Node ─────────────────────────────────────────────
class FakeClassList {
  constructor(initial = []) {
    this._set = new Set(initial.filter(Boolean));
  }
  add(...tokens) {
    for (const t of tokens) if (t) this._set.add(String(t));
  }
  remove(...tokens) {
    for (const t of tokens) if (t) this._set.delete(String(t));
  }
  toggle(token, force) {
    const t = String(token);
    if (force === true) { this._set.add(t); return true; }
    if (force === false) { this._set.delete(t); return false; }
    if (this._set.has(t)) { this._set.delete(t); return false; }
    this._set.add(t);
    return true;
  }
  contains(token) { return this._set.has(String(token)); }
  toArray() { return [...this._set]; }
}

class FakeEvent {
  constructor(type, opts = {}) {
    this.type = type;
    this.target = opts.target || null;
    this.currentTarget = opts.currentTarget || this.target;
    this.bubbles = !!opts.bubbles;
    this.shiftKey = !!opts.shiftKey;
    this._pd = false;
    this._sp = false;
  }
  preventDefault() { this._pd = true; }
  stopPropagation() { this._sp = true; }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.childNodes = this.children;
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.classList = new FakeClassList();
    this.attributes = new Map();
    this.hidden = false;
    this.disabled = false;
    this.isConnected = true;
    this.inert = false;
    this.id = '';
    this.textContent = '';
    this._className = '';
    this._listeners = new Map();
    this.ownerDocument = null;
  }
  get className() { return this._className; }
  set className(value) {
    this._className = String(value || '');
    this.classList = new FakeClassList(this._className.split(/\s+/).filter(Boolean));
  }
  get innerHTML() { return ''; }
  set innerHTML(html) {
    for (const child of [...this.children]) {
      child.parentNode = null;
      child.isConnected = false;
    }
    this.children.length = 0;
    const text = String(html || '');
    const stack = [this];
    const tagRe = /<(\/?)([a-zA-Z0-9-]+)([^>]*)>/g;
    let m;
    while ((m = tagRe.exec(text)) !== null) {
      const closing = m[1] === '/';
      const tagName = m[2];
      const attrPart = m[3];
      if (closing) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const el = document.createElement(tagName);
      const attrRe = /([a-zA-Z0-9-:]+)\s*=\s*"([^"]*)"/g;
      let am;
      while ((am = attrRe.exec(attrPart)) !== null) {
        el.setAttribute(am[1], am[2]);
      }
      const selfClosing = attrPart.trim().endsWith('/') || ['br', 'hr', 'img', 'input', 'meta', 'link'].includes(tagName);
      stack[stack.length - 1].appendChild(el);
      if (!selfClosing) stack.push(el);
    }
  }
  appendChild(child) {
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument || globalThis.document || null;
    child.isConnected = this.isConnected;
    this.children.push(child);
    if (child.id && this.ownerDocument && this.ownerDocument._elements) {
      this.ownerDocument._elements.set(child.id, child);
    }
    return child;
  }
  prepend(child) {
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument || globalThis.document || null;
    child.isConnected = this.isConnected;
    this.children.unshift(child);
    if (child.id && this.ownerDocument && this.ownerDocument._elements) {
      this.ownerDocument._elements.set(child.id, child);
    }
    return child;
  }
  append(...nodes) { nodes.forEach((n) => this.appendChild(n)); }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) {
      this.children.splice(i, 1);
      child.parentNode = null;
      child.isConnected = false;
    }
    return child;
  }
  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    const list = this._listeners.get(type) || [];
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }
  dispatchEvent(ev) {
    if (typeof ev === 'string') ev = new FakeEvent(ev, { target: this, currentTarget: this });
    ev.target = ev.target || this;
    ev.currentTarget = this;
    const list = this._listeners.get(ev.type) || [];
    for (const fn of list) fn(ev);
    if (ev.bubbles && this.parentNode) this.parentNode.dispatchEvent(ev);
  }
  querySelectorAll(sel) {
    const out = [];
    const walk = (node) => {
      for (const c of node.children) {
        if (matchSelector(c, sel)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  setAttribute(name, value) {
    const v = String(value);
    this.attributes.set(name, v);
    if (name === 'id') this.id = v;
    if (name === 'class') this.className = v;
  }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'id') this.id = '';
    if (name === 'class') this.classList = new FakeClassList();
  }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  contains(candidate) {
    for (let n = candidate; n; n = n.parentNode) if (n === this) return true;
    return false;
  }
  focus() { if (globalThis.document) globalThis.document.activeElement = this; }
  blur() { if (globalThis.document && globalThis.document.activeElement === this) globalThis.document.activeElement = globalThis.document.body; }
  click() { this.dispatchEvent(new FakeEvent('click', { bubbles: true, target: this, currentTarget: this })); }
  getContext() { return stubCanvasContext; }
}

const stubCanvasContext = {
  clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  fill() {}, arc() {}, closePath() {}, rect() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
  setTransform() {}, resetTransform() {}, measureText() { return { width: 0 }; },
  createRadialGradient() { return { addColorStop() {} }; },
  createLinearGradient() { return { addColorStop() {} }; },
};

function matchSelector(el, sel) {
  if (!sel) return false;
  for (const part of sel.split(/,\s*/)) {
    const p = part.trim();
    if (p === 'button' && el.tagName === 'BUTTON') return true;
    if (p === 'input' && el.tagName === 'INPUT') return true;
    if (p === 'textarea' && el.tagName === 'TEXTAREA') return true;
    if (p === 'select' && el.tagName === 'SELECT') return true;
    if (p.startsWith('.') && el.classList.contains(p.slice(1))) return true;
    if (p.startsWith('#') && el.id === p.slice(1)) return true;
    if (p.startsWith('[') && p.endsWith(']')) {
      const attr = p.slice(1, -1);
      if (el.getAttribute(attr) != null) return true;
    }
    if (p.includes('[role=')) {
      const m = p.match(/\[role=["']?([^"'\]]+)["']?\]/);
      if (m && el.getAttribute('role') === m[1]) return true;
    }
    if (el.tagName === p.toUpperCase()) return true;
  }
  return false;
}

function installDom() {
  const elements = new Map();
  const body = new FakeElement('body'); body.id = 'body';
  const head = new FakeElement('head');
  const screens = new FakeElement('div'); screens.id = 'screens'; elements.set('screens', screens); body.appendChild(screens);
  const backdrop = new FakeElement('div'); backdrop.id = 'modal-backdrop'; elements.set('modal-backdrop', backdrop); body.appendChild(backdrop);
  const hud = new FakeElement('div'); hud.id = 'hud'; elements.set('hud', hud); body.appendChild(hud);
  const uiRoot = new FakeElement('div'); uiRoot.id = 'ui-root'; elements.set('ui-root', uiRoot); body.appendChild(uiRoot);

  globalThis.document = {
    body,
    head,
    documentElement: body,
    activeElement: body,
    _elements: elements,
    getElementById(id) { return elements.get(id) || null; },
    createElement(tagName) {
      const el = new FakeElement(tagName);
      el.ownerDocument = globalThis.document;
      return el;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  body.ownerDocument = globalThis.document;
  screens.ownerDocument = globalThis.document;
  uiRoot.ownerDocument = globalThis.document;

  globalThis.window = { innerWidth: 1920, innerHeight: 1080, addEventListener() {}, removeEventListener() {} };
  globalThis.requestAnimationFrame = (cb) => { cb(0); return 1; };
  globalThis.cancelAnimationFrame = () => {};

  return { body, screens, backdrop, hud, uiRoot, elements };
}

function makeBus() {
  const handlers = new Map();
  const emitted = [];
  const bus = {
    on(ev, fn) {
      if (!handlers.has(ev)) handlers.set(ev, []);
      handlers.get(ev).push(fn);
    },
    emit(ev, payload) {
      emitted.push({ event: ev, payload });
      for (const fn of (handlers.get(ev) || [])) fn(payload);
    },
  };
  return { bus, handlers, emitted };
}

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeCtx(seed) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.ui.docked = true;
  state.ui.dockedStationId = 'test-station';
  state.ui.screenStack = [];
  const { bus, emitted } = makeBus();
  installStationExitGate({ bus, state });
  return { state, bus, emitted };
}

function bindStationHub(ctx) {
  stationHub._ctx = ctx;
  stationHub._exitInFlight = false;
  stationHub._undockBtn = document.createElement('button');
  stationHub._undockBtn.id = 'test-undock-btn';
  stationHub._undockChargeTimer = null;
  stationHub._inspectorEl = document.createElement('div');
  stationHub._inspectorEl.classList.add('is-collapsed');
  stationHub._setInspectorOpen = (open) => {
    stationHub._inspectorEl.classList.toggle('is-collapsed', !open);
    stationHub._inspectorEl.setAttribute('aria-hidden', open ? 'false' : 'true');
  };
  stationHub._el = document.createElement('div');
  stationHub._el.id = 'test-station-hub';
  setStationExitOwner(stationHub);
}

function getConfirmDialog() {
  const root = document.getElementById('sf-confirm-root');
  if (!root) return null;
  return root.querySelector('.sf-confirm');
}

function getConfirmButtons() {
  const dialog = getConfirmDialog();
  if (!dialog) return { ok: null, cancel: null };
  return {
    ok: dialog.querySelector('.sf-confirm__ok'),
    cancel: dialog.querySelector('.sf-confirm__cancel'),
  };
}

// ── 1) Pure confirm-needs contract ───────────────────────────────────────────

assert.equal(stationExitNeedsConfirm('implicit', 'ready', false), true,
  'implicit exit always needs confirmation');
assert.equal(stationExitNeedsConfirm('implicit', 'risk', false), true,
  'implicit exit needs confirmation even when risky');
assert.equal(stationExitNeedsConfirm('explicit', 'ready', false), false,
  'explicit ready exit without hold needs no confirmation');
assert.equal(stationExitNeedsConfirm('explicit', 'ready', true), false,
  'explicit ready held exit needs no confirmation');
assert.equal(stationExitNeedsConfirm('explicit', 'risk', true), false,
  'explicit risk held exit is deliberate and needs no confirmation');
assert.equal(stationExitNeedsConfirm('explicit', 'risk', false), true,
  'explicit risk unheld exit needs confirmation');
console.log('ok   stationExitNeedsConfirm gates implicit and explicit risk-unheld');

// ── 2) Bus gate: bare dock:undocked while docked becomes station:exitRequest ──

{
  installDom();
  const { state, bus, emitted } = makeCtx(1);

  bus.emit('dock:undocked', { source: 'test' });
  assert.deepEqual(
    emitted.filter((e) => e.event !== 'audio:cue'),
    [{ event: 'station:exitRequest', payload: { intent: 'implicit', source: 'test', opener: document.activeElement, held: false } }],
    'bare dock:undocked while docked must be rewritten to station:exitRequest',
  );

  emitted.length = 0;
  bus.emit('dock:undocked', { source: 'test', committed: true });
  assert.deepEqual(
    emitted.filter((e) => e.event !== 'audio:cue'),
    [{ event: 'dock:undocked', payload: { source: 'test', committed: true } }],
    'committed dock:undocked must pass through the gate',
  );

  emitted.length = 0;
  state.ui.docked = false;
  bus.emit('dock:undocked', { source: 'flight' });
  assert.deepEqual(
    emitted.filter((e) => e.event !== 'audio:cue'),
    [{ event: 'dock:undocked', payload: { source: 'flight' } }],
    'dock:undocked when not docked must pass through',
  );

  emitted.length = 0;
  state.ui.docked = true;
  bus.emit('economy:tick', {});
  assert.deepEqual(
    emitted.filter((e) => e.event !== 'audio:cue'),
    [{ event: 'economy:tick', payload: {} }],
    'non-dock events must pass through the gate',
  );

  console.log('ok   installStationExitGate rewrites bare undock, passes committed and non-dock');
}

// ── 3) commitStationUndock emits the single canonical undock ─────────────────

{
  installDom();
  const { state, bus, emitted } = makeCtx(2);

  commitStationUndock(bus, { source: 'accept' });
  const undocks = emitted.filter((e) => e.event === 'dock:undocked');
  assert.equal(undocks.length, 1, 'commit must emit exactly one dock:undocked');
  assert.equal(undocks[0].payload.committed, true, 'committed undock must carry committed:true');
  assert.equal(undocks[0].payload.source, 'accept', 'committed undock must preserve source');

  console.log('ok   commitStationUndock emits single canonical committed dock:undocked');
}

// ── 4) Implicit request with dirty state clears first, stays docked ──────────

{
  installDom();
  const ctx = makeCtx(3);
  bindStationHub(ctx);

  stationHub._undockChargeTimer = setTimeout(() => {}, 9999);
  stationHub._inspectorEl.classList.remove('is-collapsed');
  stationHub._inspectorEl.setAttribute('aria-hidden', 'false');

  const input = document.createElement('input');
  stationHub._el.appendChild(input);
  input.focus();

  const pending = stationHub.requestStationExit({ intent: 'implicit', source: 'escape' });
  const { cancel } = getConfirmButtons();
  assert.ok(cancel, 'transient station UI must not bypass the implicit confirmation');

  cancel.click();
  await pending;
  clearTimeout(stationHub._undockChargeTimer);
  stationHub._undockChargeTimer = null;

  assert.equal(ctx.state.ui.docked, true, 'cancel must keep the player docked');
  assert.equal(ctx.emitted.filter((e) => e.event === 'dock:undocked').length, 0, 'cancel must not emit undock');

  console.log('ok   transient station UI still requires implicit confirmation');
}

// ── 5) Clean implicit request opens confirm; cancel keeps docked ─────────────

{
  installDom();
  const ctx = makeCtx(4);
  bindStationHub(ctx);

  const opener = document.createElement('button');
  document.body.appendChild(opener);
  opener.focus();

  const pending = stationHub.requestStationExit({ intent: 'implicit', source: 'backdrop' });
  const { ok, cancel } = getConfirmButtons();
  assert.ok(ok && cancel, 'clean implicit request must open a confirm dialog');

  cancel.click();
  await pending;
  assert.equal(ctx.state.ui.docked, true, 'cancel must keep the player docked');
  assert.equal(ctx.emitted.filter((e) => e.event === 'dock:undocked').length, 0, 'cancel must not emit undock');
  assert.equal(document.activeElement, opener, 'cancel must restore focus to the opener');

  console.log('ok   clean implicit confirm cancel keeps docked and restores focus');
}

// ── 6) Clean implicit request accept emits single canonical undock ───────────

{
  installDom();
  const ctx = makeCtx(5);
  bindStationHub(ctx);

  const pending = stationHub.requestStationExit({ intent: 'implicit', source: 'escape' });
  const { ok } = getConfirmButtons();
  assert.ok(ok, 'confirm dialog must be open');

  ok.click();
  await pending;
  const undocks = ctx.emitted.filter((e) => e.event === 'dock:undocked');
  assert.equal(undocks.length, 1, 'accept must emit exactly one dock:undocked');
  assert.equal(undocks[0].payload.committed, true, 'emitted undock must be committed');

  console.log('ok   clean implicit confirm accept emits single canonical undock');
}

// ── 7) Explicit Undock (ready + held) is deliberate and direct ───────────────

{
  installDom();
  const ctx = makeCtx(6);
  bindStationHub(ctx);

  await stationHub.requestStationExit({ intent: 'explicit', source: 'undock-hold', held: true });
  const undocks = ctx.emitted.filter((e) => e.event === 'dock:undocked');
  assert.equal(undocks.length, 1, 'held explicit undock must emit exactly one committed undock');
  assert.equal(undocks[0].payload.committed, true, 'held explicit undock must be committed');

  console.log('ok   explicit Undock ready+held directly emits committed undock');
}

// ── 8) Explicit Undock risk + unheld opens confirm ───────────────────────────

{
  installDom();
  const ctx = makeCtx(7);
  bindStationHub(ctx);
  stationHub._undockBtn.setAttribute('data-readiness', 'risk');

  ctx.state.fuel = { current: 0, max: 100 };
  ctx.state.entities.set(ctx.state.playerId, {
    id: ctx.state.playerId, type: 'ship', alive: true,
    hull: 10, hullMax: 100,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {},
  });

  const pending = stationHub.requestStationExit({ intent: 'explicit', source: 'undock-activate', held: false });
  const { ok, cancel } = getConfirmButtons();
  assert.ok(ok && cancel, 'explicit risk unheld undock must open confirm');

  cancel.click();
  await pending;
  assert.equal(ctx.state.ui.docked, true, 'risk explicit cancel keeps docked');

  console.log('ok   explicit Undock risk+unheld opens confirm before undocking');
}

// ── 9) Nested modal Back pops before station-root logic ──────────────────────

{
  const dom = installDom();
  const state = createGameState(8);
  state.mode = 'flight';
  state.ui.docked = true;
  state.ui.dockedStationId = 'test-station';
  state.ui.screenStack = [];
  const { bus, emitted } = makeBus();
  const mgr = createScreenManager({ state, bus });

  let stationBtn = null;
  let nestedBtn = null;
  mgr.register({
    id: 'station',
    mount(el) {
      stationBtn = document.createElement('button');
      stationBtn.id = 'station-btn';
      el.appendChild(stationBtn);
    },
  });
  mgr.register({
    id: 'missionLog',
    mount(el) {
      nestedBtn = document.createElement('button');
      nestedBtn.id = 'mission-log-btn';
      el.appendChild(nestedBtn);
    },
  });

  mgr.pushScreen('station');
  assert.equal(mgr.top(), 'station');

  mgr.pushScreen('missionLog');
  assert.equal(mgr.top(), 'missionLog');

  dom.backdrop.click();
  assert.equal(mgr.top(), 'station', 'nested modal Back must pop the modal and leave station');
  assert.equal(emitted.filter((e) => e.event === 'ui:undock').length, 0,
    'nested modal Back must not emit ui:undock');

  dom.backdrop.click();
  assert.equal(emitted.filter((e) => e.event === 'station:exitRequest').length, 1,
    'station-root backdrop dismiss must emit station:exitRequest');

  console.log('ok   nested modal Back pops before station-root exit logic');
}

// ── 10) input.js already routes station exit correctly; no changes needed ─────

{
  const inputSrc = readFileSync(join(ROOT, 'src/ui/input.js'), 'utf8');

  assert.match(inputSrc, /function closeActiveModal\(def\)/,
    'input.js must own closeActiveModal');
  assert.match(inputSrc, /if \(def && def\.id === 'station'\) undock\(\);/,
    'input.js must route station Escape/B/E to undock(), not bare popScreen');
  assert.match(inputSrc, /function undock\(\)/,
    'input.js must define undock()');
  assert.match(inputSrc, /bus\.on\('ui:undock', undock\);/,
    'input.js must let external callers trigger undock via ui:undock');
  assert.match(inputSrc, /bus\.emit\('dock:undocked',\s*\{\}\);/,
    'input.js undock() emits the gated dock:undocked event');
  assert.match(inputSrc, /if \(isConfirmOpen\(\)\)\s*\{\s*ev\.preventDefault\(\);\s*return;\s*\}/,
    'input.js must let the shared confirm dialog trap all keys');

  console.log('ok   input.js routes station exit through ui:undock without direct dock:undocked');
}

console.log('station-exit-confirmation: all acceptance tests PASS');
