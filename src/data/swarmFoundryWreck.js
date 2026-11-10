import { swarmFoundryRound } from './swarmFoundryScore.js';

// One of the first champion's existing fragments is hand-sized ammunition. The
// other fragments keep their large cover bodies. This is not an extra drop.
export const FOUNDRY_MAW_OFFCUT = Object.freeze({ radius: 7, mass: 35, throughWave: 6 });

export function foundryWreckRound(run) {
  if (run?.kind !== 'survival' || run.ruleset !== 'swarm'
    || !['active', 'cleanup', 'draft', 'refit', 'wave_intro'].includes(run.phase)) return null;
  return swarmFoundryRound({ arenaId: run.arenaId, wave: run.wave,
    mutators: run.arenaMutators, circuitRound: run.telemetry?.circuit });
}

// The current run's death receipt names one original life. The encounter record
// itself is intentionally detached by survivalWave when round six is planned.
// Copied metadata, a recycled id, a retry, and a later round cannot extend it.
export function isFoundryWreckKept(state, entity) {
  const run = state?.run, stamp = run?.telemetry?.foundryMawOffcut;
  if (!stamp || !foundryWreckRound(run) || run.wave < 5 || run.wave > FOUNDRY_MAW_OFFCUT.throughWave
    || !entity || entity.alive === false || entity.type !== 'wreck'
    || entity.data?.swarmBossChunk !== true || entity.data?.physicalRole !== 'throw_mass'
    || entity.id !== stamp.id || !Number.isInteger(stamp.generation)
    || entity.occupantGeneration !== stamp.generation
    || state.entities?.get?.(entity.id) !== entity) return false;
  return /^swarm:w5(?::|$)/.test(stamp.fightId)
    && entity.data.capitalBossEncounterId === 'capital_boss_hulk'
    && entity.data.capitalBossActorKey === `${stamp.fightId}/boss_chunk/0`;
}
