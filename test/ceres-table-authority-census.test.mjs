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
  PROOF_REFINERY_POCKET_ID,
  PROOF_PLAYER_HULL_ID,
  PROOF_SHOVE_WEAPON_ID,
  pocketEntryGlobal,
} from '../src/testing/lab/proofSixtySeconds.js';

const SEED = 14920;
const WARM_TICKS = 180;
const SAMPLE_TICKS = 240;

function countByType(list) {
  const out = {};
  for (const e of list || []) {
    if (!e || e.alive === false) continue;
    const t = e.type || 'unknown';
    out[t] = (out[t] || 0) + 1;
  }
  return out;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[i];
}

test('quiet Ceres refinery pocket keeps the combat list in the tens', async () => {
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
  const at = pocketEntryGlobal(PROOF_REFINERY_POCKET_ID);
  world.relocatePlayerInSector({ x: at.x, z: at.z, heading: 0 }, { reason: 'table-authority-census' });
  player.vel.x = 0;
  player.vel.z = 0;

  const physics = runtime.getSystem('physics');
  const prevFeatures = snapshotFeatureMaps();
  applyFeatureConfigToMaps(runtime && runtime.config && runtime.config.features);
  const ready = await physics.prepareBackend(state, { reset: true });
  restoreFeatureMaps(prevFeatures);
  assert.equal(ready, true, 'Rapier backend must come up');

  for (let i = 0; i < WARM_TICKS; i++) runtime.step(1 / 60);

  const live = (state.entityList || []).filter((e) => e && e.alive !== false);
  const samples = [];
  for (let i = 0; i < SAMPLE_TICKS; i++) {
    const t0 = performance.now();
    runtime.step(1 / 60);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);

  const after = (state.entityList || []).filter((e) => e && e.alive !== false);
  const byType = countByType(after);
  const field = state.world && state.world.asteroidField;
  const far = state.world && state.world.farActors;
  const dressing = state.world && state.world.dressing;
  const fieldRocks = field && field.rocks ? field.rocks.length : 0;
  const farRows = far && far.rows ? far.rows.length : 0;
  const dressingRows = dressing && dressing.rows ? dressing.rows.length : 0;
  const liveWrecks = byType.wreck || 0;
  const liveFx = byType.fx || 0;
  const liveRocks = byType.asteroid || 0;
  const p50 = percentile(samples, 0.5);
  const p95 = percentile(samples, 0.95);

  const report = {
    seed: SEED,
    sector: PROOF_SECTOR_ID,
    pocket: PROOF_REFINERY_POCKET_ID,
    entityList: after.length,
    byType,
    asteroidFieldRocks: fieldRocks,
    farActorRows: farRows,
    dressingRows,
    tickMs: { p50, p95, max: samples[samples.length - 1] },
  };
  console.log(JSON.stringify(report, null, 2));

  assert.ok(after.length < 70, `quiet Ceres entityList should be tens, got ${after.length}`);
  assert.ok(after.length <= live.length + 8, 'warm list should not balloon during the sample');
  assert.ok(fieldRocks > 200, `rocks belong in asteroidField, got ${fieldRocks}`);
  assert.ok(liveRocks < 20, `live rocks should be the pinned geology/activity set, got ${liveRocks}`);
  assert.ok(farRows >= 10, `dormant traffic/wrecks belong in farActors, got ${farRows}`);
  assert.ok(liveWrecks < 6, `unnamed quiet wrecks should leave the combat list, got ${liveWrecks}`);
  assert.ok(liveFx < 16, `non-pin POI markers should be dressing, got ${liveFx}`);
  assert.ok(dressingRows > 20, `POI/dressing rows should sit off the list, got ${dressingRows}`);
  assert.ok(p50 < 5, `headless tick p50 must stay under 5 ms, got ${p50}`);
  runtime.dispose?.();
});
