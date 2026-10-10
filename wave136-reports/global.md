# Wave 136 — Blind Global Bottleneck Review

Audited `devin/1791504143-perf-w120` @ `0bfa9fed0` (82 ahead / 30 behind origin/master at audit time).
Read from source, not wave history. Ledger files consulted only for the mandated `READ FIRST` set
(`design/perf/scoreboard.json`, `PERF_W4_CLOSURE_2026-09-29.md`, `HILLCLIMB-LOG.md`); conclusions
below were derived from the code and are tagged per evidence level.

Evidence levels: **MECHANISM_VERIFIED** = the code structure provably costs O(claim) per frame/tick.
**PERFORMANCE_VERIFIED** = owner-hardware receipt exists. **UNVERIFIED** = plausible, not measured.
**hardware-unverified** = magnitude needs the owner GPU; this box is SwiftShader + Electron 0-frames.

---

## 1. Ranked bottlenecks (largest first)

### B1 — Whole-scene graph traversal, once per frame per render pass
**Evidence:** `src/render/renderer.js:31892-31898` (`_renderPostRoute` calls
`scene.updateMatrixWorld()` every presented frame) → three's recursive walk at
`node_modules/three/build/three.module.js:17613` (`projectObject(scene, …)` calls itself over every
child at 17875). Under the GRAPH route the scene is submitted **twice**
(`src/render/post/spaceRenderGraph.js:436,444` — normal pass + color pass each do a full
`renderer.render` → each re-walks the whole mounted graph for culling/list-build), plus producer and
composite traversals at :796/:842 and shadow-pass traversals inside `renderer.render`.
The in-tree comment at `renderer.js:22910-22917` is the anchor: 16,506 mounted nodes in a seed-4242
Crucible fight (13,845 were warm roots — now parked) and `updateMatrixWorld` alone measured **~11 ms
a frame on the owner iGPU**, called "the largest single cost in the fight."
**Size:** O(mounted nodes) × O(passes) every presented frame. Residual mounted set is still
thousands of nodes in dense scenes; each pass pays its own traversal because three has no
frame-persistent render list.
**Level:** MECHANISM_VERIFIED (structure) / owner-measured magnitude for the pre-park figure;
current residual magnitude **hardware-unverified**.

### B2 — Presentation triple-copy: world → snapshot fence → entity views → mesh transforms
**Evidence:** `src/render/snapshotFence.js:316` (`packPresentationWorldToFence` — dirty-row SoA copy
into 3-buffer fence, stepped twin at :405 still consumed fully inside the presented frame),
`src/render/renderer.js:26346` (`syncEntityViewsSteps` — ~665-line stepped generator over **all**
liveView slots: pose write, visibility submit, shadow policy, HUD marker aux, frozen-sleep checks;
driver at 28190 exhausts it inline per frame), then `applySnapshotPoseToMesh` writes
position/rotation (+bank/pitch) per visible row and calls `updateMatrix()` on non-auto meshes.
**Size:** O(active slots + visible rows) × 3 copy stages per frame, on top of the per-row branching.
**Level:** MECHANISM_VERIFIED.

### B3 — Sim-atomic bursts inside `registry.step`
**Evidence:** `src/systems/economy.js:1564-1636` (`econTick`, every 5 s sim time: nested
`for sid in markets / for cid in market` — refreshListingDemand + cycle regime advance +
recomputePrices + recordPriceHistory per listing, then propagateEvents). Scoreboard receipt: p50
2.7 ms / p95 3.9 ms in a single uninterruptible call. Also `src/systems/world.js:4448+`
(observe-gated `_tickResidency`/`_tickZoneLabel`/`_tickPOIScan`, plus per-tick `_tickScan`,
`_tickHazards`, `_tickAsteroidFieldInteractions`, `tickAlienEcology`, `tickFarActors` fanout across
~57 registered systems in `src/core/registry.js` UPDATE_ORDER). A burst inside step() cannot be
shed — `MAX_CATCHUP_STEPS=4`/`HITCH_FRAME_TICKS=6.5` only shed *whole ticks*, never mid-call.
**Size:** per-tick spikes up to ~4 ms on the measured econTick; world observe scans are cheaper per
occurrence but additive.
**Level:** MECHANISM_VERIFIED structure + PERFORMANCE_VERIFIED magnitude for econTick (receipt);
world-scan magnitudes UNVERIFIED on hardware.

