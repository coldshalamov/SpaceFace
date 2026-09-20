// INF-052 — offscreen threat ranking favors imminent attackers, selects stably, caps small,
// keeps to legitimate knowledge (hostiles inside scanner range), and never sits on the
// objective marker. Drives the real createThreatHalo through its public update().
import test from 'node:test';
import assert from 'node:assert/strict';
import { createThreatHalo } from '../src/ui/threatHalo.js';
import { TELEGRAPH_CUE_TICKS } from '../src/ui/threatHalo.js';

function mockDocument() {
  const elements = [];
  const fakeElement = (tag) => {
    const el = {
      tagName: String(tag || 'div').toUpperCase(),
      className: '',
      attributes: {},
      style: {},
      children: [],
      innerHTML: '',
      parentNode: null,
      setAttribute(k, v) { this.attributes[k] = String(v); },
      removeAttribute(k) { delete this.attributes[k]; },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
      },
      removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx >= 0) this.children.splice(idx, 1);
        child.parentNode = null;
      },
    };
    elements.push(el);
    return el;
  };
  return { elements, document: { createElement: fakeElement } };
}

// Deterministic projector: world (x,z) → screen, always off-screen so every hostile inside
// scanner range is halo-eligible. Screen position follows world direction from (640,360).
function projectorFor(scale = 1) {
  return (world, out) => {
    out.x = 640 + world.x * scale;
    out.y = 360 + world.z * scale;
    out.onScreen = false;
    return out;
  };
}

function busOf() {
  const listeners = new Map();
  return {
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return () => listeners.get(name).delete(fn);
    },
    emit(name, payload) {
      for (const fn of listeners.get(name) || []) fn(payload);
    },
  };
}

