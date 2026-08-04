# Verified Done and Implemented Work

**Audit date:** 2026-07-19 for the integration checkpoint below; older rows retain their stated dates.
**2026-07-20 closeout synthesis appended** below the PQ-001..PQ-010 row.

**Rule:** this document separates accepted outcomes from implemented components. The whole Alpha and
the whole Depth Program are not finished.

**User correction 2026-07-24:** PQ-007's `1a54e56b` pursuit-slot implementation is no longer an
accepted outcome. It introduced target-relative station keeping, MMB pursuit selection, pursuit
impulses, and pursuit UI that the user did not request, while removing the requested G
auto-target/draw-to-fly behavior. Its former acceptance row is revoked. The user-directed correction
is reviewed, focused-green, and integrated at `4d00867e`; browser/Electron route acceptance remains
open, so PQ-007 is not restored to the verified-done count.

## Milestone-exit truth

No M0–M6 milestone currently has a fully current route-and-evidence exit that survives the fresh
audit. No milestone has a current clean-wave record either; clean-wave counts become an exit
requirement only if the controller explicitly adopts the draft production policy for a release run.
M2’s architecture was previously marked complete, but its current combined browser/Electron check
exited red during Electron launch and must be revalidated.
**Update 2026-07-20:** the M2 combined check is revalidated GREEN — `check:m2:seamless-world` passes
on browser AND Electron at `b28d183b` with the repaired fail-closed continuity contract (two-stage
rebase membrane clean, settled Continue, identity continuity across streaming/reload). This
revalidates the M2 architecture claim; it does not by itself exit M2's broader milestone row.

## PQ-035 PERF-01 native lifecycle closure (2026-08-04, `f3046007`)

PQ-035 is checked off as `INTEGRATED` + `ROUTE_ACCEPTED`. Paired one-use Browser and source-Electron
claims `10372-4aa9e5f78322240b4566e2bd` and `12340-3eefb1bf37636736c1d67ead` share source digest
`bbd92995…db10f01`, fixed seed `35035`, route/regression identity, and a stable production-route
signature. Both run on hardware Intel ANGLE/D3D11 with zero runtime errors, zero hidden GPU
submissions, bounded repeated transitions, foreground-equivalent cadence, input/audio restoration,
and clean owned teardown. The accepted harness requires five seconds of admitted baseline cadence,
reacquires the exact native window, and records/excludes foreground-interrupted samples. It does not
claim an optimization gain, physical workstation suspend/lock, or packaged-build startup; those exact
host/package boundaries remain with PQ-041. Receipt: `roadmap/receipts/PQ-035-lifecycle-REPORT.md`.

## PQ-036 PERF-02 scheduler closure (2026-08-04, `391e8658`)

PQ-036 is checked off as `INTEGRATED` + `ROUTE_ACCEPTED`. The retained PERF-00 Browser claim
`22380-df81be7b607f4276302e6ac8` and source-Electron claim
`32560-97a1a4a4e9dade4d4ce87d91` share source digest `8948e0ad…c9913e4` and contain owner-complete
scheduler observations across 25/25 valid windows per runtime. Current lifecycle claims
`10372-4aa9e5f78322240b4566e2bd` and `12340-3eefb1bf37636736c1d67ead` cover the only later
PresentationRunner diagnostics change and retain coherent restore, zero hidden GPU submissions,
ordinary cadence, and clean teardown. Current deterministic owner tests cover the deliberately
injected UI and admission classifications. No duplicate headed run, optimization delta, physical
host, or packaged-build claim was manufactured. Receipt:
`roadmap/receipts/PQ-036-scheduler-seam-REPORT.md`.

## PQ-039 PERF-05 deterministic hot-query closure (2026-08-04, `9b50f317`)

