// NXI-098 — a sealed held lot stays on the sell list, and Sell does not take it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { isUnsellableCargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import {
  createMarketHistoryBackfill,
  createMarketScreen,
  marketPriceHistorySeries,
} from '../src/ui/station/screens/market.js';
import { installSimCommandSink, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
import {
  clearTradeExpectation,
  consumeStationTradeReceipt,
  tradeClearedReceipt,
  TRADE_EXPECTATION_KEY,
} from '../src/ui/station/tradeReceipt.js';

const CHIPS = 'cmdty_microchips';
const FOOD = 'cmdty_food';
const STATION = 'station_test';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

function decode(text) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function installDom() {
  const saved = {
    document: globalThis.document,
    raf: globalThis.requestAnimationFrame,
    caf: globalThis.cancelAnimationFrame,
    style: globalThis.getComputedStyle,
  };
  let rafId = 0;
  const doc = makeDocument();
  doc.documentElement.classList.add('sf-reduce-motion');
  globalThis.document = doc;
  globalThis.requestAnimationFrame = (fn) => {
    rafId += 1;
    return rafId;
  };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.getComputedStyle = () => ({
    display: 'block',
    position: 'static',
    getPropertyValue() { return ''; },
  });
  return {
    document: doc,
    restore() {
      globalThis.document = saved.document;
      globalThis.requestAnimationFrame = saved.raf;
      globalThis.cancelAnimationFrame = saved.caf;
      globalThis.getComputedStyle = saved.style;
    },
  };
}

function makeDocument() {
  const nodes = new Set();
  function make(tagName) {
    const node = {
      nodeType: 1,
      tagName: String(tagName || 'div').toUpperCase(),
      id: '',
      childNodes: [],
      parentNode: null,
      ownerDocument: null,
      attributes: {},
      dataset: {},
      listeners: {},
      style: {
        setProperty(name, value) { this[name] = value; },
        getPropertyValue(name) { return this[name] || ''; },
      },
      _className: '',
      _value: '',
      get className() { return this._className; },
      set className(value) {
        this._className = String(value || '');
        this.attributes.class = this._className;
      },
      get value() { return this._value; },
      set value(v) { this._value = String(v ?? ''); this.attributes.value = this._value; },
      get disabled() { return this.hasAttribute('disabled'); },
      set disabled(v) { if (v) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); },
      get hidden() { return this.hasAttribute('hidden'); },
      set hidden(v) { if (v) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); },
      get children() { return this.childNodes.filter((child) => child.nodeType === 1); },
      get firstChild() { return this.childNodes[0] || null; },
      get firstElementChild() { return this.children[0] || null; },
      get parentElement() {
        const parent = this.parentNode;
        return parent && parent.nodeType === 1 ? parent : null;
      },
      get nextSibling() { return sibling(this, 1, false); },
      get nextElementSibling() { return sibling(this, 1, true); },
      get textContent() { return textOf(this); },
      set textContent(value) {
        this.childNodes = [];
        if (value != null && String(value) !== '') this.childNodes.push(makeText(String(value), this));
      },
      get innerHTML() { return this.childNodes.map(serialize).join(''); },
      set innerHTML(value) {
        this.childNodes = [];
        parseInto(String(value ?? ''), this, 0);
      },
      get outerHTML() { return serialize(this); },
      set outerHTML(value) { replaceNode(this, String(value ?? '')); },
      classList: null,
      setAttribute(name, value) {
        const key = String(name);
        const text = String(value);
        this.attributes[key] = text;
        if (key === 'class') this._className = text;
        if (key === 'id') this.id = text;
        if (key === 'value') this._value = text;
        if (key.startsWith('data-')) {
          const prop = key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          this.dataset[prop] = text;
        }
      },
      getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; },
      hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); },
      removeAttribute(name) {
        delete this.attributes[name];
        if (name === 'class') this._className = '';
        if (name === 'id') this.id = '';
      },
      addEventListener(type, fn) {
        (this.listeners[type] = this.listeners[type] || []).push(fn);
      },
      removeEventListener() {},
      appendChild(child) { return this.insertBefore(child, null); },
      append(...kids) { for (const kid of kids) this.appendChild(kid); },
      insertBefore(child, ref) {
        detach(child);
        child.parentNode = this;
        child.ownerDocument = this.ownerDocument;
        const at = ref ? this.childNodes.indexOf(ref) : -1;
        if (at >= 0) this.childNodes.splice(at, 0, child);
        else this.childNodes.push(child);
        return child;
      },
      remove() { detach(this); },
      replaceWith(...kids) { replaceWithNodes(this, kids); },
      contains(other) {
        let cursor = other;
        while (cursor) {
          if (cursor === this) return true;
          cursor = cursor.parentNode;
        }
        return false;
      },
      focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; },
      scrollIntoView() {},
      getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
      setPointerCapture() {},
      releasePointerCapture() {},
      click() { dispatch(this, 'click'); },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      querySelectorAll(selector) { return queryAll(this, selector, false); },
      closest(selector) {
        let cursor = this;
        while (cursor && cursor.nodeType === 1) {
          if (matchesChain(cursor, tokenize(selector), cursor)) return cursor;
          cursor = cursor.parentElement;
        }
        return null;
      },
      matches(selector) { return matchesChain(this, tokenize(selector), this); },
    };
    node.ownerDocument = null;
    node.classList = classListFor(node);
    nodes.add(node);
    return node;
  }

  function makeText(value, parent) {
    return {
      nodeType: 3,
      parentNode: parent,
      ownerDocument: parent ? parent.ownerDocument : null,
      textContent: value,
      data: value,
    };
  }

  function classListFor(node) {
    const names = () => node._className.split(/\s+/).filter(Boolean);
    return {
      add(...list) {
        const have = new Set(names());
        for (const name of list) if (name) have.add(name);
        node.className = [...have].join(' ');
      },
      remove(...list) {
        const drop = new Set(list);
        node.className = names().filter((name) => !drop.has(name)).join(' ');
      },
      toggle(name, force) {
        const has = names().includes(name);
        const want = force == null ? !has : !!force;
        if (want) this.add(name);
        else this.remove(name);
        return want;
      },
      contains(name) { return names().includes(name); },
    };
  }

  const doc = {
    nodeType: 9,
    activeElement: null,
    createElement: (tag) => {
      const el = make(tag);
      el.ownerDocument = doc;
      return el;
    },
    createElementNS: (_ns, tag) => doc.createElement(tag),
    createTextNode: (value) => makeText(String(value), null),
    getElementById(id) {
      const visit = (node) => {
        if (!node || node.nodeType !== 1) return null;
        if (node.id === id) return node;
        for (const child of node.childNodes) {
          const found = visit(child);
          if (found) return found;
        }
        return null;
      };
      return visit(doc.documentElement);
    },
    querySelector(selector) { return doc.documentElement.querySelector(selector); },
    querySelectorAll(selector) { return doc.documentElement.querySelectorAll(selector); },
  };
  const root = make('html');
  const head = make('head');
  const body = make('body');
  root.ownerDocument = doc;
  head.ownerDocument = doc;
  body.ownerDocument = doc;
  root.appendChild(head);
  root.appendChild(body);
  doc.documentElement = root;
  doc.head = head;
  doc.body = body;
  root.parentNode = doc;

  function parseInto(html, parent, start) {
    let i = start;
    while (i < html.length) {
      if (html.startsWith('<!--', i)) {
        const end = html.indexOf('-->', i + 4);
        i = end < 0 ? html.length : end + 3;
        continue;
      }
      if (html[i] === '<') {
        if (html[i + 1] === '/') {
          const end = findTagEnd(html, i);
          return end < 0 ? html.length : end + 1;
        }
        const end = findTagEnd(html, i);
        if (end < 0) return html.length;
        let raw = html.slice(i + 1, end).trim();
        const selfClose = raw.endsWith('/');
        if (selfClose) raw = raw.slice(0, -1).trim();
        const splitAt = raw.search(/\s/);
        const tag = (splitAt < 0 ? raw : raw.slice(0, splitAt)).toLowerCase();
        const el = make(tag);
        el.ownerDocument = parent.ownerDocument;
        readAttrs(el, splitAt < 0 ? '' : raw.slice(splitAt));
        parent.childNodes.push(el);
        el.parentNode = parent;
        i = end + 1;
        if (!selfClose && !VOID.has(tag)) i = parseInto(html, el, i);
        continue;
      }
      const next = html.indexOf('<', i);
      const text = html.slice(i, next < 0 ? html.length : next);
      if (text) parent.childNodes.push(makeText(decode(text), parent));
      i = next < 0 ? html.length : next;
    }
    return i;
  }

  function readAttrs(el, text) {
    const re = /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let match;
    while ((match = re.exec(text))) {
      const value = match[2] ?? match[3] ?? match[4] ?? '';
      el.setAttribute(match[1], decode(value));
    }
  }

  doc._parse = parseInto;
  return doc;
}

function findTagEnd(html, i) {
  let quote = '';
  for (let j = i; j < html.length; j++) {
    const ch = html[j];
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '>') return j;
  }
  return -1;
}

function sibling(node, dir, elementsOnly) {
  const parent = node.parentNode;
  if (!parent || !parent.childNodes) return null;
  const index = parent.childNodes.indexOf(node);
  for (let i = index + dir; i >= 0 && i < parent.childNodes.length; i += dir) {
    const candidate = parent.childNodes[i];
    if (!elementsOnly || candidate.nodeType === 1) return candidate;
  }
  return null;
}

function textOf(node) {
  if (!node) return '';
  if (node.nodeType === 3) return node.textContent;
  return node.childNodes.map(textOf).join('');
}

