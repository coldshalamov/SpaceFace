# Breakaway Fork service support

The support joins the service pylon at x=77 to the cross-tie at x=68. The Forge recipe
`tools/blender/forge/ships/place_breakaway_fork.py` records its dimensions and material.

`baseline.glb` is the pinned, previously accepted source, SHA-256
`45a72f3d578576159aa7b9e2c7cde8adce155e5a58b0d80eaa6ab9df979a14c3`. The asset-specific
finalizer appends the support to its existing armor primitive at all three LODs, leaving
existing mesh attributes and indices intact and avoiding an extra draw. It is the reproducible
route for the current source GLB; it refuses changed baseline bytes, output outside `.devshots`,
and existing outputs. Run from the repository root with a new scratch path:

```
node tools/blender/forge/source_assets/breakaway-fork/finalize.mjs .devshots/breakaway-fork-source.glb
```

The output SHA-256 is `4a68d5a83bbc754ffc3d1af70df7a6236b69867b79ab0332e4b36d5d4799ff64`.
Use the selected place release builder and scoped render-package builder on the reviewed output;
update only this asset's manifest bindings. A future full Forge re-export uses the same support
in the recipe but is a separate export and requires its own review, because it can drift unrelated
geometry. Never replace the pinned baseline with a new export without reviewing that drift.
