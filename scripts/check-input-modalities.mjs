// check-input-modalities.mjs — guards the input-modality contract (goal P1-12).
//
// THE GOAL (unchanged, and it is a real one):
//   SpaceFace merges FOUR input modalities into one `state.input`: keyboard, mouse, gamepad
//   (navigator.getGamepads poller) and touch (virtual dual-stick overlay). A refactor can drop a
//   modality by deleting an import, a merge line, or an overlay button, and nothing errors — the
//   player just finds a control dead. This check exists to make that loud.
//
// THE METHOD (changed 2026-07-27, build plan §2.5 item 5):
//   This file used to enforce the goal with ~145 source-regex assertions: it pinned the gamepad
//   button map as text (`mine: ['l2']`, `countermeasure: ['r3']`, `tabPrev: ['l1']`), pinned merge
//   lines (`gp.axes.leftX`, `this._m2 || gpMine || tpMine`), pinned private helper names, and pinned
//   header comments. Rebinding LT, R3 or LB failed CI with zero behaviour change, and every one of
//   those assertions could be satisfied by dead code. `docs/POLICY_MANIFEST.md:57` already prefers a
//   behavioural regression over source-string policing.
//
//   So this check now DRIVES the real adapters and asserts the VERB FIRES:
//     - a minimal DOM harness (below) lets `src/systems/input.js` attach its real browser adapter;
//     - keyboard/mouse go in as real keydown/mousedown/mousemove events;
//     - gamepad goes in through a fake pad served by `navigator.getGamepads()`;
//     - touch goes in through the REAL overlay markup that `src/systems/touch.js` authors, driven
//       with real touchstart/touchmove events on the real buttons and sticks;
//     - every assertion reads the merged `state.input` (or the bus) afterwards.
//
//   The organising structure is a MODALITY x VERB reachability matrix. That is the invariant that
//   actually protects the player: "the mine verb is reachable from mouse, gamepad and touch" stays
//   true across any rebind, and goes false the moment a modality is dropped.
//
// WHAT IS DELIBERATELY NOT HERE: help/settings copy (check:controls-discoverability), station tab
// runtime navigation (check:station-tabs), map focus and dialog a11y (check:map-authority,
// check-ui-a11y). Those were asserted here as source regexes over other subsystems' files; this
// check owns modality reachability, not everyone else's copy.

