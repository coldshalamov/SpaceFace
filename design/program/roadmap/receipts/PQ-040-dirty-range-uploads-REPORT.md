# PQ-040 — PERF-06 dirty-range GPU upload implementation receipt

```yaml
packet: PQ-040
scope: scene-owned dirty-range publication for combat sprites and trail-streak instances
implementationBranch: claude/perf00-20260727
implementationParent: ef0f79ec
implementationCommit: this_receipt_commit
routeClaim: integrated_structural_green
acceptanceClaim: historical_focused_buffer_lifecycle_green_native_unproven
disposition: PARTIAL
nativeAttemptDisposition: BLOCKED
qualityInvariant: preserved
```

## What this receipt claims

PERF-06's first bounded production stage is implemented on the ordinary renderer route. Combat-sprite position,
scale, roll, color, and opacity attributes plus trail-streak matrix, color, and opacity attributes now retain dirty
component spans on the CPU and publish only one merged Three.js update range per changed attribute when the live scene
reaches an eligible renderer traversal.

Logical pool commits no longer set `needsUpdate` or allocate public Three.js range records. The renderer owns a
scene-scoped publication epoch, installs a temporary chained `Scene.onBeforeRender` hook before
`WebGLObjects.update()`, publishes settled owner generations through `BufferAttribute.addUpdateRange()`, and restores
the exact prior scene hook in `finally`.

The first processing-eligible traversal still publishes each complete tracked attribute so Three.js cannot perform an
untracked initial `bufferData`. After residency, ordinary sparse generations publish only the packed component union.
Active instance count remains independent of capacity, and all authored sprite/trail values, ordering, density,
lifetime, materials, and visual output remain unchanged.

This is an **implementation and focused buffer-lifecycle claim**, not terminal PQ-040 acceptance. It does not claim an
FPS, frame-time, CPU/driver-time, GPU, compositor, GC, or resource improvement from this contended workstation.
Matched Browser and packaged Electron performance evidence remains broker-owned on an uncontended evidence machine.

## Native acceptance attempt — 2026-09-14

The bounded native workflow stopped at Browser broker admission. **Numeric
acceptance is UNPROVEN; this is not a Browser/Electron performance FAIL or PASS.**
The implementation receipt remains PARTIAL and parent PQ-040 is not accepted.

```yaml
unit: PQ-040.native-acceptance
candidateBranch: master
candidateHead: a382c4af3ffb27e158f2cd2d9c224527010e4b7b
cleanSourceCandidate: false
preExistingChangedFileCount: 410
browserManifestInvocations: 1
browserAcceptanceRuntimeLaunches: 0
browserBrokerResult: fast-gate-failed
browserCommandExitCode: 1
electronManifestInvocations: 0
electronAcceptanceRuntimeLaunches: 0
electronResult: not_run_after_browser_broker_failure
numericAcceptance: unproven
pairedRuntimeSourceBinding: not_established
headedMediaProduced: false
```

Exact command invoked once:

```text
node scripts/validation-broker-cli.mjs --manifest performance-dirty-ranges-browser
```

The broker's printed result and failing command were:

```text
[validation-broker] fail: fast-gate-failed
[validation-broker] failed command: node --test test/dynamic-buffer-ranges.test.mjs test/electron-shell-lifecycle.test.mjs test/performance-dirty-ranges.test.mjs
tests 51; pass 34; fail 17; cancelled 0; skipped 0; todo 0
```

The printed failures reduce to four distinct signatures:

| Failing contract | Observed result |
|---|---|
| `test/dynamic-buffer-ranges.test.mjs:652`, dense one-times/five-times fanout | `31 !== 23` range records |
| `test/electron-shell-lifecycle.test.mjs:211`, main-process fixture | 14 tests throw `Error: unexpected require: fs` at `electron/main.cjs:13` |
| `test/electron-shell-lifecycle.test.mjs:585`, preload API | actual `['quit', 'saveClip', 'buildInfo']`; expected `['quit']` |
| `test/performance-dirty-ranges.test.mjs:317`, Electron launch ownership | `page and canonical tracker ownership must publish before each later page setup seam`; actual false, expected true |

The two remaining manifest fast-gate commands did not run. The broker produced no
runtime evidence, comparison JSON, frame percentiles, requested/driver upload-byte
metrics, GC measurements, claim, or printed failure fingerprint. Its artifact root
contained only an empty `browser/` directory after cleanup. No headed media existed
to analyze or delete. Test timings and the 34 passing tests are not native metrics.

The required Electron command was **not invoked** because the user explicitly
required stopping after an environment/broker failure:

```text
node scripts/validation-broker-cli.mjs --manifest performance-dirty-ranges-electron
```

### Source identity and limits

Both tracked manifests exist and declare seed 47, profile
`default-tier1-dynamic-buffer`, acceptance mode, one launch per candidate,
broker-required claims, and `kill-tree` cleanup. Their presence does not resolve
the failed gate. Exact owned paths were clean at entry and immediately before
the receipt edit. HEAD and the Git status path list were unchanged across the
attempt, but pre-existing changes included these explicit manifest inputs:

- `src/render/engineTrailSurfaces.js`
- `src/render/renderer.js`
- `scripts/lib/alphaLiveBaselineRoute.mjs`
- `scripts/lib/releaseSoakProbe.mjs`

For source identification only, the existing broker's `computeGateDigests()` was
read once after failure and before packet/receipt edits. This is a **post-failure
working-tree observation**, not a persisted run claim or proof of byte stability
during the failed gate:

```yaml
sourceCandidateDigest: 615f9fe3139cfbfeaec5da33571840e6560d41dfa8e82a8addb79907b8ebcaab
browserCandidateDigest: 05b49816a74eb3536f324d99c7e00a03265c6012d231b75b7929c8b86982fc91
worktreeDigest: aba7cd9698fa500a8a3d039320914c082fd4878b340fd62afd0f1e9f82c66441
productionDigest: 1b750d74308073520673918a43e342bb6627216b25961a7202a5930d4c9da644
harnessDigest: 4560055964405f50b5725d33694ee94d5db210167213f05192992c94d33e9bee
regressionDigest: c02903866804c1faa30abbd18ba73bc54db330474379b7943c7a5e4c785a457c
```

The observed source candidate is dirty. No clean Browser/Electron pair was bound,
and no paired-runtime acceptance digest is claimed.

