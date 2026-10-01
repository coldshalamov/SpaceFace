import assert from 'node:assert/strict';
import test from 'node:test';

import { createYardCarousel, yardRingPose } from '../src/ui/orrery/yardCarousel.js';

const HOST_RECT = { left: 0, top: 0, width: 1440, height: 900 };
const STAGE_RECT = { left: 560, top: 60, width: 880, height: 840 };
const HERO_RECT = { left: 692, top: 320, width: 651, height: 386 };
const POSTER_RECT = { left: 660, top: 280, width: 911, height: 540 };

class FakeClassList {
  constructor(el) { this.el = el; this.set = new Set(); }
  _sync() { this.el.className = [...this.set].join(' '); }
  add(...names) { names.forEach((n) => this.set.add(n)); this._sync(); }
  remove(...names) { names.forEach((n) => this.set.delete(n)); this._sync(); }
  toggle(name, force) {
    const on = force === undefined ? !this.set.has(name) : !!force;
    if (on) this.set.add(name); else this.set.delete(name);
    this._sync();
    return on;
  }
  contains(name) { return this.set.has(name); }
}

class FakeEl {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = doc || null;
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.attributes = {};
    this.dataset = {};
    this.classList = new FakeClassList(this);
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.draggable = true;
    this._clicks = 0;
    this._rect = { left: 0, top: 0, width: 0, height: 0 };
    const self = this;
    const style = {};
    style.setProperty = (k, v) => { style[k] = v; };
    this.style = style;
    Object.defineProperty(this, 'isConnected', {
      get() { for (let n = self; n; n = n.parentNode) if (n === (self.ownerDocument && self.ownerDocument.documentElement)) return true; return false; },
    });
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
  removeAttribute(name) { delete this.attributes[name]; }
  appendChild(child) { if (child.parentNode) child.parentNode.removeChild(child); child.parentNode = this; this.children.push(child); child.ownerDocument = this.ownerDocument; return child; }
  append(...kids) { kids.forEach((k) => this.appendChild(k)); }
  prepend(child) { if (child.parentNode) child.parentNode.removeChild(child); child.parentNode = this; this.children.unshift(child); child.ownerDocument = this.ownerDocument; return child; }
  insertBefore(child, ref) {
    if (child.parentNode) child.parentNode.removeChild(child);
    const i = ref ? this.children.indexOf(ref) : -1;
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument;
    if (i < 0) this.children.push(child); else this.children.splice(i, 0, child);
    return child;
  }
  removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parentNode = null; return child; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  contains(node) { for (let n = node; n; n = n.parentNode) if (n === this) return true; return false; }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatch(type, event = {}) {
    if (event && typeof event === 'object') {
      event.type = type;
      if (!('target' in event)) event.target = this;
      if (typeof event.preventDefault !== 'function') event.preventDefault = () => { event.defaultPrevented = true; };
      if (typeof event.stopPropagation !== 'function') event.stopPropagation = () => { event.cancelBubble = true; };
    }
    for (const fn of [...(this.listeners.get(type) || [])]) fn(event);
    return event;
  }
  click() { this._clicks += 1; this.dispatch('click', { target: this }); }
  _match(sel) {
    const attrM = /^([a-z]+)\[([a-z-]+)="([^"]*)"\]$/i.exec(sel);
    if (attrM) return this.tagName === attrM[1].toUpperCase() && this.getAttribute(attrM[2]) === attrM[3];
    if (sel.startsWith('.')) return this.classList.contains(sel.slice(1)) || this.className.split(/\s+/).includes(sel.slice(1));
    if (sel.startsWith('#')) return this.id === sel.slice(1);
    return this.tagName === sel.toUpperCase();
  }
  _walk(out) { out.push(this); for (const c of this.children) c._walk(out); return out; }
  querySelector(sel) { return this._walk([]).slice(1).find((n) => n._match(sel)) || null; }
  querySelectorAll(sel) { return this._walk([]).slice(1).filter((n) => n._match(sel)); }
  getBoundingClientRect() { return { ...this._rect, right: this._rect.left + this._rect.width, bottom: this._rect.top + this._rect.height }; }
  setPointerCapture(id) { this._captured = id; }
  releasePointerCapture(id) {
    (this._releaseCalls = this._releaseCalls || []).push(id);
    if (id !== this._captured) this._captureMismatch = (this._captureMismatch || 0) + 1;
    this._captured = null;
  }
}

