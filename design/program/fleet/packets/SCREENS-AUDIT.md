# SCREENS-AUDIT — every screen shot, measured and looked at

**For:** an agent with eyes. **Kind:** read-only audit. **No source edits. No commit.** Write the
report file early and keep adding to it.

## Why

The owner (2026-11-20): "there's probably a lot about the UI and the menus that maybe we could
upgrade." Before designers rebuild screens we need one honest list of what is wrong on each, so
the work goes where it matters. The bar is a game a stranger would pay $40 for.

## Do

1. `node scripts/ui-bench.mjs --list` prints every screen id. Shoot them all, in batches of about
   eight ids so no single command runs long, at two sizes:
   `node scripts/ui-bench.mjs --shot=<ids> --viewports=1280x720,1366x768 --out=.devshots/screens-audit/<batch>`
   The bench shoots the real screen over a still in seconds; it does not boot the game. Each batch
   writes a `report.json` with measured findings (text printed on top of other text, buried or
   unreachable controls, cut-off or off-screen type, empty boxes).
2. Open every PNG and look at it. For each screen note, in plain words:
   - what the screen is for and whether a stranger could tell in three seconds;
   - the primary action and whether it is obvious;
   - measured findings from `report.json`;
   - what you see that the bench cannot measure: clutter, too many equal-weight buttons, walls of
     small text, mixed styles between screens, placeholder art or empty panels, jargon or internal
     names, inconsistent units, anything that looks unfinished or cheap, anything that looks great
     and should set the standard;
   - a score from 1 (embarrassing) to 5 (would ship in a $40 game).
3. Skip the flight HUD, the map and the docked station screens (other agents are rebuilding them
   now): ids starting `flight`, `power-rail`, `crucibleHud`, `orrery-flight`, `chart`, `galaxyMap`,
   `localmap`, `starmap`, `station`.

## Report

Write `.devshots/director/fable/screens/AUDIT.md` (create the folder):

- **A table of every screen**: id, purpose, score, measured findings count, the single worst thing.
- **The ten worst screens**, each with a paragraph on what is wrong and the frame path.
- **The five best**, and what they do right that the others should copy.
- **Faults that repeat across screens** (the same overlap, the same jargon, the same style drift),
  each with the screens it appears on. These are the cheapest wins.
- **Groups**: which screens belong together as one job for a designer (front door: title, menu,
  new game, settings, save and load, help, credits; Swarm: door, draft, refit, cards, results;
  records: codex, mission log, achievements, statistics; industry: asteroid works, drill, base,
  automation; pop-ups and radials).

Your receipt is a pointer to the report plus the three most important findings in plain words.
