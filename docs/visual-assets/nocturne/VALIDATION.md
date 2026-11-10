# NOCTURNE validation and acceptance

## Verdict

**Implemented and available for draft review. Focused runtime and WebGL validation pass.
Whole-game visual acceptance and target-hardware performance acceptance remain open.**

The evidence deliberately distinguishes four different claims:

1. Runtime tests verify source selection, lifecycle, resource bounds, shadows, settings and
   material/compositor contracts.
2. Actual Chromium WebGL fixtures verify shader compilation, physical surface contribution,
   participating media, both HDR compositors, and context restoration.
3. The public New Game/Launch route was attempted but cannot start because the current upstream
   source tree imports missing audio modules. A third missing station module was found by static
   import inspection. No substitute modules or non-lighting source replacements were used.
4. The available GPU is SwiftShader, a software implementation. Its timings do not satisfy or
   establish the proposed 2–3 ms target on real integrated or discrete GPUs.

This is a draft implementation review, not approval to merge or a claim of a completed
production visual/performance gate.

## Reproduction commands

Install the repository's normal development dependencies and Playwright Chromium. The fixtures
load **the repository's vendored Three module and addons**. The observed vendored revision is
184; the package manifest version is not used as evidence of what the browser rendered.

```sh
npm run check:nocturne
node scripts/check-nocturne.mjs --report=docs/visual-assets/nocturne/runtime-tests.json
npm run check:src-syntax
node scripts/check-src-reachability.mjs
node scripts/sync-modulepreload.mjs --check
node scripts/check-nocturne-authoring.mjs

node scripts/nocturne-director-bench.mjs
node scripts/nocturne-atmosphere-check.mjs --out=artifacts/nocturne/atmosphere --samples=16
node scripts/nocturne-atmosphere-check.mjs --route=graph --out=artifacts/nocturne/graph --samples=16
node scripts/nocturne-content-check.mjs --out=artifacts/nocturne/content --asset-cache=.
node scripts/check-nocturne-gameplay.mjs
```

Browser selection and exact environment overrides are documented in the
[atmosphere guide](atmosphere-validation.md), [content fixture](content-validation.md), and the
scripts. The recorded browser runs explicitly use SwiftShader. The full-game smoke uses a
fresh browser context and a canonical local game server without a player save store. Sparse
checkout assets are either present locally or fetched from an immutable Git revision; cached
bytes are verified against the Git blob hash before use.

The content command assumes a full checkout containing the release Kestrel asset. For a sparse
checkout, replace `--asset-cache=.` with a repository-shaped cache containing those verified bytes.
Omitting the cache runs a synthetic combat target and does not reproduce the Kestrel capture.

The focused runner rejects empty child-process output and subprocess errors, even if the host
reports a zero exit code. In the execution environment used for this work, sandboxed Node child
processes returned `EPERM` with empty output; the final run used permitted full child-process
execution. No empty test-file wrapper was counted as passing its contained tests.

## Focused runtime verification

The retained [runtime report](runtime-tests.json) gives exact case counts, raw output, and source
SHA-256 identities before and after the run. It covers the registry/director, shadow admission,
actual VFX/weapon/engine adapters, content and sockets, probes, both atmosphere routes, settings,
illustrated materials, and existing bloom regressions. Source identity must remain stable
through the run. The separate [core regression report](director-evidence/regression-results.json)
also records profile, preset, and settings-reset regressions.

Behavioral checks include 1,024 logical sources competing for a fixed resident set; camera and
range rejection; retained winners and hysteresis; envelope/TTL handling; NaN suppression; missing
or detached sockets; real shadow-resource reuse; cached shadow-camera transforms; type-correct
private admission; same-frame combat illumination; proxy generation safety; world-boundary
cleanup; context-loss disposal; strict metadata bounds; and save/profile round trips.

The new Video controls were exercised in the real isolated Settings screen at 1280×800.
All seven recorded control transitions passed, with no browser exceptions or failed resources.
See the [settings evidence](settings-evidence/README.md).

