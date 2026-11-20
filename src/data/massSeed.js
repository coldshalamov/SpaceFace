// PQ-011 / SF-11 — Deployable Anchor Mass Seed (data contract).
//
// A contained-mass/frame-lock device: launched as a bounded projectile, it travels a fixed,
// deterministic trajectory, locks into the local frame as a STATIC Rapier anchor (never an
// ordinary body with astronomical mass), serves as a Massline tether anchor for a bounded
// lifetime, then collapses. No continuous gravity field — that is SF-12/PQ-012 scope.
//
// Every number a reviewer needs lives here; the system (src/systems/massSeed.js) owns behavior.

export const MASS_SEED_DEF = Object.freeze({
  id: 'mass_seed_standard',
  version: 1,

  // Physical footprint. Asteroid-readable at gameplay zoom; small enough to deploy past.
  radius: 7,
  // Counterplay hull: a few focused hits destroy it. Friendly fire is ON (mines/charges parity).
  hull: 60,

  // Travel phase: bounded, fully deterministic ballistic deployment. lockPos is an exact pure
  // function of (spawnPos, dir, travelSpeed, travelTimeS) published at deploy time — the HUD's
  // intended-lock marker is therefore truthful, never a prediction that can drift.
  travelSpeed: 260,          // wu/s — with travelTimeS this sets the Pin's REACH (416 wu), not its speed
  travelTimeS: 1.6,          // s → max reach ~416 wu from the launch point
  // R17 / 03 §4 "a bolt that reaches the cursor in ≤ 0.5 s": the post locks AT the cursor
  // (clamped to the reach above and a short minimum), flying at this speed. 416 wu ≈ 0.46 s.
  boltSpeed: 900,
  minReach: 40,
  spawnGap: 3,               // extra clearance beyond hull+seed radii at launch

  // Frame-lock acquisition: the seed is already static (solid fixed body) but NOT yet
  // tether-eligible while the frame clamps spin up. Deterministic duration.
  lockingS: 0.3,

  // Active anchor lifetime + expiry warning window (both readable, non-color-only).
  anchorTtlS: 30,
  warningS: 6,

  // Collapse beat after expiry/destruction/replacement: tether already cut through the
  // attachment authority, contacts off, then the entity despawns.
  collapseS: 0.45,

  // Deploy cooldown after the LAST seed leaves the field. Persisted on the player blob so a
  // save/Continue cannot launder it; replacement deploys do not restart it.
  cooldownS: 8,

  // Active-seed cap. One seed keeps the tactical read ("THE anchor") and bounds physics work.
  maxActive: 1,

  // The anchor's EFFECTIVE containment mass. Truth: the locked body is a Rapier FIXED body, so
  // no solver ever divides by this number — the anchor is immovable by construction, exactly
  // like an asteroid, not by inertia. This value exists for the Massline scoring contract's
  // massive-anchor band (src/combat/masslineTargetScoring.js, MASSIVE_ANCHOR_MIN_MASS = 1800)
  // so selection grammar can classify the seed as an anchor candidate. It is NOT fed to Rapier.
  effectiveMass: 2000,
  // Save-safe authored body mass. Fixed bodies ignore mass in the solver; kept ordinary.
  bodyMass: 40,

  // Deterministic cosmetic spin while travelling (rad/s). Render-only; zero at lock.
  travelSpinRadS: 2.4,

  // R17: Pin cast ON a body stakes that body to the point where the bolt hits it. A critically
  // damped spring holds it (it strains against the stake: its own thrust and any hit fight a
  // capped acceleration), so it is a sitting duck for a thrown rock. Heavies shrug sooner: the
  // hold lasts holdS × clamp(sqrt(refMass / mass), minScale, maxScale) and the cap on the
  // stake's acceleration falls as accelRef × accelRefMass / mass.
  stake: Object.freeze({
    pickPad: 16,             // wu beyond the body's radius that still counts as "on" it
    holdS: 3,
    refMass: 40,             // t: the mass that gets exactly holdS
    minScale: 0.35,          // a 330 t hulk: ~1 s
    maxScale: 1.5,           // anything ≤ 18 t: 4.5 s
    omega: 7,                // 1/s: spring natural frequency (critically damped)
    accelRef: 900,           // wu/s² the stake can apply to a body of accelRefMass
    accelRefMass: 16,        // t (a Wasp)
    accelMin: 60,            // wu/s²: even a capital feels the stake
    cooldownS: 5,
  }),
});

// Canonical lifecycle phases (bounded state machine; transitions only forward, plus collapse
// from any live phase and idle from any phase via lifecycle clears).
export const MASS_SEED_PHASES = Object.freeze([
  'idle',
  'travel',
  'locking',
  'active',
  'warning',
  'collapsing',
]);

// Exact attachment-cut reasons. tetherGameplay surfaces these through tether:broke so the
// player always learns WHY the line went away.
export const MASS_SEED_CUT_REASONS = Object.freeze({
  expired: 'seed_expired',
  destroyed: 'seed_destroyed',
  replaced: 'seed_replaced',
  cleared: 'seed_cleared',
});
