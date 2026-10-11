// Phone controls: what the real view does when a touch is interrupted. The view is mounted against a tiny
// stand-in document (no layout, no browser): these pin which contacts, wheels, dialogs and flags are left
// standing after pointercancel, blur, rotation, a modal opening or a missing browser capability.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MobileGestures } from '../src/systems/mobile/model.js';
import { mountMobileView } from '../src/systems/mobile/view.js';
import { POWER_PAGES } from '../src/systems/mobile/catalog.js';
import { enhanceMobileTouch } from '../src/systems/mobile/bridge.js';

const camel = k => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const VOID = new Set(['input', 'br', 'img', 'meta', 'link', 'hr']);

class Elem {
  constructor(tag, doc) {
    this.tag = tag; this.doc = doc; this.attrs = {}; this.dataset = {}; this.children = []; this.parent = null;
    this.hidden = false; this.listeners = []; this.captured = new Set(); this.rect = { left: 0, top: 0, right: 0, bottom: 0 };
    this.style = { props: {}, setProperty(k, v) { this.props[k] = String(v); }, removeProperty(k) { delete this.props[k]; } };
    this._classes = new Set(); this._text = '';
    const set = this._classes;
    this.classList = { add: (...c) => c.forEach(x => set.add(x)), remove: (...c) => c.forEach(x => set.delete(x)), contains: c => set.has(c) };
  }
  set className(v) { this._classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => this._classes.add(c)); }
  get className() { return [...this._classes].join(' '); }
  set id(v) { this.setAttribute('id', v); }
  get id() { return this.attrs.id ?? ''; }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  // a real element mirrors the hidden attribute into its property and data-* attributes into dataset
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k === 'class') this.className = v;
    if (k === 'hidden') this.hidden = true;
    if (k.startsWith('data-')) this.dataset[camel(k.slice(5))] = String(v);
  }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; if (k.startsWith('data-')) delete this.dataset[camel(k.slice(5))]; }
  appendChild(c) { c.remove(); c.parent = this; this.children.push(c); return c; }
  append(...cs) { cs.forEach(c => this.appendChild(c)); }
  insertBefore(c, ref) { c.remove(); c.parent = this; const i = this.children.indexOf(ref); if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; }
  replaceChildren(...cs) { this.children = []; cs.forEach(c => this.appendChild(c)); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; }
  set innerHTML(html) { this.children = []; parseInto(this, String(html)); }
  get innerHTML() { return ''; }
  addEventListener(type, fn, opts) { this.listeners.push({ type, fn, capture: opts === true || !!opts?.capture }); }
  removeEventListener(type, fn) { this.listeners = this.listeners.filter(l => !(l.type === type && l.fn === fn)); }
  click() { const e = makeEvent('click', { detail: 1, target: this }); for (const l of [...this.listeners]) if (l.type === 'click') l.fn(e); return e; }
  focus() { this.doc.focused = this; }
  getBoundingClientRect() { const r = this.rect; return { ...r, width: r.right - r.left, height: r.bottom - r.top }; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  // the browser reports the release as an event; firing it inline is the hardest ordering for the view to survive
  releasePointerCapture(id) { if (this.captured.delete(id)) this.doc.win.dispatch(makeEvent('lostpointercapture', { pointerId: id, target: this })); }
  attr(name) { return name in this.attrs ? this.attrs[name] : (name.startsWith('data-') && camel(name.slice(5)) in this.dataset ? this.dataset[camel(name.slice(5))] : null); }
  matches(selector) { return selector.split(',').some(s => matchesCompound(this, s.trim())); }
  closest(selector) { for (let n = this; n; n = n.parent) if (n.matches(selector)) return n; return null; }
  querySelectorAll(selector, out = []) { for (const c of this.children) { if (c.matches(selector)) out.push(c); c.querySelectorAll(selector, out); } return out; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
class Dialog extends Elem {
  constructor(tag, doc) { super(tag, doc); this.open = false; }
  showModal() { if (this.open) throw new Error('InvalidStateError'); this.open = true; }
  close() { this.open = false; }
}

/** One simple selector: optional tag, then any run of .class and [attr] / [attr="value"]. */
function matchesCompound(el, s) {
  const m = /^([a-z][\w-]*)?((?:\.[\w-]+|\[[^\]]+\])*)$/i.exec(s);
  if (!m) throw new Error(`the stand-in document cannot match "${s}"`);
  if (m[1] && el.tag !== m[1].toLowerCase()) return false;
  for (const part of m[2].match(/\.[\w-]+|\[[^\]]+\]/g) || []) {
    if (part[0] === '.') { if (!el._classes.has(part.slice(1))) return false; continue; }
    const [, name, want] = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(part);
    const got = el.attr(name);
    if (got == null || (want != null && got !== want)) return false;
  }
  return true;
}

