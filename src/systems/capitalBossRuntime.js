// Production construction of the capital boss encounter system (packet 09: Three Capitals).
//
// `createCapitalBossEncounters` requires two explicitly injected ports and refuses to run without
// them. This module is the production wiring: the same singleton is registered by the browser
// registry (src/core/registry.js) and the Node production-fidelity factory table
// (src/runtime/nodeSystemFactoryTable.js), so every client drives the identical executable scores.
//
// Ownership rules preserved here:
//   - observe() reads the LIVE capability view (helpers.getCombatCapabilities) — never a cached
//     copy — and decides lifecycle activity with an explicit Boolean, including the 620/900 WU
//     engage/suspend hysteresis (capitalBossInRange) and the docked/unloaded/sector gates.
//   - spawnWing() runs inside the mission owner: the wing ledger lives in mission params, specs go
//     through makeEnemySpawnSpec, and every member is spawned (and stamped) through the missions
//     system's ONE owned-spawn boundary, so budget, placement safety and target registration
//     cannot be forgotten by a caller.
//   - No transform, hull, wallet, subsystem or AI-intent write happens here; the score writes its
//     own GameState orders and the tactical owner stays the sole AI-intent writer.
import {
  createCapitalBossEncounters,
  observeCapitalBody,
  capitalBossInRange,
} from './capitalBossEncounters.js';
import { spawnCapitalBossWing } from '../missions/capitalBossSpawn.js';
import { makeEnemySpawnSpec } from './combat.js';
import { missions } from './missions.js';
import { SECTORS } from '../data/sectors.js';

const SECTOR_BY_ID = new Map(SECTORS.map((sector) => [sector.id, sector]));

function missionById(state, fightId) {
  const active = state && state.missions && state.missions.active;
  if (!Array.isArray(active) || fightId == null) return null;
  return active.find((m) => m && String(m.id) === String(fightId)) || null;
}

function previousPositionOf(state, entityId) {
  const entity = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(entityId)
    : null;
  const prev = entity && entity.prevPos;
  return prev && Number.isFinite(prev.x) && Number.isFinite(prev.z)
    ? { x: prev.x, z: prev.z }
    : null;
}

/** Sector level for spawned actors, same formula the mission spawner uses. */
function sectorLevelForMission(state, mission) {
  const sector = mission && SECTOR_BY_ID.get(mission.destSectorId);
  const [lvLo, lvHi] = sector ? (sector.enemyLevel || [2, 4]) : [2, 4];
  return Math.round((lvLo + lvHi) / 2);
}

/** Production port construction, shared by the registry singleton and per-runtime instances. */
export function createProductionCapitalBossEncounters() {
  return createCapitalBossEncounters({
    observe(record, state, helpers) {
      const mission = missionById(state, record.fightId);
      const bossEntity = state.entities.get(record.bossId);
      const targetEntity = state.entities.get(state.playerId);
      const boss = observeCapitalBody(
        bossEntity,
        bossEntity && helpers && typeof helpers.getCombatCapabilities === 'function'
          ? helpers.getCombatCapabilities(bossEntity.id)
          : null,
        bossEntity ? previousPositionOf(state, bossEntity.id) : null,
      );
      const target = observeCapitalBody(
        targetEntity,
        null,
        targetEntity ? previousPositionOf(state, targetEntity.id) : null,
      );
      // Explicit lifecycle activity: the fight suspends while the mission is settled, the player
      // is docked, the boss's sector is unloaded, the pause freeze skips fixed ticks entirely, or
      // the pair leaves the 620/900 WU hysteresis band. Absence of an entity record is NOT a kill.
      const missionLive = !!(mission && mission.status === 'active');
      const sectorLive = !!(state.world
        && state.world.currentSectorId
        && state.world.currentSectorId === mission?.destSectorId);
      const notDocked = !(state.ui && (state.ui.docked === true || state.ui.dockedStationId != null));
      const inRange = capitalBossInRange(record, boss, target);
      return {
        boss,
        target,
        active: Boolean(missionLive && sectorLive && notDocked && boss && target && inRange),
        targets: target ? [target] : [],
      };
    },

    spawnWing(command, record, ctx) {
      const state = ctx.state;
      const mission = missionById(state, record.fightId);
      const boss = state.entities.get(record.bossId);
      if (!mission || !boss) throw new Error('Wing request reached an unresolved mission/boss');
      mission.params ??= {};
      // The wing ledger is mission-owned durable state, serialized with mission params. The score
      // requests each wing at most once; the ledger (not the score) is what survives a reload.
      const ledger = (mission.params.capitalWingLedger ??= {});
      // Resolve the REGISTERED missions owner (the same instance that owns budget/placement/stamp)
      // rather than assuming the import-time singleton — sim forks and the registry both qualify.
      const owner = (ctx.registry && typeof ctx.registry.get === 'function'
        && ctx.registry.get('missions')) || missions;
      return spawnCapitalBossWing({
        command,
        record,
        boss,
        level: sectorLevelForMission(state, mission),
        ledger,
        makeEnemySpawnSpec,
        spawnEntity: (spec) => owner.spawnOwnedCapitalBossActor(mission, spec),
      });
    },
  });
}

/** The production singleton registered by the browser registry and the Node factory table. */
export const capitalBossEncounters = createProductionCapitalBossEncounters();

export default capitalBossEncounters;
