<!-- LIFETIME: STABLE -->
# Lane 1 — THE MACHINE & THE PICTURE (high complexity, taste)

**Written only by Lane 1.** Other lanes append one line to *Inbox* and nothing else.
Program law: [`README.md`](./README.md). Commands: [`TOOLS.md`](./TOOLS.md). Prompt: [`PROMPT_LANE_1.md`](./PROMPT_LANE_1.md).

**The outcome:** SpaceFace runs like a professional game on the owner's Intel-iGPU laptop — combat
with 150+ bodies on screen at 60 fps, no hitch you can feel, a loading screen that never freezes, a
long session that never dies — and every model, effect and sky on screen is beautiful *within* that
budget. Status words: `OPEN`, `ACTIVE`, `LANDED <sha>`, `SKIPPED (<one-line reason>)`.

## Baseline (packet M0 rewrites this table with today's numbers, then keeps a dated row per re-measure)

| Date | Build | Crucible p50 / p99 / longest | GPU p50 | Adventure p50 / p99 / longest | Longest load task | Loading anim gap p99 | Launch→flight | Host busy |
|---|---|---|---|---|---|---|---|---|
| 2026-10-28 (from docs) | various | 86 / ~125 (p95) / multi-s | 23.7 ms | 23.2 / 109.4 / 324 | 5,000 ms | unmeasured | 11.6 s | contended |
| 2026-10-28 M0 round1 (main) | master+merge | 77.3 / 161.6 / 258.1 (ents~164, sim 22.9 render 20.7) | 25.9 (scene 18.1@194d, composite 7.6) | pending | pending | pending | pending | contended (audit+probes) |
| 2026-10-28 M0 wave15 (main) | master+merge | 158.2 / 240.0 / 362.2 (ents~215, sim 68.5 render 41.8, 805 draws) | 76.1 (p3 33.3@393d + p1 21.0@340d, composite 14.4) | pending | pending | pending | pending | contended (audit+probes) |
| 2026-10-28 A/B round1 (worker) | master+merge+M1 | 81.0 / 188.8 / 305.1 (ents~201, sim 0.02 render 30.4, 181 draws) | 31.9 (scene 24.6@224d, composite 7.0) | pending | pending | pending | pending | contended (audit+probes) |
| 2026-10-28 A/B wave15 (worker) | master+merge+M1 | 152.7 / 411.5 / **1349.6** (ents~236, sim 0.02 render 55.8, 842 draws) | 90.9 (p3 43.0@432d + p1 33.7@384d, composite 15.7) | pending | pending | pending | pending | contended (audit+probes) |
| 2026-10-28 A/B round1 (worker, post-storm-fix 530498d) | master+M1 | 68.2 / 143.0 / 191.0 (ents~177, sim 0.02 render 23.9, 175 draws) | 29.7 | pending | pending | pending | pending | contended (audit+probes) |
| 2026-10-28 A/B wave15 (worker, post-storm-fix 530498d) | master+M1 | **129.7 / 255.1 / 314.6** (ents~230, sim 0.02 render 49.4, 746 draws; journalRebuilds 4/session) | 73.6 (p3 32.3@387d + p1 24.5@341d, composite 14.4) | pending | pending | pending | pending | contended (audit+probes) |
| 2026-10-28 M0 loading (main) | master+merge+M1 | — | — | — | 4,168 ms (next: 1,340) | 66.6 (3 gaps >1 s, longest 3.0 s) | 74.1 s | contended; 190 MB streamed (108 MB GLB) |
| 2026-10-28 M0 adventure (main) | master+M1 | — | — | 239.5 / 1,254.5 / 1,441.6 (ents~127, route 107 s, 359 fr) | — | — | — | contended (audit+probes) |
| 2026-10-28 M0 adventure (worker) | master+M1+flip | — | — | 80.1 / 212.4 / 1,300.6 (ents~162, 1,247 fr; PASS, 0 ctx loss) | — | — | — | contended (audit+probes) |

Targets and floors: README §4.

## Claimed paths (beyond README §3)

*(Lane 1 writes border files it has taken here.)*

## Inbox (other lanes append one line: date, lane, path, what/why)

- 2026-10-31 integration: `check-vfx-frame-sleep.mjs` now gives its unchanged 420 seam-bearing bodies the canonical GameState/index/hash setup. Setup assertions and the unchanged 0.25 ms ceiling pass at 0.06493 ms; existing hash/fallback marker parity passes 3/3. This corrects the measurement fixture, not runtime VFX or fallback speed. Full UI performance matrix remains stale after style changes.

