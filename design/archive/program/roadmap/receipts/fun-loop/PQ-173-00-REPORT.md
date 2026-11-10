<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-173
leafId: PQ-173.00
acceptance: focused_green
disposition: PASS
candidateCommit: 688990012c7c6891934dc4ebc31aadcdd3f15a0d
-->

# PQ-173.00 — The bench: Fun Convergence Loop feel & determinism bench

```yaml
packet: PQ-173
dispatchUnit: PQ-173.00
candidateCommit: 688990012c7c6891934dc4ebc31aadcdd3f15a0d
lifecycleClaim: implemented
acceptanceClaim: focused_green
disposition: PASS
deterministicHash: PASS
headedCapture: PASS
```

## Outcome Summary

- **One Command Bench Runner:** `node scripts/run-fun-bench.mjs` executes:
  1. Crucible Feel Bench: 3 arenas (`helios_core`, `lagrange_crucible`, `cinder_sluice`) × 3 loadouts (`energy_baseline`, `physics_toolkit`, `massline_rig`) × 3 seeds (`4242`, `8008`, `13502`) × 3 waves = 27 runs under swarm ruleset.
  2. Flight Bench: 4 Motion Lab scenarios (M1 accel/brake, M2 slalom, M3 reversal, M8 impulse/collision recovery).
  3. Verb Benches: 6 FEEL_CONTRACT scenarios (B7 rope swing, B4/B5 shove weapon, B1 gravitic well, B8 draw-to-fly stroke, B6 terrain slam, B10b cargo spill).
- **Determinism Guarantee:** Every scenario was executed twice on identical seeds. Generated SHA-256 run hashes (`computeRunHash`) are 100% bit-identical across runs. Zero sim-tick non-determinism.
- **Frame Strips:** Headed mode (`--headed`) records frame strips at the shipping camera (`shipping_chase`) with HUD text disabled (`hudText: off`). Strips and manifests are persisted under `design/program/roadmap/receipts/fun-loop/strips/crucible/`.
- **Test Suite:** `test/fun-bench.test.mjs` passes 4/4 assertions (hash determinism, Crucible swarm simulation, Flight bench, Verb bench).

## Measured Results

| Bench | Coverage | Run Hash Verification | Status |
|---|---|---|---|
| Crucible Feel Bench | 27/27 runs (3 arenas × 3 loadouts × 3 seeds × 3 waves) | Bit-identical on repeat | PASS |
| Flight Motion Bench | 4/4 scenarios (M1, M2, M3, M8) | Bit-identical on repeat | PASS |
| Verb Feel Bench | 6/6 scenarios (B1, B4/B5, B6, B7, B8, B10b) | Bit-identical on repeat | PASS |
| B13 Player Knock Budget | Contact velocity & heading change | 0.0% max cruise knock | MET |
| Shipping Camera Capture | 25 runs captured with HUD off | 12 frames @ 4 fps (165 sim ticks) | RECORDED |

## Artifact Locations

- Summary JSON: `design/program/roadmap/receipts/fun-loop/runs/2026-09-03-fun-bench-summary.json`
- Summary Markdown: `design/program/roadmap/receipts/fun-loop/runs/2026-09-03-fun-bench-summary.md`
- Frame Strips: `design/program/roadmap/receipts/fun-loop/strips/crucible/`
- Test Fixture: `test/fun-bench.test.mjs`
- Runner: `scripts/run-fun-bench.mjs`
