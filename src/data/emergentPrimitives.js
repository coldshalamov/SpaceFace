// Emergent ARPG combat primitives.
// Outcomes are properties of the body (mass, heat, velocity, fuelVolatile, material),
// not a script for one encounter. These records are the shipped catalog entries.

export const EMERGENT_POOL = Object.freeze({
  projectiles: 96,
  stickies: 24,
  coatings: 24,
  springs: 16,
  polarities: 24,
  fields: 8,
  prisms: 8,
  hijacks: 16,
  gongs: 8,
  links: 8,
  presentation: 48,
  audio: 32,
});

export const EMERGENT_LIMITS = Object.freeze({
  arcDepth: 4,
  prismBounces: 4,
  generationMax: 4,
});

/** Shared physical constants. Forces are impulses (mass·WU/s) queued for Rapier. */
export const EMERGENT_TUNING = Object.freeze({
  stickySpeed: 260,
  stickyLife: 4,
  stickyYield: 2800,
  stickyFalloff: 16,
  stickyBlastRadius: 96,
  stickyCookHeat: 36,
  stickyFuelMin: 0.12,
  shrapnelCount: 7,
  shrapnelSpeed: 150,
  shrapnelMass: 1.4,
  shrapnelLife: 1.4,
  primerSpeed: 300,
  primerLife: 2.5,
  coatSeconds: 8,
  arcRange: 42,
  arcContactPad: 1.5,
  arcHeat: 6,
  arcImpulse: 180,
  springK: 48,
  springRestFraction: 0.42,
  springCollide: 0.035,
  // At a 100 WU gap a tagged pair must visibly close during one combat beat.
  // Near-contact force is capped separately so inverse-square pull cannot explode.
  dipoleK: 12e6,
  dipoleMaxForce: 3840,
  dipoleEps: 36,
  dipoleContact: 0.02,
  slugMass: 9,
  slugSpeed: 340,
  thermalHeatPerSec: 72,
  thermalRange: 220,
  fractureHeat: 48,
  reactorHeat: 64,
  reactorLockS: 4,
  magazineHeat: 28,
  cookHeat: 36,
  viscosityRadius: 56,
  viscosityLife: 6,
  viscosityParallel: 3.4,
  viscosityPerp: 1.1,
  viscosityIgnitePower: 40,
  prismRadius: 6,
  prismLife: 8,
  prismGain: 1.35,
  prismDrop: 34,
  hijackSpeed: 280,
  hijackSpinScale: 3,
  hijackBurner: 70,
  hijackLife: 8,
  gongPeriod: 0.45,
  gongWaves: 5,
  gongRadius: 90,
  gongImpulsePerMass: 4.5,
  gongShieldFraction: 0.45,
  fieldDrop: 28,
  polaritySpeed: 300,
});

const STARTER_SAFE = Object.freeze({
  heatPerShot: 0,
  heatMax: 0,
  heatDissip: 0,
  energyCost: 0,
  starterSafe: true,
});

function gun(partial) {
  return {
    slotType: 'weapon',
    size: 'S',
    tier: 2,
    mass: 3,
    price: 24000,
    purchasable: true,
    mount: 'gun',
    tracking: 'fixed',
    spreadDeg: 0,
    dmg: 0,
    rof: 3,
    dps: 0,
    range: 240,
    projSpeed: 280,
    tumbleTorque: 0,
    ...STARTER_SAFE,
    ...partial,
  };
}

