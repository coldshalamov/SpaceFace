# DEMO-SWARM-HUD-1 — the Swarm fight's own HUD, at the level of a 2026 arcade release

**For:** Gemini Neon (a designer-engineer with eyes). **Kind:** look, judge, build, prove. Commit
your own files.

## Why

Swarm is the demo. It is the addictive slam-bang half of SpaceFace: a top-down physics brawler in
a lit industrial Foundry hosted by Madame Kiln, 15-25 minute runs, a rope that makes a light ship a
hummingbird and a heavy one a wrecking ball, guns that trade damage for kick, a room that is a
weapon (furnace, crusher, freight lane), level-up cards that change what your hands do. Read
`design/overhaul/04_SWARM.md` sections 1-4 and `design/overhaul/08_INTERFACE.md` sections 1, 3, 4.

The Swarm-specific HUD layer is not yet at that level. Shoot it yourself:
`node scripts/ui-bench.mjs --shot=crucibleHud --viewports=1280x720,1366x650,390x844 --out=.devshots/fleet/swarm-hud`
and open the PNGs; also look at real fight frames
`.devshots/no-freeze/perf-lane-ab-detail-1/04-ab-old-2.png`, `06-ab-new-3.png`, `05-ab-new-2.png`
(Iron Maw boss, round 5) and `.devshots/no-freeze/gate-2026-11-23T18-13-05-swarm/*.png`.

## Make it (Swarm HUD layer only)

1. **The run card** (top-left: arena, round, NEXT ROUND timer, CHAIN, score/kills/scrap/level): one
   clear hierarchy — round name and hostiles left first, Scrap second, chain as a living number;
   no boxy dashboard rows, no ALL-CAPS label soup; same type system as the rest of the game
   (display face only for the big numerals; Instrument Sans for words; tabular figures).
2. **The style meter / chain** speaks plainly (a multiplier like x3 and at most one short line in
   Kiln's voice, e.g. "Off the wall."), lives in ONE place (top centre under the round name), and
   climbs visibly; never IGNITION/FLARE/NOVA/MIXED +2.
3. **Level-up must be felt in the moment** without pausing: the XP bar flashes, "LEVEL 4" rides the
   bar for a beat, a pick is banked ("+1 pick" chip that pulses once). Respect reduced motion.
4. **Boss bar and round banners**: one at a time through the existing Stage/attention queue; the
   boss bar is a lit machine-plate, not a web progress bar; round banners say the round's name and
   one line, then get out of the way within ~2 s.
5. **Nothing from Adventure in a Swarm run**: the 'M · Chart' and 'Survey' buttons, 'Traffic'
   labels and the Overhead/COMMS/Radio buttons must not show during a Swarm run (find where the HUD
   decides them; gate on the run mode the HUD already knows).
6. Every element passes at 1280x720, 1366x650 and 390x844 (phone): nothing clipped, overlapping or
   covering the fight's centre; text >= 12 px at 1280x720.
7. Per-frame cost: no layout reads (getBoundingClientRect, offsetWidth...) or querySelector in the
   per-frame path; write DOM only when a value changes (the HUD already has skip-unchanged helpers:
   `src/ui/hudSkipUnchanged.js`).

## Prove
Bench shots at the three sizes after each change, opened and judged by you. List before/after
PNG pairs in your receipt for the director, who judges taste. Focused tests of the files you touch
(`grep -rln "<file stem>" test`); rewrite tests that pin old wording/layout with the reason
"Swarm HUD demo pass, design/overhaul/08_INTERFACE.md §4".

## You may edit
`src/ui/survivalHud.js` (another worker may change ONE comment near line 1435 — leave it),
`src/ui/swarmJuiceHud.js`, `src/ui/swarmGlass.js`, `src/ui/stuntCallout.js`, `styles/crucible.css`,
and for item 5 only the smallest gate in the file that shows those buttons (name it in the receipt;
if it is `src/ui/radar.js` or `src/ui/map/flightMinimap.js`, which another agent is editing, use
`bash scripts/fleet/own-commit.sh begin <file>` before and `... commit "<msg>" <file>` after).
Do NOT edit `src/ui/screens/crucible.js`, `src/ui/screens/crucibleDraft.js`, `src/ui/pilotCardsCss.js`,
`src/ui/orrery/crucibleArmory.js` (another worker is fixing them now), `src/ui/masslineHud.js`, or
anything under `src/render/`, `src/core/`, `src/systems/`.

## Receipt
Protocol headings + before/after PNG pairs + per item: done / partly / not done and why.
