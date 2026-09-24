import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createHud,
  stepHudGLagSpring,
  calculateHudGLagTarget,
  calculateGLocIntensity,
} from '../src/ui/hud.js';
import { createBus } from '../src/core/eventBus.js';

// --- Production HUD DOM shim (mirrors test/hud-contact-roster-keyed-rows.test.mjs) ---
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
    this.offsetWidth = 100;
    this.offsetHeight = 100;
  }

  get firstElementChild() {
    for (const child of this.children) {
      if (child.nodeType === 1) return child;
    }
    return null;
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

  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children.length = 0;
    children.forEach((child) => this.appendChild(child));
  }

  append(...children) { children.forEach((child) => this.appendChild(child)); }
  prepend(child) {
    if (!child) return null;
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.unshift(child);
    return child;
  }

  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    if (child.parentNode === this) child.parentNode = null;
    return child;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
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
    if (name.startsWith('data-')) {
      delete this.dataset[dataKey(name.slice(5))];
    }
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

function mountTestFixture(options = {}) {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevPerf = globalThis.performance;
  const prevGetComputedStyle = globalThis.getComputedStyle;

  const doc = new HudDocument();
  const hudRoot = doc.createElement('div');
  hudRoot.id = 'hud';
  doc.body.appendChild(hudRoot);

  const aimReticle = doc.createElement('div');
  aimReticle.id = 'aim-reticle';
  const reticleSvg = doc.createElement('svg');
  aimReticle.appendChild(reticleSvg);
  doc.body.appendChild(aimReticle);

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

  const bus = createBus();
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
    boost: { energy: 100, max: 100, dashImpulse: 10, dashCdT: 0 },
    data: {
      defId: 'hitch',
      weapons: [],
      combat: { lockProgress: 0, lockTarget: null },
    },
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
      credits: 500,
      cargo: { items: {}, usedVolume: 0, capVolume: 40 },
      weaponRange: 900,
      heat: 0,
    },
    settings: {
      ui: { overviewOpen: false },
      video: {
        motionReduce: options.motionReduce || false,
        flashReduce: options.flashReduce || false,
      },
      accessibility: {
        colorblindMode: 'none',
        reducedMotion: options.motionReduce || false,
        reducedFlash: options.flashReduce || false,
      },
      gameplay: {}, controls: {}, audio: {}, graphics: {},
    },
    ui: { radarRange: 4000, trackedMissionId: null },
    input: {
      actions: {
        boost: false,
      },
      pointerScreen: { active: true, x: 960, y: 540 },
    },
    missions: { active: [] },
    story: { beatIndex: -1 },
    nav: {},
    world: { currentSectorId: 'helios', scanPings: {} },
    fuel: { current: 100, max: 100 },
  };

  const helpers = {
    worldToScreen: options.worldToScreen || ((pos, out) => {
      const o = out || {};
      o.x = 960 + (pos?.x || 0);
      o.y = 540 + (pos?.z || 0);
      o.onScreen = true;
      return o;
    }),
  };

  const hudInstance = createHud({ bus, state, helpers });

  return {
    doc,
    hudRoot,
    aimReticle,
    player,
    state,
    bus,
    hud: hudInstance,
    step(dt = 1 / 60) {
      state.simTime += dt;
      state.tick += 1;
      hudInstance.frame(dt);
    },
    restore() {
      hudInstance.destroy();
      globalThis.document = prevDoc;
      globalThis.window = prevWin;
      globalThis.performance = prevPerf;
      globalThis.getComputedStyle = prevGetComputedStyle;
    },
  };
}

// ---------------------------------------------------------------------------
// Unit Tests: Mathematical Spring & G-LOC Curves
// ---------------------------------------------------------------------------

test('stepHudGLagSpring converges toward target and damps back to zero when released', () => {
  const spring = { x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0 };

  // Step toward a constant displacement of 4px
  for (let i = 0; i < 30; i++) {
    stepHudGLagSpring(spring, 4.0, 0, 1 / 60, false);
  }
  assert.ok(spring.x > 3.0 && spring.x <= 4.8, `spring should track target, got ${spring.x}`);

  // Hold target for settling
  for (let i = 0; i < 40; i++) {
    stepHudGLagSpring(spring, 4.0, 0, 1 / 60, false);
  }
  assert.ok(Math.abs(spring.x - 4.0) < 0.1, `spring should settle close to target, got ${spring.x}`);

  // Return target to 0 (releasing stick)
  for (let i = 0; i < 60; i++) {
    stepHudGLagSpring(spring, 0, 0, 1 / 60, false);
  }
  assert.equal(spring.x, 0, 'spring should snap cleanly to rest at zero');
  assert.equal(spring.vx, 0, 'velocity should be zero at rest');
});

