// A sector with authored rock is a sector somebody cuts.
//
// The gap this pins: `trafficRoleMixForSector` boosted miners only from an authored
// `industries: { mining }` flag. `sector_helios_prime` — the sector every new player starts in —
// authors 70 asteroids across two named fields (sectors.js calls one "the starter seam") and gives
// Helios Station a standing iron shortage, but carries no `industries` flag. Its miner weight
// therefore stayed at the base 16 while the `security >= 0.9` branch multiplied patrol x1.6 and
// hauler x1.4 on top. Measured across repeated live captures: ZERO barges, consistently 1 hauler
// and 4 patrols. The economy said iron was short and nobody was mining it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { trafficRoleMixForSector } from '../src/systems/traffic.js';

const bare = { id: 'sector_bare', security: 0.5 };
const withFields = { id: 'sector_rocky', security: 0.5, fields: [{ id: 'f', count: 40 }] };
const declared = { id: 'sector_industrial', security: 0.5, industries: { mining: true } };
const both = {
  id: 'sector_both', security: 0.5,
  industries: { mining: true }, fields: [{ id: 'f', count: 40 }],
};

test('authored rock raises the miner weight even with no industries flag', () => {
  assert.ok(trafficRoleMixForSector(withFields).miner > trafficRoleMixForSector(bare).miner,
    'a sector full of asteroids must draw barges');
});

test('a declared mining economy still out-mines a sector that merely has rocks', () => {
  // The contents-derived boost is deliberately weaker than the explicit flag. A belt whose whole
  // identity is extraction should read as busier than a core pocket with a starter seam in it.
  assert.ok(trafficRoleMixForSector(declared).miner > trafficRoleMixForSector(withFields).miner);
});

test('the two boosts do not stack', () => {
  // Otherwise every belt (which has both) would silently get a second multiplier and the mix would
  // drift away from the values the Ceres proofs and the ecology checks are calibrated against.
  assert.equal(trafficRoleMixForSector(both).miner, trafficRoleMixForSector(declared).miner);
});

test('empty or absent field lists change nothing', () => {
  const baseline = trafficRoleMixForSector(bare).miner;
  for (const fields of [undefined, null, [], [null], [{ id: 'f', count: 0 }], [{ id: 'f' }], 'nope']) {
    assert.equal(trafficRoleMixForSector({ ...bare, fields }).miner, baseline,
      `fields=${JSON.stringify(fields)} must not boost mining`);
  }
});

test('only the miner weight moves — no other role is disturbed', () => {
  const a = trafficRoleMixForSector(bare);
  const b = trafficRoleMixForSector(withFields);
  for (const role of Object.keys(a)) {
    if (role === 'miner') continue;
    assert.equal(b[role], a[role], `${role} must be untouched by the rock-presence rule`);
  }
});

test('the real Helios Prime now draws barges, and Ceres Belt is unchanged', async () => {
  const { SECTORS } = await import('../src/data/sectors.js');
  const all = Array.isArray(SECTORS) ? SECTORS : Object.values(SECTORS || {});
  const helios = all.find((s) => s && s.id === 'sector_helios_prime');
  const ceres = all.find((s) => s && s.id === 'sector_ceres_belt');
  assert.ok(helios && ceres, 'both canonical sectors must exist');

  // Helios has rock and no flag: it must be lifted above its base weight.
  assert.equal(helios.industries, undefined, 'if Helios gains an industries flag, revisit this rule');
  assert.ok((helios.fields || []).some((f) => (f.count | 0) > 0), 'Helios must still author rock');
  const hMix = trafficRoleMixForSector(helios);
  const hShare = hMix.miner / Object.values(hMix).reduce((a, b) => a + b, 0);
  assert.ok(hShare > 0.12,
    `Helios miner share must be meaningful, got ${(hShare * 100).toFixed(1)}%`);

  // Ceres declares mining, so the contents rule must not fire there at all — the PQ-020 Ceres
  // topology/proof bundle reads this exact mix.
  const cMix = trafficRoleMixForSector(ceres);
  assert.equal(cMix.miner, 16 * 2.5, 'Ceres must keep exactly its declared-industry weight');
  assert.ok(cMix.miner / Object.values(cMix).reduce((a, b) => a + b, 0) > hShare,
    'a belt must still read as more extractive than a core pocket with a starter seam');
});
