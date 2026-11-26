# DEMO-SWARM-UX-2 — what a stranger misreads in a Swarm fight (words and HUD beats)

**For:** a builder agent with vision. **Kind:** fixes from a stranger's review. Commit your own files.

A reviewer watched two real first-two-minute Swarm runs as a stranger
(`.devshots/fleet/runs/DEMO-SWARM-LOOK-2.deepseek.*/RECEIPT.md`, frames under
`.devshots/demo/swarm-minute/2026-11-23T22-51-26/` and `2026-11-23T23-09-08/`). Read the receipt
sections 7-14 and the jargon table. Fix, in Swarm runs (Adventure unchanged unless the line is
wrong there too):

1. **The round header never disappears.** Round starts replace it with 'FIGHT' and drop the
   hostiles-left count. The header always reads 'ROUND N · Name · X left'; event words go one line
   below it (src/ui/swarmHudLayer.js, src/ui/swarmJuiceHud.js, the Stage banner).
2. **Score callouts in plain words:** never show '+0' ('SELF-SLING +0'); the round-clear summary
   prints each line once ('BEST CHAIN ×44' appears twice); a count reads as a count ('Room kills 40',
   'Flyby 3', 'Pile-up 14'), '×' only for multipliers; 'SPEED CLEAR 20s' -> 'Cleared in 20 s';
   'CHAIN STAR · x12' / 'CHAIN 44 LOST' -> plain ('Chain 44 — broken').
3. **The round-clear summary and the level-up card do not collide:** show the summary alone for
   ~2 s, then the card (or merge them into one beat).
4. **Achievements:** only toast an achievement earned in this run; never 'Six Figures' /
   'Seven Figures' at Scrap 0 on a fresh round (a lifetime unlock is shown on Run Over, not mid-fight).
5. **'Integrated graphics: High performance preset applied. Settings → Video to change.'** fires on
   the first fight beat (src/render/renderer.js ~11984). Show it once, on the title or in Settings,
   never during a run.
6. **No-op and wrong-mode lines:** no 'Repair cell — hull 100%' / 'Repair cell on the field' when the
   hull is full; 'Hull critical — disengage' says 'Hull critical' in Swarm (there is nowhere to
   disengage to); 'Mayday, mayday — Wasp going down, pod away' does not play in Swarm;
   'Bank plate ahead · Turn clear' / 'Rim ahead · Turn clear' -> plain ('Wall ahead — turn').
7. **Labels:** off-screen hostile tags that collide ('Wasp ×2 310 mWasp 320 m') stack instead of
   overlapping; the FLYBY feed line is inset so it is never clipped at the left edge; the lone red
   'H' marker gets the hostile's kind word or goes; the grade words 'Even' / 'Heavy' on a target
   ('Wasp · Even', 'Rock · Heavy') either read as plain weight ('light enough to throw' / 'too
   heavy to throw') or go.
8. **Flavour quips** ('That was his friend.', 'The sponsors are generous.') never sit in the slot of
   an actionable prompt: give them their own quiet line or drop them while a prompt is up.
9. **Run Over:** the share/debug plate ('Run code SFC1-…', 'Ghost file SFG1-…', 'Save run code',
   'Copy ghost', 'No flight record was kept for that run.') must not show on the ordinary route;
   put it behind a 'Share' button on the one Run Over plate, and never contradict itself.

Find each line with `grep -rn "<text>" src`. Focused tests of every touched file; rewrite tests that
pin old wording with the reason "Swarm stranger pass, owner demo 2026-11-23". Shoot
`node scripts/ui-bench.mjs --shot=crucibleHud,crucible-results --viewports=1280x720 --out=.devshots/fleet/swarm-ux2`
and open the PNGs.

## Rules
Before editing a file run `git diff -- <file>`; if it has changes you did not make, use
`bash scripts/fleet/own-commit.sh begin <file>` before and `... commit "<msg>" <file>` after. Never
git add -A, reset, stash, restore or checkout. Do not touch src/core, src/systems physics or AI.

## Receipt
Protocol headings; per item fixed (commit) / not (why); PNG paths.
