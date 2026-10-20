// Crack one fuel cell from the cargo hold into the tank.
// The click is the hold's own Crack control. A burning hull cooks the cell
// against shield or hull. A short tank and a sealed cell write nothing.
//
// Run: node --test test/fuel-crack.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { economy } from '../src/systems/economy.js';
import { cargo as cargoSystem, addCargo } from '../src/systems/cargo.js';
import { combat } from '../src/systems/combat.js';
import { createHud } from '../src/ui/hud.js';

const SEED = 4242;
const CERES = 'sector_ceres_belt';
const CELL = 'cmdty_fuel_cells';
const ORE = 'cmdty_ore_iron';

class HudClassList {
  constructor() { this.values = new Set(); }
  reset(value) { this.values = new Set(String(value || '').split(/\s+/).filter(Boolean)); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    const active = force === undefined ? !this.values.has(value) : !!force;
    if (active) this.values.add(value); else this.values.delete(value);
    return active;
  }
}

class HudStyle {
  setProperty(name, value) { this[name] = String(value); }
  removeProperty(name) { delete this[name]; }
}

class HudText {
  constructor(text) { this.nodeType = 3; this._text = text; this.parentNode = null; }
  get textContent() { return this._text; }
  set textContent(value) { this._text = String(value); }
}

class HudElement {
  constructor(document, tagName) {
    this.ownerDocument = document;
    this.tagName = String(tagName).toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this.childNodes = this.children;
    this.parentNode = null;
    this.style = new HudStyle();
    this.dataset = {};
    this.attributes = new Map();
    this.classList = new HudClassList();
    this._className = '';
    this._innerHTML = '';
    this._listeners = new Map();
    this.id = '';
    this.hidden = false;
    this.disabled = false;
    this.isConnected = true;
    this.offsetWidth = 1;
    this.type = '';
  }
  get className() { return this._className; }
  set className(value) { this._className = String(value || ''); this.classList.reset(this._className); }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) {
    this._innerHTML = String(value || '');
    this.children.length = 0;
    parseMarkup(this, this._innerHTML);
  }
  get textContent() { return this.children.map((child) => child.textContent || '').join(''); }
  set textContent(value) {
    this._innerHTML = '';
    this.children.length = 0;
    if (value != null && String(value) !== '') this.appendChild(new HudText(String(value)));
  }
  appendChild(child) {
    if (!child) return null;
    if (child.parentNode && child.parentNode.removeChild) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  prepend(child) { if (!child) return null; child.parentNode = this; this.children.unshift(child); return child; }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    if (child && child.parentNode === this) child.parentNode = null;
    return child;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  replaceChildren(...nodes) {
    this.children.length = 0;
    for (const node of nodes) this.appendChild(node);
  }
  setAttribute(name, value) {
    const text = String(value);
    this.attributes.set(name, text);
    if (name === 'id') this.id = text;
    if (name === 'class') this.className = text;
    if (name === 'style') parseStyle(this.style, text);
    if (name.startsWith('data-')) this.dataset[dataKey(name.slice(5))] = text;
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name.startsWith('data-')) delete this.dataset[dataKey(name.slice(5))];
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
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const result = [];
    const token = String(selector).trim().split(/\s+/).at(-1);
    const visit = (node) => {
      for (const child of node.children || []) {
        if (child.nodeType === 1 && matchesSelector(child, token)) result.push(child);
        if (child.nodeType === 1) visit(child);
      }
    };
    visit(this);
    return result;
  }
  getBoundingClientRect() {
    return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  getTotalLength() { return 1; }
  focus() {}
  contains(node) { for (let p = node; p; p = p.parentNode) if (p === this) return true; return false; }
  closest(selector) {
    for (let node = this; node && node.nodeType === 1; node = node.parentNode) {
      if (matchesSelector(node, selector)) return node;
    }
    return null;
  }
  getContext() { return canvasContext(); }
}