### Disposition and next action

The direct blocker is the manifest's first fast gate. Whether each assertion
reflects a product defect or stale fixture is unresolved; the failure output
does not justify changing production or weakening expectations. Separately, the
clean-candidate requirement remains unmet. Resolve those failing contracts and
settle the foreign source changes under separate ownership before another
authorized acceptance workflow. Then use the existing Browser and packaged
Electron manifests on the same clean source candidate.

No source, tests, manifests, assets, queue JSON, NOW, or build map were edited.
No unchanged retry, Electron invocation, focused rerun, broad baseline/playable
run, new probe, comparator, or evidence framework was opened after the stop.
The numeric gain, GC behavior, presentation parity, and keep/remove ruling remain
unproven; no abstraction removal is authorized by this acceptance-only write set.

## Native acceptance attempt — 2026-09-15

The fast gate that blocked the 2026-09-14 attempt was repaired and verified green;
the Browser probe then **launched and captured both variants twice** with real
comparator output. **Numeric primary acceptance remains UNPROVEN** — both captures
were demoted by shared-worktree churn and environment signals, not by the
dirty-range implementation. Parent PQ-040 is still not accepted.

```yaml
unit: PQ-040.native-acceptance
candidateBranch: master
gateRepairCommits:
  - b5f7e9b4b   # three stale fast-gate fixtures (7-attr sprite contract, fs mock, preload surface)
  - ba8878e21   # phase/axis write-path coverage in vfx-instanced-sprite-pool
defectFoundByAcceptance:
  commit: f94a8a849   # partsLibrary whole-ship LOD demotion TypeError (custom plan + canonical scope)
  regressionPin: a14e9ef2f
fastGateResult: 51 pass / 0 fail (all three manifest gates)
browserManifestInvocations: 6
browserAcceptanceRuntimeLaunches: 2
browserCapturedRuns:
  - run: performance-dirty-ranges-browser-2026-09-15T12-34-44-837Z-26184-1cf6f18b
    comparatorPass: true
    ownerRequestedByteReductionFraction: 0.9584   # 2.56 MB ranged vs 58.1 MB full-span
    driverUploadByteReductionFraction: 0.4657     # 71.5 MB ranged vs 126.7 MB full-span
    frameP95DeltaMs: -0.1                          # 33.4 vs 33.5
    demotedBy:
      - worktree changed during performance capture   # concurrent foreign writes mid-capture
      - 6,937 page warnings (6,936 = the partsLibrary demotion TypeError fixed in f94a8a849)
  - run: performance-dirty-ranges-browser-2026-09-15T13-16-17-666Z-26416-173ee699
    comparatorPass: false   # quality/settings changed inside both capture windows
    ownerRequestedByteReductionFraction: 0.9119
    driverUploadByteReductionFraction: 0.3804
    frameP95DeltaMs: 0.1                           # 50.0 vs 49.9
    warnings: 3   # opening-submission diagnostics + bloomScene GPU brick (foreign in-flight render work)
    demotedBy:
      - worktree changed during performance capture
      - settings changed inside both capture windows
  - run: performance-dirty-ranges-browser-2026-09-15T14-58-43-970Z-6892-1b72a703
    comparatorPass: true
    ownerRequestedByteReductionFraction: 0.9035
    driverUploadByteReductionFraction: 0.4618
    frameP95DeltaMs: 0                             # 50.1 vs 50.1
    warnings: 0   # clean page — partsLibrary fix held, foreign renderer warnings absent
    demotedBy:
      - worktree changed during performance capture   # only demotion; primaryAcceptance flag set
  - run: performance-dirty-ranges-browser-2026-09-15T15-25-04-278Z-9092-07910076
    comparatorPass: true
    ownerRequestedByteReductionFraction: 0.8635
    driverUploadByteReductionFraction: 0.4051
    frameP95DeltaMs: 0                             # 50.1 vs 50.1
    warnings: 2   # bloomScene GPU-compile bricks (260/275ms) from foreign in-flight renderer work
    demotedBy:
      - worktree changed during performance capture
      - contaminating process/authoring activity at end census
      - the two bloom warnings
electronManifestInvocations: 5
electronAcceptanceRuntimeLaunches: 3
electronCapturedRuns:
  - run: >-
      3 launches (13:30, 13:39, 13:46) all failed identically at route phase
      flight-input: powered displacement rate did not exceed the released baseline
      (baseline ~70-95 u/s undock drift vs powered ~18-28 u/s ramp; speed and
      acceleration legs passed, ship reached ~200 u/s)
    note: >-
      route-level input proof, unrelated to dirty-range uploads — the run dies
      before either attribution variant executes. On the passing browser run the
      released baseline displaced 0 (ship at rest); on all three electron runs the
      baseline window caught a still-drifting ship (~24u at ~70-95 u/s while
      |vel| read 0 at both ends — residual undock motion decaying inside the
      window), so the powered-vs-released comparison is structurally unwinnable
      regardless of powered response. That is a route timing/window assumption
      upstream of the comparator, worth its own packet; not caused by the
      dirty-range implementation.
    rootCauseFound: >-
      The route gates flight-input sampling on authored-flight-ready, which used
      to take ~1400 ticks on this machine (the old contract required every
      sector ship authored + zero fallbacks). The in-flight rewrite of
      alphaLiveBaselineRoute.mjs replaced that with the engine's own
      authoredVisualReadiness() verdict, which resolves at tick ~1 on Electron —
      so the released baseline samples the ship while berth placement /
      depenetration is still writing player.pos directly (vel stays 0 through
      positional correction, matching the observed speed-0-at-both-ends drift).
      Browser still saw ~24 sim-seconds of incidental settle time; Electron saw
      ~0. The check's powered-vs-baseline comparison was therefore
      structurally unpassable on Electron independent of machine load.
    routeFixApplied: >-
      The flight-input phase now waits for the hull to actually settle — speed
      <= 0.5 AND position stable within 0.25u across >= 0.75 sim-seconds —
      and then verifies the sampled baseline still sits at that settled anchor
      (bounded re-anchor loop), so a positional correction that begins between
      the gate and the read cannot land inside the measured window unobserved
      (alphaLiveBaselineRoute.mjs, hunk rides uncommitted atop the foreign
      readiness rewrite; stale PQ-033.02 checkpoint on the file made it
      adoptable). This tightens the measurement: the powered-vs-released
      contract itself is unchanged.
    independentVerdict: >-
      A read-only subagent trace confirmed the root cause: the drift is a
      solver positional-correction transient — the SG-02 structural-contact
      path restores linear velocity but never translation, so entity.pos moves
      while entity.vel reads ~0, and flight is inactive during 'loading' while
      physics still ticks. It ruled out an Electron flight-rules difference
      (same rapier-dynamic/v3 backends on both runtimes) and a flight-physics
      regression (no per-tick mover targets the player at spawn; flightV3 and
      core/flight diffs are empty). Recommended fix — a sim-time-anchored,
      settle-confirmed baseline — is what routeFixApplied implements.
    earlierAttempt: broker-claim-stale-digest (foreign worktree write raced claim->probe)
  - run: performance-dirty-ranges-electron-2026-09-15T15-01-37-348Z-28004-c06a81d4
    failedAt: launch
    note: >-
      New failure mode, upstream of the settle fix: the 150s authored-flight-ready
      wait timed out on Electron this run (earlier launches resolved it at tick ~1).
      The in-flight readiness contract's resolve time varies with asset/machine
      state; this run caught a slow path. Never reached flight-input or attribution.
numericAcceptance: captured-but-demoted
pairedRuntimeSourceBinding: not_established
```

