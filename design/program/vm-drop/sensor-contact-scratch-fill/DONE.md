# DONE — sensor-contact-scratch-fill

## Summary

Quiet `registry.step` → tacticalAI / `ai.stack` `liveFramesFor` residual:
ephemeral `entityContacts` no longer allocates `{...base, confidence, threat,
hostile}` per observer×contact. Production fills retained per-member
`contactRecords`; `PerceptionMemory.observe` still Object.assigns into durable
records. Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

6 observers × 18 contacts × 2500 iters (PerceptionMemory-style Object.assign
into durable records included). Isolated Node process.

| | Before (spread alloc) | After (scratch fill) | |
|---|---:|---:|---|
| wall (median) | 1417.1 ms | 246.3 ms | **~5.75×** |

Floor minSpeedup **5.52×** across eleven paired runs. Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64 @ `e1b3f26a3`): idle **65.2%**, long
tasks **17**; `liveFramesFor` → `_ephemeralSensorFramesFor` → `entityContacts`
→ `_contactBaseFor` under `ai.stack` / `registry.step`.

### Focused tests

sg06-squad-fire-discipline + ai-perception.review + tactical-ai-contact-index +
tactical-ai-id-reuse + tactical-ai-production-cadence → **20/20** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-ai-scratch-fill-live-sensor-contacts.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/sensor-contact-scratch-fill-microbench.json`
- Tests: `artifacts/focused-tests-sensor-contact-scratch-fill.log`

## Apply order

Independent. Stacks under registry.step / tacticalAI / ai.stack liveFramesFor
residual after #39+#43+#49+#50+#55+#56+#58+#59+#61.

## Risks

- ContactRecords are opt-in via `options.contactRecords` (ephemeral batch +
  singleton live path only). Durable multi-id `liveFramesFor` still allocates
  fresh contact objects so observers cannot share mutated slots.
- Scratch records omit tether-only keys (`attachmentId` / sockets) unless a
  future tether fill sets them; ship contacts match prior spread-alloc shape.
- PerceptionMemory must keep copying fields (Object.assign) — do not retain
  scratch contact object identity across ticks without that copy.
