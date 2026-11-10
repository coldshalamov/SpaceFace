// Hull-burst readout, re-voiced for the boost upgrade (owner principle, 2026-09-30). The pill rides
// the bottom-centre field socket (one socket, one voice; src/ui/fieldHud.js): while the boost
// gesture is paying, the wedge's name burns in the LIVE register; the moment the boost ends the
// voice is gone. There is no RECHARGING countdown and no READY key hint any more — no window, no
// recharge, no key — and the pill is silent for a hull with no burst module fitted. It never
// outranks a fresh denial or a hazard's WARNING/SURGE, and its quiet never hides another field
// tool's readiness.
import assert from 'node:assert/strict';
import test from 'node:test';

import { fieldHud } from '../src/ui/fieldHud.js';

function hud() {
  const h = Object.create(fieldHud);
  h.init({ state: {}, helpers: {} });
  return h;
}

function stateWith({ fitted = true, phase = 'ready', hits = 0, grip = null } = {}) {
  const player = { id: 1, data: { derived: fitted ? { hullBurstKind: 'gravity', hullBurstRank: 1 } : {} } };
  return {
    playerId: 1,
    entities: new Map([[1, player]]),
    hullBurst: { phase, hits, grip },
    settings: { gameplay: { controlScheme: 'pilot' }, controls: { bindings: {} } },
  };
}

test('no burst module, no burst voice', () => {
  const h = hud();
  assert.equal(h._resolveBurst(stateWith({ fitted: false }), 0), null);
  assert.deepEqual(h._resolve(null, 0, null, null), { text: '', cls: '' });
});

test('while the boost pays, the wedge burns in the LIVE register', () => {
  const h = hud();
  const burst = h._resolveBurst(stateWith({ phase: 'active' }), 1.2);
  assert.equal(burst.live, true);
  assert.match(burst.text, /GRAVITY BUMPER — RIDES BOOST/);
  const cone = { active: [{ kind: 'cone', engaged: true }], cooldowns: {} };
  assert.equal(h._resolve(cone, 1.2, null, burst).cls, 'field-burst');
});

test('a fresh denial still outranks the live burst', () => {
  const h = hud();
  const burst = h._resolveBurst(stateWith({ phase: 'active' }), 1);
  const denied = { active: [], cooldowns: {}, lastDenial: { at: 0.9, kind: 'well', reason: 'cooldown', readyAt: 4 } };
  assert.equal(h._resolve(denied, 1, null, burst).cls, 'field-denied');
});

test('no cooldown tail: with the boost gone the voice is simply silent', () => {
  const h = hud();
  assert.equal(h._resolveBurst(stateWith({ phase: 'ready' }), 10), null, 'ready (not boosting) is silent — no permanent legend');
  const idle = { active: [], cooldowns: {} };
  assert.equal(h._resolve(idle, 10, null, null).text, '', 'nothing lingers after the gesture');
});

test('a hazard WARNING or SURGE outranks the live burst; a calm hazard does not', () => {
  const h = hud();
  const burst = h._resolveBurst(stateWith({ phase: 'active' }), 1);
  const env = (phase) => ({ phase, remainingS: 4 });
  assert.match(h._resolve({ active: [], cooldowns: {} }, 1, env('warning'), burst).text, /WARNING/);
  assert.match(h._resolve({ active: [], cooldowns: {} }, 1, env('surge'), burst).text, /SURGE/);
  assert.equal(h._resolve({ active: [], cooldowns: {} }, 1, env('calm'), burst).cls, 'field-burst', 'a calm hazard yields to the live burst');
});

test('with no live burst, an older field tool keeps its voice — nothing of the burst lingers', () => {
  const h = hud();
  const burst = h._resolveBurst(stateWith({ phase: 'ready' }), 10);
  assert.equal(burst, null, 'not boosting: no burst voice at all');
  const withWellCooling = { active: [], cooldowns: { well: 14 } };
  assert.match(h._resolve(withWellCooling, 10, null, null).text, /^WELL READY/, 'the well keeps its voice');
});