test('stepHudGLagSpring immediately zeroes displacement when reducedMotion is active', () => {
  const spring = { x: 4.5, y: -3.2, vx: 20, vy: -15, targetX: 4.5, targetY: -3.2 };
  stepHudGLagSpring(spring, 4.5, -3.2, 1 / 60, true);

  assert.equal(spring.x, 0, 'displacement X must be 0 in reduced motion');
  assert.equal(spring.y, 0, 'displacement Y must be 0 in reduced motion');
  assert.equal(spring.vx, 0, 'velocity X must be 0 in reduced motion');
  assert.equal(spring.vy, 0, 'velocity Y must be 0 in reduced motion');
});

test('calculateHudGLagTarget obeys physical directionality and bounds', () => {
  // Test yaw turning right (+yaw rate) -> optics trail left (-X target)
  const turningPlayer = {
    vel: { x: 0, z: 0 },
    angVel: 3.14, // 180 deg/s turn
  };
  const targetYaw = calculateHudGLagTarget(turningPlayer, 1 / 60, { x: 0, z: 0 }, false);
  assert.ok(targetYaw.x < -2.0, `turning right must lag left, got x=${targetYaw.x}`);
  assert.ok(targetYaw.x >= -5.5, `must be bounded within -5.5px, got x=${targetYaw.x}`);

  // Test forward acceleration (+Z acceleration) -> optics trail downward (+Y screen)
  const acceleratingPlayer = {
    vel: { x: 0, z: 80 },
    angVel: 0,
  };
  const targetForward = calculateHudGLagTarget(acceleratingPlayer, 1 / 60, { x: 0, z: 0 }, false);
  assert.ok(targetForward.y > 1.0, `forward accel must lag downward (+Y), got y=${targetForward.y}`);
  assert.ok(targetForward.y <= 5.5, `must be bounded within 5.5px, got y=${targetForward.y}`);

  // Test boost bonus adds extra kick
  const boostedTarget = calculateHudGLagTarget(acceleratingPlayer, 1 / 60, { x: 0, z: 0 }, true);
  assert.ok(boostedTarget.y >= targetForward.y, 'boost must add positive forward lag');
});

test('calculateGLocIntensity activates only after 0.6s sustained high-G and ramps smoothly', () => {
  assert.equal(calculateGLocIntensity(0), 0, '0s must yield 0 intensity');
  assert.equal(calculateGLocIntensity(0.59), 0, 'sub-0.6s turns must not trigger tunnel vision');
  assert.ok(calculateGLocIntensity(0.8) > 0.1 && calculateGLocIntensity(0.8) < 0.3, '0.8s must yield subtle vignette');
  assert.equal(calculateGLocIntensity(1.8), 1.0, '1.8s sustained turn reaches full vignette intensity');
});

// ---------------------------------------------------------------------------
// Integration Tests: Optical G-Lag on Live HUD Elements
// ---------------------------------------------------------------------------

