// UIUX-TOAST-MODAL-FOCUS-TESTS-GROK-001 + UIUX-CONFIRM-FOCUS-REPAIR-TESTS-GROK-001
// + UIUX-CONFIRM-MODAL-OWNERSHIP-TESTS-GROK-001
// Deterministic contract test for toast / confirm / screen-manager focus restoration.
//
// Production exports + runtime behavior are primary; light source anchors may supplement.
// Covers:
//   1. Status toasts never steal focus on arrival (announce via #toast-live only)
//   2. Toast removal cannot strand focus (nearest remaining → external → active screen)
//   3. Confirm cancel restores its opener
//   3b. Confirm repair: detached / hidden / disabled opener → active-screen fallback;
//       delayed close retains isConfirmOpen + ui-modal-open (input fence) until cleanup
//   3c. Confirm modal ownership under supersession: screen-owned class is preserved;
//       confirm-owned class is removed only by the final superseding dialog cleanup
//   4. Closing a screen restores a valid visible opener, else a deterministic fallback
//
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createGameState } from '../src/core/gameState.js';
import { createToasts } from '../src/ui/toasts.js';
import { createScreenManager } from '../src/ui/screenManager.js';
import { confirm, isConfirmOpen } from '../src/ui/confirm.js';

const TOASTS_SRC = readFileSync(fileURLToPath(new URL('../src/ui/toasts.js', import.meta.url)), 'utf8');
const CONFIRM_SRC = readFileSync(fileURLToPath(new URL('../src/ui/confirm.js', import.meta.url)), 'utf8');
const SCREEN_SRC = readFileSync(fileURLToPath(new URL('../src/ui/screenManager.js', import.meta.url)), 'utf8');

// ── Minimal DOM sufficient for toasts + confirm + screenManager ─────────────

