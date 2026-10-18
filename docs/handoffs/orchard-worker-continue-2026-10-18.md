# Current Orchard continuation, refill, residency and CI handoff — 18 October 2026

## Delivery candidate and verification

This six-path candidate is intended to extend existing draft PR #456. At the latest public read, `master` was `37d1af00f278261dbf7b8654542dc0612e31ff5d`, and PR #456 was open/draft/unmerged at head `9bab4daac232eb1fe27bdd2f49335225e9021015` on `fix/orchard-worker-continue-20261018-0300`. The previously published commit is the current PR head; the candidate files and their receipt are not evidence that a new commit has already been published. Before updating the branch, recheck master, PR head/base and exact-path ownership. If any have changed, inspect the public diff and choose valid public ancestry rather than overlaying stale history. PR #447's shared `OPEN_GOALS.md` and `EXECUTION_STATUS.md` are not part of this delivery and remain untouched.

The reviewed three-path Orchard change:
- `src/systems/anvilWork.js` safely validates malformed retained cargo-manifest rows before reading fields. A healthy far-shelved receiver can remain a waypoint for the collector, but it cannot receive cargo or count as a physical arrival until it is live again.
- `src/world/farActorTable.js` preserves the selected Anvil worker's itinerary, cargo, durable identity, drive, runtime/damage state, and native body snapshot when shelving/promoting it, while keeping the regular spawn-budget refusal in place.
- `test/anvil-orchard-refill-residency.test.mjs` exercises retained-waypoint refusal, malformed/absent/dead/busy receiver guards, controlled collector/receiver promotion, cargo/damage/drive preservation and spawn-budget refusal.

On the exact candidate commit `036cb396b0ddc99045f467942edd92d1d34841e2`, the final serial focused CI command passed **11/11, exit 0, in 31.940 seconds**, one authorized attempt, with no retry or timeout change. Before/after bindings match the sealed selection. The independent controlled evidence also includes 34 contract cases passing: 4/4 malformed-row residency tests, 25/25 neighbor far/residency/budget/roster contracts, and 5/5 Anvil harvest/manifest/transfer/registration/save contracts. The original reproduction of a retained `{totalQty:0, lines:[null]}` manifest throws a TypeError before the fix; its bytes/log are retained with the review package.

A fresh native lifecycle continuation loaded the unchanged cargo-8 save (1,058,802 bytes; SHA-256 `2ef9668acdefa4077d44c726f25d5b957d7ef18f818430368fbb2e99afacabf7`) through `save.loadEnvelope` and native preparation, then ran exactly 120 ordinary ticks from 19,488 to 19,608 (two simulated seconds, 4.731 seconds wall). It used normal world ticks and the existing spawn-budget owner (8 of unchanged cap 24); only raw keyboard brake input followed load. Every-tick assertions preserve cargo 8, delivered lot IDs `anvil_storm_orchard:0:1` and `anvil_storm_orchard:0:2`, the finite ledger 37 source + 8 delivered + 3 retained = 48, and absence of duplicate delivered pods or worker durable IDs. The player is native before and after. Both workers stay shelved throughout (one far row each; zero live/native worker bodies). Natural worker re-entry/reacquisition in flight remains **unproven**; the controlled promotion tests do not replace that runtime path. Receiver native admission and full production UI/renderer finalization also remain unproven.

The previous 360-second `clear_band` run with one delivered lot is **historical failure evidence**, not a new acceptance result and not rerun. The cargo-8 120-tick test adds fresh-host persistence evidence; it does not establish a second complete earning/refill cycle, production worker re-entry, or whole-route completion.

## CI registration and exact-head status

The candidate `.github/workflows/check.yml` adds one serial static-shard-1 step for the three Orchard tests. Its reviewed semantics preserve the existing trigger, guard, permissions and budgets; it does not relax thresholds or refresh baselines. The final three-file serial command passed as above. CI registration is established only after the resulting remote commit is checked to contain the selected workflow blob; the local test result alone does not prove registration.