PQ-039 is checked off as `INTEGRATED` + `FOCUSED_GREEN`. The production NPC-jobs query preserves
full-scan selected-ID parity through stable lower-ID ties, empty and boundary cases, stale identity,
destroy, and same-tick spawn churn with three shadow checks and zero mismatches. The exact scale
fixture grows from 100 to 500 entities while the selected ID remains unchanged and nearby candidate
visits remain `1→1`; request/result scratch and lifecycle state remain bounded. This is the packet's
declared algorithmic acceptance boundary. It does not claim Browser/Electron timing, CPU magnitude,
FPS, GPU, compositor, or resource improvement. Receipt:
`roadmap/receipts/PQ-039-hot-query-REPORT.md`.

## Program batch PQ-001..PQ-010 first wave (2026-07-20, `2bc3042f`..`b28d183b`)

Queue outcomes PQ-001, PQ-002, PQ-003, PQ-008, and PQ-009 are `INTEGRATED` with lead-rerun proof:
the deterministic massline control laboratory (`check:massline:lab`), the massline input grammar
with pay-out and Space-primary migration (legacy profiles byte-identical), compound collision
proxies with a truthful Helios docking corridor (`check:autopilot` green through it), the universal
weapon-impulse/collision-consequence kernel (T08 substrate, 47a golden pinned byte-stable), and the
live-green continuity harness. The recorded `check:save-schema` dirty-tree red and the precheck DOA
are closed. Acceptance rows, named debts (strict-perf rows, `station-applied-lod-inert`,
encounter-director, dated check:combat), and receipts: `03_LIVE_ACCEPTANCE_MATRIX.md` "Program
batch PQ-001..PQ-010".

## Program batch PQ-011..PQ-016 CLOSED (2026-07-21, final master `ce97d573`)

All six queue outcomes of the batch are CHECKED OFF with lead-rerun proof, receipts, and
lead-viewed route evidence: PQ-011 (Gate-0 adversarial cycle), PQ-012 (field kernel + three
consumers), PQ-013 (planetary sling/skim/harvest/reentry vertical — the batch's broad serialized
build, spike-gated), PQ-014 (natural NPC jobs, kernel untouched), PQ-015 (shared interaction
descriptors), PQ-016 (contextual industrial beam). Per-packet commits, honest perf truth
(spatialHash 75.29 vs 55 batch-attributed; sim.p95 4.2 vs 4.0 new marginal; vsync floor
standing), and the named follow-up list: `NOW.md` batch-closure section. Sixteen of the first
seventeen queue outcomes remain terminal after the 2026-07-24 revocation of PQ-007.

## PQ-017 persistent World Site integrated (2026-07-22, `2a9517d8`)

PQ-017 (`A15` / `SF-19`) is CHECKED OFF. The commit integrates the reusable manifest/kernel/runtime,
sole-writer persistence through `asteroidSites`, bounded component operations and receipts, physical
payload delivery, impact failure/recovery, exact asset/socket presentation, map History, traffic,
public controls, and Browser/Electron route tooling. It also closes the ordinary Massline regression:
the starter line has a 10x physical envelope and ordinary endpoints cannot automatically break it;
only an explicitly authored extreme-load endpoint can opt into overload failure.

Commit-bound focused proof is World Site/Massline **81/81**, public-route contract **67/67**,
closed-loop control **23/23**, SG-02 and SG-06 Massline resilience green, and 47-A sim comparison
`ok:true`, deterministic, and `hashEqual:true`. The last headed Browser exercise reached the authored
site, operations, and Massline phase, but its acceptance driver measured sequential cleanup latency as
active key-hold time. That validator defect is corrected with token-bound exact keydown/keyup receipts
and deterministic proof. No final Browser/Electron artifact is claimed; see
`roadmap/receipts/PQ-017-world-site-REPORT.md`. PQ-018 is now unblocked and next.

## 2026-07-21 playable graphics checkpoint (`ea698805`, `54548e09`)

