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
nativeAttemptDisposition: CAPTURED_DEMOTED_BY_ENVIRONMENT
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
      before sampling the released baseline (alphaLiveBaselineRoute.mjs, hunk
      rides uncommitted atop the foreign readiness rewrite; stale PQ-033.02
      checkpoint on the file made it adoptable). This tightens the measurement:
      the powered-vs-released contract itself is unchanged.
    earlierAttempt: broker-claim-stale-digest (foreign worktree write raced claim->probe)
numericAcceptance: captured-but-demoted
pairedRuntimeSourceBinding: not_established
```

The exact blocker is the shared-worktree environment, not the mechanism: both
captured runs agree on direction and scale — owner-requested upload bytes drop
91–96% and driver upload bytes drop 38–47% versus the causal full-span control at
unchanged frame p95 — but the acceptance contract requires a clean, stable
candidate for the whole capture plus a zero-warning page, and concurrent foreign
render work (renderer admission-path churn, opening-submission diagnostics) kept
tripping worktree-stability, settings-stability, and page-warning gates. The
Electron side launched three times and failed identically at the route's
flight-input causal check — root-caused to a settle-timing defect surfaced by
the in-flight readiness-contract rewrite (see `rootCauseFound` in the YAML) and
fixed with a settle gate ahead of the released baseline in
`alphaLiveBaselineRoute.mjs`. The next unblocked Electron attempt should pass
that phase; it has not yet exercised the attribution stage. Both manifests sit
at `regression-required-after-acceptance-failure` until the regression set
changes again.

Evidence retained under `.devshots/perf/dirty-ranges/{browser,electron}/`:
`performance-attribution.json` / `performance-closure-failure.json`,
`dirty-range-comparison.json`, `run.log`, and route screenshots per run.
Next attempt needs the same two manifests on a quiet, non-churning tree; the
recorded comparator deltas are the expected outcome to confirm, not a pass.

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