The prior public exact-head CI run for PR #456, commit `9bab4daac232eb1fe27bdd2f49335225e9021015`, is terminal **failure**: [run 39092971509](https://github.com/coldshalamov/SpaceFace/actions/runs/39092971509). `sim` and `static (3)` passed. Most remaining failures reproduce on exact master `37d1af00f278261dbf7b8654542dc0612e31ff5d` in run 39090478746: native save/restore assertions expect 16 and observe 17; stale UI budget baseline (chart 6.330 ms, flight 1713 DOM nodes, range 3.380 ms); FEEL seed 8008 observes 0.1736219701589719; the same browser-shard failures in load-finalizer/worker-finalizer, live-cold-open/assets-live, station-tabs, and flight/ship visual checks. Head visual composition reached `authored` where the baseline log still showed `compiling-pipelines`; do not overstate full visual equivalence.

One failure is **unattributed**: `check-market-first-loop` failed on the PR head because a Market BUY did not move player credits. This exact command/failure was absent from all four browser-shard logs of the base run. An observer-only candidate for `scripts/check-market-first-loop-runtime.mjs` is included to record pre-BUY state and relevant UI/economy/toast events while preserving its original action, 15-second window, assertions and failure behavior. It does not seed state, retry, extend timeouts or change pass criteria. The independent base/head instrumented browser pair has **not** run: the default Playwright Chromium binary is absent and system Chromium aborts because its SUID sandbox helper is misconfigured. No sandbox bypass or security setting change was made. Instrumented green alone would not establish attribution; only a matched base/head pair under the same supported sandbox browser can distinguish the failure.

The prior public CI's aggregate baseline still reports exit 1 at 96.308 seconds against the unchanged 90-second wall budget although all 17 child commands exited zero. Cause remains unresolved; the massline link was the long pole. No budget refresh or threshold relaxation is included.

## Delivery scope and path ownership

At the latest read-only owner scan, the selected code, test, workflow and Market diagnostic paths had no owner in another open PR. The unique handoff path is owned by #456 and this candidate updates that same path. PR #447 owns two shared status documents; they are not selected. At this handoff's evidence cutoff, the public branch still ended at `9bab4daac232eb1fe27bdd2f49335225e9021015`; this document does not claim a subsequent candidate commit or CI registration. A delivery receipt must verify the actual remote commit parent, branch ref, all selected file blobs, and resulting PR draft/head.

## Current next actions

1. Recheck public master, PR #456 base/head and exact-path ownership immediately before the update. Continue the existing PR only if its public ancestry and selected path preimages are still valid; otherwise inspect the new diff before choosing the parent.
2. Publish only the six selected paths through the supported UTF-8 Git-object route on the public branch.
3. Verify the resulting remote commit parent/ref, every selected Git blob, and PR #456's draft state/head. Record the receipt before claiming delivery or CI registration.
4. Follow CI for the exact published head. Fix only attributable failures with scoped evidence; leave baseline failures and thresholds untouched. Keep Market attribution unresolved until the supported matched instrumented base/head pair is run.
5. The next Orchard runtime action is a bounded raw-input segment now underway to observe natural far-worker re-entry. Re-entry remains unproven until observed; do not count controlled promotion tests or the 120-tick cargo-8 continuation as proof. Then establish a second completed lot/refill and separately qualify receiver native admission and the production Continue finalizer.
6. After supported sandbox browser access exists, run the bounded Market pair once per exact revision with the same 15-second assertion window and instrumentation. Capture pre-BUY commodity/mode/quantity, button state, note, credits/capacity/stock, `ui:buy`, `economy:tradeFailed`, `economy:tradeCompleted` and toast events. Do not force a BUY or retry to green.

## All seven larger outcomes remain OPEN

