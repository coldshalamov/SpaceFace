# PQ-036 — PERF-02 scheduler-seam implementation receipt

```yaml
packet: PQ-036
scope: deterministic main-thread simulation/presentation ownership and derived publication
implementationBranch: claude/perf00-20260727
synchronizedBase: 3b026f8e
closeoutCommit: this_receipt_commit
schedulerClaim: integrated
nativeSchedulerEvidenceHead: 4f602802d1f9377db4e2bc0a9efe24a1ba528d56
nativeLifecycleEvidenceHead: f3046007b50e048ff4f1c49c2fb90a49964f126b
acceptanceClaim: retained_source_paired_browser_electron_route_accepted
disposition: PASS
qualityInvariant: preserved
```

## What this receipt claims

PERF-02's deterministic implementation is integrated on the ordinary Browser/Electron route. SpaceFace
still has one authoritative 60 Hz simulation, one fixed update order, one renderer/UI order, and one
presentation callback owner. Fixed-tick advancement now belongs to `SimulationRunner`; rAF,
interpolation, lifecycle restore, and presentation callbacks belong to `PresentationRunner`.
`src/core/loop.js` remains only as the compatibility composition surface and contains no second
`requestAnimationFrame` owner.

The extraction preserves the four-step foreground catch-up cap, fractional accumulator remainder,
explicit whole-step backlog shedding, paused `timeScale`, hidden-time exclusion, and PQ-035's
zero-delta restore behavior. It remains on the main thread. This packet does not add a Worker,
OffscreenCanvas, SharedArrayBuffer, a second registry, or a second game route.

The seam publishes bounded fixed-tick input snapshots, completed-tick metadata, and a derived
presentation journal without transferring gameplay authority away from the existing `GameState` and
legacy renderer. Scheduler telemetry can distinguish simulation, non-UI presentation, UI, authored
admission, and external scheduling as backlog causes while retaining callback interval, outside-callback
gap, and rAF dispatch-lag scalars.

**Not claimed:** a measured FPS/GPU/compositor/resource improvement, a Worker migration, physical OS
suspend/lock, or packaged-build startup. Terminal PQ-036 scheduler acceptance is closed below by
composing the already accepted source-paired PERF-00 native matrix with the later exact-head PERF-01
lifecycle pair and current deterministic owner tests. No new Browser or Electron launch was spent.

## Integrated implementation commits

| Commit | Integrated behavior |
|---|---|
| `42859c3a` | Extract one `SimulationRunner` and one lifecycle-aware `PresentationRunner` while retaining the existing compatibility entry point |
| `2f03c8d0` | Publish bounded, target-tick-exact `InputCommandSnapshot` records with reservation, lease, and exactly-once consumption semantics |
| `97f65fa1` | Add the bounded, generation-safe `PresentationJournal`; wire canonical spawn/destroy/transform/visual owners, rebuild, retention, and acknowledgement |
| this receipt's commit | Add scheduler-boundary and authored-admission attribution, focused causal regressions, and this closeout receipt |

The branch was synchronized with incoming product, graphics, and asset work at `3b026f8e`. A final
pre-closeout fetch found no newer `origin/master` or owned-branch commit to reconcile. No PERF-02 commit
reduced content, population, effects, draw distance, render quality, or default visual quality.

## Implemented ownership contract

### SimulationRunner

- Owns fixed-step accumulation and invokes the existing `registry.step(dt)` order.
- Preserves the 60 Hz fixed step, four-step cap, whole-step shedding, and fractional interpolation phase.
- Reserves input-snapshot capacity before authoritative advancement, so capacity failure cannot occur
  after a partially committed tick.
- Publishes completed ticks with sequence, tick, simulation time, monotonic state marker, input sequence,
  lifecycle generation, and journal span.
- Retains the latest completed-tick identity across presentation frames with no new simulation step.

`stateDigestMarker` is deliberately a cheap monotonic tick marker, not an acceptance digest. PQ-034's
exact equivalence and route-identity contracts remain the acceptance authority.

### InputCommandSnapshot

- Captures immediately after authoritative `input.update` and before downstream fixed-tick systems.
- Carries scalar axes/actions, action packets, Massline and Travel Burn packets, auto-target values, and
  a bounded route descriptor without retaining the route point-array graph.
- Uses a bounded `FREE -> RESERVED -> CAPTURED -> CONSUMING -> FREE` slot lifecycle.
- Rejects recursive consumption, expired lease reuse, and silent capacity overflow.
- Commits completed-tick identity even when a derived observer reports a diagnostic failure.

### PresentationRunner

- Owns the sole rAF callback, interpolation, lifecycle transitions, restore presentation, and
  presentation-callback timing.