test('HUD elements experience optical G-lag during violent bank turns and recover at rest', () => {
  const fx = mountTestFixture();
  try {
    // Initial resting state: 1 frame
    fx.step(1 / 60);
    const initialOffset = fx.hud.getGLagOffset();
    assert.equal(initialOffset.x, 0, 'resting X offset is 0');
    assert.equal(initialOffset.y, 0, 'resting Y offset is 0');

    // Simulate violent sustained bank turn right (angVel = 3.5 rad/s)
    fx.player.angVel = 3.5;
    for (let i = 0; i < 15; i++) {
      fx.step(1 / 60);
    }

    const turningOffset = fx.hud.getGLagOffset();
    assert.ok(turningOffset.x < -1.5, `turn should produce leftward optical lag, got ${turningOffset.x}`);
    assert.ok(turningOffset.x >= -5.5, `must be strictly bounded, got ${turningOffset.x}`);

    // Verify aim-reticle inner element has the translate3d transform applied
    const reticleInner = fx.aimReticle.firstElementChild;
    assert.ok(reticleInner, 'reticle inner element exists');
    assert.match(reticleInner.style.transform, /translate3d\(-?\d+\.\d+px,/);

    // Stop turning and settle for 1.2s (75 frames)
    fx.player.angVel = 0;
    for (let i = 0; i < 75; i++) {
      fx.step(1 / 60);
    }

    const settledOffset = fx.hud.getGLagOffset();
    assert.equal(settledOffset.x, 0, 'optical lag must settle back to exactly 0');
    assert.equal(settledOffset.y, 0, 'optical lag must settle back to exactly 0');
  } finally {
    fx.restore();
  }
});

test('motionReduce disables optical G-lag and vignette even under extreme maneuvers', () => {
  const fx = mountTestFixture({ motionReduce: true });
  try {
    fx.player.angVel = 5.0; // extreme turn
    fx.player.vel.z = 200;  // extreme speed
    for (let i = 0; i < 30; i++) {
      fx.step(1 / 60);
    }

    const offset = fx.hud.getGLagOffset();
    assert.equal(offset.x, 0, 'motionReduce must keep optical lag at 0');
    assert.equal(offset.y, 0, 'motionReduce must keep optical lag at 0');
    assert.equal(fx.hud.getGLocVignetteOpacity(), 0, 'vignette opacity must stay 0 in motionReduce');
  } finally {
    fx.restore();
  }
});

// ---------------------------------------------------------------------------
// Integration Tests: Electronic Disruption (EMP Strike & Shield Collapse)
// ---------------------------------------------------------------------------

test('shield collapse triggers electronic disruption glitch on HUD', () => {
  const fx = mountTestFixture();
  try {
    fx.player.shield = 50;
    fx.step(1 / 60);
    assert.equal(fx.hud.getDisrupted(), false, 'not disrupted initially');

    // Shield collapses to 0
    fx.player.shield = 0;
    fx.step(1 / 60);

    assert.equal(fx.hud.getDisrupted(), true, 'shield collapse must trigger sf-hud--glitch class');
    const glitchOverlay = fx.hudRoot.querySelector('.sf-hud-glitch-overlay');
    assert.ok(glitchOverlay && glitchOverlay.classList.contains('active'), 'glitch overlay must be active');
  } finally {
    fx.restore();
  }
});

test('combat:emp event triggers electronic disruption glitch', () => {
  const fx = mountTestFixture();
  try {
    fx.step(1 / 60);
    assert.equal(fx.hud.getDisrupted(), false);

    fx.bus.emit('combat:emp', { targetId: fx.player.id });
    assert.equal(fx.hud.getDisrupted(), true, 'EMP event must trigger disruption');
  } finally {
    fx.restore();
  }
});

test('full mode EMP keeps glitch plus audio blip and adds no words', () => {
  const fx = mountTestFixture();
  const audio = [];
  const toasts = [];
  fx.bus.on('audio:cue', (p) => audio.push(p));
  fx.bus.on('toast', (p) => toasts.push(p));
  try {
    fx.bus.emit('combat:emp', { targetId: fx.player.id });
    assert.equal(fx.hud.getDisrupted(), true, 'full mode keeps the flash');
    assert.ok(audio.some((p) => p && p.id === 'ui_deny'), 'full mode keeps the restrained blip');
    assert.equal(toasts.length, 0, 'full mode adds no replacement words');
  } finally {
    fx.restore();
  }
});

test('motion-reduced EMP keeps blip and gains a short label instead of the flash', () => {
  const fx = mountTestFixture({ motionReduce: true });
  const audio = [];
  const toasts = [];
  fx.bus.on('audio:cue', (p) => audio.push(p));
  fx.bus.on('toast', (p) => toasts.push(p));
  try {
    fx.bus.emit('combat:emp', { targetId: fx.player.id });
    assert.equal(fx.hud.getDisrupted(), false, 'reduced motion must suppress the flash');
    assert.ok(audio.some((p) => p && p.id === 'ui_deny'), 'reduced motion keeps the restrained blip');
    assert.ok(toasts.some((p) => p && p.text === 'EMP HIT — systems disrupted' && p.kind === 'warn'),
      'reduced motion replaces the flash with a short label');
  } finally {
    fx.restore();
  }
});

test('flash-reduced shield break keeps blip and names the hazard without the flash', () => {
  const fx = mountTestFixture({ flashReduce: true });
  const audio = [];
  const toasts = [];
  fx.bus.on('audio:cue', (p) => audio.push(p));
  fx.bus.on('toast', (p) => toasts.push(p));
  try {
    fx.bus.emit('combat:damage', { targetId: fx.player.id, brokeShield: true });
    assert.equal(fx.hud.getDisrupted(), false, 'reduced flash must suppress the flash');
    assert.ok(audio.some((p) => p && p.id === 'ui_deny'), 'reduced flash keeps the restrained blip');
    assert.ok(toasts.some((p) => p && p.text === 'SHIELDS COLLAPSED' && p.kind === 'warn'),
      'reduced flash replaces the flash with a short label');
  } finally {
    fx.restore();
  }
});

// ---------------------------------------------------------------------------
// Integration Tests: Multi-Stage Missile Lock-On Arc
// ---------------------------------------------------------------------------

test('missile locking executes multi-stage convergence animation (Acquiring -> Tracking -> Locked)', () => {
  const fx = mountTestFixture();
  try {
    const lockRing = fx.hudRoot.querySelector('.sf-lockring');
    const lockLabel = lockRing.querySelector('.sf-lockring__label');
    const lockBrackets = lockRing.querySelector('.sf-lockring__brackets');
    assert.ok(lockRing, 'lockRing mounted');
    assert.ok(lockBrackets, 'lockRing convergence brackets mounted');

    // State 0: No weapon lock
    fx.step(1 / 60);
    assert.equal(lockRing.classList.contains('active'), false);
    assert.equal(lockRing.getAttribute('data-stage'), null);

    // Stage 1: Acquiring (20% progress)
    fx.player.data.combat.lockProgress = 0.2;
    fx.step(1 / 60);
    assert.equal(lockRing.classList.contains('active'), true);
    assert.equal(lockRing.getAttribute('data-stage'), 'acquiring');
    assert.match(lockLabel.textContent, /ACQUIRING 20%/);
    assert.equal(lockBrackets.style.transform, 'scale(1.4)');

    // Stage 2: Tracking / Inward Convergence (70% progress)
    fx.player.data.combat.lockProgress = 0.7;
    fx.step(1 / 60);
    assert.equal(lockRing.getAttribute('data-stage'), 'tracking');
    assert.match(lockLabel.textContent, /TRACKING 70%/);
    // Bracket scale must have tightened inward from 1.4 down toward 1.0
    const scaleMatch = lockBrackets.style.transform.match(/scale\((\d+\.\d+)\)/);
    assert.ok(scaleMatch, 'bracket transform has scale');
    const currentScale = parseFloat(scaleMatch[1]);
    assert.ok(currentScale < 1.4 && currentScale > 1.0, `brackets must tighten inward, got ${currentScale}`);

    // Stage 3: Full Lock (100% progress) -> Snaps shut with latch animation
    let audioPlayed = false;
    fx.bus.on('audio:cue', (cue) => {
      if (cue.id === 'lock_acquired') audioPlayed = true;
    });

    fx.player.data.combat.lockProgress = 1.0;
    fx.step(1 / 60);
    assert.equal(lockRing.getAttribute('data-stage'), 'locked');
    assert.equal(lockRing.classList.contains('locked'), true);
    assert.equal(lockLabel.textContent, 'LOCKED');
    assert.equal(lockBrackets.style.transform, 'scale(1)');
    assert.equal(lockRing.classList.contains('sf-lockring--latch'), true, 'latch animation triggered');
    assert.equal(audioPlayed, true, 'lock_acquired audio cue fired on rising edge');
  } finally {
    fx.restore();
  }
});

// ---------------------------------------------------------------------------
// Integration Tests: G-LOC Tunnel Vision Vignette
// ---------------------------------------------------------------------------

test('sustained max-rate drift turns build peripheral vignette tunnel vision', () => {
  const fx = mountTestFixture();
  try {
    const vignette = fx.hudRoot.querySelector('.sf-gloc-vignette');
    assert.ok(vignette, 'gloc vignette mounted');

    // 0.3s of hard turning: below 0.6s threshold, vignette remains 0
    fx.player.angVel = 2.8;
    for (let i = 0; i < 18; i++) {
      fx.step(1 / 60);
    }
    assert.equal(fx.hud.getGLocVignetteOpacity(), 0, 'short turn must not trigger tunnel vision');

    // Continue sustained turn for another 0.8s (total > 1.1s)
    for (let i = 0; i < 48; i++) {
      fx.step(1 / 60);
    }
    const midVignette = fx.hud.getGLocVignetteOpacity();
    assert.ok(midVignette > 0.1, `sustained high-G turn must build tunnel vision, got opacity ${midVignette}`);

    // Releasing stick recovers vision
    fx.player.angVel = 0;
    for (let i = 0; i < 45; i++) {
      fx.step(1 / 60);
    }
    assert.equal(fx.hud.getGLocVignetteOpacity(), 0, 'recovering from high-G turn snaps vision clear');
  } finally {
    fx.restore();
  }
});