- **SF-GAME:** Complete, reviewed, polished, accepted game. Next: integrate this scoped repair safely, then continue the current build-map work and full acceptance; no whole-game claim here.
- **SF-ORCHARD:** Assets, finite/native custody, Continue/residency and ordinary gameplay. Next: prove natural far-worker re-entry and a second completed lot/refill, plus receiver native admission and production finalizer. Current evidence is focused only.
- **SF-PUBLISH:** Verified coherent public increments and delivery. Next: deliver a coherent public update after confirming the current PR ancestry, then verify remote ref/commit/blobs and track the resulting draft PR/CI.
- **SF-RECOVER:** All unpublished code/assets/tests recoverable outside disposable environments. Next: retain and verify this source/CI/diagnostic receipt plus the separate asset-package recovery; do not substitute local archive for public delivery.
- **SF-VISUALS:** Frequent new actual work captures and visual quality review. Next: use a correctly provisioned sandbox browser for actual runtime captures; none from this increment.
- **SF-ASSETBANK:** Broad, distinct reusable pieces with real consumers. Next: finish package generation and real receiving-world/native/browser consumers; this source delivery contains no quarry binaries.
- **SF-ASSET-QUALITY:** Cohesive, detailed construction while retaining distinct silhouettes. Next: complete exact consumer, native and camera/browser review before acceptance.

---

# Previously published Orchard handoff content (retained verbatim)

# Orchard worker Continue repair — 18 October 2026

## Coherent source increment

Based on public master `37d1af00f278261dbf7b8654542dc0612e31ff5d`, preserving the newer mission-target cleanup. Three source/test paths restore canonical Mule hardware for Anvil's collector and receiver durable records instead of a generic mass-20/radius-8 shell. Existing saved damage, motion, identity, itinerary and finite cargo override fresh hardware defaults. Other record contexts retain their existing path. No save-schema, physics budget or acceptance threshold changes.

Final source SHA-256:
- `src/world/worldRecords.js`: `8ae608447c9e5e35a7143b7c4980f2a871fced6d7490d848b718f544efee99e2`
- `test/anvil-orchard-input-route.test.mjs`: `80aaf6e39aeddf4f6c8f7388a8e1dd39498f1afea4adc32759711a933b51d6b0`
- `test/anvil-work-rematerialization.test.mjs`: `c4369638d0725a6538f398b2cecc7de4cc61183e80938462d7adbb23e1271033`

Exact final before/after source bindings accompany 7/7 focused and 51/51 neighbor passes. The focused seed 424214 route harvests at tick 2579, releases the same lot at 2612, physically collects four units once at 2769 and closes its socket at 3091. Two Continues retain one live entity per worker durable ID, finite source 44 and cargo 4. Collector native mass is 55; receiver exists as a live entity but has no observed native record, so receiver native restoration remains unproved.

`check:baseline` is **not green**: all 17 child commands returned zero, but aggregate exit 1 records 96,308 ms against the unchanged 90,000 ms wall budget. The massline link is the long pole; no causal performance regression is established. Do not substitute the earlier historical 17-gate result for these final bytes. Earlier neighbor hash drift was independently shown to be comment-only, but the final source was freshly retested regardless.

The Continue finalizer is a focused fixture callback (native preparation, then flight mode), not full production UI/renderer finalization. `spawnBudget` is omitted; crowded admission, full-manifest/browser input, visuals and performance remain unproved. No post-construction participant pose, velocity, cargo or health injection obtains the focused result.

## Unfinished substantial unit

Second-lot earning/refill is **OPEN**. The preserved 360-second attempt ends at tick 24369 in `clear_band`, source 44, with one delivered lot. Socket closure is not a completed earning/refill cycle. The earlier checkpoint's misleading done label is corrected in the current handoff; its original evidence is retained.

