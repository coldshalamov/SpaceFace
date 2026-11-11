// MOB-01: two open-space thumbs pinch the flight camera, and the phone's default view shows the
// desktop default's horizontal world width. Pure checks share tabletopPolicy's own glass math;
// the view checks drive real pointer events through the same document double the lifecycle tests
// mount, so the zoom the deck writes is the zoom the model produced.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MobileGestures, PINCH_GESTURE_MIN_PX } from '../src/systems/mobile/model.js';
import { mountMobileView } from '../src/systems/mobile/view.js';
import {
  CAMERA_ZOOM_MAX,
  DEFAULT_ZOOM,
  DESKTOP_REFERENCE_ASPECT,
  MOBILE_PINCH_ZOOM_MAX_FACTOR,
  MOBILE_PINCH_ZOOM_MIN_FACTOR,
  glassHorizontalWidthWu,
  resolvePhoneDefaultZoom,
  resolvePinchZoomTarget,
} from '../src/render/tabletopPolicy.js';

const FOV = 50, TILT = 60;

// --- the pure policy ---------------------------------------------------------------------------
test('the aspect-aware phone default shows the desktop default horizontal world width', () => {
  const desktopWidth = glassHorizontalWidthWu(DEFAULT_ZOOM, FOV, DESKTOP_REFERENCE_ASPECT, TILT);
  for (const [w, h] of [[390, 844], [844, 390]]) {
    const zoom = resolvePhoneDefaultZoom(FOV, w / h, TILT);
    const width = glassHorizontalWidthWu(zoom, FOV, w / h, TILT);
    assert.ok(Math.abs(width / desktopWidth - 1) <= 0.05,
      `${w}x${h}: default ${zoom.toFixed(1)} shows ${width.toFixed(0)} wu, desktop shows ${desktopWidth.toFixed(0)} wu`);
  }
  assert.ok(Math.abs(resolvePhoneDefaultZoom(FOV, DESKTOP_REFERENCE_ASPECT, TILT) - DEFAULT_ZOOM)
    / DEFAULT_ZOOM <= 0.05, 'a desktop-aspect screen keeps the desktop default');
});

test('a pinch follows the finger-distance ratio, clamped to the 0.6x/1.5x band', () => {
  const d0 = resolvePhoneDefaultZoom(FOV, 390 / 844, TILT);
  const lo = Math.max(45, d0 * MOBILE_PINCH_ZOOM_MIN_FACTOR), hi = d0 * MOBILE_PINCH_ZOOM_MAX_FACTOR;
  assert.equal(resolvePinchZoomTarget(d0, 1, d0), d0);
  assert.ok(Math.abs(resolvePinchZoomTarget(d0, 1.25, d0) - d0 * 1.25) < 1e-9, 'pinch-out follows the ratio');
  assert.ok(Math.abs(resolvePinchZoomTarget(d0, 0.8, d0) - d0 * 0.8) < 1e-9, 'pinch-in follows the ratio');
  assert.equal(resolvePinchZoomTarget(d0, 3, d0), hi, 'spread clamps at 1.5x of the default');
  assert.equal(resolvePinchZoomTarget(d0, 0.1, d0), lo, 'squeeze clamps at 0.6x of the default');
  assert.equal(resolvePinchZoomTarget(60, 1, d0), lo, 'the floor also binds a closer start');
  assert.equal(resolvePinchZoomTarget(NaN, NaN, NaN), DEFAULT_ZOOM, 'degenerate input is the desktop default');
});

// --- the gesture model -------------------------------------------------------------------------
test('two open-space contacts pinch past the 12 px start; the second stick role cannot begin', () => {
  const model = new MobileGestures();
  assert.ok(model.begin(1, 'stick', 120, 600, 0));
  assert.ok(model.begin(2, 'pinch', 250, 600, 10), 'a second open-space contact joins the pair');
  assert.equal(model.begin(3, 'stick', 60, 300, 20), false, 'roles stay exclusive: no second stick');
  assert.equal(model.begin(4, 'pinch', 300, 300, 20), false, 'and no second pinch candidate');
  model.move(1, 112, 600, 30); // 130 -> 138 apart: inside the start
  assert.equal(model.pinch, null, 'an 8 px change does not start a pinch');
  model.move(1, 106, 600, 40); // 130 -> 144 apart: past the start
  assert.ok(model.pinch, 'past 12 px the pair becomes the pinch');
  assert.ok(Math.abs(model.pinchDistance() - 144) < 1e-9);
  const s = model.sample(1 / 60);
  assert.equal(s.flight.active, false, 'the stick does not fly while the pinch owns the camera');
  assert.ok(Math.abs(s.flight.magnitude) < 1e-9);
});