| Outcome | Verified result | Honest boundary |
|---|---|---|
| Ship-condition HUD | `ea698805` is integrated. Fresh nominal and damaged active-flight captures show the ship schematic, shield ring, hull crop, HULL/SHD values, and warning state without the prior text-on-image overlap; `check:ui-a11y` passes. | This closes the condition-widget defect, not all M1-HUD density work. |
| Helios civilian Lark/Cradle/Span | `54548e09` integrates editable Blender sources, three LODs, semantic PBR evidence, canonical source/release GLBs, manifest wiring, and deterministic rebuild tooling. Family/release/asset-live/reachability/status/visual-stability gates pass; a public Helios pocket capture passes in browser and Electron. | Accepted family vertical; further material polish and remaining fleets stay open. |
| Donor collapse | Former `SpaceFace-graphics-overhaul` is hash-archived/tagged and physically removed after selective disposition; only `master` remains registered. | Rejected/unpromoted donor material is recoverable, not product code. |

## PQ-011 Gate-0 closure (2026-07-21, commits `958e15ab`..`3a812b90`)

**PQ-011 (deployable Mass Seed anchor) is the eleventh queue outcome CHECKED OFF** — the first to
pass a full adversarial gate: hostile physics review (seam SANCTIONED; two P2 findings repaired),
second independent forensic review (repairs CONFIRMED, one further finding surfaced and repaired),
mutant audit 7/7 caught at the extended 49-test `check:mass-seed`, the recorded flight-gate red
cause-pinned and repaired probe-only (viewport-agnostic input-timing race — NOT a mobile runtime
defect; lead 2× consecutive full-gate green), and ROUTE_ACCEPTED browser+Electron evidence
(hardware-GPU parity through the real menu route). The Kimi-authored
`design/vfx/FIELD_TOOL_READABILITY_BIBLE.md` (`958e15ab`) is integrated as the standing taste
authority for PQ-012/013/016. Named non-blocking P2 follow-ups and the separately-filed
stranded-freighter latent collider defect: receipt `gate0_closure` block +
`03_LIVE_ACCEPTANCE_MATRIX.md`.

## 2026-07-20 closeout subslices (commits `d6d5278c`..`eb8ed839`)

Three partial subslices integrated during the 2026-07-20 closeout. **None checks off its queue
outcome.** "Checked off" means the entire queue outcome is integrated with its required acceptance
evidence; each row below records exactly what landed and exactly what remains.

| Subslice | State | Integrated | What remains before the queue outcome is DONE |
|---|---|---|---|
| **PQ-014 deterministic NPC-job kernel** | `FOCUSED_GREEN` + `INTEGRATED_KERNEL`, runtime-UNWIRED | `d6d5278c` (kernel) + `73159e05` (r2 defect repairs) + `fffe57db` (receipt); `src/systems/npcJobs.js` + `test/npc-jobs-kernel.test.mjs` (48/48 pass on master) + receipt `PQ-014-npc-job-kernel.yaml`. Pure library, zero live importers (grep-verified), deterministic (no Math.random/Date.now), JSON-safe payload contract, decomposable advance. | encounterDirector materialization consumption; sectorSim virtualization (`advance` at the offscreen boundary + truncation resume); tacticalAI/aiPorts movement intent consumption; save-owner `npcJobs` save-plan key; **natural-occurrence census + held-out-seed proof** (PQ-014 evidence requirement); player-route acceptance. The queue row stays `planned`. |
| **PQ-018 Wreck Cathedral source asset** | SOURCE candidate `IMPLEMENTED`/`needs_review`, preserved; NOT route-accepted | `6df5a210` (author source) + `a31554fa`/`6b24baad`/`7330a85b` (handoff/provenance/validation). Blend (9.6 MB) + GLB (11.2 MB) + 26 PBR textures + 15 captures + turntable MP4 + 11 reports + reproducible authoring scripts. SHA-256 manifest; gltf-validator clean; flythrough clearance probe pass. | Depends on **PQ-017** (World Site kernel). Then: manifest/release promotion, place registration, Atlas integrity, interaction/history/salvage wiring, save continuity, browser/Electron route acceptance, measured performance. The queue row stays `planned`. |
| **PQ-022 place_station_military remaster** | `INTEGRATED` + **route-accepted subslice** (Helios + Tethys) | `3ea2fe99`. Manifest row preserved (same ID, sockets `SOCKET_Structure_Core/Emissive/Dock_Approach`, +X forward, collision proxy, 3 LODs 65192/27302/5932 tris, 10 PBR materials). Source + release GLB + Blender source + 30 authored texture PNGs + before/after/motion evidence. Owning checks green on the combined tree; 6 natural-route captures in `.devshots/pq022-military-station-routes/` (Helios `station_coalition` + Tethys `station_customs`, default/close/far); grok vision verdict ACCEPT (no blue-clay, no flicker/origin-jump/LOD-pop/material-swap, identity readable, PBR quality 4 close/3 far). | PQ-022 covers many asset families — this completes ONE (place_station_military). Other station archetypes, ship families, rocks, wrecks, and infrastructure remain. The queue row stays `planned`. |