Next executable action: reduce that retained stall to a bounded comparison of worker propulsion, field force and service admission across Continue. Do not repeat the long failed probe unchanged. Independently qualify receiver native admission and the real production finalizer before broadening the result. The separate historical Tally/Towline experiment and its charged-call ledger remain untouched.

## Delivery and recovery

This document accompanies a source-only draft increment. Publication is established by the actual remote commit and draft PR, not local commit or backup. Quarry and older Guide/Mile model delivery are separate and remain unverified remotely. The previous source increment remains PR447; do not imply it contains these assets. Its two shared status documents overlap this work, so this unique handoff preserves their pending changes. Reconcile this current evidence into the central OPEN_GOALS/EXECUTION_STATUS after checking PR447's actual merge state; never overwrite its newer history or acceptance fields.

Recoverable final source/log archive SHA-256: `5f1c216c424224305414dd7bc50e25a240eddeb4886dfb08a40fce34274dd267`. Restore the archive's `FINAL-SELECTION.json` payloads, not its historical `candidate-source/`. Original failures and the stalled diagnostic save are separately preserved. No backup substitutes for GitHub delivery.

## Continuing goal markers

All seven outcomes remain OPEN; these entries supplement the existing central register without closing its original twenty-concept/P00–P21 obligations.

- **SF-GAME:** outcome finished, reviewed, polished, accepted game. State partial; this is one worker-restore repair. Owner expansion integration/current exact-path owners. Evidence the focused source results above. Next finish the current Orchard route, then current build-map work. Awaiting user: eventual whole-game acceptance only.
- **SF-ORCHARD:** outcome assets, finite/native custody, Continue/residency and ordinary gameplay. State focused restore repaired; second lot and broad acceptance open. Owner Orchard route author and independent reviewer. Evidence seven-case witness and retained `clear_band` failure. Next bounded producer-stall diagnosis and real finalizer/admission qualification. Awaiting user: final acceptance, no routine engineering decision.
- **SF-PUBLISH:** outcome verified coherent commits/draft PRs and clear delivery status. State source and model publication tracked separately; model approval outcome unresolved. Owner integration publisher. Evidence actual remote ref/PR checks, never a blob alone. Next verify this increment's remote files and exact-head CI, preserve unrelated PR447 work. Awaiting user: only an actual supported pending permission step if required; no repeated blind approval requests.
- **SF-RECOVER:** outcome all unpublished code/assets/tests recoverable outside disposable environments. State this source increment and two quarry archives have verified cloud recovery; GitHub model persistence incomplete. Owner integration/preservation. Evidence archive identity above and quarry runtime archive `74d0a4ad0fcef52689bdc7fa046efa56aadcff07b7dd5fe76612dd32df093bdc`. Next verify repository preservation and retain originals. Awaiting user: none for routine recovery.
- **SF-VISUALS:** outcome frequent genuinely new actual work images and visual quality review. State five actual quarry-export views reviewed; no new gameplay capture from this code repair. Owner asset/camera reviewers. Evidence exact render provenance in the recovered quarry package. Next actual packaged/runtime captures after supported transfer and generation. Awaiting user: eventual visual acceptance.
- **SF-ASSETBANK:** outcome broad distinct reusable small/large pieces with real consumers. State public baseline validates 156 assets/468 LOD GLBs/12 recipes; one new quarry remains unpublished, not three models. Owner asset and receiving-world owners. Evidence current-public bank checks and opt-in candidate. Next finish package generation, real consumer tests and publication before default placement. Awaiting user: eventual integrated bank acceptance.
- **SF-ASSET-QUALITY:** outcome cohesive detailed materials/construction while retaining distinct silhouettes. State quarry exported views reviewed; opt-in runtime candidate has three focused passes and one skipped lifecycle check. Owner asset author/independent review. Evidence exact source/material/projection witnesses; full worker transport/package/native/browser remain unproved. Next execute those actual receiving contracts and inspect game-camera quality. Awaiting user: final quality acceptance.
