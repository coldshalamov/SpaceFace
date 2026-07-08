#!/usr/bin/env node
// check-ui-effects.mjs — contract lint for the command-deck effect layer (src/ui/effects/*).
//
// Enforces the dependency policy in design/revamp/COMMAND_DECK_EFFECTS_AND_GAMEPLAY_BIBLE.md §6:
//   1. every primitive imports in Node WITHOUT touching the DOM (import-before-DOM proof);
//   2. every primitive creates → renders → self-parks → disposes cleanly in a fake-DOM harness, with
//      NO requestAnimationFrame left pending after setActive(false) or dispose() (no idle rAF);
//   3. a reduced-motion path exists and never spins a free-running loop;
//   4. no backdrop-filter, no raw hex / rgb() / hsl() colour literals, no off-palette custom property;
//   5. deterministic only — no Math.random / performance.now / Date.now / new Date in the layer;
//   6. every module exposes setActive()/dispose(); every primitive is registered in EFFECTS; and the
//      EFFECT_CUES table stays within its declared max durations.
//
// Zero dependencies: a hand-rolled DOM (the check-ui-frame-sleep pattern) + a DEFERRED rAF whose
// pending callbacks live in a Set, so "no rAF after dispose" is directly assertable.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const EFFECTS_DIR = join(ROOT, 'src/ui/effects');
const INDEX_URL = new URL('../src/ui/effects/index.js', import.meta.url);
const UI_PRIMITIVES_URL = new URL('../src/ui/uiPrimitives.js', import.meta.url);

// ───────────────────────────────────────────────────────────────────────────
// 1. IMPORT-BEFORE-DOM — importing the layer must not throw with no document.
// ───────────────────────────────────────────────────────────────────────────
assert.equal(typeof globalThis.document, 'undefined', 'harness must start with no document installed');
const fx = await import(INDEX_URL);
assert.ok(Array.isArray(fx.EFFECTS) && fx.EFFECTS.length === 9, 'EFFECTS registry should list all 9 primitives');
assert.ok(Array.isArray(fx.EFFECT_CUES) && fx.EFFECT_CUES.length === 9, 'EFFECT_CUES should mirror EFFECTS');
assert.ok(Array.isArray(fx.EFFECT_TOKENS) && fx.EFFECT_TOKENS.length > 0, 'EFFECT_TOKENS allowlist should be exported');
const uiPrimitives = await import(UI_PRIMITIVES_URL);
assert.equal(typeof uiPrimitives.trace, 'function', 'uiPrimitives.trace should import without a document');
console.log('ok   import-before-DOM — the effect layer imports in Node without a document');

// ───────────────────────────────────────────────────────────────────────────
// Fake DOM + deferred rAF (installed AFTER the import-safety proof above).
// ───────────────────────────────────────────────────────────────────────────
const rafPending = new Map();
let rafSeq = 0;

function makeCtx() {
  const ctx = { __calls: 0, fillStyle: '', strokeStyle: '', globalAlpha: 1, font: '', textAlign: '', textBaseline: '', lineWidth: 1 };
  const noop = (name) => (() => { ctx.__calls++; ctx.__last = name; });
  for (const m of ['clearRect', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'beginPath', 'closePath',
    'moveTo', 'lineTo', 'arc', 'ellipse', 'rect', 'stroke', 'fill', 'save', 'restore', 'setTransform',
    'translate', 'rotate', 'scale', 'clip', 'setLineDash']) ctx[m] = noop(m);
  ctx.measureText = () => ({ width: 4 });
  ctx.createLinearGradient = () => ({ addColorStop() {} });
  ctx.createRadialGradient = () => ({ addColorStop() {} });
  return ctx;
}

