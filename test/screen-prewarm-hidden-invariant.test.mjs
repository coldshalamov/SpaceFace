import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createScreenManager } from '../src/ui/screenManager.js';
function installDom() {
  const elements = new Map();
  class FakeClassList {
    constructor() { this.values = new Set(); }
    add(...v) { v.forEach((x) => this.values.add(x)); }
    remove(...v) { v.forEach((x) => this.values.delete(x)); }
    toggle(v, force) {
      if (force === undefined) force = !this.values.has(v);
      if (force) this.values.add(v); else this.values.delete(v);
      return force;
    }
    contains(v) { return this.values.has(v); }
  }
  class FakeElement {
    constructor(tag = 'div') {
      this.tagName = String(tag).toUpperCase();
      this.children = [];
      this.childNodes = this.children;
      this.parentNode = null;
      this.style = { setProperty(name, value, priority) { this[name] = value; this[name + 'Priority'] = priority; }, removeProperty(name) { delete this[name]; delete this[name + 'Priority']; }, getPropertyPriority(name) { return this[name + 'Priority'] || ''; } };
      this.dataset = {};
      this.classList = new FakeClassList();
      this.attributes = new Map();
      this.inert = false;
    }
    set className(v) {
      this._className = String(v || '');
      this.classList.values = new Set(this._className.split(/\s+/).filter(Boolean));
    }
    get className() { return this._className; }
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
    removeChild(c) {
      const i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      c.parentNode = null;
      return c;
    }
    setAttribute(n, v) { this.attributes.set(n, String(v)); }
    getAttribute(n) { return this.attributes.get(n) ?? null; }
    removeAttribute(n) { this.attributes.delete(n); }
    addEventListener() {}
    removeEventListener() {}
    querySelectorAll() { return []; }
    querySelector() { return null; }
    contains(node) { for (let n = node; n; n = n.parentNode) if (n === this) return true; return false; }
    focus() {}
  }
  const body = new FakeElement('body');
  const screens = new FakeElement('div');
  const backdrop = new FakeElement('div');
  const hud = new FakeElement('div');
  elements.set('screens', screens);
  elements.set('modal-backdrop', backdrop);
  elements.set('hud', hud);
  body.appendChild(screens); body.appendChild(backdrop); body.appendChild(hud);
  const rafQueue = [];
  globalThis.document = {
    body,
    documentElement: body,
    activeElement: null,
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => new FakeElement(tag),
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = { innerWidth: 1920, innerHeight: 1080, addEventListener() {}, removeEventListener() {} };
  globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
  globalThis.cancelAnimationFrame = () => {};
  return {
    screens,
    runRaf() { const q = rafQueue.splice(0); for (const cb of q) cb(0); },
  };
}



function setup() {
  const dom = installDom();
  const state = { mode: 'menu', ui: { screenStack: ['newGame'] } };
  const manager = createScreenManager({ state, bus: { on() { return () => {}; }, emit() {} },
    timeEffects: { clear() {}, set() {} }, screenMemory: { read() { return null; }, set() {} } });
  manager.register({ id: 'crucible', mount(el) {
    el.classList.add('k-screen');
    el.setAttribute('aria-modal', 'true');
    // Screen mounts may set layout directly; stylesheet !important rules require an
    // important hide even when the mount leaves the initial inline display untouched.
    el.style.display = 'grid';
  } });
  return { dom, state, manager };
}

test('inactive prewarm is importantly hidden before any paintWarm or yielded frame', () => {
  const { manager, dom } = setup();
  const rec = manager.prewarm('crucible');
  assert.equal(rec.el.style.display, 'none');
  assert.equal(rec.el.style.getPropertyPriority('display'), 'important');
  assert.equal(rec.el.getAttribute('aria-modal'), null);
  assert.equal(rec.el.getAttribute('aria-hidden'), 'true');
  assert.equal(rec.el.inert, true);
  dom.runRaf();
  assert.equal(rec.el.style.display, 'none');
  manager.paintWarm('crucible');
  assert.equal(rec.el.style.display, 'none');
  assert.equal(rec.el.style.getPropertyPriority('display'), 'important');
  assert.equal(rec.el.style.visibility, '');
});

test('navigation reveals the cached screen; paintWarm cannot hide the active owner', () => {
  const { manager, state } = setup();
  const rec = manager.prewarm('crucible');
  state.ui.screenStack.push('crucible');
  manager.syncVisibility();
  manager.paintWarm('crucible');
  assert.equal(rec.el.style.display, 'grid');
  assert.equal(rec.el.style.getPropertyPriority('display'), '');
  assert.equal(rec.el.inert, false);
  assert.equal(rec.el.getAttribute('aria-modal'), 'true');
  state.ui.screenStack.pop();
  manager.syncVisibility();
  assert.equal(rec.el.style.display, 'none');
  assert.equal(rec.el.style.getPropertyPriority('display'), 'important');
  assert.equal(rec.el.inert, true);
});

test('mount which is already the active owner is not forcibly hidden', () => {
  const { manager, state } = setup();
  state.ui.screenStack.push('crucible');
  const rec = manager.prewarm('crucible');
  assert.equal(rec.el.style.display, 'grid');
  assert.equal(rec.el.getAttribute('aria-modal'), 'true');
});

test('a plain-style fixture keeps the fallback hide behavior', () => {
  const { manager } = setup();
  manager.register({ id: 'plain', mount(el) { el.style = { display: 'grid' }; } });
  assert.equal(manager.prewarm('plain').el.style.display, 'none');
});

test('stylesheet-only mounts gain important hiding without changing inline display', () => {
  const { manager } = setup();
  manager.register({ id: 'stylesheet', mount(el) { el.classList.add('k-screen'); } });
  const rec = manager.prewarm('stylesheet');
  assert.equal(rec.el.style.display, 'none');
  assert.equal(rec.el.style.getPropertyPriority('display'), 'important',
    'plain inline none cannot defeat a screen layout stylesheet display:grid !important');
});
