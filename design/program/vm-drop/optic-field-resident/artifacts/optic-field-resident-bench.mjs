/**
 * Portable A/B: crowded-frame cost of N systems walking entityList.
 * Before = quiet Ceres with optic lattices live (legacy).
 * After  = optic field-resident (current).
 */
import { createAuthoritativeRuntime } from './src/runtime/createAuthoritativeRuntime.js';
import { getNodeSystemFactoryTable } from './src/runtime/nodeSystemFactoryTable.js';
import { applyFeatureConfigToMaps, restoreFeatureMaps, snapshotFeatureMaps } from './src/data/featureFlags.js';
import { makeShipEntitySpec } from './src/systems/ships.js';
import { stuntGrammar } from './src/systems/stuntGrammar.js';
import { promoteAsteroidFieldRock } from './src/world/asteroidField.js';
import {
  PROOF_SECTOR_ID, PROOF_REFINERY_POCKET_ID, PROOF_PLAYER_HULL_ID,
  PROOF_SHOVE_WEAPON_ID, pocketEntryGlobal,
} from './src/testing/lab/proofSixtySeconds.js';

const SYSTEMS = 40; // representative scanners on the combat clock
const ITERS = 800;

async function bootQuietCeres() {
  const table = getNodeSystemFactoryTable({ tacticalAI: true, flightBackend: 'v3' });
  if (!table.get('stuntGrammar')) table.set('stuntGrammar', stuntGrammar);
  const runtime = createAuthoritativeRuntime({
    profileId: 'production', nodeSafeOnly: true, seed: 14920, systemLookup: table,
    slots: {
      aiSlot: table.get('aiSlot'), flightSlot: table.get('flightSlot'),
      aiBackend: 'sg06-tactical', flightBackend: 'v3',
    },
  });
  const state = runtime.state;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  if (!state.input.actions) state.input.actions = { brake: false, autopursuit: false };
  const player = runtime.spawn(makeShipEntitySpec(PROOF_PLAYER_HULL_ID, {
    isPlayer: true, player: state.player, pos: { x: 0, z: 0 },
    fittings: [PROOF_SHOVE_WEAPON_ID], factionId: 'faction_free',
  }));
  state.playerId = player.id;
  const world = runtime.getSystem('world');
  world.enterSector(PROOF_SECTOR_ID);
  const at = pocketEntryGlobal(PROOF_REFINERY_POCKET_ID);
  world.relocatePlayerInSector({ x: at.x, z: at.z, heading: 0 }, { reason: 'bench' });
  player.vel.x = 0; player.vel.z = 0;
  const physics = runtime.getSystem('physics');
  const prev = snapshotFeatureMaps();
  applyFeatureConfigToMaps(runtime.config && runtime.config.features);
  await physics.prepareBackend(state, { reset: true });
  restoreFeatureMaps(prev);
  for (let i = 0; i < 240; i++) runtime.step(1 / 60);
  return { runtime, state, world };
}

function snapshotList(state) {
  return (state.entityList || [])
    .filter((e) => e && e.alive !== false)
    .map((e) => ({
      id: e.id, type: e.type, radius: e.radius || 0,
      optic: !!(e.data && e.data.opticMaterial),
      x: e.pos ? e.pos.x : 0, z: e.pos ? e.pos.z : 0,
    }));
}

function walkCost(list, systems, iters) {
  let acc = 0;
  const t0 = performance.now();
  for (let n = 0; n < iters; n++) {
    for (let s = 0; s < systems; s++) {
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e || e.type === 'fx') continue;
        // firstAlong-ish: project + radius test against a fixed ray
        const t = e.x * 0.6 + e.z * 0.8;
        if (t < 0 || t > 400) continue;
        const ox = e.x - 0.6 * t;
        const oz = e.z - 0.8 * t;
        if (ox * ox + oz * oz <= (e.radius || 1) * (e.radius || 1)) acc += 1;
      }
    }
  }
  return { ms: performance.now() - t0, acc };
}

const { runtime, state, world } = await bootQuietCeres();
const afterList = snapshotList(state);
const afterLiveRocks = afterList.filter((e) => e.type === 'asteroid').length;

// Reconstruct legacy "before": promote every optic field rock onto the list.
const field = state.world.asteroidField;
const opticIds = [];
if (field && Array.isArray(field.rocks)) {
  for (const rec of field.rocks) {
    if (rec && rec.data && rec.data.opticMaterial) opticIds.push(rec.id);
  }
}
for (const id of opticIds) promoteAsteroidFieldRock(state, id, world.helpers, 'bench-before');
const beforeList = snapshotList(state);
const beforeLiveRocks = beforeList.filter((e) => e.type === 'asteroid').length;

// Warm
walkCost(beforeList, SYSTEMS, 20);
walkCost(afterList, SYSTEMS, 20);
const before = walkCost(beforeList, SYSTEMS, ITERS);
const after = walkCost(afterList, SYSTEMS, ITERS);
const speedup = before.ms / Math.max(1e-9, after.ms);

const report = {
  systems: SYSTEMS,
  iters: ITERS,
  before: {
    entityList: beforeList.length,
    liveAsteroids: beforeLiveRocks,
    opticPromoted: opticIds.length,
    walkMs: +before.ms.toFixed(3),
  },
  after: {
    entityList: afterList.length,
    liveAsteroids: afterLiveRocks,
    fieldOptic: opticIds.length,
    walkMs: +after.ms.toFixed(3),
  },
  speedup: +speedup.toFixed(3),
};
console.log(JSON.stringify(report, null, 2));
runtime.dispose?.();