/** Tags and double-quoted attributes only: that is all the deck's own templates use. Text is not kept. */
function parseInto(parent, html) {
  const stack = [parent];
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>/g;
  for (let m; (m = re.exec(html));) {
    const [, closing, tag, attrs, selfClose] = m;
    if (closing) { if (stack.length > 1) stack.pop(); continue; }
    const el = parent.doc.createElement(tag.toLowerCase());
    for (const a of attrs.matchAll(/\s+([^\s=>/]+)(?:="([^"]*)")?/g)) el.setAttribute(a[1], a[2] ?? '');
    stack[stack.length - 1].appendChild(el);
    if (!selfClose && !VOID.has(el.tag)) stack.push(el);
  }
}

function makeEvent(type, init = {}) {
  const e = { type, cancelable: true, defaultPrevented: false, stopped: false, ...init };
  e.preventDefault = () => { e.defaultPrevented = true; };
  e.stopImmediatePropagation = () => { e.stopped = true; };
  return e;
}

function makeWorld({ width = 390, height = 844 } = {}) {
  const frames = []; const clock = { now: 1000 };
  const win = {
    innerWidth: width, innerHeight: height, listeners: [], visualViewport: null, navigator: {},
    performance: { now: () => clock.now },
    requestAnimationFrame: fn => frames.push(fn), cancelAnimationFrame() {},
    MutationObserver: class { observe() {} disconnect() {} },
    confirm: () => true,
    addEventListener(type, fn, opts) { this.listeners.push({ type, fn, capture: opts === true || !!opts?.capture }); },
    removeEventListener(type, fn) { this.listeners = this.listeners.filter(l => !(l.type === type && l.fn === fn)); },
    // capture-phase listeners run first, then the rest; stopImmediatePropagation ends the walk
    dispatch(e) {
      const hits = this.listeners.filter(l => l.type === e.type);
      for (const l of [...hits.filter(l => l.capture), ...hits.filter(l => !l.capture)]) { if (e.stopped) break; l.fn(e); }
      return e;
    },
  };
  const doc = {
    win, hidden: false, focused: null, listeners: [], head: null, body: null, documentElement: null,
    createElement(tag) { return tag === 'dialog' ? new Dialog(tag, this) : new Elem(tag, this); },
    createElementNS(_ns, tag) { return new Elem(tag, this); },
    getElementById(id) { const walk = n => (n.attrs.id === id ? n : n.children.map(walk).find(Boolean)); return walk(this.documentElement) || null; },
    querySelector() { return null; },
    addEventListener(type, fn) { this.listeners.push({ type, fn }); },
    removeEventListener(type, fn) { this.listeners = this.listeners.filter(l => !(l.type === type && l.fn === fn)); },
  };
  doc.documentElement = new Elem('html', doc); doc.head = new Elem('head', doc); doc.body = new Elem('body', doc);
  doc.documentElement.append(doc.head, doc.body);
  const canvas = new Elem('canvas', doc); canvas.setAttribute('id', 'gl-canvas'); doc.body.append(canvas);
  return { win, doc, canvas, frames, clock };
}

/** A 390x844 phone in flight with the real view mounted. `finger` drives pointer events through the window. */
function mount() {
  const world = makeWorld(); const { win, doc } = world;
  globalThis.document = doc; // svg() and the motion helpers read the global document
  const state = { tick: 1, mode: 'flight', playerId: 1, paused: false, player: { alive: true }, ui: { screenStack: [] }, input: {}, entities: new Map() };
  const model = new MobileGestures();
  const calls = { activate: [], reset: [] };
  const cfg = {};
  const view = mountMobileView({
    state, model, win, doc, config: () => cfg,
    activate: power => calls.activate.push(power.id), reset: role => calls.reset.push(role ?? null),
    saveConfig: (k, v) => { cfg[k] = v; },
  });
  const q = s => view.root.querySelector(s);
  // the rects a portrait phone would report: pause top right, the powers handle on the right edge, gun and tether bottom right
  q('.mf-pause').rect = { left: 322, top: 10, right: 374, bottom: 62 };
  q('.mf-edge').rect = { left: 342, top: 406, right: 390, bottom: 538 };
  q('.mf-gun').rect = { left: 282, top: 670, right: 378, bottom: 766 };
  q('.mf-tether').rect = { left: 182, top: 748, right: 260, bottom: 826 };
  const flush = () => { for (let i = 0; i < 4 && world.frames.length; i += 1) world.frames.splice(0).forEach(f => f()); };
  // stands in for the legacy mouse input, which attaches after the deck and must not see what the deck owns
  const legacy = { cancels: 0 };
  win.addEventListener('pointercancel', () => { legacy.cancels += 1; });
  let t = 0;
  const send = (type, id, x, y, target) => win.dispatch(makeEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, timeStamp: (t += 16), target: target || world.canvas }));
  const finger = {
    down: (id, x, y, target) => send('pointerdown', id, x, y, target),
    move: (id, x, y, target) => send('pointermove', id, x, y, target),
    up: (id, x, y, target) => send('pointerup', id, x, y, target),
    cancel: (id, x, y, target) => send('pointercancel', id, x, y, target),
  };
  const fire = (type, init) => win.dispatch(makeEvent(type, init));
  const fireDoc = type => doc.listeners.filter(l => l.type === type).forEach(l => l.fn(makeEvent(type)));
  const guide = doc.body.children.find(c => c.tag === 'dialog');
  return { ...world, state, model, view, calls, q, flush, finger, legacy, fire, fireDoc, guide, dispose() { view.destroy(); delete globalThis.document; } };
}

