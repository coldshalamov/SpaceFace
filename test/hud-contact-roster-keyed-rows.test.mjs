// The contacts strip used to rebuild its whole subtree (`innerHTML = ''` + per-row innerHTML +
// per-row addEventListener) on nearly every 5 Hz sample, because its signature guard embedded
// Math.round(dist) / Math.round(closingSpeed) — values that tick constantly while the player flies.
// These tests pin the retained, keyed-row replacement by BEHAVIOUR: the same DOM node objects must
// survive a distance tick, only the changed text may be written, and arrivals/departures/reorders
// must touch only the rows they concern.
import test from 'node:test';
import assert from 'node:assert/strict';

import * as hud from '../src/ui/hud.js';
import { createBus } from '../src/core/eventBus.js';

test('a distance tick rewrites text in place and never recreates a row', () => {
  const fx = mountHudFixture();
  try {
    fx.step(24);                      // settle: two 5 Hz roster samples
    const before = rows(fx);
    assert.equal(before.length, 5, 'fixture mounts the full five-row cap');
    const beforeDist = distances(fx);

    fx.spy.reset(fx.overview);
    fx.step(60);                      // one second: five more roster samples, contacts still moving
    const after = rows(fx);

    assert.equal(after.length, before.length, 'row count is unchanged while the contact set is');
    for (let i = 0; i < before.length; i++) {
      // Node identity is asserted with assert.ok(a === b) rather than assert.equal throughout this
      // file. On failure node:assert deep-inspects both operands to build a diff, and these shim
      // elements are cyclic parent/child trees: a single failing assert.equal on two roster rows
      // hangs for ~2 minutes and then dies with "Array buffer allocation failed", which reads as CI
      // infrastructure flake instead of "row identity broke" — the one thing this file exists to say.
      assert.ok(after[i] === before[i],
        `row ${i} must be the SAME DOM node object — no teardown, no re-parse, no re-bind`);
    }
    assert.notDeepEqual(distances(fx), beforeDist, 'the moving contacts still report fresh distances');
    assert.equal(fx.overview.rebuildCount, 0, 'the roster subtree is never cleared');

    // Exactly one write per visible row per sample: the distance span. Nothing else changed, so
    // nothing else may be written (one second of a 5 Hz clock is four or five samples).
    assert.equal(fx.spy.count % 5, 0, 'every roster sample writes exactly one span per row');
    assert.ok(fx.spy.count >= 20 && fx.spy.count <= 25,
      `one second of 5 Hz x 5 rows of distance writes, got ${fx.spy.count}; any extra is a redundant DOM write`);

    for (const row of after) {
      assert.equal(clickListeners(row), 1, 'the click handler is bound once, at row creation');
    }
  } finally {
    fx.restore();
  }
});

test('roster DOM writes stay frame-rate independent at 5 Hz', () => {
  const counts = [];
  for (const fps of [60, 144, 240]) {
    const fx = mountHudFixture();
    try {
      fx.step(fps, fps);              // one second of warm-up, then measure the steady state
      fx.spy.reset(fx.overview);
      fx.step(fps * 2, fps);
      counts.push(fx.spy.count);
      assert.ok(fx.spy.count >= 45 && fx.spy.count <= 50,
        `${fps} FPS: 2s x 5 Hz x 5 rows of distance writes, got ${fx.spy.count}`);
      assert.equal(fx.overview.rebuildCount, 0, `${fps} FPS: no subtree rebuilds`);
    } finally {
      fx.restore();
    }
  }
  // 2s at 240 FPS is 480 frames; ~50 writes at every rate is the frame-rate independence claim.
  // The residual spread is one 5 Hz sample of accumulator phase, not per-frame work.
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 5,
    `roster DOM work must not scale with frame rate (60/144/240 wrote ${counts.join('/')})`);
});

