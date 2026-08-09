<!-- LIFETIME: VOLATILE -->
# Unified Remaining Work

```yaml
refreshed: 2026-08-09
baseCommit: 8b7b1d3b26181fdc38325a63f5e9d85574bf321b
expiresAfterCommits: 10
expiresAfterDays: 2
```

This is the canonical roll-up of everything still required from the Full Solo Alpha and the Depth
Program. Detailed behavior remains in the linked source plans; this file owns status and next action.

## Current execution board — 2026-08-09

**Snapshot base:** `8b7b1d3b26181fdc38325a63f5e9d85574bf321b` on `master`, equal to
`origin/master` when reconciled. The durable development handoff is
[`DEVELOPMENT_HANDOFF_2026-08-09.md`](./DEVELOPMENT_HANDOFF_2026-08-09.md).

This section supersedes older dated status, ownership, ordering, “next,” “immediate,” and blocker
claims below. The broader Alpha/Depth outcome tables remain retained scope until each outcome is done
or mapped to an exact queue leaf.

### Status words a nontechnical reader can trust

| Status | Meaning |
|---|---|
| `DONE` | The result is committed on `master` and the cited proof exists. |
| `IN PROGRESS` | Uncommitted work exists. It is not done; the row names the exact next action. |
| `TODO` | The result is not done. It may be assigned as a bounded task. |
| `NEEDS HUMAN` | Agent work is complete only when the named human action is performed and recorded. |

There is no durable `BLOCKED` status for in-repo work. A dependency is integration order, not a
reason to abandon a task. A dirty path, another agent, Blender, the GPU, a validation broker, or a
shared source file is coordination at execution time, not product status.

The queue contains 113 exact leaves: 80 `done`, 32 agent-ready, and one deferred named-human review,
with zero dependency-only blocked leaves. `dependsOn` records the preferred integration order.
`program-dispatch --ready` reports the current front of that order; it is not the list of all work
that exists and it never cancels a task.

### How concurrent agents finish in one checkout

- Do not create a worktree by default.
- All threads may inspect, research, test, and review concurrently. Those activities reserve no file.
- A thread announces an exact clean file only for the short mutation window in which it is applying
  a patch, then releases it immediately. This is minutes of coordination, not task-long ownership.
- Before changing a shared file, reread its live contents. Several threads may change a clean file
  sequentially in the shared checkout. A stale patch context means reread and reapply.
- An existing foreign dirty hunk remains protected until that writer explicitly hands it off or it is
  integrated. Continue the task's disjoint work or another queue task meanwhile; the exact hunk does
  not become a blocked product, packet, subsystem, or plan.
- When two proposed clean-file hunks genuinely overlap, one finishing agent combines those hunks while the
  other threads continue their remaining work. The plan and task remain active.
- The thread finishing a result briefly enters `PUBLISHING`, stages only that result, verifies the
  names, commits, and pushes. Every completed slice is committed promptly so it cannot be stranded in
  chat or overwritten.
- Old branches, task names, packet labels, worktrees, and an agent merely reading a file never imply
  current ownership.

### Current task list

Every `TODO` row is real remaining work. “After” describes integration order only; it does not mean an
agent should invent a blocker or stop unrelated work.

