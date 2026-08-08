<!-- LIFETIME: DURABLE -->
# Independent preservation review — 2026-08-08

## Verdict

**KEEP AS SOURCE-ONLY `design_candidate` DONORS.** This verdict approves one support-only
Git preservation commit. It does not approve wholesale promotion, replacement of an
accepted ship, a runtime/manifest binding, or any G0-G7 gate.

The useful thing here is the occupational design vocabulary: ore basket, pressure-vessel
cradle, sweeper mouth, tug push-cradle, survey spine, repair rack, rescue bay, customs
collar, and construction truss. Those concepts can seed distinct NPC or player-ship
families after family-by-family re-authoring. They should not overwrite accepted assets.

## Exact packet reviewed

- Pre-correction pack tree reviewed: **82 files, 68,378,280 bytes**; its path +
  byte-count + SHA-256 ledger digest was
  `eaa20e7e15d0a294075e7dec29151185240ca5d1fa002ea51d26b54442fc9249`.
- Immutable visual/source payload retained after the review corrections: **77 binary
  files, 68,330,086 bytes** (15 GLBs + 62 PNGs), with path + byte-count + SHA-256 ledger
  digest `cb7af41f36efe621b76712a27532c8b37d015558103def9e2545171ad5950ed9`.
- **15 GLBs:** every byte count and SHA-256 matches `build-report.json`; each is a valid
  glTF 2.0 container with the declared sockets and one non-rendered `COLLISION_HULL`
  empty. No textures, skins, animations, compression, or authored LOD GLBs exist.
- **62 PNGs:** all decode as PNG and use the recorded 1920x1400 or 1100x900 review sizes.
- Exact-path reachability audit found no pack source/GLB binding in a parts manifest,
  release manifest, `partsLibrary`, runtime source, or release-bundle map.
- Provenance limitation: the original packet captured exporter
  `Khronos glTF Blender I/O v5.1.20` but not its Blender version. The pre-review builder
  hash was `a895d865cc7b5a9e6406d678a984e0d151711aa6f412905ef17ac1a9517b0ff7`.
  Byte reproducibility remains unverified until two full builds match under one pinned
  toolchain.

## Original-resolution visual review

The ore barge, tankers, sweeper, tug, and construction rig carry the strongest reusable
silhouette ideas. Orientation, role equipment, socket intent, and activity choreography
are coherent enough to preserve as reference.

They remain blockouts. Primitive boxes, tubes and spheres dominate; flat materials read
as matte clay/plastic; the prospector, repair tender, and salvage cutter converge toward
similar box hulls at 125-165 WU. Several role reads depend on lamps, labels, or render-only
staged props. The screenshots are not source/renderer/settings-hash-bound production
evidence. They cannot establish unlabeled normal-route readability or G1/G2/G4.

## Required boundary for any future use

1. Select a family as a donor concept; do not promote the pack wholesale.
2. Reconcile the nominal fiction length against the measured GLB envelope.
3. Re-author form and material zones under the current whole-ship production standard;
   author LODs and the actual release pipeline instead of treating recorded plans as files.
4. Bind original-resolution evidence to exact source, renderer, settings and candidate
   hashes, then obtain independent whole-asset KEEP/REVISE/REVERT review.
5. Only after that may an exact-path lane add manifests or runtime selectors and run the
   relevant performance, accessibility, Browser/Electron, and G-gate evidence.

Until those steps occur, all 15 assets remain **never-runtime donor material**. The staged
activity props remain review-only and are not exported mechanisms.