**Untracked-batch classification (also 2026-07-20):** 263 foreign untracked files classified into
five categories per closeout spec. 17 durable canon/spec/tooling files committed (`a418c111`);
247 reproducible category 3+4+5 files (Blender `*_export_tmp.glb` intermediates + auto-baked
`Material_*_ao_1k.png`/`trim_sheet`/`wear_mask` textures + 2 scratch logs) removed after a
hash-bound SHA-256 recovery manifest was committed (`eb8ed839`). Primary checkout untracked count
is now **0**. Disposition record: `design/program/_archives/pq022-closeout-20260720/DISPOSITION.md`.

## Graphics checkpoint chain (2026-07-19) — graphics at `cbdf1589`, synthesis at `b235f062`, evidence hardening through `280cafb0`, propulsion repair at `59f91d19`

| Area | Verified result | Acceptance level |
|---|---|---|
| Branch reconciliation | Paused Claude Atlas/map/travel state, performance closure, and the multi-day graphics branch were synthesized in `a752702b` and promoted to `master` as `ee9e0ab3`; the tracked trees were identical at promotion. | Integrated, recoverable checkpoint; donor branches are not independent product authorities. |
| Starter and asset admission | The public route presents the authored 27,318-triangle Kestrel whole ship; 76/76 declared part assets and 2/2 whole ships loaded with zero failures. No visible fallback swap or missing Kestrel root was observed in the current stability probe. | Live browser evidence; broader natural Electron/floor-hardware matrix remains open. |
| Thruster/RCS substrate | Continuous pooled Kestrel plume and actuator-truth directional RCS pass recipe, wiring, accessibility, settings, save/restore/destroy, and sleep checks. `59f91d19` invalidates stale authored socket caches, uses authored world-space lateral nozzle transforms, coalesces duplicate side impulses, preserves retro fallback and compact feedback with extended trails disabled, reuses hot-path records, and clears propulsion energy state at save/sector boundaries. | Focused green plus prior non-commit-bound browser/Electron visual evidence; exact-head compact/reduced/dense/Spector classification remains open. |
| Background and post | True-black negative space, deterministic star/celestial depth substrate, stable camera-integrated parallax, restrained two-level bloom, and zero default grading offsets pass structural and depth/occlusion tests. | De-hazed foundation accepted; final localized authored nebular/dust/debris/sector composition remains open. |
| Golden surfaces | Kestrel, Helios, and geology roles have authored or role-specific PBR material paths. Helios keeps its three-LOD production geometry and function-specific surface maps. | Promoted visual checkpoint; natural approach/undock, representative-rock parity, and fleet-wide PBR expansion remain open. |
| Combined runtime | Map/Atlas/travel contracts, asset-live, visual-stability, launch-policy, and five strict desktop/mobile flight runs passed. The isolated timing rerun measured 1.02 ms/tick for 240 ships and 0.38 ms/tick for the physics/flight case. | Current integrated proof; no M0–M6 milestone exit is implied. |
| Context recovery and capture truth | Late performance follow-ups were integrated and repaired so renderer-owned bloom/render-graph targets participate in context cleanup, scenario pose is held only for explicitly injected stable routes, and Market capture follows the visible shell. A live context-loss probe restored the route and authored Kestrel, detached 366 stale listeners, and passed evidence validation. | Focused behavioral and live-route proof at `f0b3b154`; long-soak and floor-hardware exit remain open. |
| Golden asset receipts | `bd79f2ba` closes reproducible receipts for the exact Helios source (79,717,896 bytes / 1,664,738 triangles), representative rock A (1,970,132 bytes / 1,977 triangles), Wasp candidate (12,797,604 bytes / 11,526 triangles), and RCS source (238,516 bytes / 1,040 triangles). `5863331c` wires `check:graphics:asset-receipts` into `check:art`; the receipt gate passed again on the promoted tree. | Exact artifact identity and focused gate are verified. Wasp remains an accessory-only/unclassified candidate, not an accepted live whole ship. |
| Truthful authored runtime coverage | `5219491d` extends no-visible-fallback admission, semantic PBR tinting, common-rock surface preload, weapon/projectile/mine/impulse/wreck visual identities, authored bounds handling, and sticky charge orientation through current runtime seams. | Integrated and focused-green. Final natural-route browser/Electron motion, GPU-state, dense-combat, and combined performance acceptance remain open. |
| Resumable graphics architecture | `98e1e429` plus `1de8a861` records the long-term resolve/prepare/admit, stable-transform, interaction, PBR foundry, chassis/appearance, VFX, and asset-family slices in [`LONG_TERM_GRAPHICS_OVERHAUL.md`](../graphics-sprints/LONG_TERM_GRAPHICS_OVERHAUL.md). The OpenCode Helios replacement is explicitly rejected while its primitive-batching concept is retained as a future measured optimization experiment. | Durable plan and donor decision; no visual completion claim. |
| Performance synthesis | Reviewed performance tip `99cad5b5` was replayed without duplicate patches, preserving semantic PBR/admission, black-space background, rock preload, and authored bounds while adding renderer-scoped precompile/context readiness, measured admission, tactical-AI staggering, and owned autosave snapshots. `b235f062` merges the result; `041f5fae`, `2455087c`, `8976acaf`, and `280cafb0` make literal frame target, three-run promotion, residency evidence, and exact clean-worktree identity fail closed. Four later pooling architectures across `04805924..9d626fd8` were measured and rejected; current master correctly retains ship-local static batching. | Integrated and CPU-green: 167/167 performance-modified tests, 49/49 graphics/PBR/VFX identity tests, and 35/35 final evidence-contract tests. Fresh headed browser/Electron/GPU acceptance remains open. The rejected branch is evidence, not product code. |
| Donor cleanup | Kimi's eight station-presentation candidates are preserved at donor commit `0e2f2e51`; Depth is preserved by branch, annotated tag, and a 17-entry external SHA-256 archive; rejected Helios and superseded satellite folders were removed after audit. | Physical cleanup verified. `SpaceFace-graphics-overhaul` remains deliberately protected; the rejected performance worktree is removed and its clean branch remains recoverable. |
| Graphics promotion | `cbdf1589` promotes the reviewed graphics closeout and its gate wiring to `master`; `b235f062` retains it in the combined tree. | Coherent combined checkpoint. No final M6 or release-performance exit is claimed. |