| Status | Priority / unit | Player-facing result | Exact next action | Integrate after |
|---|---|---|---|---|
| `TODO` | 28 — `PQ-022.refinery-reauthor-h1` | Prove the revised refinery on the real Browser and Electron route. | Run the bounded H1 capture and publish its result. | Existing refinery implementation |
| `TODO` | 29 — `PQ-022.refinery-reauthor-review` | Decide whether the revised refinery actually fixes the visible defect. | Review the exact H1 candidate and record KEEP or REVISE. | Refinery H1 |
| `TODO` | 31 — `PQ-022.billboard-buoy-reauthor-h1` | Prove the revised billboard and buoy on the real route. | Run the bounded H1 capture and publish its result. | Existing billboard/buoy implementation |
| `TODO` | 32 — `PQ-022.billboard-buoy-reauthor-review` | Decide whether the revised billboard and buoy read correctly. | Review the exact H1 candidate and record KEEP or REVISE. | Billboard/buoy H1 |
| `TODO` | 204 — `PQ-019.promote` | Make the completed claim-outpost/heist result the accepted PQ-019 milestone. | Bind the final facility review and performance receipts, then promote. | PQ-019 facility review and H3 |
| `TODO` | 207 — `PQ-020.promote` | Make the completed Ceres topology/presentation result the accepted PQ-020 milestone. | Bind Cathedral and pocket review receipts, then promote. | Cathedral and pocket presentation reviews |
| `TODO` | 209 — `PQ-022.h3-performance` | Prove the accepted corridor assets fit the live performance/cleanup envelope. | Run one matched H3 candidate and publish the result. | Refinery, billboard/buoy, relay, and corridor dispositions |
| `TODO` | 210 — `PQ-022.promote-relay` | Turn the accepted relay result into the final receipt other packets can consume. | Bind the relay review and H3 evidence. | Relay review and PQ-022 H3 |
| `TODO` | 211 — `PQ-022.promote-corridor-assets` | Publish the Gold Corridor required-assets milestone. | Bind the corridor disposition and H3 evidence. | Corridor disposition and PQ-022 H3 |
| `TODO` | 217 — `PQ-024.promote` | Promote the visible permanent claim-site consequence. | Bind the accepted relay and committed-transition evidence. | Relay promotion and PQ-024 reviews |
| `TODO` | 219 — `PQ-025.calibration-qualification` | Prove the complete Gold Corridor over held-out 30/90-minute play. | Freeze the candidate, calibrate the rubric, run qualification once, and publish the verdict. | PQ-019/020/021/022/023/024 milestone receipts and owner facts |
| `TODO` | 223 — `PQ-038.native-acceptance` | Prove dense PresentationWorld behavior in the supported runtimes. | Run one clean Browser/Electron acceptance candidate and record the result. | Existing focused implementation |
| `TODO` | 226 — `PQ-041.native-acceptance` | Prove the exact packaged Electron build and paired Browser route. | Build and run one clean candidate; publish the paired ledger. | Existing acceptance surfaces |
| `TODO` | 227 — `PQ-042.branch-selection` | Choose the next GPU correction from real evidence—or close with no change. | Evaluate the completed PERF evidence and execute the selected A/B/C/D result. | PERF-03/04/05/06/07 acceptances |
| `TODO` | 228 — `PQ-020.pocket-presentation-recapture` | Show Ceres actors visibly approaching their real targets. | Capture the corrected pocket approaches on the exact route. | Refinery review and existing PQ-020 review |
| `TODO` | 229 — `PQ-020.pocket-presentation-review` | Decide whether the recaptured Ceres pocket presentation is truthful and readable. | Review the exact captures and record KEEP or REVISE. | Pocket recapture |
| `TODO` | 230 — `PQ-018.cathedral-reauthor` | Replace the Cathedral's weak hull/rupture presentation with an accepted whole asset. | Re-author the exact asset and return KEEP or REVISE. | World Site runtime and current art verdict |
| `TODO` | 231 — `PQ-018.cathedral-reauthor-h1` | Prove the revised Cathedral in Browser and Electron. | Capture the exact candidate once in each runtime. | Cathedral re-authoring |
| `TODO` | 232 — `PQ-018.cathedral-reauthor-review` | Decide whether the revised Cathedral fixes the whole-asset defect. | Review the exact H1 candidate and record KEEP or REVISE. | Cathedral H1 |
| `IN PROGRESS` | 233 — `PQ-019.receiver-facility-reauthor` | Give the lawful catcher and covert fence visibly distinct, believable facilities. | Current Phase A is G1/G2/G4 `REVISE`: make a real geometry/material revision that earns KEEP, or discard it explicitly. Phase B promotion and Phase C runtime release remain separate. | Existing receiver contracts |
| `TODO` | 234 — `PQ-019.facility-presentation-h1` | Prove the revised catcher/fence/facility roles on the real route. | Capture one exact Browser/Electron candidate. | Receiver KEEP and accepted relay |
| `TODO` | 235 — `PQ-019.facility-presentation-review` | Decide whether all four facility roles are clear and coherent. | Review the exact H1 candidate and record KEEP or REVISE. | Facility H1 |
| `TODO` | 246 — `PQ-040.native-acceptance` | Prove dirty-range GPU uploads in Browser and Electron. | Run one clean paired acceptance candidate and publish the result. | Existing focused implementation |
| `TODO` | 253 — `PQ-045.tender-client-materialization` | Put a real disabled client in Ceres so the tender services something visible. | Implement the exact nine-path leaf in [`PQ-045.md`](./roadmap/active/PQ-045.md). | Integrated target motion |
| `TODO` | 254 — `PQ-045.route-topology` | Make the four Ceres pockets move differently instead of sharing one shuttle pattern. | Author and prove four distinct route topologies. | Tender client for final integration |
| `TODO` | 255 — `PQ-045.causal-chain` | Show six connected ambient events with visible cause and consequence. | Implement the six-event chain through existing system owners. | Final route topology |
| `TODO` | 256 — `PQ-045.npc-identity` | Give four Ceres occupations distinct ships and identities. | Produce and wire the four exact families. | Tender client for final integration |
| `TODO` | 257 — `PQ-045.prop-promotion` | Replace generic activity props with production-quality route dressing. | Re-author the sixteen selected props; KEEP or cut each result. | Final route topology |
| `TODO` | 258 — `PQ-045.wreck-dressing` | Give the two Ceres wreck sites specific aftermath identities. | Re-author and place the seven selected wreck pieces. | Final route topology |
| `TODO` | 259 — `PQ-045.vfx-recipes` | Make five causal events visibly readable through the live VFX owner. | Port the five bounded recipes and prove accessibility/cleanup. | Causal events |
| `TODO` | 260 — `PQ-045.five-minute-h1` | Prove the finished Ceres slice in Browser and Electron. | Run one clean fixed-seed five-minute candidate. | Causal/NPC/prop/wreck/VFX leaves |
| `NEEDS HUMAN` | 261 — `PQ-045.human-review` | Decide whether Ceres feels populated and coherent in ordinary play. | Record named KEEP or REVISE against the exact candidate. | Five-minute machine evidence |
| `TODO` | 270 — `PQ-045.target-motion-late-audit` | Resolve two late target-motion lifecycle questions without reopening the feature. | Run exactly two causal reproductions; repair only a reproduced defect or close with evidence. | Independent follow-up; it does not gate tender or Ceres acceptance |

