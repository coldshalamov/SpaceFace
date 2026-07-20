# Live Acceptance Matrix

**Audit date:** 2026-07-14 for the M0–M6 and Depth rows below.
**Sprint 2 packet rows appended 2026-07-18** at commits `4f750412`, `cd784532`, `d5e0d6e7`; those rows
carry their own evidence and do not promote any milestone row.

**Integration checkpoint refreshed 2026-07-20:** graphics, the earlier performance checkpoint, and
paused Atlas/map/travel work were promoted together at `ee9e0ab3`; context-recovery hardening is
reachable through `f0b3b154`. Graphics closeout `cbdf1589` is now on `master`, including exact golden
asset receipts, authored fail-closed admission, semantic PBR/native-color routing, common-rock maps,
typed projectile/mine/impulse/wreck identities, and Atlas/journey verification gates. The reviewed
  performance tip `99cad5b5` and Atlas/camera repair `21d82428` are integrated at `b235f062`; strict
  evidence hardening is integrated through `280cafb0`, and authored propulsion wiring/lifecycle
  repair `59f91d19`, geology/interaction truth `e8838e2c`, and the Electron RCS evidence repair
  `3d2dc765` are also on `master`; current audited HEAD is `1074c078`. The old lease/blocker columns
  below are historical. Final
  combined browser/Electron/GPU performance evidence has not passed. The isolated
  `04805924..9d626fd8` scene-pool/BatchedMesh range was measured and rejected on target Intel
  hardware; none of it is an integration candidate and current ship-local static batching remains.
  This checkpoint updates
M1/M6 implementation truth but exits neither milestone; remaining visual/performance acceptance is
recorded in [`08_GRAPHICS_OVERHAUL_CHECKPOINT.md`](./08_GRAPHICS_OVERHAUL_CHECKPOINT.md).

## Sprint 2 — Corridor Contract Wave packet rows

| Packet | Terminal state | Evidence at commit | Commit | Blocking lease |
|---|---|---|---|---|
| `G01` | `FOCUSED_GREEN` + `INTEGRATED` | contract test 31/31; `check:launch-policy` OK | `d5e0d6e7` | — |
| `T01` | `FOCUSED_GREEN` + `INTEGRATED` | `test/massline-orbit-telemetry.test.mjs` 26/26 | `cd784532` | — |
| `A01` | `FOCUSED_GREEN` + `INTEGRATED` | `test/asteroid-formation-model.test.mjs` 33/33 after the `5c1d9c0c` r4 overflow fix (31/31 as first landed) | `cd784532`, `5c1d9c0c` | — |
| `W01` | `FOCUSED_GREEN` + `INTEGRATED` (coverage-only) | `test/e1-encounter-phase-dispatch.test.mjs` 14/14; seam held, no extraction | `cd784532` | — |
| `G04` | `SUPERSEDED BY WAVE-01 ROUTE_ACCEPTED` | This first measurement inverted the stated cause; the later clean-checkout run closes attribution and is authoritative in the Wave-01 row below. | — | historical measurement |
| `A03`, `G07` | `BLOCKED_BY_LEASE` | write-set needs `src/render/renderer.js` / `bloom.js`, both dirty | — | `MAP-2026-07-18` |
| `W05` | `BLOCKED_BY_LEASE` | write-set needs HUD/map; `galaxyMap.js` observed changing twice mid-sprint | — | `MAP-2026-07-18` |
| `G08` | `NOT_STARTED (dependency)` | depends on `G07` (blocked), `A04`, `A05` | — | via `G07` |
| `G02`, `G03`, `G05`, `G06`, `T02`, `T03`, `T04`, `A02`, `A04`, `A05`, `W02`, `W03`, `W04`, `W06` | superseded for `G02,G03,T02,T03,A02,A05,W02` by the Wave-01 rows below; `G05,G06,T04,A04,W03,W04,W06` remain `READY`/`PLANNED` for Wave-02 | contracts in `roadmap/05_SPRINT2_READY_CONTRACTS.md` | — | save-schema mutex resolved by `edca7c7e` (clean-worktree regeneration) |

## Wave-01 — PROGRAM-WAVE-01-RECOVERY-ROOTS packet rows (2026-07-18, commits on `master` at `c751b9a9`)

Every row carries its own commit-bound evidence; review-round history in `NOW.md`. `pending R3`
means integrated with focused proof, awaiting the final independent review verdict.

