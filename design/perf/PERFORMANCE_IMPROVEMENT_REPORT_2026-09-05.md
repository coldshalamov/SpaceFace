<!-- LIFETIME: DATED REVIEW + EXECUTION GUIDE — research and proposed work packets, not queue admission.
     Reuse design/PERF_OPTION_SPACE.md identities and the admitted PQ-129 campaign.
     This document changes no runtime defaults, physics contracts, queue status, or performance verdicts. -->

# Performance improvement report — 2026-09-05

## Integrated-graphics optimization and agentic execution guide

**Research baseline:** `coldshalamov/SpaceFace` at `4cd6d50f8402082526e6660eddb160fb4e33dfdf`, the commit containing the original report. **Research date:** 2026-09-05. **Deliverable:** an expanded, executable optimization plan, not a claim that the proposed improvements have been implemented or benchmarked.

This edition reorganizes the original six huge, 29 medium, and 40 small findings into a measurement protocol, dependency-ordered work packets, correctness contracts, and a complete 75-item migration ledger. The original wording remains available in the [immutable initial report][R00]. Its findings are retained; its confidence labels, suggested ordering, and unmeasured speedup implications are not treated as experimental results.

**No new hardware benchmarks were executed for this expansion.** Historical measurements below belong to the cited repository documents or code comments. New implementation ideas are hypotheses until a matched player-route experiment accepts them. The original author's claimed percentage of repository coverage is not independently certified here.

### Read this first

1. **Reuse the existing performance machinery.** The repo already has asynchronous GPU timers, runtime witnesses, presentation snapshots, culling bands, asset admission, instancing, dirty uploads, and an admitted hitch campaign. Do not spend another campaign building their replacements.
2. **Find the current bottleneck on the actual target machine.** Prior Intel measurements name different owners at different commits and in different scenarios. A September source review cannot establish that DPR, LOD, bloom, or physics is currently the largest bill.
3. **Optimize the existing picture and behavior first.** Lower resolution, fewer effects, reduced shadows, simpler canopies, slower combat, and different solver settings are not interchangeable with equivalent-work optimization.
4. **Deliver one measured runtime improvement per accepted implementation packet.** More detectors, documents, tests, or green source checks alone are not a smoother game.

### Contents