function player() {
  return { id: 'player', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
}

function hostile(id, pos, vel, extra = {}) {
  return {
    id, type: 'ship', team: 1, alive: true, pos, vel: vel || { x: 0, z: 0 },
    data: { encounter: true, ...extra },
  };
}

function arcSlots(mock) {
  return mock.elements.filter((el) => String(el.className).includes('sf-threat-halo__slot--arc'));
}

function visibleIds(mock) {
  return arcSlots(mock)
    .filter((el) => el.style.display === 'block')
    .map((el) => el.attributes['data-entity-id']);
}

// Same-tier hostiles at the right edge, near-equidistant, both drifting (bucket 0).
// Before INF-052 they traded rank (and edge placement) whenever raw distance jittered.
test('near-equal contacts keep their arcs stable while jitter stays inside one band', () => {
  const mock = mockDocument();
  const oldDoc = globalThis.document;
  globalThis.document = mock.document;
  try {
    const halo = createThreatHalo(mock.document.createElement('div'), busOf());
    const p = player();
    // alpha: dist ~700, beta: dist ~800 — same 650 WU band, same tier, same bucket.
    const a = hostile('alpha', { x: 700, z: 0 }, { x: -20, z: 0 }); // opening
    const b = hostile('beta', { x: 800, z: 0 }, { x: -20, z: 0 });
    const state = { tick: 100, simTime: 100 / 60, playerId: p.id, entityList: [p, a, b] };
    const project = projectorFor();
    halo.update(p, state, project);
    assert.deepEqual(visibleIds(mock), ['alpha', 'beta'], 'nearer band-mate leads at rest');

    // Jitter both distances by ±30 WU for 30 ticks — beta even becomes nearer — without
    // crossing a band. The slot assignment (and therefore edge placement order) must not flip.
    for (let t = 0; t < 30; t++) {
      const wobble = t % 2 === 0 ? 30 : -30;
      a.pos.x = 700 + wobble;
      b.pos.x = 800 - wobble;
      state.tick = 101 + t;
      state.simTime = state.tick / 60;
      halo.update(p, state, project);
      assert.deepEqual(visibleIds(mock), ['alpha', 'beta'],
        `tick ${t}: raw-distance jitter must not reshuffle equal candidates`);
    }

    // A genuine band crossing (beta closes under 650) DOES reorder — urgency still wins.
    b.pos.x = 600;
    halo.update(p, state, project);
    assert.deepEqual(visibleIds(mock), ['beta', 'alpha'], 'a real crossing reorders');
  } finally {
    globalThis.document = oldDoc;
  }
});

test('a fighter flying at the player holds a slot over an opening drifter when the cap bites', () => {
  const mock = mockDocument();
  const oldDoc = globalThis.document;
  globalThis.document = mock.document;
  try {
    const halo = createThreatHalo(mock.document.createElement('div'), busOf());
    const p = player();
    // Five same-tier hostiles: four opening drifters at mid-range, one closing hard.
    const closing = hostile('closing', { x: 900, z: 0 }, { x: -200, z: 0 });
    const drifters = [1, 2, 3, 4].map((n) => hostile('drift' + n, { x: 200 + n * 100, z: 0 }, { x: -10, z: 0 }));
    const state = { tick: 10, simTime: 10 / 60, playerId: p.id, entityList: [p, closing, ...drifters] };
    halo.update(p, state, projectorFor(0.2));
    const ids = visibleIds(mock);
    assert.equal(ids.length, 4, 'small cap: at most four hostile arcs');
    assert.ok(ids.includes('closing'), 'the attacker flying at the player survives eviction');

    // ...and it is the FIRST slot (rank 0): nothing outranks a tier-equal closing attacker.
    assert.equal(ids[0], 'closing');
  } finally {
    globalThis.document = oldDoc;
  }
});

test('a telegraphed attacker is favored inside its tier, then the cue expires quietly', () => {
  const mock = mockDocument();
  const oldDoc = globalThis.document;
  globalThis.document = mock.document;
  try {
    const bus = busOf();
    const halo = createThreatHalo(mock.document.createElement('div'), bus);
    const p = player();
    const calm = hostile('calm', { x: 600, z: 0 }, { x: 0, z: 0 });
    const announced = hostile('announced', { x: 900, z: 0 }, { x: 0, z: 0 });
    const state = { tick: 10, simTime: 10 / 60, playerId: p.id, entityList: [p, calm, announced] };
    bus.emit('ai:telegraph', {
      entityId: 'announced', mineId: null, kind: 'engine_flare',
      durationTicks: TELEGRAPH_CUE_TICKS, tick: 10,
    });
    halo.update(p, state, projectorFor(0.2));
    assert.deepEqual(visibleIds(mock), ['announced', 'calm'],
      'the announced attack run outranks its tier-equal neighbor');

    const expired = { tick: 10 + TELEGRAPH_CUE_TICKS + 1, simTime: (10 + TELEGRAPH_CUE_TICKS + 1) / 60, playerId: p.id, entityList: [p, calm, announced] };
    halo.update(p, expired, projectorFor(0.2));
    assert.deepEqual(visibleIds(mock), ['calm', 'announced'],
      'an expired cue drops back to band order without residue');
  } finally {
    globalThis.document = oldDoc;
  }
});

test('harmless contacts never surface and mass still anchors the top slot', () => {
  const mock = mockDocument();
  const oldDoc = globalThis.document;
  globalThis.document = mock.document;
  try {
    const halo = createThreatHalo(mock.document.createElement('div'), busOf());
    const p = player();
    const friend = { id: 'buddy', type: 'ship', team: 0, alive: true, pos: { x: 300, z: 0 }, vel: { x: 0, z: 0 }, data: {} };
    const hostileScout = hostile('scout', { x: 400, z: 0 }, { x: 0, z: 0 });
    const hostileHulk = hostile('hulk', { x: 500, z: 0 }, { x: 0, z: 0 }, { role: 'capital' });
    const state = { tick: 10, simTime: 10 / 60, playerId: p.id, entityList: [p, friend, hostileScout, hostileHulk] };
    halo.update(p, state, projectorFor(0.2));
    const ids = visibleIds(mock);
    assert.ok(!ids.includes('buddy'), 'friendly contact is never a threat arc');
    assert.deepEqual(ids, ['hulk', 'scout']);
  } finally {
    globalThis.document = oldDoc;
  }
});

test('no arc lands on the projected objective marker', () => {
  const mock = mockDocument();
  const oldDoc = globalThis.document;
  globalThis.document = mock.document;
  try {
    const halo = createThreatHalo(mock.document.createElement('div'), busOf());
    const p = player();
    // Hostile dead ahead (screen top-center) where the off-screen objective arrow clamps.
    const ahead = hostile('ahead', { x: 0, z: -1200 }, { x: 0, z: 0 });
    const state = {
      tick: 10, simTime: 10 / 60, playerId: p.id,
      entityList: [p, ahead],
      nav: { waypoint: { kind: 'mission', pos: { x: 0, z: -5000 } } },
    };
    halo.update(p, state, projectorFor(0.3));
    const box = { x: 640 - 52, y: 24 - 30, w: 104, h: 60 };
    const overridesObjective = (px, py, rect) => (
      px > rect.x - 27 && px < rect.x + rect.w + 27 && py > rect.y - 9 && py < rect.y + rect.h + 9
    );
    for (const el of arcSlots(mock)) {
      if (el.style.display !== 'block') continue;
      const m = /translate3d\((-?[\d.]+)px,(-?[\d.]+)px/.exec(el.style.transform || '');
      assert.ok(m, 'visible arc carries a transform');
      assert.ok(!overridesObjective(Number(m[1]), Number(m[2]), box), 'arc pushed off the objective marker');
    }
  } finally {
    globalThis.document = oldDoc;
  }
});
