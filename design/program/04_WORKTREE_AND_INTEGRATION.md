# Worktree and Integration Inventory

**Current integration snapshot:** 2026-07-23 at `master` HEAD `bf558142`. PQ-017 is integrated at
`2a9517d8`, its closeout/docs transaction is `bf558142`, and PQ-018 is next. Four worktrees are
registered: the dirty primary checkout, a clean protected Lark donor, a dirty VP-220 candidate, and
the clean `codex/integration-checkpoint-20260723` reconciliation checkout. The readable HUD
(`ea698805`) and reviewed Helios civilian family (`54548e09`) are integrated; the former mixed
graphics donor is tagged, hash-archived, and physically removed. The
earlier combined merge `b235f062`, evidence hardening through `280cafb0`, propulsion repair
`59f91d19`, geology truth `e8838e2c`, Electron RCS evidence repair `3d2dc765`, and the PQ-001..PQ-010
batch (`2bc3042f`..`b28d183b`) are all ancestors. This closeout adds the PQ-014 NPC-job kernel, the
PQ-018 Wreck Cathedral source candidate, the PQ-022 place_station_military route-accepted subslice,
the untracked-batch classification, and donor worktree cleanup. The older July-14 repository tables
remain below as labeled history. Re-run the commands at the end before acting: donor worktrees can
move after this document is written. Use [`NOW.md`](./NOW.md) for volatile ownership and
[`09_DONOR_VALUE_LEDGER.md`](./09_DONOR_VALUE_LEDGER.md) for donor disposition.

## Current integration checkpoint — 2026-07-23

| Worktree | Branch/tip | Live disposition |
|---|---|---|
| `C:\Users\93rob\Documents\GitHub\SpaceFace` | `master` / `bf558142` | Product authority. Dirty with protected worldbuilding/story/runtime work and 592 untracked paths, including about 229 MB of generated `media/**`; do not use it as an integration checkout. |
| `C:\Users\93rob\AppData\Local\Temp\grok-goal-8066f05c8cef\worktree-gfx-remaster` | `agent/gfx-production-remaster-lark` / `d538a583` | Clean, 16 commits ahead and three behind `master`; ownership not released; review and selectively port, never whole-merge or remove opportunistically. |
| `C:\Users\93rob\sf-vp220` | `codex/vp220-propulsion-graphics` / base `8f1c630f` | 23-path uncommitted propulsion plus acceptance-harness candidate; safe checks reported green, headed visual acceptance absent; preserve and review before checkpointing. |
| `C:\Users\93rob\sf-checkpoint-20260723` | `codex/integration-checkpoint-20260723` / based on `bf558142` | Isolated reconciliation checkout. Integrates only the reviewed asynchronous handoffs and this inventory transaction; it does not absorb foreign dirty work. |

The eight ChatGPT portfolio branches each contain one reviewed historical handoff (the performance
branch contains a two-commit correction chain). Their content is preserved under
`docs/handoffs/chatgpt-portfolio-20260723/`; this is reference integration, not packet integration or
route acceptance. The separate async-canary branch remains a transport demonstration and is not
needed for product planning.

No `blender.exe`, Electron route, asset builder, Git lock, or release/export lock was active during
the audit. Two Blender MCP server processes were connected, which is not itself a GPU/render lease.
Recheck processes and locks before any headed acceptance or asset build.

### Cleanup gates

1. Merge the isolated checkpoint only after link/diff validation.
2. Keep Lark registered until its owner hands off and its 16-commit delta receives source, route,
   visual, manifest, and overlap review.
3. Make VP-220 recoverable on its own branch only after reviewing the entire dirty diff; visual
   acceptance remains a separate later transition.
4. Split the primary worldbuilding/source changes from generated media. Require provenance,
   licensing, manifest, duplicate, and visual review before committing large media.
5. Remove a worktree or branch only after its exact tip is integrated or preserved by a named
   recovery ref/archive and its checkout is clean. Never delete the dirty primary or VP-220 trees.

## Current integration checkpoint — 2026-07-21 (graphics/program closeout)

- Primary branch: `master`; current HEAD `54548e09`; working tree clean at the recorded checkpoint.
- PQ-001..PQ-016 are integrated. PQ-017 is the next canonical queue item.
- HUD commit `ea698805` and Helios civilian promotion `54548e09` are on the public browser/Electron
  route. Focused and route checks are listed in `08_GRAPHICS_OVERHAUL_CHECKPOINT.md`.
- The `SpaceFace-graphics-overhaul` worktree and `codex/graphics-overhaul` branch are removed. Exact
  committed tip `cab2d122` remains under `archive/graphics-overhaul-donor-20260721`; its complete dirty
  payload remains in the external SHA-256 archive recorded in `09_DONOR_VALUE_LEDGER.md`.

## Historical integration checkpoint — 2026-07-20

- Primary branch: `master`; current HEAD `eb8ed839`. The full closeout commit chain
  (`d6d5278c`..`eb8ed839`) is on master: PQ-014 kernel + r2 fixes + receipt; PQ-018 source + 3
  handoff commits; PQ-022 station remaster; canon/tooling preservation; archive manifest.
