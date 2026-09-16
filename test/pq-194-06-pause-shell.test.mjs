// PQ-194.06 — Pause is an exposed interruption, not an eagerly-mounted HUD dimmer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { pauseScreen } from '../src/ui/screens/pause.js';

function installMiniDom() {
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
  globalThis.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 1280, innerHeight: 720 };
  globalThis.requestAnimationFrame = (fn) => { fn(0); return 1; };
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return { restore() { globalThis.document = previous.document; globalThis.window = previous.window; globalThis.requestAnimationFrame = previous.requestAnimationFrame; globalThis.matchMedia = previous.matchMedia; } };
}

test('pause HUD dims only for the exposed pause and lists every verb in one reachable word column', () => {
  const css = readFileSync(new URL('../styles/kit.css', import.meta.url), 'utf8');
  assert.match(css, /body\.k-screen-top\[data-k-screen="pause"\]\s+#hud/);
  assert.doesNotMatch(css, /body:has\(#screens \.of-pause\)\s+#hud/, 'an inactive mounted pause must not dim another screen');
  // The sheet's pause line is a column of WORDS (Task B §1.4 lists `k-words` at menu size). The
  // rack of stretched key sprites and the "Operations" disclosure that hid Main Menu and Quit are
  // gone; both classes are how those builds were found.
  assert.doesNotMatch(css, /\.of-pause[^{]*\.fh-key/, 'pause rows are kit words, not stretched key sprites');
  assert.doesNotMatch(css, /sf-pause-operations/, 'no disclosure hides verbs behind a duplicate Operations label');

  const dom = installMiniDom();
  try {
    const root = globalThis.document.createElement('div');
    const ctx = { state: { mode: 'paused', missions: { active: [] }, nav: {}, save: {}, meta: {}, ui: {}, run: { phase: 'inactive' } }, bus: { emit() {}, on() { return () => {}; } }, screenManager: { pushScreen(id) { pushes.push(id); }, popScreen() {}, hasScreen() { return true; } } };
    pauseScreen.mount(root, ctx);

    const buttons = root.querySelectorAll('button');
    const labels = buttons.map((button) => button.textContent);
    assert.deepEqual(labels.slice(0, 4), ['Resume', 'Settings', 'Save', 'Load'], 'the sheet order leads with the interruption choices');
    for (const required of ['Mission Log', 'My Ship', 'Operations', 'Help / Controls', 'Codex', 'Photo', 'Main Menu', 'Quit Game']) {
      assert.ok(labels.some((label) => label.startsWith(required)), `${required} is reachable without opening anything`);
    }
    assert.equal(new Set(labels).size, labels.length, 'no two pause verbs share a label');
    assert.equal(buttons.filter((button) => button.classList.contains('k-word--primary')).length, 1, 'Resume is the only primary verb');
    assert.equal(buttons.filter((button) => button.classList.contains('k-word--danger')).length, 2, 'Main Menu and Quit carry the danger treatment');
    assert.deepEqual(
      buttons.filter((button) => button.getAttribute('aria-current') === 'true').map((button) => button.textContent),
      ['Resume'],
      'Resume is the lit row until focus moves into the column',
    );
    assert.equal(root.querySelectorAll('.k-words').length, 1, 'every verb is one roving list, not a list plus a disclosure');
    // Every verb must actually RUN when picked: the first cut wired the pick callback to a stale
    // handler shape, so every click threw and the whole column was dead. That was caught by
    // `ui-look` (which clicks everything), not by a structural assertion. These are the plain
    // navigation verbs; the confirm-gated ones (Load, Main Menu, Quit) need a real dialog.
    const pushes = [];
    for (const label of ['Settings', 'Save', 'Mission Log', 'My Ship', 'Operations']) {
      const button = buttons.find((candidate) => candidate.textContent.startsWith(label));
      assert.ok(button, `${label} is reachable`);
      assert.doesNotThrow(() => button.dispatch('click'), `${label} pick must not throw`);
    }
    assert.deepEqual(pushes, ['settings', 'saveLoad', 'missionLog', 'ship', 'automation'],
      'every plain verb pushes its own destination');
  } finally {
    dom.restore();
  }
});