class HudDocument {
  constructor() {
    this.head = new HudElement(this, 'head');
    this.body = new HudElement(this, 'body');
    this.documentElement = this.body;
    this.activeElement = this.body;
  }
  createElement(tagName) { return new HudElement(this, tagName); }
  createElementNS(_ns, tagName) { return this.createElement(tagName); }
  createTextNode(text) { return new HudText(String(text)); }
  createDocumentFragment() { return this.createElement('fragment'); }
  getElementById(id) { return findElement([this.head, this.body], (node) => node.id === id); }
  querySelector(selector) { return this.head.querySelector(selector) || this.body.querySelector(selector); }
  querySelectorAll(selector) { return [...this.head.querySelectorAll(selector), ...this.body.querySelectorAll(selector)]; }
  addEventListener() {}
  removeEventListener() {}
}

function parseMarkup(parent, markup) {
  if (!markup) return;
  const stack = [parent];
  for (const token of markup.match(/<[^>]+>|[^<]+/g) || []) {
    if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
    if (!token.startsWith('<')) {
      if (token.trim()) stack.at(-1).appendChild(new HudText(token));
      continue;
    }
    if (token.startsWith('<!--') || token.startsWith('<!')) continue;
    const match = token.match(/^<\s*([\w:-]+)/);
    if (!match) continue;
    const element = parent.ownerDocument.createElement(match[1]);
    const attrs = token.slice(match[0].length, token.length - (token.endsWith('/>') ? 2 : 1));
    for (const attr of attrs.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      element.setAttribute(attr[1], attr[2] ?? attr[3] ?? attr[4] ?? '');
    }
    stack.at(-1).appendChild(element);
    if (!token.endsWith('/>') && !['BR', 'HR', 'IMG', 'INPUT'].includes(element.tagName)) stack.push(element);
  }
}

function parseStyle(style, value) {
  for (const entry of String(value || '').split(';')) {
    const i = entry.indexOf(':');
    if (i > 0) style[entry.slice(0, i).trim()] = entry.slice(i + 1).trim();
  }
}

function dataKey(value) { return value.replace(/-([a-z])/g, (_m, c) => c.toUpperCase()); }

function matchesSelector(element, selector) {
  const raw = String(selector || '').trim();
  if (!raw) return false;
  let rest = raw;
  let saw = false;
  while (rest) {
    if (rest.startsWith('.')) {
      const match = rest.match(/^\.([\w-]+)/);
      if (!match || !element.classList.contains(match[1])) return false;
      rest = rest.slice(match[0].length);
    } else if (rest.startsWith('#')) {
      const match = rest.match(/^#([\w-]+)/);
      if (!match || element.id !== match[1]) return false;
      rest = rest.slice(match[0].length);
    } else if (rest.startsWith('[')) {
      const match = rest.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]/);
      if (!match) return false;
      const actual = match[1].startsWith('data-')
        ? element.dataset[dataKey(match[1].slice(5))]
        : element.getAttribute(match[1]);
      if (match[2] === undefined ? actual == null : String(actual) !== match[2]) return false;
      rest = rest.slice(match[0].length);
    } else {
      const match = rest.match(/^[\w:-]+/);
      if (!match || element.tagName.toLowerCase() !== match[0].toLowerCase()) return false;
      rest = rest.slice(match[0].length);
    }
    saw = true;
  }
  return saw;
}

function findElement(roots, predicate) {
  const stack = [...roots];
  while (stack.length) {
    const node = stack.shift();
    if (predicate(node)) return node;
    stack.unshift(...(node.children || []).filter((child) => child.nodeType === 1));
  }
  return null;
}

function canvasContext() {
  const gradient = () => ({ addColorStop() {} });
  const target = {
    measureText: (text) => ({ width: String(text).length * 5 }),
    createLinearGradient: gradient,
    createRadialGradient: gradient,
    clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, arc() {},
    fill() {}, stroke() {}, moveTo() {}, lineTo() {}, closePath() {},
  };
  return new Proxy(target, {
    get(obj, key) { return key in obj ? obj[key] : () => {}; },
    set(obj, key, value) { obj[key] = value; return true; },
  });
}

