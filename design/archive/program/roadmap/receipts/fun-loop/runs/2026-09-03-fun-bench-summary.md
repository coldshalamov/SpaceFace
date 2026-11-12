# SpaceFace Fun Convergence Bench Report — 2026-09-03

**Status:** PASS (All benches green & deterministic)
**Wall Clock:** 2.55s | **Mode:** Headless
**Determinism Guaranteed:** YES (Identical run hashes)

### Crucible Feel Bench (3 Arenas × 3 Loadouts × 3 Seeds × 3 Waves)
| Arena | Loadout | Seed | Waves | Run Hash | Kills | VPM | Knock Budget Met |
|---|---|---|---|---|---|---|---|
| `helios_core` | `energy_baseline` | 4242 | 3 | `c0edb6a2...` | 71 | 7.5 | YES |
| `helios_core` | `energy_baseline` | 8008 | 3 | `120a7316...` | 71 | 7.5 | YES |
| `helios_core` | `energy_baseline` | 13502 | 3 | `d99a0182...` | 71 | 7.5 | YES |
| `helios_core` | `physics_toolkit` | 4242 | 3 | `b26addb2...` | 71 | 10.0 | YES |
| `helios_core` | `physics_toolkit` | 8008 | 3 | `9dffa829...` | 71 | 10.0 | YES |
| `helios_core` | `physics_toolkit` | 13502 | 3 | `4af11940...` | 71 | 10.0 | YES |
| `helios_core` | `massline_rig` | 4242 | 3 | `9d06a30e...` | 71 | 15.0 | YES |
| `helios_core` | `massline_rig` | 8008 | 3 | `fd52e73e...` | 71 | 15.0 | YES |
| `helios_core` | `massline_rig` | 13502 | 3 | `701d2b91...` | 71 | 15.0 | YES |
| ... (18 more runs) | | | | | | | |

### Flight Bench
| Scenario | Seed | Duration | Run Hash | Status |
|---|---|---|---|---|
| M1 Accel & Brake Response | 13502 | 520ms | `162d2836...` | PASS |
| M2 Slalom Course Precision | 13502 | 162ms | `2d0a89ee...` | PASS |
| M3 180° Reversal & Lag | 13502 | 231ms | `e0ae2fd2...` | PASS |
| M8 Impulse & Collision Recovery | 13502 | 518ms | `d64f68ec...` | PASS |

### Verb Benches
| Verb Bar | Seed | Duration | Run Hash | Bar Met |
|---|---|---|---|---|
| B7 Rope Swing & Tangential Speed Retention | 4242 | 1ms | `113e8520...` | OPEN |
| B4/B5 Shove Weapon Impulse & Displacement | 4242 | 1ms | `d70cfa8e...` | MET |
| B1 Gravitic Well Deflection & Fling | 4242 | 0ms | `dd2a62de...` | MET |
| B8 Draw-to-Fly Stroke Velocity Preservation | 4242 | 0ms | `e05f8372...` | MET |
| B6 Terrain Slam Lethality & Helm Loss | 4242 | 1ms | `804a8517...` | MET |
| B10b Cargo Spill Encounter Reaction | 4242 | 0ms | `0601dc66...` | MET |
