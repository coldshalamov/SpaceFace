// PQ-029.03 — NPCs use Massline heads in ordinary Ceres traffic.
//
// Spawned-fixture pins live in npc-jobs-runtime-occupational-heads.test.mjs.
// This file is the missing census: seed 47, Ceres reference pocket, headless,
// no hand-spawned jobs. Each of tractor / elastic_whip / frame_coupler must
// appear on a live npc_tow line from an NPC job within 10 minutes.
// Hitch cannot fit the M heads; NPCs snapshot the verb onto derived.

import assert from 'node:assert/strict';
import test from 'node:test';

import { SIM_DT } from '../src/core/sim.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import {
  applyFeatureConfigToMaps,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../src/data/featureFlags.js';
import { CERES_REFERENCE_ACCEPTANCE_ENTRY } from '../src/data/sectorActivityPockets.js';
import { makeShipEntitySpec, buildSlotList, fits } from '../src/systems/ships.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { getNodeSystemFactoryTable } from '../src/runtime/nodeSystemFactoryTable.js';
import {
  PROOF_PLAYER_HULL_ID,
  PROOF_REFINERY_POCKET_ID,
  PROOF_SECTOR_ID,
  PROOF_SHOVE_WEAPON_ID,
  pocketEntryGlobal,
} from '../src/testing/lab/proofSixtySeconds.js';

const SEED = CERES_REFERENCE_ACCEPTANCE_ENTRY.fixedSeed;
const WINDOW_S = 600;
const HEADS = Object.freeze(['tractor', 'elastic_whip', 'frame_coupler']);
const HEAD_MODULES = Object.freeze([
  'mod_tractor_beam_m',
  'mod_elastic_whip_m',
  'mod_frame_coupler_m',
]);

function withFeatures(runtime, fn) {
  const previous = snapshotFeatureMaps();
  applyFeatureConfigToMaps(runtime && runtime.config && runtime.config.features);
  try {
    return fn();
  } finally {
    restoreFeatureMaps(previous);
  }
}

function roleOf(entity) {
  const data = entity && entity.data || {};
  return data.trafficRole || data.role || data.jobKind || '';
}

function jobLabel(state, owner, attachment) {
  const data = owner && owner.data || {};
  const jobId = data.jobId;
  const entry = jobId && state.npcJobs && state.npcJobs.byId
    ? state.npcJobs.byId[jobId]
    : null;
  const kind = entry && entry.kind || data.jobKind || '';
  const role = roleOf(owner);
  const slot = data.activityActorSlotId || '';
  return [kind, role, slot || attachment.controlMode].filter(Boolean).join('/');
}

function sampleHeads(state) {
  const bag = state.combat && state.combat.attachments && state.combat.attachments.byId;
  const rows = [];
  if (!bag) return rows;
  for (const attachment of Object.values(bag)) {
    if (!attachment || attachment.state !== 'active') continue;
    if (attachment.controlMode !== 'npc_tow') continue;
    const headId = attachment.tetherPolicy && attachment.tetherPolicy.headId;
    if (!HEADS.includes(headId)) continue;
    const owner = state.entities && state.entities.get(attachment.ownerId);
    if (!owner || owner.alive === false) continue;
    const jobId = owner.data && owner.data.jobId;
    if (!jobId || !state.npcJobs || !state.npcJobs.byId || !state.npcJobs.byId[jobId]) continue;
    rows.push({
      headId,
      job: jobLabel(state, owner, attachment),
      jobId,
      timeS: Number((Number(state.simTime) || 0).toFixed(2)),
      seed: SEED,
    });
  }
  return rows;
}

async function bootCeres(seed) {
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
  assert.ok(world && typeof world.enterSector === 'function', 'Ceres census needs world.enterSector');
  world.enterSector(PROOF_SECTOR_ID);
  const at = pocketEntryGlobal(PROOF_REFINERY_POCKET_ID);
  world.relocatePlayerInSector({ x: at.x, z: at.z, heading: 0 }, { reason: 'pq-029-03:ceres-census' });
  player.vel.x = 0;
  player.vel.z = 0;

  const physics = runtime.getSystem('physics');
  const ready = await withFeatures(runtime, () => physics.prepareBackend(state, { reset: true }));
  assert.equal(ready, true, 'SG-02 must come up for occupational lines');
  return { runtime, state };
}

test('Hitch cannot fit the M Massline heads', () => {
  const hitch = SHIPS.find((ship) => ship.id === 'ship_kestrel');
  assert.ok(hitch, 'Hitch (ship_kestrel) remains authored');
  const slots = buildSlotList(hitch);
  const utility = slots.filter((slot) => slot.type === 'utility');
  assert.ok(utility.length > 0, 'Hitch has a utility slot');
  assert.ok(utility.every((slot) => slot.size === 'S'), 'Hitch utility stays S');
  for (const id of HEAD_MODULES) {
    const def = MODULES.find((module) => module.id === id);
    assert.ok(def, `missing ${id}`);
    assert.equal(def.size, 'M');
    assert.ok(utility.every((slot) => fits(slot, def) === false), `Hitch must not fit ${id}`);
  }
});

test('Ceres ordinary traffic uses tractor, whip, and coupler within 10 min', {
  timeout: 600_000,
}, async () => {
  const { runtime, state } = await bootCeres(SEED);
  const first = {};
  const ticks = Math.round(WINDOW_S * 60);
  try {
    for (let i = 0; i < ticks; i += 1) {
      runtime.step(SIM_DT);
      if (i % 30 !== 0 && i !== ticks - 1) continue;
      for (const row of sampleHeads(state)) {
        if (!first[row.headId]) first[row.headId] = row;
      }
      if (HEADS.every((headId) => first[headId])) break;
    }

    const sightings = HEADS.map((headId) => first[headId] || null);
    console.log('PQ-029.03 sightings');
    console.log('head            job                              timeS   seed');
    for (const headId of HEADS) {
      const row = first[headId];
      if (!row) {
        console.log(`${headId.padEnd(16)} MISSING`);
        continue;
      }
      console.log(
        `${row.headId.padEnd(16)}${String(row.job).padEnd(34)}${String(row.timeS).padEnd(8)}${row.seed}`,
      );
    }

    for (const headId of HEADS) {
      assert.ok(first[headId], `ordinary Ceres traffic never used ${headId} within ${WINDOW_S}s`);
      assert.ok(first[headId].timeS <= WINDOW_S, `${headId} sighting ${first[headId].timeS}s exceeds 10 min`);
      assert.equal(first[headId].seed, SEED);
    }
    assert.ok(sightings.every(Boolean));
  } finally {
    runtime.dispose();
  }
});