- 2026-10-28, Lane 3: H0 razor commit a054f36530a touched `assets/**/measured-contract.json`, `assets/ui/kit/*`, `assets/incubator/*/INTEGRATION.md`, `assets/ships/m5_*/MATERIAL_TRUTH_PREFLIGHT.md`, `assets/ships/npc_work_fleet/PROVENANCE.json`, `tools/blender/forge/source_assets/pip_spanner/provenance.json` — mechanical ref rewrite only (provenance strings now point at `design/archive/…` after the doc moves). No asset content changed.
- 2026-10-28, Lane 3: foreign-dirty work seen in the tree, not mine — `electron/preload.cjs`, `scripts/lib/ui-layout-measure.mjs`, `src/ui/contactHailPrompt.js`, `src/ui/views/hudStyles.js`, `test/ceres-five-minute-acceptance.test.mjs` left unstaged and preserved.
- 2026-10-28, Lane 3 (W1-473): title-interactive on the VM profile (headless SwiftShader, retail `build/web`) measured **16.5–17.4 s** clean, ~26–42 s under host load vs the 10 s budget — over entirely inside your boot/loading/render path, nothing UI-side (menu mounts+usable the same frame the shell drops). Tape: `bootEntry.js:33` media hold → `import('../main.js')` eval ~2.5 s longtask ~3–5.5 s → `main.js:141–216` "Preparing/Starting flight systems" ~4–5 s → `main.js:470` "Opening the command deck" → **~5 s tail** (first title-scene paint: serial shader compile on software GL in `src/render/**` admission) → `loadingPresenter.hide()` (`loadingPresenter.js:374–388`, hideDelayMs 600). Evidence script+tape: `.devshots/w1-473-title-timing.mjs` (`--bundle`), run on the hour-old bundle.

## Defects (this lane's share of the demo defect ledger — delete a row in the commit that fixes it)

| # | What a stranger sees | Where | Next step |
|---|---|---|---|
| D269 | Crucible combat 1–4 fps under the harness, ~12 fps unobserved | Crucible round; render + sim main thread | packets M0–M6 |
| D268 | Adventure dies on "Graphics interrupted" after ~172 s (buffer resize on a geometry whose CPU arrays `packageCpuDetach.js` freed) | `src/core/presentationRunner.js`, `src/render/packageCpuDetach.js` ~690–725 | packet M8 |
| D130 | Adventure flight p99 109 ms, longest 324 ms | ordinary flight | M1–M5, M10 |
| D251 | Deployed route streams 146 MB (84.7 MB GLB) before first flight | opening required set, `FlightReadySet` | packet M9 |
| D250 | Boot cannot fetch the game module under `ERR_INSUFFICIENT_RESOURCES` | asset fetch concurrency | packet M8 |
| D252 | Deployed WebKit renderer stops answering before the menu | `probe-deployed-mobile.mjs --engine=webkit` | packet M9 |
| D229 | Metallic rocks draw wrong during the rock-family decode rewarm on sector entry (watch) | asteroid-appear probe | packet A5 |
| D199 | Asteroids lack contrast against the background | look / player-truth ownership | packet A5 |
| D270 | `?simLane=worker` died at boot — static `systems→ui` chain pulled `@elemaudio/core` (bare specifier; import maps do not reach module workers) | `onboarding.js→missionLog.js→comms→…→audio` | FIXED in tree: `continueRecap`/`objectiveText` moved to `src/ui/sim/missionRecap.js`; worker graph 1843→1766 files, zero bare specifiers |
| D271 | SAB envelope codec never ran on Chrome — `TextEncoder.encodeInto`/`TextDecoder.decode` reject shared views; boot reply (0.76 MB) overflowed 704 KB cell | `scripts/lib/simSabEnvelope.mjs` | FIXED in tree: private-scratch codec + copy-out on read; cells cmd 1 MiB / reply 4 MiB |
| D272 | `first-present GPU admission failed` — `TypeError: morphAttributes of null` on an InstancedMesh during menu | three `getParameters` via `InstancedMesh.traverse` | investigate M1 review |
| D273 | `GL_INVALID_OPERATION: glTexStorage2D: Texture is immutable` during boot | texture upload path | investigate M1 review |
| D274 | `[GPU brick] bloomScene` shader compile stall 1.0–3.4 s on first present (Intel D3D11) | program admission / bloom chain | packets M3/M4/M6 |
| D275 | Two blob workers fail module specifiers `densityVolumeData/rle.js`, `gasVolumeData/density.js` (relative imports inside `blob:`) | blob worker creation sites | investigate; likely silent-tolerated |
| D276 | ~~Worker-lane wave-15 tail~~ FIXED 530498d: journal rebuild storm — no `visitRangeSteps` on the wire journal (unbounded applies), ack claimed merged end not applied watermark, `journalStart>ack` armed rebuilds on ordinary backpressure, and lane rebuilds gap-checked against stale pending windows | `simLaneJournal`, `presentationRunner`, `wholeSimBrowserWorker` | measured: rebuilds ~76→4/session, wave15 148/508/1972 → 130/255/315 ms; no longer a flip blocker |

