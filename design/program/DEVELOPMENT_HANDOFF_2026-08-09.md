<!-- LIFETIME: HISTORICAL CHECKPOINT -->
# SpaceFace development handoff — 2026-08-09

This file is the durable handoff for the long-running Recovery Plan, recovery triage, graphics/VFX,
and visual-quality tasks. It records what those tasks actually produced, what remains only as local
work, and how to continue without reconstructing several days of task transcripts.

This is **not a second roadmap**. Current authority remains:

1. [`CANONICAL_BUILD_MAP.md`](../../CANONICAL_BUILD_MAP.md) for routing;
2. `node scripts/program-dispatch.mjs --ready` for current claim-ready units;
3. [`NOW.md`](./NOW.md) for exact live writers and dirty-path protection;
4. the selected packet in [`roadmap/active/`](./roadmap/active/README.md);
5. exact-revision receipts for acceptance evidence.

If this checkpoint disagrees with later Git history, the dispatcher, an active packet, or a receipt,
the later/current source wins. The purpose of this file is to prevent work from disappearing, not to
grant a lease or mark unfinished work complete.

## 1. Snapshot boundary

This checkpoint was assembled against:

- local `HEAD`: `be07fc471f062fc30d6d9ca7acbfcfbcdf80a6e2`;
- `origin/master`: the same commit;
- cached index: empty before this file was added;
- live Recovery Plan task: still reconciling PR #92 with the current control plane;
- no Browser, Electron, native, or Blender launch performed for this checkpoint.

At that snapshot, the primary checkout had 109 dirty or intent-added paths:

| Group | Count | Meaning |
|---|---:|---|
| PQ-019 receiver-facility Phase A candidate | 104 | Unpublished source candidate, evidence, build/render tools, promoter, and focused test. It is not canonical runtime/release completion. |
| PQ-045 program accounting | 3 | Reviewed but unpublished edits to the active packet, queue, and target-motion receipt. The Recovery Plan task is reconciling these with PR #92. |
| `design/program/NOW.md` | 1 | Foreign live coordination change. Do not overwrite or absorb it. |
| `--class/` | 1 | Foreign untracked path with no established ownership in this checkpoint. Do not clean, move, stage, or infer its purpose. |

The 104 receiver paths comprise 100 files under `assets/ships/m5_claim_outposts/**` plus:

- `test/pq019-receiver-facility-material-truth-pipeline.test.mjs`;
- `tools/art/promote_claim_outpost_receiver_facility_material_truth_v1.mjs`;
- `tools/blender/build_claim_outpost_receiver_facility_material_truth_v1.py`;
- `tools/blender/render_claim_outpost_receiver_facility_material_truth_v1.py`.

Do not wholesale commit the dirty tree. Each group below has its own disposition and next step.

## 2. The plan structure that exists now

The repository already has a coherent authority hierarchy. New agents should not invent another one.

| Source | What it owns | What it does not own |
|---|---|---|
| [`CANONICAL_BUILD_MAP.md`](../../CANONICAL_BUILD_MAP.md) | How to enter the program, select a packet, find current owners, and prove a result. | A live queue snapshot or task transcript. |
| [`roadmap/program-queue.json`](./roadmap/program-queue.json) + `program-dispatch` | Exact dispatch units, dependencies, mutexes, allowed paths, and coarse state. | Current leases, implementation detail, or visual acceptance. |
| [`roadmap/active/PQ-045.md`](./roadmap/active/PQ-045.md) | The R5 Ceres lived-world vertical slice and its current execution contract. | The entire graphics program or later sector propagation. |
| [`roadmap/active/PHYSICS_AS_SPECTACLE_PROGRAM.md`](./roadmap/active/PHYSICS_AS_SPECTACLE_PROGRAM.md) | The R8 graphics/VFX/Massline showcase and later rollout gates. | Permission to skip the R5 Ceres five-minute gate. |
| [`../vision/GAME_DIRECTION_EXPANSION.md`](../vision/GAME_DIRECTION_EXPANSION.md) | Durable product direction: systemic frontier life, physical causality, personally piloted consequence, long-lived ship identity, and dense hero clusters. | Priority, claims, leases, or acceptance. |
| [`EXPANSION_PROGRAM.md`](./EXPANSION_PROGRAM.md) and `design/graphics-sprints/**` | Graphics research, failed hypotheses, quality standards, and ROI guidance. | A runtime lease or proof that an asset shipped. |
| PR #92, `docs(design): add inference-to-convergence production workflows` | A useful supporting method: inspect the player experience, generate alternatives, cut weak ideas, implement through live owners, and review the composed route. | A merge-ready second roadmap. It is a draft from an older base and must not be merged wholesale. |

