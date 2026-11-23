# DEMO-LINE-WORDS-1 — the Line speaks one grammar

**For:** a builder agent. **Kind:** words + HUD trims (director's ruling below). Commit your own files.

A stranger watching Swarm saw the rope (the Line) called Line, Tow, Anchor, Throw, Align, Release,
Let go and Self-sling, plus a readout 'BODY · ON THE LINE / 30420 T / STRAIN 55%'
(`.devshots/fleet/runs/DEMO-SWARM-LOOK-2.deepseek.*/RECEIPT.md` section 6 and the jargon table).

**Director's ruling.** The Line's behaviour truly changes with mass (that is the game's core idea),
so the aim tag keeps the designed verbs from `design/overhaul/03_COMBAT.md` §2 / `08_INTERFACE.md` §4:
`RMB · ANCHOR`, `RMB · TOW`, `RMB · TUG`, `RMB · THROW` — the key plus ONE verb that says what this
press will do to this body. Everything else goes:
1. No 'ALIGN', 'RELEASE', 'LET GO' words on screen: the throw tag's timing shows by its colour and
   its thin second frame (already built), not by extra words.
2. No 'SELF-SLING' callout or '+0' score line.
3. The 'BODY · ON THE LINE / <mass> T / STRAIN n%' readout does not show in Swarm. In Adventure keep
   at most one plain word for weight ('Light' / 'Heavy') — no tonnes, no strain percent; strain shows
   on the cable itself (its colour), as designed.
4. The controls card / Help say 'Line: hook, swing, throw' in the same words the tags use.
Find the strings (src/ui/masslineHud.js, src/ui/controlPrompts.js, the callout files). Focused tests
of every touched file; rewrite tests pinning the old words with "the Line speaks one grammar, director
2026-11-23".

## Rules
Before editing a file run `git diff -- <file>`; if it has changes you did not make, use
`bash scripts/fleet/own-commit.sh begin <file>` before and `... commit "<msg>" <file>` after. Never
git add -A, reset, stash, restore or checkout.

## Receipt
Protocol headings; per item fixed (commit) / not (why); tests.
