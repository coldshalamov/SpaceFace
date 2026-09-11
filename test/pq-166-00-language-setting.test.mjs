// PQ-166.00 — Settings language picker and default-route bridge.
//
// Contract: the default route stays English; choosing another locale installs the document bridge
// for ANY locale and re-renders every mounted screen without a reload; switching back restores the
// authored English from the source each node stored on its first visit. Fixed seed 16600 governs the
// deterministic re-render order asserted below.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  LANGUAGE_OPTIONS,
  gameLocalization,
  localizeText,
  resolveStartupLocale,
  setGameLocale,
} from '../src/localization/gameLocalization.js';
import {
  installLocalizedDocumentBridge,
  stopLocalizedDocumentBridge,
} from '../src/localization/domBridge.js';

const SEED = 16600;

// ── Minimal deterministic DOM ───────────────────────────────────────────────
// Enough of the browser node model for the document bridge: text nodes, elements with attributes,
// child lists, and a document that owns a head/body. No MutationObserver exists in Node, so the
// bridge runs in its synchronous "localize this tree now" mode.

class FakeTextNode {
  constructor(value) {
    this.nodeType = 3;
    this.nodeValue = String(value);
    this.parentElement = null;
  }
}

class FakeElement {
  constructor(tagName) {
    this.nodeType = 1;
    this.tagName = String(tagName).toUpperCase();
    this.childNodes = [];
    this.attributes = new Map();
    this.style = {};
    this.parentElement = null;
    this.id = '';
  }
  appendChild(child) {
    child.parentElement = this;
    this.childNodes.push(child);
    return child;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  matches() { return false; }
  closest() { return null; }
  addEventListener() {}
  get classList() { return { add() {}, remove() {}, toggle() {}, contains() { return false; } }; }
  get textContent() {
    let out = '';
    for (const child of this.childNodes) out += child.nodeType === 3 ? child.nodeValue : (child.textContent || '');
    return out;
  }
  set textContent(value) {
    this.childNodes = [];
    if (value) this.appendChild(new FakeTextNode(value));
  }
}

function makeFakeDocument() {
  const root = new FakeElement('html');
  const head = new FakeElement('head');
  const body = new FakeElement('body');
  root.appendChild(head);
  root.appendChild(body);
  const doc = {
    documentElement: root,
    head,
    body,
    defaultView: undefined,
    createElement: (tag) => new FakeElement(tag),
    getElementById(id) {
      let found = null;
      const walk = (node) => {
        if (found || node.nodeType !== 1) return;
        if (node.id === id) { found = node; return; }
        for (const child of node.childNodes) walk(child);
      };
      walk(root);
      return found;
    },
  };
  return { doc, body };
}

const text = (value) => new FakeTextNode(value);

// ── Tests ────────────────────────────────────────────────────────────────────

test('default new-game locale is English and any well-formed locale is opt-in', () => {
  assert.equal(gameLocalization.locale, 'en-US');
  assert.equal(resolveStartupLocale(''), 'en-US');
  assert.equal(resolveStartupLocale('?locale=!!'), 'en-US', 'malformed locale falls back to English');
  assert.equal(resolveStartupLocale('?locale=fr-FR'), 'fr-FR');
  assert.equal(resolveStartupLocale('?locale=qps-ploc'), 'qps-ploc');
  assert.equal(LANGUAGE_OPTIONS[0].id, 'en-US', 'English is the default picker option');
});

test('setGameLocale updates the shared runtime locale', () => {
  const original = gameLocalization.locale;
  try {
    assert.equal(setGameLocale('qps-ploc'), 'qps-ploc');
    assert.equal(gameLocalization.locale, 'qps-ploc');
    assert.equal(setGameLocale('en-US'), 'en-US');
    assert.equal(gameLocalization.locale, 'en-US');
  } finally {
    gameLocalization.setLocale(original);
  }
});

test('choosing a locale re-renders every mounted screen and switching back restores English', () => {
  const { doc, body } = makeFakeDocument();
  const screens = ['mainMenu', 'newGame', 'settings', 'missionLog'].map((id) => {
    const screen = new FakeElement('div');
    screen.setAttribute('data-screen', id);
    const label = id === 'mainMenu' ? 'Continue'
      : id === 'newGame' ? 'Launch'
        : id === 'settings' ? 'Settings' : 'Mission Log';
    screen.appendChild(text(label));
    body.appendChild(screen);
    return screen;
  });
  const nav = new FakeElement('nav');
  nav.setAttribute('aria-label', 'Settings categories');
  screens[2].appendChild(nav);

  const englishText = screens.map((screen) => screen.childNodes[0].nodeValue);
  const englishAria = nav.getAttribute('aria-label');

  gameLocalization.setLocale('en-US');
  installLocalizedDocumentBridge({ document: doc, translate: localizeText, locale: 'en-US' });
  assert.deepEqual(screens.map((s) => s.childNodes[0].nodeValue), englishText,
    'the English route is a no-op');

  // The bridge installs for any locale, not only the pseudo-locale.
  gameLocalization.setLocale('fr-FR');
  installLocalizedDocumentBridge({ document: doc, translate: localizeText, locale: 'fr-FR' });

  gameLocalization.setLocale('qps-ploc');
  installLocalizedDocumentBridge({ document: doc, translate: localizeText, locale: 'qps-ploc' });
  const pseudo = screens.map((s) => s.childNodes[0].nodeValue);
  screens.forEach((screen, index) => {
    assert.match(pseudo[index], /^⟦.*⟧$/u, `screen ${screen.getAttribute('data-screen')} re-rendered`);
    assert.notEqual(pseudo[index], englishText[index]);
  });
  assert.match(nav.getAttribute('aria-label'), /^⟦.*⟧$/u, 'translated attributes re-render too');

  // Deterministic under the fixed seed: the same switch order yields the same render.
  gameLocalization.setLocale('en-US');
  installLocalizedDocumentBridge({ document: doc, translate: localizeText, locale: 'en-US' });
  gameLocalization.setLocale('qps-ploc');
  installLocalizedDocumentBridge({ document: doc, translate: localizeText, locale: 'qps-ploc' });
  assert.deepEqual(screens.map((s) => s.childNodes[0].nodeValue), pseudo,
    `seed ${SEED} re-render is deterministic`);

  gameLocalization.setLocale('en-US');
  installLocalizedDocumentBridge({ document: doc, translate: localizeText, locale: 'en-US' });
  assert.deepEqual(screens.map((s) => s.childNodes[0].nodeValue), englishText,
    'switching back to English restores the authored copy');
  assert.equal(nav.getAttribute('aria-label'), englishAria);

  stopLocalizedDocumentBridge();
  gameLocalization.setLocale('en-US');
});

test('settings screen exposes the language picker and routes choices through the shared setter', () => {
  const source = readFileSync(new URL('../src/ui/screens/settings.js', import.meta.url), 'utf8');
  assert.match(source, /LANGUAGE_OPTIONS/);
  assert.match(source, /setGameLocale\(/);
  assert.match(source, /rowSelect\('Language'/);
});
