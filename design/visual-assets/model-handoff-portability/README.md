# Portable regeneration of unfinished Brood handoffs

All three models remain unfinished/rejected art. These tools preserve the earlier source identities and add a separate reproducible recipe. They do not approve art, register models, replace a runtime asset, publish a release, merge, or deploy. Historical builders, models, manifests and render evidence are not edited.

## One explicit entry point

From the repository root, using Python 3.10+ and Blender 4.3.2:

```sh
REPO="$PWD"
RECIPE="$REPO/design/visual-assets/model-handoff-portability"
python3 "$RECIPE/regenerate.py" --repository-root "$REPO" --model charger \
  --input-contract "$REPO/design/visual-assets/brood-charger-unfinished/contracts/proposed-charger-contract.json" \
  --output-root /tmp/brood-charger-new-run
python3 "$RECIPE/regenerate.py" --repository-root "$REPO" --model mite \
  --input-contract "$REPO/design/visual-assets/brood-mite-unfinished/contracts/proposed-mite-contract.json" \
  --output-root /tmp/brood-mite-new-run
python3 "$RECIPE/regenerate.py" --repository-root "$REPO" --model splitter \
  --input-contract "$REPO/tools/blender/forge/source_assets/splitter_a6/body-map.json" \
  --output-root /tmp/brood-splitter-new-run
```

Use a different, nonexistent output directory on every invocation. Output must be outside and disjoint from the repository and recipe directory. `--blender /path/to/blender` selects an executable. `--check-only` validates all pinned inputs without making an output directory. No network access or extra pip package is needed. Splitter also requires Node; Node 24.19.0 was tested.

The input contract is an explicit, hash-checked frozen input, not a promise that arbitrary contract/anatomy changes are supported. For new artwork, copy/version this recipe and deliberately update input contracts, geometry, evidence and provenance. Never modify the frozen references to make a check pass.

### What each recipe does

- **Charger C6:** regenerates three section-authored tiers from the new path-only builder copy, assembles the resident three-LOD GLB, bakes the actual 12 Blender actions and motion bank, and checks source topology. It does not need an old `.blend`, shared worktree, external texture, or render server
- **Mite M7:** starts from the frozen editable M6 source `.blend`, regenerates its feature-aware M7 LODs, assembles the resident GLB, and reseals the exact original motion bank. It does not rerun historical procedural M6 creation, anatomy-contract derivation, review rendering, or collision tests
- **Splitter V12:** copies the exact hash-checked source package into an isolated `output-root/staging` layout and invokes the unchanged sealed exporter there. The four generated GLBs are under `staging/assets/ships/parts/wholeships/` within the external output directory. That directory name is inherited from the historical exporter; no checked-out runtime paths are written. Inputs are copied, never mutable hardlinks

`recipe-receipt.json` records input hashes, the recipe manifest hash, step results and new output hashes. Its `generated-unverified` status is intentional: run the exact comparison below before drawing stronger conclusions. Blender `.blend` files and GLB containers may differ in hash while decoded content matches. Historical identity and new recipe identity remain separate.

## Exact comparison

```sh
python3 "$RECIPE/check_outputs.py" \
  --reference "$REPO/design/visual-assets/brood-charger-unfinished/candidate-c6/brood_charger_v01.glb" \
  --output /tmp/brood-charger-new-run/brood_charger_v01.glb \
  --reference-motion "$REPO/design/visual-assets/brood-charger-unfinished/candidate-c6/brood-charger.motion.json" \
  --output-motion /tmp/brood-charger-new-run/brood-charger.motion.json \
  --report /tmp/brood-charger-new-run/exact-comparison.json
```

For Mite use its `candidate-m7` reference paths and Mite output files. For Splitter compare each of the four `review/brood-splitter-a6-v12/source/*.glb` references against `staging/assets/ships/parts/wholeships/*.glb`; omit the two motion flags because Splitter is static rest. The comparator checks exact oriented triangles with every attribute, named hierarchy/transforms, materials, embedded images, counts and, where supplied, every motion key/binding plus its new GLB seal. It rejects external texture/buffer dependencies. It returns nonzero on any mismatch; no tolerance conceals differences.