function serialize(node) {
  if (!node || node.nodeType === 3) return node ? node.textContent : '';
  const attrs = Object.entries(node.attributes).map(([key, value]) => value === '' ? key : `${key}="${value}"`).join(' ');
  const open = attrs ? `<${node.tagName.toLowerCase()} ${attrs}>` : `<${node.tagName.toLowerCase()}>`;
  if (VOID.has(node.tagName.toLowerCase())) return open;
  return `${open}${node.childNodes.map(serialize).join('')}</${node.tagName.toLowerCase()}>`;
}

function detach(node) {
  const parent = node && node.parentNode;
  if (!parent || !parent.childNodes) return;
  const index = parent.childNodes.indexOf(node);
  if (index >= 0) parent.childNodes.splice(index, 1);
  node.parentNode = null;
}

function replaceNode(node, html) {
  const parent = node.parentNode;
  if (!parent) return;
  const holder = node.ownerDocument.createElement('div');
  holder.innerHTML = html;
  const kids = holder.childNodes.splice(0);
  const index = parent.childNodes.indexOf(node);
  node.parentNode = null;
  for (const kid of kids) {
    kid.parentNode = parent;
    kid.ownerDocument = node.ownerDocument;
  }
  parent.childNodes.splice(index, 1, ...kids);
}

function replaceWithNodes(node, kids) {
  const parent = node.parentNode;
  if (!parent) return;
  const index = parent.childNodes.indexOf(node);
  detach(node);
  const fresh = [];
  for (const kid of kids) {
    if (kid == null) continue;
    const el = typeof kid === 'string' ? node.ownerDocument.createTextNode(kid) : kid;
    detach(el);
    el.parentNode = parent;
    fresh.push(el);
  }
  parent.childNodes.splice(index, 0, ...fresh);
}

function dispatch(target, type) {
  const event = {
    target,
    currentTarget: target,
    button: 0,
    clientX: 0,
    clientY: 0,
    key: '',
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.stopped = true; },
  };
  const chain = [];
  let cursor = target;
  while (cursor) {
    chain.push(cursor);
    cursor = cursor.parentNode;
  }
  for (const node of chain) {
    event.currentTarget = node;
    for (const fn of [...(node.listeners && node.listeners[type] || [])]) fn(event);
    if (event.stopped) break;
  }
}

function tokenize(selector) {
  const tokens = [];
  const source = String(selector || '').trim();
  let i = 0;
  while (i < source.length) {
    if ('>+~'.includes(source[i])) {
      tokens.push({ type: 'comb', value: source[i] });
      i += 1;
      continue;
    }
    if (/\s/.test(source[i])) {
      let j = i;
      while (j < source.length && /\s/.test(source[j])) j += 1;
      if (j < source.length && !'>+~'.includes(source[j])) tokens.push({ type: 'comb', value: ' ' });
      i = j;
      continue;
    }
    let j = i;
    while (j < source.length && !/\s/.test(source[j]) && !'>+~'.includes(source[j])) {
      if (source[j] === '[') {
        const end = source.indexOf(']', j);
        j = end < 0 ? source.length : end + 1;
      } else if (source[j] === '(') {
        const end = source.indexOf(')', j);
        j = end < 0 ? source.length : end + 1;
      } else j += 1;
    }
    tokens.push({ type: 'comp', value: source.slice(i, j) });
    i = j;
  }
  return tokens;
}