| Packet | Terminal state | Evidence at commit | Commits |
|---|---|---|---|
| `T02` | `FOCUSED_GREEN`+`INTEGRATED` (pending R3) | massline-invariants 47/47; tolerances grounded in shipped constants, validator strict, catalog-decoupled | `1a9f98e5`,`f7e8a4fd` |
| `T03` | `FOCUSED_GREEN`+`INTEGRATED` (pending R3) | contract suite 9/9; legacy path byte-identical (hard-coded rung-07 pins); `check:massline:target-scoring` green | `6d411cf5` |
| `A02` | `FOCUSED_GREEN`+`INTEGRATED` (pending R3) | persistence 17/17; physical-identity anchor keys; save-family 71/71; clean-tree `check:save-schema` GREEN; goldens stable | `b29dd72c`,`cdf2484b`,`edca7c7e`,`80a8e846` |
| `A05` | `FOCUSED_GREEN`+`INTEGRATED`, rerun post-A02 | contact-ring-law green at `c751b9a9` (252-test family); access law through production canInstall/installMachine | `936be4f2`,`f1a210cf`,`9584053c` |
| `A06` | `FOCUSED_GREEN`+`INTEGRATED`, rerun post-A05 | site-thermal 62/62; order-independence proven over accepted colliding inputs; overflow-safe capacity/load | `4c367cd7`,`53452e84`,`ce4dddee` |
| `A08` | `FOCUSED_GREEN`+`INTEGRATED`, rerun post-A05 | site-signature green; duplicate aggregation order-independent, telemetry type-gated | `491b0726`,`fd47884e`,`9584053c` |
| `A10` | `FOCUSED_GREEN`+`INTEGRATED` | lane-network 32/32 incl. ownership/intake-block/drift/extreme/preflight ruling pins | `7a250289`,`61e84071`,`c751b9a9` |
| `W01` repairs | both OPEN defects CLOSED | e1-dispatch green; single-shot offers, no duplicate choice lines; 47a goldens unmoved | `4891099a`,`9584053c` |
| `W02` | `FOCUSED_GREEN`+`INTEGRATED` | trace contract green incl. real serialize/restore traversal and independently recomputed digests | `ae423dd7`,`9584053c` |
| `G02` | captured+restored, `INTEGRATED` (pending R3) | `fresh-start` sha256-bound artifact + receipts; ladder validator green | `fb9a0c82` |
| `G03` | captured+restored, `INTEGRATED` (pending R3) | `first-station` 11-milestone public route; restore + public re-dock proves all claims literally | `fb9a0c82` |
| `G04` | `ROUTE_ACCEPTED` | autopilot fully green; sim compares ok; five public dock successes incl. **clean-checkout** run (96s, closest 154.166 WU, 1 KeyE hold) — attribution to committed code CLOSED | measurement only |

## Program batch PQ-001..PQ-010 — controller session 2026-07-20 (commits on `master` through `b28d183b`)

The first five outcomes of the canonical cross-plan queue (`roadmap/program-queue.json`), integrated
serially with lead-verified proof at each commit. Worker receipts were candidates only; every gate
below was rerun by the integrating controller.