function makeDoc() {
  const doc = { listeners: new Map(), visibilityState: 'visible' };
  const mk = (tag) => new FakeEl(tag, doc);
  doc.createElement = mk;
  doc.createElementNS = (ns, tag) => mk(tag);
  doc.documentElement = mk('html');
  doc.head = mk('head');
  doc.body = mk('body');
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);
  doc.getElementById = () => null;
  doc.addEventListener = (t, f) => { if (!doc.listeners.has(t)) doc.listeners.set(t, new Set()); doc.listeners.get(t).add(f); };
  doc.removeEventListener = (t, f) => doc.listeners.get(t)?.delete(f);
  doc.dispatch = (t, e = {}) => { e.type = t; for (const f of [...(doc.listeners.get(t) || [])]) f(e); };
  return doc;
}

function makeEnv(itemCount = 3) {
  const doc = makeDoc();
  const win = new FakeEl('window', doc);
  doc.defaultView = win;
  globalThis.document = doc;
  globalThis.window = win;
  const host = new FakeEl('section', doc);
  host._rect = { ...HOST_RECT };
  const anchor = new FakeEl('div', doc);
  anchor._rect = { ...STAGE_RECT };
  const heroBox = new FakeEl('div', doc);
  heroBox.classList.add('orr-ng-hero-box');
  heroBox._rect = { ...HERO_RECT };
  const poster = new FakeEl('img', doc);
  poster.classList.add('k-stage__poster');
  poster._rect = { ...POSTER_RECT };
  anchor.appendChild(poster);
  anchor.appendChild(heroBox);
  doc.body.appendChild(host);
  doc.body.appendChild(anchor);
  const row = new FakeEl('ul', doc);
  host.appendChild(row);
  const picked = [];
  const actions = ['a', 'b', 'c', 'd', 'e'].slice(0, itemCount);
  for (let i = 0; i < itemCount; i++) {
    const li = new FakeEl('li', doc);
    const b = new FakeEl('button', doc);
    b.dataset.action = 'starter:' + actions[i];
    b.setAttribute('aria-pressed', String(i === 0));
    b.type = 'button';
    b.addEventListener('click', () => {
      picked.push(b.dataset.action);
      for (const other of row.querySelectorAll('button')) other.setAttribute('aria-pressed', String(other === b));
    });
    li.appendChild(b);
    row.appendChild(li);
  }
  const art = Object.fromEntries(actions.map((a) => ['starter:' + a, `/${a}.webp`]));
  return { doc, win, host, anchor, heroBox, poster, row, picked, art };
}

const rafQ = [];
let rafNow = 0;
function installRaf() {
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCaf = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (cb) => { rafQ.push(cb); return rafQ.length; };
  globalThis.cancelAnimationFrame = () => {};
  const step = (frames = 1, dt = 16.7) => {
    for (let i = 0; i < frames; i++) {
      rafNow += dt;
      const batch = rafQ.splice(0);
      for (const cb of batch) cb(rafNow);
    }
  };
  const restore = () => { globalThis.requestAnimationFrame = prevRaf; globalThis.cancelAnimationFrame = prevCaf; };
  return { step, restore };
}

function installClock(start = 1000) {
  const prev = globalThis.performance;
  const clock = { now: start };
  globalThis.performance = { now: () => clock.now };
  return { clock, restore: () => { globalThis.performance = prev; } };
}

function makeCarousel(env, extra = {}) {
  return createYardCarousel({ row: env.row, host: env.host, anchor: env.anchor, hero: '.orr-ng-hero-box', art: env.art, modelRing: true, ...extra });
}

function imgsOf(wrap) { return wrap.querySelectorAll('img'); }
function grabOf(car) { return car.el.querySelector('.orr-yard__grab'); }
function loadAll(car) { for (const img of imgsOf(car.el)) img.dispatch('load'); }
function pressAt(host, x, y, opts = {}) { return host.dispatch('pointerdown', { button: 0, pointerId: 1, isPrimary: true, clientX: x, clientY: y, ...opts }); }

