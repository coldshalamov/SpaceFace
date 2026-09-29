# Wave-4 Lane Report — Bake Pipelines (runtime → build)

Lane question: *what is still computed at runtime for static content that could be baked to a
build-time artifact — AO? IBL/environment probes? static shadow results? color LUTs?*

Branch: `devin/1790662331-w4-bakepipes` off `origin/master`.

## Verdict

**PATCHED.** The census below found the runtime surface already well-baked: static batch
caches, matrix freezes, model-truth census, deep-sky plates, render packages, program-binary
cache, KTX2/meshopt decode pools, and the authored-stage shadow latch all shipped in earlier
waves. One real runtime-computed static remained — and it was the largest single synchronous
block of pure-JS work in the boot window:

**Foundry IBL preprocessing** — every boot fetched the 6.6 MB `industrial_workshop_foundry_2k.hdr`,
decoded ~2M RGBE texels to Float32 in JS (~80 ms measured on this box), then ran two full-image
Float32 passes — `normalizeHdrMeanRadiance` (~24 ms) and `neutralizeHdrGreenCast` (~17 ms) —
~120 ms of main-thread work inside the opening window (and proportionally worse on the iGPU/
software-tier boxes this codebase is tuned for, where scalar JS runs multiples slower).

This is now `assets/background/env/industrial_workshop_foundry_2k.f32.bin` (32 MB raw RGBA
Float32) + a `spaceface.foundryIblBake.v1` manifest, produced by `scripts/bake-foundry-ibl.mjs`
— which calls the *same* exported decode path (HDRLoader @ FloatType) and the *same* exported
transform functions, so the artifact is byte-identical to what the runtime produced. The runtime
fast path verifies the served payload's sha256 against the manifest before the bytes are used —
the literal "runtime check that the baked value is used" — and falls back to the .hdr decode on
any mismatch, so the env is identical either way.

Measured A/B of the real load path (node, this box): **baked ~50 ms** (fetch + native sha256 +
wrap) vs **decode ~114 ms** (fetch + parse + two transform passes); pixels byte-identical. The
win grows on weak CPUs because both the ~80 ms RGBE→f32 decode and the ~40 ms of float passes
scale with single-thread JS throughput, while `crypto.subtle.digest` is native code.

## Research citations

- **Khronos glTF 2.0 — `occlusionTexture`**: the standard answer for baked AO — ship it as a
  texture channel (or vertex color) rather than computing ambient occlusion at runtime.
  https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
- **three.js `PMREMGenerator.fromEquirectangular`**: what this repo already does per env source —
  radiance convolution is a GPU bake; prefiltered env maps are the industry's canonical
  "bake specular ambient" answer (they land GPU-side here by construction — see census).
- **id Software `qbsp`/`vis`/`light` toolchain (Quake, 1996)**: the origin of PVS + lightmaps —
  visibility and lighting solved offline into BSP/BM data because the runtime couldn't afford
  them. The direct ancestor of "move runtime work to build time".
- **Umbra Software occlusion middleware** (now Unity Umbra): industrial-strength offline PVS —
  portal/visibility data baked from geometry so the runtime does zero set construction.
- **Valve Developer Community — Lightmaps / `vrad`**: lightmap baking for static lighting,
  including the constraint this repo already honors: baked results are only valid for
  never-moving geometry+lights (hence "shadow latch" instead of shadow-map baking).
- **Precomputed Radiance Transfer (Sloan, Kautz, Snyder 2002)** and **Poly Haven HDRI** usage as
  the source of truth for IBL bakes — offline radiance in, baked lookup out.
- **Netscape/PNG lossless pipeline & KTX2/Basis**: the bakeable boundary is "what can a byte
  file reproduce exactly" — GPU-shader output and canvas rasterization can't (see census
  rejections), deterministic Float32 math can.

## Runtime-computed-static census

