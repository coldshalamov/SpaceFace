// PQ-141.02 — Ambush Run pirate fires on the loaded hauler.
// Real-path boot pointed at Ambush Run. Does not script NPC combat or emit fake combat:fire.
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
  PROOF_SHOVE_WEAPON_ID,
  isPirateEntity,
  pocketEntryGlobal,
} from '../src/testing/lab/proofSixtySeconds.js';

const LOADED_HAULER_SLOT = 'ceres_ambush_loaded_hauler';
const HARD_CAP_S = 90;
const GUN_RANGE_WU = 600;
const WATCHED = Object.freeze([
  'encounter:telegraph',
  'encounter:spawned',
  'combat:fire',
  'combat:damage',
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
    || null;
}

function isAmbushPirate(entity) {
  if (!entity || !isPirateEntity(entity)) return false;
  const ai = entity.data && entity.data.ai;
  return !!(ai && ai.zoneId === 'zone_ceres_ambush' && ai.squadId === 'zone_ceres_ambush');
}

function ambushPirates(state) {
  return liveShips(state).filter(isAmbushPirate);
}

function dist(a, b) {
  if (!a || !b) return Infinity;
  const dx = (a.x || 0) - (b.x || 0);
  const dz = (a.z || 0) - (b.z || 0);
  return Math.hypot(dx, dz);
}

function aimedAtHauler(shooter, hauler) {
  if (!shooter || !hauler) return false;
  const combatId = shooter.data && shooter.data.combat && shooter.data.combat.targetId;
  const activityId = shooter.data && shooter.data.ai && shooter.data.ai.activity
    && shooter.data.ai.activity.targetId;
  return combatId === hauler.id || activityId === hauler.id;
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
    throw new Error('PQ-141.02: world enter/relocate missing — not the real path');
  }
  world.enterSector(PROOF_SECTOR_ID);
  const at = pocketEntryGlobal(PROOF_AMBUSH_POCKET_ID);
  world.relocatePlayerInSector({ x: at.x, z: at.z, heading: 0 }, { reason: 'pq-141-02:ambush-run' });
  player.vel.x = 0;
  player.vel.z = 0;

  const physics = runtime.getSystem('physics');
  if (!physics || typeof physics.prepareBackend !== 'function') {
    throw new Error('PQ-141.02: physics.prepareBackend missing — not the real path');
  }
  const ready = await withFeatures(runtime, () => physics.prepareBackend(state, { reset: true }));
  if (ready !== true) throw new Error('PQ-141.02: SG-02 failed to come up');

  const diag = (physics && physics._diag) || {};
  if (diag.sg02Ready !== true || String(diag.backend) !== 'rapier-dynamic') {
    throw new Error(`PQ-141.02: not the real path (sg02Ready=${diag.sg02Ready}, backend=${diag.backend})`);
  }

  return { runtime, state, player, backend: String(diag.backend) };
}

function isPirateHaulerShot(row, state) {
  if (row.name !== 'combat:fire' && row.name !== 'combat:damage') return null;
  const ownerId = row.payload.ownerId ?? row.payload.attackerId ?? row.payload.sourceId;
  const targetId = row.payload.targetId ?? row.payload.id;
  const shooter = ownerId != null ? state.entities.get(ownerId) : null;
  const hauler = loadedHauler(state);
  if (!isAmbushPirate(shooter) || !hauler) return null;
  if (row.name === 'combat:damage' && targetId !== hauler.id) return null;
  if (row.name === 'combat:fire') {
    if (!aimedAtHauler(shooter, hauler)) return null;
    if (dist(shooter.pos, hauler.pos) > GUN_RANGE_WU) return null;
  }
  return {
    pirateId: shooter.id,
    haulerId: hauler.id,
    event: row.name,
    t: Number((row.t || 0).toFixed(3)),
    ownerId,
    targetId: targetId ?? null,
    range: Number(dist(shooter.pos, hauler.pos).toFixed(1)),
    slot: hauler.data && hauler.data.activityActorSlotId,
  };
}

function characterize(state) {
  const hauler = loadedHauler(state);
  const pirates = ambushPirates(state);
  const live = state.encounterDirector && state.encounterDirector.live
    && state.encounterDirector.live['ceres:activity:throughline-ambush'];
  const rows = pirates.map((p) => {
    const ai = p.data && p.data.ai || {};
    const intent = p.data && p.data.intent || {};
    const combat = p.data && p.data.combat || {};
    const weapons = Array.isArray(p.data && p.data.weapons) ? p.data.weapons.length : 0;
    return {
      id: p.id,
      roe: ai.roe,
      passive: ai.passive,
      phase: ai.ceresActivityAmbushPhase,
      activity: ai.activity && ai.activity.kind,
      activityTarget: ai.activity && ai.activity.targetId,
      combatTarget: combat.targetId,
      fire: !!intent.fire,
      fireBlock: intent.fireBlockReason || null,
      weapons,
      distHauler: hauler ? Number(dist(p.pos, hauler.pos).toFixed(1)) : null,
    };
  });
  return {
    t: Number((state.simTime || 0).toFixed(3)),
    encounterPhase: live && live.phase || null,
    haulerId: hauler ? hauler.id : null,
    haulerSlot: hauler && hauler.data && hauler.data.activityActorSlotId,
    pirates: rows,
  };
}

async function runAmbushFire(seed) {
  const host = await bootAmbushRun(seed);
  const { runtime, state } = host;
  const receipts = [];
  const off = WATCHED.map((name) => runtime.bus.on(name, (payload) => {
    receipts.push({ t: state.simTime || 0, name, payload: payload || {} });
  }));

  let hit = null;
  let lastChar = null;
  const limit = Math.round(HARD_CAP_S * 60);
  try {
    for (let i = 0; i < limit; i++) {
      runtime.step(SIM_DT);
      while (receipts.length) {
        const row = receipts.shift();
        const shot = isPirateHaulerShot(row, state);
        if (!shot) continue;
        hit = {
          seed,
          ...shot,
          backend: host.backend,
        };
        break;
      }
      if (hit) break;
      if (i % 60 === 0) lastChar = characterize(state);
    }
    if (!hit) lastChar = characterize(state);
    return { hit, lastChar };
  } finally {
    for (const unsub of off) if (typeof unsub === 'function') unsub();
    runtime.dispose();
  }
}

function printFire(hit) {
  console.log(
    `PQ-141.02 fire seed ${hit.seed}: pirate id=${hit.pirateId} hauler id=${hit.haulerId} `
    + `event=${hit.event} t=${hit.t}s range=${hit.range} slot=${hit.slot}`,
  );
}

test('PQ-141.02 seed 47 at Ambush Run produces a real pirate→hauler combat:fire or combat:damage', {
  timeout: 120_000,
}, async () => {
  const { hit, lastChar } = await runAmbushFire(47);
  if (!hit) {
    console.log('PQ-141.02 seed 47: no pirate→hauler shot. last state:', JSON.stringify(lastChar));
  }
  assert.ok(hit, 'pointed at Ambush Run, seed 47 must produce a real pirate→loaded-hauler shot');
  printFire(hit);
  assert.equal(hit.backend, 'rapier-dynamic');
  assert.ok(hit.pirateId != null, 'shot must name the live ambush pirate');
  assert.ok(hit.haulerId != null, 'shot must name the loaded hauler');
  assert.equal(hit.slot, LOADED_HAULER_SLOT);
  assert.ok(hit.event === 'combat:fire' || hit.event === 'combat:damage', `unexpected event ${hit.event}`);
});