The full cross-program list remains in
[`roadmap/program-queue.json`](./roadmap/program-queue.json). The table above accounts for every
unfinished dispatch leaf currently represented there. Broader Alpha/Depth outcomes below remain
planned scope where they have not yet been decomposed into leaves.

### Planned scope not yet decomposed into exact leaves

- `PQ-023` remains an active, unfinished presentation umbrella. Its Gold Corridor cue milestone is
  accepted, but broader propulsion, environment, HUD, camera, accessibility, and dense-scene work
  still needs bounded leaf IDs before implementation.
- `PQ-032` (five endings and the continuing universe) and `PQ-033` (release closeout) are deferred and
  unfinished. They live under `roadmap/retired/` only to keep non-executable packets out of current
  dispatch; that storage location does not mean `DONE`.
- The retained Alpha M0-M6 and Depth tables below remain product scope. A finishing agent maps one
  bounded outcome into the queue when the user assigns it; it must not silently discard or self-complete
  the rest of those tables.

### Agent completion contract

An assigned agent owns the outcome until it returns one of these two terminal reports:

```text
RESULT: DONE
PLAYER RESULT: <one plain sentence>
COMMIT: <hash on the named branch or master>
PROOF: <focused checks and route evidence>
REMAINING: none for this task
NEXT ACTION: <one exact next task, or none>
DIRTY PATHS: none
```

```text
RESULT: NOT DONE
PLAYER RESULT: not delivered
COMPLETED SUBRESULT: <what is actually reusable, if anything>
REMAINING: <plain-language missing outcome>
NEXT ACTION: <one executable action with exact paths>
DIRTY PATHS: <every uncommitted path>
```

Review chatter, test counts, “waiting,” “occupied,” “mutex,” and “handoff ready” are not completion
states. The finishing agent translates technical evidence into this report before updating the board.
An unchanged failed command is retained as evidence and the approach changes; agents do not loop on
the same proof or turn a local failure into a program-wide stop.

### PR #92 integration disposition

Do not merge PR #92 or its older PR #91 reference-sector bundle. Current master independently
re-authored the Ceres admission, binding ledger, baseline, and ordered PQ-045 leaves. The retained
delta is the optional, non-authorizing convergence method in
[`../vision/INFERENCE_CONVERGENCE_METHOD.md`](../vision/INFERENCE_CONVERGENCE_METHOD.md): inspect
ordinary play, compare mechanisms and candidates, cut weak ideas, review the largest causal defects,
and compose before multiplying. Its `WF`/`Nx` labels never create tasks, status, ownership, or
acceptance.

## Historical recovery-wave dispatch index — 2026-08-01 (do not dispatch)

This section is retained to explain earlier receipts. Its “current” and “next” wording is historical;
the current task table above is authoritative. The old parent queue mixed implementation lifecycle, acceptance status, and nonexistent external
review roles. That left every unfinished exact unit manually `blocked` even though its real
dependencies were satisfied. The machine queue now owns exact `dispatchUnits`; unfinished units are
dependency-driven and evidence reviews are performed by the agent assigned that exact review. Use:

```text
node scripts/program-dispatch.mjs --next
node scripts/program-dispatch.mjs --ready
```

The implementation/harness recovery cells listed in the previous snapshot are complete, including
the protected PQ-034 candidate audit, PQ-019A/PQ-019C/PQ-020/PQ-023/PQ-041 harness repairs, PQ-024
route harness, PQ-007 route acceptance, and the H1 captures that followed. Do not redispatch them.

Current recovery state and order is:

| Unit | Exact result |
|---|---|
| Retained-evidence H2 reviews | Accepted for PQ-021, PQ-022, PQ-019, PQ-020, and PQ-023. Exact repair chains were created wherever the evidence said REVISE; they are not all complete. The PQ-022 relay source/release implementation alone is now complete at `e69af0ef`, with targeted revised H1 and causal final-release review next. Other REVISE leaves remain queue-driven. There is no external-review residual, and PQ-024 remains coupled to its declared relay-presentation dependency. |
| `PQ-020.ceres-h1-capture` | Done. The Electron cold-reload/aborted-request lifecycle policy has a seconds-scale regression and the source-paired Ceres H1 route is accepted. Do not recapture it as a ritual. |
| `PQ-034.native-closure` | **ROUTE ACCEPTED / RETIRED** on clean source `4f602802`. Browser claim `22380-df81be7b607f4276302e6ac8` and Electron claim `32560-97a1a4a4e9dade4d4ce87d91` share source digest `8948e0ad…`, pass 25/25 validity rows per runtime, and clean up their owned process trees. Enabled instrumentation overhead is resolution-capable and accepted at `0.772627%`. No optimization gain or absolute-budget waiver is claimed. |
| `PQ-035.native-acceptance` | **ROUTE ACCEPTED / RETIRED** on clean source `f3046007`. Browser claim `10372-4aa9e5f78322240b4566e2bd` and source-Electron claim `12340-3eefb1bf37636736c1d67ead` share source digest `bbd92995…`, prove zero hidden GPU submission, bounded restore/input/audio behavior, foreground-equivalent cadence, and clean teardown. Physical host suspend/lock and packaged startup remain explicitly unclaimed under PQ-041. |
| `PQ-036.native-acceptance` | **ROUTE ACCEPTED / RETIRED** at `391e8658`. The retained PERF-00 Browser/Electron pair shares source digest `8948e0ad…` and publishes owner-complete scheduler facts; the current PERF-01 lifecycle pair proves the only later scheduler-owner change. No duplicate headed claim was spent. |
| `PQ-039.native-acceptance` | **DETERMINISTIC ACCEPTANCE / RETIRED** at `9b50f317`. Full-scan shadow parity, stable order, spawn/destroy churn, bounded scratch, and the exact 100→500 candidate curve (`1→1`) close PERF-05. No Browser/Electron, CPU-time, FPS, or GPU magnitude is claimed. |
| PERF-03/PERF-04/PERF-06/PERF-07 native units | Historical snapshot. PQ-037 is now retired; current remaining acceptance is `PQ-038`, `PQ-041`, and `PQ-040`, followed by `PQ-042`. |
| H3 and H4 corridor units | Accepted evidence must not be rerun as a ritual. Remaining corridor binding/promotion work stays dependency-driven behind the exact visual repair leaves reported by `--ready`. |
| PQ-025 qualification | Calibrate and run only after its exact corridor/performance dependencies are accepted. |