Audit method: read the boot path (renderer init → `createSpaceBackground` → `_loadFoundryIbl`),
then every `Float32Array`/canvas/RenderTarget-producing site reachable for static content.

| Candidate | Where | Verdict |
|---|---|---|
| **Foundry IBL decode + normalize + neutralize** | `foundryEnvironment.js` `loadFoundryIblTexture` | **BAKED** (this lane). Pure deterministic Float32 math on a static asset — the only runtime-computed static with both real cost and provable identity. |
| PMREM convolution of the IBL | `renderer._bakeEnv` (`pmrem.fromEquirectangular`) | REJECTED — GPU output; a shipped render target can't reproduce per-GPU results bit-identically. Already computed once per texture arrival, not per frame. |
| Sector nebula tiles (L0/L1/L2) | `spaceBackground.js` `bakeAll` → fragment shaders | REJECTED — GPU-rendered (GLSL noise, `fract`/`sin` ULPs are implementation-defined), keyed by (sector skySeed × GPU tier × palette) — an unbounded-by-build matrix. |
| Planet impostors / flare atlas / comet | `spaceBackground.js` bake rig | REJECTED — same GPU-bake family, plus runtime-keyed (sector, composition RNG). |
| Star field geometry (6–16k verts) | `_createStars` seeded JS | REJECTED — deterministic but cheap (~ms), keyed by sector+seed+tier; a baked grid would need the same combinatorial matrix as the nebula tiles for no measurable win. |
| Shadow maps for static lights | `shadowCasterPolicy.js`, `shadowDepthAdmission.js`, `renderer` latch | ALREADY LATCHED — authored-stage shadow latch landed; the one live key light tracks the player (its ortho box is player-following, verified at renderer.js ~14538) so there is no static shadow result to freeze. |
| Ship hull canvas textures (panel albedo, greeble, decals, grime, nose art) | `canvasTextures.js`, `shipKit.js` module cache | REJECTED — canvas 2D rasterization (arcs, gradients, text) is rasterizer-dependent; shipping PNGs can't guarantee the "identical output" contract across engines. Already session-memoized per key. |
| `makeNoiseTexture`/`makeHullNormalMap` (pure JS→putImageData halves) | `canvasTextures.js` | REJECTED (near-miss) — deterministic JS so lossless-PNG-identical in principle, but the keyed matrix is (hull × accent × panelCount × seed) across faction palettes at 1024²×2 ≈ 8 MB/ship-line; measured work is once-per-hull-composition, already behind the `_shipTextures` memo. Net win ≈ tens of ms total, spread across admissions — not worth ~100+ MB of shipped PNGs. |
| Procedural PBR fallback bundles | `proceduralPbrFallback.js` | ALREADY MEMOIZED — 128² ORM/normal/cavity bundles per (role × variant) at module scope; ~ms scale. |
| modelTruth census | `src/data/modelTruth.js` | ALREADY BAKED — `modelTruthCensus.json` is a build artifact (`scripts/model-truth-census.mjs`). |
| Deep-sky plates | `deepSkyPlates.js`, `tools/art/bake_deep_sky_plates.mjs` | ALREADY BAKED — authored sources → PNG + manifest + sha, bounded residency. |
| Render packages / program binaries / KTX2 | `flightProductCooker`, program-binary cache, worker decode pools | ALREADY BAKED — content-hash-pinned packages (267), WEBGL_get_program_binary cache, offline transcode. |
| Audio environment IR | `environmentMix.js` `renderEnvironmentIr` | REJECTED — deterministic but keyed by browser `sampleRate` (not a static input), ~ms scale per class. |
| Per-frame color grading LUTs | post chain | ALREADY ADJUDICATED — corpus closure: LDR per-pixel decision chain, no static LUT to bake. |

The honest tail: after this patch there is **no remaining runtime-computed static value** that
satisfies (deterministic input) ∧ (non-GPU/non-rasterizer output) ∧ (material cost). The next
bake-shaped wins would be GPU-PIPIC-illegal (PMREM texture, nebula tiles) or combinatorially
keyed (per-sector star fields) — both documented above.