## The ordered packets

Work top to bottom. Two may run at once when their paths are disjoint. Re-measure the baseline
after every three landed perf packets and add a dated row above.

### Wave M — the machine (do these first; they are the owner's top complaint)

**M0 — Baseline and the stress bench.** Re-record every bar in README §4 on today's build, within one
session, host busy printed. Use the existing tools: `scripts/probe-crucible-load-and-gpu.mjs`
(GPU timer queries work on this laptop), `scripts/probe-crucible-programs.mjs`,
`scripts/probe-frame-solid.mjs` (`--cpu-profile`, `--compare=`), `scripts/probe-main-thread-profile.mjs`
(`--crucible --settle-ms --eval-file` for within-session A/B), `npm run probe:runtime-witness`. Add the
two missing instruments: (a) an **unobserved** Crucible stress run (no readbacks, no screenshots) at
round 1 and at a forced wave-15 crowd, reporting frame p50/p99/longest, GPU per pass, main-thread
split; (b) a **loading-animation gap probe** that timestamps the loading animation's own frames
(the worker canvas commits, `loadingTerminalArt.js` / `bootRingWorker.js`) from Launch to first
flight. Write the numbers into the Baseline table. Done when every README §4 row has a measured
baseline.

**M1 — Turn the simulation worker on by default.** ✅ **LANDED** (storm fix `530498d` + flip commit):
worker is the default lane, `?simLane=main`/`sf.simLane`/`SPACEFACE_SIM_LANE=main` are the escape
hatch; a worker dead before its init reply falls back to the in-process sim with the registry rebuilt
(bounded 45 s gate). Measured on this host: Crucible wave-15 p50 130 vs 158 ms main, longest 315 vs 362;
Adventure route p50 80 vs 240 ms, p99 212 vs 1,254 ms; journal rebuilds 4/session; boot+escape verified
real-browser. `src/core/simLaneMain.js`,
`wholeSimBrowserWorker.js`, `simLaneCommands.js`, `simLaneJournal.js`, `src/main.js`. State:
`design/perf/STRUCTURAL-HORIZON.md` stages 0–9 (golden digests bit-identical worker vs main, independent
review SHIP). Ruling 8 removes the 0.5 ms wire bar. Work: within-session A/B (`?simLane=worker` vs main)
on Crucible and Adventure; close the honest gap list (Electron provisioning path, `discardPreparedNewGameScene`
mirror clobber, debug ring on `window`, the echo-suppression edge); serve COOP/COEP in Electron and
the dev/release servers so the SAB journal path is live (`?simSab=1` → default when `crossOriginIsolated`);
flip the default; keep `?simLane=main` as the escape hatch. Coordinate with Lane 2 via its Inbox: any
sim-side code they add must stay worker-safe. Done when the default route runs the sim off the main
thread, parity/digest tests are green, and the A/B shows the frame win.

**M2 — Unwrap `unreadyDrawGuard` once readiness settles.** `src/render/bloom.js:~1337` wraps every draw
(12.5 % inclusive in the Crucible round). After `unreadyProgramsPending` is false, swap in the raw
`renderBufferDirect`; re-wrap only on a new mount. Done when the profile share is < 1 % in a settled
round and no unready program ever draws (keep the existing guard test). **LANDED 2026-10-28** —
`createUnreadyDrawableGuard(renderer, { disarmOnSettle: true })` at both production call sites;
settled hide() swaps the raw `renderBufferDirect` in, mounts/program churn/detach events re-wrap.
Detach side got its own latch: `packageDetachSerialNow()` bumps on release, dead attribute records,
dropped residency stamps, manifest eviction and orientation holds, and a bounded-cadence
`presentedDetachDrawsArmed` scan re-verifies pending payloads so a never-drawn release cannot tax
every frame. Guard test kept green (17/17 incl. new disarm/rearm + opt-out contract tests); detach
suites 25/25. Real-browser proof (`probe-crucible-stress` worker arm, contended):
`drawGuardDisarmed` true in 178/897 diag samples — engaged whenever the frame is actually settled;
combat mounts legitimately re-arm it mid-round.

