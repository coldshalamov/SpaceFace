# DONE — classify-signature-record

## Summary

1. **Signature records:** quiet `classifyWorld` no longer allocates a template-string
   stamp signature (`sim|pres|event|pinned|pins`) per visit. Store a reusable
   per-id record and compare fields; pin identity uses a bitfield because
   `reusablePins` mutates its stable buffer in place.
2. **Imminent-collision reach early-out (supporting):** skip the discriminant/sqrt
   when even a head-on close at full relative speed cannot arrive inside the
   combined radius within the lookahead window (~1.22× on that stand-in alone).

## Before / after

### Offline microbench (primary — portable CPU)

120 entities × 20k quiet classify signature checks:

| | Before (template string) | After (field/bitfield record) |
|---|---|---|
| wall | **397.0 ms** | **36.6 ms (~10.86×)** |
| change count | 369 | 369 (same) |

Supporting imminent-collision stand-in (120 ents × 30k): **~1.22×** (same hit count).

Phase A cite: cpu-profile-flight `classifyWorld` ~61 ms self after #37+#38.

### Focused tests

`activity-runtime` + `activity-classification` + `presentation-world` +
`snapshot-fence-*` + `entity-view-sync-band` + `ship-pitch-presentation` → **pass**.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-activity-classify-signature-record.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/classify-signature-record-microbench.json`
- Supporting: `artifacts/classify-imminent-collision-earlyout-microbench.json`
- Tests: `artifacts/focused-tests.log`

## Apply order

Independent. Prefer after #37+#38. Complements stamp-reuse/inert near-misses
(those tried visit skip; this cuts the allocation on the visit that still runs).

## Risks

- Pin bitfield must cover every `PIN_REASON` value; unknown reasons contribute 0
  and will not trip change detection for that pin alone (production only emits
  enumerated reasons through `resolvePins`).
- Signature map values are records, not strings — only membership/prune callers
  read the map (tests assert `.has`, not string equality).
