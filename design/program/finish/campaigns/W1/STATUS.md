<!-- LIFETIME: CAMPAIGN -->
# W1 STATUS

**Phase: REVIEW-CLOSED IMPLEMENTATION — act framing on Codex/HUD/Journal, durable act
receipts, story-first board policy, fused March writer. Live campaign suite 18/18; W1 + board
checks green (2026-11-06 review pass).**

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
   - Every act, including Act I on a fresh save, leaves one persistent `comms:popup` with
     stable id `act:<num>` (`_announceJourneyAct`), so a dock modal or a missed toast cannot
     hide the Act IV turn line. Act copy is assembled through `localizeText`; the generated
     en-US catalog has no authored act keys yet, so localization falls through the dynamic
     phrase path — recorded as a known catalog bypass, not a second system.
   - Story-first board policy: `journeyStepCandidate` now excludes `campaign47a:b4:doubled`
     (canonically "never a book step"), requires `campaign47aBeat === state.story.beatIndex`
     and a real id, prefers the first ready journey row over a blocked one, and returns no badge
     at all while the spine is live with no posted journey row (B0/B6 quiet). The journey row
     is explicitly exempt from the first-loop safe-work gate.
   - Blocked book jobs expose `blocker`; the contracts badge paints `PREP FIRST - <blocker>`
     instead of a bare badge.
   - March: only a player recovery (`byPlayer: true`, emitted from `_onSalvageCompleted`) files;
     scavenger strips and site auto-reconciles do not. Dedupe prefers the durable `markerId`
     over a recyclable numeric `wreckId`. The bar Record row now sits before Contact so a war
     tag cannot clip the counter. The finale filters zero-value counters, so March is named only
     when a hull actually moved the counter.
   - Restored the four literal ops spreads on the exported `missions` composite (the init-only
     attach lost ~190 methods to clone-without-init consumers); `init` keeps the idempotent
     re-attach. Guard: `test/w1-missions-spread.test.mjs`.

## Focused verification (2026-11-06 review pass)

- `test/story-campaign47a-live.test.mjs` — 18/18 checks, including continuous B0→B7, canonical
  reward grants, ordered mine→skim→dock, B4 door operation, B5 chain count, B6 program, B7
  endgame, fail/recover, post-ending sandbox and the pinned-branch B7 op.
- `test/w1-journey-framing.test.mjs` + `test/w1-march-reconciliation.test.mjs` +
  `test/w1-missions-spread.test.mjs` — green (act tiling/null, tracker line, Codex/HUD copy,
  board exclusion/quiet/prep rules, Act I and act-turn receipts, March player-only/marker
  dedupe/save-load/seed, spread guard).
- Requested board/story files — green; `check-mission-board-recommendation`,
  `check-mission-standing-ladder`, `check-mission-receipt-ledger` all OK.
- `test/b0-one-verb.test.mjs` still fails its pre-existing onboarding-panel source assertion
  (`_beatPanelYields` form); not touched by W1 and excluded from this change set.

## Blocked: the W1 Verify play walk (act 1 on the ordinary route)

- The working tree's `game:new → flight` transition is broken by foreign in-flight edits
  (~25 modified src files owned by other lanes: world.js, input.js, bootMediaPlayback.js,
  swarmBrood, waveMaterialization, renderer, orrery, …). Evidence: `check-game-playable` BOOT
  fails (sf:false at 60 s) with zero uncaught errors and all assets served; a direct CDP probe
  shows the sim lane starts and three.quarks loads but flight mode never arrives after
  `game:new`; `capture-gameplay` reproduces on a live server. A/B with HEAD versions of my
  files reproduces identically — not this change set.
- Interlude reliability (piece 3): wired in code (`missionStoryOps` 4 s scan + retry); its
  fire-rate on the ordinary route is part of the blocked play walk.
- Ten-moments check: pending the same walk. The persistent "what do I do next" surface already
  exists (`_ensureStoryWaypoint` covers every beat incl. world-work steps) and now carries the
  act as its own tracker line.

## Resume here (next agent)

1. When the foreign flight-mode breakage lands/heals: run `node scripts/check-game-playable.mjs`
   (boot gate), then walk act 1 fresh-save on the ordinary route with the Browser pane VISIBLE:
   B0 mine → skim → dock Helios; B1 alloy run → Scale 4 → furnace detail; verify the tracker act
   line ("ACT I - THE PIT"), the Codex act groups, the B2 act-turn persistent receipt (ACT II),
   interludes firing, and the ten-moments check.
2. Publish W1 doc+impl paths (local master currently ahead of origin with shared commits).
3. Then W5 (first hour, Gold) consumes act 1.

## Paths claimed (NOW.md)

Implementation: `src/data/journeyActs.js`, `src/data/missionsData.js`, `src/systems/missions.js`
(ops spreads + act waypoint fields + beat title only), `src/systems/missionStoryOps.js`
(import, skim-order guard, act receipt/turn line), `src/systems/stationContacts.js` (March
listener + handler only), `src/systems/aftermathWrecks.js` (the `byPlayer` receipt on
`_completeByEntity`), `src/ui/station/stationMissionModel.js` (recommendation policy only),
`src/ui/station/barContacts.js` (Record-before-Contact tag order), `src/ui/station/screens/contracts.js`
(badge blocker paint), `src/story/endings/finaleContent.js` (zero-counter filter),
`src/ui/screens/codex.js` (act grouping; Phase column removed), `src/ui/screens/missionLog.js`
(act meta chip), `src/ui/hud.js` (tracker act paint only), `test/w1-*.test.mjs`,
`test/story-campaign47a-live.test.mjs`, `finish/campaigns/W1/*`, NOW.md append-only sections.
`src/data/missions.js` working-tree state belongs to the unclaimed refactor; Lane 5's repairs to
it are recorded in NOW.md and are NOT committed.

## Publish state

Doc phase published (with the 616aecbc tree repair - see git log). Implementation commit
fe1e3bb is local; this review-closure commit is local too. Publish follows the paths-only
procedure when the W1 play walk and the shared-checkout flight breakage clear.
