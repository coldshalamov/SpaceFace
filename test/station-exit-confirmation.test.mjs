// UIUX-STATION-EXIT-CONFIRMATION-TESTS-001
// Acceptance tests for station exit confirmation.
// Proves implicit Escape/B/E/backdrop cannot directly undock, implicit requests open the live
// Departure Check with cancel/accept behavior, explicit Undock remains deliberate, nested modal
// Back pops before station-root logic, and input.js needs no changes.
//
// The live docked station is the "Orbital Command" shell (src/ui/station/stationApp.js wrapped by
// stationScreen.js). These tests mount the real app on a minimal fake DOM and drive the shipped
// exit path: bus gate → station:exitRequest → app.requestStationExit → Departure Check popover →
// "Launch Anyway" / dismiss.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGameState } from '../src/core/gameState.js';
import { createScreenManager } from '../src/ui/screenManager.js';
import {
  installStationExitGate,
  setStationExitOwner,
  commitStationUndock,
  stationExitNeedsConfirm,
} from '../src/ui/station/stationHubModel.js';
import { createStationApp } from '../src/ui/station/stationApp.js';
import { serviceQuote } from '../src/ui/station/serviceQuotes.js';
import { createScreenMemory } from '../src/ui/screenMemory.js';

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
    this.key = opts.key || null;
    this._pd = false;
    this._sp = false;
  }
  preventDefault() { this._pd = true; }
  stopPropagation() { this._sp = true; }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    // floating-ui (and DOM code generally) keys off nodeName; '#text' keeps text nodes inert.
    this.nodeName = this.tagName === '#TEXT' ? '#text' : this.tagName.toLowerCase();
    this.children = [];
    this.childNodes = this.children;
    this.parentNode = null;
    this.style = {
      setProperty(k, v) { this[k] = String(v); },
      getPropertyValue(k) { return this[k] != null ? String(this[k]) : ''; },
    };
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
  get firstChild() { return this.children[0] || null; }
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
    let last = 0;
    let m;
    const appendText = (raw) => {
      if (!raw) return;
      const top = stack[stack.length - 1];
      const tn = new FakeElement('#text');
      tn.textContent = raw;
      top.appendChild(tn);
    };
    while ((m = tagRe.exec(text)) !== null) {
      appendText(text.slice(last, m.index));
      last = tagRe.lastIndex;
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
      // Valueless attributes (data-market-search, inert, ...) exist as empty-string attributes.
      const bareRe = /(^|\s)([a-zA-Z0-9-:]+)(?=[\s/]|$)/g;
      let bm;
      while ((bm = bareRe.exec(attrPart)) !== null) {
        if (!el.hasAttribute(bm[2])) el.setAttribute(bm[2], '');
      }
      const selfClosing = attrPart.trim().endsWith('/') || ['br', 'hr', 'img', 'input', 'meta', 'link'].includes(tagName);
      stack[stack.length - 1].appendChild(el);
      if (!selfClosing) stack.push(el);
    }
    appendText(text.slice(last));
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
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }
  replaceChildren(...nodes) {
    for (const child of [...this.children]) {
      child.parentNode = null;
      child.isConnected = false;
    }
    this.children.length = 0;
    for (const n of nodes) this.appendChild(n);
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
  closest(sel) {
    for (let n = this; n; n = n.parentNode) {
      if (matchSelector(n, sel)) return n;
    }
    return null;
  }
  getBoundingClientRect() {
    return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
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
    if (name === 'hidden') this.hidden = true;
  }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'id') this.id = '';
    if (name === 'class') this.className = '';
  }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
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
      const equals = attr.match(/^([^=]+)=["']?([^"']*)["']?$/);
      if (equals ? el.getAttribute(equals[1]) === equals[2] : el.getAttribute(attr) != null) return true;
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

  globalThis.window = {
    innerWidth: 1920,
    innerHeight: 1080,
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle() {
      return { getPropertyValue() { return ''; } };
    },
  };
  globalThis.requestAnimationFrame = (cb) => { cb(0); return 1; };
  globalThis.cancelAnimationFrame = () => {};
  // floating-ui identity/observer seams (pop positioning only; zero-size rects are fine).
  globalThis.Node = FakeElement;
  globalThis.Element = FakeElement;
  globalThis.HTMLElement = FakeElement;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };

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
    off(ev, fn) {
      const list = handlers.get(ev) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
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
  state.ui.dockedStationId = 'station_helios';
  state.ui.screenStack = [];
  state.playerId = 1;
  state.entities = new Map([[1, {
    id: 1, type: 'ship', alive: true, hull: 100, hullMax: 100,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {},
  }]]);
  state.entityList = [state.entities.get(1)];
  state.fuel = { current: 100, max: 100 };
  const { bus, emitted } = makeBus();
  installStationExitGate({ bus, state });
  return { state, bus, emitted };
}

