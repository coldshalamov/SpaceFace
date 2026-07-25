<!-- LIFETIME: VOLATILE -->
# NOW — active work and path leases

```yaml
refreshed: 2026-07-25
baseCommit: 5e3feb919b2fd3c98df9457e8ccc72637cefa085
expiresAfterCommits: 25
expiresAfterDays: 7
```

Refresh this board before mutation. It records live collision risk, not history or completion evidence. Exact packet status remains in the queue and receipts.

## Occupied or protected surfaces

| Domain | Owner/ref | Protected paths or mutex | Disposition |
|---|---|---|---|
| Primary checkout visual production | user-directed Grok asset run | `assets/ships/parts/**`, `assets/ships/release/parts/**`, `src/core/graphicsProfileBootstrap.js`, `src/render/**`, graphics-focused tests, generated texture/export candidates, and Blender logs | The only active writer. Preserve every unstaged path; do not stage, move, commit, clean, or overwrite this lane until its owner finishes. |
| Committed candidate refs | named local/remote branches and registered worktrees | Their branch tips and worktree metadata | These are not active writers. Preserve the refs as reviewable candidates; do not merge or rebase them merely for a checkpoint. |

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