### PR #92 disposition

PR #92 is a 45-file draft based on an older repository state. It is documentation/routing work, not
runtime implementation. Its best contribution is the convergence method and its KEEP / REVISE /
REBUILD / CUT vocabulary. Its stale reference-sector status must be reconciled against current master,
the current queue, and current receipts.

The live Recovery Plan task is doing that reconciliation. The intended result is:

- keep one authority graph: the current queue and active packets;
- incorporate the convergence method as supporting doctrine;
- separate **shipped**, **claim-ready**, and **directional** work;
- never count candidates, files, tests, or screenshots as accepted production units;
- do not merge the PR branch verbatim.

## 3. What each long-running task actually accomplished

### 3.1 Implement Recovery Plan — active, not finished

This task turned the Ceres reference-sector concept into real runtime behavior and a machine-visible
program packet. Material outcomes published by the task include:

| Commit | Outcome |
|---|---|
| `37e4d74c` | Authored ship drive families are authoritative through the real spawn chain. |
| `f050670b` | Ceres activity jobs remain physically truthful through runtime lifecycle and spatial-query wiring. |
| `446e4e06` | Seven traffic-owned Ceres jobs expose stable target references and deterministic typed action receipts. |
| `fc5e54a0` | Six bounded Ceres job-action profiles are presented through the live pooled VFX owner. |
| `f66f6768` | Two exact Ceres Wasp responders use lease-backed law authority and real weapon/combat ownership. |
| `fdbbd495` | One authored escort relationship holds formation on its live ward. |
| `2cda03cb` | Three Ceres jobs, across five exact target relationships, move toward the real live objects named by their routes. |
| `5d026a0f` | The ChatGPT product interview was converted into `GAME_DIRECTION_EXPANSION.md` and routed from the canonical map. |

The task is currently reconciling PR #92 and the newer master state into the existing control plane.
It has not completed the full Professional Recovery Plan. Its next production leaf is the disabled
refinery client described in §6.1.

### 3.2 Triage SpaceFace recovery work — original task complete

The triage task is no longer an implementation owner. It:

- classified all 13 harvested recovery sources;
- preserved the stopped Lark only as a donor/reference rather than silently replacing the accepted ship;
- implemented the missing dependency-blocked world-site beam refusal behavior;
- deleted the exact obsolete `_recovery` tree: 347 files, 28,589,779 bytes;
- removed 18 stale object-pinned local refs;
- published the durable recovery receipt
  [`WORKTREE-RECOVERY-2026-08-08-REPORT.md`](./roadmap/receipts/WORKTREE-RECOVERY-2026-08-08-REPORT.md);
- published support-only NPC activity donors in `28529c34` (15 GLBs and 62 PNGs, no runtime promotion).

There is no remaining implementation that should be assigned to that task. It can be archived after
this handoff is accepted.

### 3.3 Improve game graphics and VFX — original broad plan incomplete

This task produced useful infrastructure and preserved source material, but it did **not** finish the
requested professional graphics overhaul.

Published results:

| Commit | Outcome |
|---|---|
| `0f44b94b` | Five-minute Ceres acceptance harness source and focused tests. It was not a Browser/Electron visual acceptance run. |
| `a811d0a8` | Everyday Space donor kit preserved source-only: 46 GLBs and supporting records. Nineteen assets remain REVISE-first; nothing was promoted to runtime. |
| `c4a3bb32` | Graphics research/authority packet reconciled into durable program documentation. |

The full A-list asset/VFX pass remains open. Reference art, donor preservation, and harnesses are not
the same as installed, route-proven game graphics.

### 3.4 Visual-quality and performance task — stopped at this checkpoint

This task published five real technical prerequisites:

