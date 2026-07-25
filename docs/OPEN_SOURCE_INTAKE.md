<!-- LIFETIME: STABLE -->
# Open-source tool and asset intake

SpaceFace should use battle-tested open-source tools and compatible assets where they improve quality, throughput, or reliability. Intake is deliberate: a dependency or asset must reduce risk without creating a second pipeline, unclear rights, hidden runtime cost, or a visual identity mismatch.

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
