# DEMO-HUD-3 — flight HUD words and marks a stranger misreads

**For:** a builder agent (code, exact instructions). **Kind:** fixes found by review. Verify each
against the code first, then fix it. Commit your own files.

1. **Enemy kind word.** src/ui/threatHalo.js `haloKindWord` and src/ui/map/flightMinimap.js
   `ENEMY_KIND_WORD`/`contactDisplayName` take the FIRST word of the enemy's full name, so arrows and
   the radar read 'The' (The Tendril, The Yardmaster, The Last Argument), 'Iron' (Iron Kraken),
   'Quiet' (Quiet Ghost), 'Customs' (Customs Cutter), 'Forge', 'Point-Defense', 'Corsair'. Add an
   authored short kind word to each row of ENEMY_TYPES in src/data/enemies.js (`kind: 'Tendril'`,
   'Yardmaster', 'Kraken', 'Ghost', 'Cutter', 'Raider', 'Wasp', 'Lancer'...) and use it in both
   places (fallback: the last word of the name, never 'The').
2. **GUNS tag over the player's own schematic.** hud.js ~5873: when the effective hull's projected
   centre is inside a worldTagAvoid rect, drop the words (keep the pip), as when neither side is clear.
3. **Warning chip glyph.** hud.js ~3555: the off-screen mark '▾' at the right end of the FLYBY chip
   reads as a dropdown. Use a chevron rotated to the attacker's bearing, or drop it when the edge
   arrow already points there.
4. **One key per verb in the opening.** The tracker says 'Latch the loose rock [F]' while the aim
   chip says 'RMB · LATCH' (controlPrompts.js ~211 verbChip). Resolve the tracker's key through the
   same resolver as the chip, so both name the same key (or both 'F / RMB').
5. **Tracker truncation.** The tracker's second line truncates ('Next jump: Tethys Junction · N
   Star M…'). Let it wrap to two lines instead of an ellipsis.
6. **Opening contact list noise.** During the opening lesson the contact list shows '??? UNSCANNED'
   three times, 'ready · Select CARGO BRACE first' and '+44 · 9 WRECKS · 35 OTHERS'. Hide the contact
   census and collar prompts while the opening rail is active (find the onboarding-active flag the
   HUD already reads).

Tests: focused tests of every touched file; rewrite tests pinning the old behaviour with the new rule
in the message. Shoot `node scripts/ui-bench.mjs --shot=flight,flight-line-target,flight-contacts --viewports=1280x720 --out=.devshots/fleet/hud3`.

## You may edit
src/ui/threatHalo.js, src/ui/map/flightMinimap.js, src/data/enemies.js (kind words only), src/ui/hud.js,
src/ui/controlPrompts.js, src/ui/contacts*.js / the contact list file you find, styles/hud.css, tests.
Before editing a file run `git diff -- <file>`; if it has changes you did not make, use
`bash scripts/fleet/own-commit.sh begin <file>` before and `... commit "<msg>" <file>` after.
Never git add -A, reset, stash, restore or checkout. Plain-English commit messages.

## Receipt
Protocol headings; per item fixed (commit) / rejected (why); tests; PNG paths.
