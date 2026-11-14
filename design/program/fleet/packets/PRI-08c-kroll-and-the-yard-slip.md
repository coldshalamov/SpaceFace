# PRI-08c — Ceres: Kroll meets you at the door, Kessler reads the yard slip, Breakwater tells the truth (#945, part 3)

**Lane 2. After PRI-06 has landed** (it moves the resident catalog out of `barContacts.js`).
Read `design/program/fleet/PR-INTAKE.md`; the "#945" section of `.devshots/pr-intake/reviews/grunt-ec-a.md`;
the director's card in `design/program/experience-commissions/commissions/sectors/EC-S02-ceres-belt.md`
(faces: **Dessa Kroll**, foreman — *"Nine went in. Nine come out."*; **Old Hob**; **Tally Marsh**, receiver —
*"That's wet. Who sold you wet?"*).

## What the player gets
At a Ceres station Dessa Kroll is a contact who points you at the mine's work (opens the chart on the
place she means). Back at Helios, Kessler's reply about your Ceres shift depends on how it actually ended.
At Breakwater, Nessa describes the real restoration job and where it is, the chart marks the route, and a
broke pilot can buy part of a fuel or repair service.

## Build — three commits
1. **Kroll at the door** — `src/story/ceresArrivalStory.js` (new), the `ceresArrivalChoices` hook in
   `src/ui/station/barContacts.js` (onto master's current file, after PRI-06), `src/ui/galaxyMap.js`
   (`ceresArrivalMapTarget` / `ceresArrivalChartTarget`: a bar referral opens the chart centred on the
   referred place). Tests: `test/ceres-arrival-*.test.mjs`.
2. **The yard slip** — `src/story/ceresShiftReturn.js` (new), `src/systems/stationContacts.js`
   (the `ceres_return_*` choice intercept, receipt on `comms:log`, `ceres_crew_matters` flag),
   `src/ui/station/ceresShiftConversation.js`, the `ceresReturnChoices` hook in `barContacts.js`.
   Test: `test/ceres-shift-return.test.mjs`.
   In `src/ui/station/screens/bar.js` port **only** the request/receipt flow that shows Kessler's answer
   (`ceresPending` / `ceresResponse`). Do **not** port the removal of the reply typewriter, the
   `scrollIntoView` change or the `stationStandard.js` bar CSS — those are a frontend decision the lead
   takes on screen. If the receipt flow cannot work without them, say exactly why under Blocked.
3. **Breakwater** — `src/features/breakwaterSpur/{physical,readModel,runtime,services}.js`:
   truthful pocket direction ("southeast"), `restorationGuidance`, restoration-route chart marks,
   `breakwaterServicePrice` / `affordableBreakwaterServiceUnits` and the budget service menu under the
   nine-slot cap. Tests: `test/breakwater-budget-service.test.mjs`, `test/breakwater-restoration-route.test.mjs`,
   `test/breakwater-spotter.test.mjs`.

## Required corrections
1. **Voices.** Every spoken line is eight words or fewer, in that speaker's voice. Kroll is a foreman who
   counts people: short, dry, about the count and the work (`Count's short. You flying?`). Kessler weighs
   things and is unsurprised (`Braced first. Good. That's the trade.` / `Unbraced cut. It shows on the slip.`).
   Nessa is practical. Rewrite each PR line that runs longer; keep one line per outcome, not a paragraph.
   Detail text on a menu row: one sentence, at most about 60 characters.
2. **Kroll's referral points at real work**: the place the chart opens on must be a live Ceres job this
   program lands (the winching mouth from PRI-08a if present, else the existing shipbreak/sorting site).
   No referral to a place with nothing to do.
3. **Kessler's outcomes come from the real record** of the shift (the workfleet/job owner's saved outcome),
   never from a flag the conversation sets itself. An old save with no recorded Ceres shift shows no
   return choice.
4. **Budget service**: money through economy only, fuel/hull through the station-services writer; a
   partial unit is charged exactly what it delivers; nothing is charged when nothing is delivered.
5. `contact:choice` with a `requestId` crosses the worker boundary the way existing bar choices do — check,
   do not assume.

## Files you may edit
Those named above. Not `src/ui/orrery/stationStandard.js`. Foreign changes in a file: do the others,
re-check every ten minutes for up to thirty, then report Blocked.

## Checks
The named tests after each commit; at the end in one call the existing tests of what you touched
(`grep -ln "barContacts\|stationContacts\|breakwaterSpur\|galaxyMap\|ceresShiftConversation" test/*.mjs`) —
report pass/fail counts; reds already failing on untouched master are reported, not "fixed".
`npm run check:src-imports`. Shoot `node scripts/ui-bench.mjs --shot=station-bar` at desktop and
`--viewport=390x844` into `.devshots/fleet/pri-08c/` and name the PNG paths (the lead opens them).

Commits: `fleet(PRI-08c): <what the player now sees>` ×3.