test('a resting second contact that never crosses the start is not a pinch', () => {
  const model = new MobileGestures();
  model.begin(1, 'stick', 120, 600, 0);
  model.begin(2, 'pinch', 250, 600, 10);
  const s = model.sample(1 / 60);
  assert.equal(model.pinch, null);
  assert.equal(s.flight.active, true, 'until the pair separates the first thumb still flies');
  // and if the first thumb lifts before a pinch starts, the resting one takes over flying
  model.end(1, 120, 600, 300);
  assert.equal(model.stick?.id, 2, 'the surviving open-space contact inherits the stick');
  assert.equal(model.sample(1 / 60).flight.active, true);
});

test('one finger lifting ends the pinch; the other keeps flying without firing', () => {
  const model = new MobileGestures();
  model.begin(1, 'stick', 120, 600, 0);
  model.begin(2, 'pinch', 250, 600, 10);
  model.move(1, 80, 600, 30); // separates past the start: pinch is live
  assert.ok(model.pinch);
  model.end(1, 40, 600, 80); // one thumb leaves mid-pinch — a fast drag, so a flick would cheat
  assert.equal(model.pinch, null, 'releasing one finger ends the pinch');
  assert.equal(model.flickS, 0, 'the pinch release is never a boost flick');
  assert.equal(model.stick?.id, 2, 'the resting thumb takes the stick');
  const s = model.sample(1 / 60);
  assert.equal(s.flight.active, true, 'the survivor flies again');
  assert.equal(s.flight.magnitude, 0, 're-anchored where it rests: no deflection jump');
  // the other order: the pinch-role member lifts and the original stick survives re-anchored
  const model2 = new MobileGestures();
  model2.begin(1, 'stick', 120, 600, 0);
  model2.begin(2, 'pinch', 250, 600, 10);
  model2.move(2, 300, 600, 30);
  assert.ok(model2.pinch);
  model2.end(2, 300, 600, 80);
  assert.equal(model2.pinch, null);
  assert.equal(model2.stick?.id, 1);
  assert.equal(model2.stick.ox, 120, 'the stick re-anchors at its resting spot, not its landing');
});

test('a gun contact held through a pinch cannot fire, on release either', () => {
  const model = new MobileGestures();
  model.begin(1, 'stick', 120, 600, 0);
  model.begin(3, 'fire', 330, 700, 5);
  model.begin(2, 'pinch', 250, 600, 10);
  const before = model.sample(1 / 60);
  assert.equal(before.actions.fire, true, 'before the pinch, a held gun holds');
  model.move(2, 300, 600, 30);
  assert.ok(model.pinch);
  const during = model.sample(1 / 60);
  assert.equal(during.actions.fire, undefined, 'the fire role does not fire while pinching');
  assert.equal(during.aim, null, 'and it does not aim');
  model.end(2, 300, 600, 80); // the pinch ends; the gun is still held down
  const after = model.sample(1 / 60);
  assert.equal(after.actions.fire, undefined, 'the suppressed contact stays dead through its hold');
  model.end(3, 330, 700, 90);
  const released = model.sample(1 / 60);
  assert.equal(released.actions.fire, undefined, 'releasing it is not a shot either');
  assert.deepEqual(model.pulses, []);
});

