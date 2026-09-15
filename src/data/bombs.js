// Drift-bomb ordnance definitions — the "bomb bay" combat verb.
// Pure data; consumed by src/systems/bombs.js. No imports (house rule for src/data).
//
// A drift bomb is RELEASED ordnance, not thrown ordnance: it leaves the bay at the ship's
// CURRENT velocity (full momentum inheritance — the same law as a cut-loose cargo plate), then
// coasts under a very low drag so it keeps travelling roughly with the ship and slowly falls
// behind as the ship keeps thrusting. Veer off and the bomb keeps going. The fuze is proximity
// (hostiles only) or time; the payload is the verb.
//
// Impulse derivations reuse the impulse-charge reference masses (src/data/ships.js):
//   ship_pelican (tier-1 mid miner): mass 32 — the "25 wu/s feel target" hull
//   ship_drifter (tier-2 multirole): mass 48
// Δv at falloff 1 = impulse / mass, linear falloff Δv(r) = impulse × (1 − r/radius) / mass.
// FEEL_CONTRACT bars this family answers: radial mine 45% of light cruise at centre; the
// concussion drum is the deliberate "radial mine +" — the biggest shove in the bay.

// The shared drift law. Every number here is read by src/systems/bombs.js every tick.
export const BOMB_DRIFT = Object.freeze({
  // Exponential velocity decay per second: v(t) = v0 · e^(−drag·t). 0.14/s means a dropped bomb
  // still carries 66% of release speed after 3 s and 50% after ~5 s — "floats, falls behind
  // slowly". The player (still thrusting) walks away from it; a coasting player keeps pace.
  // This is the single knob for "how fast do bombs slow down".
  dragPerS: 0.14,
  // Release standoff behind the hull, along the current velocity heading (or the nose when
  // nearly stationary). Just enough clearance that the bay door does not spawn inside the hull.
  dropStandoffWu: 7,
  // Global bay cap across all payloads. Bounds the per-tick bucket scan and the worst-case
  // simultaneous field effects; the bay evicts the OLDEST live bomb past this count.
  maxActive: 6,
  // Seconds after release before the proximity fuze goes live. Gives the bomb time to clear
  // friendly hulls flying in formation with the dropper; the owner is excluded from the trigger
  // scan regardless, so this is about wingmen and pursuers, not self-defence.
  armS: 0.5,
  // Authored tumble rate (rad/s) — the drift read. Sign is fixed per entity id so two bombs from
  // one salvo tumble opposite ways without rng (determinism: no Math.random in sim).
  maxSpinRadS: 1.7,
});

