// MOB-03: touch controls you can read.
// 1. Pause key gets the visible word MENU inside its box.
// 2. First-use captions appear for 2.5 s beside each control:
//    - GUN: Hold: fire · drag: aim
//    - TETHER: Tap: grab / cut · hold + slide: reel
//    - POWERS handle: Swipe in: pick a power
//    - the fly stick (first drag after ghost ring): Push to the ring: boost · hold still: brake
//    - DOCK: Tap: dock
// 3. Each caption shows once per player; remounting with saved config shows none.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MobileGestures } from '../src/systems/mobile/model.js';
import { mountMobileView } from '../src/systems/mobile/view.js';

const VOID = new Set(['input', 'meta', 'link', 'img', 'br', 'hr', 'circle', 'path', 'line', 'rect']);
const camel = s => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

class Elem {
  constructor(tag, doc) {
    this.tag = tag.toLowerCase();
    this.doc = doc;
    this.parent = null;
    this.children = [];
    this.attrs = {};
    this.dataset = {};
    this.style = {
      transform: '', width: '', height: '',
      setProperty(k, v) { this[k] = String(v); },
      getPropertyValue(k) { return this[k] || ''; },
      removeProperty(k) { delete this[k]; },
    };
    this._classes = new Set();
    const set = this._classes;
    this.classList = {
      add: (...c) => c.forEach(x => set.add(x)),
      remove: (...c) => c.forEach(x => set.delete(x)),
      contains: c => set.has(c),
    };
    this.listeners = [];
    this._text = '';
    this.hidden = false;
    this.captured = new Set();
    this.rect = { left: 0, top: 0, right: 100, bottom: 100 };
  }
  get id() { return this.attrs.id || ''; }
  set id(v) { this.attrs.id = v; }
  get textContent() { return this._text !== undefined && this._text !== '' ? this._text : this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); }
  get className() { return [...this._classes].join(' '); }
  set className(v) { this._classes = new Set(String(v).trim().split(/\s+/).filter(Boolean)); }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k === 'class') this.className = v;
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
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  for (let m; (m = re.exec(html));) {
    const [, closing, tag, attrs, selfClose, text] = m;
    if (text) {
      const top = stack[stack.length - 1];
      if (top) top._text = (top._text || '') + text;
      continue;
    }
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

function mount({ width = 390, height = 844, config = {} } = {}) {
  const clock = { now: 1000 };
  const win = {
    innerWidth: width, innerHeight: height, listeners: [], visualViewport: null, navigator: {},
    performance: { now: () => clock.now },
    requestAnimationFrame: fn => fn(), cancelAnimationFrame() {},
    setTimeout: (fn) => ({ id: 1, fn }), clearTimeout: () => {},
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
  doc.documentElement.dataset.sfMobile = '1';
  globalThis.document = doc;

  const state = {
    tick: 1, mode: 'flight', playerId: 1, paused: false, player: { alive: true },
    ui: { screenStack: [] }, input: {}, entities: new Map(),
    camera: { tilt: 60, zoom: 144 }, settings: { video: { fov: 50 } },
  };
  const model = new MobileGestures();
  const cfg = { ...config };
  const calls = { reset: [], activate: [] };
  const view = mountMobileView({
    state, model, win, doc, config: () => cfg,
    activate(act) { calls.activate.push(act); },
    reset(role) { calls.reset.push(role ?? null); },
    saveConfig(k, v) { cfg[k] = v; },
  });

  const q = s => view.root.querySelector(s);
  q('.mf-pause').rect = { left: 322, top: 10, right: 374, bottom: 62 };
  q('.mf-edge').rect = { left: 342, top: 406, right: 390, bottom: 538 };
  q('.mf-gun').rect = { left: 282, top: 670, right: 378, bottom: 766 };
  q('.mf-tether').rect = { left: 182, top: 748, right: 260, bottom: 826 };
  q('.mf-dock').rect = { left: 282, top: 580, right: 378, bottom: 630 };

  let t = 0;
  const send = (type, id, x, y, target) => win.dispatch(makeEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, timeStamp: (t += 16), target: target || canvas }));
  const finger = {
    down: (id, x, y, target) => send('pointerdown', id, x, y, target),
    move: (id, x, y, target) => send('pointermove', id, x, y, target),
    up: (id, x, y, target) => send('pointerup', id, x, y, target),
  };
  return { win, doc, canvas, state, model, view, q, finger, cfg, clock, calls, dispose() { view.destroy(); delete globalThis.document; } };
}

test('MOB-03: Pause key gets a visible MENU label under the glyph', () => {
  const w = mount();
  try {
    const pause = w.q('.mf-pause');
    assert.ok(pause, 'pause key must exist');
    const word = pause.querySelector('.mf-pause-word');
    assert.ok(word, 'pause key must contain .mf-pause-word');
    assert.equal(word.textContent.trim(), 'MENU', 'word must read MENU');
  } finally { w.dispose(); }
});

