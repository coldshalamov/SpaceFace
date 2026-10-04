# Brood Mite: reviewed form and isolated M7 candidate

## Result

The Mite is rebuilt around a compact posterior shell, a narrow thoracic collar, a supported recessed mouth, rooted tapering chelicerae, short ventral limbs and cartilage-supported locomotor fins. The old three-capsule/paddle/badge anatomy is not retained.

The parent opened the M4 anatomy/action sheet and immutable M6 cold-import comparison, accepted the static direction, and requested M7's small contour correction. **This packet is an isolated review candidate. It is not runtime, GPU, budget or release acceptance.** No shared source, manifest, publication, merge or deployment was changed.

## Decisive artifacts

- `candidate-m7/review/mite-m7-matched-lod-review.png`: equal-framing top,60° chase, mouth and170px comparison of source and all tiers
- `study-m6/mite-M6-source.blend`: editable full-form source, Blender +X forward,+Y port,+Z dorsal
- `candidate-m7/mite-M7-LOD0-editable.blend`, `LOD1`, `LOD2`: separate editable optimized tiers
- `candidate-m7/brood_mite_v01.glb`: combined three-tier candidate, explicitly tagged review-only
- `candidate-m7/brood-mite.motion.json`: original four named phase poses and two fin bindings, sealed to candidate GLB bytes
- `contracts/proposed-mite-contract.json`: exact canonical24-piece `kind:'convex',vertices:[[x,z],...]` proposal;3–12 vertices each
- `contracts/convex-overlay-poses.png`: source-form proxy overlay in approach, windup, commit and recovery; amber rectangle is the preserved clear jaw volume
- `patches/brood-mite-contract.proposed.patch`: exact body-data replacement, gated on shared convex support and review
- `patches/brood-mite-authoring.proposed.patch`: isolated authoring recipes/fixtures; it does not replace the live ship entrypoint or publish a body
- `patches/asset-replacements.json`: exact proposed target paths and candidate hashes, no manifest edits
- `MATERIAL_BATCHING_REVIEW.md`: separate five-batch composite-material investigation
- `LOD_ADMISSION.md`: actual selector thresholds, hysteresis and remaining on-screen acceptance requirement

## Preserved gameplay and explicit differences

Mass22, radius7.1, COM[-.7,0,0], sourceScale1, original bounds (which older owners use for inertia), production cap40, attack range55, speed105, damage12 and30/48/48 timing are unchanged. Both named contact sockets remain[6,0,-1.6] and[6,0,1.6] in GLB WU. Their source tip geometry is within0.00267WU of those positions.

The named fin pivots stay `MOTION_MITE_MEMBRANE_PORT/STARBOARD`, now seated at real hip collars at[-1.53,-.10,+/-1.74]. Existing .3-radian mirrored folds and0/1/.1/.6 phase amplitudes are retained. No contact-fang animation or moving native subcollider is introduced. Dorsal tether and signal sockets are explicitly reseated onto the new shell; these two proposed positions are listed in the contract diff. No emissive eyes or extra finish was added.

Real damage remains owned by native contact. Any actual collision spends the pass; damage requires the actual contacted entity to equal the locked player ID and life. An unrelated debris impact cannot damage the locked player remotely. The focused test covers both the interruption and real-target success cases.

## Materials and LODs

Shared Brood Forge palette:#70314f carapace,#a18d9a exposed chitin,#211b2b flexible membrane. Existing roughness, metal-zero opaque behavior and the one shared normal/ORM pair are retained. No new body-specific maps, albedo noise, machine panels or alpha blend.

Visible counts per tier: **3456 /1482 /978 triangles;9 batches;3 materials;2 shared images**. Nine batches and the proposed1000-triangle LOD2 ceiling are explicit review requests, not admitted budgets. LOD0/1 remain within3500/1600. Close views must use the higher tier; LOD2's faceted shell and simplified mouth are for distant screen size only.

The initial unconstrained collapse folded thin shell walls and exposed underlying tissue. It was rejected on actual pixels. The final recipe preserves outer roof stations and the dorsal groove explicitly, simplifies hidden inner ceiling geometry, seats tissue below the actual roof, and protects the mouth, true contact tips and neck-contour landmarks. The M6 freeze remains immutable as the previous review; M7 adds the small protected neck contour correction.

## Geometry and meaningful verification

- Full editable source: all20 meshes finite, closed/manifold, with no zero-area faces (`candidate-m6/source-geometry-check.json`)
- Six focused Node tests pass: unchanged physical/contact tuning, bounded strict convex proposal, GLB-bound motion names/pivots, materials/tiers/batches, and real native target-contact versus unrelated obstacle behavior
- The old seven capsules miss visible geometry by up to0.6652WU and protrude up to1.1127WU outside its actual silhouette. The old layout fails the .12WU target. This does not claim a mathematical impossibility for every imaginable larger capsule compound
- The24 source-derived convex parts preserve the jaw void, fit inside the unchanged32-part cap and use at most12 vertices each
- The coarse .008WU raster checks are retained honestly: their uncertainty cannot certify the far tier by itself
- The final reverse check measures exact Euclidean distance to the union of cold-imported projected triangles, along17467 exposed native edge samples at maximum .005WU spacing. It enumerates **all87 distinct fixed-tick fold fractions** of the unchanged action profile, including reduced-motion endpoints
- Conservative reverse boundary bounds including the stated sampling/culling allowances are **.097628 /.097628 /.115603WU** for LOD0/1/2, all below .12WU. Forward containment's87-pose raster sweep also remains below .12WU after its conservative allowance. These are CPU geometric checks, not GPU or native-runtime admission
- Zero measured source-form proxy intrusion into the preserved jaw-clear volume

The shared convex owner must make this same canonical shape authoritative for native contact, projectile sweep, LOS, tether/overlap/ray queries and geometry metrics together. This task does not introduce a private render-only collision interpretation. Actual default-route, collision integration, renderer Look, density40 performance and target GPU proof remain unverified; the denied cloud loopback route was not bypassed.

## Rebuild

Use the established read-only Forge root via `SPACEFACE_FORGE_ROOT`, or the checked-out parent Forge location when these recipes live under it. Current isolated defaults resolve `/workspace/shared/SpaceFace-integration-d0ae/tools/blender/forge`.

1. `blender -b --python source/build_mite.py`
2. `blender -b --python source/export_lods.py`
3. `blender -b --python source/extract_anatomy.py`
4. `python source/derive_proxies.py`; `python source/build_contract.py`
5. `blender -b --python source/assemble_candidate.py`
6. `python source/check_lod_coverage.py`; `python source/check_precise_boundary.py`
7. `blender -b --python source/render_comparison.py`
8. `python source/assemble_review_sheet.py m7`; run `node --test tests/contract-and-contact.test.mjs`

Do not run these over the immutable delivered candidate when experimenting. Use a new output directory/version and preserve identical-frame comparisons. Publication/release registration is deliberately outside this packet.