Audit follow-up landed same day (m008/m009): the hidden `SF_RosterPrewarm_PartCatalog` root (~30
part holders + count-0 instanced twins + pool-witness stubs) is not a bounded warm root, so while
parented it paid into every per-frame scene/matrix/readiness walk for the whole run. It now
unparents once all decode lanes settle; `_rosterPartCatalogRoot` keeps it reachable for cohort
sweeps and run-end release (pool-witness mounts and in-flight-decodes' residency predicate are
settle-complete by then; late mounts land on the detached root harmlessly). Also fixed a teardown
telemetry hole the audit flagged: `_releaseDetachedBoundaryOwnersSteps` passed `owner.state`
(undefined on an Object3D) into `disposeObjectSteps`, starving `noteLaneFault` of teardown-fault
records — now `this.state`. Focused proof: twin-promotion suite 7/7 (incl. a new test pinning
unparent-after-settle + ownership) — that suite also got a race fix: wave-102's paced drain
(`yieldToBrowser` per 8 ms slice) made its synchronous post-call asserts catch mid-drain state on
a loaded box; asserts now drain the pending set first / count pending-set admissions through the
drain. Detached-owner + liveness suites green (80/80).

**M3 — Fewer programs, fewer switches, fewer draws.** `setProgram` 7.9 % + `renderBufferDirect` 10.6 %;
203 programs in a Crucible run, split by instancing (57), vertex colour (39), light count (37) and
shadows (37). Steps, each measured: (a) bake Forge hull identity colour from `material.color` into a
`COLOR_0` attribute at release time so one material serves a hull (`ASSET_PERFORMANCE_PROGRAM.md` §4.2;
`materialShareSignature`); (b) enable `mergeGroups` in the render-package compiler for every package it
is legal for (on for 1 of 414 today); (c) one fixed light-count variant (lights already pool; never
toggle `light.visible`, it recompiles); (d) per-hull-family `InstancedMesh` or the retained-slot opaque
`BatchedMesh` path (`renderer.js` `_opaqueBatchEnabled`, PQ-129.12) — whichever wins the A/B. Done
when programs per Crucible run and draws per frame are both down ≥ 40 % and `setProgram` < 2 %.

Current integration checkpoint (2026-10-31): the retained rigid controller is already default-on;
`_opaqueBatchEnabled` is a separate package-planning switch. A published-144e434 Swarm wave-one
held-scene ABBA measures 742 retained versus 982 direct draws and 50.005 versus 66.645/66.555 ms p50
intervals at the same scene/camera/settings. Its original aggregate rejected retained off-state
census history; a separate source-backed reassessment accepts the live-mode and scene checks.
No default changed, active-flight causal win or visual parity is claimed, and M3's targets remain
open. See `INTEGRATION_COVERAGE.md` and `.devshots/main-thread-profile/opaque-retained-default-ab-144e/`.

Seven packages are now configured: Helios, the cockpit pilot (31→9 primitives, 22 joins), and five
shipbreaking-yard packages (169→43 primitives, 126 joins). Decoded same-winding/material triangles,
semantic IDs, anchors and collision metadata match; the five-package maximum vertex delta is
0.001608 WU. Live look/shadow and matched frame checks remain open. A separate compiler repair preserves dynamic
semantic pivots through quantization (13 compiler cases); actual compiled pivots in all 196 existing
dynamic packages match source, so that defect requires no package rebuild.

The retained controller now refills retired package CPU attributes under a lease before copying
batch geometry. A causal native case previously copied zero normals after retirement; the repaired
normal/UV case and cancellation, failure, deduplication and stale-owner cases pass (5 focused tests).
This establishes the copy contract; live batch appearance and performance remain open.

**M4 — The composite pass.** One full-screen composite draw costs 7.1 ms of GPU per frame
(`bloom.js:240-460`: 5-tap edge detect, extra edge taps, three bloom samples, contrast LUT, grade,
grain on a half-float target). Gate the expensive taps by tier, fold grain/vignette/grade into one
baked LUT, run at the render-scale target, early-out where bloom is zero. Done when the composite is
≤ 2.5 ms GPU on this laptop and a side-by-side look check passes.

**M5 — Smooth by default on this hardware (ruling 1).** `src/render/adaptiveQuality.js:~112-130`,
`slowFrameOffer.js`. Auto-apply the integrated-GPU tier when the GPU classifies integrated; dynamic
resolution in hysteresis bands (step down after N slow frames, up after M fast, never oscillate); a
sharpen pass so 0.75–0.85 render scale still reads crisp; the settings screen shows what was chosen and
lets the player raise it. Record every sacrifice in `docs/visual-assets/LOOK.md`. Done when the
Crucible bar meets its floor on this laptop with the picture judged still SpaceFace.

