// PQ-012 / SF-12 — Continuous field kernel (data contract).
//
// ONE deterministic, finite-radius continuous-field primitive powers three consumers: an
// attractive Well (pull), a Repulsor (outward push), and a directional Clearing Cone (the
// "gravitic snowplow"). Every tuning number a reviewer needs lives here; the kernel
// (src/core/fields/fieldKernel.js) owns the pure math and the system (src/systems/fields.js)
// owns lifecycle/input/VFX. No continuous gravity is invented per-weapon — all three go through
// the single kernel (BUILD_PLAN_CORRECTED STEP 11 / SF-12).
//
// Coupling & the "heavy ships must shrug" contract (brief req 2/13):
//   Δv per tick = impulse/mass = (a·mass·dt)/mass = a·dt — MASS-INDEPENDENT. So a bare acceleration
//   cap gives a heavy ship the same Δv as a light one. Heavy-shrug therefore lives in the COUPLING
//   term, which scales the effective acceleration DOWN with mass (a_effective = a_raw · couple(mass)).
//   The acceleration cap is a SEPARATE safety bound on the summed total, never the shrug mechanism.

export const FIELD_KINDS = Object.freeze({ WELL: 'well', REPULSOR: 'repulsor', CONE: 'cone' });

// FIELD_FLAGS — Tier-B determinism gate (same idiom as src/data/featureFlags.js:15-45, but
// co-located with the feature to respect that file's "orchestrator-owned, lanes never add their
// own" rule). Defaults OFF under node (the 47a golden runs headless with `window` undefined) and
// ON in the browser, so the deterministic golden stays byte-identical while live play gets the
// feature. Mutable export so a headless smoke/integration test can opt in
// (`FIELD_FLAGS.enabled = true`); read at CALL TIME, never cached at init. This is golden-safety
// layer (b): the fields system is a strict no-op while `enabled` reads false. Layer (a) is that
// `fields` is absent from sf-sim.mjs's curated systems list; layer (c) is that nothing auto-spawns
// a field on the 47a route (deploy is player-input-only). No SCENARIO pin is needed because the
// system can never reach the golden through any of the three layers.
const IS_BROWSER = typeof window !== 'undefined';
export const FIELD_FLAGS = { enabled: IS_BROWSER };
/** Read a field flag by name; unknown names read false. Pure. */
export function fieldsFlag(name) { return !!FIELD_FLAGS[name]; }

// Coupling model. Bodies at/under refMass feel the field fully; heavier bodies shrug in
// proportion (massCouple = refMass / max(mass, refMass)), floored so even a capital ship drifts
// a little (a shrug, never total immunity). Projectiles and pickups are light + are the marquee
// "curve the shot / vacuum the loot" reads, so they couple above 1. A MARKED body (the player's
// painted target — read-only, never a new targeting vocabulary) grabs harder but a marked heavy
// still shrugs versus a light body.
export const FIELD_COUPLING = Object.freeze({
  refMass: 12,            // at/under this solver mass → full coupling (1.0)
  minShipCouple: 0.05,    // floor: a heavy body still drifts slightly under a field
  projectileCouple: 1.35, // projectiles bend readily (the "curve the bullet" read)
  pickupCouple: 1.25,     // loose cargo/pickups vacuum in like a Tideline magnet
  markedBoost: 1.9,       // painted-target coupling multiplier
  markedCap: 0.55,        // a marked heavy still shrugs — capped well under a light body's 1.0
});

// Global safety bound on the SUMMED acceleration a single body may receive from all overlapping
// fields in one tick. This is the "capped acceleration" of req 1 — a bound, not the shrug. Sits
// above any single field's peak so a lone field is never clipped, but stacked fields cannot fling.
export const FIELD_MAX_ACCEL = 820; // wu/s^2

// Hard ceiling on simultaneously-registered fields. Bounds spatial-hash queries (one bounded
// queryRadius per active field per tick) and keeps the tactical read legible.
export const FIELD_MAX_ACTIVE = 6;

// Shared VFX palette — locked anchors from design/vfx/FIELD_TOOL_READABILITY_BIBLE.md §3.2. The
// gradient DIRECTION is the palette-level discriminator (Well: cool rim → hot sink; Repulsor: hot
// core → cool rim; Cone: utility-teal lane). Boundary elements are non-blooming by construction.
export const FIELD_PALETTE = Object.freeze({
  well: Object.freeze({
    filament: '#39d0ff', core: '#a6f0ff', coreHot: '#eaffff', rim: '#d7e6ff', hostile: '#ffb35c',
  }),
  repulsor: Object.freeze({
    core: '#fff2d0', coreWarm: '#ffb35c', rib: '#ffc878', ribCool: '#39d0ff', berm: '#d7e6ff',
  }),
  cone: Object.freeze({
    bank: '#39d0ff', chevron: '#39d0ff', pulse: '#eaffff', hazard: '#ffb35c',
  }),
});

// The three consumer definitions. radius R, strength = peak raw acceleration at the center
// (wu/s^2) before coupling, falloff = exponent on the (1 - r/R) ramp (>1 eases toward the edge;
// the outer band is the readable commitment margin), durationS = bounded lifetime, cooldownS =
// deploy recharge (runtime-only, non-serialized — a save/reload legitimately clears it).
export const FIELD_DEFS = Object.freeze({
  // WELL — "the Intake". Deployed at the aim point; pulls light bodies/projectiles/marked targets
  // inward while heavy ships shrug. PULL, never a stun sphere.
  well: Object.freeze({
    id: 'field_well_standard',
    kind: FIELD_KINDS.WELL,
    radius: 190,
    strength: 240,
    falloff: 1.6,
    durationS: 9,
    cooldownS: 7,
    hull: 42,           // shootable deployed device — counterplay (destroying it unregisters the field)
    emitterRadius: 6,
    deployRange: 520,   // max distance from ship the aim-point emitter may be placed
    spawnGap: 3,
  }),
  // REPULSOR — "the Plow". Dropped at the ship (behind you mid-chase); shoves bodies outward and
  // piles them at the boundary.
  repulsor: Object.freeze({
    id: 'field_repulsor_standard',
    kind: FIELD_KINDS.REPULSOR,
    radius: 170,
    strength: 300,
    falloff: 1.3,
    durationS: 7,
    cooldownS: 8,
    hull: 42,
    emitterRadius: 6,
    spawnGap: 3,
  }),
  // CONE — "the Sluice". A player-attached sustained forward wedge (toggle). Follows ship heading;
  // clears a lane ahead. Not a spawned entity — its source is the player ship, so it ends on
  // toggle-off, undock, death, sector change. No cooldown; it is a held tool, not a thrown one.
  cone: Object.freeze({
    id: 'field_cone_standard',
    kind: FIELD_KINDS.CONE,
    radius: 260,
    strength: 260,
    falloff: 1.2,
    halfAngleRad: 0.56,   // ~32 degrees half-angle wedge
    edgeSoftRad: 0.14,    // angular ramp band at the wedge edge (readable, not a cliff)
    durationS: Infinity,  // sustained while toggled on
    cooldownS: 0,
    originGap: 10,        // wedge apex sits just ahead of the hull nose
  }),
});

// Exact lifecycle reasons a field teardown can carry (mirrors MASS_SEED_CUT_REASONS shape so the
// VFX/telemetry consumers speak one vocabulary).
export const FIELD_END_REASONS = Object.freeze({
  expired: 'field_expired',
  destroyed: 'field_destroyed',
  replaced: 'field_replaced',
  cleared: 'field_cleared',
  toggledOff: 'field_toggled_off',
});
