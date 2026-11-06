// LAST_ARGUMENT_INTEGRATION_V1
import { withLastArgument, observeLastArgument, isLastArgumentFight } from './lastArgument.js';
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
import { requireCapitalBossEncounter } from '../data/encounters/capital-boss.js';
import { makeEnemySpawnSpec } from './combat.js';
import { missions } from './missions.js';
import { SECTORS } from '../data/sectors.js';
import { swarmLevel } from '../data/swarmMode.js';
import { SURVIVAL_COHORT_TAG } from './waveMaterialization.js';
import { SURVIVAL_WAVE_OWNER_PREFIX } from './survivalWave.js';
import { swarmPilotHasActed } from './swarmSafety.js';

const SECTOR_BY_ID = new Map(SECTORS.map((sector) => [sector.id, sector]));

/**
 * FB-024 — swarm champion fights carry the `swarm:` prefix on their fight id. They bind the
 * SAME injected ports, but there is no mission row: the run owns the ledger and the spawn, and
 * "active" means a live survival run with both roles still on the field.
 */
const SWARM_FIGHT_PREFIX = 'swarm:';
export function isSwarmFightId(fightId) {
  return typeof fightId === 'string' && fightId.startsWith(SWARM_FIGHT_PREFIX);
}

function swarmWaveOfFightId(fightId) {
  const m = typeof fightId === 'string' ? fightId.match(/:w(\d+)/) : null;
  return m ? Number(m[1]) : 1;
}

function swarmRunLive(state) {
  const run = state && state.run;
  return !!(run && run.kind === 'survival' && run.phase === 'active');
}

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

/**
 * S14 — a fallen swarm capital pays its mass forward: four to six big chunks spawned where the
 * hull died, every one an ordinary tetherable throw-mass that outlives the round. The run's
 * rng deals the count and the scatter; a record-stamped ledger keeps a restore or a second
 * start from minting a second field.
 */
const SWARM_BOSS_CHUNKS = Object.freeze({
  min: 4, max: 6,
  radius: [14, 18],
  mass: [90, 140],
  hull: 320,
  scatterMin: 18, scatterMax: 64,
});

function spawnSwarmBossChunks(context, record, boss) {
  const spawn = context && context.helpers && context.helpers.spawnEntity;
  const state = context && context.state;
  if (typeof spawn !== 'function' || !state || !boss || !boss.pos) return [];
  const rng = typeof state.rng === 'function' ? state.rng : null;
  const roll = (lo, hi) => lo + (rng ? rng() : 0.5) * (hi - lo);
  const count = Math.round(roll(SWARM_BOSS_CHUNKS.min, SWARM_BOSS_CHUNKS.max + 0.999));
  const bossName = (boss.data && (boss.data.scanLabel || boss.data.name)) || 'capital hulk';
  const label = `${String(bossName).replace(/\s+/g, ' ').toUpperCase()} CHUNK`;
  const vel = boss.vel && Number.isFinite(boss.vel.x) ? boss.vel : { x: 0, z: 0 };
  const ids = [];
  for (let i = 0; i < count; i++) {
    const angle = roll(0, Math.PI * 2);
    const dist = roll(SWARM_BOSS_CHUNKS.scatterMin, SWARM_BOSS_CHUNKS.scatterMax);
    const kick = roll(4, 14);
    const spec = {
      type: 'wreck',
      team: 2,
      pos: { x: boss.pos.x + Math.cos(angle) * dist, z: boss.pos.z + Math.sin(angle) * dist },
      vel: { x: vel.x + Math.cos(angle) * kick, z: vel.z + Math.sin(angle) * kick },
      radius: roll(SWARM_BOSS_CHUNKS.radius[0], SWARM_BOSS_CHUNKS.radius[1]),
      mass: roll(SWARM_BOSS_CHUNKS.mass[0], SWARM_BOSS_CHUNKS.mass[1]),
      hull: SWARM_BOSS_CHUNKS.hull,
      hullMax: SWARM_BOSS_CHUNKS.hull,
      collides: true,
      data: {
        tetherable: true,
        masslineTetherable: true,
        physicalRole: 'throw_mass',
        swarmBossChunk: true,
        scanLabel: label,
        capitalBossActorKey: `${record.fightId}/boss_chunk/${i}`,
        capitalBossEncounterId: record.encounterId,
      },
      flags: { persistent: true },
    };
    const entity = spawn(spec);
    if (entity && entity.id != null) ids.push(entity.id);
  }
  return ids;
}

