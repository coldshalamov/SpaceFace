# Menu and Swarm preparation: regression review

**Review date:** 2026-11-17. **Inspected baseline:**
[`4bbe545d550a4c43e720df18c254b1c8d190d8a1`](https://github.com/coldshalamov/SpaceFace/commit/4bbe545d550a4c43e720df18c254b1c8d190d8a1).
This is a focused engineering and player-experience review, not a whole-game verdict or a claim
that the replacement has passed playtesting. The owner's screenshots establish the reported
experience; the source and commit diffs below establish its causes. Implementation verification
belongs in the accompanying change's test results and visual evidence.

The current product direction is
[The first hour — owner correction](../../design/game/20_THE_FIRST_HOUR.md#owner-correction--2026-11-17-prepare-the-ship-before-launch).
This review explains why that correction was necessary; it does not create a second design authority.

## Finding

The reported problems are not merely a disagreement about taste. The title paints a large,
interactive-looking card whose clickable element occupies only its text row. Swarm's main entry
hides the ship-selection interface behind a secondary control. The preparation screen labels
mechanics in internal vocabulary and gives the arena the dominant preview before the player has
chosen the ship. Those are identifiable failures of input geometry, decision order, and explanation.

There is evidence of repeated redesign and of a specific regression caused by a layout fix. This
review did not count or validate the claim of fifty complete overhauls. It also does not claim
that every earlier menu was superior: the source records fixes for real clipping, overlap, save,
and navigation defects alongside the replacements.

## Evidence: what changed

Dates below are commit dates, not inferred deployment dates. Links identify immutable commits.

| Change | Verified consequence | Evidence |
|---|---|---|
| 2026-09-29: stakes and opening armory | Difficulty was modeled as starting credits, enemy concurrency/round quota, and round rewards. The public labels and metaphorical descriptions originated alongside those mechanics. | [`3f6864322f`](https://github.com/coldshalamov/SpaceFace/commit/3f6864322fe3ba9c6efb0c61cd0709b5a2e431ae), especially `src/data/swarmStakes.js` |
| 2026-10-09: preparation organized into steps | The existing work already separated encounter and ship panels, showed a selected-ship preview, and added fitting and purchase explanations. Despite “ship-first” in the subject, the described order was fight, ship, armory. This was useful infrastructure to improve, not an absence requiring a blank new menu. | [`4b8382ee4c`](https://github.com/coldshalamov/SpaceFace/commit/4b8382ee4cb069eec306eb3b4d939ab56f7401e8) |
| 2026-11-06: title Swarm launches directly | A fixed Ricochet Runner/Foundry/Contender record bypassed the opening armory through `openArmoryBeforeRound1: false`. Its tests deliberately asserted that the opening draft was never entered. | [`33070ad086`](https://github.com/coldshalamov/SpaceFace/commit/33070ad086c12870c2bee16db32e89bd0ebeb7fd), `test/swarm-quick-start.test.mjs` |
| 2026-11-13: one-button Swarm splash | The title route was changed to a PLAY state with default equipment and a quiet Customise action exposing the existing full preparation screen. | [`27d2601a96`](https://github.com/coldshalamov/SpaceFace/commit/27d2601a967b597a9528b4e2154cd926878a7499) |
| 2026-11-13: title becomes two cards | The title's arc rail was removed; primary modes became two doors with the other modes behind More. The title source test was changed from requiring the arc rail to requiring its absence. | [`8eee432616`](https://github.com/coldshalamov/SpaceFace/commit/8eee432616e93a79234c470a704615c7a9ba09bc) |
| 2026-11-14 UTC: short-window text-overlap fix | Border, background, height and padding moved from the native button onto its containing list item. The button became a zero-padded text-height block. The visual card remained large while the clickable area shrank. | [`731cbaefec`](https://github.com/coldshalamov/SpaceFace/commit/731cbaefece5224776bc06d9cfe0b9ebbdeeefbe) |
| 2026-11-14: playable probe matches accessibility text | The probe was updated to find buttons by their accessible name and then invoked `b.click()` in page JavaScript. This can verify a handler but cannot detect the dead area of a visually larger card. | [`08c6b06898`](https://github.com/coldshalamov/SpaceFace/commit/08c6b0689809339ad894136bec00933a830ec165) |
| 2026-11-15: cards become larger and acquire images | The art improved, but remained attached to the list item. The text-sized button geometry persisted, increasing the difference between the visible control and its activation target. | [`cf189b760f`](https://github.com/coldshalamov/SpaceFace/commit/cf189b760f06cc53fd6c419ad3f79bd401e79bfe) |

## 1. The title's click failure is a geometry mismatch

At the inspected baseline,
[`titleDoorsLayouts.js`](../../src/ui/orrery/titleDoorsLayouts.js) puts the image, border,
clipped corner, minimum height and substantial padding on `li.of-title-door`. Its direct child
button is `display:block`, `width:100%`, and `padding:0`, without matching the list item's height.
The description is a sibling, not part of the button.

[`words()`](../../src/ui/kit/dom.js) attaches its click listener only to the button. It does not
make the enclosing list item actionable. A pointer can therefore illuminate the card's hover
style without landing on anything that activates the mode. The screenshot's text selection is
consistent with the separately selectable text, but adding `user-select:none` alone would only
hide that symptom. It would leave the card's dead area intact.

**Required outcome:** one semantic button owns the whole visible control, including image,
label, description and internal padding. Pointer activation at several points inside its visible
boundary and Enter/Space activation must reach the same route. Hover, focus, pressed, selected,
and unavailable states need to be visible and distinguishable. Text-entry and intentionally
copyable fields must retain normal text behavior.

A browser test should click a point in the image, one in the description, and one in the internal
padding, with a reset to the same screen between activations. Calling the node's `.click()` or
clicking only its label is not a test of this bug.

## 2. The preparation detour was prescribed by the active design

Before this correction,
[`20_THE_FIRST_HOUR.md`](../../design/game/20_THE_FIRST_HOUR.md) explicitly prescribed PLAY with
default equipment and put modes, difficulty, arenas and kit behind Customise. Its prohibition
against three setup screens and an unconditional thirty-seconds-from-title target encouraged
reducing preparation rather than making it desirable and understandable. The TITLE-01 row in
[`fleet/QUEUE.md`](../../design/program/fleet/QUEUE.md) repeated the same default-launch direction.
The runtime implementation faithfully followed that instruction.

This is why a stylesheet-only repair would not be durable. A later agent reading the design
could reasonably restore the bypass and call it compliance. The authority and queue must change
with the code. Both now point to the owner's 2026-11-17 ship-first direction.

The intended route is a hangar showing the selected ship and starting kit, then arena and
explained difficulty, then the canonical opening armory with equipment and supplies, then an
explicit Deploy. A preselected recommended fit is useful; hiding what it is before launch is not.
Returning players should retain their choices. Advanced challenges and records remain available
without being presented as equipment purchases.

This keeps the existing runtime ownership: the ship, loadout, wallet and run-state owners still
perform the actual changes. The new front end must not invent a second purchase or launch state
that only looks right in the menu.

## 3. The wording describes implementation concepts instead of player decisions

The old labels are not meaningless to their authors, but their meaning requires information the
screen fails to supply. At the inspected baseline, difficulty is presented as Stake, the run's
starting credits as a purse, and enemy amount as pressure. The four themed labels do not by
themselves communicate easy/normal/hard behavior.

[`swarmStakes.js`](../../src/data/swarmStakes.js) gives a precise explanation in its code comments:
pressure scales simultaneous enemies and the round quota, not their individual health, speed or
damage. That distinction belongs in the player-facing explanation. The setup should also explain
starting credits, rewards and score effects without requiring the player to translate several
multipliers and a metaphor.

At that baseline, [`cruciblePreparation.js`](../../src/ui/orrery/cruciblePreparation.js) unconditionally displayed
“Today”, a UTC date and a seed whenever the daily snapshot exists, even during ordinary setup.
Its summary prints the currently selected arena in large type; changing difficulty does not
change the arena. That behavior is logically consistent but poorly communicated: without an
Arena label and a separate difficulty description, the unchanging Foundry heading appears to be
the response to every control.

Practice/training needs an explicit description of what changes and whether the result is ranked.
A bare ON/OFF label explains neither. Seeds and internal IDs belong in a deliberately opened
advanced/share surface. Mechanical descriptions should precede flavor text; flavor cannot
substitute for the information necessary to make a choice.

## 4. Some checks preserved an implementation instead of its useful behavior

[`test/title-field-hardware.test.mjs`](../../test/title-field-hardware.test.mjs) states a valuable
intent: the title should stand on a scene and its actions should feel like controls. Its checks,
however, largely match source strings. When the design changed, the assertion requiring
`createArcRail` was replaced with an assertion forbidding it. Neither version establishes that
the player can activate the visible area or recognize the next action.

[`test/title-doors-route.test.mjs`](../../test/title-doors-route.test.mjs) uses a fake page to check
the helper's selector sequence. That is a valid helper unit test, but it is not proof of visible
hit targets, focus order, clipping or launch comprehension.

The quick-start test genuinely exercises runtime phase transitions, but its contract was the
opposite of the newly requested preparation flow. Such a test can remain appropriate for an
explicitly selected retry/preset path. It cannot be cited as evidence that a new player has seen
or chosen their ship.

The conclusion is not “tests are useless.” Each check answers a smaller question than the product
claim made on its behalf. The remedy is a small set of behavior checks at the specific failure
boundaries, accompanied by visual review of the ordinary route.

## Acceptance invariants for the revised route

These are the checks the implementation should satisfy, not assertions that this review has
already run them. The product contract remains in doc 20.

| Invariant | Evidence that can establish it |
|---|---|
| The title control works across its whole visible interior | Real browser pointer clicks at image, description and padding positions; one activation each |
| Pointer, keyboard and controller/touch where supported reach the same choices | Native activation and focus checks on the public route; visible feedback captures |
| Swarm opens on the selected ship and its kit | Fresh-profile route capture; no hidden bypass before preparation |
| Hull changes are real | Choose two different hulls; observe preview/model identity and the runtime hull, not just changed text |
| Kit changes are real | Compare fitted slots and runtime equipment; equipment indication in preview updates with selection |
| Difficulty is comprehensible and truthful | Visible description names enemy amount, credits and applicable reward/score effects; chosen values reach run setup |
| Purchases use the selected ship and the proper wallet | Open the canonical armory, equip an affordable item, observe the slot and run-wallet change; Adventure credits unaffected |
| Combat starts only after preparation is accepted | Observe run phase before and after Deploy, with the selected hull and fit preserved; repeated Escape/controller Cancel never deploys, including at zero credits |
| Back and retry preserve or explain changes | Navigate between setup sections; retry/change loadout; purchases are retained or explicitly discarded according to run ownership |
| Core controls fit supported sizes | Screenshots at 1920×1080, 1440×900, 960×540 and 390×844; no hidden primary action or overlapping prices |
| Basic setup contains player language | Review actual visible strings; no seed, raw ID, implementation label or unexplained training toggle |
| Visual improvements accumulate | Compare the same states before/after, record retained elements and changed decisions, and correct the authority rather than silently rewriting the baseline |

## Implementation evidence record

The accompanying implementation must report its actual checks and captures separately from this
historical diagnosis. A passing import/unit check, an inspected screenshot, a successful purchase,
and a completed title-to-combat route are four different claims. Record which were observed and
any environment limitation; do not convert a harness screenshot into a gameplay claim.

[`scripts/check-swarm-hangar-ux.mjs`](../../scripts/check-swarm-hangar-ux.mjs) now supplies the
focused interaction probe. Its actor uses real pointer coordinates and Tab/Enter/Space; the DOM,
bench log and runtime state are read-only observers. The default pass mounts the actual title and
hangar screens at the four sizes above and checks image/description/padding activation, visible
keyboard focus, suppressed menu selection, editable input selection, distinct hull portraits,
selected preview identity, changed kit manifest, preserved choices between sections, changed
arena/difficulty and one equipment-review intent. It saves screenshots and a structured verdict
under `.devshots/swarm-hangar-ux/`. Arena checks wait for the selected caption to settle. Ship
captures wait for a decoded poster matching the selected hull or the stage owner's authored live
canvas; the structured evidence records whether each preview was a fallback image or live render.

The prepared optional `--live` pass boots a fresh profile through the public title route, chooses
an equipped alternate hull, and opens the canonical armory. Its public actor inspects and buys an
affordable weapon; its observers verify the accepted receipt, exact run-wallet debit and fitted
slot. It then uses Back to hangar, checks retained choices and unchanged permanent progress,
reopens equipment with the original allowance and loadout, and buys again before explicit
keyboard deployment. Two Escape presses must leave the run in draft. The final observers require
the chosen hull and purchased equipment in flight, authored-asset readiness and advancing
submitted simulation frames. **At the evidence record through head `7994b0a6db5b3ae1ade046ba5fe2d5e840b5c446`, this expanded
live pass had not passed in a browser.** Its code and unit coverage do not replace that missing
result; later exact-head outcomes belong in the PR check record. Controller/touch behavior, rendered model
quality and visual judgment also remain separate from DOM or state assertions.

Run it under the repository's game lock:

```sh
node scripts/fleet/game-lock.mjs run -- node scripts/check-swarm-hangar-ux.mjs --live
```

Local browser automation is blocked in this environment, so actual Chromium captures and native
input checks run through the GitHub Actions UI review. Captures from three revisions were
inspected and used to improve the implementation; none is reported as a completed native journey:

- [Run 44176198925](https://github.com/coldshalamov/SpaceFace/actions/runs/44176198925), head
  `6ceb84c219543646702161fffa043164850122bc`: real title, hangar and armory arrivals were captured.
  The native journey stopped on disabled title controls because the bench incorrectly equated
  registered-screen availability with a nonempty screen stack. The bench now checks its actual
  lazy registry, matching production. The controls' readiness guard was retained.
- [Run 44179379386](https://github.com/coldshalamov/SpaceFace/actions/runs/44179379386), head
  `38a403d5582e528d21cb03b230547db2f23a4511`: native input reached the hangar, selected Hitch and
  changed its loadout, captured its live authored model, and selected Normal difficulty. The probe
  then re-evaluated an “unselected difficulty” locator against a different button. Targets now
  retain their stable data identity before input; the selected-state assertions remain strict.
  The same run's draft phone walk reported an aborted render-package request. It remains a
  failed historical result: that artifact did not record enough timing to establish the cause.
- [Run 44182977357](https://github.com/coldshalamov/SpaceFace/actions/runs/44182977357), head
  `7994b0a6db5b3ae1ade046ba5fe2d5e840b5c446`: the native route reached selected-ship readiness.
  Its equipment diagnostic measured seven visible items and zero positive-area cross-item
  collisions; finite-animation observations were empty before and after settlement. There were
  no recorded browser exceptions or failed requests. The next `page.screenshot` call exceeded
  its 15-second deadline after fonts had loaded. A later failure screenshot succeeded. The
  actual `checks.json` is `pass:false`, with no completed viewport verdict. Arrivals artifact
  `14371629691` contains this evidence; it does not establish a complete four-size journey.

The third revision's final required-evidence outcomes were also inspected, rather than treating
the normalized `continue-on-error` step conclusion as a pass:

| Fixture / job | Actual remaining failure at head `7994b0a6` |
|---|---|
| Hangar, `134392206271` | Native capture timeout; the independent phone control walk exceeded its 240,000 ms cell deadline at control 26; unmapped `src/ui/uiRoot.js`. |
| Opening equipment, `134392206279` | Unmapped `src/ui/uiRoot.js` only. Arrival and walk phases completed, with no request failures recorded. |
| Round equipment, `134392206368` | Desktop walk with one aborted request; unmapped `src/ui/uiRoot.js`. |
| Title, `134392206323` | Desktop walk with 29 aborted requests; unmapped `src/ui/uiRoot.js`. |
| Title with a save, `134392206266` | Desktop and phone walks with 64 aborted requests; unmapped `src/ui/uiRoot.js`. |

The title walk's new provenance gives a specific causal boundary: all 29 failures belonged to
document generation 2 and arrived at `21:46:48.815Z`, during main navigation generation 3. That
navigation had requested the same title fixture at `.578Z` and committed its replacement at
`.823Z`. The report retains each URL and timestamp. This is evidence of the bench replacing its
old document, not grounds for a blanket exception for aborted ship assets. The draft and
title-save failures are not reclassified as passing by analogy.

Visual inspection of those captures also led to a compact horizontal ship rack on phones, with
the selected ship immediately below it; correction of a legacy oversized title; and exclusion of
the new hangar from obsolete door rules that hid arena art and faded its caption. The current
probe records equipment-card and text-line geometry and observes finite animation completion so
an apparent equipment-label overprint can be diagnosed from both layout and pixels.

### Prepared corrections after the third capture

The following changes are prepared for the next revision. They are **not** a successful rerun of
head `7994b0a6`, and the full native and live-route verdicts remain pending:

- The existing bench arrival helper now marks its own document replacement explicitly.
  Request classification requires that marker, a verified committed replacement of the exact
  fixture, an old-main-document GET, exact `net::ERR_ABORTED`, and event timing within that
  completed navigation. Proven cancellations remain in `navigationCancellations` with their
  full provenance. Current-document aborts, unmarked navigation, POSTs, HTTP failures, failed
  navigation and other network errors remain failures; diagnostic capacity is bounded and
  excess/unproven errors remain red. This does not waive any historical failed run.
- `src/ui/uiRoot.js`, changed by the acknowledged return-to-hangar route, now maps explicitly
  to the complete fixture set. The correction removes the unmapped-owner error without
  removing selected coverage. Priority order puts hangar, opening equipment, title, round
  equipment and saved title first.
- Screenshot readback has a separate 60-second deadline and records capture duration. The
  15-second bench and 20-second live input/readiness defaults are unchanged. No animation is
  forcibly finished or paused to make the new native probe pass. The separate phone-walk
  deadline failure above remains an incomplete check, not a successful native interaction.
- Production bundling exposed a preexisting `const sab` followed by `sab = false` in
  [`simLaneMain.js`](../../src/core/simLaneMain.js). Both statements are present at the inspected
  immutable baseline. The prepared `let` correction permits the existing SharedArrayBuffer
  fallback branch; it does not alter lane selection or introduce a new fallback policy.
- The optional Circuit invitation is separated from equipment into a collapsed **Optional run
  format** disclosure, with a literal description of its 16 rounds and four stages. Required
  Circuit route decisions open that disclosure when applicable. This addresses the observed
  mixing of run rules with shopping; its revised appearance still needs a capture.
- Empty equipment cells use subdued text/icon colors rather than whole-card opacity, and the
  manifest receives a nonshrinking 190-pixel maximum scroll area. The third run's zero measured
  overlap does not prove that every suspicious pixel was resolved. These further appearance
  changes require fresh screenshot inspection.

Independent source review checked the expanded live purchase and return selectors against their
actual owners. The observer subscribes to the cancellation receipt before the public Back action;
it does not issue a cancellation or mutate run state. That review caught two preparation gaps:
the cached hangar now restores the ship step while preserving choices, and the live observer now
attributes only requests already in flight before a transition, leaving newly started requests
strict throughout purchase and launch waits. Worker reporting reads the actual context lane.
These are prepared corrections, not a public title-to-purchase-to-combat pass.

The latest native verdicts, exact revisions and reviewed artifacts belong to
[draft PR 1119](https://github.com/coldshalamov/SpaceFace/pull/1119). These fixture runs do not establish
that the optional title-to-combat `--live` route ran. A screenshot is visual evidence for its
captured state, not proof of purchase accounting or subsequent gameplay.

### Returning from opening equipment preparation

The opening armory now exposes **Back to hangar**, with a visible explanation that it discards
purchases from this preparation and keeps the ship and run settings. It is offered only before
that run has planned its first round, including checkpoint openings. The existing run owner
validates the current retirement token and returns an authoritative cancellation receipt before
the UI navigates. Cancellation uses existing teardown, publishes no result or record, awards no
payout, and cannot cancel a newer run. The UI returns to the cached hangar through the ordinary
exit boundary and real screen manager, including deferred registration.

An outstanding GPU-warm launch is bound to the exact run, wave, preparation, worker generation
and screen lifetime. Cancelling or hiding its preparation invalidates that continuation, preventing
an old loading promise from deploying a successor run.

A targeted batch of **85 owner, native-worker, armory, ScreenManager and save-protection tests**
passed. After listener cleanup, its affected **31 lifecycle tests** passed again; these counts
overlap and are not additive. The native-worker cancellation test buys real equipment and verifies
the terminal snapshot and receipt while paused, no result or persistent settlement, preservation
of a pre-existing 680-credit balance, and normal starting funds/equipment when preparing again.
The deterministic 47-A uninterrupted-versus-reload comparison also passed with identical hashes.
The dedicated `crucible-opening` fixture captures the return control separately from the existing
round-three armory; both fixtures preserve their actual run-state owners.

The initial request-provenance batch passed **11 focused tests**. Its expanded navigation-marker
and classification batch passed **14 focused tests**, including marker cleanup after a failed
navigation, a proven reload cancellation retained as diagnostic evidence, and sixteen adverse
classification cases. These two batches overlap and are not additive. The unlock-description
suite separately passed **15 tests** against the actual catalog conditions. No broad aborted-
request exemption was added.

The targeted ship-stat, hangar-adapter, bench-registry and opening-fixture batch passed **28 tests**.
The stat labels now distinguish firing endurance, equipment energy reserve, towing and ramming
according to the value actually computed; the underlying scales and balance are unchanged.

The following focused Node checks have run:

- A consolidated integration run of fifteen changed/new focused suites passed all **78 checks**,
  including the ten fleet-gate tests. Earlier scoped results below overlap that consolidated run
  and must not be added to it as independent coverage. Counts here describe executed batches;
  no deduplicated grand total is claimed.
- `node --test test/crucible-opening-lesson-choice.test.mjs test/crucible-speculation-lifecycle.test.mjs`
  — four passes. They preserve the optional tutorial choice, retain the opening armory by default,
  and verify activation/release/disposal of the selected-ship preview at screen lifecycle boundaries.
- `node --test --test-name-pattern='stakes are pure|catalog gun carries' test/crucible-swarm-program.test.mjs`
  — two passes. They compare displayed budgets, enemy-count effects and reward/score multipliers
  with the canonical difficulty data, retaining internal IDs and normalization behavior.
- `node --test test/crucible-draft-armory.test.mjs` — twelve passes. Repeated keyboard/controller
  Cancel never deploys in Swarm, including with zero credits, an empty shelf and after a purchase.
  The explicit forward control still issues the existing deployment intent. Hidden screens do
  not answer Cancel, search Escape still clears the field, and Gauntlet Rearm retains its behavior.
- The integration batch comprising `crucible-visual-preparation`, `crucible-prepared-loadout`,
  `swarm-armory-launch-opts`, `crucible-arena-catalog`, `crucible-swarm-screens` and
  `swarm-hangar-hull-rack` — forty-six existing checks passed. These cover canonical setup and
  armory launch options, slot/loadout projection, arena availability and existing Swarm ownership
  behavior. They do not establish rendered appearance.
- `node --test test/fleet-gate.test.mjs` — ten passes, including a deliberately failed native menu
  journey that must stop the stability gate and must never be reported as green.
- Two changed, targeted cases in `gold-453-cabinet.test.mjs` passed. This records those cases only,
  without implying that an unexecuted full-suite run passed.

Changed-source import validation found zero unresolved imports. The changed UI files' type-size
scan examined 88 declarations and found zero violations. The repository-wide import check remains
blocked by three preexisting missing imports in the `fieldBuild` area; their target files are
absent at the inspected HEAD. The repository-wide type check also reports the preexisting `11px`
declaration in [`mobileFlightLayouts.js`](../../src/ui/orrery/mobileFlightLayouts.js), line 155.
These broader checks are not represented as passing, and the full local gate is not green.

### Regression integration review

The new `npm run check:swarm-hangar-ux` command is included as `menu-journey` in the full stability
gate. Quick mode retains its existing two-step scope. The existing UI PR review workflow now maps
the title, hangar and armory owners to their fixtures. Title-only changes also select
`crucible-door`, ensuring the real-input title/hangar check runs for the original hit-target seam.

The workflow runs `menu_journey` under the shared game lock for that fixture. Its temporary
`continue-on-error` setting permits later evidence collection, while the final step requires its
actual outcome to be `success`; failure, timeout, skipped or missing execution cannot produce a
passing fixture. The always-run arrivals upload includes the journey's log, captures and structured
verdict. This is fixture evidence, not an implicit claim that the optional live route ran.

Read-only review parsed the YAML, syntax-checked all 16 Bash steps, compiled the four embedded
Python blocks and syntax-checked the gate module. Git's own `sparse-checkout check-rules` confirmed
that the Crucible fixture's expanded rules include all 2,480 checked tracked release-ship/UI asset
paths and ten required journey/bench source paths. The additional ship parts and render packages
are fetched only for Crucible fixtures. This verifies checkout selection, not browser asset
loading; required runtime asset failures must still fail the ensuing CI run.

An initial broader run of `crucible-swarm-program.test.mjs` also found two event-scheduler failures
outside the menu change: the wave-12 minor event is absent, and the seeded `sling_gust` draw is
absent. Both were reproduced against immutable commit
[`4bbe545d550a4c43e720df18c254b1c8d190d8a1`](https://github.com/coldshalamov/SpaceFace/commit/4bbe545d550a4c43e720df18c254b1c8d190d8a1)
using a read-only module loader that obtains the test and all repository JS/JSON modules through
`git show` at that commit. Working-tree source was not replaced. The command output and failures
were observed in the review session. The temporary local evidence file is no longer present;
this report does not claim a retained artifact. These failures remain unfixed and are not counted
as passing UI validation.

A future change may revise the layout or appearance when there is a concrete player benefit.
It must preserve the decision order, truthful selected ship/equipment, full-control interaction,
and visibility of essential actions unless a newer owner decision explicitly changes that
contract. More prose, more screenshots, or a stronger adjective in a commit message do not
compensate for losing those properties.
