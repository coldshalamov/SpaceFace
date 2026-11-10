<!-- LIFETIME: CAMPAIGN -->
# W1 STATUS

**Phase: FINAL REVIEW FIXES APPLIED — act framing on Codex/HUD/Journal, durable act state with
transient receipts, story-first board policy, fused March writer, source-stamped player salvage.
Focused W1 47/47; live campaign suite 18/18; board checks green (2026-11-06 final pass).**

## Done (2026-11-06)

1. **Doc phase** (owner approved via "build all the things"): DIAGNOSIS.md, three inventories +
   consolidated INVENTORY.md, JOURNEY.md (4 acts; heist re-scope correction recorded).
2. **Implementation** (commit fe1e3bb, exact paths):
   - `src/data/journeyActs.js` (NEW) — the four-act table, dependency-free.
   - `src/systems/missions.js` — `storyBeatTitle` prefixes the act on story waypoint/tracker
     labels ("The Pit · Cold Start" style).
   - `src/systems/missionStoryOps.js` — the beat-advance toast opens the act by name on act-turn
     beats (B2→Act II, B4→Act III, B6→Act IV).
   - `src/ui/station/stationMissionModel.js` — campaign47a book/chain/intro rows outrank
     procedural board rows and recommend as **THE BOOK**; blocked rows still name the book and
     demand prep; disposition filings are never recommended.
   - `src/systems/stationContacts.js` — `march.reconciliation` writer (aftermath wreck
     recoveries, deduped per wreck) — the last frozen depth counter now moves.
   - `src/data/missionsData.js` (NEW) — verbatim restore of the pure mission data, recovery
     anchor for the unclaimed `data/missions.js` overwrite incident (see NOW.md defect note).
3. **Review closure (2026-11-06, this pass):**
   - Act framing is separate state now: story waypoints carry `{ actNum, actTitle, actLine }`
     and `storyBeatTitle` is the beat name only. The flight tracker paints
     `ACT II - THE CINDER BOARD` as its own line above the objective; the Codex files the
     eight beats under the four acts with goal + verb + one line and no Phase column; the
     Mission Log carries the act as a meta chip on its story action.
   - Every act, including Act I on a fresh save, leaves one `comms:popup` with stable id
     `act:<num>` (`_announceJourneyAct`). `state.story.journeyActs` is the durable surface; the
     popup is transient and Continue does not republish an already-announced act. Act copy is
     assembled through `localizeText`; the generated en-US catalog has no authored
     `ACT n - TITLE` templates yet, so the four headings fall through the dynamic phrase path —
     recorded as a known catalog gap, not reviewed copy.
   - Story-first board policy: `journeyStepCandidate` now excludes `campaign47a:b4:doubled`
     (canonically "never a book step"), requires `campaign47aBeat === state.story.beatIndex`
     and a real id, prefers the first ready journey row over a blocked one, and returns no badge
     at all while the spine is live with no posted journey row (B0/B6 quiet). The journey row
     is explicitly exempt from the first-loop safe-work gate.
   - Blocked book jobs expose `blocker`; the contracts badge paints `PREP FIRST - <blocker>`
     instead of a bare badge.
   - March: only a player recovery (`byPlayer: true`, emitted from `_onSalvageCompleted` when the
     beam stamps `source: 'player_beam'`) files; scavenger strips, gravedigger/booth disposals and
     unknown sourceless producers do not. Dedupe prefers the durable `markerId`
     over a recyclable numeric `wreckId`. The bar Record row now sits before Contact so a war
     tag cannot clip the counter. The finale filters zero-value counters, so March is named only
     when a hull actually moved the counter.
   - Restored the four literal ops spreads on the exported `missions` composite (the init-only
     attach lost ~190 methods to clone-without-init consumers); `init` keeps the idempotent
     re-attach. Guard: `test/w1-missions-spread.test.mjs`.

## Final review fixes (2026-11-06)

1. `scripts/check-codex-narrative.mjs` follows the act era: the retired `Phase` assertion is now
   the live `Act` numeral, with closed-book and sandbox cases proving no act is named after the
   ending.
2. Comms feed starvation: the act popup is transient (`persist` removed), Continue publishes only
   when a pre-W1 save is missing the announced flag, and the four-line live cap yields the oldest
   persistent row rather than dropping the line that just arrived. `test/w1-comms-feed.test.mjs`
   covers four persistent receipts + an ordinary line + two repeated loads.
3. Journal B4 is step-aware: a chosen branch with no active operation names that door's authored
   operation (Spine Break / The Weighing / Barn Raising); the sponsor prompt remains only before
   the choice or while the operation already owns CURRENT ACTION.
4. Codex act rows and the status strip suppress `Current act`/signal after endgame or sandbox,
   matching the HUD and Journal.
5. Mining's player-beam producers stamp `source: 'player_beam'`; `salvageCompletedByPlayer`
   defaults unknown/sourceless events to false while still accepting legacy `'mining'`.
   Gravedigger/booth disposals remain excluded.
6. Localization gap: the four `ACT n - TITLE` headings are still source-composed, so they resolve
   through the dynamic phrase path rather than authored catalog keys. This is recorded as a known
   gap, not reviewed copy.

## Focused verification (2026-11-06 final pass)