| Queue item | Canonical | Terminal state | Evidence at commit | Commits |
|---|---|---|---|---|
| `PQ-001` | `M2-REVALIDATE`, `M6-PERFORMANCE` (partial) | `INTEGRATED`; baseline recorded | Planning transaction separated (`2bc3042f`,`6454038a`); precheck DOA repaired (`99661d51`); continuity harness live-green on **browser + Electron** (`check:m2:seamless-world` PASS exit 0 at `b28d183b`, receipt in `.devshots/m2-floating-origin/`), unit suite 41/41; baseline at exact-clean `b28d183b`: launch-policy ✓, sim + v3 compares ✓, visual-stability ✓ (360 frames), save-schema ✓ (**recorded dirty-tree red CLOSED**), encounter-director ✗ (unchanged W06 debt), strict perf ✗ with three named rows (below) | `2bc3042f`,`6454038a`,`99661d51`,`b28d183b` |
| `PQ-002` | `T01` reuse + `T05` seam | `FOCUSED_GREEN`+`INTEGRATED` | lab suite 5/5; deterministic matrix digest `e935…44e2` (cross-process hash-equal); 16-cell sweep; tuned-PD vs detuned vs NaN discrimination proven; both sim compares ok/hashEqual; `check:massline:lab` wired | `aec26203` |
| `PQ-003` | `T04` + bounded T06/T07/T16 contributions | `FOCUSED_GREEN`+`INTEGRATED` | grammar+latch+travel 40/40; reelpump/release/target-scoring green; gamepad 22 assertions (yields to dock prompts); input-modalities/settings-profile/controls-discoverability green; save schema v11 regenerated from clean HEAD; legacy profiles byte-identical via version marker; both sim compares ok/hashEqual | `77976fd3` |
| `PQ-008` | `G04`,`T13`,`F18` | `FOCUSED_GREEN`+`INTEGRATED`+route | proxy/docking suites 29/29 (31/31 after berthed-phase fix); `check:physics-authority` OK; sim compares ok/hashEqual with exact-HEAD isolation proof; **`check:autopilot` fully green through the new corridor geometry**; Helios manifest: silhouette bound 0.2191≤0.24, 23 proxies≤32, navigable gap 0.52 | `9bde1c8f`,`47288394` |
| `PQ-009` | `T08` substrate | `FOCUSED_GREEN`+`INTEGRATED` | weapon-impulse suite 14/14 (flag-ON explicit); impulse:authority extended green; physics-authority green; adjacent suites 85/85; golden pin `COMBAT_FLAGS.weaponImpulseConsequences` OFF for 47a (goldens untouched, both compares exit 0 restored after a lead-caught golden move) | `a47cfcbd` |
| generated docs | — | integrated | EVENT_ROUTING/SYSTEM_REGISTRY regenerated at HEAD (89 systems) | `8ac9d32e` |

**M2 combined seamless-world is GREEN for the first time**: browser and Electron both pass the full
natural-route continuity contract (initial admission → stable → LOD probes → two-stage rebase →
interpolation → membrane → round-trip → save → reload → settled Continue). The old
"Electron websocket reset" red is superseded.

**Strict perf baseline at `b28d183b` (recorded, not hidden):**
1. `spatialHash.queriesPerSecond.max` 62.9 vs 55 — reproducible across two runs; NO new query sites
   exist in the batch's code (verified); suspected behavioral amplification via live impulse
   consequences in crowded flight, or a pre-batch exceedance (no green record exists at this
   budget). M6-PERFORMANCE debt with a bounded attribution follow-up.
2. `raf.frame.p95.target` 16.8 vs 16.7 — the WebGL-submit-noop floor itself measures 16.8 on this
   display (vsync quantization); the budget is unachievable on this mode. Needs a budget-vs-floor
   reconciliation ruling, not a quality change.
3. `evidence.worktree.cleanAndStable` — probe ran mid-ledger-transaction (dirty NOW.md); resolves at
   this transaction's commit.

**Named defect surfaced by the truthful harness (graphics-lane debt):** `station-applied-lod-inert` —
Helios's authored root carries real lod0/1/2 tagged topology, but neither the probe's `lod2` request
nor the renderer's own steady-state selector (`lod1`) changes the visible bucket set; the station
renders LOD0 unconditionally. Receipts in the m2 report; diagnosis in `.tmp/orch/diag4-helios-lod.mjs`
output (2026-07-20).

**Pre-existing red re-attributed:** `check:combat` fails an equal-player/AI-damage assertion stale
since the 2026-07-16/17 difficulty multiplier (1.15×) — predates this batch.

**4 of the sprint's 23 packets reached a declared terminal state.** With `F01–F17` that is 21/113
(18.58%) of the packet program — not the 40/113 the sprint scoped. No packet is claimed beyond its
proved state, and no blocked packet was substituted with an easier one.

The four green packets are contracts and a harness. None is wired into the runtime, so none of them
moves any player-facing acceptance row below. `M1-ROUTE` in particular is **not** improved by this
sprint; it is re-measured and re-attributed (see `02_REMAINING_WORK.md`), which changes what the next
lane should repair, not whether it is repaired.

**Audit date (original rows):** 2026-07-14

**Purpose:** prevent implemented code or focused checks from being mistaken for a finished milestone.

