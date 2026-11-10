# W4 Heap-Residency Audit — remaining allocation hot spots, pooling gaps

Lane: wave-4 heap audit, branch `devin/1790659186-w4-heapaudit`, off `origin/master`.
Benchmark (same command as every prior lane):

```
node --cpu-prof --trace-gc scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 \
  --inputs test/47a.inputs.json --hash --repeat 20 --reload-at 600
```

(`--repeat 20` = 21 total `run47a` invocations: 1 baseline + 1 reload@600 + 19 repeats, all hash-asserted equal.)

## 1. RESEARCH — what the VM actually charges us for

**V8's heap is generational.** New objects land in a small young-gen "nursery" (≤16 MiB);
surviving one minor GC moves them to the intermediate young gen, surviving two promotes them
to old gen. The **minor GC (Scavenger)** is a parallel semispace copy over the young gen only;
the **major GC (Mark-Compact)** marks/sweeps/compacts the whole heap in three phases. The
design exploits the *generational hypothesis* — most objects die young — so GC cost is
proportional to **surviving objects, not allocation count**. Per-tick temporaries that die
before the next scavenge cost almost nothing beyond the copy of whatever they indirectly keep
alive. Sources: [Trash talk: the Orinoco garbage collector](https://v8.dev/blog/trash-talk),
[Orinoco: young generation GC](https://v8.dev/blog/orinoco-parallel-scavenger),
[Getting GC for free](https://v8.dev/blog/free-garbage-collection).

**Allocation-site tracking (pretenuring).** V8 attaches an `AllocationSite` + memento to
hot allocation sites and measures survival ratio per site; sites that survive ≥~85% of a
scavenge get *pretenured* — future allocations go straight to old gen, skipping nursery
copy overhead entirely. Consequence for this audit: **retained/scratch objects we allocate
once and keep forever are already free-ish** (V8 pretenures them), and the real enemy is
*medium-lived* garbage — objects that survive one scavenge (forcing a copy + remembered-set
work) but die before promotion. Sources: [Memento mori: dynamic allocation-site-based
optimizations (V8, PLDI'16)](https://dl.acm.org/doi/10.1145/2887746.2754181),
[V8 `pretenuring-handler.cc`](https://chromium.googlesource.com/v8/v8/+/refs/heads/main/src/heap/pretenuring-handler.cc)
(`kScavengerPretenureRatio = 0.85`).

**Object pooling economics.** Pooling is a trade: it removes nursery churn at the cost of
retained memory, pool-bookkeeping overhead, and — the killer for a correctness-locked sim —
**aliasing bugs** when a pooled object escapes into retained state. web.dev's static-memory
writeup frames the goal as eliminating *churn* (alloc+free cycles), not allocation itself.
Our rule, matching the landed `allocs`/`bufpolicy` lanes: pool only objects with a
**synchronous consumption window** (read→copy→die within one call stack) and a fixed key
shape; never pool anything reachable from `e._flightFrame`, physics records, or snapshots.
Source: [Static memory JavaScript with object pools](https://web.dev/articles/speed-static-mem-pools).

**structuredClone vs hand copies.** `structuredClone`/postMessage runs V8's serializer +
deserializer synchronously across the JS↔C++ boundary; for plain-data objects a naive
recursive clone can beat it (Node core issue discussion), and it costs a fixed serialization
pass plus a fresh deep graph. The repo's `clonePlain` (sorted-key recursive clone) is both
faster for these shapes *and* provides canonicalization structuredClone doesn't offer.
No `structuredClone` call exists anywhere in `src/core`/`src/systems` tick code — nothing to
do here. `JSON.parse(JSON.stringify(v))` deep-clone sites exist in `aceMemory`,
`achievements`, `aftermathWrecks`, `asteroidFormations`, `runState.cloneJson` — all are
save/migrate/commit paths, not per-tick. Sources: [nodejs/node#34355 — structured clone
perf discussion](https://github.com/nodejs/node/issues/34355),
[Measuring structured clone cost](https://javascript-web-workers.com/debugging-profiling-production-optimization/postmessage-bottleneck-analysis/measuring-structured-clone-cost-with-performance-now/).

## 2. ASSESS — where the 47a soak's bytes actually go

`--trace-gc` baseline (this exact command, node 24.0.1, master):

| metric | value |
|---|---|
| GC events | 120 total: 115 Scavenge + 5 Mark-Compact |
| GC pause | ~336 ms ≈ 2.7% of wall (~12.5 s) |
| Scavenge mean | 2.7 ms |
| Bytes allocated between GCs | ≈ 6.78 GB total, ~57 MB avg gap |

Heap-profile attribution (sampled, normalized against `--cpu-prof`):

| bucket | share | what |
|---|---|---|
| Node module load / startup | ~59% | `decode@encoding`, ESM machinery — one-time, outside sim code |
| Per-run economy seed + snapshot/hash | ~24% | `seedPriceHistory` ≈44 MB/run (candle arrays), `sanitize`, `clonePlain`, hashing — structural to the benchmark's 21× repeat loop |
| **Tick loop** | **~10%** | flight packet leaf objects, rapier getter wrappers, scenarioRuntime evidence |
| Rapier world init | ~7% | per-run |

**Tick-loop top allocators (pre-patch), ranked:**

1. `stepPhysicsAuthorityFlight` packet (flightDynamics.js) — ~11 short-lived objects per
   craft-tick: entity clone probe `{...e, vel, rot}`, `before {x,z}`, translation-step
   return, `Object.assign` merge + extras literal, yaw-control return, bank return,
   `localAxes`, `computeLocalVelocity`, `writePhysicsControl` input literal, `computeFlightFrame`.
   Same shapes minted again in `stepPlayerFlight`/`stepNpcFlight` non-authority paths and
   `stepPhysicsDamping`.
2. `writePhysicsTelemetry` (physicsAuthority.js) — frozen 6-allocation publication per
   craft-tick. **REJECTED**: public frozen telemetry shape; readers may hold references
   (reference stability is the contract).
3. Rapier `__wrap`/getter boundary objects — **REJECTED**: vendored `node_modules`
   (`@dimforge/rapier3d-compat`), and `sg02DynamicBodyOwner._readPostStepKinematics` already
   absorbs them into retained per-body records (its own comment documents the absorption).
4. `resolveFlightProfile`/`buildRuntimeModel` per craft-tick (profile + model + saved-merge,
   ~3 objects). **REJECTED**: `Object.assign({defaults}, saved, …)` merges arbitrary authored
   `flightModel` keys — a retained scratch would leak stale authored keys across entities
   with different model shapes; deleting stale keys costs ≈ the alloc. Not provably identical.
5. `scenarioRuntime` predicate evidence (`{ok, evidence:{…}}` + spreads + `.filter` arrays)
   — bounded: predicate branches are `unlockedBy: resolution_branch`, which never enters
   during the 720-tick soak → ~1 `matches` array/tick. Fixed-key evidence pooling was
   designed (evidence is consumed/cloned synchronously) but the measured volume doesn't
   justify it.
6. `_emitThrustCue`/`_publishDiagnostics`/`updateQueueForThisStep`/`_syncDynamicLayer` —
   already retained/pooled/incremental by prior lanes (`allocs 4fc52a6`, `simattr`,
   `bufpolicy`). Nothing left.

Map churn: `CONTROL_RECORDS`/`PROJECTILE_CONTINUATIONS` are retained per-entity records
(re-armed in place, `commandFor`), no per-tick `new Map` in the hot loop.

## 3. IMPLEMENT — what was patched

`src/core/flightDynamics.js`: module-level retained scratches (`_probe`, `_axes`,
`_localVel`, `_translationStep`, `_translationControl`, `_yawStep`, `_yawControl`,
`_bankStep`, `_bankSettle`, `_frame`, `_control`) plus optional `out` params on
`stepTranslation`, `stepYawController`, `computeYawControl`, `computeTranslationControl`,
`stepBankPose`, `settleBankPose`, `computeFlightFrame`, `computeLocalVelocity`
(`localAxes` → `localAxesInto`). Diagnostics merge rewritten as
`Object.assign({}, …scratches)` + direct field assigns, preserving original key order.

**Why provably output-identical:**

- Every scratch has a **fixed key shape** written in full each call — no stale-key path.
- All consumers are **synchronous**: `Object.assign` reads scalars during the merge;
  `writePhysicsControl` copies `source/mode/force/torque/maxSpeed` into its own retained
  `CONTROL_RECORDS` entry via `vector3Into` — the `_control` literal never escapes.
- Objects that **escape into retained state stay fresh**: `diagnostics` (`e._flightFrame`),
  and the `force`/`torque` vectors aliased into it — pooled versions would alias-mutate the
  previous craft's published frame.
- `_probe` is safe because entities are plain data bags (`makeEntity` — `Object.assign`
  over `ENTITY_PROTO`; `mesh`/`view` are non-enumerable proto accessors, so the old
  `Object.assign({}, e, …)` copy never read them either) and `stepTranslation`'s helper
  chain reads only `e.vel`/`e.rot`.
- Exported signatures unchanged (`out` is a trailing optional param); external callers
  (`flight.js`, `npcBankPose`, compat wrappers, check scripts) still get fresh objects.

Per craft-tick: ~11 object allocations → 3 (fresh `diagnostics` + `force` + `torque`;
`resolveFlightProfile` profile/model unchanged and documented above).

## 4. VERIFY

- **Golden**: `sha256 = cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885` —
  bit-identical to baseline; all 21 repeat/reload runs asserted equal.
  `check:sim` variant with `--expect test/47a.telemetry.expected.json` also passes.
- **`check-gameplay-core.mjs`**: PASS (includes stepPlayerFlight/stepNpcFlight/
  stepBankPose/settleBankPose/computeFlightFrame assertions).
- **GC A/B** (same command, `--trace-gc`):

| metric | before | after | Δ |
|---|---|---|---|
| Scavenge events | 115 | 117 | +2 (noise) |
| Mark-Compact events | 5 | 5 | 0 |
| Scavenge pause | ~310 ms | ~284 ms | **−8%** |
| MC pause | ~26 ms | ~25 ms | ~0 |
| Alloc between GCs | 6779 MB | 6731 MB | **−48 MB** |

## 5. Verdict

**PATCH landed** (top tick-loop allocator, provably identical) — modest by design: the
flight packet was ~0.7% of total soak allocation because ~83% of bytes are Node startup +
per-run seeding/snapshot work the benchmark itself performs, not per-tick sim code.
**Remaining pressure is structural/bounded**: rapier boundary objects (vendored, already
scratch-absorbed), frozen telemetry contract, `resolveFlightProfile` (stale-key risk —
documented, not pooled), scenarioRuntime evidence (locked branches ≈1 array/tick in this
soak), and economy-seeding arrays (bounded, amortized). Young-gen churn this small is cheap
by V8's own accounting — scavenges cost survivors, and the surviving set is unchanged.
