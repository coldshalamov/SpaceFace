// Review #499 — pause in a narrow desktop window (≤760 wide) takes the column, and follows a resize
// across 760 in both directions instead of keeping the composition it was mounted with.
import assert from 'node:assert/strict';
import test from 'node:test';

import { pauseScreen } from '../src/ui/screens/pause.js';

function installMiniDom({ desktop = true, width = 1280 } = {}) {
  const previous = { document: globalThis.document, window: globalThis.window, requestAnimationFrame: globalThis.requestAnimationFrame, matchMedia: globalThis.matchMedia };
  class Mini {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase(); this.children = []; this.parentElement = null;
      this.attributes = new Map(); this.listeners = new Map(); this._class = new Set(); this._text = '';
      this.hidden = false; this.tabIndex = 0; this.style = { setProperty() {}, removeProperty() {} };
      const owner = this;
      this.classList = { add(...names) { names.forEach((name) => name && owner._class.add(name)); }, remove(...names) { names.forEach((name) => owner._class.delete(name)); }, contains(name) { return owner._class.has(name); } };
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
  globalThis.window = { addEventListener() {}, removeEventListener() {}, innerWidth: width, innerHeight: 720 };
  // The desktop shell is what lets Quit Game act; the web build has none (test below).
  if (desktop) globalThis.window.spacefaceShell = { quit() {} };
  globalThis.requestAnimationFrame = (fn) => { fn(0); return 1; };
  const watchers = new Set();
  globalThis.matchMedia = (query) => ({ get matches() { return /max-width:760px/.test(query) && globalThis.window.innerWidth <= 760; },
    addEventListener(type, fn) { if (type === 'change') watchers.add(fn); }, removeEventListener(type, fn) { watchers.delete(fn); } });
  return { watchers, resize(w) { const was = globalThis.window.innerWidth <= 760; globalThis.window.innerWidth = w; if ((w <= 760) !== was) for (const fn of [...watchers]) fn({ matches: w <= 760 }); }, restore() { globalThis.document = previous.document; globalThis.window = previous.window; globalThis.requestAnimationFrame = previous.requestAnimationFrame; globalThis.matchMedia = previous.matchMedia; } };
}

const makeCtx = () => ({ state: { mode: 'paused', missions: { active: [] }, nav: {}, save: {}, meta: {}, ui: {}, run: { phase: 'inactive' } }, bus: { emit() {}, on() { return () => {}; } }, screenManager: { pushScreen() {}, popScreen() {}, hasScreen() { return true; } } });
const hints = (root) => root.querySelectorAll('.sf-pause-key-verb').map((node) => node.textContent);
const column = (root) => root.classList.contains('orr-pause--phone') && !root.classList.contains('orr-pause');
const dial = (root) => root.classList.contains('orr-pause') && !root.classList.contains('orr-pause--phone');

test('pause at 700 wide is the column, and its key strip does not promise a category level', () => {
  const dom = installMiniDom({ width: 700 });
  try {
    const root = globalThis.document.createElement('div');
    pauseScreen.mount(root, makeCtx());
    assert.ok(column(root), 'a 700-wide window takes the column');
    assert.ok(hints(root).includes('Move'));
    assert.ok(!hints(root).includes('Category') && !hints(root).includes('Item'), 'no ↑↓ CATEGORY / ←→ ITEM over a flat list');
    assert.ok(root.querySelectorAll('button').some((b) => b.textContent.startsWith('Resume')));
  } finally { dom.restore(); }
});

test('pause follows a resize across 760: 700 → 1280 → 700', () => {
  const dom = installMiniDom({ width: 700 });
  try {
    const root = globalThis.document.createElement('div');
    pauseScreen.mount(root, makeCtx());
    assert.ok(column(root));
    dom.resize(1280);
    assert.ok(dial(root), 'widening past 760 remounts on the dial');
    assert.deepEqual(hints(root).slice(-2), ['Category', 'Item']);
    dom.resize(1000); // no crossing: no remount churn
    assert.ok(dial(root));
    dom.resize(700);
    assert.ok(column(root), 'narrowing back under 760 remounts the column');
    assert.ok(hints(root).includes('Move'));
    assert.equal(dom.watchers.size, 1, 'each remount swaps its watcher, it does not stack them');
  } finally { dom.restore(); }
});

test('pause opened at 1280 then narrowed to 700 leaves the dial for the column', () => {
  const dom = installMiniDom({ width: 1280 });
  try {
    const root = globalThis.document.createElement('div');
    pauseScreen.mount(root, makeCtx());
    assert.ok(dial(root));
    dom.resize(700);
    assert.ok(column(root));
    assert.equal(root.querySelectorAll('.orr-brief').length, 0, 'the brief stays in the column, not a reading on the right');
  } finally { dom.restore(); }
});
