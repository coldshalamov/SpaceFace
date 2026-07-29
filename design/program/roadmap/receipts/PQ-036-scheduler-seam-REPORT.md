# PQ-036 — PERF-02 scheduler-seam implementation receipt

```yaml
packet: PQ-036
scope: deterministic main-thread simulation/presentation ownership and derived publication
implementationBranch: claude/perf00-20260727
synchronizedBase: 3b026f8e
closeoutCommit: this_receipt_commit
schedulerClaim: integrated
acceptanceClaim: deterministic_green_native_broker_pending
disposition: PARTIAL
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

**Not claimed:** terminal PQ-036 acceptance, measured FPS/GPU/compositor/resource improvement, native
Browser/Electron rAF parity, or matched current/five-times-population performance. Those claims require
the broker-managed `performance-scheduler-seam` matrix on an uncontended evidence machine. The current
workstation was explicitly unsuitable for stable frame-rate or GPU acceptance because other coding
agents were running concurrently.

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

## Residual acceptance gap

PQ-036 remains `acceptance: unproven` until the broker owns the native
`performance-scheduler-seam` matrix. Remaining evidence includes:

1. Ordinary Browser and packaged Electron rAF ownership and foreground-order cells.
2. Renderer-disabled/stalled, UI-stalled, authored-admission-stalled, and external-scheduling cells on
   the full production manifest.
3. Matched current-population and five-times-population routes bound to the complete PQ-034 route
   digest chain.
4. Native lifecycle restore cells proving no hidden catch-up and one coherent first visible frame.
5. Soak evidence for no lost/duplicated input sequence, no reordered tick/event, bounded journal reuse,
   and no duplicate callback/listener owner.
6. Uncontended callback, resource, compositor, and GPU evidence if those improvements are claimed.

The deterministic implementation is complete enough to unblock PERF-03. This receipt deliberately does
not promote PQ-036 to terminal acceptance and does not turn the derived journal or telemetry marker into
a second authority.