- [1. Authority, evidence, and corrections](#1-authority-evidence-and-corrections)
- [2. Targets and acceptance rules](#2-targets-and-acceptance-rules)
- [3. Measurement protocol](#3-measurement-protocol)
- [4. Agent execution and handoff](#4-agent-execution-and-handoff)
- [5. Dependency-ordered work packets](#5-dependency-ordered-work-packets)
- [6. Regression matrix and release closure](#6-regression-matrix-and-release-closure)
- [7. Complete original-finding migration ledger](#7-complete-original-finding-migration-ledger)
- [8. Repository evidence and primary research](#8-repository-evidence-and-primary-research)

---

## 1. Authority, evidence, and corrections

### 1.1 Fit this plan into the existing repo

Read root `AGENTS.md`, the nearest directory instructions, and the live implementation before editing. The performance authority chain is:

`CANONICAL_BUILD_MAP.md` → `design/PERF_OPTION_SPACE.md` → `design/program/PERF_HITCH_CAMPAIGN.md` / `PQ-129` → the particular admitted leaf.

`design/PERF_BUDGET.md` supplies the frame and same-picture contract. This report supplies research and execution detail, **not a second queue**. Packet labels `P00`–`P17` below are local document references, not new PQ identities. Inspect current dispatch and ownership before claiming implementation. Reuse an existing reserved identity; route a genuinely uncovered outcome through the existing sweep/admission mechanism. Do not copy changing queue status into this dated report. [R01–R05]

The live game uses Three.js browser/Electron presentation and a fixed-step simulation. `src/core/loop.js` is a compatibility adapter composing `SimulationRunner` and `PresentationRunner`, not an invitation to build a second loop. Root instructions identify `flightV3.js`, `tacticalAI.js`, and the Rapier dynamic authority as live owners; legacy flight/AI implementations are not optimization targets merely because their filenames are familiar. [R01, R07]

`index.html` maps `three` and Rapier to checked-in vendor files. `package.json` uses the existing server/Electron/bundle tooling, not a presumed new Vite application. Record the actual runtime `THREE.REVISION`, Rapier version or vendor hashes, browser/Electron version, and lockfile before using current documentation. A comment mentioning r160 is not proof that the current vendor bundle is r160. API examples from the web require a version/capability check. [R08, R09]

### 1.2 Evidence classes

Every packet receipt must classify its claims:

| Label | Meaning | What it permits |
|---|---|---|
| **V — source verified** | The named path/symbol was inspected at the pinned commit. | A grounded implementation hypothesis; not a speedup claim. |
| **H — historical measurement** | An existing repo receipt or code comment reports an experiment. | Reuse its detector and failure knowledge; reproduce before asserting current performance. |
| **I — inherited finding** | Retained from the initial report, without independent re-reading of every cited implementation span. | Locate and revalidate the current symbol before editing. |
| **P — proposal** | Engineering deduction or proposed implementation/test design. | An experiment with explicit acceptance and rejection conditions. |

Line numbers in the original inventory are historical locators. They already drift within related files: the inspected SG-02 sleep setting is around lines 870–875, rather than the original report's 903–906. Use symbols and current code, not blind line-number surgery.

### 1.3 What the direct inspection establishes

| Area | Evidence at the research baseline | Consequence |
|---|---|---|
| Map alternatives | `_updateRailSections` calls `_routeAlternativesHtml`; that method calls `world.computeRoute` for both `fuel` and `hops` before comparing generated HTML. `src/ui/galaxyMap.js`, approximately 7730–7840. **V** | Cache planner results and retained presentation separately. Preserve the shipped planner. |
| Tactical AI | `gatherCohorts` and `gatherRecipeSquads` construct maps and member arrays by walking `entityList`; choreography builds a new `Set`; `stampFodder` invokes `director.inspect`. `src/systems/tacticalAI.js`, approximately 354–503. **V** | Separate stable membership and runtime scalars from inspection snapshots. |
| Combat phases | `prePhysics` and `postPhysics` both synchronize combatant bounds, with physics and attachment work between them. `src/combat/kernel.js`, approximately 111–140. **V** | These are not automatically duplicate computations. Post-step positions can differ. |
| Physics sleep | `_createRecord` explicitly disables sleep because save/reload rebuilds bodies from authoritative pose/velocity and sleeping is hidden solver state. **V** | Sleep is a save/replay contract problem, not a one-line toggle. |
| Existing physics reuse | `_createRecord` already reuses pooled ghost projectile bodies under a shape/mass key. **V** | Do not propose projectile pooling as wholly absent or generalize its contact-free equivalence to colliding bodies. |
| Batching | Renderer leaves `_opaqueBatchEnabled` false. Its comment reports an Intel experiment where disabling per-frame repacking reduced `bloomScene` p95 from 114.5 ms to 11.0 ms despite more draws. **V/H** | Fewer draw calls are not an acceptance criterion. A retained-slot design must address the rejected design's upload/repack costs. |
| Opaque ordering | Renderer currently installs `setOpaqueSort(() => 0)`. **V** | Coarse depth/material ordering is a possible controlled experiment, not an assumed free improvement. |
| GPU timers | `gpuTimers.js` already has capability detection, bounded pending queries, origin frame/tick IDs, terminal outcomes, and delayed query machinery. Its small summary ring is not a long-run p99 distribution. **V** | Extend existing raw evidence only where a demonstrated gap prevents attribution. Do not write another timer subsystem. |
| Bloom | `bloom.js` describes a full-resolution HDR scene, reduced-resolution downsample pyramid, and shared final composite. Its contract retains canonical tone mapping/encoding even with bloom neutralized. **V** | Do not reintroduce an upsample target or bypass color management as an alleged bloom-off optimization. |
| Camera/table cost | `PERF_TABLE_ANALYSIS.md` records a historical sample with 3 glass, 7 runway, 317 beyond, 10 submitted, and 16 resident; later historical timing names simulation as the larger owner. **H** | Do not optimize a hypothetical visible far fleet when those entities are already culled. |

Sources: [R06–R15]. These observations establish where to investigate; none proves today's frame rate on the user's machine.

### 1.4 Corrections to the original recommendations

**DPR is a product lever, not the default first optimization.** Halving linear render dimensions quarters pixel count, but does not imply four times the frame rate. CPU work, fixed passes, synchronization, and presentation remain. Lowering `pixelRatioCap` changes sampling quality. Keep it in the separately authorized preset packet, not the same-picture baseline. An integrated GPU label also does not imply a weak CPU or a universal performance tier. [R02, S01, S17]

**Procedural ship LOD is conditional on visible procedural cost.** Determine how many procedural roots actually draw, their projected sizes, and whether authored assets are failing over. Far off-table entities should remain unsubmitted, not gain new LOD meshes. The historical tabletop census makes this distinction especially important. [R06, R15]

**Cache validity is stronger than a convenient key.** Destination plus discovered-sector count is insufficient: equally sized discovered sets can differ, route weights can change, and the origin can move. Determine the actual dependency graph of the shipped planner, then version those inputs. Never silently tolerate stale route legality or hostility with an arbitrary TTL.

**Do not reduce solver iterations because a clamp might hide the error.** A changed solver is a changed numerical system. Repeatability under the new settings is not equivalence to the old results. Sleeping also changes internal solver state and reconstruction behavior. Separate wrapper/allocation optimization, selective-sleep research, and physics-model changes. [R13, S12, S13]

**Do not remove the second combat bounds synchronization without proof.** Pre-physics and post-physics bounds answer different temporal questions. A dirty/version optimization must represent pose, shape, scale, attachment, damage, and teleport changes at the correct phase. [R12]

**Do not replace immediate pre-load rollback state with the last autosave.** Those snapshots can contain different unsaved progress. Reduce duplicate encoding/copying while preserving the exact rollback boundary.

**Do not call `FrontSide` a universal free raster win.** Transparent double-sided materials can use two passes in Three.js; `forceSinglePass` can be appropriate for some flat effects. Neither that nor culling back faces is automatically equivalent for ribbons, shells, tilted geometry, or camera transitions. Verify the actual material and vendor implementation. [S06]

**Do not infer forced layout from selector counts alone.** DOM queries consume CPU, but forced reflow is specifically about layout-dependent reads after invalidation. A transformed filtered layer may or may not repaint on a particular compositor path. Use the trace and paint evidence before prescribing a CSS rewrite. [S09, S10]

**Do not sum phase p95s or confuse submit time with GPU time.** CPU and GPU work overlap; high CPU time around a renderer call may include driver backpressure. Delayed GPU queries must be joined to their original frame. [S02, S03]

**Do not inherit the original “only remaining way” claim about Workers.** A Worker relocates work and adds transport/scheduling costs; it does not remove that work or guarantee spare CPU capacity. Existing representation, cadence, and locality problems can remain the dominant opportunity.

---

## 2. Targets and acceptance rules

### 2.1 Preserve the product contract

Keep default bloom, shadow behavior, particles, render scale, pixel-ratio cap, authored near detail, and on-screen population unchanged during same-picture comparisons. Input, flight, weapons, collisions, and required physics remain at the authoritative 60 Hz step. Browser and Electron continue to use one game and asset path. Do not modify golden expectations to make an optimization pass. [R01–R04]

There are three implementation classes:

| Class | Examples | Required approval/evidence |
|---|---|---|
| **Equivalent work** | Remove repeated HTML construction, reuse immutable indexes, avoid unchanged uploads, share truly immutable material resources. | Behavioral tests, matched timing, visual verification when presentation is touched. |
| **Perceptually equivalent representation** | Approved projected-pixel detail suppression, alternate geometry organization, shader/pass fusion. | Near-view contract plus temporal visual review, relevant pixel comparisons, unchanged gameplay, and performance evidence. Do not claim bit-identical output unless measured. |
| **Product/physics change** | Lower DPR, fewer lights, smaller particles, lower shadow resolution, slower authoritative AI, solver-iteration reduction. | Separate explicit decision and baseline. Never disguise it as a same-picture win. |

### 2.2 Quantitative targets

`PERF_BUDGET.md` states the existing 60 fps / 16.7 ms desktop target and 30 fps / 33.3 ms low-end floor. It allocates planning budgets of 5 ms simulation, 7 ms render, 2.5 ms VFX, 1.2 ms UI, and 1 ms headroom. Preserve that authority; do not reinterpret CPU submission timers as actual GPU execution. [R02]

For implementation, report both **sim cost per fixed tick** and **aggregate sim cost per displayed frame**. A 30 fps render interval normally contains about two 60 Hz simulation steps; comparing that aggregate to a one-tick budget is misleading. Count catch-up steps and shed backlog explicitly.

The following are **proposed measurement gates**, to be calibrated and recorded before a packet's A/B, not new silently imposed global budgets:

- Meet the selected device's target on the defined player scenarios; report p50, p95, p99, worst frame, and missed-target rate rather than average FPS alone.
- No persistent loss of simulation time under the agreed normal and busy workloads. Any backlog shedding is visible in the receipt, not used to manufacture smoothness by slowing the game.
- No new unexplained >100 ms playable-frame stall. Track >50 ms and >100 ms event counts separately from the target-specific pacing metric.
- No repeatable regression outside measurement noise in an untargeted owner, input responsiveness, startup/Continue, first combat, or memory retention.
- After warm-up, repeated travel/customization/menu cycles reach a bounded memory plateau rather than a positive retained-growth trend.

**The 32 ms trap:** retain the repo's historical `>32 ms` hitch metric for comparability, but do not describe a deliberately paced 33.3 ms presentation as stuttering solely because every frame crosses that threshold. Add selected-target misses and excess time above target; distinguish work duration from delivered-frame interval. Likewise, a Long Animation Frames observer is useful for larger stalls, but its 50 ms threshold cannot see every missed 16.7 or 33.3 ms deadline. [S11]

No universal draw-call, triangle, or material ceiling is invented here. Those counts are explanatory counters. The player receives frames, not a draw-call spreadsheet.

### 2.3 Keep / reject / inconclusive

Before changing code, name one primary metric and its practical improvement threshold. Derive the noise envelope from repeated unchanged runs. A small apparent win within that envelope is **inconclusive**, not accepted. A large change in a known expensive operation still needs the end-to-end player-route gate.

For a vsync-limited route, unchanged FPS can coexist with a useful measured reduction in work, memory, or thermal load. State that result accurately; demonstrate the extra headroom in a fixed, legal stress case without changing the picture or population between A and B.

Reject when the picture, behavior, replay, save integrity, or liveness contract fails—even if frame timing improves. Reject when the hitch merely moves into loading, first shot, entry, or restore. Do not average away a severe regression in one scenario with wins elsewhere.

---

## 3. Measurement protocol

### 3.1 Use existing entry points first

Start in a clean, identified checkout, without resetting unrelated work:

```sh
git status --short
git rev-parse HEAD
node --version
npm run check:baseline
node scripts/program-dispatch.mjs --id PQ-129
npm run probe:runtime-witness
```

Read `.devshots/runtime-witness/report.md` and the probe's raw output. Inspect `scripts/probe-runtime-witness.mjs` and relevant package scripts before supplying extra flags. Historical receipts use `SPACEFACE_WITNESS_MS=30000 ... --continue`; verify that interface still exists, and use a dedicated test save/profile, not the only copy of a player's save. Environment-variable syntax differs between shells.

Discover the current specialized scripts instead of inventing command names:

```sh
node --input-type=module -e "import fs from 'node:fs'; const p=JSON.parse(fs.readFileSync('package.json','utf8')); for(const [k,v] of Object.entries(p.scripts||{})) if(/perf|hitch|witness|playable|sim|sg02|map|asset.*dispos|audio/i.test(k)) console.log(k+' => '+v)"
```

Use `check:perf`, `check:hitch-budget`, and the existing specialized probes according to their actual current definitions. A headless/software-rendered check is a structural or regression check, **not certification of an Intel GPU**. Do not relabel SwiftShader as integrated hardware. The existing campaign explicitly distinguishes these routes. [R03, R09]

### 3.2 Hardware and environment fingerprint

Record for every run: commit and dirty diff; seed/input tape/save fixture; scenario and sample interval; OS; CPU; physical GPU and active browser renderer/ANGLE backend; driver; browser/Electron; vendor-library versions/hashes; CSS viewport; drawing-buffer dimensions; OS display scale and DPR; refresh rate; render scale; all graphics settings; audio enabled state; window visibility/focus/occlusion; AC/battery and power mode; warm/cold asset state; and competing workloads.

First reproduce on the actual integrated machine implicated by the player's symptom. Then use at least one other available graphics architecture as a regression lane. Do not invent a supported minimum SKU or claim support for an unavailable device. A strong integrated GPU, older Intel hardware, and a software rasterizer are different populations.

Serialize GPU measurements. Agents may analyze or implement independent files in parallel, but do not run Blender, asset conversion, multiple game probes, and several browser instances on the benchmark machine simultaneously. Interleave A/B runs to reduce thermal and background drift. Include a sustained run: a cold laptop's first 20 seconds are not its long-session performance.

### 3.3 Scenario manifest

Reuse existing fixtures where possible. Add a missing stimulus to the current harness rather than a competing benchmark framework. Each scenario records the real action path, not a synthetic replacement renderer.

| Scenario | Required stimulus and invariant | Owners exposed |
|---|---|---|
| Opening | New Game to first visibly moving, controllable ship; defaults unchanged. | Imports, compose, compile, upload, readiness. |
| Continue | Load a dedicated representative save; fly and fire immediately after readiness. | Decode, migrations, reconstruction, delayed admission. |
| Ordinary flight | Fixed input tape through the existing sector with the normal camera. | Steady sim, submit, background, HUD. |
| Busy combat | Fixed legal population and weapon sequence including first and repeated effects. | Combat, physics, AI, materials, VFX overdraw. |
| Tether/mining | Attach, tension, release, drag through contacts, mine/deplete, change target. | Massline, bounds, event cadence, allocations. |
| Travel | Approach, high-speed entry, turn back, revisit; include rebasing where supported. | Runway/residency, first-use, dispose/recreate, late jobs. |
| Map | LOCAL contacts animated; alternatives open; change origin/destination/cost/knowledge and plot/abort. | Planner cache validity, retained DOM, interactions. |
| Dock/customization | Open/close market and preview, change fittings/paint/loadout, return to flight. | Material ownership, geometry cache, UI and asset lifecycle. |
| Save under load | Trigger the shipped save path during a representative busy interval. | Snapshot capture, serialization, storage, worker transfer. |
| Lifecycle/soak | Hide/minimize, restore, change viewport, repeat travel and previews; capability-gated context-loss test. | Extra rAF owners, timer reset, retained memory, resource recovery. |

Record glass/runway/beyond counts, visible subject identities, active combatants, submitted roots, resident roots, and active physics bodies. A faster run with fewer enemies, missing authored meshes, or an unpainted canvas is invalid.

### 3.4 Measurement channels

**Presentation interval:** consecutive delivered render samples, missed target intervals, long streaks, and input-to-simulation/presentation latency proxies. A changing sim clock alone does not prove a changing 3D frame.

**CPU:** fixed-step owners; render preparation; entity admission/compose; WebGL submission; UI scripting; browser style/layout/paint; audio control; save capture/encode; and GC. Preserve exclusive versus inclusive timing semantics. Do not add nested buckets twice.

**GPU:** reuse `src/render/gpuTimers.js`. Query asynchronously; collect later after availability; invalidate disjoint/context-loss samples; retain origin frame/tick IDs; bound pending capacity; never busy-wait or call `gl.finish()` to make a graph convenient. Do not nest incompatible elapsed queries. A missing timer result is unavailable data, not zero GPU cost. [R11, S02]

**Submission/resources:** accumulate the complete logical frame across all passes. Three's `renderer.info` can reset per render call, so verify the repo's aggregation before trusting draw totals. Track programs and resource counts, plus estimated bytes and upload ranges; resource counts alone are not memory-byte measurements. [S03]

**Browser compositor:** use a separate diagnostic trace for layout/paint/composite and a frame capture for draw/program/texture attribution. Capture tooling changes workload: do not mix screenshot readbacks, heap snapshots, or instrumented frame captures into the final timing window. Avoid synchronous GL inspection in the production hot path. [S01, S09]

**Allocation/retention:** use allocation sampling to identify constructors and snapshots; use before/after heap or resource snapshots outside the timing sample to identify retained owners. Inspect both JS-side decoded assets and GPU-side resources. Shared system-memory pressure matters on integrated hardware, but process memory, JS heap, estimated textures, and actual driver residency are not interchangeable. [S08, S17]

### 3.5 Baseline → candidate experiment

1. Freeze the base commit, fixture, viewport/settings, and selected primary metric. Verify liveness and authored-asset diagnostics.
2. Run unchanged repetitions to establish noise and warm-up behavior. As a practical starting point, use a brief existing witness for triage and multiple 60–120 second samples for acceptance; extend rare-event and thermal tests as needed.
3. Separate cold opening, warm steady play, first-use events, and sustained-session results. Do not delete the troublesome opening interval from a startup claim.
4. Implement one hypothesis, run focused correctness checks, and then compare matched A/B/A or interleaved ABBA runs. Use fresh processes or the same documented cache reset policy for both sides.
5. Export raw per-frame or event data through existing facilities. A 64-sample summary ring cannot establish a stable long-run p99; do not concatenate overlapping rolling windows as independent samples. Deduplicate by origin identity where applicable.
6. Compute per-run quantiles, event counts, and uncertainty across runs. Frames are temporally correlated; do not claim thousands of independent experiments from one flight. Block/run-level comparisons are preferable to naive frame-wise significance claims.
7. Check stills and motion separately using the same input/seed and relevant simulation times. Review silhouette, weapon tells, shadow attachment, halo width, background continuity, LOD transitions, and transparent ordering. Do not mask the very region the optimization changes.
8. Re-run the original baseline when a surprising result appears. Record kept, rejected, or inconclusive with the causal evidence, not just a favorable percent.

### 3.6 Bottleneck decision table

| Observation | Next investigation | Wrong inference to avoid |
|---|---|---|
| Fixed-step CPU dominates; GPU is short | AI membership, combat indexes, physics membrane, off-table authority. | Add more ship LOD or lower bloom. |
| Render-prep CPU grows with resident, not visible roots | Admission, retained slots, bounds/versioning, offstage work. | Lower textures globally. |
| GPU scene time scales strongly with drawing-buffer pixels | Overdraw, shading, RT bandwidth; preset experiment only in its own lane. | Claim DPR is equivalent quality. |
| Renderer call stalls while GPU workload is large | Driver backpressure/upload, GPU trace, batch data traffic. | Assume the renderer's JS is all the cost. |
| First-use spike only | Compose/compile/upload key and admission ordering. | Reduce steady AI rate. |
| Map open causes CPU spike without more 3D | Route planner, DOM rebuild, layout/paint. | Rewrite the renderer. |
| Periodic spikes match witness/report/save/audio cadence | Diagnostic construction, serialization, control automation, GC. | Blame Rapier from a coarse sim/present label. |
| Long-session decline with growth | Retainers, unbounded caches, decoded assets, previews, pending jobs. | Add another larger object pool. |
| Healthy internal timers but bad delivered pacing | Visibility, compositor, OS scheduling, cap/lifecycle, measurement overhead. | Relabel all unexplained time as GPU. |

---

## 4. Agent execution and handoff

### 4.1 One shared loop, not an expanding bureaucracy

`validated baseline → named owner → smallest legal change → focused tests → matched player-route A/B → picture/behavior gate → keep or revert → fresh census`

An investigation ends when it selects an implementation, rejects the candidate with a reason, or identifies the **specific missing measurement**. It does not end with another broad request to investigate performance.

Allow one bounded instrumentation repair when existing evidence is inadequate. State the missing observable and the implementation decision it unlocks. After repairing it, make that decision. Do not continue adding schema layers, validators, dashboards, or scenario languages without a demonstrated blocker.

If the machine cannot run a real hardware probe, produce the narrowly scoped patch and its executable correctness evidence, label hardware acceptance pending, and retain a reproducible command/fixture. Do not claim a performance win; do not repeatedly rebuild harnesses to conceal the lack of hardware. Do not merge a behavior-sensitive speculative change as performance-certified.

### 4.2 Ownership and parallelism

Use current repo ownership/claim conventions. Give each implementer a narrow file surface and one packet. Keep one integrator responsible for shared contracts and final measurements. UI, save, and audio work can proceed independently when they do not modify the same dispatcher or event contract. Renderer/bloom/precompile and physics/AI scheduling require coordinated ownership.

Do not create branches/worktrees or rewrite unrelated work merely to fit this guide; follow current repository conventions and the user's branch instructions. Re-read HEAD and the target file before writing. Every merged candidate is re-tested against the integrated head—wins measured on divergent parents are not additive evidence.

Run correctness jobs in parallel only when they do not interfere with shared profiles/ports/assets. GPU timing is serialized. Rebase or resolve semantic conflicts before accepting a receipt; a clean text merge does not prove cache invalidation or shader-key compatibility.

### 4.3 Required packet receipt

Keep raw artifacts in the existing probe output or a bounded local folder such as `.devshots/perf/<packet>/<commit>/<device>/`; do not commit giant traces unless repo policy requires it. Place only the concise durable result in the established campaign/leaf location.

```yaml
packet: P01                  # local guide reference, not a new queue identity
admitted_leaf: <existing PQ identity>
base_commit: <sha>
candidate_commit: <sha>
status: proposed | rejected | inconclusive | accepted
claim: <one sentence about the player symptom and causal owner>
evidence_class: V | H | I | P
owned_files: []
contract_preserved: <picture, behavior, save, replay, authority>
scenario: <fixture, seed, input, sample interval, graphics settings>
hardware: <complete fingerprint; software rendering explicitly identified>
primary_metric: <metric and predeclared practical threshold>
raw_evidence: <paths; actual executed commands and exit status>
before_after: <per-run distributions, not invented or overlapping summaries>
untargeted_regressions: <results or not run>
visual_temporal_review: <review result or not run>
rollback: <isolated commit/config reversal and cache cleanup consequences>
next_action: <one concrete next packet or stop>
```

`not run` is a valid factual state. It is not a pass. Never prepopulate a completed receipt from a plan.

### 4.4 Agent task template

> Read this report's packet and the admitted leaf, then inspect the named current implementation. Reuse the existing detector. State the precise redundant work and the invariant that permits its removal. Change only the owned surface. Test real production functions, including invalidation/lifecycle paths. Run a matched player-route comparison on the designated hardware, or explicitly leave that acceptance pending. Preserve defaults, visible subjects, authoritative tick behavior, save/reload, and golden expectations. Keep only the measured, contract-preserving result. Deliver the patch, actual commands/results, causal interpretation, and rollback. Do not replace implementation with more planning.

---

## 5. Dependency-ordered work packets

### Execution order

`P00` is the shared entry gate. After it, choose the packet matching the measured owner; the numbering is not permission to ignore the census.

- For ordinary-flight CPU pressure, prioritize `P02`/`P03`/`P04`; consider `P05` only with its stronger authority contract.
- For map-specific pressure, `P01` is a bounded first candidate, with `P11` for remaining browser work.
- For missing first-use smoothness, use `P09` before broad scene simplification.
- For a demonstrated visible-scene GPU/submit owner, choose `P06`–`P08`; `P10` handles retention/background/lifecycle interactions.
- `P12`/`P13` follow save or audio evidence. `P14` is a separately authorized product lane. `P15` requires a platform break-even experiment. `P16` closes integration. `P17` is only for residual measured micro-costs.

### P00 — Establish one trustworthy live baseline

**Depends on:** current dispatch/ownership. **Maps to:** existing measurement leaves `PQ-061`–`PQ-066`, their `PQ-129` executor, and the existing runtime witness. **Scope:** existing probes, `gpuTimers.js`, diagnostics/perf runtime only where deficient.

1. Read the existing hitch campaign and tabletop analysis before running anything; identify which statements are historical.
2. Fingerprint the checkout, graphics route, hardware, settings, and test save. Confirm the moving 3D canvas and expected subjects.
3. Run opening, normal flight, one busy scenario, and the symptom-specific scenario. Capture glass/runway/beyond counts and per-owner time.
4. Reconcile CPU/GPU clocks and frame IDs. Check timer terminal counts, missing samples, disjoint handling, counter resets, and diagnostic overhead.
5. Repair only a measurement hole that prevents selecting an owner. Existing timer origin fields and witness machinery should survive intact.
6. Write one census naming the primary owner, its scope, and the next smallest implementation packet. If the owner is external scheduling, fix the experiment before modifying game code.

**Accept:** comparable live evidence with enough attribution to select a change. **Reject/stop:** empty canvas, software renderer mistaken for hardware, changed settings/population, overlapping agents, or counter holes that invalidate the conclusion. **Not done:** adding a new universal profiler without selecting a runtime action.

### P01 — Retain galaxy-map route results and UI structure

**Depends on:** P00 map evidence. **Evidence:** V in `src/ui/galaxyMap.js`; I for adjacent map work. **Maps to:** relevant map/HUD catalog leaves; use the existing sweep for an uncovered planner-cache sub-outcome, not a duplicate planner.

1. Instrument calls to the actual `world.computeRoute` and route-alternative DOM construction across an unchanged LOCAL animation interval.
2. Read the planner and enumerate every input it consumes: origin, destination, objective, topology/knowledge, cost/risk/fuel rules, and any other real dependency. Do not add guessed dependencies as a new source of truth.
3. Derive a retained cache key from authoritative revisions. Separate planner inputs from display-only plotted-route selection and ETA changes. Cache failures/unreachable results only until their dependencies change.
4. Compute alternatives outside `_draw`, on activation or an invalidated data revision. Keep `world.computeRoute(dest, mode)` as the sole routing authority; preserve plot-versus-engage semantics.
5. Retain row nodes or cached HTML behind the same revisions. Cache mounted DOM references and invalidate them on unmount/rebuild. Do not replace expensive planning with expensive per-frame JSON-stringified keys.
6. Test origin change, destination change, equal-count but different discovered sets, changed edge costs, unreachable→reachable, route abort/replot, collapsed disclosure, close/reopen, and save/load. Add dependencies only when confirmed in the planner.
7. Verify live contacts remain animated and route controls remain keyboard/pointer accessible. Account for existing source-shape tests without weakening the semantic requirement that alternatives use the shipped planner.

**Accept:** unchanged animation frames trigger zero planner recomputations and zero structural alternative-row rebuilds; each relevant invalidation produces correct fresh results; map CPU/pacing improves outside noise. **Reject:** stale legality/cost, frozen contact animation, lost selection, or an independent route algorithm. **Rollback:** isolate cache/reconciliation changes and clear retained references on disposal.

### P02 — Make tactical membership persistent; remove inspect-shaped hot data

**Depends on:** P00 CPU attribution. **Evidence:** V in `tacticalAI.js`; I in its ports/directors. **Maps to:** allocation/cadence work under existing identities, with deterministic gates.

1. Locate the current `aiPorts.js`, director, and entity-index imports. Count membership rebuilds, roster sorts, `inspect()` calls, and allocated bytes per fixed tick.
2. Document what changes membership: spawn/despawn, death, squad/recipe changes, faction/role transitions, load/reset, and any in-place mutation in the actual implementation.
3. Maintain deterministic member lists by authoritative revision or existing entity-index lifecycle hooks. Preserve ordering and same-tick visibility. Batch changes at the same boundary as before; do not silently delay a new combatant by one tick.
4. Separate membership from changing target/plan state. A retained cohort still needs current target selection and alive status; preserving only membership does not preserve all behavior.
5. Expose the few runtime stamp scalars directly from the retained plan/director state. Keep `inspect()` as an on-demand diagnostic API. Remove duplicate stamping only after proving phase equivalence.
6. Reuse transient sets/arrays with defined lifetime. Clear obsolete records on load and removal; use generations if IDs can be reused. Do not retain dead entities through a cache.
7. Test heterogeneous squads, forced-player targets, first-non-null target selection, deaths during a tick, recipe mutation, empty groups, load/reset, and debug inspection. Compare decision/event traces as well as simulation hashes.

**Accept:** stable membership causes no roster reconstruction, diagnostic snapshots leave the runtime hot path, and AI CPU/allocation decreases without changed actions or timing. **Reject:** reordered tie breaks, delayed targeting, stale membership, or new unbounded indexes. **Do not** reduce authoritative think frequency in this packet.

### P03 — Combat/entity indexes with phase-correct bounds

**Depends on:** P00; coordinate with P02 if sharing index hooks. **Evidence:** V for combat phases; I for reverse lookup and typed-bucket findings. **Maps to:** hot-query/allocation outcomes and existing entity-index work.

1. Profile `sortedEntitiesForTick`, invalidation frequency, world-record reverse scans, mine/scanner/cruise type filters, and combat profile resolution.
2. Retain combatant/type-specific lists only where they beat the current list at actual population/churn. Preserve stable iteration/tie-break ordering. Do not replace a cheap 20-element scan with a maintenance subsystem without evidence.
3. Add a reverse world-record index only after deciding its true cardinality: one record can potentially have zero, one, or several live representatives. Match existing semantics rather than assuming a one-to-one map.
4. Version static combat-profile/shape data separately from pose. Keep pre- and post-physics bounds current; compute once per unchanged pose/shape revision, not once per arbitrary frame.
5. Preserve spawn/destroy during combat callbacks, attachment reconciliation, and mutation visibility. Stable compaction is required where array order is semantically observable; swap-remove is not universally legal.
6. Rebuild indexes atomically after load/reset and verify against a scan-based test oracle over randomized lifecycle sequences. Test movement, collision, teleport, shape/damage change, destruction, ID reuse, and compound bodies.
7. Consider cheap squared-distance gates only where finite numeric ranges and boundary comparisons preserve results. Do not broadly change math/RNG/sort behavior to satisfy a microbenchmark.

**Accept:** fewer scans/sorts/allocations and lower target CPU time, with exact query membership/order and correct phase bounds. **Reject:** stale collision bounds, changed damage ordering, mismatched reverse-index cardinality, or increased churn cost. Keep the general scan available for test verification, not as a second live authority.

### P04 — Optimize the physics membrane before changing physics

**Depends on:** P00 physics-owner evidence; deterministic baseline. **Evidence:** V for SG-02 creation/reuse; I for command and diagnostic allocations. **Maps to:** `PQ-106`-class allocation work and existing physics authority leaves; not automatic sleep admission.

1. Break the physics bill into entity synchronization, command construction, JS↔WASM calls, actual solver step, contact extraction, plane enforcement, attachment work, and diagnostics.
2. Trace exclusive pose ownership. Remove a redundant verification/read only if every legal external writer, teleport, load, rebase, and body rebuild invalidates the corresponding revision.
3. Retain/reset command records and scratch vectors under an explicit lifetime. Do not reuse an object that a deferred consumer or receipt still owns. Preserve how absent commands differ from zero commands.
4. Reuse contact/receipt working storage only after auditing ordering and consumer retention. Avoid repeated full-record diagnostics on the playable path; materialize rich reports on demand.
5. Preserve existing ghost-projectile pooling. Test reset of pose, velocity, enable state, CCD/material configuration, and identifiers before expanding any pool; contact-bearing bodies need a separate equivalence proof.
6. Audit unconditional wake-up writes and duplicate getters as information, but do not change sleep behavior in this packet. Capture output pose/velocity once at a valid phase if downstream consumers can share it safely.
7. Run short/long deterministic, save/reload, production combat, tether, release, collision, rebase, and repeated projectile reuse checks.

**Accept:** membrane/diagnostic overhead or allocation drops while the physics algorithm, stepping, command semantics, and replay results stay fixed. **Reject:** missing forces, reused mutable receipts, stale owner state, or altered contact order. **Rollback:** one isolated authority/membrane commit; no save-schema migration should be necessary.

### P05 — Selective sleep and off-table scheduling, with an influence contract

**Depends on:** P04 or evidence that it is not material; `PQ-066` equivalence admission. **Maps to:** `PQ-080`, `PQ-084`, related campaign table-cadence leaves. **This is a higher-risk packet; split AI cadence and Rapier sleep into separate implementation commits.**

1. Distinguish rendering visibility, AI scheduling, and physical participation. A culled enemy can still shoot, collide, send an event, affect the economy, or enter the table quickly. Off-screen is not permission to delete simulation.
2. Build an explicit wake/influence dependency set from current game rules: player, hostiles/combatants, projectiles, pending damage/events, contacts, manual springs/tethers, mission interactions, and approach reachability. Existing policy remains authoritative unless separately changed.
3. Express scheduling in deterministic ticks and stable IDs, not wall-clock time or frame rate. Preserve the integrated effect of any existing coarse economic/traffic update; a rate update is not equivalent when discrete thresholds, transactions, or RNG consumption differ.
4. For physical sleep, first choose how sleep/wake and other relevant solver state survive save/reload. The current reconstruction from poses is the reason sleep is disabled. Candidate choices require explicit serialization/reconstruction tests; do not assume a boolean sleep flag fully reproduces solver internals.
5. Audit every command and structural operation that must wake a body. A body with a manual spring or pending impulse is not idle just because its current velocity is small. Test new contacts, removed colliders/joints, force application, attachment break, and resumed control. [S12]
6. Test boundary oscillation, maximum approach speed, off-screen fighting, projectile crossing, long idle periods, load at several sleep ages, and deterministic repeat/reload across the actual supported runtimes. Parameter and insertion/removal order consistency matter to Rapier determinism. [S13]
7. Compare CPU saved against wake/re-entry bursts. A savings graph that ends before all sleeping objects become relevant is incomplete.

**Accept:** the specifically admitted equivalence/authority contract holds and both sustained work and re-entry tails improve. **Reject:** missed events, changed authoritative outcomes without approved contract change, a desynchronized load, or a thundering-herd wake hitch. **Solver iterations remain unchanged.** Tuning them belongs to a separately authorized physics-model experiment, not a fallback when sleep fails.

### P06 — Make submitted procedural ships cheaper, not imaginary far fleets

**Depends on:** P00 visible-root census; verify authored fallback status. **Maps to:** `PQ-053`, `PQ-108`, existing LOD/HLOD leaves. **Evidence:** I for procedural factory gap; H for tabletop limitations.

1. Count actual submitted authored/procedural ships by projected pixel width, submesh/material cost, and camera state. Inspect authored-load diagnostics; fix an asset-load failure before optimizing the fallback as the intended default.
2. Identify static hull-relative geometry versus animated guns, fans, damage parts, lights, canopies, selection/picking surfaces, and attachment markers. Preserve gameplay data and collision geometry independently of presentation LOD.
3. Merge compatible static hull-local pieces once per composition revision, not once per frame. Freeze only genuinely static local transforms. The ship's world transform still changes.
4. Use the existing projected-size policy and hysteresis for detail that is already submitted. For perspective, projected size depends on view-space depth; for orthographic views it depends on view span/zoom, not distance alone. Reuse the repo helper rather than introducing conflicting math.
5. Preserve player and close inspection/customization detail; retain silhouette, faction identity, weapon tells, and navigational cues. Classify removable detail semantically, not by arbitrary node-name substring alone.
6. Prebuild/cache only variants proven useful, with bounded ownership and invalidation for fittings, paint, damage, and composition. Do not retain every possible combinatorial ship indefinitely.
7. Review fixed-input motion at threshold crossings, zoom extremes, pitch/bank, rapid entry, shadow views, and mixed unique hulls. Verify missing authored content has not masqueraded as a lower LOD.

**Accept:** the measured visible procedural owner becomes cheaper; near views and gameplay remain intact; no popping or new first-use hitch. **Reject:** adding meshes to beyond-band entities, simplifying the hero by default, or spending a large pipeline rewrite on a population the census does not draw.

### P07 — Retained batching, immutable materials, and measured opaque ordering

**Depends on:** P00 submit/upload evidence; coordinate with P06/P09. **Maps to:** `PQ-052`, `PQ-076`, `PQ-106`, related submit leaves. **Evidence:** V/H for the explicitly disabled batch bridge.

1. Inventory draws by geometry/material/program and measure CPU preparation, changed bytes, GPU scene time, and driver stalls. Separate repeated geometry from unique hulls.
2. Prefer existing instancing for genuinely shared geometry/materials; use one-time hull-local merges for static unique structures when appropriate. Both retain correct bounds and instance→entity identity. [S04]
3. Do not simply re-enable `_opaqueBatchEnabled`. A new batch experiment must retain geometry/instance slots, avoid per-frame repacking, update only changed attributes, and account for capacity growth and deletion.
4. Retain spatial/semantic batch boundaries so culling and transparency do not degrade into one giant always-visible object. Evaluate the actual vendor's BatchedMesh culling/sorting behavior and capabilities. [S05]
5. Define material ownership: immutable shared role, per-instance attributes, or explicitly cloned mutable state. Damage, blink/emissive animation, recoloring, environment response, and customization must not leak across ships.
6. Compare unchanged opaque ordering with coarse depth/material buckets on the exact scene. Preserve explicit render order and transparent ordering. Keep only if sorting cost and state/overdraw tradeoffs improve end-to-end behavior; do not impose a universal sort recipe.
7. Test stable occupancy, high churn, diverse hulls, capacity boundaries, disposal, picking, shadow pass, and context restore. Track changed/uploaded bytes alongside draws.

**Accept:** frame tails or measured headroom improve without a worse upload/compile/memory bill. **Reject:** fewer draws but slower frames, per-frame full repacking, broken culling, mutable shared materials, or another unbounded batch cache. Retain the historical rejection so agents do not replay the same failed bridge.

### P08 — Reduce GPU work without reducing the intended effects

**Depends on:** P00 GPU/pass evidence. **Maps to:** existing VFX, shadow, present, and dirty-range leaves including `PQ-077`, `PQ-097`, `PQ-115`, `PQ-121`, `PQ-126`. **Coordinate renderer, VFX, bloom, and precompile ownership.**

1. Attribute the GPU owner: opaque scene, transparent coverage, shadow rendering, reduced-resolution bloom, final composite, or uploads. Do not infer bloom is expensive merely because the scene is named `bloomScene`.
2. For VFX, first eliminate invisible work: dead capacity outside active spans, unchanged field transforms, empty texture borders that can be safely trimmed, and off-glass cosmetic updates already eligible under existing relevance policy. Keep visible emission/coverage unchanged.
3. Use current partial-range buffer machinery. Update ranges are in attribute components, not bytes or instance count; bound and coalesce them, and compare against full updates when most data changes. Set usage before first upload where the vendor requires it. [S07]
4. Test `forceSinglePass` only on compatible flat transparent effects; test FrontSide only where winding and all allowed views prove equivalence. Do not apply either globally to shield volumes or trails. [S06]
5. Preserve shadow resolution and light coverage while auditing caster inclusion and dirty triggers. A moving caster/receiver, changed light, rebase, or relevant presentation transform can invalidate a cached shadow; a camera-only key may be insufficient.
6. Preserve light-pool/precompile key agreement. Zero intensity does not necessarily remove a light from a compiled loop, but changing the live light count can also trigger shader churn. Compare a defined stable variant strategy before considering a separately approved reduction in lights.
7. Audit the actual post graph and target lifetimes. The existing bloom path already avoids a separate upsample target. Reuse compatible attachments/targets where legal; do not attach/discard buffers still needed by a later pass. A bloom-only resolution change does not reduce full-resolution scene cost.
8. Preserve the canonical linear/HDR operations and exactly one output encoding. Pass fusion, target formats, and no-op paths must maintain tone mapping, exposure, toe, halo, and transparent composition; measure error in dark scenes and emissive combat. [R14, S18]

**Accept:** the identified GPU owner improves with stable near/motion captures and no runtime allocation churn. **Reject:** less visible smoke/light/shadow, altered color pipeline, shimmer, or missing effects. Lowering light counts, shadow dimensions, particle size, or canvas resolution moves the work to P14 rather than passing this packet.

### P09 — Remove first-use stalls through retained preparation and bounded admission

**Depends on:** P00 event attribution. **Maps to:** `PQ-054`, `PQ-072`–`PQ-075`, current hitch leaves. **Evidence:** H/I; inspect current implementations before assuming an old compose loophole still exists.

1. Identify the exact first-use event and owner: module evaluation, decode, ship composition, shader linking, texture upload, geometry upload, or publication. Include New Game, Continue, first enemy, first shot, sector entry, and customization.
2. Reuse the existing prepared-boundary/admission queues. Split genuinely splittable CPU composition work at semantic part boundaries; do not expose half-built gameplay-critical subjects or move a single unsplittable stall behind an `async` keyword.
3. Keep a bounded, deduplicated queue keyed by composition/asset revision. Prioritize visible and soon-visible subjects with fairness; cancel obsolete jobs on sector changes, removal, load/reset, and context generation changes.
4. Inspect shader program keys and actual readiness facilities. Where supported, asynchronous compilation requires the real lighting/material/target configuration; compiling the wrong variant is not warming the one used in play. Texture/target initialization is a separate first-use concern. [S03]
5. Do not replay the historically rejected dummy-prewarm experiment unchanged. First reduce unnecessary program permutations and share stable material roles, then warm only missing proven keys under the existing admission design.
6. Schedule preparation with a measured per-frame debt budget and backpressure. Doing work “after render” inside the same rAF callback still occupies that callback; a queued microtask also does not guarantee a paint. Verify an actual yield and measure where the work lands.
7. Publish only a complete, still-relevant generation. Handle load failure visibly through existing diagnostics, without declaring an invisible or fallback-filled scene ready. Bound queue age as well as slice duration so low-priority work cannot starve forever.
8. Compare end-to-end loading and first-play latency. Include cold-cache and warm-cache cases; retain the same expected subjects.

**Accept:** the named first-use stall disappears or materially shrinks without extending another critical interval or missing a ship/effect. **Reject:** a smoother sample obtained by delaying all enemies, unbounded prewarm, wrong program keys, or a loading screen that absorbs the entire stall.

### P10 — Bound residency, background work, and lifecycle cost

**Depends on:** P00 memory/lifecycle census; coordinate with P06/P09. **Maps to:** `PQ-058`, `PQ-068`–`PQ-071`, `PQ-079`, `PQ-086`, existing asset-disposal/lifecycle work.

1. Inventory ownership across source bytes, decoded geometry/images, compressed textures, GPU objects, prepared hulls, previews, instance pools, queued jobs, and event listeners. Distinguish borrowed shared resources from owned resources.
2. Reuse approach-seconds residency and glass/runway/beyond policy. Derive runway requirements from measured relative approach, camera transitions, preparation latency, and a recorded safety margin—not a fixed distant-space radius or current visibility alone.
3. Use bounded caches keyed by asset/composition revision with explicit leases/references. Release decoded source copies only when no rebuild/recovery path still depends on them. Removing an Object3D from a scene is not sufficient disposal of owned GPU resources. [S08]
4. Verify the existing KTX2/BasisU/meshopt path is actually used, including runtime fallback diagnostics, supported transcode format, mip availability, and peak worker/decode concurrency. Recommending compression that already exists is not a task. [S14]
5. For geometry cooking, use full relevant attribute equivalence when indexing; position-only welding can destroy hard normals, UV seams, and material boundaries. Compare vertex-cache/fetch changes and optional overdraw optimization on target hardware; do not assume one ordering is optimal everywhere. [S15]
6. Audit sky/background ownership separately from world simulation. Check clipping/bounds, double updates, duplicate rAF owners, needless texture/geometry regeneration, transparency coverage, and disposal across region transitions. Preserve designed sky variation and parallax; do not replace the background with an empty clear color.
7. Verify hidden/minimized behavior across game presentation, map animations, previews, loading art, audio, and workers. Reuse the lifecycle coordinator. On restore, reset timing origins as required and republish valid resources without a backlog explosion.
8. Run repeated sector/preview/customization cycles, then a sustained soak and context-loss/restore test where supported. Compare stable resource counts and retained bytes after comparable cleanup opportunities; do not force GC inside production timing.

**Accept:** bounded retention and lower measured invisible work, with reliable entry, restore, and resource sharing. **Reject:** use-after-dispose, broken borrowed assets, reload/download storms, blank background, late-entry pop, or a cache that grows with every unique loadout.

### P11 — Retained HUD/screens and trace-led compositor optimization

**Depends on:** P00 UI attribution; P01 handles planner recomputation. **Maps to:** `PQ-088`, `PQ-102`, `PQ-117`, related HUD leaves. **Evidence:** I for detailed market/bar/HUD findings.

1. Reuse existing `setText`/style/class dirty guards, keyed roster reconciliation, `hudSkipUnchanged`, and DOM instrumentation before adding new abstractions.
2. Separate structural changes from numeric updates. Retain market/bar/mission rows, event handlers, DOM references, and map rail structures; update only changed fields. Unmount/rebuild invalidates cached nodes.
3. Preserve existing cadence for low-frequency labels while keeping aiming, reticle motion, immediate input feedback, and safety/combat cues responsive. Do not blanket-throttle the HUD to 5 Hz.
4. Batch layout reads before writes. Cache viewport/element rectangles until relevant resize, scroll, layout, or transform changes. A cached rectangle invalidated only on window resize can still become stale.
5. Use browser traces to identify real paint-heavy effects. Try a static glow with opacity animation for an animated box-shadow only when it preserves the design; compare composite layer count/memory and paint area. Transform/opacity is a starting hypothesis, not a blanket ban on blur. [S09, S10]
6. Avoid broad per-frame selector queries, redundant dataset writes, DOM lookups for stable toasts, and full JSON signatures where a revision exists. Do not remove accessibility announcements, focus management, keyboard controls, or disclosure behavior.
7. Test open/close, screen swaps, resize/DPR, scrolling, keyboard focus, contact churn, pointer dragging, and return to flight. Capture UI input latency and browser rendering cost separately from the WebGL bill.

**Accept:** unchanged screens cease structural writes, layout/paint or UI CPU improves, and immediate feedback/accessibility remain intact. **Reject:** stale DOM references, lost listeners, layout jitter, hidden expensive layers still running, or a bland redesign substituted for optimization.

### P12 — Preserve save semantics while removing duplicate serialization

**Depends on:** P00 save/Continue evidence. **Maps to:** `PQ-087`, boot/cache leaves `PQ-103`/`PQ-104`. **Evidence:** I; inspect the current `saveSystem.js` and worker paths by symbol.

1. Trace snapshot capture, validation, encoding, checksum, transfer, persistence, menu listing, load/migration, and rollback separately. The existing worker-encoded autosave is not proof that main-thread snapshot capture is free.
2. Identify byte-identical duplicate encodings and copies. Reuse the exact serialized representation for checksum/storage where the existing format permits; preserve ordering, validation, migration, and corruption detection.
3. Preserve a coherent snapshot boundary. If encoding spans ticks, use the existing immutable snapshot/version mechanism or establish one; do not serialize a mixture of states while simulation mutates them.
4. Preserve exact pre-load rollback state, including unsaved changes. Optimize its capture/copy representation without substituting an older autosave.
5. Use a trusted bounded slot metadata index only with a defined invalidation/checksum/version contract and a correct corruption fallback. Do not skip validation of untrusted or stale storage to make the menu faster.
6. For transferable buffers, preserve ownership: transfer detaches the sender's buffer. Use a safe buffer lifecycle and measure capture+encode+transfer+storage+ack, not worker execution alone. [S16]
7. Test worker failure/unavailability, quota/storage errors, interrupted writes, malformed saves, old migrations, immediate load after change, cancellation, repeated autosave, and recovery. Use disposable test saves.

**Accept:** the save/Continue owner improves, snapshot integrity and exact rollback survive, and no hitch is relocated to receipt/restore. **Reject:** lost progress, mixed-tick snapshots, detached data still in use, weakened checksum/migration handling, or unbounded pending saves.

### P13 — Reduce audio control and silent scheduling work

**Depends on:** P00 audio or periodic-main-thread evidence. **Maps to:** `PQ-105`, related cadence/allocation leaves. **Evidence:** I; inspect current `audioSystem.js` implementation and existing parameter caches.

1. Count node creation, silent stem scheduling, AudioParam writes, threat recomputation, active voices, and pause/restore work. A tiny gain is not itself proof the browser eliminates all upstream synthesis.
2. Extend the existing target-value caches, not parallel audio state. Avoid rescheduling unchanged gain/pitch/filter/duck targets every presentation frame.
3. Preserve envelopes when replacing automation: use supported hold/cancel behavior or an equivalent tested envelope reconstruction. Blind cancellation plus an immediate value set can introduce clicks. Capability-gate APIs. [S19]
4. Gate truly inactive music-stem scheduling with sufficient lookahead and shared musical phase. Do not stop a stem that must re-enter on a beat and restart it from the beginning.
5. Retain short release tails and the current voice-priority/cap policy. Pool or reuse only when overlapping voices and node lifetimes remain correct.
6. Test first gesture/audio unlock, rapid threat changes, engine acceleration, overlapping weapons, repeated ducking, pause/minimize/restore, and device/sample-rate variation where available. Use repeatable listening/captured-audio review alongside timing.

**Accept:** fewer control writes/nodes with equivalent cue timing, mix, and transitions. **Reject:** clicks, drift, late combat cues, lost release tails, or audio continuity sacrificed for a lower node counter.

### P14 — Explicit integrated-hardware presets and optional adaptive resolution

**Depends on:** separate product authorization plus P00 pixel-cost evidence. **Maps to:** relevant `PQ-056`/`PQ-058` investigations only under their authority; not an automatic exception to the same-picture contract.

1. Keep the original default route as the comparison baseline. Label any balanced/low-power preset as a product choice, with its exact changes exposed to the player.
2. Preserve saved explicit preferences. Do not overwrite a user setting because a renderer string contains Intel, Apple, or another vendor. Treat GPU detection as a hint supplemented by capabilities and measured sustained behavior.
3. Document physical drawing-buffer dimensions. For CSS width W, height H, effective linear scale d, scene pixels are approximately `W * H * d^2`; compute the actual rounded dimensions rather than assuming desktop resolution equals scene resolution.
4. Test static render-scale/DPR options before adding a controller. Keep DOM text and interaction geometry correct when the 3D canvas scale differs from CSS pixels.
5. If dynamic resolution is authorized, use slow bounded changes, hysteresis, minimum dwell, scene-change handling, and a measured signal. Do not react to CPU-only hitches by repeatedly resizing GPU targets.
6. Reuse compatible allocated targets or a bounded scale ladder when feasible; account for padding/UVs, depth, picking, post kernels, and peak memory. Allocating every scale simultaneously can defeat the integrated-memory goal.
7. Compare image quality in motion, thermal stability, latency, resize churn, and sustained pacing. Do not call reduced bloom resolution a reduction in the full scene's render cost.

**Accept:** an explicitly labeled preset gives a documented quality/performance tradeoff without oscillation or lost settings. **Reject:** silently lowering defaults to pass performance gates, a resize hitch loop, misleading 4×-FPS claims, or a blanket vendor penalty.

### P15 — Worker, WASM, WebGPU, or native spike only after a break-even case

**Depends on:** P00 remaining-owner evidence and `PQ-067` platform investigation. **Maps to:** existing `PQ-082`/`PQ-043`, `PQ-083`, `PQ-089`/`PQ-044`, `PQ-090`, `PQ-093`. These are alternatives to evaluate, not a mandatory migration ladder.

1. Define the remaining bottleneck and the exact boundary the new backend changes. Estimate the maximum benefit from eliminating that owner before building a port; a renderer rewrite cannot remove a map-planning CPU bill.
2. For a sim Worker, reuse existing immutable snapshot/fence and input-tick conventions. Keep one authoritative sim owner. Measure queue latency, snapshot packing, transfer, receiving decode, main-thread integration, and missed-input deadlines.
3. Use bounded double/triple buffering or another explicit ownership protocol; never transfer a buffer still read by the renderer. For SharedArrayBuffer, require the actual deployment's cross-origin-isolation support and define atomic publication/read ownership, not just a shared byte array. Test browser and Electron asset/origin behavior. [S16, S20]
4. For WASM, isolate a sufficiently coarse kernel to amortize boundary and representation conversion. Verify numerical behavior, ordering, allocation, and save compatibility; calling a tiny WASM function per entity can lose to the original JS loop.
5. For WebGPU/native, prototype the same representative scene, materials, post graph, shadows, transparency, and resource lifecycle. Do not compare a simplified port against the full WebGL route. Audit shader customization, loader, timing, screenshot, fallback, and packaging compatibility.
6. Evaluate total CPU/GPU work, presentation tails, input latency, power/thermal behavior, memory, startup, implementation complexity, and maintenance of the single game path. A Worker can compete with the render/driver on a constrained laptop.
7. Keep the old path until the candidate passes the full contract. Document a precise rejection or promotion result; do not create a permanent second half-working renderer from an inconclusive spike.

**Accept:** measured end-to-end benefit large enough to justify the new boundary, with parity and recovery. **Reject:** copy/synchronization cost consumes the gain, input lags, physics diverges, unsupported deployment requirements, or different pictures are being compared.

### P16 — Integrate, soak, and close the campaign

**Depends on:** each accepted implementation packet; this is not a new optimization owner.

1. Integrate accepted commits one at a time. Re-run their focused tests and the original baseline on the integrated head.
2. Run the scenario matrix across the actual available target devices and browser/Electron paths. Do not infer the untested device's result from a vendor name.
3. Re-check defaults, liveness, authored readiness, simulated population, fixed tick rate, saved preferences, and input behavior before comparing numbers.
4. Run sustained combat/travel/customization/save/lifecycle cycles. Check retained-memory trend, queue depth/age, hidden work, context recovery, and thermal pacing.
5. Inspect the worst events, not only the final summary. A stable p95 can conceal one recurring seconds-long Continue or first-shot stall.
6. Remove temporary hot-path logging and diagnostic allocations. Keep bounded detectors and concise receipts so the next agent can reproduce both wins and rejected approaches.
7. Close when the agreed device/scenario targets and contract hold. Otherwise name the next measured owner and return to the matching packet; do not continue micro-cleanup indefinitely.

**Accept:** reproducible integrated improvement, bounded resources, no new functional/visual/save failures, and clearly stated remaining bottlenecks. **Do not claim “perfect on integrated graphics” from a single short run or a headless test.**

### P17 — Residual micro-costs only after attribution

**Depends on:** P00 or a fresh post-integration census. **Maps to:** existing allocation/query/UI/audio leaves. **Scope:** the small-item ledger, not a license for unrelated refactoring.

1. Select one remaining measured constructor, sort, string key, or repeated calculation. Group only changes with the same owner and lifetime contract.
2. Prefer authoritative revisions and retained immutable data to repeated deep signatures. Keep bounded memory and explicit teardown.
3. For event-bus scratch reuse, preserve listener snapshot semantics, subscription changes during emit, nested emit, deferred events emitted during flush, and consumer ownership. Hoisting a callback is unsafe if it relies on a shared snapshot variable across reentrant emissions.
4. For RNG/hash/sort/math changes, prove exact outputs and consumption order. Do not replace a string hash with a “similar” numeric hash or lexicographic IDs with numeric ordering.
5. For runtime-witness reports, separate cheap scalar collection from expensive report materialization/quantile sorting; keep the diagnostic meaning and raw evidence intact.
6. Use the focused production-function test plus player-route A/B. Keep only a meaningful gain or a clearly justified bounded-allocation improvement with no regression; do not inflate maintenance complexity for noise.

**Accept:** a named residual cost is removed under its exact semantic contract. **Reject:** arithmetic/reentrancy drift, stale caching, or hundreds of low-value edits that obscure the real bottleneck.

---

## 6. Regression matrix and release closure

### 6.1 Existing commands to reuse

The inspected `package.json` exposes the following useful commands. Their presence is not proof that their assertions cover a proposed change. Read the tests and exercise the actual production seam; add the missing regression to the appropriate existing family.

| Surface | Existing entry points observed | Required additions/checks for a candidate |
|---|---|---|
| Baseline/runtime | `check:baseline`, `probe:runtime-witness`, `check:all`, `check:all:smoke`; campaign also names `check:playable` | Real foreground hardware route, expected subjects, non-overlapping raw evidence. |
| Sim/replay | `check:sim`, `check:sim:v3`, `check:sim:v3:compare`, `check:sim:dynamic`, `check:sim:long`, `check:sim:long:compare` | Same input/seed, relevant load/reload boundary, mutation order, no golden rerecording. |
| Physics/massline | `check:physics-authority`, `check:sg02:dynamic-lab`, `check:sg02:authority`, `check:sg02:production-combat`, `check:sg02:tether`, `check:sg02:tether-resilience` | Sleep-age, wake/re-entry, rebase, collision/attachment and command-lifetime cases. |
| Map | `check:galaxy-map-inspector`, `check:galaxy-map-search-pointer`, `check:map-information-depth`, `check:navigation-stale-route`, `check:map-camera`, `check:map-frames`, `check:map-nav-context` | Planner dependency invalidation; no per-animation recompute; disclosure/focus semantics. |
| Render/assets | `check:perf-packets`, `check:asset-runtime-disposal`, `check:asset-startup-readiness`, `check:asteroid-instance-structure`, `check:sector-prewarm`, `check:shader-compile`, `check:render-path-parity` | Real shader/target route, near and temporal visuals, lifecycle ownership, full-frame counters. |
| Transport/platform | `check:presentation-snapshot`, `check:batched-instances`, `check:sim-transport`, `check:backend-decision` | Buffer ownership, input deadline, source/backend parity, context reset. |
| Audio | `check:audio-identity`, `check:first-hour-audio`; parameter-churn coverage in `check:perf-packets` | Envelope/click, phase, unlock, pause/restore and control-count regressions. |

Do not run the entire expensive suite after every trivial local edit. Run focused tests during development, the required leaf checks before A/B, and the prescribed integrated suite before delivery. Do not rerun an unchanged failing setup without a relevant hypothesis or environment change. Preserve the error fingerprint and move to the appropriate corrective action.

### 6.2 Must-pass semantic edge cases

**Indexes/caches:** spawn/remove in callbacks; in-place role/recipe changes; equal-count but different sets; ID reuse; load/reset; invalidation during computation; cache eviction; mutable result consumers.

**Rendering:** asymmetric hulls; mixed materials; hero and close inspection; small on-glass contacts; partially visible bounds; rapid turns/zoom; glass and additive ordering; shadows crossing bounds; changing loadouts/damage; context loss; resource sharing.

**Physics:** force versus impulse; zero versus absent commands; contacts after sleep; manual springs/tethers; compound proxies; high speed; teleport/rebase; destruction during callbacks; save/reload before and after wake.

**Scheduling:** immediate input and combat effects; deterministic event order; catching up after one late present; render at 30/60/high-refresh while sim stays 60 Hz; hide/restore; starvation and backpressure.

**Persistence/audio/UI:** storage and worker failure; unsaved rollback; repeated menus/previews; stale node handles; screen-reader/live-region behavior; audio unlock, envelopes, musical phase, and transition latency.

### 6.3 Completion criteria for the overall effort

The campaign is complete for a declared hardware/scenario envelope when the selected pacing target holds reproducibly, normal play no longer systematically sheds sim time, remaining first-use events stay within the agreed envelope, memory/resource ownership is bounded, defaults and gameplay remain intact, and browser/Electron parity survives the full scenario matrix.

If that envelope does not hold, the deliverable names the unresolved owner and its actual evidence. It does not claim that every possible optimization is exhausted. Conversely, once it does hold, do not spend weeks pursuing tiny unmeasurable differences simply because the ledger still contains untried ideas.

---

## 7. Complete original-finding migration ledger

This preserves all **75 original findings** as locatable research leads. `Hn`, `Mn`, and `Sn` mean the original huge/medium/small item numbers, not new task IDs. Unless independently verified in §1.3, these entries are **I — inherited**. Consult [R00] for original line anchors and wording, then locate the current production symbol before editing. Basenames are intentional where the initial finding did not establish a full path here; use `rg --files src` and current imports rather than guessing directories.

### 7.1 Huge findings — all six

| Original | Retained finding | Execution / correction |
|---|---|---|
| H1 | Tier-aware default `pixelRatioCap` (`gameState`, renderer resize). | P14 only with product authorization; not the first same-picture fix or a guaranteed 4× speedup. |
| H2 | Procedural ship LOD gap (`visualFactory`, `lod`, whole-ship policy). | P06 after visible procedural census; no far-fleet resurrection. |
| H3 | Galaxy-map alternatives call two route objectives per animation. | P01; version actual planner dependencies, not discovered count alone. |
| H4 | Rapier solver settings, disabled sleep, repeated pose/WASM reads. | Split P04 equivalent membrane work from P05 sleep; solver tuning is separate physics work. |
| H5 | Tactical membership scans, inspect-shaped stamping, roster rebuilds. | P02; preserve dynamic target state, ordering, and same-tick changes. |
| H6 | Worker/WASM/WebGPU/SAB/native scaleout. | P15; measured break-even, not inevitable migration. |

### 7.2 Medium findings — all 29

| Original | Retained finding / locator | Execution / correctness condition |
|---|---|---|
| M1 | `combat/kernel`: list sort/invalidation and two bounds synchronizations. | P03; pre/post bounds differ in phase, so do not blindly delete one. |
| M2 | `aiPorts`: allocated hazard-contact records in perception radius. | P02/P03; observer-specific state must not leak through shared caches. |
| M3 | `traffic`, `worldRecords`, `presentationAdmission`: reverse world-record scans. | P03; establish cardinality, lifecycle, and load/reset semantics. |
| M4 | `lawSecurity`: sanctuary checks per entity/tick. | P03/P05; preserve immediate law/combat transitions, not arbitrary stale TTLs. |
| M5 | `mining`/`interactionDescriptors`: held-beam descriptor rebuilding. | P03/P17; target/config revisions and consumer lifetimes. |
| M6 | Mine/ghost scanner/cruise/weapon type scans without dedicated buckets. | P03; measure churn and maintain deterministic ordering. |
| M7 | Beam/muzzle packet cloning, keys, and tick events in `weapons`. | P03/P17; separate presentation coalescing from authoritative event semantics. |
| M8 | `tetherGameplay`: acquisition copies/maps/sorts, hostility tests and raycasts. | P03; broadphase/early rejection must preserve selected target. “Raycast only top three” is not automatically equivalent. |
| M9 | `scanner`: hostility normalization and lane scans. | P03; invalidate on actual relation/lane changes, not a blind 0.25 s cache. |
| M10 | `coreSystem`: removal splices across many arrays/reconcile. | P03/P17; stable compaction where order matters. |
| M11 | `economy`: repeated maps and deterministic seed derivation. | P17; preserve transactions, RNG and existing cadence. |
| M12 | `ships`: repeated fitting/slot resolution. | P06/P17; equipment revision invalidation. |
| M13 | `visualFactory`: static ship batches and matrix-freeze opportunity. | P06/P07; merge once, freeze local static transforms only. |
| M14 | `vfx`: always-visible pooled point lights and shader loop size. | P08 for equivalent work; fewer lights is P14 unless parity is established. |
| M15 | Large screen-covering additive smoke/shards/sprites. | P08 for unused coverage/overdraw; shrinking the intended effect is P14. |
| M16 | Default shadow pass/resolution. | P08 for dirty/caster ownership; disabling/halving resolution is P14. |
| M17 | Fixture/armor/grime/gem material cloning. | P07; immutable role sharing versus per-entity mutable state. |
| M18 | NPC canopy physical/clearcoat/transparent/double-sided material. | P07/P08 only with parity; Standard-material substitution is a quality decision. |
| M19 | Integrated-tier adaptive-resolution exclusion and RT churn. | P14; scene versus bloom resolution and bounded allocation policy. |
| M20 | Animated box shadows in `uiRoot`/comms. | P11; trace paint cost and preserve the intended visual. |
| M21 | `market`/`bar`: repeated row queries, contact HTML/listener rebuilding. | P11; structural revisions, retained keyed rows and handlers. |
| M22 | `galaxyMap`: selectors, inspector cadence, weather/cargo, ETA ribbon, pointer rect. | P01/P11; separate data revisions from live animation. |
| M23 | Drop-shadow filters on transformed overlays. | P11; compositor-dependent measurement, not universal re-rasterization claims. |
| M24 | `audioSystem`: nearly silent music stems still scheduled. | P13; preserve phase, lookahead and re-entry. |
| M25 | Engine and ducking AudioParam writes each frame. | P13; reuse existing caches and preserve envelopes. |
| M26 | `saveSystem`: repeated stringify/parse/checksum encoding. | P12; reuse exact bytes with coherent snapshot semantics. |
| M27 | Immediate rollback deep-copy/encoding before load. | P12; preserve current unsaved state, never substitute an older autosave. |
| M28 | Save-slot listing falls back to full validation. | P12; trustworthy index plus correct corruption fallback. |
| M29 | Eager `partsLibrary`/startup scenario preparation. | P09/P12; overlap only when readiness and first-use behavior remain correct. |

### 7.3 Small findings — all 40

| Original | Retained finding / locator | Execution / guard |
|---|---|---|
| S1 | Disabled-hauler plan deep clone in `traffic`. | P17; confirm disabled plan's consumer/lifetime contract. |
| S2 | Repeated traffic identifier compaction around RNG. | P17; preserve exact entropy and RNG stream. |
| S3 | Salvor ranking/sorting every few ticks. | P03/P17; target/relevance revision and deterministic ties. |
| S4 | Station-identity resolution repeated in traffic. | P17; identity/version cache with reset. |
| S5 | Traffic strings, itinerary and boarding presentation reconstruction. | P11/P17; retain only unchanged presentation facts. |
| S6 | Expired memory-key work in world/world-record paths each tick. | P17; deterministic expiry boundary and bounded storage. |
| S7 | Mining tick/denial/heat event and payload churn. | P17; event subscribers, deferred ownership and required cadence. |
| S8 | Mining beam/ray/seam/tool allocations and ore/wreck sorts. | P03/P17; scratch lifetime, RNG/order and depletion behavior. |
| S9 | `Math.hypot` used in range gates. | P17; finite ranges and exact boundary/replay consequences. |
| S10 | String sort keys/comparators in AI contracts/cohorts. | P02/P17; precompute equivalent keys, do not change ordering. |
| S11 | Weapon attack-spec keys, entropy objects and repeated definition resolution. | P03/P17; loadout/heat revisions and exact random consumption. |
| S12 | Automation production planning and per-good scans. | P05/P17; integrated output alone is insufficient if discrete timing changes. |
| S13 | Mission-target adoption scans/sorts repeated in retries. | P03; retained mission→entity index with lifecycle verification. |
| S14 | Endgame fact snapshots rebuilt every tick. | P17; all eligibility dependencies invalidate. |
| S15 | Claims defense-warning waypoint/string rebuilt every tick. | P11/P17; retain stable display data. |
| S16 | `rng.hash32(...args)` rest/join allocation. | P17; exact hash compatibility, not a merely similar numeric hash. |
| S17 | Event-bus emit closure and deferred-flush array allocation. | P17; nested emit, listener snapshots and flush reentrancy. |
| S18 | Registry catch-up skip policy recalculated per system. | P17; only hoist truly tick-invariant inputs, not the system-specific decision. |
| S19 | Runtime witness 1 Hz rich report/sort/entity-walk overhead. | P00/P17; cheap collection, off-hot-path materialization, honest observer cost. |
| S20 | SG-02 receipts/maps/sorts/spreads/diagnostic and attachment scans. | P04; stable contact ordering and retained consumer ownership. |
| S21 | Physics command/vector/quaternion construction per craft/tick. | P04; absence versus zero, mutation lifetime, rebase/load correctness. |
| S22 | Projectile sweep all-pairs fallback below spatial-hash threshold. | P03/P04; benchmark actual occupancy/churn and preserve sweep coverage. |
| S23 | Dock-range station scan while already docked. | P17; preserve transitions and undock invalidation. |
| S24 | Renderer shadow-follow string key per frame. | P08/P17; numeric comparison with complete invalidation inputs. |
| S25 | Shield/nav world-matrix updates repeated per ship. | P06/P17; reuse only after the valid frame transform phase. |
| S26 | VFX field-instance matrices rewritten while fields exist. | P08; actual dirty/cadence state, not lower visible effect fidelity. |
| S27 | Double-sided VFX quads/ribbons/surfaces. | P08; material-specific single-pass/winding tests, no global FrontSide rule. |
| S28 | Common rocks non-indexed after creased-normal generation. | P10; full-attribute indexing and measured vertex reuse, no assumed 3× gain. |
| S29 | External texture mip/anisotropy/fallback policy. | P10; inspect actual assets and sampling quality before imposing caps. |
| S30 | VFX light intensity self-assignment. | P17; tiny hygiene only, not a campaign outcome. |
| S31 | HUD per-bar queries. | P11; mounted reference lifecycle. |
| S32 | Redundant body dataset writes. | P11; dirty-write guard. |
| S33 | World-to-screen allocations/layout reads. | P11; scratch and viewport invalidation, correct projection phase. |
| S34 | Repeated toast lookup. | P11; retained node references with removal. |
| S35 | Accessibility checks across UI/screen manager. | P11; preserve live-region/focus semantics. |
| S36 | Reticle repeated lookup/update. | P11; keep immediate aiming feedback. |
| S37 | Band HUD JSON-stringified signature. | P11/P17; actual data revision instead of deep hot signature. |
| S38 | Radar gradient recreation. | P11/P17; invalidate for dimensions/theme/context changes. |
| S39 | Backdrop blur on UI. | P11; measure, preserve design, and remove hidden work—not a blanket effect ban. |
| S40 | Audio note-frequency calculation table. | P13/P17; exact tuning and measured relevance. |

Original overlapping identities remain authoritative: ship LOD `PQ-053`/`PQ-108`; physics sleep `PQ-084`; event lights/prewarm `PQ-096`/`PQ-072`; VFX `PQ-115`/`PQ-121`/`PQ-126`; shadows `PQ-077`; resolution/governor `PQ-056`/`PQ-058`; offstage/world work `PQ-070`/`PQ-080`; UI `PQ-088`/`PQ-102`/`PQ-117`; audio `PQ-105`; save `PQ-087`; startup caches `PQ-103`/`PQ-104`; allocation `PQ-106`; platform `PQ-082`/`PQ-083`/`PQ-089`–`PQ-093`. Recheck catalog/dispatch before use; this is a scope crosswalk, not a completion list.

---

## 8. Repository evidence and primary research

### 8.1 Repository sources

The following references identify the inspected baseline. Use current code for execution, but retain the pinned links when explaining why a historical conclusion was made. Detailed unverified inventory anchors remain in R00.

- **R00:** Initial 75-finding report, immutable commit; source of inherited findings and original method claims.
- **R01:** Root and design agent instructions; live owner, determinism, work and authority contracts.
- **R02:** Existing performance budget, same-picture constraints, and already-implemented optimization context.
- **R03:** Hitch campaign; admitted execution method, historical failures, hardware caveats and receipts.
- **R04:** Performance option space; reserved identities, investigate/invalidate/implement contract.
- **R05:** Renderer instructions; presentation ownership, authored fallback diagnostics, visual validation and light/precompile coupling.
- **R06:** Tabletop analysis; historical visible/resident/sim census and batching rejection.
- **R07:** Main-loop adapter; distinct simulation/presentation owners.
- **R08:** Browser import map and vendored renderer entry; dependency/version provenance.
- **R09:** Package scripts; actual commands and integration surfaces.
- **R10:** Renderer creation, opaque sorting and disabled batch bridge.
- **R11:** Existing asynchronous GPU timer implementation and provenance records.
- **R12:** Combat pre/post-physics bounds synchronization.
- **R13:** Dynamic-body creation, explicit no-sleep rationale, and ghost-body reuse.
- **R14:** Bloom pipeline and shared color-management contract.
- **R15:** Galaxy-map alternatives and tactical membership/stamping implementation.

[R00]: https://github.com/coldshalamov/SpaceFace/blob/4cd6d50f8402082526e6660eddb160fb4e33dfdf/design/perf/PERFORMANCE_IMPROVEMENT_REPORT_2026-09-05.md
[R01]: https://github.com/coldshalamov/SpaceFace/blob/4cd6d50f8402082526e6660eddb160fb4e33dfdf/AGENTS.md
[R02]: https://github.com/coldshalamov/SpaceFace/blob/4cd6d50f8402082526e6660eddb160fb4e33dfdf/design/PERF_BUDGET.md
[R03]: https://github.com/coldshalamov/SpaceFace/blob/4cd6d50f8402082526e6660eddb160fb4e33dfdf/design/program/PERF_HITCH_CAMPAIGN.md
[R04]: https://github.com/coldshalamov/SpaceFace/blob/4cd6d50f8402082526e6660eddb160fb4e33dfdf/design/PERF_OPTION_SPACE.md
[R05]: https://github.com/coldshalamov/SpaceFace/blob/4cd6d50f8402082526e6660eddb160fb4e33dfdf/src/render/AGENTS.md
[R06]: https://github.com/coldshalamov/SpaceFace/blob/4cd6d50f8402082526e6660eddb160fb4e33dfdf/design/program/PERF_TABLE_ANALYSIS.md
[R07]: https://github.com/coldshalamov/SpaceFace/blob/4cd6d50f8402082526e6660eddb160fb4e33dfdf/src/core/loop.js
[R08]: https://github.com/coldshalamov/SpaceFace/blob/4cd6d50f8402082526e6660eddb160fb4e33dfdf/index.html
[R09]: https://github.com/coldshalamov/SpaceFace/blob/4cd6d50f8402082526e6660eddb160fb4e33dfdf/package.json
[R10]: https://github.com/coldshalamov/SpaceFace/blob/4cd6d50f8402082526e6660eddb160fb4e33dfdf/src/render/renderer.js#L3020-L3095
[R11]: https://github.com/coldshalamov/SpaceFace/blob/4cd6d50f8402082526e6660eddb160fb4e33dfdf/src/render/gpuTimers.js
[R12]: https://github.com/coldshalamov/SpaceFace/blob/4cd6d50f8402082526e6660eddb160fb4e33dfdf/src/combat/kernel.js#L111-L140
[R13]: https://github.com/coldshalamov/SpaceFace/blob/4cd6d50f8402082526e6660eddb160fb4e33dfdf/src/core/sg02DynamicBodyOwner.js#L854-L925
[R14]: https://github.com/coldshalamov/SpaceFace/blob/4cd6d50f8402082526e6660eddb160fb4e33dfdf/src/render/bloom.js#L1-L125
[R15]: https://github.com/coldshalamov/SpaceFace/blob/4cd6d50f8402082526e6660eddb160fb4e33dfdf/src/ui/galaxyMap.js#L7730-L7845

Additional directly inspected baseline files: `design/AGENTS.md`, `src/systems/tacticalAI.js` (approximately 354–515), and `vendor/three.module.js`. The direct code observations are not a claim that every line of every large file was reviewed.

### 8.2 Primary external references, checked 2026-09-05

These establish API/engine behavior and support the proposed experiments. They do not establish SpaceFace-specific performance gains. Keep API availability tied to the checked-in vendor and actual browser capabilities.

| Ref | Primary source | Applied here |
|---|---|---|
| S01 | [MDN: WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) | Blocking calls, pixel/attachment costs, resource discipline and measured WebGL tradeoffs. |
| S02 | [Khronos: EXT_disjoint_timer_query_webgl2](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/) | Availability, delayed query polling, disjoint invalidation, nanosecond results. |
| S03 | [Three.js: WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html) | Full-frame info accounting, compile/readiness and resource initialization APIs; version-gated. |
| S04 | [Three.js: InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) | Shared geometry/material, transform/color updates, bounds and ownership. |
| S05 | [Three.js: BatchedMesh](https://threejs.org/docs/pages/BatchedMesh.html) | Distinct geometry batching, per-object culling and sorting; not proof of a faster bridge. |
| S06 | [Three.js: Material](https://threejs.org/docs/pages/Material.html) | Double-sided transparent two-pass behavior and `forceSinglePass`. |
| S07 | [Three.js: BufferAttribute](https://threejs.org/docs/pages/BufferAttribute.html) | Component-based update ranges and usage lifetime. |
| S08 | [Three.js: Cleanup](https://threejs.org/manual/en/cleanup.html) | Explicit disposal and resource ownership. |
| S09 | [Chrome: Forced reflow](https://developer.chrome.com/docs/performance/insights/forced-reflow) | Layout-dependent reads after invalidation, not selector counts alone. |
| S10 | [web.dev: High-performance CSS animations](https://web.dev/articles/animations-guide) | Trace-led animation/paint/compositor experiments. |
| S11 | [Chrome: Long Animation Frames API](https://developer.chrome.com/docs/web-platform/long-animation-frames) | Attribution and the 50 ms blind spot for tighter game deadlines. |
| S12 | [Rapier: Rigid bodies](https://rapier.rs/docs/user_guides/javascript/rigid_bodies/) | Sleeping, waking and body-control semantics. |
| S13 | [Rapier: Determinism](https://rapier.rs/docs/user_guides/javascript/determinism/) | Same version/initialization/parameters and insertion/removal order; game-level equivalence still needs tests. |
| S14 | [Three.js: KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html) | Actual supported GPU transcode formats and worker/resource lifecycle. |
| S15 | [meshoptimizer: Core pipeline](https://meshoptimizer.org/) | Attribute-aware indexing, cache/fetch ordering and hardware-dependent overdraw tradeoffs. |
| S16 | [MDN: Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) | ArrayBuffer transfer/detachment and ownership across workers. |
| S17 | [Intel: Shared GPU memory](https://www.intel.com/content/www/us/en/support/articles/000041253/graphics.html) | Shared system-memory architecture; not a recommendation to change BIOS allocations. |
| S18 | [Three.js: Color management](https://threejs.org/manual/en/color-management.html) | Linear working space, texture roles and output conversion. |
| S19 | [MDN: AudioParam.cancelAndHoldAtTime](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/cancelAndHoldAtTime) | Preserving scheduled envelope continuity when modifying automation; capability check required. |
| S20 | [MDN: crossOriginIsolated](https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated) | Deployment constraints for shared memory and isolation-sensitive browser capabilities. |

**Execution principle:** remove work that provably need not happen, at the layer that actually owns the cost. Preserve the table, the fight, and the save. Measure the delivered frame before declaring victory.
