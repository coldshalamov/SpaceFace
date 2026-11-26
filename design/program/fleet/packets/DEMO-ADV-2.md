# DEMO-ADV-2 — the Adventure opening speaks with one voice

**For:** a builder agent (code, exact instructions). **Kind:** fixes found by review. Verify each
against the code first, then fix it. Commit your own files.

The Adventure opening: rope the loose rock, throw it, dock at Helios Station, take a first job.
A probe of it (`.devshots/first-ten/me-1/`, facts.words) found:

1. **First instruction flickers in second.** For the first ~1.2 s of a New Game the tracker and
   minimap show the 47-A contract objective ('Recover 47-A from marked rock ↗ 1.1 km', '◆ 47-A
   RECOVERY SITE · 1.1') before the rope lesson takes the slot. Seat the tether waypoint on the
   first flight frame, or hold the tracked-mission waypoint until the onboarding owner has had its
   first tick (src/systems/onboarding.js ~5640).
2. **Four voices during the first throw.** While the lesson says 'Aim at the wreck. Tap RMB to
   throw.' these land within six seconds: 'Level 2: a point to spend in the Pilot Tree (T)',
   'Swing threat detected.', 'Achievement: Light Ships Are Ammunition.', '+1 Salvage Electronics'.
   While the rescue swing beat is current, defer level-up and achievement toasts until the throw
   lands, and drop 'Swing threat detected.' (presentationAdapters 'massline.threat') in the opening
   (src/systems/onboarding.js ~1404 knows the beat).
3. **Berth course retire matches too much.** onboarding.js ~2475-2483 `_retireArrivedBerthCourse`
   deletes any course within station radius + 200 m of the station just docked at, clears
   nav.waypoint without emitting 'nav:waypoint' and leaves nav.route. Match only a course E laid
   (state.ui.berthAutopilotStationId or a flag stamped on the course) and clear through the same
   seam that emits nav:waypoint (see missionObjectiveOps._clearCompletedTradeWaypoint).

Tests: focused tests of every touched file (`grep -rln "onboarding" test | head -40`, run those that
cover the opening); rewrite tests pinning old behaviour with the new rule in the message; never
delete tests. `npm run check:sim` must stay green (do not re-record the golden; if it moves, report).

## You may edit
src/systems/onboarding.js, the presentation adapter that raises 'Swing threat detected.', the toast
admission point (src/ui/toasts.js) only if deferral must live there, and tests. Before editing a
file run `git diff -- <file>`; if it has changes you did not make, use
`bash scripts/fleet/own-commit.sh begin <file>` before and `... commit "<msg>" <file>` after.
Never git add -A, reset, stash, restore or checkout. Do not boot the game.

## Receipt
Protocol headings; per item fixed (commit) / rejected (why); tests; check:sim result.
