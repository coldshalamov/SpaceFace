#!/usr/bin/env node
// Headless quiet Ceres vs crowded Ambush recapture. Combat/Swarm stay on the 60 Hz table.
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
  PROOF_AMBUSH_POCKET_ID,
  PROOF_PLAYER_HULL_ID,
  PROOF_REFINERY_POCKET_ID,
  PROOF_SECTOR_ID,
  PROOF_SHOVE_WEAPON_ID,
  pocketEntryGlobal,
} from '../src/testing/lab/proofSixtySeconds.js';

const WARM_TICKS = 180;
const SAMPLE_TICKS = 240;

function countByType(list) {
  const out = {};
  for (const entity of list || []) {
    if (!entity || entity.alive === false) continue;
    const type = entity.type || 'unknown';
    out[type] = (out[type] || 0) + 1;
  }
  return out;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

async function capture({ label, seed, pocketId }) {
  const table = getNodeSystemFactoryTable({ tacticalAI: true, flightBackend: 'v3' });
  if (!table.get('stuntGrammar')) table.set('stuntGrammar', stuntGrammar);
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed,
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
  const at = pocketEntryGlobal(pocketId);
  world.relocatePlayerInSector({ x: at.x, z: at.z, heading: 0 }, { reason: `quiet-tick-${label}` });
  player.vel.x = 0;
  player.vel.z = 0;

  const physics = runtime.getSystem('physics');
  const prevFeatures = snapshotFeatureMaps();
  applyFeatureConfigToMaps(runtime && runtime.config && runtime.config.features);
  const ready = await physics.prepareBackend(state, { reset: true });
  restoreFeatureMaps(prevFeatures);
  if (ready !== true) throw new Error(`${label}: Rapier backend failed`);

  for (let i = 0; i < WARM_TICKS; i++) runtime.step(1 / 60);

  const samples = [];
  for (let i = 0; i < SAMPLE_TICKS; i++) {
    const t0 = performance.now();
    runtime.step(1 / 60);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);

  const after = (state.entityList || []).filter((entity) => entity && entity.alive !== false);
  const byType = countByType(after);
  const field = state.world && state.world.asteroidField;
  const far = state.world && state.world.farActors;
  const dressing = state.world && state.world.dressing;
  const combat = state.combat || {};
  const report = {
    label,
    seed,
    pocket: pocketId,
    profileId: state.runtime && state.runtime.profileId,
    entityList: after.length,
    byType,
    asteroidFieldRocks: field && field.rocks ? field.rocks.length : 0,
    farActorRows: far && far.rows ? far.rows.length : 0,
    dressingRows: dressing && dressing.rows ? dressing.rows.length : 0,
    combatList: Array.isArray(combat.list) ? combat.list.length : null,
    tickMs: {
      p50: percentile(samples, 0.5),
      p95: percentile(samples, 0.95),
      max: samples[samples.length - 1],
    },
  };
  runtime.dispose?.();
  return report;
}

const reports = [
  await capture({ label: 'quiet-ceres', seed: 14920, pocketId: PROOF_REFINERY_POCKET_ID }),
  await capture({ label: 'swarm-ambush', seed: 4242, pocketId: PROOF_AMBUSH_POCKET_ID }),
];
console.log(JSON.stringify(reports, null, 2));