function matchCompound(el, compound, scope) {
  if (!el || el.nodeType !== 1) return false;
  const source = compound.trim();
  if (!source) return false;
  let i = 0;
  if (source[i] === '*') i += 1;
  else if (/[a-z]/i.test(source[i])) {
    let j = i;
    while (j < source.length && /[a-z0-9-]/i.test(source[j])) j += 1;
    if (el.tagName.toLowerCase() !== source.slice(i, j).toLowerCase()) return false;
    i = j;
  }
  if (i >= source.length && source[0] !== '*' && !/[a-z]/i.test(source[0])) return false;
  while (i < source.length) {
    if (source[i] === '.') {
      let j = i + 1;
      while (j < source.length && /[a-z0-9_-]/i.test(source[j])) j += 1;
      if (!el.classList.contains(source.slice(i + 1, j))) return false;
      i = j;
    } else if (source[i] === '#') {
      let j = i + 1;
      while (j < source.length && /[a-z0-9_-]/i.test(source[j])) j += 1;
      if (el.id !== source.slice(i + 1, j)) return false;
      i = j;
    } else if (source[i] === '[') {
      const end = source.indexOf(']', i);
      const body = source.slice(i + 1, end < 0 ? source.length : end);
      const parsed = /^([^\s=~|^$*\]]+)(?:([~|^$*]?=)\s*(.*))?$/.exec(body.trim());
      if (!parsed) return false;
      const name = parsed[1];
      if (!parsed[2]) {
        if (!el.hasAttribute(name)) return false;
      } else {
        const raw = parsed[3].trim().replace(/^['"]|['"]$/g, '');
        const have = el.getAttribute(name) ?? '';
        const op = parsed[2];
        if (op === '=' && have !== raw) return false;
        if (op === '*=' && !have.includes(raw)) return false;
        if (op === '^=' && !have.startsWith(raw)) return false;
        if (op === '$=' && !have.endsWith(raw)) return false;
        if (op === '~=' && !have.split(/\s+/).includes(raw)) return false;
      }
      i = (end < 0 ? source.length : end) + 1;
    } else if (source.startsWith(':scope', i)) {
      if (el !== scope) return false;
      i += 6;
    } else if (source.startsWith(':not(', i)) {
      const end = source.indexOf(')', i);
      if (matchCompound(el, source.slice(i + 5, end), scope)) return false;
      i = end + 1;
    } else return false;
  }
  return true;
}

function matchesChain(el, tokens, scope) {
  if (!tokens.length || tokens[tokens.length - 1].type !== 'comp') return false;
  let cursor = el;
  let index = tokens.length - 1;
  if (!matchCompound(cursor, tokens[index].value, scope)) return false;
  index -= 1;
  while (index >= 0) {
    const comb = tokens[index];
    const comp = tokens[index - 1];
    if (!comb || comb.type !== 'comb' || !comp || comp.type !== 'comp') return false;
    if (comb.value === '>') {
      cursor = cursor.parentElement;
      if (!cursor || !matchCompound(cursor, comp.value, scope)) return false;
    } else if (comb.value === ' ') {
      let parent = cursor.parentElement;
      let found = null;
      while (parent) {
        if (matchCompound(parent, comp.value, scope)) { found = parent; break; }
        parent = parent.parentElement;
      }
      if (!found) return false;
      cursor = found;
    } else return false;
    index -= 2;
  }
  return true;
}

function queryAll(root, selector, includeSelf) {
  const groups = String(selector || '').split(',').map((part) => part.trim()).filter(Boolean);
  const found = [];
  const seen = new Set();
  const descendants = [];
  const walk = (node, skip) => {
    if (!node || !node.childNodes) return;
    for (const child of node.childNodes) {
      if (child.nodeType !== 1) continue;
      if (!skip) descendants.push(child);
      walk(child, false);
    }
  };
  if (includeSelf && root.nodeType === 1) descendants.push(root);
  walk(root, false);
  for (const group of groups) {
    const tokens = tokenize(group);
    for (const el of descendants) {
      if (seen.has(el)) continue;
      if (matchesChain(el, tokens, root)) {
        seen.add(el);
        found.push(el);
      }
    }
  }
  return found;
}

function listing(buy, sell) {
  return { stock: 20, buy, sell, lastBuy: buy, lastSell: sell };
}

function holdState(chipsQty, foodQty) {
  const items = { [CHIPS]: chipsQty };
  if (foodQty > 0) items[FOOD] = foodQty;
  return {
    meta: { seed: 98 },
    simTime: 0,
    mode: 'station',
    story: { persistentCargo: [] },
    missions: {
      active: [{
        id: 'delivery',
        status: 'active',
        preloadedCargo: true,
        params: { cmdtyId: CHIPS },
      }],
    },
    player: {
      credits: 5000,
      cargo: { items, capVolume: 80, usedVolume: 10, usedMass: 10 },
      stats: {},
      tradeLedger: [],
      tradeLots: {},
    },
    economy: {
      markets: {
        [STATION]: {
          [CHIPS]: listing(40, 30),
          [FOOD]: listing(12, 8),
        },
      },
    },
    ui: { dockedStationId: STATION },
    world: { sectors: {} },
  };
}

function sealedRefusal(state) {
  const emitted = [];
  const system = {
    ...economy,
    state: structuredClone(state),
    bus: { emit(name, payload) { emitted.push({ name, payload }); } },
    dockedStationId() { return STATION; },
    quote(_stationId, commodityId, side, qty) {
      return { ok: true, side, qty, total: qty * 10, commodityId };
    },
    registryGet() { return null; },
    grantCredits() {},
    recomputeLivePrices() {},
    afterTrade() {},
  };
  system.handleTrade(CHIPS, 'sell', 1);
  const toast = emitted.find((entry) => entry.name === 'toast');
  assert.ok(toast && toast.payload && toast.payload.text, 'the economy refusal is the note the counter shows');
  return toast.payload.text;
}

function openSell(state) {
  const emitted = [];
  const bus = {
    emit(name, payload) { emitted.push({ name, payload }); },
    on() { return () => {}; },
  };
  const screen = createMarketScreen({
    state,
    bus,
    registry: {
      get(name) {
        if (name !== 'economy') return null;
        return {
          quote(_stationId, commodityId, side, qty) {
            return { ok: true, side, qty, total: qty * 10, commodityId, partial: false, priceImpactPct: 0 };
          },
        };
      },
    },
  });
  document.body.appendChild(screen.el);
  screen.onShow({ tradeMode: 'sell', state });
  return { screen, emitted };
}

function openSellWithEventBus(state, quoteState, tradeMode = 'sell') {
  const emitted = [];
  const handlers = new Map();
  const bus = {
    emit(name, payload) {
      emitted.push({ name, payload });
      for (const handler of [...(handlers.get(name) || [])]) handler(payload);
    },
    on(name, handler) {
      const list = handlers.get(name) || [];
      list.push(handler);
      handlers.set(name, list);
      return () => handlers.set(name, (handlers.get(name) || []).filter((entry) => entry !== handler));
    },
    off(name, handler) {
      handlers.set(name, (handlers.get(name) || []).filter((entry) => entry !== handler));
    },
  };
  const screen = createMarketScreen({
    state,
    bus,
    registry: {
      get(name) {
        if (name !== 'economy') return null;
        return {
          quote(_stationId, commodityId, side, qty) {
            return { ok: true, side, qty, total: quoteState.total, commodityId, partial: false, priceImpactPct: 0 };
          },
        };
      },
    },
  });
  document.body.appendChild(screen.el);
  screen.onShow({ tradeMode, state });
  return { screen, emitted, bus };
}

function row(screen, id) {
  return screen.el.querySelector(`[data-cmdty="${id}"]`);
}

test('NXI-098: a sealed hold stays listed and its sell control does not fire', () => {
  const dom = installDom();
  try {
    const chipsQty = 4;
    const foodQty = 3;
    const state = holdState(chipsQty, foodQty);
    assert.equal(isUnsellableCargo(state, CHIPS), true);
    assert.equal(isUnsellableCargo(state, FOOD), false);
    const refusal = sealedRefusal(state);
    const { screen, emitted } = openSell(state);
    const chips = row(screen, CHIPS);
    const food = row(screen, FOOD);
    assert.ok(chips, 'the sealed lot is on the sell list');
    assert.ok(food, 'a sellable neighbor stays on the sell list');
    const held = chips.querySelector('.sx-mkt-row__held').textContent;
    assert.ok(held.includes(String(chipsQty)), held);
    assert.ok(held.includes('u'), held);

    chips.click();
    const sealedGo = screen.el.querySelector('[data-go]');
    const sealedNote = screen.el.querySelector('.sx-trade__note');
    assert.equal(sealedGo.disabled, true);
    assert.equal(sealedNote.textContent, refusal);
    sealedGo.click();
    assert.equal(emitted.some((entry) => entry.name === 'ui:sell'), false);
    const sealedSale = screen.el.querySelector('[data-sale-line]');
    assert.equal(sealedSale.getAttribute('data-sale-qty'), '0');
    assert.equal(sealedSale.textContent.includes('If sold'), false);
    const holdArc = screen.el.querySelector('.orr-mkt-holdarc');
    assert.ok(holdArc, 'the hold graphic stays on the counter');
    assert.ok(holdArc.textContent.includes(String(state.player.cargo.usedVolume)));
    assert.ok(holdArc.textContent.includes(String(state.player.cargo.capVolume)));
    const fewer = screen.el.querySelector('[data-q="-1"]');
    const more = screen.el.querySelector('[data-q="1"]');
    assert.ok(fewer, 'Fewer stays on a sealed lot');
    assert.ok(more, 'More stays on a sealed lot');
    more.click();
    assert.equal(screen.el.querySelector('[data-sale-line]').getAttribute('data-sale-qty'), '0');
    assert.equal(screen.el.querySelector('.sx-qty__in').value, '0');
    fewer.click();
    assert.equal(screen.el.querySelector('[data-sale-line]').getAttribute('data-sale-qty'), '0');
    assert.equal(screen.el.querySelector('.sx-qty__in').value, '0');
    assert.equal(emitted.some((entry) => entry.name === 'ui:sell'), false);
    const typed = screen.el.querySelector('.sx-qty__in');
    typed.value = String(chipsQty);
    dispatch(typed, 'input');
    assert.equal(typed.value, '0');
    assert.equal(screen.el.querySelector('[data-sale-line]').getAttribute('data-sale-qty'), '0');
    assert.equal(screen.el.querySelector('[data-sale-line]').textContent.includes('If sold'), false);
    assert.ok(screen.el.querySelector('.orr-mkt-holdarc').textContent.includes(String(state.player.cargo.usedVolume)));
    assert.equal(emitted.some((entry) => entry.name === 'ui:sell'), false);

    food.click();
    const foodGo = screen.el.querySelector('[data-go]');
    const foodNote = screen.el.querySelector('.sx-trade__note');
    assert.notEqual(foodNote.textContent, refusal);
    assert.equal(foodGo.disabled, false);
    const before = state.player.cargo.items[FOOD];
    foodGo.click();
    const sold = emitted.filter((entry) => entry.name === 'ui:sell');
    assert.equal(sold.length, 1);
    assert.equal(sold[0].payload.commodityId, FOOD);
    assert.equal(sold[0].payload.qty, before);
    assert.equal(state.player.cargo.items[CHIPS], chipsQty);
    assert.equal(state.player.cargo.items[FOOD], foodQty);
  } finally {
    dom.restore();
  }
});

test('NXI-098: a hold that is only sealed cargo is not described as empty', () => {
  const dom = installDom();
  try {
    const chipsQty = 6;
    const state = holdState(chipsQty, 0);
    const refusal = sealedRefusal(state);
    const { screen, emitted } = openSell(state);
    const chips = row(screen, CHIPS);
    assert.ok(chips, 'the only sealed lot is still a row');
    assert.ok(chips.querySelector('.sx-mkt-row__held').textContent.includes(String(chipsQty)));
    assert.equal(screen.el.textContent.includes('Your hold is empty.'), false);
    chips.click();
    assert.equal(screen.el.querySelector('[data-go]').disabled, true);
    assert.equal(screen.el.querySelector('.sx-trade__note').textContent, refusal);
    screen.el.querySelector('[data-go]').click();
    assert.equal(emitted.some((entry) => entry.name === 'ui:sell'), false);
    assert.equal(screen.el.querySelector('[data-sale-line]').getAttribute('data-sale-qty'), '0');
    assert.equal(screen.el.querySelector('[data-sale-line]').textContent.includes('If sold'), false);
    assert.ok(screen.el.querySelector('.orr-mkt-holdarc').textContent.includes(String(state.player.cargo.usedVolume)));
    screen.el.querySelector('[data-q="1"]').click();
    screen.el.querySelector('[data-q="-1"]').click();
    assert.equal(screen.el.querySelector('[data-sale-line]').getAttribute('data-sale-qty'), '0');
    assert.equal(screen.el.querySelector('.sx-qty__in').value, '0');
    assert.equal(emitted.some((entry) => entry.name === 'ui:sell'), false);
  } finally {
    dom.restore();
  }
});

test('NXI-098: a worker price refusal refreshes the next sell terms from the authority', () => {
  const dom = installDom();
  try {
    const state = holdState(0, 1);
    const quoteState = { total: 30 };
    const { screen, emitted, bus } = openSellWithEventBus(state, quoteState);
    const food = row(screen, FOOD);
    assert.ok(food, 'the sellable row is listed');
    food.click();
    assert.equal(screen.el.querySelector('[data-go]').disabled, false);

    // The facade remains at 30 while the worker reports the exact live total 29.
    bus.emit('economy:tradeFailed', {
      stationId: STATION, commodityId: FOOD, side: 'sell', qty: 1,
      reason: 'price_changed', expectedTotal: 30, liveTotal: 29,
    });
    assert.match(screen.el.querySelector('[data-trade-total]').getAttribute('aria-label'), /29/);

    screen.el.querySelector('[data-go]').click();
    const sell = emitted.find((entry) => entry.name === 'ui:sell');
    assert.equal(sell && sell.payload.expectedTotal, 29,
      'the retry binds to the worker refusal, not the stale facade total');
    screen.dispose();
  } finally {
    dom.restore();
  }
});

test('NXI-098: quantity planning probes do not clear an authoritative buy refusal', () => {
  const dom = installDom();
  try {
    const state = holdState(0, 0);
    const quoteState = { total: 30 };
    const { screen, emitted, bus } = openSellWithEventBus(state, quoteState, 'buy');
    const food = row(screen, FOOD);
    assert.ok(food, 'the buy register lists the selected lot');
    food.click();
    assert.equal(screen.el.querySelector('[data-go]').disabled, false);

    // The refusal is authoritative at 31, while the main facade still quotes 30.
    // Rendering the buy limit probes larger quantities before repainting quantity 1.
    bus.emit('economy:tradeFailed', {
      stationId: STATION, commodityId: FOOD, side: 'buy', qty: 1,
      reason: 'price_changed', expectedTotal: 30, liveTotal: 31,
    });
    assert.match(screen.el.querySelector('[data-trade-total]').getAttribute('aria-label'), /31/);

    screen.el.querySelector('[data-go]').click();
    const buy = emitted.find((entry) => entry.name === 'ui:buy');
    assert.equal(buy && buy.payload.expectedTotal, 31,
      'the retry keeps the worker refusal after quantity-limit planning probes');
    screen.dispose();
  } finally {
    dom.restore();
  }
});

test('market history backfill is lifecycle-scoped, bounded on failure, and never fabricates a flat chart', async () => {
  const state = holdState(0, 0);
  const entry = state.economy.markets[STATION][FOOD];
  const def = { basePrice: 10 };
  const requests = [];
  const scheduled = new Map();
  let nextScheduleId = 0;
  let backfill;
  let activeContext = 'world-a';
  backfill = createMarketHistoryBackfill({
    request(_op, args) {
      return new Promise((resolve, reject) => requests.push({ args, resolve, reject }));
    },
    scheduleRefresh(callback, delay) {
      const id = ++nextScheduleId;
      scheduled.set(id, { callback, delay });
      return id;
    },
    cancelRefresh(id) {
      scheduled.delete(id);
    },
    onChange() {
      // The production screen re-enters ensure from its render callback. Keeping that seam here
      // makes the retry assertion exercise the same bounded automatic retry.
      backfill.ensure(state, STATION, activeContext);
    },
  });

  backfill.reset(STATION, 'world-a');
  backfill.ensure(state, STATION, 'world-a');
  assert.equal(backfill.status, 'inflight');
  assert.equal(backfill.chartState(STATION, FOOD, entry), 'loading');
  assert.deepEqual(marketPriceHistorySeries(backfill.pointsFor(STATION, FOOD, entry), entry, def, 100), [],
    'pending history stays empty instead of becoming [current,current]');
  requests[0].resolve({ ok: true, result: { histories: { [FOOD]: [{ t: 40, mid: 12 }, { t: 100, mid: 18 }] } } });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(marketPriceHistorySeries(backfill.pointsFor(STATION, FOOD, entry), entry, def, 100).map((p) => p.mid), [12, 18]);
  assert.equal(requests.length, 1, 'a confirmed response does not trigger an early duplicate request');
  assert.equal(scheduled.size, 1, 'one visible refresh is armed after the confirmed response');
  const firstRefresh = scheduled.entries().next().value;
  scheduled.delete(firstRefresh[0]);
  assert.equal(firstRefresh[1].delay, 15_000, 'refresh follows the economy history sample cadence');
  firstRefresh[1].callback();
  assert.equal(requests.length, 2, 'the scheduled cadence starts one coalesced refresh');
  assert.equal(backfill.status, 'inflight');
  assert.equal(backfill.chartState(STATION, FOOD, entry), 'confirmed',
    'the last confirmed series remains visible while a refresh is pending');
  assert.deepEqual(marketPriceHistorySeries(backfill.pointsFor(STATION, FOOD, entry), entry, def, 100).map((p) => p.mid), [12, 18]);
  backfill.ensure(state, STATION, activeContext);
  assert.equal(requests.length, 2, 'renders during a pending refresh do not queue another RPC');
  requests[1].resolve({ ok: true, result: { histories: { [FOOD]: [{ t: 40, mid: 22 }, { t: 100, mid: 28 }] } } });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(marketPriceHistorySeries(backfill.pointsFor(STATION, FOOD, entry), entry, def, 100).map((p) => p.mid), [22, 28],
    'a changed station history replaces the prior series after the refresh ACK');
  const secondRefresh = scheduled.entries().next().value;
  scheduled.delete(secondRefresh[0]);
  secondRefresh[1].callback();
  assert.equal(requests.length, 3, 'the next cadence starts one more refresh after the changed ACK');
  assert.deepEqual(marketPriceHistorySeries(backfill.pointsFor(STATION, FOOD, entry), entry, def, 100).map((p) => p.mid), [22, 28]);

  // Reopening the same station is a new generation and must fetch again.
  activeContext = 'world-a';
  backfill.reset(STATION, 'world-a');
  assert.equal(scheduled.size, 0, 'reopening cancels the prior visible refresh timer');
  backfill.ensure(state, STATION, 'world-a');
  assert.equal(requests.length, 4);
  assert.equal(backfill.chartState(STATION, FOOD, entry), 'loading');

  // A Continue/new-world reset invalidates both the in-flight refresh and the reopened station
  // request. Their late ACKs cannot populate the new station cache, even though the station id
  // is unchanged.
  activeContext = 'world-b';
  await Promise.resolve();
  backfill.reset(STATION, 'world-b');
  backfill.ensure(state, STATION, 'world-b');
  assert.equal(requests.length, 5);
  requests[2].resolve({ ok: true, result: { histories: { [FOOD]: [{ t: 40, mid: 91 }, { t: 100, mid: 99 }] } } });
  await Promise.resolve();
  assert.equal(backfill.chartState(STATION, FOOD, entry), 'loading');
  assert.deepEqual(backfill.pointsFor(STATION, FOOD, entry), undefined,
    'late ACK from the replaced refresh does not mutate the new cache');
  requests[3].resolve({ ok: true, result: { histories: { [FOOD]: [{ t: 40, mid: 81 }, { t: 100, mid: 89 }] } } });
  await Promise.resolve();
  assert.equal(backfill.chartState(STATION, FOOD, entry), 'loading');
  assert.deepEqual(backfill.pointsFor(STATION, FOOD, entry), undefined,
    'late ACK from the reopened generation does not mutate the new cache');
  requests[4].resolve({ ok: true, result: { histories: { [FOOD]: [{ t: 40, mid: 31 }, { t: 100, mid: 36 }] } } });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(backfill.pointsFor(STATION, FOOD, entry).map((p) => p.mid), [31, 36]);

  // Retry one transient failure, then stop after the bounded second attempt.
  activeContext = 'world-c';
  backfill.reset(STATION, 'world-c');
  backfill.ensure(state, STATION, 'world-c');
  assert.equal(requests.length, 6);
  requests[5].reject(new Error('worker unavailable'));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(requests.length, 7, 'one retry is issued after the first failure');
  requests[6].reject(new Error('worker still unavailable'));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(requests.length, 7, 'retry budget is bounded');
  assert.equal(backfill.status, 'failed');

  // The real screen exposes the pending state in the existing chart slot, then replaces it with
  // the authoritative values when the worker response arrives.
  const dom = installDom();
  const laneRequests = [];
  installSimCommandSink((_descriptor) => new Promise((resolve, reject) => laneRequests.push({ resolve, reject })));
  try {
    const screenState = holdState(0, 0);
    const { screen } = openSellWithEventBus(screenState, { total: 30 }, 'buy');
    assert.equal(laneRequests.length, 1);
    const loading = screen.el.querySelector('[data-market-history="loading"]');
    assert.ok(loading, 'pending chart has a loading marker');
    assert.equal(loading.textContent, 'Loading price history…');
    laneRequests[0].resolve({ ok: true, result: { histories: {
      [CHIPS]: [{ t: 1, mid: 44 }, { t: 2, mid: 49 }],
      [FOOD]: [{ t: 1, mid: 12 }, { t: 2, mid: 18 }],
    } } });
    await Promise.resolve();
    await Promise.resolve();
    const chart = screen.el.querySelector('.sx-mkt-chart');
    assert.equal(chart.getAttribute('data-history-mids'), '44,49',
      'the selected instrument paints returned samples rather than a flat quote');
    screen.onShow({ state: screenState });
    assert.equal(laneRequests.length, 2, 'same-station onShow starts a fresh history request');
    assert.ok(screen.el.querySelector('[data-market-history="loading"]'),
      'same-station reopen does not reuse the prior generation while pending');
    screen.dispose();
  } finally {
    uninstallSimCommandSink();
    dom.restore();
  }
});


// Narrow worker-lane boundary proof: the actual Market screen is mounted above a bus that
// applies the real generated main→sim event allowlist, queues forwarded trade intents, and
// delivers authoritative worker events later. It intentionally does not claim a real Worker.
function openMarketWithDeferredWorker(state, quoteState, tradeMode = 'buy', createScreen = createMarketScreen) {
  const emitted = [];
  const forwarded = [];
  const rpcCalls = [];
  const receipts = [];
  const handlers = new Map();
  const retiredIntentIds = new Set();
  const shownIntentIds = new Set();
  let suppressWorkerEvents = false;
  const deliverWorkerEvent = (name, payload) => {
    if (suppressWorkerEvents && (name === 'economy:tradeCompleted' || name === 'economy:tradeFailed')) return null;
    if (name === 'game:new' || name === 'game:newGame' || name === 'save:loaded') {
      const expectation = state.ui && state.ui[TRADE_EXPECTATION_KEY];
      if (expectation && typeof expectation.intentId === 'string' && expectation.intentId.startsWith('market:')) {
        retiredIntentIds.add(expectation.intentId);
      }
      if (expectation) clearTradeExpectation(state, { intentId: expectation.intentId });
    }
    if (name === 'station:marketTradeIntentRetired' && payload && typeof payload.intentId === 'string') {
      retiredIntentIds.add(payload.intentId);
    }
    if (name === 'economy:tradeCompleted') {
      const ledger = state.player.tradeLedger || (state.player.tradeLedger = []);
      if (payload && payload.receiptId != null
        && !ledger.some((entry) => String(entry.receiptId) === String(payload.receiptId))) ledger.unshift({
        receiptId: String(payload.receiptId),
        tradeSequence: payload.tradeSequence,
        stationId: payload.stationId,
        commodityId: payload.commodityId,
        side: payload.side,
        qty: payload.qty,
        unit: payload.qty ? Math.round(payload.total / payload.qty) : 0,
        buyUnit: payload.side === 'buy' && payload.qty ? Math.round(payload.total / payload.qty) : 0,
        marginPerUnit: 0,
        profit: 0,
        seenAt: state.simTime,
        total: payload.total,
      });
      const receipt = consumeStationTradeReceipt(state, payload, { retiredIntentIds, shownIntentIds });
      if (receipt) receipts.push(receipt);
    } else if (name === 'economy:tradeFailed') {
      const expectation = state.ui && state.ui[TRADE_EXPECTATION_KEY];
      const recoveryContextRefusal = expectation && expectation.intentId === payload?.intentId
        && expectation.status === 'recovering' && ['not_docked', 'station_changed'].includes(payload.reason);
      if (payload && !['intent_pending', 'trade_pending'].includes(payload.reason) && !recoveryContextRefusal) {
        clearTradeExpectation(state, payload);
      }
    } else if (name === 'station:marketTradeReceiptRecovered') {
      const receipt = consumeStationTradeReceipt(state, payload, { retiredIntentIds, shownIntentIds });
      if (receipt) receipts.push(receipt);
    }
    for (const handler of [...(handlers.get(name) || [])]) handler(payload);
    return receipts[receipts.length - 1] || null;
  };
  const bus = {
    emit(name, payload) {
      emitted.push({ name, payload, at: Date.now() });
      if (name === 'ui:buy' || name === 'ui:sell') {
        // A real worker-lane Market action must use its economyTrade RPC only, never both routes.
        forwarded.push({ name, payload, at: Date.now() });
        return;
      }
      deliverWorkerEvent(name, payload);
    },
    on(name, handler) {
      const list = handlers.get(name) || [];
      list.push(handler);
      handlers.set(name, list);
      return () => handlers.set(name, (handlers.get(name) || []).filter((entry) => entry !== handler));
    },
    off(name, handler) {
      handlers.set(name, (handlers.get(name) || []).filter((entry) => entry !== handler));
    },
  };
  installSimCommandSink((request) => {
    if (!request || request.kind !== 'rpc') return undefined;
    if (request.op === 'economyTrade') {
      let resolve;
      let reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      const call = { id: request.id, op: request.op, payload: request.args, resolve, reject };
      rpcCalls.push(call);
      forwarded.push({ name: 'economyTrade', payload: request.args, at: Date.now() });
      return promise;
    }
    if (request.op === 'marketHistory') return Promise.resolve({ ok: true, result: { histories: {} } });
    return Promise.resolve({ ok: false, reason: 'unhandled-rpc-op' });
  });
  const resolveWorkerRpc = (index, value) => rpcCalls[index] && rpcCalls[index].resolve(value);
  const rejectWorkerRpc = (index, error) => rpcCalls[index] && rpcCalls[index].reject(error);
  const executeWorkerTrade = (index) => {
    const call = rpcCalls[index];
    if (!call) throw new Error(`missing economyTrade RPC ${index}`);
    const payload = call.payload;
    const owner = {
      ...economy,
      state,
      bus: { emit: (name, value) => { emitted.push({ name, payload: value, at: Date.now() }); deliverWorkerEvent(name, value); } },
      dockedStationId: () => (state.ui && state.ui.dockedStationId) || null,
      quote(_stationId, commodityId, side, qty) {
        return { ok: true, side, qty, commodityId, total: payload.expectedTotal, priceImpactPct: 0 };
      },
      registryGet: () => null,
      recomputeLivePrices() {},
      recordLivePriceHistory() {},
      snapshotIntel() {},
    };
    return owner.handleTrade(payload.commodityId, payload.side, payload.qty, {
      expectedTotal: payload.expectedTotal,
      sourceStationId: payload.sourceStationId,
      intentId: payload.intentId,
    });
  };
  const setWorkerEventsSuppressed = (value) => { suppressWorkerEvents = !!value; };
  const screen = createScreen({
    state,
    bus,
    registry: {
      get(name) {
        if (name !== 'economy') return null;
        return {
          quote(_stationId, commodityId, side, qty) {
            return { ok: true, side, qty, total: quoteState.total, commodityId, partial: false, priceImpactPct: 0 };
          },
        };
      },
    },
  });
  document.body.appendChild(screen.el);
  screen.onShow({ tradeMode, state });
  return {
    screen, bus, emitted, forwarded, rpcCalls, receipts, deliverWorkerEvent,
    resolveWorkerRpc, rejectWorkerRpc, executeWorkerTrade, setWorkerEventsSuppressed,
  };
}

const waitForWorkerDelay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Control run for the exact parent Market screen. Invoke with MARKET_SOURCE_CONTROL=1 and the
// parent-overlay loader; all other owner dependencies and the async bridge stay identical.
if (process.env.MARKET_SOURCE_CONTROL === '1') {
  test('parent Market control forwards a second worker intent after the 80 ms unlock', async () => {
    const parentMarket = await import('../originals/parent-aaa56d/src/ui/station/screens/market.js');
    const dom = installDom();
    let screen = null;
    try {
      const state = holdState(0, 0);
      const opened = openMarketWithDeferredWorker(state, { total: 30 }, 'buy', parentMarket.createMarketScreen);
      screen = opened.screen;
      row(screen, FOOD).click();
      screen.el.querySelector('[data-go]').click();
      assert.equal(opened.forwarded.length, 1);
      await waitForWorkerDelay(115);
      screen.el.querySelector('[data-go]').click();
      assert.equal(opened.forwarded.length, 2, 'the pre-repair screen unlocks while the worker trade is still pending');
      assert.equal(opened.forwarded[0].name, 'ui:buy');
      assert.equal(opened.forwarded[1].name, 'ui:buy');
      assert.equal(opened.forwarded[0].payload.intentId, undefined);
      assert.equal(opened.forwarded[1].payload.intentId, undefined);
    } finally {
      if (screen) screen.dispose();
      uninstallSimCommandSink();
      dom.restore();
    }
  });
}

test('delayed worker trade blocks repeats, preserves its receipt terms, and permits a later intentional buy', async () => {
  const dom = installDom();
  try {
    const state = holdState(0, 0);
    const { screen, forwarded, rpcCalls, receipts, deliverWorkerEvent, resolveWorkerRpc } = openMarketWithDeferredWorker(state, { total: 30 }, 'buy');
    row(screen, FOOD).click();
    screen.el.querySelector('[data-go]').click();
    assert.equal(forwarded.length, 1);
    assert.equal(forwarded[0].name, 'economyTrade', 'worker mode uses its existing idempotent RPC as the only execution transport');
    const firstId = forwarded[0].payload.intentId;
    assert.equal(typeof firstId, 'string');
    assert.equal(state.ui[TRADE_EXPECTATION_KEY].intentId, firstId);

    await waitForWorkerDelay(115);
    assert.ok(Date.now() - forwarded[0].at > 80);
    const retry = screen.el.querySelector('[data-go]');
    assert.equal(retry.disabled, true, 'the confirmed trade remains locked after the old 80 ms window');
    retry.click();
    assert.equal(forwarded.length, 1, 'repeating the confirmation cannot send another intent');

    const settled = rpcCalls[0].payload;
    const actualResult = {
      stationId: STATION, commodityId: FOOD, side: 'buy', qty: 1, total: 30,
      receiptId: 'actual-market-receipt', tradeSequence: 1, intentId: firstId,
    };
    deliverWorkerEvent('economy:tradeCompleted', actualResult);
    assert.match(receipts[0].detail, /settled as confirmed/);
    assert.equal(state.ui[TRADE_EXPECTATION_KEY], null, 'station receipt ownership consumes the matching expectation');
    resolveWorkerRpc(0, { ok: true, result: { ok: true, result: { ok: true, qty: 1, total: 30 } } });
    await Promise.resolve();

    state.economy.committedIntents = { [firstId]: { result: { ok: true }, receipt: { stationId: STATION } } };
    screen.el.querySelector('[data-go]').click();
    assert.equal(forwarded.length, 2, 'a deliberate purchase after terminal settlement is still available');
    assert.notEqual(forwarded[1].payload.intentId, firstId, 'a distinct purchase gets a new durable intent key');
    assert.equal(Object.hasOwn(state.economy.committedIntents, forwarded[1].payload.intentId), false,
      'a committed key present from a prior session is never reused');
    assert.equal(forwarded[1].payload.commodityId, settled.commodityId);
    deliverWorkerEvent('economy:tradeFailed', {
      intentId: forwarded[1].payload.intentId, stationId: STATION, commodityId: FOOD,
      side: 'buy', qty: 1, reason: 'no_stock',
    });
    screen.dispose();
  } finally {
    uninstallSimCommandSink();
    dom.restore();
  }
});

test('delayed partial settlement still reports the two confirmed units against the actual receipt', async () => {
  const dom = installDom();
  try {
    const state = holdState(0, 3);
    const { screen, forwarded, receipts, deliverWorkerEvent } = openMarketWithDeferredWorker(state, { total: 20 }, 'sell');
    row(screen, FOOD).click();
    const quantity = screen.el.querySelector('.sx-qty__in');
    quantity.value = '2';
    dispatch(quantity, 'input');
    screen.el.querySelector('[data-go]').click();
    assert.equal(forwarded[0].payload.qty, 2);
    const partial = {
      stationId: STATION, commodityId: FOOD, side: 'sell', qty: 1, total: 10,
      receiptId: 'deferred-partial', tradeSequence: 1, intentId: forwarded[0].payload.intentId,
    };
    await waitForWorkerDelay(100);
    deliverWorkerEvent('economy:tradeCompleted', partial);
    assert.match(receipts[0].line, /SOLD 1 OF THE 2 CONFIRMED/);
    screen.dispose();
  } finally {
    uninstallSimCommandSink();
    dom.restore();
  }
});

test('hide and reopen keeps one pending worker intent until its terminal event', async () => {
  const dom = installDom();
  try {
    const state = holdState(0, 0);
    const { screen, forwarded, deliverWorkerEvent } = openMarketWithDeferredWorker(state, { total: 30 }, 'buy');
    row(screen, FOOD).click();
    screen.el.querySelector('[data-go]').click();
    const id = forwarded[0].payload.intentId;
    screen.onHide();
    screen.onShow({ state, tradeMode: 'buy' });
    assert.equal(screen.el.querySelector('[data-go]').disabled, true);
    screen.el.querySelector('[data-go]').click();
    assert.equal(forwarded.length, 1, 'reopening does not issue a second RPC');
    deliverWorkerEvent('economy:tradeCompleted', {
      intentId: id, stationId: STATION, commodityId: FOOD, side: 'buy', qty: 1, total: 30,
      receiptId: 'hidden-settle', tradeSequence: 1,
    });
    assert.equal(screen.el.querySelector('[data-go]').disabled, true, 'a fast receipt retains the short click guard');
    await waitForWorkerDelay(100);
    assert.equal(screen.el.querySelector('[data-go]').disabled, false);
    screen.dispose();
  } finally {
    uninstallSimCommandSink();
    dom.restore();
  }
});

test('unknown retry reopens on the original lot even when the caller requests another mode', async () => {
  const dom = installDom();
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...args) => originalSetTimeout(fn, ms === 5000 ? 10 : ms, ...args);
  try {
    const state = holdState(0, 0);
    const { screen, forwarded, deliverWorkerEvent } = openMarketWithDeferredWorker(state, { total: 30 }, 'buy');
    row(screen, FOOD).click();
    screen.el.querySelector('[data-go]').click();
    const id = forwarded[0].payload.intentId;
    await waitForWorkerDelay(25);
    assert.match(screen.el.querySelector('.sx-trade__note').textContent, /result is unknown/i);
    screen.onHide();
    screen.onShow({ state, tradeMode: 'sell' });
    assert.equal(screen.el.querySelector('[data-mode="buy"]').getAttribute('aria-pressed'), 'true');
    assert.equal(screen.el.querySelector('[data-mode="sell"]').getAttribute('aria-pressed'), 'false');
    assert.equal(screen.el.querySelector('[data-go]').disabled, false);
    assert.match(screen.el.querySelector('.sx-trade__note').textContent, /retry the original confirmed order with the same terms and ID/i);
    const retryButton = screen.el.querySelector('[data-go]');
    assert.equal(retryButton.querySelector('.orr-lampkey__word').textContent, 'Retry order');
    assert.equal(retryButton.getAttribute('aria-label'), 'Retry order');
    // Clicking the visibly labeled recovery control reuses the original intent ID.
    retryButton.click();
    assert.equal(forwarded.length, 2);
    assert.equal(forwarded[1].payload.intentId, id);
    deliverWorkerEvent('economy:tradeFailed', {
      intentId: id, stationId: STATION, commodityId: FOOD, side: 'buy', qty: 1, reason: 'not_docked',
    });
    screen.dispose();
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    uninstallSimCommandSink();
    dom.restore();
  }
});

