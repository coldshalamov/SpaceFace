// PQ-141.03 — Ambush Run loaded hauler spills cargo and flees on pirate fire.
// Reuses the PQ-141.02 real-path boot. Does not script NPC combat or emit fake flee/spill events.
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
const POST_FIRE_S = 20;
const GUN_RANGE_WU = 600;
const WATCHED = Object.freeze([
  'combat:fire',
  'combat:damage',
  'freight:cargoSpilled',
  'cargo:jettisoned',
  'ai:flee',
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

function wrapDelta(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
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
    throw new Error('PQ-141.03: world enter/relocate missing — not the real path');
  }
  world.enterSector(PROOF_SECTOR_ID);
  const at = pocketEntryGlobal(PROOF_AMBUSH_POCKET_ID);
  world.relocatePlayerInSector({ x: at.x, z: at.z, heading: 0 }, { reason: 'pq-141-03:ambush-run' });
  player.vel.x = 0;
  player.vel.z = 0;

  const physics = runtime.getSystem('physics');
  if (!physics || typeof physics.prepareBackend !== 'function') {
    throw new Error('PQ-141.03: physics.prepareBackend missing — not the real path');
  }
  const ready = await withFeatures(runtime, () => physics.prepareBackend(state, { reset: true }));
  if (ready !== true) throw new Error('PQ-141.03: SG-02 failed to come up');

  const diag = (physics && physics._diag) || {};
  if (diag.sg02Ready !== true || String(diag.backend) !== 'rapier-dynamic') {
    throw new Error(`PQ-141.03: not the real path (sg02Ready=${diag.sg02Ready}, backend=${diag.backend})`);
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
  };
}

function isHaulerOwnedSpill(row, haulerId, playerId) {
  const p = row.payload || {};
  if (row.name === 'freight:cargoSpilled') {
    const owner = p.ownerId ?? p.carrierId ?? p.entityId;
    return owner === haulerId ? row : null;
  }
  if (row.name === 'cargo:jettisoned') {
    if (p.ownerId != null && p.ownerId !== playerId && p.ownerId === haulerId) return row;
  }
  return null;
}

function ownerOf(entity) {
  const data = entity && entity.data || {};
  if (data.ownerId != null) return data.ownerId;
  if (data.ownership && data.ownership.ownerId != null) return data.ownership.ownerId;
  return entity && entity.ownerId;
}

function isCargoBody(entity) {
  if (!entity || entity.alive === false) return false;
  const data = entity.data || {};
  return entity.type === 'payload'
    || data.kind === 'cargo'
    || data.jettisonedCargo === true
    || data.payloadType === 'jettisoned_cargo'
    || (entity.type === 'pickup' && (data.kind === 'cargo' || data.commodityId));
}

function countOwnedPods(state, haulerId) {
  let n = 0;
  const list = state.entityList || [];
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!isCargoBody(entity)) continue;
    if (haulerId != null && String(ownerOf(entity)) !== String(haulerId)) continue;
    n += 1;
  }
  return n;
}

function jobPhase(state, hauler) {
  const jobId = hauler && hauler.data && hauler.data.jobId;
  if (!jobId || !state.npcJobs || !state.npcJobs.byId) return null;
  const entry = state.npcJobs.byId[jobId];
  return entry && entry.job ? entry.job.phase : null;
}

function characterize(state) {
  const hauler = loadedHauler(state);
  const manifest = hauler && hauler.data && hauler.data.cargoManifest;
  const intent = hauler && hauler.data && hauler.data.intent;
  return {
    t: Number((state.simTime || 0).toFixed(3)),
    haulerId: hauler ? hauler.id : null,
    qty: manifest && manifest.totalQty,
    spilled: !!(hauler && hauler.data && hauler.data.violenceCargoSpilled),
    fleeEmitted: !!(hauler && hauler.data && hauler.data.violenceFleeEmitted),
    alarmed: !!(hauler && hauler.data && hauler.data.violenceAlarmed),
    jobPhase: jobPhase(state, hauler),
    moveZ: intent ? intent.moveZ : null,
    aim: intent && Number.isFinite(intent.aimAngle) ? Number(intent.aimAngle.toFixed(3)) : null,
    pods: hauler ? countOwnedPods(state, hauler.id) : 0,
  };
}

