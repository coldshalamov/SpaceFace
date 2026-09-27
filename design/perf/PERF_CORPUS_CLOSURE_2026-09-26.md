# Performance corpus closure — 2026-09-26

Reconciliation of EVERY performance item across the repo's perf corpus against the
`devin/1790392438-perf-pipeline` branch state. Owner ask (2026-09-26): "take up all
performance work and all possible performance work and all performance plans and either
implement them or declare them worthless or negative value."

Corpus reconciled: `design/PERF_OPTION_SPACE.md` (PERF-21→97 + PQ-196..203),
`design/program/PERF_HITCH_CAMPAIGN.md` (PQ-129.01–.19), `design/program/PERF_ADVANCED_CAMPAIGN.md`
(PQ-204), `design/program/PERF_PERSISTENCE_CAMPAIGN.md` (phases 0–18),
`design/PERFORMANCE_MODERNIZATION_EXECUTION_PLAN.md` (PERF-00→10),
`design/BUILD_PLAN_2_0.md` A2/E1, `design/PERF_TRIAGE.md`, `design/PERF_BUDGET.md`,
`design/perf/TABLE_AUTHORITY_PLAN.md`, `design/program/PERF_WHAT_MATTERS.md` (operator list).

Verdicts: **SHIPPED** (code live + receipt/verification), **LANE** (wave-2/wave-3 child session
implementing + A/B on this branch), **REJECTED** (evidence receipt exists or fresh census shows
not-the-pole), **GATED** (legally admissible but blocked on an evidence gate this headless box
cannot produce — owner-GPU headed fly), **ILLEGAL** (violates picture contract).

## 1. Hitch campaign (PQ-129) — leaf-by-leaf

| Leaf | Work | Verdict |
|---|---|---|
| .01 tabletop census | PQ-061 | SHIPPED — receipt PQ-129-01 |
| .02 live hitch classifier | PQ-062 | SHIPPED — 97.8% named coverage, receipt |
| .03 phase timers | PQ-063 | SHIPPED — receipt; scene pass was pole at the time |
| .04 compose-part-slice | PQ-073 | REJECTED — zero live compose hitches (receipt .04) |
| .05 next-contact warm | PQ-075 | REJECTED — zero live compose/admission hitches |
| .06 shader-key census | PQ-064 | SHIPPED — 14+12 draw-time links enumerated |
| .07 exact-key prewarm | PQ-072 | REJECTED — both candidates worsened the fly |
| .08 upload-after-present | PQ-074 | REJECTED — zero upload hitches on live fly |
| .09 leftover admission | PQ-054 | REJECTED — zero admission-owned hitches |
| .10 catch-up echo | PQ-101 | SHIPPED — recovery fuse cut streak 173→56 |
| .11 glass-runway submit | PQ-068 | SHIPPED per campaign facts (glass + 0.75 s runway); tighten only on census → see lane3/landmarks |
| .12 rigid opaque batching | PQ-052 | GATED — needs crowded headed fly naming draw-count; `_opaqueBatchEnabled` stays false by contract |
| .13 on-glass lane collapse | PQ-076 | LANE wave-3 `progkeys` (legal program-key reduction, not a style change) |
| .14 tiny-on-glass LOD | PQ-108 | GATED — needs projected-px census; quality-adjacent, hold |
| .15 table cadence | PQ-080 | REJECTED-as-shipped — S0–S4 activity tiers live (activityScheduler) |
| .16 bloom/HDR fusion | PQ-097/078 | SHIPPED — single-clear 258.8→111.7 ms; shadow gate → 3.6 ms |
| .17 autosave hitch | PQ-087 | REJECTED — autosave named zero times in 51 hitches |
| .18 pole sweep | PQ-094 | COVERED — this campaign IS the recurring sweep (probe + lanes) |
| .19 sim-hitch attribution | PERF-89 | LANE wave-3 `simattr` — per-frame max-owner instrumentation |

## 2. PQ-204 deterministic smoothness — all waves shipped

Incremental spatial hash, combat SoA (`packCombatTable`), dirty bitsets, NEAR token budget,
save-safe Rapier sleep (`setCanSleep` path verified in `sg02DynamicBodyOwner.js`), off-glass
outcomes, packed-ORM family key, after-present compile, in-flight admission, binary program
cache (`WEBGL_get_program_binary` in `programBinaryCache.js`), occupancy lights, snapshot fence,
hidden-skip + arrival slice. Stated leftovers → `progkeys` (non-canonicalized materials),
`fatlist` (hangar occupancy walk), `glflags` (.12 GPU-batch gate).

## 3. Persistence campaign phases 0–18

