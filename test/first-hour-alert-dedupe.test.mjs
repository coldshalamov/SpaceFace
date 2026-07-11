// ONEVOICE-ALERT-DEDUPE-IMPL — first-hour / danger alert dedupe contract.
//
// Mechanical policy: tutorial/danger short status lines are spoken once via the
// one-voice floor (alerts.js → voiceArbiter → voice:surface). They must never
// also land as toast cards / #toast-live announcements.
//
// Pins:
//   1. Voice-origin (_fromVoice) toasts never render.
//   2. cargo-full / shield-down short semantics are arbiter-owned (no parallel toast).
//   3. Transaction ACK toasts still render (buy/sell/rep/credits).
//   4. Floor live-region does not re-speak identical re-surfaces.
//   5. Keyboard dismiss + polite toast channel a11y truth is preserved.
//
// Production surfaces only:
//   src/ui/alerts.js
//   src/ui/toasts.js
//
// Run:
//   node test/first-hour-alert-dedupe.test.mjs
// Adjacent (not modified by this lane):
//   npm run check:one-voice
//   node scripts/check-ui-a11y.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import {
  createAlerts,
  isVoiceOwnedAlertToast,
  normalizeAlertToastText,
  VOICE_OWNED_ALERT_TEXTS,
} from '../src/ui/alerts.js';
import { createToasts } from '../src/ui/toasts.js';
import { voiceArbiter } from '../src/ui/voiceArbiter.js';

const ALERTS_SRC = readFileSync(fileURLToPath(new URL('../src/ui/alerts.js', import.meta.url)), 'utf8');
const TOASTS_SRC = readFileSync(fileURLToPath(new URL('../src/ui/toasts.js', import.meta.url)), 'utf8');
const ONBOARDING_SRC = readFileSync(fileURLToPath(new URL('../src/systems/onboarding.js', import.meta.url)), 'utf8');
const FLOAT_SRC = readFileSync(fileURLToPath(new URL('../src/ui/floatingText.js', import.meta.url)), 'utf8');

let passes = 0;
let failures = 0;