function undocks(emitted) {
  return emitted.filter((e) => e.event === 'dock:undocked');
}

// Mounts the live station app and returns { app, pop } for exit-flow assertions.
function mountStationApp(ctx, options = {}) {
  const rootEl = document.createElement('div');
  rootEl.id = 'station-root';
  document.body.appendChild(rootEl);
  const app = createStationApp(rootEl, ctx, options);
  const pop = rootEl.querySelector('.sx-pop');
  return { app, pop, rootEl };
}

function launchAnywayButton(pop) {
  return pop && pop.querySelector('[data-pop-launch]');
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
  const { bus, emitted } = makeCtx(2);

  commitStationUndock(bus, { source: 'accept' });
  const list = undocks(emitted);
  assert.equal(list.length, 1, 'commit must emit exactly one dock:undocked');
  assert.equal(list[0].payload.committed, true, 'committed undock must carry committed:true');
  assert.equal(list[0].payload.source, 'accept', 'committed undock must preserve source');

  console.log('ok   commitStationUndock emits single canonical committed dock:undocked');
}

// ── 4) Implicit exit opens the live Departure Check and stays docked ─────────

{
  installDom();
  const ctx = makeCtx(3);
  mountStationApp(ctx);
  ctx.emitted.length = 0;

  ctx.bus.emit('dock:undocked', { source: 'escape' });

  const list = undocks(ctx.emitted);
  assert.equal(list.length, 0, 'implicit exit must not undock directly');
  assert.equal(ctx.state.ui.docked, true, 'implicit exit must keep the player docked');
  console.log('ok   bare implicit undock is rewritten and committed by the shell only');
}

// ── 5) Implicit request opens the Departure Check; dismissing keeps docked ───

{
  installDom();
  const ctx = makeCtx(4);
  const { pop } = mountStationApp(ctx);
  ctx.emitted.length = 0;

  ctx.bus.emit('station:exitRequest', { intent: 'implicit', source: 'backdrop' });
  assert.equal(pop.hidden, false, 'clean implicit request must open the Departure Check popover');
  assert.ok(pop.querySelector('[data-pop-launch]'), 'Departure Check must expose Launch Anyway');
  assert.equal(undocks(ctx.emitted).length, 0, 'no undock while the check is open');

  // Dismiss (click outside the popover and its anchor) — the player stays docked.
  const appEl = pop.closest('.sx-app');
  appEl.dispatchEvent(new FakeEvent('click', { target: appEl, currentTarget: appEl }));
  assert.equal(pop.hidden, false, 'dismiss defers the hide by a frame (150ms timer pending)');
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(pop.hidden, true, 'dismiss must close the Departure Check');
  assert.equal(ctx.state.ui.docked, true, 'dismiss must keep the player docked');
  assert.equal(undocks(ctx.emitted).length, 0, 'dismiss must not emit undock');

  console.log('ok   implicit Departure Check dismiss keeps docked');
}

// ── 6) Departure Check accept ("Launch Anyway") emits one canonical undock ───

{
  installDom();
  const ctx = makeCtx(5);
  const { pop } = mountStationApp(ctx);
  ctx.emitted.length = 0;

  ctx.bus.emit('station:exitRequest', { intent: 'implicit', source: 'escape' });
  const launch = launchAnywayButton(pop);
  assert.ok(launch, 'confirm dialog must be open (Departure Check popover)');

  pop.dispatchEvent(new FakeEvent('click', { target: launch, currentTarget: pop }));
  const list = undocks(ctx.emitted);
  assert.equal(list.length, 1, 'accept must emit exactly one dock:undocked');
  assert.equal(list[0].payload.committed, true, 'emitted undock must be committed');

  console.log('ok   Departure Check accept emits single canonical undock');
}

// ── 7) Explicit Undock (ready + held) is deliberate and direct ───────────────

{
  installDom();
  const ctx = makeCtx(6);
  const { pop } = mountStationApp(ctx);
  ctx.emitted.length = 0;

  ctx.bus.emit('station:exitRequest', { intent: 'explicit', source: 'undock-hold', held: true });
  const list = undocks(ctx.emitted);
  assert.equal(list.length, 1, 'held explicit undock must emit exactly one committed undock');
  assert.equal(list[0].payload.committed, true, 'held explicit undock must be committed');
  assert.equal(pop.hidden, true, 'ready explicit undock needs no Departure Check');

  console.log('ok   explicit Undock ready+held directly emits committed undock');
}

