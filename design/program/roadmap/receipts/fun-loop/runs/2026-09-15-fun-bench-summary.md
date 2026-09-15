# SpaceFace Fun Convergence Bench Report — 2026-09-15

**Status:** FAIL
**Wall Clock:** 370.03s | **Mode:** Headless
**Determinism Guaranteed:** YES (Identical run hashes)

### Crucible Feel Bench (3 Arenas × 3 Loadouts × 3 Seeds × 3 Waves)
| Arena | Loadout | Seed | Waves | Run Hash | Kills | VPM | Knock Budget | Hostile In-Frame (B3b) | Status |
|---|---|---|---|---|---|---|---|---|---|
| `helios_core` | `energy_baseline` | 4242 | 3 | `61b1d0c1...` | 15 | 1.3 | RED | 53.5% | RED |
| `helios_core` | `energy_baseline` | 8008 | 3 | `0732caa3...` | 15 | 1.3 | RED | 40.0% | RED |
| `helios_core` | `energy_baseline` | 13502 | 3 | `4f23b122...` | 8 | 1.3 | MET | 53.0% | RED |
| `helios_core` | `physics_toolkit` | 4242 | 3 | `fb11ca0d...` | 15 | 0.7 | MET | 43.1% | RED |
| `helios_core` | `physics_toolkit` | 8008 | 3 | `9ae3ee52...` | 15 | 0.7 | MET | 37.4% | RED |
| `helios_core` | `physics_toolkit` | 13502 | 3 | `43c9bc97...` | 15 | 1.3 | MET | 24.4% | RED |
| `helios_core` | `massline_rig` | 4242 | 3 | `488ec865...` | 11 | 1.3 | MET | 41.6% | RED |
| `helios_core` | `massline_rig` | 8008 | 3 | `aca063c9...` | 5 | 1.3 | MET | 38.8% | RED |
| `helios_core` | `massline_rig` | 13502 | 3 | `ebfbe76f...` | 7 | 1.3 | MET | 42.3% | RED |
| ... (18 more runs) | | | | | | | | | |

### Flight Bench
| Scenario | Seed | Duration | Run Hash | Status |
|---|---|---|---|---|
| M1 Accel & Brake Response | 13502 | 373ms | `9a1ee94b...` | UNMEASURED |
| M2 Slalom Course Precision | 13502 | 209ms | `1f0a8fa1...` | UNMEASURED |
| M3 180° Reversal & Lag | 13502 | 336ms | `8c6d2be8...` | UNMEASURED |
| M8 Impulse & Collision Recovery | 13502 | 515ms | `465afe96...` | UNMEASURED |

### Verb Benches
| Verb Bar | Seed | Duration | Run Hash | Bar Status |
|---|---|---|---|---|
| B7 Rope Swing & Tangential Speed Retention (REAL PATH) | 4242 | 98ms | `6a78d113...` | MET |
| B4/B5 Shove Weapon Impulse & Displacement | 4242 | 548ms | `063535c8...` | MET |
| B1 Gravitic Well Deflection & Fling | 4242 | 1ms | `dd2a62de...` | MET |
| B8 Draw-to-fly rips — mean speed, slowest point, ink deviation, ordered coverage (real path) | 4242 | 452ms | `6243ddf9...` | MET |
| B6 Terrain Slam Lethality & Helm Loss (REAL PATH) | 4242 | 267ms | `2f95bf6d...` | MET |
| B10b Cargo Spill Encounter Reaction | 4242 | 0ms | `0601dc66...` | MET |
| B13 Player Knock Budget — contact-sourced velocity changes on the player hull (REAL PATH) | 4242 | 1173ms | `c4fe6bcd...` | MET |
| PQ-137.09 Chains go off — secondary consequences from ONE player action (REAL PATH) | 4242 | 245ms | `c78e43ba...` | RED |
| B1 Earned speed is kept — 2x cruise exit by impulse, 10 s later hands off and with forward held (real path) | 4242 | 230ms | `7ceb2eea...` | MET |
| B1 Governor integrity — planar assisted cap, weave/lateral/boost/earned, Drift and Newtonian ungoverned (real path) | 4242 | 864ms | `05f685b4...` | MET |
| B11 Hitstun curve - helm-loss and entry spin per source and mass, real path | 4242 | 1704ms | `084a2da3...` | RED |
| B9 Impacts answer — hitstop/trauma by exchanged momentum, audio by mass, release snap | 4242 | 53ms | `39246d82...` | MET |
| B13 Player Knock Budget — contact-sourced velocity changes on the player hull (REAL PATH) | 4242 | 10104ms | `45300e62...` | MET |
| B2 Nimble regime — rest to cruise, 180 degree velocity reversal, turn radius at cruise (real path) | 4242 | 518ms | `0843e6fa...` | MET |
| B3 The fight stays on screen — crossing time at cruise and the camera-open clause above the cap (real path) | 4242 | 73ms | `ae83c55e...` | MET |
| B11/PQ-139 Tumble trail geometry and lateral excursion on production path | 4242 | 442ms | `2d66bef8...` | RED |
| PQ-142.00 Capabilities, not percentages — four physical verbs, before and after | 4242 | 57ms | `d9fadb6d...` | MET |
| PQ-176.01 Drive and thruster split — fast-clumsy and nimble-slow are two ships | 4242 | 589ms | `91efc06e...` | MET |
| PQ-176.00 Mass is the law — a full-gun fit and a full-cargo fit of one hull fly differently | 4242 | 320ms | `75c683f7...` | MET |
| PQ-174.08 earned breathing room — ≥3-kill clear then ≥4 s thinner air (headless stream) | 4242 | 8ms | `c6656e98...` | MET |
| B10 The world reacts — witnessed kill, spilled cargo, civilians near gunfire (REAL PATH) | 4242 | 4399ms | `6427d7f8...` | MET |
| PQ-143.00 Sector identity — thirty seconds of Helios vs thirty seconds of Ceres (REAL PATH) | 4242 | 17823ms | `ba2545fe...` | MET |