| Commit | Outcome |
|---|---|
| `1eb4fd9b` | Release packaging omits render-package source duplicates without weakening projection/receipt checks. |
| `216099e9` | Target-sector authored boundaries can be prepared before publication with bounded work and context-safe cleanup. |
| `39f2841f` | Simulation/presentation transport closes deterministically during shutdown. |
| `8809e13b` | Electron tolerates only the canonical initial-load reload abort after the initial canonical commit. |
| `80af8864` | Authored package batching is causally proven by the live probe contract. |

It also created a large external reference atlas and four unfinished implementation prototypes. No
A-list asset from this campaign was installed and accepted on the player route.

## 4. Unfinished work that must not disappear

### 4.1 PQ-019 receiver-facility Phase A candidate — primary checkout

Location: the 104 paths listed in §1.

Current meaning:

- isolated candidate blends and GLBs exist for the lawful catcher and covert refinery/fence;
- baseline/candidate stills, validation reports, provenance inputs, and build/render tools exist;
- canonical base/refinery sources, accepted parts, release manifests, runtime bindings, and render
  packages were deliberately excluded from Phase A;
- `release_candidates/**` is only an isolated mirror, not release proof;
- whole-asset review returned **G1 REVISE / G2 REVISE / G4 REVISE**: the forms remain box/loft
  dominated, mechanisms and load paths are weak, negative space is insufficient, and the dark
  material response does not clearly separate the two roles;
- deterministic export work identified UV/tangent-only cross-build drift and introduced a
  canonicalization direction, but deterministic bytes do not make the art acceptable.

Do not promote this packet. The next owner must either produce a genuinely revised Phase A candidate
that receives exact-source KEEP or explicitly discard the candidate while preserving the preflight and
review findings. Only then may a separately claimed Phase B promote the fixed canonical files, and a
later Phase C own manifests, release packages, runtime bindings, and route evidence.

### 4.2 Station Ledger prototype — isolated worktree

Worktree: `C:\sf-agents\station-ledger-a-list`

Base: `fdbbd495`. Dirty files:

- `styles/station.css`;
- `test/ship-ledger-evidence-host.test.mjs`.

Diff size: 451 insertions, 23 deletions. It attempts to repair overlapping headers, unbounded ledger
width, simultaneous list/detail presentation, and compact-layout hierarchy. It has source tests but no
matched current-base player screenshots or integration review. Salvage selectively or discard; do not
copy the worktree wholesale.

### 4.3 Sector-law UI prototype — isolated worktree

Worktree: `C:\sf-agents\sector-law-ui-a-list`

Base: `fdbbd495`. Dirty files:

- `scripts/check-sector-law-presentation-browser.mjs`;
- `src/ui/sectorLawPresenter.js`.

Diff size: 1,157 insertions, 93 deletions. This is an oversized, unfinished revision. The checker is
larger than the production change and the candidate has no accepted current-base route proof. Treat it
as a source of ideas, not a patch to merge.

### 4.4 Shield/VFX R3 prototype — isolated worktree

Worktree: `C:\sf-agents\shield-r3-integration`

Base: `fdbbd495`. Dirty files:

- `scripts/check-presentation-cues.mjs`;
- `scripts/check-sg08-render-vfx.mjs`;
- `scripts/lib/performanceScenarioDriver.mjs`;
- `src/presentation/cueRecipes.js`;
- `src/render/renderer.js`;
- `src/render/ships/shipKit.js`;
- `src/render/vfx.js`;
- `test/47a.telemetry.expected.json`;
- `test/47a.telemetry.v3.expected.json`;
- `test/shield-field-vfx-lifecycle.test.mjs`;
- `test/ship-aux-dirty-ranges.test.mjs`;
- `test/ship-aux-single-pass-sync.test.mjs`.

Diff size: 844 insertions, 89 deletions. The source direction was reviewed, but no matched in-game
evidence or current-base integration exists. The telemetry golden edits require causal motion-vs-
bookkeeping proof before acceptance. This candidate must be re-derived against current owners; never
merge the twelve files wholesale.

### 4.5 Bespoke faction-ship prototype — isolated worktree

Worktree: `C:\sf-agents\bespoke-faction-a-list`

