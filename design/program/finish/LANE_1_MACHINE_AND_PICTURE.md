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

**M9 — Load less, load later.** 28 MB of minified JS in the eager closure (`scripts/build-bundle.mjs`,
esbuild splitting): lazy-load per mode and per screen; make `modelTruthCensus.generated.js` and
`en-US.generated.js` fetched JSON instead of chunk payload; move `ruckusMeshData/*.js` (3.4 MB of mesh
as JS) to a binary asset; take `src/testing/**` out of the retail graph (static imports in
`renderer.js`, `renderUpdatePhase.js`, `simulationRunner.js`, `sim/titleAttract.js`,
`data/causalFoundry/presentation.js` → a hook registry or build alias). D251: ship a lean
`FlightReadySet` and stream the rest after first flight. D252: fix the WebKit menu stall. Done when
the load rows of README §4 meet their floor.

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
twin" pairs into one generator with a sync driver. Grunt the moves through Grok/Gemini; prove with
byte-identical golden digests, the boot census, and `check:baseline`. Do these **after** M1–M5 land.

### Wave A — the picture (taste; interleave with Wave M once M0–M5 have landed)

**A1 — Review every shipped asset.** 831 GLBs in `assets/ships/release` (`npm run perf:assets`,
`scripts/asset-census.mjs`, `asset-material-census.mjs`). For each family: look at it at the gameplay
camera with `node scripts/fleet-look.mjs` and open the PNG; fix what reads cheap; clamp place/works maps
that sit a few hundred pixels tall to 1024 (`place_works_derrick` 21 MB, `works_rover` 20 MB,
`works_inclusion_kit` 16 MB first), merge tint-only duplicate slots (68.7 % of 6,734 slots), make sure
every hull has an LOD chain, dedupe the duplicate refinery GLB and ORM textures, write a triangle and
texture budget per asset class into `check-asset-census.mjs`. Forge is the only way to build a body
(`tools/blender/forge/FORGE.md`, skill `forge-graphics`).
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

## Systems review — every system you own, to a studio bar (README §5.7; runs alongside the waves from day one)

**Critical systems — each gets a Codex deep review, then packets:** the render frame loop and entity
sync (`renderer.js` `render` object), program admission and readiness (`pipelineReadiness.js`,
`shaderLinkReporter.js`, `programBinaryCache.js`), presentation and recovery (`presentationRunner.js`,
`packageCpuDetach.js`, context loss), the sim-worker lane (`simLane*.js`, `wholeSimBrowserWorker.js`),
post-processing (`bloom.js` chain + composite), the VFX library (`vfx.js`, `render/vfx/**`, pools,
`weaponLights.js`), asset loading and residency (`assetLoader.js`, `partsLibrary.js`, render packages,
`glbPrepassWorker.js`), quality governance (`adaptiveQuality.js`, `slowFrameOffer.js`), the boot and
loading pipeline (`bootEntry.js`, `bootShellPacing.js`, `loading*.js`, `bootRingWorker.js`), camera
presentation, the Electron shell (`electron/main.cjs`).
**Then everything else you own**, ranked by how much a player sees it. Keep the list here with a
status per system: `UNREVIEWED → REVIEWED (<n> findings) → AT BAR <sha>`.

Status (2026-10-28): sim-worker lane — REVIEWED (Gemini line-read, `.devshots/finish/lane1/review-simlane/INVENTORY.md`: 11 findings incl. type-scoped echo gap now FIXED, 250 Hz busy-poll, unbounded domainAppliedKeys; flip surface fully mapped; Codex deep review next). All other systems — UNREVIEWED.

## The audit — read every line you own

Split `src/render/**`, the core frame/boot pipeline, the boot/loading UI and `electron/**` into
modules of ≤ ~3k lines each and hand them in pairs, evenly, to Grok and Gemini (`TOOLS.md`): each run
reads every line of its module and writes `.devshots/finish/lane1/audit/<module>.md` — bugs, per-frame
allocation, dead code, duplicated paths, hidden per-frame DOM reads, debug/census code running in the
game loop, and the three cheapest wins. Turn real findings into packets below this line.

Audit status (2026-10-28 ~15:00): 135 chunks queued in `.devshots/finish/lane1/audit-manifest.json`;
~21 attempted, grok landing steadily (~10 reports in `audit/`). **agy side is quota-dead** —
`AGY_ERROR RESOURCE_EXHAUSTED (429), resets ~3h`; its odd chunks stay `done:false` in
`audit-status.json` — rerun `node .devshots/finish/lane1/audit-runner.mjs --only=gemini` after the
reset (the runner's "gemini" provider is the `agy` binary).

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