## Wave-01 (PROGRAM-WAVE-01-RECOVERY-ROOTS, 2026-07-18) — verified at `c751b9a9`

| Area | Verified result | Acceptance level |
|---|---|---|
| Signature-kernel family (T02, A05, A06, A08, A10 + A02) | 252 tests green in one family run at `c751b9a9`; every packet independently adversarially reviewed (REJECT verdicts round 1), every accepted finding reproduced by the lead, repaired in narrow commits, and re-reviewed | Focused green + integrated; final R3 verdicts recorded in `NOW.md` |
| A10 design rulings | Ownership-scoped construction funding, refuse-then-confirm lane spills with deterministic receipts, exact over-capacity diagnostics — implemented at the owning seams and pinned normatively (`61e84071`, `c751b9a9`) | Behavior change reviewed; goldens stable |
| W01 dispatch defects | Both OPEN defects from the prior board closed by the single-shot `offerConsumed` gate (`4891099a`); 47a compares unmoved (curated systems list excludes encounterDirector — verified, then measured) | Runtime repair with golden safety |
| Deep-state ladder rungs 1–2 | `fresh-start` and `first-station` captured through the PUBLIC pilot route, sha256-bound, restore-proven in fresh contexts (`fb9a0c82`); ladder validator green at 2 captured / 11 planned | First real fixtures; capture harness now exists (`scripts/check-deep-state-capture.mjs`) |
| Corridor dock attribution | The G01 pilot docks `station_helios` on a **fully clean checkout** at `fb9a0c82` (closest 154.166 WU, one public KeyE hold) — the route belongs to committed code, not foreign WIP | Clean-tree attribution CLOSED; Electron remains G18/M1 debt |
| Save-schema committed debt | `SAVE_SCHEMA.md` regenerated from a clean worktree (`edca7c7e`): `$.sites` and `$.formations` recorded; check GREEN on clean checkouts | The dirty-tree red now has exactly one (foreign) cause |