Run `--ready` after every coherent unit because the exact list changes as reviews, repairs, and
promotions land. PQ-042 remains dependency-gated on the remaining terminal PERF-03/04/06/07 acceptances;
PQ-043/PQ-044 remain deliberately deferred. The Alpha/Depth table below is the broader lifetime roadmap, not a
claim that every row is part of this recovery wave. This section supersedes dated “immediate queue”
prose below when the two disagree.

## Retained broad Alpha M0–M6 outcomes

| ID | Present maturity | Exact remaining work | Acceptance required |
|---|---|---|---|
| M0-EVIDENCE | RED | Repair/migrate all 20 Alpha records: 13 current issues include invalid hashes, unsupported schemas/status, and missing schema data. Finish EVID-001/EVID-002. | `check:alpha:evidence:contract` and `check:alpha:evidence`; current-revision browser/Electron evidence. |
| M0-BASELINE | STALE | Replace baselines bound to `6e27aa2b+dirty` with current committed-revision public routes. | Browser and packaged Electron canonical route, current hashes, clean teardown. |
| M0-OBSERVATORY | PARTIAL | Wire Phase B browser/media/filesystem, matched media/no-media/off sessions, detectors, and natural twenty-minute route. | Observatory gates plus matched player-route evidence. |
| M0-ASSET-INTEGRITY | PARTIAL | The promoted receipt gate now pins exact Helios, representative-rock, Wasp-candidate, and RCS artifacts, and authored admission fails closed instead of publishing visible primitives. Reconcile the remaining broad source-manifest residuals and every donor candidate; complete provenance, required views, LOD/collision/interaction, wiring, and performance receipts. | `check:graphics:asset-receipts`, asset-status/reachability/live checks, classification records, durable source/license evidence, and normal-route visual review. |
| M0-CALIBRATION | OPEN | Calibrate the available image/model/Blender generation and review capabilities against the professional visual bar, recording which workflows reliably produce shippable results. | Reproducible capability trials with retained inputs/outputs, independent visual verdicts, and explicit pipeline decisions. |
| M0-PRODUCTION | OPTIONAL DEBT | SAFE remains supervised/controller-waived, not accepted; automated hash-bound integration/controller machinery remains unfinished. | Only required for fully autonomous external mutation, not supervised game work. |
| M1-ROUTE | PARTIAL — CLEAN BROWSER ROUTE ACCEPTED | G04 clean-checkout evidence proves the committed browser route docks Helios through ordinary input, and the later journey harness repairs stale selectors/pause behavior. Run the current uninjected journey in Electron and reconcile any remaining strict-harness disagreement. | Complete uninjected New Game→objective→map→flight→dock route in browser and Electron with current receipts. |
| M1-FOCUS | PARTIAL — PQ-007 CORRECTION FOCUSED-GREEN AT `4d00867e` | Five cluttered exact-target flybys with correct 50% timing, deterministic target ownership, and escape/counterplay. The user-directed control correction is integrated: G retains auto-target weapon lead plus relative clutchable draw-to-fly; MMB pursuit selection, target-relative station keeping, pursuit impulses, and pursuit HUD/toasts stay absent. | Held-out public keyboard/gamepad/trackpad routes and media; current browser/Electron evidence on `4d00867e` before restoring route acceptance. |
| M1-CAMERA | PARTIAL | Capture and review current two-ship composition, ease, overflow, reduced-motion, and tether framing. | Fresh before/after media plus `check:camera`. |
| M1-TETHER | PARTIAL — NORMAL DURABILITY CLOSED | `2a9517d8` makes the starter/ordinary Massline nonbreaking under normal load with a 10x physical envelope, while preserving explicit manual/subsystem cuts and an authored extreme-load opt-in for future station/singularity-scale operations. Remaining M1 work is natural player-route feel/readability and later progression design, not maneuver-speed calibration. | SG-02/SG-06 resilience, `check:m1:tether-mass`, sim compare, and a future natural public benchmark. |
| M1-DOCTRINES | PARTIAL | Prove three readable doctrines, player counterplay, and recovery in held-out public routes. | 23/23 remains green plus natural route evidence. |
| M1-HUD | PARTIAL — CONDITION WIDGET REPAIRED | `ea698805` replaces the overlapping text/decorative icon with a readable ship schematic, shield ring, hull crop, explicit values, and warning states; fresh active-flight nominal/damaged captures and a11y proof pass. Continue removing repeated objective/action/threat instructions without removing the contact roster or protected station UI. | UI/a11y/perf checks and public screenshot review. |
| M1-VISUAL-FAMILY | PARTIAL — PROMOTED CHECKPOINT | Kestrel, pooled thrusters/RCS, Helios surfaces, the `54548e09` Helios Lark/Cradle/Span family, seamed/graffiti landmarks, loading presentation, the de-hazed background substrate, common-rock maps, authored fail-closed admission, typed projectile/mine/impulse/wreck identities, geology truth `e8838e2c`, and the RCS evidence repair `3d2dc765` are wired on current `master`. Finish Ashline V2 runtime admission, compact/reduced-motion/dense/Spector propulsion proof, combat/destruction visual acceptance, natural-route rock parity, localized authored space structure, gate/hero assets, and the next high-frequency PBR families. | Normal public routes with authored assets, classification/provenance records, asset/live/visual/perf checks, and reviewed browser/Electron media. |
| M2-REVALIDATE | GREEN CHECK (2026-07-20, `b28d183b`) | The continuity harness is repaired (fail-closed admission tokens; truthful per-part applied-LOD census) and `check:m2:seamless-world` passes on browser AND Electron with the full natural-route contract: two-stage rebase membrane clean, settled Continue inside the pose contract, identity continuity across streaming and reload. Facts the passing contract encodes: the whole entity list persists across save/Continue; authored admission is onBeforeRender-lazy (off-camera boundaries legitimately hold `awaiting-authored-admission`); pose restore is contracted in WU (settle uses a pose-equivalent pixel slack). Remaining: the three-clean-waves cadence if retained, and the named `station-applied-lod-inert` graphics defect the truthful receipt surfaced. | `check:m2:seamless-world` green (holds); periodic reruns at future checkpoints. |
| M3-RECOVERY | FOCUSED-GREEN — IMPLEMENTED AT `8e93ce7d` | Standard ship loss waits for an explicit Continue, applies the recovery receipt once, restores beside the remembered lawful station at the collision-clear berth, and closes Game Over only on `player:respawn`. The durable receipt also re-arms a lost in-memory latch instead of leaving a dead button; the DOM fixture repair is integrated at `0963b7d8`. No production repair is currently reproduced. | `node --test test/damage-death-recovery.test.mjs` passes 23/23 on 2026-08-05. A fresh natural Hunter-defeat Browser/Electron observation remains unclaimed release evidence, not unfinished implementation. |
| M3-CAREERS | PARTIAL | Run all three careers through complete unassisted ninety-minute routes across held-out seeds/policies. | Origins, ladders, cohorts, mining/combat/trade, save/Continue, first upgrade and recovery. |
| M3-PREVIEWS | OPEN | Replace simplified/fabricated engineering previews with truthful runtime asset/loadout presentation. | Engineering preview check plus browser/Electron comparison. |
| M3-NAV-HUD | OPEN | One objective, one immediate action, one threat; readable mission navigation and contact hierarchy. | UI checks and unassisted first-hour play review. |
| M4-ECOLOGY | FOCUSED-GREEN — 9/9 + ARRIVAL IDENTITY (2026-08-05) | No ecology product failure was reproduced. The sole red was an obsolete source-text adjacency pin left behind when runtime and fresh-run order moved to authoritative exported manifests; the check now reads those owners directly. Regional identities, traffic/yield/encounter/law seams, causal aftermath, and deterministic save/reload all pass. The existing transient sector postcard now consumes the applied ecology family and active-consequence count, making that shipped identity visible without new HUD chrome. | `npm run check:m4:regional-ecology` 9/9, `npm run check:sector-postcard`, player-facing labels, and one-voice all pass. Sparse/normal/crowded public-route diversity and art classification remain broader M4 acceptance, not an ecology initialization repair. |
| M4-FAMILIES | PARTIAL | Finish fighter/interceptor, miner/hauler, weapon/impact, station, POI, and ecology visual/behavior families. | Sparse/normal/crowded public routes and accepted visual classifications. |
| M4-ASHLINE | V2 SOURCE FOUNDATION UNWIRED | Grok's older-silhouette polish was reviewed and rejected for runtime promotion; its treatment work is archived. Continue from the stronger Ashline V2 source foundation, then bind manifests/runtime roles and prove the family in motion at the normal camera. | Normal-route reachability, browser/Electron motion, visual/gameplay acceptance, and measured cost. |
| M5-STORY | PARTIAL | Prove B0–B7 ordinary continuity, all five endings, and post-ending sandbox. | Held-out save variants and public routes. |
| M5-OWNERSHIP | PARTIAL | Prove three visible outpost specializations, their assets/economy, and 13-role progression. | Ordinary player routes, not injected supporting setup. |
| M5-COVERAGE | OPEN | Complete retail icon, silhouette, portrait, map-mark, and visible ownership coverage. | Accessibility and visual acceptance matrix. |
| M6-WASP | UNCLASSIFIED | The exact 12,797,604-byte / 11,526-triangle Wasp candidate is receipt-bound, but current asset status still treats Wasp/Pelican whole-ship use as blocked/accessory-only. Add an accepted classification and prove the real route, or keep it explicitly candidate-only. | Asset-classification evidence gate plus current player-route/perf review. |
| M6-PERFORMANCE | PARTIAL — SYNTHESIS INTEGRATED | Performance tip `99cad5b5` is integrated through `b235f062` with graphics semantics preserved; strict evidence hardening is integrated through `280cafb0`. The tree passes all 167 modified performance tests and 35 final-evidence contract tests; bounded autosave retains its 8 ms scheduling target and unchanged 12 ms hard slice. The isolated `04805924..9d626fd8` scene-pool/BatchedMesh range was measured and rejected: every measured implementation lost to current ship-local static batching, and the final target-Intel p95 was 250.1/616.8/433.3 ms for 10/25/50 ships. Exact tip `9d626fd8` is retained by recovery tag; the future hybrid hypothesis is recorded at `1074c078`. Prior diagnostic matrices do not count as <=16.7 ms acceptance runs. **Fresh strict baseline at exact-clean `b28d183b` (2026-07-20, two runs): FAIL with three named rows — `spatialHash.queriesPerSecond.max` 62.9 vs 55 (reproducible; no new query sites in the PQ batch — behavioral amplification or pre-batch exceedance; attribution follow-up owed), `raf.frame.p95.target` 16.8 vs 16.7 (the WebGL-submit-noop floor itself is 16.8 on this display — budget-vs-vsync-floor reconciliation ruling needed, not a quality change), and the worktree-clean evidence row (transaction artifact).** | Fresh combined-tree three-profile/three-full-matrix promotion gate on one exact clean commit, plus target/floor hardware, decoder/loader lifecycle, and no graphics-admission regression. Do not replay the rejected pooling range. |
| M6-VISUAL-DEFECTS | PARTIAL | Hitch plume glare and Helios opaque/unshaded bulk materials were repaired; `e8838e2c` places material-matched authored skins on real asteroids; `ea698805` fixes the condition-widget overlap; `54548e09` promotes the detailed Helios civilian family. A fresh hardware Electron propulsion route proves four plume layers, two RCS jets, and zero reported frame allocations. Remaining visible-risk work is compact/reduced/dense/Spector propulsion evidence; rock motion and mip continuity; broader admission/rebase/interpolation/LOD/HLOD/pool/Continue/context continuity; Electron/GPU combat/destruction acceptance; localized background structure; Ashline V2; and fleet-wide asset-specific PBR. | Same-framing browser/Electron captures, independent visual acceptance, asset/live/visual/perf checks on the final combined tree. |
| M6-RELEASE | PARTIAL | Real browser/Electron store capture, parity, localization, accessibility, corrupt-save/migration, resize/alt-tab, platform soak, visual/audio coverage. | Full release matrix and, if the draft production policy is adopted, five clean waves. |

