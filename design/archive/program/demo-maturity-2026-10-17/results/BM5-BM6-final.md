# BM5 + BM6 performance legs — 2026-10-17

BM6 has a measured clearance-query improvement. BM5 has an AI candidate but no demonstrated
performance win. Neither frame-solid comparison passed; neither ledger row was changed.
Changes are uncommitted for orchestrator review, as required by `_constraints-codex.md`.

## Host and comparison limits

- Intel Core Ultra 7 155U, 14 logical cores, Intel Graphics through ANGLE/D3D11; headed Chrome,
  1600×900, production defaults, medium quality, bloom enabled, render scale 1. No population,
  geometry, effects, physics, camera tuning, or quality reductions.
- All four completed reports name HEAD `3d3dfbbe821`. Runtime changes are the working-tree
  candidates listed below. The intervening orchestrator commit changed campaign documents only.
- The host was not quiet throughout. Background ZCode, antivirus, System, and occasional Git
  activity were observed. Approximate profile-window total CPU samples were BM5 before
  35–61% (median 56%), after 30–41% (34%); BM6 before 33–77% (49%), after 30–61% (37%).
  These totals include the probe/browser and monitoring. Raw process samples are in
  `.devshots/bm5-bm6/host.jsonl`. Different contention prevents attributing the entire throughput
  change to the patch. No certification beyond this box is claimed.
- Sampling interval was 500 microseconds in every run. Submissions/s below is the instrument's
  submission frame delta divided by its CPU-profile wall duration. Public steering ends the
  return phase on arrival, so route durations differ; normalized owner cost is also reported.

## BM5 — D191 Ceres refinery

Player-visible intent: reduce repeated AI sensor work while retaining every actor and sensor rule.

The real-body profile names Rapier `stepWithEvents` as the dominant native solve owner:
2566.3 ms over 30.38 s. The Orchard mutation-wrapper aggregate was 2657.5 ms; the 91.2 ms
remainder includes other wrapped mutations and must not be called isolated guard overhead.
Within tactical AI, `_sensorFrameFor → entityContacts` repeatedly reads the same observer
position/sensor health and resolves target combat runtimes before checking the contact-base cache.

The candidate hoists observer-local values and resolves target runtime only on a base-cache miss.
Contact confidence arithmetic, range, hostility, cadence, population, and ordering are preserved.

Command pair:

```text
node scripts/probe-frame-solid.mjs --cpu-profile --route=ceres-refinery --seed=14920 --sim-lane=main
node scripts/probe-frame-solid.mjs --cpu-profile --route=ceres-refinery --seed=14920 --sim-lane=main --compare=.devshots/frame-solid/2026-10-17T08-19-17-446Z.json
```

The probe stages Ceres from real New Game, waits 10 seconds, then flies a 30-second local weave.
It starts with 170 live entities in both runs, rather than the historical 111-entity Node fixture.
The explicit main simulation lane exposes physics/AI to the page profiler; these are not default
worker-lane FPS results. Both runs stay within 215 WU of the refinery entry.

| Same-instrument metric | Before | After |
|---|---:|---:|
| Submissions/s | 14.65 | 16.22 |
| Frame p99 | 149.4 ms | 146.6 ms |
| Longest frame | 2167.8 ms | 2362.0 ms |
| Rapier `stepWithEvents`, inclusive | 2566.3 ms | 2599.3 ms |
| Tactical AI update, inclusive | 670.6 ms | 879.4 ms |
| `_sensorFrameFor`, inclusive | 281.9 ms | 485.2 ms |
| `entityContacts`, inclusive | 164.6 ms | 257.7 ms |
| Stuck-missing samples | 764 | 411 |
| Bodies leaving undrawn | 5 | 7 |
| Links inside drawn frames | 0 | 0 |

Verdict: **no demonstrated AI speedup; D191 remains unresolved**. The throughput observation does
not override the higher sampled AI cost. `COMPARE: FAIL` because bodies leaving undrawn rose 5→7;
both standalone runs also fail their existing missing-body checks. The AI edit is a candidate for
review, not an accepted performance repair.

Evidence: `.devshots/frame-solid/2026-10-17T08-19-17-446Z.json` and
`2026-10-17T08-23-44-554Z.json`, their `cpuProfile.path` files, and
`.devshots/bm5-bm6/bm5-before.log`, `bm5-after.log`.

