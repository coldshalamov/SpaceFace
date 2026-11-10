// The south's war has a front — Concord's Dione Customs picket vs the Vael packs pressing
// the munitions lane. One catalog row lights the whole PQ-170.00 front pipeline: kills on the
// lane bank momentum, the escalation readers give the lane pickets and an escort wing, and the
// faction's active front resolves south instead of falling back to home lanes.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTESTED_SECTOR_BY_PAIR,
  activeFrontForFaction,
  conflictAftermathAnchor,
  conflictPairsForSector,
  conflictPressureForSector,
  escalationForConflict,
} from '../src/data/conflictZones.js';
import { FACTION_KITS } from '../src/data/factions/index.js';

const PAIR = 'faction_scn:faction_vael';

test('the southern front exists in the catalog and both factions are real', () => {
  assert.equal(CONTESTED_SECTOR_BY_PAIR[PAIR], 'sector_dione_lane');
  assert.deepEqual(conflictPairsForSector('sector_dione_lane'), [PAIR]);
  assert.ok(FACTION_KITS.some((f) => f.id === 'faction_scn'), 'SCN is a real faction');
  assert.ok(FACTION_KITS.some((f) => f.id === 'faction_vael'), 'Vael is a real faction');
});

test('the front starts cold and its escalation stages are the shared ladder', () => {
  assert.equal(escalationForConflict(undefined).stage, 'cold', 'no record reads cold — t0 unchanged');
  assert.deepEqual(escalationForConflict({ state: 'war' }), {
    stage: 'war', pickets: 2, escortWing: 3, pressure: 1,
  });
});

test('a hot southern front reads on the lane and resolves the faction front south', () => {
  const conflicts = { [PAIR]: { tension: 80, state: 'war', playerLean: 0.2, momentum: 12 } };
  assert.equal(conflictPressureForSector(conflicts, 'sector_dione_lane'), 1, 'war fronts are loud');
  const scnFront = activeFrontForFaction(conflicts, 'faction_scn');
  assert.ok(scnFront, 'SCN resolves a live front');
  const vaelFront = activeFrontForFaction(conflicts, 'faction_vael');
  assert.ok(vaelFront, 'Vael resolves a live front');
  // A war on another pair outranks the cold southern one; a war on the southern pair wins.
  assert.equal(scnFront.sectorId, 'sector_dione_lane');
  assert.equal(vaelFront.sectorId, 'sector_dione_lane');
  const anchor = conflictAftermathAnchor(PAIR, 'sector_dione_lane', 4242);
  assert.ok(Number.isFinite(anchor.x) && Number.isFinite(anchor.z), 'flip wreckage has a place');
});

test('feeding a kill through the factions owner banks tension and lean on the southern pair', async () => {
  const { factions } = await import('../src/systems/factions.js');
  const state = {
    conflicts: {},
    world: { currentSectorId: 'sector_dione_lane' },
    entities: new Map(),
    rng: () => 0.5,
    simTime: 0,
  };
  factions.state = state;
  // Shooting at Vael (b) on the scn:vael pair leans the pair and raises tension.
  factions._feedTensionForKill('faction_vael', { x: 0, z: 0 });
  const c = state.conflicts[PAIR];
  assert.ok(c, 'the southern pair carries a live conflict record after a lane kill');
  assert.equal(c.tension, 1.5, 'a front kill raises tension');
  assert.equal(c.playerLean, -0.1, 'shooting Vael banks lean toward SCN (negative favors A)');
});