## Immediate program queue after the 2026-07-21 Gate-0 closure

- **PQ-011 is CHECKED OFF** (`ROUTE_ACCEPTED`+`INTEGRATED`, Gate-0 closure `958e15ab`..`3a812b90`).
  Its named non-blocking follow-ups (P2 offscreen lock cue, P2 HUD overlaps, P2 over-damped swing
  owned by the massline tuning lane, the natural-hostile-pressure evidence gap, and the
  separately-filed stranded-freighter static-collider latent defect) live in the receipt's
  `gate0_closure` block.
- **THE BATCH IS CLOSED: PQ-012, PQ-013, PQ-014, PQ-015, PQ-016 are ALL CHECKED OFF** at final
  master `ce97d573` (historical commits and evidence are retained in receipts,
  including the named follow-up list). **PQ-017 is CHECKED OFF at `2a9517d8`.** At this historical
  snapshot PQ-018 was next; the current Cathedral runtime/route now exists and the remaining exact
  task is the whole-asset reauthor/H1/review chain in the top table.
- **Full PQ-014 follows the PQ-015 registry release.** Reuse the existing deterministic job kernel;
  do not replace it. Remaining work is live materialization, virtualization, AI movement, save,
  natural-occurrence census, held-out seeds, and public-route proof.
- **PQ-016 follows PQ-015 and the PQ-012 physics/renderer release.**
- **PQ-013 was integrated last in this historical batch** because its planet vertical spans physics, renderer,
  Atlas, save, and the browser/GPU route.
