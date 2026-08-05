# PQ-040 — PERF-06 dirty-range GPU upload implementation receipt

```yaml
packet: PQ-040
scope: scene-owned dirty-range publication for combat sprites and trail-streak instances
implementationBranch: claude/perf00-20260727
implementationParent: ef0f79ec
implementationCommit: this_receipt_commit
routeClaim: integrated_structural_green
acceptanceClaim: focused_buffer_lifecycle_green_native_broker_pending
disposition: PARTIAL
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