test('stable active Massline controls do not rewrite their accessible label at HUD cadence', () => {
  const fx = mountHudFixture();
  try {
    fx.state.player.tether = {
      active: true,
      targetId: 'selected',
      phase: 'hold',
      tension: 0.4,
      maxTension: 1,
    };
    fx.step(12); // settle the initial 10 Hz numeric/HUD sample

    const controls = fx.document.querySelector('.sf-tether-controls');
    assert.ok(controls, 'the active Massline mounts its control-chip accessibility owner');
    assert.match(controls.getAttribute('aria-label') || '', /REEL|CUT|UNBOUND/,
      'the settled label still exposes the live Massline controls');

    let ariaLabelWrites = 0;
    const setAttribute = controls.setAttribute.bind(controls);
    controls.setAttribute = (name, value) => {
      if (name === 'aria-label') ariaLabelWrites++;
      return setAttribute(name, value);
    };
    fx.step(60);

    assert.equal(ariaLabelWrites, 0,
      'an unchanged active Massline must not rewrite the same aria-label ten times per second');
  } finally {
    fx.restore();
  }
});

test('a contact leaving removes only its row; the row that replaces it is the only new node', () => {
  const fx = mountHudFixture();
  try {
    fx.step(24);
    const before = rowsByName(fx);
    assert.deepEqual(names(fx), ['Selected Wreck', 'Threat One', 'Threat Two', 'Wing Ally', 'Other Wreck'],
      'baseline ordering before the departure');

    fx.entity('threat-2').alive = false;
    fx.step(24);

    const after = rowsByName(fx);
    assert.equal(after.has('Threat Two'), false, 'the departed contact loses its row');
    assert.equal(after.size, 5, 'the cap refills from the overflow band');
    for (const name of ['Selected Wreck', 'Threat One', 'Wing Ally', 'Other Wreck']) {
      assert.ok(after.get(name) === before.get(name),
        `${name} keeps its exact DOM node while a neighbour leaves`);
    }
    assert.ok(after.has('Ambient One'), 'the promoted contact gains a row');
    assert.equal(before.has('Ambient One'), false, 'and it genuinely is a new node');
    assert.equal(fx.overview.querySelector('.sf-overview-footer').textContent, '+1 · 1 OTHER',
      'overflow receipt still counts the omitted contacts truthfully');
    assert.equal(fx.overview.rebuildCount, 0, 'a departure is a targeted removal, not a rebuild');
  } finally {
    fx.restore();
  }
});

test('a contact arriving adds one row and leaves the surviving rows untouched', () => {
  const fx = mountHudFixture();
  try {
    fx.step(24);
    const before = rowsByName(fx);

    fx.add(ship('threat-3', 3, 120, 'Threat Three', { forcePlayerTarget: true }));
    fx.step(24);

    const after = rowsByName(fx);
    assert.ok(after.has('Threat Three'), 'the arriving contact is rendered');
    assert.equal(before.has('Threat Three'), false, 'and it is the only new node');
    for (const [name, node] of after) {
      if (name === 'Threat Three') continue;
      assert.ok(node === before.get(name), `${name} keeps its exact DOM node across an arrival`);
    }
    assert.equal(fx.overview.rebuildCount, 0, 'an arrival is a targeted insert, not a rebuild');
  } finally {
    fx.restore();
  }
});

test('clicking a row reorders retained nodes and moves the selected class', () => {
  const fx = mountHudFixture();
  try {
    fx.step(24);
    const before = rowsByName(fx);
    assert.equal(before.get('Selected Wreck').classList.contains('selected'), true);

    let toast = null;
    fx.bus.on('toast', (payload) => { toast = payload; });
    before.get('Threat Two').click();

    // The click handler selects and re-renders synchronously — no extra frame needed.
    assert.equal(fx.state.player.targetId, 'threat-2', 'the retained handler still selects its contact');
    assert.match(toast?.text || '', /Selected target: Threat Two/, 'and still emits the same toast');

    const after = rows(fx);
    assert.deepEqual(names(fx), ['Threat Two', 'Threat One', 'Wing Ally', 'Selected Wreck', 'Other Wreck'],
      'the selected contact is promoted to the top band');
    assert.ok(after[0] === before.get('Threat Two'), 'the promoted row is MOVED, not rebuilt');
    for (const [name, node] of rowsByName(fx)) {
      assert.ok(node === before.get(name), `${name} survives the reorder as the same node`);
    }
    assert.equal(after.filter((row) => row.classList.contains('selected')).length, 1,
      'exactly one row carries the selected class after the swap');
    assert.equal(after[0].classList.contains('selected'), true);
    assert.equal(fx.overview.querySelector('.sf-overview-footer').textContent, '+2 · 2 OTHERS',
      'the overflow footer stays last');
    assert.equal(fx.overview.children.at(-1).className, 'sf-overview-footer',
      'the footer is the final child even after rows move');
    assert.equal(fx.overview.rebuildCount, 0, 'a reorder is a set of moves, not a rebuild');
  } finally {
    fx.restore();
  }
});

