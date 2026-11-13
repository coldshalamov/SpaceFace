# Helios Lark surface and collider source

The Lark-specific builder is `../../ships/helios_lark.py`. Its `export()` adapter merges a coarse parcel rack into LOD2's existing material groups, then restores the independent original collision payload. The script's main entry point calls this adapter; tools importing `build()` should also call this ship's `export()` rather than the generic exporter. No global Forge defaults or shared textures are changed.

`collision.glb` is the original `COLLISION_HULL` extracted from `assets/ships/parts/wholeships/helios_lark.glb` with source SHA-256 `b634002752f7cb16b8111fbafcdcd3b81b943a067a7eebd063bbe1617f786a9a`. It is independent of the subsequently published ship. Its physical positions, indices and world transform remain authoritative for this visual-only revision.

`wear-generated.png` was produced with the built-in imagegen tool, using the exact prompt in `wear.prompt.txt` and `wear-edit-reference.png` (the earlier Lark panel-layout refinement) as its edit input. Generation output: `exec-d9500a02-cf39-436c-9ff0-28cac907ab2b.png`, conversation generation folder `01a1d4ae-7a3f-7252-b048-981bcbeb3478`, 2026-11-13. The art deliberately removes repeating hatch/vent symbols and adds irregular neutral enamel wear; it is albedo only.

The runtime source map `../../textures/helios_lark_panel_albedo.png` derives from that art: resize to512, smoothly stitch its outer12pixels to the original Forge panel tile, blend50% generated wear with50% original neutral Forge albedo, then downsample to256. The lighter blend restores the pale ivory/teal identity; matched close/chase views retained the important wear at256. `albedo-reviewed-512.png` preserves the larger reviewed version for future closer views. Original Forge normal/ORM remain unchanged. Do not turn the generated albedo directly into a normal or ORM map.

Release encoding for this map is mipmapped ETC1S, quality255/compressionLevel2/sRGB; the chosen256 KTX2 is19,307bytes versus74,639 at512. This reuses the existing albedo texture slot for paint/paint2/stripe and adds no sampler or shader layer. Preserve original emission strength; canopy uses roughness0.12 and specularFactor0.999. The near-default factor deliberately retains an explicit physical-material extension in Blender export: omitting the extension routes through the loader's Standard-to-Physical fallback and changes physical defaults. Matched isolated preview returns14 draws with this declaration; this is not a composed-runtime performance measurement.

Twenty substantive scratch hypothesis/change/view loops, including rejected alternatives, are recorded in `.devshots/fleet/lark-surface-astra/ITERATIONS.md`; durable model journal entries preserve grouped earlier reviews. Representative material evidence is `render-wearblend/`, geometry saving `render-combined/`, authored far-rack comparison `render-rackproxy/`. These isolated views are not ordinary release acceptance. The first diagnostic New Game override found an out-of-view courier without a requested package, so player-route coverage remains open.

Rebuild to scratch with Blender background and `.devshots/fleet/lark-surface-astra/build-canonical.py`; that harness calls the canonical builder's `export()` with an explicit scratch output directory. Never use `--live` merely to obtain a review preview. The source/release and shared manifest/package integration is coordinated separately.

For an authorized canonical rebuild, run the Lark builder with `--live`, then the following selected official commands under the shared game lock. The builder also bakes the motion bank against the authored source GLB. `scripts/lib/releaseColorTextureProfiles.mjs` encodes only this asset's named albedo as ETC1S; all other images retain the standard release profile.

```text
node scripts/check-parts-manifest.mjs --sync --only=wholeship_helios_lark
node scripts/build-sg04-release-assets.mjs --no-clean --only wholeship_helios_lark
node scripts/refresh-render-package-pilots.mjs --only=helios-lark
node scripts/build-render-package-pilots.mjs --only=helios-lark
node scripts/model-truth-census.mjs --update-selected --only=traffic:courier
node scripts/check-release-manifest-pins.mjs --only=helios-lark
```

The initial temporary official-profile build was byte-identical to the reviewed 656,928-byte release candidate, including all six encoded textures. Shared manifest changes must remain limited to Lark's rows; preserve concurrent authoring work.