/** A tap on the powers handle: the wheel opens and stays open on bank `bank`. */
function pinWheel(w, bank = 0) {
  const edge = w.q('.mf-edge');
  w.model.wheelPage = bank;
  w.finger.down(9, 366, 470, edge);
  w.finger.up(9, 366, 470, edge);
}
const wheelOpen = w => w.q('.mf-wheel').hidden === false;

test('a thumb on empty space flies, and a cancelled touch leaves nothing drawn or held', () => {
  const w = mount();
  try {
    const down = w.finger.down(1, 120, 600);
    assert.equal(down.defaultPrevented, true, 'the deck takes the touch');
    assert.ok(w.model.stick, 'stick contact begun');
    w.flush();
    assert.equal(w.q('.mf-stick').hidden, false);
    w.finger.cancel(1, 120, 600);
    assert.equal(w.model.pointers.size, 0);
    assert.equal(w.legacy.cancels, 0, 'the legacy input never sees a touch the deck owned');
    assert.equal(w.q('.mf-stick').hidden, true, 'a cancelled contact does not leave the stick drawn');
    assert.equal(w.canvas.captured.size, 0, 'capture is handed back');
  } finally { w.dispose(); }
});

for (const [name, interrupt] of [
  ['the window losing focus', w => w.fire('blur')],
  ['the page being hidden', w => w.fire('pagehide')],
  ['the tab going to the background', w => { w.doc.hidden = true; w.fireDoc('visibilitychange'); }],
]) {
  test(`${name} lets go of every held thumb, and the next touches start clean`, () => {
    const w = mount();
    try {
      w.finger.down(1, 120, 600);
      w.finger.down(2, 330, 700, w.q('.mf-gun'));
      assert.equal(w.model.pointers.size, 2);
      w.flush();
      assert.equal(w.q('.mf-gun').dataset.held, '1');
      interrupt(w);
      assert.equal(w.model.pointers.size, 0, 'no contact survives');
      assert.equal(w.canvas.captured.size + w.q('.mf-gun').captured.size, 0, 'no capture survives');
      assert.equal(w.q('.mf-stick').hidden, true);
      assert.ok(w.calls.reset.includes(null), 'the input adapter is told to go neutral');
      w.doc.hidden = false;
      w.flush();
      assert.equal(w.q('.mf-gun').dataset.held, '0', 'the gun key stops reading as held');
      // the fingers are still down on the glass: their later events must not revive anything
      w.finger.move(1, 140, 560);
      w.finger.up(1, 140, 560);
      w.finger.up(2, 330, 700, w.q('.mf-gun'));
      assert.equal(w.model.pointers.size, 0);
      // and the same pointer ids, touching again, are claimed afresh
      w.finger.down(1, 100, 500);
      w.finger.down(2, 330, 700, w.q('.mf-gun'));
      assert.ok(w.model.stick && w.model.held('fire'));
    } finally { w.dispose(); }
  });
}

