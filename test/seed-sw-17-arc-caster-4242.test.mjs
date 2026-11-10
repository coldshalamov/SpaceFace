// SEED-SW-17 — the Arc Caster chains to the authored number of extra hulls.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WEAPONS } from '../src/data/weapons.js';
import { emergentWeaponDef } from '../src/data/emergentPrimitives.js';
import { swarmCatalogOffers } from '../src/data/swarmCatalog.js';
import { compileAttackSpec } from '../src/combat/attackSpec.js';
import { createLineage, resetLineageIds } from '../src/combat/attackLineage.js';
import { resolveLiveAttackHit } from '../src/combat/attackHit.js';

test('a fitted arc caster chains to exactly its authored extra hulls, seed 4242', () => {
  const def = emergentWeaponDef('wpn_arc_caster');
  assert.ok(def, 'the live emergent table carries the arc caster');
  assert.notEqual(def.id, 'wpn_conductive_primer');
  assert.equal(def.adventureOnly, undefined);
  assert.ok(def.emergentChain.count >= 2);
  assert.ok(WEAPONS.some((row) => row.id === 'wpn_arc_caster'), 'the weapon table spreads the def');

  const shelf = swarmCatalogOffers(new Set());
  const again = swarmCatalogOffers(new Set());
  assert.deepEqual(shelf, again, 'the seeded shelf does not shuffle');
  const card = shelf.find((row) => row.defId === 'wpn_arc_caster');
  assert.ok(card, 'the armory catalog offers the arc caster');

  const compiled = compileAttackSpec({ weaponId: 'wpn_arc_caster' });
  assert.equal(compiled.ok, true, JSON.stringify(compiled.issues));
  assert.equal(compiled.spec.propagation.chain.count, def.emergentChain.count);
  assert.ok(compiled.spec.triggers.some((row) => row.action === 'chain_if_eligible'));

  resetLineageIds(4242);
  const runtime = createLineage({ spec: compiled.spec, createdTick: 10, sourceEntityId: 'player' });
  const first = { id: 'hit', type: 'ship', pos: { x: 0, z: 0 }, alive: true, faction: 'hostile' };
  const field = [
    { id: 'h1', type: 'ship', pos: { x: 20, z: 0 }, alive: true, faction: 'hostile', score: 0, statuses: [], valid: true },
    { id: 'h2', type: 'ship', pos: { x: 40, z: 0 }, alive: true, faction: 'hostile', score: 0, statuses: [], valid: true },
    { id: 'h3', type: 'ship', pos: { x: 60, z: 0 }, alive: true, faction: 'hostile', score: 0, statuses: [], valid: true },
  ];
  const result = resolveLiveAttackHit({
    spec: compiled.spec,
    runtime,
    projectile: { id: 'bolt', alive: true, pos: { x: 0, z: 0 }, vel: { x: 10, z: 0 }, ownerId: 'player' },
    target: first,
    payload: { pos: first.pos },
    tick: 10,
    candidates: field,
    applyHopDamage: () => {},
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.hops.length, def.emergentChain.count);
  assert.equal(new Set(result.hops).size, def.emergentChain.count);
});
