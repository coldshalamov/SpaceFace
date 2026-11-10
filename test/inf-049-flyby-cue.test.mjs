import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveNearMissCrack, NEAR_MISS_CRACK } from '../src/audio/audioSystem.js';
import { buildNearMissCue, createDamageIndicators } from '../src/ui/damageIndicators.js';
import { physics } from '../src/core/physics.js';

// INF-049 — a near miss sounds (and reads) like a near miss: the crack scales with closest
// approach AND relative speed, the crossing side gets a visual tick that survives muted
// audio, and per-projectile + burst-gap cooldowns keep volleys from stacking.

// ---------------------------------------------------------------------------
// audio shaping
// ---------------------------------------------------------------------------

test('INF-049: proximity leads, relative speed bends, legacy receipts unchanged', () => {
  const slow = resolveNearMissCrack({ distance: 10, speed: 40 });
  const fast = resolveNearMissCrack({ distance: 10, speed: 400 });
  const legacy = resolveNearMissCrack({ distance: 10 });
  assert.ok(fast.gain > slow.gain, 'a railgun cracks harder than a lob at the same distance');
  assert.ok(fast.rate > slow.rate, 'and brighter');
  assert.ok(slow.gain >= NEAR_MISS_CRACK.minGain, 'a slow failure is quiet, never absent');
  assert.ok(fast.gain <= NEAR_MISS_CRACK.maxGain, 'bounded at the top');
  assert.ok(fast.rate <= NEAR_MISS_CRACK.maxRate, 'bounded at the top');
  const pointBlank = resolveNearMissCrack({ distance: 6 });
  const far = resolveNearMissCrack({ distance: NEAR_MISS_CRACK.maxDistanceWu });
  assert.ok(pointBlank.gain > far.gain && pointBlank.rate > far.rate, 'proximity still leads');
  assert.equal(far.gain, NEAR_MISS_CRACK.minGain, 'legacy far edge keeps its authored floor');
  assert.equal(legacy.gain, resolveNearMissCrack({ distance: 10, speed: 110 }).gain,
    'unknown speed matches the mid-pace default exactly');
  assert.equal(legacy.rate, resolveNearMissCrack({ distance: 10, speed: 110 }).rate);
});

test('INF-049: unknown speed is exactly neutral', () => {
  const a = resolveNearMissCrack({ distance: 12 });
  assert.equal(a.pace, 0.5);
  assert.equal(a.gain, NEAR_MISS_CRACK.minGain + (NEAR_MISS_CRACK.maxGain - NEAR_MISS_CRACK.minGain) * a.closeness);
});

// ---------------------------------------------------------------------------
// physics receipt carries relative speed
// ---------------------------------------------------------------------------

test('INF-049: the receipt carries player-relative speed at the crossing', () => {
  const seen = [];
  const player = { id: 1, alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 10, z: 0 }, radius: 10 };
  const proj = {
    id: 50, ownerId: 9, team: 1, radius: 2,
    pos: { x: -100, z: 20 }, vel: { x: 300, z: 0 },
    data: { weaponId: 'slugger', damageType: 'kinetic' },
  };
  const state = { tick: 77, entities: new Map([[1, player]]), playerId: 1 };
  physics._considerProjectileNearMiss.call(
    { bus: { emit: (event, payload) => seen.push({ event, payload }) }, _nearMissEmitted: new Set(), _nearMissClosestScratch: {}, _diag: {} },
    proj,
    { x: -100, z: 20 },
    { x: 100, z: 20 },
    state,
  );
  assert.equal(seen.length, 1);
  assert.equal(seen[0].event, 'projectile:nearMiss');
  const rec = seen[0].payload;
  assert.ok(Math.abs(rec.distance - 20) < 1e-9, 'closest approach of the segment');
  assert.ok(Math.abs(rec.speed - 290) < 1e-9, 'player-relative speed, not muzzle speed');
  assert.deepEqual(rec.pos, { x: 0, z: 20 }, 'crossing point, not the ship');
});

// ---------------------------------------------------------------------------
// visual tick (FakeDocument harness mirrors damage-indicator-readability)
// ---------------------------------------------------------------------------

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

