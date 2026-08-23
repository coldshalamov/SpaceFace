// PQ-133.11 — Adventure migration seam.
//
// One game path: the only AttackSpec compiler is src/combat/attackSpec.js. This module collects
// fitted trait ids and hands them to that compiler. It never drafts, never scores, never writes
// run.modifiers onto a ship, and it ignores the run envelope unless a live Survival run is on.

import { compileAttackSpec, attackModifiersFromRun, normalizeModifierStacks } from '../combat/attackSpec.js';
import {
  CAUSAL_CHANNEL,
  addResolvedToDistribution,
  emptyCausalDistribution,
  resolvePayload,
} from '../combat/attackPayload.js';
import { ATTACK_TRAIT_BY_ID } from '../data/attackTraits.js';
import { MODULES } from '../data/modules.js';
import { WEAPONS } from '../data/weapons.js';
import { ADVENTURE_TRAIT_MAP, ADVENTURE_TRAIT_MAP_BY_ID } from '../data/adventureTraitMap.js';
import { ADVENTURE_ARENA_SITE_BY_ARENA, ADVENTURE_LIVE_ARENA_IDS } from '../data/adventureArenaSites.js';
import { ADVENTURE_ROLE_DOCTRINE_BY_ROLE } from '../data/adventureDoctrines.js';
import { ADVENTURE_COMBAT_LAB_SHORTCUT_BY_ID } from '../data/adventureCombatLab.js';
import { planLagrangeInstall, LAGRANGE_ARENA_ID } from './lagrangeCrucible.js';
import { planCinderInstall, CINDER_ARENA_ID } from './cinderSluiceArena.js';
import { planCryoInstall, CRYO_ARENA_ID } from './cryoDriftArena.js';
import { planStormInstall, STORM_ARENA_ID } from './stormLatticeArena.js';
import { planArenaInstall } from './survivalArena.js';

const MODULE_BY_ID = new Map(MODULES.map((def) => [def.id, def]));
const WEAPON_BY_ID = new Map(WEAPONS.map((def) => [def.id, def]));

/** The shared compiler. Tests assert this is the same function combat uses. */
export const SHARED_ATTACK_COMPILER = compileAttackSpec;

export function isSurvivalRunLive(run) {
  return !!(run && typeof run === 'object' && run.kind === 'survival' && run.phase && run.phase !== 'inactive');
}

function pushTrait(bag, id, rank) {
  if (typeof id !== 'string' || !id.startsWith('mod_')) return;
  if (!ATTACK_TRAIT_BY_ID[id]) return;
  const n = Number.isInteger(rank) && rank > 0 ? rank : 1;
  bag.push([id, n]);
}

function traitsFromDef(def, bag) {
  if (!def || !Array.isArray(def.attackTraits)) return;
  for (const entry of def.attackTraits) {
    if (typeof entry === 'string') pushTrait(bag, entry, 1);
    else if (Array.isArray(entry)) pushTrait(bag, entry[0], entry[1]);
    else if (entry && typeof entry === 'object') {
      pushTrait(bag, entry.id || entry.traitId, entry.rank);
    }
  }
}

function defById(id) {
  return MODULE_BY_ID.get(id) || WEAPON_BY_ID.get(id) || null;
}

/**
 * Trait stacks from a long-lived fit. Never reads state.run.
 */
export function attackModifiersFromFit(entity, weapon) {
  const bag = [];
  const fittings = entity && entity.data && Array.isArray(entity.data.fittings)
    ? entity.data.fittings
    : (Array.isArray(entity && entity.fittings) ? entity.fittings : []);
  const seen = new Set();
  for (let i = 0; i < fittings.length; i++) {
    const id = fittings[i];
    if (typeof id !== 'string' || !id) continue;
    seen.add(id);
    const def = defById(id);
    if (ATTACK_TRAIT_BY_ID[id]) {
      const rank = def && Number.isInteger(def.attackTraitRank) ? def.attackTraitRank : 1;
      pushTrait(bag, id, rank);
      continue;
    }
    traitsFromDef(def, bag);
  }
  const weaponId = weapon && (weapon.id || weapon.defId);
  if (typeof weaponId === 'string' && !seen.has(weaponId)) {
    traitsFromDef(WEAPON_BY_ID.get(weaponId) || (weapon && weapon.attackTraits ? weapon : null), bag);
  } else if (!weaponId && weapon && Array.isArray(weapon.attackTraits) && !seen.size) {
    traitsFromDef(weapon, bag);
  }
  return normalizeModifierStacks(bag).stacks;
}

/**
 * Adventure: fitted equipment only.
 * Survival: fitted equipment plus the run draft note, so a ship you brought keeps its identity.
 */
export function collectAttackModifiers(state, entity, weapon) {
  const fitted = attackModifiersFromFit(entity, weapon);
  if (!isSurvivalRunLive(state && state.run)) return fitted;
  const fromRun = attackModifiersFromRun(state.run);
  const merged = [];
  for (let i = 0; i < fitted.length; i++) merged.push(fitted[i]);
  for (let i = 0; i < fromRun.length; i++) merged.push(fromRun[i]);
  return normalizeModifierStacks(merged).stacks;
}

export function compileFittedAttackSpec(state, entity, weaponId) {
  const weapon = typeof weaponId === 'string' ? WEAPON_BY_ID.get(weaponId) : weaponId;
  const modifiers = collectAttackModifiers(state, entity, weapon);
  return SHARED_ATTACK_COMPILER({ weapon: weapon || weaponId, modifiers });
}

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

export function causalKindsFromSpec(spec) {
  const kinds = [];
  if (!spec || typeof spec !== 'object') return kinds;
  const root = spec.emitter && spec.emitter.rootCount > 1;
  const bank = spec.trajectory && spec.trajectory.bounces > 0;
  const chain = spec.propagation && spec.propagation.chain && spec.propagation.chain.count > 0;
  const split = spec.propagation && spec.propagation.split && spec.propagation.split.count > 0;
  const pierce = spec.propagation && spec.propagation.pierce > 0;
  const orbit = spec.propagation && spec.propagation.orbit && spec.propagation.orbit.count > 0;
  const payload = Array.isArray(spec.payload) ? spec.payload : [];
  let status = false;
  for (let i = 0; i < payload.length; i++) {
    if (payload[i] && payload[i].kind === 'status') status = true;
  }
  if (root) kinds.push('VOLLEY');
  if (bank) kinds.push('BANK');
  if (chain) kinds.push('CHAIN');
  if (split) kinds.push('SPLIT');
  if (pierce) kinds.push('PIERCE');
  if (orbit) kinds.push('ORBIT');
  if (status) kinds.push('STATUS');
  if (kinds.length === 0) kinds.push('DIRECT');
  return kinds;
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
