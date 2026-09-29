# Wave-4 Lane Report — Depth Prepass / Early-Z

Lane question: *is opaque overdraw actually heavy enough that a depth prepass on the
largest occluders pays for its extra geometry pass + binds?*

Branch: `devin/1790655742-w4-depthprepass` off `origin/master`.

## Verdict

**Overdraw is demonstrably heavy at the canonical heavy view, and a partial depth
prepass removes 50–98% of the wasted shading.** All numbers below are measured in the
engine's *real* draw order — see "Ordering discovery" for why that matters.

Measured on seed-47 poses (`scripts/probe-overdraw.mjs`, 320×180 RGBA8 layer counting —
API-semantic, exact on SwiftShader):

| pose | coverage | D (layers/px) | S control (no prepass) | S with prepass | waste cut |
|---|---|---|---|---|---|
| station_helios approach | 0.48 | 3.64 | **2.08** | **1.52** | −51% |
| station_helios inside | 0.18 | 3.45 | **2.03** | **1.52** | −49% |
| station_coalition approach | 0.18 | 3.32 | 1.91 | 1.01 | −99% |
| station_coalition inside | 0.07 | 3.45 | 1.96 | 1.02 | −98% |
| station 74 approach | 0.09 | 4.53 | 2.09 | 1.02 | −98% |
| station 74 inside | 0.02 | 6.22 | 2.39 | 1.04 | −98% |
| world_site_helios_relay approach | 0.13 | 1.98 | 1.40 | 1.40 | 0%* |

*world_site is not `entity.type === 'station'` so no prepass installs there — the
unchanged S is a built-in sanity check that the A/B isolation works.

- **D ≈ 3.5–6 opaque layers per covered pixel** at every station pose — far over the
  lane's ~2× gate. Control **S ≈ 2.0–2.4**: ~1.0–1.4 screen-equivalents of PBR fragment
  work shaded and then overwritten per covered pixel, every frame.
- The prepass floor `Spre ≈ 1.0` validates the method (full prewrite ⇒ ~1 layer/px).
- Helios keeps 0.52 residual waste: its overlap includes sub-40 m sources and surfaces
  excluded by the eligibility gates — the heavy hull layers are gone either way.

**Pixel-exactness:** rendering the real scene into an offscreen RT with the prepass
meshes toggled on vs. hidden produces **0 differing pixels** at both station_helios
approach and inside poses (129,600 px frames). Zero visible quality change.

## Ordering discovery (why the prepass is structured the way it is)

The engine **disables three.js's opaque sort**: `src/render/renderer.js` installs
`renderer.setOpaqueSort(() => 0)` — "Opaque order is depth-tested. Skipping the default
painter sort saves a full scene comparison on the iGPU thread." Consequences verified
by instrumenting `renderBufferDirect` on a live frame:

- Opaque draw order is **scene-traversal order**, not `painterSortStable`.
  `renderOrder` is dead config for opaque objects (three.js still sorts
  *transparent* objects separately — unaffected).
- A prepass mesh parented *inside* its source therefore draws immediately *after*
  that source — useless for it. First iteration of this lane made exactly that
  mistake; the live-instrumentation result (prepassIdx = srcIdx+1 for every pair)
  forced the restructure below.

**Patch ordering:** each prepass mesh is spliced to **index 0 of an ancestor's
`children` list** — the highest ancestor whose transform chain to the source is static
(`stationDepthPrepassScope`). That node is the authored place root for station_helios:
its 41 prepass drawables occupy child indices 0–40 and draw before *all* authored
station content — the maximal safe coverage. Static-chain parents mean the composed
local matrix stays correct forever; LOD/damage visibility syncs through
`registerBinding` with cloned tags (same mechanism as the Cathedral prepass).

## Research citations

- **GPU Gems, Ch. 29 "Efficient Occlusion Culling"** (Widerberg): early-z rejects a
  fragment *before* texture fetches and the fragment program — requires front-to-back
  submission; a prepass manufactures that order.
- **Interplay of Light, "Depth pre-pass"** (interplayoflight.wordpress.com): partial
  prepass on the largest occluders — position-only output (here: shared geometry +
  bare `gl_Position` shader); the cost side is extra draw calls + vertex processing,
  hence the mandatory measurement gate.
- **Utah CS "Early-Z" lecture**: early-z fails on `discard`/alpha-test/`gl_FragDepth`
  writes → drives the eligibility predicate (transparent, alphaTest>0, polygonOffset,
  displacement, `depthWrite:false`, non-`LessEqualDepth`, skinned/morph/instanced all
  excluded, so every prepassed depth equals what the color pass writes).
- **ARM Mali "Depth Prepass" developer guide**: prepass ROI is scene-dependent — the
  lane's measure-first gate.
- **dawnarc forward-rendering notes**: fragment shading runs in 2×2 quads — silhouette
  edges waste more than the pixel count suggests; strengthens the EV.