test('price refusal ends only the matching intent and requotes before a fresh confirmation', async () => {
  const dom = installDom();
  try {
    const state = holdState(0, 1);
    const { screen, emitted, forwarded, deliverWorkerEvent } = openMarketWithDeferredWorker(state, { total: 30 }, 'sell');
    row(screen, FOOD).click();
    screen.el.querySelector('[data-go]').click();
    const firstId = forwarded[0].payload.intentId;
    deliverWorkerEvent('economy:tradeFailed', {
      intentId: firstId, stationId: STATION, commodityId: FOOD, side: 'sell', qty: 1,
      reason: 'price_changed', expectedTotal: 30, liveTotal: 29,
    });
    assert.equal(state.ui[TRADE_EXPECTATION_KEY], null);
    assert.match(screen.el.querySelector('[data-trade-total]').getAttribute('aria-label'), /29/);
    assert.equal(emitted.some((entry) => entry.name === 'economy:tradeCompleted'), false);
    await waitForWorkerDelay(100);
    screen.el.querySelector('[data-go]').click();
    assert.equal(forwarded.length, 2);
    assert.equal(forwarded[1].payload.expectedTotal, 29);
    assert.notEqual(forwarded[1].payload.intentId, firstId);
    deliverWorkerEvent('economy:tradeFailed', {
      intentId: forwarded[1].payload.intentId, stationId: STATION, commodityId: FOOD,
      side: 'sell', qty: 1, reason: 'no_stock',
    });
    screen.dispose();
  } finally {
    uninstallSimCommandSink();
    dom.restore();
  }
});