- Consumes completed ticks in order and may omit obsolete presentation snapshots without inventing or
  reordering simulation ticks.
- Retains unacknowledged journal ranges after render failure or docked UI-only presentation.
- Discards a range only after an accepting flight presentation callback.
- Rebuilds invalid, overflowed, rewound, save-boundary, and new-game journal state from the current alive
  entity set without stopping or mutating authoritative simulation.

### PresentationJournal

- Publishes scalar `spawn`, `destroy`, `transform`, and `visual` records ordered by tick and sequence.
- Uses stable entity ID plus generation and monotonic within-generation revision identity.
- Coalesces same-tick transform/visual changes without allowing interleaved writes to move an earlier
  record's revision or pose backward.
- Uses bounded preallocated record storage and bounded entity metadata.
- Retains no entity, mesh, Three.js, or gameplay object graph.
- On overflow, clears the unusable derived range, requests a full rebuild, and suppresses publication
  until the rebuild succeeds; authoritative simulation continues.
- Communicates empty full rebuilds through rebuild generation even when the journal span is empty.

Journal spans use exclusive-start/inclusive-end semantics: `(journalStart, journalEnd]`.

## Scheduler attribution

`perfRuntime` now records explicit scheduler-owner timing for:

- total fixed-step work for the frame;
- total presentation callback work;
- renderer, VFX, feel, and UI child phases;
- synchronous authored composition, pipeline invocation, and boundary commit admission;
- callback interval, outside-callback gap, and rAF dispatch lag;
- backlog cause: `none`, `simulation`, `presentation`, `ui`, `admission`, or
  `external-scheduling`.

Backlog classification is emitted only for a multi-step or backlog-shedding frame. It attributes the
elapsed delay using the immediately preceding callback's frame-local owner totals plus measured authored
admission since that callback. Admission measured inside the game callback can own the cause but is not
incorrectly subtracted from outside-callback time. Admission measured between callbacks is removed from
the external gap. Frame-local phase scalars reset at every `beginFrame`, so a render failure or missing UI
callback cannot reuse an older UI sample.

The aggregate presentation boundary is sampled without adding it to `frameAccountedMs`; renderer, VFX,
feel, and UI child phases already account for that callback work. The existing caller-owned
`readFrameSample(out)` probe remains allocation-bounded.

## Adversarial repairs before closeout

1. **Interleaved journal coalescing:** later transform/visual writes could leave an earlier coalesced
   record with a stale revision. Coalesced records for the same tick/entity/generation are now refreshed
   through the newest retained sequence.
2. **Render-failure retention:** journal ranges remain pending after exceptions and are acknowledged only
   after an accepting presentation callback.
3. **Stale UI attribution:** timing-ring `last` values could reuse an older UI phase when the immediate
   prior frame never reached UI. Classification now uses per-frame scalars reset at `beginFrame`.
4. **Admission-gap ownership:** subtracting every admission slice from the outside-callback gap
   understated external time when composition ran inside the previous game callback. Internal and
   external admission accumulators are now distinct.
5. **Steady-state allocation:** an intermediate scalar reset used `Object.keys`. It was replaced with
   explicit assignments so ordinary frame setup does not allocate a key array.
6. **Lease and observer failure paths:** recursive input consumption, expired reader revival after slot
   reuse, and observer failure omitting a completed tick were repaired before the snapshot unit landed.

## Deterministic behavior covered

- Compatibility-loop and extracted-runner tick sequence, accumulator, interpolation, and shedding parity.
- Zero through four fixed steps plus explicit whole-step debt shedding and retained fractional remainder.
- Input capture at the exact authoritative boundary and exactly-once target-tick consumption.
- Snapshot capacity failure before simulation advancement and generation-safe slot reuse.
- Completed-tick sequence, input identity, lifecycle generation, and multi-tick journal-span aggregation.
- Spawn/destroy ordering, ID reuse generations, revision monotonicity, transform/visual coalescing,
  overflow diagnostics, full rebuild, empty rebuild, and save/new-game boundaries.
- Render exception retention, docked UI-only retention, and successful flight acknowledgement.
- Lifecycle hide/restore interaction without hidden catch-up or duplicate presentation scheduling.
- Synthetic simulation, presentation, UI, authored-admission, and external-scheduling backlog ownership.
- External admission removal from the outside-callback gap without removing in-callback admission.
- No stale UI attribution after a frame that does not execute a UI phase.
- Authored visual composition, pipeline invocation, and commit behavior under success and deliberate
  fallback/failure routes.

## Verification at closeout