Base: `fdbbd495`. Dirty files:

- `src/render/ships/concordPatrol.js`;
- `src/render/ships/driftBarge.js`;
- `src/render/ships/meridianTrader.js`;
- `src/render/ships/quietRaider.js`;
- `src/render/ships/reaverPirate.js`;
- `src/render/ships/vaelSniper.js`.

Diff size: 136 insertions, 49 deletions. An author agent stopped before screenshots and route proof.
The changes are not A-list quality evidence. Compare them against current-base originals and the
external faction-fleet reference packet, then keep only independently proven improvements.

### 4.6 External reference atlas — complete as reference, not production

Root:
`C:\Users\93rob\.codex\delegations\spaceface-visual-a-list-20260809\artifacts\reference-atlas`

Snapshot: 274 files, 230 PNGs, 470,083,807 bytes. It covers environments, player/friendly/hostile/
traffic/bespoke ships, places, props, portraits, HUD/panels, camera/cinematics, accessibility, weapons,
damage/shields, mining, Massline, propulsion, travel, Ceres job actions, and world-site signatures.
Each accepted packet carries local provenance; rejected drafts are retained where useful.

These are quality targets and design references. They do not prove that any runtime asset, animation,
UI, or VFX meets the target. Do not commit all 470 MB blindly. A future admitted catalog/preservation
unit should select the smallest durable boards and provenance necessary for the exact implementation
packet that consumes them.

The iconography packet was interrupted before a durable deliverable. Do not claim it exists. The
Scenario 47-A packet and Ceres action/escort packet did reach durable external folders with provenance.

## 5. Current dependency order

The current Recovery Plan order is:

```text
PR #92 / current-status reconciliation (program docs only)
    -> PQ-045.tender-client-materialization
        -> PQ-045.route-topology
            -> PQ-045.causal-chain
                -> PQ-045.vfx-recipes
        -> PQ-045.npc-identity
            + route-topology -> PQ-045.prop-promotion
            + route-topology -> PQ-045.wreck-dressing
all five implementation leaves
    -> PQ-045.five-minute-h1 (Browser + Electron, clean fixed candidate)
        -> PQ-045.human-review (named human only)
            -> R8 Physics-as-Spectacle showcase
                -> five normal scene cells and four independently accepted asset waves
                -> technical finish and final review
```

The R8 packet expressly remains blocked on the accepted five-minute Ceres gate. Existing VFX,
prewarm, batching, and reference work are prerequisites or supporting material; they do not satisfy
that gate.

## 6. Copy-ready prompts for the remaining Recovery Plan

Use **one prompt per agent/task**. Each agent must finish, publish, and stop after its one exact unit.
Do not tell an agent to “keep doing the next thing.”

### 6.0 Finish the active PR #92 / program reconciliation

Use this only if the current `Implement recovery plan` task stops before publishing its reconciliation.

```text
Take over only the SpaceFace program-control reconciliation already in progress.

Start at CANONICAL_BUILD_MAP.md, design/program/NOW.md, the live output of
`node scripts/program-dispatch.mjs --ready`, design/program/roadmap/active/PQ-045.md,
design/program/roadmap/active/PHYSICS_AS_SPECTACLE_PROGRAM.md, and
design/program/DEVELOPMENT_HANDOFF_2026-08-09.md. Inspect PR #92 directly.

Outcome: reconcile what is shipped, what is claim-ready, and what remains directional. Preserve the
current queue/active-packet/receipt system as the only status and dependency authority. Integrate only
PR #92's useful inference-to-convergence method as supporting doctrine: ordinary-player inspection,
multiple candidates, KEEP/REVISE/REBUILD/CUT, composed-route review, and propagation only after an
accepted unit. Do not merge PR #92 wholesale and do not create a second roadmap.

Protect every foreign dirty path, especially the 104 PQ-019 receiver files, NOW.md foreign hunks, and
--class/. Reconcile the three existing PQ-045 accounting files rather than replacing them. Validate
program links/schema/diff, obtain independent SPEC then QUALITY review, commit and push only the exact
owned program files, and stop with the new commit plus the one first claim-ready dispatch unit.
```

### 6.1 PQ-045 tender/client materialization — first production task