## Surface illumination at the gameplay camera

The content fixture uses the ordinary 144 WU chase distance, 60° tilt, 50° vertical FOV and a
960×540 viewport. It executes the production content, director, illustrated shader, probes and
HDR compositor. The industrial, derelict and alien layouts are labeled diagnostic authoring
rigs. The combat target is the released Kestrel GLB, verified against Git blob
`761698bdd8482225b179066a45827c0685366960`, with its authored material pipeline.

Direct-light comparisons turn **bloom and atmosphere off**, retain the emitter materials, and
measure non-emissive surface pixels. The comparison therefore demonstrates light on other
geometry rather than an emitter's own glow.

| Composition | Changed surface pixels, summed RGB delta at least 6 | Mean absolute RGB byte delta | What was inspected |
| --- | ---: | ---: | --- |
| Industrial | 120,201 | 32.60 | Elevated amber key, side furnace, cool service pool, geometric shading |
| Derelict | 73,047 | 25.04 | Separated emergency pools and exposed core with dark intervening regions |
| Combat | 4,540 | 8.93 | Real Kestrel target lit by moving ship sources in clear vacuum |
| Alien | 23,109 | 18.89 | Low green and higher violet sources, translated instanced receiver geometry |

The industrial layout was also tested under the bright Arcade mood and a directional key:
122,916 non-emissive pixels changed with direct light enabled. Shader program counts remain
stable across on/off comparisons. There were no browser or shader errors.

The derelict's indirect field is intentionally faint: its mean byte difference is about 0.05.
This proves transport through the shader but does not establish a strong art-direction effect.
The industrial probe gives a more visible warm contribution. Local analytic probes do not
represent captured geometry or solve room occlusion.

Screenshots, masks, source hashes and raw results are in the
[content validation report](content-validation.md). The review opened the composed captures,
direct/off pairs and bright-mood pair. These are evidence of the lighting mechanisms and the
authoring layouts, not accepted screenshots of the running industrial location or combat route.

## Atmosphere, depth and both compositors

The atmosphere fixture uses actual WebGL, a real shadow-bearing spotlight, opaque blockers,
bounded dust, and a point source. It compiles the exact vendored native comparison-depth shadow
path. Both the default bloom route and the AO-enabled SpaceRenderGraph were exercised at
1280×720 with balanced atmosphere settings.

| Check | Default bloom | SpaceRenderGraph with AO |
| --- | --- | --- |
| Browser/shader errors | None | None |
| Programs, on / off / vacuum | 6 / 6 / 6 | 9 / 9 / 9 |
| Atmospheric extra draws | 1: 8 → 9 | 1: 18 → 19 |
| Vacuum versus disabled pixels | Exactly equal below diagnostic label | Exactly equal below diagnostic label |
| Actual WebGL context loss and restoration | Passed | Passed |
| Spotlight shadow texture | Native comparison depth | Native comparison depth |

The balanced pass uses two 640×360 MRT history targets, with a measured attachment storage
calculation of 7,372,800 bytes, plus the scene depth attachment. Integrated quality uses quarter
dimensions; the map/step/resource bounds are in the architecture document. The exact captures
and visual review notes are in [the atmosphere guide](atmosphere-validation.md).

The shadow-disabled image changes both surface and atmospheric shadowing; its pixel delta must
not be described as a volumetric-only occlusion metric. Integrated-quality captures show some
sampling noise near the deliberately concentrated emitter. Other contributing lights are
unshadowed, so their source visibility is explicitly approximate.

## Measured performance and limits

### CPU source scheduling

The reproducible director benchmark uses 1,024 logical point sources, eight resident points,
three spots, 200 warm-up updates and 2,000 measured updates at a simulated 60 Hz. On the shared
EPYC/Node 24.19.0 host, the final recorded update times were:

| Mean | p95 | p99 | Maximum |
| ---: | ---: | ---: | ---: |
| 0.03545 ms | 0.16329 ms | 0.24966 ms | 3.12628 ms |

These are CPU wall-time measurements of the scheduler. They exclude the whole content census,
game simulation, renderer, GPU work and presentation. Shared-host outliers are retained. They
do not prove a 60 FPS game or zero transient allocations. See the exact source-bound
[CPU report](director-evidence/README.md).

### Actual software GPU queries

Sixteen interleaved samples were recorded with `EXT_disjoint_timer_query_webgl2` where available.
The values are the **whole diagnostic fixture** with atmosphere disabled/enabled, not isolated
per-component GPU timers or a before/after comparison of the old game renderer.

| Fixture | Software GPU median, off | Software GPU median, on | CPU submission median, off / on |
| --- | ---: | ---: | ---: |
| Bloom | 88.835 ms | 293.841 ms | 0.500 / 0.600 ms |
| Graph with AO | 185.796 ms | 388.979 ms | 0.500 / 0.700 ms |

SwiftShader is far outside the proposed hardware envelope in this deliberately dense diagnostic.
It is useful for shader correctness, capability, depth, lifecycle and counter verification.
It is not a substitute for measuring an integrated GPU. **The 2–3 ms incremental lighting target,
0.5–1 ms shadow component and 0.5–1 ms atmosphere component are not certified.**

No clustered renderer was introduced because there is no measured comparison supporting such a
rewrite. Stable forward residency is the chosen compatibility backend. The next performance pass
should first tune selection/update cadence, caster admission, volume resolution and sampling
against identical real gameplay scenes before deleting authored content or adding a new backend.

## Full-game route blocker

`scripts/check-nocturne-gameplay.mjs` planned the actual main page, first-run Play, New Game,
Launch and ordinary keyboard controls. Execution stopped before the first actionable Play button;
the subsequent steps were not reached.
Network evidence recorded HTTP 404 for:

- `src/audio/trailerScore.js`
- `src/audio/recipeCaptions.js`

Both imports are in upstream `src/audio/audioSystem.js` at mainline
`6a9eec796e3b25e2b08526cd4412503d32cccb12`. Static import inspection also found
`src/ui/station/stationLife.js`, imported by `stationApp.js`, absent from the tracked tree.
The later observed mainline `736b4b7bca6ce41672f39ef1981ccb81c8df3bfe` did not supply those
modules. These are not missing sparse-checkout paths. The raw failed route and import inspection
are retained in [gameplay evidence](gameplay-evidence/README.md).

The same audio import prevents whole-renderer lifecycle/photo/warm-up tests from linking.
The focused tests avoid that unrelated graph and do not stub the missing implementation. No
gameplay success, scene-density benchmark, whole-game program-count stability, frame pacing,
or full-game memory/GC acceptance is claimed.

## Remaining acceptance work

- Restore the missing upstream modules, rerun the public route, and inspect the normal camera
  in actual station, mining, derelict, combat and dense scenes, including transitions and saves.
- Measure baseline versus NOCTURNE on an actual integrated GPU and at least one discrete GPU.
  Record complete frame time distributions, GPU timers, component costs, calls, programs,
  residency and allocation traces with matching cameras and density.
- Complete individual asset/location art passes, including instanced-only luminous mineral
  bindings and remaining welding/arc producer metadata. The coverage inventory identifies
  implemented mechanisms and unverified or incomplete cases.
- Judge unshadowed point-light leakage and the one-map local shadow tradeoff in enclosed
  structures. Keep occlusion-critical emitters marked accordingly.
- Validate baked reflection assets if added. Current local radiance fields are analytic, and
  no dynamic GI or real captured-reflection coverage is claimed.

Screenshots and timings keep their captured source hashes. Narrow lifecycle-only fixes made
after capture are documented in the explicit [atmosphere](atmosphere-lifecycle-followup.json)
and [content](content-lifecycle-followup.json) receipts, with additional regression evidence.