Focused tests: `ai-sensor-confidence-batch`, `ai-solid-payload-contact`,
`tactical-ai-contact-index`, `tactical-ai-id-reuse`, `tactical-ai-production-cadence`,
and `ceres-active-pockets` (all under `test/`, suffix `.test.mjs`):
**tests 33; pass 33; fail 0**. Raw output: `.devshots/bm5-bm6/bm5-tests.log`.

## BM6 — D130 ordinary Adventure flight

Player-visible result: the camera's structural-roof queries do substantially less work with the
same returned clearance heights and authored picture.

The baseline names `cameraRoofAt → clearanceNeighborhoodRaw` as a main-thread stall owner:
3157.4/2856.9 ms inclusive, with 621.4 ms in the clearance query during the longest 1521 ms busy
stretch. The BVH visited overlapping triangles even after lower branches could no longer raise
the maximum roof. The fix visits high bounds first and prunes a branch only when its conservative
world-space upper Y cannot exceed the already found Float32 roof; projective transforms retain
the overlap walk. Camera governors and clearances are unchanged.

Command pair (both include the same BM5 AI candidate):

```text
node scripts/probe-frame-solid.mjs --cpu-profile --seed=4242
node scripts/probe-frame-solid.mjs --cpu-profile --seed=4242 --compare=.devshots/frame-solid/2026-10-17T08-26-26-016Z.json
```

Default worker simulation, Helios Prime New Game, 139 live entities at measurement start in both
runs, same video settings. Flight uses W/A/D away from the station, back, then a 20-second loiter.

| Same-instrument metric | Before | After |
|---|---:|---:|
| Profile duration | 63.44 s | 49.87 s |
| Observed frames | 1734 | 1913 |
| Submissions/s | 27.51 | 38.76 |
| Frame p99 | 130.9 ms | 73.1 ms |
| Longest frame | 1713.0 ms | 1716.6 ms |
| `clearanceNeighborhoodRaw`, inclusive | 2856.9 ms | 265.2 ms |
| Clearance query per observed frame | 1.648 ms | 0.139 ms |
| `cameraRoofAt`, inclusive | 3157.4 ms | 421.7 ms |
| Blink / root-swap counts | 1 / 1 | 0 / 0 |
| Stuck-missing samples | 1 | 39 |
| Flight admission shader links | 14 | 15 |
| Links inside drawn frames | 0 | 0 |
| Bodies leaving undrawn | 3 | 1 |

Verdict: **the named query costs 91.6% less per observed frame in this pair**, supported by the
exact-roof pruning fixture. Overall p99/submission improvements are measured observations under
different host contention, not a quiet-host or whole-game guarantee. `COMPARE: FAIL` because
stuck-missing samples and admission links rose; late-appearance p95 also rose 886→1960 ms.
**D130 remains open.** GPU execution time was not isolated by this CPU profiler; `(program)`
samples do not establish a particular GPU pass as causal.

Evidence: `.devshots/frame-solid/2026-10-17T08-26-26-016Z.json` and
`2026-10-17T08-29-44-839Z.json`, their `cpuProfile.path` files, and
`.devshots/bm5-bm6/bm6-before.log`, `bm6-after.log`.

Focused tests: `cv-glass-2-clearance-bvh`, `camera-clearance-translation-cache`,
`camera-clearance-roof-query`, `camera-clearance-floor-retain`, and
`pic-07-wreck-camera-clearance` (all under `test/`, suffix `.test.mjs`):
**tests 37; pass 37; fail 0**. The new dense-shell test matches the full raster exactly while
visiting under 1% of its triangles, including tilted/mirrored transforms.
Raw output: `.devshots/bm5-bm6/bm6-tests.log`.

## Exact changed files and handoff

- `src/systems/aiPorts.js` — BM5 sensor-loop candidate; no accepted performance win.
- `test/ai-sensor-confidence-batch.test.mjs` — confidence/range/update and observer-isolation checks.
- `src/render/clearanceQuery.js` — BM6 maximum-height BVH traversal.
- `test/cv-glass-2-clearance-bvh.test.mjs` — exact-raster/pruning regression.
- `scripts/probe-frame-solid.mjs` — explicit route/seed/simulation lane, Ceres setup, route identity.
- `design/program/demo-maturity-2026-10-17/results/BM5-BM6-final.md` — this report.

Adjacent defects observed and left for the orchestrator: both routes have missing/admission-delayed
bodies; Adventure's baseline also blinks/replaces one root. These are recorded in the raw existing
instrument outputs above; no new ledger or ledger edit was made. No commit, staging, stash,
checkout, reset, restore, or publication was performed. The probe/browser/server and host monitor
have exited. `git diff --check` passed for the changed tracked source/test/probe files.
