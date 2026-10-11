import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createHud,
  objectiveTravelReadout,
  resolveObjectiveEdgePlacement,
} from '../src/ui/hud.js';
import { createBus } from '../src/core/eventBus.js';

// Pin for the off-screen objective arrow (D135 seam). The edge cue must agree with the radar's
// fixed north-up convention: world +Z is screen UP and world +X is screen LEFT, the chase camera
// never yaws, and a goal behind the player must guide toward its true world bearing instead of the
// perspective-mirrored one. Production DOM shim (mirrors test/hud-g-lag.test.mjs, which mirrors
// test/hud-contact-roster-keyed-rows.test.mjs).
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
    this.isConnected = true;
    this.offsetWidth = 1;
  }
  get className() { return this._className; }
  set className(value) { this._className = String(value || ''); this.classList.reset(this._className); }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) {
    this._innerHTML = String(value || '');
    this.children.length = 0;
    parseMarkup(this, this._innerHTML);
  }
  get textContent() { return this.children.map((child) => child.textContent).join(''); }
  set textContent(value) {
    this._innerHTML = '';
    this.children.length = 0;
    if (value != null && String(value) !== '') this.appendChild(new HudText(String(value)));
  }
  appendChild(child) {
    if (!child) return null;
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  prepend(child) { child.parentNode = this; this.children.unshift(child); return child; }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    if (child.parentNode === this) child.parentNode = null;
    return child;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
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
    // The two plate stacks report honest production-anchor boxes; everything unmeasured reports a
    // zero box, which plateBox() rejects — this fixture must not invent extra obstacles for the
    // edge arrow to dodge.
    if (this.classList.contains('sf-leftstack')) {
      return { x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 1020, width: 300, height: 1020 };
    }
    if (this.classList.contains('sf-rightdock')) {
      return { x: 1620, y: 560, top: 560, left: 1620, right: 1920, bottom: 1080, width: 300, height: 520 };
    }
    return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
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
  createTextNode(text) { return new HudText(String(text)); }
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
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    arc() {},
    fill() {},
    stroke() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
  };
  return new Proxy(target, {
    get(obj, key) { return key in obj ? obj[key] : () => {}; },
    set(obj, key, value) { obj[key] = value; return true; },
  });
}

