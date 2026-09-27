// src/data/alienFauna.js — ecological fauna grammar (doc 02): per-species behavior tables.
// These are NOT combatants and never join the tactical AI stack — they read as animals.
// Rule (doc 02): at least half of all fauna sightings are non-hostile; a swarm tightening a
// ring around you is posture, not an attack.

export const FAUNA_DRIVES = Object.freeze([
  'idle', 'drift', 'forage', 'investigate', 'shadow', 'defend',
  'swarm', 'attach', 'feed', 'flee', 'return', 'migrate',
]);

// Per-species grammar. Angles/ranges in WU; times in sim seconds.
//   radius        collision-free semantic radius (entity.radius; collides:false regardless)
//   speed         cruise speed WU/s; fleeSpeed when threatened
//   turnRate      rad/s steering cap
//   alertR        stimulus radius — player closer than this gets noticed
//   threatenR     closer than this and the drive resolves to posture/flee
//   preferredR    stand-off distance for shadow/investigate orbits
//   relayAffinity 0..1 — how tightly the species follows a live relay's broadcast
//   coherenceLoss drive profile when the relay is severed: alert/turn/speed multipliers +
//                 latency — how long a stimulus must persist before the fauna reacts (s)
export const FAUNA_SPECIES = Object.freeze({
  needle_swarm: Object.freeze({
    id: 'needle_swarm',
    name: 'Needle Swarm',
    signature: 'fauna',
    radius: 14,          // one entity represents a swarm cloud, not one needle
    members: 9,          // visual dart count in the swarm cluster
    speed: 55, fleeSpeed: 95,
    turnRate: 2.4,
    alertR: 420, threatenR: 150, preferredR: 220,
    relayAffinity: 0.9,
    coherenceLoss: Object.freeze({ alertMult: 0.6, speedMult: 0.7, latency: 4.0 }),
    drives: Object.freeze({ idle: 'drift', curious: 'investigate', tense: 'defend', panic: 'flee' }),
    note: 'Colonial drifters that seed cysts; they tighten rings and match your heading, but never close in for a kill.',
  }),
  veil_ray: Object.freeze({
    id: 'veil_ray',
    name: 'Veil-Ray',
    signature: 'fauna',
    radius: 18,
    members: 1,
    speed: 34, fleeSpeed: 70,
    turnRate: 0.9,
    alertR: 520, threatenR: 90, preferredR: 160,
    relayAffinity: 0.55,
    coherenceLoss: Object.freeze({ alertMult: 0.7, speedMult: 0.8, latency: 2.5 }),
    drives: Object.freeze({ idle: 'forage', curious: 'shadow', tense: 'flee', panic: 'flee' }),
    note: 'Kite-like membrane grazers that ride filament charge; curious, keep their distance.',
  }),
  blind_shepherd: Object.freeze({
    id: 'blind_shepherd',
    name: 'Blind Shepherd',
    signature: 'relay',
    radius: 26,
    members: 1,
    speed: 16, fleeSpeed: 26,
    turnRate: 0.35,
    alertR: 700, threatenR: 60, preferredR: 420,
    relayAffinity: 0.0, // it IS the relay
    relay: true,
    orbitR: 300,        // wide patrol ring around the site anchor
    coherenceLoss: Object.freeze({ alertMult: 1.0, speedMult: 1.0, latency: 0 }),
    drives: Object.freeze({ idle: 'drift', curious: 'investigate', tense: 'defend', panic: 'flee' }),
    note: 'Slow, pale relay organism. Its broadcast orders the swarm; sever the hull node and coherence collapses.',
  }),
  hull_leech: Object.freeze({
    id: 'hull_leech',
    name: 'Hull Leech',
    signature: 'growth',
    radius: 8,
    members: 1,
    speed: 14, fleeSpeed: 20,
    turnRate: 0.5,
    alertR: 90, threatenR: 0, preferredR: 0,
    relayAffinity: 0.15,
    attachR: 70,        // closes onto a hull within this range
    coherenceLoss: Object.freeze({ alertMult: 0.5, speedMult: 0.6, latency: 6.0 }),
    drives: Object.freeze({ idle: 'drift', curious: 'investigate', tense: 'attach', panic: 'attach' }),
    note: 'Sessile feeder that creeps toward hulls and latches onto surfaces.',
  }),
});

export function faunaSpeciesById(id) {
  return FAUNA_SPECIES[id] || null;
}

// Scan/Encyclopedia taxonomy unlock ids (doc 01 §research contact + doc 09 rewards).
export const FAUNA_TAXONOMY = Object.freeze({
  needle_swarm: 'tax_filamentous_contamination',
  veil_ray: 'tax_filamentous_contamination',
  blind_shepherd: 'tax_filamentous_contamination',
  hull_leech: 'tax_filamentous_contamination',
});
