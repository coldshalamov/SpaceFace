<!-- LIFETIME: VOLATILE -->
# Worktree and Integration Inventory

```yaml
refreshed: 2026-08-09
baseCommit: 8b7b1d3b26181fdc38325a63f5e9d85574bf321b
expiresAfterCommits: 10
expiresAfterDays: 2
```

This snapshot is historical. Current leftover `C:\sf-agents` copies and unused
models are harvested through [`ORPHAN_HARVEST_PLAYBOOK.md`](./ORPHAN_HARVEST_PLAYBOOK.md)
and [`ORPHAN_HARVEST_LEDGER.md`](./ORPHAN_HARVEST_LEDGER.md), not this table.

## Live shared-tree snapshot — 2026-08-09

At reconciliation, `master`, `HEAD`, and `origin/master` are
`8b7b1d3b26181fdc38325a63f5e9d85574bf321b`; the index is empty and no `index.lock` exists. The
latest disjoint commit updates the canonical graphics G0-2 result and remaining ROI work; it does not
touch the still-uncommitted program/status paths below.

The main checkout contains these foreign, uncommitted groups in addition to this exact documentation
transaction. Their exact dirty hunks remain protected until explicit handoff/integration, but they
are not durable task status, subsystem ownership, or a reason to stop disjoint work:

| Dirty group | Current truth | Plain next action |
|---|---|---|
| 100 paths under `assets/ships/m5_claim_outposts/` plus one focused test and three tools | PQ-019 receiver Phase A candidate; whole-asset review is G1/G2/G4 `REVISE`, so it is not ready for promotion. | Revise the candidate until it earns exact-source KEEP or discard it explicitly; then handle Phase B promotion and Phase C runtime release as separate tasks. |
| `--class/` | Untracked receiver-validator output/spill. | The receiver task classifies and either retains or removes it in its terminal handoff. |

There are nine registered worktrees because older agents created isolated copies. This inventory does
not recommend creating more. Counts are a volatile snapshot and do not grant ownership:

| Worktree | Dirty entries | Disposition |
|---|---:|---|
| primary checkout | use current `git status --short` | Canonical shared checkout; includes the reconciliation and foreign groups above. |
| `C:\sf-agents\bespoke-faction-a-list` | 6 | Unfinished candidate; audit to KEEP/DROP as one explicit task. |
| `C:\sf-agents\kestrel-a-list-i01` | 0 | Clean recovery reference; integrate/archive decision still needs an explicit task. |
| `C:\sf-agents\receiver-a-list` | 119 | Receiver candidate copy; reconcile against the primary Phase A candidate. |
| `C:\sf-agents\receiver-a-list-lf` | 128 | Receiver candidate copy; reconcile against the primary Phase A candidate. |
| `C:\sf-agents\sector-law-ui-a-list` | 2 | Unfinished UI candidate; reduce to a current-base KEEP/DROP task. |
| `C:\sf-agents\shield-r3-integration` | 12 | Unfinished VFX candidate; reconstruct or drop against current owners. |
| `C:\sf-agents\station-ledger-a-list` | 2 | Unfinished UI candidate; integrate or drop with current evidence. |
| `C:\sf-agents\vfx-damage-audit` | 12 | Unfinished VFX/audit candidate; reconcile into one explicit result. |
| `C:\sf-agents\fable-causal-chain` | active | 2026-08-10 fable delegation campaign: PQ-045.causal-chain candidate + fix pass (branch `fable/pq045-causal-chain`); integrated then removed by the campaign controller when done. |
| `C:\sf-agents\fable-orm-repack` | active | 2026-08-10 fable delegation campaign: hull ORM repack (integrated to master as `ebebc2d2`), now recycled as branch `fable/kestrel-repack`; removed by controller when done. |
| `C:\sf-agents\fable-receipts-cov` | active | 2026-08-10 fable delegation campaign: asset-receipts coverage extension (branch `fable/receipts-coverage`); removed by controller when done. |

Default concurrent work stays in the primary checkout. Threads reserve an exact file only during the
short patch operation, reread before changing shared files, and release immediately afterward. The
thread finishing a result briefly serializes only staging/commit/push. Existing worktrees are tracked recovery obligations,
not a concurrency strategy; use [`WORKTREE_RECOVERY.md`](./WORKTREE_RECOVERY.md) to integrate or
remove them deliberately after their useful work is accounted for.

The July snapshots below are retained as history and are not current dispatch or collision truth.

## Recovery refresh — 2026-07-30

The registered worktree count is 25. Master is clean at `b157f715`. Twenty-three worktrees have zero
tracked changes. Two protected foreign candidates remain tracked-dirty and were not inspected beyond
status counts:

