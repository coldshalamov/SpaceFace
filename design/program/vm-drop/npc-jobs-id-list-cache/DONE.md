# DONE — npc-jobs-id-list-cache

## Summary

Cache `Object.keys(state.npcJobs.byId)` for the per-tick `npcJobsRuntime.update` drive. Rebuild only when the bag is dirtied (assign / release / tombstone delete / deserialize / wipe) or `byId` object identity changes.

Focused suites: wiring + convergence + spatial-query + kernel + working-trades + towing (+ occupational heads / natural census / work-target in same log) → **all pass** (see artifacts log; no failures).

## Before / after

### Offline microbench (primary — portable CPU)

120 jobs × 10k update-like iterations (Object.keys + eligibility walk):

| | Before (`Object.keys` every tick) | After (cached id list) | Speedup |
|---|---:|---:|---:|
| wall | **50.0 ms** | **20.8 ms** | **~2.41×** |

Phase A cite: hitch-hillclimb-fresh-20260923 — `npcJobsRuntime.update` **59 hits** self.

### Quiet soft-GPU crucible

Not required; primary signal is the offline microbench. GPU tier: **software**. Picture defaults ON (untouched).

## Evidence

- Patch: `patches/0001-perf-npcJobs-cache-Object.keys-byId-for-per-tick-driv.patch`
- Scratch: `vm-work/npc-jobs-id-list-cache` @ `c34e1072fd8d133cdf084fc256ed94def3c38c1a`
- Microbench: `artifacts/npc-jobs-id-list-cache-microbench.json`
- Tests: `artifacts/npc-jobs-id-list-cache-focused-tests.log`
- Measured against master `35e519ebd`

## Apply order

Independent. Complements `npc-field-role-cache` / customs / hostile earlyouts (different files).

## Risks

- Callers that mutate `byId` without going through runtime assign/release must also dirty the cache; all in-file writes are covered. Deserialize / wipe invalidate explicitly.
