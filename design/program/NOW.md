<!-- LIFETIME: VOLATILE -->
# NOW — active work and path leases

```yaml
refreshed: 2026-07-25
baseCommit: 167f36901bb206860427354ca1ed5a8d855152e5
expiresAfterCommits: 25
expiresAfterDays: 7
```

Refresh this board before mutation. It records live collision risk, not history or completion evidence. Exact packet status remains in the queue and receipts.

## Occupied or protected surfaces

| Domain | Owner/ref | Protected paths or mutex | Disposition |
|---|---|---|---|
| Background lifecycle/performance | `codex/perf-01a-background-lifecycle`, worktree `C:\Users\93rob\sf-perf01a` | Electron lifecycle, loop/main, launch policy, `package.json`, package/launch mutex, focused tests | Occupied isolated worktree. Do not edit or rebase these paths without owner disposition. |
| Primary checkout foreign WIP | user-owned asset/render/Lab work | all dirty paths outside this control-plane slice, including `assets/ships/parts/**`, `assets/ships/release/parts/**`, `src/core/graphicsProfileBootstrap.js`, `src/render/vfx.js`, `src/testing/lab/saveLoadCompare.js`, and the currently dirty focused tests | Preserve every unstaged path. Do not inspect beyond task need; stage explicit program-control paths only. |
| Visual-asset documentation | open pull request #89 | `docs/visual-assets/**` | Out of scope for ordinary program-doc work until the PR is resolved or rebased. |
| PQ-018 acceptance candidate | `claude/pq018-rebase-20260725`, worktree `C:\Users\93rob\sf-claude-20260725`; matched baseline worktree `C:\Users\93rob\sf-claude-pq018-baseline` pinned to `167f3690` | PQ-018 owner seams, `scripts/lib/pq018*`, `scripts/validation-manifests/pq018-wreck-cathedral.mjs`, `.devshots/pq018-wreck-cathedral/**`, Browser-GPU acceptance | Active claimant lease. The codex PQ-018 work is rebased onto current master here; do not merge `codex/pq018-integration-review-20260725` directly — it forks below FIX3–FIX10 and would delete those regression tests. |
| Live master committer | unattended `codex` session writing to `master` in the primary checkout (~30 min cadence; `fix(lab)` certification work) | `src/testing/lab/**`, `src/contracts/**`, `test/holistic-fix*`, and the primary index | Do not stage, commit, stash, rebase, or clear locks in `C:\Users\93rob\Documents\GitHub\SpaceFace`. Treat `master` as moving under you; pin a SHA before any matched-evidence run. |
| Grok visual-asset session | long-running `grok.exe`; last repo write 2026-07-25 01:22 | `assets/ships/parts/**`, `assets/ships/release/parts/**`, thruster/render dirty paths in the primary checkout | Dormant but alive — a stale mtime is not an exited process. Preserve every unstaged path in both directions. |
| Three-thread ChatGPT Pro conveyor | controller run `spaceface-three-thread-20260724`; immutable base `codex/delegation-base-20260724` | PQ-018 candidate owner seams on an isolated remote branch; PQ-020/PQ-021 remain read-only until PQ-018 integration; Browser-GPU acceptance stays controller-serialized | Workers must not edit this board, the queue, global acceptance, or any exact primary-checkout dirty path. Candidate integration waits for collision review and foreign-WIP disposition. |

## Current program facts needed for dispatch

| Item | Current fact | Consequence |
|---|---|---|
| PQ-007 | Focused-green correction integrated; current Browser/Electron route acceptance remains open | Do not restore the rejected pursuit-slot mechanics from historical prose. Treat route evidence as a separate acceptance task. |
| PQ-017 | World Site kernel integrated; writer lease released | PQ-018 may consume the integrated manifest/kernel/runtime contract after re-reading current symbols. |
| PQ-018 | Implementation already exists and is rebased onto `167f3690`; matched baseline captured and validated for Browser and Electron. Route reaches admission, authored cavity traversal, and four operations, then stalls on `cut_cargo_clamp_forensics` | Do not rebuild the source or the implementation. Acceptance is blocked on that live-layer stall, not on missing work. The kernel applies all five operations cleanly, so the defect is in the live beam/target layer. |
| PQ-019–PQ-025 | Planned corridor | Use their active packets and entry gates. Do not dispatch an umbrella row when a prerequisite leaf packet is required. |

## Preserved candidates, not active authority

- Wreck Cathedral source asset and evidence are committed and reusable; current runtime contracts decide promotion.
- Narrative, Lark, and VP-220 candidates remain on named recovery refs. They are not merged, accepted, or leased merely because they exist.
- Historical planning handoffs under `docs/handoffs/chatgpt-portfolio-20260723/` are reference material. Active packets supersede their dispatch prose while retaining grounded technical findings.

## Refresh procedure

Before claiming a packet:

1. re-run `git status --short` and `git worktree list`;
2. inspect open branches/PRs touching the packet's write surfaces;
3. compare this file's `baseCommit` to HEAD and refresh when the expiry is exceeded or any listed owner changes;
4. record the packet lease and exact paths before implementation;
5. remove or update the lease immediately when work is integrated, abandoned, or moved.

Do not append closeout narratives here. Put exact-revision evidence in a receipt and rely on Git history for the rest.
