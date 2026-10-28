# Wave-4 Lane Report — Event Dispatch Interning (REJECTED — dispatch already cheap)

Lane question: *should hot-path event-type strings be interned to small-int codes at the
emit/dispatch boundary?*

Branch: `devin/1790658194-w4-eventintern` off `origin/master` (b34f91e92).

## Verdict — REJECT (measurement gate fails by ~100×)

`node --cpu-prof` on the real golden run
(`run 47a --seed 47 --ticks 720 --expect test/47a.telemetry.expected.json --hash --repeat 20 --reload-at 600`,
12.72 s profiled, node v24.0.1):

| Frame | self ms | self % |
|---|---|---|
| `emit` (eventBus.js:90) | 1.77 | 0.014 |
| `emitAll` (:76) | 4.92 | 0.039 |
| `snapshotListeners` (:55) | 3.08 | 0.024 |
| `dispatchRange` (:11) | 4.57 | 0.036 |
| `flush` (:141) | 3.02 | 0.024 |
| **bus machinery total** | **17.36** | **0.136** |

The lane gate was ">1% self" — the *entire* dispatch path is 0.14%, an order of magnitude
under it. A perfect small-int dispatch could save at most ~17 ms of a 12.7 s run; the
plausible delta (Map<string> probes → array index) is ~10 µs/run ≈ 0.002%, below box noise.

### Emit census (instrumented single 720-tick run, instrumentation reverted)

- `bus.emit`: **464 calls across 32 types** — `ship:thrust` 360, `entity:spawned` 27,
  `combat:fire` 17, `presentation:cueApplied` 7, all others ≤4.
- `bus.queue` (deferred): **11 calls** — `presentation:cue` 7, `entity:destroyed` 4.
- ≈ 0.66 dispatches per sim tick. The prompt's "presentation:* hundreds per run" was a
  misread: `traceSummary.lastTick` values are *tick numbers* (e.g. `presentation:vfxCue`
  last seen at tick 376), not counts — traced presentation events total ~30/run.

### What dispatch actually costs per emit

`emit(event, payload)` performs: `sliceBudgets.get(event)` (Map probe; the table is only
ever populated with `'sector:enter'` by presentationRunner — absent in the sim host →
early-miss), `event === 'sector:enter'` (identity compare on internalized literals),
then `emitAll → snapshotListeners`: `listeners.get(event)` + a dirty-flagged snapshot
array (`listenerSnapshots` — rebuilt only on on/off mutation, not per emit), then a plain
indexed `dispatchRange` loop. `queue`/`flush` reuse a pooled `{event, payload}` record.

### Where the inclusive time goes (honest decomposition)

`emit`'s whole subtree is 778 ms inclusive (6.12%) — but that is *listener bodies*, not
machinery. Attributed to the frame directly under dispatch:

- `(anon) @ economy.js:1022` — 653 ms (**82%** of the subtree): the `save:loaded` →
  `refreshAllPersistentDemand({reseedSynthetic:true})` handler, firing once per
  `--reload-at 600` boundary (×20 repeats). Economy's own price-refresh work.
- `(anon) @ combat.js:527` — 35 ms; `eventTrace.js:70` recorder — 31 ms
  (per-event `sanitizePayload` deep-copy — already the landed typed `ship:thrust`
  fast path); presentation/missions listeners — tens of ms each.
- Machinery frames (emitAll/dispatchRange/snapshotListeners inside the subtree): ~1.2%.

Interning event *names* cannot touch any of that — the costs are payload sanitize and
listener work, addressed by other lanes (thrust payload pooling, typed sanitize, HUD
sig-gates already landed).

## Research

- **V8 "Optimizing hash tables: hiding the hash code"** (v8.dev/blog/hash-code): ES2015
  Map/Set are hash tables whose key hash is *stored, not recomputed*. For string keys the
  string's hash field is computed once and cached on the object — repeat `Map.get` on the
  same string is a cached-hash bucket probe plus SameValueZero, which for internalized
  strings resolves by identity before any character walk.