| Phase | State |
|---|---|
| 0–7 | Live (ledger, activity tiers, far AI, Rapier active set, catch-up, residency, shell-first) |
| 8 flight packages | Live partial; fully-offline flat package = render-packages work on this branch (267 rebuilt + pinned) |
| 9 cooker | Deferred — offline selection contract only; no live consumer |
| 10 material ABI | LANE `progkeys` — 25% program-key reduction is its acceptance |
| 11 submit lanes | Disabled seam — no production range uploader; GATED on a measured upload pole |
| 12–13 governor + snapshot fence | Live |
| 14 Worker | Disabled seam — GATED (PERF_WHAT_MATTERS: not until entityList emptied + spike proves copy<savings) |
| 15 save/UI/audio | Partial live → wave-3 `audiocull` + wave-2 `memoff` (disk offload) |
| 16 background | No consolidation admitted — CLOSED worthless (no named pole) |
| 17 Electron | Wave-1 `electron` lane landed flags; backend flag matrix → wave-3 `glflags` |
| 18 WebGPU | GATED — future escalation, stays WebGL |

## 4. Modernization PERF-00→10

PERF-00 harness (live: probe suite), PERF-01 lifecycle (live), PERF-02 scheduler seam (live),
PERF-03 offline render compiler (live — render packages), PERF-04 PresentationWorld (live —
packed snapshot fence), PERF-05 hot-query service (live — `queryFarActors` off the hot profile,
spatial hash), PERF-06 dirty-range uploads (partial → folded into `bufpolicy`/`texevict` scope),
PERF-07 Electron modernization (live + wave-1 flags + `glflags`), PERF-08 GPU correction
(shadow-refresh gate landed; residual branches gated on owner-GPU trace), PERF-09 sim Worker
(GATED — PQ-067 spike required), PERF-10 WebGPU slice (GATED).

## 5. Option-space remainder → wave-3 lanes

| Item | Lane |
|---|---|
| PERF-36/76 lane collapse, PERF-90 packed-ORM, ABI 25% | `progkeys` |
| PERF-89 sim-hitch attribution | `simattr` |
| PERF-69 GL flags, PERF-70 ANGLE, PERF-92 present parity | `glflags` |
| PERF-73 prod probes off | `probeoff` |
| PERF-65 audio table cull | `audiocull` |
| PERF-93/94 residual fat-list walks | `fatlist` |
| PERF-59 scene-graph flatten | `scenegraph` |
| PERF-77/102 hidden-screen unload | `hiddenskip` |
| PERF-74 idle admission | `idleadmit` |
| PERF-67 state-change sort | `drawsort` |
| PERF-79 buffer policy | `bufpolicy` |
| PERF-46 texture residency evict | `texevict` |
| PERF-58 speedline residual | `speedline` |
| PERF-31/119 landmark demotion | `landmarks` |

Wave-2 lanes still running cover: entityList demotion (TABLE_AUTHORITY lane A — the named
"next 50%"), calendar straddle, shaderwarm v2, prefetch depth, shared decode pool, shadowcast
(PERF-37), memoff (buffer→disk), lodrebuild (84 MB stale), marginmemo, gltfworker (PERF-63).

## 6. Explicitly closed — worthless/negative/illegal

| Item | Verdict |
|---|---|
| Bloom off / weaker bloom | ILLEGAL — measured ~0.5 ms, 1% (WHAT_MATTERS) |
| Exact-key/dummy prewarm retry | REJECTED — made fly worse 147→207–219 ms |
| Mixed unique-hull mega-batch | REJECTED — lost 250–616 ms p95 |
| Per-triangle runtime occlusion | WORTHLESS — costs more than drawing the table |
| Hornet seats as perf task | WORTHLESS — not the live ship |
| Rust/Bevy engine port, WebGPU "because new", sim Worker now | GATED — copy-cost spike unproven; legal later |
| Dynres/FSR/quality presets | ILLEGAL — quality cut |
| Shrink hail 5200 / region fade 1500 / NPC-signature constants | ILLEGAL — gameplay/sky, not submit cost (PERF-84/85/87) |
| PQ-129.15 re-implementation | REJECTED — activity tiers already live |
| Autosave slicing (.17) | REJECTED — not on the classifier |
| Menu-world full unload of durable state | ILLEGAL — persistence contract; `hiddenskip` only freezes presentation |
| PERF-16 background consolidation | WORTHLESS — no named pole |

## 7. Build-map leftovers (A2/E1)

- Boot precompile behind loading veil — SHIPPED via FlightReadySet (phase-7 live).
- `check:perf` strict 60 fps p95 16.9 vs 16.7 ms — GATED on owner GPU (headless box is
  SwiftShader); residual expected to close via wave-2/3 merges.
- E1 parallax hitches — DONE (check:hitch-budget referenced green at build-map write time).

## 8. What remains genuinely open after waves 2–3

1. Owner-GPU headed census (`.12` batch, `.14` LOD, PERF-96/97) — cannot run on this VM.
2. Worker/WASM/WebGPU/native platform ports — gated on copy-cost spike (PQ-067).
3. Any NEW pole the sweep finds — handled by `simattr` + next-wave lanes.