/**
 * S14 rites — wrapped around the production encounters object the same way withLastArgument
 * is: the system mutates, never forks. Three swarm-only beats ride the existing seams:
 *   - `capitalBoss:actChanged` → the act's own three-word callout through `swarm:announce`.
 *   - `entity:killed` on the champion → the death into ammunition chunks above.
 *   - the run's FIRST fallen champion → `run.swarmFirstBossDown`, the milestone the results
 *     plate turns into the IRON MAW DOWN variant, plus the push that mounts it.
 * All of it is gated on `swarm:` fight ids — contract bosses and Adventure never see it.
 */
function withSwarmBossRites(system) {
  const original = { init: system.init, destroy: system.destroy };
  const unsubs = [];
  let context = null;
  system.init = function (ctx) {
    original.init.call(system, ctx);
    context = ctx;
    const listen = (event, fn) => {
      const off = ctx.bus.on(event, fn);
      if (typeof off === 'function') unsubs.push(off);
      else if (typeof ctx.bus.off === 'function') unsubs.push(() => ctx.bus.off(event, fn));
    };

    listen('capitalBoss:actChanged', (change) => {
      if (!change || !Number.isInteger(change.index)) return;
      const state = context.state;
      const fights = state.capitalBossEncounters && state.capitalBossEncounters.fights;
      if (!fights) return;
      // The change carries no fightId — correlate the live swarm record at that act.
      const record = Object.values(fights).find((r) => r && !r.terminal
        && isSwarmFightId(r.fightId) && r.actIndex === change.index);
      if (!record) return;
      const act = (requireCapitalBossEncounter(record.encounterId).score.acts || [])[change.index];
      if (!act || typeof act.callout !== 'string' || !act.callout) return;
      ctx.bus.emit('swarm:announce', { kind: 'bossact', text: act.callout, count: 1 });
    });

    listen('entity:killed', (p) => {
      if (!p || p.id == null) return;
      const state = context.state;
      const fights = state.capitalBossEncounters && state.capitalBossEncounters.fights;
      if (!fights) return;
      for (const [fightId, record] of Object.entries(fights)) {
        if (!isSwarmFightId(fightId) || record.bossId !== p.id || record.swarmAmmoChunks) continue;
        const boss = state.entities && typeof state.entities.get === 'function'
          ? state.entities.get(record.bossId) : null;
        record.swarmAmmoChunks = spawnSwarmBossChunks(context, record, boss);
        // The run's first fallen champion is the milestone: the results plate turns the
        // stamp into the IRON MAW DOWN variant, and Keep going hands the run back.
        const run = state.run;
        const telemetry = run && (run.telemetry || (run.telemetry = {}));
        if (run && run.kind === 'survival' && run.ruleset === 'swarm' && telemetry.firstBossDown == null) {
          const encounter = requireCapitalBossEncounter(record.encounterId);
          telemetry.firstBossDown = {
            name: (encounter.score && encounter.score.name) || 'BOSS',
            line: (encounter.score && encounter.score.victory) || '',
            lesson: (encounter.score && encounter.score.lesson) || '',
            wave: run.wave,
            pending: true,
          };
          ctx.bus.emit('ui:pushScreen', { id: 'crucibleResults', source: 'swarm:bossMilestone' });
        }
      }
    });

    // The milestone plate acked on mount — consume the pending stamp so the run's real end
    // renders the ordinary record.
    listen('swarm:bossMilestoneAck', () => {
      const telemetry = context.state && context.state.run && context.state.run.telemetry;
      if (telemetry && telemetry.firstBossDown) telemetry.firstBossDown.pending = false;
    });
  };
  system.destroy = function () {
    for (const off of unsubs.splice(0)) off();
    if (typeof original.destroy === 'function') original.destroy.call(system);
    context = null;
  };
  return system;
}