class FakeStyle {
  constructor() { this._p = new Map(); }
  setProperty(k, v) { this._p.set(k, String(v)); }
  getPropertyValue(k) { return this._p.get(k) || ''; }
  removeProperty(k) { this._p.delete(k); }
}
class FakeClassList {
  constructor(el) { this.el = el; }
  _set() { return new Set(String(this.el.className || '').split(/\s+/).filter(Boolean)); }
  _write(s) { this.el.className = [...s].join(' '); }
  add(...n) { const s = this._set(); for (const x of n) s.add(x); this._write(s); }
  remove(...n) { const s = this._set(); for (const x of n) s.delete(x); this._write(s); }
  contains(n) { return this._set().has(n); }
  toggle(n, force) { const s = this._set(); const has = s.has(n); const on = force == null ? !has : !!force; if (on) s.add(n); else s.delete(n); this._write(s); return on; }
}
class FakeElement {
  constructor(tag, doc, ns) {
    this.tagName = String(tag || '').toUpperCase();
    this.ownerDocument = doc;
    this.namespaceURI = ns || null;
    this.children = [];
    this.parentNode = null;
    this.style = new FakeStyle();
    this.className = '';
    this.classList = new FakeClassList(this);
    this.attributes = new Map();
    this.listeners = [];
    this.textContent = '';
    this._id = '';
    this.width = 0; this.height = 0;
    this.clientWidth = 240; this.clientHeight = 150;
    if (this.tagName === 'CANVAS') this._ctx = makeCtx();
  }
  get id() { return this._id; }
  set id(v) { this._id = String(v); if (this.ownerDocument) this.ownerDocument._ids.set(this._id, this); }
  appendChild(c) { if (!c) return c; if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); if (c._id && this.ownerDocument) this.ownerDocument._ids.set(c._id, c); return c; }
  append(...cs) { for (const c of cs) this.appendChild(c); }
  insertBefore(c, ref) { const i = this.children.indexOf(ref); if (i < 0) return this.appendChild(c); if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.splice(i, 0, c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) { this.children.splice(i, 1); c.parentNode = null; } return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(k, v) {
    this.attributes.set(k, String(v));
    if (k === 'id') this.id = v;
    if (k === 'class') this.className = String(v);
  }
  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
  removeAttribute(k) { this.attributes.delete(k); }
  hasAttribute(k) { return this.attributes.has(k); }
  getContext() { return this._ctx || null; }
  getBoundingClientRect() { return { width: this.clientWidth, height: this.clientHeight, left: 0, top: 0, right: this.clientWidth, bottom: this.clientHeight }; }
  addEventListener(t, fn) { this.listeners.push({ t, fn }); }
  removeEventListener(t, fn) { this.listeners = this.listeners.filter((l) => !(l.t === t && l.fn === fn)); }
  focus() { this.ownerDocument._active = this; }
  // depth-first walk (harness helper, not a DOM API)
  _walk(cb) { cb(this); for (const c of this.children) c._walk(cb); }
}
class FakeDocument {
  constructor() { this._ids = new Map(); this.hidden = false; this.head = this.createElement('head'); this.body = this.createElement('body'); this.documentElement = this.createElement('html'); this.listeners = []; }
  createElement(tag) { return new FakeElement(tag, this); }
  createElementNS(ns, tag) { return new FakeElement(tag, this, ns); }
  getElementById(id) { return this._ids.get(id) || null; }
  addEventListener(t, fn) { this.listeners.push({ t, fn }); }
  removeEventListener(t, fn) { this.listeners = this.listeners.filter((l) => !(l.t === t && l.fn === fn)); }
  mount() { const el = this.createElement('div'); this.body.appendChild(el); return el; }
}

function installDom() {
  const document = new FakeDocument();
  globalThis.document = document;
  globalThis.window = {
    innerWidth: 1280, innerHeight: 720,
    getComputedStyle() { return { getPropertyValue() { return ''; } }; },
    matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {} }; },
  };
  globalThis.getComputedStyle = globalThis.window.getComputedStyle;
  globalThis.requestAnimationFrame = (fn) => { const id = ++rafSeq; rafPending.set(id, fn); return id; };
  globalThis.cancelAnimationFrame = (id) => { rafPending.delete(id); };
  return document;
}

