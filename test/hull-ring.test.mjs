// The hull ring (src/ui/orrery/hullRing.js) draws the chosen hull's numbers round its render. It is
// repainted on every frame of a hull spin (the yard reports each in-between reading), so the contract
// here is cost, not looks: the SVG elements are made once, a paint only rewrites their values, and the
// two boxes it measures are read once and re-read only when the layout moved. The picture itself must
// not change, so the paint is also held against a verbatim copy of the previous drawing routine.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createHullRing } from '../src/ui/orrery/hullRing.js';

class FakeNode {
  constructor(tag, doc) {
    this.tagName = tag;
    this.ownerDocument = doc;
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.style = {};
    this.data = '';
    this.reads = 0;
    this._rect = { left: 0, top: 0, width: 0, height: 0 };
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return Object.hasOwn(this.attributes, k) ? this.attributes[k] : null; }
  removeAttribute(k) { delete this.attributes[k]; }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; }
  append(...kids) { kids.forEach((k) => this.appendChild(k)); }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  get textContent() { return this.children.filter((c) => c.tagName === '#text').map((c) => c.data).join(''); }
  // like the real DOM: assigning text replaces every child with one fresh text node
  set textContent(v) {
    for (const c of this.children) c.parentNode = null;
    this.children = [];
    if (String(v) !== '') this.appendChild(this.ownerDocument.createTextNode(String(v)));
  }
  getBoundingClientRect() {
    this.reads += 1;
    return { ...this._rect, right: this._rect.left + this._rect.width, bottom: this._rect.top + this._rect.height };
  }
}

function makeDoc() {
  const doc = { made: 0, head: null, body: null };
  doc.createElement = (tag) => { doc.made += 1; return new FakeNode(tag, doc); };
  doc.createElementNS = (_ns, tag) => { doc.made += 1; return new FakeNode(tag, doc); };
  doc.createTextNode = (s) => { doc.made += 1; const n = new FakeNode('#text', doc); n.data = String(s); return n; };
  doc.getElementById = () => null;
  doc.head = new FakeNode('head', doc);
  doc.body = new FakeNode('body', doc);
  return doc;
}

const HOST = { left: 100, top: 40, width: 640, height: 420 };
const ANCHOR = { left: 240, top: 110, width: 360, height: 220 };

function makeEnv() {
  const doc = makeDoc();
  globalThis.document = doc;
  const host = new FakeNode('div', doc);
  host._rect = { ...HOST };
  const anchor = new FakeNode('div', doc);
  anchor._rect = { ...ANCHOR };
  doc.body.append(host, anchor);
  return { doc, host, anchor };
}

const reads = (env) => env.host.reads + env.anchor.reads;

function statsFor(t) {
  const ghosts = [0.2, 0.55, 1];
  return [
    { name: 'Mass', unit: 't', reading: String(10 + Math.round(t * 30)), frac: 0.25 + 0.5 * t, ghosts },
    { name: 'Thrust', unit: '', reading: String(Math.round(1200 + t * 800)), frac: 0.4 + 0.3 * t, ghosts },
    { name: 'Line', unit: 'wu/s', reading: t > 0.5 ? '1.2k' : '980', frac: t > 0.9 ? 0 : 0.6 - 0.2 * t, ghosts: [] },
  ];
}

