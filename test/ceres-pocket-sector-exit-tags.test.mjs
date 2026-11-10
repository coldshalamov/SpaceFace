import assert from 'node:assert/strict';
import test from 'node:test';

import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { getNodeSystemFactoryTable } from '../src/runtime/nodeSystemFactoryTable.js';
import {
  applyFeatureConfigToMaps,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../src/data/featureFlags.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import {
  PROOF_SECTOR_ID,
  PROOF_PLAYER_HULL_ID,
  PROOF_SHOVE_WEAPON_ID,
} from '../src/testing/lab/proofSixtySeconds.js';

const SEED = 14920;
const WARM_TICKS = 240;
const EXIT_TICKS = 600; // 10 simulated seconds past the sector exit
const NEXT_SECTOR = 'sector_helios_prime';

// D207 (2026-10-17): pocket content spawned by side systems (terrain anchors, wreck-field
// ecology, salvage sort pockets, solstice bloom rewards) carried no sector ownership, so the
// residency teardown could not see it: 10 s after leaving Ceres for Helios Prime the rocks,
// the scavenger, the sort debris and the crystals were still live 10-14k WU away, and the next
// sector's salvor adopter stamped the wrong sectorId onto a Ceres wreck and its tow target.
// The fix is spawn-time sector tags (the house D89 stamp), so every class below must leave the
// exit either tagged with its owner sector or inside an expiry it carries itself.
//
// The scenario is the ledger repro: enterSector Ceres, warm, enterSector Helios Prime, step
// 10 s, inspect the survivors.

const isUntagged = (e) => !(e.homeSectorId != null)
  && !(e.data && (e.data.homeSectorId != null || e.data.sectorId != null));

// Lane-traffic bodies are closed-form route visuals owned by travelLanes (collides:false,
// owner-recycled by lane binding) - not pocket sim content, and out of D207's scope.
const isLaneTrafficVisual = (e) => !!(e.data && e.data.parentType === 'lane_traffic');

// Content classes the fix owns. Each carrier must be sector-tagged at spawn.
const CLASS_KEYS = ['killMachineAnvilId', 'aperturePlugId', 'reefMine', 'sortPocketId'];

function classCarrierReason(e) {
  const d = e.data || {};
  for (const key of CLASS_KEYS) if (d[key] != null) return key;
  if (d.wreckEcologyRole != null) return 'wreckEcologyRole';
  if (e.type === 'pickup' && d.pickupRole != null) return `pickupRole:${d.pickupRole}`;
  return null;
}

test('D207: Ceres pocket content survives the sector exit only sector-owned', async () => {
  const table = getNodeSystemFactoryTable({ tacticalAI: true, flightBackend: 'v3' });
  if (!table.get('stuntGrammar')) table.set('stuntGrammar', stuntGrammar);
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed: SEED,
    systemLookup: table,
    slots: {
      aiSlot: table.get('aiSlot'),
      flightSlot: table.get('flightSlot'),
      aiBackend: 'sg06-tactical',
      flightBackend: 'v3',
    },
  });
  const state = runtime.state;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  if (!state.input.actions) state.input.actions = { brake: false, autopursuit: false };

  const player = runtime.spawn(makeShipEntitySpec(PROOF_PLAYER_HULL_ID, {
    isPlayer: true,
    player: state.player,
    pos: { x: 0, z: 0 },
    fittings: [PROOF_SHOVE_WEAPON_ID],
    factionId: 'faction_free',
  }));
  state.playerId = player.id;

  const world = runtime.getSystem('world');
  world.enterSector(PROOF_SECTOR_ID);

  const physics = runtime.getSystem('physics');
  const prevFeatures = snapshotFeatureMaps();
  applyFeatureConfigToMaps(runtime && runtime.config && runtime.config.features);
  const ready = await physics.prepareBackend(state, { reset: true });
  restoreFeatureMaps(prevFeatures);
  assert.equal(ready, true, 'Rapier backend must come up');

  for (let i = 0; i < WARM_TICKS; i++) runtime.step(1 / 60);

  const live = () => (state.entityList || []).filter((e) => e && e.alive !== false);
  const nonPlayer = (e) => e.id !== state.playerId && !e.isPlayer;

  // Fixture guard: the seeded scenario must actually contain the classes the fix owns, or the
  // assertions below would pass vacuously after a content change.
  const before = live().filter(nonPlayer);
  const carriersBefore = before.map(classCarrierReason).filter(Boolean);
  assert.ok(before.some((e) => e.data && e.data.killMachineAnvilId != null),
    'fixture drift: the seed no longer stages kill-machine anvil rocks in Ceres');
  assert.ok(before.some((e) => e.type === 'pickup' && e.data && e.data.pickupRole != null),
    'fixture drift: the seed no longer stages bloom/crystal pickups in Ceres');
  assert.ok(carriersBefore.length >= 5,
    `fixture drift: expected several tagged-class carriers, saw ${carriersBefore.length}`);

  world.enterSector(NEXT_SECTOR);
  for (let i = 0; i < EXIT_TICKS; i++) runtime.step(1 / 60);

  const after = live();
  const beforeIds = new Set(before.map((e) => e.id));

  // 1. No untagged non-player body survives the exit beyond its own intended lifetime:
  // a survivor without a sector stamp must at least carry a future despawnAt.
  const stranded = after.filter((e) => beforeIds.has(e.id) && nonPlayer(e)
      && !isLaneTrafficVisual(e) && isUntagged(e))
    .filter((e) => !Number.isFinite(e.data && e.data.despawnAt)
      || (e.data.despawnAt != null && e.data.despawnAt <= state.simTime));
  assert.equal(stranded.length, 0,
    `untagged pocket bodies survived the sector exit with no expiry (D207): `
    + stranded.map((e) => `${e.id}:${e.type}:${classCarrierReason(e) || 'no-class'}`).join(', '));

  // 2. Every live carrier of a fixed class is sector-owned, by its spawn sector.
  const unowned = after.filter(nonPlayer)
    .filter((e) => classCarrierReason(e) && (e.homeSectorId == null
      || (e.data && e.data.homeSectorId == null && e.data.sectorId == null)));
  assert.equal(unowned.length, 0,
    `fixed-class bodies are live without sector ownership: `
    + unowned.map((e) => `${e.id}:${e.type}:${classCarrierReason(e)}`).join(', '));
  // Ceres-staged carriers that survive the exit must still be Ceres-owned (no cross-sector
  // restamp); carriers newly spawned in Helios Prime legitimately carry Helios.
  const misowned = after.filter((e) => beforeIds.has(e.id) && nonPlayer(e))
    .filter((e) => classCarrierReason(e) && e.homeSectorId !== PROOF_SECTOR_ID);
  assert.equal(misowned.length, 0,
    `Ceres-staged carriers lost their home sector across the exit: `
    + misowned.map((e) => `${e.id}:${e.homeSectorId}`).join(', '));

  // 3. The adopter corruption stays dead: a body's data.sectorId never disagrees with the
  // home sector it was spawned with (the D207 symptom was Ceres content stamped Helios).
  const corrupted = after.filter(nonPlayer).filter((e) => e.homeSectorId != null
    && e.data && e.data.sectorId != null && e.data.sectorId !== e.homeSectorId);
  assert.equal(corrupted.length, 0,
    `data.sectorId disagrees with homeSectorId (cross-sector adoption stamp): `
    + corrupted.map((e) => `${e.id}:home=${e.homeSectorId} data=${e.data.sectorId}`).join(', '));

  runtime.dispose?.();
});
