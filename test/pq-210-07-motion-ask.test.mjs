// PQ-210.07 — first boot with the OS reduced-motion hint asks Full or Reduce; never silent.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import {
  FIRST_BOOT_MOTION_ASK_ID,
  MOTION_ASK_CHOICES,
  MOTION_PREFERENCES,
  applyAccessibility,
  firstBootScreenId,
  recordMotionChoice,
  shouldAskMotionPreference,
} from '../src/ui/accessibility.js';
import { motionAskScreen } from '../src/ui/screens/motionAsk.js';

function installMiniDom() {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    matchMedia: globalThis.matchMedia,
  };
  class Mini {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.parentElement = null;
      this.attributes = new Map();
      this.listeners = new Map();
      this._class = new Set();
      this._text = '';
      this.hidden = false;
      this.tabIndex = 0;
      this.style = { setProperty() {}, removeProperty() {} };
      const owner = this;
      this.classList = {
        add(...names) { names.forEach((name) => name && owner._class.add(name)); },
        remove(...names) { names.forEach((name) => owner._class.delete(name)); },
        contains(name) { return owner._class.has(name); },
        toggle(name, force) {
          if (force === undefined) force = !owner._class.has(name);
          if (force) owner._class.add(name); else owner._class.delete(name);
          return !!force;
        },
      };
      this.dataset = new Proxy(Object.create(null), {
        set(target, key, value) {
          target[key] = value;
          owner.attributes.set('data-' + String(key), String(value));
          return true;
        },
        deleteProperty(target, key) {
          delete target[key];
          owner.attributes.delete('data-' + String(key));
          return true;
        },
      });
    }
    get className() { return [...this._class].join(' '); }
    set className(value) {
      this._class.clear();
      String(value || '').split(/\s+/).forEach((name) => name && this._class.add(name));
    }
    get textContent() {
      return this.children.length ? this.children.map((child) => child.textContent).join('') : this._text;
    }
    set textContent(value) { this._text = String(value ?? ''); this.children = []; }
    set innerHTML(value) { if (value === '') this.textContent = ''; }
    getAttribute(name) { return name === 'class' ? this.className : (this.attributes.get(name) ?? null); }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
      if (name === 'class') this.className = value;
      if (name === 'id') this.id = String(value);
    }
    removeAttribute(name) { this.attributes.delete(name); }
    appendChild(child) { if (child) { child.parentElement = this; this.children.push(child); } return child; }
    append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }
    removeEventListener() {}
    dispatch(type) {
      for (const listener of this.listeners.get(type) || []) {
        listener({ target: this, type, preventDefault() {} });
      }
    }
    focus() { globalThis.document.activeElement = this; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) {
      const matches = (node) => {
        if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
        if (selector.startsWith('#')) return node.getAttribute('id') === selector.slice(1) || node.id === selector.slice(1);
        if (selector.startsWith('[')) {
          const hit = selector.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
          return !!hit && (hit[2] == null ? node.getAttribute(hit[1]) != null : node.getAttribute(hit[1]) === hit[2]);
        }
        return node.tagName === selector.toUpperCase();
      };
      const result = [];
      const visit = (node) => {
        for (const child of node.children) {
          if (matches(child)) result.push(child);
          visit(child);
        }
      };
      visit(this);
      return result;
    }
  }
  const body = new Mini('body');
  const head = new Mini('head');
  const nodes = new Map();
  globalThis.document = {
    body,
    documentElement: body,
    head,
    activeElement: body,
    createElement: (tag) => new Mini(tag),
    getElementById: (id) => nodes.get(id) || null,
  };
  const origAppend = head.appendChild.bind(head);
  head.appendChild = (child) => {
    origAppend(child);
    if (child && child.id) nodes.set(child.id, child);
    return child;
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
  };
  globalThis.requestAnimationFrame = (fn) => { fn(0); return 1; };
  globalThis.matchMedia = globalThis.window.matchMedia;
  return {
    restore() {
      globalThis.document = previous.document;
      globalThis.window = previous.window;
      globalThis.requestAnimationFrame = previous.requestAnimationFrame;
      globalThis.matchMedia = previous.matchMedia;
    },
  };
}

