// src/data/alienFauna.js — ecological fauna grammar (doc 02): per-species behavior tables.
// These are NOT combatants and never join the tactical AI stack — they read as animals.
// Rule (doc 02): at least half of all fauna sightings are non-hostile; a swarm tightening a
// ring around you is posture, not an attack.
//
// Species schema (AE-050 — data-only extension, all fields optional except the core grammar):
//   radius        collision-free semantic radius (entity.radius; collides:false regardless)
//   speed         cruise speed WU/s; fleeSpeed when threatened
//   turnRate      rad/s steering cap
//   alertR        stimulus radius — player closer than this gets noticed
//   threatenR     closer than this and the drive resolves to posture/flee
//   preferredR    stand-off distance for shadow/investigate orbits
//   relayAffinity 0..1 — how tightly the species follows a live relay's broadcast
//   coherenceLoss drive profile when the relay is severed: alert/turn/speed multipliers +
//                 latency — how long a stimulus must persist before the fauna reacts (s)
//   role          ecological role tag: drifter | grazer | hunter | carrier | relay |
//                 colony | scavenger | sessile  (doc 02 role grammar, scan taxonomy)
//   stimuli       AE-051 vocabulary — per-stimulus sensitivity weights and overrides:
//                 { heat, vibration, scan, mass, weapon, precursor_tone, spore_density }
//                 each 0..1 (0 = ignores the stimulus entirely)
//   anatomy       AE-058 scan anatomy — { hostTissue, fungalTissue, relayTissue, cystLoad }
//                 surfaced by the scanner once revelation >= 2
//   carrier       AE-054 cyst-carrier primitive — { juveniles, juvenileCount, bloom, toast }
//                 rupture on death seeds a bloom patch + juvenile fauna + a feed response
//   migrates      AE-055 — species follows the site's migrationRoute waypoint loop
//   capturable    AE-059 — Massline-compatible: a latch immobilizes it ('captured' drive)
//   sessile       never self-moves (anchor beasts hold their anchor and posture only)
//   dormant       stays still until a vibration stimulus wakes it (casket worms)
//   heatHunter    drives the Furnace Maw rule: shadows at range, charges a heat-saturated
//                 target (stimuli.heat scales how fast heat accumulates on it)
//   beamResist    0..1 beam-damage discount (glassback lineage — kinetic/impulse preferred)
//   aggregation   AE-053 LOD: { membersPerEntity, farMembers } — one entity carries a swarm;
//                 farMembers caps the visual dart count in the far band
//   commotion     impulse/rebound strength for physics species (bristle ram)
//   juveniles     spindle-mother style: ornamental juvenile count rendered alongside

export const FAUNA_DRIVES = Object.freeze([
  'idle', 'drift', 'forage', 'investigate', 'shadow', 'defend',
  'swarm', 'attach', 'feed', 'flee', 'return', 'migrate',
  // Phase 5+ additions:
  'dormant',   // casket worm — waits on vibration
  'charge',    // bristle ram / furnace maw — high-speed approach posture
  'trail',     // wake eel — follows a moving target's wake
  'anchored',  // anchor beast — sessile, posture only
  'captured',  // massline-latched (AE-059) — organism immobilized in the cradle
  // Phase 16 additions:
  'repair',    // suture mite — slow seam orbit knitting the colony's breaches
]);

// Stimulus vocabulary (AE-051). The drive engine resolves these against species.stimuli.
export const FAUNA_STIMULI = Object.freeze([
  'heat',           // sustained reactor/drive output nearby (furnace maw, lantern drift)
  'vibration',      // impulse shocks, mining beam noise (casket worm wake trigger)
  'scan',           // active scanner illumination (veil rays notice being observed)
  'mass',           // proximity of a large hull (generic proximity)
  'weapon',         // weapons discharge nearby (most fauna scatter)
  'precursor_tone', // suppression fields from machine pylons — overrides everything
  'spore_density',  // rupture blooms — nearby fauna switch to feed
]);