// Payload catalog. Eight combat verbs, one bay. `impulse` is total radial impulse at falloff 1
// (linear falloff to the radius); `damage` is the routed scalar before falloff; `statuses` ride
// the damage packet through the one damage router. `field` payloads persist as a volume instead
// of resolving instantly — see src/systems/bombs.js `_beginField`/`_tickField`.
//
// Cooldown scale: bay-rhythm numbers (1.2-3.5 s). The verb's fantasy is laying a TRAIL during a
// chase — drop at speed, veer off, let them cook behind you — so a drop must cost meaningfully
// less than a fuze (6 s). On short-fuze payloads the fuze bounds concurrency before maxActive
// does; the bay cap is the safety bound for field payloads and future cooldown modules.
export const BOMB_DEFS = Object.freeze({
  // 1. The baseline killing verb. Between the W03 mine (42) and the sticky charge (12) in yield,
  // with enough impulse to hurl the wreck it makes.
  bomb_frag: Object.freeze({
    id: 'bomb_frag',
    name: 'Frag cassette',
    sentence: 'A drifting frag cassette: proximity or fuze, then a clean killing blast.',
    cooldownS: 1.2,
    fuzeS: 6,
    triggerRadius: 44,
    radius: 96,
    impulse: 420,          // ≈13 wu/s on a pelican — the corpse flies, the target dies
    damage: 30,            // the damage verb of the bay; explosive channel split 65/35
    damageType: 'explosive',
    statuses: [],
    visual: Object.freeze({ language: 'studded-frag-cassette', core: '#ffd9a8', accent: '#ff8a3a' }),
    audioCue: 'sfx_explosion_small',
  }),

  // 2. The pure shove. Zero damage by design (the vector-mine law: an impulse payload whose
  // damage is a bug, not a feature). FEEL_CONTRACT's radial-mine bar is 45% of light cruise at
  // centre (~24 wu/s on the pelican reference); the drum pays ~56 wu/s — the room-clearing
  // mobility/comedy verb, balanced by the longest cooldown in the bay.
  bomb_concussion: Object.freeze({
    id: 'bomb_concussion',
    name: 'Concussion drum',
    sentence: 'A pure shove: hurls hulls and debris, hurts nothing.',
    cooldownS: 1.6,
    fuzeS: 5,
    triggerRadius: 52,
    radius: 130,
    impulse: 1800,         // ≈56 wu/s on a pelican at contact; heavies shrug by mass
    damage: 0,
    damageType: 'explosive',
    statuses: [],
    visual: Object.freeze({ language: 'wide-shove-drum', core: '#d7e6ff', accent: '#39d0ff' }),
    audioCue: 'sfx_explosion_small',
  }),

  // 3. THE NEUTRON SLUG — the moving, decaying gravity source PHYSICAL_PLAY_GRAMMAR proposed
  // ("the Well is static"). It does not blast on arrival: it detonates INTO a short-lived pull
  // that keeps drifting with the bomb's momentum, dragging ship-likes into a clump with crush
  // ticks, then collapses with a modest outward snap. Heavy hulls shrug via the SAME coupling
  // curve as the field kernel (a·mass·dt through queuePhysicsImpulse — never a velocity write).
  bomb_singularity: Object.freeze({
    id: 'bomb_singularity',
    name: 'Neutron slug',
    sentence: 'A moving, decaying gravity source: drags a room into a clump and crushes it.',
    cooldownS: 3.5,
    fuzeS: 4.5,
    triggerRadius: 40,
    radius: 150,
    impulse: 0,
    damage: 0,
    damageType: 'plasma',
    statuses: [],
    field: Object.freeze({
      kind: 'singularity',
      durationS: 2.8,       // the leaf's "decaying" — short, legible, escape-priced
      // Peak pull acceleration at the source before coupling (wu/s^2), linear falloff to radius.
      strength: 300,
      // Crush tick cadence (ticks, 60 Hz) and per-tick damage inside the inner band. 8 × 6 = 48
      // total plasma at full residence — the kill comes from the clump, not the slug.
      tickEveryTicks: 30,
      crushDamage: 6,
      crushInnerRadius: 60,
      // Collapse snap on field end: outward impulse + a small closing damage packet.
      collapseImpulse: 500,
      collapseDamage: 16,
    }),
    visual: Object.freeze({ language: 'gyro-neutron-slug', core: '#a6f0ff', accent: '#39d0ff' }),
    audioCue: 'sfx_explosion_small',
  }),

  // 4. The slow + DoT verb. Bursts into a lingering tar volume that re-applies status_goo
  // (src/data/combatDefs.js): thrust-degraded wallow via physicsResponse.massScale + corrosive
  // periodic damage. The volume is the bomb entity persisting through its field phase.
  bomb_goo: Object.freeze({
    id: 'bomb_goo',
    name: 'Tarburst bladder',
    sentence: 'Bursts into clinging tar: thrust dies, hull corrodes.',
    cooldownS: 2.5,
    fuzeS: 6,
    triggerRadius: 40,
    radius: 110,
    impulse: 0,
    damage: 6,             // the splat itself stings once; the verb is the status
    damageType: 'kinetic',
    statuses: [{ id: 'status_goo', stacks: 2 }],
    field: Object.freeze({
      kind: 'goo',
      durationS: 5,
      tickEveryTicks: 30,   // re-apply cadence while inside: refresh duration, build stacks
      applyStacks: 1,
    }),
    visual: Object.freeze({ language: 'tarburst-bladder', core: '#d8e88a', accent: '#7ac043' }),
    audioCue: 'bombs.goo.burst',
  }),

  // 5. The disable verb. Pure ion pulse: couples through shields (shieldBypass 1.0) and routes
  // to subsystems (subsystemShare 0.85) — drive/weapon/power go dark, ionized stacks flatten
  // cap regen. The direct-fire EMP disruptor's delivered cousin.
  bomb_emp: Object.freeze({
    id: 'bomb_emp',
    name: 'Static bomb',
    sentence: 'A pure ion pulse through the shields: subsystems dark, capacitors flat.',
    cooldownS: 1.5,
    fuzeS: 5,
    triggerRadius: 46,
    radius: 72,
    impulse: 120,          // a static crackle shoves nothing; this is a nudge, not a throw
    damage: 26,            // 'emp' channel: pure ion, subsystemShare does the routing
    damageType: 'emp',
    subsystemShare: 0.85,
    shieldBypass: 1.0,
    statuses: [{ id: 'status_ionized', stacks: 2 }],
    visual: Object.freeze({ language: 'coil-lattice-static', core: '#b48cff', accent: '#6f8dff' }),
    audioCue: 'bombs.emp.pulse',
  }),

  // 6. The burn verb. Reuses the standing burning status (stacking DoT): the splash is modest,
  // what it sticks to keeps paying. Pairs with the goo (slow) and the frag (kill) as the third
  // attrition payload with a different clock.
  bomb_thermite: Object.freeze({
    id: 'bomb_thermite',
    name: 'Thermite starter',
    sentence: 'Splashes burning thermite: everything in the splash keeps burning.',
    cooldownS: 1.5,
    fuzeS: 6,
    triggerRadius: 44,
    radius: 104,
    impulse: 260,
    damage: 20,
    damageType: 'thermal',
    statuses: [{ id: 'status_burning', stacks: 2 }],
    visual: Object.freeze({ language: 'vented-thermite-canister', core: '#ffb35c', accent: '#ff5a2a' }),
    audioCue: 'sfx_explosion_small',
  }),

  // 7. The destabilize verb. A wild impulse plus the standing tumbling status — the target's
  // own drive becomes the weapon (dash/tether/weapon verbs lock out while it tumbles). The
  // cheapest control payload; the shove is the setup, the tumble is the payoff.
  bomb_scrambler: Object.freeze({
    id: 'bomb_scrambler',
    name: 'Havoc pod',
    sentence: 'A wild impulse and a scramble: drives tumble, verbs lock out.',
    cooldownS: 3.0,
    fuzeS: 5,
    triggerRadius: 46,
    radius: 82,
    impulse: 520,
    damage: 4,
    damageType: 'kinetic',
    statuses: [{ id: 'status_tumbling', stacks: 1 }],
    visual: Object.freeze({ language: 'irregular-havoc-pod', core: '#ff8ad8', accent: '#d86fff' }),
    audioCue: 'sfx_explosion_small',
  }),

  // 8. The pin verb. Applies the standing PINNED physicsResponse (massScale ×6): the caught hull
  // becomes six times the mass to every force that touches it — thrust, fields, impacts — while
  // its momentum is preserved. It does not stop; it WALLLOWS. The counter-mobility verb.
  bomb_anchor: Object.freeze({
    id: 'bomb_anchor',
    name: 'Ballast slug',
    sentence: 'Welds a hull to its own inertia: six times the mass, half the ship.',
    cooldownS: 2.0,
    fuzeS: 6,
    triggerRadius: 44,
    radius: 88,
    impulse: 180,
    damage: 10,
    damageType: 'kinetic',
    statuses: [{ id: 'status_pinned', stacks: 1 }],
    visual: Object.freeze({ language: 'dense-ballast-slug', core: '#5ad8c8', accent: '#2fa898' }),
    audioCue: 'sfx_explosion_small',
  }),
});

// Cycle order (the bay's Comma-key order). Frozen array; index arithmetic in the system.
export const BOMB_IDS = Object.freeze(Object.keys(BOMB_DEFS));

export function bombDef(id) {
  return BOMB_DEFS[id] || BOMB_DEFS.bomb_frag;
}
