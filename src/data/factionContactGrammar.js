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
  faction_dmc: Object.freeze({
    id: 'faction_dmc',
    callsign: 'Drift Collective',
    contactWord: 'YARD',
    firstFire: false,
    lawfulRoe: 'defensive_only',
    demandType: 'claim_dispute',
    scanPolicy: 'claim_survey_before_hail',
    lootLegality: 'ore_and_scrap_only',
    barkSituations: Object.freeze(['scan', 'warn', 'demand-cargo', 'patrol-greeting']),
    primaryBark: 'patrol-greeting',
    aftermath: Object.freeze({
      repChannel: 'faction:repDelta',
      heatChannel: null,
      paperwork: false,
      graffitiTone: 'yard_tally',
    }),
    sampleLine: 'Ceres yard hail: keep your distance from the refinery docks, shift is running hot.',
  }),
  faction_mts: Object.freeze({
    id: 'faction_mts',
    callsign: 'Meridian Trade',
    contactWord: 'INVOICE',
    firstFire: false,
    lawfulRoe: 'defensive_only',
    demandType: 'tariff_inspection',
    scanPolicy: 'ledger_audit_before_hail',
    lootLegality: 'bonded_cargo_only',
    barkSituations: Object.freeze(['scan', 'warn', 'demand-cargo', 'patrol-greeting']),
    primaryBark: 'patrol-greeting',
    aftermath: Object.freeze({
      repChannel: 'faction:repDelta',
      heatChannel: null,
      paperwork: true,
      graffitiTone: 'invoice_ledger',
    }),
    sampleLine: 'Tethys exchange hail: present bill of lading or settle the transit tariff at the buoy.',
  }),
  faction_choir: Object.freeze({
    id: 'faction_choir',
    callsign: 'The Choir',
    contactWord: 'PATTERN',
    firstFire: true,
    lawfulRoe: 'weapons_free',
    demandType: 'tithe',
    scanPolicy: 'pattern_read_before_hail',
    lootLegality: 'consecrated_hold',
    barkSituations: Object.freeze(['scan', 'warn', 'demand-cargo', 'attack', 'patrol-greeting']),
    primaryBark: 'attack',
    aftermath: Object.freeze({
      repChannel: 'faction:repDelta',
      heatChannel: null,
      paperwork: false,
      graffitiTone: 'pattern_interval',
    }),
    sampleLine: 'The seventh interval. Your correction is already notated.',
  }),
  faction_archive: Object.freeze({
    id: 'faction_archive',
    callsign: 'The Archive',
    contactWord: 'SHELF',
    firstFire: false,
    lawfulRoe: 'defensive_only',
    demandType: 'index_recovery',
    scanPolicy: 'catalogue_read_before_hail',
    lootLegality: 'recovered_artifacts_only',
    barkSituations: Object.freeze(['scan', 'warn', 'demand-cargo', 'flee', 'patrol-greeting']),
    primaryBark: 'scan',
    aftermath: Object.freeze({
      repChannel: 'faction:repDelta',
      heatChannel: null,
      paperwork: true,
      graffitiTone: 'catalogue_entry',
    }),
    sampleLine: 'The reading room sees you. Your file opens itself.',
  }),
  faction_fulfillment: Object.freeze({
    id: 'faction_fulfillment',
    callsign: 'The Fulfillment',
    contactWord: 'ROUTE',
    firstFire: false,
    lawfulRoe: 'defensive_only',
    demandType: 'manifest_reconciliation',
    scanPolicy: 'waypoint_sequence_sweep',
    lootLegality: 'seized_as_routing_outcome',
    barkSituations: Object.freeze(['scan', 'warn', 'demand-cargo', 'attack', 'patrol-greeting']),
    primaryBark: 'demand-cargo',
    aftermath: Object.freeze({
      repChannel: 'faction:repDelta',
      heatChannel: null,
      paperwork: true,
      graffitiTone: 'waypoint_stamp',
    }),
    sampleLine: 'Administrative boarding is now a routing event. Hold position.',
  }),
  faction_pitborn: Object.freeze({
    id: 'faction_pitborn',
    callsign: 'The Pitborn',
    contactWord: 'FENCE',
    firstFire: true,
    lawfulRoe: 'weapons_free',
    demandType: 'yard_tax',
    scanPolicy: 'appraisal_before_hail',
    lootLegality: 'scrap_everything',
    barkSituations: Object.freeze(['scan', 'warn', 'demand-cargo', 'attack', 'taunt']),
    primaryBark: 'demand-cargo',
    aftermath: Object.freeze({
      repChannel: 'faction:repDelta',
      heatChannel: null,
      paperwork: false,
      graffitiTone: 'fence_stamp',
    }),
    sampleLine: 'Fence takes it all — the hold, not the hull. Your choice.',
  }),
  faction_understory: Object.freeze({
    id: 'faction_understory',
    callsign: 'The Understory',
    contactWord: 'GARDEN',
    firstFire: false,
    lawfulRoe: 'defensive_only',
    demandType: 'compost_tithe',
    scanPolicy: 'wreck_light_read',
    lootLegality: 'the_dead_give_freely',
    barkSituations: Object.freeze(['scan', 'warn', 'demand-cargo', 'attack', 'patrol-greeting']),
    primaryBark: 'scan',
    aftermath: Object.freeze({
      repChannel: 'faction:repDelta',
      heatChannel: null,
      paperwork: false,
      graffitiTone: 'bloom_mark',
    }),
    sampleLine: 'You drift over a garden. We read what you will leave.',
  }),
  faction_verge_layers: Object.freeze({
    id: 'faction_verge_layers',
    callsign: 'Verge-Layer',
    contactWord: 'PRISM',
    firstFire: false,
    lawfulRoe: 'defensive_only',
    demandType: 'closure_audit',
    scanPolicy: 'lattice_inscription',
    lootLegality: 'rendered_for_record',
    barkSituations: Object.freeze(['scan', 'warn', 'demand-cargo', 'flee', 'patrol-greeting']),
    primaryBark: 'scan',
    aftermath: Object.freeze({
      repChannel: 'faction:repDelta',
      heatChannel: null,
      paperwork: true,
      graffitiTone: 'prism_inscription',
    }),
    sampleLine: 'The prism observes. Transit logged in the standing ledger.',
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
