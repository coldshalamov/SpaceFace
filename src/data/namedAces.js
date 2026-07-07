// BP-13/B10 Named Crews & Aces.
//
// Pure roster + deterministic readers. Runtime memory lives in systems/aceMemory.js.
import { NAMED_CAPTAINS } from './encounters.js';
import { hash32 } from '../core/rng.js';

const RETURN_MIN_S = 360;
const RETURN_SPAN_S = 420;
export const PIRATE_PROMOTION_MAX_TIER = 3;

const CORE_ROSTER = Object.freeze([
  Object.freeze({
    id: 'ace_yara_no_cut',
    name: 'Yara No-Cut',
    crew: 'Red Latch Crew',
    factionId: 'faction_reach',
    gimmickTag: 'tether-cutter',
    returnArchetype: 'corsair_raider',
    escortArchetype: 'wasp_swarmer',
    baseReturnLevel: 4,
    signatureBark: 'YARA NO-CUT: cargo comes loose, or hull plates do.',
  }),
  Object.freeze({
    id: 'ace_toll_saint_venn',
    name: 'Toll Saint Venn',
    crew: 'Sker Hooks',
    factionId: 'faction_reach',
    gimmickTag: 'toll-lancer',
    returnArchetype: 'lancer_sniper',
    escortArchetype: 'corsair_raider',
    baseReturnLevel: 5,
    signatureBark: 'SKER HOOKS: Saint Venn counts the lane and names the fee.',
  }),
  Object.freeze({
    id: 'ace_mako_broken_ring',
    name: 'Mako of the Broken Ring',
    crew: 'The Empty Ledger',
    factionId: 'faction_reach',
    gimmickTag: 'swarm-screen',
    returnArchetype: 'reaver_pirate',
    escortArchetype: 'wasp_swarmer',
    baseReturnLevel: 4,
    signatureBark: 'Broken Ring: Mako writes debts in engine smoke.',
  }),
]);

export const NAMED_ACE_IDS = Object.freeze(CORE_ROSTER.map((ace) => ace.id));
export const NAMED_ACES = Object.freeze(Object.fromEntries(CORE_ROSTER.map((ace) => [ace.id, ace])));

const CAPTAIN_ALIASES = Object.freeze(NAMED_CAPTAINS.map((cap) => Object.freeze({
  id: cap.id,
  name: cap.name,
  crew: 'Known Hunter',
  factionId: 'faction_reach',
  gimmickTag: cap.gimmick || 'hunter',
  returnArchetype: cap.archetype || 'corsair_raider',
  escortArchetype: cap.escort && cap.escort.archetypes && cap.escort.archetypes[0] || 'reaver_pirate',
  baseReturnLevel: 4 + (cap.levelBonus || 1),
  signatureBark: `${cap.name}: the old grudge has your transponder.`,
  encounterCaptain: true,
})));

const ALL_KNOWN_ACES = Object.freeze([...CORE_ROSTER, ...CAPTAIN_ALIASES]);
const ACE_BY_ID = new Map(ALL_KNOWN_ACES.map((ace) => [ace.id, ace]));
const ACE_BY_NAME = new Map(ALL_KNOWN_ACES.map((ace) => [normalizeName(ace.name), ace]));

export function aceById(id) {
  return ACE_BY_ID.get(String(id || '')) || null;
}

export function aceByName(name) {
  return ACE_BY_NAME.get(normalizeName(name)) || null;
}

export function aceFromText(text) {
  const haystack = normalizeName(text);
  if (!haystack) return null;
  for (const ace of ALL_KNOWN_ACES) {
    if (haystack.includes(normalizeName(ace.name))) return ace;
  }
  return null;
}

export function knownAces() {
  return ALL_KNOWN_ACES.slice();
}

export function newsForAceTransition(ace, transition) {
  if (!ace) return '';
  if (transition === 'fled') {
    return `${ace.name} fled ${ace.crew} contact; lane chatter says a bigger crew is forming.`;
  }
  if (transition === 'defeated') {
    return `${ace.name} defeated; ${ace.crew} loses its captain in the outer lanes.`;
  }
  if (transition === 'encountered') {
    return `${ace.name} sighted with ${ace.crew}.`;
  }
  return `${ace.name} moves through the pirate bands.`;
}

export function returnPlanForAce(ace, seed, now = 0) {
  const id = ace && ace.id || 'unknown';
  const returnSeed = hash32(seed == null ? 0 : seed, 'aceMemory', id, 'return');
  const returnAfterS = RETURN_MIN_S + (returnSeed % RETURN_SPAN_S);
  return {
    returnAt: Math.round((Number(now) || 0) + returnAfterS),
    returnAfterS,
    returnSeed,
  };
}

export function returnLevelBandsForAce(ace, returnTier = 1) {
  const base = Math.max(1, (ace && ace.baseReturnLevel) || 4);
  const tier = Math.max(1, Math.min(PIRATE_PROMOTION_MAX_TIER, returnTier | 0));
  const previousLo = base + tier - 1;
  const currentLo = base + tier;
  return {
    previous: Object.freeze([previousLo, previousLo + 2]),
    current: Object.freeze([currentLo, currentLo + 2]),
  };
}

export function returnCrewForAce(ace, returnTier = 1) {
  const tier = Math.max(1, Math.min(PIRATE_PROMOTION_MAX_TIER, returnTier | 0));
  const bands = returnLevelBandsForAce(ace, tier);
  const bossArchetype = ace && ace.returnArchetype || 'corsair_raider';
  const escortArchetype = ace && ace.escortArchetype || 'wasp_swarmer';
  const escorts = 1 + Math.min(2, tier);
  const out = [{
    role: 'boss',
    archetype: bossArchetype,
    level: bands.current[1],
  }];
  for (let i = 0; i < escorts; i++) {
    out.push({
      role: 'escort',
      archetype: escortArchetype,
      level: bands.current[0],
    });
  }
  return Object.freeze(out.map((ship) => Object.freeze(ship)));
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}