test('in-flight intent_pending coordination does not clear the Market expectation', () => {
  const dom = installDom();
  try {
    const state = holdState(0, 0);
    const { screen, forwarded, deliverWorkerEvent } = openMarketWithDeferredWorker(state, { total: 30 }, 'buy');
    row(screen, FOOD).click();
    screen.el.querySelector('[data-go]').click();
    const id = forwarded[0].payload.intentId;
    deliverWorkerEvent('economy:tradeFailed', {
      intentId: id, stationId: STATION, commodityId: FOOD, side: 'buy', qty: 1, reason: 'intent_pending',
    });
    assert.equal(state.ui[TRADE_EXPECTATION_KEY].intentId, id,
      'coordination pressure does not retire a potentially committed intent');
    assert.equal(screen.el.querySelector('[data-go]').disabled, false,
      'the UI stays recoverable with this same ID');
    deliverWorkerEvent('economy:tradeFailed', {
      intentId: id, stationId: STATION, commodityId: FOOD, side: 'buy', qty: 1, reason: 'not_docked',
    });
    assert.equal(state.ui[TRADE_EXPECTATION_KEY], null, 'a matching terminal refusal clears it');
    screen.dispose();
  } finally {
    uninstallSimCommandSink();
    dom.restore();
  }
});

test('reset retires old intent and late success or refusal cannot consume the new expectation', () => {
  const dom = installDom();
  try {
    const state = holdState(0, 0);
    const { screen, bus, forwarded, deliverWorkerEvent } = openMarketWithDeferredWorker(state, { total: 30 }, 'buy');
    row(screen, FOOD).click();
    screen.el.querySelector('[data-go]').click();
    const oldId = forwarded[0].payload.intentId;
    bus.emit('game:new', {});
    assert.equal(state.ui[TRADE_EXPECTATION_KEY], null, 'reset retires the old expectation');

    screen.el.querySelector('[data-go]').click();
    assert.equal(forwarded.length, 2);
    const currentId = forwarded[1].payload.intentId;
    assert.notEqual(currentId, oldId);
    deliverWorkerEvent('economy:tradeCompleted', {
      intentId: oldId, stationId: STATION, commodityId: FOOD, side: 'buy', qty: 1, total: 30,
      receiptId: 'late-old-success', tradeSequence: 1,
    });
    deliverWorkerEvent('economy:tradeFailed', {
      intentId: oldId, stationId: STATION, commodityId: FOOD, side: 'buy', qty: 1,
      reason: 'not_docked',
    });
    assert.equal(state.ui[TRADE_EXPECTATION_KEY].intentId, currentId);
    assert.equal(screen.el.querySelector('[data-go]').disabled, true);
    deliverWorkerEvent('economy:tradeFailed', {
      intentId: currentId, stationId: STATION, commodityId: FOOD, side: 'buy', qty: 1,
      reason: 'not_docked',
    });
    assert.equal(state.ui[TRADE_EXPECTATION_KEY], null);
    screen.dispose();
  } finally {
    uninstallSimCommandSink();
    dom.restore();
  }
});