test('MOB-03: First-use captions appear for each control and show once per player', () => {
  const w = mount();
  try {
    const caption = w.q('.mf-caption');
    assert.ok(caption, 'caption seat must exist');
    assert.equal(caption.hidden, true, 'caption starts hidden before interaction');

    // 1. GUN: Hold: fire · drag: aim
    w.finger.down(1, 330, 718, w.q('.mf-gun'));
    assert.equal(caption.hidden, false, 'gun touch shows caption');
    assert.equal(caption.textContent, 'Hold: fire · drag: aim');
    w.finger.up(1, 330, 718, w.q('.mf-gun'));

    // Gun touch again: does not show again
    caption.hidden = true;
    w.finger.down(2, 330, 718, w.q('.mf-gun'));
    assert.equal(caption.hidden, true, 'gun caption does not show twice');
    w.finger.up(2, 330, 718, w.q('.mf-gun'));

    // 2. TETHER: Tap: grab / cut · hold + slide: reel
    w.finger.down(3, 221, 787, w.q('.mf-tether'));
    assert.equal(caption.hidden, false, 'tether touch shows caption');
    assert.equal(caption.textContent, 'Tap: grab / cut · hold + slide: reel');
    w.finger.up(3, 221, 787, w.q('.mf-tether'));

    // Tether touch again: does not show again
    caption.hidden = true;
    w.finger.down(4, 221, 787, w.q('.mf-tether'));
    assert.equal(caption.hidden, true, 'tether caption does not show twice');
    w.finger.up(4, 221, 787, w.q('.mf-tether'));

    // 3. POWERS handle: Swipe in: pick a power
    w.finger.down(5, 366, 470, w.q('.mf-edge'));
    assert.equal(caption.hidden, false, 'powers handle touch shows caption');
    assert.equal(caption.textContent, 'Swipe in: pick a power');
    w.finger.up(5, 366, 470, w.q('.mf-edge'));

    // Powers handle touch again: does not show again
    caption.hidden = true;
    w.finger.down(6, 366, 470, w.q('.mf-edge'));
    assert.equal(caption.hidden, true, 'powers caption does not show twice');
    w.finger.up(6, 366, 470, w.q('.mf-edge'));

    // 4. Fly stick (first drag after ghost ring): Push to the ring: boost · hold still: brake
    w.finger.down(7, 120, 600, w.canvas);
    // Touchdown arming stick does not show caption until drag begins:
    caption.hidden = true;
    w.finger.move(7, 150, 560, w.canvas);
    assert.equal(caption.hidden, false, 'first stick drag shows caption');
    assert.equal(caption.textContent, 'Push to the ring: boost · hold still: brake');
    w.finger.up(7, 150, 560, w.canvas);

    // Stick drag again: does not show again
    caption.hidden = true;
    w.finger.down(8, 120, 600, w.canvas);
    w.finger.move(8, 160, 550, w.canvas);
    assert.equal(caption.hidden, true, 'stick caption does not show twice');
    w.finger.up(8, 160, 550, w.canvas);

    // 5. DOCK: Tap: dock
    w.view.setDockReady(true);
    const dock = w.q('.mf-dock');
    w.finger.down(9, 330, 600, dock);
    dock.click();
    assert.equal(caption.hidden, false, 'dock touch shows caption');
    assert.equal(caption.textContent, 'Tap: dock');
    w.finger.up(9, 330, 600, dock);

    // Dock touch again: does not show again
    caption.hidden = true;
    w.finger.down(10, 330, 600, dock);
    dock.click();
    assert.equal(caption.hidden, true, 'dock caption does not show twice');
    w.finger.up(10, 330, 600, dock);

    // Verify taught config was saved
    assert.ok(w.cfg.taught, 'taught set saved into config');
    assert.ok(w.cfg.taught.has('gun') || w.cfg.taught.includes?.('gun'));
    assert.ok(w.cfg.taught.has('tether') || w.cfg.taught.includes?.('tether'));
    assert.ok(w.cfg.taught.has('powers') || w.cfg.taught.includes?.('powers'));
    assert.ok(w.cfg.taught.has('stick') || w.cfg.taught.includes?.('stick'));
    assert.ok(w.cfg.taught.has('dock') || w.cfg.taught.includes?.('dock'));
  } finally { w.dispose(); }
});

test('MOB-03: A remount with the saved config shows none of the captions', () => {
  const savedConfig = {
    layout: 'standard',
    scale: 1,
    taught: new Set(['gun', 'fire', 'tether', 'powers', 'wheel', 'stick', 'dock']),
  };
  const w = mount({ config: savedConfig });
  try {
    const caption = w.q('.mf-caption');
    assert.equal(caption.hidden, true, 'caption starts hidden');

    // Touch all controls
    w.finger.down(1, 330, 718, w.q('.mf-gun'));
    w.finger.up(1, 330, 718, w.q('.mf-gun'));
    assert.equal(caption.hidden, true, 'gun caption not shown on remount');

    w.finger.down(2, 221, 787, w.q('.mf-tether'));
    w.finger.up(2, 221, 787, w.q('.mf-tether'));
    assert.equal(caption.hidden, true, 'tether caption not shown on remount');

    w.finger.down(3, 366, 470, w.q('.mf-edge'));
    w.finger.up(3, 366, 470, w.q('.mf-edge'));
    assert.equal(caption.hidden, true, 'powers caption not shown on remount');

    w.finger.down(4, 120, 600, w.canvas);
    w.finger.move(4, 160, 550, w.canvas);
    w.finger.up(4, 160, 550, w.canvas);
    assert.equal(caption.hidden, true, 'stick caption not shown on remount');

    w.view.setDockReady(true);
    const dock = w.q('.mf-dock');
    w.finger.down(5, 330, 600, dock);
    dock.click();
    w.finger.up(5, 330, 600, dock);
    assert.equal(caption.hidden, true, 'dock caption not shown on remount');
  } finally { w.dispose(); }
});

test('MOB-03: Caption auto-hides after 2.5 s', () => {
  const w = mount();
  try {
    const caption = w.q('.mf-caption');
    w.finger.down(1, 330, 718, w.q('.mf-gun'));
    assert.equal(caption.hidden, false, 'caption is showing');
    w.finger.up(1, 330, 718, w.q('.mf-gun'));

    // Advance clock past 2.5 s:
    w.clock.now += 2600;
    w.view.render();
    assert.equal(caption.hidden, true, 'caption hides after 2.5 s');
  } finally { w.dispose(); }
});
