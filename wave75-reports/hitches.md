# Wave-75 audit — in-flight-hitches lane

Repo: coldshalamov/SpaceFace @ `9659573ef` (`devin/1791064509-perf-w60`, wave 74 head). Read-only audit; no code changed, no app run.

```
saturated: false
```

Legal contract-preserving wins remain — all small: the warm machinery's last unyielded registry scan, one unbounded wait gap in the deferred warm's done chain, one unsliced park sweep, and one duplicate residency re-walk. The 4 ms slicing + paced-ledger discipline holds everywhere it was checked; the residuals are block-shape leftovers, not budget violations.

## Findings (ranked)

### 1. The deferred warm's done chain bounds `pendingAttachments` at 30 s but leaves `compileObjectPipelines` + `prepareAuthoredGpuResidency` as unbounded awaited legs — a saturated admission lane holds `swarmDeferredWarm.pending` indefinitely

Evidence: `src/render/renderer.js:17570-17583` — the two legs await sequentially with no race against `settleDeadlineAt`, which covers only the attach settle (`17517-17522`) and the re-kick race (`17562-17568`); `17593-17605` (`pending:false` only after both legs + the park attempt); `16801` (the launch lane mints `warm.settleDeadlineAt`, the deferred lane mints a fresh `settleDeadlineAt` at `17514` — shared by attach + re-kick only). `10224-10248` (`compileObjectPipelines` → `admitSubjectPipelines` — verified internally paced: `compilePipelineSubject` paces per-batch via `paceQueue`/`linkBatch` at `9850-9883`); `10311-10344` (`prepareAuthoredGpuResidency` → `gpuResidencyAdmissions.prepare` → `prepareStartupGpuResidency` sliced at `ADMISSION_SLICE_TARGET_MS=3` via `createSlicedYield` — internally paced, verified per the prompt); `src/ui/screens/crucibleDraft.js:774-786` (the launch gate's own 10 s race — the only bound on this wait).

Mechanism: both legs are internally paced — no in-frame block (prompt item b: verified) — but the aggregate wait has no wall-time bound. The compile admission queues on the shared `pipelineAdmissions` lane and the residency prepare on `gpuResidencyAdmissions`; under sustained ambient backlog both drains make progress only at paced-ledger pace, so `done` can sit unresolved many seconds past the 30 s attach deadline. Consequence is bounded end-to-end but not where intended: the draft button races `warm.promise` vs 10 s so the player is never stranded — the cost lands on coverage: a wave launched past the hold pays its newcomers' exemplar links + residency uploads mid-round (the exact class this warm exists to kill), while the warm root stays mounted and unparkable (`warm.building` flips only at `17594`) with its decode leases owner-pinned.

Fix sketch: bound the wait, not the work — race the compile+residency pair against the shared `settleDeadlineAt` (already threaded through the chain). On expiry flip `state.render.swarmDeferredWarm.pending` to false so the gate reads settled, keep `warm.building` true, and let the two legs complete detached — their existing `.then` still runs park + `pending` bookkeeping. Effort: **S–M**. Magic-frame impact: **M** (rare trigger — needs a multi-second admission backlog — but when hit, the wave's newcomers compose/link/upload in-round). Risk: **M** — separating `pending` (draft gate) from `building` (mount lifetime) must not let the park sweep detach the root while the detached compile still targets it; `isRootActive` checks make a detached compile no-op cleanly, so the failure mode is wasted work, not corruption.

### 2. `_mintDeferredPaletteSubjects`' records snapshot is the last unyielded prefix — `listDecodedAuthoredParts` walks the whole decode registry inside one task, once per survival wave

Evidence: `src/render/renderer.js:17622` (`records = await listDecodedAuthoredParts(renderer, { settledOnly: true })` — a single await before the 4 ms mint loop at `17642-17675`), `src/render/assetLoader.js:1110-1135` (per-entry `await Promise.race([task, Promise.resolve(pending)])` — a microtask chain per cache entry, not browser-sliced), `assetLoader.js:151` (`runtime.assets.set(cacheKey, task)` — one entry per `url::slot`), `assetLoader.js:1155-1164` (`peekSettledAuthoredRecords` proves the settled check is available synchronously via `task.sfSettledRecord`). Same call on the launch path at `16950` (cook-side, behind the shell). The caller chain is `done`'s async continuation (`17514+`) — it runs in task boundaries while the armory/draft screen presents frames.

Mechanism (prompt item a): the scan mints two promises + a `{cacheKey, record}` literal per live decode-cache entry and awaits each in turn — the whole scan drains inside one macrotask, so its cost lands whole on whichever frame's task queue hosts it. Size bound: keys are per-(file × slot); the decode-eligible catalog is ~543 part GLBs + ~245 place GLBs + packages/envelopes; a mid-run session typically holds ~100-600 settled entries, and entries survive until invalidate/wedge/retire so the count grows monotonically across waves. At ~1-3 µs/entry the block is ~0.2-2 ms typical and a few ms at the long-session bound — small, but it is the last unsliced synchronous prefix in the machinery W74 sliced, and it re-runs every wave.

Fix sketch: drop the await entirely — iterate `runtime.assets.entries()` synchronously reading `task.sfSettledRecord != null` (the flag `peekSettledAuthoredRecords` reads at `1159-1162`) inside the existing 4 ms record loop, or yield every ~64 entries inside `listDecodedAuthoredParts`. Effort: **S**. Magic-frame impact: **L**. Risk: **L** — settled-only semantics identical; Map-iteration order either way.

### 3. `_parkBoundedWarmRoots` sweeps every eligible warm root's whole subtree in one unsliced pass inside presented frames

Evidence: `src/render/renderer.js:17705-17743` — `for (const root of this._rosterPrewarmRoots)` runs `countShadowReceivers(root)` (whole-subtree traverse) + `parent.remove` + `_noteShadowMeshRemoved` per root; the paced ledger is debited only AFTER the loop (`17737-17741`), so sibling slicers can't see the spend mid-walk. Flight-adjacent call sites: `17600` (deferred warm tail), `12288` (post-cook), `10881`, `11970`.

Mechanism: one full traverse per warm root inside the calling task — typically 2-4 roots, and the deferred warm root alone carries up to ~4 archetypes × (2 ship witnesses + 1 hulk) plus its palette subjects (~hundreds of nodes). Sub-ms typical, ~1-3 ms on a fat cohort — and it shares the same task boundary the done chain just used for its settle/park bookkeeping, so the frame pays scan + park + release bookkeeping together.

Fix sketch: break the root loop on the paced ledger between roots (each root is independent — a spent frame defers the next root one arm; same skip-aging contract as the other pumps) or hoist the sweep into the paced arm cadence. Effort: **S**. Magic-frame impact: **L**. Risk: **L** — the only subtlety is preserving `render.parkedWarmRoots` order.

### 4. The done chain pays `prepareAuthoredGpuResidency(root)` twice — once per subject inside the admission chain, once whole-tree after compile

Evidence: `src/render/renderer.js:10032-10206` — `admitSubjectPipelines` runs `compilePipelineSubject` → `.then(preparePipelineSubjectResidency)` per subject: every compile already ends in a residency prepare on the same `gpuResidencyAdmissions` lane. Then `17579-17582` awaits `prepareAuthoredGpuResidency(root, { isActive: false })` — `10327-10344` walks the whole root calling `gpuResidencyAdmissions.prepare` per subject again. `10327-10340` `pendingFor(subject)` dedupes only IN-FLIGHT prepares — the settled ones re-run `prepareStartupGpuResidency`'s sliced traverse + texture-residency checks (uploads dedupe on residency state, so the second pass re-verifies rather than re-uploads, but still burns paced-lane slices).

Mechanism: every warm subject pays two sliced residency walks instead of one — pure re-scan cost. It is ledger-paced, so it is not a frame block, but it steals paced slices from sibling slicers (compose driver, compile drain) and lengthens the unbounded leg of finding 1. The trailing call exists to cover meshes minted after per-subject residency ran (palette twins minted in `_mintDeferredPaletteSubjects`, pool-chunk promotions, the `canonicalizeObjectSurfaceProgramKeys` pass at `17687`) — the correct scope is that delta, not the whole root.

Fix sketch: scope the trailing prepare to subjects minted after admission (the mint loop already knows them) or stamp a per-subject prepare generation in `gpuResidencyAdmissions` that the second pass skips on. Effort: **S–M**. Magic-frame impact: **L**. Risk: **L–M** — missing a genuinely-unprepared mesh re-creates a mid-round upload; the delta set must provably equal "minted post-admission".

## Promise.all / allSettled census (hunt item d)

Every aggregate on a flight-reachable path, disposition — no unbounded aggregate holds a presented-frame gate open except the finding-1 leg pair:

| Site | Bound |
| --- | --- |
| `renderer.js:6884` `settleLiveSectorBoundaryAdmissions` | Cook-side admission settle — entry promises are work-bounded boundary admissions inside the sector cook, not a presented frame |
| `renderer.js:7203-7214` abort/publish helpers | Per-record `abort`/`publish` — work-bounded teardown paths |
| `renderer.js:9874/9878/9881` per-batch `issued` inside `compileSubjectsAcrossPresents` | Compile bookkeeping — a settle tail on work `paceQueue`/`linkBatch` already paced |
| `renderer.js:11713-11716` attach-pending pump | `Promise.race` vs `min(waitSliceMs, 250)` under the cook deadline — bounded |
| `renderer.js:12603-12607` cohort settle tail | `Promise.race` vs ≤4 s tail — bounded, work continues detached |
| `renderer.js:16151` worker retirement drain | ≤8 workers draining a finite decode queue — work-bounded shutdown path |
| `renderer.js:16549-16555` finish() `decodeWaitMs` race | Bounded by the prompt's own verification + the call's `budgetRemainingMs` |
| `renderer.js:16806/16849` launch warm settles; `16926/16936` launch re-kicks | Inside `warm.settleDeadlineAt` races (W74) — bounded |
| `renderer.js:17517/17563` deferred settle + re-kick | Inside the shared `settleDeadlineAt` (W74) — bounded |
| `renderer.js:17573/17581` deferred compile + residency legs | NO deadline — finding 1 |
| `renderer.js:20685-20688` first-picture boundary settle | `Promise.race` vs `remaining` deadline — bounded |
| `partsLibrary.js:8391` `prepareAuthoredShipVisualPipelines` inside `upgradeBoundary` | The one flight-reachable aggregate with no deadline race — its bound is the stall-abort watchdog (`abortStalledUpgradeJob`) + queue drain, not time. Under sustained ambient backlog an authored boundary's prepare group waits at queue pace → extended stand-in-on-glass dwell. Already mitigated by deadline-glass hoisting machinery (W9+); adjudicated mechanism, noted not reported |
| `partsLibrary.js:6313-6401` `driveOpeningPublicationResume` | Ledger-gated arm, MAX_SKIPS=2, ≥1 resolve per running arm, per-entry macrotask yield — bounded |
| `partsLibrary.js:6947` `prefetchAuthoredAssetRequests` | Bounded depth-2 pool over a finite request list |
| `partsLibrary.js:14532` `releaseOwnerInstances` fixpoint | `while (pending.size) await allSettled` — callback set is finite per teardown; work-bounded release path |
| `pipelineReadiness.js:452/685` `waitForCaptured`, `777` `pendingFor` | `Promise.all` over per-subject task completions — work-bounded; callers opt into `timeoutMs` races |
| `crucibleDraft.js:775` draft launch gate | Own 10 s race — bounded |

## Regression notes — W67 machinery verified at `9659573ef`

- **Deadline-bounded arm** (`_armDepthStage` `21838-22183`):
  - (a) min-1 per arm is REAL — the collect breaks only at `collected >= 2 && armNow() >= collectDeadline` (`22047-22052`; `SHADOW_DEPTH_ARM_COLLECT_MS=4`, `6027`), so a slice of 32 fat roots each still gets its one collect before the deadline check; the restore loop breaks only at `restored >= 1 && next exists && armNow() >= restoreDeadline` (`22145`).
  - (b) a root requeued mid-slice keeps its withheld flags (castShadow stays false; `_withheldDepthCasters` untouched by the skip) and re-collects fresh next arm — `legSet` is per-arm local state (`22055`), so no stale leg or flag leak (`22048-22053`, `22149-22156`).
  - (c) `const skipped = slice.splice(collected)` preserves the same `{lodLevel, entity}` entry objects — nothing lost (`22048-22051`).
  - (d) `notePacedFrameSpend(armNow() - armStartedAt)` runs in `finally` and debits the WHOLE arm — parked sweep + census + session + collect + restore + render task (`21893` arm start, `22170-22172` debit).
- **Undrawable parking** (`_parkedDepthStageRoots`; sync `21633-21803`; arm sweep `21889-21901`):
  - (a) `queued = pending.has(root) || parked` (`21636`) — parked roots count as queued, so `band !== 1 && queued` keeps `allowCast:false` and flags stay withheld (`21769-21773`); the `band === 1 && selfDirty && queued && _withheldDepthCasters` cached branch can only be reached by withheld-mesh roots, for which the map is non-null by construction — the legSet-null fall-through can't trigger on a parked root.
  - (b) a genuine `dirtySeq > parkedEntry.seq` bump → `continue` → normal collect — non-empty collect deletes the park entry in the withheldMeshes path (`21786-21792`); empty collect unparks + restores (`21748-21765`). Both flows covered.
  - (c) collect `[]` → delete parked entry + restore live flags + release the stale `_withheldDepthCasters` subset (`21748-21765`).
  - (d) the arm-time parked sweep drops detached roots and clears `STAGE_SELF_DIRTY_KEY`/`_withheldDepthCasters` like the pending sweep (`21895-21901`).
  - (e) a leftover root with SOME meshes beyond the leg (`allOffered === false`) requeues via `pending.set` + `continue` — never parks (`22095-22103`).
- **Paced-ledger routing** (`decodeTaskBudget.js`, `admissionSliceBudget.js`) — enumerated sites, all post-step/after-minItems:
  - reconcile pump: post-step break + unconditional debit (`2133-2138`); poll pump: same (`2180-2185`).
  - hold-exempt beat: collect pump post-step (`2557-2558`); enqueue + kick pumps gate on `commitSteps > 0` so a spent beat still lands ≥1 step (`2604`, `2623`); remint gates post-step (`2640-2641`, `2654-2655`); whole-beat debit (`2662`).
  - `drainDeferredEnterSlice`: `steps === 0` min-1 (`sectorEnterDefer.js:150-156`); dead-epoch sweep runs before `startedAt` (bounded by queue size).
  - `drainEmitSlice`/`drainPresentationTail`: post-listener `deadline || ledger` breaks (`eventBus.js:351`, `396`).
  - `_drainMeshBuildQueue`: `usePacedLedger` consults the ledger only after `itemsDone >= minItems` (`19074-19082` + `admissionSliceBudget.js:33-38`).
  - `driveOpeningPublicationResume`: arm-level ledger gate with `OPENING_PUBLICATION_RESUME_MAX_SKIPS=2`, ≥1 resolve per running arm, per-entry macrotask yield + residual debit (`partsLibrary.js:6338-6399`).
  - (b) `drainDespawnDisposeQueue`'s entry gate is the ONE wholesale skip — `return 0` before touching the queue; entries survive, bounded by `DESPAWN_DISPOSE_LEDGER_MAX_SKIPS=2` (`1808-1845`).
  - (c) ledger window semantics: epoch-keyed wallet — a lazily-armed rAF pump bumps `paceFrameEpoch` per present, so spend accumulates across the whole presented frame with no intra-frame gap reset (`decodeTaskBudget.js:48-107`). The 8 ms wall window is fallback-only (`PACE_EPOCH_STALE_MS=250` — rAF starved/hidden/headless); there a >8 ms gap between debits in one frozen task resets the wallet and under-reports — bounded to ~2× budget inside a period where no frames present anyway. No under-report on presented frames.
- **Flag-only OFF→ON collect** (`_stageShadowDepthOnSettingEnable` `22195-22300`; `shadowDepthAdmission.js`):
  - (a) an already-staged mesh withheld at OFF→ON and re-collected unstaged-empty in its arm restores correctly — empty collect → leftover-less restore → live flags restored (`21748` path).
  - (b) over-withheld still-staged casters resolve identically — the arm's unstaged collect returns `[]` → restore.
  - (c) exclusions identical in both collectors — the flag twin drives the same `collectPotentialShadowCastSubjects` under `casterDepthMarkCurrent` mode (`shadowDepthAdmission.js:178-340`): `spacefaceNoShadow`/`sharedContactShadow`/`authoredReadableFallbackLayer` + null-geometry + `materialCanCastShadow`.
- **reset:true prepare defer** (`src/core/physics.js`):
  - (a) `_disableSg02DynamicAuthority` bumps the token only inside `if (_sg02 || _sg02Init)` — with both null it is a true no-op (~`771`).
  - (b) the deferred sleep's continuation completes `prepareBackend` independently of the abandoned 20 s caller wait → the backend still mints for the next click (`352-455`).
  - (c) `initToken` compare after the sleep + the mint gate `!_sg02Init && !_sg02 && !rapierRuntimeBlocked()` (~`574`) — two concurrent defers can't interleave mints; the loser adopts the winner's `_sg02Init` via `sg02InitJoinMs()`.
- **Variant interning** (`shadowDepthAdmission.js` `_depthVariantCache`): now a 10-bit discriminant tuple (W73 added `alphaHash` + `vertexColors` — the prompt's "9 inputs" predates it).
  - (a) `alphaTest` 0→1 flips a bit → bits differ → re-mint.
  - (b) `side`/`shadowSide` feed bits verbatim — 0/1/2 distinct.
  - (c) the WeakMap is per material object and bits recompute on every call — `material.needsUpdate`-style reuse of the same object can't serve a stale variant.
- **W74 settle deadline** (`WARM_BUILDING_SETTLE_DEADLINE_MS = 30000`, `6083`): `_armCrucibleWarmBuildingSettle` (`16799-16822`) re-arms only on `pendingAttachments` growth && `Date.now() < settleDeadlineAt`, and clears `warm.building` + `root.userData.warmBuilding` on expiry; the over-budget cook mirror (`12974-12975`) matches; the deferred chain shares the deadline for attach + re-kick (`17514-17568`) and timed-out rows release coverage without re-kick (`17542-17547`). Prompt item (c) verified: on an rAF-starved/hidden tab the wall-clock arm still fires (timers throttle but fire) → `warm.building` clears at the wall deadline while presented frames are frozen — consequence is the documented late-attach drop (`boundaryBelongsToScene` fails → the settling decode's attach drops → coverage released), identical to an over-budget cook. Bounded; note the inverse too — a hidden tab's intensive throttling can fire the expiry timer LATE (~60 s), which stretches the same bounded consequence rather than breaking it.
- **Golden hash / determinism**: audit is read-only; nothing here perturbs the verified `892f88c9` baseline.