test('timeout stays unknown, then same-ID RPC replay recovers the committed result without a second mutation', async () => {
  const dom = installDom();
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...args) => originalSetTimeout(fn, ms === 5000 ? 110 : ms, ...args);
  try {
    const state = holdState(0, 0);
    const { screen, forwarded, receipts, rpcCalls, executeWorkerTrade, resolveWorkerRpc, setWorkerEventsSuppressed, deliverWorkerEvent } = openMarketWithDeferredWorker(state, { total: 30 }, 'buy');
    row(screen, FOOD).click();
    screen.el.querySelector('[data-go]').click();
    const id = forwarded[0].payload.intentId;
    await waitForWorkerDelay(125);
    assert.equal(screen.el.querySelector('[data-go]').disabled, false, 'timed-out outcome is recoverable, not treated as settled or refused');
    assert.match(screen.el.querySelector('.sx-trade__note').textContent, /result is unknown/i);

    // Execute the first request using the real economy handleTrade/execute owner, but drop its
    // terminal event and RPC ACK to model a disconnect after commit.
    const beforeCredits = state.player.credits;
    const beforeStock = state.economy.markets[STATION][FOOD].stock;
    const beforeCargo = state.player.cargo.items[FOOD] || 0;
    // Suppress only the bridge's event delivery; the authoritative economy still records its ledger.
    setWorkerEventsSuppressed(true);
    const actual = executeWorkerTrade(0);
    assert.equal(actual.ok, true, 'the real economy owner committed the original worker RPC');
    const committedCredits = state.player.credits;
    const committedStock = state.economy.markets[STATION][FOOD].stock;
    const committedCargo = state.player.cargo.items[FOOD];
    assert.equal(committedCredits, beforeCredits - 30);
    assert.equal(committedStock, beforeStock - 1);
    assert.equal(committedCargo, beforeCargo + 1);

    const retry = screen.el.querySelector('[data-go]');
    assert.equal(retry.disabled, false);
    retry.click();
    assert.equal(forwarded.length, 2);
    assert.equal(forwarded[1].payload.intentId, id);
    const duplicate = executeWorkerTrade(1);
    assert.equal(duplicate.ok, true);
    assert.equal(duplicate.duplicate, true);
    assert.equal(state.player.credits, committedCredits);
    assert.equal(state.economy.markets[STATION][FOOD].stock, committedStock);
    assert.equal(state.player.cargo.items[FOOD], committedCargo);
    resolveWorkerRpc(1, { ok: true, result: { ok: true, result: duplicate } });
    await Promise.resolve();
    assert.equal(receipts.length, 1, 'ACK-only duplicate recovery uses the presentation-only receipt owner once');
    assert.match(receipts[0].detail, /settled as confirmed/);
    assert.equal(state.ui[TRADE_EXPECTATION_KEY], null);
    setWorkerEventsSuppressed(false);
    deliverWorkerEvent('economy:tradeCompleted', {
      intentId: id, stationId: STATION, commodityId: FOOD, side: 'buy', qty: 1, total: 30,
      receiptId: state.player.tradeLedger[0].receiptId,
      tradeSequence: state.player.tradeLedger[0].tradeSequence,
    });
    assert.equal(receipts.length, 1, 'a delayed ordinary receipt cannot display the recovered trade twice');
    screen.dispose();
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    uninstallSimCommandSink();
    dom.restore();
  }
});

