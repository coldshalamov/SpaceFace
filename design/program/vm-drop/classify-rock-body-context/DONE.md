# DONE — classify-rock-body-context

## Summary

Quiet `classifyWorld` visit-body no longer assembles ship-oriented context for
asteroids/payloads. Rocks skip owner-AI lookup, ace/authored-combat/mission-regex,
aggro/projectile/dock/escort/hail Sets, and aggregate-only ship logic. Pin-relevant
subset remains: glass/runway, tether, mining target, tracked, damaged-by-player,
missionPinned/missionId tags, imminent collision, world-record wake.

## Before / after

### Offline microbench (primary — portable CPU)

200-entity near disc (180 rocks + 20 ships) × 4000 classify context fills:

| | Before (full context every visit) | After (rock-body specialized) |
|---|---|---|
| wall | **72.7 ms** | **46.8 ms (~1.55×)** |
| rock pin-field mismatch | — | **0** |

Phase A cite: cpu-profile-flight `classifyWorld` ~61 ms self after #37+#38; #45 cut
stamp-signature alloc — context assembly remained.

### Focused tests

`activity-runtime` + `activity-classification` + camera suites (shared log) → **95/95** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-activity-classify-rock-body-context.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/classify-rock-body-context-microbench.json`
- Tests: `artifacts/focused-tests.log`

## Apply order

Independent. Prefer after #37+#38+#45. New angle vs stamp-reuse/inert/visit-cadence
holds (those tried visit skip; this cuts context fill on visits that still run).

## Risks

- Rock `missionCritical` uses pinned/missionId/missionTag/jobId only — ace/authored
  combat / activityObjectSlotId regex paths are ship-only (rocks never carry them).
- Rock wake uses activity/data `nextEventAtT` + durable worldRec (skips AI wake fields).
- `damagedPlayerUntil` skipped for rocks (rocks do not damage the player).