- The fleet breadth foundry on master is reusable source infrastructure: 47 detail pieces, 14
  variants, and 20 scenery props. It does not reduce M1-VISUAL-FAMILY debt until selected assets are
  bound through manifests/runtime maps and survive normal-camera browser/Electron comparison.

### M1-ROUTE re-measurement (2026-07-18, at `2a355195`, dependencies verified present)

The row above attributes the failure to autopilot and quotes a distance short of the dock. Neither
survives re-measurement. Three observations, in the order they were taken:

1. **The autopilot is not the defect.** `npm run check:autopilot` exits 0 and prints
   `--- ALL V3 AUTOPILOT CHECKS PASSED ---`. That includes the live V3 + Rapier case
   ("clears centered corridors/dense fields, reaccelerates, and arrives":
   `completionTick` 1197–1210, `maxLateral` 345–354, `finalDistance` 37.84–37.87 WU), halfway reverse
   burn, obstacle avoidance with side-commit and order-independent escape, the avoidance lifecycle,
   assisted/drift/newtonian modes, and `ui:setCourse → nav.autopilot`.
2. **The route no longer reaches flight at all.**
   `npm run check:professional-travel:public-route:browser` marks `observers-armed`,
   `intro-dismissed`, `main-menu-visible`, `new-game-visible` — then clicks Launch and dies on
   `page.waitForFunction: Timeout 150000ms exceeded` waiting for flight-ready. The next milestone,
   `authored-flight-ready`, never fires. A 294 WU distance-to-dock cannot be produced by a run that
   never enters flight, so that figure is stale, not current.
