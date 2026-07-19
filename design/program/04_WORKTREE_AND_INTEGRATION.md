# Worktree and Integration Inventory

**Current integration snapshot:** 2026-07-19 after combined merge `b235f062`. The older
July-14 repository tables remain below as labeled history. Re-run the commands at the end before
acting: donor worktrees can move after this document is written. Use [`NOW.md`](./NOW.md) for volatile ownership and
[`09_DONOR_VALUE_LEDGER.md`](./09_DONOR_VALUE_LEDGER.md) for donor disposition.

## Current integration checkpoint — 2026-07-19

- Primary branch: `master` at combined merge `b235f062`.
- Graphics closeout: clean at `8e860439`; all commits are ancestors of `b235f062`.
- Earlier unified checkpoint: performance `1bdde6c8`, graphics `e3ad1caf`, and paused Claude
  `1905cac8` were synthesized at `a752702b`, promoted as `ee9e0ab3`, and hardened through
  `f0b3b154`. Their accepted changes remain ancestors of current `master`.
- Later graphics closeout: `bd79f2ba`, `5219491d`, `98e1e429`, `1de8a861`, and `5863331c` are
  promoted by `cbdf1589`. These changes are now `master` implementation, not donor-only work.
- Performance closure: clean final tip `99cad5b5`; its unique changes were reviewed, replayed, and
  merged at `b235f062` while patch-equivalent duplicates were skipped.
- Primary diagnostics: the Atlas/camera transaction is committed at `21d82428`. Only quarantined
  untracked `design/program/_review/` remains and was never opened or staged.
- No remaining donor is authoritative over `master`. Whole-branch merges are rejected for the
  Depth, Kimi, Helios, and graphics-overhaul donors; use the selective disposition ledger.

### Registered worktrees at this snapshot

| Worktree | Tip | Disposition |
|---|---|---|
| `SpaceFace` | `b235f062` (`master`) | Product authority; preserve quarantined review material. |
| `SpaceFace-graphics-closeout` | `8e860439` | Fully merged; removable after reviewed docs and route evidence are promoted. |
| `SpaceFace-performance-closure` | `99cad5b5` | Fully synthesized; removable after final combined route proof and recovery confirmation. |
| `SpaceFace-graphics-overhaul` | `cab2d122` | Retain; substantial dirty Blender/source assets still need asset-by-asset disposition. |
| `SpaceFace-oc-helios-golden` | `4c367cd7` | Full replacement rejected; preserve only until the batching concept and rejection receipts are durably recorded. |
| `SpaceFace-depth-actualization` | `bf1dfce2` | Never whole-merge; selective product donor only. |
| `SpaceFace-orch-codex-gt-sample` | `f3e49b4f` | Product history superseded by Depth donor; remove after ledger confirmation. |
| `SpaceFace-orch-codex-helix` | `6475e2ef` | Unique faction edit rejected; remove after ledger confirmation. |
| `SpaceFace-orch-codex-natural` | `de5397bc` | Product history superseded by Depth donor; remove after ledger confirmation. |
| `SpaceFace-orch-codex-recovery` | `de5397bc` | Product history superseded by Depth donor; remove after ledger confirmation. |
| `SpaceFace-orch-kimi-v2-present` | `de5397bc` | Selective station presentation donor; never whole-merge. |

Current graphics continuation and proof boundaries are recorded in
[`08_GRAPHICS_OVERHAUL_CHECKPOINT.md`](./08_GRAPHICS_OVERHAUL_CHECKPOINT.md).

## Historical repository checkpoint — 2026-07-14

- Branch: `master`.
- Snapshot local HEAD: `50bd550579338c6a62cf50be06354093f0bee52f`.
- Snapshot upstream `origin/master`: `850c80f30ac52646aaed5602efbb096bc7b77f50`.
- At that snapshot local HEAD was 1 commit ahead and 0 behind. Verify current synchronization; do not
  repeat this historical count as live status.
- `codex/depth-program` is an ancestor of `master`, 89 commits behind and 0 ahead; do not merge it.
- At the reconciliation snapshot: 21 tracked unstaged modifications outside `design/program/**`,
  plus the 6 program-doc edits in this pass; 0 staged paths and 0 untracked paths.

## Historical dominant clusters — 2026-07-14

| Residual cluster | Tracked | Current interpretation |
|---|---:|---|
| Root `README.md` | 1 | Concurrent repository-orientation cleanup. |
| `design/depth-program/**` | 7 | Concurrent Depth plan/rule cleanup; not part of this status reconciliation. |
| `design/graphics-sprints/**` | 3 | Concurrent graphics orchestration/rule cleanup. |
| `design/spec3/**` | 2 | Concurrent F6/F7 plan cleanup. |
| `scripts/**` + `tools/**` | 4 | Exporter/manifest-check and asset-generation/exporter work; preserve owning lane. |
| `src/ui/hud.js` | 1 | Active HUD WIP; protected lead-owned seam. |
| `test/**` | 3 | Alpha-evidence, objective-navigation, and exporter-state contract WIP paired with other lanes. |

## Persistent high-risk paths

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

## Historical recoverability truth

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

## Current checkpoint follow-up review units

The bulk checkpoint already exists. These are audit units, not permission to rewrite or re-stage it:

1. **CHECKPOINT-IDENTITY** — keep `b235f062`, donor tips, quarantined paths, and registered worktree
   inventory explicit until the final route evidence is promoted.
2. **DEPTH-REVALIDATION** — never whole-merge `bf1dfce2`; port only the selected product slices in
   the donor ledger, then rerun aggregate and focused bad-fixture matrices from current HEAD;
   preserve 0/31 DONE until natural routes and evidence pass.
3. **HIGH-RISK-REVIEW** — review input, telemetry goldens, station/HUD, render, exporter, and release
   asset changes under their owners. Do not infer approval from checkpoint inclusion.
4. **EVIDENCE-DURABILITY** — promote only reviewed manifests/media needed by a clean checkout;
   `.devshots` remains ignored by default.
5. **PERFORMANCE-SYNTHESIS** — complete at `b235f062`; 167/167 performance-modified tests and 49/49
   graphics/PBR/VFX tests pass on the synthesized tree. Headed acceptance remains a separate gate.
6. **RESIDUAL-WIP** — use `09_DONOR_VALUE_LEDGER.md`; remove physical worktrees only after every
   valuable dirty/untracked product path is promoted, retained by branch/tag, or deliberately rejected.

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
