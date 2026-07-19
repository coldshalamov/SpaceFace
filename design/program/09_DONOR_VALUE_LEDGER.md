# Donor Value and Cleanup Ledger

**Audit date:** 2026-07-19

**Authority boundary:** `master` is the product authority. This ledger records selective donor value
and cleanup decisions; it does not make any donor branch current, accepted, or safe to merge whole.
Dirty-path counts and ahead/behind counts are audit snapshots and must be refreshed before removal.
`design/program/_review/` was not read or classified.

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
| `SpaceFace` / `master` | `cbdf1589` | Product authority. Graphics closeout is promoted. | Never remove. Preserve foreign station diagnostics and quarantined review material. |
| `SpaceFace-graphics-closeout` / `codex/graphics-closeout-20260719` | Fast-forwarded cleanly to `cbdf1589` before this uncommitted documentation pass. | No unique product work after the docs are promoted. | Remove after reviewed program-doc changes reach `master` and status is clean. |
| `SpaceFace-performance-closure` / `codex/performance-closure-20260719` | Active; sampled at `6559e3b4`. | Protected integration donor. Finish and review in isolation; synthesize render overlaps manually. | Remove only after final clean tip is integrated, combined graphics/performance proof passes, and branch recovery is confirmed. |
| `SpaceFace-graphics-overhaul` / `codex/graphics-overhaul` | Audit: 96 master-only / 24 branch-only commits and about 244 dirty paths. | Retain. It contains substantial uncommitted Blender/source assets and cannot be reduced to a branch-only history yet. Never whole-merge. | Keep physical worktree until asset-by-asset source inventory and promote/reject receipts are complete. |
| `SpaceFace-oc-helios-golden` / `opencode/helios-golden-station` | Audit: about 70 commits behind, 0 unique commits, and about 257 dirty paths. | Full station replacement rejected. Retain only the batching recipe described below. | After hashes/rejection/batching recipe are durable and no unique source value remains, remove the physical worktree; retain a branch/tag only if useful. |
| `SpaceFace-depth-actualization` / `grok/depth-player-route-actualization` | `bf1dfce2`; audit: about 90 master-only / 42 branch-only commits and 17 untracked raw artifacts. | Selective product donor only. Whole merge rejected because it would delete or regress large current surfaces. | Record or port the selected slices, reject the raw artifacts, preserve branch/tag, then remove physical worktree. |
| `SpaceFace-orch-codex-gt-sample` / `orch/codex-gt-sample` | `f3e49b4f` | Committed product history is contained in or patch-equivalent to the Depth donor. | Remove after this ledger is promoted and dirty paths, if any, are rechecked. |
| `SpaceFace-orch-codex-natural` / `orch/codex-natural-routes` | `de5397bc` | Committed product history is superseded by the Depth donor. | Same as above. |
| `SpaceFace-orch-codex-recovery` / `orch/codex-m3-recovery` | `de5397bc` | Committed product history is superseded by the Depth donor. | Same as above. |
| `SpaceFace-orch-codex-helix` / `orch/codex-helix-d1` | `6475e2ef` | Unique one-line faction change is rejected as incorrect. | Recheck dirty paths, retain rejection record, then remove. |
| `SpaceFace-orch-kimi-v2-present` / `orch/kimi-v2-present` | `de5397bc` plus uncommitted presentation work. | Never whole-merge. Only the station-presentation slices below remain candidate value. | Port or explicitly reject each listed slice, capture the normal station route if ported, then remove. |

## 3. Helios/OpenCode ruling

The accepted live station remains the three-LOD Helios on `master`.

Rejected full replacement facts:

- zero of the donor's 30 texture hashes match the current accepted payload;
- its map set is older/heavier than the accepted iteration-2 surfaces;
- its release shortcut removes `LOD1`, `LOD2`, and `SOCKET_Structure_Core`;
- roughly 1.02 million triangles would remain active at every distance;
- it has no evidence that the replacement beats the live station in a natural game camera.

Retained concept, not accepted artifact:

- a scratch Blender pass reduces 777 glTF primitives to 45 while retaining three LODs, twelve
  semantic roles, and the structure socket;
- the candidate is still about 228 MB / 1.64 million triangles, loses authored anisotropy in glTF,
  and has no normal-route or performance proof;
- reimplement the batching recipe only against the accepted station, with genuinely reduced LOD
  geometry, current compression, matched approach/undock captures, and measured draw-call,
  residency, and frame-time improvement.

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

When the isolated performance branch is ready, resolve these overlaps semantically:

| Seam | Preserve from current graphics/Atlas | Preserve from performance closure |
|---|---|---|
| `src/render/partsLibrary.js` | Semantic PBR tint/maps and authored identity/admission contracts. | Measured opening-admission/culling behavior, currently described as the 2,400-WU admission slice. |
| `src/render/renderer.js` | Rock preload/final maps, authored bounds, stable runtime material state, fail-closed admission. | Relative-velocity prefetch/precompile and context-recovery/resource-lifetime work. |
| `src/render/spaceBackground.js` | Atlas velocity smear and reduced-motion truth. | Exported wormhole pipeline factory/precompile and measured pass/resource work. |
| `src/render/precompile.js`, `src/render/bloom.js` | Retain black-space/de-haze and current visual contracts. | Preserve reviewed performance improvements that do not lower default authored quality. |

After synthesis, rerun focused performance tests, graphics receipt/admission/material/visual-family tests,
`check:sim:compare`, asset/live/visual-stability/flight checks, and one owned browser plus Electron/GPU
acceptance route. The graphics closeout's rock admission/preload means old performance evidence alone is
not final combined evidence.

## 7. Cleanup order

1. Finish and integrate the performance closure; remove its worktree only after combined proof.
2. Promote these program docs; remove the clean graphics-closeout worktree.
3. Confirm the Helios rejection/batching record is sufficient; remove the rejected Helios worktree.
4. Recheck each small satellite for dirty product paths; port/reject its listed value, then remove it.
5. Preserve the Depth branch/tag, finish the selective-port decisions, reject raw artifacts, then remove
   the physical Depth worktree.
6. Keep `SpaceFace-graphics-overhaul` until its uncommitted Blender/source asset inventory is fully
   classified. It is the only intentionally long-lived graphics donor in this ledger.

Use `git worktree remove` only after verifying the resolved absolute target and clean/disposition state.
Do not recursively delete computed paths, prune branches merely because a folder looks stale, or remove a
worktree while an owner process is active.