// Drain pending rAF callbacks with an advancing fake clock. Hard-fails if a bounded window does not
// settle within the cap (a runaway/idle loop), instead of hanging CI.
function flush(maxSteps = 1000, dt = 16) {
  let ts = 0; let steps = 0;
  while (rafPending.size && steps < maxSteps) {
    ts += dt; steps++;
    const batch = [...rafPending.values()];
    rafPending.clear();
    for (const fn of batch) fn(ts);
  }
  if (rafPending.size) { rafPending.clear(); throw new Error(`rAF did not settle within ${maxSteps} frames — a bounded effect is free-running`); }
  return steps;
}

function hasAnimatingClass(rootEl) {
  let found = false;
  rootEl._walk((n) => { if (/\bis-flowing\b/.test(String(n.className || ''))) found = true; });
  return found;
}
function hasRoleHalo(rootEl, role) {
  let found = false;
  const re = new RegExp(`\\bsf-fx-tree__node-halo--${role}\\b[\\s\\S]*\\bis-active\\b|\\bis-active\\b[\\s\\S]*\\bsf-fx-tree__node-halo--${role}\\b`);
  rootEl._walk((n) => { if (re.test(String(n.className || ''))) found = true; });
  return found;
}
function subtreeNodeCount(rootEl) { let n = 0; rootEl._walk(() => n++); return n; }
function ctxCalls(handle) { return handle && handle.canvas && handle.canvas._ctx ? handle.canvas._ctx.__calls : 0; }

// Per-primitive drivers: how to trigger real output + which handle carries the mounted root.
const DRIVERS = {
  flickerGrid: { rAF: true, canvas: true, trigger: (h) => h.reveal({ resolveTo: (c, r) => (c + r) % 2, durationMs: 600 }), rootOf: (h) => h.canvas },
  rippleField: { rAF: true, canvas: false, trigger: (h) => h.ping(60, 60, { kind: 'scan' }), rootOf: (h) => h.svg },
  glyphMatrix: { rAF: true, canvas: true, trigger: (h) => h.resolve({ toText: 'ANOMALY-7', durationMs: 600 }), rootOf: (h) => h.canvas },
  hexPattern: { rAF: false, trigger: (h) => h.setCells([{ col: 0, row: 0, kind: 'good', intensity: 1 }, { col: 1, row: 0, kind: 'danger' }]), rootOf: (h) => h.svg },
  routeBeam: { rAF: false, trigger: (h) => h.setPath([{ x: 0, y: 0 }, { x: 120, y: 60 }], { active: true, kind: 'route' }), rootOf: (h) => h.svg, expectFlowing: true },
  circularGauge: { rAF: false, trigger: (h) => h.setValue(0.5, { kind: 'heat' }), rootOf: (h) => h.svg },
  dockRail: { rAF: false, trigger: (h) => { h.setItems([{ id: 'refuel', label: 'Refuel', icon: 'F', readiness: { state: 'good', label: 'OK' } }, { id: 'repair', label: 'Repair', icon: 'R' }]); h.setFocus('refuel'); }, rootOf: (h) => h.root },
  morphLabel: { rAF: false, trigger: (h) => { h.set('100'); h.set('120'); }, rootOf: (h) => h.root },
  supplyTree: { rAF: false, trigger: (h) => h.setNodes([{ id: 'mining', label: 'Mining', role: 'produce', flow: true }, { id: 'hub', label: 'Iron Ore', role: 'hub' }, { id: 'refinery', label: 'Refinery', role: 'consume' }]), rootOf: (h) => h.svg },
};