function installDom() {
  const byId = new Map();

  class FakeClassList {
    constructor() { this.values = new Set(); }
    add(...vs) { vs.forEach((v) => this.values.add(v)); }
    remove(...vs) { vs.forEach((v) => this.values.delete(v)); }
    contains(v) { return this.values.has(v); }
    toggle(v, force) {
      if (force === undefined) force = !this.values.has(v);
      if (force) this.values.add(v); else this.values.delete(v);
      return force;
    }
  }

  function parseAttrs(attrPart) {
    const attrs = new Map();
    const re = /([a-zA-Z0-9\-:]+)="([^"]*)"/g;
    let m;
    while ((m = re.exec(attrPart)) !== null) attrs.set(m[1], m[2]);
    return attrs;
  }

  class FakeElement {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.childNodes = this.children;
      this.parentNode = null;
      this.ownerDocument = null;
      this.classList = new FakeClassList();
      this.attributes = new Map();
      this._listeners = new Map();
      this.style = {};
      this.dataset = {};
      this._className = '';
      this._textContent = '';
      this._innerHTML = '';
      this.hidden = false;
      this.disabled = false;
      this.isConnected = true;
      this.inert = false;
      this.id = '';
    }
    get className() { return this._className; }
    set className(v) {
      this._className = String(v || '');
      this.classList.values = new Set(this._className.split(/\s+/).filter(Boolean));
    }
    get textContent() {
      if (this.children.length) return this.children.map((c) => c.textContent).join('');
      return this._textContent;
    }
    set textContent(v) {
      this._textContent = String(v == null ? '' : v);
      this.children.length = 0;
      this._innerHTML = '';
    }
    get innerHTML() { return this._innerHTML; }
    set innerHTML(html) {
      this._innerHTML = String(html || '');
      for (const child of [...this.children]) {
        child.parentNode = null;
        child.isConnected = false;
        if (child.id && byId.get(child.id) === child) byId.delete(child.id);
      }
      this.children.length = 0;
      this._textContent = '';
      if (!this._innerHTML) return;
      const stack = [this];
      let i = 0;
      while (i < this._innerHTML.length) {
        if (this._innerHTML[i] !== '<') {
          const end = this._innerHTML.indexOf('<', i);
          const text = this._innerHTML.slice(i, end === -1 ? this._innerHTML.length : end);
          stack[stack.length - 1]._textContent += text;
          if (end === -1) break;
          i = end;
          continue;
        }
        if (this._innerHTML.slice(i, i + 4) === '<!--') {
          const end = this._innerHTML.indexOf('-->', i);
          i = end === -1 ? this._innerHTML.length : end + 3;
          continue;
        }
        const closeMatch = this._innerHTML.slice(i).match(/^<\/([a-zA-Z0-9]+)\s*>/);
        if (closeMatch) {
          const tag = closeMatch[1].toUpperCase();
          if (stack.length > 1 && stack[stack.length - 1].tagName === tag) stack.pop();
          i += closeMatch[0].length;
          continue;
        }
        const openMatch = this._innerHTML.slice(i).match(/^<([a-zA-Z0-9]+)([^>]*)>/);
        if (!openMatch) { i++; continue; }
        const [, tag, attrPart] = openMatch;
        const selfClosing = /\/\s*$/.test(attrPart)
          || ['br', 'hr', 'img', 'input', 'meta', 'link'].includes(tag.toLowerCase());
        const child = document.createElement(tag);
        const attrs = parseAttrs(attrPart);
        for (const [k, v] of attrs) {
          child.setAttribute(k, v);
          if (k === 'class') child.className = v;
          if (k === 'id') {
            child.id = v;
            byId.set(v, child);
          }
          if (k === 'type') child.type = v;
        }
        stack[stack.length - 1].appendChild(child);
        if (!selfClosing) stack.push(child);
        i += openMatch[0].length;
      }
    }
    setAttribute(name, value) {
      const v = String(value);
      this.attributes.set(name, v);
      if (name === 'id') {
        if (this.id && byId.get(this.id) === this) byId.delete(this.id);
        this.id = v;
        if (v && this.isConnected) byId.set(v, this);
      }
      if (name === 'class') this.className = v;
    }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    removeAttribute(name) {
      this.attributes.delete(name);
      if (name === 'id') {
        if (this.id && byId.get(this.id) === this) byId.delete(this.id);
        this.id = '';
      }
    }
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      child.ownerDocument = this.ownerDocument || globalThis.document;
      child.isConnected = this.isConnected;
      this.children.push(child);
      if (child.id) byId.set(child.id, child);
      return child;
    }
    prepend(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      child.ownerDocument = this.ownerDocument || globalThis.document;
      child.isConnected = this.isConnected;
      this.children.unshift(child);
      if (child.id) byId.set(child.id, child);
      return child;
    }
    append(...nodes) { nodes.forEach((n) => this.appendChild(n)); }
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      child.parentNode = null;
      child.isConnected = false;
      if (child.id && byId.get(child.id) === child) byId.delete(child.id);
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
    dispatchEvent(typeOrEv, maybeEv) {
      let type;
      let ev;
      if (typeof typeOrEv === 'string') {
        type = typeOrEv;
        ev = maybeEv || {};
      } else {
        type = typeOrEv.type;
        ev = typeOrEv;
      }
      const payload = {
        preventDefault() {},
        stopPropagation() {},
        ...ev,
        type,
        target: ev.target || this,
        currentTarget: this,
      };
      const list = this._listeners.get(type) || [];
      for (const fn of list) fn(payload);
      return true;
    }
    click() {
      this.dispatchEvent('click', { target: this });
    }
    contains(node) {
      for (let n = node; n; n = n.parentNode) if (n === this) return true;
      return false;
    }
    focus(opts) {
      void opts;
      document.activeElement = this;
    }
    blur() {
      if (document.activeElement === this) document.activeElement = document.body;
    }
    querySelectorAll(sel) {
      const out = [];
      const walk = (node) => {
        for (const c of node.children) {
          if (matchesComplex(c, sel)) out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  }

  // Supports simple / compound / descendant selectors used by production UI modules.
  function matchesSimple(el, sel) {
    const s = String(sel || '').trim();
    if (!s) return false;
    if (s.includes(',')) return s.split(',').some((part) => matchesSimple(el, part.trim()));
    // Descendant: "a b" → match last simple only when any ancestor matches the prefix chain.
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      if (!matchesSimple(el, parts[parts.length - 1])) return false;
      let ancestor = el.parentNode;
      for (let i = parts.length - 2; i >= 0; i--) {
        let found = false;
        while (ancestor) {
          if (matchesSimple(ancestor, parts[i])) { found = true; break; }
          ancestor = ancestor.parentNode;
        }
        if (!found) return false;
        ancestor = ancestor.parentNode;
      }
      return true;
    }
    // Attribute / pseudo-ish fragments used by focusable queries.
    if (s === 'button' && el.tagName === 'BUTTON') return true;
    if (s === 'input' && el.tagName === 'INPUT') return true;
    if (s === 'select' && el.tagName === 'SELECT') return true;
    if (s === 'textarea' && el.tagName === 'TEXTAREA') return true;
    if (s === '[href]' && el.getAttribute('href')) return true;
    if (s.startsWith('[tabindex]') || s.includes('[tabindex]')) {
      const t = el.getAttribute('tabindex');
      if (t == null) return false;
      if (s.includes(':not([tabindex="-1"])') && t === '-1') return false;
      return true;
    }
    if (s.startsWith('#')) return el.id === s.slice(1);
    if (s.startsWith('.')) return el.classList.contains(s.slice(1));
    // tag.class or tag#id
    const tagClass = s.match(/^([a-zA-Z0-9]+)(\.[a-zA-Z0-9_-]+)+$/);
    if (tagClass) {
      if (el.tagName !== tagClass[1].toUpperCase()) return false;
      return s.split('.').slice(1).every((c) => el.classList.contains(c));
    }
    const tagId = s.match(/^([a-zA-Z0-9]+)#([a-zA-Z0-9_-]+)$/);
    if (tagId) return el.tagName === tagId[1].toUpperCase() && el.id === tagId[2];
    if (/^[a-zA-Z0-9]+$/.test(s)) return el.tagName === s.toUpperCase();
    return false;
  }

  function matchesComplex(el, sel) {
    return matchesSimple(el, sel);
  }

  const body = new FakeElement('body');
  const head = new FakeElement('head');
  const uiRoot = new FakeElement('div'); uiRoot.id = 'ui-root';
  const screens = new FakeElement('div'); screens.id = 'screens';
  const backdrop = new FakeElement('div'); backdrop.id = 'modal-backdrop';
  const hud = new FakeElement('div'); hud.id = 'hud';
  const toasts = new FakeElement('div'); toasts.id = 'toasts';
  const toastLive = new FakeElement('div'); toastLive.id = 'toast-live';
  toastLive.setAttribute('role', 'status');
  toastLive.setAttribute('aria-live', 'polite');
  body.appendChild(uiRoot);
  body.appendChild(screens);
  body.appendChild(backdrop);
  body.appendChild(hud);
  body.appendChild(toasts);
  body.appendChild(toastLive);
  byId.set('ui-root', uiRoot);
  byId.set('screens', screens);
  byId.set('modal-backdrop', backdrop);
  byId.set('hud', hud);
  byId.set('toasts', toasts);
  byId.set('toast-live', toastLive);

  let activeElement = body;
  const docListeners = new Map();
  const doc = {
    body,
    head,
    documentElement: body,
    get activeElement() { return activeElement; },
    set activeElement(v) { activeElement = v; },
    getElementById(id) { return byId.get(id) || null; },
    querySelector(sel) {
      if (typeof sel === 'string' && sel.startsWith('#')) {
        const space = sel.indexOf(' ');
        if (space < 0) {
          const id = sel.slice(1);
          const root = byId.get(id);
          if (root && matchesSimple(root, sel)) return root;
        } else {
          const id = sel.slice(1, space);
          const rest = sel.slice(space + 1).trim();
          const root = byId.get(id);
          if (root) return root.querySelector(rest);
        }
      }
      return body.querySelector(sel);
    },
    querySelectorAll(sel) { return body.querySelectorAll(sel); },
    createElement(tagName) {
      const el = new FakeElement(tagName);
      el.ownerDocument = doc;
      return el;
    },
    addEventListener(type, fn, opts) {
      void opts;
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = docListeners.get(type) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
  };
  body.ownerDocument = doc;
  head.ownerDocument = doc;
  for (const el of [uiRoot, screens, backdrop, hud, toasts, toastLive]) el.ownerDocument = doc;

  globalThis.document = doc;
  globalThis.window = {
    innerWidth: 1920,
    innerHeight: 1080,
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.requestAnimationFrame = (cb) => { cb(0); return 1; };
  globalThis.cancelAnimationFrame = () => {};

  let now = 1000;
  globalThis.performance = { now: () => now };

  return {
    body,
    screens,
    toasts,
    toastLive,
    byId,
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toastCards(dom) {
  return dom.toasts.children.filter((c) => c.classList.contains('sf-toast'));
}

// ── Source anchors (supplement — runtime assertions below are primary) ──────

{
  assert.match(TOASTS_SRC, /Do NOT call focus\(\)/, 'toasts source documents no focus steal on arrival');
  assert.match(TOASTS_SRC, /function restoreFocusAfterDismiss/, 'toasts implement dismiss-path focus restore');
  assert.match(TOASTS_SRC, /function announceStatus/, 'toasts announce via live region helper');
  assert.match(TOASTS_SRC, /getElementById\('toast-live'\)/, 'toasts write #toast-live');

  // push/group path must not call .focus( — only dismiss restore may.
  const pushStart = TOASTS_SRC.indexOf('function push(');
  const dismissStart = TOASTS_SRC.indexOf('function dismiss(');
  assert.ok(pushStart >= 0 && dismissStart > pushStart, 'toasts push/dismiss bodies locateable');
  assert.equal(
    /\.focus\s*\(/.test(TOASTS_SRC.slice(pushStart, dismissStart)),
    false,
    'push/group path must not call .focus(',
  );

  assert.match(CONFIRM_SRC, /const opener = document\.activeElement/, 'confirm captures opener');
  assert.match(CONFIRM_SRC, /opener\.focus/, 'confirm restores opener focus on close');
  assert.match(CONFIRM_SRC, /function isRestorableTarget/, 'confirm validates opener restorability');
  assert.match(CONFIRM_SRC, /function tryFocusActiveScreen/, 'confirm falls back to active screen');
  assert.match(
    CONFIRM_SRC,
    /Keep modal\/input-fence ownership until delayed cleanup/,
    'confirm retains fence ownership across delayed close',
  );
  assert.match(
    CONFIRM_SRC,
    /_confirmOwnsModalOpen/,
    'confirm tracks whether the confirm chain owns ui-modal-open',
  );
  assert.match(
    CONFIRM_SRC,
    /wasConfirmOpen\s*\n?\s*\?\s*!_confirmOwnsModalOpen/,
    'confirm inherits modal-open ownership across supersession',
  );
  // ui-modal-open must not be cleared in the synchronous close path (only inside setTimeout).
  const closeFn = CONFIRM_SRC.match(/const close = \(v\) => \{[\s\S]*?\n  \};/);
  assert.ok(closeFn, 'confirm close body locateable');
  const syncCloseBody = closeFn[0].split('setTimeout')[0];
  assert.equal(
    /classList\.remove\(['"]ui-modal-open['"]\)/.test(syncCloseBody),
    false,
    'sync close path must not drop ui-modal-open before delayed cleanup',
  );
  assert.match(SCREEN_SRC, /function _isRestorableOpener/, 'screenManager validates openers');
  assert.match(SCREEN_SRC, /function _restoreFocus/, 'screenManager restores opener focus');
  assert.match(SCREEN_SRC, /_ensureFocusIn/, 'screenManager falls back to first focusable');
}

// ── 1. Status toasts never steal focus ──────────────────────────────────────

{
  const dom = installDom();
  const bus = makeBus();
  const opener = dom.button('toast-opener', 'Open');
  opener.focus();
  assert.equal(document.activeElement, opener, 'fixture starts on opener');

  const toasts = createToasts({ bus });
  const before = document.activeElement;
  toasts.push({ text: 'Cargo full', kind: 'warn', ttl: 4 });
  toasts.push({ text: 'Ore sold', kind: 'good', ttl: 4 });
  bus.emit('toast', { text: 'Via bus', kind: 'info', ttl: 3 });

  assert.equal(document.activeElement, before, 'toast arrival must not steal focus');
  assert.equal(document.activeElement, opener, 'focus remains on pre-toast control');

  const cards = toastCards(dom);
  assert.ok(cards.length >= 2, 'status toast cards render');
  for (const card of cards) {
    assert.equal(card.getAttribute('role'), 'button', 'toast card is a dismiss control');
    assert.equal(card.getAttribute('tabindex'), '0', 'toast card is keyboard-reachable when entered');
    assert.equal(card.getAttribute('aria-live'), null, 'toast card itself is not a live region');
  }

  // Status is announced once through the polite live region — never by moving focus.
  assert.ok(dom.toastLive.textContent.length > 0, 'status text is written to #toast-live');
  assert.match(dom.toastLive.textContent, /Via bus|Ore sold|Cargo full/, 'live region carries toast status text');
}

// ── 2. Toast removal cannot strand focus ────────────────────────────────────

{
  const dom = installDom();
  const bus = makeBus();
  const opener = dom.button('dismiss-opener', 'Open');
  opener.focus();
  const toasts = createToasts({ bus });
  toasts.push({ text: 'Alpha', kind: 'info', ttl: 10 });
  toasts.push({ text: 'Beta', kind: 'info', ttl: 10 });
  const cards = toastCards(dom);
  assert.equal(cards.length, 2, 'two toasts live');
  // newest first (prepend)
  const beta = cards[0];
  const alpha = cards[1];

  // Enter the feed from the external control, then keyboard-dismiss newest.
  dom.toasts.dispatchEvent('focusin', { relatedTarget: opener });
  beta.focus();
  assert.equal(document.activeElement, beta);
  beta.dispatchEvent('keydown', { key: 'Enter', preventDefault() {} });
  assert.equal(document.activeElement, alpha, 'dismissed focused toast restores nearest remaining toast');
  assert.notEqual(document.activeElement, document.body, 'focus must not strand on body while a toast remains');

  alpha.focus();
  alpha.dispatchEvent('keydown', { key: ' ', preventDefault() {} });
  assert.equal(document.activeElement, opener, 'last toast dismiss restores previous external control');
  assert.notEqual(document.activeElement, document.body, 'final dismiss must not drop silently to body');
}

{
  // Expire path: focused toast times out → nearest remaining (not body).
  const dom = installDom();
  const bus = makeBus();
  const opener = dom.button('expire-opener', 'Open');
  opener.focus();
  const toasts = createToasts({ bus });
  toasts.push({ text: 'Long', kind: 'info', ttl: 10 });
  toasts.push({ text: 'Short', kind: 'info', ttl: 1 });
  const cards = toastCards(dom);
  const newest = cards[0];
  const older = cards[1];
  dom.toasts.dispatchEvent('focusin', { relatedTarget: opener });
  newest.focus();
  dom.advance(1100);
  toasts.tick();
  assert.equal(document.activeElement, older, 'expired focused toast restores nearest remaining');
  assert.notEqual(document.activeElement, document.body, 'expire path must not strand on body');
}

{
  // Invalid previous control → deterministic active-screen focusable.
  const dom = installDom();
  const bus = makeBus();
  const state = createGameState(21);
  state.mode = 'flight';
  const mgr = createScreenManager({ state, bus });
  let pauseBtn = null;
  mgr.register({
    id: 'pause',
    mount(el) {
      pauseBtn = document.createElement('button');
      pauseBtn.id = 'pause-resume-ff';
      pauseBtn.textContent = 'Resume';
      el.appendChild(pauseBtn);
    },
  });
  mgr.pushScreen('pause');

  const ghost = dom.button('ghost-opener', 'Ghost');
  ghost.focus();
  const toasts = createToasts({ bus });
  toasts.push({ text: 'Only', kind: 'info', ttl: 5 });
  const toastEl = toastCards(dom)[0];
  dom.toasts.dispatchEvent('focusin', { relatedTarget: ghost });
  toastEl.focus();
  ghost.isConnected = false;
  ghost.parentNode = null;
  toastEl.dispatchEvent('keydown', { key: 'Enter', preventDefault() {} });
  assert.equal(document.activeElement, pauseBtn, 'invalid previous control falls back to active screen focusable');
  assert.notEqual(document.activeElement, document.body, 'fallback must not strand on body');
}

// ── 3. Confirm cancel restores its opener ───────────────────────────────────

{
  const dom = installDom();
  void dom;
  const opener = document.createElement('button');
  opener.id = 'confirm-opener';
  opener.textContent = 'Sell ship';
  document.body.appendChild(opener);
  opener.focus();
  assert.equal(document.activeElement, opener, 'confirm fixture starts on opener');

  let result = null;
  const pending = confirm({
    title: 'Sell ship?',
    body: 'Refund: 12,500 CR (50%).',
    confirmLabel: 'Sell',
    danger: true,
  }).then((v) => { result = v; });

  assert.equal(isConfirmOpen(), true, 'confirm is open before resolution');
  const dialog = document.querySelector('#sf-confirm-root .sf-confirm')
    || document.getElementById('sf-confirm-root')?.querySelector?.('.sf-confirm');
  assert.ok(dialog, 'confirm dialog is rendered');
  assert.equal(dialog.getAttribute('role'), 'dialog', 'confirm exposes role=dialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true', 'confirm exposes aria-modal');

  const cancelBtn = dialog.querySelector('.sf-confirm__cancel');
  const okBtn = dialog.querySelector('.sf-confirm__ok');
  assert.ok(cancelBtn && okBtn, 'confirm has cancel + ok actions');
  assert.equal(document.activeElement, cancelBtn, 'danger confirm defaults focus to Cancel');

  cancelBtn.click();
  await sleep(200);
  await pending;
  assert.equal(result, false, 'cancel resolves false');
  assert.equal(isConfirmOpen(), false, 'confirm is closed after cancel');
  assert.equal(document.activeElement, opener, 'confirm cancel restores focus to its opener');
}

{
  // Non-danger cancel via Esc also restores opener.
  installDom();
  const opener = document.createElement('button');
  opener.id = 'confirm-opener-esc';
  document.body.appendChild(opener);
  opener.focus();

  let result = null;
  const pending = confirm({
    title: 'Buy route?',
    body: 'Load cargo.',
    confirmLabel: 'Buy',
    danger: false,
  }).then((v) => { result = v; });

  const root = document.getElementById('sf-confirm-root');
  const dialog = root && root.querySelector('.sf-confirm');
  assert.ok(dialog, 'non-danger confirm dialog rendered');
  const okBtn = dialog.querySelector('.sf-confirm__ok');
  assert.equal(document.activeElement, okBtn, 'non-danger confirm defaults focus to OK');

  dialog.dispatchEvent('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() {} });
  await sleep(200);
  await pending;
  assert.equal(result, false, 'Esc cancels confirm');
  assert.equal(document.activeElement, opener, 'Esc cancel restores opener focus');
}

// ── 3b. Confirm repair: invalid opener + delayed fence ownership ────────────

/** Mount a visible screen under #screens with a single focusable control. */
function mountActiveScreenButton(id = 'confirm-screen-fallback') {
  const screens = document.getElementById('screens');
  assert.ok(screens, '#screens fixture present');
  const screenEl = document.createElement('div');
  screenEl.id = 'confirm-active-screen';
  screenEl.style.display = '';
  const btn = document.createElement('button');
  btn.id = id;
  btn.textContent = 'Screen action';
  screenEl.appendChild(btn);
  screens.appendChild(screenEl);
  return btn;
}

{
  // Detached opener → first valid control in the visible active screen.
  const dom = installDom();
  void dom;
  const screenBtn = mountActiveScreenButton('confirm-fallback-detached');
  const opener = document.createElement('button');
  opener.id = 'confirm-opener-detached';
  opener.textContent = 'Sell';
  document.body.appendChild(opener);
  opener.focus();

  let result = null;
  const pending = confirm({
    title: 'Detach sell?',
    body: 'Opener will disconnect before restore.',
    confirmLabel: 'Sell',
    danger: true,
  }).then((v) => { result = v; });

  assert.equal(isConfirmOpen(), true, 'detached-opener case: confirm open');
  const dialog = document.querySelector('#sf-confirm-root .sf-confirm')
    || document.getElementById('sf-confirm-root')?.querySelector?.('.sf-confirm');
  assert.ok(dialog, 'detached-opener case: dialog rendered');
  const cancelBtn = dialog.querySelector('.sf-confirm__cancel');
  assert.ok(cancelBtn, 'detached-opener case: cancel present');

  // Disconnect after open so capture still recorded the real opener.
  if (opener.parentNode) opener.parentNode.removeChild(opener);
  else {
    opener.isConnected = false;
    opener.parentNode = null;
  }
  assert.equal(opener.isConnected, false, 'opener is detached before close');

  cancelBtn.click();
  await sleep(200);
  await pending;
  assert.equal(result, false, 'detached opener cancel resolves false');
  assert.equal(isConfirmOpen(), false, 'detached opener: confirm closed after cleanup');
  assert.equal(
    document.activeElement,
    screenBtn,
    'detached opener falls back to visible active-screen focusable',
  );
  assert.notEqual(document.activeElement, document.body, 'detached fallback must not strand on body');
  const root = document.getElementById('sf-confirm-root');
  assert.ok(root && root.children.length === 0, 'dialog DOM cleared after cleanup');
  assert.equal(
    root.contains && root.contains(document.activeElement),
    false,
    'focus must not remain inside removed confirm root',
  );
}

{
  // Hidden opener is not restorable → active-screen fallback.
  const dom = installDom();
  void dom;
  const screenBtn = mountActiveScreenButton('confirm-fallback-hidden');
  const opener = document.createElement('button');
  opener.id = 'confirm-opener-hidden';
  document.body.appendChild(opener);
  opener.focus();

  let result = null;
  const pending = confirm({
    title: 'Hidden opener?',
    body: 'Opener will hide before restore.',
    confirmLabel: 'Ok',
    danger: false,
  }).then((v) => { result = v; });

  const dialog = document.querySelector('#sf-confirm-root .sf-confirm')
    || document.getElementById('sf-confirm-root')?.querySelector?.('.sf-confirm');
  const cancelBtn = dialog && dialog.querySelector('.sf-confirm__cancel');
  assert.ok(cancelBtn, 'hidden-opener case: cancel present');
  opener.hidden = true;

  cancelBtn.click();
  await sleep(200);
  await pending;
  assert.equal(result, false, 'hidden opener cancel resolves false');
  assert.equal(
    document.activeElement,
    screenBtn,
    'hidden opener falls back to visible active-screen focusable',
  );
  assert.notEqual(document.activeElement, opener, 'hidden opener must not be restored');
}

{
  // Disabled opener is not restorable → active-screen fallback.
  const dom = installDom();
  void dom;
  const screenBtn = mountActiveScreenButton('confirm-fallback-disabled');
  const opener = document.createElement('button');
  opener.id = 'confirm-opener-disabled';
  document.body.appendChild(opener);
  opener.focus();

  let result = null;
  const pending = confirm({
    title: 'Disabled opener?',
    body: 'Opener will disable before restore.',
    confirmLabel: 'Ok',
    danger: false,
  }).then((v) => { result = v; });

  const dialog = document.querySelector('#sf-confirm-root .sf-confirm')
    || document.getElementById('sf-confirm-root')?.querySelector?.('.sf-confirm');
  const cancelBtn = dialog && dialog.querySelector('.sf-confirm__cancel');
  assert.ok(cancelBtn, 'disabled-opener case: cancel present');
  opener.disabled = true;

  cancelBtn.click();
  await sleep(200);
  await pending;
  assert.equal(result, false, 'disabled opener cancel resolves false');
  assert.equal(
    document.activeElement,
    screenBtn,
    'disabled opener falls back to visible active-screen focusable',
  );
  assert.notEqual(document.activeElement, opener, 'disabled opener must not be restored');
}

{
  // Visible active-screen fallback when no restorable opener and multiple screen kids
  // (only the non-display:none child is eligible).
  const dom = installDom();
  void dom;
  const screens = document.getElementById('screens');
  const hiddenScreen = document.createElement('div');
  hiddenScreen.id = 'confirm-hidden-screen';
  hiddenScreen.style.display = 'none';
  const hiddenBtn = document.createElement('button');
  hiddenBtn.id = 'confirm-hidden-screen-btn';
  hiddenScreen.appendChild(hiddenBtn);
  screens.appendChild(hiddenScreen);

  const visibleScreen = document.createElement('div');
  visibleScreen.id = 'confirm-visible-screen';
  const firstBtn = document.createElement('button');
  firstBtn.id = 'confirm-visible-first';
  firstBtn.textContent = 'First';
  const secondBtn = document.createElement('button');
  secondBtn.id = 'confirm-visible-second';
  secondBtn.textContent = 'Second';
  visibleScreen.appendChild(firstBtn);
  visibleScreen.appendChild(secondBtn);
  screens.appendChild(visibleScreen);

  const ghost = document.createElement('button');
  ghost.id = 'confirm-opener-ghost';
  document.body.appendChild(ghost);
  ghost.focus();

  let result = null;
  const pending = confirm({
    title: 'Screen fallback?',
    body: 'Pick first focusable in visible screen.',
    confirmLabel: 'Ok',
    danger: false,
  }).then((v) => { result = v; });

  const dialog = document.querySelector('#sf-confirm-root .sf-confirm')
    || document.getElementById('sf-confirm-root')?.querySelector?.('.sf-confirm');
  const cancelBtn = dialog && dialog.querySelector('.sf-confirm__cancel');
  assert.ok(cancelBtn, 'active-screen fallback case: cancel present');
  if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
  else {
    ghost.isConnected = false;
    ghost.parentNode = null;
  }

  cancelBtn.click();
  await sleep(200);
  await pending;
  assert.equal(result, false, 'active-screen fallback cancel resolves false');
  assert.equal(
    document.activeElement,
    firstBtn,
    'visible active-screen fallback focuses first valid control (skips display:none screen)',
  );
  assert.notEqual(document.activeElement, hiddenBtn, 'hidden screen controls are not fallback targets');
  assert.notEqual(document.activeElement, secondBtn, 'fallback is first focusable, not later siblings');
}

{
  // Delayed close window retains isConfirmOpen + ui-modal-open (input-fence ownership)
  // until cleanup completes; only then does the promise settle and fence drop.
  const dom = installDom();
  void dom;
  const opener = document.createElement('button');
  opener.id = 'confirm-opener-fence';
  document.body.appendChild(opener);
  opener.focus();

  let settled = false;
  let result = null;
  const pending = confirm({
    title: 'Fence hold?',
    body: 'Ownership must span the fade-out window.',
    confirmLabel: 'Ok',
    danger: false,
  }).then((v) => {
    result = v;
    settled = true;
  });

  assert.equal(isConfirmOpen(), true, 'fence case: confirm open before cancel');
  assert.equal(
    document.body.classList.contains('ui-modal-open'),
    true,
    'fence case: body.ui-modal-open while confirm owns the modal',
  );

  const root = document.getElementById('sf-confirm-root');
  const dialog = root && root.querySelector('.sf-confirm');
  const cancelBtn = dialog && dialog.querySelector('.sf-confirm__cancel');
  assert.ok(cancelBtn, 'fence case: cancel present');

  cancelBtn.click();

  // Synchronous post-close window: fence + open flag must still hold; promise not yet settled.
  assert.equal(settled, false, 'promise must not resolve until delayed cleanup');
  assert.equal(
    isConfirmOpen(),
    true,
    'isConfirmOpen retained during delayed close window (input-fence ownership)',
  );
  assert.equal(
    document.body.classList.contains('ui-modal-open'),
    true,
    'ui-modal-open retained during delayed close window',
  );
  assert.ok(root && root.children.length > 0, 'dialog still mounted during delayed close window');

  // Mid-window: still holding before the 160ms cleanup fires.
  await sleep(50);
  assert.equal(settled, false, 'still unresolved at mid fade-out');
  assert.equal(isConfirmOpen(), true, 'isConfirmOpen still true mid fade-out');
  assert.equal(
    document.body.classList.contains('ui-modal-open'),
    true,
    'ui-modal-open still true mid fade-out',
  );

  await sleep(200);
  await pending;
  assert.equal(settled, true, 'promise resolves after delayed cleanup');
  assert.equal(result, false, 'fence case cancel resolves false');
  assert.equal(isConfirmOpen(), false, 'isConfirmOpen clears only after delayed cleanup');
  assert.equal(
    document.body.classList.contains('ui-modal-open'),
    false,
    'ui-modal-open clears only after delayed cleanup when confirm owned the fence',
  );
  assert.equal(root.children.length, 0, 'dialog DOM cleared only after delayed cleanup');
  assert.equal(document.activeElement, opener, 'valid opener restored after delayed cleanup');
}

// ── 3c. Confirm modal ownership under supersession ──────────────────────────

{
  // Screen-owned body.ui-modal-open + confirm B superseding A:
  // class must survive B's final cleanup (screen/dock still owns the fence).
  // Both promises settle; B's dialog/token stay intact until B's own cleanup.
  const dom = installDom();
  void dom;
  const screenBtn = mountActiveScreenButton('confirm-screen-owned-super');
  document.body.classList.add('ui-modal-open');
  assert.equal(
    document.body.classList.contains('ui-modal-open'),
    true,
    'screen-owned fixture starts with body.ui-modal-open',
  );

  const opener = document.createElement('button');
  opener.id = 'confirm-opener-screen-super';
  document.body.appendChild(opener);
  opener.focus();

  let resultA = null;
  let settledA = false;
  const pendingA = confirm({
    title: 'Screen-owned A?',
    body: 'First confirm over a live screen.',
    confirmLabel: 'A',
    danger: false,
  }).then((v) => {
    resultA = v;
    settledA = true;
  });

  const root = document.getElementById('sf-confirm-root');
  assert.ok(root, 'screen-owned super: confirm root mounted');
  const tokenA = root._sfConfirmToken;
  assert.ok(tokenA, 'screen-owned super: confirm A has a token');
  assert.equal(isConfirmOpen(), true, 'screen-owned super: A is open');
  assert.equal(
    document.body.classList.contains('ui-modal-open'),
    true,
    'screen-owned super: class retained while A is open',
  );

  let resultB = null;
  let settledB = false;
  const pendingB = confirm({
    title: 'Screen-owned B?',
    body: 'Supersedes A; must not steal screen ownership.',
    confirmLabel: 'B',
    danger: false,
  }).then((v) => {
    resultB = v;
    settledB = true;
  });

  const tokenB = root._sfConfirmToken;
  const dialogB = root.querySelector('.sf-confirm');
  assert.ok(tokenB, 'screen-owned super: confirm B has a token');
  assert.notEqual(tokenB, tokenA, 'screen-owned super: B replaces A token');
  assert.ok(dialogB, 'screen-owned super: B dialog is live');
  assert.equal(isConfirmOpen(), true, 'screen-owned super: B is open after supersession');
  assert.equal(settledA, false, 'A promise does not settle until its delayed cleanup');
  assert.equal(settledB, false, 'B promise not settled while open');
  assert.equal(
    document.body.classList.contains('ui-modal-open'),
    true,
    'screen-owned super: class still present after supersession',
  );

  // A's delayed cleanup must not wipe B's dialog/token or strip the screen-owned class.
  await sleep(200);
  await pendingA;
  assert.equal(settledA, true, 'A promise settles after its delayed cleanup');
  assert.equal(resultA, false, 'superseded A resolves false');
  assert.equal(settledB, false, 'B still open after A cleanup');
  assert.equal(isConfirmOpen(), true, 'B remains the live confirm after A cleanup');
  assert.equal(root._sfConfirmToken, tokenB, 'B token intact after A cleanup');
  assert.equal(
    root.querySelector('.sf-confirm'),
    dialogB,
    'B dialog intact after A cleanup (token isolation)',
  );
  assert.ok(root.children.length > 0, 'confirm root still hosts B after A cleanup');
  assert.equal(
    document.body.classList.contains('ui-modal-open'),
    true,
    'screen-owned class survives A cleanup',
  );

  const cancelB = dialogB.querySelector('.sf-confirm__cancel');
  assert.ok(cancelB, 'screen-owned super: B cancel present');
  cancelB.click();

  // Mid-window: fence + class still held until B's delayed cleanup.
  assert.equal(settledB, false, 'B promise holds until its delayed cleanup');
  assert.equal(isConfirmOpen(), true, 'isConfirmOpen retained during B fade-out');
  assert.equal(
    document.body.classList.contains('ui-modal-open'),
    true,
    'ui-modal-open retained during B fade-out (screen-owned)',
  );
  assert.equal(root._sfConfirmToken, tokenB, 'B token intact until B cleanup');

  await sleep(200);
  await pendingB;
  assert.equal(settledB, true, 'B promise settles after its delayed cleanup');
  assert.equal(resultB, false, 'B cancel resolves false');
  assert.equal(isConfirmOpen(), false, 'no live confirm after B cleanup');
  assert.equal(root._sfConfirmToken, null, 'B token cleared only on B cleanup');
  assert.equal(root.children.length, 0, 'B dialog cleared only on B cleanup');
  assert.equal(
    document.body.classList.contains('ui-modal-open'),
    true,
    'screen-owned ui-modal-open preserved after final superseding confirm closes',
  );
  // Screen control remains available for the still-open modal session.
  assert.ok(screenBtn.isConnected, 'visible screen still present after confirm chain');
}

{
  // No pre-owned class: confirm chain owns ui-modal-open. B superseding A must
  // remove the confirm-owned class only on B's final delayed cleanup.
  // Both promises settle; B's dialog/token stay intact until B's own cleanup.
  const dom = installDom();
  void dom;
  assert.equal(
    document.body.classList.contains('ui-modal-open'),
    false,
    'confirm-owned fixture starts without body.ui-modal-open',
  );

  const opener = document.createElement('button');
  opener.id = 'confirm-opener-owned-super';
  document.body.appendChild(opener);
  opener.focus();

  let resultA = null;
  let settledA = false;
  const pendingA = confirm({
    title: 'Confirm-owned A?',
    body: 'First confirm over flight (no screen class).',
    confirmLabel: 'A',
    danger: false,
  }).then((v) => {
    resultA = v;
    settledA = true;
  });

  const root = document.getElementById('sf-confirm-root');
  assert.ok(root, 'confirm-owned super: confirm root mounted');
  const tokenA = root._sfConfirmToken;
  assert.ok(tokenA, 'confirm-owned super: confirm A has a token');
  assert.equal(
    document.body.classList.contains('ui-modal-open'),
    true,
    'confirm A adds ui-modal-open when none was present',
  );
  assert.equal(isConfirmOpen(), true, 'confirm-owned super: A is open');

  let resultB = null;
  let settledB = false;
  const pendingB = confirm({
    title: 'Confirm-owned B?',
    body: 'Supersedes A; inherits confirm ownership of the class.',
    confirmLabel: 'B',
    danger: false,
  }).then((v) => {
    resultB = v;
    settledB = true;
  });

  const tokenB = root._sfConfirmToken;
  const dialogB = root.querySelector('.sf-confirm');
  assert.ok(tokenB, 'confirm-owned super: confirm B has a token');
  assert.notEqual(tokenB, tokenA, 'confirm-owned super: B replaces A token');
  assert.ok(dialogB, 'confirm-owned super: B dialog is live');
  assert.equal(isConfirmOpen(), true, 'confirm-owned super: B is open after supersession');
  assert.equal(settledA, false, 'A promise does not settle until its delayed cleanup');
  assert.equal(
    document.body.classList.contains('ui-modal-open'),
    true,
    'confirm-owned class still present after supersession (chain still live)',
  );

  // A's delayed cleanup must not wipe B or drop the class (B still owns the chain).
  await sleep(200);
  await pendingA;
  assert.equal(settledA, true, 'A promise settles after its delayed cleanup');
  assert.equal(resultA, false, 'superseded A resolves false');
  assert.equal(settledB, false, 'B still open after A cleanup');
  assert.equal(isConfirmOpen(), true, 'B remains the live confirm after A cleanup');
  assert.equal(root._sfConfirmToken, tokenB, 'B token intact after A cleanup');
  assert.equal(
    root.querySelector('.sf-confirm'),
    dialogB,
    'B dialog intact after A cleanup (token isolation)',
  );
  assert.ok(root.children.length > 0, 'confirm root still hosts B after A cleanup');
  assert.equal(
    document.body.classList.contains('ui-modal-open'),
    true,
    'confirm-owned class survives A cleanup while B is live',
  );

  const cancelB = dialogB.querySelector('.sf-confirm__cancel');
  assert.ok(cancelB, 'confirm-owned super: B cancel present');
  cancelB.click();

  assert.equal(settledB, false, 'B promise holds until its delayed cleanup');
  assert.equal(isConfirmOpen(), true, 'isConfirmOpen retained during B fade-out');
  assert.equal(
    document.body.classList.contains('ui-modal-open'),
    true,
    'ui-modal-open retained during B fade-out (confirm-owned until final cleanup)',
  );
  assert.equal(root._sfConfirmToken, tokenB, 'B token intact until B cleanup');

  await sleep(200);
  await pendingB;
  assert.equal(settledB, true, 'B promise settles after its delayed cleanup');
  assert.equal(resultB, false, 'B cancel resolves false');
  assert.equal(isConfirmOpen(), false, 'no live confirm after B cleanup');
  assert.equal(root._sfConfirmToken, null, 'B token cleared only on B cleanup');
  assert.equal(root.children.length, 0, 'B dialog cleared only on B cleanup');
  assert.equal(
    document.body.classList.contains('ui-modal-open'),
    false,
    'final superseding confirm removes confirm-owned ui-modal-open',
  );
  // B's captured opener is typically a control from A (superseded), which is already gone;
  // focus must not remain inside the cleared confirm root.
  assert.equal(
    root.contains && root.contains(document.activeElement),
    false,
    'focus must not remain inside removed confirm root after chain ends',
  );
  assert.notEqual(document.activeElement, document.body, 'focus should not silently drop to body when opener is invalid');
  // Opener from the outer fixture remains restorable for non-supersession paths; chain end is ownership-focused.
  assert.ok(opener.isConnected, 'original flight opener remains in the document after confirm chain');
}

// ── 4. Closing a screen restores valid opener or deterministic fallback ─────

{
  const dom = installDom();
  const bus = makeBus();
  const state = createGameState(22);
  state.mode = 'flight';
  const mgr = createScreenManager({ state, bus });

  let pauseA = null;
  let settingsB = null;
  mgr.register({
    id: 'pause',
    mount(el) {
      pauseA = document.createElement('button');
      pauseA.id = 'pause-settings';
      pauseA.textContent = 'Settings';
      el.appendChild(pauseA);
      const other = document.createElement('button');
      other.id = 'pause-resume';
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
  assert.equal(document.activeElement, pauseA, 'push focuses first focusable in new screen');
  pauseA.focus();
  mgr.pushScreen('settings');
  assert.equal(document.activeElement, settingsB, 'nested push focuses new screen');

  mgr.popScreen();
  assert.equal(document.activeElement, pauseA, 'pop restores captured valid visible opener');
  assert.equal(mgr.top(), 'pause');
}

{
  // Invalid opener (disconnected) → first focusable in exposed top screen.
  const dom = installDom();
  const bus = makeBus();
  const state = createGameState(23);
  state.mode = 'flight';
  const mgr = createScreenManager({ state, bus });

  let first = null;
  let second = null;
  mgr.register({
    id: 'pause',
    mount(el) {
      first = document.createElement('button');
      first.id = 'ff-first';
      first.textContent = 'First';
      el.appendChild(first);
      second = document.createElement('button');
      second.id = 'ff-second';
      second.textContent = 'Second';
      el.appendChild(second);
    },
  });
  mgr.register({
    id: 'settings',
    mount(el) {
      const back = document.createElement('button');
      back.id = 'ff-back';
      back.textContent = 'Back';
      el.appendChild(back);
    },
  });

  mgr.pushScreen('pause');
  second.focus();
  mgr.pushScreen('settings');
  second.isConnected = false;
  second.parentNode = null;
  mgr.popScreen();
  assert.equal(document.activeElement, first, 'disconnected opener uses first focusable fallback');
}

{
  // Hidden opener is not restorable → deterministic first focusable.
  const dom = installDom();
  const bus = makeBus();
  const state = createGameState(24);
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
  // Empty stack: outside opener restored when still valid and outside #screens.
  const dom = installDom();
  const bus = makeBus();
  const state = createGameState(25);
  state.mode = 'flight';
  const hudBtn = dom.button('hud-map', 'Map');
  hudBtn.focus();
  const mgr = createScreenManager({ state, bus });
  mgr.register({
    id: 'pause',
    mount(el) {
      const b = document.createElement('button');
      b.id = 'resume-empty';
      el.appendChild(b);
    },
  });
  mgr.pushScreen('pause');
  mgr.popScreen();
  assert.equal(document.activeElement, hudBtn, 'pop to empty stack restores outside opener');
  assert.equal(mgr.top(), null);
}

console.log('toast-modal-focus-fast-follow: toast steal/strand + confirm cancel/repair/ownership + screen restore OK');