3. **A second harness fails even earlier.** `npm run check:wave15-flight-boot` fails at
   `AssertionError: New Game button` — the click helper returns false.

4. **A fourth observation overturns 2 and 3.** The `G01` public pilot — written fresh against verified
   game seams and forbidden by its own static contract from injecting state — **completes the corridor
   through ordinary public input**, three times (two by its author, one independently by the lead):

   | Run | Armed from | Closest approach | Dock | Result |
   |---|---|---|---|---|
   | author, `--stop=first-station` | 1328.586 WU | **152.111 WU** | `station_helios`, 1 public KeyE hold | PASS |
   | author, `--stop=full` | 1283.341 WU | **155.158 WU** | 1 public KeyE hold | PASS, 13/13 milestones |
   | lead, independent | — | — | first-dock @78.1s | PASS, clean teardown |

   The `--stop=full` run reached `service-used` (market, 2 service events), `save-written`
   (slot `quick`), `continue-restored` (flight, `sector_helios_prime`), and `clean-teardown`, with
   0 console errors, 0 page errors, and no leaked resources. The dock is not a selector
   false-positive: the capture shows the full Helios Station UI (HELIOS STATION / Trade Hub Class L,
   FIRST DOCK HANDOFF banner, UNDOCK READY, 2 active missions).

   Both closest approaches are far **inside** the 294.777 WU the row calls a RED best.

**Revised conclusion.** The corridor route is reachable on the current tree. Observations 2 and 3 are
therefore most likely **stale harness predicates and selectors**, not a game defect — `G01`'s author
records that their own first draft guessed `KeyF` and invented selectors before being corrected
against source to `KeyE` and `.sf-alert--dock`, which is exactly the failure mode an older harness
would exhibit. That the two old harnesses fail at two *different* points supports harness drift over a
single hard break.

This is not yet proof that the old harnesses are wrong, and it is not a promotion of `M1-ROUTE`:

- At this earlier measurement point, all runs were on a dirty tree. `G01`'s author noted the dirty foreign map/nav files
  (`src/ui/galaxyMap.js`, `src/ui/navigation/localSpaceMapModel.js`, `src/systems/world.js`) may
  themselves be what makes the approach work, in which case the improvement belongs to the
  `MAP-2026-07-18` lane and is uncommitted.
- No run was done against a clean `bfb23570` checkout, so HEAD-vs-dirty attribution stays open.
- No Electron run was attempted.

**Required next action is measurement, not repair.** Re-measure `M1-ROUTE` with `G01` on a clean
checkout and on the dirty tree, then repair whichever of the game or the old harnesses the delta
names. Do **not** fund autopilot repair against this row: the autopilot acceptance surface is green
and the public route now docks.

**Wave-01 update (2026-07-18, at `fb9a0c82`): the clean-checkout half of that measurement is
DONE.** The G01 pilot passed `--stop=first-station` on a fully clean detached checkout of
`fb9a0c82` (status empty before the run): dock at 96s, `station_helios`, closest approach
154.166 WU, one public KeyE hold, `injectedState: false` — plus four more public dock successes
the same day on the working tree (87s/91s/107s routes and a restore-then-re-dock). The dirty-tree
map/nav WIP is therefore NOT what makes the approach work; the route belongs to committed code.
`G04` is promoted to `ROUTE_ACCEPTED` on this evidence (see the acceptance matrix). What still
separates `M1-ROUTE` from exit is unchanged in kind: an Electron pilot run (the pilot driver is
browser-only today — G18/M1 debt) and the two stale harnesses
(`check:professional-travel:public-route:browser`, `check:wave15-flight-boot`), which remain
harness-drift suspects, not game defects.

## Depth Program roll-up

`IP-CP` means implementation/check surfaces are preserved by checkpoint `850c80f3`. It does not mean
the prior focused result has been rerun at current HEAD or that the chunk is accepted. After the
repository-state reconciliation, the roll-up remains **0 DONE, 16 IP-CP, 15 TODO**.

### Enabling and M3 narrative/content track

