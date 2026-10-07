# SF20-19 root-contract successor: bounded independent review

Verdict: PASS for the source-authoring correction, 2026-10-05. No material finding remains in this delta.

## Exact reviewed packet

`/workspace/scratch/d2415e46e35b/pip-spanner-art-v2-root-contract`

- Final packet manifest: `68b3b0a92b089895e6c361bfa9ca1fe517fd10c03d6e4563ebe1b40af5e3c3b6`
- Recipe: `e8aefd36276d1af21df114e6ec470fc966c768ebaa2df0b62182f7663055b660`
- Editable blend: `6bd642ac606f6c3b9010df6bcd4103182d4cd4b7079198ca97832f7ab6aabfcc`
- Default GLB: `32b9d623fd8f9166109b5b4690ccf7712d90d5d3dde25a14a61329daa0d7c2cd`
- Alternative source tier 1: `6a72437db665c5e5cff66e669186d7551b1b6a24169164c473a55214ce2e6d2b`
- Alternative source tier 2: `b8c3fb3fbd8f1b67f0a77055eb242934a9f4c740c87f4c3dc2b4ea60dfb05646`

All 17 final manifest entries match their byte counts and SHA256 values. All 11 original v1 manifest entries remain unchanged. The final README-only wording correction explicitly states zero newly authored texture files and six reused Forge sources; its reseal was rechecked, and all GLB, recipe and editable hashes above remained unchanged.

## Findings checked

1. Each GLB's actual, sole scene-root node is `SF20_19_PREVIEW_ROOT`. Its full `spacefaceAsset` contract equals both scene and asset contracts. The root is not a disconnected metadata surrogate.
2. Exact comparison allows only the expected contract additions: `exportedLods: ['lod0']` and `deliverableRole: 'production_single_lod_preview'` on asset/scene, plus the full contract on the root. All other JSON is identical. Complete BIN chunks, including padding, are byte-identical for all three files. Geometry, materials, names, hierarchy, pivots, textures and animation payloads therefore retain v1 identity.
3. Numeric `lod` remains 0, 1, or 2 for the separately exported source alternatives. Each file actually contains its single LOD0-named selectable tier; the new single-tier declaration is coherent with that existing content.
4. A read-only Blender open/reopen comparison independently matched 69 objects, 58 mesh datablocks, seven material graphs and two actions, including geometry/topology/UVs, parent and world/basis transforms, names, and action keyframes. Both editable root and scene contracts equal the default GLB contract. No recipe execution or blend save was performed by the reviewer.
5. The final recipe's stamp function was independently extracted and executed against each original GLB document. Its serialization reproduces each delivered v2 GLB byte-for-byte. Recipe source retains the existing authoring/export logic and stores the default-tier full contract on the editable root and scene.
6. The unchanged canonical `stampReleaseContractMetadata` accepts all three source documents with exactly one asset, scene and node contract. The original v1 fails the root-contract preflight. The current canonical builder file is pinned at `e9b9d068b916b4c1165710588a4b687d60f7b96df0e46ca21c0653d3da132ec3`; its existing foreign edits were preserved and its stamp helper was not changed for this correction.
7. The v2 addendum's selected parts-manifest replacement changes only `bytes` to 1,140,560. Its compressed-release helper differs from the previously reviewed helper only by the final source SHA pin; its CPU decode helper is identical. The parent reported current production compile/consumer checks across all three v2 sources; that is supporting parent evidence, not an additional independent renderer run here.

## Independent evidence

Relative to this report's directory:

- `check-root-contract-delta.py`, `root-contract-v2-delta.log`
- `check-root-contract-blend.py`, `root-contract-v2-blend.log`
- `root-contract-v2-preflight.log`, `root-contract-v1-red.log`
- `root-contract-v2-seal.log`

Canonical preflight command:

```sh
node /workspace/scratch/d2415e46e35b/pip-spanner-root-contract-addendum-v2/check-root-contract.mjs \
  /workspace/scratch/d2415e46e35b/spaceface-recovery-pr221-git/.worktrees/spaceface-integration \
  /workspace/scratch/d2415e46e35b/pip-spanner-art-v2-root-contract
```

## Scope limits

This review did not run the full selected-place release build, write a candidate/shared source file, or produce new pixel/GPU evidence. Root owns the serialized compressed-release build and the v2 compressed-release consumer check afterward. Prior behavior/UI and physical-program/decoder verdicts retain their separate scopes.