// ---- the previous drawing routine, verbatim, producing a plain description instead of nodes ----
const SEGMENTS = [
  { from: 238, to: 302, side: 'left' },
  { from: 328, to: 392, side: 'top' },
  { from: 58, to: 122, side: 'right' },
];
function referencePicture(stats, hb, ab) {
  const out = [];
  const f = (n) => Math.round(n * 10) / 10;
  const cx = ab.left - hb.left + ab.width / 2;
  const cy = ab.top - hb.top + ab.height / 2;
  const rx = ab.width / 2 + 6;
  const ry = ab.height / 2 + 6;
  const pt = (deg, k = 0) => { const t = (deg * Math.PI) / 180; return [cx + (rx + k) * Math.sin(t), cy - (ry + k) * Math.cos(t)]; };
  const arc = (d0, d1, k = 0) => {
    const n = Math.max(2, Math.ceil(Math.abs(d1 - d0) / 2));
    const pts = [];
    for (let i = 0; i <= n; i += 1) { const [x, y] = pt(d0 + ((d1 - d0) * i) / n, k); pts.push(`${f(x)} ${f(y)}`); }
    return `M ${pts.join(' L ')}`;
  };
  const radial = (deg, k0, k1) => { const [x0, y0] = pt(deg, k0); const [x1, y1] = pt(deg, k1); return `M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)}`; };
  stats.slice(0, SEGMENTS.length).forEach((s, i) => {
    const seg = SEGMENTS[i];
    const span = seg.to - seg.from;
    const frac = Math.max(0, Math.min(1, Number(s.frac) || 0));
    const ticks = [];
    for (let d = seg.from + 4; d < seg.to - 1; d += 4) ticks.push(radial(d, 6, (d - seg.from) % 16 === 0 ? 12 : 9));
    out.push({ tag: 'path', attrs: { d: arc(seg.from, seg.to), class: 'orr-band' } });
    out.push({ tag: 'path', attrs: { d: arc(seg.from, seg.to), class: 'orr-edge' } });
    out.push({ tag: 'path', attrs: { d: ticks.join(' '), class: 'orr-tick' } });
    out.push({ tag: 'path', attrs: { d: `${radial(seg.from, -7, 12)} ${radial(seg.to, -7, 12)}`, class: 'orr-tick orr-tick--major' } });
    if (frac > 0) {
      const d = arc(seg.from, seg.from + span * frac);
      out.push({ tag: 'path', attrs: { d, class: 'orr-lit-bloom' } });
      out.push({ tag: 'path', attrs: { d, class: 'orr-lit' } });
      const [bx, by] = pt(seg.from + span * frac);
      out.push({ tag: 'circle', attrs: { cx: String(f(bx)), cy: String(f(by)), r: '9', class: 'orr-bead-bloom' } });
      out.push({ tag: 'circle', attrs: { cx: String(f(bx)), cy: String(f(by)), r: '4.5', class: 'orr-bead' } });
    }
    const ghost = (s.ghosts || []).map((g) => radial(seg.from + span * Math.max(0, Math.min(1, g)), -8, 4)).join(' ');
    if (ghost) out.push({ tag: 'path', attrs: { d: ghost, class: 'orr-hullring__ghost' } });
    const mid = (seg.from + seg.to) / 2;
    const num = { tag: 'text', attrs: { class: 'orr-hullring__num' }, text: String(s.reading), unit: s.unit ? String(s.unit) : undefined };
    const label = { tag: 'text', attrs: { class: 'orr-hullring__label' }, text: String(s.name).toUpperCase(), unit: undefined };
    if (seg.side === 'top') {
      const [x, y] = pt(mid % 360, 18);
      Object.assign(num.attrs, { x: String(f(x)), y: String(f(y)), 'text-anchor': 'middle' });
      Object.assign(label.attrs, { x: String(f(x)), y: String(f(y - 30)), 'text-anchor': 'middle' });
    } else {
      const [x, y] = pt(mid, 20);
      const anchorSide = seg.side === 'left' ? 'end' : 'start';
      Object.assign(num.attrs, { x: String(f(x)), y: String(f(y + 6)), 'text-anchor': anchorSide });
      Object.assign(label.attrs, { x: String(f(x)), y: String(f(y + 24)), 'text-anchor': anchorSide });
    }
    out.push(num, label);
  });
  return out;
}