**M6 — Kill the loading, draft and title freezes.** `ASSET_PERFORMANCE_PROGRAM.md` §7.2 lists them:
the 2.5 s caption-layout storm (fixed, re-measure), `crucibleDraft.js _syncRailScale/_clipRailToWholeRows`
layout reads (border file — Lane 3 owns `src/ui/`; make the minimal fix and note it in their Inbox),
`pipSpannerPreview.js resize → setSize` 1.2 s native (size canvases once), first-sight program links on
the title (0.6 s, 1.6 s), the credits render, native pipeline compile, opening GPU admission, render-package
load. Map every long task ≥ 100 ms from Launch to first flight onto the CPU profile and fix it or slice it.
Done when the longest main-thread task from Launch click to first flight frame meets the floor, then the target.

Current cold Electron profile (`adventure-required-retry-r1`, committed 118d016 source) reaches flight in 55.5 seconds on the worker lane, Intel/ANGLE D3D11 with KHR parallel compile, at 85.7% sampled host busy. Render-pipelines takes 41.17 seconds; 46 first-use shader waits total 26.4 seconds. This is functional Launch acceptance, not a warm-load or matched improvement measurement; startup targets remain open.

The full preliminary authored cohort is restored, incomplete pipeline receipts no longer receive forced draws or readiness stamps, and required loading retries a typed pending-shader timeout under one tracked promise with the existing owner/cap/deadline guards. Focused owner checks pass. The earlier profile exposed a pass-specific readiness gap: bloom could inspect the last-bound program before Three selected a transmission variant. The guard now selects the target tone-mapping/output-color-space and instancing variant, with 18 focused cases passing against vendor-generated cache keys.

The `023c6fac5ee6` same-session public route reaches first flight in 41.1 seconds and its second Launch in 25.4 seconds, retaining the same renderer, canvas and WebGL context. The measured second run has two driver-link waits totaling 47 ms (maximum 27 ms), but render-pipelines still takes 23.21 seconds. Its loading-stage animation p99 is 17.3 ms; host busy is 48.2%. These are diagnostic observations, not a matched code-speed comparison or completion of the startup bars. The first cook timed out before touch/buffer completion; existing identity/version residency caches already skip work, so wholesale cook reuse is not justified. The profiler now measures the trusted Launch click and distinguishes post-transition composition diagnostics from explicit readiness blockers. See `.devshots/main-thread-profile/adventure-warm-claims-r1/` and `INTEGRATION_COVERAGE.md`.

Cook-stretch accounting now resets after a confirmed presented-frame advance across touch/buffer
yields, so later census work does not charge prior frames' wait time to the current frame. A
microtask yield retains its same-frame charge. The focused owner case passes; no startup-speed
improvement is claimed without a matched measurement.

**M7 — The loading screen is smooth and immersive.** The animation already draws in workers
(`loadingTerminalArt.js:~1784`, `bootRingWorker.js:~150`) and boot pacing yields between slices
(`bootShellPacing.js`), yet the owner sees it hitch. Measure with M0's gap probe *what* stalls it before
changing anything. Strong hypothesis: GPU-process stalls (driver program links, big texture/buffer
uploads, canvas allocation) block presentation of every canvas, worker canvases included — so the fix
is pacing GPU work into small budgets during loading (links issued in parallel under
`KHR_parallel_shader_compile`, uploads chunked, no canvas resizes), plus moving any main-thread-driven
progress text/DOM updates to compositor-only CSS (transform/opacity) or the worker. Then make it
beautiful: the loading screen is the first impression and should feel like the ship powering up.
Done when the loading-animation gap p99 meets the target with no visible freeze, judged on the real screen.

**M8 — Never die mid-session.** D268: every detached geometry (`packageCpuDetach.js`) must rehydrate on
context restore, never be resized after detach, and a frame error on a detached geometry rehydrates
instead of terminating (`presentationRunner.js`). D250: cap concurrent asset fetches and retry with
backoff. Add a forced-context-loss test and a 30-minute Adventure soak to the M0 bench. Done when the
soak + one forced context loss shows zero terminal panes.

