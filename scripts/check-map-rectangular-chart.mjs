// scripts/check-map-rectangular-chart.mjs — the chart is full-screen and rectangular now.
//
// Acceptance for the dial's retirement: the SYSTEM level draws marks at TRUE projected positions
// across the whole viewport, with no graduated gate ring, no square-root radial warp, no ring-crown
// captions, and the distance scale reading on an edge ruler. Drives the real `galaxyMapScreen._draw`
// through the same recording-canvas shape check:map-never-lost uses (its harness is private, so the
// minimal stubs live here too).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HELIOS = 'sector_helios_prime';

let passed = 0;
function ok(label) { passed += 1; console.log(`  PASS  ${label}`); }

function createRecordingContext() {
  const rec = { texts: [], arcs: [] };
  const noop = () => {};
  const ctx = {
    _rec: rec,
    canvas: null,
    save: noop, restore: noop, beginPath: noop, closePath: noop, stroke: noop,
    clearRect: noop, fillRect: noop, strokeRect: noop, setLineDash: noop, clip: noop,
    rect: noop, quadraticCurveTo: noop, bezierCurveTo: noop, ellipse: noop, rotate: noop,
    scale: noop, drawImage: noop, createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => null, putImageData: noop, getImageData: () => ({ data: [] }),
    setTransform: noop, resetTransform: noop, transform: noop, arcTo: noop,
    isPointInPath: () => false, roundRect: noop, setLineWidth: noop,
    fill: noop, translate: noop, moveTo: noop, lineTo: noop,
    arc: noop,
    fillText(text) { rec.texts.push({ text: String(text) }); },
    strokeText(text) { rec.texts.push({ text: String(text) }); },
    measureText(text) { return { width: String(text).length * 6 }; },
  };
  return ctx;
}

