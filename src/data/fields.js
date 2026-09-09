// PQ-012 / SF-12 — Continuous field kernel (data contract).
//
// ONE deterministic, finite-radius continuous-field primitive powers the five number-key
// powers (PQ-147.00): Well (pull), Repulsor (shove), Clearing Cone, Skim Collector (sheet),
// and Mass Seed (lock-ring). Every tuning number a reviewer needs lives here; the kernel
// (src/core/fields/fieldKernel.js) owns the pure math and the system (src/systems/fields.js)
// owns lifecycle/input/VFX. Volumes are cone, ring, or sheet — never a sphere. No continuous
// gravity is invented per-weapon — every power goes through the single kernel.
//
// Coupling & the "heavy ships must shrug" contract (brief req 2/13):
//   Δv per tick = impulse/mass = (a·mass·dt)/mass = a·dt — MASS-INDEPENDENT. So a bare acceleration
//   cap gives a heavy ship the same Δv as a light one. Heavy-shrug therefore lives in the COUPLING
//   term, which scales the effective acceleration DOWN with mass (a_effective = a_raw · couple(mass)).
//   The acceleration cap is a SEPARATE safety bound on the summed total, never the shrug mechanism.

export const FIELD_KINDS = Object.freeze({
  WELL: 'well',
  REPULSOR: 'repulsor',
  CONE: 'cone',
  SHEET: 'sheet',
});

// PQ-147.00 — field volumes are machines, not orbs. A sphere is a forbidden construction.
export const FIELD_VOLUMES = Object.freeze({ RING: 'ring', CONE: 'cone', SHEET: 'sheet' });
export const FIELD_VOLUME_IDS = Object.freeze([FIELD_VOLUMES.RING, FIELD_VOLUMES.CONE, FIELD_VOLUMES.SHEET]);

const VOLUME_BY_KIND = Object.freeze({
  [FIELD_KINDS.WELL]: FIELD_VOLUMES.RING,
  [FIELD_KINDS.REPULSOR]: FIELD_VOLUMES.RING,
  [FIELD_KINDS.CONE]: FIELD_VOLUMES.CONE,
  [FIELD_KINDS.SHEET]: FIELD_VOLUMES.SHEET,
  seed: FIELD_VOLUMES.RING,
  skim: FIELD_VOLUMES.SHEET,
});

/** Resolve a field's authored volume. Unknown kinds default to ring; never sphere. */
export function fieldVolumeOf(defOrKind) {
  if (defOrKind && typeof defOrKind === 'object') {
    const authored = defOrKind.volume;
    if (authored === FIELD_VOLUMES.RING || authored === FIELD_VOLUMES.CONE || authored === FIELD_VOLUMES.SHEET) {
      return authored;
    }
    return fieldVolumeOf(defOrKind.kind);
  }
  return VOLUME_BY_KIND[defOrKind] || FIELD_VOLUMES.RING;
}

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
// "curve the shot / vacuum the loot" reads, so they couple above 1. A Gravity-Marked body carries
// an earned combat-status response multiplier (PQ-026.01: 3× well/sink pull).
//
// markedMult is the status multiplier the combat kernel writes onto fieldResponseMult.
// markedCap is the ceiling on boosted coupling — it must sit at/above markedMult, or a Hornet
// medium (base 0.5 → 1.5) is silently clipped to 0.95 and the 3× well-golf never lands. A marked
// heavy still mass-classes (the base stays in the product) but is allowed to couple above a tiny
// unmarked body's 1.0 so the tag is a visible bend, not a shrug.
export const FIELD_COUPLING = Object.freeze({
  refMass: 12,            // at/under this solver mass → full coupling (1.0)
  minShipCouple: 0.05,    // floor: a heavy body still drifts slightly under a field
  projectileCouple: 1.35, // projectiles bend readily (the "curve the bullet" read)
  pickupCouple: 1.25,     // loose cargo/pickups vacuum in like a Tideline magnet
  markedMult: 3,          // Gravity Mark well/sink pull vs the unmarked twin
  markedCap: 3,           // ceiling on boosted coupling; must not clip markedMult
  boostCouple: 0.28,      // PQ-147.02 — Boost out: a boosting hull shrugs the field
});