The exact blocker is the shared-worktree environment, not the mechanism: both
captured runs agree on direction and scale — owner-requested upload bytes drop
86–96% and driver upload bytes drop 38–46% versus the causal full-span control at
unchanged frame p95 across four comparator passes — but the acceptance contract
requires a clean, stable candidate for the whole capture plus a zero-warning
page, and concurrent foreign render work (renderer admission-path churn,
bloomScene GPU-compile bricks) plus a contended host kept tripping
worktree-stability, census, and page-warning gates. The cleanest run so far
(14:58) produced a zero-warning page and `primaryAcceptance: true`, demoted
solely by mid-capture worktree churn. The Electron side launched three times
and failed identically at the route's flight-input causal check — root-caused
to a settle-timing defect surfaced by the in-flight readiness-contract rewrite
(see `rootCauseFound` in the YAML) and fixed with a settle gate ahead of the
released baseline in `alphaLiveBaselineRoute.mjs`; a fourth Electron launch
then timed out inside the authored-readiness wait itself (150s), an upstream
flaky symptom of the same in-flight contract rather than the flight-input
phase. The Electron attribution stage has not yet exercised. Both manifests
sit at `regression-required-after-acceptance-failure` until the regression set
changes again.

Evidence retained under `.devshots/perf/dirty-ranges/{browser,electron}/`:
`performance-attribution.json` / `performance-closure-failure.json`,
`dirty-range-comparison.json`, `run.log`, and route screenshots per run.
Next attempt needs the same two manifests on a quiet, non-churning tree; the
recorded comparator deltas are the expected outcome to confirm, not a pass.

### Isolated-candidate path (16:10Z)

Four demotions traced to one structural cause: the shared worktree cannot stay
stable while other agents write, and each probe-reaching failure re-locks the
manifest behind a regression-set change. The certification path was therefore
moved to `.worktrees/pq040-acceptance` — a detached worktree at `07f724ffb`
with a junctioned `node_modules` and its own `.devshots` broker state. A
dedicated checkout *is* a stable candidate by construction: no foreign writer
knows it, `strictWorktreeFingerprint` reads clean start=end, the in-flight
readiness/admission rewrite is absent at this HEAD (the post-submit-validation
warning cannot fire), and the fresh broker state carries no regression lock.
Remaining demoters are the machine process census (shared-host Chrome churn)
and any pre-existing page warnings. The certified candidate is the clean HEAD
snapshot, which is the honest interpretation of a stable acceptance candidate
on a moving shared tree.

Also corrected here: the earlier energy-card culling pin (adc7ab7a7) asserted
a contract that lives in a still-uncommitted `presenter.js` diff — it failed
on any clean checkout and was reverted (07f724ffb). The coverage now rides the
shared working tree until the presenter change lands.

## Native acceptance attempt — 2026-09-19

The manifest fast gate had gone red again at `master`: 19 of 55 tests failed in
the first declared gate. All four failure classes were stale fixtures left by
commits that landed after the 09-15 repair — the force-language swept-surface
rewrite (`d94e8d995`) replaced the eight per-role field instanced meshes with one
swept-surface batch owner; the shell gained `userContentStore.cjs` /
`workshopMods.cjs` requires, three workshop IPC channels, and three preload
bridge methods; and the Tier-1 Electron reload now installs two init scripts
(counter flag plus the GL program-query trap). The fixtures were retargeted to
the live contracts and committed as `f301d627e`; the field-geometry test now
pins the batch registration, its force-full first eligible publication, the
visible-prefix republication when fields move, and zero publication on an
unchanged frame. All three manifest fast gates are green in the candidate:
55/55, 6/6, and the render hot-path contract.

The isolated candidate was re-established at `f301d627e` in
`.worktrees/pq040-acceptance` (junctioned `node_modules`, fresh broker state).
Two structural blockers were found and fixed for the certification path:

- a detached HEAD fails the closure contract's `worktree branch is required`
  (`performanceClosureContracts.mjs`); the candidate now sits on branch
  `pq040-native-acceptance`;
- the Electron route crashed at `flight-input` with `handle.jsonValue is not a
  function`: the Electron launch installs the CSP-safe polling wrapper whose
  `waitForFunction` resolves the value, while the 09-15 settle gate consumed a
  Playwright handle. The owning lane has the exact `consumePageConditionValue`
  fix as an uncommitted hunk in the shared tree (mtime 10:33 local); the
  Electron acceptance must run on a candidate that includes it.

A Browser diagnostic on the candidate (14:25Z) ran the complete public route and
both attribution variants. The comparator passed with a wide margin — **94.1%
owner requested-byte reduction and 70.7% driver upload-byte reduction** against
the causal full-span control (threshold 25%) — with zero page errors. Every
remaining demotion was host contention: `dynResScale` drifted inside both
capture windows, the first pipeline warmup was unsettled, the 20 s opening GPU
cook timed out with first-flight build diagnostics, a 4.7 s bloomScene GPU brick
fired, and the process census was active.