- **V8 string-table.cc / internalization** (github.com/v8/v8 `src/objects/string-table.cc`,
  `StringTable::LookupString`): source literals are internalized, so every `'ship:thrust'`
  call site hands the bus the *same* string object — the codebase's emit sites are literal
  strings throughout (2231 emit sites; hot ones all literals), meaning the expensive part
  of "string keys" (hashing fresh strings) never happens here.
- **V8 hidden-classes/IC doc** (chromium.googlesource.com/v8 docs): monomorphic ICs make
  the remaining shape checks at the emit sites effectively free; an int key would replace
  a ~10–20 ns probe with a ~1 ns index — meaningful only at ≥10⁵ dispatches/frame.
- **TinyGiants, "Zero Reflection, Zero GC"** (tinygiants.tech/blog/zero-reflection-performance,
  "Cost #4: String Matching") and **gamedev.stackexchange event-system Q17763**: the
  canonical engine pattern — map string→int once, then dispatch through `vector<int>` —
  exists for engines firing thousands of events/frame. This codebase fires ~0.66/tick;
  the pattern's premise doesn't hold at this rate.
- **Node EventEmitter** precedent: string-keyed `_events` maps sustain far higher emit
  rates than this bus sees; string dispatch is standard JS infrastructure, not a known
  bottleneck at this volume.
- **Unity DOTS event approaches** (discussions.unity.com/t/878324): even engine-side, the
  cost driver is per-event allocation and parallel-write scheduling, not the type key.

## Overlap audit

- `simattr` (landed `be9bec221`, wave-3): touches `perfRuntime.js` attribution only — no
  bus/event-type surface. No overlap.
- Sibling W4 lanes (jobsys merged #173; wasm/gpucull/temporal/soa branches): touch
  residency yields, economy kernel, matrix flags, pose tables — none touch
  `eventBus.js`/`eventTrace.js`. The already-landed adjacent work: typed
  `sanitizeThrustPayload` fast path (eventTrace.js:79) and `ship:thrust` payload pooling
  (flight.js/flightV3.js) — both are payload-side, orthogonal to key interning.

## No patch — what would have been required, and why it fails NPV

A compliant interning would need: a bidirectional string↔id table at `createBus()`, int
keys on `listeners`/`listenerSnapshots`/`sliceBudgets`, id→string re-stringification at
every boundary that publishes names (eventTrace records — golden-visible, deferred-queue
items, `console.error` tag, `_listeners` debug surface, `setEmitSliceBudget` callers).
`emit` is called with string literals and the bus's own public contract is string-typed
(`bus.on('x', fn)` at ~hundreds of sites, `test/event-bus-contract.test.mjs` 11 cases).
All that machinery buys ~10 µs/run against a 0.14% base — and each Map.get→Map.get(int)
swap still pays the *same* initial string→id lookup unless every one of 2231 emit sites
is rewritten to import enum constants, which contradicts the lane's boundary-only scope.

## Metrics

- **Golden 47a**: `sha256 == baselineSha256 == cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885`,
  `deterministic: true`, exit 0 — the working tree carries zero code change, so this is
  the baseline reproducing on the branch (receipt: run on this branch's HEAD).
- **Dispatch self A/B**: N/A — no patch. Baseline machinery self-time recorded above
  (17.36 ms / 12 721.6 ms = 0.136%); the gate's >1% predicate is false by ~7× even before
  considering that `emit` alone is 0.014%.
- **check:event-bus-contract**: 11/11 pass on the unchanged tree (witness that the bus
  surface is contract-pinned — any interning patch would have to carry it).
- Deps note: this box had no `node_modules`; `npm ci` (578 pkgs) was required before the
  sim host could run — worth a blueprint line if absent.

## Revisit conditions

Reopen only if a future profile shows emit counts ≥10⁵/run (e.g. a per-entity-per-tick
event family lands) or `emit`/`snapshotListeners`/`dispatchRange` self-time crosses 1%.
The cheaper fix at that point is still not interning: it's fewer emits (edge-trigger /
cohort-gate the producer), matching the campaign's leaf grammar.
