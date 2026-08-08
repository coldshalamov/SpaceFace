import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as hud from '../src/ui/hud.js';
import { createBus } from '../src/core/eventBus.js';

function overlaps(a, b) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

test('a radar-known contact keeps the contact roster persistently available', () => {
  assert.equal(typeof hud.contactRosterVisible, 'function',
    'HUD must expose the contact-roster visibility contract');

  assert.equal(hud.contactRosterVisible({
    eligibleContactCount: 1,
    pinned: false,
    nearbyHostile: false,
    revealActive: false,
  }), true, 'a contact at 2600-4000 WU must not exist on radar while the roster is hidden');

  assert.equal(hud.contactRosterVisible({
    eligibleContactCount: 0,
    pinned: false,
    nearbyHostile: false,
    revealActive: false,
  }), false, 'an empty on-demand roster should stay out of the playfield');

  assert.equal(hud.contactRosterVisible({
    eligibleContactCount: 0,
    pinned: true,
    nearbyHostile: false,
    revealActive: false,
  }), true, 'the existing manual pin remains authoritative');
});

test('persistent roster stays in the reserved right stack at target resolutions', () => {
  for (const [width, height] of [[1920, 1080], [2560, 1440]]) {
    const layout = hud.resolveObjectiveHudLayout(width, height);
    assert.equal(overlaps(layout.objective, layout.rightDock), false,
      `${width}x${height}: roster/radar stack must not overlap the objective tracker`);
    assert.ok(layout.rightDock.x >= 0 && layout.rightDock.y >= 0
      && layout.rightDock.x + layout.rightDock.width <= width
      && layout.rightDock.y + layout.rightDock.height <= height,
    `${width}x${height}: roster/radar stack stays inside the viewport`);
    assert.ok(hud.contactDisplayLimit(width, height) <= 5,
      `${width}x${height}: compact overflow cap remains active`);
  }

  const uiRoot = readFileSync(new URL('../src/ui/uiRoot.js', import.meta.url), 'utf8');
  assert.match(uiRoot, /\.sf-rightdock\s*\{[^}]*flex-direction:column/s,
    'roster, selected-target detail, and radar must remain one non-overlapping vertical stack');
});

test('mounted HUD roster stays visible, capped, clickable, and rebuild-free at high refresh', () => {
  for (const fps of [60, 144, 240]) {
    const fixture = mountHudFixture();
    try {
      const seconds = 2;
      for (let frame = 0; frame < fps * seconds; frame += 1) {
        fixture.state.simTime += 1 / fps;
        fixture.state.tick += 1;
        for (const contact of fixture.contacts) contact.pos.x += contact.vel.x / fps;
        fixture.hud.frame(1 / fps);
      }

      const overview = fixture.document.querySelector('.sf-overview');
      const rows = overview.querySelectorAll('.sf-overview-row');
      assert.equal(globalThis.getComputedStyle(overview).display, 'flex',
        `${fps} FPS keeps a populated real roster visible`);
      assert.equal(rows.length, 5, `${fps} FPS mounts the responsive five-row cap`);
      assert.deepEqual(rows.map((row) => row.querySelector('.sf-overview-row__name')?.textContent),
        ['Selected Wreck', 'Threat One', 'Threat Two', 'Wing Ally', 'Other Wreck'],
        `${fps} FPS keeps selected/threat/ally/wreck ordering in the mounted DOM`);
      assert.equal(overview.querySelector('.sf-overview-footer')?.textContent, '+2 · 2 OTHERS',
        `${fps} FPS mounts truthful compact overflow`);
      // The roster is reconciled by entity id, so a moving contact never tears the subtree down.
      // The 5 Hz cadence itself is covered by hud-contact-roster-keyed-rows.test.mjs, which counts
      // the text writes the reconcile performs instead of the rebuilds it no longer performs.
      assert.equal(overview.rebuildCount, 0,
        `${fps} FPS never rebuilds the roster subtree (retained keyed rows)`);

      let toast = null;
      fixture.bus.on('toast', (payload) => { toast = payload; });
      rows[1].click();
      assert.equal(fixture.state.player.targetId, 'threat-1', `${fps} FPS real row click selects target`);
      assert.match(toast?.text || '', /Selected target: Threat One/,
        `${fps} FPS real row click emits selection feedback`);
    } finally {
      fixture.restore();
    }
  }
});

