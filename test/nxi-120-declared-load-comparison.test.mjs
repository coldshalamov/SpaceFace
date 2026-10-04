// NXI-120 — the buy rail's capability comparison carries one declared load.
//
// Switching the viewed hull must compare both hulls under the same declared hold load —
// the cargo mass the player is actually carrying — instead of mixing an empty brochure
// with the loaded hull the fleet view just showed. The basis is a read-only projection
// through getDerivedStats; cargo remains the single live owner.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buyRailComparisonFacts } from '../src/ui/station/screens/shipworks.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import {
  fittingsFromDefaultModules,
  getDerivedStats,
} from '../src/systems/ships.js';

const ACTIVE_FIT = fittingsFromDefaultModules('ship_kestrel', NEW_GAME.fittedModules);

function playerWithLoad(usedMass, overrides = {}) {
  return {
    credits: 0,
    cargo: { items: {}, usedVolume: 0, usedMass, capVolume: 40, capMass: 100 },
    efficiencyMods: {},
    activeShipIndex: 0,
    ownedShips: [{ defId: 'ship_kestrel', fittings: ACTIVE_FIT.slice() }],
    ...overrides,
  };
}

const EMPTY_PLAYER = { cargo: { usedMass: 0, items: {} }, efficiencyMods: {} };

test('switching candidate hulls compares both under the same declared load', () => {
  const player = playerWithLoad(40);
  const currentMasses = [];
  for (const candidateId of ['ship_pelican', 'ship_wasp']) {
    const cmp = buyRailComparisonFacts(player, candidateId);
    assert.equal(cmp.loadMass, 40, `${candidateId}: the comparison names its declared load`);

    // Both sides derive through the owner under the SAME projected basis — not an
    // empty guess on one side and the live hold on the other.
    const basis = { ...player, cargo: { ...player.cargo, usedMass: 40 } };
    assert.equal(cmp.candidate.mass, getDerivedStats(candidateId, [], basis).operationalMass,
      `${candidateId}: the candidate reads at the declared load`);
    assert.equal(cmp.current.mass, getDerivedStats('ship_kestrel', ACTIVE_FIT, basis).operationalMass,
      `${candidateId}: your hull reads at the same declared load`);

    // The selected load actually shows: the candidate number moves off its empty brochure.
    const brochure = getDerivedStats(candidateId, [], EMPTY_PLAYER);
    assert.ok(cmp.candidate.mass > brochure.operationalMass,
      `${candidateId}: the declared load is in the printed number, not just implied`);
    currentMasses.push(cmp.current.mass);
  }

  // The basis is carried through selection changes: your hull's reading does not move
  // just because a different candidate was picked, and it is your fitted, loaded hull —
  // not the stock brochure the rail used to print.
  assert.equal(currentMasses[0], currentMasses[1],
    'your hull keeps the same loaded reading when the candidate switches');
  const stockEmpty = getDerivedStats('ship_kestrel', [], EMPTY_PLAYER);
  assert.notEqual(currentMasses[0], stockEmpty.operationalMass,
    'your hull is compared with its actual fit and load, not as a bare hull');
});

test('the declared basis resets only when the user changes the load', () => {
  const emptyCmp = buyRailComparisonFacts(playerWithLoad(0), 'ship_pelican');
  const loaded = buyRailComparisonFacts(playerWithLoad(80), 'ship_pelican');
  assert.equal(emptyCmp.loadMass, 0);
  assert.equal(loaded.loadMass, 80);
  assert.ok(loaded.candidate.mass > emptyCmp.candidate.mass,
    'a heavier declared load raises the candidate reading');
  assert.ok(loaded.current.mass > emptyCmp.current.mass,
    'a heavier declared load raises your hull reading together');

  // Same declared load, same comparison — nothing caches a stale basis per hull.
  assert.deepEqual(buyRailComparisonFacts(playerWithLoad(80), 'ship_pelican'), loaded,
    're-reading the same hull at the same declared load is stable');

  // The projection borrows the live hold; it never writes cargo or copies an inventory.
  const player = playerWithLoad(80);
  buyRailComparisonFacts(player, 'ship_wasp');
  assert.equal(player.cargo.usedMass, 80, 'the comparison never writes the hold it reads');
  assert.deepEqual(player.cargo.items, {}, 'no second inventory is created by the comparison');
});

test('neighboring success: an empty hold still compares honestly through the owner', () => {
  const player = playerWithLoad(0);
  const cmp = buyRailComparisonFacts(player, 'ship_pelican');
  assert.equal(cmp.loadMass, 0);
  const basis = { ...player, cargo: { ...player.cargo, usedMass: 0 } };
  assert.equal(cmp.candidate.mass, getDerivedStats('ship_pelican', [], basis).operationalMass,
    'an empty declared load still derives through getDerivedStats');
  assert.equal(cmp.current.mass, getDerivedStats('ship_kestrel', ACTIVE_FIT, basis).operationalMass,
    'your hull still reads with its actual fit');
  assert.ok(cmp.candidate.cargo > 0 && cmp.current.cargo > 0, 'capacity readings still answer');

  // Degenerate states stay null-safe rather than fabricating a side of the compare.
  const noFleet = buyRailComparisonFacts(
    { ...player, ownedShips: [], activeShipIndex: 0 }, 'ship_pelican');
  assert.equal(noFleet.current, null, 'no owned hull yields no reference, never a fabricated one');
  const badCandidate = buyRailComparisonFacts(player, 'ship_does_not_exist');
  assert.equal(badCandidate.candidate, null, 'an unknown hull yields no candidate, never zeros');
});