// Mounts the real flight HUD at 1920x1080 with the player at the world origin. `worldToScreen`
// stands in for the chase camera; the edge-math path (resolveObjectiveEdgePlacement) never reads
// it, so an off-screen stub only has to report onScreen:false honestly.
function mountArrowFixture({ worldToScreen } = {}) {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevPerf = globalThis.performance;
  const prevGetComputedStyle = globalThis.getComputedStyle;

  const doc = new HudDocument();
  const hudRoot = doc.createElement('div');
  hudRoot.id = 'hud';
  doc.body.appendChild(hudRoot);

  globalThis.document = doc;
  globalThis.window = {
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  globalThis.performance = { now: () => 1000 };
  globalThis.getComputedStyle = (element) => ({
    display: element?.style?.display === 'none' ? 'none' : (element?.style?.display || 'block'),
    getPropertyValue: () => '',
  });

  const player = {
    id: 'player',
    type: 'ship',
    team: 1,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    angle: 0,
    angVel: 0,
    hull: 100,
    hullMax: 100,
    shield: 60,
    shieldMax: 60,
    cap: 100,
    capMax: 100,
    data: { defId: 'hitch', weapons: [], combat: { lockProgress: 0, lockTarget: null } },
  };

  const state = {
    mode: 'flight',
    playerId: 'player',
    simTime: 0,
    tick: 0,
    entities: new Map([[player.id, player]]),
    entityList: [player],
    player: {
      targetId: null,
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
    input: { actions: {}, pointerScreen: { active: true, x: 960, y: 540 } },
    missions: { active: [] },
    story: { beatIndex: -1 },
    nav: {},
    world: { currentSectorId: 'helios', scanPings: {} },
    fuel: { current: 100, max: 100 },
  };

  const helpers = {
    worldToScreen: worldToScreen || ((point, out) => {
      const o = out || {};
      o.x = 960 + (point?.x || 0);
      o.y = 540 + (point?.z || 0);
      o.onScreen = true;
      return o;
    }),
  };

  const hud = createHud({ bus: createBus(), state, helpers });

  return {
    doc,
    player,
    state,
    hud,
    arrow: () => hudRoot.querySelector('.sf-objarrow'),
    step(dt = 1 / 60) {
      state.simTime += dt;
      state.tick += 1;
      hud.frame(dt);
    },
    restore() {
      if (typeof hud.destroy === 'function') hud.destroy();
      globalThis.document = prevDoc;
      globalThis.window = prevWin;
      globalThis.performance = prevPerf;
      globalThis.getComputedStyle = prevGetComputedStyle;
    },
  };
}

function readAngleRad(arrow) {
  const raw = arrow.style['--sf-arrow-angle'];
  return raw == null ? null : parseFloat(String(raw));
}

function edgePresentation(arrow) {
  return {
    display: arrow.style.display,
    onScreenClass: arrow.classList.contains('sf-objarrow--onscreen'),
    edgeClass: arrow.classList.contains('sf-objarrow--edge'),
    edge: arrow.dataset.edge || null,
    transform: arrow.style.transform,
    angleRad: readAngleRad(arrow),
    label: arrow.querySelector('.sf-objarrow__label').textContent,
    aria: arrow.getAttribute('aria-label'),
  };
}

test('an in-camera objective never arms the edge chevron (the diamond owns the mark)', () => {
  const fx = mountArrowFixture({
    worldToScreen: (_point, out) => {
      const o = out || {};
      o.x = 900;
      o.y = 420;
      o.onScreen = true;
      return o;
    },
  });
  try {
    fx.state.nav.waypoint = { kind: 'navigation', label: 'Ore Silo', pos: { x: 0, z: 600 } };
    fx.step();
    fx.step();
    const arrow = fx.arrow();
    assert.ok(arrow, 'the objective arrow mounts with the HUD');
    const view = edgePresentation(arrow);
    assert.equal(view.display, 'block', 'the mark itself stays mounted in world space');
    assert.equal(view.onScreenClass, true, 'an in-camera objective takes the on-screen diamond state');
    assert.equal(view.edgeClass, false, 'the edge chevron state is off');
    assert.equal(view.angleRad, null, 'no --sf-arrow-angle is ever written for an in-camera goal');
    assert.equal(view.transform, 'translate3d(900px,420px,0)',
      'the mark rides the projected world point, not an edge seat');
    assert.equal(view.edge, 'left', 'the label side is still decided for the on-screen diamond');
  } finally {
    fx.restore();
  }
});

test('an off-screen objective seats the chevron on the true edge with the direction angle and the tracker label', () => {
  // Goal 600 WU north of the player (+Z). Radar and chase view draw +Z as screen UP, so the
  // chevron must sit on the TOP edge pointing up-screen (-pi/2), carrying the tracker's own
  // distance/ETA wording.
  const fx = mountArrowFixture({
    worldToScreen: () => ({ x: 960, y: -9999, onScreen: false }),
  });
  try {
    fx.state.nav.waypoint = { kind: 'navigation', label: 'Ore Silo', pos: { x: 0, z: 600 } };
    fx.step();
    fx.step();
    const travel = objectiveTravelReadout(fx.state, { pos: { x: 0, z: 600 } });
    assert.equal(travel.distanceText, '600 WU');
    assert.equal(travel.etaText, 'ETA —');
    const view = edgePresentation(fx.arrow());
    assert.equal(view.edgeClass, true, 'an off-camera objective takes the edge state');
    assert.equal(view.onScreenClass, false);
    assert.equal(view.edge, 'top', 'a northern goal seats on the top edge');
    assert.equal(view.transform, 'translate3d(960px,34px,0)',
      'the chevron seats centered on the top margin (1920x1080, 34px inset)');
    assert.ok(view.angleRad != null, 'the edge chevron carries a --sf-arrow-angle');
    assert.ok(Math.abs(view.angleRad - (-Math.PI / 2)) < 1e-9,
      `the angle must name up-screen toward +Z, got ${view.angleRad}`);
    assert.equal(view.label, `GOAL · ORE SILO · ${travel.distanceText} · ${travel.etaText}`,
      'the arrow label is the tracker’s own distance wording');
    assert.equal(view.aria, 'Current objective: ORE SILO, 600 WU, ETA —');
    assert.equal(fx.arrow().title, 'Ore Silo', 'the hover title names the goal');
  } finally {
    fx.restore();
  }
});

test('D135 north-up: flying SOUTH toward the goal seats the chevron on the LOW edge pointing down-screen', () => {
  // The player heading does not steer the cue (the camera never yaws); the world bearing does.
  // A goal ahead while flying south (-Z) must seat at the bottom edge with a positive (down-screen)
  // angle — never mirrored to the top by heading or projection, which is how D135 broke.
  const fx = mountArrowFixture({
    worldToScreen: () => ({ x: 960, y: -9999, onScreen: false }),
  });
  try {
    fx.player.vel.x = 0;
    fx.player.vel.z = -50;
    fx.state.nav.waypoint = { kind: 'navigation', label: 'South Beacon', pos: { x: 0, z: -800 } };
    fx.step();
    fx.step();
    const travel = objectiveTravelReadout(fx.state, { pos: { x: 0, z: -800 } });
    assert.equal(travel.distanceText, '800 WU');
    assert.equal(travel.etaText, 'ETA 16s', 'closing flight reports an honest ETA');
    const view = edgePresentation(fx.arrow());
    assert.equal(view.edge, 'bottom', 'a southern goal seats on the low edge');
    assert.notEqual(view.edge, 'top', 'the seat must never mirror to the high edge');
    assert.equal(view.transform, 'translate3d(960px,1046px,0)',
      'the chevron seats on the bottom margin, below screen center');
    assert.ok(view.angleRad != null && Math.abs(view.angleRad - Math.PI / 2) < 1e-9,
      `the angle must point down-screen (+pi/2), got ${view.angleRad}`);
    assert.equal(view.label, `GOAL · SOUTH BEACON · ${travel.distanceText} · ${travel.etaText}`,
      'the arrow label is the tracker’s own distance/ETA wording while closing');
  } finally {
    fx.restore();
  }
});

test('extreme bearings stay seated on one edge — a nearly-behind goal takes the side edge, never off the corner', () => {
  const w = 1920;
  const h = 1080;
  const margin = 34;
  const player = { pos: { x: 0, z: 0 } };

  // Every bearing of the full circle: the seat stays inside the margin-inset viewport and touches
  // at least one inset boundary (it is ON an edge), and the named edge agrees with its band.
  for (let i = 0; i < 72; i += 1) {
    const theta = (i / 72) * Math.PI * 2;
    const target = { x: 1000 * Math.cos(theta), z: 1000 * Math.sin(theta) };
    const seat = resolveObjectiveEdgePlacement(w, h, player, target);
    assert.ok(seat, `placement exists at bearing ${i}`);
    const eps = 1e-6;
    assert.ok(seat.x >= margin - eps && seat.x <= w - margin + eps,
      `bearing ${i}: x ${seat.x} stays inside the inset viewport`);
    assert.ok(seat.y >= margin - eps && seat.y <= h - margin + eps,
      `bearing ${i}: y ${seat.y} stays inside the inset viewport`);
    const gaps = [seat.x - margin, seat.y - margin, w - margin - seat.x, h - margin - seat.y];
    assert.ok(Math.min(...gaps) <= eps,
      `bearing ${i}: the seat touches an edge (gaps ${gaps.map((g) => g.toFixed(3)).join(',')})`);
    if (seat.edge === 'left') assert.ok(seat.x <= w * 0.28 + eps, `bearing ${i}: left seat rides the left band`);
    else if (seat.edge === 'right') assert.ok(seat.x >= w * 0.72 - eps, `bearing ${i}: right seat rides the right band`);
    else if (seat.edge === 'top') assert.ok(seat.y < h / 2, `bearing ${i}: top seat is the up-screen half`);
    else if (seat.edge === 'bottom') assert.ok(seat.y > h / 2, `bearing ${i}: bottom seat is the down-screen half`);
  }

  // Nearly behind and off to one side: the side band owns the seat (data-edge 'left'/'right'),
  // the seat touches a boundary exactly, and neither coordinate escapes the inset viewport.
  const behindLeft = resolveObjectiveEdgePlacement(w, h, player, { x: 1400, z: -1000 });
  assert.equal(behindLeft.edge, 'left', 'a behind-left goal seats as a left-edge cue');
  assert.ok(behindLeft.x >= margin - 1e-6 && behindLeft.x <= w * 0.28 + 1e-6,
    `the left seat stays in the left band, got x ${behindLeft.x}`);
  assert.ok(Math.abs(behindLeft.y - (h - margin)) < 1e-6,
    'the left-band seat still touches a boundary exactly (never floats off-corner)');

  const behindRight = resolveObjectiveEdgePlacement(w, h, player, { x: -1400, z: -1000 });
  assert.equal(behindRight.edge, 'right', 'a behind-right goal seats as a right-edge cue');
  assert.ok(behindRight.x >= w * 0.72 - 1e-6 && behindRight.x <= w - margin + 1e-6,
    `the right seat stays in the right band, got x ${behindRight.x}`);
  assert.ok(Math.abs(behindRight.y - (h - margin)) < 1e-6,
    'the right-band seat still touches a boundary exactly (never floats off-corner)');

  // Almost directly behind (slightly east): still a real edge seat inside the band, not a corner escape.
  const behind = resolveObjectiveEdgePlacement(w, h, player, { x: 30, z: -1000 });
  assert.equal(behind.edge, 'bottom');
  assert.ok(Math.abs(behind.y - (h - margin)) < 1e-6, 'the nearly-behind seat rides the bottom boundary');
  assert.ok(behind.x > w * 0.28 && behind.x < w * 0.72, 'the nearly-behind seat stays inside the bottom band');

  // The angle keeps naming the true world bearing at the extremes: world east (+X) is screen left.
  // atan2(±0, -1) lands on ±pi — same direction, so compare with wrap-aware angular distance.
  const east = resolveObjectiveEdgePlacement(w, h, player, { x: 1000, z: 0 });
  assert.equal(east.edge, 'left');
  const eastDelta = Math.atan2(Math.sin(east.angleRad - Math.PI), Math.cos(east.angleRad - Math.PI));
  assert.ok(Math.abs(eastDelta) < 1e-9,
    `world east must point screen-left (pi, wrap-aware), got ${east.angleRad}`);
});
