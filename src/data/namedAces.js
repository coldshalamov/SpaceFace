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

// S3 Reach culture aces extend aceMemory through a separate roster so the original B10 export
// remains exactly three entries. Each culture contributes one escalation-capable returning crew.
const REACH_CULTURE_ROSTER = Object.freeze([
  Object.freeze({
    id: 'ace_maw_rake_veyra',
    name: 'Rake Veyra',
    crew: 'The Red Wake',
    factionId: 'faction_reach',
    cultureId: 'maw',
    gimmickTag: 'slash-and-run',
    returnArchetype: 'reaver_pirate',
    escortArchetype: 'wasp_swarmer',
    baseReturnLevel: 5,
    signatureBark: 'THE RED WAKE: count the painted edge. Every hand is a ship that failed to turn.',
  }),
  Object.freeze({
    id: 'ace_rust_lord_orro',
    name: 'Boiler-King Orro',
    crew: 'The Nine Kettles',
    factionId: 'faction_reach',
    cultureId: 'rust-lords',
    gimmickTag: 'tether-scrapline',
    returnArchetype: 'corsair_raider',
    escortArchetype: 'reaver_pirate',
    baseReturnLevel: 5,
    signatureBark: 'NINE KETTLES: nothing leaves the field before Orro weighs the scrap.',
  }),
  Object.freeze({
    id: 'ace_drift_king_iona',
    name: 'Iona False-Face',
    crew: 'The Gilt Masks',
    factionId: 'faction_reach',
    cultureId: 'drift-kings',
    gimmickTag: 'masked-disengager',
    returnArchetype: 'lancer_sniper',
    escortArchetype: 'corsair_raider',
    baseReturnLevel: 5,
    signatureBark: 'GILT MASKS: a courteous distance, captain. We only need the ship intact.',
  }),
]);

// Variety aces (append-only). Kept off CORE_ROSTER so B10 NAMED_ACE_IDS stays three entries.
const VARIETY_ROSTER = Object.freeze([
  Object.freeze({
    id: 'ace_jex_wake_salt',
    name: 'Jex Wake-Salt',
    crew: 'The Salt Wake',
    factionId: 'faction_reach',
    gimmickTag: 'wake-mines',
    returnArchetype: 'mine_layer_jackal',
    escortArchetype: 'pd_screen_escort',
    baseReturnLevel: 4,
    signatureBark: 'SALT WAKE: leave the trail. We already seeded it.',
  }),
  Object.freeze({
    id: 'ace_noll_curtain',
    name: 'Noll of the Curtain',
    crew: 'Curtain Company',
    factionId: 'faction_reach',
    gimmickTag: 'pd-curtain',
    returnArchetype: 'pd_screen_escort',
    escortArchetype: 'corsair_raider',
    baseReturnLevel: 5,
    signatureBark: 'CURTAIN COMPANY: your missiles are a polite request. Denied.',
  }),
  Object.freeze({
    id: 'ace_ves_no_face',
    name: 'Ves No-Face',
    crew: 'Blank Ledger',
    factionId: 'faction_quiet',
    gimmickTag: 'sensor-ghost',
    returnArchetype: 'quiet_ghost',
    escortArchetype: 'lancer_sniper',
    baseReturnLevel: 5,
    signatureBark: 'BLANK LEDGER: you never saw this ship. File that.',
  }),
  Object.freeze({
    id: 'ace_sere_pattern',
    name: 'Sere of the Pattern',
    crew: 'Third Refrains',
    factionId: 'faction_choir',
    gimmickTag: 'slash-and-run',
    returnArchetype: 'choir_zealot',
    escortArchetype: 'choir_zealot',
    baseReturnLevel: 4,
    signatureBark: 'THIRD REFRAINS: the Pattern names you. Answer in fire.',
  }),
]);

export const NAMED_ACE_IDS = Object.freeze(CORE_ROSTER.map((ace) => ace.id));
export const NAMED_ACES = Object.freeze(Object.fromEntries(CORE_ROSTER.map((ace) => [ace.id, ace])));
export const REACH_CULTURE_ACE_IDS = Object.freeze(REACH_CULTURE_ROSTER.map((ace) => ace.id));
export const REACH_CULTURE_ACES = Object.freeze(Object.fromEntries(
  REACH_CULTURE_ROSTER.map((ace) => [ace.id, ace]),
));
export const VARIETY_ACE_IDS = Object.freeze(VARIETY_ROSTER.map((ace) => ace.id));
export const VARIETY_ACES = Object.freeze(Object.fromEntries(
  VARIETY_ROSTER.map((ace) => [ace.id, ace]),
));

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

const ALL_KNOWN_ACES = Object.freeze([...CORE_ROSTER, ...REACH_CULTURE_ROSTER, ...VARIETY_ROSTER, ...CAPTAIN_ALIASES]);
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