| Track | Implementation | Fresh focused/current check | Public-route truth | Evidence truth | Conditional clean waves | Exit status |
|---|---|---|---|---|---:|---|
| M0 | Broad evidence/observatory foundations | Contract self-test green; live corpus RED: 13 issues / 20 records | Current-revision baseline not rerun | Old baselines exist; corpus invalid | 0 recorded | NOT EXITED |
| M1 | Focus, camera, tether, doctrines, autopilot substantially built | Doctrines 23/23; tether/mass green; `check:autopilot` fully green; clean-checkout G04 browser route accepted | Public browser pilot docks Helios through ordinary input; current Electron journey plus Focus/camera/counterplay remain incomplete | Partial/stale media | 0 recorded | NOT EXITED |
| M2 | 24-region/global-coordinate architecture substantially built | Combined run RED on Electron websocket reset; browser portion reached save/Continue | Browser path passed during run; Electron incomplete | Existing receipt present but current combined result red | 0 recorded | REVALIDATION REQUIRED |
| M3 | Origins, cohorts, Hunter intent, damage/death substantially built | Career origins green | Natural damage/Game Over proven; recovery and three full 90-minute routes open | Damage/after-action images exist | 0 recorded | NOT EXITED |
| M4 | Regional ecology/POI foundations built | RED 8/9 on registry/save initialization order | Sparse/normal/crowded diversity routes open | Art/classification incomplete | 0 recorded | NOT EXITED |
| M5 | Story/endings/outposts/role foundations built | Role continuity green | Supporting injected role route only; ordinary story/ownership routes open | Partial | 0 recorded | NOT EXITED |
| M6 | Capture/release/localization/perf foundations, loading/admission, de-hazed background, pooled thruster/RCS, golden Kestrel/Helios/geology surfaces, Wasp routing, exact receipts, authored fail-closed admission, semantic PBR routing, typed combat/world identities, propulsion repair `59f91d19`, geology truth `e8838e2c`, and RCS evidence repair `3d2dc765` are retained in combined `master`; strict evidence gates are integrated through `280cafb0` | Asset-live, launch-policy, focused VFX/background/post checks, and current visual stability pass; exact receipts plus 167 performance, 49 graphics, 35 evidence-contract, 15 RCS-mapping, and 11 production-wiring checks pass. Current stability is 360 frames / 315 inspected / zero failures; fresh normal-settings hardware Electron propulsion reports four layers, two RCS jets, zero allocations, and no issues. Fresh headed performance promotion remains open | Authored browser and normal-settings thruster Electron routes pass; compact/reduced/dense/Spector propulsion proof, natural Helios/rock motion, combined continuity, combat-family Electron/GPU, and packaged-store matrix remain incomplete | Hitch glare, Helios bulk material, faux-rock interaction, and the known hidden asteroid instance-pool ghost are repaired in implementation. Full OpenCode Helios and later live-pooling experiments are rejected; Wasp classification, broader natural-route flicker continuity, combat-family acceptance, natural Helios/rock parity, localized background art, fleet-wide PBR, and release evidence remain | 0 recorded | NOT EXITED |
| Depth | Checkpoint `850c80f3` preserves focused implementations for 16 chunks after W1 correction | Pre-checkpoint aggregate green; not rerun at current HEAD | Many routes compress state/timing; final unassisted routes open | All Depth `.devshots` ignored; no chunk DONE | N/A | 0 / 31 DONE |

## Fresh audit details

### Green

- `npm run check:alpha:evidence:contract`
- Asset classification gate: 19 valid records, 0 accepted.
- Observatory Phase-A contract/passive/rates/health checks.
- `npm run check:m1:combat-doctrines` — 23/23.
- `npm run check:m1:tether-mass`.
- `npm run check:m3:career-origins`.
- `npm run check:m5:role-continuity`.
- Release-capture contract 4/4 and no-browser self-test.
- `npm run check:graphics:asset-receipts` — PASS at combined `b235f062`, pinning Helios
  `94CB9DC7...A578`, rock A `E9997140...FDA`, Wasp candidate `FDFD7C76...3E5A`, and RCS
  `EBB28EE...4934` with exact byte/triangle receipts in the checker output.
- Focused authored-admission, surface-tint, rock-surface, projectile-family, impulse-charge,
  runtime-visual-coverage, and wreck-identity tests pass 49/49 on combined `master`.
- Propulsion repair `59f91d19` passes 15 RCS mapping tests, 11 production-wiring checks, sign truth,
  save/restore/destroy lifecycle, thruster-pack, settings, and VFX-sleep checks.
- Post-`e8838e2c` `npm run check:visual-stability` — PASS: 360 frames, 45 warmup, 315 inspected,
  zero failures.
- Fresh `npm run check:thruster:electron-route` after `3d2dc765` — PASS on hardware Intel
  ANGLE/D3D11: four plume layers, two opposed RCS jets, zero frame allocations, no issues. The JSON
  still lacks embedded Git identity.
- All 17 performance-modified test files pass 167/167 together on combined `master`; camera and live
  AI-telegraph checks also pass.