test('a cancelled wheel gesture closes the wheel and requests nothing', () => {
  const w = mount();
  try {
    const edge = w.q('.mf-edge');
    w.finger.down(3, 366, 470, edge);
    assert.equal(wheelOpen(w), true);
    assert.equal(w.doc.documentElement.dataset.sfMobileWheel, '1');
    assert.equal(edge.getAttribute('aria-expanded'), 'true');
    w.finger.move(3, 300, 470, edge); // over a power
    w.finger.cancel(3, 300, 470, edge);
    assert.equal(wheelOpen(w), false);
    assert.equal(w.doc.documentElement.dataset.sfMobileWheel, '0');
    assert.equal(edge.getAttribute('aria-expanded'), 'false');
    assert.deepEqual(w.calls.activate, [], 'a cancelled touch is never a request');
    assert.equal(w.model.pointers.size, 0);
  } finally { w.dispose(); }
});

test('a modal opening over a pinned wheel puts it away, and it stays shut when the modal closes', () => {
  const w = mount();
  try {
    pinWheel(w);
    assert.equal(wheelOpen(w), true);
    w.state.ui.screenStack.push('missionOffer');
    w.view.render();
    assert.equal(wheelOpen(w), false);
    assert.equal(w.doc.documentElement.dataset.sfMobileWheel, '0');
    assert.equal(w.q('.mf-edge').getAttribute('aria-expanded'), 'false');
    assert.equal(w.q('.mf-flight').hidden, true);
    w.state.ui.screenStack.length = 0;
    w.view.render();
    assert.equal(w.q('.mf-flight').hidden, false, 'flight controls return with the modal gone');
    assert.equal(wheelOpen(w), false, 'the wheel does not come back by itself');
    w.finger.down(5, 120, 600);
    assert.ok(w.model.stick, 'the first touch after the modal flies');
  } finally { w.dispose(); }
});

test('rotating the phone lets go of the stick and the pinned wheel; a small resize does not', () => {
  const w = mount();
  try {
    w.finger.down(1, 120, 600);
    w.flush();
    assert.equal(w.q('.mf-stick').hidden, false, 'the stick is on screen');
    pinWheel(w);
    assert.equal(wheelOpen(w), true);
    w.win.innerWidth = 394; w.fire('resize'); // the address bar or a scrollbar
    assert.ok(w.model.stick, 'the stick survives a small resize');
    assert.equal(wheelOpen(w), true);
    w.win.innerWidth = 844; w.win.innerHeight = 390; w.fire('resize'); // portrait to landscape
    assert.equal(w.model.pointers.size, 0);
    assert.equal(wheelOpen(w), false);
    assert.equal(w.doc.documentElement.dataset.sfMobileWheel, '0');
    assert.equal(w.q('.mf-stick').hidden, true);
  } finally { w.dispose(); }
});