### B4 — Physics FFI allocation span (Rapier JS boundary)
**Evidence:** `src/core/sg02DynamicBodyOwner.js:907-910` — per dynamic record per substep:
`body.translation()` + `body.linvel()` + `body.angvel()` + `body.rotation()` each allocate fresh
objects across the WASM boundary; `contactPairsWith` callback crossings at :1204; evidence
re-reads at :1149/:1177/:1327/:1351-1352 (`linvel()` before/after for impulse observation);
post-step `_readPostStepKinematics` + `_applyStructuralGive` per record. Called from
`src/core/physics.js:204-248` (`update` → `_syncSg02DynamicAuthorityEntities` → `_sg02.step` with
accumulator substepping).
**Size:** ~6–10 boundary crossings + fresh-object allocs × awake dynamic bodies × 60 Hz.
**Level:** MECHANISM_VERIFIED (allocating getters are confirmed in-code); magnitude UNVERIFIED
without an awake-body census.

### B5 — Shader-program diversity / first-draw link set
**Evidence:** campaign B-metric = **36 draw-time shader links** on owner hardware; independent count
in W4 closure doc puts ~26 unique programs/frame as the structural floor (per-route permutations:
GRAPH vs BLOOM vs NATIVE × material families × shadow/depth variants — see route dispatch at
`renderer.js:9403-9405, 18394-18398`). Each unseen program is a synchronous compile+link inside a
presented frame (draw-time miss).
**Size:** bounded count but each link is multi-ms on real drivers; 36 first-draw misses across the
opening is the B metric.
**Level:** PERFORMANCE_VERIFIED (B metric on owner hw) / current residency path MECHANISM_VERIFIED.

### B6 — Boot/save-path atomic legs
**Evidence:** `src/save/saveSystem.js` — multi-MB `JSON.parse` on settle (:2642-2670), several
`JSON.stringify` legs (:1280, :1675-1766, :2151) with partial slicing already present
("Yield before the push — its JSON.stringify is an unsliced O(store-bytes)" at :607);
`src/render/assetResidency.js` ledger sweeps and enforce-plan census walks. These serialize inside
click paths (Continue / slot select / autosave).
**Size:** multi-MB strings parsed/stringified synchronously; boot lane has sliced several but
residual legs remain each wave (F1–F4 findings in recent waves were all M-class atomic legs).
**Level:** MECHANISM_VERIFIED.

### B7 — Per-frame instanced submission re-sync + residency services
**Evidence:** `prepareFrame` (~`renderer.js:27807-28306`) runs `_syncAuthoredInstanceSubmission`,
asteroid instance submission, `serviceRenderMeshResidency`, contact-shadow/ship-aux pools, backdrop,
and camera occluder updates every presented frame — dirty-gated but per-frame checks across every
instance family.
**Size:** O(instance families + residency entries) checks/frame; cheaper than B1/B2 but never zero.
**Level:** MECHANISM_VERIFIED.

### B8 — Bounded drain machinery overhead
**Evidence:** `src/core/presentationRunner.js:1209-1213` — per-frame `drainEmitSlice` +
`drainPresentationTail` + compile drain with wall-clock floors + paced ledger (`eventBus.js`
sliced-emit restart/backlog handling ~:376-527). Each slice pays scheduler bookkeeping; the floors
mean a presented frame always carries some drain work even when idle.
**Size:** small per frame, but it's permanent overhead the lanes deliberately bought to bound
variance.
**Level:** MECHANISM_VERIFIED — and largely *working as designed*.

