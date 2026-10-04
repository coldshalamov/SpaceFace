<!-- LIFETIME: ACTIVE_PACKET -->
# Research intake: dependable intent, state and physical feedback

## Outcome and admission

On 2 October 2026 the owner requested a planning PR that admits the strongest roughly half of the research findings and holds the debatable remainder for discussion. This intake selects **17 remaining findings from the 36-candidate catalogue**, grouped by actual owner and shared verification. It does not implement them. Canonical execution status stays in **build_map.md §1C**, with the existing NXI-218 catalogue owner retained and shipped NXI-114 credited. Section letters below are acceptance-detail anchors, not a new queue or task-ID family.

Selected: **J1–J6; P02–P04, P06, P07, P08 (unfit residual only), P10; C1, C2, C4, C8**. The other 18 and all proposed larger extensions are explicitly unadmitted in [DECISIONS_FOR_REVIEW.md](DECISIONS_FOR_REVIEW.md). Do not interpret research examples as additional assignments. Existing independently admitted scopes remain intact.

Why these: wrong-object commitment, save/input lifecycle, custody/capacity violations, false readiness/outcomes and physical predictions are concrete broken promises. Repairing them benefits many existing assets without requiring a new control convention, reward loop, balance law or art direction. These are best-bet changes, not a claim that implementation is costless or all evidence is end-to-end.

