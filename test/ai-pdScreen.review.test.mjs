import assert from 'node:assert/strict';
import test from 'node:test';

import { ContactKind } from '../src/ai/contracts.js';
import { scorePdThreat, selectPdInterceptTarget } from '../src/ai/pdScreen.js';

test('PD screen rejects a projectile explicitly marked non-hostile', () => {
  const friendlyProjectile = {
    id: 7,
    kind: ContactKind.PROJECTILE,
    hostile: false,
    alive: true,
    valid: true,
    pos: { x: 5, z: 0 },
  };

  assert.equal(
    scorePdThreat(friendlyProjectile, { x: 0, z: 0 }, 320, { x: 0, z: 0 }),
    -Infinity,
  );
  assert.equal(selectPdInterceptTarget({
    self: { id: 1, pos: { x: 0, z: 0 } },
    contacts: [friendlyProjectile],
  }), null);
});

test('PD screen still admits a projectile whose hostility is unknown', () => {
  const unclassifiedProjectile = {
    id: 8,
    kind: ContactKind.PROJECTILE,
    alive: true,
    valid: true,
    pos: { x: 5, z: 0 },
  };

  assert.ok(Number.isFinite(
    scorePdThreat(unclassifiedProjectile, { x: 0, z: 0 }, 320, { x: 0, z: 0 }),
  ));
});
