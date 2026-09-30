# SpaceFace Fun Convergence Bench Report — 2026-09-28

**Status:** FAIL
**Wall Clock:** 1491.73s | **Mode:** Headless
**Determinism Guaranteed:** NO

### Flight Bench
| Scenario | Seed | Duration | Run Hash | Status |
|---|---|---|---|---|
| M1 Accel & Brake Response | 13502 | 5288ms | `21d7f106...` | UNMEASURED |
| M2 Slalom Course Precision | 13502 | 1201ms | `e2eee5f0...` | UNMEASURED |
| M3 180° Reversal & Lag | 13502 | 2301ms | `a7bcf8a8...` | UNMEASURED |
| M8 Impulse & Collision Recovery | 13502 | 2486ms | `9b7e9de7...` | UNMEASURED |

### Verb Benches
| Verb Bar | Seed | Duration | Run Hash | Bar Status |
|---|---|---|---|---|
| B7 Rope Swing & Tangential Speed Retention (REAL PATH) | 4242 | 2250ms | `70f5cfcc...` | MET |
| B4/B5 Shove Weapon Impulse & Displacement | 4242 | 21013ms | `32ea9f75...` | MET |
| B1 Gravitic Well Deflection & Fling | 4242 | 10ms | `dd2a62de...` | MET |
| B8 Draw-to-fly rips — mean speed, slowest point, ink deviation, ordered coverage (real path) | 4242 | 5046ms | `53655df4...` | MET |
| B6 Terrain Slam Lethality & Helm Loss (REAL PATH) | 4242 | 1039ms | `b7e83015...` | MET |
| B10b Cargo Spill Encounter Reaction | 4242 | 0ms | `0601dc66...` | MET |
| B13 Player Knock Budget — contact-sourced velocity changes on the player hull (REAL PATH) | 4242 | 7203ms | `d8f90a29...` | MET |
| PQ-137.09 Chains go off — secondary consequences from ONE player action (REAL PATH) | 4242 | 2122ms | `22f83fc5...` | MET |
| B1 Earned speed is kept — 2x cruise exit by impulse, 10 s later hands off and with forward held (real path) | 4242 | 4261ms | `a2ada1cd...` | RED |
| B1 Governor integrity — planar assisted cap, weave/lateral/boost/earned, Drift and Newtonian ungoverned (real path) | 4242 | 4062ms | `8d14e1e0...` | MET |
| B11 Hitstun curve - helm-loss and entry spin per source and mass, real path | 4242 | 7427ms | `3d5626c6...` | MET |
| B9 Impacts answer — hitstop/trauma by exchanged momentum, audio by mass, release snap | 4242 | 680ms | `7411222a...` | MET |
| B13 Player Knock Budget — contact-sourced velocity changes on the player hull (REAL PATH) | 4242 | 51087ms | `87ff9c4a...` | MET |
| B2 Nimble regime — rest to cruise, 180 degree velocity reversal, turn radius at cruise (real path) | 4242 | 1785ms | `f573e5db...` | MET |
| B3 The fight stays on screen — crossing time at cruise and the camera-open clause above the cap (real path) | 4242 | 192ms | `b4b1c9f1...` | MET |
| B11/PQ-139 Tumble trail geometry and lateral excursion on production path | 4242 | 1600ms | `a3ac936a...` | RED |
| PQ-142.00 Capabilities, not percentages — four physical verbs, before and after | 4242 | 226ms | `dd87228a...` | MET |
| PQ-176.01 Drive and thruster split — fast-clumsy and nimble-slow are two ships | 4242 | 1862ms | `57c4c2ff...` | RED |
| PQ-176.00 Mass is the law — a full-gun fit and a full-cargo fit of one hull fly differently | 4242 | 960ms | `31b180fe...` | MET |
| PQ-174.08 earned breathing room — ≥3-kill clear then ≥4 s thinner air (headless stream) | 4242 | 63ms | `f24dbe0a...` | MET |
| B10 The world reacts — witnessed kill, spilled cargo, civilians near gunfire (REAL PATH) | 4242 | 857275ms | `18ac444d...` | MET |
| PQ-143.00 Sector identity — thirty seconds of Helios vs thirty seconds of Ceres (REAL PATH) | 4242 | 354713ms | `30414157...` | MET |
