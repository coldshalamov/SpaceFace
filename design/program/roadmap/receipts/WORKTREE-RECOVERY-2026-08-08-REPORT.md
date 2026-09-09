# WORKTREE-RECOVERY-2026-08-08 report

**Outcome:** terminal disposition reached for all 13 harvested `_recovery/worktree-triage/by-source`
folders. One runtime behavior was adapted and shipped, one stopped visual redesign was preserved as a
new-identity donor, the remaining harvested code/assets are integrated, superseded, rejected, or
derived. The ignored harvest may be deleted after this report and its authority/catalog updates are
committed and pushed.

This report supersedes the local per-source decision files. It does not claim that every future asset
or story adaptation is complete.

## Current authority and coordination

- Audit base: `master` through `7c28e765`.
- Registered worktrees: primary checkout only.
- “Occupied” meant an exact dirty path plus a confirmed live writer. The six concurrent
  render-package/parts-library paths were excluded; no broader renderer or graphics lane was treated
  as blocked.
- The active flight task confirmed ownership of only
  `scripts/probe-authored-assets-live.mjs`, `src/render/partsLibrary.js`,
  `src/render/renderPackageLoader.js`, `test/authored-live-probe-contract.test.mjs`,
  `test/render-package-loader.test.mjs`, and `test/render-package-pilots.test.mjs`.
- The active presentation/VFX and professional-recovery tasks confirmed disjoint write sets and
  yielded the recovery docs, catalog metadata, and donor path to this transaction.

## Product work retained now

1. Commit `1e5032af` ports the only missing PQ-018 runtime behavior: an inactive world-site component
   now emits exact `beam:denied` feedback instead of silently returning. The focused world-site suite
   passed 4/4.
2. Commit `7c28e765` preserves the stopped-Lark iter15 editable Blend and iter19 source GLB, with exact
   hashes and provenance, under
   `assets/ships/massline_express_liner_v1/reference/stopped_lark_iter19/`. It is a never-runtime donor
   for a separate express-liner identity and cannot replace the accepted courier Lark.
3. Earlier recovery value remains on master: render-package/performance work at `1bb3730e` and
   `d4453037`; non-authoritative worldbuilding drafts at `7fa373c8`; and VP-220 selective integration
   through `2feedc58` and `cdcbac32`.

## Thirteen harvested sources

| Source folder | Final disposition | Current-master evidence / retained value |
|---|---|---|
| `sf-claude-20260725` | `PORT` complete | Its dependency-blocked denial behavior was reimplemented against current owners and shipped at `1e5032af`; the remaining branch content is safe to delete. |
| `sf-ctl-a` | `DROP` | Self-described superseded Phase-2 candidate; current world-site owners and tests are richer. |
| `sf-delegation-base-20260724` | `DROP` | Duplicate PQ-018 control-plane base; the retained cluster outcome is already on master at `1e5032af`. |
| `sf-grok-perf-hitch-20260804` | `DROP` complete | Patch-equivalent on master; its worktree/branch were already removed. |
| `sf-l22` | `DROP` complete | Tip was an ancestor of master; its worktree/branch were already removed. |
| `sf-perf-admission-20260726` | `DROP` | Nine of ten commits are patch-equivalent. The unique 7,106-line cost-table harness is superseded by current PERF-00/PQ-034 Browser/Electron authority, schema-v3 acceptance, exact matrices, and 179/179 contract evidence; retain lessons, not code. |
| `sf-perf-modernization-20260726` | `DROP` | Branch is an ancestor; all valuable harvested runtime/compiler paths exist in the richer current render-package pipeline. |
| `sf-perf-rescue-01` | `PORT` complete | Shipped as `1bb3730e` and `d4453037`; worktree/branch already removed. |
| `sf-perf01a` | `DROP` | Its stale lifecycle monolith is superseded by split simulation/presentation runners and current PQ-035 shell authority. One focused current-master lifecycle run passed 37/37. |
| `sf-pq018-admission-base` | `DROP` | Duplicate cluster state; current admission/world-site implementation is authoritative and the retained denial outcome is at `1e5032af`. |
| `sf-pq018-baseline-557903d` | `DROP` | Its Cathedral GLB is not alternate art: recovered copies share one hash and differ from current release by only eight rebuild-metadata bytes. |
| `sf-pq018-review-20260725` | `DROP` | Old planner/MMB and standalone-route scripts are explicitly rejected by current PQ-018 authority; current route proof is folded into downstream packets. |
| `wf_8191e805-f47-1` | `DROP` | Shadow-camera optimization is integrated and the current regression is richer than the branch test. |

