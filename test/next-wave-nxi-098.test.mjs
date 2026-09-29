// NXI-098 — a sealed held lot stays on the sell list, and Sell does not take it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { isUnsellableCargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { createMarketScreen } from '../src/ui/station/screens/market.js';

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
    assert.equal(sealedSale.textContent.includes('Contemplated sale'), false);
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
    assert.equal(screen.el.querySelector('[data-sale-line]').textContent.includes('Contemplated sale'), false);
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
    assert.equal(screen.el.querySelector('[data-sale-line]').textContent.includes('Contemplated sale'), false);
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