// Per-species grammar. Angles/ranges in WU; times in sim seconds.
export const FAUNA_SPECIES = Object.freeze({
  // ── Phase 0–4 vertical-slice species ────────────────────────────────────────────────
  needle_swarm: Object.freeze({
    id: 'needle_swarm',
    name: 'Needle Swarm',
    signature: 'fauna',
    role: 'drifter',
    radius: 14,          // one entity represents a swarm cloud, not one needle
    members: 9,          // visual dart count in the swarm cluster
    aggregation: Object.freeze({ membersPerEntity: 9, farMembers: 3 }),
    speed: 55, fleeSpeed: 95,
    turnRate: 2.4,
    alertR: 420, threatenR: 150, preferredR: 220,
    relayAffinity: 0.9,
    stimuli: Object.freeze({ heat: 0.2, vibration: 0.4, scan: 0.3, mass: 0.7, weapon: 0.9, precursor_tone: 1.0, spore_density: 0.8 }),
    anatomy: Object.freeze({ hostTissue: 'chitinous dart cluster', fungalTissue: 'filament keel', relayTissue: false, cystLoad: 'low' }),
    coherenceLoss: Object.freeze({ alertMult: 0.6, speedMult: 0.7, latency: 4.0 }),
    drives: Object.freeze({ idle: 'drift', curious: 'investigate', tense: 'defend', panic: 'flee' }),
    note: 'Colonial drifters that seed cysts; they tighten rings and match your heading, but never close in for a kill.',
  }),
  veil_ray: Object.freeze({
    id: 'veil_ray',
    name: 'Veil-Ray',
    signature: 'fauna',
    role: 'grazer',
    radius: 18,
    members: 1,
    speed: 34, fleeSpeed: 70,
    turnRate: 0.9,
    alertR: 520, threatenR: 90, preferredR: 160,
    relayAffinity: 0.55,
    stimuli: Object.freeze({ heat: 0.1, vibration: 0.3, scan: 0.9, mass: 0.6, weapon: 1.0, precursor_tone: 1.0, spore_density: 0.3 }),
    anatomy: Object.freeze({ hostTissue: 'electroreceptive membrane', fungalTissue: 'filament keel', relayTissue: false, cystLoad: 'none' }),
    coherenceLoss: Object.freeze({ alertMult: 0.7, speedMult: 0.8, latency: 2.5 }),
    drives: Object.freeze({ idle: 'forage', curious: 'shadow', tense: 'flee', panic: 'flee' }),
    note: 'Kite-like membrane grazers that ride filament charge; curious, keep their distance, and flinch under an active scan.',
  }),
  blind_shepherd: Object.freeze({
    id: 'blind_shepherd',
    name: 'Blind Shepherd',
    signature: 'relay',
    role: 'relay',
    radius: 26,
    members: 1,
    speed: 16, fleeSpeed: 26,
    turnRate: 0.35,
    alertR: 700, threatenR: 60, preferredR: 420,
    relayAffinity: 0.0, // it IS the relay
    relay: true,
    orbitR: 300,        // wide patrol ring around the site anchor
    stimuli: Object.freeze({ heat: 0.0, vibration: 0.2, scan: 0.2, mass: 0.4, weapon: 0.6, precursor_tone: 0.8, spore_density: 0.0 }),
    anatomy: Object.freeze({ hostTissue: 'toroidal pressure hull tissue', fungalTissue: 'relay organ crown', relayTissue: true, cystLoad: 'moderate' }),
    coherenceLoss: Object.freeze({ alertMult: 1.0, speedMult: 1.0, latency: 0 }),
    drives: Object.freeze({ idle: 'drift', curious: 'investigate', tense: 'defend', panic: 'flee' }),
    note: 'Slow, pale relay organism. Its broadcast orders the swarm; sever the hull node and coherence collapses.',
  }),
  hull_leech: Object.freeze({
    id: 'hull_leech',
    name: 'Hull Leech',
    signature: 'growth',
    role: 'drifter',
    radius: 8,
    members: 1,
    speed: 14, fleeSpeed: 20,
    turnRate: 0.5,
    alertR: 90, threatenR: 0, preferredR: 0,
    relayAffinity: 0.15,
    attachR: 70,        // closes onto a hull within this range
    capturable: true,   // small enough for a Massline cradle
    stimuli: Object.freeze({ heat: 0.9, vibration: 0.5, scan: 0.0, mass: 0.8, weapon: 0.3, precursor_tone: 0.6, spore_density: 0.2 }),
    anatomy: Object.freeze({ hostTissue: 'radial gripper disc', fungalTissue: 'attachment collar', relayTissue: false, cystLoad: 'trace' }),
    coherenceLoss: Object.freeze({ alertMult: 0.5, speedMult: 0.6, latency: 6.0 }),
    drives: Object.freeze({ idle: 'drift', curious: 'investigate', tense: 'attach', panic: 'attach' }),
    note: 'Sessile feeder that creeps toward hulls and latches onto surfaces.',
  }),

  // ── Phase 6 content wave A (AE-060..064) ────────────────────────────────────────────
  lantern_cyst: Object.freeze({
    id: 'lantern_cyst',
    name: 'Lantern Cyst',
    signature: 'growth',
    role: 'carrier',
    radius: 10,
    members: 1,
    speed: 9, fleeSpeed: 12,
    turnRate: 0.4,
    alertR: 160, threatenR: 0, preferredR: 0,
    relayAffinity: 0.3,
    capturable: true,
    // Rupture is the whole point: shooting it is easy and strategically wrong (doc 02 §4.2).
    carrier: Object.freeze({
      juveniles: 'needle_swarm',
      juvenileCount: 2,
      bloom: 0.06,       // site contamination bump on rupture
      toast: 'The cyst ruptures — particulate bloom and juvenile forms scatter.',
    }),
    stimuli: Object.freeze({ heat: 1.0, vibration: 0.3, scan: 0.0, mass: 0.5, weapon: 0.4, precursor_tone: 0.8, spore_density: 0.0 }),
    anatomy: Object.freeze({ hostTissue: 'buoyant membrane sac', fungalTissue: 'luminous reproductive organ', relayTissue: false, cystLoad: 'high' }),
    coherenceLoss: Object.freeze({ alertMult: 0.8, speedMult: 0.9, latency: 5.0 }),
    drives: Object.freeze({ idle: 'drift', curious: 'drift', tense: 'drift', panic: 'drift' }),
    note: 'Buoyant reproductive sac that drifts toward heat. Destroying it seeds a local bloom; towing it relocates the problem.',
  }),
  casket_worm: Object.freeze({
    id: 'casket_worm',
    name: 'Casket Worm',
    signature: 'fauna',
    role: 'scavenger',
    radius: 12,
    members: 1,
    speed: 40, fleeSpeed: 60,
    turnRate: 1.8,
    alertR: 220, threatenR: 110, preferredR: 60,
    relayAffinity: 0.5,
    dormant: true,      // waits in the wreck cavity until vibration wakes it
    stimuli: Object.freeze({ heat: 0.2, vibration: 1.0, scan: 0.1, mass: 0.8, weapon: 0.9, precursor_tone: 1.0, spore_density: 0.4 }),
    anatomy: Object.freeze({ hostTissue: 'segmented cavity-dweller', fungalTissue: 'route-memory sheath', relayTissue: false, cystLoad: 'low' }),
    coherenceLoss: Object.freeze({ alertMult: 0.7, speedMult: 0.8, latency: 2.0 }),
    drives: Object.freeze({ idle: 'dormant', curious: 'investigate', tense: 'defend', panic: 'flee' }),
    note: 'Segmented wreck-dweller that sleeps until vibration wakes it. Mining and impulse shock bait it out.',
  }),
  bristle_ram: Object.freeze({
    id: 'bristle_ram',
    name: 'Bristle Ram',
    signature: 'fauna',
    role: 'hunter',
    radius: 16,
    members: 1,
    speed: 30, fleeSpeed: 46,
    turnRate: 1.1,
    alertR: 380, threatenR: 260, preferredR: 40,
    relayAffinity: 0.4,
    // Territorial collision is its only verb — it needs a real body for impact play.
    physicsBody: true,
    commotion: 1.6,     // impact push multiplier
    stimuli: Object.freeze({ heat: 0.2, vibration: 0.7, scan: 0.2, mass: 1.0, weapon: 0.8, precursor_tone: 1.0, spore_density: 0.2 }),
    anatomy: Object.freeze({ hostTissue: 'calcified impact prow', fungalTissue: 'bristle sensor mat', relayTissue: false, cystLoad: 'low' }),
    coherenceLoss: Object.freeze({ alertMult: 0.8, speedMult: 0.9, latency: 1.5 }),
    drives: Object.freeze({ idle: 'drift', curious: 'investigate', tense: 'charge', panic: 'charge' }),
    note: 'Dense armored organism that solves threats by impact — Massline, impulse charges, terrain and momentum matter.',
  }),
  mourning_kite: Object.freeze({
    id: 'mourning_kite',
    name: 'Mourning Kite',
    signature: 'fauna',
    role: 'drifter',
    radius: 15,
    members: 1,
    speed: 22, fleeSpeed: 44,
    turnRate: 0.7,
    alertR: 480, threatenR: 0, preferredR: 240,
    relayAffinity: 0.85,
    migrates: true,     // walks the site's migrationRoute — a memory loop, not a mind
    stimuli: Object.freeze({ heat: 0.1, vibration: 0.2, scan: 0.5, mass: 0.3, weapon: 0.8, precursor_tone: 1.0, spore_density: 0.3 }),
    anatomy: Object.freeze({ hostTissue: 'membrane sail', fungalTissue: 'grief-loop node', relayTissue: false, cystLoad: 'trace' }),
    coherenceLoss: Object.freeze({ alertMult: 0.6, speedMult: 0.5, latency: 8.0 }),
    drives: Object.freeze({ idle: 'migrate', curious: 'shadow', tense: 'migrate', panic: 'flee' }),
    note: 'A solitary organism repeating a route inherited through a network stain. Following it leads somewhere old.',
  }),
  anchor_beast: Object.freeze({
    id: 'anchor_beast',
    name: 'Anchor Beast',
    signature: 'fauna',
    role: 'sessile',
    radius: 60,          // asteroid-scale body
    members: 1,
    speed: 0, fleeSpeed: 0,
    turnRate: 0.08,
    alertR: 900, threatenR: 300, preferredR: 0,
    relayAffinity: 0.6,
    sessile: true,
    stimuli: Object.freeze({ heat: 0.5, vibration: 0.9, scan: 0.2, mass: 0.8, weapon: 0.9, precursor_tone: 0.7, spore_density: 0.0 }),
    anatomy: Object.freeze({ hostTissue: 'mineral-processing mantle', fungalTissue: 'anchor tendrils', relayTissue: true, cystLoad: 'moderate' }),
    coherenceLoss: Object.freeze({ alertMult: 0.9, speedMult: 1.0, latency: 3.0 }),
    drives: Object.freeze({ idle: 'anchored', curious: 'anchored', tense: 'defend', panic: 'anchored' }),
    note: 'Large sessile organism grown around a structural node. Can be mined around, studied, starved — or attacked, at a cost.',
  }),

  // ── Phase 8 content wave B (AE-080..084) ────────────────────────────────────────────
  furnace_maw: Object.freeze({
    id: 'furnace_maw',
    name: 'Furnace Maw',
    signature: 'fauna',
    role: 'hunter',
    radius: 22,
    members: 1,
    speed: 26, fleeSpeed: 40,
    turnRate: 0.8,
    alertR: 1100, threatenR: 140, preferredR: 700,
    relayAffinity: 0.3,
    heatHunter: true,   // shadows at range; charges once the target is heat-saturated
    stimuli: Object.freeze({ heat: 1.0, vibration: 0.4, scan: 0.3, mass: 0.6, weapon: 0.5, precursor_tone: 1.0, spore_density: 0.1 }),
    anatomy: Object.freeze({ hostTissue: 'heat-radiating plate stack', fungalTissue: 'feeding cavity tissue', relayTissue: false, cystLoad: 'none' }),
    coherenceLoss: Object.freeze({ alertMult: 0.7, speedMult: 0.8, latency: 4.0 }),
    drives: Object.freeze({ idle: 'drift', curious: 'shadow', tense: 'charge', panic: 'charge' }),
    note: 'Heavy predator attracted to sustained reactor output. Cruise and overheat are ecological signals — thermal discipline is survival.',
  }),
  glassback: Object.freeze({
    id: 'glassback',
    name: 'Glassback',
    signature: 'fauna',
    role: 'grazer',
    radius: 20,
    members: 1,
    speed: 12, fleeSpeed: 20,
    turnRate: 0.5,
    alertR: 300, threatenR: 80, preferredR: 100,
    relayAffinity: 0.35,
    beamResist: 0.65,   // laser-heavy lineage — beams are inefficient; kinetic/impulse works
    physicsBody: true,
    commotion: 0.6,
    stimuli: Object.freeze({ heat: 0.2, vibration: 0.6, scan: 0.3, mass: 0.7, weapon: 0.6, precursor_tone: 0.9, spore_density: 0.3 }),
    anatomy: Object.freeze({ hostTissue: 'silicate armor grazing shell', fungalTissue: 'seam veins', relayTissue: false, cystLoad: 'low' }),
    coherenceLoss: Object.freeze({ alertMult: 0.8, speedMult: 0.8, latency: 5.0 }),
    drives: Object.freeze({ idle: 'forage', curious: 'forage', tense: 'defend', panic: 'flee' }),
    note: 'Mineral-armored grazer scraping asteroid surfaces. Beams slide off it; mass does not.',
  }),
  wake_eel: Object.freeze({
    id: 'wake_eel',
    name: 'Wake Eel',
    signature: 'fauna',
    role: 'drifter',
    radius: 11,
    members: 1,
    speed: 60, fleeSpeed: 90,
    turnRate: 2.0,
    alertR: 600, threatenR: 40, preferredR: 120,
    relayAffinity: 0.5,
    trails: true,       // the trail drive: follows a moving hull's wake harmlessly
    stimuli: Object.freeze({ heat: 0.3, vibration: 0.2, scan: 0.4, mass: 0.9, weapon: 0.7, precursor_tone: 1.0, spore_density: 0.2 }),
    anatomy: Object.freeze({ hostTissue: 'streamlined wake-fin', fungalTissue: 'signal chain', relayTissue: false, cystLoad: 'none' }),
    coherenceLoss: Object.freeze({ alertMult: 0.7, speedMult: 0.9, latency: 3.0 }),
    drives: Object.freeze({ idle: 'drift', curious: 'trail', tense: 'trail', panic: 'flee' }),
    note: 'Long organism surfing ion and gravity wakes. Harmless alone — but its trail can lead predators toward traffic.',
  }),
  spindle_mother: Object.freeze({
    id: 'spindle_mother',
    name: 'Spindle Mother',
    signature: 'relay',
    role: 'carrier',
    radius: 34,
    members: 1,
    juveniles: 5,        // ornamental cloud of juveniles in the visual
    speed: 8, fleeSpeed: 14,
    turnRate: 0.3,
    alertR: 500, threatenR: 0, preferredR: 200,
    relayAffinity: 0.7,
    carrier: Object.freeze({
      juveniles: 'needle_swarm',
      juvenileCount: 3,
      bloom: 0.10,       // killing one is easy and contaminates a large area
      toast: 'The carrier breaks apart — a broad spore bloom stains the field.',
    }),
    stimuli: Object.freeze({ heat: 0.2, vibration: 0.3, scan: 0.3, mass: 0.5, weapon: 0.7, precursor_tone: 1.0, spore_density: 0.0 }),
    anatomy: Object.freeze({ hostTissue: 'reproductive spindle sac', fungalTissue: 'dense carrier tissue', relayTissue: true, cystLoad: 'very high' }),
    coherenceLoss: Object.freeze({ alertMult: 0.8, speedMult: 0.9, latency: 4.0 }),
    drives: Object.freeze({ idle: 'drift', curious: 'drift', tense: 'flee', panic: 'flee' }),
    note: 'Slow carrier surrounded by juveniles, choosing stable thermal pockets. Killing it changes the local encounter table.',
  }),
  // ── Phase 11 deep-region wave (AE-112) ────────────────────────────────────────────────
  void_carrier: Object.freeze({
    id: 'void_carrier',
    name: 'Void Carrier',
    signature: 'fauna',
    role: 'carrier',
    radius: 80,          // hull-scale body — the giant carrier of the deep regions
    members: 1,
    speed: 6, fleeSpeed: 10,
    turnRate: 0.12,
    alertR: 1400, threatenR: 0, preferredR: 600,
    relayAffinity: 0.4,
    migrates: true,
    carrier: Object.freeze({
      juveniles: 'veil_ray',
      juvenileCount: 3,
      bloom: 0.15,       // killing a giant carrier stains the whole seam
      toast: "The carrier's sac wall gives way — a bloom big enough to change the sector reading.",
    }),
    stimuli: Object.freeze({ heat: 0.3, vibration: 0.4, scan: 0.2, mass: 0.2, weapon: 0.6, precursor_tone: 1.0, spore_density: 0.0 }),
    anatomy: Object.freeze({ hostTissue: 'vessel-scale buoyant hull-mass', fungalTissue: 'stratified reproductive layers', relayTissue: true, cystLoad: 'extreme' }),
    coherenceLoss: Object.freeze({ alertMult: 0.9, speedMult: 0.8, latency: 12.0 }),
    drives: Object.freeze({ idle: 'migrate', curious: 'migrate', tense: 'migrate', panic: 'drift' }),
    note: 'A hull-scale migratory carrier that does not notice you at all. Its route predates the charts.',
  }),
  archive_crab: Object.freeze({
    id: 'archive_crab',
    name: 'Archive Crab',
    signature: 'fauna',
    role: 'scavenger',
    radius: 9,
    members: 1,
    speed: 6, fleeSpeed: 10,
    turnRate: 0.4,
    alertR: 120, threatenR: 0, preferredR: 30,
    relayAffinity: 0.45,
    // Route/shape memory looks like intelligence: it forages debris into geometric piles.
    pilesDebris: true,
    stimuli: Object.freeze({ heat: 0.1, vibration: 0.5, scan: 0.2, mass: 0.4, weapon: 0.6, precursor_tone: 0.9, spore_density: 0.4 }),
    anatomy: Object.freeze({ hostTissue: 'radial collector limbs', fungalTissue: 'route-memory sheath', relayTissue: false, cystLoad: 'trace' }),
    coherenceLoss: Object.freeze({ alertMult: 0.7, speedMult: 0.7, latency: 6.0 }),
    drives: Object.freeze({ idle: 'forage', curious: 'forage', tense: 'flee', panic: 'flee' }),
    note: 'Slow radial scavenger arranging debris into repeated geometries. Its piles hold unusual salvage — shooting it erases the evidence.',
  }),
  // ── Phase 16 / AE-160..AE-165 — the remaining catalog species ──────────────────────────
  cold_bell: Object.freeze({
    id: 'cold_bell',
    name: 'Cold Bell',
    signature: 'fauna',
    role: 'colony',
    radius: 20,
    members: 1,
    speed: 4, fleeSpeed: 6,
    turnRate: 0.2,
    alertR: 900, threatenR: 0, preferredR: 600,
    relayAffinity: 0.4,
    // AE-160: rings electromagnetically on pressure/radiation change — a weather warning
    // organism. tickFauna reads the sector hazard field into stim.pressure; the toll is a
    // comms beat ahead of the front.
    weatherListener: true,
    tollPeriodS: 240,
    stimuli: Object.freeze({ heat: 0.0, vibration: 0.1, scan: 0.3, mass: 0.2, weapon: 0.4, precursor_tone: 0.6, spore_density: 0.2 }),
    anatomy: Object.freeze({ hostTissue: 'hollow resonant bell body', fungalTissue: 'piezo filament clapper', relayTissue: false, cystLoad: 'trace' }),
    coherenceLoss: Object.freeze({ alertMult: 1.0, speedMult: 0.5, latency: 4.0 }),
    drives: Object.freeze({ idle: 'drift', curious: 'drift', tense: 'drift', panic: 'drift' }),
    note: 'A hollow bell that tolls before a radiation front arrives. Miners learned to listen before they learned what it was.',
  }),
  suture_mite: Object.freeze({
    id: 'suture_mite',
    name: 'Suture Mite',
    signature: 'fauna',
    role: 'scavenger',
    radius: 4,
    members: 1,
    speed: 18, fleeSpeed: 30,
    turnRate: 1.4,
    alertR: 220, threatenR: 40, preferredR: 12,
    relayAffinity: 0.5,
    // AE-161: hull-repair organism — seeks the site anchor and knits tissue into it. Hostile
    // only when pulled off an active repair (defend drive).
    repairer: true,
    stimuli: Object.freeze({ heat: 0.2, vibration: 0.4, scan: 0.1, mass: 0.3, weapon: 0.9, precursor_tone: 0.3, spore_density: 0.5 }),
    anatomy: Object.freeze({ hostTissue: 'spinneret mandibles', fungalTissue: 'scar-tissue reservoir', relayTissue: false, cystLoad: 'none' }),
    coherenceLoss: Object.freeze({ alertMult: 0.8, speedMult: 0.8, latency: 1.5 }),
    drives: Object.freeze({ idle: 'repair', curious: 'repair', tense: 'defend', panic: 'flee' }),
    note: 'A knitter. It closes breaches in the colony it lives on; crews that tether one off a seam learn why it was there.',
  }),
  black_sail: Object.freeze({
    id: 'black_sail',
    name: 'Black Sail',
    signature: 'fauna',
    role: 'colony',
    radius: 34,
    members: 1,
    speed: 22, fleeSpeed: 55,
    turnRate: 0.5,
    alertR: 700, threatenR: 120, preferredR: 350,
    relayAffinity: 0.35,
    beamResist: 0.9,
    // AE-162: edge-on it reads as debris on every scanner tier; completing a close scan flips
    // it broadside and resolves the label.
    disguise: 'debris',
    stimuli: Object.freeze({ heat: 0.1, vibration: 0.2, scan: 1.0, mass: 0.3, weapon: 0.8, precursor_tone: 0.5, spore_density: 0.2 }),
    anatomy: Object.freeze({ hostTissue: 'photophore sail membrane', fungalTissue: 'edge stiffener cord', relayTissue: false, cystLoad: 'light' }),
    coherenceLoss: Object.freeze({ alertMult: 0.8, speedMult: 0.7, latency: 3.0 }),
    drives: Object.freeze({ idle: 'drift', curious: 'shadow', tense: 'flee', panic: 'flee' }),
    note: 'A sail of dark photophore thinner than the scan beam. You have flown through a flock of them and logged it as debris.',
  }),
  stone_lung: Object.freeze({
    id: 'stone_lung',
    name: 'Stone Lung',
    signature: 'fauna',
    role: 'sessile',
    radius: 46,
    members: 1,
    speed: 0, fleeSpeed: 0,
    turnRate: 0.05,
    alertR: 260, threatenR: 0, preferredR: 0,
    relayAffinity: 0.5,
    sessile: true,
    // AE-163: asteroid-buried filter organism venting on a period — the exhale feeds the
    // local contamination field.
    ventPeriodS: 26,
    stimuli: Object.freeze({ heat: 0.3, vibration: 0.8, scan: 0.1, mass: 0.2, weapon: 0.5, precursor_tone: 0.4, spore_density: 0.0 }),
    anatomy: Object.freeze({ hostTissue: 'rock-lined mantle cavity', fungalTissue: 'spore bladder', relayTissue: false, cystLoad: 'heavy' }),
    coherenceLoss: Object.freeze({ alertMult: 1.0, speedMult: 1.0, latency: 0 }),
    drives: Object.freeze({ idle: 'anchored', curious: 'anchored', tense: 'defend', panic: 'anchored' }),
    note: 'An asteroid that breathes. Prospectors drill the inhale; the exhale is where the claims go bad.',
  }),
  pilgrim_spine: Object.freeze({
    id: 'pilgrim_spine',
    name: 'Pilgrim Spine',
    signature: 'fauna',
    role: 'migrant',
    radius: 16,
    members: 1,
    speed: 30, fleeSpeed: 42,
    turnRate: 0.6,
    alertR: 480, threatenR: 60, preferredR: 200,
    relayAffinity: 0.6,
    migrates: true,
    // AE-164: a line of linked organisms on an unexplained route — each segment follows the
    // one ahead (eco.chainTo), not the waypoint directly.
    chainFollow: true,
    stimuli: Object.freeze({ heat: 0.1, vibration: 0.2, scan: 0.4, mass: 0.3, weapon: 0.7, precursor_tone: 0.9, spore_density: 0.3 }),
    anatomy: Object.freeze({ hostTissue: 'vertebra link segments', fungalTissue: 'route-nerve cord', relayTissue: true, cystLoad: 'trace' }),
    coherenceLoss: Object.freeze({ alertMult: 0.9, speedMult: 0.9, latency: 2.0 }),
    drives: Object.freeze({ idle: 'migrate', curious: 'migrate', tense: 'migrate', panic: 'flee' }),
    note: 'A procession of linked segments walking a route older than the charts. Where it ends, nothing has reached yet.',
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
  lantern_cyst: 'tax_filamentous_contamination',
  casket_worm: 'tax_filamentous_contamination',
  bristle_ram: 'tax_filamentous_contamination',
  mourning_kite: 'tax_filamentous_contamination',
  anchor_beast: 'tax_filamentous_contamination',
  furnace_maw: 'tax_filamentous_contamination',
  glassback: 'tax_filamentous_contamination',
  wake_eel: 'tax_filamentous_contamination',
  spindle_mother: 'tax_filamentous_contamination',
  archive_crab: 'tax_filamentous_contamination',
  void_carrier: 'tax_filamentous_contamination',
  cold_bell: 'tax_filamentous_contamination',
  suture_mite: 'tax_filamentous_contamination',
  black_sail: 'tax_filamentous_contamination',
  stone_lung: 'tax_filamentous_contamination',
  pilgrim_spine: 'tax_filamentous_contamination',
});

// AE-053 — cosmetic microfauna aggregation: very small organisms exist only as dressing,
// never as entities. A bloom state emits these as cheap motes (they carry no drive state).
export const COSMETIC_MICROFAUNA = Object.freeze({
  id: 'spore_mote_swarm',
  placeId: 'alien_growth_spore_motes',
  note: 'Distant cyst-shed particulate and juvenile glitter — visual only, zero sim cost.',
});

/** Species ids that rupture into bloom + juveniles (AE-054 carrier primitive). */
export function carrierSpecies(speciesId) {
  const sp = faunaSpeciesById(speciesId);
  return sp && sp.carrier ? sp : null;
}
