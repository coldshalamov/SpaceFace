// src/data/encounters.js — ENCOUNTER SHAPE DEFINITIONS (the "what happens here" layer).
//
// The encounterDirector schedules a small, deterministic budget of these per sector-day, anchored to
// the NAMED zones in sectorZones.js. This file is pure data + pure helpers — no imports, no Three.js,
// no RNG (the director passes its seeded sim RNG). Each shape declares:
//   * tier        — 'major' | 'minor' (the director caps ~1 major + 2 minor per sector-day).
//   * weight      — relative selection weight when the director rolls a slot.
//   * zoneTypes   — the sectorZones ZONE_TYPES ids this encounter can anchor to (affinity). The
//                   director only schedules the encounter if the sector has a matching zone.
//   * squad       — composition: { archetypes:[id...], size:[lo,hi], doctrine, formation }.
//                   archetypes reference src/data/enemies.js ENEMY_TYPES ids.
//   * context     — the ai.spawnContext the spawned ships carry. Hostiles use 'encounter'; lawful
//                   wings use 'patrol'; non-combatant convoys use 'convoy_civilian' (NOT a danger
//                   context, so a peaceful convoy doesn't read as a threat until provoked).
//   * factionId   — READABILITY only (radar/HUD tint + kill-rep). Hostility is decided by
//                   scanner.isHostileToPlayer via team/archetype/context, NEVER by factionId.
//   * bark        — comms line spoken on spawn (voice.say if present, else a toast).
//   * variant     — optional roll: 'distress' resolves genuine-vs-bait from the seeded rng.
//
// Everything here is additive. If a sector has no zone of an encounter's zoneTypes, that encounter is
// simply not schedulable there — the director degrades to fewer (or zero) encounters, never crashes.

/** Encounter shape catalogue, keyed by id. */
export const ENCOUNTERS = Object.freeze({
  // ── CONVOY — traders running a trade lane; robbable but not initially hostile ────────────────────
  convoy: Object.freeze({
    id: 'convoy',
    tier: 'minor',
    weight: 3,
    zoneTypes: ['trade_lane', 'refinery_approach', 'border_checkpoint'],
    factionId: 'faction_mts',
    context: 'convoy_civilian',              // peaceful until provoked (not a PLAYER_DANGER_CONTEXT)
    squad: { archetypes: ['mule_trader'], size: [2, 3], doctrine: 'balanced', formation: 'column' },
    // A light escort rides with the haulers so robbing a convoy is a real fight, not a free grab.
    escort: { archetypes: ['patrol_lawman'], size: [1, 2], doctrine: 'official', formation: 'wedge', context: 'patrol', factionId: 'faction_scn' },
    bark: 'convoy_hail',
  }),

  // ── PATROL — a Concord law wing sweeping a patrol corridor ───────────────────────────────────────
  patrol: Object.freeze({
    id: 'patrol',
    tier: 'minor',
    weight: 2,
    zoneTypes: ['patrol_corridor', 'border_checkpoint', 'civilian_core'],
    factionId: 'faction_scn',
    context: 'patrol',                        // lawful; not auto-hostile to a clean player
    squad: { archetypes: ['patrol_lawman'], size: [2, 3], doctrine: 'official', formation: 'wedge' },
    bark: 'patrol_hail',
  }),

  // ── AMBUSH — pirates lying in wait on an ambush lane; hostile on sight ──────────────────────────
  ambush: Object.freeze({
    id: 'ambush',
    tier: 'minor',
    weight: 3,
    zoneTypes: ['ambush_lane', 'outlaw_zone', 'derelict_field'],
    factionId: 'faction_reach',
    context: 'encounter',                     // hostile spawn context
    squad: { archetypes: ['reaver_pirate', 'wasp_swarmer', 'corsair_raider'], size: [2, 4], doctrine: 'scavenger', formation: 'wedge' },
    bark: 'ambush_spring',
  }),

  // ── DISTRESS — a stricken ship calling for help; 60% genuine / 40% pirate bait (seeded roll) ─────
  distress: Object.freeze({
    id: 'distress',
    tier: 'minor',
    weight: 2,
    zoneTypes: ['trade_lane', 'derelict_field', 'nebula_fog', 'radiation_field', 'mining_belt'],
    variant: 'distress',
    genuineChance: 0.6,                       // roll < 0.6 → genuine victim, else pirate bait
    // GENUINE: a lone hauler under fire (or adrift) — helping builds rep; ignoring it is a choice.
    genuine: {
      factionId: 'faction_free',
      context: 'convoy_civilian',
      squad: { archetypes: ['mule_trader'], size: [1, 1], doctrine: 'balanced', formation: 'loose' },
      // a genuine distress is being harried by a small pirate pack the player can drive off
      threat: { archetypes: ['reaver_pirate', 'wasp_swarmer'], size: [1, 2], doctrine: 'scavenger', formation: 'loose', context: 'encounter', factionId: 'faction_reach' },
      bark: 'distress_genuine',
    },
    // BAIT: the "victim" is pirates in disguise — closing in springs the trap.
    bait: {
      factionId: 'faction_reach',
      context: 'encounter',
      squad: { archetypes: ['reaver_pirate', 'corsair_raider', 'wasp_swarmer'], size: [3, 4], doctrine: 'scavenger', formation: 'ring' },
      bark: 'distress_bait',
    },
  }),

  // ── NAMED MINI-BOSS — a rare named raider captain leading an elite wing ─────────────────────────
  named_miniboss: Object.freeze({
    id: 'named_miniboss',
    tier: 'major',
    weight: 1,
    rare: true,
    zoneTypes: ['ambush_lane', 'outlaw_zone'],
    factionId: 'faction_reach',
    context: 'encounter',
    // the captain (elite) plus a supporting wing; the captain is the top-of-band brawler
    boss: { archetype: 'bruiser_brawler', levelBonus: 3, names: ['Vane the Ash', 'Redcut Sorrel', 'Captain Morrow', 'Sable Iask'] },
    squad: { archetypes: ['corsair_raider', 'reaver_pirate'], size: [2, 3], doctrine: 'scavenger', formation: 'wedge' },
    bark: 'miniboss_taunt',
  }),
});

/** Bark lines keyed by bark id. The director speaks these on spawn via voice.say (else toast). */
export const ENCOUNTER_BARKS = Object.freeze({
  convoy_hail:      'Convoy on the lane — hold your fire and we all get paid.',
  patrol_hail:      'Concord patrol on station. Fly clean and we have no quarrel.',
  ambush_spring:    'Ambush! Cut them off — nobody leaves with cargo.',
  distress_genuine: 'Mayday, mayday — we are under fire and losing shields. Anyone out there?',
  distress_bait:    'Please help, our drive is— [comms cut to laughter] Gotcha. Light them up.',
  miniboss_taunt:   'You picked the wrong lane, pilot. This one is mine.',
});

/** All encounters whose tier matches, as an array (stable order = definition order). */
export function encountersByTier(tier) {
  return Object.values(ENCOUNTERS).filter((e) => e.tier === tier);
}

/** Encounters schedulable in a sector = those with at least one matching zone type present. */
export function encountersForZoneTypes(zoneTypeSet, tier) {
  const out = [];
  for (const enc of Object.values(ENCOUNTERS)) {
    if (tier && enc.tier !== tier) continue;
    if (!enc.zoneTypes || !enc.zoneTypes.some((zt) => zoneTypeSet.has(zt))) continue;
    out.push(enc);
  }
  return out;
}

/** The bark text for a bark id (empty string if unknown). */
export function barkText(barkId) {
  return ENCOUNTER_BARKS[barkId] || '';
}