test('moving prograde projection retains exact per-HUD records at high refresh', () => {
  let expectedPresentation = null;
  for (const fps of [60, 144, 240]) {
    const calls = [];
    const inputIdentities = new Set();
    const outputIdentities = new Set();
    const worldToScreen = (point, out) => {
      assert.ok(out && typeof out === 'object', `${fps} FPS supplies a retained projection output`);
      inputIdentities.add(point);
      outputIdentities.add(out);
      out.x = 960 + point.x;
      out.y = 540 + point.z;
      out.onScreen = true;
      calls.push({
        input: { x: point.x, y: point.y, z: point.z },
        output: { x: out.x, y: out.y, onScreen: out.onScreen },
      });
      return out;
    };
    const fixture = mountHudFixture({ worldToScreen, targetId: null });
    try {
      const frames = fps * 2;
      for (let frame = 0; frame < frames; frame += 1) {
        fixture.state.simTime += 1 / fps;
        fixture.state.tick += 1;
        if (frame < fps) {
          fixture.player.pos.x = 20 * ((frame + 1) / fps);
          fixture.player.pos.z = 0;
          fixture.player.vel.x = 20;
          fixture.player.vel.z = 0;
        } else {
          fixture.player.pos.x = 100;
          fixture.player.pos.z = 200 + 20 * ((frame - fps + 1) / fps);
          fixture.player.vel.x = 0;
          fixture.player.vel.z = 20;
        }
        fixture.hud.frame(1 / fps);
      }

      assert.equal(calls.length, frames * 2, `${fps} FPS projects exactly A and B once per frame`);
      assert.equal(inputIdentities.size, 2, `${fps} FPS retains exactly two world-point records`);
      assert.equal(outputIdentities.size, 2, `${fps} FPS retains exactly two screen-result records`);
      const [screenA, screenB] = outputIdentities;
      assert.notEqual(screenA, screenB, `${fps} FPS keeps A and B outputs distinct through delta math`);
      assert.deepEqual(calls.slice(-2), [
        {
          input: { x: 100, y: 0, z: 220 },
          output: { x: 1060, y: 760, onScreen: true },
        },
        {
          input: { x: 100, y: 0, z: 256 },
          output: { x: 1060, y: 796, onScreen: true },
        },
      ], `${fps} FPS republishes the moved/turned A and B scalar coordinates`);
      const prograde = fixture.document.querySelector('.sf-protick');
      const presentation = {
        transform: prograde.style.transform,
        opacity: prograde.style.opacity,
      };
      assert.equal(presentation.transform,
        'translate3d(1060.0px,800.0px,0) translate(-4px,-1px) rotate(90.0deg)',
        `${fps} FPS preserves the exact moved/turned prograde placement and heading`);
      if (expectedPresentation == null) expectedPresentation = presentation;
      else assert.deepEqual(presentation, expectedPresentation,
        `${fps} FPS preserves the same final prograde placement and visibility`);
      assert.equal(prograde.style.opacity, '0.900', `${fps} FPS leaves the moving prograde cue visible`);
    } finally {
      fixture.restore();
    }
  }
});

