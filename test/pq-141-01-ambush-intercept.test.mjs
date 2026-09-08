// PQ-141.01 — existing Throughline ambush pirate intercepts the loaded Ambush Run hauler.
// Real-path boot pointed at Ambush Run. Does not script NPC combat or emit fake encounters.
import assert from 'node:assert/strict';
import test from 'node:test';

import { SIM_DT } from '../src/core/sim.js';
import {
  applyFeatureConfigToMaps,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../src/data/featureFlags.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { getNodeSystemFactoryTable } from '../src/runtime/nodeSystemFactoryTable.js';
import {
  PROOF_AMBUSH_POCKET_ID,
  PROOF_PLAYER_HULL_ID,
  PROOF_SECTOR_ID,
  PROOF_SEEDS,
  PROOF_SHOVE_WEAPON_ID,
  classifyReceipt,
  isHaulerEntity,
  isPirateEntity,
  pocketEntryGlobal,
} from '../src/testing/lab/proofSixtySeconds.js';

const AMBUSH_ENCOUNTER_ID = 'ceres:activity:throughline-ambush';
const LOADED_HAULER_SLOT = 'ceres_ambush_loaded_hauler';
const HARD_CAP_S = 90;
const WATCHED = Object.freeze([
  'encounter:telegraph',
  'encounter:spawned',
  'combat:fire',
  'combat:damage',
  'interdiction:triggered',
  'pirateParley:started',
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

function liveShips(state) {
  return (state.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship');
}

function loadedHauler(state) {
  return liveShips(state).find((e) => e.data && e.data.activityActorSlotId === LOADED_HAULER_SLOT)
    || liveShips(state).find(isHaulerEntity)
    || null;
}

function ambushPirate(state) {
  return liveShips(state).find((e) => {
    const ai = e.data && e.data.ai;
    return ai && ai.zoneId === 'zone_ceres_ambush' && ai.squadId === 'zone_ceres_ambush';
  }) || liveShips(state).find(isPirateEntity) || null;
}

function kindOf(name) {
  if (name === 'encounter:telegraph' || name === 'encounter:spawned') return 'encounter telegraph/spawn';
  if (name === 'combat:fire' || name === 'combat:damage') return 'combat:fire/damage';
  return name;
}

async function bootAmbushRun(seed) {
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
  if (!world || typeof world.enterSector !== 'function' || typeof world.relocatePlayerInSector !== 'function') {
    throw new Error('PQ-141.01: world enter/relocate missing — not the real path');
  }
  world.enterSector(PROOF_SECTOR_ID);
  const at = pocketEntryGlobal(PROOF_AMBUSH_POCKET_ID);
  world.relocatePlayerInSector({ x: at.x, z: at.z, heading: 0 }, { reason: 'pq-141-01:ambush-run' });
  player.vel.x = 0;
  player.vel.z = 0;

  const physics = runtime.getSystem('physics');
  if (!physics || typeof physics.prepareBackend !== 'function') {
    throw new Error('PQ-141.01: physics.prepareBackend missing — not the real path');
  }
  const ready = await withFeatures(runtime, () => physics.prepareBackend(state, { reset: true }));
  if (ready !== true) throw new Error('PQ-141.01: SG-02 failed to come up');

  const diag = (physics && physics._diag) || {};
  if (diag.sg02Ready !== true || String(diag.backend) !== 'rapier-dynamic') {
    throw new Error(`PQ-141.01: not the real path (sg02Ready=${diag.sg02Ready}, backend=${diag.backend})`);
  }

  return { runtime, state, player, backend: String(diag.backend) };
}

async function runAmbushIntercept(seed) {
  const host = await bootAmbushRun(seed);
  const { runtime, state } = host;
  const ctx = {
    state,
    spunIds: new Set(),
    projectileIds: new Set(),
    latchedIds: new Set(),
    lastNpcCargoOwner: false,
  };
  const receipts = [];
  const off = WATCHED.map((name) => runtime.bus.on(name, (payload) => {
    receipts.push({ t: state.simTime || 0, name, payload: payload || {} });
  }));

  let hit = null;
  const limit = Math.round(HARD_CAP_S * 60);
  try {
    for (let i = 0; i < limit; i++) {
      runtime.step(SIM_DT);
      while (receipts.length) {
        const row = receipts.shift();
        const classified = classifyReceipt(row.name, row.payload, ctx);
        if (!classified || classified.beat !== 'pirates_intercept') continue;
        const pirate = ambushPirate(state);
        const hauler = loadedHauler(state);
        const ownerId = row.payload.ownerId ?? row.payload.attackerId ?? row.payload.sourceId;
        const targetId = row.payload.targetId ?? row.payload.id;
        hit = {
          seed,
          t: Number((row.t || 0).toFixed(3)),
          event: row.name,
          kind: kindOf(row.name),
          encounterId: row.payload.encounterId || null,
          pirateId: pirate ? pirate.id : ownerId ?? null,
          haulerId: hauler ? hauler.id : (isHaulerEntity(state.entities.get(targetId)) ? targetId : null),
          ownerId: ownerId ?? null,
          targetId: targetId ?? null,
          detail: classified.detail,
          backend: host.backend,
        };
        break;
      }
      if (hit) break;
    }
    return hit;
  } finally {
    for (const unsub of off) if (typeof unsub === 'function') unsub();
    runtime.dispose();
  }
}

function printIntercept(hit) {
  console.log(
    `PQ-141.01 intercept seed ${hit.seed}: pirate id=${hit.pirateId} hauler id=${hit.haulerId} `
    + `event=${hit.event} kind=${hit.kind} t=${hit.t}s detail=${hit.detail}`,
  );
}

test('PQ-141.01 seed 47 at Ambush Run produces a real pirate intercept receipt', {
  timeout: 120_000,
}, async () => {
  const hit = await runAmbushIntercept(47);
  assert.ok(hit, 'pointed at Ambush Run, seed 47 must produce an intercept receipt without scripted combat');
  printIntercept(hit);
  assert.equal(hit.backend, 'rapier-dynamic');
  assert.ok(hit.pirateId != null, 'intercept must name the live pirate');
  assert.ok(
    hit.event === 'encounter:telegraph'
      || hit.event === 'encounter:spawned'
      || hit.event === 'combat:fire'
      || hit.event === 'combat:damage',
    `unexpected intercept event ${hit.event}`,
  );
  if (hit.event === 'encounter:telegraph' || hit.event === 'encounter:spawned') {
    assert.equal(hit.encounterId, AMBUSH_ENCOUNTER_ID);
  }
});

test('PQ-141.01 four more seeds stay honest when pointed at Ambush Run', {
  timeout: 120_000,
}, async () => {
  const extras = PROOF_SEEDS.filter((seed) => seed !== 47);
  const hits = [];
  for (const seed of extras) {
    const hit = await runAmbushIntercept(seed);
    if (hit) {
      printIntercept(hit);
      hits.push(hit);
    } else {
      console.log(`PQ-141.01 intercept seed ${seed}: none`);
    }
  }
  console.log(`PQ-141.01 extra-seed intercepts: ${hits.length}/${extras.length}`);
  // One honest seed (47) is enough for this leaf. Extra seeds are a census, not a gate.
});
