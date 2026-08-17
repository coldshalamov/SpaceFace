<!-- LIFETIME: STABLE -->
# Orphaned worktree and branch recovery

Use this playbook only when the explicit task is to classify stopped agent work, harvested worktree
content, orphan branches, or corrupt local clones. It converts archaeological material into current
production work without treating age, branch names, or raw file counts as evidence of value.

The latest completed transaction is recorded in
[`roadmap/receipts/SPACEFACE-ARCHIVES-2026-08-17-REPORT.md`](./roadmap/receipts/SPACEFACE-ARCHIVES-2026-08-17-REPORT.md).
That closeout deletes the external `SpaceFace-archives` parking lot. The earlier
[`roadmap/receipts/WORKTREE-RECOVERY-2026-08-08-REPORT.md`](./roadmap/receipts/WORKTREE-RECOVERY-2026-08-08-REPORT.md)
transaction remains durable for the 13 harvested `_recovery` sources.

## Occupancy and coordination

A path is occupied only when it is exact dirty/untracked foreign work, or a current claim names that
exact path and a demonstrably live writer confirms it. Old branches, worktrees, lane labels, mutexes,
pre-today claims, and subsystem proximity are not blockers. Coordinate active Codex tasks directly,
record their exact write sets, split collisions at the path boundary, and continue every disjoint
unit.

Never infer that a renderer, asset family, packet, or directory is unavailable because one file in it
has a writer. Recheck `git status --short`, `git worktree list --porcelain`, the exact branch/HEAD, and
live-task ownership immediately before mutation.

## Evidence ladder

For each source, use all applicable evidence in this order:

1. Current user direction, architecture, active packets, manifests, and accepted receipts.
2. Current-master behavior, exact runtime selection, focused tests, and player-route evidence.
3. Exact commit ancestry and `git cherry -v master <ref>` patch equivalence.
4. Tip-to-tip path/blob comparison; an ahead commit is not proof of an unintegrated feature.
5. Recovered working-copy bytes, source hashes, provenance, and visual inspection.
6. Historical prose only as a lead. Never revive a rejected architecture because its export is large.

Treat overlapping sources as one synthesis when they share the same base/control-plane payload.
Count unique paths and distinct product outcomes, not repeated harvested copies.

## Dispositions

Every source receives one terminal disposition:

| Disposition | Meaning | Required durable result |
|---|---|---|
| `DROP` | Integrated, superseded, rejected, or deliberately replaced | Current-master evidence and the exact ref/path safe to delete |
| `PORT` | A clear current-product improvement | Focused commit/PR on current owners with proportional regression proof |
| `ADAPT` | Valuable idea/asset, wrong identity or stale implementation | Exact donor/provenance plus a new stable future outcome; never silent substitution |
| `PRESERVE` | Unique value cannot yet be judged safely | Exact reason, bounded next audit, immutable hashes where possible |

Visual alternatives default to `ADAPT`, not replacement: preserve the source as a named non-runtime
donor, freeze the accepted asset identity, and give the alternative a new ship/NPC/place role. A
donor is not a candidate and carries no inherited G0-G7 acceptance.

## Work sizing and continuation

Sizes are scheduling metadata, never stop conditions:

| Size | Expected effort | Recovery policy |
|---|---:|---|
| `XS` | up to 30 minutes | Finish now |
| `S` | 0.5-2 hours | Finish now |
| `M` | 2-4 hours | Finish now |
| `L` | 4-8 hours | Finish in the current recovery campaign, splitting exact collisions |
| `XL` | multi-day authored/cross-owner production | Preserve inputs now; record an executable Canonical/backlog route with phases, owners, and acceptance |

Do not convert validation into the task. Run one focused proof for an adapted runtime seam, one
structural/hash proof for donor preservation, and the program-doc/catalog checks for authority edits.
Do not repeat unchanged headed or broad checks.

## Cleanup transaction

Perform destructive cleanup only after the durable dispositions and every required port/adaptation are
committed and pushed:

1. Verify the exact branch/tag/path still matches the report and has no live worktree/process.
2. Delete only named refs; never use broad branch globs, `push --all`, or aggressive pruning.
3. Delete local harvest files only when the tracked report contains the complete decision matrix and
   every preserved binary has a tracked path, hash, and provenance.
4. For a corrupt independent clone, do not trust Git ancestry. Build a bounded hash ledger from the
   working copy, compare Blender/GLB/evidence families to current tracked assets, preserve named
   donors, then delete the exact clone path.
5. Re-run `git worktree list`, exact ref queries, and `git status --short`. Do not run aggressive GC as
   part of triage.

After deleting material local data, report the exact targets and recovery status. A pushed commit or
remaining named ref is recoverable; deleted ignored harvests and corrupt working-copy-only bytes are
not recoverable unless separately preserved.

## Definition of done

- Every harvested source has a tracked disposition with current-master evidence.
- Every `PORT` is committed/pushed and proportionately verified.
- Every `ADAPT` has exact tracked donor inputs/provenance and a non-replacement future identity.
- Every retained `XL` outcome has an executable Canonical/backlog route.
- All exact safe refs and redundant local harvest files are deleted.
- Any remaining local clone/path is named, preserved for a bounded reason, and not misreported as an
  active registered worktree.
