// PQ-133.11 — Adventure migration seam.
//
// One game path: the only AttackSpec compiler is src/combat/attackSpec.js. This module collects
// fitted trait ids and hands them to that compiler. It never drafts, never scores, never writes
// run.modifiers onto a ship, and it ignores the run envelope unless a live Survival run is on.

import { attackModifiersFromRun } from '../combat/attackSpec.js';
import { collectAttackModifiers } from '../combat/adventureAttackReaders.js';
export { SHARED_ATTACK_COMPILER, isSurvivalRunLive, attackModifiersFromFit, collectAttackModifiers, compileFittedAttackSpec, causalKindsFromSpec } from '../combat/adventureAttackReaders.js';
import {
  CAUSAL_CHANNEL,
  addResolvedToDistribution,
  emptyCausalDistribution,
  resolvePayload,
} from '../combat/attackPayload.js';
import { ADVENTURE_TRAIT_MAP, ADVENTURE_TRAIT_MAP_BY_ID } from '../data/adventureTraitMap.js';
import { ADVENTURE_ARENA_SITE_BY_ARENA, ADVENTURE_LIVE_ARENA_IDS } from '../data/adventureArenaSites.js';
import { ADVENTURE_ROLE_DOCTRINE_BY_ROLE } from '../data/adventureDoctrines.js';
import { ADVENTURE_COMBAT_LAB_SHORTCUT_BY_ID } from '../data/adventureCombatLab.js';
import { planLagrangeInstall, LAGRANGE_ARENA_ID } from './lagrangeCrucible.js';
import { planCinderInstall, CINDER_ARENA_ID } from './cinderSluiceArena.js';
import { planCryoInstall, CRYO_ARENA_ID } from './cryoDriftArena.js';
import { planStormInstall, STORM_ARENA_ID } from './stormLatticeArena.js';
import { planArenaInstall } from './survivalArena.js';

export function fitFingerprint(fittings) {
  const list = Array.isArray(fittings) ? fittings : [];
  const out = [];
  for (let i = 0; i < list.length; i++) out.push(list[i] == null ? '' : String(list[i]));
  return out.join('|');
}

export function snapshotShipIdentity(entity) {
  const data = entity && entity.data ? entity.data : entity;
  const fittings = data && Array.isArray(data.fittings) ? data.fittings.slice() : [];
  return Object.freeze({
    defId: data && data.defId ? data.defId : null,
    fingerprint: fitFingerprint(fittings),
    fittings: Object.freeze(fittings),
  });
}

export function shipIdentityUnchanged(before, after) {
  if (!before || !after) return false;
  return before.fingerprint === after.fingerprint && before.defId === after.defId;
}

/** Run-economy handles Adventure must never consult. */
export const RUN_ECONOMY_KEYS = Object.freeze(['draft', 'reroll', 'score', 'wave', 'waveIndex']);

export function adventureRunEconomyLeak(state) {
  const leaks = [];
  const run = state && state.run;
  if (!run || typeof run !== 'object') return leaks;
  if (run.kind !== 'adventure' && run.kind !== 'lab') return leaks;
  const fitted = collectAttackModifiers(state, { data: { fittings: [] } }, { id: 'wpn_pulse_laser_s' });
  if (fitted.length > 0) leaks.push('empty_fit_inherited_run_modifiers');
  if (run.kind === 'adventure' && Array.isArray(run.modifiers) && run.modifiers.length > 0) {
    const viaRun = attackModifiersFromRun(run);
    if (viaRun.length > 0 && fitted.length === 0) {
      // collectAttackModifiers must have ignored them
    }
  }
  return leaks;
}

export function causalDistributionForSpec(spec, contacts) {
  const dist = emptyCausalDistribution();
  const list = Array.isArray(contacts) && contacts.length
    ? contacts
    : [{ generation: 0, hasBounced: false }];
  for (let i = 0; i < list.length; i++) {
    addResolvedToDistribution(dist, resolvePayload(spec, list[i]));
  }
  return dist;
}

/**
 * Physical reward: world credits from bounty, plus a causal receipt. Never a run score.
 */
export function physicalRewardForKill(input = {}) {
  const bounty = Number.isFinite(input.bountyCr) ? Math.max(0, Math.round(input.bountyCr)) : 0;
  const tags = Array.isArray(input.causalTags) ? input.causalTags.slice() : [];
  return Object.freeze({
    credits: bounty,
    runScore: 0,
    wave: null,
    causalTags: Object.freeze(tags),
  });
}

export function lawForSite(arenaId, at) {
  const site = ADVENTURE_ARENA_SITE_BY_ARENA[arenaId];
  const center = at || (site && site.center) || { x: 0, z: 0 };
  const phase = site && site.standingPhase ? site.standingPhase : 'idle';
  if (arenaId === LAGRANGE_ARENA_ID) {
    return planLagrangeInstall({ arenaPhase: phase, at: center, lane: { x: 1, z: 0 } });
  }
  if (arenaId === CINDER_ARENA_ID) {
    return planCinderInstall({ arenaPhase: phase, at: center, lane: { x: 1, z: 0 } });
  }
  if (arenaId === CRYO_ARENA_ID) {
    return planCryoInstall({ arenaPhase: phase, at: center, lane: { x: 1, z: 0 } });
  }
  if (arenaId === STORM_ARENA_ID) {
    return planStormInstall({ arenaPhase: phase, at: center, lane: { x: 1, z: 0 }, simTime: 0 });
  }
  return planArenaInstall({
    arenaId: arenaId || 'helios_core',
    arenaPhase: phase,
    wave: 1,
    seed: 1,
    anchor: center,
  });
}

export function collateralForFit(traitId, site) {
  const row = ADVENTURE_TRAIT_MAP_BY_ID[traitId];
  if (!row || !row.collateral) return null;
  const populated = site && (site.living || []).includes('faction battles');
  return Object.freeze({
    legality: row.legality || 'legal',
    collateral: row.collateral,
    recklessInPopulated: !!(populated && row.collateral.populatedSites === 'reckless'),
  });
}

export function doctrineForWaveRole(role) {
  return ADVENTURE_ROLE_DOCTRINE_BY_ROLE[role] || null;
}

export function developerShortcut(id) {
  const row = ADVENTURE_COMBAT_LAB_SHORTCUT_BY_ID[id];
  if (!row || row.developerOnly !== true) return null;
  return row;
}

export function mappingTable() {
  return ADVENTURE_TRAIT_MAP.map((row) => ({
    crucible: row.traitId,
    adventure: row.fittedId,
    form: row.form,
    acquired: row.acquisition.slice(),
  }));
}

export { ADVENTURE_LIVE_ARENA_IDS, CAUSAL_CHANNEL };
