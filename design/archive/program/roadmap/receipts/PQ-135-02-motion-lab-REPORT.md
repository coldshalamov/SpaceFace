<!-- LIFETIME: HISTORICAL -->
# PQ-135.02 — Motion Lab receipt

- **packetId:** PQ-135
- **leafId:** PQ-135.02
- **candidateCommit:** (the commit carrying this receipt)
- **disposition:** PASS
- **acceptance:** focused_green

## What changed

Three new files, zero edits to existing files: `src/systems/motionScenarios.js` (five deterministic
movement scenarios on the real headless sim — player stick, NPC intent, AI actuator, Rapier — via
`createAuthoritativeRuntime`), `src/systems/motionTelemetry.js` (compact JSON traces: seed, hull,
sampled pose/velocity, requested control vs achieved acceleration, phase changes, contacts; named
metrics; wall-clock cost kept OFF the deterministic object), and
`test/motion-lab-scenarios.test.mjs` (each scenario asserts run-twice/same-seed metric identity and
JSON round-trip).

## What passed

`node --test test/motion-lab-scenarios.test.mjs`: 5/5, ~5.7 s (verified independently by the
controller, not only by the implementing lane). Mutation check: an injected `Math.random` turned M4
red (0.734 vs 0.922), removal turned it green. LF endings; no `Math.random`/`Date.now`/
`performance.now` in the modules.

## Baseline numbers (the instrument's first reading)

M1 Hitch vs Wasp on the same stick tape: Wasp is quicker and twitchier (peak 138 vs 109, yaw rate
3.70 vs 2.92, stop 24.6 vs 39.5 WU) but bleeds more speed in a turn (0.82 vs 1.04) and jerks more
(349 vs 300 RMS). Hitch and Drifter are IDENTICAL on an empty-fit tape — same reaction-M drive; the
governor hides the mass difference (a finding for PQ-135.01). Atlas: peak 66, stop ~78 WU over
3.2 s. M4 slot tracking: RMS 62, overshoot 164, 11 control sign changes/s (very twitchy). M6
scissors (expected-bad baseline for PQ-135.04): 428 lane conflicts, zero clean extensions, friendly
separation down to 2.3. M8: impulse honored by physics, ~1.7 s disruption. M11: flow 0.63–0.65,
reacquire ~0.35 s, no pileups.

## Honest residuals

- Player energy/heat rows of M1 skipped: flight writes a private propulsion ledger, not the
  canonical capacitor/heat fields.
- No slot-injection seam into tactical AI exists — M4 drives the real actuator with a scenario
  seeker; PQ-135.03/.04 will need that seam (shared-change request recorded here).
- AI writes forces, not `data.intent` movement, so enemy stick-sign-change metrics read ~0.
- The in-world repulsor field does not run in Node; M8 shoves through the physics impulse door
  (catalog 300 accel × 0.2 s).
- Wall-time cost proxies exist but are excluded from determinism assertions by design.
