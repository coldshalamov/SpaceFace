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
  // Massline whip damage (T3-14): a solid/crushing whip-impact (masslineImpacts' tether:whipImpact)
  // routes momentum-scaled kinetic damage to the struck body through the combat kernel. Sim-affecting
  // (new hull damage), so OFF in the node golden and ON in the browser. The whip FEEDBACK (cue) is
  // unconditional; only the damage half sits behind this flag — it's a tuning knob, not the feature.
  whipDamage: IS_BROWSER,
  // Universal weapon impulse + collision consequences (PQ-009). Weapon packets always retain their
  // authored identity, but applying their linear/angular impulse and the downstream contact payoff
  // is OFF in node fixtures and ON in live browser play. The 47-A harness also pins this OFF
  // explicitly so its firing tape remains on the frozen phase-0 movement contract.
  weaponImpulseConsequences: IS_BROWSER,
};

/** Read a combat flag by name; unknown names read false. Pure. */
export function combatFlag(name) {
  return !!COMBAT_FLAGS[name];
}

// Massline Physics Identity (Wave M2, design/revamp/MASSLINE_PHYSICS_IDENTITY.md).
// Same Tier-B determinism model as COMBAT_FLAGS: every flag defaults to IS_BROWSER (OFF in the
// node golden/sim harness, ON in live browser play), is a mutable module export so headless smoke
// tests can opt in (`MASSLINE2_FLAGS.throw = true`), and is read at call time — never cached at
// init. `enabled` is the master switch ANDed into every read so one flip can dark the whole wave.
export const MASSLINE2_FLAGS = {
  enabled: IS_BROWSER,
  // Tether-lock fire control (§3.1): tethered hostile = auto-aim via the constrained-motion
  // solver + solution-gated shot release. Touches the weapons.js player fire path (the golden
  // runs weapons), so this flag is load-bearing, not just discipline.
  fireControl: IS_BROWSER,
  // Throw system (§3.3/§4.1): RMB-while-latched throw-arm, release-solution assist, self-sling
  // snap, anchor-mass slingshot bonus. Owned by systems/masslineThrow.js (not in the sim harness).
  throw: IS_BROWSER,
  // Context-aware attachment (§3.2): tow masses anchor at the hull center instead of the nose so
  // hauling does not slew heading; hostile ships keep the nose anchor (facing them is the point).
  contextAttach: IS_BROWSER,
  // Bullet time (§3.6): player-held time dilation through core/timeEffects. The scalar is inert
  // in the replay harness by construction; the flag is belt-and-suspenders.
  bulletTime: IS_BROWSER,
  // Tumble states (§3.4): whipped/whip-struck NPC ships lose attitude control for a physical
  // recovery window; feeds the pirateDisengage morale branch.
  tumble: IS_BROWSER,
  // Impact-damage additions (§3.5): reciprocal damage to thrown ships and momentum damage to
  // tumbling ships on hard contact. The player NEVER takes impact hull damage on any path.
  impactDamage: IS_BROWSER,
  // Cloak & sensor stealth (§4.2): cloak module runtime + the aiPorts contact perception gate.
  cloak: IS_BROWSER,
  // Loot shards (§4.3): hostile ship kills also emit a small loot:drop pool (magnetized pickups);
  // the bulk salvage wreck is unchanged.
  lootShards: IS_BROWSER,
  // Terrain anchors (§4.4): 2-3 large immovable rocks per encounter bubble when the zone is bare.
  terrainAnchors: IS_BROWSER,
  // Jettison-as-impulse (§5.3): dumping cargo produces an honest reaction impulse.
  jettisonImpulse: IS_BROWSER,
  // M3 bomb propulsion (§5.2): a researched vector rack turns brake+throw into an armed aft drop.
  bombPropulsion: IS_BROWSER,
  // Traffic hitchhiking (§5.1): rare neutral express liners advertise a route and sustain the
  // live V3 NPC boost intent so a player can steal real convoy momentum with the massline.
  hitchhiking: IS_BROWSER,
};

