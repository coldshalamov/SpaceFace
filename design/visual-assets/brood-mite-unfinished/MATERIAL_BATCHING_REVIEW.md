# Mite: reducing nine batches without changing the approved material picture

## Finding

The current review asset uses three shared opaque Brood finishes and two shared images. Its static body is three batches. Each of the two independently rotating fins is three batches (pigmented shell, flexible tissue, exposed cartilage): **nine visible batches per selected LOD**. A standard glTF mesh with three material primitives is still three draws; joining object names alone does not fix this.

A shared composite fin material can reduce this to **five batches** (three static plus one per fin), while retaining the same two pivots. It is not implemented or admitted in this packet.

## Why an ordinary atlas alone is insufficient

- Carapace uses the Forge hull semantic, .60 base roughness and chitin normal/ORM pair; chitin uses ceramic, .72 roughness and the same pair; membrane uses ceramic, .78 roughness and no normal/ORM perturbation
- All are opaque with metallic exactly zero. The palette is #70314f / #a18d9a / #211b2b
- Vertex colors can preserve these base colors, and a shared ORM/normal atlas can encode surface roughness and flat membrane normals
- However, authoredMaterialProfiles.js assigns hull environment intensity1.15 and ceramic0.7. illustratedSurface.js derives its coat per pixel from roughness/metalness, rather than a separate role label. Merging into one ordinary material loses the role-specific environment factor even when an atlas preserves roughness and Blender's preview looks similar
- Therefore a stock material atlas cannot honestly be called appearance-preserving without a runtime Look comparison

## Smallest plausible shared implementation

1. Merge disconnected fin meshes per motion root while preserving normals, UVs and all material-zone boundary vertices
2. Encode the three original color values as COLOR_0, and a discrete Brood finish/normal-response mask in a supported custom attribute such as _BROOD_ROLE; never interpolate across a material boundary
3. Add one shared Forge Brood-composite shader path, reproducing the established finish roughness, normal strength and1.15/0.7 environment response per fragment, while retaining illustratedSurface's existing per-pixel coat formula. Reuse the existing normal/ORM pair; the membrane mask disables their perturbation
4. Keep conventional three-material GLBs as the visual reference and fallback. No new per-species texture set, alpha blend, emissive face, changed palette or changed motion
5. Compare identical actual-game bright/dark moods and action poses at close/default/distant scales, then measure shader variants, program warmup and 40-entity swarm frame cost. Count five actual draw batches, not five objects with hidden multi-primitives

This is a shared Forge/material-owner extension, not a Mite-only shader exception. It needs renderer ownership and real Look/GPU evidence, which remain unavailable in this task. The current immutable nine-batch review asset is preserved separately from this proposal.

Evidence inspected: src/render/authoredMaterialProfiles.js:116–147; src/render/illustratedSurface.js:50–101; src/render/partsLibrary.js materialShareSignature. The fin-composite route adds one shared shader/material variant and reuses the same two image resources; its draw reduction is not a measured GPU improvement.
