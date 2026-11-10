// NXI-026 — equal-tick attribution does not follow write order or argument order.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearImpulseProvenance,
  holdImpulseProvenance,
  IMPULSE_PROVENANCE_MAX_AGE_TICKS,
  readRecentImpulseProvenance,
  recordImpulseProvenance,
} from '../src/combat/impulseKernel.js';
import { contactImpulseProvenance } from '../src/systems/collisionConsequences.js';

function hull(id) {
  return { id, type: 'ship', alive: true };
}

function write(entity, actorId, tick, magnitude, weaponId = 'gun') {
  const record = recordImpulseProvenance(entity, {
    actorId,
    weaponId,
    tag: 'slug',
    appliedTick: tick,
    magnitude,
  });
  assert.ok(record);
  return record;
}

test('the same equal-tick impulses name one actor in either write order and either argument order', () => {
  const struck = hull('struck');
  const other = hull('other');
  const orders = [
    ['alpha', 'mike'],
    ['mike', 'alpha'],
  ];
  const seen = [];
  for (const actors of orders) {
    clearImpulseProvenance(struck);
    clearImpulseProvenance(other);
    for (const actorId of actors) write(struck, actorId, 40, 3);
    const forward = contactImpulseProvenance(struck, other, 40);
    const reverse = contactImpulseProvenance(other, struck, 40);
    assert.equal(forward.actorId, reverse.actorId);
    assert.notEqual(forward.actorId, null);
    seen.push(forward.actorId);
  }
  assert.equal(seen[0], seen[1]);
  assert.equal(seen[0], 'alpha');
});

test('a larger same-tick magnitude wins even when it was written first', () => {
  const struck = hull('struck');
  const other = hull('other');
  const orders = [
    [['alpha', 2], ['mike', 9]],
    [['mike', 9], ['alpha', 2]],
  ];
  for (const pairs of orders) {
    clearImpulseProvenance(struck);
    for (const [actorId, magnitude] of pairs) write(struck, actorId, 40, magnitude);
    const forward = contactImpulseProvenance(struck, other, 40);
    const reverse = contactImpulseProvenance(other, struck, 40);
    assert.equal(forward.actorId, 'mike');
    assert.equal(reverse.actorId, 'mike');
  }
  clearImpulseProvenance(struck);
});

test('a later tick wins even when its magnitude is smaller', () => {
  const struck = hull('struck');
  const other = hull('other');
  write(struck, 'alpha', 10, 9);
  write(struck, 'mike', 11, 1);
  const named = contactImpulseProvenance(struck, other, 11);
  assert.equal(named.actorId, 'mike');
  clearImpulseProvenance(struck);
  write(struck, 'mike', 11, 1);
  write(struck, 'alpha', 10, 9);
  assert.equal(contactImpulseProvenance(other, struck, 11).actorId, 'mike');
  clearImpulseProvenance(struck);
});

test('a null actor stays null, and no records stay null', () => {
  const struck = hull('struck');
  const other = hull('other');
  write(struck, null, 40, 4, 'environment');
  write(struck, 'player', 40, 4, 'environment');
  const named = contactImpulseProvenance(struck, other, 40);
  assert.equal(named.actorId, null);
  clearImpulseProvenance(struck);
  clearImpulseProvenance(other);
  assert.equal(contactImpulseProvenance(struck, other, 40), null);
});

test('a stale latest slot does not erase an in-window winner', () => {
  const struck = hull('struck');
  const other = hull('other');
  const age = IMPULSE_PROVENANCE_MAX_AGE_TICKS;
  write(struck, 'mike', 11, 4);
  write(struck, 'alpha', 10, 9);
  const now = 11 + age;
  const first = contactImpulseProvenance(struck, other, now);
  const second = contactImpulseProvenance(struck, other, now);
  assert.equal(first && first.actorId, 'mike');
  assert.equal(second && second.actorId, 'mike');
  clearImpulseProvenance(struck);
});

test('a flight hold does not let write order replace the equal-tick winner', () => {
  const age = IMPULSE_PROVENANCE_MAX_AGE_TICKS;
  const orders = [
    [['alpha', 9], ['mike', 2]],
    [['mike', 2], ['alpha', 9]],
  ];
  for (const pairs of orders) {
    const struck = hull(`struck-${pairs[1][0]}`);
    const other = hull('other');
    clearImpulseProvenance(struck);
    for (const [actorId, magnitude] of pairs) write(struck, actorId, 40, magnitude);
    const held = holdImpulseProvenance(struck, 40 + age + age, 40, 40);
    assert.ok(held && held.holdUntilTick > 40);
    const during = contactImpulseProvenance(struck, other, 40);
    const after = contactImpulseProvenance(struck, other, 40 + age + 1);
    assert.equal(during && during.actorId, 'alpha');
    assert.equal(after && after.actorId, 'alpha');
    clearImpulseProvenance(struck);
  }
});

test('a same-actor flight hold keeps its record when the contact is read', () => {
  const struck = hull('struck');
  const other = hull('other');
  write(struck, 'alpha', 40, 9);
  const held = holdImpulseProvenance(struck, 40 + 400, 40, 40);
  assert.ok(held);
  write(struck, 'alpha', 40, 1);
  const before = readRecentImpulseProvenance(struck, 40);
  assert.equal(before && before.actorId, 'alpha');
  assert.ok(before.holdUntilTick != null);
  const named = contactImpulseProvenance(struck, other, 40);
  const after = readRecentImpulseProvenance(struck, 40);
  assert.equal(named && named.actorId, 'alpha');
  assert.equal(after, before);
  assert.equal(after.holdUntilTick, before.holdUntilTick);
  clearImpulseProvenance(struck);
});

test('a held record past the history window is still a candidate', () => {
  const struck = hull('struck');
  const other = hull('other');
  write(struck, 'alpha', 1, 5);
  const age = IMPULSE_PROVENANCE_MAX_AGE_TICKS;
  const now = 1 + age + 1;
  const held = holdImpulseProvenance(struck, now + age, 1, 1);
  assert.ok(held);
  const named = contactImpulseProvenance(struck, other, now);
  assert.equal(named.actorId, 'alpha');
  clearImpulseProvenance(struck);
});