## Verified here

A minimal clean PR-relative layout containing only the declared input files was used, with no historical worktree path fallback. Blender 4.3.2, Python 3.12.14 and Node 24.19.0; Linux CPU import/export, no renders:

- Charger C6: exact decoded POSITION/NORMAL/UV/TANGENT triangles, hierarchy/transforms, materials and image bytes match. Counts 3,712 / 2,308 / 1,428. Every clip/key/binding matches; new bank seals new GLB. All 45 source meshes across the three tiers are finite, closed/manifold, with zero degenerate faces. GLB container hash differs
- Mite M7: regenerated GLB matches byte-for-byte in this run, and its motion data matches exactly. Counts 3,456 / 1,482 / 978. This single-platform result is not a cross-version determinism guarantee
- Splitter V12: port and starboard children match byte-for-byte. Parent and axial child fail exact attribute comparison: one LOD1 axial membrane TANGENT component changes from 0.492900013923645 to 0.4927999973297119, a difference of 0.00010001659393310547. POSITION, NORMAL, TEXCOORD_0 and indices are exact; hierarchy/transforms, materials, image bytes, counts and canonical source certificates also match. No root cause or cross-platform guarantee is claimed; original exports remain normative. Do not replace them with these comparison-failing re-exports
- All 12 current editable `.blend` files were opened read-only. Each has the same two packed 256×256 Brood normal/ORM images and no external Blender libraries. Packed bytes and model hashes are in `evidence/packed-image-audit.json`
- 13 focused tests cover preservation checks, triangle/winding/material/image/motion regressions, changed dependency rejection, output overwrite refusal and path-escape prevention

Not run: Blender versions other than 4.3.2; Windows/macOS; other Node versions; GPU rendering/performance; actual game camera/material Look; default-route/native collision admission; fresh 138/87-pose spatial sweeps; full-game/CI aggregates; M6 procedural source recreation; Splitter high-detail procedural reconstruction. Prior collision/LOD reports are historical evidence, not relabeled new runs.

## Splitter image-path discrepancy

The original `V12_FINAL_REVIEW_MANIFEST.json` has ten `verifiedPoseFrames` keys containing only basenames. Their expected hashes all match **`review-v12/rigid-verified/<basename>`**, not `review-v12/<basename>`. The latter are older explicitly rejected Euler-only pose diagnostics. The six active review sheets also match their original hashes exactly. There is no evidence of overwritten verified frames or a source-geometry mismatch.

`evidence/splitter-image-path-audit.json` retains every expected hash, verified path/hash and rejected sibling hash. Publish verified frames at their actual `rigid-verified/` paths and preserve the original manifest; annotate the path omission rather than restamping it. Historical text describing bounded visual acceptance does not override the user's later rejection of model quality.

## Dependency and ownership details

`DEPENDENCIES.json` names each exact PR-relative input, byte count and SHA-256. `RECIPE_PROVENANCE.json` links path-only adapted scripts to the immutable historical originals. `dependencies/forge/` contains exact shared Forge copies used for Charger/Mite reproduction, not patches to shared toolkit owners. The Brood material path uses deterministic procedural, packed maps; it does not invoke Forge's optional manufactured-texture generator. The missing historical `contracts/frozen-mite-motion.json` input is preserved byte-for-byte as `inputs/frozen-mite-motion.json`.

Splitter's exact toolkit/authoring inputs are read from published repository paths and staged only after hash verification. If an upstream shared toolkit changes, the recipe fails closed; obtain the pinned dependency or deliberately create a new recipe. Do not silently substitute a newer module and retain the old provenance.

Run focused tool tests with `python3 -m unittest discover -s "$RECIPE/tests" -v`. No `publish.mjs`, release registration, default model selection, network operation or remote write is part of this entry point.
