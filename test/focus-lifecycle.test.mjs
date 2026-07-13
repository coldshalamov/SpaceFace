// Focus lifecycle on toast dismiss/expire and modal pop/removal.
// Acceptance: UIUX-FOCUS-LIFECYCLE-IMPL-001
import assert from 'node:assert/strict';
import { createToasts } from '../src/ui/toasts.js';
import { createScreenManager } from '../src/ui/screenManager.js';
import { createGameState } from '../src/core/gameState.js';

function installDom() {
  const elements = new Map();
  class FakeClassList {
    constructor() { this.values = new Set(); }
    add(...values) { values.forEach((v) => this.values.add(v)); }
    remove(...values) { values.forEach((v) => this.values.delete(v)); }
    toggle(value, force) {
      if (force === undefined) force = !this.values.has(value);
      if (force) this.values.add(value); else this.values.delete(value);
      return force;
    }
    contains(value) { return this.values.has(value); }
  }
  class FakeElement {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.childNodes = this.children;
      this.parentNode = null;
      this.style = {};
      this.dataset = {};
      this.classList = new FakeClassList();
      this.attributes = new Map();
      this.hidden = false;
      this.disabled = false;
      this.isConnected = true;
      this.inert = false;
      this.id = '';
      this.textContent = '';
      this._className = '';
      this._listeners = new Map();
      this.ownerDocument = null;
    }
    get className() { return this._className; }
    set className(value) {
      this._className = String(value || '');
      this.classList.values = new Set(this._className.split(/\s+/).filter(Boolean));
    }
    appendChild(child) {
      child.parentNode = this;
      child.ownerDocument = this.ownerDocument || globalThis.document || null;
      child.isConnected = this.isConnected;
      this.children.push(child);
      if (child.id) elements.set(child.id, child);
      return child;
    }
    prepend(child) {
      child.parentNode = this;
      child.ownerDocument = this.ownerDocument || globalThis.document || null;
      child.isConnected = this.isConnected;
      this.children.unshift(child);
      if (child.id) elements.set(child.id, child);
      return child;
    }
    append(...nodes) { nodes.forEach((n) => this.appendChild(n)); }
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      child.parentNode = null;
      child.isConnected = false;
      if (document.activeElement === child) document.activeElement = document.body;
      return child;
    }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(fn);
    }
    removeEventListener(type, fn) {
      const list = this._listeners.get(type) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    }
    dispatchEvent(type, ev = {}) {
      const list = this._listeners.get(type) || [];
      for (const fn of list) fn({ ...ev, type, target: this, currentTarget: this });
    }
    querySelectorAll(sel) {
      const out = [];
      const walk = (node) => {
        for (const c of node.children) {
          if (matchSimple(c, sel)) out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    contains(candidate) {
      for (let n = candidate; n; n = n.parentNode) if (n === this) return true;
      return false;
    }
    focus(opts) {
      void opts;
      document.activeElement = this;
    }
    blur() {
      if (document.activeElement === this) document.activeElement = document.body;
    }
  }

  function matchSimple(el, sel) {
    // Minimal matcher for focusable selector used by screenManager/toasts.
    if (sel.includes('button') && el.tagName === 'BUTTON') return true;
    if (sel.includes('[href]') && el.getAttribute('href')) return true;
    if (sel.includes('input') && el.tagName === 'INPUT') return true;
    if (sel.includes('select') && el.tagName === 'SELECT') return true;
    if (sel.includes('textarea') && el.tagName === 'TEXTAREA') return true;
    if (sel.includes('[tabindex]') && el.getAttribute('tabindex') != null && el.getAttribute('tabindex') !== '-1') return true;
    return false;
  }

  const body = new FakeElement('body');
  const head = new FakeElement('head');
  const screens = new FakeElement('div'); screens.id = 'screens'; elements.set('screens', screens); body.appendChild(screens);
  const backdrop = new FakeElement('div'); backdrop.id = 'modal-backdrop'; elements.set('modal-backdrop', backdrop); body.appendChild(backdrop);
  const hud = new FakeElement('div'); hud.id = 'hud'; elements.set('hud', hud); body.appendChild(hud);
  const toasts = new FakeElement('div'); toasts.id = 'toasts'; elements.set('toasts', toasts); body.appendChild(toasts);
  const toastLive = new FakeElement('div'); toastLive.id = 'toast-live'; elements.set('toast-live', toastLive); body.appendChild(toastLive);

  globalThis.document = {
    body,
    head,
    documentElement: body,
    activeElement: body,
    getElementById(id) { return elements.get(id) || null; },
    createElement(tagName) {
      const el = new FakeElement(tagName);
      el.ownerDocument = globalThis.document;
      return el;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  body.ownerDocument = document;
  screens.ownerDocument = document;
  toasts.ownerDocument = document;

  globalThis.window = { innerWidth: 1920, innerHeight: 1080, addEventListener() {}, removeEventListener() {} };
  globalThis.requestAnimationFrame = (cb) => { cb(0); return 1; };
  globalThis.cancelAnimationFrame = () => {};
  let now = 1000;
  globalThis.performance = { now: () => now };
  return {
    body, screens, toasts, toastLive, elements,
    advance(ms) { now += ms; },
    setNow(v) { now = v; },
    button(id, label = id) {
      const b = document.createElement('button');
      b.id = id;
      b.textContent = label;
      body.appendChild(b);
      return b;
    },
  };
}

function makeBus() {
  const handlers = new Map();
  return {
    on(ev, fn) {
      if (!handlers.has(ev)) handlers.set(ev, []);
      handlers.get(ev).push(fn);
    },
    emit(ev, payload) {
      for (const fn of (handlers.get(ev) || [])) fn(payload);
    },
  };
}

// ── Toast focus restore ─────────────────────────────────────────────────────

{
  const dom = installDom();
  const bus = makeBus();
  const opener = dom.button('opener', 'Open');
  opener.focus();
  assert.equal(document.activeElement, opener, 'fixture starts on opener');

  const toasts = createToasts({ bus });
  const focusBeforePush = document.activeElement;
  toasts.push({ text: 'Alpha', kind: 'info', ttl: 5 });
  toasts.push({ text: 'Beta', kind: 'info', ttl: 5 });
  assert.equal(document.activeElement, focusBeforePush, 'toast arrival must not steal focus');

  const toastEls = dom.toasts.children.filter((c) => c.classList.contains('sf-toast'));
  assert.equal(toastEls.length, 2, 'two toasts rendered');
  // newest first (prepend)
  const beta = toastEls[0];
  const alpha = toastEls[1];

  // Simulate keyboard entry into the feed: focusin from opener → beta.
  dom.toasts.dispatchEvent('focusin', { relatedTarget: opener });
  beta.focus();
  assert.equal(document.activeElement, beta);

  // Keyboard dismiss focused toast → nearest remaining (alpha).
  beta.dispatchEvent('keydown', { key: 'Enter', preventDefault() {} });
  // dismiss is bound via addEventListener; invoke the keydown handler path:
  // Fake dispatchEvent calls listeners — keydown listener checks Enter/Space.
  assert.equal(document.activeElement, alpha, 'dismissed focused toast restores nearest remaining toast');

  // Dismiss last focused toast → previous external control.
  alpha.focus();
  alpha.dispatchEvent('keydown', { key: ' ', preventDefault() {} });
  assert.equal(document.activeElement, opener, 'last toast dismiss restores previous control, not body');
  assert.notEqual(document.activeElement, document.body, 'must not drop silently to body');
}

{
  // Expire path: focused toast times out → nearest remaining.
  const dom = installDom();
  const bus = makeBus();
  const opener = dom.button('expire-opener', 'Opener');
  opener.focus();
  const toasts = createToasts({ bus });
  toasts.push({ text: 'One', kind: 'info', ttl: 10 }); // long-lived older
  toasts.push({ text: 'Two', kind: 'info', ttl: 1 });  // newest expires first
  const toastEls = dom.toasts.children.filter((c) => c.classList.contains('sf-toast'));
  const newest = toastEls[0];
  const older = toastEls[1];
  dom.toasts.dispatchEvent('focusin', { relatedTarget: opener });
  newest.focus();
  dom.advance(1100);
  toasts.tick();
  assert.equal(document.activeElement, older, 'expired focused toast restores nearest remaining');
}

{
  const dom = installDom();
  const bus = makeBus();
  const state = createGameState(8);
  state.mode = 'flight';
  const mgr = createScreenManager({ state, bus });
  let pauseBtn = null;
  mgr.register({
    id: 'pause',
    mount(el) {
      pauseBtn = document.createElement('button');
      pauseBtn.id = 'pause-resume-2';
      pauseBtn.textContent = 'Resume';
      el.appendChild(pauseBtn);
    },
  });
  mgr.pushScreen('pause');

  const ghost = dom.button('ghost', 'Ghost');
  ghost.focus();
  const toasts = createToasts({ bus });
  toasts.push({ text: 'Only', kind: 'info', ttl: 4 });
  const toastEl = dom.toasts.children.find((c) => c.classList.contains('sf-toast'));
  // Enter toast feed from ghost, then disconnect ghost so restore must use active screen.
  dom.toasts.dispatchEvent('focusin', { relatedTarget: ghost });
  toastEl.focus();
  ghost.isConnected = false;
  ghost.parentNode = null;
  toastEl.dispatchEvent('keydown', { key: 'Enter', preventDefault() {} });
  assert.equal(document.activeElement, pauseBtn, 'invalid previous control falls back to active screen focusable');
  assert.notEqual(document.activeElement, document.body);
}

// ── Modal pop focus restore ─────────────────────────────────────────────────

{
  const dom = installDom();
  const bus = makeBus();
  const state = createGameState(9);
  state.mode = 'flight';
  const mgr = createScreenManager({ state, bus });

  let pauseA = null;
  let settingsB = null;
  mgr.register({
    id: 'pause',
    mount(el) {
      pauseA = document.createElement('button');
      pauseA.id = 'pause-a';
      pauseA.textContent = 'Settings';
      el.appendChild(pauseA);
      const other = document.createElement('button');
      other.id = 'pause-other';
      other.textContent = 'Resume';
      el.appendChild(other);
    },
  });
  mgr.register({
    id: 'settings',
    mount(el) {
      settingsB = document.createElement('button');
      settingsB.id = 'settings-back';
      settingsB.textContent = 'Back';
      el.appendChild(settingsB);
    },
  });

  mgr.pushScreen('pause');
  assert.equal(document.activeElement, pauseA);
  pauseA.focus();
  mgr.pushScreen('settings');
  assert.equal(document.activeElement, settingsB, 'nested push focuses new screen');

  mgr.popScreen();
  assert.equal(document.activeElement, pauseA, 'pop restores captured opener in exposed top screen');
}

{
  // Invalid opener (disconnected) → deterministic first focusable in exposed screen.
  const dom = installDom();
  const bus = makeBus();
  const state = createGameState(10);
  state.mode = 'flight';
  const mgr = createScreenManager({ state, bus });

  let first = null;
  let second = null;
  mgr.register({
    id: 'pause',
    mount(el) {
      first = document.createElement('button');
      first.id = 'first';
      first.textContent = 'First';
      el.appendChild(first);
      second = document.createElement('button');
      second.id = 'second';
      second.textContent = 'Second';
      el.appendChild(second);
    },
  });
  mgr.register({
    id: 'settings',
    mount(el) {
      const back = document.createElement('button');
      back.id = 'back';
      back.textContent = 'Back';
      el.appendChild(back);
    },
  });

  mgr.pushScreen('pause');
  second.focus();
  mgr.pushScreen('settings');
  // Detach the opener so restore fails visibility/connection check.
  second.isConnected = false;
  second.parentNode = null;
  mgr.popScreen();
  assert.equal(document.activeElement, first, 'invalid opener uses first focusable in top screen');
}

{
  // Hidden opener is not restorable → fallback.
  const dom = installDom();
  const bus = makeBus();
  const state = createGameState(11);
  state.mode = 'flight';
  const mgr = createScreenManager({ state, bus });

  let first = null;
  let second = null;
  mgr.register({
    id: 'pause',
    mount(el) {
      first = document.createElement('button');
      first.id = 'h-first';
      el.appendChild(first);
      second = document.createElement('button');
      second.id = 'h-second';
      el.appendChild(second);
    },
  });
  mgr.register({
    id: 'settings',
    mount(el) {
      const back = document.createElement('button');
      back.id = 'h-back';
      el.appendChild(back);
    },
  });

  mgr.pushScreen('pause');
  second.focus();
  mgr.pushScreen('settings');
  second.hidden = true;
  mgr.popScreen();
  assert.equal(document.activeElement, first, 'hidden opener is invalid; fallback to first focusable');
}

{
  // Locked root mainMenu remains on stack; nested pop restores correctly under it.
  const dom = installDom();
  const bus = makeBus();
  const state = createGameState(12);
  state.mode = 'menu';
  const mgr = createScreenManager({ state, bus });

  let menuContinue = null;
  let newGameName = null;
  mgr.register({
    id: 'mainMenu',
    data: { locked: true },
    mount(el) {
      menuContinue = document.createElement('button');
      menuContinue.id = 'continue';
      menuContinue.textContent = 'Continue';
      el.appendChild(menuContinue);
    },
  });
  mgr.register({
    id: 'newGame',
    mount(el) {
      newGameName = document.createElement('input');
      newGameName.id = 'pilot-name';
      el.appendChild(newGameName);
    },
  });

  mgr.pushScreen('mainMenu');
  assert.equal(mgr.locked(), true, 'single mainMenu in menu mode is locked');
  menuContinue.focus();
  mgr.pushScreen('newGame');
  assert.equal(document.activeElement, newGameName);
  assert.equal(mgr.locked(), false, 'nested newGame is not the locked root');
  mgr.popScreen();
  assert.equal(document.activeElement, menuContinue, 'pop from nested restores mainMenu opener');
  assert.equal(mgr.top(), 'mainMenu');
  assert.equal(mgr.locked(), true, 'root menu lock restored after nested pop');
}

{
  // Empty stack: outside opener restored when still valid.
  const dom = installDom();
  const bus = makeBus();
  const state = createGameState(13);
  state.mode = 'flight';
  const hudBtn = dom.button('hud-action', 'Map');
  hudBtn.focus();
  const mgr = createScreenManager({ state, bus });
  mgr.register({
    id: 'pause',
    mount(el) {
      const b = document.createElement('button');
      b.id = 'resume';
      el.appendChild(b);
    },
  });
  mgr.pushScreen('pause');
  mgr.popScreen();
  assert.equal(document.activeElement, hudBtn, 'pop to empty stack restores outside opener');
}

// ── M6 modal accessibility-tree ownership ─────────────────────────────────────

{
  const dom = installDom();
  const bus = makeBus();
  const state = createGameState(14);
  state.mode = 'flight';
  const mgr = createScreenManager({ state, bus });

  let pauseRoot = null;
  let settingsRoot = null;
  mgr.register({
    id: 'pause',
    data: { ariaLabel: 'Pause menu' },
    mount(el) {
      pauseRoot = el;
      const first = document.createElement('button');
      first.id = 'a11y-pause-first';
      el.appendChild(first);
    },
  });
  mgr.register({
    id: 'settings',
    mount(el) {
      settingsRoot = el;
      const first = document.createElement('button');
      first.id = 'a11y-settings-first';
      el.appendChild(first);
    },
  });

  mgr.pushScreen('pause');
  assert.equal(pauseRoot.getAttribute('role'), 'dialog', 'active screen exposes dialog semantics');
  assert.equal(pauseRoot.getAttribute('aria-label'), 'Pause menu', 'declared accessible name wins');
  assert.equal(pauseRoot.getAttribute('aria-modal'), 'true', 'active screen owns modal semantics');
  assert.equal(pauseRoot.getAttribute('aria-hidden'), null, 'active screen is exposed to assistive tech');
  assert.equal(pauseRoot.inert, false, 'active screen is keyboard reachable');
  assert.equal(dom.screens.getAttribute('aria-hidden'), null, 'open screen root is exposed');
  assert.equal(dom.screens.inert, false, 'open screen root is interactive');
  assert.equal(dom.elements.get('modal-backdrop').getAttribute('aria-hidden'), 'true',
    'visual dimmer stays out of the accessibility tree');

  mgr.pushScreen('settings');
  assert.equal(settingsRoot.getAttribute('aria-label'), 'Settings', 'screen id produces a stable fallback name');
  assert.equal(settingsRoot.getAttribute('aria-modal'), 'true');
  assert.equal(settingsRoot.inert, false);
  assert.equal(pauseRoot.getAttribute('aria-modal'), null, 'covered screen cannot retain modal ownership');
  assert.equal(pauseRoot.getAttribute('aria-hidden'), 'true', 'covered screen leaves the accessibility tree');
  assert.equal(pauseRoot.inert, true, 'covered screen cannot receive focus');

  mgr.popScreen();
  assert.equal(pauseRoot.getAttribute('aria-modal'), 'true', 'revealed screen regains modal ownership');
  assert.equal(pauseRoot.inert, false);
  assert.equal(settingsRoot.getAttribute('aria-hidden'), 'true');
  assert.equal(settingsRoot.inert, true);

  mgr.popScreen();
  assert.equal(dom.screens.getAttribute('aria-hidden'), 'true', 'closed screen root leaves accessibility tree');
  assert.equal(dom.screens.inert, true, 'closed screen root cannot retain focus');
  assert.equal(dom.body.classList.contains('ui-modal-open'), false);
}

{
  // Initial focus skips controls that assistive technology or a parent subtree marks unavailable.
  installDom();
  const bus = makeBus();
  const state = createGameState(15);
  state.mode = 'flight';
  const mgr = createScreenManager({ state, bus });
  let usable = null;
  mgr.register({
    id: 'help',
    mount(el) {
      const ariaDisabled = document.createElement('button');
      ariaDisabled.id = 'aria-disabled-first';
      ariaDisabled.setAttribute('aria-disabled', 'true');
      el.appendChild(ariaDisabled);

      const inertGroup = document.createElement('div');
      inertGroup.inert = true;
      const inertChild = document.createElement('button');
      inertChild.id = 'inert-child';
      inertGroup.appendChild(inertChild);
      el.appendChild(inertGroup);

      usable = document.createElement('button');
      usable.id = 'usable-control';
      el.appendChild(usable);
    },
  });
  mgr.pushScreen('help');
  assert.equal(document.activeElement, usable, 'initial focus lands on the first genuinely operable control');
}

{
  // autoFocus:false may preserve a screen-owned choice, but cannot strand focus in the covered
  // opener. The live galaxy map uses this mode for intent-specific focus in onShow.
  installDom();
  const bus = makeBus();
  const state = createGameState(16);
  state.mode = 'flight';
  const mgr = createScreenManager({ state, bus });
  let opener = null;
  let mapControl = null;
  mgr.register({
    id: 'pause',
    mount(el) {
      opener = document.createElement('button');
      opener.id = 'open-map';
      el.appendChild(opener);
    },
  });
  mgr.register({
    id: 'galaxyMap',
    data: { autoFocus: false },
    mount(el) {
      mapControl = document.createElement('button');
      mapControl.id = 'map-control';
      el.appendChild(mapControl);
    },
  });
  mgr.pushScreen('pause');
  assert.equal(document.activeElement, opener);
  mgr.pushScreen('galaxyMap');
  assert.equal(document.activeElement, mapControl,
    'autoFocus:false falls back inside the active dialog when onShow did not choose a control');
}

{
  // A modal with no operable descendants still owns a deterministic programmatic focus target.
  installDom();
  const bus = makeBus();
  const state = createGameState(17);
  state.mode = 'flight';
  const mgr = createScreenManager({ state, bus });
  let emptyRoot = null;
  mgr.register({
    id: 'emptyStatus',
    data: { autoFocus: false },
    mount(el) { emptyRoot = el; },
  });
  mgr.pushScreen('emptyStatus');
  assert.equal(emptyRoot.getAttribute('tabindex'), '-1');
  assert.equal(document.activeElement, emptyRoot, 'control-free dialog focuses its root fallback');
}

console.log('focus-lifecycle: toast dismiss/expire + modal pop restore OK');