class El {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.classList = {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, on) { if (on) this._set.add(c); else this._set.delete(c); },
      contains(c) { return this._set.has(c); },
    };
    this._attrs = new Map();
    this.textContent = '';
    this.innerHTML = '';
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.clientWidth = 1200;
    this.clientHeight = 820;
    this.width = 1200;
    this.height = 820;
    this._listeners = new Map();
  }
  setAttribute(k, v) { this._attrs.set(k, String(v)); }
  getAttribute(k) { return this._attrs.has(k) ? this._attrs.get(k) : null; }
  removeAttribute(k) { this._attrs.delete(k); }
  addEventListener() {}
  removeEventListener() {}
  appendChild(c) { this.children.push(c); return c; }
  focus() {}
  closest() { return null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1200, height: 820 }; }
  getContext() { return this._ctx || (this._ctx = createRecordingContext()); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

class Root extends El {
  constructor() { super('div'); this._registry = new Map(); }
  querySelector(sel) { return this._registry.get(sel) || null; }
  set innerHTML(v) {
    this._html = String(v);
    if (!this._registry) this._registry = new Map();
    if (this._html) this._build();
  }
  get innerHTML() { return this._html || ''; }
  _build() {
    const mk = (sel, tag) => { const e = new El(tag); this._registry.set(sel, e); return e; };
    const viewport = mk('.gm-viewport', 'div');
    viewport.clientWidth = 1200; viewport.clientHeight = 820;
    const canvas = mk('canvas', 'canvas');
    canvas.width = 1200; canvas.height = 820;
    mk('.gm-inspector-details', 'div');
    mk('#gm-navfoot', 'div');
    mk('#gm-set-course-btn', 'button');
    mk('#gm-engage-route-btn', 'button');
    mk('#gm-engage-reason', 'div');
    mk('#gm-return-ship-btn', 'button');
    mk('#gm-frame-both-btn', 'button');
    mk('#gm-frame-reason', 'div');
    mk('#gm-commodity-select', 'select');
    mk('.gm-search-input', 'input');
    mk('.gm-search-results', 'div');
    mk('.gm-close', 'button');
    mk('.gm-hint-btn', 'button');
    mk('.gm-hints', 'div');
    mk('.gm-inspector-content', 'div');
    mk('[data-level]', 'b');
    mk('.gm-level', 'span');
    mk('.gm-rail-marker', 'span');
    mk('.gm-rail-track', 'span');
    this._scaleButtons = ['local', 'system', 'galaxy'].map((f) => {
      const b = new El('button');
      b.setAttribute('data-focus', f);
      return b;
    });
  }
  querySelectorAll(sel) {
    if (sel === '.gm-scale-btn') return this._scaleButtons || [];
    if (sel === '.gm-layer-btn') return [];
    return [];
  }
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
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener() {},
  removeEventListener() {},
};
if (typeof globalThis.Path2D !== 'function') {
  globalThis.Path2D = class Path2D {
    constructor(d) { this.d = d == null ? '' : String(d); this.ops = []; }
    moveTo() {} lineTo() {} closePath() {} rect() {} arc() {} addPath() {}
  };
}

const { galaxyMapScreen } = await import('../src/ui/galaxyMap.js');

function makeState({ sectorId = HELIOS, playerPos = { x: 0, z: 0 } } = {}) {
  const player = {
    id: 'player', type: 'ship', team: 0, alive: true,
    pos: { ...playerPos }, vel: { x: 0, z: 0 }, rot: 0,
    homeSectorId: sectorId,
    data: { isPlayer: true, homeSectorId: sectorId },
  };
  const entities = new Map([[player.id, player]]);
  return {
    simTime: 120,
    meta: { seed: 47 },
    mode: 'flight',
    playerId: 'player',
    player: { id: 'player', entityId: 'player' },
    entities,
    ui: { trackedMissionId: null },
    missions: { active: [] },
    nav: { route: null, executor: null, waypoint: null, autopilot: null },
    world: { currentSectorId: sectorId, sectorId, sectors: {}, discovery: {} },
    ship: {},
    cargo: {},
    economy: {},
  };
}

function mountWith(state) {
  const root = new Root();
  const ctx = {
    state,
    bus: { emit() {}, on() { return () => {}; }, off() {} },
    registry: { get: () => null },
    screenManager: { popScreen() {} },
  };
  galaxyMapScreen.mount(root, ctx);
  galaxyMapScreen._ctx = ctx;
  galaxyMapScreen._canvas = root.querySelector('canvas');
  galaxyMapScreen._g = galaxyMapScreen._canvas.getContext('2d');
  galaxyMapScreen._dpr = 1;
  galaxyMapScreen._camera = null;
  galaxyMapScreen._localIntel = null;
  return root;
}

function drawAt(focus, state) {
  galaxyMapScreen._setScaleFocus(focus, { draw: false, animate: false });
  const g = galaxyMapScreen._g;
  g._rec.texts.length = 0;
  g._rec.arcs.length = 0;
  galaxyMapScreen._draw();
  return g._rec;
}

const textOf = (rec) => rec.texts.map((t) => t.text).join(' | ');

// 1. The dial's words are gone from the SYSTEM level, and the ruler is the scale.
{
  const state = makeState({ sectorId: HELIOS });
  mountWith(state);
  const rec = drawAt('system', state);
  const text = textOf(rec);
  assert.doesNotMatch(text, /GATE RING/i, 'the ring-crown caption must be gone');
  assert.doesNotMatch(text, /RADIAL SCALE/i, 'the sqrt-scale caption must be gone');
  assert.match(text, /per bar/, 'the edge ruler must print its figure');
  const ruler = (text.match(/[0-9][0-9.k]* WU per bar/) || [])[0] || 'per bar';
  ok(`SYSTEM draws no ring-crown captions; the edge ruler reads "${ruler}"`);

  // 2. No warp: the screen keeps no systemWarp, so camera focus lands on true positions.
  assert.equal(galaxyMapScreen._systemWarp, null, 'no radial warp may be registered');
  assert.equal(galaxyMapScreen._dialScreen, null, 'no dial may be registered');
  ok('no dial or radial warp is registered after a SYSTEM draw');
}

// 3. Source-level pins: the square-root scale and ring-crown text never come back silently.
{
  const SOURCE = readFileSync(fileURLToPath(new URL('../src/ui/galaxyMap.js', import.meta.url)), 'utf8');
  assert.doesNotMatch(SOURCE, /SQUARE-ROOT RADIAL SCALE \(the dial/, 'the warp law is retired with its code');
  assert.doesNotMatch(SOURCE, /GATE RING \$\{formatDistanceWU/, 'the ring-crown text is retired');
  assert.match(SOURCE, /_drawEdgeScale\(g, field, pxPerWU\)/, 'the edge ruler is wired into the SYSTEM draw');
  ok('source-level pins: dial retired, edge ruler wired');
}

console.log(`\ncheck:map-rectangular-chart — ${passed} sections passed`);
