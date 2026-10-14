# Reconcile composition dependencies before publishing

The frozen `large-place12-recipes12-v1` model packet remains immutable. Its 12 composition recipes bind the exact LOD hashes read during that review. Those peer dependencies are not assumed to match newer operations, cargo, natural or structure exports.

The 12 large models can be published independently. Hold `design/asset-bank/assemblies.json` until the final published-file projection includes every reviewed dependency.

From the repository root, regenerate with:

```
blender -b -t 3 --python tools/blender/forge/asset_bank_large.py -- --assemblies --bank-root /absolute/path/to/final/assets/models/asset-bank
node scripts/check-asset-bank-assemblies.mjs design/asset-bank/assemblies.json /absolute/path/to/final/assets/models/asset-bank
```

`--bank-root` is an explicit directory containing family subdirectories and model manifests. It must exist and takes precedence over `ASSET_BANK_ROOT`. With neither set, the existing repository `assets/models/asset-bank` directory is used. Generation recomputes socket transforms, bounds, clearance receipts and dependency LOD locks from the selected files; it does not preserve old hashes by assumption. Missing dependencies stop generation.

Review the same projection rather than a different mutable bank:

```
blender -b -t 3 --python tools/blender/forge/asset_bank_large.py -- --assembly-contacts --bank-root /absolute/path/to/final/assets/models/asset-bank
blender -b -t 3 --python tools/blender/forge/asset_bank_large.py -- --assembly-contacts --recipe relief_berth --bank-root /absolute/path/to/final/assets/models/asset-bank
```

Review outputs are `.devshots/asset-bank/large_assemblies_60.png` and `.devshots/asset-bank/assembly_relief_berth_export.png`. Use other recipe IDs to inspect other joined arrangements. Then freeze a successor recipe packet with the exact selected dependency hashes. Passing joins and approximate-proxy clearance does not certify pressure-interface compatibility, live physics, or normal-route visual acceptance.