| Worktree | Branch | Tracked changes | Disposition |
|---|---|---:|---|
| `C:\Users\93rob\sf-perf-modernization-20260726` | `claude/perf-modernization-20260726` | 19 | Protected old performance candidate; do not clean, merge, or classify here. |
| `C:\Users\93rob\sf-perf01a` | `codex/perf-01a-background-lifecycle` | 9 | Protected lifecycle candidate; focused accepted concepts are already on master, but its working diff remains foreign. |

Most clean worktree refs are fully merged or old/superseded checkpoints. Four clean branches retain
unique commits and must remain recoverable. The only one admitted for immediate review is
`claude/perf00-20260727`: its clean tip `dce03987` is ten commits ahead and 32 commits behind master.
`PQ-034.candidate-audit` owns a commit-by-commit selective review; no wholesale merge.

No worktree or branch is removed by the recovery transaction. The July 24 snapshot below is retained
as labeled history and is not current dispatch authority; use `NOW.md` plus
`program-dispatch.mjs --ready`.

**Current integration snapshot:** 2026-07-24 after PQ-007's focused-green integration at `4d00867e`.
PQ-017 is integrated at `2a9517d8`. PQ-007's former pursuit-slot acceptance is revoked; its
user-directed auto-target/draw-to-fly correction is commit-bound, with current browser/Electron
route acceptance still open. A second registered worktree, `C:\Users\93rob\sf-perf01a`, contains independent occupied
background-lifecycle/performance work. The reviewed planning portfolio is present on `master`; narrative,
Lark, and VP-220 candidates are preserved by recovery refs and remain unintegrated. The readable HUD
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

## Current integration checkpoint — 2026-07-24

| Worktree | Branch/tip | Live disposition |
|---|---|---|
| `C:\Users\93rob\Documents\GitHub\SpaceFace` | `master` / PQ-007 result `4d00867e` + protected visual-asset WIP | Product authority; control correction integrated. Preserve the active visual-asset lane and all unrelated dirty work. |
| `C:\Users\93rob\sf-perf01a` | `codex/perf-01a-background-lifecycle` / `8610102d` + WIP | Occupied isolated performance/lifecycle lane; package/launch mutexes are not free. |

The eight ChatGPT portfolio branches each contain one reviewed historical handoff (the performance
branch contains a two-commit correction chain). Their content is preserved under
`docs/handoffs/chatgpt-portfolio-20260723/`; this is reference integration, not packet integration or
route acceptance. The separate async-canary branch remains a transport demonstration and is not
needed for product planning.

Recovery dispositions:

- `codex/recovery-worldbuilding-20260723` preserves the 47-file narrative/worldbuilding candidate at
  `9e4b7d7b`; it is not on `master`.
- `recovery/lark-graphics-remaster-20260723` preserves the Lark candidate at `d538a583`; its branch
  remains `agent/gfx-production-remaster-lark`.
- `recovery/vp220-propulsion-20260723` preserves VP-220 at `74775bf8`; its branch remains
  `codex/vp220-propulsion-graphics`.
- `C:\Users\93rob\.codex\recovery\spaceface-primary-20260723` contains the 592-file untracked
  media/research/tool archive (231,162,483 bytes).
- The reconciliation branch was fast-forwarded to `master` and deleted. Its physical worktree and
  both candidate worktrees were removed. An empty inaccessible temp leaf may be left by Windows
  after Git unregisters a worktree; it contains no repository files and is not a Git worktree.

This recovery checkpoint deliberately stops short of an automated headed-validation campaign. The
next acceptance step is a user playtest from clean `master`; failures found there should become
bounded repair tasks rather than restarting a broad harness loop.

## Current integration checkpoint — 2026-07-21 (graphics/program closeout)

- Primary branch: `master`; current HEAD `54548e09`; working tree clean at the recorded checkpoint.
- PQ-001..PQ-016 are integrated. PQ-017 is the next canonical queue item.
- HUD commit `ea698805` and Helios civilian promotion `54548e09` are on the public browser/Electron
  route. Focused and route checks are listed in `08_GRAPHICS_OVERHAUL_CHECKPOINT.md`.
- The `SpaceFace-graphics-overhaul` worktree and `codex/graphics-overhaul` branch are removed. Exact
  committed tip `cab2d122` remains under `archive/graphics-overhaul-donor-20260721`. The external
  dirty-payload tarball was deleted in the 2026-08-17 archives closeout.

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
6. **RESIDUAL-WIP** — physical Git worktree cleanup is complete. The 2026-08-17 closeout deleted
   the external `SpaceFace-archives` parking lot (rejected Ashline scratch + mixed graphics
   harvest). Use `09_DONOR_VALUE_LEDGER.md` and
   `roadmap/receipts/SPACEFACE-ARCHIVES-2026-08-17-REPORT.md` rather than recreating those
   folders. Git tags still keep the committed donor tips.

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