- **three.js r184 `WebGLRenderList`/`setOpaqueSort`**: `painterSortStable` exists but
  is bypassed here — the probe therefore reproduces **traversal order**, not a sort.

## Profile evidence (method)

`scripts/probe-overdraw.mjs` (Playwright + the game's own vendored three.js):
walks the scene in `projectObject` traversal order (frustum culling by world bounding
sphere, per-material-group items — no sort, matching the engine), then rasterizes into
a small RGBA8 target with `+1/255` additive writes:

- **D** — count with depth test off = geometric depth complexity per pixel.
- **S** — count with depth test on in traversal order = fragments that pass and get
  shaded (wasted layers = S−1).
- **Spre** — full depth prewrite, then the S count again = the theoretical floor.
- `SF_OVERDRAW_NO_PREPASS=1` — drops `spacefaceDepthPrepass` items from the list:
  same-tree counterfactual control for the A/B (the two tables above).

Prepass inventory at `station_helios` (place root `stationOpaqueDepthPrepass`
userData): 41 drawables — `GLTFKit_StaticGroup_*` merged batches and
`flight-static-lane*` hull shells ≥ 40 m world radius, sharing source
`position`/index buffers (concatenated index views or `setDrawRange` views for
partially-eligible group sets — zero new vertex buffers, one shared
`ShaderMaterial`).

## Patch

`src/render/partsLibrary.js`:

- `stationDepthPrepassMaterial()` — singleton position-only `ShaderMaterial`:
  `colorWrite:false`, `depthTest/depthWrite`, `FrontSide`, `gl_Position` vertex,
  zero-work fragment. One extra program.
- `stationDepthPrepassEligibleMaterial(material)` — opaque, visible, depthWrite,
  LessEqualDepth, no alphaTest/opacity<1/displacementMap/polygonOffset,
  FrontSide-or-DoubleSide (BackSide excluded — prepass must not write faces the
  color pass culls).
- `stationDepthPrepassDynamicNode(object)` / `stationDepthPrepassScope(source, root)`
  — dynamic markers (`animated`, `hlod`, `spacefaceSocket`, `updateRuntimeState`,
  `updateDriveState`, `updateLod`, `tags.drive`, `tags.mount`) stop the climb; the
  prepass attaches at the last static ancestor (the place root in practice).
- `installStationOpaqueDepthPrepass(root, entity, bindings)` — gates
  `entity.type === 'station'`; skips skinned/instanced/morph/custom-onBeforeRender
  sources, invisible non-LOD sources, and self-marked prepasses; world-radius ≥ 40
  via `localRadius × max|worldScale|`; per-material-group eligibility with
  full-share / indexed-view / drawRange-view depth geometries; cloned tags minus
  `mount` (a depth shell must never resolve as an attachment target);
  `registerBinding` puts the prepass in the same LOD/damage buckets as its source;
  `children.splice+unshift` prepends it at traversal index 0 of the scope.

`scripts/probe-overdraw.mjs` — the measurement tool (committed; the
`SF_OVERDRAW_ELEMAUDIO_STUB` env hook exists for the boot blocker below).

## Metrics

- Golden sim hash: `cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885`
  — **identical** on the merged tree (`--repeat 20 --reload-at 600`, deterministic).
- Wasted shaded layers/px: **1.08 → 0.52** helios approach, **0.91 → 0.01**
  coalition approach, **1.09 → 0.02** station 74 approach.
- Visual A/B: **0 differing pixels** (129,600 px) at both measured poses.
- Cost: 41 extra depth draws, ~130 k tris vertex-only, 1 shader program, 0 new
  vertex buffers.
- Zero visible quality change: `colorWrite:false` + identical transforms ⇒
  identical clip-space depth; `LessEqualDepth` admits the real surfaces.

## Upstream finding (not this lane's fix)

Master commit `4b708d40c` (CV-EAR-1) added `src/audio/elementaryVoices.js` with a
static `import { el } from '@elemaudio/core'`, but `index.html`'s importmap maps only
`@elemaudio/web-renderer` — the module graph fails to resolve and **the game boots to
a blank page on current master** (reproduced there). A bare importmap entry is not a
fix: `@elemaudio/core`'s real dist imports `shallowequal`, `invariant`,
`eventemitter3` (all unmapped; mostly CJS-only packages). Likely resolution: vendor a
bundled ESM build of `@elemaudio/core`, or revert to the dynamic-import pattern
`audioSystem.js` already uses at line ~6052. Verified harmless to this lane via a
test-only `page.route` importmap stub (`scratch-shims/elemaudio-core.mjs`, local
scratch — not committed).

## Caveat

This box renders WebGL on SwiftShader — no hardware GPU. Layer counts are
rasterization-semantic and exact; wall-clock GPU timing deltas are not measurable
here. Confirm on a real-GPU box via `node scripts/gpu-evidence-run.mjs` if a
frame-time attribution is wanted.