test('Touch guide from the wheel opens the guide over a cleared deck, and Ready hands flight back', () => {
  const w = mount();
  try {
    pinWheel(w, 3);
    const help = POWER_PAGES[3].powers.findIndex(p => p.id === 'help');
    assert.ok(help >= 0);
    w.q('.mf-nodes').children[help].click();
    assert.deepEqual(w.calls.activate, ['pause'], 'the game is paused behind the guide');
    assert.equal(w.guide.open, true);
    assert.equal(wheelOpen(w), false);
    w.flush();
    assert.equal(w.q('.mf-flight').hidden, true, 'flight controls step aside for the dialog');
    const touch = w.finger.down(6, 120, 600);
    assert.equal(touch.defaultPrevented, false, 'a touch on the dialog is the dialog\'s');
    assert.equal(w.model.pointers.size, 0);
    w.guide.querySelector('[data-close]').click();
    assert.equal(w.guide.open, false);
    w.flush();
    assert.equal(w.q('.mf-flight').hidden, false);
  } finally { w.dispose(); }
});

async function pressFullscreen(w) {
  const index = POWER_PAGES[3].powers.findIndex(p => p.id === 'fullscreen');
  assert.ok(index >= 0);
  pinWheel(w, 3);
  w.q('.mf-nodes').children[index].click();
  await new Promise(resolve => setTimeout(resolve, 0)); // a refusal arrives as a rejected promise
}

test('Fullscreen on a browser without the Fullscreen API says so instead of doing nothing', async () => {
  const w = mount(); // iPhone Safari has no element fullscreen: documentElement.requestFullscreen is absent
  try {
    await pressFullscreen(w);
    const toast = w.q('.mf-toast');
    assert.equal(toast.hidden, false);
    assert.match(toast.textContent, /fullscreen unavailable/i);
    assert.equal(wheelOpen(w), false, 'the wheel still closes');
  } finally { w.dispose(); }
});

test('Fullscreen that is refused or throws says so; fullscreen that works stays quiet', async () => {
  for (const [label, request, quiet] of [
    ['refused', () => Promise.reject(new Error('denied')), false],
    ['throws', () => { throw new TypeError('not allowed'); }, false],
    ['works', () => Promise.resolve(), true],
  ]) {
    const w = mount();
    try {
      let asked = 0;
      w.doc.documentElement.requestFullscreen = function requestFullscreen() { asked += 1; return request(); };
      await pressFullscreen(w);
      assert.equal(asked, 1, `${label}: the request is made once, inside the gesture`);
      assert.equal(w.q('.mf-toast').hidden, quiet, label);
    } finally { w.dispose(); }
  }
});

test('the gyre verb latches on the touch deck and reaches acts.gyreSnare', () => {
  // The catalog row is the verb's ONLY door onto the deck — kind 'toggle' so a
  // tap holds the latch until a second tap bowls (the desktop contract).
  const power = POWER_PAGES.flatMap(p => p.powers).find(p => p.id === 'gyreSnare');
  assert.ok(power, 'gyreSnare is in POWER_PAGES — a missing row is a dead verb');
  assert.equal(power.kind, 'toggle', 'tap lashes, tap again bowls');

  // model.toggle → frame.actions → VIRTUAL_ACTIONS → host._held → acts.gyreSnare.
  const state = { mode: 'flight', playerId: 'p1', tick: 1, player: { alive: true },
    entities: new Map(), input: {}, ui: {}, settings: {} };
  const touch = {
    active: true,
    axes: { leftX: 0, leftY: 0, rightX: 0, rightY: 0 },
    actions: { fire: { held: false }, tether: { held: false } },
    _btnHeld: {}, _activityPending: false,
    tick() {}, _clearTouchState() {},
  };
  const host = {
    _held() { return false; },
    _heldExcept() { return false; },
    _holdToggleLatches: {},
  };
  enhanceMobileTouch(touch, { state, bus: null, helpers: null });
  touch.mobile.activate(power);            // tap → the latch engages
  touch.tick(1 / 60, state, host);
  assert.equal(touch.mobile.frame.actions.gyreSnare, true, 'the toggle reaches frame.actions');
  assert.equal(host._held(state, 'gyreSnare'), true, 'the virtual hold reaches acts.gyreSnare');
  touch.mobile.activate(power);            // second tap → the bowl edge
  touch.tick(1 / 60, { ...state, tick: 2 }, host);
  assert.equal(host._held(state, 'gyreSnare'), false, 'the second tap releases the latch');
});