test('selected-target projections retain exact per-HUD center and radius records at high refresh', () => {
  const identitiesFromPriorHud = new Set();
  for (const fps of [60, 144, 240]) {
    const calls = [];
    const inputIdentities = new Set();
    const outputIdentities = new Set();
    const worldToScreen = (point, out) => {
      assert.ok(out && typeof out === 'object', `${fps} FPS supplies a retained target projection output`);
      inputIdentities.add(point);
      outputIdentities.add(out);
      out.x = 100 + point.x;
      out.y = 200 + point.z;
      out.onScreen = true;
      calls.push({
        input: { x: point.x, y: point.y, z: point.z },
        output: { x: out.x, y: out.y, onScreen: out.onScreen },
      });
      return out;
    };
    const fixture = mountHudFixture({ worldToScreen });
    try {
      const target = fixture.contacts[0];
      fixture.player.vel.x = 0;
      fixture.player.vel.z = 0;
      const frames = fps;
      for (let frame = 0; frame < frames; frame += 1) {
        const progress = (frame + 1) / frames;
        fixture.state.simTime += 1 / fps;
        fixture.state.tick += 1;
        target.pos.x = 300 + 20 * progress;
        target.pos.z = 40 * progress;
        target.radius = 10 + 4 * progress;
        fixture.hud.frame(1 / fps);
      }

      assert.equal(calls.length, frames * 5,
        `${fps} FPS preserves lock, center, and three radius projections per selected-target frame`);
      assert.equal(inputIdentities.size, 2, `${fps} FPS retains one center and one radius world record`);
      assert.equal(outputIdentities.size, 2, `${fps} FPS retains one center and one radius screen record`);
      for (const identity of [...inputIdentities, ...outputIdentities]) {
        assert.equal(identitiesFromPriorHud.has(identity), false,
          `${fps} FPS target scratch belongs only to its mounted HUD instance`);
        identitiesFromPriorHud.add(identity);
      }
      assert.deepEqual(calls.slice(-5), [
        { input: { x: 320, y: 0, z: 40 }, output: { x: 420, y: 240, onScreen: true } },
        { input: { x: 320, y: 0, z: 40 }, output: { x: 420, y: 240, onScreen: true } },
        { input: { x: 346, y: 0, z: 40 }, output: { x: 446, y: 240, onScreen: true } },
        { input: { x: 343, y: 0, z: 40 }, output: { x: 443, y: 240, onScreen: true } },
        { input: { x: 340, y: 0, z: 40 }, output: { x: 440, y: 240, onScreen: true } },
      ], `${fps} FPS republishes exact moved/resized center and radius coordinates in shipped order`);

      const lockDiamond = fixture.document.querySelector('.sf-lockdiamond');
      const targetArcs = fixture.document.querySelector('.sf-target-arcs');
      const svg = targetArcs.querySelector('svg');
      assert.equal(lockDiamond.style.transform,
        'translate3d(420.0px,240.0px,0) translate(-50%,-50%)');
      assert.equal(targetArcs.style.transform,
        'translate3d(420.0px,240.0px,0) translate(-50%,-50%)');
      assert.equal(targetArcs.style.width, '62px');
      assert.equal(targetArcs.style.height, '62px');
      assert.equal(svg.getAttribute('viewBox'), '0 0 62 62');
      assert.deepEqual(
        ['.sf-arc-shield', '.sf-arc-armor', '.sf-arc-hull']
          .map((selector) => targetArcs.querySelector(selector).getAttribute('r')),
        ['26', '23', '20'],
      );
    } finally {
      fixture.restore();
    }
  }

  let calls = 0;
  const fixture = mountHudFixture({
    worldToScreen(point) {
      calls += 1;
      return { x: 100 + point.x, y: 200 + point.z, onScreen: true };
    },
  });
  try {
    fixture.player.vel.x = 0;
    fixture.player.vel.z = 0;
    fixture.hud.frame(1 / 60);
    assert.equal(calls, 5, 'legacy helpers that ignore the output record remain supported');
    assert.match(fixture.document.querySelector('.sf-lockdiamond').style.transform, /^translate3d\(/);
    assert.match(fixture.document.querySelector('.sf-target-arcs').style.transform, /^translate3d\(/);
  } finally {
    fixture.restore();
  }
});

function mountHudFixture({
  worldToScreen = () => ({ x: 960, y: 540, onScreen: true }),
  targetId = 'selected',
} = {}) {
  const globals = {
    document: globalThis.document,
    window: globalThis.window,
    performance: globalThis.performance,
    getComputedStyle: globalThis.getComputedStyle,
  };
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
  globalThis.performance = { now: () => 1000 };
  globalThis.getComputedStyle = (element) => ({
    display: element?.style?.display === 'none'
      ? 'none'
      : (element?.classList?.contains('sf-overview') ? 'flex' : (element?.style?.display || 'block')),
    getPropertyValue: () => '',
  });

  const player = ship('player', 1, 0, 'Player');
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
      targetId: targetId === 'selected' ? selected.id : targetId,
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
    helpers: { worldToScreen },
  }, null);
  return {
    state, player, bus, hud: mounted, document, contacts,
    restore() {
      globalThis.document = globals.document;
      globalThis.window = globals.window;
      globalThis.performance = globals.performance;
      globalThis.getComputedStyle = globals.getComputedStyle;
    },
  };
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
    this._innerHTML = '';
    this.children.length = 0;
    if (value != null && String(value) !== '') this.appendChild(new HudText(String(value)));
  }
  // Fidelity: real appendChild DETACHES first, so appending a live node MOVES it. Without this the
  // shim duplicates any node a reconciler reorders.
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this; this.children.push(child); return child;
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
