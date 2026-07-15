# Worktree and Integration Inventory

**Audit snapshot:** 2026-07-14 after commits `850c80f3` and `50bd5505`, revalidated after concurrent
upstream and working-tree movement during reconciliation. This file's containing commit is newer by
definition. Treat the values below as checkpoint history and re-run the commands before acting.

## Repository checkpoint

- Branch: `master`.
- Snapshot local HEAD: `50bd550579338c6a62cf50be06354093f0bee52f`.
- Snapshot upstream `origin/master`: `850c80f30ac52646aaed5602efbb096bc7b77f50`.
- At that snapshot local HEAD was 1 commit ahead and 0 behind. Verify current synchronization; do not
  repeat this historical count as live status.
- `codex/depth-program` is an ancestor of `master`, 89 commits behind and 0 ahead; do not merge it.
- At the reconciliation snapshot: 21 tracked unstaged modifications outside `design/program/**`,
  plus the 6 program-doc edits in this pass; 0 staged paths and 0 untracked paths.

## Dominant clusters

| Residual cluster | Tracked | Current interpretation |
|---|---:|---|
| Root `README.md` | 1 | Concurrent repository-orientation cleanup. |
| `design/depth-program/**` | 7 | Concurrent Depth plan/rule cleanup; not part of this status reconciliation. |
| `design/graphics-sprints/**` | 3 | Concurrent graphics orchestration/rule cleanup. |
| `design/spec3/**` | 2 | Concurrent F6/F7 plan cleanup. |
| `scripts/**` + `tools/**` | 4 | Exporter/manifest-check and asset-generation/exporter work; preserve owning lane. |
| `src/ui/hud.js` | 1 | Active HUD WIP; protected lead-owned seam. |
| `test/**` | 3 | Alpha-evidence, objective-navigation, and exporter-state contract WIP paired with other lanes. |

## High-risk paths

Do not bulk-stage or automatically resolve:

- `test/47a.telemetry.expected.json`
- `test/47a.telemetry.v3.expected.json`
- `test/47a.inputs.json`
- `src/systems/input.js`
- protected station UI files
- release GLBs/manifests and active asset-source trees
- asset lock/build/previous directories

Any telemetry-golden change needs a separately named re-record decision. Station UI must retain its
restored last-known-good presentation. Assets/render paths require active-lane coordination.

## Recoverability truth

- `850c80f3` is a broad local recovery checkpoint containing the July-14 Depth package aliases,
  scripts, systems, data, tests, UI work, asset sources/candidates, tools, and high-risk files.
- `850c80f3` was present on `origin/master`; `50bd5505` was a local-only follow-up test-contract
  cleanup at the snapshot. Verify current upstream state rather than assuming it remains one commit behind.
- The last recorded Depth aggregate green predates the checkpoint. It has not been rerun at
  `50bd5505`; committed implementation is recoverable, but current focused-green status is unproven.
- All `.devshots/depth-program/**` evidence remains ignored; a fresh worktree or clone receives none
  of it unless durable manifests/media are added deliberately.
- Telemetry goldens and other high-risk paths were included in the bulk checkpoint. Their presence
  in a commit is not a reviewed re-record decision or acceptance verdict.

## Required classification fields

Every residual dirty path or coherent checkpoint subsystem should receive:

| Field | Values/examples |
|---|---|
| Owner/lane | lead, Depth data, Depth UI, asset, render/perf, generated docs |
| Nature | implementation, test, source asset, generated output, evidence, cache/temp |
| Maturity | coherent, partial, duplicate, superseded, unknown |
| Runtime reachability | default, tool-only, unwired, source-only |
| Verification | exact command/evidence or “not yet verified” |
| Intended disposition | commit batch ID, preserve outside git, regenerate, or deliberately remove after review |

## Checkpoint follow-up review units

The bulk checkpoint already exists. These are audit units, not permission to rewrite or re-stage it:

1. **CHECKPOINT-IDENTITY** — keep `850c80f3`/`50bd5505`, local/upstream identity, and residual-tree
   counts explicit until upstream synchronization is actually verified.
2. **DEPTH-REVALIDATION** — rerun the aggregate and focused bad-fixture matrices from current HEAD;
   preserve 0/31 DONE until natural routes and evidence pass.
3. **HIGH-RISK-REVIEW** — review input, telemetry goldens, station/HUD, render, exporter, and release
   asset changes under their owners. Do not infer approval from checkpoint inclusion.
4. **EVIDENCE-DURABILITY** — promote only reviewed manifests/media needed by a clean checkout;
   `.devshots` remains ignored by default.
5. **RESIDUAL-WIP** — keep the current Depth/spec/exporter/HUD/test edits in their active lanes and
   commit them only as coherent verified follow-ups.

## Re-run inventory

Use NUL-safe status parsing; filenames may contain spaces:

```powershell
git branch --show-current
git rev-parse HEAD
git rev-parse origin/master
git rev-list --left-right --count HEAD...origin/master
git diff --cached --quiet
git status --porcelain=v1 -z --untracked-files=all
git diff --name-status
git ls-files --others --exclude-standard
```

Update this document after every integration batch. Never replace the live inventory with an old
chat count.