test('PQ-210.07: the OS hint asks once and never silently strips combat feel', () => {
  const state = createGameState(21007);
  assert.equal(state.settings.accessibility.motionPreference, 'full');
  assert.equal(state.settings.accessibility.motionAsked, false);
  assert.equal(shouldAskMotionPreference(state.settings, true), true);
  assert.equal(firstBootScreenId(state.settings, true), FIRST_BOOT_MOTION_ASK_ID);
  assert.equal(shouldAskMotionPreference(state.settings, false), false);
  assert.equal(firstBootScreenId(state.settings, false), 'mainMenu');

  const root = { classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } }, style: { setProperty() {} } };
  applyAccessibility(state.settings, root);
  assert.equal(state.settings.video.motionReduce, false, 'unasked Full stays Full even when the OS hint is on');

  const reduced = createGameState(21008);
  recordMotionChoice(reduced.settings, 'reduce');
  assert.equal(reduced.settings.accessibility.motionAsked, true);
  assert.equal(reduced.settings.accessibility.motionPreference, 'reduce');
  assert.equal(reduced.settings.video.motionReduce, true);
  assert.equal(shouldAskMotionPreference(reduced.settings, true), false, 'Reduce is a stored answer');

  const full = createGameState(21009);
  recordMotionChoice(full.settings, 'full');
  assert.equal(full.settings.accessibility.motionAsked, true);
  assert.equal(full.settings.video.motionReduce, false);
  assert.equal(shouldAskMotionPreference(full.settings, true), false, 'answering Full still counts as asked');

  const system = createGameState(21010);
  system.settings.accessibility.motionPreference = 'system';
  assert.equal(shouldAskMotionPreference(system.settings, true), false, 'System in Access is already a choice');

  const ancientReduce = { video: { motionReduce: true } };
  assert.equal(shouldAskMotionPreference(ancientReduce, true), false,
    'a profile that only had the old boolean Reduce is already a choice');

  assert.deepEqual(MOTION_ASK_CHOICES, ['full', 'reduce']);
  assert.ok(MOTION_PREFERENCES.includes('system'), 'System stays in Access');
});

test('PQ-210.07: the first-boot screen is a locked Full/Reduce choice on the title hangar', () => {
  const source = readFileSync(new URL('../src/ui/screens/motionAsk.js', import.meta.url), 'utf8');
  assert.match(source, /data:\s*\{\s*locked:\s*true\s*\}/);
  assert.doesNotMatch(source, /Follow system/);
  assert.doesNotMatch(source, /action: 'system'/);
  assert.equal(motionAskScreen.id, 'motionAsk');
  assert.equal(motionAskScreen.data.locked, true);

  const kitSource = readFileSync(new URL('../styles/kit.css', import.meta.url), 'utf8');
  assert.match(kitSource, /\[data-screen="motionAsk"\] \.k-world--plate/,
    'the ask stands on the same title hangar still as the menu');
  const uiRootSource = readFileSync(new URL('../src/ui/uiRoot.js', import.meta.url), 'utf8');
  assert.match(uiRootSource, /shouldAskMotionPreference/);
  assert.match(uiRootSource, /motionAskScreen/);
  assert.match(uiRootSource, /pushScreen\(firstBootScreenId\(/);

  const settingsSource = readFileSync(new URL('../src/ui/screens/settings.js', import.meta.url), 'utf8');
  assert.match(settingsSource, /'Follow system'/);
  assert.match(settingsSource, /recordMotionChoice/);

  const dom = installMiniDom();
  try {
    const state = createGameState(21011);
    const replaced = [];
    const emitted = [];
    const root = globalThis.document.createElement('div');
    motionAskScreen.mount(root, {
      state,
      bus: { emit(name, payload) { emitted.push([name, payload]); }, on() { return () => {}; } },
      screenManager: { replaceScreen(id) { replaced.push(id); }, pushScreen() {}, hasScreen() { return true; } },
    });

    const labels = root.querySelectorAll('button').map((button) => button.textContent);
    assert.deepEqual(labels, ['Full', 'Reduce']);
    const kicker = root.querySelector('#sf-motion-ask-kicker');
    assert.ok(kicker && kicker.textContent === 'Motion effects');
    assert.equal(root.getAttribute('aria-modal'), 'true');

    const full = root.querySelector('[data-action="full"]');
    assert.ok(full);
    full.dispatch('click');
    assert.equal(state.settings.accessibility.motionPreference, 'full');
    assert.equal(state.settings.accessibility.motionAsked, true);
    assert.equal(state.settings.video.motionReduce, false);
    assert.deepEqual(replaced, ['mainMenu']);
    assert.ok(emitted.some(([name, payload]) => name === 'settings:changed' && payload.value === 'full'));
  } finally {
    dom.restore();
  }
});

test('PQ-210.07: picking Reduce stores it and applies the calm path', () => {
  const dom = installMiniDom();
  try {
    const state = createGameState(21012);
    const replaced = [];
    const root = globalThis.document.createElement('div');
    motionAskScreen.mount(root, {
      state,
      bus: { emit() {}, on() { return () => {}; } },
      screenManager: { replaceScreen(id) { replaced.push(id); } },
    });
    const reduce = root.querySelector('[data-action="reduce"]');
    reduce.dispatch('click');
    assert.equal(state.settings.accessibility.motionPreference, 'reduce');
    assert.equal(state.settings.accessibility.motionAsked, true);
    assert.equal(state.settings.video.motionReduce, true);
    assert.equal(shouldAskMotionPreference(state.settings, true), false);
    assert.deepEqual(replaced, ['mainMenu']);
  } finally {
    dom.restore();
  }
});
