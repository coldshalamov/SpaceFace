<!-- LIFETIME: HISTORICAL -->
# PQ-136.00 — Wreck pack reaches the player: receipt

- **packetId:** PQ-136
- **leafId:** PQ-136.00
- **candidateCommit:** (the commit carrying this receipt)
- **disposition:** PASS
- **acceptance:** focused_green

## The route this took (two halves, both this day)

1. **Promotion** (commit e25f4c14): the first attempt proved incubator sources fail the
   fail-closed loader and was stopped for byte-stamping authored files; the honest route —
   `scripts/build-pack-release-assets.mjs`, the canonical encoding lane — released all 74 bodies
   (wreck 44 + kit 30) atomically at 60% size reduction with identity extras riding the release
   artifacts, sources verified untouched, loader test green for every body.
2. **Placement** (this commit): authored wreckage in ordinary sectors as LANDMARKS, not scatter.

## Placement design

One field per sector at most, anchored on a named wreck/derelict POI or a far asteroid field —
never inside a station apron; Helios stays clean for the tutorial/memorial picture. Caps: ordinary
belt ≤1 hero + 4 cluster; core junctions fragments-only ≤2; fringe/high-danger/wreck-POI ≤6 with
combat/liner hull preference (battle-site logic at enemy density ≥0.4). Fracture grammar holds per
field: truss hulls shed truss debris, plated shed plate — no mixed junk piles. The 200-mesh-class
ore-freighter bow/stern route but are not dropped as everyday landmarks. Kit dressing now serves
all 46 props with family-correct anchors; Ceres/Tethys exclusions preserved.

## Verified (controller)

Wreck placement 4/4 + extended kit 4/4 (variety floors: distinct hero hulls across seeds; the new
thirty actually appear); routing-row mutation red-then-green; `check:asset-reachability`
**276 → 350** — every recovered body is now runtime-referenced; both 47-A goldens byte-stable;
LF endings.

## Residuals

None blocking. A future chase-camera still pass over the richest wreck field is the natural
art-review follow-up when the GPU lane runs its capture batch.
