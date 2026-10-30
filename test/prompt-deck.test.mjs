// Prompt deck policy contracts — headless. The deck module must stay importable without a DOM
// (src/ui/promptDeck.js keeps its pure helpers pure); these tests pin the ladder, digit routing
// and countdown grammar that the live deck and its adapters rely on.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPromptDeck,
  planLadder,
  routeDigit,
  deadlineText,
  digitIndex,
  planSlotClaim,
  fullSlotsForViewport,
} from '../src/ui/promptDeck.js';

const entry = (id, deadlineAt, seq = 0, choices = [], headline = '') => ({ id, deadlineAt, seq, choices, headline });

test('ladder orders soonest deadline first, offer sequence breaks ties', () => {
  const order = planLadder([
    entry('law', 30, 1),
    entry('parley', 20, 2),
    entry('encounter', 40, 0),
    entry('customs', null, 3),
  ]);
  assert.deepEqual(order, ['parley', 'law', 'encounter', 'customs']);
});

test('ladder treats a ttl-only decision like an undisplayed deadline that still expires', () => {
  const order = planLadder([
    entry('receipt-ish', null, 5, []),
    entry('timed', 25, 6),
  ]);
  assert.deepEqual(order, ['timed', 'receipt-ish']);
});

test('equally urgent player decisions precede passive information and collapse accessibly on small viewports', () => {
  const entries = [
    entry('fit-check', 20, 1, [], 'CAPABILITY DOOR'),
    entry('scan-return', 20, 2, [{ id: 'investigate', label: 'INVESTIGATE' }], 'MERCY DISTRESS'),
  ];
  const order = planLadder(entries);
  assert.deepEqual(order, ['scan-return', 'fit-check'], 'the available action owns the full card first');

  const slots = fullSlotsForViewport(900, 900);
  assert.equal(slots, 1, '900 px wide reserves one full card');
  assert.equal(fullSlotsForViewport(390, 844), 1, 'phone layout uses the same compact ladder');
  assert.equal(fullSlotsForViewport(1440, 900), 2, 'desktop retains its established two-card layout');
  assert.deepEqual(routeDigit(entries, null, '1', slots), {
    type: 'choose', id: 'scan-return', choiceId: 'investigate',
  });
  assert.deepEqual(routeDigit(entries, null, '2', slots), { type: 'raise', id: 'fit-check' },
    'the passive Fit Check remains reachable as a collapsed chip');
  assert.deepEqual(planSlotClaim(entries, null, slots), {
    slots: [1, 2], answers: ['INVESTIGATE', 'RAISE CAPABILITY DOOR'],
  }, 'the visible key rail matches responsive keyboard routing');
});

test('mounted 900 px deck gives Scan Return the full card, routes Digit1, and keeps Fit Check raisable', () => {
  const previousDocument = globalThis.document;
  const doc = promptDeckDocument(900, 900);
  globalThis.document = doc;
  const chosen = [];
  const bus = {
    emit() {},
    on() { return () => {}; },
  };
  const deck = createPromptDeck({ document: doc, state: { mode: 'flight', simTime: 0, ui: {} }, bus });
  try {
    deck.offerDecision({
      id: 'fit-check', kind: 'info', sender: 'FIT CHECK', headline: 'CAPABILITY DOOR',
      detail: 'The fit lacks the named head — not yet.', ttlAt: 10, choices: [],
    });
    deck.offerDecision({
      id: 'scan-return', kind: 'info', sender: 'SCAN RETURN', headline: 'MERCY DISTRESS',
      detail: 'STRONG · 98 u · PASS 1 — Clamp it clear before the hauler arrives.',
      ttlAt: 10, choices: [{ id: 'investigate', label: 'INVESTIGATE MANUALLY' }],
      onChoose: (choiceId, source) => chosen.push({ choiceId, source }),
    });

    assert.equal(deck.el.children.length, 2);
    assert.equal(deck.el.children[0].dataset.deckId, 'scan-return', 'the actual layout projects choices into its priority order');
    assert.equal(deck.el.children[1].classList.contains('sf-prompt-chip'), true);
    assert.equal(deck.el.children[1].dataset.deckId, 'fit-check');
    assert.match(deck.el.children[1].getAttribute('aria-label'), /CAPABILITY DOOR/);

    doc.dispatch('keydown', { key: '1' });
    assert.deepEqual(chosen, [{ choiceId: 'investigate', source: 'keyboard' }],
      'the visible action owns Digit1');

    deck.el.children[1].click();
    assert.equal(deck.raisedId, 'fit-check', 'the collapsed passive card remains raisable');
    assert.equal(deck.el.children[0].dataset.deckId, 'fit-check', 'explicit raise is preserved');
  } finally {
    deck.destroy();
    globalThis.document = previousDocument;
  }
});

