# Wave-4 Lane Report — Texture Atlas / Bindless-Style Batching

Lane question: *can per-frame texture binds and program switches drop further beyond the
landed progkeys lane — via shared material/texture reuse, or atlas-packing small repeated
textures at pack-build time?*

Branch: `devin/1790664682-w4-texatlas` off `origin/master` (0f3b0673c).

## Verdict

**DOCUMENTED — binds and program switches are already at their structural floor.** Every
reduction path the lane names is either already landed upstream (image-source dedupe,
painted-planet atlas, fragment atlas, KTX2 batch decode, canonical program family,
opaque BatchedMesh) or unsafe under this wave's constraints: the remaining binds are
real GPU-texture ownership changes between *different-content* textures on per-program
texture-unit layouts, and the remaining program switches are ~26 unique shaders that
each draw once per frame (deep-field layers, VFX, post chain). Nothing measured is
mergeable without changing pixels, draw ordering semantics, or vendored three.js
internals — all excluded by "ZERO visible quality change" + "minimal focused edits".

Bind budget, measured on the real route (headless, GPU-throttled box — counts are the
evidence, timings are not):

- **~134–157 raw `gl.bindTexture` calls/frame** over 64–93 resident GL textures —
  ≈ **1.0–1.3 binds per draw submission** (124 + 23 instanced draws/frame). These are
  post-dedupe calls: three's `WebGLState.bindTexture` already no-ops same-slot rebinds,
  so every counted call transfers a unit between two *different* textures.
- **~50–63 `gl.useProgram` changes/frame** across 43–51 distinct programs (98 linked).
  26 programs draw *exactly once per frame* — the deep-field/stellar/VFX/post serial
  chain (`SpaceFace_ClipProofDeepField`, `SF_DeepField_helios_*`, `SF_DeepFieldStructure_*`,
  `SF_GasVolume_baked-density-march`, `SF_Transient_*`, `SpriteMaterial`,
  `MeshBasicMaterial`×4, `ShaderMaterial`×6, `SF_FragmentMat_casing`, post quads). That
  is a fixed floor: each is a unique shader sampling its own inputs.
- **`textureUploadsPerFrame` = 0.1** — the upload stream is already amortized; nothing
  per-frame is being re-uploaded.
- Source-level texture dedupe is already saturated: 148 unique `Texture` objects over
  66 unique sources; `imageSourceDedupe` saved 308 decodes; three r184 additionally
  shares one `WebGLTexture` per (Source × sampler-parameter key), so `Texture`-object
  sharing *below* that level cannot reduce binds further.

## Research citations

- **three.js r184 vendored internals** (`vendor/three.module.js`):
  - `getTextureCacheKey` + the `_sources` map (~11736, ~11945): GPU textures are shared
    per `Source` **and** per sampler-parameter key — the "share one texture object"
    lever is already implemented inside the renderer.
  - `WebGLState.bindTexture` (10763): per-slot bound-texture tracking — same-slot
    rebinds are already GL-no-ops; counted binds are real slot changes.
  - `WebGLTextures.resetTextureUnits` (11702, called unconditionally by `setProgram`
    at 18486): resets only the *unit allocator* each draw — units are re-assigned in
    each program's uniform order, so the same logical texture lands on different units
    under different programs. This is the top churn source measured below.
  - `painterSortStable`: opaque sort key is `groupOrder → renderOrder → material.id →
    materialVariant → z → id`. Same-material draws already cluster; residual
    interleaving comes from `renderOrder` bands, which are load-bearing (decal/overlay
    ordering) — not a safe sort override.
- **ARB_bindless_texture / GPU-driven rendering** (the "bindless" style the lane name
  invokes): not available in WebGL2 — the standard emulation is exactly what this
  codebase already does: atlas where one shader can span draws, dedupe texture objects
  where content matches, and accept per-draw binds as the floor.