// ───────────────────────────────────────────────────────────────────────────
// 2. CREATE → RENDER → SELF-PARK → DISPOSE (no idle rAF), per primitive.
// ───────────────────────────────────────────────────────────────────────────
for (const { name, create, cue } of fx.EFFECTS) {
  installDom();
  const drv = DRIVERS[name];
  assert.ok(drv, `${name}: driver config missing (a new primitive must be added to the check)`);
  const mount = document.mount();
  const h = create(mount, { width: 200, height: 140, seed: 7 });

  assert.equal(typeof h.setActive, 'function', `${name}: must expose setActive()`);
  assert.equal(typeof h.dispose, 'function', `${name}: must expose dispose()`);
  assert.ok(subtreeNodeCount(mount) > 1, `${name}: must mount a root element (observable output)`);
  assert.equal(h.cue && h.cue.effect, name, `${name}: handle should carry its cue`);

  drv.trigger(h);

  if (name === 'supplyTree') {
    const rootEl = drv.rootOf(h);
    assert.ok(hasRoleHalo(rootEl, 'produce'), 'supplyTree: active producer halo should carry a reachable role class');
    assert.ok(hasRoleHalo(rootEl, 'consume'), 'supplyTree: active consumer halo should carry a reachable role class');
  }

  if (drv.rAF) {
    assert.ok(rafPending.size > 0, `${name}: a bounded animation should schedule at least one frame`);
    // capture mid-flight evidence BEFORE the window settles (SVG ripples are removed once faded)
    const midNodes = subtreeNodeCount(drv.rootOf(h));
    const steps = flush();
    assert.ok(steps > 0 && steps < 1000, `${name}: animation should settle in a bounded number of frames`);
    assert.equal(rafPending.size, 0, `${name}: must self-park (no rAF pending after its window ends)`);
    if (drv.canvas) assert.ok(ctxCalls(h) > 0, `${name}: canvas effect should draw at least once`);
    else assert.ok(midNodes > 1, `${name}: SVG effect should render a node during its window`);
  } else {
    assert.equal(rafPending.size, 0, `${name}: a CSS/static effect must not schedule rAF`);
    assert.ok(subtreeNodeCount(mount) > 1, `${name}: should render DOM/SVG output`);
  }

  if (drv.expectFlowing) assert.ok(hasAnimatingClass(drv.rootOf(h)), `${name}: active flow should carry .is-flowing`);

  // setActive(false) → park + drop any animating class.
  h.setActive(false);
  flush();
  assert.equal(rafPending.size, 0, `${name}: setActive(false) must leave no rAF pending`);
  assert.ok(!hasAnimatingClass(drv.rootOf(h)), `${name}: setActive(false) must remove animating classes (no motion at rest)`);

  // pauseWhenHidden (where present) must return an unsubscribe and not throw.
  if (typeof h.pauseWhenHidden === 'function') { const un = h.pauseWhenHidden(); assert.equal(typeof un, 'function', `${name}: pauseWhenHidden() should return an unsubscribe`); un(); }

  h.dispose();
  assert.equal(rafPending.size, 0, `${name}: dispose() must cancel all rAF`);
  assert.equal(subtreeNodeCount(mount), 1, `${name}: dispose() must remove its DOM from the mount`);
  console.log(`ok   ${name} — mounts, renders, self-parks, disposes clean`);
}

// ───────────────────────────────────────────────────────────────────────────
// 3. DISPOSE MID-FLIGHT — a running rAF effect must cancel its pending frame.
// ───────────────────────────────────────────────────────────────────────────
for (const { name, create } of fx.EFFECTS) {
  const drv = DRIVERS[name];
  if (!drv.rAF) continue;
  installDom();
  const mount = document.mount();
  const h = create(mount, { width: 200, height: 140, seed: 3 });
  drv.trigger(h);
  assert.ok(rafPending.size > 0, `${name}: should have a frame in flight before dispose`);
  h.dispose();
  assert.equal(rafPending.size, 0, `${name}: dispose() mid-flight must cancel the pending frame`);
}
console.log('ok   dispose mid-flight cancels pending rAF (flickerGrid / rippleField / glyphMatrix)');