// what the player can see in the layer, in paint order (a node set to display:none draws nothing)
function visiblePicture(layer) {
  const out = [];
  for (const node of layer.children) {
    if (node.getAttribute('display') === 'none') continue;
    const attrs = { ...node.attributes };
    delete attrs.display;
    if (node.tagName === 'text') {
      const own = node.children.filter((c) => c.tagName === '#text').map((c) => c.data).join('');
      const span = node.children.find((c) => c.tagName === 'tspan' && c.getAttribute('display') !== 'none');
      out.push({ tag: 'text', attrs, text: own, unit: span ? span.textContent : undefined });
    } else {
      out.push({ tag: node.tagName, attrs });
    }
  }
  return out;
}

function descendants(node, out = []) {
  for (const c of node.children) { out.push(c); descendants(c, out); }
  return out;
}

test('the ring draws the same picture as before, element for element', () => {
  const env = makeEnv();
  const ring = createHullRing({ host: env.host, anchor: env.anchor });
  const layer = env.host.children[0];
  for (const t of [0, 0.3, 0.75, 1]) {
    const stats = statsFor(t);
    ring.paint(stats);
    assert.deepEqual(visiblePicture(layer), referencePicture(stats, HOST, ANCHOR), `t=${t}`);
  }
  assert.equal(layer.getAttribute('viewBox'), `0 0 ${HOST.width} ${HOST.height}`);
  ring.dispose();
});

test('a fully empty reading (no fill, no unit, no ghosts) draws nothing it should not', () => {
  const env = makeEnv();
  const ring = createHullRing({ host: env.host, anchor: env.anchor });
  const layer = env.host.children[0];
  const lit = statsFor(0.4);
  ring.paint(lit);
  const bare = [
    { name: 'Mass', unit: '', reading: '0', frac: 0, ghosts: [] },
    { name: 'Thrust', unit: '', reading: '0', frac: 0 },
    { name: 'Line', unit: '', reading: '0', frac: 'nope', ghosts: null },
  ];
  ring.paint(bare);
  assert.deepEqual(visiblePicture(layer), referencePicture(bare, HOST, ANCHOR), 'a bar that emptied hides its lit arc, beads, ghosts and unit');
  ring.paint(lit);
  assert.deepEqual(visiblePicture(layer), referencePicture(lit, HOST, ANCHOR), 'and shows them again when the reading returns');
  ring.dispose();
});

test('a spin paints without making a single new element and without re-reading either box', () => {
  const env = makeEnv();
  const ring = createHullRing({ host: env.host, anchor: env.anchor });
  const layer = env.host.children[0];
  ring.paint(statsFor(0));
  const first = descendants(layer);
  assert.ok(first.length >= 30, 'the ring is a real instrument, not an empty shell');
  const madeAfterFirst = env.doc.made;
  const readsAfterFirst = reads(env);
  assert.ok(readsAfterFirst <= 2, `the first paint measures the two boxes once (${readsAfterFirst})`);
  for (let i = 1; i <= 60; i += 1) ring.paint(statsFor(i / 60));
  assert.equal(env.doc.made, madeAfterFirst, 'no element or text node is made by any paint of the spin');
  assert.equal(reads(env), readsAfterFirst, 'no paint of the spin reads a layout box');
  const last = descendants(layer);
  assert.equal(last.length, first.length, 'the node count is constant across paints');
  assert.ok(last.every((n, i) => n === first[i]), 'the very same nodes carry every paint');
  ring.dispose();
});

test('layout() re-reads once and moves the ring with the render', () => {
  const env = makeEnv();
  const ring = createHullRing({ host: env.host, anchor: env.anchor });
  const layer = env.host.children[0];
  const stats = statsFor(0.5);
  ring.paint(stats);
  const before = reads(env);
  env.anchor._rect = { left: 300, top: 90, width: 300, height: 260 };
  ring.layout();
  ring.layout();
  assert.ok(reads(env) - before <= 4, 'a relayout reads the two boxes, not once per paint');
  assert.deepEqual(visiblePicture(layer), referencePicture(stats, HOST, env.anchor._rect), 'the ring follows the moved render');
  const settled = reads(env);
  for (let i = 0; i < 30; i += 1) ring.paint(statsFor(i / 30));
  assert.equal(reads(env), settled, 'painting after a relayout stays free of reads');
  ring.dispose();
});

