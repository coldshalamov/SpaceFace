// FIGHT-11: a mine-layer's halo counts its armed mines — the screen it laid is countable.
// Seed 4242. Positive: mine-layer hull with 2 armed mines carries "2 MINES" in its halo
// label; detonate one and the label drops to "1 MINE". Negative: an unarmed hull laying
// nothing, and a mine-layer whose mines are not yet armed, both stay quiet (no count).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createThreatHalo } from '../src/ui/threatHalo.js';
import { countArmedOwnerMines } from '../src/systems/mines.js';

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
      firstChild: null,
      setAttribute(k, v) { this.attributes[k] = String(v); },
      removeAttribute(k) { delete this.attributes[k]; },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(child) { this.children.push(child); child.parentNode = this; if (!this.firstChild) this.firstChild = child; return child; },
      removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parentNode = null; },
      querySelector() { return null; },
    };
    elements.push(el);
    return el;
  };
  return { elements, document: { createElement: fakeElement } };
}
function busOf() {
  const listeners = new Map();
  return {
    on(n, f) { if (!listeners.has(n)) listeners.set(n, new Set()); listeners.get(n).add(f); return () => listeners.get(n).delete(f); },
    emit(n, p) { for (const f of listeners.get(n) || []) f(p); },
  };
}
// Off-frame projector (mirrors threat-halo-identity.test.mjs): x=900 → screen right edge.
const projector = (w, o) => { o.x = 640 + w.x * 0.2; o.y = 360 + w.z * 0.2; o.onScreen = false; return o; };
const SEED = 4242;