test('same-ID retry stays unknown after a no-dock refusal and recovers at the original station', async () => {
  const dom = installDom();
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...args) => originalSetTimeout(fn, ms === 5000 ? 10 : ms, ...args);
  try {
    const state = holdState(0, 0);
    const other = 'station_other';
    state.economy.markets[other] = {
      [CHIPS]: listing(40, 30),
      [FOOD]: listing(12, 8),
    };
    const { screen, forwarded, receipts, executeWorkerTrade, resolveWorkerRpc, setWorkerEventsSuppressed } =
      openMarketWithDeferredWorker(state, { total: 30 }, 'buy');
    row(screen, FOOD).click();
    screen.el.querySelector('[data-go]').click();
    const id = forwarded[0].payload.intentId;
    const initialCredits = state.player.credits;
    const initialStock = state.economy.markets[STATION][FOOD].stock;
    setWorkerEventsSuppressed(true);
    const original = executeWorkerTrade(0);
    assert.equal(original.ok, true);
    await waitForWorkerDelay(25);
    assert.equal(state.ui[TRADE_EXPECTATION_KEY].status, 'unknown');
    const committedCredits = state.player.credits;
    const committedCargo = state.player.cargo.items[FOOD];
    const committedStock = state.economy.markets[STATION][FOOD].stock;
    assert.equal(committedCredits, initialCredits - 30);
    assert.equal(committedStock, initialStock - 1);
    setWorkerEventsSuppressed(false);

    screen.onHide();
    state.ui.dockedStationId = other;
    screen.onShow({ state, tradeMode: 'sell' });
    const wrongStationButton = screen.el.querySelector('[data-go]');
    assert.equal(wrongStationButton.disabled, true);
    assert.equal(wrongStationButton.getAttribute('aria-label'), 'Return to original station');
    assert.match(screen.el.querySelector('.sx-trade__note').textContent, /return to the original station/i);
    wrongStationButton.click();
    assert.equal(forwarded.length, 1, 'a different station cannot submit a new order or retry in the wrong context');

    state.ui.dockedStationId = STATION;
    screen.onShow({ state, tradeMode: 'sell' });
    const retry = screen.el.querySelector('[data-go]');
    assert.equal(retry.disabled, false);
    assert.equal(retry.getAttribute('aria-label'), 'Retry order');
    retry.click();
    assert.equal(forwarded.length, 2);
    assert.equal(forwarded[1].payload.intentId, id);
    assert.equal(state.ui[TRADE_EXPECTATION_KEY].status, 'recovering');

    // The actual economy execute path rejects sourceStationId mismatch before consulting
    // its committed-ID journal. A stale retry delivered at another station remains UNKNOWN.
    state.ui.dockedStationId = other;
    const changedStation = executeWorkerTrade(1);
    assert.deepEqual(changedStation, { ok: false, reason: 'station_changed' });
    resolveWorkerRpc(1, { ok: true, result: changedStation });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(state.ui[TRADE_EXPECTATION_KEY].intentId, id);
    assert.equal(state.ui[TRADE_EXPECTATION_KEY].status, 'unknown');
    assert.equal(receipts.length, 0);
    assert.equal(state.player.credits, committedCredits);
    assert.equal(state.player.cargo.items[FOOD], committedCargo);
    assert.equal(state.economy.markets[STATION][FOOD].stock, committedStock);

    // Then prove handleTrade's no-dock refusal also runs before committed-ID lookup.
    state.ui.dockedStationId = STATION;
    screen.onShow({ state, tradeMode: 'buy' });
    screen.el.querySelector('[data-go]').click();
    assert.equal(forwarded.length, 3);
    assert.equal(forwarded[2].payload.intentId, id);
    state.ui.dockedStationId = null;
    const noDock = executeWorkerTrade(2);
    assert.deepEqual(noDock, { ok: false, reason: 'not_docked' });
    resolveWorkerRpc(2, { ok: true, result: noDock });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(state.ui[TRADE_EXPECTATION_KEY].intentId, id);
    assert.equal(state.ui[TRADE_EXPECTATION_KEY].status, 'unknown');
    assert.equal(receipts.length, 0, 'contextual refusals cannot pretend to settle or refuse the original order');
    assert.equal(state.player.credits, committedCredits);
    assert.equal(state.player.cargo.items[FOOD], committedCargo);
    assert.equal(state.economy.markets[STATION][FOOD].stock, committedStock);

    state.ui.dockedStationId = STATION;
    screen.onShow({ state, tradeMode: 'buy' });
    screen.el.querySelector('[data-go]').click();
    assert.equal(forwarded.length, 4);
    assert.equal(forwarded[3].payload.intentId, id);
    const duplicate = executeWorkerTrade(3);
    assert.equal(duplicate.ok, true);
    assert.equal(duplicate.duplicate, true);
    resolveWorkerRpc(3, { ok: true, result: { ok: true, result: duplicate } });
    await Promise.resolve();
    assert.equal(receipts.length, 1, 'same-ID replay returns the original canonical result once');
    assert.equal(state.player.credits, committedCredits);
    assert.equal(state.player.cargo.items[FOOD], committedCargo);
    assert.equal(state.economy.markets[STATION][FOOD].stock, committedStock);
    screen.dispose();
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    uninstallSimCommandSink();
    dom.restore();
  }
});

test('ID-aware receipt matching leaves a newer confirmation intact after an old event', async () => {
  const state = holdState(0, 0);
  state.ui[TRADE_EXPECTATION_KEY] = {
    intentId: 'market:new-session:2', commodityId: FOOD, side: 'buy', qty: 1,
    total: 30, stationId: STATION, afterSequence: 0, atSimTime: 0,
  };
  const staleOldWorldReceipt = {
    intentId: 'market:old-session:1', stationId: STATION,
    commodityId: FOOD, side: 'buy', qty: 1, total: 30,
  };
  tradeClearedReceipt(state, staleOldWorldReceipt);
  assert.equal(state.ui[TRADE_EXPECTATION_KEY].intentId, 'market:new-session:2');
  state.simTime = 60;
  const delayedMatchingReceipt = {
    ...staleOldWorldReceipt, intentId: 'market:new-session:2', receiptId: 'late-matching', tradeSequence: 1,
  };
  state.player.tradeLedger.unshift({
    receiptId: 'late-matching', tradeSequence: 1, stationId: STATION,
    commodityId: FOOD, side: 'buy', qty: 1, unit: 30, buyUnit: 30,
    marginPerUnit: 0, profit: 0, seenAt: 0, total: 30,
  });
  const receipt = tradeClearedReceipt(state, delayedMatchingReceipt);
  assert.match(receipt.detail, /settled as confirmed/, 'ID correlation preserves confirmed terms beyond the legacy TTL');
  assert.equal(state.ui[TRADE_EXPECTATION_KEY], null);

  const newIntent = 'market:new-session:3';
  state.ui[TRADE_EXPECTATION_KEY] = {
    intentId: newIntent, commodityId: FOOD, side: 'buy', qty: 1,
    total: 30, stationId: STATION, afterSequence: 1, atSimTime: state.simTime,
  };
  const retired = new Set(['market:retired-session:4']);
  const lateOldWorldReceipt = {
    intentId: 'market:retired-session:4', stationId: STATION,
    commodityId: FOOD, side: 'buy', qty: 1, total: 30,
  };
  assert.equal(consumeStationTradeReceipt(state, lateOldWorldReceipt, { retiredIntentIds: retired }), null,
    'the station receipt owner suppresses a known retired ID instead of displaying a generic new-world receipt');
  assert.equal(state.ui[TRADE_EXPECTATION_KEY].intentId, newIntent);
});

test('receipt presentation de-duplicates Market IDs without suppressing deterministic non-Market IDs across worlds', () => {
  const shownIntentIds = new Set();
  const retiredIntentIds = new Set();
  const payload = {
    intentId: 'adventure:seed-7:trade-1', stationId: STATION,
    commodityId: FOOD, side: 'buy', qty: 1, total: 30,
  };
  assert.ok(consumeStationTradeReceipt(holdState(0, 0), payload, { retiredIntentIds, shownIntentIds }));
  const nextWorldReceipt = consumeStationTradeReceipt(holdState(0, 0), payload, { retiredIntentIds, shownIntentIds });
  assert.ok(nextWorldReceipt, 'a deterministic Adventure ID may repeat after New Game and still show its receipt');

  const marketPayload = { ...payload, intentId: 'market:session-7:trade-1' };
  assert.ok(consumeStationTradeReceipt(holdState(0, 0), marketPayload, { retiredIntentIds, shownIntentIds }));
  assert.equal(consumeStationTradeReceipt(holdState(0, 0), marketPayload, { retiredIntentIds, shownIntentIds }), null,
    'a repeated Market recovery receipt remains once-only');
});