export const EMERGENT_WEAPON_DEFS = [
  gun({
    // Retired from sale (owner 2026-10-22): the BOMB power throws the sticky charge; SHOVE sets it off. Owned copies keep working;
    // the Crucible draft is the swarm seam's to align.
    retiredInto: 'bomb',
    id: 'wpn_sticky_detonator',
    name: 'Sticky Detonator',
    price: 26000,
    damageType: 'explosive',
    dmg: 0,
    rof: 2.5,
    projSpeed: EMERGENT_TUNING.stickySpeed,
    impulsePerHit: EMERGENT_TUNING.stickyYield,
    tumbleTorque: 18,
    impulseProvenance: 'sticky_detonator',
    emergentPrimitive: 'sticky',
    emergentSplit: { count: EMERGENT_TUNING.shrapnelCount, payloadScale: 0.35 },
    lineageGenerationMax: 2,
  }),
  gun({
    // Retired from sale (owner 2026-10-22): the relay-arc and conductive-path payload modules chain the shock. Owned copies keep working;
    // the Crucible draft is the swarm seam's to align.
    retiredInto: 'mod_relay_arc',
    id: 'wpn_conductive_primer',
    name: 'Conductive Primer',
    price: 28000,
    damageType: 'emp',
    dmg: 2,
    rof: 3,
    dps: 6,
    projSpeed: EMERGENT_TUNING.primerSpeed,
    impulsePerHit: 12,
    tumbleTorque: 1,
    impulseProvenance: 'conductive_primer',
    emergentPrimitive: 'primer',
    emergentChain: { count: EMERGENT_LIMITS.arcDepth, range: EMERGENT_TUNING.arcRange },
    lineageGenerationMax: EMERGENT_LIMITS.generationMax,
  }),
  gun({
    id: 'tool_grav_anchor',
    name: 'Grav Anchor',
    price: 32000,
    damageType: 'kinetic',
    rof: 2,
    projSpeed: 300,
    impulsePerHit: 40,
    tumbleTorque: 6,
    impulseProvenance: 'grav_anchor',
    emergentPrimitive: 'grav',
    lineageGenerationMax: 1,
  }),
  gun({
    id: 'wpn_thermal_cooker',
    name: 'Thermal Cooker',
    price: 36000,
    damageType: 'thermal',
    dmg: 8,
    rof: 8,
    dps: 64,
    continuous: true,
    tracking: 'hitscan',
    projSpeed: Infinity,
    range: EMERGENT_TUNING.thermalRange,
    impulsePerHit: 8,
    tumbleTorque: 0.4,
    impulseProvenance: 'thermal_cooker',
    emergentPrimitive: 'thermal',
    emergentBounces: EMERGENT_LIMITS.prismBounces,
    lineageGenerationMax: EMERGENT_LIMITS.generationMax,
  }),
  gun({
    id: 'wpn_mass_driver',
    name: 'Mass Driver',
    price: 30000,
    damageType: 'kinetic',
    dmg: 0,
    rof: 1.6,
    projSpeed: EMERGENT_TUNING.slugSpeed,
    impulsePerHit: EMERGENT_TUNING.slugMass * EMERGENT_TUNING.slugSpeed,
    tumbleTorque: 12,
    impulseProvenance: 'mass_driver_slug',
    emergentPrimitive: 'mass',
  }),
  gun({
    // Retired to the Shove power (row 550's "merge → Shove or cut" — an inverted
    // field is a shove; no §7.1 head claims it).
    retiredInto: 'shove',
    id: 'tool_polarity_inverter',
    name: 'Polarity Inverter',
    price: 34000,
    damageType: 'emp',
    rof: 3,
    projSpeed: EMERGENT_TUNING.polaritySpeed,
    impulsePerHit: 16,
    tumbleTorque: 2,
    impulseProvenance: 'polarity_tag',
    emergentPrimitive: 'polarity',
  }),
  gun({
    // Retired from sale (owner 2026-10-22): the goo drift bomb lays the clinging field. Owned copies keep working;
    // the Crucible draft is the swarm seam's to align.
    retiredInto: 'bomb',
    id: 'tool_viscosity_field',
    name: 'Viscosity Field',
    price: 30000,
    damageType: 'kinetic',
    rof: 1.2,
    projSpeed: 0,
    tracking: 'hitscan',
    impulsePerHit: 20,
    impulseProvenance: 'viscosity_field',
    emergentPrimitive: 'viscosity',
  }),
  gun({
    // Retired to its §7.1 home (owner table row 550): the Weld head makes a held
    // object stick where it touches — the prism's cover/cousin behaviour. Kept
    // copies still fire; the draft pool is the swarm seam's to align.
    retiredInto: 'mod_line_head_weld',
    id: 'tool_hardlight_prism',
    name: 'Hardlight Prism',
    price: 38000,
    damageType: 'energy',
    rof: 1.2,
    projSpeed: 0,
    tracking: 'hitscan',
    impulsePerHit: 10,
    impulseProvenance: 'hardlight_prism',
    emergentPrimitive: 'prism',
    emergentBounces: EMERGENT_LIMITS.prismBounces,
    lineageGenerationMax: EMERGENT_LIMITS.generationMax,
  }),
  gun({
    // Retired to its §7.1 home (row 550): the Override head fires a held ship's
    // thrusters — the same outcome as a rogue thruster driving its host.
    retiredInto: 'mod_line_head_override',
    id: 'tool_thruster_hijacker',
    name: 'Thruster Hijacker',
    price: 33000,
    damageType: 'kinetic',
    rof: 1.5,
    projSpeed: EMERGENT_TUNING.hijackSpeed,
    impulsePerHit: 24,
    tumbleTorque: 30,
    impulseProvenance: 'thruster_hijack',
    emergentPrimitive: 'hijack',
  }),
  gun({
    // Retired to its §7.1 home (row 550): the Bell head rings on a slam — a struck
    // body pulsing the room, the same resonance.
    retiredInto: 'mod_line_head_bell',
    id: 'tool_seismic_gong',
    name: 'Seismic Gong',
    price: 31000,
    damageType: 'kinetic',
    rof: 0.8,
    projSpeed: 220,
    impulsePerHit: 220,
    tumbleTorque: 14,
    impulseProvenance: 'seismic_gong',
    emergentPrimitive: 'gong',
  }),
  gun({
    // Retired to its §7.1 home (row 550): the Relic Sympathy head is exactly this
    // tool — linked bodies share momentum — as the authored rule-breaker.
    retiredInto: 'mod_line_head_sympathy',
    id: 'tool_quantum_sympathy',
    name: 'Quantum Sympathy',
    price: 42000,
    damageType: 'emp',
    rof: 2,
    projSpeed: 320,
    impulsePerHit: 18,
    tumbleTorque: 4,
    impulseProvenance: 'quantum_sympathy',
    emergentPrimitive: 'quantum',
    emergentChain: { count: 1, range: 400 },
    lineageGenerationMax: EMERGENT_LIMITS.generationMax,
  }),
  gun({
    id: 'wpn_arc_caster',
    name: 'Arc Caster',
    price: 27000,
    damageType: 'emp',
    dmg: 8,
    rof: 2.4,
    dps: 19,
    range: 220,
    projSpeed: 360,
    heatPerShot: 6,
    impulsePerHit: 10,
    tumbleTorque: 1,
    impulseProvenance: 'arc_caster',
    emergentPrimitive: 'arc_caster',
    emergentChain: { count: 2, range: 80 },
    lineageGenerationMax: 3,
    description: 'A hit jumps to two more hulls in the pack.',
  }),
];

const BY_ID = new Map(EMERGENT_WEAPON_DEFS.map((def) => [def.id, def]));
const BY_KIND = new Map(EMERGENT_WEAPON_DEFS.map((def) => [def.emergentPrimitive, def]));

export function emergentWeaponDef(id) {
  return BY_ID.get(id) || null;
}

export function emergentWeaponByKind(kind) {
  return BY_KIND.get(kind) || null;
}