function installDom() {
  const prev = {
    document: globalThis.document,
    window: globalThis.window,
    raf: globalThis.requestAnimationFrame,
    caf: globalThis.cancelAnimationFrame,
    perf: globalThis.performance,
    style: globalThis.getComputedStyle,
    resize: globalThis.ResizeObserver,
  };
  const doc = new HudDocument();
  const hudRoot = doc.createElement('div');
  hudRoot.id = 'hud';
  doc.body.appendChild(hudRoot);
  globalThis.document = doc;
  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  globalThis.performance = { now: () => 1000 };
  globalThis.getComputedStyle = () => ({ display: 'block', getPropertyValue: () => '' });
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  return {
    doc,
    restore() {
      const put = (key, value) => {
        if (value === undefined) delete globalThis[key];
        else globalThis[key] = value;
      };
      put('document', prev.document);
      put('window', prev.window);
      put('requestAnimationFrame', prev.raf);
      put('cancelAnimationFrame', prev.caf);
      put('performance', prev.perf);
      put('getComputedStyle', prev.style);
      put('ResizeObserver', prev.resize);
    },
  };
}

function boot({ withCombat = true } = {}) {
  const bus = createBus();
  const systems = [physics, world, cargoSystem, economy];
  if (withCombat) systems.push(combat);
  const sim = createSimulation({ seed: SEED, bus, systems });
  const { state } = sim;
  state.mode = 'flight';
  state.meta = { ...(state.meta || {}), seed: SEED };
  const worldSystem = sim.registry.get('world');
  worldSystem.newGame();
  state.meta = { ...(state.meta || {}), seed: SEED };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 12, mass: 24, hull: 100, hullMax: 100, shield: 40, shieldMax: 40,
    armorFlat: 0, alive: true, collides: true, data: {},
  });
  state.playerId = player.id;
  worldSystem.enterSector(CERES);
  state.ui.docked = false;
  state.ui.dockedStationId = null;
  state.player.credits = 500;
  state.player.debt = 0;
  delete state.player.emergencyFuelDay;
  state.fuel.current = 10;
  state.fuel.max = 100;
  state.tick = 10;
  state.simTime = 10;
  return { sim, state, player, bus, world: worldSystem };
}

function holdCells(state, qty) {
  const added = addCargo(state, CELL, qty);
  assert.equal(added, qty, 'the hold accepted the fuel cells');
}

function mountHold(hosted) {
  const dom = installDom();
  const hud = createHud({
    bus: hosted.bus,
    state: hosted.state,
    registry: hosted.sim.registry,
    helpers: { worldToScreen: (_point, out = {}) => { out.x = 0; out.y = 0; out.onScreen = true; return out; } },
  });
  hosted.bus.emit('ui:toggleCargo');
  return {
    doc: dom.doc,
    hud,
    restore() {
      if (hud && typeof hud.destroy === 'function') hud.destroy();
      dom.restore();
    },
  };
}

function selectLot(doc, commodityId) {
  const block = doc.querySelector(`.sf-cargo-block[data-id="${commodityId}"]`);
  assert.ok(block, `the hold paints ${commodityId}`);
  const clicks = block._listeners.get('click') || [];
  assert.ok(clicks.length > 0, 'the lot block has the hold\'s own click');
  clicks[0]({ stopPropagation() {} });
}

function crackControl(doc) {
  return doc.querySelector('.sf-btn-crack');
}

function clickCrack(doc) {
  const button = crackControl(doc);
  assert.ok(button, 'Crack is painted');
  assert.equal(button.textContent, 'Crack');
  assert.equal(typeof button.onclick, 'function', 'Crack uses the inspector\'s own click');
  button.onclick();
  return button;
}

function cellCount(state) {
  return (state.player.cargo.items && state.player.cargo.items[CELL]) || 0;
}

function pods(state, commodityId) {
  return (state.entityList || []).filter((entity) => entity
    && entity.alive !== false
    && entity.data
    && entity.data.jettisonedCargo === true
    && (!commodityId || entity.data.commodityId === commodityId));
}

function sealCells(state, qty) {
  state.missions = state.missions || { active: [] };
  state.missions.active = [{
    id: 'ceres-cell-run',
    status: 'active',
    preloadedCargo: true,
    params: { cmdtyId: CELL, qty },
  }];
}