- Graphics closeout: all commits are ancestors of `b235f062`; its physical worktree is removed.
- Earlier unified checkpoint: performance `1bdde6c8`, graphics `e3ad1caf`, and paused Claude
  `1905cac8` were synthesized at `a752702b`, promoted as `ee9e0ab3`, and hardened through
  `f0b3b154`. Their accepted changes remain ancestors of current `master`.
- Later graphics closeout: `bd79f2ba`, `5219491d`, `98e1e429`, `1de8a861`, and `5863331c` are
  promoted by `cbdf1589`. These changes are now `master` implementation, not donor-only work.
- Performance closure: `99cad5b5` is merged at `b235f062`; literal-target, exact-worktree,
  three-run, and residency-evidence hardening are on `master` through `280cafb0`. The later
  `04805924..9d626fd8` pool/BatchedMesh range was measured and rejected; its clean physical worktree is
  removed and exact tip `9d626fd8` is preserved by annotated tag
  `archive/performance-pooling-experiment-20260720`. `1074c078` records a bounded hybrid-batching
  research hypothesis, not permission to replay any rejected implementation.
- Primary diagnostics: the Atlas/camera transaction is committed at `21d82428`. Unread
  `design/program/_review/` residue was moved outside the worktree to the recoverable archives folder.
- No remaining donor is authoritative over `master`. Whole-branch merges are rejected for the
  Depth, Kimi, Helios, and graphics-overhaul donors; use the selective disposition ledger.
- At this audit the primary tree also contains a frozen, unaccepted presentation-continuity harness
  in `scripts/check-m2-seamless-world.mjs`, `scripts/lib/presentationContinuity.mjs`, and
  `test/floating-origin-render.test.mjs`, plus separately owned staged/untracked
  `design/sequential-build-plan/**` artifacts. Preserve both groups; neither belongs in this
  graphics-ledger commit.

### Registered worktrees at this snapshot

| Worktree | Tip | Disposition |
|---|---|---|
| `SpaceFace` | `54548e09` | Sole product authority and sole registered worktree; PQ-001..PQ-016, HUD checkpoint, and Helios civilian family integrated. |

Removed during this closeout (history preserved by annotated recovery tags):

| Former worktree | Former branch | Recovery tag | Accepted content on master |
|---|---|---|---|
| `sf-pq014` | `codex/pq014-npc-job-kernel-20260720` | `archive/pq014-npc-job-kernel-20260720` | `d6d5278c`+`73159e05`+`fffe57db` (kernel + r2 fixes + receipt; 48/48 focused-green; runtime-unwired) |
| `sf-pq018` | `codex/pq018-wreck-cathedral-source-20260720` | `archive/pq018-wreck-cathedral-source-20260720` | `6df5a210`+`a31554fa`+`6b24baad`+`7330a85b` (Wreck Cathedral SOURCE_GLB candidate; PQ-017-dependent; not route-accepted) |
| `sf-pq022` | `codex/pq022-military-station-remaster-20260720` | `archive/pq022-military-station-remaster-20260720` | `3ea2fe99` (place_station_military remaster; Helios+Tethys route-accepted; one PQ-022 subslice) |

Removed physical worktrees retain recovery where needed: Kimi product candidates are committed at
`0e2f2e51`; Depth remains on its branch plus annotated tag
`archive/depth-player-route-actualization-20260719`, with 17 raw artifacts in the external archives
folder; rejected Helios and four superseded satellites require no product recovery.

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

1. **CHECKPOINT-IDENTITY** — keep `b235f062`, later evidence-hardening/propulsion commits,
   `e8838e2c`, `3d2dc765`, archived donor tips, and the two-worktree inventory explicit until final
   route evidence is promoted.
2. **DEPTH-REVALIDATION** — never whole-merge `bf1dfce2`; port only the selected product slices in
   the donor ledger, then rerun aggregate and focused bad-fixture matrices from current HEAD;
   preserve 0/31 DONE until natural routes and evidence pass.
3. **HIGH-RISK-REVIEW** — review input, telemetry goldens, station/HUD, render, exporter, and release
   asset changes under their owners. Do not infer approval from checkpoint inclusion.
4. **EVIDENCE-DURABILITY** — promote only reviewed manifests/media needed by a clean checkout;
   `.devshots` remains ignored by default.
5. **PERFORMANCE-SYNTHESIS** — base synthesis is complete at `b235f062`; 167/167 performance-modified
   tests and 49/49 graphics/PBR/VFX tests pass. Four live-authored-ship pooling implementations were
   investigated and rejected; strict headed acceptance remains separate evidence-gated work on
   current master. The tag preserves the rejected code while `1074c078` preserves the hybrid research
   hypothesis.
6. **RESIDUAL-WIP** — physical Git worktree cleanup is complete. The rejected Ashline scratch and
   former mixed graphics donor are preserved outside the live checkout by hash-bound archives; use
   `09_DONOR_VALUE_LEDGER.md` for recovery refs rather than recreating a donor worktree blindly.

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