### B9 — Heap floor / GC
**Evidence:** owner D-metric 485 MB heap floor; HILLCLIMB-LOG buffer census: 251 MB owned typed
arrays (later reduced), 157 MB meshopt transient decode output, 29 MB canvasTextures (scratch
pooled, KEPT). GC majors on owner hardware.
**Size:** capacity, not per-frame; shows up as majors in long sessions.
**Level:** PERFORMANCE_VERIFIED on owner hw; not measurable here.

### B10 — VFX/UI per-frame cost
**Evidence:** `renderUpdatePhase.js` — `vfx.update` (bomb + liveVfx sets), `feel.frame`, `ui.frame`
every presented frame regardless of activity.
**Size:** bounded but serial on the same thread.
**Level:** UNVERIFIED magnitude.

**Composite picture:** the four lanes burned down *variance* (admission, drains, boot stalls, late
pop). What remains is the *steady-state floor*: B1+B2 cost every frame regardless of anything being
wrong, B3+B4 cost inside every sim tick regardless of pacing. That is why A=3124 frames/60 s sits
below 3600 with all lanes closed — the floor is the deficit.

---

## 2. Lane coverage map

| Bottleneck | lod-in-frame | popin-admission | boot-loading | in-flight-hitches | Verdict |
|---|---|---|---|---|---|
| B1 scene traversal | — | — | — | — | **MISSED ENTIRELY.** No lane owns steady-state traversal cost; hitches lane paced it, never shrank it. |
| B2 triple-copy | partially (it manages stand-in/visibility writeback) | — | — | partially (paced/ledgered, not removed) | **PARTIAL.** Floors and steppers cap spikes; the copy chain itself is untouched. |
| B3 sim-atomic bursts | — | — | — | deferred (sim-authoritative, golden-hash risk) | **PARTIAL/MISSED.** Named in `worstRemainingBottlenecks` but the lane closed with them deferred. |
| B4 physics FFI | — | — | — | tracked-for-S1 | **PARTIAL.** Known, parked pending the worker lane. |
| B5 shader diversity | — | admission timing is popin's domain | first-draw links (boot lane's B metric) | — | **PARTIAL.** Lanes manage *when* links happen; nothing owns *program count*. |
| B6 boot/save legs | — | — | **effective** — findings every wave, shrinking | — | **EFFECTIVE.** Correct lane, diminishing returns. |
| B7 residency/instancing sync | — | partially (admission cadence) | — | partially | **PARTIAL.** |
| B8 drain machinery | — | — | — | is the mechanism | n/a — it IS the lane's tool. |
| B9 heap floor | — | — | — | — | **MISSED.** No lane; D-metric is owner-side only. |
| B10 vfx/ui frame | — | — | — | partially | **PARTIAL.** |

Pattern: the lanes are all *admission/variance* shapes. B1, B3, B4, B9 are structural
(steady-state or sim-internal) and sit outside every lane's charter. The scoreboard's own
`worstRemainingBottlenecks` names exactly this set — the blind read agrees.

---

## 3. Approaches for the worst bottleneck (the main-thread floor)

The worst is not one item — it is that **sim + presentation-copy + scene traversal + GL submit all
share one thread**. Ranked by leverage:

### A. Sim-worker adoption — PR #260, `devin/s1-sim-worker-spike` (head `875e103fc`)
Removes B3 + B4 + all tick-time sim cost from the main thread. Already built: worker lane is the
DEFAULT (`resolveSimLaneFlags`, `?simLane=main` escape), 120-type main→sim forward set
census-generated, fail-closed 5 s stall quarantine mirroring the in-process `close()` contract,
golden hash bit-identical on both lanes (scoreboard s1Spike.stageA), check-game-playable 16/16+18/18.
**Best single lever on the list** — needs merge, not more spikes. Remaining stage-B work:
`cargo:jettison` rpc + facade-miss census/gate; Electron SAB needs COOP/COEP headers (transfer
channel p95 0.85 ms measured is already acceptable).

