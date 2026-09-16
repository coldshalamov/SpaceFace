# SpaceFace Fun Convergence Bench Report — 2026-09-12

**Status:** FAIL
**Wall Clock:** 1035.90s | **Mode:** Headless
**Determinism Guaranteed:** NO

### Crucible Feel Bench (3 Arenas × 3 Loadouts × 3 Seeds × 3 Waves)
| Arena | Loadout | Seed | Waves | Run Hash | Kills | VPM | Knock Budget Met |
|---|---|---|---|---|---|---|---|
| `helios_core` | `energy_baseline` | 4242 | 3 | `c5c168b6...` | 15 | 1.3 | NO |
| `helios_core` | `energy_baseline` | 8008 | 3 | `8ab04a63...` | 13 | 0.7 | NO |
| `helios_core` | `energy_baseline` | 13502 | 3 | `4b19163a...` | 11 | 0.7 | NO |
| `helios_core` | `physics_toolkit` | 4242 | 3 | `a914ae7d...` | 15 | 0.7 | NO |
| `helios_core` | `physics_toolkit` | 8008 | 3 | `74d79be4...` | 15 | 0.7 | NO |
| `helios_core` | `physics_toolkit` | 13502 | 3 | `519cbe02...` | 15 | 0.7 | NO |
| `helios_core` | `massline_rig` | 4242 | 3 | `83dc6080...` | 12 | 2.0 | NO |
| `helios_core` | `massline_rig` | 8008 | 3 | `3cf46cd8...` | 11 | 3.3 | NO |
| `helios_core` | `massline_rig` | 13502 | 3 | `fcd2c099...` | 14 | 2.0 | NO |
| ... (18 more runs) | | | | | | | |

### Flight Bench
| Scenario | Seed | Duration | Run Hash | Status |
|---|---|---|---|---|
| M1 Accel & Brake Response | 13502 | 424ms | `2759553f...` | PASS |
| M2 Slalom Course Precision | 13502 | 336ms | `f8dbce31...` | PASS |
| M3 180° Reversal & Lag | 13502 | 775ms | `f2c47716...` | PASS |
| M8 Impulse & Collision Recovery | 13502 | 1270ms | `465afe96...` | PASS |

### Verb Benches
| Verb Bar | Seed | Duration | Run Hash | Bar Met |
|---|---|---|---|---|
| B7 Rope Swing & Tangential Speed Retention (REAL PATH) | 4242 | 150ms | `6a78d113...` | MET |
| B4/B5 Shove Weapon Impulse & Displacement | 4242 | 811ms | `b78e9823...` | OPEN |
| B1 Gravitic Well Deflection & Fling | 4242 | 0ms | `dd2a62de...` | MET |
| B8 Draw-to-fly rips — mean speed, slowest point, ink deviation, ordered coverage (real path) | 4242 | 718ms | `bc241081...` | MET |
| B6 Terrain Slam Lethality & Helm Loss (REAL PATH) | 4242 | 400ms | `2f95bf6d...` | MET |
| B10b Cargo Spill Encounter Reaction | 4242 | 0ms | `0601dc66...` | MET |
| B13 Player Knock Budget — contact-sourced velocity changes on the player hull (REAL PATH) | 4242 | 1851ms | `c4fe6bcd...` | MET |
| PQ-137.09 Chains go off — secondary consequences from ONE player action (REAL PATH) | 4242 | 302ms | `2d808f57...` | OPEN |
| B1 Earned speed is kept — 2x cruise exit by impulse, 10 s later hands off and with forward held (real path) | 4242 | 450ms | `7ceb2eea...` | OPEN |
| B1 Governor integrity — planar assisted cap, weave/lateral/boost/earned, Drift and Newtonian ungoverned (real path) | 4242 | 1116ms | `113d6ea4...` | OPEN |
| B11 Hitstun curve - helm-loss and entry spin per source and mass, real path | 4242 | 1882ms | `30a1acd1...` | OPEN |
| B9 Impacts answer — hitstop/trauma by exchanged momentum, audio by mass, release snap | 4242 | 89ms | `6c3d1f3f...` | OPEN |
| B13 Player Knock Budget — contact-sourced velocity changes on the player hull (REAL PATH) | 4242 | 11661ms | `45300e62...` | MET |
| B2 Nimble regime — rest to cruise, 180 degree velocity reversal, turn radius at cruise (real path) | 4242 | 653ms | `1e959342...` | OPEN |
| B3 The fight stays on screen — crossing time at cruise and the camera-open clause above the cap (real path) | 4242 | 64ms | `ae83c55e...` | OPEN |
| B11/PQ-139 Tumble trail geometry and lateral excursion on production path | 4242 | 628ms | `3b514085...` | OPEN |
| PQ-142.00 Capabilities, not percentages — four physical verbs, before and after | 4242 | 108ms | `d9fadb6d...` | OPEN |
| PQ-176.01 Drive and thruster split — fast-clumsy and nimble-slow are two ships | 4242 | 1134ms | `fcee2bb9...` | OPEN |
| PQ-176.00 Mass is the law — a full-gun fit and a full-cargo fit of one hull fly differently | 4242 | 353ms | `99dc56db...` | OPEN |
| PQ-174.08 earned breathing room — ≥3-kill clear then ≥4 s thinner air (headless stream) | 4242 | 26ms | `c6656e98...` | MET |
| B10 The world reacts — witnessed kill, spilled cargo, civilians near gunfire (REAL PATH) | 4242 | 6130ms | `6a53281d...` | OPEN |
| PQ-143.00 Sector identity — thirty seconds of Helios vs thirty seconds of Ceres (REAL PATH) | 4242 | 28621ms | `423211ce...` | OPEN |
