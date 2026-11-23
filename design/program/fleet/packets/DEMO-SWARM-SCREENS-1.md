# DEMO-SWARM-SCREENS-1 — the Bench (round-10 refit) and Run Over, at release quality

**For:** Gemini Neon (designer-engineer with eyes). **Kind:** design-led rebuild. Commit your own files.

Swarm is the demo. The director looked at every Swarm screen at 1280x720
(`.devshots/demo/director-swarm-look/`). PLAY, the level-up cards and loading are finished. Two are not:

1. **The Bench / Refit** (`crucible-refit-swarm.png`, the one menu inside a run, at rounds 10 and 20):
   a spreadsheet of eight 'Hardpoint N WEAPON M' boxes, '— Strip' buttons with a stray dash icon,
   'Sell · 14 Scrap' repeated on every row, '31 dps · impulse 28', the REFIT header text touching its
   border, left/right card tops misaligned. Rebuild it so a stranger reads it in one glance: the
   ship's picture at the centre with its slots on it (or a clean two-column list if that reads
   better), each slot one plain line ('Gun 1 · Bank Stream'), ONE action per slot (Fit / Sell with
   its price), a plain comparison when fitting ('hits harder, pushes less'), the three ways out
   (Launch round 11 / Bank Scrap and keep flying / Cash out) as the foot, the next round named in
   one line. Same kit and type as the PLAY door (`swarm-play.png`), which is the quality bar.
2. **Run Over** (`crucible-results.png`): good, but the radial hit diagram's dashed concentric arcs
   read as rings around the ship (the owner hates rings around things). Keep the information (where
   the hits came from, the last hits) in a cleaner form: one arc or a plain hit strip.

Devin may have just changed words in these screens (packet DEMO-SWARM-FIX-1: 'Gun 1', 'Shield',
Scrap everywhere, a 'Banked N Scrap' row, Skip replay on the win foot). Read
`git log --since="2026-11-23 12:00" -- src/ui/screens/crucibleDraft.js src/ui/screens/crucible.js src/ui/orrery/crucibleArmory.js`
first and build on it; keep every behaviour, change the layout and presentation.

Shoot: `node scripts/ui-bench.mjs --shot=crucible-refit-swarm,crucible-results,crucible-results-win --viewports=1280x720,1366x650,390x844 --walk --out=.devshots/fleet/swarm-screens`
(no game lock needed). Open every PNG. Keyboard, mouse and pad must still reach every control.

## You may edit
src/ui/screens/crucibleDraft.js, src/ui/screens/crucible.js, src/ui/orrery/crucibleArmory.js,
src/ui/pilotCardsCss.js, styles/crucible.css, and their tests. Before editing a file run
`git diff -- <file>`; if it has changes you did not make, use `bash scripts/fleet/own-commit.sh begin <file>`
before and `... commit "<msg>" <file>` after. Never git add -A, reset, stash, restore or checkout.

## Receipt
Protocol headings; before/after PNG pairs; per item done/partly/not and why.
