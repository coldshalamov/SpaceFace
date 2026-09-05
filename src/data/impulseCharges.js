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
    // PQ-137.09 — 42 -> 84. THE NUMBER, and why it moved. A plate is a physical object stuck to a
    // physical face: `_tryStick` can seat it up to hostRadius + chargeRadius + stickRadius from
    // its host's centre (21.2 WU on a light hull), and a hull the host then slams into has its
    // centre a further hostRadius + victimRadius (28 WU) away. Worst case — the plate on the far
    // face — the blast has to cross 49.2 WU just to reach the centre of the ship it was carried
    // into. At radius 42 it never got there: MEASURED on seed 4242, a plate stuck to the aft face
    // of a wasp shoved at 57.5 WU/s into another wasp delivered 7.4 WU/s to the ship it hit
    // (0.07 of the stun law's threshold) and the chain fired on a BYSTANDER instead. Priming that
    // victim needs falloff >= 0.294, i.e. radius >= 49.2 / 0.706 = 69.7; 84 is that with margin
    // and no knife edge, and it is unchanged at the centre — 800 / mass, exactly as before — so
    // every bar written "at the centre" reads the same number it always did.
    radius: 84,
    falloff: 'linear',
    maxActive: 4,
    cargoVolume: 2,
    price: 180,
  },
};

// PQ-137.09 "Chains go off" — the authored numbers for the chain reaction.
//
// The rules themselves live in src/systems/impulseCharges.js and reuse the ONE hitstun law
// (src/combat/impulseKernel.js resolveHitstunLaw) and the ONE slam threshold
// (COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV). Nothing here invents a second threshold: the only
// numbers below are the prime WINDOW, the sympathetic YIELD, and the bounds that keep a chain
// finite.
export const CHAIN_REACTION = Object.freeze({
  // How long a hull stays cooked after a blast knocks it past the stun threshold. The leaf's
  // number ("~0.8 s"). Short on purpose: a chain has to be a chain, not a fuse that burns for a
  // whole fight. Tick-quantized by the consumer so a prime never straddles a frame.
  primeWindowS: 0.8,
  // A sympathetically detonating hull is not carrying a plate — it is the hull's own ordnance and
  // drive cooking off. It answers with less than the plate that started it, so a chain decays
  // instead of running away: three links is a spectacle, thirty is a bug.
  sympatheticYield: Object.freeze({
    impulse: 0.7,
    damage: 0.7,
    radius: 0.85,
  }),
  // Hard bounds. Work per tick is bounded by the number of slams the consequence kernel published
  // that tick; these keep a pathological pile-up from turning into unbounded blast queries.
  maxSlamsPerTick: 8,
  maxPrimedBodies: 24,
  // Yield decays with link depth (yield^link), so a chain terminates on its own arithmetic; this
  // is the hard stop behind that, not the mechanism.
  maxLinks: 4,
});

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