Evidence: source audit at [74c31b5](https://github.com/coldshalamov/SpaceFace/commit/74c31b50a94f6c14889f0182b0c7894b63743159), isolated production-function witnesses for entry/save/input and scanner/contract cases, plus independent crafting and field-forecast checks. A source-tree comparison through 18a338a was followed by a fresh merge review at [d410e644](https://github.com/coldshalamov/SpaceFace/commit/d410e64435cf6e30f2587c5ee5f05be8c2a92283). The newer scanner reset/load repair resolves P01’s original lockout, so it is removed rather than reassigned. NXI-114 now protects buy-fit/fit refusal; P08 is narrowed to the still-unconditional unfit continuation. The remaining changed save/Settings/field/ship owners were checked for their specific residuals. This is not a full-game run. Refresh exact paths before work; close an already-fixed finding with current evidence, without inventing replacement scope to fill a numerical quota.

Supporting [golden standard](SPACEFACE_GOLDEN_STANDARD.md) and [evidence atlas](RESEARCH_EVIDENCE.md) explain mechanisms. They are informative references, not new gates or authority over current product/technical contracts. No human playtest or owner verdict is required for admitted implementation.

## Execution and shared verification

- Claim the canonical board seam and preserve its original scope. These are explicit narrow residuals, not reasons to reopen completed NXB-010/017/019/025/053/059 or shipped INFERENCE work.
- Follow the current owner, not a parallel service. Functional UI edits preserve ORRERY. No runtime code, economy tuning, visual redesign or new input mode is part of this planning PR.
- First write/extend the smallest behavior regression at the real owner; make the repair; cover the named counterexample and adjacent success. A test of a source string is insufficient.
- Keep independently revertible changes. Share expensive verification by affected route: save/Continue; Settings/map; station intent/crafting/fit; physical prediction/lifetime. Run one relevant composed route after its owner fixes, not the entire game or screenshot battery per finding. Partial overlap does not require all eight groups to land together.
- Use existing validation tiers. Render/audio checks support changed perceptual claims; target-device measurements support performance claims. CPU function checks do not certify visual quality. A fresh bug reproduction is not an implemented repair.
- Update only the canonical completion surfaces for actual work. A fulfilled subcheck does not close its larger parent if the original parent scope remains. Existing catalogue work is completed once, not copied into a second open line.

## A. Save outcomes and Continue provenance — J2, J3

**Canonical owner: board 241, FB-110/FB-130 save-screen truth.** Extend this still-open work; preserve the already implemented INF-091 corruption logic.

**Start:** `src/save/saveSystem.js`, `src/ui/screens/saveLoad.js`, `src/ui/screens/mainMenu.js`, `src/ui/uiRoot.js`. [Deletion owner](https://github.com/coldshalamov/SpaceFace/blob/74c31b50a94f6c14889f0182b0c7894b63743159/src/save/saveSystem.js#L1499-L1514), [deletion consumer](https://github.com/coldshalamov/SpaceFace/blob/74c31b50a94f6c14889f0182b0c7894b63743159/src/ui/screens/saveLoad.js#L1239-L1254), [Continue](https://github.com/coldshalamov/SpaceFace/blob/74c31b50a94f6c14889f0182b0c7894b63743159/src/ui/screens/mainMenu.js#L513-L525).

- J2: deletion currently swallows storage errors while the UI treats a normal return as success. Return a checked outcome from the save owner; show success, failure or partial result truthfully and retain visibility of surviving bytes. Keep confirmation; no raw-storage fallback around owner refusal or invented multi-key atomicity.
- J3: title Continue names an older playable slot and bypasses `latest`'s existing corrupt-newer warning. Carry provenance while loading the slot actually previewed. Never fix this by silently loading a different latest slot after the drawer changes.

**Done:** primary-remove, recovery-remove and index-write failures produce truthful results; healthy deletion still works. Corrupt-newest/valid-older title → bus → owner → receipt loads the promised slot and warns once; healthy newest, manual named load, backup-only recovery and transient read failure remain distinct. Extend `test/m6-corrupt-save-recovery.test.mjs` and `test/inf-091-continue-skip.test.mjs`; include shared-store versus local durability where the current owner differentiates them. No destructive writes on Continue.

## B. Rebinding reset and capture ownership — J4, J5

**Canonical owner: board 196 / NXB-055.** These are explicit Settings subchecks, coordinated with row 260 rather than a duplicate task there.

**Start:** `src/ui/screens/settings.js`, existing input binding validation. [Reset branch](https://github.com/coldshalamov/SpaceFace/blob/74c31b50a94f6c14889f0182b0c7894b63743159/src/ui/screens/settings.js#L839-L905), [pad capture](https://github.com/coldshalamov/SpaceFace/blob/74c31b50a94f6c14889f0182b0c7894b63743159/src/ui/screens/settings.js#L918-L970).

- J4: default restoration must pass the same candidate-map conflict rule as ordinary rebind. Refuse with the conflicting action named; do not steal keys, remove secondary arrows or forbid intentional contextual aliases.
- J5: scope cleanup to one capture generation and cancel its pending timers/listeners on exit. An old 900 ms conflict callback must not clear a newer capture's ownership while its listener survives.

**Done:** rebind Forward away from W, give W to Scanner, reset Forward: conflict is handled without duplicate conflicting bindings, including persistence/reload. Self-reset/full reset still work. Fake-clock keyboard and pad conflict → cancel → re-enter → old timeout retains the new capture; closing removes all relevant listeners. Preserve current refusal-feedback duration, pad timeout and irreversible hold policy. Extend actual Settings capture tests, not a replacement input framework.

## C. Current map intention and cancellation — J1, J6

**Canonical owner: board 148 / PB-UI-B stable-identity selection.** The functional map routing extension is explicit; it is not a map redesign.

**Start:** `src/ui/galaxyMap.js`, `src/ui/input.js`. [Escape router](https://github.com/coldshalamov/SpaceFace/blob/74c31b50a94f6c14889f0182b0c7894b63743159/src/ui/input.js#L238-L275), [existing map cancellation](https://github.com/coldshalamov/SpaceFace/blob/74c31b50a94f6c14889f0182b0c7894b63743159/src/ui/galaxyMap.js#L4963-L4974).

- J1: clear stale search result/index state after blank/no-match queries, and commit only a current visible eligible result. Observed failure is stale selection, not proven automatic travel. Preserve ranking and discovery filtering.
- J6: let the map's existing line/hold cancellation take first refusal before generic Escape close. Keep confirmation/locked-screen precedence and unrelated screen semantics.

**Done:** search hit → blank/no-match → Enter never selects the old place; a new valid query works. Dispatch through the real document route: first Escape cancels a map line/hold without committing or popping; second closes. Cover search focus, ordinary map, Pause return and locked confirmation. Tab behavior, seed validation and hull-picker focus policy are outside this admitted scope.

## D. Resolved during final freshness review — P01 (not a task)

The newer scanner `newGame()` and `deserialize()` clear the old absolute deadline, and `runReset` now includes scanner. The new `test/demo-scanner-lifecycle.test.mjs` explicitly treats cooldown as transient across load. Credit [07380355](https://github.com/coldshalamov/SpaceFace/commit/0738035558b86467844c2ffe4e278acb3218ed4a). Do not create a scanner board row or insist on serializing remaining cooldown as a correctness repair. A different persistence policy would need discussion, and is not admitted here. Continue must still retain the shipped investigation records. This leaves 17 selected residual findings and 18 held findings, with one original finding resolved.

## E. Commit the exact contract held — P04

**Canonical owner: board 149 / PB-UI-C transaction intent.** Explicit Contracts extension; NXB-053's shipped Market/Shipworks scope remains shipped.

**Start:** `src/ui/station/screens/contracts.js`, current mission acceptance owner. [Completed hold drain](https://github.com/coldshalamov/SpaceFace/blob/74c31b50a94f6c14889f0182b0c7894b63743159/src/ui/station/screens/contracts.js#L1124-L1155).

Capture offer identity and relevant stated terms; after the completed-hold animation commit only that still-valid offer. Cancel pending commit work on invalidation/selection/context change. Do not fall back from a detached A button to current dossier B. Existing `endHold()` already protects unfinished holds; fix the separate 260 ms drain callback rather than claiming that protection is absent.

**Done:** arm A → complete hold → remove A/paint B → advance fake RAF: no B acceptance/collateral. Cover same-ID repaint, changed terms, screen hide, duplicate updates, pointer/key/pad/assistive activation and reduced motion. Unchanged A still accepts exactly once. Preserve deliberate hold timing, authority-side revalidation and normal cancellation. Share one station route with G/H after focused tests, without expanding into held Industry lifecycle proposal P05.

## F. Crafting respects custody and source capacity — P02, P03, P10

**Canonical owner: new board 263, economy seam (station crafting/cargo).** Coordinate exact files with ship/industry; do not duplicate the world-site industry rows.

**Start:** `src/systems/crafting.js`, `src/systems/cargo.js`, `src/systems/ships.js`, `src/ui/station/screens/industry.js`. [Readiness/consumption](https://github.com/coldshalamov/SpaceFace/blob/74c31b50a94f6c14889f0182b0c7894b63743159/src/systems/crafting.js#L214-L270), [module removal](https://github.com/coldshalamov/SpaceFace/blob/74c31b50a94f6c14889f0182b0c7894b63743159/src/systems/crafting.js#L340-L349), [ordinary capacity guard](https://github.com/coldshalamov/SpaceFace/blob/74c31b50a94f6c14889f0182b0c7894b63743159/src/systems/ships.js#L2136-L2151).

- P02: preflight and display cargo-owned free quantity, not total including sealed freight. Refuse before any mutation; leave the low-level remover usable for legitimate mission handovers. The six-fuel-cell Hauler/Mule overlap creates a recoverable shortage, not a proven permanent softlock.
- P03: before consuming an exact fitted source, use canonical post-input-consumption ship capacity. Preserve safe fitted-source augmentation and loose duplicates. The M pod's output is an L expander in inventory after a timed job, not immediate auto-fit. No jettison, lost goods, free fit or UI-only capacity estimate.
- P10: map actual tech/source/material/facility reasons to the correct existing remedy. Missing research or module at a valid fabricator must not send the player to another station. Preserve discovery restrictions.

**Done:** sealed6/free0 refuses with unchanged cargo/module/credits/job state; sealed6/free6 spends only free units and leaves the reservation usable. Fitted source causing overflow after input consumption refuses atomically; just-below-cap, loose duplicate and inactive source cases remain legitimate. Each readiness reason maps to truthful copy/action. Revalidate commit-time state, not only the preview. Extend existing crafting/Industry checks and `test/ui-review.review.test.mjs`; one ordinary station chain verifies reserve → preview → craft/refusal → delivery continuity. Do not change fabrication clock, batch quantity policy or held P05 callback scope here.

## G. Research and fitting report authoritative outcomes — P06, P07, P08

**Canonical owners: board 118 / PB-BUILD-B for P06/P07; board 184 / NXB-029 for the remaining unfit half of P08; NXI-114 buy-fit/fit is already shipped.** One shared station verification cohort, two existing assignments. This does not merge their full original scopes or transfer status ownership.

**Start:** `src/ui/station/screens/shipworks.js`, `src/ui/screens/techTree.js`, `src/systems/ships.js`. [Hull Buy](https://github.com/coldshalamov/SpaceFace/blob/74c31b50a94f6c14889f0182b0c7894b63743159/src/ui/station/screens/shipworks.js#L3313-L3352), [research receipt](https://github.com/coldshalamov/SpaceFace/blob/74c31b50a94f6c14889f0182b0c7894b63743159/src/ui/screens/techTree.js#L617-L626), [remaining unfit continuation](https://github.com/coldshalamov/SpaceFace/blob/d410e64435cf6e30f2587c5ee5f05be8c2a92283/src/ui/station/screens/shipworks.js#L4868-L4870).

- P06: share read-only hull purchase readiness with the authoritative owner; name missing research before enabling Buy. Keep future hulls browsable, any real stock exception, and commit-time revalidation.
- P07: stop appending “Researching” after the synchronous owner already settled success/refusal. Use one truthful terminal outcome; no new timed research mechanic.
- P08 residual: ordinary unfit still emits its intent, plays the success detent and closes the chooser without checking the owner outcome. Preserve the newly shipped buy-fit/fit refusal handling. Make only refused unfit retain the attempted hull/slot/module and explain its reason; successful unfit still closes once. Do not reopen NXI-114 or rebuild wallet rollback.

**Done:** enough money + valid shipyard + missing hull tech gives a named gate; researching enables lawful purchase. Research success/already-known/stale-resource cases never end with false pending state. An unfit invalidated by cargo capacity between render and intent leaves wallet/fit unchanged, with no success detent and the chooser/focus retained; accepted unfit closes once. Existing buy-fit/fit refusal tests remain green as regressions. Extend `test/instrument-hierarchy-three-screens.test.mjs`, `test/shipworks-fit-from-hold.test.mjs` and `scripts/check-outfitting-buy-fit.mjs` as relevant. NXI-114 stays SHIPPED; record the new unfit residual only under the canonical parent, not as a second execution of that child.

## H. Physical previews describe the actual release — C1, C2, C4

**Canonical owner: new board 264, hand seam; coordinate shared fields paths with row 94.** NXB-010 force composition remains shipped. These are prediction/presentation repairs, not changes to live dynamics.

**Start:** `src/systems/masslineThrow.js`, `src/systems/fields.js`, `src/combat/masslineReleaseGeometry.js`, `src/core/fields/fieldKernel.js`, `src/systems/presentationOrchestrator.js`. [Profile](https://github.com/coldshalamov/SpaceFace/blob/74c31b50a94f6c14889f0182b0c7894b63743159/src/systems/masslineThrow.js#L268-L287), [live field profile](https://github.com/coldshalamov/SpaceFace/blob/74c31b50a94f6c14889f0182b0c7894b63743159/src/systems/fields.js#L326-L366), [feedback](https://github.com/coldshalamov/SpaceFace/blob/74c31b50a94f6c14889f0182b0c7894b63743159/src/systems/presentationOrchestrator.js#L1391-L1433).

- C1: require a valid attempted solution before a missed-window cue. A lawful untargeted throw/cut is neutral, not a failed aim. Preserve deliberate aimed misses, ordinary release and earned payoff cues.
- C2: share canonical actual-body response and velocity-sampling semantics, including earned coupling/resistance, boost/hitch, primed and kinematic status. Target selection must not stand in for earned status. Keep any helper read-only and reusable; self-sling extension C3 is held.
- C4: a payload-excluded, zero-force or provably disjoint field must not switch an unchanged ballistic contact from six seconds to a 1.5-second solve. Keep ballistic behavior when no field can apply; conservative relevance must cover the whole predicted corridor. A field ahead is not irrelevant because it misses the starting point. Do not lengthen every expensive solve or weaken relevant-field uncertainty.

**Done:** untargeted RMB and taut F-cut emit no missed cue; valid aimed miss emits one, including replay/reduced-motion handling. Predictor first-step acceleration agrees with production queued-impulse-derived acceleration for ordinary/marked/resistant/boosted/hitch/primed bodies; a short actual trajectory checks composition. Empty/excluded/zero/disjoint fields preserve the ballistic ~4.87-second contact example, while an intersecting ahead-field still affects/downgrades it. Extend `test/fields-predictor.test.mjs`, `test/massline-release-predictor.test.mjs`, `scripts/check-massline-release-feedback.mjs`. Preserve energy, solver mass, determinism, cut authority and cadence; no full-rate universe scan. C5/C6 semantics are not silently added.

## I. Quiet cleanup still respects deadlines — C8

**Canonical owner: board 258, FB-089/FB-090 declared clocks/quiet latches.** Explicit `coreSystem.js` continuation alongside its existing physics/manifest paths.

**Start:** `src/core/coreSystem.js`, lifetime owner/index, `src/systems/swarmArena.js` deadline producer. [Predicate](https://github.com/coldshalamov/SpaceFace/blob/74c31b50a94f6c14889f0182b0c7894b63743159/src/core/coreSystem.js#L15-L49), [sweep](https://github.com/coldshalamov/SpaceFace/blob/74c31b50a94f6c14889f0182b0c7894b63743159/src/core/coreSystem.js#L406-L435).

Include finite-deadline dynamic wrecks/loose asteroids in bounded clock admission so expiry does not depend on an unrelated shot waking the path. Do not disable quiet-clock optimization or introduce a universe scan every tick. This honors existing lifetime, not held C9's new active-wreck protection policy.

**Done:** quiet indexed state with a timed wreck and loose asteroid, no shots/FX/pickups and immortal ships expires both on identical ticks with skip on/off and with/without an unrelated projectile. Destruction occurs exactly once, ownership cleanup/compaction holds, and genuinely idle scenes keep the fast path. Extend `test/lifetime-sweep-quiet-clocks-skip.test.mjs`. Do not claim target-frame improvement from this functional check.
