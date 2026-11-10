// PQ-168.01 — the chart answers each navigation question once.
//
// Where am I, what am I tracking, where am I going, and what the next leg is are the foot
// band. The route ribbon is the itinerary (legs, cost, controls). The title names the selected
// place. Nothing else may repeat the arrival sentence or the plotted leg list.

import assert from 'node:assert/strict';
import test from 'node:test';

const VOID_TAGS = new Set(['input', 'br', 'img', 'hr', 'meta', 'link', 'source', 'area']);

class El {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.parent = null;
    this._attrs = new Map();
    this._listeners = new Map();
    this._text = '';
    this._html = '';
    this.value = '';
    this.clientWidth = 1280;
    this.clientHeight = 860;
    this.width = 1280;
    this.height = 860;
    this.classList = {
      add: (c) => this._setClass(c, true),
      remove: (c) => this._setClass(c, false),
      toggle: (c, on) => this._setClass(c, on === undefined ? !this._hasClass(c) : !!on),
      contains: (c) => this._hasClass(c),
    };
  }

  _classes() { return String(this._attrs.get('class') || '').split(/\s+/).filter(Boolean); }
  _hasClass(c) { return this._classes().indexOf(c) >= 0; }
  _setClass(c, on) {
    const set = new Set(this._classes());
    if (on) set.add(c); else set.delete(c);
    this._attrs.set('class', Array.from(set).join(' '));
  }

  setAttribute(k, v) {
    this._attrs.set(k, String(v));
    if (k === 'hidden') this._hidden = true;
    if (k === 'disabled') this._disabled = true;
  }
  getAttribute(k) { return this._attrs.has(k) ? this._attrs.get(k) : null; }
  removeAttribute(k) { this._attrs.delete(k); }
  hasAttribute(k) { return this._attrs.has(k); }

  get hidden() { return !!this._hidden; }
  set hidden(v) { this._hidden = !!v; if (v) this._attrs.set('hidden', ''); else this._attrs.delete('hidden'); }
  get disabled() { return !!this._disabled; }
  set disabled(v) { this._disabled = !!v; if (v) this._attrs.set('disabled', ''); else this._attrs.delete('disabled'); }
  get id() { return this._attrs.get('id') || ''; }
  set id(v) { this._attrs.set('id', String(v)); }
  get className() { return this._attrs.get('class') || ''; }
  set className(v) { this._attrs.set('class', String(v || '')); }
  get attributes() {
    return Array.from(this._attrs.entries()).map(([name, value]) => ({ name, value }));
  }
  get parentNode() { return this.parent; }

  get textContent() {
    if (this.children.length) {
      return this.children.map((c) => (c.__text !== undefined ? c.__text : c.textContent)).join('');
    }
    return this._text;
  }
  set textContent(v) { this._text = String(v == null ? '' : v); this.children.length = 0; }

  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = String(v == null ? '' : v);
    this.children.length = 0;
    for (const child of parseHTML(this._html)) { child.parent = this; this.children.push(child); }
  }

  addEventListener(t, fn) {
    if (!this._listeners.has(t)) this._listeners.set(t, []);
    this._listeners.get(t).push(fn);
  }
  removeEventListener() {}
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  replaceChild(next, prev) {
    const idx = this.children.indexOf(prev);
    if (idx < 0) throw new Error('replaceChild missing old child');
    next.parent = this;
    this.children[idx] = next;
    if (prev && typeof prev === 'object') prev.parent = null;
    return prev;
  }
  insertAdjacentHTML(position, html) {
    const nodes = parseHTML(String(html == null ? '' : html));
    if (String(position).toLowerCase() !== 'beforeend') {
      throw new Error(`unsupported insertAdjacentHTML ${position}`);
    }
    for (const node of nodes) { node.parent = this; this.children.push(node); }
  }
  focus() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight, bottom: this.clientHeight }; }
  getContext() {
    if (this._ctx2d) return this._ctx2d;
    const noop = () => {};
    this._ctx2d = {
      save: noop, restore: noop, beginPath: noop, closePath: noop, stroke: noop, fill: noop,
      clearRect: noop, fillRect: noop, setLineDash: noop, translate: noop, moveTo: noop, lineTo: noop,
      setTransform: noop, arc() {}, fillText() {}, measureText: () => ({ width: 0 }),
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
    };
    return this._ctx2d;
  }
  matches(sel) { return matchesSelector(this, sel); }
  closest(sel) {
    let node = this;
    while (node) { if (node.matches && node.matches(sel)) return node; node = node.parent; }
    return null;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const out = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (child.__text !== undefined) continue;
        if (matchesSelector(child, sel)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
}

function matchesSelector(el, sel) {
  const s = String(sel || '').trim();
  if (s.startsWith('#')) return el.id === s.slice(1);
  if (s.startsWith('.')) return el._hasClass(s.slice(1));
  if (s.startsWith('[')) {
    const m = /^\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]$/.exec(s);
    if (!m) throw new Error(`unsupported attribute selector ${s}`);
    if (!el.hasAttribute(m[1])) return false;
    return m[2] === undefined || el.getAttribute(m[1]) === m[2];
  }
  if (/^[a-zA-Z][\w-]*$/.test(s)) return el.tagName === s.toUpperCase();
  throw new Error(`unsupported selector ${s}`);
}