function burn(state, player) {
  state.combat = state.combat || {};
  state.combat.entities = state.combat.entities || {};
  state.tick = 10;
  state.combat.entities[String(player.id)] = {
    statuses: { status_burning: { stacks: 1, expiresTick: state.tick + 50 } },
  };
}

test('the cargo hold paints Crack and one click pours a sip', () => {
  const hosted = boot();
  holdCells(hosted.state, 2);
  const ui = mountHold(hosted);
  try {
    selectLot(ui.doc, CELL);
    const beforePods = pods(hosted.state, CELL).length;
    assert.equal(crackControl(ui.doc).disabled, false, 'Crack is enabled when a cell can pour');
    clickCrack(ui.doc);
    assert.equal(cellCount(hosted.state), 1);
    assert.equal(hosted.state.fuel.current, 18);
    assert.equal(hosted.state.player.credits, 500);
    assert.equal(hosted.state.player.debt, 0);
    assert.equal(hosted.state.player.emergencyFuelDay, undefined);
    assert.equal(pods(hosted.state, CELL).length, beforePods);
    selectLot(ui.doc, CELL);
    clickCrack(ui.doc);
    assert.equal(cellCount(hosted.state), 0);
    assert.equal(hosted.state.fuel.current, 26);
  } finally {
    ui.restore();
  }
});

test('a tank that cannot take the sip paints Crack and the click writes nothing', () => {
  const hosted = boot();
  holdCells(hosted.state, 1);
  hosted.state.fuel.current = 95;
  const ui = mountHold(hosted);
  try {
    selectLot(ui.doc, CELL);
    const button = clickCrack(ui.doc);
    assert.equal(button.disabled, true);
    assert.equal(cellCount(hosted.state), 1);
    assert.equal(hosted.state.fuel.current, 95);
  } finally {
    ui.restore();
  }
});

test('a sealed delivery cell is painted and the click leaves it aboard', () => {
  const hosted = boot();
  holdCells(hosted.state, 2);
  sealCells(hosted.state, 2);
  const ui = mountHold(hosted);
  try {
    selectLot(ui.doc, CELL);
    const button = clickCrack(ui.doc);
    assert.equal(button.disabled, true);
    assert.equal(cellCount(hosted.state), 2);
    assert.equal(hosted.state.fuel.current, 10);
  } finally {
    ui.restore();
  }
});

test('one free cell beside a seal cracks once and the sealed cell stays', () => {
  const hosted = boot();
  holdCells(hosted.state, 2);
  sealCells(hosted.state, 1);
  const ui = mountHold(hosted);
  try {
    selectLot(ui.doc, CELL);
    assert.equal(crackControl(ui.doc).disabled, false, 'the free cell beside a seal can crack');
    clickCrack(ui.doc);
    assert.equal(cellCount(hosted.state), 1);
    assert.equal(hosted.state.fuel.current, 18);
    selectLot(ui.doc, CELL);
    const button = clickCrack(ui.doc);
    assert.equal(button.disabled, true);
    assert.equal(cellCount(hosted.state), 1);
    assert.equal(hosted.state.fuel.current, 18);
  } finally {
    ui.restore();
  }
});

test('iron ore has no Crack control', () => {
  const hosted = boot();
  holdCells(hosted.state, 1);
  assert.equal(addCargo(hosted.state, ORE, 1), 1);
  const ui = mountHold(hosted);
  try {
    selectLot(ui.doc, ORE);
    assert.equal(crackControl(ui.doc), null);
  } finally {
    ui.restore();
  }
});

test('a burning hull with shield up spends shield and not the tank', () => {
  const hosted = boot();
  holdCells(hosted.state, 1);
  hosted.player.shield = 40;
  hosted.player.hull = 100;
  burn(hosted.state, hosted.player);
  const ui = mountHold(hosted);
  try {
    selectLot(ui.doc, CELL);
    assert.equal(crackControl(ui.doc).disabled, false, 'a burning hull keeps Crack enabled');
    clickCrack(ui.doc);
    assert.equal(hosted.state.fuel.current, 10);
    assert.equal(cellCount(hosted.state), 0);
    assert.equal(hosted.player.hull, 100);
    assert.ok(hosted.player.shield < 40, 'the shield fell');
    assert.equal(pods(hosted.state, CELL).length, 0);
  } finally {
    ui.restore();
  }
});

