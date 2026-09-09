// Depth Package D — contact grammar for Concord / Reach / Quiet.
// Pure data + pure readers. Consumes existing doctrine/bark/enemy/encounter seams
// so ordinary play differs by politics, not paint.

import { FACTION_DOCTRINES } from './factionDoctrines.js';
import { ENEMY_TYPES } from './enemies.js';
import { BARKS, barkFor } from './barks.js';

/**
 * Authored contact grammar profiles. Values align with live systems:
 * - doctrine: FACTION_DOCTRINES
 * - enemy ROE: ENEMY_TYPES[].aiDoctrine.roe / factionLawful
 * - demand/scan: encounter motives and pirate parley demand types
 * - barks: BARKS situations
 * - aftermath: heat/rep channels used by mission/wreck settlement
 */
export const FACTION_CONTACT_GRAMMAR = Object.freeze({
  faction_scn: Object.freeze({
    id: 'faction_scn',
    callsign: 'Concord',
    contactWord: 'CUSTOMS',
    firstFire: false,
    lawfulRoe: 'lawful_wanted_only',
    demandType: 'manifest_inspection',
    scanPolicy: 'always_on_wanted_or_contraband',
    lootLegality: 'restricted_military_salvage_fined',
    barkSituations: Object.freeze(['scan', 'warn', 'demand-cargo', 'patrol-greeting']),
    primaryBark: 'scan',
    aftermath: Object.freeze({
      repChannel: 'faction:repDelta',
      heatChannel: 'heat:wanted',
      paperwork: true,
      graffitiTone: 'filing',
    }),
    sampleLine: 'Concord Patrol. Stand by for routine transponder verification. Ref 44-C.',
  }),
  faction_reach: Object.freeze({
    id: 'faction_reach',
    callsign: 'Crimson Reach',
    contactWord: 'TOLL',
    firstFire: true,
    lawfulRoe: 'weapons_free',
    demandType: 'tithe',
    scanPolicy: 'weigh_slip_before_violence',
    lootLegality: 'stolen_goods_expected',
    barkSituations: Object.freeze(['scan', 'warn', 'demand-cargo', 'attack', 'taunt']),
    primaryBark: 'demand-cargo',
    aftermath: Object.freeze({
      repChannel: 'faction:repDelta',
      heatChannel: null,
      paperwork: false,
      graffitiTone: 'weigh_slip',
      aceReturn: true,
    }),
    sampleLine: 'Drop it all. We’re not asking twice, and we barely asked once.',
  }),
  faction_quiet: Object.freeze({
    id: 'faction_quiet',
    callsign: 'The Quiet',
    contactWord: 'GHOST',
    firstFire: true,
    lawfulRoe: 'weapons_free',
    demandType: 'none_or_blank_contract',
    scanPolicy: 'sensor_ghost_before_hail',
    lootLegality: 'off_book_unlogged',
    barkSituations: Object.freeze(['scan', 'warn', 'attack', 'taunt', 'patrol-greeting']),
    primaryBark: 'scan',
    aftermath: Object.freeze({
      repChannel: 'faction:repDelta',
      heatChannel: null,
      paperwork: false,
      graffitiTone: 'blank_ledger',
      blankNews: true,
    }),
    sampleLine: 'Pass. Say nothing.',
  }),
});

export const PRESSURE_FACTION_IDS = Object.freeze([
  'faction_scn',
  'faction_reach',
  'faction_quiet',
]);

export function contactGrammarFor(factionId) {
  return FACTION_CONTACT_GRAMMAR[factionId] || null;
}

/** Live doctrine + grammar snapshot used by tests and any future director. */
export function liveContactProfile(factionId, seed = 1) {
  const grammar = contactGrammarFor(factionId);
  const doctrine = FACTION_DOCTRINES[factionId] || null;
  if (!grammar || !doctrine) return null;
  const enemies = ENEMY_TYPES.filter((e) => e.factionId === factionId);
  const roes = [...new Set(enemies.map((e) => e.aiDoctrine?.roe).filter(Boolean))];
  const lawful = enemies.some((e) => e.factionLawful);
  const line = barkFor(factionId, grammar.primaryBark, () => (seed % 1000) / 1000);
  return {
    factionId,
    grammar,
    doctrine: {
      id: doctrine.id,
      firstFire: !!doctrine.firstFire,
      engagementRange: doctrine.engagementRange,
      pursuit: doctrine.pursuit,
      combatDoctrineId: doctrine.combatDoctrineId,
      destroyTarget: !!doctrine.destroyTarget,
    },
    enemyRoes: roes,
    hasLawfulEnemies: lawful,
    primaryBarkLine: line,
  };
}

export function pressureProfilesDiffer() {
  const profiles = PRESSURE_FACTION_IDS.map((id) => liveContactProfile(id, 7));
  if (profiles.some((p) => !p)) return false;
  const firstFires = new Set(profiles.map((p) => p.doctrine.firstFire));
  const demand = new Set(profiles.map((p) => p.grammar.demandType));
  const rangeLo = profiles.map((p) => p.doctrine.engagementRange[0]);
  return firstFires.size >= 2
    && demand.size === 3
    && Math.max(...rangeLo) - Math.min(...rangeLo) >= 100;
}

export default FACTION_CONTACT_GRAMMAR;
