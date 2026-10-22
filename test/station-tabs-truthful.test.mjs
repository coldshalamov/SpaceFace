// R479 — the station destination rail must keep every tab truthful, reachable and keyboardable.
//
// The dock is a real ARIA tablist of seven destinations (market … ledger). The rail's own
// scroller hides its scrollbar, so a tab parked at the clip edge reads as clipped content —
// the stylesheet now carries scroll-padding, and this test pins the markup contract beside it:
// tablist/tab roles, aria wiring, roving tabindex, Arrow/Home/End inside the list, and
// scrollIntoView on activation. The DOM here is a MiniNode with a small innerHTML parser —
// the same harness shape as test/ui-virtual-list.test.mjs — no browser, no GPU.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCommandDock } from '../src/ui/station/dock.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------------------------
// MiniNode + a small parser: just enough DOM for the dock's innerHTML contract.
// ---------------------------------------------------------------------------------------------

class MiniNode {
  constructor(tagName = '', ownerDocument = null) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.ownerDocument = ownerDocument;
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this._scrolls = [];
    this.style = { setProperty: (k, v) => { this.style[k] = v; } };
    const cls = new Set();
    this.classList = {
      add: (...ns) => ns.forEach((n) => cls.add(n)),
      remove: (...ns) => ns.forEach((n) => cls.delete(n)),
      toggle: (n, force) => {
        const on = force === undefined ? !cls.has(n) : !!force;
        if (on) cls.add(n); else cls.delete(n);
        this.className = [...cls].join(' ');
        return on;
      },
      contains: (n) => cls.has(n),
    };
  }

  get innerHTML() { return this._html || ''; }
  set innerHTML(markup) {
    this._html = String(markup);
    for (const child of [...this.children]) this.removeChild(child);
    if (markup) for (const node of parseHtml(markup, this.ownerDocument)) this.appendChild(node);
  }

  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  append(...nodes) { for (const n of nodes) this.appendChild(n); }
  removeChild(node) {
    const i = this.children.indexOf(node);
    if (i >= 0) this.children.splice(i, 1);
    if (node) node.parentNode = null;
    return node;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }

  setAttribute(name, value) { this.attributes.set(String(name), String(value)); }
  getAttribute(name) { return this.attributes.has(String(name)) ? this.attributes.get(String(name)) : null; }
  removeAttribute(name) { this.attributes.delete(String(name)); }
  hasAttribute(name) { return this.attributes.has(String(name)); }

  addEventListener(type, fn) {
    const list = this.listeners.get(type) || [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  removeEventListener(type, fn) {
    const list = this.listeners.get(type) || [];
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }
  dispatch(type, event) {
    // Bubble like a real DOM: the target's listeners fire first, then ancestors'.
    if (event && event.target === undefined) event.target = this;
    let stopped = false;
    const stop = () => { stopped = true; };
    for (let cur = this; cur && !stopped; cur = cur.parentNode) {
      for (const fn of cur.listeners.get(type) || []) {
        fn({ stopPropagation: stop, preventDefault() {}, ...event });
      }
    }
  }

  contains(node) {
    for (let cur = node; cur; cur = cur.parentNode) if (cur === this) return true;
    return false;
  }
  closest(selector) {
    for (let cur = this; cur; cur = cur.parentNode) if (cur.tagName && matchesSelector(cur, selector)) return cur;
    return null;
  }
  focus() {
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }
  click() { this.dispatch('click', { target: this, preventDefault() {}, stopPropagation() {} }); }
  scrollIntoView(opts) { this._scrolls.push(opts || true); }
  getBoundingClientRect() { return { left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }; }

  querySelector(selector) {
    for (const node of walk(this)) if (matchesSelector(node, selector)) return node;
    return null;
  }
  querySelectorAll(selector) {
    return [...walk(this)].filter((node) => matchesSelector(node, selector));
  }
}

function* walk(root) {
  for (const child of root.children) {
    yield child;
    yield* walk(child);
  }
}

/** Compound selector only: tag, .cls, #id, [attr], [attr="v"] — all parts must match (no combinators). */
function matchesSelector(node, selector) {
  const parts = String(selector).match(/[.#]?[\w-]+|\[[^\]]+\]/g) || [];
  for (const part of parts) {
    if (part.startsWith('.')) {
      if (!node.className.split(/\s+/).includes(part.slice(1))) return false;
    } else if (part.startsWith('#')) {
      if (node.getAttribute('id') !== part.slice(1)) return false;
    } else if (part.startsWith('[')) {
      const inner = part.slice(1, -1);
      const eq = inner.indexOf('=');
      if (eq < 0) { if (!node.hasAttribute(inner)) return false; }
      else {
        const name = inner.slice(0, eq).trim();
        const value = inner.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (node.getAttribute(name) !== value) return false;
      }
    } else if (node.tagName !== part.toUpperCase()) return false;
  }
  return true;
}

/** Minimal parser for the dock's generated markup: tags, "attrs", self-closing, text. */
function parseHtml(markup, doc) {
  const roots = [];
  const stack = [];
  const token = /<\/?[\w-]+(?:\s[^<>]*?)?\/?>|[^<]+/g;
  let m;
  while ((m = token.exec(markup))) {
    const raw = m[0];
    if (raw.startsWith('</')) { stack.pop(); continue; }
    if (raw.startsWith('<')) {
      const selfClose = raw.endsWith('/>');
      const inner = raw.slice(1, raw.length - (selfClose ? 2 : 1)).trim();
      const sp = inner.search(/[\s/]/);
      const tag = (sp < 0 ? inner : inner.slice(0, sp)).toLowerCase();
      const node = doc.createElement(tag);
      const attrSrc = sp < 0 ? '' : inner.slice(sp);
      const attrRe = /([\w-]+)(?:\s*=\s*"([^"]*)")?/g;
      let a;
      while ((a = attrRe.exec(attrSrc))) {
        node.setAttribute(a[1], a[2] === undefined ? '' : a[2]);
      }
      if (node.hasAttribute('class')) node.className = node.getAttribute('class');
      if (node.hasAttribute('hidden')) node.hidden = true;
      const parent = stack[stack.length - 1] || null;
      if (parent) parent.appendChild(node); else roots.push(node);
      if (!selfClose) stack.push(node);
    } else {
      const parent = stack[stack.length - 1];
      if (parent) parent.textContent += raw;
    }
  }
  return roots;
}

function installDom() {
  const doc = {
    activeElement: null,
    createElement: (tag) => new MiniNode(tag, doc),
  };
  return doc;
}

function harness() {
  const doc = installDom();
  const previous = globalThis.document;
  globalThis.document = doc;
  const navigated = [];
  const dock = createCommandDock({
    destinations: [
      { id: 'market', label: 'Market' },
      { id: 'shipworks', label: 'Shipworks' },
      { id: 'industry', label: 'Industry' },
      { id: 'contracts', label: 'Missions' },
      { id: 'factions', label: 'Factions' },
      { id: 'bar', label: 'Bar' },
      { id: 'ledger', label: 'Ledger' },
    ],
    onNavigate: (id) => navigated.push(id),
  });
  const restore = () => { globalThis.document = previous; };
  const navGroup = dock.el.querySelector('.sx-dock__group--nav');
  const tabs = dock.el.querySelectorAll('[data-nav]');
  const keydown = (key) => navGroup.dispatch('keydown', { key, preventDefault() {} });
  return { doc, dock, navGroup, tabs, navigated, keydown, restore };
}

// ---------------------------------------------------------------------------------------------
// Markup — the tablist a screen reader and the rail's scroller actually consume
// ---------------------------------------------------------------------------------------------

test('the destination rail is a real tablist: roles, labels, aria wiring, presentation listitems', (t) => {
  const h = harness();
  t.after(h.restore);
  assert.equal(h.dock.el.getAttribute('role'), 'toolbar');
  assert.equal(h.dock.el.getAttribute('aria-label'), 'Station destinations');
  assert.equal(h.dock.el.getAttribute('aria-orientation'), 'horizontal');
  assert.equal(h.navGroup.getAttribute('role'), 'tablist');
  assert.equal(h.navGroup.getAttribute('aria-orientation'), 'horizontal');
  assert.equal(h.tabs.length, 7, 'all seven destinations present');
  const wanted = ['market', 'shipworks', 'industry', 'contracts', 'factions', 'bar', 'ledger'];
  assert.deepEqual(h.tabs.map((tab) => tab.getAttribute('data-nav')), wanted);
  for (const tab of h.tabs) {
    const id = tab.getAttribute('data-nav');
    assert.equal(tab.tagName, 'BUTTON');
    assert.equal(tab.getAttribute('role'), 'tab');
    assert.equal(tab.getAttribute('id'), `sx-tab-${id}`);
    assert.equal(tab.getAttribute('aria-controls'), 'sx-panel');
    assert.equal(tab.getAttribute('aria-selected'), 'false');
    assert.equal(tab.getAttribute('tabindex'), '-1', 'roving tabindex starts off the tab order');
    assert.ok((tab.getAttribute('aria-label') || '').length > 0, `${id} carries a real name`);
    assert.doesNotMatch(tab.getAttribute('aria-label'), /undefined|null/i);
    // The <li> wrapper must not read as a stray listitem inside the tablist.
    assert.equal(tab.parentNode.tagName, 'LI');
    assert.equal(tab.parentNode.getAttribute('role'), 'presentation');
    // The tab's word is rendered text, never an icon-only control.
    const label = tab.querySelector('.sx-tile__label');
    assert.ok(label && label.textContent.length > 0, `${id} has a visible label`);
    assert.doesNotMatch(label.textContent, /undefined|null/i);
  }
});

test('setActive makes exactly one tab stop, marks it current, and parks it inside the scroller', (t) => {
  const h = harness();
  t.after(h.restore);
  h.dock.setActive('factions');
  const stops = h.tabs.filter((tab) => tab.getAttribute('tabindex') === '0');
  assert.equal(stops.length, 1, 'roving tabindex leaves exactly one stop');
  assert.equal(stops[0].getAttribute('data-nav'), 'factions');
  for (const tab of h.tabs) {
    const on = tab.getAttribute('data-nav') === 'factions';
    assert.equal(tab.getAttribute('aria-selected'), on ? 'true' : 'false', tab.getAttribute('data-nav'));
    assert.equal(tab.getAttribute('aria-current'), on ? 'true' : null, tab.getAttribute('data-nav'));
    assert.equal(tab.classList.contains('is-active'), on);
    assert.equal(tab._scrolls.length, on ? 1 : 0, `${tab.getAttribute('data-nav')} scrolls exactly once`);
  }
  assert.deepEqual(stops[0]._scrolls[0], { block: 'nearest', inline: 'nearest' },
    'the active tab scrolls nearest — reachable, not centered');
  h.dock.setActive('bar');
  assert.equal(h.tabs.filter((tab) => tab.getAttribute('tabindex') === '0').length, 1);
  assert.equal(h.tabs.filter((tab) => tab.getAttribute('aria-current') === 'true').length, 1,
    'exactly one tab carries aria-current after a second activation');
});

test('Arrow keys, Home and End move inside the tablist and emit the navigate intent', (t) => {
  const h = harness();
  t.after(h.restore);
  const { doc, tabs, navigated, keydown } = h;
  doc.activeElement = tabs[0];
  keydown('ArrowRight');
  assert.equal(doc.activeElement, tabs[1], 'ArrowRight moves focus one tab right');
  assert.deepEqual(navigated, ['shipworks']);
  keydown('ArrowLeft');
  assert.equal(doc.activeElement, tabs[0]);
  assert.deepEqual(navigated, ['shipworks', 'market']);
  keydown('ArrowUp');
  assert.equal(doc.activeElement, tabs[6], 'ArrowUp wraps backwards to the last tab');
  assert.equal(navigated[2], 'ledger');
  keydown('ArrowDown');
  assert.equal(doc.activeElement, tabs[0], 'ArrowDown wraps forwards to the first tab');
  keydown('End');
  assert.equal(doc.activeElement, tabs[6], 'End jumps to the last destination');
  keydown('Home');
  assert.equal(doc.activeElement, tabs[0], 'Home jumps to the first destination');
  // Focus outside the list: the handler must not guess a tab or swallow the key.
  doc.activeElement = null;
  const before = navigated.length;
  keydown('ArrowRight');
  assert.equal(navigated.length, before, 'no phantom navigation when focus is outside the tablist');
});

test('clicking a tab emits its destination id — the rail never eats a press', (t) => {
  const h = harness();
  t.after(h.restore);
  // The dock's listener lives on the rail root; MiniNode dispatch bubbles through the li + ul.
  h.tabs[5].click();
  h.dock.el.dispatch('click', {
    target: h.tabs[2],
    preventDefault() {},
    stopPropagation() {},
  });
  assert.deepEqual(h.navigated.slice(-2), ['bar', 'industry']);
});

// ---------------------------------------------------------------------------------------------
// The scroller's own contract — the stylesheet must keep the hidden-scrollbar rail reachable
// ---------------------------------------------------------------------------------------------

function ruleBlock(css, selector) {
  const idx = css.indexOf(selector);
  assert.ok(idx >= 0, `missing rule for ${selector}`);
  const open = css.indexOf('{', idx);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

test('the dock scroller pads its scroll edges so no tab parks flush against the clip', () => {
  const css = readFileSync(path.join(ROOT, 'styles', 'station-orbital.css'), 'utf8');
  const rule = ruleBlock(css, '.sx-dock {');
  assert.match(rule, /overflow:\s*auto\s+hidden/, 'the rail is a horizontal scroller');
  assert.match(rule, /scrollbar-width:\s*none/, 'the scrollbar is intentionally hidden');
  const pad = /scroll-padding:\s*([\d.]+)px\s+([\d.]+)px/.exec(rule);
  assert.ok(pad, 'scroll-padding must exist — without it a tab parks flush at the clip edge');
  assert.ok(Number(pad[2]) > 0, 'the inline clearance is non-zero');
});

test('the faction index and stage keep their own scroll affordances — long lists stay reachable', () => {
  const css = readFileSync(path.join(ROOT, 'styles', 'station.css'), 'utf8');
  for (const sel of ['.sx-fac__rows', '.sx-fac__stage']) {
    const rule = ruleBlock(css, `${sel} {`);
    assert.match(rule, /overflow:\s*hidden\s+auto/, `${sel} scrolls vertically without horizontal clip`);
    assert.match(rule, /min-height:\s*0/, `${sel} can shrink inside its bounded host`);
  }
});