/** Read a massline2 flag: master `enabled` AND the named flag. Unknown names read false. Pure. */
export function massline2Flag(name) {
  return !!(MASSLINE2_FLAGS.enabled && MASSLINE2_FLAGS[name]);
}

// Travel Burn (Universe Atlas Wave 1, design/program/atlas/01_DECISIONS.md D5 — "Travel Burn is the
// travel-drive axis, not a fourth assist regime"). Same Tier-B determinism model as the two blocks
// above: every flag defaults to IS_BROWSER (OFF in the node golden harnesses, ON in live browser
// play), each is a mutable module export so a headless test can opt in
// (`TRAVEL_FLAGS.boostNeverBrakes = true`), and each is read at CALL TIME — never cached at init,
// because the golden run and the test suite share one module instance and a cached read would leak
// the browser default into node.
//
// These are load-bearing, not discipline: the propulsion kernel is inside BOTH golden paths
// (`check:sim:compare` runs the legacy `flight` system, `check:sim:v3:compare` runs `flightV3`;
// both call `stepPropulsion`), so an ungated change here moves a frozen hash.
export const TRAVEL_FLAGS = {
  // The travel-drive axis itself: Off / Spooling / Engaged / Cooldown, orthogonal to the assist
  // regime and to the control owner. Gates two distinct things, and BOTH matter:
  //   1. behaviour — the governor's cap ramp while Engaged, and treating Cooldown as earned
  //      momentum so a disengage decays instead of being confiscated;
  //   2. output SHAPE — the new `telemetry.travelDrive` / `travelCeiling` / `travelCap` fields.
  // Gating the shape is not paranoia: the 47a golden hashes kernel telemetry, so an unconditional
  // new key would move the hash even with the drive parked at Off and no travel input supplied.
  // Flag off ⇒ the result object is byte-identical to the pre-Travel-Burn kernel, which
  // test/travel-drive.test.mjs pins against a frozen fixture.
  travelBurn: IS_BROWSER,
  // RC-4, the verified defect. `applySpeedGovernor` makes assisted throttle a SPEED COMMAND, so
  // above `throttle × combatSpeed × boostSpeedMult` the commanded forward goes NEGATIVE down to
  // `-limits.reverse × overspeedBrakeFraction` — the ship fires real reverse thrust while boost
  // energy drains, i.e. held boost SLOWS you at high speed. With this on, boost above the cap
  // clamps the commanded forward to >= 0: "holding what I have", never a hidden anchor.
  // Scope note: the UNBOOSTED overspeed brake is deliberate governor behaviour and STAYS — this
  // flag only removes the reverse authority while the pilot is actually holding boost.
  boostNeverBrakes: IS_BROWSER,
  // Dash-earned overspeed decays through the EXISTING `physicsEarnedMomentum` exponential instead
  // of being slammed flat by the governor's overspeed brake — the same grammar the tether /
  // self-sling exit already uses, honouring the kernel's stated philosophy that "momentum earned
  // through play is spent, not confiscated". Read in the flightV3 input adapter (the kernel is
  // pure and cannot set its own input; the dash impulse is already baked into `body.vel` by
  // `queuePhysicsImpulse` before the kernel ever sees it), which sits on the
  // `check:sim:v3:compare` golden path — so this gate is load-bearing there.
  dashMomentum: IS_BROWSER,
  // Lane infrastructure (Wave 3 W3-C, ADR D8): inside a lane segment volume with the drive Engaged,
  // the lane multiplies the pilot's OWN drive ceiling and ramp rate; a disrupted segment holds the
  // drive down so the existing `physicsEarnedMomentum` decay spends the excess velocity into the
  // ambush. Owned by src/systems/travelLanes.js, which is a strict no-op while this reads false.
  // Belt-and-suspenders rather than load-bearing: travelLanes is absent from sf-sim.mjs's curated
  // systems array, so it cannot reach either golden even with the flag forced on.
  laneBoost: IS_BROWSER,
};

/** Read a travel flag by name; unknown names read false. Pure. */
export function travelFlag(name) {
  return !!TRAVEL_FLAGS[name];
}
