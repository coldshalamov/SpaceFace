# DEMO-SWARM-HUD-2 — Swarm's own HUD layer on the shared flight HUD (replaces DEMO-SWARM-HUD-1)

**For:** Gemini Neon (a designer-engineer with eyes). **Kind:** design-led build. Look, build,
look again, prove. Commit your own files.

## Why
The owner, after playing: "the swarm hud is largely just the regular hud, idk what's really
different in the swarm hud, it seemed like different level structure and upgrade structure but
the hud seemed the same." He is right: a Swarm run shows the whole Adventure flight dashboard
(speed dial in m/s, HULL/SHIELD/ARMOR/ENERGY/HEAT rows, the ship schematic, the Adventure minimap
with its M·Chart / Survey buttons, the power rail) plus a small run card top-left. Look at
`.devshots/demo/wave2/look-subtract/boss/sheet-a.png` to see it.

Swarm is the demo: a top-down physics brawler in Madame Kiln's lit industrial Foundry, 15-25
minute runs of 30 rounds, XP and level-up cards, Scrap, a chain/style meter, wall-buy pads, bosses
every fifth round (read `design/overhaul/04_SWARM.md` §1-4). Its Swarm layer must read with the
clarity of a 2026 arcade survivor game (Vampire Survivors / Hades / Brotato), in this game's own
lit-Foundry look, on top of the shared flight HUD. `design/overhaul/08_INTERFACE.md` §4 still holds: one flight HUD for both doors; Swarm adds its
layer and hides Adventure-only controls.

DEMO-SWARM-HUD-1 was stopped early to give you this wider brief. Its uncommitted edits are in the
tree (`git diff -- src/ui/swarmJuiceHud.js styles/crucible.css src/ui/stuntCallout.js src/ui/swarmGlass.js src/ui/survivalHud.js`):
they are yours; keep what fits, replace what does not.

## The Swarm HUD (director's design — build this, refine with your eye)

At 1280x720 (the fight's centre stays clear; nothing over the middle 60 % of the screen):

1. **Top edge, full width — the XP bar.** Thin (5-7 px), molten Foundry orange filling toward a
   white-hot leading edge; `LV 4` in the display face at its left end. Level-up: the bar flashes,
   `LEVEL 5` rides the bar's centre for about 1.2 s, and a `+1 pick` chip at the right end pulses
   once; banked picks stay as a small quiet count until spent (`2 picks`). No pause.
2. **Top centre — the round plate.** `ROUND 6` in small caps over the round's name in the display
   face, and the hostiles left as a big tabular numeral (`12 left`). Between rounds the same plate
   shows the NEXT ROUND countdown. In a boss round the boss bar takes this plate: a lit
   machine-plate with the boss's name and a heavy segmented bar (not a web progress bar). Round
   banners say the name and one line, then get out of the way within about 2 s. One thing at a time
   in this lane, through the existing Stage/attention queue.
3. **Under the round plate — the chain**, only while a chain is live: a multiplier `×3` that climbs
   visibly, and at most one short line in Kiln's voice ("Off the wall."). Never IGNITION / FLARE /
   NOVA / MIXED +2.
4. **Top right — Scrap.** A chip icon and a big tabular numeral; the score small beneath it. A kill
   paid by the room flashes its multiplier beside Scrap for a beat.
5. **Owner's limit (2026-11-23): the modes must not drift apart.** "Swarm-specific things can be in
   the Swarm HUD as long as they're not too distracting." So the shared flight instruments stay
   exactly the shared flight instruments: the bottom-left cluster (speed, hull/shield, energy/heat,
   ship), the power rail with 1-5 powers, the Line and boost, and the radar look the same in both
   doors. Do not re-seat, re-skin or fork them for Swarm. The Swarm layer (items 1-4) sits around
   them, quiet: thin, small, in the kit's own type and colours, and it never animates for longer
   than a beat.
6. **Bottom right — the same radar,** minus what only Adventure needs: no M·Chart / Survey buttons,
   no 'Traffic' labels in a Swarm run.
7. **Not shown in a Swarm run (Adventure-only things):** the M·Chart and Survey buttons, 'Traffic'
   labels, Overhead / COMMS / Radio, the objective tracker, and the old top-left run card (its
   content moved to items 2-4). Gate on the run mode the HUD already knows
   (state.run.kind === 'survival' or the HUD's own Swarm flag) with one body class
   (e.g. `sf-swarm-hud`) set on run start and cleared on run end / quit / Run Over, so Adventure is
   untouched and nothing leaks after a run.
8. **Type and colour:** the display face only for big numerals; Instrument Sans for words; tabular
   figures; the Deckplate kit's tokens. Molten orange for XP and Scrap, cyan for shields, crimson
   only for danger. No rings around anything, no glow soup, no boxy dashboard rows, no ALL-CAPS
   label soup.
9. **Phone (390x844) and 1366x650:** the same hierarchy compressed; the Swarm layer stays clear of
   the touch controls and the shared instruments. Nothing clipped,
   overlapping, or covering the fight's centre; text at least 12 px at 1280x720.
10. **Per-frame cost:** no layout reads (getBoundingClientRect, offsetWidth...) or querySelector in
    the per-frame path; write the DOM only when a value changes (`src/ui/hudSkipUnchanged.js`);
    bar fills by transform (scaleX), not width.
11. **Reduced motion:** no flash or pulse; the words still change.

## Prove
Shoot after each change and open every PNG yourself:
`node scripts/ui-bench.mjs --shot=crucibleHud --viewports=1280x720,1366x650,390x844 --out=.devshots/fleet/swarm-hud-2`
(the bench does not boot the game: it does NOT need the game lock). Also capture one real fight
(round 2-6 and the round-5 boss) through the game lock
(`node scripts/fleet/game-lock.mjs run -- <the Swarm capture probe or probe-no-freeze-electron route>`,
no focus steal) and judge the HUD there. Before/after pairs listed in your receipt for the
director, who judges taste. Focused tests of the files you touch; rewrite tests that pin the old
Swarm HUD with the reason "Swarm arcade HUD, owner 2026-11-23".

## You may edit
`src/ui/survivalHud.js`, `src/ui/swarmJuiceHud.js`, `src/ui/swarmGlass.js`, `src/ui/stuntCallout.js`,
`styles/crucible.css`, `styles/hud.css` (Swarm-scoped rules only), new files
under `src/ui/` for the Swarm layer, and for the gating in item 7 the smallest change in `src/ui/hud.js`,
`src/ui/radar.js` / `src/ui/map/flightMinimap.js`. hud.js, radar.js and flightMinimap.js have other
agents' uncommitted edits: run `bash scripts/fleet/own-commit.sh begin <file>` BEFORE you edit and
`bash scripts/fleet/own-commit.sh commit "<msg>" <file>` after. Do NOT edit `src/ui/screens/crucible.js`,
`src/ui/screens/crucibleDraft.js`, `src/ui/pilotCardsCss.js`, `src/ui/orrery/crucibleArmory.js`,
`src/ui/masslineHud.js`, or anything under `src/render/`, `src/core/`, `src/systems/`.
Never git add -A, reset, stash, restore or checkout.

## Receipt
Protocol headings + before/after PNG pairs + per item 1-11: done / partly / not done and why.