function worldWithLayer() {
  const player = { id: 'player', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const layer = {
    id: 'layer', type: 'ship', team: 1, alive: true, mass: 58,
    pos: { x: 900, z: 0 }, vel: { x: 0, z: 0 },
    data: { encounter: true, role: 'mine_layer_jackal', ai: { combatDoctrineId: 'mine_layer_wake' } },
  };
  const entities = new Map([[player.id, player], [layer.id, layer]]);
  const state = {
    tick: 100, simTime: 100 / 60, playerId: player.id,
    entities, entityList: [player, layer],
  };
  return { player, layer, state };
}

function layArmedMine(state, ownerId, id, armed = true) {
  const mine = {
    id, type: 'mine', alive: true, hull: 28, ownerId, team: 1,
    pos: { x: 100 + id * 10, z: 60 }, vel: { x: 0, z: 0 },
    data: { kind: 'mine', mine: true, ownerId, armed, placedAt: 0, triggered: false },
  };
  state.entities.set(id, mine);
  state.entityList.push(mine);
  return mine;
}

const arcs = (mock) => mock.elements.filter((el) => String(el.className).includes('sf-threat-halo__slot--arc'));
const shownArcs = (mock) => arcs(mock).filter((el) => el.style.display === 'block');
const labelOf = (mock, id) => {
  const el = shownArcs(mock).find((s) => s.attributes['data-entity-id'] === String(id));
  return el ? el.attributes['aria-label'] : null;
};

test('countArmedOwnerMines counts only live armed hulls, not unarmed cargo', () => {
  const { state } = worldWithLayer();
  assert.equal(countArmedOwnerMines(state, 'layer'), 0);
  layArmedMine(state, 'layer', 11, true);
  layArmedMine(state, 'layer', 12, true);
  layArmedMine(state, 'layer', 13, false); // still arming: cargo, not screen
  assert.equal(countArmedOwnerMines(state, 'layer'), 2);
});

test('mine-layer halo label carries its armed mine count and tracks lay and detonate', () => {
  const mock = mockDocument();
  const old = globalThis.document;
  globalThis.document = mock.document;
  try {
    const bus = busOf();
    const halo = createThreatHalo(mock.document.createElement('div'), bus);
    const { player, layer, state } = worldWithLayer();
    layArmedMine(state, layer.id, 11, true);
    layArmedMine(state, layer.id, 12, true);
    halo.update(player, state, projector);
    const laid = labelOf(mock, layer.id);
    assert.ok(laid, 'mine-layer arc must be visible');
    assert.match(laid, /2 MINES/, `halo must count the laid screen, got: ${laid}`);

    // Detonate one: the screen shrinks and the halo follows.
    const spent = state.entities.get(11);
    spent.alive = false;
    spent.data.triggered = true;
    halo.update(player, state, projector);
    const after = labelOf(mock, layer.id);
    assert.ok(after, 'mine-layer arc must stay visible after one detonation');
    assert.match(after, /1 MINE/, `halo must track detonation, got: ${after}`);
    assert.doesNotMatch(after, /2 MINES/);
  } finally { globalThis.document = old; }
});

test('halo stays quiet: unarmed mine-layer screen and non-layer hulls carry no count', () => {
  const mock = mockDocument();
  const old = globalThis.document;
  globalThis.document = mock.document;
  try {
    const bus = busOf();
    const halo = createThreatHalo(mock.document.createElement('div'), bus);
    const { player, layer, state } = worldWithLayer();
    // Mines still arming: the screen is unarmed cargo, not a countable threat.
    layArmedMine(state, layer.id, 21, false);
    const raider = {
      id: 'raider', type: 'ship', team: 1, alive: true, mass: 40,
      pos: { x: 0, z: 900 }, vel: { x: 0, z: 0 },
      data: { encounter: true, role: 'raider' },
    };
    state.entities.set(raider.id, raider);
    state.entityList.push(raider);
    layArmedMine(state, raider.id, 22, true); // a stray hull's mine is not a screen
    halo.update(player, state, projector);
    const layerLabel = labelOf(mock, layer.id);
    assert.ok(layerLabel, 'mine-layer arc must be visible');
    assert.doesNotMatch(layerLabel, /\d+ MINES?/, `unarmed screen must stay quiet, got: ${layerLabel}`);
    const raiderLabel = labelOf(mock, raider.id);
    assert.ok(raiderLabel, 'raider arc must be visible');
    assert.doesNotMatch(raiderLabel, /\d+ MINES?/, `non-layer hull must stay quiet, got: ${raiderLabel}`);
  } finally { globalThis.document = old; }
});

test('mine-layer marker renders an exposed count that follows laying and detonation', () => {
  const mock = mockDocument();
  const old = globalThis.document;
  globalThis.document = mock.document;
  try {
    const root = mock.document.createElement('div');
    const halo = createThreatHalo(root, busOf());
    const { player, layer, state } = worldWithLayer();
    const first = layArmedMine(state, layer.id, 31, true);
    const second = layArmedMine(state, layer.id, 32, true);
    halo.update(player, state, projector);
    const slot = shownArcs(mock).find((s) => s.attributes['data-entity-id'] === layer.id);
    const count = slot.children.find((el) => el.textContent === '2' && el.style.display !== 'none');
    assert.ok(count, 'the rendered marker must contain a visible numeral for its two armed mines');
    for (let el = count; el; el = el.parentNode) {
      assert.notEqual(el.style.display, 'none', 'the count must have no hidden display ancestor');
    }
    for (let el = slot; el; el = el.parentNode) {
      assert.notEqual(el.getAttribute('aria-hidden'), 'true', 'the marker name must reach accessibility clients');
    }
    assert.equal(slot.getAttribute('role'), 'img', 'the named marker must expose an accessible image');
    assert.match(slot.getAttribute('aria-label'), /2 MINES/);

    first.alive = false;
    first.data.triggered = true;
    halo.update(player, state, projector);
    assert.equal(count.textContent, '1', 'detonation immediately reduces the drawn count');
    assert.notEqual(count.style.display, 'none');
    assert.match(slot.getAttribute('aria-label'), /1 MINE/);

    second.alive = false;
    second.data.triggered = true;
    halo.update(player, state, projector);
    assert.equal(count.style.display, 'none', 'zero armed mines draw no count');
    assert.doesNotMatch(slot.getAttribute('aria-label'), /\d+ MINES?/);

    layArmedMine(state, layer.id, 33, true);
    halo.update(player, state, projector);
    assert.equal(count.textContent, '1');
    assert.notEqual(count.style.display, 'none', 'a newly armed mine restores the visible count');
    assert.notEqual(slot.getAttribute('aria-hidden'), 'true');
    halo.destroy();
  } finally { globalThis.document = old; }
});
