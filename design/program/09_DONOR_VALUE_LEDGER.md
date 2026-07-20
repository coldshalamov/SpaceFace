# Donor Value and Cleanup Ledger

**Audit date:** 2026-07-20

**Authority boundary:** `master` is the product authority. This ledger records selective donor value
and cleanup decisions; it does not make any donor branch current, accepted, or safe to merge whole.
Dirty-path counts and ahead/behind counts are audit snapshots and must be refreshed before removal.
`design/program/_review/` was not read or classified; it was moved unread to
`SpaceFace-archives/primary-review-quarantine-20260719`.

## 1. Rules

1. Never use broad `ours`/`theirs` conflict resolution to collapse a donor.
2. Compare each candidate with current `master` at the real gameplay camera and owning runtime seam.
3. Port only a coherent vertical whose dependencies, tests, generated data, and player route are known.
4. Preserve unrelated dirty work. A physical worktree may be removed only after every product-bearing
   dirty/untracked path is promoted, preserved by branch/tag/archive, or deliberately rejected.
5. A branch can remain as recoverable history after its physical worktree is removed.
6. Final visual candidates require reproducible source plus current browser/Electron motion and measured
   cost; attractive standalone renders do not win by themselves.

## 2. Registered worktree disposition

| Worktree / branch | Audit snapshot | Product ruling | Physical cleanup condition |
|---|---|---|---|
| `SpaceFace` / `master` | Product merge `b235f062`; evidence hardening through `280cafb0`; propulsion repair `59f91d19`; Atlas/journey through `4f7bc87c`; geology truth `e8838e2c`; Electron RCS evidence harness `3d2dc765`; hybrid-research disposition `1074c078`. | Product authority. Graphics and reviewed performance synthesis are promoted. | Never remove. |
| `SpaceFace-graphics-closeout` / `codex/graphics-closeout-20260719` | Physical worktree removed; clean tip `8e860439` is reachable from `master`. | No unique product work. | Complete. |
| Rejected performance experiment / `archive/performance-pooling-experiment-20260720` | Base tip `99cad5b5` is integrated; evidence hardening is replayed. Physical worktree removed at clean tip `9d626fd8`; rejected implementation preserved by annotated tag and obsolete local branch retired. | Reject post-synthesis range `04805924..9d626fd8`. The measured primitive, merged, corrected exact-key, and BatchedMesh implementations all lost to current ship-local batching on target Intel hardware; the final run measured 250.1/616.8/433.3 ms p95 for 10/25/50 ships and had correctness/PBR blockers. This rejects those implementations, not every possible hybrid design. The bounded hybrid hypothesis is retained in `06_RETAINED_FUTURE_BACKLOG.md` at `1074c078`. | Complete. Never replay the rejected range; retain the tag/evidence for archaeology only. |
| `SpaceFace-graphics-overhaul` / `codex/graphics-overhaul` | Tip `cab2d122`; 24 branch-only commits; 244 dirty paths. Dirty inventory: 180 assets (80 release, 58 Kestrel evidence/source, 42 parts), 15 `src`, 14 `scripts`, 10 `test`, 22 unrelated `docs/user-guide`, two `active_sessions` files, and one tracked Python cache. Only eight dirty asset files match current master; 236 paths differ. | Retain. Accepted runtime value was manually synthesized into master; no remaining branch commit is approved for whole replay. The dirty tree mixes valuable Blender/PBR source, rebuilt release output, unreviewed code/tests, and obvious process contamination, so it cannot be checkpointed wholesale. | Not releasable. Keep the physical worktree until the three asset groups receive per-family provenance/promote/reject receipts and every non-asset path is classified or deliberately removed. Never whole-merge. |
| `SpaceFace-oc-helios-golden` / `opencode/helios-golden-station` | Physical worktree removed after a 101-behind / 0-unique / 2.53 GB audit. | Full replacement rejected. The useful builder, precursor receipt, editable blend, three-LOD source, and release asset are on `master`. | Complete. |
| `SpaceFace-depth-actualization` / `grok/depth-player-route-actualization` | Physical worktree removed. Branch `bf1dfce2` and annotated archive tag remain; 17 raw artifacts are hash-archived externally. | Selective product donor only; the remaining black-box candidate is recorded below. | Complete; never whole-merge the branch. |
| Four orchestration satellites | Physical worktrees removed after individual dirt/process audits. | Superseded station shell, incorrect Helix faction edit, old natural-route harness, and defective recovery variant rejected. Branch refs remain. | Complete. |
| `SpaceFace-orch-kimi-v2-present` / `orch/kimi-v2-present` | Physical worktree removed after product-only donor commit `0e2f2e51` (focused test 4/4). | Never whole-merge. Only the station-presentation slices below remain candidate value. | Complete; selectively port or reject from the donor commit later. |