## Patch

- `scripts/bake-foundry-ibl.mjs` — decodes the .hdr with the same HDRLoader@FloatType the
  runtime uses, runs the same `normalizeHdrMeanRadiance` + `neutralizeHdrGreenCast` exports in
  the same order, writes the raw Float32 RGBA payload + manifest (schema, dims, sha256 of
  payload AND of the source .hdr, transform stats). `--check` recomputes and compares
  byte-for-byte.
- `src/render/foundryEnvironment.js` — `loadFoundryIblTexture` now tries the baked path first.
  `loadBakedFoundryIblTexture` fetches manifest + payload, validates schema/format/dims/length,
  computes `crypto.subtle.digest('SHA-256')` over the payload and requires it to equal the
  manifest sha — **the runtime check that the baked value is used**. Verified bytes are wrapped
  into a `THREE.DataTexture` configured field-for-field like `DataTextureLoader`'s product
  (LinearFilter overrides, FloatType, equirect mapping) and stamped
  `userData.foundryIblBaked = { verified: true, sha256 }`. Any failure → the unchanged .hdr
  decode path, which produces identical pixels.
- `assets/background/env/industrial_workshop_foundry_2k.f32.bin` (33,554,432 B) +
  `.f32.json` manifest — the baked product, checked in (the .hdr remains the authoring source
  and the fallback path).
- `test/foundry-environment.test.mjs` — four new pins: artifact+manifest agreement, artifact
  bytes == full recompute of the runtime algorithm, the verified fast path returns an identical
  `DataTexture` with the `verified` stamp, and tampered-manifest rejection.
- `package.json` — `bake:foundry-ibl` and `check:foundry-ibl` (script --check + the test file).

Quality contract: the baked payload is a pure function of the .hdr bytes through the shipped
transforms — `check:foundry-ibl` fails the moment the source or algorithm drifts. PMREM input
pixels are byte-identical, so the rendered environment cannot differ.

## Metrics

- **Golden 47a** (`run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect
  test/47a.telemetry.expected.json --hash --repeat 20 --reload-at 600`):
  `sha256 == baselineSha256 == cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885`,
  `deterministic: true`. Identical — the sim never touches the IBL path; no sim-path edit.
- **Boot-window load-path A/B** (node, this box, real `loadFoundryIblTexture`):
  baked 50.2 ms / 48.0 ms vs decode+transform 114.4 ms (decode 80 + transforms 38).
  Net: ~65 ms saved here, est. 150–400 ms on the low-end hardware the tier system targets —
  inside the frozen-opening window where the foundry env previously landed.
- **Asset cost**: +32 MB served artifact (3.5 GB asset tree; the .hdr stays at 6.6 MB as
  authoring source + fallback). Payload on the wire is 32 MB vs 6.6 MB only when the baked
  fetch wins — the static file server has no Content-Encoding, so this is a raw-wire cost;
  noted as the honest trade for zero-decode.
- **Tests**: `test/foundry-environment.test.mjs` 13/13 pass; `bake-foundry-ibl.mjs --check`
  green (`sha256 4b0a6704…901a0f` matches artifact + manifest).

## Residual risk / notes

- If a future edit changes `normalizeHdrMeanRadiance`/`neutralizeHdrGreenCast` or swaps the
  .hdr, `check:foundry-ibl` (and the byte-equality test) fails until `bake:foundry-ibl` is
  re-run — the artifact can't go silently stale.
- `crypto.subtle` requires a secure-ish context (https/localhost/file); on exotic hosts that
  lack it the loader falls back to the decode path — slower but identical.
- The 32 MB payload bypasses all compression on the wire. If download weight ever matters more
  than the ~100 ms decode, gzip-on-serve support in `scripts/lib/gameServer.cjs` would cut it
  to ~11.5 MB — a server feature, not a bake change, and deliberately not bundled here.