## Freshly verified foundations and packets

| Area | Verified result | Acceptance level |
|---|---|---|
| Alpha evidence validator contract | `npm run check:alpha:evidence:contract` passes its rejection/self-test matrix. | Focused green; live corpus remains red. |
| Asset classification corpus | Gate passes with 19 records: 3 candidate, 8 missing-evidence, 8 rejected, 0 accepted. | Classification machinery green; no visual asset accepted by this corpus. |
| Gameplay Observatory Phase A | Contract, passive determinism, rates, and recording-health checks pass; recorder commit `14bfed98` exists. | Focused green; browser/media Phase B open. |
| M1 combat doctrines | `npm run check:m1:combat-doctrines` passes 23/23. | Focused green. |
| M1 tether/mass | `npm run check:m1:tether-mass` passes. | Focused green; natural player benchmark open. |
| M3 career origins | `npm run check:m3:career-origins` passes the three origins, 22 aggregate tests, Hunter’s 14 sections, and live Hunter check. | Focused green. |
| M5 role continuity | `npm run check:m5:role-continuity` passes 13 roles and New Game/Continue/hull-switch delivery. | Focused green; ordinary player-route ownership acceptance open. |
| Release capture machinery | Release-capture contract passes 4/4; ffmpeg/ffprobe self-test plus 23 hostile cases passes without a browser. | Tooling green; real store capture open. |
| Depth focused aggregate | The last audited `npm run check:depth-program:contracts` passed before the recovery checkpoint; its implementation and check surfaces are now committed in `850c80f3`. | Prior focused green; not freshly rerun at `50bd5505`, so acceptance is unchanged. |
| S4/W1 isolated groundwork | Thunderchild and W1 data tests passed 18/18 combined before the checkpoint; their groundwork is now represented in `850c80f3`. | Committed groundwork; no chunk acceptance promotion. |

## Major committed implementation now on `master`