```text
Implement only `PQ-045.tender-client-materialization` from the current SpaceFace queue.

Read CANONICAL_BUILD_MAP.md, design/program/NOW.md,
design/program/roadmap/active/PQ-045.md, and run
`node scripts/program-dispatch.mjs --id PQ-045` before mutation. Fresh-check all exact paths.

Owned paths only:
- src/data/sectorActivityPockets.js
- src/systems/factionPresence.js
- src/systems/npcJobsRuntime.js
- src/systems/world.js
- scripts/lib/ceresFiveMinuteAcceptance.mjs
- test/ceres-active-pockets.test.mjs
- test/ceres-activity-faction-tender.test.mjs
- test/ceres-activity-runtime-lifecycle.test.mjs
- test/ceres-five-minute-acceptance.test.mjs

Player/runtime outcome: materialize one stable disabled-hull client for the Pitborn yard tender. Preserve
the tender's exact string targetRef through factionPresence job projection and save/Continue; bind the
current live client through world authority; steer through the existing single npcJobsRuntime movement
owner to a safe berth; update the fixed five-minute object census. Missing/dead/wrong-sector clients
fail closed. Do not create a generic reference language, a second movement writer, numeric persisted
entity IDs, or physical entities for the seven intentionally abstract activity refs.

Required proof:
`node --test test/ceres-active-pockets.test.mjs test/ceres-activity-faction-tender.test.mjs test/ceres-activity-runtime-lifecycle.test.mjs test/ceres-five-minute-acceptance.test.mjs`
then `npm run check:pq020:ceres-topology`, then `npm run check:baseline`.

Update the exact queue/receipt state only after production and focused proof are true. Obtain SPEC then
QUALITY review, commit and push the exact owned files, and stop. Do not begin route topology.
```

### 6.2 PQ-045 route topology

```text
Implement only `PQ-045.route-topology` after tender-client-materialization is published and done.

Owned paths only:
- src/data/sectorActivityPockets.js
- test/ceres-active-pockets.test.mjs

Replace the repeated 102/116-WU cardinal shuttle pattern with four distinct, fiction-readable Ceres
route topologies. Preserve the exact pocket identities, actors, deterministic seed behavior, budgets,
spawn order, target references, and accepted geography. No two places may share the same topology.
Do not add microevents, new actors, art, VFX, or a route framework.

Run the focused test, `npm run check:pq020:ceres-topology`, and `npm run check:baseline`. Obtain SPEC
then QUALITY review, commit/push the exact two paths plus truthful program accounting, and stop. Do not
begin the causal chain.
```

### 6.3 PQ-045 six-event causal chain

```text
Implement only `PQ-045.causal-chain` after route-topology is published and done.

Owned paths are bounded to:
- src/systems/traffic.js
- design/incubator/microevent_library/
- the smallest focused test file required by the current owner contract, after an exact-path claim

Implement exactly these six ambient events against the final four-pocket route:
rich seam strike; miner calls hauler; patrol scans suspect; disabled hauler recovery; tender services
miner; cutter strips wreck. Reuse current cargo/economy/mining/damage/law/job owners. Cap authored
concurrency at two. The player should see cause -> response -> consequence rather than six independent
timers. If a global concurrency/cooldown framework is genuinely required, stop and return a narrow
shared-change request instead of building one silently.

No new simulation authority, population expansion, renderer work, or headed acceptance. Run focused
causal tests and `npm run check:baseline`; obtain SPEC then QUALITY, publish one atomic unit, and stop.
```

### 6.4 PQ-045 occupational NPC identity

```text
Implement only `PQ-045.npc-identity` after tender-client-materialization is published and done.

Start from the current packet and visual-asset production standard. Claim the asset-manifest mutex and
the exact rows/files before mutation. Bounded owners:
- src/render/partsLibrary.js
- src/systems/traffic.js
- assets/incubator/npc_activity_pack/
- only the exact generated source/release/manifest/package/test paths required by the four accepted
  occupational families

Give ore_barge, repair_tender, salvage_cutter, and survey_pin distinct production presentation. Add a
new ore_carrier presentationRole rather than letting the barge inherit the existing hauler's
helios_span identity, team, speed, or Cargo Hauler label. Exclude customs_cutter because it collides
with a live hostile archetype. Preserve gameplay census/routes/RNG and do not promote the donor pack
wholesale.

Every promoted family needs reproducible source, LOD/collision, manifest/release/package authority,
default-route admission, performance budget, and exact-hash whole-asset G1/G2/G4 review. Run focused
tests, `npm run check:assets:live`, and `npm run check:baseline`; obtain SPEC then QUALITY, publish one
atomic unit, and stop.
```

