// Wave-2 feature flags (design/revamp/WAVE2_PROMPT.md, REVAMP_MASTER §3 determinism contract).
//
// ORCHESTRATOR-OWNED. Lanes *request* a flag name here; they never add their own. These gate new
// sim-affecting combat behavior so the deterministic 47-A golden (run headless under node, where
// `window` is undefined) stays byte-identical while browser sessions get the live-play behavior.
//
// Determinism model (Fable Tier B): each flag DEFAULTS to `typeof window !== 'undefined'` — i.e. OFF
// in the node sim/golden, ON in the browser. This mirrors the proven weapons.js forced-vent guard,
// but as a *mutable module export* rather than an inline `typeof window` check, so a headless smoke
// test can opt in (`COMBAT_FLAGS.missileV2 = true`) and exercise the flagged path deterministically.
// The sim never branches on `window` directly through these — it reads the flag value, which the test
// harness can override. Nothing here draws RNG or touches state; importing this module is a no-op
// beyond setting three booleans, so it can never perturb the golden by mere presence.

const IS_BROWSER = typeof window !== 'undefined';

export const COMBAT_FLAGS = {
  // Missile LOS-tracking + finite fuel then break-and-coast (BP-02). Rewrites missile flight, so it is
  // OFF in the golden and ON in the browser. Purely geometric/kinematic — draws no RNG.
  missileV2: IS_BROWSER,
  // Scanning reveals a weak point on large hostiles; hitting its arc does bonus damage (BP-02). The
  // damage MULTIPLIER is the only sim-side effect and is flag-gated here; the *reveal* state lives in a
  // UI-side store keyed by entity id (never written onto the sim entity — telemetry-field safety).
  weakPoints: IS_BROWSER,
  // Projectile momentum inheritance (BP-02 "weighty strafing runs"). This INVERTS the deliberate
  // aim-true lateral-compensation currently in weapons.js, and couples with the lead-pip ballistic
  // model, so it stays OFF everywhere this wave (a feel gamble that can't be tuned/verified in one
  // session). Kept as a flag so it can be enabled and playtested later without touching the fire path.
  momentumInherit: false,
};

/** Read a combat flag by name; unknown names read false. Pure. */
export function combatFlag(name) {
  return !!COMBAT_FLAGS[name];
}
