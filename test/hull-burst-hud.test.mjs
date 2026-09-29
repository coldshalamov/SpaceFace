// Hull-burst overhaul, slice C: the burst's readout. It rides the bottom-centre field pill (one socket,
// one voice; src/ui/fieldHud.js): LIVE while the wedge burns, a quiet RECHARGING countdown after, and a
// short "ready + key" hint each time it comes back. It never outranks a fresh denial, and it is silent
// for a hull with no burst module.
import assert from 'node:assert/strict';
import test from 'node:test';

import { fieldHud } from '../src/ui/fieldHud.js';

function hud() {
  const h = Object.create(fieldHud);
  h.init({ state: {}, helpers: {} });
  return h;
}

function stateWith({ fitted = true, phase = 'ready', activeUntil = 0, readyAt = 0, bindings = {} } = {}) {
  const player = { id: 1, data: { derived: fitted ? { hullBurstKind: 'gravity', hullBurstRank: 1 } : {} } };
  return {
    playerId: 1,
    entities: new Map([[1, player]]),
    hullBurst: { phase, activeUntil, readyAt },
    settings: { gameplay: { controlScheme: 'pilot' }, controls: { bindings } },
  };
}

test('no burst module, no burst voice', () => {
  const h = hud();
  assert.equal(h._resolveBurst(stateWith({ fitted: false }), 0), null);
  assert.deepEqual(h._resolve(null, 0, null, null), { text: '', cls: '' });
});

test('LIVE wins over a held cone, counts down in seconds, and is lit like the repulsor lamp', () => {
  const h = hud();
  const burst = h._resolveBurst(stateWith({ phase: 'active', activeUntil: 6 }), 1.2);
  assert.equal(burst.live, true);
  assert.match(burst.text, /GRAVITY BUMPER — LIVE 5s/);
  const cone = { active: [{ kind: 'cone', engaged: true }], cooldowns: {} };
  assert.equal(h._resolve(cone, 1.2, null, burst).cls, 'field-burst');
});

test('a fresh denial still outranks the burst', () => {
  const h = hud();
  const burst = h._resolveBurst(stateWith({ phase: 'active', activeUntil: 6 }), 1);
  const denied = { active: [], cooldowns: {}, lastDenial: { at: 0.9, kind: 'well', reason: 'cooldown', readyAt: 4 } };
  assert.equal(h._resolve(denied, 1, null, burst).cls, 'field-denied');
});

test('after the window the burst shows a quiet recharge countdown, below any live field voice', () => {
  const h = hud();
  const burst = h._resolveBurst(stateWith({ phase: 'cooling', activeUntil: 6, readyAt: 24 }), 10);
  assert.equal(burst.live, false);
  assert.match(burst.text, /RECHARGING 14s/);
  assert.equal(burst.cls, 'field-burst-recharge');
  const deployed = { active: [{ kind: 'well', expireAt: 20, engaged: true }], cooldowns: {} };
  assert.match(h._resolve(deployed, 10, null, burst).text, /^WELL/, 'a deployed field is the louder voice');
  assert.equal(h._resolve({ active: [], cooldowns: {} }, 10, null, burst).cls, 'field-burst-recharge');
});

test('ready shows the key for three seconds, then goes quiet, and again after each recharge', () => {
  const h = hud();
  const ready = stateWith({ phase: 'ready' });
  const first = h._resolveBurst(ready, 100);
  assert.equal(first.cls, 'field-burst-ready');
  assert.match(first.text, /GRAVITY BUMPER — READY {2}\[\\]/, 'the live key is printed (Backslash by default)');
  assert.ok(h._resolveBurst(ready, 102.5), 'still showing inside the 3 s');
  assert.equal(h._resolveBurst(ready, 103.5), null, 'then silent: no permanent legend');
  // a recharge cycle re-arms the hint
  h._resolveBurst(stateWith({ phase: 'cooling', activeUntil: 6, readyAt: 200 }), 190);
  const again = h._resolveBurst(ready, 200.1);
  assert.equal(again && again.cls, 'field-burst-ready');
});

test('the ready hint follows a rebind', () => {
  const h = hud();
  const burst = h._resolveBurst(stateWith({ phase: 'ready', bindings: { hullBurst: ['KeyJ'] } }), 1);
  assert.match(burst.text, /READY {2}\[J\]/);
});
