# FEEL B2/B3 — why the two red clauses cannot be tuned green from here — 2026-09-20

Measured 2026-09-20, seed 4242, live real-path scenarios (`feel.reversal_course`, `feel.screen_crossing`),
all numbers from the live camera/flight code. Purpose: the check:all matrix carries two long-lived
feel reds (B2 turn radius 1.0602 > 1.0 screen depths; B3 cruise crossing 0.680 s < 1.2 s). Before
another lane spends a day hunting levers: **every lever is either measured-inert, authored-locked, or
breaks a neighboring clause.** The clauses need a taste-director re-author, not a tune.

## The numbers today

- B2: rest→cruise 1.05 s (≤1.5 ✓), 180° reversal 1.683 s (≤3.0 ✓), turn radius **1.0602** (≤1.0 ✗).
  Wasp passes all three (radius 0.839).
- B3: crossing **0.680 s** (≥1.2 ✗), 2× growth 1.7504 (≥1.5 ✓, margin 0.25), 3× growth 2.6079
  (≥2.5 ✓, margin **0.108 — the tightest clause in the suite**), monotonic ✓, hull frame share
  4.6656 % (≥4 ✓, margin 0.67).

## Why B3-crossing alone is unsatisfiable

crossing = visibleDepth(cruise)/vCruise. Reaching 1.2 s needs the at-cruise depth ×1.76 wider
(SPEED_ZOOM_MAX 1.35 → ~2.38) or the starter's cruise ×0.57 slower. Pure camera puts the hull at
4.6656/1.76 ≈ **2.65 %** — breaks the suite's own 4 % floor. Pure slowdown is a starter redesign that
cascades into every traversal contract. Jointly (any mix of camera k and speed c) the clauses force
k ≥ 1.7647·c from crossing and k·ratio₃ ≤ 4.062/2.5 with ratio₃ ≥ 2.5 from hull-floor + growth —
no parameter point with a sane earned-zoom band (PHYSICS_EARNED_SPEED_ZOOM_MAX would need 6–12×,
vs the authored "max ~3× at ~550"). **The five clauses are mutually infeasible for ship_kestrel as
authored.** Note ratio₃ = f(3v)/f(v) ≈ e/(1.35·k) structurally: ANY at-cruise widening k > 1.0
breaks the 3× growth clause (margin 0.108 dies at k ≥ 1.04).

## Why B2-radius has no clean lever either

- `ships.js` `handling` — **measured inert**: 1.05 → 1.15 changed the real-path radius by exactly 0
  (probed 2026-09-20). It feeds the legacy derived model (`buildFlightModel`), not flightV3.
- Camera widening — dead per the ratio₃ structure above.
- `drive_reaction_m` profile (yawAccel 8.8 / maxYawRate 2.45, cruising-phase ×0.25) — shared by every
  hull on the drive (Pelican, Wasp, NPC fits): a starter-only radius fix is not expressible there,
  and a drive-wide change is a combat-balance event plus a §10d MOTION_CHANGED golden ritual — on a
  tree that already carries foreign unrecorded golden drift, which would bake attribution errors in.
- `mod_thruster_stock_s` — authored **"exactly neutral until the bay is refitted"** (PQ-176.01).
- The assist governor (`lateralKillFraction`, `commandedAxisDamping`) — the proportional
  settle-to-rest feel is an explicit owner ruling (AGENTS.md §12, 2026-09-15).

## What would actually close the reds

1. Re-author B3's envelope for the governed-cruise camera (the five thresholds were written against
   a different anchor; suggest re-deriving crossing/4 %/2.5× from the live governed cruise ≈95 for
   the starter), or
2. Re-author B2's radius clause per-hull (starter ≤ 1.1 depths) with the same sentence shape, or
3. Author a starter-specific manoeuvring margin (a thruster tier or drive variant the starter owns
   alone), which unlocks the profile lever without touching siblings — then the §10d procedure.

Until one of those lands, `check:feel:scenarios` B2/B3 reds are **attributed: authored-envelope
conflict, not a code defect**. Files probed: `src/render/camera.js` (SPEED_ZOOM_*), 
`src/render/velocityLanguage.js` (VL_EXCEPTIONAL_SPEED_RATIO_MAX = 3),
`src/core/flight/propulsionCatalog.js` (drive_reaction_m, cruisingProfile ×0.25),
`src/data/ships.js` (handling), `scripts/lib/bench/scenarios/feel.*.mjs`. No src change landed from
this probe; the one handling trial was reverted byte-identical.