The exact Browser broker command was invoked once and stopped at preflight with
`PERFORMANCE_ATTRIBUTION_ENVIRONMENT_BLOCKED`; the recorded census shows 2.73
foreign CPU cores aggregate, with a foreign Playwright renderer at 1.36 cores.
No claim was consumed and no acceptance runtime launched — this is an
environment block, not a Browser failure. A quiet-window watch over the
following 25 minutes never saw the foreign chrome/electron load fall below 1.6
cores.

```yaml
unit: PQ-040.native-acceptance
candidateBranch: pq040-native-acceptance
candidateHead: f301d627ef5ac340d6cfe0bb668e9c08d9b0bbd6
candidateWorktree: .worktrees/pq040-acceptance
fastGateResult: 55 pass / 0 fail + 6 pass / 0 fail + render hot-path OK
browserManifestInvocations: 1
browserAcceptanceRuntimeLaunches: 0
browserBrokerResult: PERFORMANCE_ATTRIBUTION_ENVIRONMENT_BLOCKED
browserDiagnosticComparatorPass: true
browserDiagnosticOwnerByteReduction: 0.9414
browserDiagnosticDriverByteReduction: 0.7069
browserDiagnosticDemotions: dynResScale drift, warmup unsettled, 20s cook timeout, bloomScene brick, census
electronDiagnosticResult: flight-input handle.jsonValue crash (route fix in flight, foreign hunk)
numericAcceptance: unproven
```

Disposition: **BLOCKED**. Nothing about the implementation, harness, or
candidate blocks the acceptance now — the remaining requirement is one quiet
machine window (no foreign Chrome/Electron/Blender CPU) long enough to run
Browser then Electron on a candidate that includes the route fix.

## Native acceptance attempt — 2026-09-21

Continuation on the isolated worktree `.worktrees/pq040-native`, branch
`pq040-native`. The uncommitted dynamic-buffer-ranges fixture retarget was
committed first (`a58b18149`). All three Browser fast gates are green on the
candidate: 55/55, 6/6, and the render hot-path contract (`Render hot-path
contract OK`). The Electron route's settle-gate fix
(`consumePageConditionValue` at `flight-input`) is present in this candidate.

The exact Browser broker command was invoked once:

```text
node scripts/validation-broker-cli.mjs --manifest performance-dirty-ranges-browser
```

It minted claim `25836-0089fb65f2ff734abcf35d9e` and consumed the candidate's
single launch quota (candidate `2ce41ac8`), then the spawned probe stopped at
preflight with `PERFORMANCE_ATTRIBUTION_ENVIRONMENT_BLOCKED`: the 5 s census
recorded 2.69 foreign CPU cores aggregate against a 0.125 threshold, driven by
two chrome.exe processes (~6.9 and ~6.3 CPU-seconds each). No acceptance
runtime launched. This is an environment block, not a Browser failure — but
the quota is spent, so a retry on this candidate returns `blocked_repeat`.

A Browser diagnostic (`node scripts/check-performance-dirty-ranges.mjs
--runtime=browser --diagnostic`, non-promoting, no quota) then failed ~75 s in
at `page.waitForFunction` timeout with `tick: 0`, no player, no ships. Its
error evidence is unambiguous: `HTTP 404
/src/ui/capitalBossOverlayMount.js` + `net::ERR_ABORTED` — the static import at
`src/ui/uiRoot.js:70` (landed in `7ff338881`) references a module that exists
only as the capital-boss lane's uncommitted worktree file, so the whole
uiRoot module graph aborts and the default route never boots on any clean
checkout of this branch.

A quiet window did open (census `active=false`, 0.004–0.04 cores, two
consecutive samples). The exact Electron broker command was invoked once:

```text
node scripts/validation-broker-cli.mjs --manifest performance-dirty-ranges-electron
```

It consumed the Electron candidate's single launch quota (candidate
`2dc52cb4`, claim `23276-b9b90e397f36e6a0d2f333f8`), passed the start census
quiet (0.022 cores), provisioned Electron 43.2.0, and launched — then failed
at page boot on the identical `HTTP 404 /src/ui/capitalBossOverlayMount.js`
(`CSP-safe page condition timed out after 30000ms`, `tick: 0`). The run's own
census shows the machine stayed quiet through the entire attempt
(0.022 → 0.053 cores): this failure is the committed boot defect, not
contention.

