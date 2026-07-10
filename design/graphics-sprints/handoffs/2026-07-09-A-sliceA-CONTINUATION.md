# CONTINUATION — Top-50 Slice A (session 2026-07-09)

## DONE this session (export bar + finalize; release where run)

| Rank | ID | Iters | Weighted | Notes |
|---:|---|---:|---:|---|
| 1 | hull_starter | 28 | 4.73 | single-island weld + ritual frame |
| 2 | massline VFX | 10 cycles | n/a | structural pack green |
| 3 | thruster VFX | 10 cycles | n/a | structural pack green |
| 4 | engine_vector | 21 | 4.74 | joined thruster (no floaters) |
| 5 | combat hit VFX | 10 cycles | n/a | structural pack green |
| 6 | place_station_trade_hub | 20 | 4.9 | Meridian gold hub |
| 7 | place_lane_beacon | 21 | 4.79 | Helios landmark spire |
| 8 | place_gate_jump_ring | 20 | 4.99 | transit gate torus |
| 9 | mining VFX | 10 cycles | n/a | denser tick/yield chunks |
| 10 | Helios sky kit | 10 cycles | n/a | core palette + AZURE + SECTOR_PALETTES |
| 13 | chase camera juice | 10 cycles | n/a | zoom 72, bank lean, chaseClose |
| 14 | asteroids rock_b/c | 11 each | 4.525 | densify + reframe; rock_a already dense |

## Residual / optional next

| Item | State |
|---|---|
| rock_a / seamed | already higher tris; optional ore-hero polish |
| In-flight GIF | missing |
| check:assets:live | systemic MOUNT_* reds elsewhere — not hull-only |
| Full release after rock_b/c | run `npm run build:sg04:release-assets` before shipping |
| HOOK_DRIVE_* on engine_vector | finalize advisory (empties may not GLB-serialize) |

## Slice A exit artifacts

| Artifact | Path | Status |
|---|---|---|
| undock-wide/close | `.devshots/slice-A/undock-*.png` | present |
| station-approach | `.devshots/slice-A/station-approach.png` | present |
| landmark | `.devshots/slice-A/landmark-beacon.png` | present |
| gate | `.devshots/slice-A/gate-approach.png` | present |
| engine | `.devshots/slice-A/engine-vector.png` | present |
| asteroids | `.devshots/slice-A/asteroid-rock-b/c.png` | present |
| VFX verifies | massline/thruster/combat/mining/chase/sky json | present |

## Do not
- Wire blocked wholeships
- Claim G10 live probe without authored-path screenshot from flight
- git reset/stash/checkout tracked tree