Integration checkpoint 2026-10-31: world-entry serial projection and paused settlement publication are repaired. The committed 7f0 static-host public journey completes physical Ceres delivery, one 760-credit mission payment and completion, then F5 and title Continue restore the exact settled credits, cargo, standing, receipt and log. With the shared endpoint absent, actual browser quota handling stores the 4.61 MB serialized save as 1.43 MB gzip. Native worker checks also preserve the prior save after rejected raw and gzip writes, and serialize a delayed quota-failure acknowledgment before a newer save. The normal mounted-store public journey also passes, restoring the same exact settled identity while its large Quick primary is absent from localStorage. Both storage paths are accepted functionally; this is not a performance claim.

The earlier ae3e travel run exposed repeated real Three.js buffer-resize exceptions; they did not recur in the static journey. The existing error-only resize diagnostic remains enabled for functional route diagnosis. Full 30-minute Adventure/context-loss qualification remains open. The earlier baseline failed in 177,338 ms against the unchanged 90-second budget, with 26/27 Massline children passing and one physical-branch timeout. After the paired runner shares one identical 5,200-tick setup, the integrated batch-ten baseline passes 17/17 in 63,812 ms. This closes the current baseline check, not gameplay performance or the older resize cause. See `INTEGRATION_COVERAGE.md`.

The full-duration attempt on `99004b7cef7c` fails before context loss: after six warm-up
cycles, cycle 8's F9 restore lands in the startup-failed menu at `gpu-resources` because the
opening submission plan is incomplete. The strict capture phase fails after 142 ms; no frame
errors or page issues are recorded in its failure snapshot. This is an open production restore
defect. A subsequent targeted run on `1318a7ca4edb` reproduces it at cycle 2, with the first-playable
shader set complete. The corrected `526589161e1e` capture reproduces the failure at cycle 1: one
blocking entity root has zero drawable leaves, while hashes, first-playable programs and all three
resource identity sets match. That root was drawable when selected, so its eligibility changed
between paced walks. The existing failure diagnostic now retains its entity identity and compares
the selected/current root and exact leaf-exclusion state; no gate or admission behavior changes.
Another targeted run completes nine F9 cycles but fails the context-recovery tail with a real
Three.js buffer-size mismatch. A real loading-frame regression separately reproduces visibility/LOD
sync running after the picture graph freezes. Loading now holds its prepared scene until graph
release, including F9 with an old paint timestamp; ordinary post-paint flight remains live. Thirty
focused opening/lifetime cases pass. The original plan failure and buffer-size defect still need
public-route verification. See `INTEGRATION_COVERAGE.md`.

**M9 — Load less, load later.** 28 MB of minified JS in the eager closure (`scripts/build-bundle.mjs`,
esbuild splitting): lazy-load per mode and per screen; make `modelTruthCensus.generated.js` and
`en-US.generated.js` fetched JSON instead of chunk payload; move `ruckusMeshData/*.js` (3.4 MB of mesh
as JS) to a binary asset; take `src/testing/**` out of the retail graph (static imports in
`renderer.js`, `renderUpdatePhase.js`, `simulationRunner.js`, `sim/titleAttract.js`,
`data/causalFoundry/presentation.js` → a hook registry or build alias). D251: ship a lean
`FlightReadySet` and stream the rest after first flight. D252: fix the WebKit menu stall. Done when
the load rows of README §4 meet their floor.

Current measured working-tree checkpoint (2026-10-31): physical main static ESM closure is
15,490,568 raw / 4,816,400 summed-gzip bytes across 182 outputs, with batch-ten bundle receipt
`77ff49a0f7a2d9314830a4030594712b5c5ce3dadba8825521bddfd17f9f5795` (2808 files, 414 plans).
Batch nine is 200,318 raw / 62,355 summed-gzip bytes below batch eight. Pure attack readers now have
one shared owner; six eager consumers no longer import arena construction through
`adventureMigration.js`. Its legacy exports remain available. The emitted main closure excludes
that migration module and `survivalArena.js`; four focused suites pass 59/59 and generated module
preloads are synchronized. These working-tree builds include concurrent edits, so the exact delta
is not isolated attribution. Batch ten removes another 191,537 raw / 57,556 summed-gzip bytes:
the claims facade and renderer now use a shared read model without importing the claims simulation
owner and automation branch. Canonical claims uses the same readers, preserves the mutating owner
and legacy exports, and retains all four published facade reads. Its focused suites pass 50/50.
The 12 MB raw floor and runtime load bars remain open. Codex callers also use its one-shot request
mailbox without importing the lazy screen.

Optional new-game menu speculation now warms the fixed opening cast, chosen starter and scripted
onboarding roster without enumerating positionless distant-sector recipe stubs. Materialized launch,
Continue and arrival retain their own membership logic. The real owner-method tests pass 10/10;
source asset-byte estimates are not a measured network or startup improvement.