function withDom(fn) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = new FakeDocument();
  globalThis.window = { innerWidth: 1280, innerHeight: 720 };
  try {
    return fn();
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
}

test('INF-049: buildNearMissCue grades by proximity and keys by projectile', () => {
  assert.equal(buildNearMissCue({}), null, 'no distance, no tick');
  assert.equal(buildNearMissCue({ distance: -1 }), null);
  const close = buildNearMissCue({ distance: 4, projectileId: 50 });
  const far = buildNearMissCue({ distance: 34, projectileId: 51 });
  assert.equal(close.layer, 'nearmiss');
  assert.equal(close.sourceKey, 'nearmiss:50');
  assert.ok(close.brightness > far.brightness, 'brightness follows proximity');
  assert.ok(far.brightness > 0, 'the far edge is dim, never absent');
  assert.ok(close.ttl <= 0.6, 'gone in a breath');
});

test('INF-049: the crossing side gets a tick that yields to real damage', () => {
  withDom(() => {
    const player = { id: 1, pos: { x: 0, z: 0 } };
    const indicators = createDamageIndicators().bind(() => player, 1);
    const cross = (projectileId, distance, x, z) => indicators.onNearMiss({
      targetId: 1, projectileId, distance, pos: { x, z },
    });
    const w2s = { worldToScreen(point) { return { x: 640 + point.x, y: 360 + point.z, onScreen: true }; } };

    assert.equal(cross(50, 8, 600, 0), true, 'starboard crossing takes a free slot');
    assert.equal(indicators._activeCount(), 1);
    assert.equal(cross(50, 8, 600, 0), true, 'same projectile refreshes, never stacks');
    assert.equal(indicators._activeCount(), 1);

    indicators.tick(0.1, w2s);
    const shown = indicators.el.children.filter((child) => child.style.display === 'flex');
    assert.equal(shown.length, 1);
    assert.ok(shown[0].className.includes('layer-nearmiss'), 'neutral tick, not a damage layer');
    // Crossing at +X world projects starboard of screen center.
    const tx = Number(shown[0].style.transform.match(/translate3d\(([-\d.]+)px/)[1]);
    assert.ok(tx > 640, `tick sits on the crossing side (x=${tx})`);

    // Real damage owns the pool: fill it, the next shave stays quiet.
    const hit = (attackerId, x, z) => indicators.onDamage({
      targetId: 1, attackerId, applied: 10, dominantLayer: 'shield',
      after: { shield: 30, shieldMax: 55 }, attackerPos: { x, z },
    });
    hit(9, -80, 0);
    hit(10, 0, 80);
    assert.equal(indicators._activeCount(), 3, 'pool full');
    assert.equal(cross(51, 6, -600, 0), false, 'a shave never evicts damage');
    assert.equal(indicators._activeCount(), 3);

    // Foreign-target receipts never reach this player.
    assert.equal(indicators.onNearMiss({ targetId: 7, projectileId: 52, distance: 6, pos: { x: 1, z: 0 } }), false);
  });
});

test('INF-049: closer crossings render brighter, then retire on their short clock', () => {
  withDom(() => {
    const player = { id: 1, pos: { x: 0, z: 0 } };
    const w2s = { worldToScreen(point) { return { x: 640 + point.x, y: 360 + point.z, onScreen: true }; } };
    const a = createDamageIndicators().bind(() => player, 1);
    const b = createDamageIndicators().bind(() => player, 1);
    a.onNearMiss({ targetId: 1, projectileId: 60, distance: 4, pos: { x: 600, z: 0 } });
    b.onNearMiss({ targetId: 1, projectileId: 61, distance: 32, pos: { x: 600, z: 0 } });
    a.tick(0.2, w2s);
    b.tick(0.2, w2s);
    const opa = (ind) => Number(ind.el.children.find((c) => c.style.display === 'flex').style.opacity);
    assert.ok(opa(a) > opa(b), `close (${opa(a)}) outshines far (${opa(b)})`);
    a.tick(1, w2s);
    assert.equal(a._activeCount(), 0, 'the tick retires on its short clock');
  });
});