test('the strip renders correctly again after hiding and revealing', () => {
  const fx = mountHudFixture();
  try {
    fx.step(24);
    const preHideDistance = distanceOf(rowsByName(fx).get('Selected Wreck'));
    for (const contact of fx.contacts) contact.alive = false;
    fx.clock.now += 20000;            // outlast every reveal window
    fx.step(24);
    assert.equal(fx.overview.style.display, 'none', 'an empty on-demand roster hides');

    for (const contact of fx.contacts) contact.alive = true;
    fx.step(24);
    assert.equal(fx.overview.style.display, 'flex', 'a returning contact reveals the roster');
    assert.deepEqual(names(fx), ['Selected Wreck', 'Threat One', 'Threat Two', 'Wing Ally', 'Other Wreck'],
      'the revealed roster is ordered exactly as before');
    for (const row of rows(fx)) {
      assert.equal(clickListeners(row), 1, 'a reveal never re-binds the click handler');
    }
    // Truthful, uncoarsened distance on reveal: re-synced off the hidden value and within one
    // 5 Hz sample of the live position (no coarsening, no frozen text).
    const wreck0 = fx.entity('selected');
    const revealed = distanceOf(rowsByName(fx).get('Selected Wreck'));
    assert.notEqual(revealed, preHideDistance, 'the revealed row re-syncs rather than showing stale text');
    assert.ok(Math.abs(Number(revealed) - Math.hypot(wreck0.pos.x, wreck0.pos.z)) <= 6,
      `the revealed row reports the live rounded distance (got ${revealed})`);
  } finally {
    fx.restore();
  }
});

test('a contact changing state replaces its sf-cs-- class instead of stacking one', () => {
  const fx = mountHudFixture();
  try {
    fx.step(24);
    const row = rowsByName(fx).get('Wing Ally');
    const stateEl = row.querySelector('.sf-overview-row__state');
    assert.equal(stateEl.className, 'sf-overview-row__state sf-cs--ally');
    assert.equal(row.querySelector('.sf-overview-row__tier').className, 'sf-overview-row__tier sf-cs--ally');

    const ally = fx.entity('ally');
    ally.team = 3;
    ally.factionId = 'faction_vael';
    ally.data.ai.forcePlayerTarget = true;   // same shape the fixture's threats use
    fx.step(24);

    assert.ok(rowsByName(fx).get('Wing Ally') === row, 'the defecting contact keeps its node');
    assert.equal(stateEl.className, 'sf-overview-row__state sf-cs--hostile',
      'the old state class is replaced, never left beside the new one');
    assert.equal(row.querySelector('.sf-overview-row__tier').className, 'sf-overview-row__tier sf-cs--hostile');
    assert.equal(stateEl.textContent, 'HOSTILE');
  } finally {
    fx.restore();
  }
});

test('a derelict resolving from unscanned to scanned rewrites only its detail line', () => {
  const fx = mountHudFixture();
  try {
    fx.step(24);
    const before = rowsByName(fx);
    const row = before.get('Selected Wreck');
    assert.equal(row.classList.contains('unscanned'), true);
    assert.equal(row.querySelector('.sf-overview-row__detail').textContent, '??? UNSCANNED');

    const wreckEntity = fx.entity('selected');
    wreckEntity.data.scanned = true;
    wreckEntity.data.weakPoint = 'SPINE';
    wreckEntity.data.manifest = [{ id: 'ore_iron', qty: 4 }];
    fx.step(24);

    assert.ok(rowsByName(fx).get('Selected Wreck') === row, 'the resolving row is the same node');
    assert.equal(row.classList.contains('unscanned'), false, 'the ghost-outline class is removed');
    assert.match(row.querySelector('.sf-overview-row__detail').textContent, /WEAK SPINE/,
      'the manifest line resolves in place');
    assert.equal(fx.overview.rebuildCount, 0);
  } finally {
    fx.restore();
  }
});