**M10 — First sight never stalls.** Adventure first-sight program links (`pipelineReadiness.js`
serializes every link behind one `linkActive` tail): issue links in parallel batches, use
`programBinaryCache.js`, and rely on M3's smaller program count. **Do not** prewarm with dummy meshes
(measured worse). Done when no first-sight link blocks > 16 ms in a fixed-seed Adventure route.

**M11 — Electron and browser flags.** A/B `--disable-renderer-backgrounding`,
`--force_high_performance_gpu`, `powerPreference: "high-performance"`, `--ignore-gpu-blocklist`,
and ANGLE `d3d11` vs `vulkan` (confirm the active backend in `chrome://gpu`). Keep what wins.

**M12 — Bound footage capture when its current cost warrants it.** The earlier 8–12 % FPS
claim is historical, not a current implementation requirement. The 2026-10-29 Crucible main-thread
profile (`finish-post-callout-main-2026-10-29`) records WebCodecs capture at 640 × 340 / 10 FPS:
recorder, codec and presented hook cost about 0.22 % of measured main-thread CPU, with no pixel
readback/createImageBitmap path observed. That profile does not measure GPU contention or establish
an isolated FPS cost. Keep replay reachable; do not disable or window capture solely to satisfy the
old estimate. Change its budget only if a current within-session comparison identifies a material
frame cost, preserving useful replay moments.

**M13 — Split the monoliths (one dedicated packet each, no other edits to that file in flight).**
`renderer.js` (36,741 lines) below 8k (row 412): the free functions into `render/runtime/*`, the `render`
object into per-concern modules (entity sync, shadows/LOD, residency/prewarm, post stage, lifecycle).
`vfx.js` (18,470) into `render/vfx/` per effect family. `partsLibrary.js`: collapse the 15 sync/"stepped
twin" pairs into one generator with a sync driver. Keep the moves bounded and use a suitable implementation tool; prove with
byte-identical golden digests, the boot census, and `check:baseline`. Do these **after** M1–M5 land.

Current extraction: `d309751297b3` moves the six shadow-depth staging methods into
`render/runtime/shadowDepthStage.js`, preserving their bodies and renderer-owned queues/lifecycle.
The focused setting-enable case, 28 admission cases, two retirement cases and 10 real-renderer
import cases pass. This is a bounded M13 step; the size target and current ordinary-route checks
remain open.

The current phase makes template instantiation and detached-object/place teardown use their
canonical stepped implementations for synchronous callers too. Synchronous abandonment cleanup
finishes inline; paced composition retains its existing queue and resource-retain lifetime. AI
doctrine tells and NPC Working Light signatures/contact/intercept methods now have family modules;
VFX keeps pools, subscriptions and cadence. All 26 moved method bodies match the originals after
normalizing the cosmetic random callback. The focused batch passes 70 cases, the baseline passes
17/17 in 62,394 ms against 90,000 ms, and the batch-eleven bundle gate passes (2808 files, receipt
`b6887a7a0427d120edfd878cc2f6f2655ca9e0cc166a582446e7b5bc1d136b36`). These working-tree checks
include concurrent edits; they establish neither the monolith size target nor a runtime frame gain.

### Wave A — the picture (taste; interleave with Wave M once M0–M5 have landed)

**A1 — Review every shipped asset.** 831 GLBs in `assets/ships/release` (`npm run perf:assets`,
`scripts/asset-census.mjs`, `asset-material-census.mjs`). For each family: look at it at the gameplay
camera with `node scripts/fleet-look.mjs` and open the PNG; fix what reads cheap; clamp place/works maps
that sit a few hundred pixels tall to 1024 (`place_works_derrick` 21 MB, `works_rover` 20 MB,
`works_inclusion_kit` 16 MB first), merge tint-only duplicate slots (68.7 % of 6,734 slots), make sure
every hull has an LOD chain, dedupe the duplicate refinery GLB and ORM textures, write a triangle and
texture budget per asset class into `check-asset-census.mjs`. Forge is the only way to build a body
(`tools/blender/forge/FORGE.md`, skill `forge-graphics`).
Current static-pilot appearance check: matched PLACE previews preserve the engine section, cargo module, corvette turret, weapon spar, pressure tank and cockpit section after material-group merging. Engine and cockpit INSPECT views also match. The repaired private-camera preview waits for strict authored admission before capture. These checks cover reconstructed preview meshes; gameplay placement, shadow parity and matched frame-cost savings remain open. The remaining-five capture is `.devshots/finish/integration-2026-10-31/shipbreaking-look/remaining-five-private-camera/`; Helios has no matched pair in this batch.

