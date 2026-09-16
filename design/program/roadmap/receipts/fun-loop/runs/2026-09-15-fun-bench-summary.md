# SpaceFace Fun Convergence Bench Report — 2026-09-15

**Status:** FAIL
**Wall Clock:** 678.66s | **Mode:** Headless
**Determinism Guaranteed:** NO

### Crucible Feel Bench (3 Arenas × 3 Loadouts × 3 Seeds × 3 Waves)
| Arena | Loadout | Seed | Waves | Run Hash | Kills | VPM | Knock Budget | Hostile In-Frame (B3b) | Status |
|---|---|---|---|---|---|---|---|---|---|
| `helios_core` | `energy_baseline` | 4242 | 3 | `9af11698...` | 15 | 1.3 | RED | 98.4% | RED |
| `helios_core` | `energy_baseline` | 8008 | 3 | `293a7af7...` | 15 | 1.3 | RED | 97.2% | RED |
| `helios_core` | `energy_baseline` | 13502 | 3 | `80d8676b...` | 8 | 1.3 | MET | 99.9% | UNMEASURED |
| `helios_core` | `physics_toolkit` | 4242 | 3 | `061c1a22...` | 15 | 0.7 | MET | 95.2% | UNMEASURED |
| `helios_core` | `physics_toolkit` | 8008 | 3 | `b5341582...` | 15 | 0.7 | MET | 89.8% | UNMEASURED |
| `helios_core` | `physics_toolkit` | 13502 | 3 | `5dba8ef1...` | 15 | 1.3 | MET | 52.9% | RED |
| `helios_core` | `massline_rig` | 4242 | 3 | `f310c64c...` | 11 | 1.3 | MET | 98.7% | UNMEASURED |
| `helios_core` | `massline_rig` | 8008 | 3 | `baf3083a...` | 8 | 1.3 | MET | 98.1% | UNMEASURED |
| `helios_core` | `massline_rig` | 13502 | 3 | `1e63c29b...` | 11 | 1.3 | MET | 99.2% | UNMEASURED |
| ... (18 more runs) | | | | | | | | | |

### Flight Bench
| Scenario | Seed | Duration | Run Hash | Status |
|---|---|---|---|---|
| M1 Accel & Brake Response | 13502 | 871ms | `9a1ee94b...` | UNMEASURED |
| M2 Slalom Course Precision | 13502 | 440ms | `1f0a8fa1...` | UNMEASURED |
| M3 180° Reversal & Lag | 13502 | 871ms | `8c6d2be8...` | UNMEASURED |
| M8 Impulse & Collision Recovery | 13502 | 1694ms | `465afe96...` | UNMEASURED |

### Verb Benches
| Verb Bar | Seed | Duration | Run Hash | Bar Status |
|---|---|---|---|---|
| B7 Rope Swing & Tangential Speed Retention (REAL PATH) | 4242 | 217ms | `6a78d113...` | MET |
| B4/B5 Shove Weapon Impulse & Displacement | 4242 | 1104ms | `063535c8...` | MET |
| B1 Gravitic Well Deflection & Fling | 4242 | 0ms | `dd2a62de...` | MET |
| B8 Draw-to-fly rips — mean speed, slowest point, ink deviation, ordered coverage (real path) | 4242 | 864ms | `6243ddf9...` | MET |
| B6 Terrain Slam Lethality & Helm Loss (REAL PATH) | 4242 | 594ms | `2f95bf6d...` | MET |
| B10b Cargo Spill Encounter Reaction | 4242 | 1ms | `0601dc66...` | MET |
| B13 Player Knock Budget — contact-sourced velocity changes on the player hull (REAL PATH) | 4242 | 2747ms | `c4fe6bcd...` | MET |
| PQ-137.09 Chains go off — secondary consequences from ONE player action (REAL PATH) | 4242 | 529ms | `c78e43ba...` | RED |
| B1 Earned speed is kept — 2x cruise exit by impulse, 10 s later hands off and with forward held (real path) | 4242 | 482ms | `7ceb2eea...` | MET |
| B1 Governor integrity — planar assisted cap, weave/lateral/boost/earned, Drift and Newtonian ungoverned (real path) | 4242 | 1848ms | `05f685b4...` | MET |
| B11 Hitstun curve - helm-loss and entry spin per source and mass, real path | 4242 | 3536ms | `084a2da3...` | RED |
| B9 Impacts answer — hitstop/trauma by exchanged momentum, audio by mass, release snap | 4242 | 92ms | `39246d82...` | MET |
| B13 Player Knock Budget — contact-sourced velocity changes on the player hull (REAL PATH) | 4242 | 17752ms | `45300e62...` | MET |
| B2 Nimble regime — rest to cruise, 180 degree velocity reversal, turn radius at cruise (real path) | 4242 | 1121ms | `0843e6fa...` | MET |
| B3 The fight stays on screen — crossing time at cruise and the camera-open clause above the cap (real path) | 4242 | 158ms | `ae83c55e...` | MET |
| B11/PQ-139 Tumble trail geometry and lateral excursion on production path | 4242 | 845ms | `2d66bef8...` | RED |
| PQ-142.00 Capabilities, not percentages — four physical verbs, before and after | 4242 | 102ms | `d9fadb6d...` | MET |
| PQ-176.01 Drive and thruster split — fast-clumsy and nimble-slow are two ships | 4242 | 1328ms | `91efc06e...` | MET |
| PQ-176.00 Mass is the law — a full-gun fit and a full-cargo fit of one hull fly differently | 4242 | 699ms | `75c683f7...` | MET |
| PQ-174.08 earned breathing room — ≥3-kill clear then ≥4 s thinner air (headless stream) | 4242 | 18ms | `c6656e98...` | MET |
| B10 The world reacts — witnessed kill, spilled cargo, civilians near gunfire (REAL PATH) | 4242 | 9563ms | `6427d7f8...` | MET |
| PQ-143.00 Sector identity — thirty seconds of Helios vs thirty seconds of Ceres (REAL PATH) | 4242 | 27855ms | `ba2545fe...` | MET |
