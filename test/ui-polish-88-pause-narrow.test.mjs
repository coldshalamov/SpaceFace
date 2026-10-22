// Review #499 — pause in a narrow desktop window (≤760 wide) takes the column, and follows a resize
// across 760 in both directions instead of keeping the composition it was mounted with.
import assert from 'node:assert/strict';
import test from 'node:test';

import { pauseScreen } from '../src/ui/screens/pause.js';
import { spatialFocusTarget } from '../src/ui/input.js';

function installMiniDom({ desktop = true, width = 1280 } = {}) {
  const previous = { document: globalThis.document, window: globalThis.window, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame, matchMedia: globalThis.matchMedia };
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
    contains(node) { for (let n = node; n; n = n.parentElement) if (n === this) return true; return false; }
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
  globalThis.cancelAnimationFrame = () => {};
  const watchers = new Set();
  globalThis.matchMedia = (query) => ({ get matches() { return /max-width:760px/.test(query) && globalThis.window.innerWidth <= 760; },
    addEventListener(type, fn) { if (type === 'change') watchers.add(fn); }, removeEventListener(type, fn) { watchers.delete(fn); } });
  return { watchers, resize(w) { const was = globalThis.window.innerWidth <= 760; globalThis.window.innerWidth = w; if ((w <= 760) !== was) for (const fn of [...watchers]) fn({ matches: w <= 760 }); }, restore() { globalThis.document = previous.document; globalThis.window = previous.window; globalThis.requestAnimationFrame = previous.requestAnimationFrame; globalThis.cancelAnimationFrame = previous.cancelAnimationFrame; globalThis.matchMedia = previous.matchMedia; } };
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

// ---- review #499 follow-ups (ui-polish-91) ----

const verbs = (root) => root.querySelectorAll('button').filter((b) => b.getAttribute('data-action') != null);
const focusedAction = () => { const a = globalThis.document.activeElement; return a && a.getAttribute ? a.getAttribute('data-action') : null; };

// Lay the column out as it reads: a verb owns its row unless it banks, and a banked run shares rows
// in its group. Rects are what the pad's spatial focus walks (src/ui/input.js moveFocus).
function layColumn(root) {
  let y = 0; let x = 0; let lastGroup = null; let lastBank = false;
  for (const button of verbs(root)) {
    const li = button.parentElement;
    const group = li && li.dataset ? li.dataset.group : null;
    const bank = !!(li && li.dataset && li.dataset.bank);
    if (bank && lastBank && group === lastGroup) x += 140; else { y += 44; x = 24; }
    const rect = { left: x, top: y, right: x + 120, bottom: y + 32, width: 120, height: 32 };
    button.getBoundingClientRect = () => rect;
    lastGroup = group; lastBank = bank;
  }
}

test('gamepad in the column at 700: the d-pad walks every verb from Resume and back, no hidden category level', () => {
  const dom = installMiniDom({ width: 700 });
  try {
    const root = globalThis.document.createElement('div');
    pauseScreen.mount(root, makeCtx());
    assert.ok(column(root));
    layColumn(root);
    const all = verbs(root);
    assert.ok(all.length >= 8, 'the column carries the whole verb list');
    for (const b of all) assert.notEqual(b.getAttribute('aria-hidden'), 'true', `${b.getAttribute('data-action')} is pad-focusable`);
    const reached = new Set();
    let at = all.find((b) => b.textContent.startsWith('Resume'));
    assert.ok(at, 'Resume leads');
    reached.add(at);
    // down through the rows; along each banked row with right
    for (let guard = 0; guard < 64; guard++) {
      for (let r = spatialFocusTarget(all, at, 'right'); r; r = spatialFocusTarget(all, r, 'right')) reached.add(r);
      const next = spatialFocusTarget(all, at, 'down');
      if (!next) break;
      at = next; reached.add(at);
    }
    assert.equal(reached.size, all.length, 'every verb is reachable by d-pad in the column');
    // and up walks back to Resume
    for (let guard = 0; guard < 64; guard++) { const up = spatialFocusTarget(all, at, 'up'); if (!up) break; at = up; }
    assert.ok(at.textContent.startsWith('Resume'), 'up returns to Resume');
    assert.deepEqual(hints(root).slice(-1), ['Move'], 'the strip names the column\'s one level');
  } finally { dom.restore(); }
});

test('a resize across 760 keeps the focused verb, not Resume', () => {
  const dom = installMiniDom({ width: 1280 });
  try {
    const root = globalThis.document.createElement('div');
    pauseScreen.mount(root, makeCtx());
    const pick = verbs(root).find((b) => !b.textContent.startsWith('Resume') && b.getAttribute('aria-disabled') !== 'true');
    assert.ok(pick);
    const action = pick.getAttribute('data-action');
    pick.focus();
    dom.resize(700);
    assert.ok(column(root));
    assert.equal(focusedAction(), action, 'the same verb holds focus in the column');
    assert.notEqual(globalThis.document.activeElement, pick, 'on the rebuilt button, not the detached one');
    dom.resize(1280);
    assert.ok(dial(root));
    assert.equal(focusedAction(), action, 'and again back on the dial');
  } finally { dom.restore(); }
});

test('a resize with focus outside pause does not pull focus into it', () => {
  const dom = installMiniDom({ width: 1280 });
  try {
    const root = globalThis.document.createElement('div');
    pauseScreen.mount(root, makeCtx());
    globalThis.document.activeElement = globalThis.document.body;
    dom.resize(700);
    assert.ok(column(root));
    assert.equal(globalThis.document.activeElement, globalThis.document.body);
  } finally { dom.restore(); }
});

test('covered then shown: a crossing while another screen is over pause lands on the right composition', () => {
  const dom = installMiniDom({ width: 1280 });
  try {
    const root = globalThis.document.createElement('div');
    const ctx = makeCtx();
    pauseScreen.mount(root, ctx);
    assert.ok(dial(root));
    // covered (Settings over pause): the window narrows without a change event reaching pause
    globalThis.window.innerWidth = 700;
    assert.ok(dial(root), 'nothing rebuilt while covered and unnotified');
    pauseScreen.onShow(ctx);
    assert.ok(column(root), 'shown again at 700, pause rebuilds as the column');
    assert.ok(hints(root).includes('Move'));
    assert.equal(dom.watchers.size, 1, 'the show-time remount swaps the watcher');
    // covered again, this time the change event does arrive; show must not rebuild a second time
    dom.resize(1280);
    assert.ok(dial(root));
    const list = root.querySelector('.sf-pause-words');
    pauseScreen.onShow(ctx);
    assert.ok(dial(root));
    assert.equal(root.querySelector('.sf-pause-words'), list, 'no second rebuild on show');
  } finally { dom.restore(); }
});