test('a box that was not laid out yet is measured again on the next paint, not drawn at zero', () => {
  const env = makeEnv();
  env.host._rect = { left: 0, top: 0, width: 0, height: 0 };
  const ring = createHullRing({ host: env.host, anchor: env.anchor });
  const layer = env.host.children[0];
  ring.paint(statsFor(0.2));
  assert.equal(visiblePicture(layer).length, 0, 'nothing is drawn into an unmeasured box');
  env.host._rect = { ...HOST };
  ring.paint(statsFor(0.2));
  assert.deepEqual(visiblePicture(layer), referencePicture(statsFor(0.2), HOST, ANCHOR), 'it draws as soon as the box exists');
  ring.dispose();
});

test('the resize observer is the only other thing that re-reads the boxes', () => {
  const prev = globalThis.ResizeObserver;
  const observers = [];
  globalThis.ResizeObserver = class {
    constructor(cb) { this.cb = cb; this.targets = []; this.live = true; observers.push(this); }
    observe(t) { this.targets.push(t); }
    disconnect() { this.live = false; }
  };
  try {
    const env = makeEnv();
    const ring = createHullRing({ host: env.host, anchor: env.anchor });
    const layer = env.host.children[0];
    const ro = observers[0];
    assert.deepEqual(ro.targets, [env.host, env.anchor], 'it watches the layer and the render it surrounds');
    const stats = statsFor(0.6);
    ring.paint(stats);
    env.host._rect = { ...HOST, width: 800, height: 500 };
    ro.cb([]);
    assert.deepEqual(visiblePicture(layer), referencePicture(stats, env.host._rect, ANCHOR), 'a resize redraws at the new size');
    ring.dispose();
    assert.equal(ro.live, false, 'dispose disconnects the observer');
    assert.equal(env.host.children.length, 0, 'dispose takes the layer out');
  } finally {
    globalThis.ResizeObserver = prev;
  }
});

test('a layout() with frames available waits for the frame and coalesces; dispose cancels it', () => {
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCaf = globalThis.cancelAnimationFrame;
  const queue = [];
  globalThis.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
  globalThis.cancelAnimationFrame = () => {};
  try {
    const env = makeEnv();
    const ring = createHullRing({ host: env.host, anchor: env.anchor });
    const layer = env.host.children[0];
    ring.paint(statsFor(0.3));
    const before = reads(env);
    env.anchor._rect = { left: 260, top: 100, width: 320, height: 240 };
    ring.layout();
    ring.layout();
    ring.layout();
    assert.equal(reads(env), before, 'a layout request reads nothing inside the caller\'s write');
    assert.equal(queue.length, 1, 'three requests share one frame');
    queue.splice(0).forEach((cb) => cb(16));
    assert.equal(reads(env) - before, 2, 'the frame measures both boxes once');
    assert.deepEqual(visiblePicture(layer), referencePicture(statsFor(0.3), HOST, env.anchor._rect));
    ring.layout();
    ring.dispose();
    const made = env.doc.made;
    queue.splice(0).forEach((cb) => cb(32));
    assert.equal(env.doc.made, made, 'a frame that lands after dispose draws nothing');
  } finally {
    globalThis.requestAnimationFrame = prevRaf;
    globalThis.cancelAnimationFrame = prevCaf;
  }
});

test('without a document or a measurable anchor the ring is an inert no-op', () => {
  const dead = createHullRing({});
  assert.doesNotThrow(() => { dead.paint([]); dead.layout(); dead.dispose(); });
  const doc = makeDoc();
  const bare = createHullRing({ host: new FakeNode('div', doc), anchor: {} });
  assert.doesNotThrow(() => { bare.paint(statsFor(0)); bare.layout(); bare.dispose(); });
});
