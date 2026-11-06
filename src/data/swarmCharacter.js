// SWARM S7 — the character sheet as data. One row per ship archetype plus a thin surface for
// the Brood families (their full bodies already live in swarmBrood.js — this sheet names what
// the player should see: silhouette, hue, and the one tell). Lane S renders from this file;
// task 2 applies the size/speed/mass/protection overrides at materialization through the S1
// profile, so Adventure defs stay byte-identical.
//
// Row contract:
//   enemyId     — the SWARM_ROSTER id the wave owner fields
//   debutWave   — the wave it first appears (must match the roster clock)
//   tier        — 'fodder' | 'light' | 'medium' | 'heavy'; heavy ⇒ mass >= HEAVY_AS_TERRAIN_MASS
//   silhouette  — the shape key Lane S maps to geometry; two ships may share a silhouette key
//                 only if their hue differs (the sheet test pins hue+silhouette uniqueness)
//   scale       — draw-scale multiplier (collision radius is authoritative and never moves)
//   hue         — the emissive accent colour, in the hostile warm family (ghost excepted: it
//                 shimmers cold on purpose); hue goes on accents/engines, never a mesh tint
//   radius/mass/speed — the intended body numbers; materialization overrides the authored def
//   protection  — AUDIT C4: fodder 'hull' only; elites add 'armor'; supports add 'shield'.
//                 A listed layer must be VISIBLE (plating, a bubble) or it does not belong
//   abilityId   — the one thing it does, routed through an existing owner (doctrine, field,
//                 mine, tether, shield) — never a new combat system; null = plain fodder
//   tellId      — the in-world tell Lane S draws (>= 0.6 s before the ability lands); null is
//                 legal only on rows whose ability is not a threat (fodder, the duelist)
//   counter     — the exploit, one line, for callouts and the bestiary

export const SWARM_CHARACTER_VERSION = 'swarm_character_v1';

export const SWARM_PROTECTION_LAYERS = Object.freeze(['hull', 'armor', 'shield']);

