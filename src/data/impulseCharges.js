// Impulse charge ("blast plate") definitions — GDD §4.4.
// Pure data; consumed by src/systems/impulseCharges.js.

// impulse derivation (mass from src/data/ships.js):
//   ship_pelican (tier-1 mid miner): mass = 32
//   ship_drifter (tier-2 multirole): mass = 48
// Target Δv ≈ 25 wu/s at stick/contact (falloff = 1): impulse = Δv × mass.
//   Pelican: 25 × 32 = 800  → ~25 wu/s at contact
//   Drifter: 25 × 48 = 1200 → ~25 wu/s at contact
// We use 800 so the tier-1 mid reference (Pelican) hits the 25 wu/s feel target; Drifter gets ~17 wu/s.
// Linear falloff: Δv(r) = impulse × (1 − r/radius) / mass.

export const IMPULSE_CHARGES = {
  charge_standard: {
    throwSpeed: 120,
    stickRadius: 6,
    armTimeS: 6, // throw cooldown between lobs (GDD §4.4) — NOT post-stick arm delay
    impulse: 800,
    damage: 12,
    radius: 42,
    falloff: 'linear',
    maxActive: 4,
    cargoVolume: 2,
    price: 180,
  },
};

// Massline combo modifiers (rung 16) — the signature moves that pair a charge detonation with
// massline state. Consumed by impulseCharges.js; gates read sim state only (deterministic).
// Tangential thresholds derive from the massline feel bar: 25 wu/s is the SNAP_CATCH "genuinely
// moving" floor (masslineTelemetry.js); slingBomb demands a real swing at 1.6× that.
export const MASSLINE_COMBOS = {
  // Detonate a charge stuck to your OWN tether anchor: the line channels the blast into a
  // directed kick along the tether line (player → anchor), amplified. The "slingshot bomb."
  anchorKick: {
    impulseMult: 1.5, // vs the plain radial blast at the same falloff
  },
  // Detonate while the massline swing is genuinely fast: the whole blast is amplified
  // (impulse + damage). Rewards swing-then-bomb timing.
  slingBomb: {
    minTangentialSpeed: 40, // wu/s — 1.6× the snap-catch bar; a lazy swing earns nothing
    impulseMult: 1.35,
    damageMult: 1.5,
  },
  // Cut the line and detonate on the same tick: a defensive escape burst — backward impulse on
  // the player along the line, away from the anchor. The "escape move." (The cut itself stays
  // tetherGameplay's — impulseCharges only reads the same-tick cut intent.)
  tailPop: {
    impulse: 1400, // world-units impulse on the player (Δv ≈ impulse / ship mass)
  },
};