function parseHTML(html) {
  const roots = [];
  const stack = [];
  const tagRe = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s">]+))?)*)\s*(\/?)>/g;
  let last = 0;
  let m;
  const addText = (text) => {
    const t = text.replace(/\s+/g, ' ');
    if (!t.trim()) return;
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push({ __text: t, parent });
  };
  while ((m = tagRe.exec(html))) {
    addText(html.slice(last, m.index));
    last = tagRe.lastIndex;
    if (m[0].startsWith('<!--')) continue;
    const [, closing, tag, attrs, selfClose] = m;
    if (closing) { stack.pop(); continue; }
    const el = new El(tag);
    const attrRe = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+)))?/g;
    let a;
    while ((a = attrRe.exec(attrs || ''))) {
      const value = a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : '';
      el.setAttribute(a[1], value);
    }
    const parent = stack[stack.length - 1];
    if (parent) { el.parent = parent; parent.children.push(el); } else roots.push(el);
    if (!selfClose && !VOID_TAGS.has(tag.toLowerCase())) stack.push(el);
  }
  addText(html.slice(last));
  return roots;
}

globalThis.document = {
  head: { appendChild() {} },
  body: { appendChild() {} },
  getElementById: () => null,
  createElement: (t) => new El(t),
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
};
globalThis.window = {
  devicePixelRatio: 1,
  innerHeight: 860,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener() {},
  removeEventListener() {},
};
globalThis.ResizeObserver = class { observe() {} disconnect() {} };

const { galaxyMapScreen } = await import('../src/ui/galaxyMap.js');

const HELIOS = 'sector_helios_prime';
const TETHYS = 'sector_tethys_junction';
const QUESTIONS = ['POSITION', 'TRACKING', 'DESTINATION', 'NEXT LEG'];

function makeState() {
  const player = {
    id: 'player', type: 'ship', team: 0, alive: true,
    pos: { x: 180, z: -40 }, vel: { x: 0, z: 0 }, rot: 0,
    hull: 180, hullMax: 220,
  };
  return {
    simTime: 400,
    meta: { seed: 16801 },
    mode: 'flight',
    playerId: 'player',
    player: { id: 'player', credits: 1200, heat: 0, cargo: { volume: 0, capVolume: 20 } },
    entities: new Map([[player.id, player]]),
    ui: { trackedMissionId: null },
    missions: { active: [] },
    nav: {
      waypoint: null,
      autopilot: null,
      executor: null,
      route: {
        legs: [{ from: HELIOS, to: TETHYS, fuel: 11, charge: 4, interdict: 0 }],
        totalFuel: 11,
        totalHops: 1,
      },
    },
    world: { currentSectorId: HELIOS, discovery: {} },
    economy: {},
  };
}