export const SWARM_CHARACTER_SHEET = Object.freeze([
  Object.freeze({
    enemyId: 'wasp_swarmer', name: 'Wasp Swarmer', debutWave: 1, tier: 'fodder',
    silhouette: 'dart_swarm', scale: 1.0, hue: 0xffb42a,
    radius: 12, mass: 16, speed: 120,
    protection: Object.freeze(['hull']),
    abilityId: 'pack_strafe', tellId: null,
    counter: 'Mow it — or catch one on the line and whip it into the pack.',
  }),
  Object.freeze({
    enemyId: 'reaver_pirate', name: 'Reaver Pirate', debutWave: 2, tier: 'medium',
    silhouette: 'wedge', scale: 1.15, hue: 0xff3524,
    radius: 18, mass: 60, speed: 110,
    protection: Object.freeze(['hull', 'armor']),
    abilityId: 'pack_call', tellId: 'call_flare',
    counter: 'Kill it first — when it dies its Wasps scatter in panic.',
  }),
  Object.freeze({
    enemyId: 'choir_zealot', name: 'Choir Zealot', debutWave: 4, tier: 'fodder',
    silhouette: 'spire', scale: 1.1, hue: 0xff3fd4,
    radius: 12, mass: 17, speed: 95,
    protection: Object.freeze(['hull']),
    abilityId: 'shield_link', tellId: 'link_beam',
    counter: 'Shove it off the link — the beam breaks.',
  }),
  Object.freeze({
    enemyId: 'detonator_dart', name: 'Detonator Dart', debutWave: 5, tier: 'fodder',
    silhouette: 'spike', scale: 0.8, hue: 0xfff3e0,
    radius: 8, mass: 16, speed: 170,
    protection: Object.freeze(['hull']),
    abilityId: 'detonate_ram', tellId: 'fuse_brighten',
    counter: 'Throw it into the pack — it is your bomb.',
  }),
  Object.freeze({
    enemyId: 'mine_layer_jackal', name: 'Mine-Layer Jackal', debutWave: 6, tier: 'medium',
    silhouette: 'squat', scale: 1.2, hue: 0xff7c1e,
    radius: 18, mass: 58, speed: 85,
    protection: Object.freeze(['hull', 'armor']),
    abilityId: 'mine_wake', tellId: 'mine_blink',
    counter: 'Lure the pack through its own mines.',
  }),
  Object.freeze({
    enemyId: 'lancer_sniper', name: 'Lancer Sniper', debutWave: 8, tier: 'light',
    silhouette: 'needle', scale: 1.3, hue: 0xff5c33,
    radius: 14, mass: 24, speed: 60,
    protection: Object.freeze(['hull', 'armor']),
    abilityId: 'rail_charge', tellId: 'aim_beam',
    counter: 'Break line of sight behind a rock — or feed it a rock.',
  }),
  Object.freeze({
    enemyId: 'warden_escort', name: 'Warden Escort', debutWave: 9, tier: 'medium',
    silhouette: 'bulwark', scale: 1.35, hue: 0xffa53a,
    radius: 21, mass: 96, speed: 65,
    protection: Object.freeze(['hull', 'shield']),
    abilityId: 'bubble_project', tellId: 'bubble',
    counter: 'Kill the warden — the bubble drops.',
  }),
  Object.freeze({
    enemyId: 'corsair_raider', name: 'Corsair Raider', debutWave: 10, tier: 'medium',
    silhouette: 'blade', scale: 1.1, hue: 0xd61f2c,
    radius: 18, mass: 36, speed: 130,
    protection: Object.freeze(['hull', 'armor']),
    abilityId: 'wing_dash', tellId: 'charge_line',
    counter: 'Sidestep — it hits whatever is behind you.',
  }),
  Object.freeze({
    enemyId: 'quiet_ghost', name: 'Quiet Ghost', debutWave: 12, tier: 'light',
    silhouette: 'shimmer', scale: 1.0, hue: 0xcfd8e8,
    radius: 13, mass: 22, speed: 105,
    protection: Object.freeze(['hull', 'armor']),
    abilityId: 'cloak_strike', tellId: 'shimmer_ripple',
    counter: 'Fields reveal it — hold it in the well.',
  }),
  Object.freeze({
    enemyId: 'customs_cutter', name: 'Customs Cutter', debutWave: 13, tier: 'medium',
    silhouette: 'box', scale: 1.2, hue: 0xffcf9e,
    radius: 18, mass: 62, speed: 90,
    protection: Object.freeze(['hull', 'armor']),
    abilityId: 'emp_pulse', tellId: 'expanding_ring',
    counter: 'Leave the ring — two seconds of dead powers is the whole trick.',
  }),
  Object.freeze({
    enemyId: 'pd_screen_escort', name: 'Point-Defense Screen', debutWave: 14, tier: 'medium',
    silhouette: 'pod', scale: 1.25, hue: 0xe8590c,
    radius: 20, mass: 75, speed: 55,
    protection: Object.freeze(['hull', 'shield']),
    abilityId: 'pd_screen', tellId: 'tracer_stream',
    counter: 'Kill it before you bomb — it shoots down what you throw.',
  }),
  Object.freeze({
    enemyId: 'patrol_lawman', name: 'Patrol Lawman', debutWave: 15, tier: 'medium',
    silhouette: 'plate', scale: 1.2, hue: 0xc9714a,
    radius: 18, mass: 140, speed: 95,
    protection: Object.freeze(['hull', 'armor']),
    abilityId: 'plated_press', tellId: null,
    counter: 'Too plated to throw easily — wear it down, or crush it.',
  }),
  Object.freeze({
    enemyId: 'tether_control_raider', name: 'Tether-Control Raider', debutWave: 16, tier: 'medium',
    silhouette: 'hook', scale: 1.15, hue: 0xb8433f,
    radius: 18, mass: 78, speed: 100,
    protection: Object.freeze(['hull', 'armor']),
    abilityId: 'tether_tow', tellId: 'rope_shot',
    counter: 'Boost to cut the rope — or tow it into its own hazard.',
  }),
  Object.freeze({
    enemyId: 'bruiser_brawler', name: 'Bruiser Brawler', debutWave: 18, tier: 'heavy',
    silhouette: 'wall', scale: 1.6, hue: 0x8f1d22,
    radius: 34, mass: 160, speed: 75,
    protection: Object.freeze(['hull', 'armor']),
    abilityId: 'ram_wall', tellId: 'charge_line',
    counter: 'A moving wall — throw things into it, bait it into crushers.',
  }),
  Object.freeze({
    enemyId: 'field_anchor_controller', name: 'Anchor Controller', debutWave: 22, tier: 'heavy',
    silhouette: 'ring', scale: 1.5, hue: 0x8a2b4e,
    radius: 32, mass: 420, speed: 70,
    protection: Object.freeze(['hull', 'armor']),
    abilityId: 'gravity_anchor', tellId: 'anchor_ring',
    counter: 'Turn its anchor on the pack — it pulls whatever it catches.',
  }),
]);