The five PQ-018 exports contained 207 repeated entries but only 60 unique paths, including 24 shared
control-plane paths. They were one bounded synthesis, not five projects. Their three recovered
Cathedral GLBs were byte-identical to each other and are not visual alternatives.

## Additional exact refs

| Ref | Disposition |
|---|---|
| `agent/gfx-production-remaster-lark` + tag `recovery/lark-graphics-remaster-20260723` | `ADAPT` complete at `7c28e765`; historical refs may be deleted. |
| `codex/delegation-base-pq018-admission-20260724` | Duplicate alias of the PQ-018 baseline; `DROP`. |
| `codex/recovery-worldbuilding-20260723` | Branch-only drafts already imported as explicitly non-authoritative references at `7fa373c8`; `DROP` branch. |
| `codex/vp220-propulsion-graphics` + tag `recovery/vp220-propulsion-20260723` | Selectively integrated with newer tuning retained; `DROP` historical refs. |
| `integrate/20260728h` | Patch-equivalent to the `integrate/20260728h2` line already in master; `DROP` both local refs. |

No remote ref deletion and no aggressive object pruning are authorized or required by this report.

### Exact local deletion ledger

Delete a ref only when it still resolves to the expected object below. A missing ref is already
terminal; a different object is a new state and must be re-audited rather than force-deleted.

| Exact local ref | Expected object before deletion | Disposition basis |
|---|---|---|
| `refs/heads/agent/gfx-production-remaster-lark` | `d538a583b673c61051e305963254f6de83d871d0` | Unique donor bytes/provenance committed and pushed at `7c28e765`. |
| `refs/tags/recovery/lark-graphics-remaster-20260723` | `d538a583b673c61051e305963254f6de83d871d0` | Same stopped-Lark history; no longer a production dependency. |
| `refs/heads/archive/worktree-sf-pq018-baseline-557903d` | `557903d7340683ca9e1bbf3d4ad20b3a28569237` | PQ-018 cluster baseline; retained behavior is at `1e5032af`. |
| `refs/heads/claude/perf00-20260727` | `dce03987dcf070bab3889494a691cc3893a79b81` | Old harness superseded by current PERF-00/PQ-034 authority. |
| `refs/heads/claude/perf-modernization-20260726` | `7f7d030b41140f14a522f43b977f839069cc4a55` | Ancestor/integrated; harvested work superseded. |
| `refs/heads/claude/pq018-phase2-worldsite-20260726` | `3c632e6da4325c0457017685679da82e74fb6144` | Explicitly superseded Phase-2 candidate. |
| `refs/heads/claude/pq018-rebase-20260725` | `fd68fadbd0f7653c1e815f3f930d4e2ebcdd4289` | PQ-018 cluster; retained behavior is at `1e5032af`. |
| `refs/heads/codex/delegation-base-20260724` | `062691813ce412bbba711c59950fa4dcc6a02c92` | Duplicate stale control-plane base. |
| `refs/heads/codex/delegation-base-pq018-admission-20260724` | `557903d7340683ca9e1bbf3d4ad20b3a28569237` | Alias of the PQ-018 baseline. |
| `refs/heads/codex/perf-01a-background-lifecycle` | `8610102d89a4c122e088205eb46739590c6a477e` | Ancestor; current PQ-035 lifecycle authority is richer. |
| `refs/heads/codex/pq018-controller-implementation-20260724` | `3cb3aa86ba9c7b43e8221f8935e0bcb456744c38` | PQ-018 cluster; current world-site owners are authoritative. |
| `refs/heads/codex/pq018-integration-review-20260725` | `136cba9828c02fc5f0f17c89be78d0626190ef20` | Stale standalone-route/review line rejected by current PQ-018. |
| `refs/heads/codex/recovery-worldbuilding-20260723` | `9e4b7d7b908d89b43869adb7feb24b6d1d74271d` | Branch-only drafts preserved on master as non-authoritative references. |
| `refs/heads/codex/vp220-propulsion-graphics` | `74775bf8523fd28d46c06262ad2ddc39fcdc1c4d` | Selectively integrated with newer tuning retained. |
| `refs/tags/recovery/vp220-propulsion-20260723` | `74775bf8523fd28d46c06262ad2ddc39fcdc1c4d` | Same VP-220 source; receipt/current commits retain the useful result. |
| `refs/heads/integrate/20260728h` | `508ec0ebb8a18d1000b997496051aa01793d066c` | Patch-equivalent stale integration delta. |
| `refs/heads/integrate/20260728h2` | `645dd554172b209909be567a4a80e02083f13c51` | Ancestor of master; retained only as the equivalent helper line. |
| `refs/heads/worktree-wf_8191e805-f47-1` | `e3854b65d066a9711d2fd4b39698756c9f6f0401` | Optimization integrated; current regression is richer. |

