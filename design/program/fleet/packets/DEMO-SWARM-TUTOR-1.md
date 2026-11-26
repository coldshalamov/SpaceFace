# DEMO-SWARM-TUTOR-1 — one tutorial at a time in Swarm, and none on Again

**For:** a builder agent. **Kind:** fix from a stranger's review. Commit your own files.

In real Swarm runs (`.devshots/fleet/runs/DEMO-SWARM-LOOK-2.deepseek.*/RECEIPT.md` section 5;
frames `.devshots/demo/swarm-minute/2026-11-23T22-51-26/85-again-round-start.png`,
`86-again-first-hostile.png`, and `2026-11-23T23-09-08/41-s111.png`..`43-again-first-hostile.png`)
the first round of a run — including the round after Again — opens with THREE teaching cards at
once: top-left 'A rushing pack / Catch one Wasp on the Line and whip it through the pack', top-right
'Wasp Swarmer: Light enough to throw — catch one on the line and whip it into its packmates.',
bottom-left 'Plow · 5 / Gathers rocks at your bow…' or 'Shove · 2 / …', plus the 'RMB Tow' tag. They
cover a third of the arena exactly when control starts.

## Do
1. Find the three sources (grep the strings; the round brief card, the enemy codex/first-sighting
   card, the power hint card).
2. One teaching card at a time, queued through the existing Stage/attention queue (do not invent a
   second queue); each in the margin, never over the fight's centre; each retires once its mechanic
   has been used (the power card after the power is pressed, the Wasp card after a Wasp is caught)
   or after ~6 s.
3. A card a player has already seen this session (or whose mechanic they have already used) does
   not show again on Again. The round brief line may show on Again; the codex and power hints may not.
4. Focused tests of every touched file; a test pinning the old stacking gets the new rule in its
   message ("one teaching card at a time, owner demo 2026-11-23").

## Rules
Before editing a file run `git diff -- <file>`; if it has changes you did not make, use
`bash scripts/fleet/own-commit.sh begin <file>` before and `... commit "<msg>" <file>` after. Never
git add -A, reset, stash, restore or checkout. src/ui/swarmHudLayer.js, swarmJuiceHud.js and
survivalHud.js may be edited by another worker now: own-commit them.

## Receipt
Protocol headings; sources (file:line); the fix (commit); tests.