// ── 8) Explicit Undock risk + unheld opens the Departure Check first ─────────

{
  installDom();
  const ctx = makeCtx(7);
  const { pop } = mountStationApp(ctx);
  ctx.emitted.length = 0;

  ctx.state.fuel = { current: 0, max: 100 };
  ctx.state.entities.get(ctx.state.playerId).hull = 10;

  ctx.bus.emit('station:exitRequest', { intent: 'explicit', source: 'undock-activate', held: false });
  assert.equal(pop.hidden, false, 'explicit risk unheld undock must open the Departure Check');
  assert.ok(launchAnywayButton(pop), 'risk Departure Check must keep Launch Anyway reachable');
  assert.equal(undocks(ctx.emitted).length, 0, 'risk explicit undock must not undock before accept');

  ctx.bus.emit('station:exitRequest', { intent: 'implicit', source: 'backdrop' });
  assert.equal(undocks(ctx.emitted).length, 0, 'another implicit request cannot accept the departure');
  assert.equal(ctx.state.ui.docked, true, 'repeated exit requests keep the player docked');

  console.log('ok   explicit Undock risk+unheld opens Departure Check before undocking');
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
  assert.match(inputSrc, /bus\.on\('ui:undock', undock\)/,
    'input.js must let external callers trigger undock via ui:undock');
  assert.match(inputSrc, /bus\.emit\('dock:undocked',\s*\{\}\);/,
    'input.js undock() emits the gated dock:undocked event');
  assert.match(inputSrc, /if \(isConfirmOpen\(\)\)\s*\{\s*ev\.preventDefault\(\);\s*return;\s*\}/,
    'input.js must let the shared confirm dialog trap all keys');

  console.log('ok   input.js routes station exit through ui:undock without direct dock:undocked');
}

// The live Hull action uses the real quote and shared dialog, and never cancels on first click.
{
  installDom();
  const ctx = makeCtx(40);
  ctx.state.player.insurance = { insuredModules: true, deductibleCr: 100, rate: 0.6 };
  const { rootEl } = mountStationApp(ctx, { serviceQuote });
  const clickInsurance = () => {
    const button = rootEl.querySelector('[data-vital-act="insurance"]');
    assert.ok(button, 'live Hull vital exposes insurance');
    button.dispatchEvent(new FakeEvent('click', { target: button, bubbles: true }));
  };
  const insuranceIntents = () => ctx.emitted.filter((e) => e.event === 'ui:service' && e.payload.type === 'insurance');
  clickInsurance();
  assert.equal(insuranceIntents().length, 0, 'opening the dialog changes no policy');
  const keep = document.body.querySelector('.sf-confirm__cancel');
  assert.equal(keep.textContent, 'Keep Insurance');
  keep.click();
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(insuranceIntents().length, 0, 'Keep Insurance emits no cancellation');
  clickInsurance();
  document.body.querySelector('.sf-confirm__ok').click();
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.deepEqual(insuranceIntents().map((e) => e.payload), [{ type: 'insurance', amount: 0 }],
    'explicit cancellation sends exactly one owner intent');
  ctx.emitted.length = 0;
  clickInsurance();
  ctx.state.player.insurance.insuredModules = false;
  document.body.querySelector('.sf-confirm__ok').click();
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(insuranceIntents().length, 0, 'a stale cancellation cannot buy a changed policy');
  await new Promise((resolve) => setTimeout(resolve, 200));
  console.log('ok   live Hull insurance confirms cancellation and rejects stale policy changes');
}

{
  installDom();
  const ctx = makeCtx(41);
  ctx.state.onboarding = { active: true, finished: false, beatDoneAt: {} };
  ctx.screenMemory = createScreenMemory(ctx.state);
  const original = JSON.stringify(ctx.state.onboarding);
  const { app, rootEl } = mountStationApp(ctx);
  const rail = rootEl.querySelector('.sxb-handoff');
  assert.equal(rail.hidden, false);
  const dismiss = rail.querySelector('[data-handoff-dismiss]');
  assert.ok(dismiss);
  dismiss.dispatchEvent(new FakeEvent('click', { target: dismiss, bubbles: true }));
  assert.equal(rail.hidden, true, 'dismiss closes guidance immediately');
  assert.equal(ctx.screenMemory.read('station', 'firstDockHandoffDismissed', false), true);
  app.refresh(ctx);
  assert.equal(rail.hidden, true, 'refresh preserves dismissal');
  assert.equal(JSON.stringify(ctx.state.onboarding), original, 'dismissal changes no onboarding progress');
  console.log('ok   first dock dismissal persists without changing tutorial progress');
}

console.log('station-exit-confirmation: all acceptance tests PASS');