### 6.5 PQ-045 Everyday Space prop promotion

```text
Implement only `PQ-045.prop-promotion` after route-topology is published and done.

Read the exact selection ledger and visual-asset standards. Claim Blender and asset-manifest mutexes.
Work only in the exact selected rows under assets/incubator/everyday_space_kit/ and the exact
assets/ships/parts/ source/release/manifest/package paths admitted for this packet.

Re-author the sixteen selected action-support props; do not promote the donor pack as-is. First pin the
toolchain and prove two byte-matching builds, because 29 of 46 donor GLBs differed across two isolated
Blender 5.1.2 builds. Each accepted prop needs meaningful manufactured form/material zones, real LODs,
recomputed collision, placement tied to the final route, G0-G7 evidence, and exact-source whole-asset
KEEP. Cut weak props instead of counting files.

Run focused asset tests, `npm run check:graphics:asset-receipts`, and `npm run check:baseline`; obtain
SPEC then QUALITY, publish the exact accepted family transaction, and stop.
```

### 6.6 PQ-045 wreck dressing

```text
Implement only `PQ-045.wreck-dressing` after route-topology is published and done.

Claim Blender and asset-manifest mutexes. Work only in the exact selected
assets/incubator/wreck_aftermath_pack/ sources and the exact assets/ships/parts/places/ promotion paths.
Dress ceres_ambush_bait_wreck and ceres_cathedral_grave_shard with no more than the seven selected
assets. The donor pack is not production-ready: its 37 GLBs have no texture data, 1,891 unmerged
meshes, no LODs, and no instancing. Re-author selected pieces; do not build the three specified-but-
unbuilt hull families and do not promote the pack wholesale.

Require reproducible source, real materials/LOD/collision, bounded draw/residency cost, exact route
placement, and whole-asset G1/G2/G4 KEEP. Run focused tests,
`npm run check:graphics:asset-receipts`, and `npm run check:baseline`; obtain SPEC then QUALITY, publish
one atomic unit, and stop.
```

### 6.7 PQ-045 five live VFX recipes

```text
Implement only `PQ-045.vfx-recipes` after the six-event causal chain is published and done.

Owned production path: src/render/vfx.js, plus the smallest exact focused test/check path claimed after
fresh inspection. Port only these five recipes into the current live pooled presentation owner:
impact_concussion, destruction_light, massline_latch, massline_tension, massline_release. Reuse current
pools and _flashLight(). Do not ship src/vfxnext code or its LightPool. Reject speed_extreme because
velocityLanguage.js already owns exceptional-speed language.

Each recipe must present a real causal event from the chain, remain pooled/bounded, clean up exactly,
respect reduced motion/flash and visibility, and preserve current defaults/performance. Run focused
tests, `npm run check:presentation`, and `npm run check:baseline`; obtain SPEC then QUALITY, publish the
exact unit, and stop.
```

### 6.8 PQ-045 five-minute Browser/Electron gate

```text
Run only `PQ-045.five-minute-h1` after causal-chain, npc-identity, prop-promotion, wreck-dressing, and
vfx-recipes are all published and done.

Use a clean pinned candidate. Reserve browser-gpu and validation-broker. Do not change production to
make evidence pass. Run the existing Browser then Electron five-minute manifests exactly once each at
fixed seed 47 over 18,000 ticks and the four-pocket sequence. Preserve the candidate/source digest,
one-use claim ledgers, cleanup, accessibility, and ordinary-route behavior. Any failure is evidence;
repair through a separate smallest upstream production unit rather than relaunching unchanged.

Write only the declared evidence/receipt paths. Run `npm run check:ceres:five-minute`, obtain
independent evidence review, publish the bound evidence if it passes, and stop. Do not self-grant the
human verdict.
```

