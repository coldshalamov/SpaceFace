import test from 'node:test';
import assert from 'node:assert/strict';

import { autoTargetAssist } from '../src/systems/autoTargetAssist.js';

// INF-093: an armed auto-target lock must not survive a save transition. Entity ids are
// remapped when the sector regenerates, so a stale autoAim/drawFlight lease aims — and marks —
// the wrong ship after Continue. The lifecycle owner (autoTargetAssist) must release it;
// repeating the transition must not accumulate subscriptions either.
function boot() {
  const handlers = {};
  const bus = {
    on(event, fn) {
      handlers[event] = handlers[event] || [];
      handlers[event].push(fn);
      return () => {
        const list = handlers[event] || [];
        const at = list.indexOf(fn);
        if (at >= 0) list.splice(at, 1);
      };
    },
    emit(event, payload) {
      for (const fn of [...(handlers[event] || [])]) fn(payload);
    },
  };
  const state = {
    mode: 'flight',
    input: {
      autoFire: true,
      autoAim: { targetId: 4242 },
      drawFlight: { points: [{ x: 1, z: 2 }] },
      autoTargetPath: { active: true },
      actions: {},
    },
    settings: { gameplay: {}, controls: {} },
  };
  const inst = Object.create(autoTargetAssist);
  inst.init({ state, bus });
  return { inst, state, bus, handlers };
}

function armed(state) {
  const inp = state.input || {};
  return !!(inp.autoFire || inp.autoAim || inp.drawFlight || (inp.autoTargetPath && inp.autoTargetPath.active));
}

test('INF-093 armed auto-target releases on the save transition', () => {
  const { inst, state, bus } = boot();
  assert.equal(armed(state), true, 'fixture starts armed');
  bus.emit('save:restoring', { slot: 'quick' });
  assert.equal(armed(state), false, 'restoring releases the lock before entities are rebuilt');
  assert.equal(state.input.autoFire, false);
  assert.equal(state.input.autoAim, null);
  assert.equal(state.input.drawFlight, undefined);
  assert.equal(state.input.autoTargetPath.active, false);
});

test('INF-093 a late save:loaded also releases (routes without a mode detour)', () => {
  const { inst, state, bus } = boot();
  bus.emit('save:loaded', { slot: 'quick' });
  assert.equal(armed(state), false);
});

test('INF-093 repeating the transition accumulates no subscriptions or leases', () => {
  const { inst, state, bus, handlers } = boot();
  const subs = () => (handlers['save:restoring'] || []).length + (handlers['save:loaded'] || []).length;
  const before = subs();
  for (let i = 0; i < 5; i++) {
    state.input.autoFire = true;
    bus.emit('save:restoring', { slot: 'quick' });
    bus.emit('save:loaded', { slot: 'quick' });
  }
  assert.equal(subs(), before, 'no subscription growth across repeated transitions');
  assert.equal(armed(state), false, 'no lease survives the loop');
  inst.destroy();
  assert.equal(subs(), 0, 'destroy releases the transition subscriptions');
});
