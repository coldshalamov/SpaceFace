// SFQ-I009 — two latch rejections must say two different plain sentences.
//
//   node --test test/infer-p08-latch-denied.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { onboarding } from '../src/systems/onboarding.js';

const SEED = 4242;

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  toggle(value, force) {
    if (force === undefined ? !this.values.has(value) : force) this.values.add(value);
    else this.values.delete(value);
  }
  contains(value) { return this.values.has(value); }
}
class FakeElement {
  constructor(document, tagName) {
    this.ownerDocument = document;
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.className = '';
    this.style = {};
    this.textContent = '';
    this.id = '';
    this.innerHTML = '';
  }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener() {}
  removeEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
}
class FakeDocument {
  constructor() { this.head = new FakeElement(this, 'head'); this.body = new FakeElement(this, 'body'); }
  createElement(tagName) { return new FakeElement(this, tagName); }
  getElementById() { return null; }
}

function drive() {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = new FakeDocument();
  globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };
  const handlers = new Map();
  const events = [];
  const state = {
    playerId: 1,
    tick: 0,
    simTime: 0,
    rng: () => 0.5,
    entities: new Map(),
    entityList: [],
    player: { hints: {}, flags: {} },
    settings: {},
  };
  const bus = {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
      return () => {};
    },
    emit(event, payload) { events.push({ event, payload }); },
  };
  const system = Object.create(onboarding);
  system.init({ state, bus, helpers: {} });
  return {
    restore() {
      try { system.destroy(); } catch { /* headless */ }
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    },
    hintFor(reason) {
      const fns = handlers.get('tether:latchDenied') || [];
      for (let i = 0; i < 3; i++) fns.forEach((fn) => fn({ reason }));
      const shown = events.filter((e) => e.event === 'hud:firstUse');
      assert.equal(shown.length, 1, `three ${reason} denials earn one hint`);
      return shown[0].payload.text;
    },
  };
}

function withThrowFlag(fn) {
  const previousEnabled = MASSLINE2_FLAGS.enabled;
  const previous = MASSLINE2_FLAGS.throw;
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.throw = true;
  try { return fn(); } finally {
    MASSLINE2_FLAGS.throw = previous;
    MASSLINE2_FLAGS.enabled = previousEnabled;
  }
}

const RAW_ID = /out-of-range|out_of_range|scripted-body|no-target|owner_attachment/;

test('range and protected latch denials say different plain sentences (seed 4242)', () => {
  withThrowFlag(() => {
    const range = drive();
    const guarded = drive();
    try {
      const rangeLine = range.hintFor('out-of-range');
      const guardedLine = guarded.hintFor('protected');
      assert.notEqual(rangeLine, guardedLine, 'two causes must not share one sentence');
      assert.match(rangeLine, /range/i);
      assert.match(guardedLine, /protected/i);
      assert.doesNotMatch(rangeLine, RAW_ID);
      assert.doesNotMatch(guardedLine, RAW_ID);
      console.log(`SEED=${SEED} range=${JSON.stringify(rangeLine)} protected=${JSON.stringify(guardedLine)}`);
    } finally {
      range.restore();
      guarded.restore();
    }
  });
});

test('a blocked line of sight does not reuse the range or protected sentence (seed 4242)', () => {
  withThrowFlag(() => {
    const blocked = drive();
    const range = drive();
    const guarded = drive();
    try {
      const blockedLine = blocked.hintFor('blocked');
      const rangeLine = range.hintFor('out-of-range');
      const guardedLine = guarded.hintFor('protected');
      assert.notEqual(blockedLine, rangeLine);
      assert.notEqual(blockedLine, guardedLine);
      assert.match(blockedLine, /sight|in the way/i);
      assert.doesNotMatch(blockedLine, RAW_ID);
      console.log(`SEED=${SEED} blocked=${JSON.stringify(blockedLine)}`);
    } finally {
      blocked.restore();
      range.restore();
      guarded.restore();
    }
  });
});