### 6.9 Human five-minute Ceres verdict

This is not an agent task. After §6.8 passes, give a named human reviewer the exact candidate and
evidence. The human must record timestamp, KEEP or REVISE, and whether the longest interval with no
visible activity reads as an intentional brief void. Only that verdict unlocks R8 and sector
propagation.

## 7. Copy-ready salvage prompts for unfinished visual candidates

These are independent salvage/reject tasks. They do not outrank the queue. Run them only after an
exact packet or user direction grants their path set.

### 7.1 Receiver facility Phase A

```text
Take over only the unpublished PQ-019 receiver-facility Phase A candidate currently present in the
primary SpaceFace checkout. Start from current HEAD and read the complete material-truth preflight,
build report, validation bindings, baseline/candidate images, current builder/render/promoter scripts,
and whole-asset review. Do not touch canonical base/refinery blends, canonical source/parts/release
GLBs, manifests, world bindings, pilots, packages, NOW, or runtime.

The existing candidate is REVISE for form, material response, and role clarity. Rebuild geometry first:
the lawful catcher must read as an open capture mouth, rooted jaws/load path, and partial impound; the
covert fence must read as an asymmetric shielded handoff bay, cassette, and process side. Replace the
dominant box/loft grammar with explicit panel shells, formed channels, folded plates, open recesses,
clevis/yoke mechanisms, and supported vessels. Keep exact IDs, roots, seven socket transforms,
collision envelope, AABB/visual centers, +X approach, three LODs, and five material roles.

Preserve deterministic UV snapping and prove two fresh GLB builds byte-identical. Render clear whole-
asset baseline/candidate clay, surface, grazing, material-ID, emission-off, LOD, close/default/far, and
all-angle views. Retake any obscured view. Require independent original-resolution G1/G2/G4 KEEP.
If KEEP cannot be earned in this bounded pass, retain the evidence and explicitly REVISE or discard;
do not promote. Commit/push only the exact Phase A candidate paths after review, then stop. Phase B
canonical promotion and Phase C release/runtime remain separate tasks.
```

### 7.2 Station Ledger worktree

```text
Audit and either integrate or discard only C:\sf-agents\station-ledger-a-list.
Diff its two files against current master; do not merge the worktree wholesale. Reproduce the current
Ledger problem first. Keep only changes that enforce mutually exclusive list/detail states, remove the
header collision, bound readable width, preserve keyboard/controller/focus/accessibility behavior, and
work at desktop plus compact sizes. Rebase the smallest source/test patch onto current master, run the
focused host/A2/accessibility/UI performance checks, capture matched clear screenshots, obtain UX
review, commit/push exact files if approved, and stop. Otherwise record DROP with the useful findings.
```

### 7.3 Sector-law UI worktree

```text
Audit and either reduce/integrate or discard only C:\sf-agents\sector-law-ui-a-list.
The 1,157-line diff is not presumed good. Characterize the current player problem, compare the two
dirty files against current master, and rebuild the smallest production change that improves authority,
heat/status readability, responsive hierarchy, focus, and reduced-motion/accessibility behavior. A
browser checker must remain proportionate and behavior-based; do not accept a thousand-line harness as
the product outcome. Capture clear matched views, run focused UI checks, obtain independent UX review,
commit/push only an approved exact slice, and stop; otherwise DROP the prototype.
```

### 7.4 Shield/VFX R3 worktree

```text
Audit and either reconstruct or discard only C:\sf-agents\shield-r3-integration.
Do not merge twelve stale-base files wholesale. Re-read current renderer, shipKit, VFX, cue, and
performance owners. First isolate the smallest player-visible shield-field outcome and reproduce its
current defect. Re-derive the minimal patch and focused lifecycle/performance proof on current master.
Any telemetry golden change requires field-level proof that expected motion changed for the intended
reason; never re-record to pass. Capture matched clear normal-camera evidence including dense,
reduced-flash, cleanup, and context/reload cases; obtain independent motion/visual review. Publish one
approved exact slice and stop, or record DROP.
```

### 7.5 Bespoke faction ships worktree

