# Rookside: remaining material, first growth, and a return

## Scope and intent

An isolated, unpublished four-file candidate over PR #939 commit `7d66bc74cff83416d80f3079391c3b4c36247c77`, parent tree `d97aaf81e3458ab733bf0e32b81510d242af5fba`. Fresh connector reads confirm the PR is open, draft and unmerged. The shared checkout is dirty and was not edited. No branch, commit, publication, merge, deployment, model-production job, user computer or separate execution thread was created. Previously excluded paths remain unchanged.

The retained player has genuinely delivered 12t, leaving the garden at 59.2 biomass. Reaching the 60-biomass Sprouting Reef needs 1.333…t more edible feed; player guidance rounds this up to 1.4t. This increment does not restore the two iron units lost to radiation in the preceding journey or award missing feed.

The old route stopped at the first free commodity in the hold even when that load was insufficient. This player's one unit of silicate was only 0.6t. The route now prefers a sufficient free lot when available. If the hold is short, a usable existing iron face can become the navigation target, while the text preserves the option to feed the smaller lot now and make up the remainder later. When mining is unavailable, the safe garden approach and exact partial-load shortfall remain available. Guidance never materializes a rock, adds cargo, reserves material, or promises stock from an absent/depleted face.

The garden's existing voice now acknowledges that the original feed is kept while the player leaves to collect more. On a subsequent valid held load, it compares actual edible mass to the remaining threshold. These are one-time, save-backed conversation flags, not growth receipts. A completed first growth suppresses both resupply branches. The existing first-growth response and canonical Rook/Nest handoff remain distinct from the optional 240t paid run.

## Ownership and existing assets

- `src/missions/compostRoute.js`: read-only cargo/source choice and guidance. Cargo custody, reservations, tow capacity, beam availability, mining eligibility, and garden mass remain reads of existing owners.
- `src/missions/compostArrivalScene.js`: two one-shot dialogue branches, guarded against already-recorded growth. No material, physics, payment or progression mutation.
- `test/compost-growth-return.test.mjs`: focused route and canonical intake fixtures.
- This report: the fourth patch path.

No new model or visual owner is added. The existing reclaimed dead-hulk garden, canonical stage radius, circuit intake mark and COMMS/objective lanes are reused. The garden's stage change is the existing authored visual owner's consequence, not a decorative duplicate. Geometry assertions and native stage/radius changes do not establish rendered appearance.

## Actual earned continuation

Input lineage is the preceding arrival packet's `native/earned-feed-v9/before-continue-slots.json`. The source/cargo/account outcomes were not rewritten to seed this proof.

1. Two preliminary native mining probes flew toward an ordinary Charon iron face but did not acquire it with raw RMB alone in the headless host. They produced no mining ticks or iron. Their saved physical travel and ambient pickups are retained. A short diagnostic identified the missing ordinary object-selection seam, not an intake or growth failure.
2. `native/mine-v3` continues that real position. The native UI `laneInputWrite` target-selection seam selects the real dormant face; native RMB runs the actual mining/promotion owner. In 231 mining ticks, actual collection yields two iron and one titanium. Releasing the beam earns one additional iron through the canonical vent rule. Credits remain 1,206. `mine-v4` replays the identical source save and explicitly records all three ordinary yield events plus `mining:ventBonus` for one iron, heat 0.847 and pulse ore 3.0061643835611886. Neither probe grants cargo.
3. `native/return-v1` is a failed alternative. The pilot immediately combined Shift and whole-lot jettison, then tried to chase the fast departing pod too slowly. The chase budget expired before intake. No successful growth is claimed from this run.
4. `return-v2` is a successful alternative from the mined save. It brakes after the Shift edge before jettisoning and eventually catches the moving pod. Its canonical first growth and Continue pass are retained separately.
5. The final `return-v3` uses the same actual mined save and catches the new pod immediately after ordinary jettison while still close. Native Line controls pay out length while returning toward the mouth. No body is repositioned and no intake overlap is staged. The same three-unit iron pod is consumed by the garden. The receipt records 2.4t edible feed, 1.44 biomass gained, 59.2 → 60.64 biomass, stage 1 → 2, and total player/run feed 12 → 14.4t. Its 20t handling floor is not used as edible mass.

