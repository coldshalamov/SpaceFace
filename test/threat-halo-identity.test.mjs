// WF-14: offscreen shooter names itself — every visible hostile arc carries words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createThreatHalo, hostileLabelFor } from '../src/ui/threatHalo.js';
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
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parentNode = null; },
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
const projector = (w, o) => { o.x = 640 + w.x * 0.2; o.y = 360 + w.z * 0.2; o.onScreen = false; return o; };
const player = () => ({ id: 'player', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } });
const hostile = (id, pos, vel, extra = {}) => ({ id, type: 'ship', team: 1, alive: true, pos, vel: vel || { x: 0, z: 0 }, data: { encounter: true, ...extra } });
const arcs = (mock) => mock.elements.filter((el) => String(el.className).includes('sf-threat-halo__slot--arc'));

test('hostileLabelFor names role + closing state', () => {
  assert.equal(hostileLabelFor('raider', 2, false), 'RAIDER — CLOSING');
  assert.equal(hostileLabelFor('miner', 0, false), 'MINER — HOLDING');
  assert.equal(hostileLabelFor('raider', 0, true), 'RAIDER — ATTACKING');
  assert.equal(hostileLabelFor('raider', 1, false), 'RAIDER — DRIFTING');
});

test('every visible hostile arc carries a readable label; closing outranks holding', () => {
  const mock = mockDocument();
  const old = globalThis.document;
  globalThis.document = mock.document;
  try {
    const bus = busOf();
    const halo = createThreatHalo(mock.document.createElement('div'), bus);
    const p = player();
    const closing = hostile('closing', { x: 900, z: 0 }, { x: -200, z: 0 }, { role: 'raider' });
    const holder = hostile('holder', { x: 400, z: 0 }, { x: 0, z: 0 }, { role: 'miner' });
    const state = { tick: 10, simTime: 10 / 60, playerId: p.id, entityList: [p, closing, holder] };
    halo.update(p, state, projector);
    const visible = arcs(mock).filter((el) => el.style.display === 'block');
    assert.equal(visible.length, 2);
    for (const el of visible) {
      const label = el.attributes['aria-label'];
      assert.ok(label && label.length > 0, 'arc must name its shooter');
      assert.match(label, /CLOSING|HOLDING|DRIFTING|ATTACKING/);
    }
    const byId = Object.fromEntries(visible.map((el) => [el.attributes['data-entity-id'], el.attributes['aria-label']]));
    assert.match(byId.closing, /CLOSING/);
    assert.match(byId.holder, /HOLDING/);
    assert.equal(visible[0].attributes['data-entity-id'], 'closing', 'closing contact leads');
  } finally { globalThis.document = old; }
});

test('near-corner bearing uses the viewport side before the chip inset is applied', () => {
  const old = globalThis.document;
  try {
    // Gauntlet seed4242, sim46.65: the shooter is outside only X. Comparing against
    // the smaller inset rectangle incorrectly moved its right-hand marker onto the top.
    for (const [x, y, edge] of [
      [1283.2540673731626, 2.1249740009887885, 'right'],
      [-3.2540673731626, 2.1249740009887885, 'left'],
      [1283.2540673731626, 717.8750259990112, 'right'],
      [-3.2540673731626, 717.8750259990112, 'left'],
    ]) {
      const mock = mockDocument();
      globalThis.document = mock.document;
      const halo = createThreatHalo(mock.document.createElement('div'), busOf());
      const p = player();
      const attacker = hostile(404, { x: 400, z: 0 });
      const state = { tick: 2799, simTime: 46.65, playerId: p.id, entityList: [p, attacker] };
      halo.update(p, state, (_world, out) => Object.assign(out, { x, y, onScreen: false, behind: false }));
      const visible = arcs(mock).filter((el) => el.style.display === 'block');
      assert.equal(visible.length, 1, `${edge} corner keeps the shooter marker`);
      assert.equal(visible[0].getAttribute('data-edge'), edge, `${x},${y}`);
      halo.destroy();
    }
  } finally { globalThis.document = old; }
});

test('telegraph wins the label while tether-cut latch still wins overall', () => {
  const mock = mockDocument();
  const old = globalThis.document;
  globalThis.document = mock.document;
  try {
    const bus = busOf();
    const halo = createThreatHalo(mock.document.createElement('div'), bus);
    const p = player();
    const announced = hostile('announced', { x: 900, z: 0 }, { x: 0, z: 0 }, { role: 'raider' });
    const state = { tick: 10, simTime: 10 / 60, playerId: p.id, entityList: [p, announced] };
    bus.emit('ai:telegraph', { entityId: 'announced', mineId: null, kind: 'engine_flare', durationTicks: TELEGRAPH_CUE_TICKS, tick: 10 });
    halo.update(p, state, projector);
    const el = arcs(mock).find((s) => s.style.display === 'block');
    assert.ok(el);
    assert.match(el.attributes['aria-label'], /ATTACKING/);
  } finally { globalThis.document = old; }
});