/** Production port construction, shared by the registry singleton and per-runtime instances. */
export function createProductionCapitalBossEncounters() {
  return withSwarmBossRites(withLastArgument(createCapitalBossEncounters({
    observe(record, state, helpers) {
      if (isLastArgumentFight(record)) return observeLastArgument(record, state, helpers);
      const swarmFight = isSwarmFightId(record.fightId);
      const mission = swarmFight ? null : missionById(state, record.fightId);
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
      // A swarm champion has no mission row or sector to check — the RUN is its owner, and the
      // crucible is one room: live while the run is in an active wave and the roles hold.
      const missionLive = swarmFight
        ? swarmRunLive(state)
        : !!(mission && mission.status === 'active');
      const sectorLive = swarmFight
        ? true
        : !!(state.world
          && state.world.currentSectorId
          && state.world.currentSectorId === mission?.destSectorId);
      const notDocked = !(state.ui && (state.ui.docked === true || state.ui.dockedStationId != null));
      const inRange = capitalBossInRange(record, boss, target);
      const characterAdmitted = !swarmFight || !bossEntity?.data?.ironKraken || swarmPilotHasActed(state);
      return {
        boss,
        target,
        active: Boolean(missionLive && sectorLive && notDocked && boss && target && inRange && characterAdmitted),
        targets: target ? [target] : [],
      };
    },

    spawnWing(command, record, ctx) {
      const state = ctx.state;
      const boss = state.entities.get(record.bossId);
      if (!boss) throw new Error('Wing request reached an unresolved boss');
      if (isSwarmFightId(record.fightId)) {
        // The survival run is the owner: its wave's budget slot pays for the wing, its ledger
        // survives the tick, and each member is restamped as a run cohort exactly like a wave
        // materialization — arena contract, player hunt, morale/surrender immune.
        const wave = swarmWaveOfFightId(record.fightId);
        const ownerId = `${SURVIVAL_WAVE_OWNER_PREFIX}${wave}`;
        // The ledger's owner for a swarm fight is the capital system's own state root — the
        // run record itself rejects unknown keys (`validateRunState` whitelists), while this
        // store is already serialized as the fight ledger's home. `restore` drops it, which is
        // safe: a restored fight carries bound wing ids and the score never re-requests a wing.
        const store = state.capitalBossEncounters && typeof state.capitalBossEncounters === 'object'
          ? state.capitalBossEncounters : null;
        if (!store) throw new Error('Wing request reached no capital encounter store');
        const ledgers = (store.swarmWingLedgers ??= {});
        const ledger = (ledgers[record.fightId] ??= {});
        const budget = ctx.helpers && ctx.helpers.spawnBudget;
        const spawn = ctx.helpers && ctx.helpers.spawnEntity;
        if (typeof spawn !== 'function') throw new Error('No spawn port for a swarm wing');
        const memberCount = command && command.wing && Array.isArray(command.wing.members)
          ? command.wing.members.length : 0;
        const granted = budget && typeof budget.request === 'function'
          ? Math.max(0, budget.request(memberCount, ownerId) | 0)
          : memberCount;
        let issued = 0;
        const ids = spawnCapitalBossWing({
          command,
          record,
          boss,
          level: swarmLevel(wave),
          ledger,
          makeEnemySpawnSpec,
          spawnEntity: (spec) => {
            if (issued >= granted) return null;
            issued += 1;
            // Same cohort stamp the wave's own bodies carry — lawful hulls become arena
            // combatants, and every member hunts the pilot until the round resolves.
            const data = (spec.data = spec.data || {});
            data.ai = data.ai || {};
            data.ai.spawnContext = 'encounter';
            data.ai.forcePlayerTarget = true;
            data.ai.huntPlayer = true;
            data.ai.moraleImmune = true;
            data.ai.surrenderImmune = true;
            if (data.ai.lawful === true) {
              data.ai.lawful = false;
              data.ai.roe = 'weapons_free';
              data.ai.motive = 'arena_contract';
              data.ai.engagementTrigger = 'authorized_hostile_spawn';
            }
            data.runCohort = SURVIVAL_COHORT_TAG;
            data.runWave = wave;
            const entity = spawn(spec);
            const id = entity && entity.id;
            if (id != null && budget && typeof budget.bindEntity === 'function') {
              budget.bindEntity(id, ownerId);
            }
            return entity;
          },
        });
        // Wing members are real hostiles on the field — they must join the wave's cohort
        // accounting or a living screen would linger, uncounted, into the draft window.
        if (Array.isArray(ids) && ctx.bus && typeof ctx.bus.emit === 'function') {
          const landed = ids.filter((id) => id != null);
          if (landed.length > 0) {
            ctx.bus.emit('survivalWave:cohortJoined', { wave, ids: landed });
          }
        }
        return ids;
      }
      const mission = missionById(state, record.fightId);
      if (!mission) throw new Error('Wing request reached an unresolved mission/boss');
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
  })));
}

/** The production singleton registered by the browser registry and the Node factory table. */
export const capitalBossEncounters = createProductionCapitalBossEncounters();

export default capitalBossEncounters;