test('a burning hull with no shield spends hull', () => {
  const hosted = boot();
  holdCells(hosted.state, 1);
  hosted.player.shield = 0;
  hosted.player.hull = 100;
  hosted.player.armorFlat = 0;
  burn(hosted.state, hosted.player);
  const ui = mountHold(hosted);
  try {
    selectLot(ui.doc, CELL);
    assert.equal(crackControl(ui.doc).disabled, false, 'a burning hull with no shield keeps Crack enabled');
    clickCrack(ui.doc);
    assert.equal(hosted.state.fuel.current, 10);
    assert.equal(cellCount(hosted.state), 0);
    assert.ok(hosted.player.hull < 100, 'the hull fell');
  } finally {
    ui.restore();
  }
});

test('a rejected cook leaves the cell aboard', () => {
  const hosted = boot();
  holdCells(hosted.state, 1);
  hosted.player.shield = 40;
  hosted.player.hull = 100;
  hosted.player.flags = { ...(hosted.player.flags || {}), invuln: true };
  burn(hosted.state, hosted.player);
  const ui = mountHold(hosted);
  try {
    selectLot(ui.doc, CELL);
    assert.equal(crackControl(ui.doc).disabled, false, 'a burning hull keeps Crack enabled');
    clickCrack(ui.doc);
    assert.equal(cellCount(hosted.state), 1);
    assert.equal(hosted.state.fuel.current, 10);
    assert.equal(hosted.player.shield, 40);
    assert.equal(hosted.player.hull, 100);
  } finally {
    ui.restore();
  }
});

test('a cook that moves neither shield nor hull leaves the cell aboard', () => {
  const hosted = boot();
  holdCells(hosted.state, 1);
  hosted.player.shield = 0;
  hosted.player.hull = 100;
  hosted.player.armorFlat = 10000;
  burn(hosted.state, hosted.player);
  const ui = mountHold(hosted);
  try {
    selectLot(ui.doc, CELL);
    assert.equal(crackControl(ui.doc).disabled, false, 'a burning hull keeps Crack enabled');
    clickCrack(ui.doc);
    assert.equal(cellCount(hosted.state), 1);
    assert.equal(hosted.state.fuel.current, 10);
    assert.equal(hosted.player.shield, 0);
    assert.equal(hosted.player.hull, 100);
  } finally {
    ui.restore();
  }
});

test('a burning hull with no damage route keeps the cell', () => {
  const hosted = boot({ withCombat: false });
  holdCells(hosted.state, 1);
  hosted.player.shield = 40;
  hosted.player.hull = 100;
  burn(hosted.state, hosted.player);
  const ui = mountHold(hosted);
  try {
    selectLot(ui.doc, CELL);
    assert.equal(crackControl(ui.doc).disabled, false, 'a missing damage route still paints Crack enabled');
    clickCrack(ui.doc);
    assert.equal(cellCount(hosted.state), 1);
    assert.equal(hosted.state.fuel.current, 10);
    assert.equal(hosted.player.shield, 40);
    assert.equal(hosted.player.hull, 100);
  } finally {
    ui.restore();
  }
});

test('jettison still drops a fuel-cell pod and crack does not', () => {
  const hosted = boot();
  holdCells(hosted.state, 2);
  const ui = mountHold(hosted);
  try {
    selectLot(ui.doc, CELL);
    clickCrack(ui.doc);
    assert.equal(pods(hosted.state, CELL).length, 0);
    hosted.bus.emit('cargo:jettison', { commodityId: CELL, qty: 1 });
    assert.equal(pods(hosted.state, CELL).length, 1);
    assert.equal(cellCount(hosted.state), 0);
  } finally {
    ui.restore();
  }
});