function check(name, fn) {
  try {
    fn();
    passes++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err && err.message ? err.message : err}`);
  }
}

// ── Minimal DOM for alerts + toasts ──────────────────────────────────────────

function installDom() {
  const byId = new Map();

  class FakeClassList {
    constructor() { this.values = new Set(); }
    add(...vs) { vs.forEach((v) => this.values.add(v)); }
    remove(...vs) { vs.forEach((v) => this.values.delete(v)); }
    contains(v) { return this.values.has(v); }
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
      this.hidden = false;
      this.disabled = false;
      this.isConnected = true;
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
    }
    appendChild(child) {
      child.parentNode = this;
      child.ownerDocument = this.ownerDocument || globalThis.document || null;
      child.isConnected = this.isConnected;
      this.children.push(child);
      if (child.id) byId.set(child.id, child);
      return child;
    }
    prepend(child) {
      child.parentNode = this;
      child.ownerDocument = this.ownerDocument || globalThis.document || null;
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
      return child;
    }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(fn);
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    contains(candidate) {
      for (let n = candidate; n; n = n.parentNode) if (n === this) return true;
      return false;
    }
    focus() { document.activeElement = this; }
    blur() { if (document.activeElement === this) document.activeElement = document.body; }
  }

  const body = new FakeElement('body');
  const alerts = new FakeElement('div'); alerts.id = 'alerts'; byId.set('alerts', alerts); body.appendChild(alerts);
  const toasts = new FakeElement('div'); toasts.id = 'toasts'; byId.set('toasts', toasts); body.appendChild(toasts);
  const toastLive = new FakeElement('div'); toastLive.id = 'toast-live'; byId.set('toast-live', toastLive); body.appendChild(toastLive);

  globalThis.document = {
    body,
    documentElement: body,
    activeElement: body,
    getElementById(id) { return byId.get(id) || null; },
    createElement(tag) {
      const el = new FakeElement(tag);
      el.ownerDocument = globalThis.document;
      return el;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  body.ownerDocument = document;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.requestAnimationFrame = (cb) => { cb(0); return 1; };
  globalThis.performance = { now: () => 1000 };

  return { alerts, toasts, toastLive, byId };
}

function toastCards(dom) {
  return dom.toasts.children.filter((c) => c.className && String(c.className).includes('sf-toast'));
}

function floorPills(dom) {
  return dom.alerts.children.filter((c) => c.className && String(c.className).includes('sf-alert--floor'));
}

function alertLiveRegion(dom, live) {
  return dom.alerts.children.find((c) => c.getAttribute && c.getAttribute('aria-live') === live);
}

// ── Source anchors ───────────────────────────────────────────────────────────

check('alerts exports voice-owned short-status policy (cargo/shield family)', () => {
  assert.ok(Array.isArray(VOICE_OWNED_ALERT_TEXTS) || VOICE_OWNED_ALERT_TEXTS.length >= 4);
  assert.ok(VOICE_OWNED_ALERT_TEXTS.includes('CARGO FULL'));
  assert.ok(VOICE_OWNED_ALERT_TEXTS.includes('CARGO HOLD FULL'));
  assert.ok(VOICE_OWNED_ALERT_TEXTS.includes('SHIELDS DOWN'));
  assert.ok(VOICE_OWNED_ALERT_TEXTS.includes('SHIELD DOWN'));
  assert.equal(typeof isVoiceOwnedAlertToast, 'function');
  assert.equal(isVoiceOwnedAlertToast('CARGO FULL'), true);
  assert.equal(isVoiceOwnedAlertToast('cargo hold full'), true);
  assert.equal(isVoiceOwnedAlertToast('SHIELDS DOWN'), true);
  assert.equal(isVoiceOwnedAlertToast('Shield down'), true);
  // Long tutorial / ACK strings must NOT be owned (onboarding + market toasts pass through).
  assert.equal(
    isVoiceOwnedAlertToast('Cargo hold full! Dock at a station to audit or sell the sample and free up space.'),
    false,
  );
  assert.equal(isVoiceOwnedAlertToast('Sold 12 Iron Ore · +840 cr'), false);
  assert.equal(isVoiceOwnedAlertToast('+800 CR'), false);
  assert.equal(normalizeAlertToastText('CARGO FULL!'), 'cargo full');
});

check('alerts routes cargo-full and shield-down through announce (not raise pills)', () => {
  assert.match(ALERTS_SRC, /announce\(\{\s*key:\s*'shield-down'/);
  assert.match(ALERTS_SRC, /announce\(\{\s*key:\s*'cargo-full'/);
  assert.match(ALERTS_SRC, /on\('cargo:full'/);
  assert.match(ALERTS_SRC, /brokeShield\)\s*announce/);
  assert.match(ALERTS_SRC, /VOICE_OWNED_ALERT_TEXTS/);
  assert.match(ALERTS_SRC, /floorSpokenText/);
  // Must not raise a parallel status pill for those transient keys.
  assert.doesNotMatch(ALERTS_SRC, /raise\(\{\s*key:\s*'cargo-full'/);
  assert.doesNotMatch(ALERTS_SRC, /raise\(\{\s*key:\s*'shield-down'/);
});

check('toasts suppress _fromVoice and voice-owned short semantics', () => {
  assert.match(TOASTS_SRC, /if \(_fromVoice\) return/);
  assert.match(TOASTS_SRC, /isVoiceOwnedAlertToast/);
  assert.match(TOASTS_SRC, /from '\.\/alerts\.js'/);
});

check('floatingText still emits parallel cargo toast (suppressed at toast layer, not deleted here)', () => {
  // Lane cannot edit floatingText; policy must absorb its CARGO FULL toast at the sink.
  assert.match(FLOAT_SRC, /CARGO FULL/);
  assert.match(FLOAT_SRC, /on\('cargo:full'/);
});

check('onboarding first-cargo / first-shield are terse tutorial hints gated behind the staged rail', () => {
  assert.match(ONBOARDING_SRC, /firstCargoFull/);
  assert.match(ONBOARDING_SRC, /firstShieldDrop/);
  assert.match(ONBOARDING_SRC, /channel:\s*'tutorial'/);
  assert.match(ONBOARDING_SRC, /Dock and sell cargo to free hold space\./);
  assert.match(ONBOARDING_SRC, /Break contact\. Shields recharge when fire stops\./);
  assert.match(ONBOARDING_SRC, /_tutorialRailOwnsVoice\(\)/);
});

// ── Runtime: voice mirror + parallel short status ────────────────────────────

check('runtime: _fromVoice and CARGO FULL never create toast cards or toast-live text', () => {
  const dom = installDom();
  const bus = createBus();
  const toasts = createToasts({ bus });
  void toasts;

  bus.emit('toast', { text: 'CARGO HOLD FULL', kind: 'warn', ttl: 2.5, _fromVoice: true });
  bus.emit('toast', { text: 'CARGO FULL', kind: 'warn', ttl: 3.5 }); // floatingText parallel
  bus.emit('toast', { text: 'SHIELDS DOWN', kind: 'danger', ttl: 3, _fromVoice: true });
  bus.emit('toast', { text: 'SHIELD DOWN', kind: 'danger', ttl: 3 });

  assert.equal(toastCards(dom).length, 0, 'owned short status must not render as toast cards');
  assert.equal(dom.toastLive.textContent, '', 'owned short status must not write #toast-live');
});

check('runtime: transaction ACK / mechanical toasts still render and announce once', () => {
  const dom = installDom();
  const bus = createBus();
  createToasts({ bus });

  bus.emit('toast', { text: 'Sold 12 Iron Ore · +840 cr', kind: 'good', ttl: 3 });
  bus.emit('toast', { text: '+12 REP · DMC', kind: 'good', ttl: 3.5 });
  bus.emit('toast', { text: 'Enemy Destroyed · +800 CR', kind: 'credits', ttl: 3.5 });

  const cards = toastCards(dom);
  assert.equal(cards.length, 3, 'transaction/ACK toasts must still render');
  assert.match(dom.toastLive.textContent, /Enemy Destroyed|REP|Sold/);
  for (const card of cards) {
    assert.equal(card.getAttribute('role'), 'button');
    assert.equal(card.getAttribute('tabindex'), '0');
    assert.equal(card.getAttribute('aria-live'), null, 'card is not itself a live region');
  }
});

check('runtime: cargo:full + parallel toast → one floor live region, zero toast cards', () => {
  const dom = installDom();
  const bus = createBus();
  const state = { simTime: 0 };
  const helpers = {};
  createAlerts({ bus });
  createToasts({ bus });
  voiceArbiter.init({ bus, state, helpers });
  voiceArbiter.newGame();

  // Simulate the real multi-consumer cargo:full fan-out (alerts + floatingText toast).
  bus.emit('cargo:full', {});
  bus.emit('toast', { text: 'CARGO FULL', kind: 'warn', ttl: 3.5 });

  voiceArbiter.update(0, state);

  assert.equal(toastCards(dom).length, 0, 'no cargo toast card while arbiter owns the semantic');
  assert.equal(dom.toastLive.textContent, '', 'no cargo text in #toast-live');

  const floors = floorPills(dom);
  assert.equal(floors.length, 1, 'exactly one top-center floor pill');
  assert.match(floors[0].textContent, /CARGO HOLD FULL/);
  assert.equal(floors[0].getAttribute('role'), 'group');
  assert.equal(floors[0].getAttribute('aria-live'), 'off');
  assert.match(alertLiveRegion(dom, 'polite').textContent, /CARGO HOLD FULL/);
  assert.equal(alertLiveRegion(dom, 'assertive').textContent, '');
});

check('runtime: shield-down → one assertive floor, no toast card / toast-live', () => {
  const dom = installDom();
  const bus = createBus();
  const state = { simTime: 0 };
  const helpers = {};
  createAlerts({ bus });
  createToasts({ bus });
  voiceArbiter.init({ bus, state, helpers });
  voiceArbiter.newGame();

  bus.emit('combat:damage', { isPlayer: true, brokeShield: true, amount: 12 });
  // Parallel short mirror (would double-speak if not owned).
  bus.emit('toast', { text: 'SHIELDS DOWN', kind: 'danger', ttl: 3 });
  voiceArbiter.update(0, state);

  assert.equal(toastCards(dom).length, 0);
  assert.equal(dom.toastLive.textContent, '');
  const floors = floorPills(dom);
  assert.equal(floors.length, 1);
  assert.match(floors[0].textContent, /SHIELDS DOWN/);
  assert.equal(floors[0].getAttribute('aria-live'), 'off');
  assert.match(alertLiveRegion(dom, 'assertive').textContent, /SHIELDS DOWN/);
  assert.equal(alertLiveRegion(dom, 'polite').textContent, '');
});

check('runtime: identical floor re-surface does not rewrite spoken text (no second AT fire)', () => {
  const dom = installDom();
  const bus = createBus();
  createAlerts({ bus });

  bus.emit('voice:surface', {
    id: 'alert:cargo-full',
    channel: 'alert',
    priority: 80,
    text: 'CARGO HOLD FULL',
    kind: 'warn',
    ttl: 2.5,
  });
  const floors = floorPills(dom);
  assert.equal(floors.length, 1);
  const txtNode = floors[0].children[0] || floors[0];
  const first = txtNode._textContent != null ? txtNode._textContent : floors[0].textContent;

  // Re-surface same identity/text (coalesce path).
  bus.emit('voice:surface', {
    id: 'alert:cargo-full',
    channel: 'alert',
    priority: 80,
    text: 'CARGO HOLD FULL',
    kind: 'warn',
    ttl: 2.5,
  });
  assert.equal(floorPills(dom).length, 1);
  const second = txtNode._textContent != null ? txtNode._textContent : floors[0].textContent;
  assert.equal(second, first, 'identical re-surface keeps the same spoken string');
});

check('runtime: toast arrival still never steals focus (a11y truth)', () => {
  const dom = installDom();
  const bus = createBus();
  createToasts({ bus });
  const opener = document.createElement('button');
  opener.id = 'opener';
  document.body.appendChild(opener);
  opener.focus();
  assert.equal(document.activeElement, opener);

  bus.emit('toast', { text: 'Bought Pulse Laser S', kind: 'good', ttl: 3 });
  bus.emit('toast', { text: 'CARGO FULL', kind: 'warn', ttl: 3 }); // suppressed, still no focus steal

  assert.equal(document.activeElement, opener, 'focus stays on pre-toast control');
  assert.equal(toastCards(dom).length, 1, 'only the ACK toast rendered');
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log('');
console.log(`[first-hour-alert-dedupe] ${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
console.log('[first-hour-alert-dedupe] PASS');
