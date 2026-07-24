<!-- LIFETIME: VOLATILE -->
# NOW — active work and path leases

```yaml
refreshed: 2026-07-24
baseCommit: ad1976f70eaf701e6b7a0f98925aab27153d1a61
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
| Three-thread ChatGPT Pro conveyor | controller run `spaceface-three-thread-20260724`; immutable base `codex/delegation-base-20260724` | PQ-018 candidate owner seams on an isolated remote branch; PQ-020/PQ-021 remain read-only until PQ-018 integration; Browser-GPU acceptance stays controller-serialized | Workers must not edit this board, the queue, global acceptance, or any exact primary-checkout dirty path. Candidate integration waits for collision review and foreign-WIP disposition. |

## Current program facts needed for dispatch

| Item | Current fact | Consequence |
|---|---|---|
| PQ-007 | Focused-green correction integrated; current Browser/Electron route acceptance remains open | Do not restore the rejected pursuit-slot mechanics from historical prose. Treat route evidence as a separate acceptance task. |
| PQ-017 | World Site kernel integrated; writer lease released | PQ-018 may consume the integrated manifest/kernel/runtime contract after re-reading current symbols. |
| PQ-018 | Next unintegrated feature root; preserved source asset exists but release/runtime/route work remains | Use `roadmap/active/PQ-018.md`; do not rebuild the source from zero or claim the source candidate as runtime completion. |
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
