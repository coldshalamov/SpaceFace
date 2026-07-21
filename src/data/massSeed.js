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
  travelSpeed: 260,          // wu/s
  travelTimeS: 1.6,          // s → lock ~416 wu from the launch point
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
