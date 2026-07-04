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