import assert from 'node:assert/strict';
import { PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';

// ─────────────────────────────────────────────────────────────────────────────
// Minimal DOM harness. Enough for the real input/touch adapters to attach and be
// driven; deliberately not a browser. Kept in-file so this check has no new deps.
// ─────────────────────────────────────────────────────────────────────────────

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attrs = Object.create(null);
    this.style = {};
    this.listeners = new Map();
    this.disabled = false;
    this._text = '';
    this._classes = new Set();
    this.classList = {
      add: (c) => this._classes.add(c),
      remove: (c) => this._classes.delete(c),
      contains: (c) => this._classes.has(c),
      toggle: (c, on) => (on ? this._classes.add(c) : this._classes.delete(c)),
    };
  }

  get id() { return this.attrs.id || ''; }
  set id(v) { this.attrs.id = v; }

  get className() { return [...this._classes].join(' '); }
  set className(v) {
    this._classes = new Set(String(v || '').split(/\s+/).filter(Boolean));
    this.attrs.class = v;
  }

  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }

  get innerHTML() { return ''; }
  set innerHTML(html) {
    this.children = [];
    for (const child of parseHtml(String(html))) this.appendChild(child);
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
    if (name === 'class') this.className = value;
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }

  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }

  remove() {
    const p = this.parentNode;
    if (!p) return;
    const i = p.children.indexOf(this);
    if (i >= 0) p.children.splice(i, 1);
    this.parentNode = null;
  }

  contains(other) {
    for (let n = other; n; n = n.parentNode) if (n === this) return true;
    return false;
  }

  closest(selector) {
    for (let n = this; n; n = n.parentNode) if (matchesAny(n, selector)) return n;
    return null;
  }

  descendants(out = []) {
    for (const c of this.children) { out.push(c); c.descendants(out); }
    return out;
  }

  querySelectorAll(selector) { return this.descendants().filter((el) => matchesAny(el, selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

  addEventListener(type, fn) {
    const list = this.listeners.get(type) || [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  removeEventListener(type, fn) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((f) => f !== fn));
  }

  dispatch(type, event) { for (const fn of this.listeners.get(type) || []) fn(event); }

  // Fixed rect: the touch stick geometry only needs a stable centre and radius.
  getBoundingClientRect() {
    return { left: 100, top: 400, width: 140, height: 140, right: 240, bottom: 540 };
  }

  focus() { if (globalThis.document) globalThis.document.activeElement = this; }
  click() { this.dispatch('click', { type: 'click', target: this, preventDefault() {}, stopPropagation() {} }); }
}

function matchesAny(el, selector) {
  return String(selector).split(',').some((part) => matchesOne(el, part.trim()));
}

function matchesOne(el, sel) {
  if (!sel) return false;
  let rest = sel;
  const tagMatch = rest.match(/^[a-zA-Z][\w-]*/);
  if (tagMatch) {
    if (el.tagName !== tagMatch[0].toUpperCase()) return false;
    rest = rest.slice(tagMatch[0].length);
  }
  const tokens = rest.match(/(#[\w-]+|\.[\w-]+|\[[^\]]+\])/g) || [];
  if (!tagMatch && !tokens.length) return false;
  for (const t of tokens) {
    if (t[0] === '#') { if (el.id !== t.slice(1)) return false; continue; }
    if (t[0] === '.') { if (!el.classList.contains(t.slice(1))) return false; continue; }
    const m = t.slice(1, -1).match(/^([\w-]+)(?:(=)"?([^"\]]*)"?)?$/);
    if (!m) return false;
    const val = el.getAttribute(m[1]);
    if (val == null) return false;
    if (m[2] && m[3] !== undefined && val !== m[3]) return false;
  }
  return true;
}

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input']);
/** Tiny parser for the authored (well-formed, non-user) overlay markup. */
function parseHtml(html) {
  const roots = [];
  const stack = [];
  const re = /<\/?([a-zA-Z][\w-]*)((?:\s+[\w-]+="[^"]*")*)\s*\/?>|([^<]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[3] !== undefined) {
      if (stack.length && m[3].trim()) stack[stack.length - 1]._text += m[3];
      continue;
    }
    const tag = m[1].toLowerCase();
    if (m[0].startsWith('</')) { stack.pop(); continue; }
    const el = new El(tag);
    for (const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g)) el.setAttribute(a[1], a[2]);
    if (stack.length) stack[stack.length - 1].appendChild(el);
    else roots.push(el);
    if (!VOID_TAGS.has(tag) && !m[0].endsWith('/>')) stack.push(el);
  }
  return roots;
}

function installDom({ width = 1280, height = 800, touchDevice = true } = {}) {
  const winListeners = new Map();
  const docListeners = new Map();
  const html = new El('html');
  const head = new El('head');
  const body = new El('body');
  html.appendChild(head);
  html.appendChild(body);

  const doc = {
    documentElement: html,
    head,
    body,
    activeElement: body,
    pointerLockElement: null,
    createElement: (tag) => new El(tag),
    getElementById: (id) => html.descendants().find((el) => el.id === id) || null,
    querySelector: (s) => body.querySelector(s),
    querySelectorAll: (s) => body.querySelectorAll(s),
    addEventListener(type, fn) {
      const list = docListeners.get(type) || [];
      list.push(fn);
      docListeners.set(type, list);
    },
    removeEventListener(type, fn) {
      docListeners.set(type, (docListeners.get(type) || []).filter((f) => f !== fn));
    },
  };

  let pads = [];
  const nav = { maxTouchPoints: touchDevice ? 5 : 0, getGamepads: () => pads };
  const win = {
    innerWidth: width,
    innerHeight: height,
    navigator: nav,
    document: doc,
    addEventListener(type, fn) {
      const list = winListeners.get(type) || [];
      list.push(fn);
      winListeners.set(type, list);
    },
    removeEventListener(type, fn) {
      winListeners.set(type, (winListeners.get(type) || []).filter((f) => f !== fn));
    },
  };
  if (touchDevice) win.ontouchstart = null;

  globalThis.window = win;
  globalThis.document = doc;
  // Node ships a getter-only global `navigator`; redefine rather than assign.
  Object.defineProperty(globalThis, 'navigator', {
    value: nav, configurable: true, writable: true, enumerable: true,
  });
  globalThis.innerWidth = width;
  globalThis.innerHeight = height;
  globalThis.addEventListener = win.addEventListener.bind(win);
  globalThis.removeEventListener = win.removeEventListener.bind(win);

  const fire = (map, type, event) => { for (const fn of map.get(type) || []) fn(event); };
  const overlay = () => doc.getElementById('sf-touch-overlay');

  return {
    doc,
    body,
    setPads(next) { pads = next; },
    key(type, code) {
      fire(winListeners, type, {
        type, code, key: code, target: body, preventDefault() {}, stopPropagation() {},
      });
    },
    mouse(type, button, x = 640, y = 400) {
      fire(winListeners, type, {
        type, button, clientX: x, clientY: y, movementX: 0, movementY: 0, target: body,
        preventDefault() {}, stopPropagation() {},
      });
    },
    move(x, y) {
      fire(winListeners, 'mousemove', {
        type: 'mousemove', clientX: x, clientY: y, movementX: 1, movementY: 1, target: body,
        preventDefault() {}, stopPropagation() {},
      });
    },
    overlay,
    touchButtonActions() {
      const ov = overlay();
      if (!ov) return [];
      return ov.querySelectorAll('button').map((b) => b.getAttribute('data-act')).filter(Boolean);
    },
    touchButtonEl(act) {
      const ov = overlay();
      if (!ov) return null;
      return ov.querySelectorAll('button').find((b) => b.getAttribute('data-act') === act) || null;
    },
    touchPress(act) {
      const el = this.touchButtonEl(act);
      if (!el) return false;
      el.dispatch('touchstart', { preventDefault() {}, changedTouches: [{ identifier: 1 }] });
      return true;
    },
    touchRelease(act) {
      const el = this.touchButtonEl(act);
      if (!el) return false;
      el.dispatch('touchend', { preventDefault() {}, changedTouches: [{ identifier: 1 }] });
      return true;
    },
    touchStick(side, dx, dy) {
      const ov = overlay();
      const el = ov && ov.querySelector('.sf-touch-stick.' + side);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const id = side === 'left' ? 11 : 12;
      el.dispatch('touchstart', {
        preventDefault() {}, changedTouches: [{ identifier: id, clientX: cx, clientY: cy }],
      });
      el.dispatch('touchmove', {
        preventDefault() {}, changedTouches: [{ identifier: id, clientX: cx + dx, clientY: cy + dy }],
      });
      return true;
    },
    releaseStick(side) {
      const ov = overlay();
      const el = ov && ov.querySelector('.sf-touch-stick.' + side);
      if (!el) return false;
      const id = side === 'left' ? 11 : 12;
      el.dispatch('touchend', { preventDefault() {}, changedTouches: [{ identifier: id }] });
      return true;
    },
  };
}

function makeFakePad(id = 'modality-harness-pad') {
  return {
    id,
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Session under test — the REAL input system, initialised against the harness.
// ─────────────────────────────────────────────────────────────────────────────

// One install is needed before the modules load so they see a browser-shaped global.
installDom();
const { createGameState } = await import('../src/core/gameState.js');
const { input, DEFAULTS } = await import('../src/systems/input.js');
const { autoTargetAssist } = await import('../src/systems/autoTargetAssist.js');
const { save } = await import('../src/save/saveSystem.js');

const busEvents = [];

/**
 * Fresh window/document/adapters per scenario. `input` is a module singleton, so a session that
 * reused the previous DOM would stack keydown listeners and leave an orphaned touch overlay in the
 * body — the second overlay is the one wired to the live touch object, and the first is the one
 * getElementById returns.
 */
function newSession(domOpts = {}) {
  busEvents.length = 0;
  const dom = installDom(domOpts);
  const state = createGameState(11);
  state.mode = 'flight';
  state.ui = { screenStack: [], docked: false, dockInRange: false };
  const player = {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: { defId: 'ship_kestrel' },
  };
  state.entities.set(1, player);
  state.entityList = [player];
  state.playerId = 1;
  state.player.tether = { active: false };
  const bus = { on() { return () => {}; }, emit(type, payload) { busEvents.push({ type, payload }); } };
  const ctx = {
    state,
    bus,
    helpers: { raycastToPlane: (ndc) => ({ x: ndc.x * 100, z: -ndc.y * 100 }) },
  };
  input.init(ctx);
  return {
    dom,
    state,
    ctx,
    tick(dt = 1 / 60) { state.tick += 1; input.update(dt, state); },
  };
}

let passes = 0;
function ok(label) { passes += 1; console.log(`ok   ${label}`); }
function check(condition, label) { assert.ok(condition, label); ok(label); }
function checkEqual(actual, expected, label) { assert.equal(actual, expected, label); ok(label); }

// ─────────────────────────────────────────────────────────────────────────────
// 1. All four modalities are constructed and reachable from ctx.
// ─────────────────────────────────────────────────────────────────────────────

{
  const s = newSession();
  check(s.ctx.gamepad && typeof s.ctx.gamepad.tick === 'function',
    'input.init constructs the gamepad modality and exposes it on ctx');
  check(s.ctx.touch && typeof s.ctx.touch.tick === 'function',
    'input.init constructs the touch modality and exposes it on ctx');
  check(s.ctx.touch.isConnected(),
    'touch auto-detects on a touch device with a usable viewport (no explicit setting)');
  check(s.dom.overlay(), 'touch auto-detect builds the on-screen overlay');
  s.tick();
  check(s.state.input && s.state.input.actions && typeof s.state.input.aimWorld === 'object',
    'one tick materializes the merged input contract consumers read');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. MODALITY x VERB reachability matrix — the core of this check.
//
//    Each row is one player verb, the modalities that are supposed to serve it,
//    how to drive each, and how to read the merged result. A modality dropped
//    from the merge fails the named cell; a REBIND does not.
// ─────────────────────────────────────────────────────────────────────────────

// Which PHYSICAL button serves which gamepad action is discovered by sweeping the pad, never
// asserted as text. That is the whole point of the rewrite: rebinding LT, R3 or LB must not fail
// CI, so this check learns the current map at runtime and then drives it by verb.
const PAD_ACTION_BUTTONS = (() => {
  const s = newSession();
  const pad = makeFakePad();
  s.dom.setPads([pad]);
  s.tick();
  const found = new Map();
  for (let i = 0; i < pad.buttons.length; i++) {
    pad.buttons[i].pressed = true;
    pad.buttons[i].value = 1;
    s.tick();
    for (const action in s.ctx.gamepad.actions) {
      if (!s.ctx.gamepad.actions[action].held) continue;
      if (!found.has(action)) found.set(action, []);
      found.get(action).push(i);
    }
    pad.buttons[i].pressed = false;
    pad.buttons[i].value = 0;
    s.tick();
  }
  return found;
})();

/** Driver pair that presses whatever KEY currently serves `action` in the given scheme. */
function keyAction(action, scheme = 'pilot', slot = 0) {
  const codes = DEFAULTS.SCHEMES[scheme][action] || [];
  assert.ok(codes.length > slot,
    `keyboard action "${action}" has no binding at slot ${slot} in the ${scheme} scheme`);
  const code = codes[slot];
  return {
    code,
    down: (d) => d.key('keydown', code),
    up: (d) => d.key('keyup', code),
  };
}

/** Driver pair that presses whatever physical button currently serves `action`. */
function padAction(action) {
  const indices = PAD_ACTION_BUTTONS.get(action) || [];
  assert.ok(indices.length > 0,
    `gamepad action "${action}" is not reachable from any physical button (button map dropped?)`);
  const idx = indices[0];
  return {
    down: (d, p) => { p.buttons[idx].pressed = true; p.buttons[idx].value = 1; },
    up: (d, p) => { p.buttons[idx].pressed = false; p.buttons[idx].value = 0; },
  };
}

const FLIGHT_MATRIX = [
  {
    verb: 'thrust forward',
    read: (st) => st.input.moveZ > 0.5,
    serves: {
      keyboard: keyAction('forward'),
      gamepad: { down: (d, p) => { p.axes[1] = -1; }, up: (d, p) => { p.axes[1] = 0; } },
      touch: { down: (d) => d.touchStick('left', 0, -60), up: (d) => d.releaseStick('left') },
    },
  },
  {
    verb: 'reverse thrust',
    read: (st) => st.input.moveZ < -0.5,
    serves: {
      keyboard: keyAction('reverse'),
      gamepad: { down: (d, p) => { p.axes[1] = 1; }, up: (d, p) => { p.axes[1] = 0; } },
      touch: { down: (d) => d.touchStick('left', 0, 60), up: (d) => d.releaseStick('left') },
    },
  },
  {
    verb: 'turn the nose',
    read: (st) => Math.abs(st.input.turnIntent) > 0.5,
    serves: {
      keyboard: keyAction('yawRight'),
      gamepad: { down: (d, p) => { p.axes[0] = 0.9; }, up: (d, p) => { p.axes[0] = 0; } },
      touch: { down: (d) => d.touchStick('left', 60, 0), up: (d) => d.releaseStick('left') },
    },
  },
  {
    // Keyboard-only by design: the gamepad and touch left sticks map X to yaw, not lateral
    // translation, so `moveX` has exactly one source. See the tpMoveX note in the report.
    verb: 'strafe',
    read: (st) => Math.abs(st.input.moveX) > 0.5,
    serves: {
      keyboard: keyAction('strafeRight'),
    },
  },
  {
    verb: 'boost',
    read: (st) => st.input.boost === true,
    serves: {
      keyboard: keyAction('boost'),
      gamepad: padAction('boost'),
      touch: { down: (d) => d.touchPress('boost'), up: (d) => d.touchRelease('boost') },
    },
  },
  {
    verb: 'brake',
    read: (st) => st.input.brake === true,
    serves: {
      keyboard: keyAction('brake'),
      gamepad: padAction('brake'),
    },
  },
  {
    verb: 'fire weapons (fire group 1)',
    read: (st) => st.input.fire === true && st.input.fireGroup === 1,
    serves: {
      mouse: { down: (d) => d.mouse('mousedown', 0), up: (d) => d.mouse('mouseup', 0) },
      gamepad: padAction('fire'),
      touch: { down: (d) => d.touchPress('fire'), up: (d) => d.touchRelease('fire') },
    },
  },
  {
    verb: 'mining beam (fire group 2)',
    read: (st) => st.input.fireGroup === 2 && st.input.actions.aimedMine === true,
    serves: {
      mouse: { down: (d) => d.mouse('mousedown', 2), up: (d) => d.mouse('mouseup', 2) },
      gamepad: padAction('mine'),
      touch: { down: (d) => d.touchPress('mine'), up: (d) => d.touchRelease('mine') },
    },
  },
  {
    verb: 'Massline latch',
    read: (st) => st.input.actions.tetherFire === true,
    serves: {
      keyboard: keyAction('tether'),
      gamepad: padAction('massline'),
    },
  },
  {
    verb: 'countermeasure',
    read: (st) => st.input.deployCountermeasure === true,
    serves: {
      keyboard: keyAction('countermeasure'),
      gamepad: padAction('countermeasure'),
    },
  },
  {
    verb: 'aim away from the nose',
    read: (st, before) => st.input.aimAngle !== before.aimAngle
      || st.input.mouseNdc.x !== before.ndcX,
    serves: {
      mouse: { down: (d) => d.move(220, 180), up: () => {} },
      gamepad: { down: (d, p) => { p.axes[2] = 0.9; p.axes[3] = -0.4; }, up: (d, p) => { p.axes[2] = 0; p.axes[3] = 0; } },
      touch: { down: (d) => d.touchStick('right', 55, -35), up: (d) => d.releaseStick('right') },
    },
  },
  {
    verb: 'toggle auto-target',
    read: (st) => st.input.actions.autoTargetToggle === true,
    serves: {
      gamepad: padAction('autoTarget'),
    },
  },
];

const MODALITIES = ['keyboard', 'mouse', 'gamepad', 'touch'];
const coverage = Object.fromEntries(MODALITIES.map((m) => [m, 0]));

for (const row of FLIGHT_MATRIX) {
  for (const modality of MODALITIES) {
    const driver = row.serves[modality];
    if (!driver) continue;
    const s = newSession();
    const pad = makeFakePad();
    if (modality === 'gamepad') s.dom.setPads([pad]);
    // Settle one frame so connection edges and neutral state are established.
    s.tick();
    const before = { aimAngle: s.state.input.aimAngle, ndcX: s.state.input.mouseNdc.x };
    driver.down(s.dom, pad);
    s.tick();
    const fired = row.read(s.state, before);
    driver.up(s.dom, pad);
    s.tick();
    assert.ok(fired, `${row.verb} must be reachable from ${modality} (modality dropped from the merge?)`);
    coverage[modality] += 1;
    ok(`${modality} -> ${row.verb}`);
  }
}

check(coverage.keyboard >= 7, 'keyboard serves the flight verbs it is supposed to serve');
check(coverage.mouse >= 3, 'mouse serves fire, mine and aim');
check(coverage.gamepad >= 9, 'gamepad serves the full flight verb set');
check(coverage.touch >= 7, 'touch serves the flight verbs its overlay advertises');

// The Massline ships with a primary key AND a permanent alias. Assert that EVERY declared
// binding latches the line, rather than pinning the array's text — a rebind is still fine, an
// alias that silently stops working is not.
for (let slot = 0; slot < DEFAULTS.SCHEMES.pilot.tether.length; slot++) {
  const driver = keyAction('tether', 'pilot', slot);
  const s = newSession();
  s.tick();
  driver.down(s.dom);
  s.tick();
  checkEqual(s.state.input.actions.tetherFire, true,
    `Massline binding ${slot + 1} of ${DEFAULTS.SCHEMES.pilot.tether.length} (${driver.code}) latches the line`);
  driver.up(s.dom);
  s.tick();
}

// The mouse serves TWO distinct pointing verbs and both must survive a refactor: an absolute
// software cursor in ordinary flight, and relative gesture motion for draw-to-fly. The second
// one has no keyboard or pad equivalent, so if the mousemove path is dropped it is simply gone.
{
  const s = newSession();
  s.tick();
  s.dom.move(300, 220);
  s.tick();
  check(s.state.input.pointerScreen.active
    && s.state.input.pointerScreen.x === 300 && s.state.input.pointerScreen.y === 220,
    'mouse motion publishes the bounded software pointer in ordinary flight');
  check(Math.abs(s.state.input.mouseNdc.x) > 0.001,
    'mouse motion drives weapon aim independently of the nose');

  s.state.input.autoFire = true;
  s.tick();
  checkEqual(s.state.input.autoTargetPath.points.length, 0,
    'entering draw-to-fly clears any stale gesture path');
  for (let i = 0; i < 6; i += 1) {
    s.dom.move(300 + i * 12, 220 + i * 9);
    s.tick();
  }
  check(s.state.input.autoTargetPath.active && s.state.input.autoTargetPath.drawing
    && s.state.input.autoTargetPath.points.length > 0,
    'relative mouse motion records the draw-to-fly gesture path');
  check(s.state.input.pointerScreen.x !== 300,
    'draw-to-fly re-centres the software pointer instead of letting the cursor escape');
}

// Controller parity for the accepted PQ-007 contract: explicit toggle, then a clutchable direct
// right-stick vector. The auto-target owner runs immediately after input in production, so drive it
// in that order here; releasing the right stick must expose the ordinary left-stick command again.
{
  const s = newSession();
  const pad = makeFakePad('auto-target-controller');
  const toggle = padAction('autoTarget');
  s.dom.setPads([pad]);
  autoTargetAssist.init(s.ctx);
  s.tick();
  autoTargetAssist.update(1 / 60, s.state);

  toggle.down(s.dom, pad);
  s.tick();
  autoTargetAssist.update(1 / 60, s.state);
  checkEqual(s.state.input.autoFire, true,
    'controller auto-target button toggles the same auto-target owner as the keyboard route');

  toggle.up(s.dom, pad);
  pad.axes[2] = 0.8;
  pad.axes[3] = -0.45;
  s.tick();
  const directVector = { ...s.state.input.autoTargetVector };
  autoTargetAssist.update(1 / 60, s.state);
  check(directVector.active && directVector.worldX > 0.5 && directVector.worldZ > 0.2,
    'right stick publishes an active world-space draw-to-fly vector only while held');
  check(Math.abs(s.state.input.turnIntent) > 0.05 || Math.abs(s.state.input.moveX) > 0.05,
    'auto-target owner consumes the held controller vector as direct flight intent');

  pad.axes[2] = 0;
  pad.axes[3] = 0;
  pad.axes[0] = -0.75;
  pad.axes[1] = -0.65;
  s.tick();
  const ordinaryTurn = s.state.input.turnIntent;
  const ordinaryThrust = s.state.input.moveZ;
  autoTargetAssist.update(1 / 60, s.state);
  checkEqual(s.state.input.autoTargetVector.active, false,
    'releasing the right stick clutches draw-to-fly out immediately');
  checkEqual(s.state.input.turnIntent, ordinaryTurn,
    'released draw-to-fly does not replace ordinary left-stick steering');
  checkEqual(s.state.input.moveZ, ordinaryThrust,
    'released draw-to-fly does not replace ordinary left-stick thrust');
  autoTargetAssist.destroy();
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Keyboard flight projection is scheme-sensitive, driven not read.
//    (Replaces the arrowYaw / arrowStrafe / _heldExcept source pins.)
// ─────────────────────────────────────────────────────────────────────────────

{
  const s = newSession();
  const pilotSide = keyAction('yawRight', 'pilot');
  const pilotFwd = keyAction('forward', 'pilot');
  s.tick();
  pilotSide.down(s.dom);
  s.tick();
  check(Math.abs(s.state.input.turnIntent) > 0.5 && Math.abs(s.state.input.moveX) < 0.001,
    'pilot scheme: a side key while coasting yaws the nose and does not strafe');
  pilotFwd.down(s.dom);
  s.tick();
  check(Math.abs(s.state.input.moveX) > 0.5 && Math.abs(s.state.input.turnIntent) > 0.001
    && Math.abs(s.state.input.turnIntent) < 0.9,
    'pilot scheme: a side key under forward thrust strafes with a partial carve, not a full yaw');
  pilotFwd.up(s.dom);
  pilotSide.up(s.dom);
  s.tick();
}

{
  // Classic keeps arrows on the movement cluster, so the SAME key must mean yaw while coasting
  // and strafe under thrust. That contextual split is the scheme's whole identity.
  const s = newSession();
  s.state.settings.gameplay.controlScheme = 'classic';
  const arrow = DEFAULTS.SCHEMES.classic.yawRight.find((c) => c.startsWith('Arrow'));
  assert.ok(arrow, 'the classic scheme must keep an arrow key on yaw for the contextual split');
  const fwd = keyAction('forward', 'classic');
  s.tick();
  s.dom.key('keydown', arrow);
  s.tick();
  check(Math.abs(s.state.input.turnIntent) > 0.5 && Math.abs(s.state.input.moveX) < 0.001,
    'classic scheme: a bare arrow yaws');
  fwd.down(s.dom);
  s.tick();
  check(Math.abs(s.state.input.moveX) > 0.5 && Math.abs(s.state.input.turnIntent) < 0.001,
    'classic scheme: forward thrust turns the same arrow into a strafe');
  fwd.up(s.dom);
  s.dom.key('keyup', arrow);
  s.tick();
}

// The retired autopursuit action stays declared-but-unbound for old-save compatibility. Read from
// the exported binding data, not from source text.
for (const scheme of ['pilot', 'classic', 'helm-assist']) {
  const bound = DEFAULTS.SCHEMES[scheme].autopursuit;
  check(Array.isArray(bound) && bound.length === 0,
    `retired autopursuit stays declared and unbound in the ${scheme} scheme`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Gamepad: every action the game consumes is reachable from SOME physical
//    button. This is the rebind-safe replacement for pinning the button map.
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED_PAD_ACTIONS = [
  'fire', 'mine', 'boost', 'brake', 'accept', 'cancel', 'massline',
  'cycleTarget', 'map', 'codex', 'pause', 'countermeasure',
  'tabPrev', 'tabNext', 'travelBurn',
];

{
  for (const action of REQUIRED_PAD_ACTIONS) {
    const buttons = PAD_ACTION_BUTTONS.get(action) || [];
    check(buttons.length > 0,
      `gamepad action "${action}" is reachable from a physical button`);
  }
  console.log(`ok   discovered gamepad map ${JSON.stringify(Object.fromEntries(PAD_ACTION_BUTTONS))}`);
}

// A/Cross is dock/activate plus the Massline thumb action — never a second fire trigger, and the
// dock prompt outranks the Massline so docking cannot also throw a line.
{
  const s = newSession();
  const pad = makeFakePad();
  s.dom.setPads([pad]);
  s.tick();
  pad.buttons[(PAD_ACTION_BUTTONS.get('accept') || [0])[0]].pressed = true;
  pad.buttons[(PAD_ACTION_BUTTONS.get('accept') || [0])[0]].value = 1;
  s.tick();
  checkEqual(s.state.input.fire, false, 'gamepad A/Cross does not fire weapons');
  checkEqual(s.state.input.actions.tetherFire, true, 'gamepad A/Cross latches the Massline in flight');
  pad.buttons[(PAD_ACTION_BUTTONS.get('accept') || [0])[0]].pressed = false;
  s.tick();

  s.state.ui.dockInRange = true;
  pad.buttons[(PAD_ACTION_BUTTONS.get('accept') || [0])[0]].pressed = true;
  pad.buttons[(PAD_ACTION_BUTTONS.get('accept') || [0])[0]].value = 1;
  s.tick();
  checkEqual(s.state.input.actions.tetherFire, false,
    'an active dock prompt outranks the gamepad Massline thumb action');
  pad.buttons[(PAD_ACTION_BUTTONS.get('accept') || [0])[0]].pressed = false;
  s.state.ui.dockInRange = false;
  s.tick();
}

// The Settings gamepad toggle is not decoration: disabling it must actually silence the pad.
{
  const s = newSession();
  const pad = makeFakePad();
  s.dom.setPads([pad]);
  s.tick();
  pad.axes[0] = 0.9;
  s.tick();
  check(Math.abs(s.state.input.turnIntent) > 0.5, 'gamepad steers while enabled');
  s.state.settings.controls = s.state.settings.controls || {};
  s.state.settings.controls.gamepad = { enabled: false, deadzone: 0.12, invertY: false };
  s.tick();
  checkEqual(s.ctx.gamepad.isConnected(), false, 'settings.controls.gamepad.enabled=false disconnects the pad');
  checkEqual(Math.abs(s.state.input.turnIntent) < 0.001, true, 'a disabled pad contributes nothing to flight');
  s.dom.setPads([]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Touch: the overlay's menu buttons must actually reach the UI router, and
//    the Auto/On/Off control must actually enable and disable the modality.
// ─────────────────────────────────────────────────────────────────────────────

const TOUCH_MENU_VERBS = ['dock', 'localmap', 'missionLog', 'starmap', 'pause'];

{
  const s = newSession();
  s.dom.setPads([]);
  s.tick();
  const advertised = s.dom.touchButtonActions();
  for (const verb of [...TOUCH_MENU_VERBS, 'fire', 'mine', 'boost']) {
    check(advertised.includes(verb), `touch overlay advertises a "${verb}" button`);
  }
  for (const verb of TOUCH_MENU_VERBS) {
    busEvents.length = 0;
    s.dom.touchPress(verb);
    s.tick();
    const routed = busEvents.some((e) => e.type === 'touch:uiAction' && e.payload && e.payload.action === verb);
    check(routed, `touch "${verb}" emits an immediate UI intent so a tap cannot be lost`);
    check(s.ctx.touch.actions[verb].pressed === true,
      `touch "${verb}" also raises a polled pressed edge for the UI tick`);
    s.dom.touchRelease(verb);
    s.tick();
  }

  // A quick tap that begins and ends inside one frame must still register.
  busEvents.length = 0;
  s.dom.touchPress('fire');
  s.dom.touchRelease('fire');
  s.tick();
  checkEqual(s.ctx.touch.actions.fire.pressed, true, 'a sub-frame touch tap still produces a pressed edge');
  s.tick();

  s.ctx.touch.persistEnabled(false);
  checkEqual(s.ctx.touch.isConnected(), false, 'the Settings touch Off state actually removes the overlay');
  s.ctx.touch.persistEnabled(true);
  checkEqual(s.ctx.touch.isConnected(), true, 'the Settings touch On state actually restores the overlay');
  s.ctx.touch.persistEnabled(null);
  checkEqual(s.ctx.touch.isConnected(), true, 'the Settings touch Auto state returns to auto-detect immediately');
}

// Auto-detect must not enable touch on a desktop with no touch points — the overlay would eat
// half the screen and swallow pointer input on machines that will never use it.
{
  const s = newSession({ touchDevice: false });
  checkEqual(s.ctx.touch.isConnected(), false, 'touch auto-detect stays off on a non-touch device');
  checkEqual(s.dom.overlay(), null, 'no touch overlay is built on a non-touch device');
  s.tick();
  s.dom.key('keydown', 'KeyW');
  s.tick();
  check(s.state.input.moveZ > 0.5, 'keyboard flight is unaffected by touch staying off');
  s.dom.key('keyup', 'KeyW');
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Every modality goes quiet when a modal screen owns focus, and the merged
//    contract is fully zeroed — a stuck key must not fly the ship from a menu.
// ─────────────────────────────────────────────────────────────────────────────

{
  const s = newSession();
  const pad = makeFakePad();
  s.dom.setPads([pad]);
  s.tick();
  s.dom.key('keydown', 'KeyW');
  pad.buttons[(PAD_ACTION_BUTTONS.get('fire') || [7])[0]].pressed = true;
  pad.buttons[(PAD_ACTION_BUTTONS.get('fire') || [7])[0]].value = 1;
  s.dom.touchPress('boost');
  s.tick();
  check(s.state.input.moveZ > 0.5 && s.state.input.fire === true && s.state.input.boost === true,
    'all three modalities are live in flight before the modal opens');

  s.state.ui.screenStack.push('pause');
  s.tick();
  check(s.state.input.moveZ === 0 && s.state.input.turnIntent === 0 && s.state.input.moveX === 0,
    'an open screen zeroes thrust and turn from every modality');
  check(s.state.input.fire === false && s.state.input.boost === false && s.state.input.fireGroup === null,
    'an open screen zeroes fire, boost and fire-group from every modality');

  s.state.ui.screenStack.pop();
  s.dom.body.classList.add('ui-modal-open');
  s.tick();
  checkEqual(s.state.input.moveZ, 0, 'a body-level modal fence also suppresses gameplay input');
  s.dom.body.classList.remove('ui-modal-open');
  s.dom.key('keyup', 'KeyW');
  pad.buttons[(PAD_ACTION_BUTTONS.get('fire') || [7])[0]].pressed = false;
  s.dom.touchRelease('boost');
  s.dom.setPads([]);
  s.tick();
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. A loaded save can never leave a modality unconfigured. Drive the real
//    restore path with hostile/legacy payloads and assert the result is usable.
// ─────────────────────────────────────────────────────────────────────────────

function restoreSettings(payload, seed = createGameState(3)) {
  // Real save object, real restore path — only the host state/bus are supplied.
  const host = Object.create(save);
  host.state = seed;
  host.bus = { emit() {}, on() { return () => {}; } };
  host._restoreSettings(payload);
  return host.state.settings;
}

{
  const hostile = restoreSettings({
    controls: { gamepad: 'not-an-object', touch: 42, flightMode: 'nonsense' },
    gameplay: { controlScheme: 'wingsuit' },
  });
  check(hostile.controls.gamepad && typeof hostile.controls.gamepad === 'object'
    && typeof hostile.controls.gamepad.enabled === 'boolean'
    && Number.isFinite(hostile.controls.gamepad.deadzone),
    'a corrupt save still yields a usable settings.controls.gamepad object');
  check(hostile.controls.touch && typeof hostile.controls.touch === 'object',
    'a corrupt save still yields a usable settings.controls.touch object');
  check(DEFAULTS.SCHEMES[hostile.gameplay.controlScheme],
    'an unknown control scheme falls back to a shipped scheme instead of breaking flight');

  const empty = restoreSettings({});
  check(empty.controls.gamepad && empty.controls.touch,
    'a save with no controls block is normalized rather than left undefined');

  // Old saves carry the retired ambient helm-assist default as a non-choice; that migrates once.
  // A genuine pre-v2 world has no controlSchemeV2 flag on either side of the merge.
  const preV2 = createGameState(3);
  delete preV2.settings.gameplay.controlSchemeV2;
  const legacy = restoreSettings({ gameplay: { controlScheme: 'helm-assist' } }, preV2);
  checkEqual(legacy.gameplay.controlScheme, 'pilot',
    'a pre-v2 ambient helm-assist save migrates to the pilot default');
  // An explicit v2 pick of the same scheme must survive.
  const explicit = restoreSettings({ gameplay: { controlScheme: 'helm-assist', controlSchemeV2: true } });
  checkEqual(explicit.gameplay.controlScheme, 'helm-assist',
    'an explicit v2 helm-assist choice survives a reload');

  // Every restorable scheme must actually drive the ship, not just validate.
  for (const scheme of ['pilot', 'classic', 'helm-assist']) {
    const s = newSession();
    s.dom.setPads([]);
    s.state.settings.gameplay.controlScheme = scheme;
    s.tick();
    s.dom.key('keydown', 'KeyW');
    s.tick();
    check(s.state.input.moveZ > 0.5, `the ${scheme} scheme still thrusts forward from the keyboard`);
    s.dom.key('keyup', 'KeyW');
    s.tick();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Early target-assist pipeline ordering (authoritative manifest data, not
//    a source array). Kept from the original check.
// ─────────────────────────────────────────────────────────────────────────────

function assertEarlyTargetPipeline(orderOrSource) {
  let systems;
  if (Array.isArray(orderOrSource)) {
    systems = orderOrSource.map((name) => String(name).trim()).filter(Boolean);
  } else {
    const match = String(orderOrSource).match(/const UPDATE_ORDER\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(match, 'registry must declare UPDATE_ORDER');
    systems = match[1].split(',').map((name) => name.trim()).filter(Boolean);
  }
  const inputIndex = systems.indexOf('input');
  const assistIndex = systems.indexOf('autoTargetAssist');
  const focusIndex = systems.indexOf('flybyFocus');
  const scannerIndex = systems.indexOf('scanner');
  assert.equal(inputIndex, 0, 'registry UPDATE_ORDER must run input first');
  assert.equal(assistIndex, inputIndex + 1, 'autoTargetAssist must resolve immediately after input');
  assert.ok(scannerIndex > assistIndex, 'scanner must run after input target-assist resolution');
  if (focusIndex >= 0) {
    assert.ok(focusIndex > assistIndex && focusIndex < scannerIndex,
      'flybyFocus may run between autoTargetAssist and scanner for exact-target authority');
  }
}

assertEarlyTargetPipeline(PRODUCTION_UPDATE_ORDER);
ok('input runs first and autoTargetAssist resolves immediately after it');
assert.throws(
  () => assertEarlyTargetPipeline('const UPDATE_ORDER = [input, scanner, autoTargetAssist, flybyFocus];'),
  /autoTargetAssist must resolve immediately after input/,
);
ok('the ordering gate itself rejects a scanner-before-assist order (self-test)');

console.log(
  `Input modalities OK — ${passes} behavioural assertions. keyboard/mouse/gamepad/touch each drive `
  + 'the real adapter and the merged verb fires; no source-string assertions remain.',
);
