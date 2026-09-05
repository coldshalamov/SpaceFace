# WORKTREE-RECOVERY-2026-09-04 report

**Outcome:** Terminal disposition reached for all nine delegation worktrees under
`C:/Users/93rob/Documents/Codex/2026-09-04/the-most-recent-claude-session-about/work/delegation/`
per [`design/program/WORKTREE_RECOVERY.md`](../../WORKTREE_RECOVERY.md).

Six branches are verified fully integrated or identical to `master` and classified `DROP`.
Three branches contain active exploratory/donor work and are classified `PRESERVE` as named donor
branches for their respective packets. All nine worktree checkouts are cleanly unlocked and removed
so no stale worktrees remain registered.

## Nine delegation sources

| Source path | Ref / Branch | Tip SHA | Disposition | Evidence / Retained Value | Action |
|---|---|---|---|---|---|
| `wt-contact-v4` | `codex/contact-terrain-20260904-v1` | `0b7f91d6` | `DROP` | Integrated in `master` as a patch-equivalent cherry-pick (`git cherry` returns patch-equivalent; not a direct ancestor). | Worktree removed; branch deleted. |
| `wt-flight-governor-v2` | `codex/flight-governor-20260904-v2` | `a9933691` | `DROP` | Integrated in `master` as a patch-equivalent cherry-pick (patch-id verified; not a direct ancestor). | Worktree removed; branch deleted. |
| `wt-flight-v2` | `codex/contact-player-knock-20260904-v1` | `8198c0ed` | `DROP` | Cherry-picked to `master` as `a3bd740d` ("PQ-137.11: keep player contact from knocking the hull off its course"); patches verified identical. | Worktree removed; branch deleted. |
| `wt-force` | `codex/force-law-20260904-v4` | `f420b9fb` | `DROP` | All 4 commits (`23e59447`, `ba4016af`, `4b267dd5`, `f420b9fb`) integrated in `master` as patch-equivalent cherry-picks (patch-ids verified; none are direct ancestors). | Worktree removed; branch deleted. |
| `wt-world-patrol-v5` | `codex/force-weapons-20260904-v1` | `8f55489f` | `DROP` | Integrated in `master` as a patch-equivalent cherry-pick (patch-id verified; not a direct ancestor). | Worktree removed; branch deleted. |
| `wt-world-v2` | `codex/world-tail-fix-20260904-v2` | `904da058` | `DROP` | Direct ancestor of `master` (merge-base verified; 0 commits ahead). | Unlocked; worktree removed; branch deleted. |
| `wt-bench` | `codex/fun-recovery-bench-20260904` | `4828d065` | `PRESERVE` | 3 commits on Crucible bench, feel bars, and fail-closed fun metrics. Retained on branch as donor for PQ-173. | Worktree checkout removed; branch ref preserved. |
| `wt-flight-camera-v6` | `codex/flight-stroke-20260904-v1` | `95b354c9` | `PRESERVE` | 5 commits on draw-to-fly stroke following, corner fillet tangents, and path tracking tests (`autoTargetMode.js`). Retained on branch as donor for PQ-137.08. | Worktree checkout removed; branch ref preserved. |
| `wt-impact-v3` | `codex/impact-tumble-instrument-20260904-v1` | `0e180ae6` | `PRESERVE` | 2 commits on tumble trail socket evidence and test baselines (`feel.tumble_trail.mjs`). Retained on branch as donor for PQ-139.04. | Worktree checkout removed; branch ref preserved. |

## Cleanup Verification

- `git worktree unlock` executed on `wt-world-v2`.
- All nine `wt-*` checkouts removed via `git worktree remove`.
- Six integrated branches deleted via `git branch -D`.
- Three donor branches preserved under `codex/*`.
- Main working tree verified clean and unaffected.

## Independent audit (2026-09-04, post-deletion)

Ancestry checks (`git merge-base --is-ancestor`) show five of the six DROP tips are **not direct
ancestors** of `master` — their patches landed via cherry-pick/squash under different SHAs.
`git cherry master <tip>` returns patch-equivalent (`-`) for every DROP commit
(`0b7f91d6`, `a9933691`, `8198c0ed`, `23e59447`, `ba4016af`, `4b267dd5`, `f420b9fb`,
`8f55489f`), and `904da058` is a direct ancestor, so every DROP disposition holds and no
unintegrated work was deleted. The earlier "is in `master`" wording meant content integration,
not ancestry; this section exists so the next auditor does not mistake it for a lost-work claim.
The three PRESERVE branches remain local named refs with their tip hashes recorded in the ledger
(`4828d065`, `95b354c9`, `0e180ae6`); they are not on `origin`, so treat those refs as
single-site durability and push by explicit name if cross-site durability is wanted.