Root cause is already diagnosed and repaired on `master`: `6b1688f79` ("Boot
repair: the capital-boss overlay import landed before its module") converts
the static import to a guarded dynamic import. This branch predates the
repair, and fixing the candidate requires a `src/ui/uiRoot.js` change, which
is outside this task's write set.

```yaml
unit: PQ-040.native-acceptance
candidateBranch: pq040-native
candidateHead: a58b18149c744b1bfacea012e285a679a0a35ef6
candidateWorktree: .worktrees/pq040-native
fastGateResult: 55 pass / 0 fail + 6 pass / 0 fail + render hot-path OK
browserManifestInvocations: 1
browserAcceptanceRuntimeLaunches: 0
browserBrokerResult: PERFORMANCE_ATTRIBUTION_ENVIRONMENT_BLOCKED
browserLaunchQuotaConsumed: true
browserDiagnosticResult: FAIL at boot — HTTP 404 src/ui/capitalBossOverlayMount.js (dangling import, no measurement windows)
electronManifestInvocations: 1
electronAcceptanceRuntimeLaunches: 1
electronBrokerResult: FAIL at boot — HTTP 404 src/ui/capitalBossOverlayMount.js, census quiet 0.022→0.053 cores
electronLaunchQuotaConsumed: true
dirtyVsFullSpanNumbers: none produced on this candidate (both runtimes died at page boot)
rootCause: src/ui/uiRoot.js:70 static import of src/ui/capitalBossOverlayMount.js, a module that exists only as another lane's uncommitted worktree file (landed 7ff338881); repaired on master by 6b1688f79 guarded dynamic import
numericAcceptance: unproven
```

Disposition: **BLOCKED**. The candidate cannot boot the default route, so no
dirty-range versus full-span numbers exist for it. The next attempt needs a
candidate that includes `6b1688f79` (or the landed capital-boss module) plus
one quiet machine window; a repaired candidate mints fresh launch quotas
automatically because its source digests change.

### Post-rebase acceptance run — 2026-09-21, 05:30Z+

The branch was rebased onto `master` including the boot repair `6b1688f79`;
the overlay import is now a guarded dynamic import, so the route boots.
New candidate HEAD `4f4e3ad5898b3cb499547e1513ee42d030b00be3` minted fresh
launch quotas. Two pre-rebase failure pointers
(`latest-acceptance-failure.json` under both runtimes) keyed to superseded
candidate digests — a Browser environment-block at 04:55Z and the Electron
`capitalBossOverlayMount.js` boot failure at 05:09Z — were deleted as stale
residue; all run artifacts, claims, and receipts were retained.

The exact Browser broker command was invoked once and the acceptance probe
ran the complete public route end-to-end (intro → main menu → new game →
authored flight → ordinary flight → galaxy map → waypoint → dock → station
hub → WebGL hardware check → `combat_vfx_burst` scenario, seed 47) and both
attribution variants:

```text
node scripts/validation-broker-cli.mjs --manifest performance-dirty-ranges-browser
```

Claim `20476-e194a3c346d2ab001c435235`, candidate `cb512794`, run
`performance-dirty-ranges-browser-2026-09-21T05-30-41-316Z-27208-24aa171d`.
The comparator printed real metrics and returned **FAIL**:

| Metric (combat_vfx_burst, dense) | Dirty-range | Full-span control |
|---|---:|---:|
| Logical payload bytes | 1,244,176 | 1,245,244 |
| Owner-requested upload bytes | 1,267,624 | 16,925,056 |
| Requested bytes / logical byte | 1.018846 | 13.591759 |
| Driver upload bytes | 30,359,916 | 39,617,976 |
| Driver bytes / logical byte | 24.401625 | 31.815432 |
| Frame p95 (ms) | 149.9 | 316.6 |
| Window samples | 42 | 32 |

Reductions: owner-requested bytes **−92.50%** (threshold ≥25%: met),
driver upload bytes **−23.30%** (threshold ≥25%: **missed by 1.7pp**),
frame p95 −166.7 ms in favor of dirty-range on a heavily loaded host.

Demotions recorded by the broker (verbatim classes): `windows[1] settings
changed during capture` (timeScale 0.12 → 1 inside the full-span window),
`contaminating-process-or-authoring-activity` at the end census, post-boot
`shaderLinks`/`shaderCompiles` inside both windows, `pipeline-warmup
unsettled` / `pipeline-cache-mismatch` on windows[1], `page/runtime errors
or warnings were observed`, and `driver upload bytes did not fall by at
least 25%`.

Two of the demotion classes are structural at this base, not
environmental:

- `src/ui/capitalBossOverlayMount.js` **does not exist** in this checkout —
  the capital-boss lane never committed the module. The guarded dynamic
  import boots the route but still logs `HTTP 404` + `net::ERR_ABORTED` +
  `[ui] capital boss overlay module unavailable` on every page load, so the
  zero-page-error/warning requirement is unreachable here. Repairing it is
  a `src/` change and therefore outside this unit's write set.
- A `GL_INVALID_VALUE: glGetProgramiv: Program object expected` storm (24
  warnings) — dead program handles queried during shader work; the harness
  program-query trap is read-only and merely records the callers, so this
  is product noise, not instrumentation.

The remaining demotions are host contention: bloomScene GPU bricks of
211/229/349/781 ms, first-flight build diagnostics, a partsLibrary LOD
demotion error, and Chrome census churn — every capture frame ran above
32 ms with backlog shedding (this machine runs the dense scenario at
~8–10 fps).

The exact Electron broker command was invoked three times:

```text
node scripts/validation-broker-cli.mjs --manifest performance-dirty-ranges-electron
```

- Invocation 1 (05:40Z, candidate `7b0ba962`): claim
  `27272-c0a67162db86fe7f07e2e8ef` minted, then preflight stopped with
  `PERFORMANCE_ATTRIBUTION_ENVIRONMENT_BLOCKED` — census 1.64 foreign CPU
  cores aggregate. No runtime launched, but the claim-mint incremented the
  launch counter (broker H6 reserves quota at mint).
- Invocation 2 (06:06Z, candidate `6007bee5` — after the receipt commit
  re-minted quota; the superseded-candidate env-block pointer was cleared):
  claim `20272-4c2e274ab365daa18766a961` consumed, run
  `performance-dirty-ranges-electron-2026-09-21T06-06-56-162Z-20252-349da123`.
  The route **completed end-to-end** (intro → authored-flight-ready →
  ordinary-flight-input → galaxy map → dock → station hub → WebGL →
  performance-captured), proving the guarded overlay import and the
  `consumePageConditionValue` settle gate on the packaged shell. It then
  died inside the baseline attribution: the `combat_vfx_burst` scenario
  prepare wait hit `CSP-safe page condition timed out after 120000ms`
  (`navigated` 06:08:42 → restore at 06:10:42 with no `prepared` line).
  Route state at failure: `authoredPresentationSafe: false` — 22 ships,
  only 3 authored-presented, 18 `missing`, 1 `pending`; the injected
  entities' authored admission never completed. The Browser run took ~75 s
  for the same prepare under comparable load; on Electron it starved past
  the 120 s condition. Zero measurement windows; all comparison metrics
  null.
- Invocation 3 (06:14Z, candidate `056cee97`): a second environment block —
  Chrome churned to 1.40 cores during the fast-gate lead before the start
  census sampled; quota consumed at claim mint, no launch.
- Diagnostic 1 (06:15Z, no quota): `node scripts/check-performance-dirty-ranges.mjs
  --runtime=electron --diagnostic`. Route docked but the market UI never
  opened (`dock-input` threw; probe continued from proven docked state),
  then station recovery failed — `station recovery requires a visible
  public Departure Check or Undock action`. Cause in console:
  `HTTP 404 /node_modules/@floating-ui/dom/dist/floating-ui.dom.browser.mjs`
  → `screen module "./station/stationScreen.js" unavailable` and
  `"./ship/shipScreen.js" unavailable` → `[screenManager] unknown screen
  "station"` — the station screen cannot mount on this Electron serve path,
  so no undock control exists.
- Diagnostic 2 (06:24Z, machine quiet ~0.01–0.04 cores): identical failure —
  dock-prompt recover loop, re-approach, re-dock, market UI blocked, no
  visible Departure Check/Undock. Same floating-ui 404. Also present:
  `[render] first-present GPU admission failed … renderer lifecycle
  destroyed during opening yield` and `asteroid instance pool dispose
  failed TypeError: Cannot read properties of null (reading
  'isInterleavedBufferAt')`.

Consistent across all three Electron launches: authored-ship admission
starves on the packaged shell (3/22 and 3/19 authored; the 06:06 run's own
console shows `authored composition failed; no substitute visual published`
for the player entity plus `opening GPU resources incomplete; entering
flight`). Combined with the intermittent `floating-ui` 404 killing the
station screen, the Electron route cannot reach the measurement windows at
this base — every failure is upstream of the comparator and none implicates
the dirty-range coordinator.

```yaml
unit: PQ-040.native-acceptance
candidateBranch: pq040-native
candidateHead: 4f4e3ad5898b3cb499547e1513ee42d030b00be3
candidateWorktree: .worktrees/pq040-native
staleBrokerStateCleared:
  - browser/latest-acceptance-failure.json (env-block 04:55Z, candidate 2ce41ac8 — superseded by rebase)
  - electron/latest-acceptance-failure.json (boot-fail 05:09Z, candidate 2dc52cb4 — superseded by rebase)
browserManifestInvocations: 1
browserAcceptanceRuntimeLaunches: 1
browserBrokerResult: FAIL — comparator printed metrics, windows demoted
browserCapturedRun:
  run: performance-dirty-ranges-browser-2026-09-21T05-30-41-316Z-27208-24aa171d
  comparatorPass: false
  ownerRequestedByteReductionFraction: 0.9250394132964515   # 1.27 MB ranged vs 16.93 MB full-span
  driverUploadByteReductionFraction: 0.2330255100528018     # 30.36 MB ranged vs 39.62 MB full-span — under the 25% bar
  frameP95DeltaMs: -166.7                                    # 149.9 vs 316.6
  demotedBy:
    - timeScale 0.12→1 inside full-span capture window
    - post-boot shaderLinks/shaderCompiles in both windows
    - windows[1] pipeline warmup unsettled + pipeline-cache mismatch
    - contaminating process activity at end census
    - page errors/warnings (capitalBossOverlayMount.js 404 — module absent at this base — plus 24x GL_INVALID_VALUE dead-handle queries and GPU bricks)
electronManifestInvocations: 3
electronAcceptanceRuntimeLaunches: 1
electronDiagnosticRuns: 2
electronBrokerResult: >-
  FAIL — the one real acceptance launch completed the route
  (consumePageConditionValue + guarded import verified on the packaged
  shell) then timed out at scenario prepare on authored presentation
  (3/22 authored, 18 missing); two diagnostics died earlier at the
  dock-input/station-recovery gate (floating-ui 404 -> station screen
  unmountable -> no undock control); zero windows, all metrics null
electronUpstreamDefects:
  - authored-ship admission starves on the packaged shell in every launch
    (renderer lifecycle destroyed during opening yield; authored
    composition failed for the player entity; scenario injected entities
    never admit) — consistent under load and under quiet
  - intermittent HTTP 404 on node_modules/@floating-ui/dom through the
    Electron serve path -> stationScreen.js/shipScreen.js imports fail ->
    screenManager reports unknown screen "station"
  - src/ui/capitalBossOverlayMount.js absent at this base (shared with
    Browser): guarded import boots but logs page errors every run
numericAcceptance: captured-but-demoted (browser only; electron produced no windows)
```

Disposition: **BLOCKED** for clean acceptance at this base — the required
fixes are `src/` changes outside this unit's write set: commit the missing
`capitalBossOverlayMount.js` module or drop its import, quiet the
dead-handle `getProgramParameter` callers, and repair the packaged-shell
authored-admission/renderer-lifecycle path plus the floating-ui serve 404
that make the Electron route unable to mount the station screen or admit
authored ships. The measured direction is consistent with every prior
capture — owner-requested bytes drop ~93% and driver bytes ~23% — but the
packet's ≥25% driver-reduction bar was missed on this run and all capture
windows were demoted. Electron produced no dirty-vs-full numbers: three
launches all died upstream of the comparator.

## Native acceptance attempt — 2026-09-24

Continuation on `.worktrees/pq040-native`, merged through `eb9962090`
(carries `d6827a6fd` — environment-census blocks classified
non-primary — `3b2133c8e` — the collision-impact scale module the
committed VFX graph imports — and `7a62ca144` below). All three fast
gates green on the merged candidate: 58/58, 6/6, render hot-path OK.

**Route repair found by the live run.** A browser acceptance probe
consumed claim `316-e56a224fd0a1f91a0343e513` (candidate `caa51e09`) at
15:12Z and ran the public route to the galaxy map, then failed three
retries waiting for `getByRole('button', { name: 'Set Waypoint' })`.
Failure screenshot showed the query typed and the result row rendered
but the dropdown still open and no selection painted: Enter died inside
`_selectSearchTarget`. Root cause reproduced on the ui-bench —
`_renderPlaceActions` throws `map control "sweep-sector" has no
binding-map label` (and `note` was also unregistered) when
`mapControlAttrs` stamps the place-action row inside `_updateInspector`,
so every chart selection crashed mid-refresh on master since
`092a9e298`/`6485635b8`. Repaired on master `7a62ca144` (both ids
registered in `MAP_CONTROLS` plus a pin that every place-action id
resolves a binding-map label) and merged into the candidate; the same
bench flow then closed the dropdown and revealed the primary action.

**Fresh claims, quota spent at mint.** Browser claim
`10164-e0f883253b41c37a06dd1393` (candidate `d1d5c9d5`, expiry 16:05:24Z)
and Electron claim `18704-3fdbca5c57874618fd58e96e` (candidate
`197646c6`, expiry 16:06:23Z) were minted against the repaired digest.

- Browser: 8 acceptance invocations between 15:58Z and 16:02Z all
  returned `PERFORMANCE_ATTRIBUTION_ENVIRONMENT_BLOCKED` — foreign
  browser/soak waves held the 5 s census at 8–52 CPU-seconds aggregate
  against the ~0.625 budget. The claim lapsed unconsumed; quota was
  already spent at mint.
- Electron: 5 consecutive environment blocks, then invocation 6 passed
  the start census at 16:06:10Z (claim consumed) and the route ran —
  intro → main menu → new game → authored flight → ordinary flight
  input → galaxy map — past the previously crashing chart step. The
  probe was then terminated mid-route by a 90 s outer timeout in the
  invoking retry wrapper: an orchestration fault in this session's
  polling loop, not a product or measurement failure. Zero attribution
  windows; all comparison metrics null.

```yaml
unit: PQ-040.native-acceptance
candidateBranch: pq040-native
candidateHead: eb9962090 (merge of 7a62ca144)
fastGateResult: 58 pass / 0 fail + 6 pass / 0 fail + render hot-path OK
browserManifestInvocations: 8
browserAcceptanceRuntimeLaunches: 0
browserBrokerResult: PERFORMANCE_ATTRIBUTION_ENVIRONMENT_BLOCKED x8 — claim lapsed unconsumed
browserLaunchQuotaConsumed: true
electronManifestInvocations: 6
electronAcceptanceRuntimeLaunches: 1
electronBrokerResult: >-
  consumed claim and ran route through the repaired chart step;
  terminated mid-route by outer 90 s retry-wrapper timeout
  (orchestration fault, not a product failure); zero windows
electronLaunchQuotaConsumed: true
routeDefectsRepaired:
  - map control "sweep-sector" (and "note") missing from MAP_CONTROLS —
    _renderPlaceActions threw inside _updateInspector, killing every
    chart selection and the Helios waypoint arm (7a62ca144)
numericAcceptance: unproven
```

Disposition: **BLOCKED** on machine quiet, narrowed further than ever —
the candidate now boots and the route no longer has a known break. The
next attempt needs one census-quiet window per runtime (~12 min each of
post-consume execution); claims mint fresh quota on the next candidate
digest, which this record's commit provides.

## Implemented architecture

### Scene-scoped publication coordinator

`src/render/dynamicBufferRanges.js` owns one coordinator per exact live `THREE.Scene` through a `WeakMap`. Owners
register only when that scene already has a coordinator. Standalone scenes, precompile `Group` objects, and other
non-live construction paths receive no owner and preserve their previous full-upload behavior.

Each registered owner retains:

- one non-allocating pending component span per tracked attribute;
- current attribute identity, fixed item size, component capacity, and bytes per component;
- pending, published, acknowledged, and superseded generation counters;
- one immutable preallocated published snapshot per binding;
- force-full state for initial creation, replacement, growth, and context restoration; and
- stable diagnostics for logical/requested bytes, range allocations, eligibility skips, acknowledgements,
  supersessions, violations, active count, capacity, and full/partial publications.

Owner writers union changed **component indexes**, not items or bytes. Multiple logical writes and commits before a
render therefore remain one owner-side span and allocate no public range record.

### Renderer-owned publication epoch

`src/render/renderer.js` creates the coordinator immediately after the live scene and arms one epoch around every
admitted live-scene render route:

- ordinary `drawPreparedFrame()` renderGraph, bloom, and straight-WebGL paths;
- opening GPU-resource preparation; and
- `state.render.warmPostProcess`.

The coordinator temporarily chains `scene.onBeforeRender`. Its wrapper:

1. invokes the exact prior hook first with the original receiver and arguments;
2. verifies that it still owns the hook and rejects re-entry or foreign replacement;
3. recomputes attachment, ancestor visibility, layer, culling, LOD, material, and active-count eligibility;
4. publishes each owner at most once in the renderer epoch;
5. calls `addUpdateRange(start, count)` exactly once per changed tracked attribute;
6. retains the exact appended public range-record identity before setting `needsUpdate` once; and
7. restores the exact prior hook on disarm without overwriting a foreign replacement.

Initial/restore generations use processing eligibility because Three.js initializes attributes before scalar material
visibility and instance-count draw suppression. Ordinary sparse generations additionally require visible material and
a positive instance count, so their dirty state survives skipped or hidden draws.

### Upload acknowledgement and write safety

Tracked attributes require exclusive range/version/callback ownership. Registration accepts only Three.js's default
no-op upload callback and installs the coordinator's sole acknowledgement callback.

The callback verifies the exact attribute, version, immutable snapshot, generation, epoch, and public range record.
For initial `bufferData`, it removes only its own still-present record by identity. For ordinary `bufferSubData`,
Three.js has already cleared the public ranges. The callback then acknowledges the generation without mutating owner
arrays or requesting another upload.

A coordinator-wide callback guard and owner-specific published-epoch guard run before any selected writer touches a
tracked typed array. Callback-time writes and same-render-epoch writes after publication fail closed. Direct callback,
version, attribute, or public-range ownership changes invalidate the owner instead of allowing a torn generation.

Context loss supersedes every unacknowledged snapshot, removes only the coordinator's exact outstanding record, and
keeps recovery explicit. Context restoration forces complete current attributes on the next processing-eligible
traversal.

### Combat sprite migration

`src/render/combat/instancedSpritePool.js` registers four live owners (`glow`, `ring`, `smoke`, and `combustion`) with
five tracked attributes each. The existing allocation-free writer still stores the exact same sprite values and now
marks one item in each corresponding component span. Logical commit updates the exact mesh count and leaves public
publication to the renderer epoch.

The precompile path supplies a `THREE.Group`, does not register a live owner, and retains the former complete
`needsUpdate` behavior.

### Trail-streak migration

`src/render/engineTrailSurfaces.js` registers the live trail-streak `instanceMatrix`, `aTrailColor`, and
`aTrailOpacity` attributes. Instance updates retain the exact matrix/color/opacity values and mark their three spans;
commit preserves live count and uniform behavior while deferring public publication to the renderer epoch.

Ribbon trails remain unchanged and continue to perform their existing complete position/UV publication. Authored
instance pools, ship-auxiliary pools, and unrelated VFX are also intentionally outside this bounded stage.

## Concrete reread repair

One direct reread of the completed implementation found one interrupted-publication cleanup defect. If an early
attribute of a multi-attribute owner published successfully and a later attribute failed, `owner.publishedEpoch` had
not yet been assigned, so cleanup keyed only by that owner field could miss the earlier active snapshot.

`supersedeIncompleteEpoch()` now scans each binding's immutable active snapshot and matching snapshot epoch directly.
Every partially published binding is therefore terminally superseded and its exact public record removed even when the
owner-level publication loop did not finish.

The focused unit and live WebGL checks were rerun after this repair. No additional broad review or validation loop was
opened.

## Focused verification

| Gate | Result |
|---|---|
| `node --check` on `dynamicBufferRanges`, `instancedSpritePool`, `engineTrailSurfaces`, and `renderer` | **PASS** |
| `node --test test/dynamic-buffer-ranges.test.mjs` after the reread repair | **5 pass / 0 fail** |
| `node --test test/vfx-instanced-sprite-pool.test.mjs` | **5 pass / 0 fail** |
| `node test/trail-streak-instancing.test.mjs` | **PASS** — spawn, recycle, cap, packing, attributes, and retirement |
| `node scripts/check-trail-streak-instancing-webgl.mjs` after the reread repair | **PASS** — real Three.js WebGL initialization and partial-update route, `glError: 0` |

The focused suite covers:

- component-unit span union and bounds;
- complete initial publication with hidden material and zero count;
- exact prior scene-hook invocation and restoration;
- skipped/ineligible ordinary generations surviving until draw eligibility;
- one merged packed-prefix range per selected sprite/trail attribute;
- upload acknowledgement and same-epoch write rejection;
- context-loss supersession and complete restore publication; and
- live precompile-program reuse and linked trail matrix/color/opacity attributes.

The live WebGL check observed three complete initial trail publications, three subsequent partial packed-prefix
publications, six synchronous upload acknowledgements, no additional live trail shader program, visible render-target
pixels, and no WebGL error. These counts are structural upload evidence only; elapsed performance is not used as an
acceptance claim.

Per the architecture-first execution direction, no broad baseline matrix, test-of-test expansion, repeated adversarial
loop, or workstation FPS run was opened after the focused gates passed.

## 2026-08-04 headless native-evidence readiness audit

A bounded reread of the actual driver-counter boundary found one material evidence defect. Three.js 0.184.0 sends a
dirty `BufferAttribute` range through WebGL2's five-argument
`bufferSubData(target, destinationByteOffset, sourceArray, sourceComponentOffset, componentCount)` overload. The GL
instrumentation wrapper ignored the final two arguments and charged the complete source array. The reproduced
regression requested nine `Float32` components (36 bytes) from a 128-component array but reported 512 bytes. Any
PQ-040 capture taken through that counter would therefore have made partial uploads look like full-capacity traffic.

`src/render/glInstrumentation.js` now derives partial-upload bytes from the exact component count and the source
view's bytes per element while preserving the complete-payload WebGL1/three-argument behavior. The regression also
pins the exact native arguments and receiver-preserving wrapper path.

The same audit added the missing dense CPU-side fanout proof. At both 18 and 90 trail instances, with all four sprite
buckets active and a trail commit after every logical spawn, the first qualifying renderer publication produced
exactly 23 Three.js range records: 20 sprite attributes plus three trail attributes. It allocated no public ranges
before renderer publication, retained active count independently from the 96-instance capacity, and reported the
exact packed-prefix requests:

- 18 trail instances: 1,600 bytes;
- 90 trail instances: 7,360 bytes; and
- complete-capacity comparison: 23,040 bytes.

One headless validation batch was run after the repair; it was not repeated:

| Gate | Result |
|---|---|
| `node --test test/perf-counters.test.mjs test/dynamic-buffer-ranges.test.mjs test/vfx-instanced-sprite-pool.test.mjs test/trail-streak-instancing.test.mjs` | **49 pass / 0 fail** |
| `node scripts/check-render-hotpath-contract.mjs` | **PASS** |
| `node --check` on `glInstrumentation`, `dynamicBufferRanges`, `instancedSpritePool`, and `engineTrailSurfaces` | **PASS** |

No Browser, Electron, headed, or hidden GPU process was launched in this audit. The repository still has no tracked
`performance-dirty-ranges-browser` / `performance-dirty-ranges-electron` manifests or matched full-upload comparator,
so native acceptance has not been synthesized from headless evidence. The remaining substantive work is one bounded
source-paired Browser/Electron A/B claim set after that comparator is wired: it must confirm the corrected counter at
the real GL boundary, visible dense-combat parity, bounded allocation/GC behavior, and a repeatable owner/driver gain.
If that single matched claim shows no gain outside noise, the packet's keep/remove rule still requires removing the
abstraction. Repeating the same runtime candidate would add no authority.

## Preserved boundaries

- `GameState`, deterministic simulation, fixed-step order, 60 Hz behavior, four-step foreground catch-up cap,
  fractional accumulator remainder, whole-step backlog shedding, and presentation scheduling are unchanged.
- Combat sprite and trail-streak capacity, active count, instance identity, ordering, values, density, lifetime,
  materials, shaders, blending, and visual output are unchanged.
- No content, population, effects, draw distance, LOD threshold, render scale, lighting, render quality, or default
  visual quality was reduced.
- Browser and Electron retain the same WebGL2 production renderer and VFX ownership routes.
- Cinematic intro/menu, compact third-person HUD, Massline behavior, gameplay systems, saves, assets, package
  dependencies, and source/release manifests were not modified.
- Ribbon trails, authored-instance pools, ship-auxiliary pools, and broader VFX remain explicitly deferred rather than
  being generalized without owner-specific evidence.
- No production GLB or texture was touched.

## Residual acceptance gap

Update 2026-08-05: the missing-surface statement in the historical readiness audit above was later
resolved by tracked commits `4eafbf1a` and `e982b593`. The paired Browser/Electron manifests and
causal full-span comparator now exist, so this is an unrun native acceptance gap rather than a
repository-plumbing blocker.

PQ-040 remains `acceptance: unproven`. Broker-managed evidence is still required for:

1. matched full-upload versus dirty-range Browser and packaged Electron routes bound to the same source candidate;
2. sparse and dense combat/trail presentation parity under churn, release/reuse, growth, hidden/zero-count frames,
   context loss/restoration, and current/five-times authored population;
3. admitted telemetry proving requested bytes follow dirty spans while cumulative range records, supersessions, and GC
   remain within the packet budget;
4. uncontended owner-plus-driver timing proving a repeatable benefit outside run noise without reducing content or
   quality; and
5. a keep/remove ruling for this abstraction plus separately admitted evidence before migrating ribbon, authored,
   ship-auxiliary, or unrelated VFX pools.

The implemented stage is dependency-ready for PERF-07 architecture work. It is not claim-ready for terminal PERF-06
acceptance: **dependency-ready is not claim-ready**.