Final receipt identity: garden `understory:charon:rook-receiver:v1`, garden entity 3660, eaten entity 634, tick 113764. The old pod is recorded dead before Continue, and the new saved envelope no longer contains that iron pod. Credits remain exactly 1,206, `compostRunComplete` is not set, and there is no Compost payout. The canonical story owner records `compost` next to `cinder_board`, emits Rook's next-route handoff, and leaves the optional 240t account incomplete.

Title Continue retains the same garden totals, growth receipt, completed step and all six dialogue flags: arrival, load, partial, resupply, returnLoad and growth. The canonical `understory:playerGrowth` event may be replayed when the owner restores its history; this is not another feeding or payment. The one-shot scene does not repeat its prose. The COMMS backlog itself remains transient: saved heard flags do not restore full prose after a cold restart.

The minimum recorded cockpit-center distance in the final sweep is 177.428 WU, outside both the old 103.5-WU and new 161-WU mouth. This narrow metric is not a whole-route collision-free claim. The inherited restore snapshot reports `ship.flags.invuln = true`; its duration was not audited, so this is not proof of unprotected travel or combat safety. Ambient archive samples and other background changes are preserved, not counted as garden rewards.

## Executed checks and source identity

Final aggregate: 277 passed, zero failures, skips or cancellations. This includes the existing arrival, physical cargo, growth, save, Cinder, furnace, character and route chains plus eight new growth-return checks. Player-facing labels pass. Type floor passes: 2,554 live stylesheet sizes, no rendered type value below 12px. The latter is a static stylesheet check, not browser typography acceptance.

The executable source overlay is exact-parent isolated: the loader reads immutable base Git bytes plus a blob-verified parent overlay and the three candidate executable/test paths. It never imports unrelated dirty checkout source. The observed closure audit finds zero untouched-source mismatches across 2,775 aggregate modules/reads, 1,999 in each native cohort, 766 label-check reads and 516 type-floor reads. The inherited non-UTF-8 freight file's raw Git blob and Node replacement-decoded import are checked separately.

Independent review separately passed the aggregate, partial-hold stale/absent-source tests, repeated short-feed/return tests, and a real production cold Save/Continue from the 12t partial save. The resupply flag persisted exactly once without changing cargo, feed or credits. Final report/hash review is recorded outside this source file.

## Rendered acceptance attempt and limits

Chromium is present now: `/usr/bin/chromium` reports version 156.0.8078.79. A bounded Playwright probe was prepared with 3,399 exact runtime files in the supported isolated server manifest and the actual final earned save. Both the default launch and a supported escalated execution attempt failed before any HTTP request: Chromium's process singleton could not create its socket (`Operation not permitted`). The initial launch also reported a read-only crash-report path. No screenshot, GPU frame, actual browser Continue, typography, focus, audio, contrast, reduced-motion, performance, or rendered scene acceptance is claimed. This is an execution-environment block, not evidence that the game failed to boot. No further bypass was attempted.

Native movement/RMB/Line/jettison inputs are programmatic. Object selection, commodity selection and title Continue are controller seams, not pixel clicks. Focused tests deliberately stage fixtures and must not be confused with the retained earned journey. Full CI, fresh New Game acceptance, unprotected combat and the complete Nest journey were not run.

## Reproduce and next work

From the shared SpaceFace checkout, run the candidate with the `garden-growth/exact-fs.cjs` hook and `exact-loader.mjs`, setting `HELIOS_OVERLAY` to `garden-growth/overlay.json`. `run-aggregate.mjs` runs the scoped aggregate; `audit.py` checks parent/candidate identities, observed closures and patch applicability. `paths.json`, `manifest.json` and `candidate.patch` identify the frozen four-file result.

Retain all native variants. For replay, copy the chosen `native-*.json` and change only the virtual runner's output directory; preserve the source-save path and production cohort. The final earned continuation is `native/return-v3/before-continue-slots.json`. It is now eligible for the ordinary Nest approach; another 225.6t of Compost is not required to continue the story. The separate 240t paid run remains optional and uncompleted.