// Conservative Hitch boost extra accel (wu/s^2) used by kernel escape proofs. Live flight may
// push harder; this is the floor the well/cone/sheet cannot beat when the Boost-out verb is on.
export const FIELD_ESCAPE_BOOST_ACCEL = 200;

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
  sheet: Object.freeze({
    bank: '#39d0ff', scoop: '#a6f0ff', pulse: '#eaffff', band: '#d7e6ff',
  }),
  seed: Object.freeze({
    ring: '#9fe8ff', core: '#2fc4ef', warning: '#ffc35c', pulse: '#eaffff',
  }),
});

// The five power definitions plus the enemy snare. radius R, strength = peak raw acceleration at the center
// (wu/s^2) before coupling, falloff = exponent on the (1 - r/R) ramp (>1 eases toward the edge;
// the outer band is the readable commitment margin), durationS = bounded lifetime, cooldownS =
// deploy recharge (runtime-only, non-serialized — a save/reload legitimately clears it).
export const FIELD_DEFS = Object.freeze({
  // WELL — "the Intake". Deployed at the aim point; pulls light bodies/projectiles/marked targets
  // inward while heavy ships shrug. PULL, never a stun sphere.
  well: Object.freeze({
    id: 'field_well_standard',
    kind: FIELD_KINDS.WELL,
    volume: FIELD_VOLUMES.RING,
    sentence: 'Drop a ring that pulls loose mass and shots into one pile; heavy hulls shrug it off.',
    radius: 190,
    strength: 240,
    // PQ-137.09 — CONVERGENCE, not a clamp. The kernel's radial term is `strength * fall` inward
    // and its velocity term is `-v * damping * fall`; both carry the SAME falloff and the SAME
    // coupling, so they cancel at exactly v = strength / damping, independently of where in the
    // well the body is and of how heavy it is. 240 / 5.3333 = 45.0 WU/s — the middle of the
    // leaf's 30-60 WU/s band. Nothing is clipped and no momentum is deleted: a body arriving
    // faster than 45 is decelerated by a force, a body slower is accelerated by one, and outside
    // the radius the term does not exist. A heavy takes longer to reach 45; it still reaches 45.
    // (The enemy anchorSnare below has always used this same term: 185 / 3.2 = 57.8 WU/s.)
    // src/systems/fields.js withholds the velocity sample from projectiles and pickups so the
    // "curve the shot / vacuum the loot" reads keep their pure positional bend.
    damping: 5.3333,
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
    volume: FIELD_VOLUMES.RING,
    sentence: 'Drop a ring under you that shoves everything out to a berm you can bowl into.',
    radius: 170,
    strength: 300,
    damping: 0,
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
    volume: FIELD_VOLUMES.CONE,
    sentence: 'Hold a forward wedge that plows a lane ahead of the nose.',
    radius: 260,
    strength: 260,
    damping: 0,
    falloff: 1.2,
    halfAngleRad: 0.56,   // ~32 degrees half-angle wedge
    edgeSoftRad: 0.14,    // angular ramp band at the wedge edge (readable, not a cliff)
    durationS: Infinity,  // sustained while toggled on
    cooldownS: 0,
    originGap: 10,        // wedge apex sits just ahead of the hull nose
  }),
  // SKIM COLLECTOR — Digit8. A ship-attached scoop SHEET (toggle). Harvests by grazing; pulls
  // loose mass onto the flight line. Not a spawned entity. PlanetRuntime owns collectorOn;
  // this def is the field volume + fitting sentence the rail and drills read.
  skim: Object.freeze({
    id: 'field_skim_standard',
    kind: FIELD_KINDS.SHEET,
    volume: FIELD_VOLUMES.SHEET,
    sentence: 'Open a scoop sheet and harvest by grazing a planet band.',
    radius: 220,
    halfWidth: 52,
    strength: 200,
    damping: 0,
    falloff: 1.15,
    durationS: Infinity,
    cooldownS: 0,
    originGap: 14,
  }),
  // MASS SEED — Digit4. A lock-RING around the thrown anchor. No continuous gravity (the seed
  // is a Rapier fixed body); the ring is the legible volume so it never reads as a glowing orb.
  seed: Object.freeze({
    id: 'field_seed_standard',
    kind: FIELD_KINDS.WELL,
    volume: FIELD_VOLUMES.RING,
    sentence: 'Throw a lock-ring that becomes an anchor you can hitch, then it collapses.',
    radius: 42,
    strength: 0,
    damping: 0,
    falloff: 1,
    durationS: Infinity,
    cooldownS: 8,
    hull: 60,
    emitterRadius: 7,
    // Hitch lock only — not standing gravity. A body latched to the seed is pulled into the
    // ring until the hitch is cut. Un-hitched bodies feel strength 0.
    lockStrength: 400,
  }),
  // ANCHOR SNARE — an enemy-hull anchored area-control field. It deliberately reuses the Well
  // kind/presentation and the same force owner, but adds bounded velocity damping to make the
  // radius feel like a drag/snare instead of a pure gravity well. The source hull is excluded;
  // escorts and the player are not.
  anchorSnare: Object.freeze({
    id: 'field_anchor_snare_standard',
    kind: FIELD_KINDS.WELL,
    volume: FIELD_VOLUMES.RING,
    radius: 235,
    strength: 185,
    damping: 3.2,
    falloff: 1.15,
    durationS: Infinity,
    spinupTicks: 45,
    maxAffected: 12,
  }),
});