### B. Render-list diet — kill the recursive traversal (attacks B1 directly)
Replace three's per-pass `projectObject` walk with a maintained flat drawable registry:
the renderer already knows which meshes are mounted/visible (syncEntityViews computes exactly that);
submit a frame-persistent array to a custom render path or a minimal vendor patch instead of
re-deriving it O(scene)×O(passes) every frame. Owner measured ~11 ms/frame for `updateMatrixWorld`
alone pre-park — the residual still walks every mounted node ≥2×/frame under GRAPH.
Effort L, impact H on hardware, risk M-H (vendor patch surface). **This is the largest single
remaining main-thread item and no lane covers it.** W121's blind global sketched it as
"flat renderable-leaf registry"; it is still unimplemented.

### C. Fence→view direct binding (attacks B2)
Views could read pose/visibility straight from fence SoA columns (transform feedback / per-frame
uniform buffer / instanced pose attributes) instead of writing `mesh.position`/`rotation` per row
and letting three re-derive matrixWorld. Eliminates one whole copy stage and shrinks the per-row
sync sweep to a dirty walk. Architectural; pairs naturally with B.

### D. Off-thread decode/transcode with transferables
GLB parse + KTX2/meshopt transcode in workers, shipping transferable attribute buffers to main for
GPU upload only. Residual boot/popin cost (B6/B7) without touching GL.

### E. Program consolidation (attacks B5)
Collapse ~26 unique-programs-per-frame toward fewer material roles (shared defines, uber-shader
families) so first-draw links and state changes shrink. Moderate effort; the prior
exact-key/dummy-prewarm rejection was about *warming strategy*, not about reducing the count —
distinct work.

### Adjudicated and not recommended as primaries:
- **Data-oriented simulation** — fence/SoA already exist on the presentation side; converting the
  sim's entity store is a massive rewrite for less isolation benefit than A delivers today. Reject.
- **Instancing/batching restructuring** — already KEPT (765→54 leaf draws). The rejected rigid
  opaque batching lost to repack cost; only revisit via a retained-slot design *if* headed draws
  prove out — gated on hardware.
- **GPU pipeline restructuring / alternative backends** — WebGPU stays GATED: port cost unjustified
  while the WebGL presentation floor itself is unmeasured; draw-indirect (needed for GPU culling)
  doesn't exist in WebGL2 anyway. Revisit only if WebGPU adoption is a real target.
- **Simulation workers beyond PR #260** — A *is* the sim-worker approach; a second partition scheme
  (split systems across N workers) multiplies transport/determinism risk for marginal parallelism.

---

## 4. Sim-worker adoption review — PR #260 (`devin/s1-sim-worker-spike` @ `875e103fc`)

**What it actually is (vs a spike):** a full runtime split, not a kernel. `simLaneMain.js`:
worker realm owns all authoritative systems + sim bus + journal + RNG + world tables; main realm
owns presentation/UI/DOM/settings + a mirrored state facade. Default-flipped (worker serves unless
`?simLane=main` or `localStorage sf.simLane`), with `?simSab=1` opt-in for SAB transport behind
`crossOriginIsolated`.

**Transport soundness:** seq-keyed `pending` map + single `inFlight` directive; `LANE_STALL_MS=5000`
fail-closed quarantine matching the in-process runner's `close()` contract (`simLaneMain.js:706-735`);
accumulator arithmetic reuses `advanceFixedTimestep` verbatim (:899-922); journal ack flow
(`pendingAckEnd`) + `journalRebuild` rpc for rebuild requests; entity payloads deep-flattened to
`{entityRef}` tokens over the wire and rehydrated to mirrored rows (`remapEventPayload`);
`entityList` refilled per reply preserving array identity and aliases; `KNOWN_UNFORWARDED` set
correctly lists presentation/UI/audio types (~62) that must never cross; domain mirrors graft
leaf-path updates onto state roots without touching main-owned siblings; `DOMAIN_MIRROR_EMITS`
re-emits facade signals (e.g. `mission:updated`) on mirror land so renderers don't race differ
cadence. The emit-context shim deadlock fix at head shows the fail-closed discipline is real.

