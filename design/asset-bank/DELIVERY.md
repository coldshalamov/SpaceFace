# Exported candidate delivery

2026-10-14: three distinct higher-detail structure candidates are now included as actual GLB files, each with LOD0/1/2 and adjacent source/hash/interface metadata:

- truss_short
- flange_coupler
- pressure_pipe_valve

These are preserved review candidates, not accepted runtime assets. All twelve file objects were uploaded successfully and are referenced by this commit. Existing recipes, reviewer changes and validation tooling are preserved.

## Known integration issue

The newer strict scene-bound validator correctly finds that coarser LOD geometry can extend slightly beyond the old LOD0-only declared envelope. This affects all three delivered candidates. A repair is in progress to derive the envelope from actual transformed geometry across all LODs and restamp both embedded and sidecar metadata. Do not loosen validation or treat these files as placement/culling-ready before that repair.

The 156-model and 12-composition coverage remains a commission, not a shipped count. Other locally generated batches and partial uploaded blobs are not represented here as delivered. CPU exported-model reviews do not establish live game-camera, physics, or GPU acceptance.