// PQ-137.09 — "wells … prime on grind". A well converges hulls onto each other; when two of them
// have been scraping inside it long enough to read as one clump, the well hands them to the chain
// owner (src/systems/impulseCharges.js) as primed. Detection is the well's; the primed STATE has
// exactly one writer and it is not this file.
export const WELL_GRIND = Object.freeze({
  // Consecutive ticks of surface contact inside a well before it counts. 24 ticks = 0.4 s: a
  // clean bounce is not a grind, a converged clump is.
  ticks: 24,
  // Surface slack (WU) allowed when calling two hulls "in contact".
  contactSlackWu: 2,
  // Hardest bound on the pairwise scan. The well's own maxAffected already bounds membership;
  // this bounds the O(n^2) contact test regardless of how many bodies a stack of wells admits.
  maxPairBodies: 12,
});

// PQ-147.03 — cluster and detonate. A well plus a primed light (PQ-137.09) is one action; the
// well piles mass, the primed light is ammunition, and the moment is rated from receipts.
// Unmarked craft still converge in the 30–60 WU/s band. A primed light skips that velocity
// term so it arrives as a slam instead of parking in the clump.
export const WELL_CLUSTER = Object.freeze({
  flingTicks: 8,
  flingMinAccel: 18,
  minNeighbors: 2,
  secondaryKinds: Object.freeze(['other_body_hit', 'cargo_thrown', 'second_tumble', 'terrain_slam']),
});

// Exact lifecycle reasons a field teardown can carry (mirrors MASS_SEED_CUT_REASONS shape so the
// VFX/telemetry consumers speak one vocabulary).
export const FIELD_END_REASONS = Object.freeze({
  expired: 'field_expired',
  destroyed: 'field_destroyed',
  replaced: 'field_replaced',
  cleared: 'field_cleared',
  toggledOff: 'field_toggled_off',
  disrupted: 'field_disrupted',
});

