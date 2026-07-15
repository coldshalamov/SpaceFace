# World Identity Documentation

This folder connects narrative place identity to sector data, authored assets, fixed geography,
and navigation. It owns design mapping, not global completion status.

## Read order

1. [`PIPELINE.md`](PIPELINE.md) — story-to-release workflow and runtime wiring contract.
2. [`STORY_SECTOR_MAP.md`](STORY_SECTOR_MAP.md) — story names to live sector IDs.
3. [`SECTOR_STYLE_INDEX.md`](SECTOR_STYLE_INDEX.md) — per-sector visual specifications.
4. [`WORLD_NAVIGATION_SPEC.md`](WORLD_NAVIGATION_SPEC.md) — map, landmark, route, and discovery UX.
5. [`CURATED_SPACE_FEATURES.md`](CURATED_SPACE_FEATURES.md) — researched follow-up feature set;
   entries marked future are plans, not shipped claims.
6. [`place-identity-index.json`](place-identity-index.json) — machine-readable mapping.

`sectors/*.md` are per-sector render/style sheets. Narrative meaning remains under
[`docs/worldbuilding/`](../../docs/worldbuilding/README.md); these sheets own palette, placement,
landmark, and asset-role requirements rather than duplicating story prose.

## Status and evidence

This suite is a mixture of implemented foundations and future scope. A named asset, validator, or
data field in a design document is not proof that its player route is accepted. Use live code,
current `check:*` output, and player-facing evidence for implementation truth. The unified status
and pickup surface is [`design/program/README.md`](../program/README.md).

[`BLENDER_ITERATION_EVIDENCE.md`](BLENDER_ITERATION_EVIDENCE.md) is an evidence receipt, not an
authority document. Graphics sprint handoffs may activate work from this suite, but they do not
replace this index or the unified program status.