test('main-lane Market keeps the existing synchronous ui:buy path and settles immediately', async () => {
  const dom = installDom();
  uninstallSimCommandSink();
  try {
    const state = holdState(0, 0);
    const { screen, emitted, bus } = openSellWithEventBus(state, { total: 30 }, 'buy');
    bus.on('ui:buy', (payload) => {
      const ownerBus = {
        emit(name, value) {
          if (name === 'economy:tradeCompleted') tradeClearedReceipt(state, value);
          bus.emit(name, value);
        },
      };
      const owner = {
        ...economy,
        state,
        bus: ownerBus,
        dockedStationId: () => STATION,
        quote(_stationId, commodityId, side, qty) {
          return { ok: true, side, qty, commodityId, total: 30, priceImpactPct: 0 };
        },
        registryGet: () => null,
        recomputeLivePrices() {},
        recordLivePriceHistory() {},
        snapshotIntel() {},
      };
      owner.handleTrade(payload.commodityId, 'buy', payload.qty, {
        expectedTotal: payload.expectedTotal,
        sourceStationId: payload.sourceStationId,
        intentId: payload.intentId,
      });
    });
    row(screen, FOOD).click();
    screen.el.querySelector('[data-go]').click();
    const buy = emitted.find((entry) => entry.name === 'ui:buy');
    assert.equal(typeof buy.payload.intentId, 'string');
    assert.equal(state.player.credits, 4970);
    assert.equal(state.player.cargo.items[FOOD], 1);
    assert.equal(state.economy.markets[STATION][FOOD].stock, 19);
    assert.equal(state.ui[TRADE_EXPECTATION_KEY], null, 'the synchronous terminal event consumes its exact expectation');
    assert.equal(screen.el.querySelector('[data-go]').disabled, true, 'the settled main-lane action keeps the existing brief click debounce');
    const firstId = buy.payload.intentId;
    screen.el.querySelector('[data-go]').click();
    assert.equal(emitted.filter((entry) => entry.name === 'ui:buy').length, 1, 'a repeated immediate confirmation is ignored');
    await waitForWorkerDelay(100);
    assert.equal(screen.el.querySelector('[data-go]').disabled, false, 'the short debounce releases after settlement');
    screen.el.querySelector('[data-go]').click();
    const laterBuys = emitted.filter((entry) => entry.name === 'ui:buy');
    assert.equal(laterBuys.length, 2, 'a later deliberate purchase is still allowed');
    assert.notEqual(laterBuys[1].payload.intentId, firstId, 'a later purchase gets a fresh intent ID');
    assert.equal(state.player.credits, 4940);
    assert.equal(state.player.cargo.items[FOOD], 2);
    assert.equal(state.economy.markets[STATION][FOOD].stock, 18);
    screen.dispose();
  } finally {
    uninstallSimCommandSink();
    dom.restore();
  }
});

test('main UNKNOWN recovery succeeds with the same ID, then permits a later new order after the guard', async () => {
  const dom = installDom();
  uninstallSimCommandSink();
  try {
    const state = holdState(0, 0);
    const { screen, emitted, bus } = openSellWithEventBus(state, { total: 30 }, 'buy');
    row(screen, FOOD).click();
    screen.el.querySelector('[data-go]').click();
    const first = emitted.find((entry) => entry.name === 'ui:buy');
    const id = first.payload.intentId;
    assert.equal(state.ui[TRADE_EXPECTATION_KEY].status, 'unknown');
    await waitForWorkerDelay(100);

    const recoveryResults = [];
    bus.on('ui:buy', (payload) => {
      const ownerBus = {
        emit(name, value) {
          if (name === 'economy:tradeCompleted') tradeClearedReceipt(state, value);
          bus.emit(name, value);
        },
      };
      const owner = {
        ...economy,
        state,
        bus: ownerBus,
        dockedStationId: () => STATION,
        quote(_stationId, commodityId, side, qty) {
          return { ok: true, side, qty, commodityId, total: payload.expectedTotal, priceImpactPct: 0 };
        },
        registryGet: () => null,
        recomputeLivePrices() {},
        recordLivePriceHistory() {},
        snapshotIntel() {},
      };
      recoveryResults.push(owner.handleTrade(payload.commodityId, 'buy', payload.qty, {
        expectedTotal: payload.expectedTotal,
        sourceStationId: payload.sourceStationId,
        intentId: payload.intentId,
      }));
    });
    screen.el.querySelector('[data-go]').click();
    const sendsAfterRecovery = emitted.filter((entry) => entry.name === 'ui:buy');
    assert.equal(sendsAfterRecovery.length, 2);
    assert.equal(sendsAfterRecovery[1].payload.intentId, id, 'UNKNOWN retries the original confirmed transaction');
    assert.equal(state.player.credits, 4970, JSON.stringify({recoveryResults, events: emitted.filter((entry) => ['economy:tradeFailed','economy:tradeCompleted'].includes(entry.name)), ui: state.ui[TRADE_EXPECTATION_KEY]}));
    assert.equal(state.player.cargo.items[FOOD], 1);
    assert.equal(screen.el.querySelector('[data-go]').disabled, true, 'synchronous recovery keeps the 80 ms guard');
    screen.el.querySelector('[data-go]').click();
    assert.equal(emitted.filter((entry) => entry.name === 'ui:buy').length, 2);
    await waitForWorkerDelay(100);
    assert.equal(screen.el.querySelector('[data-go]').disabled, false);
    screen.el.querySelector('[data-go]').click();
    const finalSends = emitted.filter((entry) => entry.name === 'ui:buy');
    assert.equal(finalSends.length, 3, 'a later deliberate confirmation is allowed');
    assert.notEqual(finalSends[2].payload.intentId, id, 'a later purchase gets a fresh intent ID');
    assert.equal(state.player.credits, 4940);
    assert.equal(state.player.cargo.items[FOOD], 2);
    assert.equal(state.economy.markets[STATION][FOOD].stock, 18);
    screen.dispose();
  } finally {
    uninstallSimCommandSink();
    dom.restore();
  }
});

test('fast worker receipt keeps the 80 ms guard but never releases an outstanding RPC', async () => {
  const dom = installDom();
  try {
    const state = holdState(0, 0);
    const { screen, forwarded, executeWorkerTrade, resolveWorkerRpc } =
      openMarketWithDeferredWorker(state, { total: 30 }, 'buy');
    row(screen, FOOD).click();
    screen.el.querySelector('[data-go]').click();
    const firstId = forwarded[0].payload.intentId;
    const first = executeWorkerTrade(0);
    assert.equal(first.ok, true);
    resolveWorkerRpc(0, { ok: true, result: { ok: true, result: first } });
    await Promise.resolve();
    assert.equal(screen.el.querySelector('[data-go]').disabled, true,
      'a fast worker terminal result cannot bypass the same brief post-confirm guard');
    screen.el.querySelector('[data-go]').click();
    assert.equal(forwarded.length, 1);
    await waitForWorkerDelay(100);
    assert.equal(screen.el.querySelector('[data-go]').disabled, false);
    screen.el.querySelector('[data-go]').click();
    assert.equal(forwarded.length, 2);
    assert.notEqual(forwarded[1].payload.intentId, firstId);
    const second = executeWorkerTrade(1);
    assert.equal(second.ok, true);
    resolveWorkerRpc(1, { ok: true, result: { ok: true, result: second } });
    await Promise.resolve();
    assert.equal(state.player.credits, 4940);
    assert.equal(state.player.cargo.items[FOOD], 2);
    screen.dispose();
  } finally {
    uninstallSimCommandSink();
    dom.restore();
  }
});

test('main-lane silent outcome stays unknown and retries only the original ID', () => {
  const dom = installDom();
  uninstallSimCommandSink();
  try {
    const state = holdState(0, 0);
    const { screen, emitted } = openSellWithEventBus(state, { total: 30 }, 'buy');
    row(screen, FOOD).click();
    screen.el.querySelector('[data-go]').click();
    const first = emitted.find((entry) => entry.name === 'ui:buy');
    assert.equal(typeof first.payload.intentId, 'string');
    assert.equal(screen.el.querySelector('[data-go]').disabled, false,
      'a missing synchronous event does not hold the control busy forever');
    assert.match(screen.el.querySelector('.sx-trade__note').textContent, /result is unknown/i);
    screen.el.querySelector('[data-go]').click();
    const sends = emitted.filter((entry) => entry.name === 'ui:buy');
    assert.equal(sends.length, 2);
    assert.equal(sends[1].payload.intentId, first.payload.intentId,
      'an unknown outcome cannot create a fresh-ID transaction');
    screen.dispose();
  } finally {
    uninstallSimCommandSink();
    dom.restore();
  }
});


test('stationApp reset callback uses the real receipt key and suppresses its late old intent', () => {
  const source = readFileSync(new URL('../src/ui/station/stationApp.js', import.meta.url), 'utf8');
  assert.match(source, /import\s*\{[^}]*\bTRADE_EXPECTATION_KEY\b[^}]*\}\s*from '\.\/tradeReceipt\.js';/s);
  assert.match(source, /for \(const event of \['game:new', 'game:newGame', 'save:loaded'\]\) \{\s*subscribe\(event, retireMarketExpectation\);\s*\}/);
  const callbackMatch = source.match(/const retireMarketExpectation = \(\) => \{([\s\S]*?)\n  \};/);
  const rememberMatch = source.match(/function rememberTradeIntent\(set, intentId\) \{([\s\S]*?)\n\}/);
  assert.ok(callbackMatch, 'extracts the actual reset callback body');
  assert.ok(rememberMatch, 'extracts the actual bounded retirement-set helper');

  const intentId = 'market:reset-proof:intent:1';
  const state = { ui: { [TRADE_EXPECTATION_KEY]: { intentId, commodityId: FOOD, side: 'buy', qty: 1, total: 30, stationId: STATION } } };
  const retiredMarketTradeIntentIds = new Set();
  const rememberTradeIntent = new Function('set', 'intentId', rememberMatch[1]);
  const retireMarketExpectation = new Function(
    'state', 'retiredMarketTradeIntentIds', 'rememberTradeIntent',
    'clearTradeExpectation', 'TRADE_EXPECTATION_KEY',
    `return () => {${callbackMatch[1]}\n};`,
  )(() => state, retiredMarketTradeIntentIds, rememberTradeIntent, clearTradeExpectation, TRADE_EXPECTATION_KEY);
  retireMarketExpectation();
  assert.equal(state.ui[TRADE_EXPECTATION_KEY], null);
  assert.ok(retiredMarketTradeIntentIds.has(intentId));
  assert.equal(consumeStationTradeReceipt(state, {
    intentId, stationId: STATION, commodityId: FOOD, side: 'buy', qty: 1, total: 30, receiptId: 'late-after-reset', tradeSequence: 1,
  }, { retiredIntentIds: retiredMarketTradeIntentIds, shownIntentIds: new Set() }), null,
  'the actual presenter suppresses the late receipt retired by the station reset callback');
});