## Large retained work

| Stable route | Size | Executable outcome |
|---|---:|---|
| `GFX-MASSLINE-EXPRESS-LINER` | `XL`, roughly 4-8 focused artist-engineer days plus independent review | Give the tracked donor a new express-only identity: fiction/supported views; passenger/cargo/drive/dock/service/tether construction; fresh DCC/UV/bakes/material zones; LOD0/1/2; source/release/manifests/render package; `partsLibrary.js` express maps after its current writer releases; Browser/Electron spawn/label/route/trade/dock/tether/save evidence; representative performance; exact-hash G7. Never replace accepted Lark or fold it into the Massline presentation showcase. |
| `REC-GROK-KES-SALVAGE` | `XL`, 1-3 working days for safe source classification; any selected reauthor is a separate asset packet | Audit the corrupt independent Grok clone with a hash ledger over Blender/GLB/evidence families, compare to current Kestrel/current candidates, inspect only genuinely distinct results, preserve named non-runtime donors with provenance, then delete the exact clone. Do not attempt a normal merge from its incomplete object store. |
| `PQ-018.cathedral-reauthor` | Existing multi-day active packet, not recovery work | Continue the current Blender/source/release rebuild and exact Browser/Electron/causal visual review. Do not resurrect recovered GLBs or a standalone PQ-018 broker harness. |
| `WB-LORE-SURFACING` | Existing M5 future route | Reconcile/surface the 23 imported non-authoritative drafts only through gameplay carriers; branch deletion does not lose the inputs or authorize canon replacement. |

## Preserved corrupt-clone exception

`C:\Users\93rob\.grok\worktrees\github-spaceface\subagent-019f50fb-0f1e-7a41-84dc-20c752d5c041`
is not a registered worktree. It is an independent incomplete clone with unresolved HEAD, empty normal
head refs, missing referenced objects, and 4,046 index rows. A bounded audit found duplicated
modified/deleted records covering 237 unique targeted Kestrel/asset paths. Because Git cannot prove
equivalence and some Blender/build evidence differs, the directory remains read-only until
`REC-GROK-KES-SALVAGE` completes.

This is the sole preserved local recovery exception; it is not evidence of a live writer or a reason
to stop disjoint work.

## Verification already spent

- `node --test test/world-site-interactions.test.mjs`: 4/4 pass at the mining adaptation.
- `node --test test/electron-shell-lifecycle.test.mjs test/loop-lifecycle.test.mjs test/performance-lifecycle-contracts.test.mjs test/performance-lifecycle-manifests.test.mjs`: 37/37 pass; not rerun unchanged.
- Donor SHA-256 and Git-blob verification matched the historical source exactly before `7c28e765`.
- `node tools/art/build_visual_asset_catalog.mjs` and
  `node --test test/visual-asset-catalog.test.mjs`: deterministic catalog generation PASS and 4/4.
- `node scripts/check-program-docs.mjs` was spent once and retained its pre-existing 12-error
  fingerprint: `NOW.md` stale by 229 commits; missing required packet sections / deferred-retirement
  errors for PQ-032 and PQ-033; integrated PQ-037 awaiting retirement. It named no recovery-owned
  document. The unchanged failure is not rerun and is not represented as a green recovery gate.
- No broad or headed rerun is required for the recovery disposition.

## Cleanup receipt

Completed on 2026-08-08 after authority commit `c4908e2f` became reachable from
`origin/master` through `bc314b7c`:

- deleted all 18 exact local branches/tags in the object-pinned ledger with an expected-object guard;
  verification found zero remaining ledger refs;
- resolved and deleted only `C:\Users\93rob\Documents\GitHub\SpaceFace\_recovery`: 347 files,
  28,589,779 bytes, zero reparse points, and no path remaining afterward;
- verified the primary checkout is still the only registered worktree;
- preserved the corrupt independent Grok clone at
  `C:\Users\93rob\.grok\worktrees\github-spaceface\subagent-019f50fb-0f1e-7a41-84dc-20c752d5c041`
  for `REC-GROK-KES-SALVAGE`;
- did not delete remote refs, run garbage collection, touch the Git object database, or stage any
  concurrent writer's files.
