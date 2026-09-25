# DONE — composition-framing-trust

## Summary

Quiet `prepareFrame` → `camera.follow` → `playerHasActiveAttackerFraming`
residual after #47: framing still walked `shipLike` every frame for lookahead
scale, then `resolveChaseComposition` walked it again. Live chase sticky now
carries `hadActiveAttacker` from the prior composition result so framing is
O(1) on the FOLLOW path. Pure callers omit the field and keep the scan.
Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

`playerHasActiveAttackerFraming` alone; 120 ships + 0 attackers × 20000 calls.
Isolated Node child processes. Before = sticky without `hadActiveAttacker`
(shipLike walk); after = sticky seeded from prior compose (trust bit).

| | Before | After | |
|---|---:|---:|---|
| framing wall (median) | 24.9 ms | 2.1 ms | **~11.75×** |

Floor minSpeedup **≥10.93×** across seven isolated pairs (quiet-120).
Quiet-80 floor ≥7.18×; combat-80×3atk floor ≥3.36× (walk already early-outs).
Follow-pair (framing+compose) informational ~1.06× — compose still dominates.
Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64 @ `e1b3f26a3`): idle **65.2%**, long
tasks **17**; `playerHasActiveAttackerFraming` under `camera.follow` /
`prepareFrame`.

### Focused tests

`composition-framing-trust` + `dense-scene-camera-legibility` +
`camera-focus-separation` + `camera-director-governor` +
`camera-neutral-pair` → **64/64** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-trust-composition-attacker-bit-for-frami.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/composition-framing-trust-microbench.json`
- Tests: `artifacts/focused-tests-composition-framing-trust.log`

## Apply order

After `composition-threat-prefilter` (#47). Stacks under prepareFrame /
camera.follow residual after #13+#44+#46+#47+#51–#58+#63+#65+#68.

## Risks

- Lookahead attenuation lags one frame behind composition’s attacker bit
  (sticky hold + flyby lease stay frame-instant).
- Sticky bags that lack `hadActiveAttacker` keep the shipLike scan (tests /
  pure callers).
- Director-owned composition skips still leave the prior bit until the next
  FOLLOW compose; combat director modes typically retain attackers.