```text
Audit and either reconstruct or discard only C:\sf-agents\bespoke-faction-a-list.
Compare the six builder-file diffs against current master and the external reference packet at
C:\Users\93rob\.codex\delegations\spaceface-visual-a-list-20260809\artifacts\reference-atlas\ships\live-bespoke-faction-fleet-v1.
Do not treat generated concepts as exact topology. For each ship, require distinct faction/role
silhouette, constructed load paths, material hierarchy, readable close/default/far presentation,
damage continuity, performance, and no gameplay identity drift. Produce unobscured all-angle matched
screenshots and independent review. Integrate only ships that earn KEEP; cut or leave the others.
Commit/push the exact accepted family and stop. No endless fixed-iteration quota substitutes for KEEP.
```

### 7.6 External reference-atlas preservation

```text
Inventory only the external SpaceFace reference atlas at
C:\Users\93rob\.codex\delegations\spaceface-visual-a-list-20260809\artifacts\reference-atlas.
Do not commit all 470 MB. Verify each packet's provenance and selected/rejected status, identify which
current admitted assets or UI/VFX packets actually consume it, and propose the smallest tracked
selection needed to prevent loss. Mark reference-only clearly; generated images must never count as
runtime completion or visual acceptance. Do not invent the missing iconography packet. Produce a
compact manifest and preservation proposal for review, then stop without runtime edits.
```

## 8. Other claim-ready work visible at this snapshot

`node scripts/program-dispatch.mjs --ready` returned these units at `be07fc47`. This list is a snapshot,
not a standing claim; rerun the dispatcher and NOW collision check before assigning any of them.

| Unit | Type | Immediate meaning |
|---|---|---|
| `PQ-022.refinery-reauthor-h1` | Evidence capture | Capture only the already revised refinery in Browser and Electron. |
| `PQ-022.billboard-buoy-reauthor-h1` | Evidence capture | Capture only the revised billboard and buoy. |
| `PQ-038.native-acceptance` | Performance acceptance | Large, deliberately partial PERF-04 native matrix; must fail closed rather than consume a false terminal claim. |
| `PQ-041.native-acceptance` | Package/native acceptance | Build and run one clean exact Electron candidate with paired Browser/Electron ledgers. |
| `PQ-018.cathedral-reauthor` | Production art | Rebuild the Cathedral's dominant hull/rupture story while preserving exact identity and fly-through. |
| `PQ-019.receiver-facility-reauthor` | Production art | Canonical catcher/fence implementation, but the existing Phase A candidate is still REVISE and must not be promoted. |
| `PQ-040.native-acceptance` | Performance acceptance | One clean paired Browser/Electron dirty-range run. |
| `PQ-045.tender-client-materialization` | Production gameplay | The first remaining Recovery Plan unit; detailed in §6.1. |

Do not launch a headed/native acceptance task while the candidate is dirty or while a relevant GPU,
package, Electron, or validation mutex is occupied. A harness/status-only unit is not a substitute for
the production outcomes the user asked to finish.

## 9. What “finished” means from here

A task is complete only when all of the following are true:

1. one named player/runtime outcome is implemented through the current owner;
2. the exact owned files are reviewed, committed, and pushed;
3. focused proof and the packet's required route/evidence gates are truthful;
4. program state points to the exact commit/receipt without claiming unrelated residual work;
5. no owned candidate remains stranded only in a dirty checkout or task transcript;
6. the agent stops after that unit and returns the exact next dependency, rather than silently starting
   another multi-day campaign.

Reference images, donor packs, source candidates, checks, harnesses, and screenshots can support a
unit. None of them alone means the game now looks or plays better.

## 10. How to hand this to ChatGPT or a lower-cost agent

Give it this file plus the current versions of:

- `CANONICAL_BUILD_MAP.md`;
- `design/program/roadmap/program-queue.json`;
- `design/program/roadmap/active/PQ-045.md`;
- `design/program/roadmap/active/PHYSICS_AS_SPECTACLE_PROGRAM.md`;
- `design/vision/GAME_DIRECTION_EXPANSION.md`.

Ask it to produce prompts only from current dispatch units and the exact unfinished-candidate sections
above. It should not infer status from task length, screenshots, donor counts, or PR prose. The first
default production prompt is §6.1 unless the live dispatcher or an exact collision says otherwise.