// PQ-147.00 — the five number-key powers. Fitting-screen `sentence` answers "what can I do now?"
// Rail slots 4–8 already bind; this roster is the data the rail and drills read. Volume is never
// a sphere.
export const POWER_ROSTER = Object.freeze([
  Object.freeze({
    id: 'seed',
    defKey: 'seed',
    name: 'Mass Seed',
    action: 'deployMassSeed',
    railSlot: 4,
    volume: FIELD_VOLUMES.RING,
    sentence: FIELD_DEFS.seed.sentence,
    drillId: 'drill.power.seed',
  }),
  Object.freeze({
    id: 'well',
    defKey: 'well',
    name: 'Well',
    action: 'deployWell',
    railSlot: 5,
    volume: FIELD_VOLUMES.RING,
    sentence: FIELD_DEFS.well.sentence,
    drillId: 'drill.power.well',
  }),
  Object.freeze({
    id: 'repulsor',
    defKey: 'repulsor',
    name: 'Repulsor',
    action: 'deployRepulsor',
    railSlot: 6,
    volume: FIELD_VOLUMES.RING,
    sentence: FIELD_DEFS.repulsor.sentence,
    drillId: 'drill.power.repulsor',
  }),
  Object.freeze({
    id: 'cone',
    defKey: 'cone',
    name: 'Clearing Cone',
    action: 'toggleClearingCone',
    railSlot: 7,
    volume: FIELD_VOLUMES.CONE,
    sentence: FIELD_DEFS.cone.sentence,
    drillId: 'drill.power.cone',
  }),
  Object.freeze({
    id: 'skim',
    defKey: 'skim',
    name: 'Skim Collector',
    action: 'toggleSkimCollector',
    railSlot: 8,
    volume: FIELD_VOLUMES.SHEET,
    sentence: FIELD_DEFS.skim.sentence,
    drillId: 'drill.power.skim',
  }),
]);

/** Fitting-screen sentence for a power id (`well`, `seed`, …) or action name. */
export function fittingSentence(powerId) {
  const key = String(powerId || '');
  const row = POWER_ROSTER.find((p) => p.id === key || p.action === key || p.defKey === key);
  return row ? row.sentence : '';
}

// Non-colour identity for the five powers. Shape + motion carry the verb; never a sphere.
export const FIELD_VOLUME_GRAMMAR = Object.freeze({
  seed: Object.freeze({ volume: FIELD_VOLUMES.RING, silhouette: 'lock-ring', motion: 'pulse-lock' }),
  well: Object.freeze({ volume: FIELD_VOLUMES.RING, silhouette: 'contracting-rings', motion: 'inward-spiral' }),
  repulsor: Object.freeze({ volume: FIELD_VOLUMES.RING, silhouette: 'expanding-berm', motion: 'outward-ribs' }),
  cone: Object.freeze({ volume: FIELD_VOLUMES.CONE, silhouette: 'forward-wedge', motion: 'through-flow' }),
  skim: Object.freeze({ volume: FIELD_VOLUMES.SHEET, silhouette: 'scoop-band', motion: 'lateral-collect' }),
});

// PQ-147.02 — one named escape verb per power. The player is never trapped without a verb.
export const FIELD_ESCAPES = Object.freeze({
  well: Object.freeze({
    id: 'well',
    verb: 'boost_out',
    name: 'Boost out',
    sentence: 'Hold boost and fly out of the ring; a well cannot keep a boosting hull.',
  }),
  repulsor: Object.freeze({
    id: 'repulsor',
    verb: 'cut_emitter',
    name: 'Cut the emitter',
    sentence: 'Shoot the plow emitter; the shove dies the same tick.',
  }),
  cone: Object.freeze({
    id: 'cone',
    verb: 'sidestep',
    name: 'Sidestep',
    sentence: 'Strafe out of the wedge; a cone only owns the lane ahead.',
  }),
  skim: Object.freeze({
    id: 'skim',
    verb: 'out_mass',
    name: 'Out-mass',
    sentence: 'Hitch heavy mass and the scoop shrugs; a light hull stays glued to the sheet.',
  }),
  seed: Object.freeze({
    id: 'seed',
    verb: 'cut_hitch',
    name: 'Cut the hitch',
    sentence: 'Cut the lock-ring hitch; the Hitch is free the moment the line goes.',
  }),
});

/** Named escape for a power id (`well`, `seed`, …) or action name. */
export function fieldEscapeOf(powerId) {
  const key = String(powerId || '');
  if (FIELD_ESCAPES[key]) return FIELD_ESCAPES[key];
  const row = POWER_ROSTER.find((p) => p.id === key || p.action === key || p.defKey === key);
  return row ? FIELD_ESCAPES[row.id] || null : null;
}
