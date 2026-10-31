/** Persistent named captains (the seed roster). State lives in state.encounterDirector.named:
 *  { [id]: { alive, tier, escapes, kills, lastSeenSector } } — saved, migration-safe. Escalation is
 *  COMPOSITION (escort +1 per tier), never +HP%. Gimmick = an existing gameplay verb via archetype. */
export const NAMED_CAPTAINS = Object.freeze([
  Object.freeze({
    id: 'cap_sable_iask', name: 'Sable Iask', gimmick: 'sniper',
    combatDoctrineId: 'ranged_disengager',
    archetype: 'lancer_sniper', levelBonus: 2, bountyCr: 450,
    escort: Object.freeze({ archetypes: Object.freeze(['corsair_raider']), size: Object.freeze([1, 1]), doctrine: 'scavenger', formation: 'wedge' }),
    bark: 'hunter_iask',
  }),
  Object.freeze({
    id: 'cap_redcut_sorrel', name: 'Redcut Sorrel', gimmick: 'rammer',
    combatDoctrineId: 'interceptor_flyby',
    archetype: 'bruiser_brawler', levelBonus: 2, bountyCr: 500,
    escort: Object.freeze({ archetypes: Object.freeze(['reaver_pirate']), size: Object.freeze([1, 1]), doctrine: 'scavenger', formation: 'loose' }),
    bark: 'hunter_sorrel',
  }),
  Object.freeze({
    id: 'cap_vane_ash', name: 'Vane the Ash', gimmick: 'screen',
    combatDoctrineId: 'tether_control_raider',
    archetype: 'tether_control_raider', levelBonus: 3, bountyCr: 650,
    escort: Object.freeze({ archetypes: Object.freeze(['wasp_swarmer']), size: Object.freeze([2, 2]), doctrine: 'scavenger', formation: 'ring' }),
    bark: 'hunter_vane',
  }),
]);

/** Short spoken labels for faction ids (comms barks / receipts — callsign register). */
export const FACTION_LABELS = Object.freeze({
  faction_scn: 'Concord',
  faction_mts: 'MTS',
  faction_dmc: 'Collective',
  faction_reach: 'Reach',
  faction_free: 'Frontier',
  faction_quiet: 'Quiet',
  faction_vael: 'Vael',
});