test('digits are global display-line slots: every printed keycap fires, chips claim the rest', () => {
  const entries = [
    entry('parley', 20, 1, [{ id: 'comply' }, { id: 'refuse' }, { id: 'run' }]),
    entry('law', 30, 2, [{ id: 'comply' }]),
    entry('encounter', 40, 0, [{ id: 'respond' }, { id: 'log' }]),
  ];
  // Display line: parley (raised) + law full; encounter is the one chip.
  // Walk: comply=1 refuse=2 run=3 law-comply=4, chip encounter=5.
  assert.deepEqual(routeDigit(entries, 'parley', '1'), { type: 'choose', id: 'parley', choiceId: 'comply' });
  assert.deepEqual(routeDigit(entries, 'parley', '3'), { type: 'choose', id: 'parley', choiceId: 'run' });
  assert.deepEqual(routeDigit(entries, 'parley', '4'), { type: 'choose', id: 'law', choiceId: 'comply' });
  assert.deepEqual(routeDigit(entries, 'parley', '5'), { type: 'raise', id: 'encounter' });
  assert.equal(routeDigit(entries, 'parley', '6'), null);
  // numpad and bare digit keys route identically
  assert.deepEqual(routeDigit(entries, 'parley', 'Digit2'), { type: 'choose', id: 'parley', choiceId: 'refuse' });
  assert.deepEqual(routeDigit(entries, 'parley', 'Numpad3'), { type: 'choose', id: 'parley', choiceId: 'run' });
});

test('a player raise re-orders the display line and the digit walk follows what is printed', () => {
  const entries = [
    entry('a', 20, 1, [{ id: 'x' }]),
    entry('b', 30, 2, [{ id: 'y' }]),
    entry('c', 40, 3, [{ id: 'z' }]),
  ];
  // 'c' was raised: display line c, a, b — full c+a, chip b. Walk: z=1, x=2, chip b=3.
  assert.deepEqual(routeDigit(entries, 'c', '1'), { type: 'choose', id: 'c', choiceId: 'z' });
  assert.deepEqual(routeDigit(entries, 'c', '2'), { type: 'choose', id: 'a', choiceId: 'x' });
  assert.deepEqual(routeDigit(entries, 'c', '3'), { type: 'raise', id: 'b' });
  assert.equal(routeDigit(entries, 'c', '4'), null);
  // a stale raised id falls back to the ladder head
  assert.deepEqual(routeDigit(entries, 'gone', '1'), { type: 'choose', id: 'a', choiceId: 'x' });
});

test('disabled choices never claim a digit — the key routes to the next visible thing', () => {
  const entries = [
    entry('law', 30, 1, [{ id: 'comply', disabled: true }, { id: 'flee' }]),
  ];
  // digit 1 targets the first NON-disabled choice (flee), digit 2 raises (no chips → null)
  assert.deepEqual(routeDigit(entries, 'law', '1'), { type: 'choose', id: 'law', choiceId: 'flee' });
  assert.equal(routeDigit(entries, 'law', '2'), null);
});

test('countdown grammar counts whole seconds and stands down to the flight-active line', () => {
  assert.equal(deadlineText(30, 18.4), 'Choose a response · 12 seconds');
  assert.equal(deadlineText(30, 29.2), 'Choose a response · 1 second');
  assert.equal(deadlineText(30, 40), 'Choose a response · 0 seconds');
  assert.equal(deadlineText(null, 10), 'Choose a response. Flight remains active.');
  assert.equal(deadlineText(30, 18, 'SCAN AUTHORIZED'), 'SCAN AUTHORIZED',
    'an explicit status flag replaces the countdown line (the flag slot repeats it)');
});

test('slot claim mirrors the digit walk — borrowed rail sockets show the printed answers', () => {
  const entries = [
    entry('parley', 20, 1, [{ id: 'comply', label: 'COMPLY' }, { id: 'refuse', label: 'REFUSE' }, { id: 'run', label: 'RUN' }]),
    entry('law', 30, 2, [{ id: 'comply', label: 'COMPLY' }], 'SECTOR LAW'),
    entry('encounter', 40, 0, [{ id: 'respond', label: 'RESPOND' }, { id: 'log', label: 'LOG' }], 'STRANGE SIGNAL'),
  ];
  // Same walk as routeDigit: parley choices 1-3, law comply 4, chip raise 5.
  assert.deepEqual(planSlotClaim(entries, 'parley'), {
    slots: [1, 2, 3, 4, 5],
    answers: ['COMPLY', 'REFUSE', 'RUN', 'COMPLY', 'RAISE STRANGE SIGNAL'],
  });
  // A player raise re-orders the claim exactly like the keys: encounter's two choices,
  // parley's three, then the collapsed law chip.
  assert.deepEqual(planSlotClaim(entries, 'encounter'), {
    slots: [1, 2, 3, 4, 5, 6],
    answers: ['RESPOND', 'LOG', 'COMPLY', 'REFUSE', 'RUN', 'RAISE SECTOR LAW'],
  });
});