| Commit(s) | Implemented outcome | What remains before final acceptance |
|---|---|---|
| `cbdf1589` (including `bd79f2ba`, `5219491d`, `98e1e429`, `1de8a861`, `5863331c`) | Golden graphics artifacts are hash-bound, common-rock PBR maps and runtime surfacing are wired, authored entities fail closed instead of showing blue boxes, combat/world visual identities use typed geometry, and the long-term overhaul has one durable resumption plan. | Performance synthesis is integrated at `b235f062`; rerun the combined headed matrix and complete natural browser/Electron/GPU visual acceptance before promoting any M6 exit. |
| `59f91d19` | Authored propulsion sockets now invalidate and bind reliably, RCS preserves signed physical/nozzle truth, compact settings retain useful feedback, hot-path records are reused, and save/sector boundaries clear the complete propulsion-energy lifecycle. | Focused implementation is green; exact-current-head compact/accessibility/dense/Spector route evidence remains open. |
| `850c80f3` | Bulk July-14 recovery checkpoint: Depth validators/content/runtime/tests, broad gameplay/UI work, asset sources/candidates/tooling, and program documentation are now recoverable from local `master`. | Rerun focused/full gates at current HEAD; audit telemetry goldens and other high-risk inclusions; create durable evidence manifests; complete natural routes and independent visual review. Committed does not mean accepted. |
| `50bd5505` | Prospector copy tests no longer impose a fixed English word-count taste budget. | No feature acceptance change; this is a follow-up contract cleanup. |
| `7b0ad557` | Autopilot retains its course after obstacle avoidance. | Later clean-checkout G04 evidence closes browser-route attribution; current Electron journey acceptance remains open. |
| `4a6b3f56` | Authored Wasp full/LOD runtime routing, Shipyard/Undock/save/Continue path. | Add canonical asset-classification record and re-run visual/performance acceptance. |
| `ae1813c9` | Rook Nine uses accepted-mission intent outside sanctuary; interceptor cycles cannot stall forever. | Natural recovery and held-out counterplay route. |
| `62231ecf` and related career commits | Measured career cohorts, starter builds, origins, and progression infrastructure. | Three complete unassisted ninety-minute routes. |
| `eed065ae`, `f4ba6a91`, `a4cc2e8c`, `228ce7b0`, `dc627198`, `f9dab574` | Global coordinates, floating origin, continuous handoff, full region data, and map/persistence foundations. | Restore current Electron acceptance and, if adopted for release, record clean waves. |
| `f4678c42`, `b64a91e2`, `31a45bb6`, `dbca66a7` | Story/outpost foundations, 13-role lattice, visible role packet continuity. | Ordinary story, ending, sandbox, and visible ownership routes. |
| `8e849a01` | Evidence-bound release capture pipeline. | Real browser/Electron store capture. |
| `1da7e102` | Crowded-flight autosave work is bounded. | Fresh profile remains red overall and recorded capture completed no autosave. |
| `f05997d6`, `a099f327` | Dedicated playable-opening check and checkpoint report. | This demo route does not close the stricter M1 route. |

Additional committed categories include the restored station command shell, objective search, unified
map scales, localization groundwork, cargo ownership, platform/release tests, living-galaxy tests,
combat-doctrine wing work, claims, and role ownership. Their milestone acceptance remains governed
by the matrix in [`03_LIVE_ACCEPTANCE_MATRIX.md`](./03_LIVE_ACCEPTANCE_MATRIX.md).

## Depth Program: what is preserved on local committed `master`

No Depth chunk is fully DONE. The committed foundations include:

- F1 modular faction migration (`bb18f79c`).
- F2 authored encounter loader/catalog foundation (`8d31c20f`).
- R1/R2 core unique-wreck discovery and salvage foundation (`58ef888c`).
- Depth plan/research documents (`48758795`, `d5e4e7ae`, `e4cc5621`).

Checkpoint `850c80f3` additionally preserves the July-14 validators, content corpus, set pieces,
factions, encounters, Band, Ship’s Ledger, Thunderchild, doctrine matrix, W1 data, broad asset work,
and their checked-in tests/tooling. This changes recoverability, not completion: the focused results
predate the checkpoint, natural routes remain open, and ignored `.devshots/depth-program/**` media is
still absent from a clean checkout. Check current local/upstream identity before resuming; policy
follow-ups after the pushed recovery checkpoint do not change feature acceptance.

## Explicitly not counted as done

- A focused or synthetic green check without a natural player route.
- A browser capture that compresses travel, eligibility, timing, or story gates through `window.SF`.
- A routed GLB without a current accepted classification record.
- Ignored `.devshots` evidence that is absent from a clean checkout.
- A dirty implementation that committed `master` cannot reproduce.
- A milestone without its required route/evidence record, or without clean waves when the controller
  has adopted the draft production policy.