// ---------------------------------------------------------------------------------------------
// fixture

function rows(fx) { return fx.overview.querySelectorAll('.sf-overview-row'); }
function names(fx) {
  return rows(fx).map((row) => row.querySelector('.sf-overview-row__name').textContent);
}
function rowsByName(fx) {
  return new Map(rows(fx).map((row) => [row.querySelector('.sf-overview-row__name').textContent, row]));
}
function distanceOf(row) { return row.querySelector('.sf-overview-row__right').children[1].textContent; }
function distances(fx) { return rows(fx).map(distanceOf); }
function clickListeners(row) { return (row._listeners.get('click') || []).length; }

const WRITE_SPY = {
  root: null,
  count: 0,
  reset(root) { this.root = root; this.count = 0; },
  off() { this.root = null; this.count = 0; },
};

function mountHudFixture() {
  const globals = {
    document: globalThis.document,
    window: globalThis.window,
    performance: globalThis.performance,
    getComputedStyle: globalThis.getComputedStyle,
  };
  WRITE_SPY.off();
  const document = new HudDocument();
  const root = document.createElement('div');
  root.id = 'hud';
  document.body.appendChild(root);
  globalThis.document = document;
  globalThis.window = {
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  const clock = { now: 1000 };
  globalThis.performance = { now: () => clock.now };
  globalThis.getComputedStyle = (element) => ({
    display: element?.style?.display === 'none'
      ? 'none'
      : (element?.classList?.contains('sf-overview') ? 'flex' : (element?.style?.display || 'block')),
    getPropertyValue: () => '',
  });

  const player = ship('player', 1, 0, 'Player');
  player.pos.x = 0;
  player.hull = player.hullMax = 140;
  player.shield = player.shieldMax = 55;
  player.armorHp = player.armorMax = 30;
  player.energy = player.energyMax = 80;
  player.fuel = player.fuelMax = 100;
  player.maxSpeed = 140;
  player.data.defId = 'hitch';
  player.data.weapons = [];
  const selected = wreck('selected', 3000, 'Selected Wreck');
  const threat1 = ship('threat-1', 3, 3100, 'Threat One', { forcePlayerTarget: true });
  const threat2 = ship('threat-2', 3, 3200, 'Threat Two', { forcePlayerTarget: true });
  const ally = ship('ally', 1, 3300, 'Wing Ally');
  const otherWreck = wreck('wreck', 3400, 'Other Wreck');
  const ambient1 = ship('ambient-1', 0, 3500, 'Ambient One');
  const ambient2 = ship('ambient-2', 0, 3600, 'Ambient Two');
  const contacts = [selected, threat1, threat2, ally, otherWreck, ambient1, ambient2];
  const entityList = [player, ...contacts];
  const state = {
    mode: 'flight', playerId: player.id, entities: new Map(entityList.map((e) => [e.id, e])), entityList,
    player: {
      targetId: selected.id,
      credits: 0,
      cargo: { items: {}, usedVolume: 0, capVolume: 40 },
      weaponRange: 900,
      heat: 0,
    },
    settings: {
      ui: { overviewOpen: false },
      accessibility: { colorblindMode: 'none', reducedMotion: true, reducedFlash: true },
      gameplay: {}, controls: {}, audio: {}, graphics: {},
    },
    ui: { radarRange: 4000, trackedMissionId: null },
    input: { actions: {}, autoFire: false },
    missions: { active: [] },
    story: { beatIndex: -1 },
    nav: {}, world: { currentSectorId: 'helios', scanPings: {} },
    simTime: 0, tick: 0,
  };
  const bus = createBus();
  const mounted = hud.createHud({
    state,
    bus,
    helpers: { worldToScreen: () => ({ x: 960, y: 540, onScreen: true }) },
  }, null);

  const fx = {
    state, bus, hud: mounted, document, contacts, clock, spy: WRITE_SPY,
    get overview() { return document.querySelector('.sf-overview'); },
    entity(id) { return state.entities.get(id); },
    add(entity) {
      state.entityList.push(entity);
      state.entities.set(entity.id, entity);
      contacts.push(entity);
      return entity;
    },
    step(frames, fps = 60) {
      for (let i = 0; i < frames; i++) {
        state.simTime += 1 / fps;
        state.tick += 1;
        for (const contact of contacts) contact.pos.x += contact.vel.x / fps;
        clock.now += 1000 / fps;
        mounted.frame(1 / fps);
      }
    },
    restore() {
      WRITE_SPY.off();
      globalThis.document = globals.document;
      globalThis.window = globals.window;
      globalThis.performance = globals.performance;
      globalThis.getComputedStyle = globals.getComputedStyle;
    },
  };
  return fx;
}

function ship(id, team, x, callsign, ai = {}) {
  return {
    id, type: 'ship', alive: true, team, factionId: team === 3 ? 'faction_vael' : null,
    pos: { x, y: 0, z: 0 }, vel: { x: 20, z: 0 }, radius: 12,
    hull: 100, hullMax: 100, shield: 30, shieldMax: 30, armorHp: 20, armorMax: 20,
    data: { callsign, ai: { lawful: false, ...ai }, weapons: [] },
  };
}

function wreck(id, x, callsign) {
  return {
    id, type: 'wreck', alive: true, team: 0,
    pos: { x, y: 0, z: 0 }, vel: { x: 20, z: 0 }, radius: 10,
    data: { callsign, scanned: false },
  };
}

// --- minimal DOM shim (mirrors test/hud-contact-roster-visibility.test.mjs) --------------------
class HudClassList {
  constructor(owner) { this.owner = owner; this.values = new Set(); }
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
    this.classList = new HudClassList(this);
    this._className = '';
    this._innerHTML = '';
    this._listeners = new Map();
    this.id = '';
    this.hidden = false;
    this.rebuildCount = 0;
    this.isConnected = true;
    this.offsetWidth = 1;
  }
  get className() { return this._className; }
  set className(value) { this._className = String(value || ''); this.classList.reset(this._className); }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) {
    this._innerHTML = String(value || '');
    if (this.classList.contains('sf-overview') && this._innerHTML === '') this.rebuildCount += 1;
    this.children.length = 0;
    parseMarkup(this, this._innerHTML);
  }
  get textContent() { return this.children.map((child) => child.textContent).join(''); }
  set textContent(value) {
    // Instrumentation: count text writes inside the roster so cadence can be asserted without
    // depending on the teardown this rewrite removed.
    if (WRITE_SPY.root && WRITE_SPY.root.contains(this)) WRITE_SPY.count += 1;
    this._innerHTML = '';
    this.children.length = 0;
    if (value != null && String(value) !== '') this.appendChild(new HudText(String(value)));
  }
  // Real appendChild DETACHES first, so appending a live node MOVES it. Without this the shim
  // duplicates any node a reconciler reorders.
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this; this.children.push(child); return child;
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children.length = 0;
    children.forEach((child) => this.appendChild(child));
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  prepend(child) { child.parentNode = this; this.children.unshift(child); return child; }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    if (child.parentNode === this) child.parentNode = null;
    return child;
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
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    const list = this._listeners.get(type) || [];
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }
  click() { for (const fn of this._listeners.get('click') || []) fn({ type: 'click', currentTarget: this, preventDefault() {} }); }
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
  getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: 220, bottom: 180, width: 220, height: 180 }; }
  getTotalLength() { return 2 * Math.PI * 44; }
  focus() { this.ownerDocument.activeElement = this; }
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
      if (token) stack.at(-1).appendChild(new HudText(token.replace(/&times;/g, '×')));
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
  if (!selector) return false;
  if (selector.startsWith('.')) return element.classList.contains(selector.slice(1));
  if (selector.startsWith('#')) return element.id === selector.slice(1);
  if (selector.startsWith('[')) {
    const match = selector.match(/^\[([^=\]]+)(?:=([^\]]+))?\]$/);
    if (!match) return false;
    const expected = match[2]?.replace(/^['"]|['"]$/g, '');
    const actual = element.getAttribute(match[1]);
    return expected === undefined ? actual != null : actual === expected;
  }
  return element.tagName.toLowerCase() === selector.toLowerCase();
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
  };
  return new Proxy(target, {
    get(obj, key) { return key in obj ? obj[key] : () => {}; },
    set(obj, key, value) { obj[key] = value; return true; },
  });
}
