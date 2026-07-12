import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildDamageIndicatorCue,
  createDamageIndicators,
} from '../src/ui/damageIndicators.js';

test('damage cue distinguishes shield, armor, and critical hull without damage numbers', () => {
  assert.deepEqual(buildDamageIndicatorCue({
    applied: 8,
    dominantLayer: 'shield',
    after: { shield: 42, shieldMax: 55, armor: 30, armorMax: 30, hull: 140, hullMax: 140 },
  }), {
    layer: 'shield', glyph: 'S', tone: 'shield', severity: 'hit', ttl: 0.75,
    sourceKey: 'environment', remainingPct: 76,
  });

  assert.deepEqual(buildDamageIndicatorCue({
    applied: 12,
    attackerId: 9,
    dominantLayer: 'armor',
    after: { shield: 0, shieldMax: 55, armor: 12, armorMax: 30, hull: 120, hullMax: 140 },
  }), {
    layer: 'armor', glyph: 'A', tone: 'warning', severity: 'warning', ttl: 0.9,
    sourceKey: 'actor:9', remainingPct: 40,
  });

  assert.deepEqual(buildDamageIndicatorCue({
    applied: 18,
    attackerId: 9,
    dominantLayer: 'hull',
    after: { shield: 0, shieldMax: 55, armor: 0, armorMax: 30, hull: 21, hullMax: 140 },
  }), {
    layer: 'hull', glyph: 'H', tone: 'danger', severity: 'critical', ttl: 1.1,
    sourceKey: 'actor:9', remainingPct: 15,
  });

  assert.equal(buildDamageIndicatorCue({ applied: 0, dominantLayer: null }), null);
  assert.equal(buildDamageIndicatorCue({ amount: 4 }).layer, 'shield', 'legacy damage emitters still wake the cue');
});

test('impact markers coalesce repeated hits, cap simultaneous sources, and retire quietly', () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const document = new FakeDocument();
  globalThis.document = document;
  globalThis.window = { innerWidth: 1280, innerHeight: 720 };
  try {
    const player = { id: 1, pos: { x: 0, z: 0 } };
    const indicators = createDamageIndicators().bind(() => player, 1);
    const hit = (attackerId, layer, x, z, after) => indicators.onDamage({
      targetId: 1,
      attackerId,
      applied: 10,
      dominantLayer: layer,
      after,
      attackerPos: { x, z },
    });

    hit(9, 'shield', 80, 0, { shield: 35, shieldMax: 55 });
    hit(9, 'shield', 82, 2, { shield: 30, shieldMax: 55 });
    assert.equal(indicators._activeCount(), 1, 'same source and layer refresh one marker');

    hit(10, 'armor', -80, 0, { armor: 18, armorMax: 30 });
    hit(11, 'hull', 0, 80, { hull: 50, hullMax: 140 });
    hit(12, 'hull', 0, -80, { hull: 20, hullMax: 140 });
    assert.equal(indicators._activeCount(), 3, 'marker pool never becomes a damage halo');

    indicators.tick(0.1, { worldToScreen(point) { return { x: 640 + point.x, y: 360 + point.z, onScreen: true }; } });
    const visible = indicators.el.children.filter((child) => child.style.display === 'flex');
    assert.equal(visible.length, 3);
    assert.ok(visible.some((child) => child.className.includes('layer-armor')));
    assert.ok(visible.some((child) => child.className.includes('layer-hull')));
    assert.ok(visible.every((child) => child.getAttribute('aria-hidden') === 'true'));

    indicators.tick(2, { worldToScreen(point) { return { x: 640 + point.x, y: 360 + point.z, onScreen: true }; } });
    assert.equal(indicators._activeCount(), 0);
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});

test('indicator styling is non-diegetic, tokenized, and contains no screen-edge arcs or idle animation', () => {
  const source = readFileSync(new URL('../src/ui/damageIndicators.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /sf-dmgind-arc/);
  assert.doesNotMatch(source, /radial-gradient|mix-blend-mode|@keyframes|animation:/);
  assert.match(source, /var\(--sf-shield,\s*#39d0ff\)/);
  assert.match(source, /var\(--sf-warn,\s*#ffb35c\)/);
  assert.match(source, /var\(--sf-danger,\s*#ff5c5c\)/);
  assert.match(source, /getFlashReduced/);
});

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  toggle(value, force) {
    if (force === undefined ? !this.values.has(value) : force) this.values.add(value);
    else this.values.delete(value);
  }
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
  }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
}

class FakeDocument {
  constructor() { this.head = new FakeElement(this, 'head'); }
  createElement(tagName) { return new FakeElement(this, tagName); }
  getElementById(id) {
    const stack = [...this.head.children];
    while (stack.length) {
      const item = stack.pop();
      if (item.id === id) return item;
      stack.push(...item.children);
    }
    return null;
  }
}