| Chunk | State | Exact next action before DONE |
|---|---|---|
| F1 `.faction` migration | IP-CP | Rerun the full repo gate and current parity review from committed HEAD. |
| F2 validators/loader | IP-CP | Rerun the full repo gate and bad-fixture matrix from committed HEAD. |
| V1 fifteen NPCs | IP-CP | Revalidate 15 contacts; replace compressed gates with natural/unassisted contact/read-through proof; full gate. |
| V2 rumor/flavor corpus | IP-CP | Add ad-board, Quiessence, and Hush producers; finish wreck-rumor reachability and Contracts presentation; resolve Bar station identity without regressing station UI; full gate. |
| R1 unique-wreck system | IP-CP | Unassisted rumor→bearing→scan→decision→salvage route and full gate. |
| R2 twelve wrecks | IP-CP | Revalidate all 12 and surface carriers; full gate and natural sweep confirmation. |
| SP1 set-piece missions | IP-CP | Real unassisted human-duration observation for success/failure/retry routes; full gate. |
| E1 eight encounters | IP-CP | Keep the two explicitly banked follow-ons as honest stubs; finish natural, uncompressed public-route acceptance for the eight canonical encounters and run the full gate. |
| A1 The Band | IP-CP | Materialize physical Quiessence/Hush actors and canonical proximity capture; full gate. |
| A2 Ship’s Ledger | IP-CP | Verify player reachability without redesigning protected station UI; capture panel; UI/full gates. |

### M4/M5 world, identity, art, and doctrine track

| Chunk | State | Exact next action before DONE |
|---|---|---|
| L1 faction livery | TODO | Implement distinct runtime liveries and accepted captures. |
| K1 five factions live | IP-CP | Revalidate live behavior/data; full repo gate and unassisted faction exposure review. |
| PR1 props 1–8 | TODO | Author, optimize, wire, classify, and capture props 1–8. |
| PR2 props 9–15 | TODO | Author, optimize, wire, classify, and capture props 9–15. |
| H1a Wreck Cathedral | PARTIAL — SOURCE candidate on master; PQ-017 dependency satisfied | The 2026-07-20 closeout preserved the full SOURCE_GLB candidate at `6df5a210`..`7330a85b` (blend + 11.2 MB GLB + 26 PBR textures + 15 captures + turntable + 11 reports + reproducible authoring scripts; SHA-256 manifest; gltf-validator clean). Next: manifest/release promotion, place registration, Atlas integrity, PQ-017 component/operation/history wiring, save continuity, browser/Electron route acceptance, and measured performance. |
| H1b Obelisk + Shard Sphere | TODO | Author/place/wire both landmark identities and accept in play. |
| H1c Candle Fleet + Quiessence | TODO | Author/place/wire both and connect Band/story producers. |
| H1d Lung + Funnel | TODO | Author/place/wire both with distinct behavior and accepted captures. |
| H1e Flight Deck + Caved Shaft | TODO | Author/place/wire both with navigation/gameplay use. |
| H1f Arc + Watcher + Metronome | TODO | Author/place/wire all three and implement readable rites/timing. |
| H1g Vault Maw + Iron Maw | TODO | Author/place/wire both with distinct combat/world interaction. |
| H1h five capitals | TODO | Build and accept five distinct faction-capital identities. |
| S1 Vael bio line | TODO | Build Vael ship family, behavior, assets, natural carriers, and acceptance. |
| S2 Fulfillment + Understory kit | TODO | Build both ship/attachment families, behaviors, carriers, and acceptance. |
| S3 Reach sub-cultures | IP-CP | Add browser/Electron frames, unassisted 60–90s intro review, B11–B15 hulls, and Maw-volley proof. |
| S4 Authority + Thunderchild | IP-CP | Add B16–B20 assets, real hold producer, registry/package wiring, morale/decal/news consumers, forced succession, and public fleet proof. |
| W1 planet states 1–4 | IP-CP | Corrected from TODO: revalidate committed data groundwork; add shaders/runtime visuals, state transitions, save continuity, `check:visual-stability`, four orbital plus four combat-distance captures, and a deterministic Scrawl ace-challenge sector-entry route. |
| W2 planet states 5–8 | TODO | Implement second planet-state wave and acceptance. |
| A3 Living Hull | TODO | Implement bounded persistent hull history/decal/wash loop and public before/after series. |
| D1 doctrine audit | IP-CP | Give original nine/Helix natural fleet carriers; complete S1–S4 adoption/assets and player-route differentiation. |

### M6 Depth closeout

| Chunk | State | Exact next action before DONE |
|---|---|---|
| GT1 Golden Thread + Gallery | IP-CP | Rerun the loot-leak audit, then archive full `npm run check`, build ~40-shot gallery, and run unassisted first-hour Candle Fleet→ticker→bearing→unique→Band route. |

## Cross-program work that must not disappear

1. Audit the broad `850c80f3` checkpoint by coherent subsystem; recoverable does not mean reviewed or accepted.
2. Create durable evidence manifests because `.devshots/depth-program/**` remains ignored.
3. Review telemetry-golden changes included in `850c80f3` as an explicit re-record decision; a bulk
   commit is not acceptance evidence.
4. Keep `src/systems/input.js`, station UI, render/assets, and active lease paths under their named
   ownership rules.
5. Keep residual concurrent WIP separate, re-run status counts, and update
   [`04_WORKTREE_AND_INTEGRATION.md`](./04_WORKTREE_AND_INTEGRATION.md) after every checkpoint or
   integration batch.
6. Use [`09_DONOR_VALUE_LEDGER.md`](./09_DONOR_VALUE_LEDGER.md) before recovering any archived donor
   slice. Only `master` remains registered; never reconstruct a whole donor merge.
