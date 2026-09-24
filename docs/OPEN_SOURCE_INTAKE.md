<!-- LIFETIME: STABLE -->
# Open-source tool and asset intake

SpaceFace should use battle-tested open-source tools, libraries, and compatible assets where they improve quality, throughput, or reliability. Intake stays deliberate: a dependency or asset must raise the ceiling without a second pipeline, unclear rights, a hidden runtime cost, or a visual identity that fights the game.

The page loads ESM through the import map in `index.html`. Three.js r184 is vendored. `three.quarks` and Rapier are already on that map. A new runtime library has to fit that path. A tool that only runs in the build may be a normal dependency.

## 0. What to get (owner, 2026-09-22)

This is the list. A campaign that needs one of these uses that one. It does not open a search for a better idea.

### Already in the repo — use these, do not add a twin

| Have | Use it for | Leave it alone when |
|---|---|---|
| `meshoptimizer` + `@gltf-transform` `simplify` / `weld` | A far hull that is the same ship with fasteners gone. Small error, borders locked. The existing whole-ship LOD path is where the file goes | The result reads as a different, cheaper ship. `meshopt_simplifySloppy` merges features and is the wrong tool. `clusterlod.h` is a Nanite-style hierarchy for huge unique meshes; this game is a table of complete hulls, not a landscape of billions of triangles |
| KTX2 / Basis, already in `KTX2Loader` | Texture residency. Keep release maps on it | A second texture codec |
| `three.quarks` | The particle runtime. New force shapes go through it | A second particle library |
| Rapier `@dimforge/rapier3d-compat` | The physics. Stay on it | Jolt, Havok, PhysX, or a second world |
| Vendored Three r184, including `BatchedMesh` | Same-material hulls that should share a draw, once the probe says draws are the cost | Replacing the renderer, or a React/three stack |
| `src/render/bloom.js` | The picture's glow. It is a purpose-built pyramid with one color-managed composite | `UnrealBloomPass` or `pmndrs/postprocessing`. The name "Unreal" on Three's example pass is a bloom recipe, and this game already has its own |

### In the tree (retrieved 2026-09-22)

Wiring is `build_map.md` §23.4. Small auditions and grade checks are the TOOL lines in
`design/program/INFERENCE_IDEAS.md`.

1. **AMD FidelityFX Contrast Adaptive Sharpening (CAS).** MIT. Vendored at `vendor/fidelityfx-cas/` (`ffx_a.h`, `ffx_cas.h`, `LICENSE`, `README.md`). One fullscreen pass on the 3D canvas, after the bloom composite, before the DOM HUD. Use it when the frame was rendered under the display resolution. Sharpen-only is the default. Upscale-and-sharpen only if the render target is actually smaller than the canvas. Do not rewrite `CasFilter`.

2. **Elementary Audio** for the sounds that have to follow a live number. MIT. Installed as `@elemaudio/web-renderer` and mapped in `index.html`. The rope's pitch follows tether load. The engine's body follows throttle. Drive the graph from the sim values the game already publishes. Duck it under weapons. Do not move hits, UI, or dock into Elementary.