- `node scripts/check-codex-narrative.mjs` — OK.
- `node --test test/w1-*.test.mjs` — 47/47 cases (all seven W1 files, including the new
  comms-feed regression).
- `node --test test/story-campaign47a-live.test.mjs` — 18/18 checks, including continuous
  B0→B7, canonical reward grants, ordered mine→skim→dock, B4 door operation, B5 chain count,
  B6 program, B7 endgame, fail/recover, post-ending sandbox and the pinned-branch B7 op.
- `check-mission-board-recommendation`, `check-mission-standing-ladder`,
  `check-mission-receipt-ledger` — all OK.
- `check:player-facing-labels` and `check-ui-screen-imports` (55/0) — OK.
- Codex/screen support: `instrument-hierarchy-two-more-screens`, `galaxy-exploration-journal`,
  `pb-wire-survey`, `pb-wire-rumor` — 15 pass, 1 skip (pre-existing type-floor skip).
- Determinism: `check:sim:compare` and `check:sim:v3:compare` both hash-equal with zero diffs;
  the old extra `comms:popup` on the reload arm is gone now that Continue does not replay the act.
- Not re-run here: the ordinary-route play walk and browser screenshots. The working tree still
  contains foreign edits, so this pass proves the model/contract and the focused modules, not the
  live composed route.

## The W1 Verify play walk (act 1 on the ordinary route)

- **2026-11-07: an ordinary Adventure walk was run** with `node scripts/player-truth/run.mjs
  --mode=adventure --gate` on the published tree: 661 s wall / 300 sim s, 5,047 frames, 180
  screenshots, public controls only. Verdict `INCOMPLETE`, not FAIL:
  - PASS: route (intro → menu → first-run prompt → mode select → preparation → spawn → play),
    player control (2/2 probes), no spawn motion, no tumble, player ship 0.4% bad frames, LOD churn
    0.04/s, popping 3/min, VFX/backdrop coverage, sim not stalled, HUD held.
  - UNKNOWN: readability (0 enemy/asteroid/projectile/pickup samples in the headless software
    renderer), frame_time (SwiftShader; no baseline), offscreen marker (not read). These are
    measurement limits, not route failures.
  - Artifacts: `scratch/player-truth/adventure/verdict.md`, `verdict.json`, `trace.json.gz`,
    `frames/`, `contact-sheet.jpg`.
- This proves the opening is reachable, controllable and stable on the ordinary route. It does not
  yet script the act-specific beats (B0 mine → skim → dock Helios; B1 alloy run → Scale 4) or the
  ten "what do I do next?" moments, so the W1 Verify walk is **partly met, not closed**.
- Interlude reliability (piece 3): wired in code (`missionStoryOps` 4 s scan + retry); its fire-rate
  on the ordinary route remains unmeasured.
- Ten-moments check: pending the scripted act walk. The persistent "what do I do next" surface
  already exists (`_ensureStoryWaypoint` covers every beat incl. world-work steps) and carries the
  act as its own tracker line.

## Resume here (next agent)

1. When the foreign flight/route work settles: run `node scripts/check-game-playable.mjs` (boot
   gate), then walk act 1 fresh-save on the ordinary route with the Browser pane VISIBLE:
   B0 mine → skim → dock Helios; B1 alloy run → Scale 4 → furnace detail; verify the tracker act
   line ("ACT I - THE PIT"), the Codex act groups, the B2 act-turn transient line (ACT II), that
   Continue adds no duplicate act line, interludes firing, and the ten-moments check.
2. Publish W1 doc+impl paths (local master currently ahead of origin with shared commits).
3. Then W5 (first hour, Gold) consumes act 1.

## Paths claimed (NOW.md)

Implementation: `src/data/journeyActs.js`, `src/data/missionsData.js`, `src/systems/missions.js`
(ops spreads + act waypoint fields + beat title only), `src/systems/missionStoryOps.js`
(import, skim-order guard, transient act receipt/turn line, load reconcile), `src/systems/stationContacts.js`
(March listener + handler only), `src/systems/aftermathWrecks.js` (the `byPlayer` receipt on
`_completeByEntity`), `src/systems/mining.js` (`source: 'player_beam'` on the two beam producers),
`src/ui/comms.js` (live-cap overflow policy only), `src/ui/station/stationMissionModel.js`
(recommendation policy only), `src/ui/station/barContacts.js` (Record-before-Contact tag order),
`src/ui/station/screens/contracts.js` (badge blocker paint),
`src/story/endings/finaleContent.js` (zero-counter filter), `src/ui/screens/codex.js` (act grouping,
Status Act row, post-ending suppression), `src/ui/screens/missionLog.js` (act meta chip, B4 door
operation), `src/ui/hud.js` (tracker act paint only), `scripts/check-codex-narrative.mjs`,
`test/w1-*.test.mjs`, `test/story-campaign47a-live.test.mjs`, `finish/campaigns/W1/*`,
NOW.md append-only sections.
`src/data/missions.js` working-tree state belongs to the unclaimed refactor; Lane 5's repairs to
it are recorded in NOW.md and are NOT committed.

## Publish state

Doc phase published (with the 616aecbc tree repair - see git log). Implementation commit
fe1e3bb and the review-closure commits are local; the final review-fix commit is local too.
Publish follows the paths-only procedure; the ordinary-route walk remains unproven.
