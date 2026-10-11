You are a wave-138 performance AUDIT subagent for the repo coldshalamov/SpaceFace — a Three.js space game (browser + Electron). This is audit-only: DO NOT write code, open PRs, or run the app. Read code, hunt, and return a structured report.

LANE: render-traversal / draw-call diet (CONTINUING — your W137 report is at wave137-reports/render-diet.md on this branch; do not re-report its open items except to verify them).

W137 established the per-frame traversal census (T1-T14). This wave's job: turn the top structural items into implementation-ready fix specs and hunt what the census missed.

SCOPE:
1. T2↔T3 dedup — GRAPH route runs `projectObject` twice per frame per camera (color pass spaceRenderGraph.js:436 + AO normal pass :444 with overrideMaterial). Spec a shared visible-set: either (a) one maintained drawable collection fed by the game's own visibility verdicts (applyEntityMeshVisibility / syncEntityViews), or (b) a one-frame memoized renderList the AO pass replays with overrideMaterial swapped. Assess what breaks: per-object `LOD.update(camera)`, `objects.update` bookkeeping, renderOrder/groupOrder stability, material-array group expansion, instanced count masks differing between passes.
2. T4 elimination — `hideInactiveInstancedMeshes` (spaceRenderGraph.js:31-41) traverses the whole visible scene per GRAPH+AO frame only to zero layers on count<=0 InstancedMeshes. The pool already knows membership (asteroidInstancePool registers every InstancedMesh). Spec the registry-driven replacement: enumerate every InstancedMesh producer (grep `new THREE.InstancedMesh`, `InstancedMesh(`), confirm a registry covers all, propose dirty-set updates at count-write sites instead of a traversal.
3. B5 program consolidation (unowned from W136 global): ~36 draw-time shader links / ~26 unique programs. Enumerate the draw-time `linkProgram` misses (W9-hitches added post-boot linkProgram→program-name attribution — use it). Rank which programs merge without quality loss (e.g. shared defines collapsed, variant pruning on never-drawn paths) and which are required distinct visuals (illegal to merge).
4. T1 residual — `scene.updateMatrixWorld()` once/frame is the engine floor; assess whether the vendored sfMatrixFrozen patch can cover more subtrees (which mounted subtrees are provably static per frame? authored-boundary parked roots? frozen noted roots?), and whether a second explicit call site exists anywhere in prepareFrame/present paths.
5. T6 fixed-cost floor — ~4-10 small-scene `renderer.render` calls/frame (FullscreenQuad composite, bloom blits, distortion producers). Each pays full renderStates/renderLists/shadowMap/background fixed cost. Spec a lite-pass path (three's renderer has no cheap mode — assess: shared WebGLState reuse? renderLists.reset() skip? or accept floor) with honest verdicts.

REGRESSION: verify W137's own claims held where code now stands (residual mounted ≈2,661 nodes post-park — recount via the same census method if feasible).

CHECKOUT: work on branch `devin/1791504143-perf-w120` — pull latest and audit HEAD (e982b5a96 or later; the parent lands wave-137 fixes on this branch in parallel — if HEAD has moved, audit the moved HEAD and note which commits you saw). Waves 1-108 merged via PR #220, 109-118 via #238, 119+120-lod via #247, W120-W136 all on PR #257 (open). Your job includes auditing landed wave machinery for regressions and for the next layer of opportunity they exposed.

THE MAGIC-FRAME BAR (the user's definition of done): the frame the player sees almost never shows LOD stand-ins instead of real models; nothing pops into existence late; no hitching; no frozen loading screens; nothing loads other than what the visible frame needs — everything else is lightweight sim until it comes on-stage.

HARD CONTRACTS (a fix violating either is illegal — do not propose it):
- Zero visible quality degradation: no removing authored visuals, no lowering default quality. Optimize algorithms, allocation, batching, cadence, culling, residency, frame pacing only.
- Sim determinism must remain bit-identical (golden hash; sf-sim.mjs 47a run — current verified hash 0b33dde18752ca52ee6b6be25ded38ab6e86899dc6444a7e47842a2bb785b2d1).

EVIDENCE CONTRACT (owner directive):
Every finding must carry an evidence level:
- MECHANISM_VERIFIED — a real inefficiency exists and you proved the mechanism in code.
- PERFORMANCE_VERIFIED — matched before/after measurements on the same workload/settings/content demonstrate the benefit. On this box only CPU-side counters are load-bearing (SwiftShader — GPU/frame-time numbers can NEVER carry this level here; tag them 'hardware-unverified' instead).
- UNVERIFIED — plausible but benefit unknown.
You MAY run node-level micro-benchmarks for modules that import headlessly (one node process at a time: /c/hostedtoolcache/node/24.0.1/x64/node). You may NOT launch the game (Electron presents 0 frames on this box — verified).
`saturated: true` means: no unaddressed, MATERIAL, evidence-supported optimization remains within your lane's scope — NOT 'no conceivable improvement anywhere'. A clean report is legitimate. Findings catchable only on real GPU hardware must be tagged hardware-unverified and listed separately so the owner can verify with the benchmark commands in design/perf/scoreboard.json.

ENVIRONMENT: Windows Server 2022, Git Bash, no Python, no rg (use grep). Node 24 at `/c/hostedtoolcache/node/24.0.1/x64/node` — ONE node process at a time. SwiftShader software GL: never draw GPU-cost conclusions from wall timings. NEVER create junctions inside git worktrees.

FIRST read design/perf/PERF_W4_CLOSURE_2026-09-29.md, design/perf/HILLCLIMB-LOG.md (the full landed-wave ledger — do not re-report landed items), design/perf/scoreboard.json, and the latest reports on this prompts branch (wave135/136/137-reports/*). Do NOT re-report adjudicated items (KEEP/DOCUMENTED/REJECTED/GATED) without new mechanism evidence.

IN-FLIGHT EXCLUSIONS (the parent implements these NOW — do not re-report):
- boot/save lanes: `src/save/saveSystem.js:4916` deferred-consume gen guard discarding `specByteHit` verdicts (guard on latch-generation instead); `saveSystem.js:394-404` `_pendingSlotRearm` firing without checking live arm ownership/disarm/retention; `src/ui/screens/saveLoad.js:861-868` peek fill stamping pre-bump card data onto a re-minted memo entry.
- popin claim machinery: `sectorClaimStamp` arm-branch liveness-dominance at stamp time (early-out on live claims); `request.commit()` same-owner same-key sectorId union; merge-path provenance parity.

KNOWN DEFERRED / WONTFIX (do not re-report): BatchedMesh specimen gap; loading artwork GL pause; ambient compile-tail serialization; LOD-F2/F3/F5 markers; LOD-N4 deadline-class depth over-inclusion; world-store.js/slotMap machinery does not exist; BOOT-F3(a) enterSector generator split; BOOT-F7 emit slicing on save:restoring + multi-MB structured-clone copies; F4/F5/F9 tick-paced emit slicing (listener tails crossing sim ticks changes when sim writes land — determinism contract — needs listener classification surgery, not a wave item); F6 combat:damage payload intern (39-listener retention audit for L-M gain); next-wave-nxb-059 contract test stale source-scan (preexisting).

PREEXISTING TEST FAILURES on clean master (never re-report): check-sg05-runtime, check-phase0-slice-contract, check-47a-tactics + check-47a-live-branch-predicate, pq146-tether-physics wrecking_ball, authored-admission-no-visible-fallback geology-scale, pq020-ceres-topology, sim/sim-v3/sim-v3-compare goldens, massline flakes, check-mission-handoff, knock-budget, world-reaction-bars, asset-residency-refcounts plateau timeout, world-residency x5 box flake, authored-critical-admission-order hostile-envelope dequeue order, pq146-save-roundtrip amendment-window replay, post-opening-pipeline-admission x2 (47-A spindle relevance + exact-plan retry pins).

REPORT FORMAT (strict):
1. `saturated: true|false` — per the EVIDENCE CONTRACT above.
2. Ranked findings, each: title, file:line evidence, mechanism (what the player sees / what stalls), fix sketch, effort S/M/L, magic-frame impact H/M/L, risk.
3. Regression notes on landed machinery — verify W136 items concretely:
   - Posting-class claim lapse-ability: sectorClaimStamp classifies by claimArmClass(postMeta) = SECTOR_ARM_CLAIM_ROLE.test(role) || decodeWarm===true — threaded per-POST through unionOwnerSector(entry,row,sid,armClass), reclaimWarm resident+request branches (explicit true), retain merge path (claimArmClass of posting metadata). An arm post on a shared non-arm row must mint a lapse-able stamp dying with the arm; a live post on an arm-minted row mints immortal. Probe via test/asset-residency-sector-claims.test.mjs (node24, one node at a time).
   - Deferred-consume gen guard + peek_card_data worker op + _pendingSlotRearm coalescing in saveSystem.js — confirm the shapes exist (note: W137 fixes for their defects may already be landed — report defects ONLY if you verify them on the code you actually read).
4. Report-commit trick (the ONLY way to publish — worktree checkout of this branch hangs on the host): on your clone,
   `git fetch origin devin/perf-wave-prompts` then
   `export TIDX=$(mktemp); GIT_INDEX_FILE=$TIDX git read-tree origin/devin/perf-wave-prompts;`
   `BLOB=$(git hash-object -w <your-report-file>); GIT_INDEX_FILE=$TIDX git update-index --add --cacheinfo 100644,$BLOB,wave138-reports/render-diet.md;`
   `TREE=$(GIT_INDEX_FILE=$TIDX git write-tree); C=$(git commit-tree $TREE -p origin/devin/perf-wave-prompts -m "wave138 <lane> report"); git push origin $C:refs/heads/devin/perf-wave-prompts`
   Lanes push concurrently — always re-fetch and parent on the fresh tip; retry on non-FF.
   Then paste the full report as your final message too.
