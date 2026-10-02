# Structural Horizon — Drastic Perf Levers (wave-26 vantage)

Triggered by the user question: "are you getting stuck in a local maximum — are there more drastic things that'd improve performance without hurting quality?"

Scope rule: every lever must satisfy the two hard contracts — zero visible quality degradation, and bit-identical sim determinism (`sf-sim.mjs` golden, sha256 `e517a97b…`). Everything below is execution-placement, layout, or scheduling — no behavior change.

## S0. Worker-side sim — ADJUDICATED, conditions not yet met

`design/perf/w4-workersim-REPORT.md` measured this to a dead end: whole sim ≈ **0.57 ms/tick**; the only kernel over the 5 ms bar is `econTick` (~19 ms ×2/run) which fails isolation (synchronous mutating `quote()`/`execute()` public API, rng draws on read paths, ~10 same-tick listener families). Bit-identical application requires blocking waits → transport overhead exceeds savings. `sim.js` is already a headless worker-ready host and `simWorkerHost.js` holds the phase-14 SAB seam, but the route is gated on:

- (a) a kernel > ~5 ms/invocation with isolated state — economy would qualify *after* a pure-snapshot refactor of its read paths;
- (b) `entityList` emptied → far-actor SoA + SAB triple-buffer (PQ-067 precondition);
- (c) deterministic-async contract renegotiation (deferred application is illegal under the golden today).

Status: revisit conditions live in the W4 report; the W-lane campaign keeps shrinking the blockers (index lanes are the SoA direction) but does not meet (a)/(b) yet.

## S1. Worker-side RENDER — the inverted variant (highest ceiling)

The ordering blocker that killed worker-sim does not bind its mirror: the render lane is a *downstream consumer* of sim state. A late or dropped snapshot just presents the previous frame — no authoritative ordering to violate. The codebase already has the consumption seam: `presentationRunner` drains `simulationRunner.consumeLatestCompletedTick()` + `interpolationAlpha()`, and `createRenderFrameMembrane(state)` exists as a render-side boundary object.

- **What moves**: `renderer.render(scene,camera)` + the whole three.js submit path onto an `OffscreenCanvas` in a worker; main keeps sim + DOM/UI + input.
- **What's hard (measured today)**: the render lane reads the live `state` object directly — ~60 `state.entities`/`entityList` touch sites in `renderer.js` alone, plus feel/ui/audio systems. The transport needs a per-frame read-model (the "active-set membership as an authoritative command stream" the phase-14 comment names as missing), or SAB columns for hot fields (pos/vel/alive/kind) plus object-identity events for mount/unmount.
- **Why it pays under the bar**: every remaining hitch class — econTick spikes, restore slicing overshoot, decode drain, GC — stops dropping *frames*; the magic frame can't freeze because presentation no longer shares a thread with sim bursts.
- **Effort**: XL (a dedicated spike: measure the render-lane read surface, prototype pose transport for ships only, scale out). **A/B**: identical gameplay probe driven by scripted inputs, sim on/off worker — bit-identical golden (headless path untouched), frame-time histogram diff, dropped-frame count under injected sim spikes.
- **Risk**: highest of the list — UI/canvas interleave points and DOM-coupled render reads are the migration surface.

## S2. SoA entity columns (PQ-067 precondition + direct GC win)

Entities are object literals in `entities:Map` + `entityList:Array` + index lanes. The W4 report names `entityList` emptying as the gate for the SAB transport shape.

- **Smallest honest step**: a position/velocity/rotation `Float32Array` sidecar for the physics-read path (broadphase, cull, optic lane) — readers get vectorized columns, object API stays for everything else. Writers stamp through the existing index-append path.
- **Ceiling**: M (GC pressure + cache misses on per-tick iteration) now; unlocks S1's cheap transport later.
- **Effort**: L. **Contract**: sim-visible behavior unchanged if writes stay single-source (sim writes columns; objects become views or are stamped from columns at the same tick point).

## S3. Instanced/BatchedMesh for repeated static geometry — needs new density evidence

Adjudicated-deferred since W4. Re-open condition: measure the actual per-frame draw-call/vertex cost of repeated static bodies (asteroid field, debris, dressing props) at current population. If a scene draws N>~50 same-geometry statics, instancing is a real draw-call win with zero visual change. **Effort**: audit S + implementation M. Only proceed past audit if the density evidence says yes.

## S4. Decode/compile fan-out depth

The runway already class-orders decodes (visible→deadline→ambient) through worker prepass. What remains: the pool width and transcode/program-link serialization points.

- Audit: worker pool size vs decode queue depth during an admission burst; KTX2 transcoder parallelism; whether the GL program link step is still main-thread-serialized per program (compileAsync/`KHR_parallel_shader_compile` coverage — already partly landed via precompile salvos).
- **Ceiling**: M — shaves the tail of admission bursts; doesn't change what the magic frame needs, only how fast the deadline cohort clears.

## S5. Residency horizon — sector-graph lookahead

Current warm horizon is the incoming sector + membership-candidate dwell. A two-sector-deep, byte-budgeted prefetch (weighted by jump-probability from the route graph) would cover plotted multi-hop routes; cost is wasted decode on unvisited branches — bounded by the existing soft-lease eviction. **Effort**: M. **Ceiling**: M (only the second hop of multi-hop travel gains).

## S6. Frame-graph ordering inside the present frame

Cheap complement to S1: audit that within a presented frame, present-critical work (scene graph updates for already-admitted bodies, uniform updates, draw submit) is ordered strictly before deferred work (diagnostics publish, residency bookkeeping, emit drains). The presentation-tier bus + drain machinery exists; this is ordering, not new machinery. **Effort**: S-M. **Ceiling**: M — protects the tail of a heavy frame.

## S7. Economy burst slicing — the last measured main-thread spikes

The W4 kernel census left two ~19–30 ms spikes on the main thread (`econTick`, `save:loaded→refreshAllPersistentDemand`), and the report itself flags the cohort-straddle slicing pattern as the honest non-worker fix. Both can slice across ticks only if emit ordering into listeners is preserved — likely the risk-M gate that kept this deferred; classify whether the burst can yield *between* emits without changing order. **Effort**: M. **Ceiling**: H for hitch class (they are the largest measured single-frame sim blocks).

## Execution order (by ceiling × tractability)

1. **S7** — smallest legal-scope drastic win on the largest measured block (once slicing legality is proven).
2. **S6** — cheap ordering win, compounds with S7.
3. **S2** — SoA sidecar; both a win and the S1/PQ-067 precondition.
4. **S4/S5** — audit-gated; implement only where evidence clears the bar.
5. **S3** — audit only; density evidence decides.
6. **S1** — the XL spike: render-worker transport prototype, only after S2's columns exist to make transport cheap.
7. **S0** — stays gated on the W4 revisit conditions.

## A/B verification protocol (all levers)

- Golden `47a` sha256 `e517a97b…` bit-identical after every change.
- `node --check` + focused suites per touched area.
- For frame-pacing claims: A/B on identical revisions with the scripted-input probe; SwiftShader box = directional only, CI label evidence where it exists.
- Any lever that moves the golden hash is dead by definition — revert, don't negotiate.