**A2 — Hero hulls and landmarks.** Row 428 (the five hulls a player meets in the first two hours, incl.
row 18 / D72 Pelican), row 17 / D54 (dark-freighter place model, Anvil well-edge, Wreck Cathedral draw
scale), row 557 art half (stencils, wear, kill tallies on traffic variants).
**A3 — Living-world art kits LW-A1…LW-A4** (`design/program/living-world/`, `node scripts/living-world.mjs --task=LW-A1`):
habitation/civic machinery, garrison/inhabited wreck, rock interiors/manufactured terrain, living
growth/quiet ritual. Lane 3 consumes them for the districts — publish each kit, then note it in Lane 3's Inbox.
**A4 — Every effect earns its frame.** Review each VFX family (`vfx.js`, `render/vfx/**`,
`docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`): a per-effect cost budget at the 150-body crowd,
readability of hits/kills/explosions in a crowd, GPU particles (`three.quarks` is already a
dependency) for the hottest CPU-updated families, no per-frame allocation.
**A5 — The look, budgeted.** `docs/visual-assets/LOOK.md`, `src/data/lookMoods.js`, `node scripts/look-bench.mjs`:
every sector mood re-judged after M4/M5 so the cheaper composite still looks Neon Industrial; D199
asteroid contrast; D229 metallic rewarm.

**A6 — SC-13 Cinematic Causal Feedback** (`design/program/strategic-chaos/`, `node scripts/strategic-chaos.mjs brief SC-13`):
the camera, slow-motion beats and effects that let a player *see* a chain reaction they caused. Extends
the existing camera/presentation owners; prove it with Lane 2's SC-01 playground once it lands.

### Wave R — release qualification (last)
**R1** deployed route on desktop and phone (`probe-deployed-mobile.mjs`), **R2** the 30-minute soak at
target, **R3** a final README §4 table on the final build.

## Critical owner map

These are the lane's high-impact systems and remain useful when a concrete player, renderer,
loading, memory or performance issue needs an owner: render frame/entity sync (`renderer.js`),
program admission/readiness, presentation/recovery, sim-worker lane, post-processing, VFX/pools,
asset loading/residency, quality governance, boot/loading, camera presentation and Electron shell.
This is an owner map, not a mandatory review queue or a claim that each system is at bar.

## Source coverage and current findings

The 2026-10-29 full-source inventory, reused reads and explicit coverage caveats are in
[`SOURCE_COVERAGE_2026-10-29.md`](./SOURCE_COVERAGE_2026-10-29.md). Current player-visible results,
open integration risks and route evidence are in [`INTEGRATION_COVERAGE.md`](./INTEGRATION_COVERAGE.md).
Use them before assigning work so completed reads and active findings are not duplicated. Source
coverage is not gameplay acceptance or a blanket quality verdict; close the concrete product
outcomes and performance/visual targets on this board with their relevant direct checks.

## INFERENCE (seed ≈ 20 lines in the brainstorm packet, README §6)

Seed directions — make each a grounded line in player words with a done check:
hits you can read in a crowd (impact flashes, hull sparks, debris that remembers who hit it); hull
damage states and smoke that persist; engine glow that tells you what a ship is doing (thrust, brake,
boost, idle, dying); wrecks that keep burning and venting; each sector's sky saying where you are;
station lights that work at night-side; asteroids with readable mass and material; the loading screen
telling a tiny story of the ship powering up; the kill you can see; muzzle flashes and tracers that
carry weapon identity; shield and Massline feedback on contact; tiny life in the background (traffic
lights, docking beacons, maintenance drones).

## Traps — measured and rejected; do not repeat

- Shader prewarm with dummy meshes (made the fly worse: 147 → 207–219 ms).
- Bloom off / strength down (~0.5 ms, 1 %).
- Re-enabling the old per-frame refit `BatchedMesh` (lost 250–616 ms); only the retained-slot path is a candidate.
- Re-quantizing or simplifying authored hulls to "save triangles" (nothing here is triangle-bound).
- Deleting hidden interior triangles at runtime.
- Toggling `light.visible` at runtime (forces a recompile).
- Footage recorder pixel-read variants (createImageBitmap, resize options, worker canvas, MediaStreamTrackProcessor) — reading pixels is the cost.
- Whole-run A/B across separate launches on this host (fps swings 10–45 with other load) — A/B inside one session.
- The runtime whole-ship LOD swap (turned off for blink defects; see memory `frame-sacred-lod-blink-mechanisms`).
- Quoting the 3.5 GB "all textures resident" figure as a runtime cost (live residency is ~71.5 MB).