/**
 * The Brood surface — swarmBrood.js already owns their bodies, colours, attack language and
 * counters; this sheet names the family tell and the E1 draw scale so Lane S has one place to
 * read "what should the player see". `signature` is the one-line attack language for callouts.
 */
export const SWARM_BROOD_CHARACTER = Object.freeze([
  Object.freeze({ familyId: 'mite', debutWave: 1, drawScale: 1.5, tellId: null,
    signature: 'the horde itself — it flocks and dives' }),
  Object.freeze({ familyId: 'spitter', debutWave: 3, drawScale: 1.5, tellId: 'lob_marker',
    signature: 'lobs a marked acid arc' }),
  Object.freeze({ familyId: 'spore_drift', debutWave: 5, drawScale: 1.5, tellId: 'haze_drift',
    signature: 'a clinging haze — burn it, never fly it slow' }),
  Object.freeze({ familyId: 'charger', debutWave: 7, drawScale: 1.5, tellId: 'charge_line',
    signature: 'charge line, then a committed dash' }),
  Object.freeze({ familyId: 'lantern_cyst', debutWave: 9, drawScale: 1.5, tellId: 'prime_glow',
    signature: 'brightens, then bursts — the player\'s bomb' }),
  Object.freeze({ familyId: 'leecher', debutWave: 11, drawScale: 1.5, tellId: 'latch',
    signature: 'latches and slows — scrape it off on a wall' }),
  Object.freeze({ familyId: 'glassback', debutWave: 13, drawScale: 1.5, tellId: 'shell_glint',
    signature: 'guns ping off — only mass kills it' }),
  Object.freeze({ familyId: 'wake_eel', debutWave: 15, drawScale: 1.5, tellId: 'wake_ribbon',
    signature: 'rides the wake and wraps — held, it is a whip' }),
  Object.freeze({ familyId: 'bellows', debutWave: 17, drawScale: 1.5, tellId: 'swell',
    signature: 'swells on a hit — the second strike bursts it' }),
]);

/** The sheet row for a roster enemy id, or null. Pure. */
export function swarmCharacterFor(enemyId) {
  if (typeof enemyId !== 'string') return null;
  for (const row of SWARM_CHARACTER_SHEET) if (row.enemyId === enemyId) return row;
  return null;
}

/** The brood surface row for a swarmBrood family id, or null. Pure. */
export function swarmBroodCharacterFor(familyId) {
  if (typeof familyId !== 'string') return null;
  for (const row of SWARM_BROOD_CHARACTER) if (row.familyId === familyId) return row;
  return null;
}