**What changed vs expectation:** deeper than "offload physics" — the whole step moved, preserving
the `simulationRunner` contract (main-lane twin `simLaneMain` → identical advance/shape semantics).
Lane-parity verdict layer + golden hash identical on both lanes is the correct integrity gate.

**What it does NOT cover:**
- The entire presentation pole: fence pack, syncEntityViews, scene traversals, GL submit, decodes,
  uploads all stay main-thread — **B1, B2, B7 untouched**. The floor after merge is exactly
  those plus B5/B6 residue.
- Sim bursts are *moved, not shrunk*: econTick is still a 2.7–3.9 ms atomic call, just off the
  presented-frame path (now tick-latency within the 5 s stall bound, not a hitch).
- Facade-miss census incomplete: `cargo:jettison` rpc is the named stage-B gap.
- Save/load ships the whole `sf.*` localStorage keyspace into the worker storage shim
  (`__laneStorage`) — an N-MB clone per save click worth a second look.
- 22 merge conflicts / 172 overlapping files at last merge — landing it is real work, not a flag flip.

**Verdict:** pursue to merge. It is the only built approach that removes a named worst set (B3+B4)
wholesale; everything else on the list is additive on top of it.

---

## 5. Rejected-approach reconsideration

| Approach | Old verdict | Fresh look |
|---|---|---|
| Sim worker (corpus item 14) | GATED — "copy<savings spike unproven" | **RESOLVED — spike proved it, lane is default.** Docs lag reality. |
| econTick split/slice | deferred — sim-authoritative, golden-risk | **Worth a fresh look after the worker lane.** On the worker the burst no longer stalls presented frames — only tick latency; splitting still must preserve RNG order (golden), but the risk profile changed from "frame hitch" to "reply latency". Cheap option: do nothing — A already neutralizes it for frame pacing. |
| Rigid opaque batching | GATED on headed draw-count | Still gated. Same hardware dependency. |
| Exact-key/dummy prewarm | REJECTED (147→207–219 ms regression) | Holds — that measured regression stands. Reduce program count instead (§3-E). |
| texture residency evict | REJECTED with evidence | Holds. |
| upload-after-present / compose-part-slice / next-contact warm / leftover admission | REJECTED (zero-hitch receipts) | Hold — evidence was clean. |
| GPU culling / meshlets / imposters / virtual texturing | DOCUMENTED-dead on WebGL2 | Hold — no draw-indirect in WebGL2; revisit only under WebGPU. |
| three-mesh-bvh | DOCUMENTED | Hold — raycast isn't in the top set. |
| event interning | REJECTED | Hold — bus is 0.136% self-time. |
| WebGPU | GATED | Hold — see §3; not until the WebGL floor is measured. |

---

## 6. Saturation verdict

**`saturated: false`.**

The representative game is *not provably fast on declared hardware* — the owner metrics (A=3124
frames/60 s target-bound, B=36 first-draw links, C=3 long tasks, D=485 MB floor) are measured on
owner hardware only, and material evidence-supported work remains:

1. **B1 (whole-scene traversal)** — mechanism verified, owner measured ~11 ms pre-park, unowned by
   any lane, unimplemented fix sketched.
2. **B3/B4 (sim-atomic bursts + FFI)** — verified, removed-by-adoption path exists (PR #260) but
   unmerged.
3. **B5 (program diversity)** — verified count, no owner lane.
4. **B9 (heap floor)** — verified on owner, no lane.

**Hardware-blocked parts of this review:** all magnitude claims for B1 residual, B2 per-frame cost,
B4 FFI span, B7 sync cost, B8 overhead, B10 frame cost; the A/B/C/D metric deltas themselves; and any
verdict on GPU-side work (fill, upload timing, link cost, draw count). This box runs SwiftShader and
Electron presents zero frames — every GPU/frame-time conclusion here is structural or deferred to
owner receipts, and is tagged accordingly.

**Recommended order:** land PR #260 (removes B3+B4) → render-list diet for B1 → fence→view direct
bind (B2) → program consolidation (B5). Boot lane keeps grinding B6 as scheduled work.