// ───────────────────────────────────────────────────────────────────────────
// 4. REDUCED MOTION — a legible static path exists and never free-runs.
// ───────────────────────────────────────────────────────────────────────────
for (const { name, create } of fx.EFFECTS) {
  installDom();
  document.documentElement.classList.add('sf-reduce-motion');
  const drv = DRIVERS[name];
  const mount = document.mount();
  const h = create(mount, { width: 200, height: 140, seed: 5, motionReduce: true });
  drv.trigger(h);
  const steps = flush();               // must terminate (bounded) — flush hard-fails otherwise
  assert.equal(rafPending.size, 0, `${name}: reduced-motion must not leave a free-running rAF`);
  assert.ok(subtreeNodeCount(mount) > 1, `${name}: reduced-motion must still render a static state`);
  void steps;
  h.dispose();
}
console.log('ok   reduced-motion — every primitive degrades to a bounded, static, legible state');

// ───────────────────────────────────────────────────────────────────────────
// 5. UI PRIMITIVE HELPERS — shared DOM helpers obey their state contracts.
// ───────────────────────────────────────────────────────────────────────────
installDom();
{
  const panel = document.createElement('div');
  panel.className = 'sf-border-trace sf-border-trace--warn';
  uiPrimitives.trace(panel, 'good');
  assert.ok(panel.classList.contains('is-tracing'), 'trace(): should arm the one-shot animation class');
  assert.ok(panel.classList.contains('sf-border-trace--good'), 'trace(): should apply the requested tone');
  assert.ok(!panel.classList.contains('sf-border-trace--warn'), 'trace(): should remove a stale previous tone');
  uiPrimitives.trace(panel, 'danger');
  assert.ok(panel.classList.contains('sf-border-trace--danger'), 'trace(): should switch to a later requested tone');
  assert.ok(!panel.classList.contains('sf-border-trace--good'), 'trace(): should not retain an older tone after switching');
  uiPrimitives.trace(panel, 'mystery');
  assert.ok(!panel.classList.contains('sf-border-trace--good')
    && !panel.classList.contains('sf-border-trace--warn')
    && !panel.classList.contains('sf-border-trace--danger'), 'trace(): unknown tones should not leave stale tone classes');
}
console.log('ok   ui primitives — trace() restarts cleanly and never keeps stale tone classes');

// ───────────────────────────────────────────────────────────────────────────
// 6. SOURCE CONTRACTS — deps, hues, determinism, backdrop-filter, exports.
// ───────────────────────────────────────────────────────────────────────────
const files = readdirSync(EFFECTS_DIR).filter((f) => f.endsWith('.js'));
const FACTORY_FILES = files.filter((f) => f !== 'index.js' && f !== 'effectRuntime.js');
assert.equal(FACTORY_FILES.length, 9, 'there should be exactly 9 primitive modules');

const ALLOWED_TOKENS = new Set([...fx.EFFECT_TOKENS, '--ease', '--sp-2', '--r-2', '--dur', '--mono']);
const HEX = /#[0-9a-fA-F]{3,8}\b/;
// Guard against hyphenated identifiers (white-space, off-white, sf-lime-…) so only bare colour words
// (e.g. `color: red`) are flagged, not CSS property names that merely contain a colour word.
const NAMED_COLOR = /(?<!-)\b(?:red|green|blue|black|white|yellow|orange|purple|pink|cyan|magenta|gray|grey|silver|gold|navy|teal|lime|maroon)\b(?!-)/;

// Strip comments before the text bans so prose (which legitimately names "red", "Tailwind",
// "Math.random", etc. as documentation) cannot trip them. String/template CSS is preserved, and the
// [^:] guard keeps 'http://' URLs intact.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

