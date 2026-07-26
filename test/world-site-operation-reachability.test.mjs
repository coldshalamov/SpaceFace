// Boot-safety regression for the World Site operation-reachability invariant.
//
// worldSiteKernel raises `operation-unreachable` when an authored operation can never fire, and
// createWorldSiteRecord THROWS on any validation error. asteroidSites._ensureWorldSiteRecords calls
// that during init, so an unreachable operation does not degrade gracefully — it breaks the game at
// boot. Before this file, nothing anywhere asserted that code, so the invariant was live but
// regression-uncovered while a second authored site (PQ-018) was landing against it.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateWorldSiteManifest,
  createWorldSiteRecord,
} from '../src/systems/worldSiteKernel.js';
import { WORLD_SITE_MANIFESTS } from '../src/data/worldSiteManifests.js';

const codes = (result) => result.errors.map((entry) => entry.code);

test('every authored World Site manifest has zero unreachable operations', () => {
  assert.ok(WORLD_SITE_MANIFESTS.length >= 1, 'expected at least one authored manifest');
  for (const manifest of WORLD_SITE_MANIFESTS) {
    const result = validateWorldSiteManifest(manifest);
    assert.equal(result.ok, true,
      `${manifest.id} must validate; got ${JSON.stringify(result.errors)}`);
    assert.ok(!codes(result).includes('operation-unreachable'),
      `${manifest.id} must not author an unreachable operation`);
  }
});

test('every authored World Site manifest boots without throwing', () => {
  for (const manifest of WORLD_SITE_MANIFESTS) {
    assert.doesNotThrow(() => createWorldSiteRecord(manifest, { tick: 0 }),
      `${manifest.id} must not throw during record creation (this runs at boot)`);
  }
});

// The negative cases below are the ones that actually pin the invariant: if reachability analysis is
// ever relaxed, these fail rather than silently admitting a manifest that kills boot.

function withOperations(manifest, mutate) {
  const clone = structuredClone(manifest);
  mutate(clone);
  return clone;
}

test('an operation whose `from` no state can reach is flagged unreachable', () => {
  const base = WORLD_SITE_MANIFESTS[0];
  const broken = withOperations(base, (draft) => {
    // A status no component ever starts in and no operation ever transitions to.
    draft.operations[0].from = ['status_that_cannot_occur'];
  });

  const result = validateWorldSiteManifest(broken);
  assert.equal(result.ok, false, 'an impossible `from` must not validate');
  assert.ok(codes(result).includes('operation-unreachable'),
    `expected operation-unreachable, got ${JSON.stringify(codes(result))}`);
});

test('an unreachable operation throws at record creation, not at first use', () => {
  const base = WORLD_SITE_MANIFESTS[0];
  const broken = withOperations(base, (draft) => {
    draft.operations[0].from = ['status_that_cannot_occur'];
  });

  // This is the boot-safety claim: the failure surfaces eagerly, as a throw, rather than becoming a
  // silently dead operation the player can never trigger.
  assert.throws(() => createWorldSiteRecord(broken, { tick: 0 }), TypeError);
});

test('transitive unreachability is caught, not just first-hop', () => {
  const base = WORLD_SITE_MANIFESTS[0];
  const gated = base.operations.find((operation) => operation.dependsOn && operation.dependsOn.length);
  if (!gated) return; // no dependency chain authored; nothing to assert

  const broken = withOperations(base, (draft) => {
    const blocked = draft.operations.find((operation) => operation.id === gated.dependsOn[0]);
    blocked.from = ['status_that_cannot_occur'];
  });

  const result = validateWorldSiteManifest(broken);
  assert.equal(result.ok, false);
  const unreachable = result.errors.filter((entry) => entry.code === 'operation-unreachable');
  assert.ok(unreachable.length >= 2,
    `breaking a prerequisite must also strand its dependants; got ${JSON.stringify(unreachable)}`);
});