function mount(state) {
  const root = new El('div');
  const ctx = {
    state,
    bus: { emit() {}, on: () => () => {}, off() {} },
    registry: { get: () => null },
    screenManager: { popScreen() {} },
  };
  galaxyMapScreen._camera = null;
  galaxyMapScreen._selectedTarget = null;
  galaxyMapScreen._activeTab = 'overview';
  galaxyMapScreen._tabButtons = [];
  galaxyMapScreen._bookmarks = [];
  galaxyMapScreen._notes = new Map();
  galaxyMapScreen._localIntel = null;
  galaxyMapScreen._lastRibbonKey = null;
  galaxyMapScreen._lastRibbonActionKey = null;
  galaxyMapScreen._lastNavFootKey = null;
  galaxyMapScreen._navContextKey = null;
  galaxyMapScreen._lastNavContext = null;
  galaxyMapScreen._inspectorDetailsHtml = null;
  galaxyMapScreen._previewRouteKey = null;
  galaxyMapScreen.mount(root, ctx);
  galaxyMapScreen._ctx = ctx;
  return root;
}

function questionLabels(root) {
  return root.querySelectorAll('.gm-nav-row-k').map((el) => el.textContent.trim());
}

test('the chart answers each navigation question once', () => {
  const state = makeState();
  const root = mount(state);
  galaxyMapScreen._updateRibbon(state);
  galaxyMapScreen._updateNavFoot(galaxyMapScreen._navContext(state));
  galaxyMapScreen._syncPublicIdentity(state);
  galaxyMapScreen._updateInspector();

  assert.deepEqual(questionLabels(root), QUESTIONS, 'the foot is the only place the four questions are labelled');
  assert.equal(root.querySelectorAll('.gm-nav-row').length, 4);
  const panel = root.querySelector('#gm-tabpanel');
  assert.equal(panel.querySelectorAll('.gm-nav-row').length, 0, 'the inspector must not repeat the foot');
  for (const label of QUESTIONS) {
    assert.equal(panel.textContent.includes(label), false, `overview repeated ${label}`);
  }

  const arrival = root.querySelector('#gm-ribbon-arrival');
  assert.match(arrival.textContent, /^Arrive \S/, 'the ribbon states where the route arrives');
  assert.equal(
    root.querySelectorAll('#gm-ribbon-arrival').length,
    1,
  );
  const arriveHits = (root.textContent.match(/Arrive /g) || []).length;
  assert.equal(arriveHits, 1, 'the title must not copy the ribbon arrival sentence');
  assert.doesNotMatch(root.querySelector('.gm-stamp').textContent, /Arrive/);

  galaxyMapScreen._selectedTarget = {
    id: TETHYS,
    sectorId: TETHYS,
    kind: 'sector',
    name: 'Tethys Junction',
    factionId: 'faction_mts',
    security: 0.4,
    x: 2,
    y: 1,
  };
  galaxyMapScreen._inspectorDetailsHtml = null;
  galaxyMapScreen._updateInspector();

  assert.deepEqual(questionLabels(root), QUESTIONS);
  assert.equal(panel.querySelectorAll('.gm-route-leg').length, 0,
    'selecting the destination must not reprint the plotted legs');
  assert.doesNotMatch(panel.textContent, /Σ/, 'the leg-total line belonged to the duplicated itinerary');
  assert.match(panel.textContent, /Navigation Cost/, 'the selection still says what a course to this mark costs');
  assert.ok(root.querySelectorAll('.gm-ribbon-leg').length >= 1, 'the ribbon still carries the itinerary');
  assert.equal((root.textContent.match(/Arrive /g) || []).length, 1);
  assert.equal(panel.querySelectorAll('.gm-nav-row').length, 0);
  const meta = root.querySelector('#gm-ribbon-meta');
  assert.equal(meta && /Next:/.test(meta.textContent), false, 'the ribbon must not repeat the next leg');
  const tracking = root.querySelector('[data-nav-row="objective"]');
  const destination = root.querySelector('[data-nav-row="destination"]');
  const destName = destination && destination.querySelector('.gm-nav-row-v').textContent;
  assert.equal(tracking.textContent.includes(destName), false,
    'tracking must not repeat the destination name');
  const travel = galaxyMapScreen._travelTabHtml(state);
  assert.equal(/Arrive /.test(travel), false, 'the Travel tab must not copy the ribbon arrival sentence');
  assert.match(travel, /Itinerary/);
  assert.match(travel, /Fuel remaining/);
});