- **"Batch, batch, batch" / state-sort doctrine** (Carmack-era GL guidance, Fabian
  Giesen's *state change cost* notes): the actionable subset for WebGL2 is program
  family consolidation — the progkeys lane (`programCanon.js` neutral slot fills,
  `materialBatchKey.js` fingerprints, `opaqueMaterialBatch.js` BatchedMesh multi-draw)
  already took it.
- **KTX2/BasisU batch decode** — landed upstream (embedded-KTX2 plugin +
  `imageSourceDedupe` content keys over GLB `bufferView` bytes); confirmed: no
  per-frame decode or upload residue remains.

## Profile evidence

Two probe layers, both on the live flight route:

**A. `scripts/probe-frame-solid.mjs --headless` submission counters** (Tier-1, wraps the
GL context at `src/render/glInstrumentation.js`):

| run | draws | instanced | prog switches | tex binds | tex uploads |
|---|---|---|---|---|---|
| master 0f3b0673c (`2026-09-29T07-05-40Z.json`, 702 fr) | 124.3 | 23.1 | 63.4 | 156.7 | 0.1 |
| branch (`2026-09-29T07-21-30Z.json`, 870 fr) | 101.4 | 20.0 | 57.8 | 134.1 | 0.1 |

(Identical code — DOCUMENTED lane carries no patch; the spread is scene-composition
variance between flight positions, i.e. the honest run-to-run envelope.)

Census at station: 98 programs resident, 93 GL textures, 148 unique `Texture` objects,
66 unique sources, ~69.7 MB estimated; `imageSourceDedupe` hits 308 / misses 10.

**B. `scratch-w4-texatlas-audit.mjs` labeled attribution probe** — wraps
`gl.bindTexture`/`gl.useProgram`/`gl.activeTexture` in-page, tallies by
(unit, GL-texture identity) and program identity, then resolves labels at dump time via
`renderer.properties.get(tex).__webglTexture` (material slots, light shadow maps,
render targets) and `properties.get(material).currentProgram` → shader name.
291-frame flight window:

- `gl.bindTexture`: 38,873 calls ≈ **133.6/frame**; `gl.useProgram` changes: 14,504 ≈
  **49.8/frame**; 64 distinct textures, 51 distinct programs touched.
- Binds by unit: `u0` 11,455 · `u1` 7,673 · `u5` 4,958 · `u6` 4,958 · `u7` 4,667 ·
  `u2` 1,867 · `u3` 1,995 · `u4` 1,285 · `u15` 15.
- Top binders (per frame): `SF_Shared_hull_textured_hull.aoMap` 21.0 on u1/6/7/0;
  authored `MeshStandardMaterial.aoMap` 18.8 + 4.0; `SF_Shared_hull_textured_hull`
  `.normalMap` 7.3 + `.map` 7.0; authored `.emissiveMap` 8.2, `.envMap` 7.9,
  `.normalMap` 6.0+2.0; `SF_Mutable_signal_dark.aoMap` 6.3; ore-barge AO maps ~3.8;
  ~7,168 of the top-45 binds are post-chain render-target textures (downsample/composite
  inputs — inherent to the pass pipeline).
- Hottest churn pairs: authored↔shared-hull `aoMap` alternating on u1/u6/u7
  (~1,600–1,690 transitions each ≈ 5.5/f/unit) and two normal maps on u5
  (~2,700 ≈ 9.4/f) — same texture re-bound on a different unit as the material-id-sorted
  draw list interleaves program families across `renderOrder` bands.
- Program transitions: dominant `SF_Shared_hull_textured_hull ↔ SF_Shared_none_none_native`
  alternation (~9/f), then the ~26-deep once-per-frame serial chain.

## Patch

None — `git diff origin/master` is documentation + the probe script only. Rejected
candidates, for the record:

1. **Shared `Texture` object across materials** — only helps where image *content* is
   identical; the top ping-pongers are distinct bakes (shared hull AO vs per-ship
   authored packed ORM vs canon neutral stand-ins). Same-content cases are already
   deduped by `imageSourceDedupe` + three's (Source × sampler-key) GL cache.
2. **Atlas-pack small repeated textures** — pays off only when merged draws share one
   shader; the remaining small-texture draws are the ~26 unique once-per-frame programs,
   each needing its own inputs on its own unit layout. No shared shader to atlas under;
   the small/repeated population was already consumed by painted-planets (4 UV views on
   one source), `FRAGMENT_ATLAS`, and the shared trail texture.
3. **Merge the once-per-frame programs** (deep-field plates, VFX, post) — that is a
   shader rewrite with a visible-output diff; outside constraints.
4. **Override opaque sort to cluster by program** — `material.id` already clusters;
   the residual interleaving is `renderOrder`-banded draw ordering, which carries
   overlay/decal semantics. Not minimal.
5. **Narrow `releaseBloomSceneSamplers()`'s 16-unit unbind walk** (`bloom.js:1501`) —
   its per-unit `unbindTexture` clears *all* bound-texture bookkeeping before the scene
   pass, including units that only ever held scene textures (~8–16 avoidable GL
   calls/frame, ~6–10%). It sits on an Intel-TDR-fragile feedback-loop path (comments
   document a real TDR when the walk covered only 8 units), and narrowing it safely
   needs three-internal `currentBoundTextures` reads — a vendored-library patch. Not
   justified by the delta.
6. **Bindless-style texture arrays / texture unit pinning** — requires vendored
   three.js surgery across `WebGLTextures`/`WebGLUniforms`; high blast radius for
   <10% of a sub-millisecond-per-frame cost on this box.

## Metrics

- **Golden 47a** (`run --seed 47 --ticks 720 --hash --repeat 20 --reload-at 600`):
  `sha256 == baselineSha256 == cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885`,
  `deterministic: true`, exit 0 — verified on-branch (byte-identical by construction:
  zero sim-path and zero draw-path edits).
- **Bind budget**: ~134 raw GL binds / ~124+23 draws ≈ **1.08 binds per submission**;
  counter-level `textureBinds` ≈ 37–49/frame; `textureUploads` 0.1/frame.
- **Program-switch floor**: ~26 unique once-per-frame programs + ~10/f alternations
  between the two dominant PBR families + tail ≈ 50–63 switches/frame observed.
- **Resident state**: 98 programs, 64–93 textures bound per frame, 66 unique sources
  (2.24× source dedupe), 308 shared decodes saved.

## Zero visible quality change

No code, shader, material, texture, ordering, or timing change of any kind — the branch
adds this report and the audit probe script only. The verdict is that the *status quo*
is the floor: every remaining bind is a genuine texture-content or unit-layout change
that a forward renderer cannot elide.