- Last recorded `npm run check:depth-program:contracts` before checkpoint `850c80f3`; rerun at current
  HEAD is required before calling it current green.
- Last recorded S4/W1 isolated tests — 18/18 before the checkpoint; no acceptance promotion.

### Red or incomplete

- `npm run check:alpha:evidence` — 13 issues across 20 records.
- ~~Strict M1 Helios route — best 294.777 WU, final 324.520 WU, no dock prompt.~~ **Contradicted
  2026-07-18 and clean-tree attribution closed.** `check:autopilot` is fully green, multiple public
  pilots docked `station_helios`, and the clean `fb9a0c82` run reached 154.166 WU and docked through
  ordinary input. The former red was stale harness behavior, not evidence of broken autopilot.
  Current Electron journey evidence and final harness agreement remain open. See
  `02_REMAINING_WORK.md`.
- `npm run check:encounter-director` — RED, `two-day soak should produce encounters (got 2)`.
  Concurrent `CONTENT-2026-07-18` lease is editing encounter/flavor content.
- `npm run check:save-schema` — RED from two causes: committed `$.sites` debt plus a foreign
  uncommitted `bloomThreshold` change. Must not be cleared by regenerating `SAVE_SCHEMA.md`.
- `npm run check:m2:seamless-world` — browser section completed, Electron websocket reset,
  process exited 1.
- `npm run check:m4:regional-ecology` — 8/9; registry/save initialization-order assertion.
- M3 public recovery — Game Over proven, respawn settlement unproven.
- Performance artifact — 49.4 ms p95, 75 hitches, 22.9 ms callback p95, 6.9 ms sim p95,
  zero autosaves completed during capture.
- Real store capture and release clean waves — absent.
- Performance synthesis is now on `master`, but its earlier matrices are diagnostic-measurement
  artifacts, not acceptance: several player-frame windows still show ~33.3 ms rAF p95 and >32 ms
  gaps. Three fresh consecutive <=16.7 ms acceptance runs remain required on the combined tree.
- Four measured post-synthesis pooling implementations across `04805924..9d626fd8` are rejected. The final
  BatchedMesh candidate reduced visible pages but measured 250.1/616.8/433.3 ms p95 for 10/25/50
  ships, with every sampled frame over 32 ms; review also found child-transform invalidation,
  geometry-collision, reclamation, and PBR-parity defects. Do not replay this range.
- Natural Helios approach/undock motion, mining-distance representative-rock parity, and final
  hardware-Electron/GPU combat-family evidence remain incomplete. `e8838e2c` closes the known
  faux-rock interaction mismatch and hidden instance-pool ghost mechanism in implementation.
- The natural route still lacks accepted combined continuity evidence across authored admission,
  floating-origin rebase, interpolation/scale, LOD/HLOD, pool ownership, save/Continue, and context
  recovery. The frozen replacement harness is not evidence: review found fail-open admission telemetry
  and a stale effective-LOD receipt.
- Localized authored deep-space structure, fleet-wide PBR, and exact-head compact/reduced/dense/Spector
  propulsion evidence remain incomplete.

## Route qualification

`npm run check:demo-opening` and the strict M1 route are different acceptance surfaces. The demo route
has previously docked and opened the station. A green demo must never be used to close M1-ROUTE.

The `G01` pilot is a third surface and must not be conflated with either. It is stricter than the demo
route — no state injection, enforced by a static contract over its own source, ordinary keyboard and
pointer input only — and it later passed on a clean checkout at `fb9a0c82` (dock at 96 s, closest
154.166 WU, one public KeyE hold). That closes clean-tree attribution and proves the committed browser
route is reachable. It does not by itself exit M1: current Electron pilot evidence and agreement from
the repaired strict journey harness remain required.

Depth captures that use `window.SF` to compress travel, eligibility, timing, or story gates are useful
integration evidence, but they do not close an unassisted player-route requirement.

## Clean-wave rule

The clean-wave proposal in `design/production/01_BUILD_PROGRAM.md` is not automatically binding
because the document exists. Only when the controller explicitly adopts it for a named release run:

- M0–M5 require three consecutive clean waves over their named held-out matrices.
- M6 requires five consecutive clean waves.
- Any P0/P1 regression resets the affected milestone’s counter.
- A wave must record commit/tree identity, route matrix, checks, evidence, and reviewer verdict.

No current consolidated record demonstrates these counters, so this matrix records zero rather than
inferring success from historical prose.