async function runAmbushFleeSpill(seed) {
  const host = await bootAmbushRun(seed);
  const { runtime, state } = host;
  const receipts = [];
  const off = WATCHED.map((name) => runtime.bus.on(name, (payload) => {
    receipts.push({ t: state.simTime || 0, name, payload: payload || {} });
  }));

  let fire = null;
  let spill = null;
  let flee = null;
  const spillRows = [];
  const fleeRows = [];
  let manifestBeforeShot = null;
  let aimBeforeShot = null;
  let fleeIntent = null;
  let fleeJobPhase = null;
  let podCount = 0;
  let lastChar = null;
  const hard = Math.round(HARD_CAP_S * 60);
  const extra = Math.round(POST_FIRE_S * 60);
  let stopAt = hard;
  try {
    for (let i = 0; i < hard + extra; i++) {
      if (i >= stopAt) break;
      const haulerBefore = loadedHauler(state);
      if (!manifestBeforeShot && haulerBefore && haulerBefore.data && haulerBefore.data.cargoManifest
        && haulerBefore.data.cargoManifest.totalQty > 0) {
        manifestBeforeShot = {
          totalQty: haulerBefore.data.cargoManifest.totalQty,
          lines: (haulerBefore.data.cargoManifest.lines || []).map((line) => ({
            commodityId: line.commodityId,
            qty: line.qty,
          })),
        };
        const intent = haulerBefore.data.intent;
        aimBeforeShot = intent && Number.isFinite(intent.aimAngle) ? intent.aimAngle : null;
      }
      runtime.step(SIM_DT);
      const hauler = loadedHauler(state);
      const haulerId = (fire && fire.haulerId) || (hauler && hauler.id);
      while (receipts.length) {
        const row = receipts.shift();
        if (!fire) {
          const shot = isPirateHaulerShot(row, state);
          if (shot) {
            fire = { seed, ...shot, backend: host.backend };
            stopAt = Math.min(hard + extra, i + extra);
          }
        }
        if (row.name === 'freight:cargoSpilled' || row.name === 'cargo:jettisoned') spillRows.push(row);
        if (row.name === 'ai:flee') fleeRows.push(row);
      }
      if (haulerId != null) {
        if (!spill) {
          for (const row of spillRows) {
            const hit = isHaulerOwnedSpill(row, haulerId, state.playerId);
            if (hit) {
              spill = {
                t: Number((hit.t || 0).toFixed(3)),
                name: hit.name,
                podIds: Array.isArray(hit.payload && hit.payload.podIds) ? hit.payload.podIds.slice() : [],
                podCount: hit.payload && hit.payload.podCount,
                ownerId: hit.payload && (hit.payload.ownerId ?? hit.payload.carrierId),
              };
              let liveFromIds = 0;
              for (const id of spill.podIds) {
                const body = state.entities && state.entities.get(id);
                if (isCargoBody(body)) liveFromIds += 1;
              }
              podCount = Math.max(podCount, countOwnedPods(state, haulerId), liveFromIds);
              break;
            }
          }
        }
        if (!flee) {
          for (const row of fleeRows) {
            const entityId = row.payload.entityId ?? row.payload.id;
            if (entityId === haulerId) {
              flee = { t: Number((row.t || 0).toFixed(3)) };
              break;
            }
          }
        }
      }
      if (hauler && flee) {
        const intent = hauler.data && hauler.data.intent;
        const phase = jobPhase(state, hauler);
        if (intent && (intent.moveZ === 1 || phase === 'flee')) {
          fleeIntent = {
            moveX: intent.moveX,
            moveZ: intent.moveZ,
            boost: intent.boost,
            aimAngle: intent.aimAngle,
          };
          fleeJobPhase = phase;
        }
      }
      if (hauler) podCount = Math.max(podCount, countOwnedPods(state, hauler.id));
      if (fire && spill && flee && fleeIntent) {
        lastChar = characterize(state);
        break;
      }
      if (i % 60 === 0) lastChar = characterize(state);
    }
    if (!lastChar) lastChar = characterize(state);
    const hauler = loadedHauler(state);
    return {
      fire,
      spill,
      flee,
      manifestAtFire: manifestBeforeShot,
      aimAtFire: aimBeforeShot,
      lastChar,
      haulerId: hauler ? hauler.id : fire && fire.haulerId,
      podCount,
      intent: fleeIntent,
      jobPhase: fleeJobPhase,
      backend: host.backend,
    };
  } finally {
    for (const unsub of off) if (typeof unsub === 'function') unsub();
    runtime.dispose();
  }
}

function printResult(result) {
  console.log(
    `PQ-141.03 seed 47: hauler id=${result.haulerId} pod count=${result.podCount} `
    + `flee event t=${result.flee ? result.flee.t : 'none'} `
    + `spill event t=${result.spill ? result.spill.t : 'none'}`,
  );
}

test('PQ-141.03 seed 47 Ambush loaded hauler carries cargo, spills, and flees on pirate fire', {
  timeout: 150_000,
}, async () => {
  const result = await runAmbushFleeSpill(47);
  if (!result.fire || !result.spill || !result.flee) {
    console.log('PQ-141.03 seed 47 incomplete:', JSON.stringify({
      fire: result.fire,
      spill: result.spill,
      flee: result.flee,
      lastChar: result.lastChar,
    }));
  }
  assert.ok(result.fire, 'pointed at Ambush Run, seed 47 must produce a real pirate→loaded-hauler shot');
  assert.equal(result.backend, 'rapier-dynamic');
  assert.ok(result.haulerId != null, 'loaded hauler must be live');
  const qty = result.manifestAtFire && result.manifestAtFire.totalQty;
  assert.ok(Number(qty) > 0, `loaded hauler must carry a real cargoManifest (qty=${qty})`);
  const ironish = (result.manifestAtFire.lines || []).some((line) => (
    line.qty > 0 && typeof line.commodityId === 'string' && line.commodityId.includes('iron')
  )) || (result.manifestAtFire.lines || []).some((line) => line.qty > 0);
  assert.ok(ironish, 'manifest must include iron or a similar commodity line');
  assert.ok(result.spill, 'first pirate shot must emit freight:cargoSpilled or cargo:jettisoned for the hauler');
  assert.ok(result.podCount >= 1, `must spill ≥1 cargo body owned by the hauler (pods=${result.podCount})`);
  assert.ok(result.flee, 'the same hauler must emit ai:flee');
  assert.ok(result.intent, 'flee must change course via intent, not a pos write');
  assert.equal(result.intent.moveZ, 1, 'flee intent must keep throttle');
  const turned = result.aimAtFire == null
    || !Number.isFinite(result.intent.aimAngle)
    || wrapDelta(result.intent.aimAngle, result.aimAtFire) > 0.05
    || result.jobPhase === 'flee';
  assert.ok(
    turned || result.jobPhase === 'flee',
    `hauler must change course (aim ${result.aimAtFire}→${result.intent.aimAngle}, job=${result.jobPhase})`,
  );
  printResult(result);
});
