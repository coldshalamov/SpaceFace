# DONE — roster-retain-stable

## Summary

Quiet `registry.step` → tacticalAI / `ai.stack` `liveListSquads` residual after
#66: production no longer rebuilds member objects + `rosterSignature` strings
every tactical tick when membership/identity is unchanged. Live path retains
the roster and refreshes only pos/activity/alive/authority (and player
authority fields). Frozen `listSquads` unchanged. Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

6 squads × 4 members (24 AI craft) × 30000 iters. Isolated Node child
processes. Before = full rebuild every tick; after = membership-key retain +
mutable refresh.

| | Before (full rebuild) | After (retain stable) | |
|---|---:|---:|---|
| wall (median) | 231.3 ms | 128.6 ms | **~1.78×** |

Floor minSpeedup **1.72×** across eleven paired runs. Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64 @ `e1b3f26a3`): idle **65.2%**, long
tasks **17**; `liveListSquads` / `_listSquads` under `ai.stack` / `tacticalAI`
/ `registry.step` after #66 sensor-contact scratch-fill.

### Focused tests

sg06* + ai-* + tactical-ai* → **59/59** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-ai-retain-stable-liveListSquads-roster.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/roster-retain-stable-microbench.json`
- Tests: `artifacts/focused-tests-roster-retain-stable.log`

## Apply order

Independent. Stacks under registry.step / tacticalAI / ai.stack liveListSquads
residual after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66.

## Risks

- Retain key must cover every field that feeds `rosterSignature` (squad
  identity + member preferredRole/capabilities/combatDoctrineId/factionBehavior).
  Mutable-only fields (pos/activity/alive/authority/player*) refresh in place.
- If key and retained roster ever diverge, `_syncRoster` still fail-closes on
  duplicate/missing member ids; frozen listSquads clears the live retain cache.
- Capabilities are part of the key via `_capabilitiesFor` (tick-cached).
