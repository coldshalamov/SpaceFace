// PRO-19 — the pause footer shows the active run seed beside the build mark.
import assert from 'node:assert/strict';
import test from 'node:test';

import { pauseScreen, pauseRunSeedLine, pauseRunSeedOf } from '../src/ui/screens/pause.js';

function installMiniDom() {
  const previous = { document: globalThis.document, window: globalThis.window, requestAnimationFrame: globalThis.requestAnimationFrame, matchMedia: globalThis.matchMedia };
  class Mini {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase(); this.children = []; this.parentElement = null;
      this.attributes = new Map(); this.listeners = new Map(); this._class = new Set(); this._text = '';
      this.hidden = false; this.tabIndex = 0; this.style = { setProperty() {}, removeProperty() {} };
      const owner = this;
      this.classList = { add(...names) { names.forEach((name) => name && owner._class.add(name)); }, remove(...names) { names.forEach((name) => name && owner._class.delete(name)); }, contains(name) { return owner._class.has(name); } };
      this.dataset = new Proxy(Object.create(null), { set(target, key, value) { target[key] = value; owner.attributes.set('data-' + String(key), String(value)); return true; }, deleteProperty(target, key) { delete target[key]; owner.attributes.delete('data-' + String(key)); return true; } });
    }
    get className() { return [...this._class].join(' '); }
    set className(value) { this._class.clear(); String(value || '').split(/\s+/).forEach((name) => name && this._class.add(name)); }
    get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join('') : this._text; }
    set textContent(value) { this._text = String(value ?? ''); this.children = []; }
    set innerHTML(value) { if (value === '') this.textContent = ''; }
    getAttribute(name) { return name === 'class' ? this.className : (this.attributes.get(name) ?? null); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'class') this.className = value; }
    removeAttribute(name) { this.attributes.delete(name); }
    appendChild(child) { if (child) { child.parentElement = this; this.children.push(child); } return child; }
    append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
    addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }
    removeEventListener() {}
    dispatch(type) { for (const listener of this.listeners.get(type) || []) listener({ target: this, type, preventDefault() {} }); }
    focus() { globalThis.document.activeElement = this; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) {
      const matches = (node) => {
        if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
        if (selector.startsWith('#')) return node.getAttribute('id') === selector.slice(1);
        if (selector.startsWith('[')) { const hit = selector.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/); return !!hit && (hit[2] == null ? node.getAttribute(hit[1]) != null : node.getAttribute(hit[1]) === hit[2]); }
        return node.tagName === selector.toUpperCase();
      };
      const result = [];
      const visit = (node) => { for (const child of node.children) { if (matches(child)) result.push(child); visit(child); } };
      visit(this); return result;
    }
  }
  const body = new Mini('body');
  globalThis.document = { body, documentElement: body, head: new Mini('head'), activeElement: body, createElement: (tag) => new Mini(tag), getElementById: () => null };
  globalThis.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 1280, innerHeight: 720 };
  globalThis.requestAnimationFrame = (fn) => { fn(0); return 1; };
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return { restore() { globalThis.document = previous.document; globalThis.window = previous.window; globalThis.requestAnimationFrame = previous.requestAnimationFrame; globalThis.matchMedia = previous.matchMedia; } };
}

function makeCtx(seed) {
  const pushes = [];
  return {
    pushes,
    ctx: {
      state: { mode: 'paused', missions: { active: [] }, nav: {}, save: {}, meta: { seed }, ui: {}, run: { phase: 'inactive' } },
      bus: { emit() {}, on() { return () => {}; } },
      screenManager: { pushScreen(id) { pushes.push(id); }, popScreen() {}, hasScreen() { return true; } },
    },
  };
}

function seedNode(root) {
  const found = root.querySelectorAll('[data-role="run-seed"]');
  return found[0] || null;
}

test('pauseRunSeedLine names only the session seed', () => {
  assert.equal(pauseRunSeedOf({ meta: { seed: 12345 } }), 12345);
  assert.equal(pauseRunSeedLine({ meta: { seed: 12345 } }), 'Seed 12345');
  assert.equal(pauseRunSeedLine({ meta: {} }), '', 'missing seed renders nothing, not a crash');
  assert.equal(pauseRunSeedLine(null), '', 'missing state renders nothing');
  assert.equal(pauseRunSeedLine({ meta: { seed: 0 } }), '', 'zero seed renders nothing');
});

test('pause footer carries the running session seed beside the build mark', () => {
  const dom = installMiniDom();
  try {
    const { ctx } = makeCtx(424242);
    const root = globalThis.document.createElement('div');
    pauseScreen.mount(root, ctx);

    const node = seedNode(root);
    assert.ok(node, 'footer has a run-seed span');
    assert.equal(node.textContent, ' · Seed 424242', 'seed sits beside the build mark on the same line');

    const versionLine = root.querySelectorAll('[data-role="version"]')[0];
    assert.ok(versionLine, 'build mark line is still mounted');
    assert.match(versionLine.textContent, /SpaceFace/, 'build mark still names the game');
    assert.match(versionLine.textContent, /424242/, 'seed shares the build-mark line');

    // No restyle: the footer keeps its authored classes.
    const foot = root.querySelectorAll('footer')[0];
    assert.ok(foot, 'footer element still mounted');
    assert.ok(foot.classList.contains('sf-pause-foot'), 'footer keeps sf-pause-foot');
    assert.ok(versionLine.classList.contains('dp-etch'), 'version line keeps its etched treatment');

    // No rng internals leak into the footer.
    const footText = foot.textContent.toLowerCase();
    for (const leaked of ['mulberry', 'draws', 'continuation', 'rng', 'state:']) {
      assert.doesNotMatch(footText, new RegExp(leaked), `footer must not expose ${leaked}`);
    }
  } finally {
    dom.restore();
    pauseScreen.onHide({ state: { mode: 'paused' }, bus: { emit() {} } });
  }
});

test('a new run shows a different seed in the pause footer', () => {
  const dom = installMiniDom();
  try {
    const first = makeCtx(111);
    const rootA = globalThis.document.createElement('div');
    pauseScreen.mount(rootA, first.ctx);
    const textA = seedNode(rootA).textContent;
    assert.equal(textA, ' · Seed 111');

    const second = makeCtx(999007);
    const rootB = globalThis.document.createElement('div');
    pauseScreen.mount(rootB, second.ctx);
    const textB = seedNode(rootB).textContent;
    assert.equal(textB, ' · Seed 999007');
    assert.notEqual(textB, textA, 'a new run carries its own seed, not the previous one');
    assert.doesNotMatch(textB, /111/, 'the old seed is gone from the new footer');
  } finally {
    dom.restore();
    pauseScreen.onHide({ state: { mode: 'paused' }, bus: { emit() {} } });
  }
});