The 2026-07-20 closeout found no completed, reviewed graphics implementation commit waiting off
`master`. The 24 commits unique to `codex/graphics-overhaul` are historical donor history whose
accepted concepts were manually synthesized into the promoted graphics commits; Git patch IDs are
not equivalent because the integration was semantic rather than a branch replay. The remaining dirty
worktree is mixed source/WIP, not another finished vertical. `0e2f2e51` likewise remains a candidate
station-presentation donor, not accepted graphics implementation.

## 3. Helios/OpenCode ruling

The accepted live station remains the three-LOD Helios on `master`.

Rejected full replacement facts:

- zero of the donor's 30 changed station-map hashes match the current accepted payload; six inherited
  accent/glass maps are byte-identical and add no donor value;
- its map set is older/heavier than the accepted iteration-2 surfaces;
- its release shortcut removes `LOD1`, `LOD2`, and `SOCKET_Structure_Core`;
- roughly 1.02 million triangles would remain active at every distance;
- it has no evidence that the replacement beats the live station in a natural game camera.

Preserved recipe, not accepted replacement:

- the newline-normalized builder is already tracked at
  `assets/ships/m4_helios_hub/scripts/build_station_golden02.py`; the exact precursor hash is in the
  production receipt, and the authoritative editable blend plus accepted three-LOD source remain on
  `master`;
- the rejected worktree instead wires a 68-primitive / 1,021,872-triangle LOD-stripped asset and an
  obsolete map set that is 29% heavier at the same resolution;
- any future batching optimization starts from the accepted asset and must retain real LOD geometry,
  current compression, matched approach/undock captures, and measured draw-call, residency, and
  frame-time improvement. It does not depend on this worktree.

Do not cherry-pick the donor loader, manifest, release GLB, or texture replacement.

## 4. Depth donor: selected value and rejected value

Never merge `bf1dfce2` as a branch. Review and port these bounded slices against current owners:

1. **Station correctness:** concepts/changes from `adbd0fb2`, `a92d0f0b`, and `f78cf484`.
2. **Game Over recovery:** the buried recovery slice from `2a3b504d`.
3. **Ship Ledger/title reachability:** the player-route slice from `52f464de`.
4. **Station identity/readability:** selected work from `fc0aa726`, `65650121`, `a67b0a2e`, and
   `67dd87a2`, preserving current station UI hierarchy.
5. **Physical world actors:** Quiessence/Hush/Candle landmark ideas from `52f464de` and `a57aa00d`.
6. **Flavor presentation:** only the V2 ad-board/scanner subset of `0580a007` that still beats
   current producers and localization.
7. **Flight/HUD/mining concepts:** compare `0580a007` and `156aec66` with final current routes; port
   only demonstrably superior bounded behavior and do not overwrite the active mining owner.
8. **Investigation-chain docking:** selectively re-evaluate only the `src/data/missions.js` hunk from
   `1735d640` that assigns `recover_the_black_box.destStationId = station_reach`. Current mission
   completion skips a docked mission whose `destStationId` is null. Keep rejecting that commit's
   unrelated 96-damage EMP shortcut.

Reject:

- renderer-radius change `3312b5c7`;
- the 96-damage weapon/runtime shortcut `1735d640`;
- superficial doctrine tags `55c04163`;
- unique-wreck harness production APIs;
- glow/pulse styling `108f139d`;
- natural-route/claim compiler infrastructure and stale process documentation;
- the 17 untracked raw log/evidence artifacts unless a current owner proves unique durable value.

## 5. Kimi station-presentation donor

Candidate selective ports:

- CRLF hardening in `scripts/build-flavor-index.mjs` (low priority);
- the unique-wreck rumor before the stock Quinn reply in `src/ui/screens/bar.js`;
- `src/ui/station/adBoard.js`;
- `src/ui/station/stationIdentity.js`;
- `test/station-ad-board.test.mjs`;
- the rumor receipt/wreck lead from the station bar;
- the dockside notice/wreck lead from contracts while preserving the current stronger summary
  fallback;
- only the supporting CSS required by accepted behavior.

No candidate has current UI screenshot proof. Any port requires the owning focused checks plus a normal
station-route browser/Electron capture. Prompt, log, cache, and worker-return artifacts are not product.

## 6. Performance synthesis contract

The performance branch was resolved semantically at `b235f062` using this contract:

| Seam | Preserve from current graphics/Atlas | Preserve from performance closure |
|---|---|---|
| `src/render/partsLibrary.js` | Semantic PBR tint/maps and authored identity/admission contracts. | Measured opening-admission/culling behavior, currently described as the 2,400-WU admission slice. |
| `src/render/renderer.js` | Rock preload/final maps, authored bounds, stable runtime material state, fail-closed admission. | Relative-velocity prefetch/precompile and context-recovery/resource-lifetime work. |
| `src/render/spaceBackground.js` | Atlas velocity smear and reduced-motion truth. | Exported wormhole pipeline factory/precompile and measured pass/resource work. |
| `src/render/precompile.js`, `src/render/bloom.js` | Retain black-space/de-haze and current visual contracts. | Preserve reviewed performance improvements that do not lower default authored quality. |

After synthesis, all 167 performance-modified tests and 49 graphics receipt/admission/material/
visual-family tests pass together; camera, AI-telegraph, and exact receipt checks also pass.
`check:sim:compare`, asset/live/visual-stability/flight checks, and one owned browser plus Electron/GPU
acceptance route remain the final combined evidence. Old performance evidence alone is not final.

Post-geology visual stability passed 360 frames with 45 warmup, 315 inspected, and zero failures.
Fresh normal-settings hardware Electron propulsion evidence after `3d2dc765` also passed with four
plume layers, two opposed RCS jets, and zero reported frame allocations. Neither result closes the
strict frame-time promotion gate or the broader natural-route continuity packet.

The later `04805924..9d626fd8` experiment is not a continuation of that accepted synthesis. Its four
pooling implementations were measured and rejected. In addition to the target-hardware frame regression,
review found missed child-hull transform invalidation, a non-exact geometry collision signature,
zero-reference geometry retained in partially occupied pages, and no proof that master PBR/appearance
semantics survived. Current `master` intentionally keeps ship-local static batching.

## 7. Cleanup order

1. Run the strict three-profile/three-matrix combined acceptance contract on one exact clean current
   master revision. Do not replay the rejected authored-pooling range to pursue that evidence.
2. Keep `SpaceFace-graphics-overhaul` until its uncommitted Blender/source asset inventory is fully
   classified. It is the only intentionally long-lived graphics donor in this ledger. Its exact
   remaining categories are release GLBs, Kestrel source/evidence, parts/source assets, unreviewed
   render/tool/test changes, and unrelated session/user-guide/cache contamination. Do not turn that
   mixed state into one preservation commit merely to make the worktree look clean.

Completed 2026-07-19: graphics-closeout, rejected Helios, four superseded orchestration satellites,
the product-preserved Kimi donor, the tagged/hash-archived Depth donor, and the clean rejected
performance experiment were removed through Git.

Use `git worktree remove` only after verifying the resolved absolute target and clean/disposition state.
Do not recursively delete computed paths, prune branches merely because a folder looks stale, or remove a
worktree while an owner process is active.