function modelPose(car, i) {
  const m = imgsOf(car.el)[i].parentNode;
  const tf = /translate\(([-\d.]+)px, ?([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(m.style.transform || '');
  const w = parseFloat(m.style.width) || 0;
  const h = parseFloat(m.style.height) || 0;
  if (!tf) return null;
  const s = +tf[3];
  return { cx: +tf[1] + (s * w) / 2, cy: +tf[2] + (s * h) / 2, s, w, h };
}

test('model-ring mounts one decorative image per hull and reports ready only when all load', () => {
  const env = makeEnv();
  let ready = null;
  const car = makeCarousel(env, { onModelsReady: (v) => { ready = v; } });
  const imgs = imgsOf(car.el);
  assert.equal(imgs.length, 3, 'one presented model per hull');
  for (const img of imgs) {
    assert.equal(img.getAttribute('aria-hidden'), 'true');
    assert.equal(img.alt, '');
    assert.equal(img.draggable, false, 'decorative image never native-drags');
  }
  assert.equal(ready, null, 'no verdict until every image settles');
  imgs[0].dispatch('load');
  imgs[1].dispatch('load');
  assert.equal(ready, null);
  imgs[2].dispatch('load');
  assert.equal(ready, true, 'all images loaded -> the poster may hide');
  car.dispose();
});

test('missing or failed art keeps the poster fallback', () => {
  const env = makeEnv();
  let ready = null;
  const car = makeCarousel(env, { art: { 'starter:a': '/a.webp' }, onModelsReady: (v) => { ready = v; } });
  assert.equal(ready, false, 'absent art restores the poster fallback');
  car.dispose();

  const env2 = makeEnv();
  let ready2 = null;
  const car2 = makeCarousel(env2, { onModelsReady: (v) => { ready2 = v; } });
  const imgs = imgsOf(car2.el);
  imgs[0].dispatch('load');
  imgs[1].dispatch('load');
  imgs[2].dispatch('error');
  assert.equal(ready2, false, 'a failed image restores the poster fallback');
  assert.equal(imgsOf(car2.el).length, 0, 'the failed ring removes its models');
  car2.dispose();
});

test('dragstart inside the yard is prevented; outside it or on controls it is not', () => {
  const env = makeEnv();
  const car = makeCarousel(env);
  const g = car.geometry;
  const inside = env.host.dispatch('dragstart', { target: env.anchor, clientX: g.cx, clientY: g.cy });
  assert.equal(inside.defaultPrevented, true, 'native drag over the yard is owned');
  const input = env.doc.createElement('input');
  const outside = env.host.dispatch('dragstart', { target: input, clientX: 40, clientY: 40 });
  assert.equal(!!outside.defaultPrevented, false, 'outside the yard stays native');
  const btn = env.row.children[0].querySelector('button');
  const onWord = env.host.dispatch('dragstart', { target: btn, clientX: g.cx, clientY: g.cy });
  assert.equal(!!onWord.defaultPrevented, false, 'real controls keep their own drag semantics');
  car.dispose();
});

test('pointerdown in the yard is owned and default-prevented; controls and outside are not', () => {
  const env = makeEnv();
  const car = makeCarousel(env);
  const g = car.geometry;
  const owned = pressAt(env.host, g.cx, g.cy + g.ry);
  assert.equal(owned.defaultPrevented, true, 'the yard gesture suppresses native drag/selection');
  env.host.dispatch('pointerup', { pointerId: 1, clientX: g.cx, clientY: g.cy + g.ry });
  grabOf(car).dispatch('pointerup', { pointerId: 1, clientX: g.cx, clientY: g.cy + g.ry });
  const onButton = pressAt(env.host, g.cx, g.cy, { target: env.row.children[0].querySelector('button') });
  assert.equal(!!onButton.defaultPrevented, false, 'word buttons are never hijacked');
  const outside = pressAt(env.host, 20, 20);
  assert.equal(!!outside.defaultPrevented, false, 'outside the yard stays native');
  car.dispose();
});

test('a captured drag ignores foreign pointers and continues outside the yard', () => {
  const env = makeEnv();
  const car = makeCarousel(env);
  const g = car.geometry;
  const grab = grabOf(car);
  pressAt(env.host, g.cx, g.cy + g.ry);
  const rot0 = car.rotation;
  grab.dispatch('pointermove', { pointerId: 9, clientX: g.cx + 200, clientY: g.cy });
  assert.equal(car.rotation, rot0, 'a foreign pointerId never moves the ring');
  grab.dispatch('pointermove', { pointerId: 1, clientX: g.cx + 300, clientY: -500 });
  assert.notEqual(car.rotation, rot0, 'the captured pointer keeps dragging outside the yard');
  grab.dispatch('pointerup', { pointerId: 1, clientX: g.cx + 300, clientY: -500 });
  car.dispose();
});

test('a tap on a visible side hull selects it; a drag suppresses the follow-up click', () => {
  const env = makeEnv();
  const car = makeCarousel(env);
  const g = car.geometry;
  const grab = grabOf(car);
  pressAt(env.host, g.cx, g.cy + g.ry);
  grab.dispatch('pointerup', { pointerId: 1, clientX: g.cx, clientY: g.cy + g.ry });
  assert.equal(env.picked.length, 0, 'tapping the already-chosen front hull does not re-click it');
  env.poster._rect = { ...POSTER_RECT, width: 200, height: 120 };
  car.layout();
  loadAll(car);
  const pose = modelPose(car, 1);
  assert.ok(pose, 'side hull has a projected pose');
  const front = modelPose(car, 0);
  assert.ok(Math.abs(pose.cx - front.cx) > front.s * front.w / 2, 'the probe point is clear of the front box');
  pressAt(env.host, pose.cx, pose.cy);
  grab.dispatch('pointerup', { pointerId: 1, clientX: pose.cx, clientY: pose.cy });
  assert.equal(env.picked.length, 1, 'a tap on a visible side hull selects it');
  assert.equal(env.picked[0], 'starter:b');
  assert.equal(env.row.children[1].querySelector('button').getAttribute('aria-pressed'), 'true');
  pressAt(env.host, g.cx, g.cy + g.ry);
  for (let i = 1; i <= 6; i++) grab.dispatch('pointermove', { pointerId: 1, clientX: g.cx + i * 30, clientY: g.cy + g.ry });
  grab.dispatch('pointerup', { pointerId: 1, clientX: g.cx + 180, clientY: g.cy + g.ry });
  const stray = env.host.dispatch('click', { target: env.row.children[0].querySelector('button'), clientX: g.cx, clientY: g.cy });
  assert.equal(stray.defaultPrevented || stray.cancelBubble, true, 'the drag suppresses its follow-up click');
  env.host.dispatch('pointerdown', { button: 0, pointerId: 1, clientX: 20, clientY: 20 });
  const later = env.host.dispatch('click', { target: env.row.children[0].querySelector('button'), clientX: g.cx, clientY: g.cy });
  assert.equal(!!later.defaultPrevented, false, 'the suppression does not swallow later real clicks');
  car.dispose();
});

test('cancel, blur, lost capture and dispose preserve the committed starter with no inertia', () => {
  for (const [name, cancel] of [
    ['pointercancel', (env, car, grab) => grab.dispatch('pointercancel', { pointerId: 1 })],
    ['blur', (env) => env.win.dispatch('blur')],
    ['lostpointercapture', (env, car, grab) => grab.dispatch('lostpointercapture', { pointerId: 1 })],
    ['dispose', (env, car) => car.dispose()],
    ['hidden', (env) => { env.doc.visibilityState = 'hidden'; env.doc.dispatch('visibilitychange'); }],
  ]) {
    const env = makeEnv();
    const car = makeCarousel(env);
    const g = car.geometry;
    const grab = grabOf(car);
    pressAt(env.host, g.cx, g.cy + g.ry);
    grab.dispatch('pointermove', { pointerId: 1, clientX: g.cx - 400, clientY: g.cy + g.ry });
    cancel(env, car, grab);
    assert.equal(env.picked.length, 0, `${name}: the drag never commits a new starter`);
    assert.equal(env.row.children[0].querySelector('button').getAttribute('aria-pressed'), 'true', `${name}: committed starter preserved`);
    assert.ok(Math.abs(car.rotation) < 1e-6, `${name}: the ring settles back to the committed detent`);
    if (name !== 'dispose') car.dispose();
  }
});

test('dispose stops every scheduled callback', () => {
  const env = makeEnv();
  const turns = [];
  const raf = installRaf();
  try {
    const car = makeCarousel(env, { onTurn: () => turns.push(1) });
    const g = car.geometry;
    pressAt(env.host, g.cx, g.cy + g.ry);
    grabOf(car).dispatch('pointermove', { pointerId: 1, clientX: g.cx - 300, clientY: g.cy + g.ry });
    grabOf(car).dispatch('pointerup', { pointerId: 1, clientX: g.cx - 300, clientY: g.cy + g.ry });
    raf.step(3);
    const settled = turns.length;
    car.dispose();
    raf.step(40);
    assert.equal(turns.length, settled, 'no paint or turn callback survives dispose');
    assert.equal(env.host.contains(car.el), false, 'the yard leaves the host');
  } finally {
    raf.restore();
  }
});

test('reduced motion snaps directly with no glide', () => {
  const env = makeEnv();
  env.doc.documentElement.classList.add('sf-reduce-motion');
  const raf = installRaf();
  try {
    const car = makeCarousel(env);
    const g = car.geometry;
    const grab = grabOf(car);
    pressAt(env.host, g.cx, g.cy + g.ry);
    grab.dispatch('pointermove', { pointerId: 1, clientX: g.cx - 400, clientY: g.cy + g.ry });
    grab.dispatch('pointerup', { pointerId: 1, clientX: g.cx - 400, clientY: g.cy + g.ry });
    assert.ok(Math.abs(car.rotation - 120) < 1e-6, 'the release lands on its detent instantly');
    raf.step(10);
    assert.ok(Math.abs(car.rotation - 120) < 1e-6, 'no post-release glide');
    car.dispose();
  } finally {
    raf.restore();
  }
});

test('release inertia is bounded to at most one extra detent', () => {
  const env = makeEnv();
  const clk = installClock();
  const raf = installRaf();
  try {
    const car = makeCarousel(env);
    const g = car.geometry;
    const grab = grabOf(car);
    pressAt(env.host, g.cx, g.cy + g.ry);
    clk.clock.now += 16;
    grab.dispatch('pointermove', { pointerId: 1, clientX: g.cx + 645, clientY: g.cy + g.ry });
    grab.dispatch('pointerup', { pointerId: 1, clientX: g.cx + 645, clientY: g.cy + g.ry });
    assert.equal(env.picked[env.picked.length - 1], 'starter:b', 'wild release velocity can pass only one extra detent');
    car.dispose();
  } finally {
    raf.restore();
    clk.restore();
  }
});

test('release uses the latest pointer intent, not the lagging rendered pose', () => {
  const env = makeEnv();
  const clk = installClock();
  const raf = installRaf();
  try {
    const car = makeCarousel(env);
    const g = car.geometry;
    const grab = grabOf(car);
    pressAt(env.host, g.cx, g.cy + g.ry);
    clk.clock.now += 16;
    grab.dispatch('pointermove', { pointerId: 1, clientX: g.cx - 400, clientY: g.cy + g.ry });
    clk.clock.now += 200;
    grab.dispatch('pointerup', { pointerId: 1, clientX: g.cx - 400, clientY: g.cy + g.ry });
    assert.equal(env.picked[0], 'starter:b', 'the detent comes from the intent the pointer last set');
    assert.equal(car.rotation, 0, 'the painted pose is untouched until the next frame');
    raf.step(60);
    assert.ok(Math.abs(car.rotation - 120) < 0.5, 'the settle lands on the intent detent, got ' + car.rotation);
    car.dispose();
  } finally {
    raf.restore();
    clk.restore();
  }
});

test('the ring pose is continuous across every legacy cutoff and wraps on the ellipse', () => {
  for (const deg of [-180, -128, -90, -60, -30, -24, 0, 24, 30, 60, 90, 128, 180]) {
    const a = yardRingPose((deg - 0.35) * Math.PI / 180);
    const b = yardRingPose((deg + 0.35) * Math.PI / 180);
    for (const k of ['x', 'y', 'p']) assert.ok(Math.abs(a[k] - b[k]) < 0.05, `pose continuous across ${deg}deg (${k})`);
  }
  for (let deg = -180; deg <= 180; deg += 5) {
    const p = yardRingPose(deg * Math.PI / 180);
    assert.ok(Math.abs(p.x * p.x + p.y * p.y - 1) < 1e-9, `pose rides the ellipse at ${deg}`);
    assert.ok(Number.isFinite(p.p));
  }
  const rear = yardRingPose(Math.PI);
  const side = yardRingPose(Math.PI / 2);
  const front = yardRingPose(0);
  assert.ok(rear.p < side.p && side.p < front.p, 'perspective size is monotone rear -> side -> front');
  assert.ok(Math.abs(front.p - 1) < 1e-9, 'front scale is 1');
  assert.ok(Math.abs(rear.p - 0.2121) < 0.005, 'rear scale ~.212');
});

test('layout stays finite with zero children, one child, or missing art', () => {
  const env0 = makeEnv(0);
  const car0 = makeCarousel(env0);
  car0.layout();
  assert.ok(car0.geometry, 'zero children still lays out');
  car0.dispose();
  const env1 = makeEnv(1);
  const car1 = makeCarousel(env1);
  assert.ok(Number.isFinite(car1.rotation), 'one child is finite');
  car1.dispose();
  const envX = makeEnv();
  const carX = makeCarousel(envX, { art: null });
  assert.equal(carX.modelsReady, false, 'no art means no ring models');
  carX.dispose();
});

test('resize during a drag preserves the angle and re-sizes live model shells', () => {
  const env = makeEnv();
  const car = makeCarousel(env);
  loadAll(car);
  const g = car.geometry;
  const grab = grabOf(car);
  pressAt(env.host, g.cx, g.cy + g.ry);
  grab.dispatch('pointermove', { pointerId: 1, clientX: g.cx - 300, clientY: g.cy + g.ry });
  const held = car.rotation;
  env.host._rect = { ...HOST_RECT, width: 900, height: 640 };
  env.anchor._rect = { ...STAGE_RECT, width: 620, height: 560 };
  env.heroBox._rect = { ...HERO_RECT, width: 440, height: 260 };
  env.poster._rect = { ...POSTER_RECT, width: 620, height: 368 };
  car.layout();
  assert.equal(car.rotation, held, 'a mid-drag rebuild keeps the ring angle');
  const shell = imgsOf(car.el)[0].parentNode;
  assert.equal(car.geometry.mw, 620, 'the ring re-measures the resized poster box');
  assert.equal(parseFloat(shell.style.width), car.geometry.mw, 'the live shell width tracks the new poster box');
  assert.equal(parseFloat(shell.style.height), car.geometry.mh, 'the live shell height tracks the new poster box');
  const pose = modelPose(car, 0);
  assert.ok(Math.abs(pose.s * pose.w - car.geometry.mw * pose.s) < 1e-6, 'the painted pose width matches the resized shell');
  grab.dispatch('pointermove', { pointerId: 1, clientX: g.cx - 320, clientY: g.cy + g.ry });
  grab.dispatch('pointerup', { pointerId: 1, clientX: g.cx - 320, clientY: g.cy + g.ry });
  assert.ok(env.picked.length <= 1, 'the drag still ends in at most one pick');
  car.dispose();
});

test('a word click turns the ring the short way and keeps aria semantics', () => {
  const env = makeEnv();
  const car = makeCarousel(env);
  const b = env.row.children[2].querySelector('button');
  b.click();
  assert.equal(env.picked[0], 'starter:c');
  car.update();
  assert.equal(car.rotation, -120, 'the ring takes the shortest arc to the pressed word');
  assert.equal(b.getAttribute('aria-pressed'), 'true');
  car.dispose();
});

test('aria-disabled launch state denies new gestures', () => {
  const env = makeEnv();
  const car = makeCarousel(env);
  const g = car.geometry;
  for (const b of env.row.querySelectorAll('button')) b.setAttribute('aria-disabled', 'true');
  const down = pressAt(env.host, g.cx, g.cy + g.ry);
  assert.equal(!!down.defaultPrevented, false, 'a disabled yard takes no gesture');
  grabOf(car).dispatch('pointermove', { pointerId: 1, clientX: g.cx + 200, clientY: g.cy });
  assert.equal(car.rotation, 0, 'no motion while denied');
  car.dispose();
});

test('setActive(false) mid-drag cancels without a pick, snaps to the committed hull and stops all frames', () => {
  const env = makeEnv();
  const turns = [];
  const raf = installRaf();
  try {
    const car = makeCarousel(env, { onTurn: () => turns.push(1) });
    const g = car.geometry;
    const grab = grabOf(car);
    pressAt(env.host, g.cx, g.cy + g.ry);
    grab.dispatch('pointermove', { pointerId: 1, clientX: g.cx - 300, clientY: g.cy + g.ry });
    raf.step(3);
    assert.notEqual(car.rotation, 0, 'the drag was live before the screen hid');
    car.setActive(false);
    assert.equal(env.picked.length, 0, 'hiding never commits a starter');
    assert.equal(env.row.children[0].querySelector('button').getAttribute('aria-pressed'), 'true', 'committed starter preserved');
    assert.equal(car.rotation, 0, 'the ring snaps back onto the committed hull at once');
    const settled = turns.length;
    raf.step(40);
    assert.equal(turns.length, settled, 'no follower, spring or watch frame survives the park');
    const down = pressAt(env.host, g.cx, g.cy + g.ry);
    assert.equal(!!down.defaultPrevented, false, 'a parked dial takes no gesture');
    grab.dispatch('pointermove', { pointerId: 1, clientX: g.cx + 200, clientY: g.cy });
    assert.equal(car.rotation, 0, 'no motion while parked');
    car.setActive(true);
    pressAt(env.host, g.cx, g.cy + g.ry);
    grab.dispatch('pointermove', { pointerId: 1, clientX: g.cx - 300, clientY: g.cy + g.ry });
    raf.step(2);
    assert.notEqual(car.rotation, 0, 'reactivation restores the gesture');
    car.dispose();
  } finally {
    raf.restore();
  }
});

test('launch while settling freezes the spring; reactivation re-seats on the current aria-pressed', () => {
  const env = makeEnv();
  const turns = [];
  const clk = installClock();
  const raf = installRaf();
  try {
    const car = makeCarousel(env, { onTurn: () => turns.push(1) });
    const g = car.geometry;
    const grab = grabOf(car);
    pressAt(env.host, g.cx, g.cy + g.ry);
    clk.clock.now += 16;
    grab.dispatch('pointermove', { pointerId: 1, clientX: g.cx - 300, clientY: g.cy + g.ry });
    clk.clock.now += 200;
    grab.dispatch('pointerup', { pointerId: 1, clientX: g.cx - 300, clientY: g.cy + g.ry });
    assert.equal(env.picked[env.picked.length - 1], 'starter:b', 'the release committed its starter');
    raf.step(2);
    car.setActive(false);
    assert.equal(car.rotation, 120, 'parking lands the committed detent instead of leaving a spring mid-flight');
    const settled = turns.length;
    raf.step(40);
    assert.equal(turns.length, settled, 'a launching screen runs no ring frames');
    env.row.children[2].querySelector('button').click();
    car.setActive(true);
    assert.equal(car.rotation, 240, 're-show re-seats the ring on the committed hull');
    car.dispose();
  } finally {
    raf.restore();
    clk.restore();
  }
});

test('setActive is inert after dispose', () => {
  const env = makeEnv();
  const raf = installRaf();
  try {
    const car = makeCarousel(env);
    car.dispose();
    car.setActive(false);
    car.setActive(true);
    assert.equal(env.host.contains(car.el), false, 'a disposed dial stays gone');
  } finally {
    raf.restore();
  }
});

test('pointer capture releases with the captured pointerId on end and cancel', () => {
  const env = makeEnv();
  const car = makeCarousel(env);
  const g = car.geometry;
  const grab = grabOf(car);
  pressAt(env.host, g.cx, g.cy + g.ry);
  assert.equal(grab._captured, 1, 'the gesture captures its pointer');
  grab.dispatch('pointerup', { pointerId: 1, clientX: g.cx, clientY: g.cy + g.ry });
  assert.ok(grab._releaseCalls.includes(1), 'release passes the captured pointerId');
  assert.equal(grab._captureMismatch, undefined, 'release never mismatches the capture');
  pressAt(env.host, g.cx, g.cy + g.ry);
  grab.dispatch('pointercancel', { pointerId: 1 });
  assert.deepEqual(grab._releaseCalls, [1, 1], 'the cancel path releases the same pointerId');
  assert.equal(grab._captureMismatch, undefined);
  pressAt(env.host, g.cx, g.cy + g.ry);
  car.dispose();
  assert.deepEqual(grab._releaseCalls, [1, 1, 1], 'dispose releases a live capture');
  assert.equal(grab._captureMismatch, undefined);
});

test('dispose before the first frame never reattaches, paints or calls back', async () => {
  const env = makeEnv();
  let resolveFonts;
  env.doc.fonts = { ready: new Promise((r) => { resolveFonts = r; }) };
  const turns = [];
  const readyCalls = [];
  const raf = installRaf();
  try {
    const car = makeCarousel(env, { onTurn: () => turns.push(1), onModelsReady: (v) => readyCalls.push(v) });
    loadAll(car);
    car.dispose();
    assert.equal(env.anchor.children.length, 2, 'dispose removes the under-stage ring layer');
    assert.deepEqual(readyCalls, [true, false], 'dispose hands the poster fallback back');
    const settled = turns.length;
    raf.step(20);
    resolveFonts();
    await Promise.resolve();
    raf.step(20);
    assert.equal(env.anchor.children.length, 2, 'queued frame and fonts callbacks cannot reattach the back layer');
    assert.equal(turns.length, settled, 'no late paint after dispose');
    assert.equal(env.host.contains(car.el), false);
  } finally {
    raf.restore();
  }
});

test('an overlapping tap picks the frontmost visible hull, not the one painted underneath', () => {
  const env = makeEnv();
  const car = makeCarousel(env);
  loadAll(car);
  const g = car.geometry;
  const front = modelPose(car, 0);
  const side = modelPose(car, 1);
  const ox = (Math.max(front.cx - front.s * front.w / 2, side.cx - side.s * side.w / 2)
    + Math.min(front.cx + front.s * front.w / 2, side.cx + side.s * side.w / 2)) / 2;
  const oy = (Math.max(front.cy - front.s * front.h / 2, side.cy - side.s * side.h / 2)
    + Math.min(front.cy + front.s * front.h / 2, side.cy + side.s * side.h / 2)) / 2;
  pressAt(env.host, ox, oy);
  grabOf(car).dispatch('pointerup', { pointerId: 1, clientX: ox, clientY: oy });
  assert.equal(env.picked.length, 0, 'the pixel belongs to the front hull, which is already committed');
  assert.equal(car.rotation, 0, 'the ring does not lurch to the hull painted behind');
  assert.ok(ox > g.cx, 'the probe point really is on the side hull too');
  car.dispose();
});

test('only the pointer follow-up click is suppressed; keyboard clicks and in-word images stay native', () => {
  const env = makeEnv();
  const car = makeCarousel(env);
  const g = car.geometry;
  const grab = grabOf(car);
  const b0 = env.row.children[0].querySelector('button');
  pressAt(env.host, g.cx, g.cy + g.ry);
  for (let i = 1; i <= 6; i++) grab.dispatch('pointermove', { pointerId: 1, clientX: g.cx + i * 30, clientY: g.cy + g.ry });
  grab.dispatch('pointerup', { pointerId: 1, clientX: g.cx + 180, clientY: g.cy + g.ry });
  const kb = env.host.dispatch('click', { target: b0, detail: 0, clientX: g.cx, clientY: g.cy });
  assert.equal(!!kb.defaultPrevented && !kb.cancelBubble, false, 'a keyboard/programmatic click is never suppressed');
  const mouse = env.host.dispatch('click', { target: b0, detail: 1, clientX: g.cx, clientY: g.cy });
  assert.equal(mouse.defaultPrevented || mouse.cancelBubble, true, 'the pointer follow-up click is still eaten');
  const img = env.doc.createElement('img');
  b0.appendChild(img);
  const dImg = env.host.dispatch('dragstart', { target: img, clientX: g.cx, clientY: g.cy });
  assert.equal(dImg.defaultPrevented, true, 'a decorative image inside a word never native-drags');
  const dWord = env.host.dispatch('dragstart', { target: b0, clientX: g.cx, clientY: g.cy });
  assert.equal(!!dWord.defaultPrevented, false, 'the word itself keeps native semantics');
  car.dispose();
});

test('a failed model can never report ready again on later layout or load events', () => {
  const env = makeEnv();
  const calls = [];
  const car = makeCarousel(env, { onModelsReady: (v) => calls.push(v) });
  const imgs = imgsOf(car.el);
  imgs[0].dispatch('load');
  imgs[1].dispatch('load');
  imgs[2].dispatch('error');
  assert.equal(calls.at(-1), false, 'the failure reported the fallback');
  imgs[2].dispatch('load');
  car.layout();
  assert.equal(calls.at(-1), false, 'dead records never flip the ring back to ready');
  assert.equal(car.modelsReady, false);
  assert.equal(imgsOf(car.el).length, 0, 'dead shells stay removed');
  car.dispose();
});

test('the front label stays clear of the route strip; generic yards keep their centreline', () => {
  const env = makeEnv();
  const route = env.doc.createElement('div');
  route.classList.add('sf-ng-route');
  route._rect = { left: 500, top: 780, width: 640, height: 90 };
  env.host.appendChild(route);
  const car = makeCarousel(env);
  const g = car.geometry;
  assert.ok(g.cy + g.ry + 14 + 40 + 16 <= route._rect.top, 'the front label bottom clears the route top');
  car.dispose();
  const env2 = makeEnv();
  const route2 = env2.doc.createElement('div');
  route2.classList.add('sf-ng-route');
  route2._rect = { left: 500, top: 780, width: 640, height: 90 };
  env2.host.appendChild(route2);
  const car2 = createYardCarousel({ row: env2.row, host: env2.host, anchor: env2.anchor, hero: '.orr-ng-hero-box' });
  const expectedCy = Math.min(HERO_RECT.top + HERO_RECT.height + 4, HOST_RECT.height - Math.min(HERO_RECT.width * 0.42, 420) * 0.2 - 96);
  assert.ok(Math.abs(car2.geometry.cy - expectedCy) < 0.5, 'the generic yard keeps its original centreline');
  car2.dispose();
});

test('an empty row emits no nonfinite turn indices', () => {
  const env = makeEnv(0);
  const turns = [];
  const car = makeCarousel(env, { onTurn: (a, b, f) => turns.push([a, b, f]) });
  car.layout();
  car.update();
  assert.ok(turns.every(([a, b, f]) => Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(f)), 'no NaN turn emission without items');
  car.dispose();
});
