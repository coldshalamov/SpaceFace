# DONE — hostile-for-ai-earlyout

## Summary

Rewrite `isHostileForAI` hot body: no empty-object fallback, gate rare Ceres / faction-first-fire paths behind cheap team/zone/doctrine checks, null-safe ai property reads. Correctness-equivalent on 20×2000 pair sweeps vs master body.

Focused: ai-engagement-authority + ai-engagement-sg03 + hunter-origin → **28/28** pass.

## Before / after

### Offline microbench (primary — portable CPU)

NPC-pair / no-ai mixes (perception-like; no player `isHostileToPlayer` dilution):

| mix | Before | After | Speedup |
|---|---:|---:|---:|
| noAi (data, missing ai → was `\|\| {}`) | **70.9 ms** | **26.6 ms** | **~2.67×** |
| npc (ships with ai, no player in pairs) | **83.6 ms** | **48.6 ms** | **~1.72×** |

Mixed world including player path (oracle + `isHostileToPlayer` shared cost): **~1.25×** (still correct; differential diluted by callee).

Phase A cite: hitch-hillclimb-fresh-20260923 — `isHostileForAI` **39.6 ms** self / 60 s settled.

### Quiet soft-GPU crucible

Not required; primary signal is the offline microbench. GPU tier: **software**.

## Evidence

- Patch: `patches/0001-perf-ai-structural-early-outs-for-isHostileForAI.patch`
- Scratch: `vm-work/hostile-for-ai-earlyout` @ `1ef01cc3c22d9d67ca592075baba78373d053733`
- Microbench: `artifacts/hostile-for-ai-earlyout-microbench.json` + alloc probe
- Tests: `artifacts/hostile-for-ai-earlyout-focused-tests.log`
- Measured against master `35e519ebd`

## Apply order

Independent.

## Risks

- Callers that depended on `self.data.ai || {}` mutating a throwaway object were already wrong; behavior now treats missing ai as null (same boolean outcomes).
- Ceres gate requires `selfAi.zoneId === zone_ceres_ambush` before the deep relation — matches `isAuthorizedCeresAmbushPreyRelation` prerequisites.