// --- the real view, driven through pointer events ----------------------------------------------
const camel = k => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const VOID = new Set(['input', 'br', 'img', 'meta', 'link', 'hr']);
class Elem {
  constructor(tag, doc) {
    this.tag = tag; this.doc = doc; this.attrs = {}; this.dataset = {}; this.children = []; this.parent = null;
    this.hidden = false; this.listeners = []; this.captured = new Set(); this.rect = { left: 0, top: 0, right: 0, bottom: 0 };
    this.style = { props: {}, setProperty(k, v) { this.props[k] = String(v); }, removeProperty(k) { delete this.props[k]; }, getPropertyValue(k) { return this.props[k] ?? ''; } };
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
function matchesCompound(el, s) {
  const m = /^([a-z][\w-]*)?((?:[.#][\w-]+|\[[^\]]+\])*)$/i.exec(s);
  if (!m) throw new Error(`the stand-in document cannot match "${s}"`);
  if (m[1] && el.tag !== m[1].toLowerCase()) return false;
  for (const part of m[2].match(/[.#][\w-]+|\[[^\]]+\]/g) || []) {
    if (part[0] === '#') { if (el.id !== part.slice(1)) return false; continue; }
    if (part[0] === '.') { if (!el._classes.has(part.slice(1))) return false; continue; }
    const [, name, want] = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(part);
    const got = el.attr(name);
    if (got == null || (want != null && got !== want)) return false;
  }
  return true;
}
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

/** The 390x844 phone in flight, as the bridge mounts it on a real touch device. */
function mount({ width = 390, height = 844 } = {}) {
  const clock = { now: 1000 };
  const win = {
    innerWidth: width, innerHeight: height, listeners: [], visualViewport: null, navigator: {},
    performance: { now: () => clock.now },
    requestAnimationFrame: fn => { return fn(); }, cancelAnimationFrame() {},
    MutationObserver: class { observe() {} disconnect() {} },
    confirm: () => true,
    addEventListener(type, fn, opts) { this.listeners.push({ type, fn, capture: opts === true || !!opts?.capture }); },
    removeEventListener(type, fn) { this.listeners = this.listeners.filter(l => !(l.type === type && l.fn === fn)); },
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
  // the bridge sets this when it enables the deck on a touch device; isPhoneLayout keys on it
  doc.documentElement.dataset.sfMobile = '1';
  globalThis.document = doc;
  const state = {
    tick: 1, mode: 'flight', playerId: 1, paused: false, player: { alive: true },
    ui: { screenStack: [] }, input: {}, entities: new Map(),
    camera: { tilt: 60, zoom: DEFAULT_ZOOM }, settings: { video: { fov: 50 } },
  };
  const model = new MobileGestures();
  const calls = { reset: [] };
  const view = mountMobileView({
    state, model, win, doc, config: () => ({}),
    activate() {}, reset: role => calls.reset.push(role ?? null), saveConfig() {},
  });
  let t = 0;
  const send = (type, id, x, y, target) => win.dispatch(makeEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, timeStamp: (t += 16), target: target || canvas }));
  const finger = {
    down: (id, x, y, target) => send('pointerdown', id, x, y, target),
    move: (id, x, y, target) => send('pointermove', id, x, y, target),
    up: (id, x, y, target) => send('pointerup', id, x, y, target),
  };
  return { win, doc, canvas, state, model, view, finger, calls, dispose() { view.destroy(); delete globalThis.document; } };
}

test('the untouched phone camera takes the aspect-aware default on first flight frame', () => {
  const w = mount();
  try {
    const expected = resolvePhoneDefaultZoom(FOV, 390 / 844, TILT);
    assert.equal(w.state.camera.zoom, expected, 'the deck seeds the ruling default over the schema 144');
    assert.ok(Math.abs(glassHorizontalWidthWu(w.state.camera.zoom, FOV, 390 / 844, TILT)
      / glassHorizontalWidthWu(DEFAULT_ZOOM, FOV, DESKTOP_REFERENCE_ASPECT, TILT) - 1) <= 0.05);
  } finally { w.dispose(); }
});

test('real pointer events pinch the camera out and back; releasing a finger ends it', () => {
  const w = mount();
  try {
    const d0 = w.state.camera.zoom; // the seeded aspect-aware default
    assert.ok(d0 > DEFAULT_ZOOM, 'sanity: the phone default is wider than the desktop one');
    w.finger.down(1, 120, 600);
    w.finger.down(2, 250, 600); // the second open-space contact joins the pair
    assert.equal(w.model.pinch, null);
    w.finger.move(1, 100, 600); // 130 -> 150 apart: past the start
    assert.ok(w.model.pinch, 'the pair became a live pinch');
    w.finger.move(2, 330, 600); // d/d0 = 230/130 of the armed distance
    const out = w.state.camera.zoom;
    assert.ok(out > d0 * 1.2, `pinch-out widened the frame (${d0.toFixed(0)} -> ${out.toFixed(0)})`);
    w.finger.move(1, 116, 600); // squeeze back together
    assert.ok(w.state.camera.zoom < out, 'pinch-in pulls the camera back');
    w.finger.up(1, 116, 600);
    assert.equal(w.model.pinch, null, 'one finger up ends the gesture');
    const final = w.state.camera.zoom;
    w.finger.move(2, 380, 600); // a lone contact moving afterwards does not zoom
    assert.equal(w.state.camera.zoom, final);
    assert.equal(w.model.stick?.id, 2, 'the survivor owns the stick again');
  } finally { w.dispose(); }
});

test('the pinch band stops at the device default, not the wheel ceiling', () => {
  const w = mount();
  try {
    const d0 = resolvePhoneDefaultZoom(FOV, 390 / 844, TILT);
    w.state.camera.zoom = d0;
    w.finger.down(1, 120, 600); w.finger.down(2, 250, 600);
    w.finger.move(2, 340, 600);
    assert.ok(w.model.pinch);
    w.finger.move(2, 60, 600); // squeeze far past the lower band in one drag
    assert.ok(w.state.camera.zoom >= Math.max(45, d0 * MOBILE_PINCH_ZOOM_MIN_FACTOR) - 1e-9,
      `pinch-in cannot close past 0.6x of the default (got ${w.state.camera.zoom.toFixed(0)})`);
    w.finger.move(1, 60, 600); w.finger.move(2, 389, 600); // then spread to the cap
    assert.ok(w.state.camera.zoom <= d0 * MOBILE_PINCH_ZOOM_MAX_FACTOR + 1e-9,
      `pinch-out cannot open past 1.5x of the default (got ${w.state.camera.zoom.toFixed(0)})`);
    assert.ok(d0 * MOBILE_PINCH_ZOOM_MAX_FACTOR > CAMERA_ZOOM_MAX,
      'the band is deliberately wider than the wheel\'s 330 ceiling — the ruling needs it');
  } finally { w.dispose(); }
});
