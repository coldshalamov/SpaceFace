// PQ-141.04 — Ambush Run pirate fire on the loaded hauler opens a real Ceres law incident.
// Real-path boot pointed at Ambush Run. Does not emit fake law events.
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
const ESCORT_SLOT = 'ceres_ambush_escort';
const HARD_CAP_S = 90;
const LAW_TAIL_S = 12;
const GUN_RANGE_WU = 600;
const PLAYER_SPAWN_RADIUS_WU = 400;
const LAW_EVENTS = Object.freeze([
  'law:incidentOpened',
  'law:distressRaised',
  'law:dispatchStarted',
]);
const WATCHED = Object.freeze([
  'combat:fire',
  'combat:damage',
  ...LAW_EVENTS,
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

function ambushEscort(state) {
  return liveShips(state).find((e) => e.data && e.data.activityActorSlotId === ESCORT_SLOT) || null;
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

function liveIncidentRecord(state, event) {
  const incidents = state.lawSecurity && state.lawSecurity.incidents;
  if (!incidents || !event) return null;
  const rows = Object.values(incidents);
  return rows.find((inc) => inc && inc.id === event.id)
    || rows.find((inc) => inc && inc.attackerId === event.attackerId && inc.victimId === event.victimId)
    || null;
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
    throw new Error('PQ-141.04: world enter/relocate missing — not the real path');
  }
  world.enterSector(PROOF_SECTOR_ID);
  const at = pocketEntryGlobal(PROOF_AMBUSH_POCKET_ID);
  world.relocatePlayerInSector({ x: at.x, z: at.z, heading: 0 }, { reason: 'pq-141-04:ambush-patrol' });
  player.vel.x = 0;
  player.vel.z = 0;

  const physics = runtime.getSystem('physics');
  if (!physics || typeof physics.prepareBackend !== 'function') {
    throw new Error('PQ-141.04: physics.prepareBackend missing — not the real path');
  }
  const ready = await withFeatures(runtime, () => physics.prepareBackend(state, { reset: true }));
  if (ready !== true) throw new Error('PQ-141.04: SG-02 failed to come up');

  const diag = (physics && physics._diag) || {};
  if (diag.sg02Ready !== true || String(diag.backend) !== 'rapier-dynamic') {
    throw new Error(`PQ-141.04: not the real path (sg02Ready=${diag.sg02Ready}, backend=${diag.backend})`);
  }
  if (!runtime.getSystem('lawSecurity')) {
    throw new Error('PQ-141.04: lawSecurity missing from the production runtime');
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

function isHaulerLawEvent(row, state, fire) {
  if (!LAW_EVENTS.includes(row.name)) return null;
  const p = row.payload || {};
  const hauler = loadedHauler(state);
  const haulerId = hauler ? hauler.id : fire && fire.haulerId;
  const pirateId = fire && fire.pirateId;
  const namesHauler = p.victimId === haulerId || p.targetId === haulerId;
  const namesPirateAttack = pirateId != null && p.attackerId === pirateId
    && (namesHauler || p.victimId != null);
  if (!namesHauler && !namesPirateAttack) return null;
  const record = liveIncidentRecord(state, p);
  if (!record) return null;
  return {
    name: row.name,
    id: record.id,
    cause: record.cause,
    attackerId: record.attackerId,
    victimId: record.victimId,
    t: Number((row.t || 0).toFixed(3)),
    stationId: record.stationId,
    status: record.status,
    reserveAllowed: record.reserveAllowed === true,
    responderIds: Array.isArray(record.responderIds) ? record.responderIds.slice() : [],
  };
}

function securitySpawnsNearPlayer(state, player, knownIds) {
  return liveShips(state).filter((entity) => {
    if (knownIds.has(entity.id) || entity.id === player.id) return false;
    const ai = entity.data && entity.data.ai || {};
    if (ai.spawnContext !== 'security_response') return false;
    return dist(entity.pos, player.pos) <= PLAYER_SPAWN_RADIUS_WU;
  });
}

async function runAmbushLaw(seed) {
  const host = await bootAmbushRun(seed);
  const { runtime, state, player } = host;
  const knownIds = new Set(liveShips(state).map((e) => e.id));
  const receipts = [];
  const off = WATCHED.map((name) => runtime.bus.on(name, (payload) => {
    receipts.push({ t: state.simTime || 0, name, payload: payload || {} });
  }));

  let fire = null;
  let law = null;
  let fireTick = null;
  const limit = Math.round((HARD_CAP_S + LAW_TAIL_S) * 60);
  try {
    for (let i = 0; i < limit; i++) {
      runtime.step(SIM_DT);
      while (receipts.length) {
        const row = receipts.shift();
        if (!fire) {
          const shot = isPirateHaulerShot(row, state);
          if (shot) {
            fire = shot;
            fireTick = i;
          }
        }
        if (!law) {
          const event = isHaulerLawEvent(row, state, fire);
          if (event) law = event;
        }
      }
      if (fire && law) break;
      if (fire && fireTick != null && i - fireTick >= Math.round(LAW_TAIL_S * 60)) break;
    }
    const escort = ambushEscort(state);
    return {
      fire,
      law,
      backend: host.backend,
      escortId: escort ? escort.id : null,
      nearPlayerSpawns: securitySpawnsNearPlayer(state, player, knownIds).map((e) => e.id),
      stationPresent: !!(state.entityList || []).some((e) => {
        const id = e && (e.data && e.data.stationId || e.stationId);
        return e && e.type === 'station' && id === 'station_ceres';
      }),
    };
  } finally {
    for (const unsub of off) if (typeof unsub === 'function') unsub();
    runtime.dispose();
  }
}

function printLaw(law) {
  console.log(
    `PQ-141.04 law seed 47: id=${law.id} cause=${law.cause} `
    + `attackerId=${law.attackerId} victimId=${law.victimId} t=${law.t}`,
  );
}

test('PQ-141.04 seed 47 pirate→hauler fire opens a real Ceres law incident', {
  timeout: 150_000,
}, async () => {
  const result = await runAmbushLaw(47);
  if (!result.fire) {
    console.log('PQ-141.04 seed 47: no pirate→hauler shot before law window');
  }
  assert.ok(result.fire, 'pointed at Ambush Run, seed 47 must produce pirate→loaded-hauler fire first');
  if (!result.stationPresent) {
    console.log('PQ-141.04 seed 47: station_ceres missing — Ceres jurisdiction has no owner');
  }
  assert.ok(result.stationPresent, 'Ceres jurisdiction owner station_ceres must exist on the real path');
  if (!result.law) {
    console.log(
      `PQ-141.04 seed 47: no law incident after fire pirate=${result.fire.pirateId} `
      + `hauler=${result.fire.haulerId} t=${result.fire.t}`,
    );
  }
  assert.ok(result.law, 'pirate fire on the loaded hauler must open a real law incident record');
  printLaw(result.law);
  assert.equal(result.backend, 'rapier-dynamic');
  assert.ok(result.law.id && String(result.law.id).startsWith('law:'), 'incident must have a live law id');
  assert.equal(result.law.victimId, result.fire.haulerId, 'incident victim must be the loaded hauler');
  assert.equal(result.law.attackerId, result.fire.pirateId, 'incident attacker must be the firing pirate');
  assert.ok(
    result.law.cause === 'npc_piracy' || result.law.cause === 'hostile_fire',
    `unexpected cause ${result.law.cause}`,
  );
  assert.equal(result.law.reserveAllowed, false, 'pocket distress must not spawn a reserve patrol');
  assert.deepEqual(result.nearPlayerSpawns, [], 'must not spawn a patrol on the player');
  if (result.law.responderIds.length && result.escortId != null) {
    assert.ok(
      result.law.responderIds.includes(result.escortId),
      'existing Ceres escort should be the local responder when dispatch assigns one',
    );
  }
});