test('slot claim releases when nothing routes — disabled choices and empty ladders claim nothing', () => {
  assert.equal(planSlotClaim([], null), null);
  assert.equal(planSlotClaim([entry('bare', null, 0)], null), null,
    'a status frame with no choices captures no digits');
  const disabledOnly = [entry('law', 30, 1, [{ id: 'comply', disabled: true }])];
  assert.equal(planSlotClaim(disabledOnly, 'law'), null,
    'an all-disabled frame routes no digit, so the rail stays unclaimed');
  // Disabled choices never claim a slot: only 'flee' borrows digit 1.
  const mixed = [entry('law', 30, 1, [{ id: 'comply', label: 'COMPLY', disabled: true }, { id: 'flee', label: 'FLEE' }])];
  assert.deepEqual(planSlotClaim(mixed, 'law'), { slots: [1], answers: ['FLEE'] });
});

test('digit parsing covers bare keys and both keypad code families', () => {
  assert.equal(digitIndex('5'), 4);
  assert.equal(digitIndex('Digit9'), 8);
  assert.equal(digitIndex('Numpad1'), 0);
  assert.equal(digitIndex('Digit0'), -1);
  assert.equal(digitIndex('Tab'), -1);
});

function promptDeckDocument(width, height) {
  const listeners = new Map();
  const make = (tagName) => {
    const node = {
      tagName, id: '', className: '', textContent: '', hidden: false, disabled: false,
      children: [], attrs: {}, dataset: {}, listeners: {}, parentNode: null,
      style: { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } },
      get firstElementChild() { return this.children[0] || null; },
      get lastElementChild() { return this.children.at(-1) || null; },
      get nextElementSibling() {
        const siblings = this.parentNode?.children || [];
        return siblings[siblings.indexOf(this) + 1] || null;
      },
      get childElementCount() { return this.children.length; },
      appendChild(child) { detach(child); child.parentNode = this; this.children.push(child); return child; },
      append(...children) { for (const child of children) this.appendChild(child); },
      insertBefore(child, ref) {
        if (child === ref) return child;
        detach(child); child.parentNode = this;
        const index = ref ? this.children.indexOf(ref) : -1;
        if (index < 0) this.children.push(child); else this.children.splice(index, 0, child);
        return child;
      },
      replaceChildren(...children) { for (const child of [...this.children]) detach(child); this.append(...children); },
      remove() { detach(this); },
      contains(target) { return target === this || this.children.some((child) => child.contains(target)); },
      setAttribute(name, value) { this.attrs[name] = String(value); },
      getAttribute(name) { return this.attrs[name] ?? null; },
      removeAttribute(name) { delete this.attrs[name]; },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== fn); },
      click() { for (const fn of this.listeners.click || []) fn({ target: this, preventDefault() {}, stopPropagation() {} }); },
    };
    function detach(child) {
      const siblings = child.parentNode?.children;
      const index = siblings?.indexOf(child) ?? -1;
      if (index >= 0) siblings.splice(index, 1);
      child.parentNode = null;
    }
    node.classList = {
      add(...names) { node.className = [...new Set([...node.className.split(/\s+/), ...names])].filter(Boolean).join(' '); },
      remove(...names) { node.className = node.className.split(/\s+/).filter((name) => name && !names.includes(name)).join(' '); },
      contains(name) { return node.className.split(/\s+/).includes(name); },
      toggle(name, force) {
        const shouldAdd = force === undefined ? !node.classList.contains(name) : !!force;
        if (shouldAdd) node.classList.add(name); else node.classList.remove(name);
        return shouldAdd;
      },
    };
    return node;
  };
  const head = make('head');
  const body = make('body');
  body.id = 'ui-root';
  const documentElement = make('html');
  documentElement.classList.add('sf-reduce-motion');
  const viewListeners = new Map();
  const defaultView = {
    innerWidth: width,
    innerHeight: height,
    addEventListener(type, fn) { (viewListeners.get(type) || viewListeners.set(type, new Set()).get(type)).add(fn); },
    removeEventListener(type, fn) { viewListeners.get(type)?.delete(fn); },
  };
  const doc = {
    head, body, documentElement, defaultView,
    createElement: make,
    getElementById(id) {
      if (id === 'ui-root') return body;
      const find = (node) => node.id === id ? node : node.children.map(find).find(Boolean) || null;
      return find(head) || find(body);
    },
    addEventListener(type, fn) { (listeners.get(type) || listeners.set(type, new Set()).get(type)).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatch(type, event) { for (const fn of listeners.get(type) || []) fn({ ...event, preventDefault() {}, stopImmediatePropagation() {} }); },
  };
  return doc;
}
