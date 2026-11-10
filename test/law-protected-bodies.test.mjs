import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CERES_AMBUSH_HAULER_SLOT,
  isLawfulEntity,
  isLawProtectedBody,
  isProtectedCivilian,
} from '../src/law/protectedBodies.js';
import { isLawProtectedBody as isCanonicalLawProtectedBody } from '../src/systems/lawSecurity.js';

test('protected-body classification retains lawful AI and station-faction rules', () => {
  const lawfulShip = { type: 'ship', data: { ai: { lawful: true } } };
  const lawfulStation = { type: 'station', factionId: 'faction_mts' };
  const civilianFactionStation = { type: 'station', factionId: 'faction_free' };
  const hostileStation = { type: 'station', factionId: 'faction_reach' };
  const unlawfulRaider = { type: 'ship', team: 1, data: { ai: { role: 'raider' } } };

  assert.equal(isLawfulEntity(lawfulShip), true);
  assert.equal(isLawfulEntity(lawfulStation), true);
  assert.equal(isLawfulEntity(civilianFactionStation), true);
  assert.equal(isLawfulEntity(hostileStation), false);
  assert.equal(isLawProtectedBody(lawfulShip), true);
  assert.equal(isLawProtectedBody(lawfulStation), true);
  assert.equal(isLawProtectedBody(unlawfulRaider), false);
  assert.equal(isLawProtectedBody(null), false);
});

test('protected-civilian classification retains role, convoy, team, and Ceres slot cases', () => {
  const cases = [
    { type: 'ship', team: 2 },
    { type: 'ship', data: { ai: { spawnContext: 'convoy_civilian' } } },
    { type: 'ship', data: { trafficRole: 'courier' } },
    { type: 'ship', data: { role: 'ore-hauler' } },
    { type: 'ship', data: { activityActorSlotId: CERES_AMBUSH_HAULER_SLOT } },
  ];
  for (const entity of cases) {
    assert.equal(isProtectedCivilian(entity), true);
    assert.equal(isLawProtectedBody(entity), true);
  }

  assert.equal(isProtectedCivilian({ type: 'ship', team: 1, data: { ai: { role: 'raider' } } }), false);
  assert.equal(isProtectedCivilian({ type: 'station', team: 2 }), false);
  assert.equal(isLawProtectedBody({ type: 'asteroid', data: { role: 'civilian' } }), false);
});

test('simulation owner re-exports the same shared protection predicate', () => {
  assert.strictEqual(isCanonicalLawProtectedBody, isLawProtectedBody);
});
