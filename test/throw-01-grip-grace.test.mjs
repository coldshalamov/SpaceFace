// THROW-01 grip grace: incidental splash on the held body is scaled and capped; for 1.2 s after a
// latch nothing drops it below 1 hull; direct aimed fire is otherwise untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { heldBodyGripFactor, GRIP_GRACE_TICKS } from '../src/combat/heldBodyGrip.js';

const withFlags = (fn) => { const s = { ...MASSLINE2_FLAGS }; Object.assign(MASSLINE2_FLAGS, { enabled: true, throw: true });
  try { fn(); } finally { Object.assign(MASSLINE2_FLAGS, s); } };
const mk = (tick, latchedTick) => ({ playerId: 1, tick, player: { tether: { active: true, targetId: 2, latchedTick } } });
const body = { id: 2, hull: 20, shield: 0 };

test('splash on the held body: 15% and at most 20% of what is left, per hit', () => withFlags(() => {
  const state = mk(1000, 0);                       // long after the grace
  const f = heldBodyGripFactor(state, body, { kind: 'detonator_dart' }, 100);
  assert.ok(Math.abs(f * 100 - 4) < 1e-9, 'capped to 20% of 20 hull = 4');
  assert.ok(Math.abs(heldBodyGripFactor(state, body, { kind: 'light_cookoff' }, 10) * 10 - 1.5) < 1e-9, 'else 15%');
}));

test('direct aimed gunfire on the held body is untouched after the grace', () => withFlags(() => {
  assert.equal(heldBodyGripFactor(mk(1000, 0), body, { kind: 'weapon' }, 100), 1);
}));

test('for 1.2 s after the latch nothing can take the held body below 1 hull', () => withFlags(() => {
  const state = mk(100, 100 - (GRIP_GRACE_TICKS - 1));
  const f = heldBodyGripFactor(state, body, { kind: 'weapon' }, 500);
  assert.ok(500 * f <= 19 + 1e-9 && 500 * f >= 19 - 1e-9, 'a gun can leave it at 1 hull, no lower');
  state.tick = 100 + 5;                            // grace over
  assert.equal(heldBodyGripFactor(state, body, { kind: 'weapon' }, 500), 1);
}));

test('a body that is not the held one is never touched', () => withFlags(() => {
  assert.equal(heldBodyGripFactor(mk(10, 0), { id: 9, hull: 5 }, { kind: 'detonator_dart' }, 100), 1);
}));
