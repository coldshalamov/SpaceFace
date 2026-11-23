# DEMO-FIX-ADV-1 — Adventure opening: the review's code-level bugs

**For:** a builder agent (code, exact instructions). **Kind:** bug fixes found by an independent
review, each with evidence. Verify each against the code first, then fix it. Commit your own files.

The Adventure opening: rope the loose rock, throw it, dock at Helios Station, take a first job.

1. **Red test.** test/rc-457-muted-opening.test.mjs ~17 expects 'Latch the loose rock.' but the live
   waypoint says 'Latch the loose rock. (F)' (commit ef8f2a6ef5 taught the key). Set the expected
   line to the taught line and keep the assert that the premise caption never replaces the verb.
2. **Uncommitted onboarding hunk makes Helios the rope's route target.** `git diff -- src/systems/onboarding.js`
   adds `targetEntityId` (the Helios station entity) to the berth and sample-dock waypoints
   (~592, `_stationObjectiveTarget`). masslineTargetScoring.js ~429 then classifies Helios as the
   rope's 'route-anchor' ahead of hostile and tow contexts. Keep the `stationId` lines; DROP the
   `targetEntityId` lines. Its only reader is src/ui/berthOffer.js, which already matches by stationId.
3. **[E] offers a berth in another sector.** src/ui/berthOffer.js ~51 `stationMatchingWaypoint` (and
   `stationByStationId` when used for the offer) match a mission waypoint by stationId or name with
   no sector check, so after the first trade job the chip says '[E] Fly to berth Tethys Trade Hub ·
   15 km' while the tracker says to jump. Skip stations whose `homeSectorId` is not the current
   sector, exactly as `trackedMissionDockableStation` already does. Then run test/hud-flight-helm.test.mjs.
   Commit items 2 and 3 together (they are one change: "the berth chip names the local station").
4. **Skim wrecks spawn against a docked hull.** src/systems/missionStoryOps.js ~2120: since
   cf4d16c55a/23426eef3e the Skim wreck fan is 44-93 m ahead of the ship for both variants; in the
   `where === 'dock'` variant the ship is berthed at Helios (size L), so the 40,000-mass wrecks spawn
   against the station. For 'dock' keep the old outward ring (140-240 m) or place the fan beyond the
   station radius plus a margin on the undock line; keep the close fan for 'lane' only.
5. **Two distances to the same place.** After the throw the tracker says 'Dock at Helios Station ↗
   456 m' and the [E] chip 'Helios Station · 396 m' (onboarding ~5741 measures to the dock anchor,
   the chip to the station centre). Make the chip measure to the same berth anchor.
6. **A raw id in a bark.** A miner bark reads 'holding at helios_seam_ore_face until it clears'. Find
   the bark (grep "holding at") and print the seam's display name, never its id.

## You may edit
src/systems/onboarding.js, src/ui/berthOffer.js, src/systems/missionStoryOps.js, the bark's source
file, and their tests. Before editing a file run `git diff -- <file>`; if it has changes you did not
make (onboarding.js and berthOffer.js DO — items 2 and 3 are about exactly those changes, so finish
them rather than protect them), use `bash scripts/fleet/own-commit.sh begin <file>` before and
`... commit "<msg>" <file>` after for any OTHER file. Never git add -A, reset, stash, restore or
checkout. Do not boot the game. Plain-English commit messages saying what the player now gets.

## Receipt
Protocol headings; per item fixed (commit) / rejected (why); tests run.