| Gate | Result |
|---|---|
| Focused PERF-02 runner, snapshot, journal, lifecycle, closure, attribution-contract, and runtime-profile suites | **76 pass / 0 fail** |
| Authored-admission regression suites | **24 pass / 0 fail**; the deliberate synthetic pipeline-failure case emitted its expected warning and passed fallback verification |
| Combined focused deterministic coverage | **100 pass / 0 fail** |
| `npm run check:time-effects` | **PASS** — service, UI, feel, save, and writer contracts |
| `npm run check:sim:compare` | **PASS** — uninterrupted and reload-at-600 hashes equal (`271605e7639ef3ec8519c42a9d8b227938fdac76aa72bd914a6c922f13588af1`), no divergent tick, no telemetry edit |
| `npm run check:baseline` | **10/10 green** in 36905 ms wall time; 53095 ms deterministic-budget headroom |
| `node --check src/core/perfRuntime.js`, `src/core/presentationRunner.js`, `src/render/partsLibrary.js` | **exit 0** |
| `git diff --check` | **no whitespace error**; only the known Windows LF-to-CRLF worktree warning for `presentationRunner.js` |

The deterministic baseline included `ui-screen-imports`, `pq020-ceres-topology`, `save-schema`,
`flight-v3`, `m1-tether-mass`, `sim-v3-compare`, `sim-compare`, `sim-v3`, `sim`, and `massline`.

The live `npm run check:perf:attribution` route was not used as terminal acceptance evidence on this
contended workstation. Its deterministic attribution contract coverage is green. No FPS, GPU,
compositor, or resource delta is inferred from these deterministic results.

## Terminal native-acceptance audit — 2026-08-04

The recovery audit found that a new `performance-scheduler-seam` headed matrix would duplicate accepted
authority rather than fill a missing product seam. PERF-00's final source-paired Browser/Electron matrix
was captured after all four PERF-02 implementation commits. It exercised the ordinary production route,
current and exact five-times fleet scales (`fleet_full_render_10` and `fleet_full_render_50`), lifecycle
context recovery, authored jump admission, map/UI routes, dense presentation, save load, and cleanup.
Every retained raw frame publishes the PERF-02 owner fields (`simFrameMs`, `presentationMs`, `uiMs`,
`admissionMs`, `externalCallbackGapMs`, and `callbackDispatchLagMs`) plus the resulting backlog cause.

| Runtime | Accepted claim / candidate | Retained scheduler observations |
|---|---|---|
| Browser | `22380-df81be7b607f4276302e6ac8` at `4f602802`; source digest `8948e0ada5a785347f2b66fccd6c75a38be7aac56f54248fce3f252cbc9913e4` | 25/25 valid windows, 6,697/6,697 owner-complete raw samples, 1,078 multi-step samples, and observed `simulation`, `presentation`, and `external-scheduling` causes; measurement validity and owned cleanup pass |
| source Electron | `32560-97a1a4a4e9dade4d4ce87d91` at `4f602802`; same source digest | 25/25 valid windows, 6,435/6,435 owner-complete raw samples, 1,322 multi-step samples, and observed `simulation`, `presentation`, and `external-scheduling` causes; measurement validity and owned cleanup pass |

The only scheduler-owner file changed after that matrix was `c54b11ba`'s bounded
`PresentationRunner` post-restore diagnostics. It did not add another callback or alter fixed-step,
input, journal, interpolation, or owner classification semantics. That exact change is covered at the
current acceptance head by PERF-01's paired claims `10372-4aa9e5f78322240b4566e2bd` and
`12340-3eefb1bf37636736c1d67ead`: both prove one coherent restore, zero hidden GPU submissions,
ordinary post-restore cadence, exact Browser/Electron ownership, and clean teardown.

Current-head deterministic revalidation ran once and passed **68/68** across SimulationRunner,
PresentationRunner, InputCommandSnapshot, PresentationJournal and owner wiring, lifecycle interaction,
scheduler attribution, performance-attribution, and closure contracts. The forced seconds-scale owner
cases prove all five classifications, including UI and authored admission, without requiring a fake
player-visible stall. The accepted native matrices prove that the same fields publish on both real
runtimes. Together these are the packet's causal proof; another headed run would add no missing owner
fact.

Solo recovery review verdict: **APPROVE**, with no P0–P3 in-scope finding. The implementation retains
one fixed-step authority, one rAF authority, bounded queues/journal, exact input publication, and the
existing renderer/UI order. `PQ-036.native-acceptance` may therefore close as `route_accepted` without a
new broker claim. This verdict does not manufacture an optimization delta or packaged-runtime claim,
and it does not turn the derived journal or telemetry marker into a second authority.