3. **A few signature recordings from the Sonniss GDC Game Audio bundle**, not the bundle. Royalty-free for a game, including commercial use, no attribution required. Current giveaway: [gdc.sonniss.com](https://gdc.sonniss.com/). The license keeps the vendor's copyright and forbids shipping the files as a sound library. Download it locally, choose the handful that become the slam, the capital death, and the station room, commit those files inside the game's audio tree with a line in `NOTICE`, and do not commit the multi-gigabyte archive.

4. **Kenney, CC0, only where a cue is missing.** On disk at `assets/reference/cc0/kenney/` (`sci-fi`, `impact`, `interface`), with each pack's `License.txt`. They are short and plain. Audition one file for a hole. If it sounds like a toy next to the first-hour signatures, it does not ship. Do not replace the authored set with the pack.

5. **CC0 surfaces and one lighting environment, as source, then art-directed.** On disk at `assets/reference/cc0/`. Not loaded by the game until a task grades them.
   - Light: `polyhaven/industrial_workshop_foundry/industrial_workshop_foundry_2k.hdr`. Image-based light. The visible sky stays the painted sector plate.
   - Painted metal: `polyhaven/rusty_painted_metal/` (1K color, OpenGL normal, roughness, AO).
   - Rubber: `ambientcg/Rubber004/`.
   - Hard tile: `ambientcg/Tiles132C/`.
   A raw photo of rust on a ship is the failure.

6. **`three-mesh-bvh` 0.9.15 (MIT).** Installed and mapped in `index.html`. Use it when a lock, a beam, or a camera clearance walks triangles. It does not decide residency, and it does not stop a mesh popping into existence. If nothing walks triangles, do not build a BVH for the sector.

### Do not take

- **Unreal Engine source, shaders, or Niagara/Nanite/Lumen modules.** Epic's own terms: paste even a little engine code into this game and the whole game sits under the Unreal EULA, including the royalty past the revenue line. Reading the code to learn an idea is allowed. Copying it is not. Marketplace, Fab, and Megascans assets are not licensed for this repository.
- **Quaternius, Kenney 3D, or any "free spaceship" pack as a hull.** The vision forbids toy plastic. They may sit in a reference folder. They do not become a ship.
- **A second renderer, a WebGPU rewrite as a dependency grab, Tone.js, or GSAP on sim-tied motion.** Those bring a second clock. Sim motion already has `state.simTime`.
- **SMAA, SSAO, or a path tracer as a quality pass.** Three can supply them. This picture is illustrated machinery under a painted sky. Ambient occlusion and a photoreal tracer fight that. CAS on a cheap frame is the sharpen pass that belongs.

## 1. Prefer the established toolchain

Inspect `package.json`, the current asset builders, and the release manifests before adding a tool.
Extend the established glTF Transform, meshoptimizer, KTX2/Basis, Playwright, Three.js, Rapier, and
Blender/export/validation paths when they already own the required transformation.

Recommended roles:

- **[glTF Transform](https://gltf-transform.dev/):** inspect, deduplicate, prune, transform textures/geometry, and run reproducible release passes.
- **[meshoptimizer / meshopt compression](https://meshoptimizer.org/):** vertex/index optimization, quantization, mesh compression, and measured LOD simplification where silhouette and sockets remain valid.
- **[KTX2/Basis](https://github.com/BinomialLLC/basis_universal):** reduce texture download and GPU residency with role-correct color space and normal-map handling.
- **Playwright + existing Browser/Electron launch helpers:** one public route, isolated profiles, screenshots/video/traces, and accessibility inspection.
- **Blender:** source-of-truth modeling, UVs, baking, LODs, collision/interaction proxies, sockets, and reproducible exports.

An optional offline `gltfpack` experiment can be useful for draw-call, size, and mesh optimization, but it is not an automatic dependency. Its output must preserve root identity, pivots, axes, sockets, semantic material roles, collision/interaction envelopes, LOD ordering, and normal-camera quality. Compare it against the existing release pipeline before adoption.

## 2. Asset sources worth evaluating

Use exact per-asset license/provenance records. Default candidates:

- **[Poly Haven](https://polyhaven.com/license):** CC0 HDRIs, textures, and models; strong source for lighting/reference materials and selected environmental assets.
- **[ambientCG](https://ambientcg.com/):** CC0 materials, HDRIs, and models; useful for physically based source maps and environment support.
- **[Quaternius](https://quaternius.com/faq.html):** CC0 low-poly/modular packs; useful for prototypes, collision/layout donors, or heavily remastered crowd assets. Its default style is not automatically the SpaceFace shipping look.
- **[NASA 3D Resources](https://www.nasa.gov/3d-resources/):** valuable scientific/reference material. Review the specific asset, [usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/), trademarks/insignia, credits, and any third-party rights before repository admission; treat as reference-only by default.

Do not import a pack because it is free. Ask whether its construction, scale, topology, UVs, materials, LOD potential, and visual language serve the actual game camera.

## 3. Default license posture

- Assets: prefer CC0. CC-BY requires retained attribution and lead approval. Do not admit NC, ND, unclear, scraped, or provenance-free material. Share-alike assets require explicit compatibility review.
- Build tools/libraries: MIT/BSD/Apache-style licenses are normally straightforward; copyleft or unusual terms require explicit review of distribution implications.
- Generated content: retain tool/model/version, prompts or source operations, inputs/references, seed when available, selected artifact hash, reject rationale, and applicable terms.
- Never remove attribution, copyright, or license files required by the source.

This is repository policy, not legal advice; ambiguous rights fail closed.

## 4. Intake packet

Every admitted third-party or generated asset records:

```yaml
assetId: <stable project id>
sourceUrl: <recorded in manifest/evidence, not loaded at runtime>
sourceAuthor: <name or project>
sourceLicense: <SPDX or exact terms>
retrievedAt: <date>
sourceSha256: <hash>
modifications: <summary and reproducible steps>
projectSourcePath: <source/blend/reference path>
releasePath: <runtime path>
runtimeRole: <exact identity>
provenanceReviewedBy: <owner>
```

Also retain dimensions, coordinate/orientation assumptions, material/color-space roles, sockets, collision/interaction proxy, LOD/HLOD strategy, compression, and measured release residency.

## 5. Promotion pipeline

1. **Evaluate off-route:** license/provenance, topology, scale, style, and technical fitness.
2. **Normalize in source:** transforms, units, pivots, UVs, materials, semantic names, sockets, proxies, and LODs.
3. **Build release artifact:** compression/quantization/KTX2 as appropriate; validate glTF.
4. **Register exact identity:** source/release manifests and runtime map agree.
5. **Resolve → prepare → admit:** no misleading placeholder or silent fallback.
6. **Review in game:** close, normal, far, motion, lighting, accessibility, and failure state.
7. **Measure:** load/admission, draw calls, programs, triangles, textures/residency, frame p95/p99/hitches, and cleanup.
8. **Record decision:** accepted, prototype-only, donor-only, rejected, or deferred.

A donor can be valuable without becoming runtime content. Preserve the useful technique or source reference and reject a mismatched final asset honestly.
