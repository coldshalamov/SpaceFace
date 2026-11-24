// O41: the deliberate-release read ("tonnage and strain the moment the Line lets go") was emitted as
// `ui:receipt`, which nothing listens to, so the player never saw it. It now travels as a `toast` and
// the text is a plain sentence the receipt lane (admitReceipt) admits.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { masslineHud } from '../src/ui/masslineHud.js';
import { admitReceipt, releaseReadReceipt } from '../src/ui/hudAttention.js';

function initHud() {
  const state = {
    tick: 10, simTime: 4, playerId: 1,
    entities: new Map([[7, { id: 7, type: 'asteroid', alive: true, pos: { x: 90, z: 20 }, mass: 4200 }]]),
    player: { tether: { active: false } },
  };
  const bus = createBus();
  const hud = Object.assign({}, masslineHud);
  hud.init({ state, bus, helpers: { worldToScreen: (p) => ({ x: p.x, y: p.z, onScreen: true }) } });
  const toasts = [];
  const legacy = [];
  bus.on('toast', (t) => toasts.push(t));
  bus.on('ui:receipt', (t) => legacy.push(t));
  return { bus, hud, toasts, legacy };
}

test('a deliberate release does not toast tonnes or strain — the Line speaks one grammar, director 2026-11-23', () => {
  const h = initHud();
  h.bus.emit('tether:releaseRated', {
    classification: 'clean', technique: 'swing', deliberate: true, targetId: 7,
    tonnageU: 4200, load: 0.62, strain: 0.31,
  });
  assert.deepEqual(h.toasts, []);
  assert.equal(h.legacy.length, 0, 'nothing is sent to the listener-less ui:receipt any more');
  h.hud.destroy?.();
});

test('a snapped line is a consequence, not a lesson - no receipt', () => {
  const h = initHud();
  h.bus.emit('tether:releaseRated', { classification: 'messy', deliberate: false, targetId: 7, tonnageU: 4200, load: 1, strain: 1 });
  assert.equal(h.toasts.length, 0);
  h.hud.destroy?.();
});

test('the release read stays quiet — the Line speaks one grammar, director 2026-11-23', () => {
  assert.equal(releaseReadReceipt({}), '');
  assert.equal(releaseReadReceipt({ tonnageU: 0, load: 0.5, strain: 0 }), '');
  assert.equal(releaseReadReceipt({ tonnageU: 42, load: 0.7, strain: 0.5 }), '');
  assert.equal(admitReceipt({ text: 'Platinum x1', kind: 'info', combat: true }).admit, false);
});