for (const f of files) {
  const src = readFileSync(join(EFFECTS_DIR, f), 'utf8');
  const scan = stripComments(src);
  assert.ok(!/backdrop-filter/i.test(scan), `${f}: backdrop-filter is forbidden`);
  assert.ok(!HEX.test(scan), `${f}: raw hex colour literal is forbidden (palette tokens only)`);
  assert.ok(!/\brgba?\(/.test(scan) && !/\bhsla?\(/.test(scan), `${f}: rgb()/hsl() colour literals are forbidden (tokens/color-mix only)`);
  assert.ok(!NAMED_COLOR.test(scan), `${f}: named CSS colours are forbidden (palette tokens only)`);
  assert.ok(!/Math\.random\s*\(|performance\.now\s*\(|Date\.now\s*\(|new\s+Date\s*\(/.test(scan), `${f}: non-deterministic time/random source is forbidden in the effect layer`);
  assert.ok(!/from\s+['"]three['"]|from\s+['"]react['"]|tailwind/i.test(scan), `${f}: no framework/THREE dependency in the effect layer`);
  // Every REAL custom-property reference must be on the palette allowlist (or an internal --sf-fx-*
  // var). Match only var(--x) and quoted '--x' literals so BEM modifier classes (.foo--done) are not
  // mistaken for custom properties.
  const tokenRefs = new Set();
  let mm;
  const reVar = /var\(\s*(--[a-z0-9-]+)/g;
  while ((mm = reVar.exec(scan))) tokenRefs.add(mm[1]);
  const reStr = /['"](--[a-z0-9-]+)['"]/g;
  while ((mm = reStr.exec(scan))) tokenRefs.add(mm[1]);
  for (const t of tokenRefs) {
    if (t.startsWith('--sf-fx-')) continue;
    assert.ok(ALLOWED_TOKENS.has(t), `${f}: off-palette custom property ${t} (not in the effect token allowlist)`);
  }
}
for (const f of FACTORY_FILES) {
  const src = readFileSync(join(EFFECTS_DIR, f), 'utf8');
  assert.ok(/function\s+setActive|setActive\s*[(:]/.test(src) && /setActive/.test(src), `${f}: must define setActive()`);
  assert.ok(/function\s+dispose|dispose\s*[(:]/.test(src) && /dispose/.test(src), `${f}: must define dispose()`);
  assert.ok(/export const CUE\b/.test(src), `${f}: must export a CUE descriptor`);
}
console.log('ok   source contracts — no deps/hex/named-colour/backdrop-filter, deterministic, tokens on-palette');

// ───────────────────────────────────────────────────────────────────────────
// 7. CUE TABLE — every effect declares where/when it fires and stays in budget.
// ───────────────────────────────────────────────────────────────────────────
const MAX_BUDGET_MS = 700;
const seen = new Set();
for (const cue of fx.EFFECT_CUES) {
  assert.equal(typeof cue.effect, 'string', 'each cue needs an effect name');
  assert.ok(!seen.has(cue.effect), `duplicate cue for ${cue.effect}`);
  seen.add(cue.effect);
  assert.ok(Array.isArray(cue.screens) && cue.screens.length > 0, `${cue.effect}: cue must list allowed screens`);
  assert.ok(Array.isArray(cue.triggers) && cue.triggers.length > 0, `${cue.effect}: cue must list triggers`);
  if (cue.maxMs == null) assert.equal(cue.loop, true, `${cue.effect}: an unbounded cue must be an explicit active-gated loop`);
  else assert.ok(cue.maxMs > 0 && cue.maxMs <= MAX_BUDGET_MS, `${cue.effect}: maxMs ${cue.maxMs} out of budget`);
}
assert.equal(seen.size, 9, 'every registered effect should have a cue');
// registry ↔ files coverage: no orphan primitive module.
const REGISTERED = new Set(fx.EFFECTS.map((e) => e.name.toLowerCase()));
for (const f of FACTORY_FILES) {
  const base = f.replace(/\.js$/, '').toLowerCase();
  assert.ok(REGISTERED.has(base), `${f}: primitive is not registered in EFFECTS (orphan module)`);
}
console.log('ok   cue table — all 9 effects registered, budgeted, and file-backed');

console.log('UI effects checks OK — 9 command-deck primitives, no idle rAF, reduced-motion safe, tokens-only');
