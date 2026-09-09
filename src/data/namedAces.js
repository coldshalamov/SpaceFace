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
  Object.freeze({
    // Named Drift defender: the worker voice gets a face, not just the Reach lane-kingpins.
    // Voss's suspended claim (narrative.js pers_voss_suspended) gets a body behind it.
    id: 'ace_voss_shaft_seven',
    name: 'Voss of Shaft Seven',
    crew: 'The Last Two',
    factionId: 'faction_dmc',
    gimmickTag: 'belt-claimer',
    returnArchetype: 'bruiser_brawler',
    escortArchetype: 'bruiser_brawler',
    baseReturnLevel: 4,
    signatureBark: 'THE LAST TWO: Shaft Seven filed us as moisture. We file you as salvage.',
  }),
  Object.freeze({
    // Reach ace whose arithmetic is the testimony: counts hulls, names the short one.
    id: 'ace_drell_short_fall',
    name: 'Drell Short-Fall',
    crew: 'The Weigh-Slip Open',
    factionId: 'faction_reach',
    gimmickTag: 'tether-cutter',
    returnArchetype: 'corsair_raider',
    escortArchetype: 'wasp_swarmer',
    baseReturnLevel: 5,
    signatureBark: 'WEIGH-SLIP OPEN: four hulls this cycle. You are the one that falls short.',
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

export const ACE_KILL_STYLES = Object.freeze(['fling', 'gun', 'rock']);
export const ACE_STYLE_ESCALATE_AT = 3;

// Stunt-grammar trick ids that name a fling-kill or a rock-kill. Gun is the residual.
export const ACE_FLING_TRICKS = Object.freeze([
  'tow_kill', 'clothesline', 'collateral', 'wrecking_ball', 'well_golf',
  'bolas', 'dead_mans_mass', 'shove_bowling',
]);
export const ACE_ROCK_TRICKS = Object.freeze(['rock_discovery']);

const FLING_TRICK_SET = new Set(ACE_FLING_TRICKS);
const ROCK_TRICK_SET = new Set(ACE_ROCK_TRICKS);
const STYLE_SET = new Set(ACE_KILL_STYLES);

// Kit and behaviour against the habit — never a +HP bump on the same hull.
export const ACE_STYLE_COUNTERS = Object.freeze({
  fling: Object.freeze({
    style: 'fling',
    act: 'fling',
    bossArchetype: 'tether_control_raider',
    escortArchetype: 'field_anchor_controller',
    gimmickTag: 'tether-cutter',
    doctrineId: 'tether_control_raider',
    capabilities: Object.freeze(['counter_tether_cut', 'tug']),
    weapons: Object.freeze(['wpn_momentum_sink_s']),
    barkAct: 'flung',
  }),
  gun: Object.freeze({
    style: 'gun',
    act: 'gun',
    bossArchetype: 'bruiser_brawler',
    escortArchetype: 'pd_screen_escort',
    gimmickTag: 'shield-turtle',
    doctrineId: 'brawler_commit',
    capabilities: Object.freeze(['disable', 'ranged']),
    weapons: Object.freeze([]),
    barkAct: 'gunned',
  }),
  rock: Object.freeze({
    style: 'rock',
    act: 'rock',
    bossArchetype: 'lancer_sniper',
    escortArchetype: 'quiet_ghost',
    gimmickTag: 'masked-disengager',
    doctrineId: 'ranged_disengager',
    capabilities: Object.freeze(['ranged']),
    weapons: Object.freeze([]),
    barkAct: 'rocked',
  }),
});

const STYLE_BARK = Object.freeze({
  fling: '{name}: three times you flung our hulls. We brought line-cutters.',
  gun: '{name}: you gunned three of ours. We came in armour.',
  rock: '{name}: three times you threw us into the rocks. We stay off the stones.',
});

export function isAceKillStyle(value) {
  return typeof value === 'string' && STYLE_SET.has(value);
}

export function styleCounterFor(style) {
  return isAceKillStyle(style) ? ACE_STYLE_COUNTERS[style] : null;
}

export function styleLoadoutForAce(ace, style = null) {
  const counter = styleCounterFor(style);
  return Object.freeze({
    style: counter ? counter.style : null,
    bossArchetype: counter ? counter.bossArchetype : (ace && ace.returnArchetype || 'corsair_raider'),
    escortArchetype: counter ? counter.escortArchetype : (ace && ace.escortArchetype || 'wasp_swarmer'),
    gimmickTag: counter ? counter.gimmickTag : (ace && ace.gimmickTag || 'ace'),
    doctrineId: counter ? counter.doctrineId : null,
    capabilities: counter ? counter.capabilities : Object.freeze([]),
    weapons: counter ? counter.weapons : Object.freeze([]),
    barkAct: counter ? counter.barkAct : null,
  });
}

export function styleEscalationBark(ace, style) {
  const template = isAceKillStyle(style) ? STYLE_BARK[style] : '';
  if (!template) return '';
  const name = ace && ace.name ? ace.name : 'Ace';
  return template.replace(/\{name\}/g, name);
}

export function escalatedStyleFromMemory(memory, ace) {
  if (!ace) return null;
  const rec = memory && memory[ace.id];
  if (rec && isAceKillStyle(rec.escalatedStyle)) return rec.escalatedStyle;
  const factionId = ace.factionId;
  const row = memory && memory.playerStyle && memory.playerStyle.factions
    ? memory.playerStyle.factions[factionId]
    : null;
  if (row && isAceKillStyle(row.escalated)) return row.escalated;
  const global = memory && memory.playerStyle && memory.playerStyle.escalatedStyle;
  return isAceKillStyle(global) ? global : null;
}

export function aceKillStyleFromHints(hints = {}) {
  if (isAceKillStyle(hints.style) || isAceKillStyle(hints.killStyle) || isAceKillStyle(hints.explicit)) {
    return hints.style || hints.killStyle || hints.explicit;
  }
  const trickId = typeof hints.trickId === 'string' ? hints.trickId : '';
  if (ROCK_TRICK_SET.has(trickId)) return 'rock';
  if (FLING_TRICK_SET.has(trickId)) return 'fling';
  const cause = typeof hints.cause === 'string' ? hints.cause : '';
  const surface = typeof hints.surface === 'string' ? hints.surface : '';
  if (cause === 'terrain_collision' || surface === 'terrain') return 'rock';
  if (hints.flung === true || cause === 'massline' || hints.lastFlung === true) return 'fling';
  return 'gun';
}

export function returnCrewForAce(ace, returnTier = 1, style = null) {
  const tier = Math.max(1, Math.min(PIRATE_PROMOTION_MAX_TIER, returnTier | 0));
  const bands = returnLevelBandsForAce(ace, tier);
  const loadout = styleLoadoutForAce(ace, style);
  const escorts = 1 + Math.min(2, tier);
  const out = [{
    role: 'boss',
    archetype: loadout.bossArchetype,
    level: bands.current[1],
    style: loadout.style,
    gimmickTag: loadout.gimmickTag,
  }];
  for (let i = 0; i < escorts; i++) {
    out.push({
      role: 'escort',
      archetype: loadout.escortArchetype,
      level: bands.current[0],
      style: loadout.style,
      gimmickTag: loadout.gimmickTag,
    });
  }
  return Object.freeze(out.map((ship) => Object.freeze(ship)));
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}
