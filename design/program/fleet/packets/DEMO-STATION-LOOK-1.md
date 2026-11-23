# DEMO-STATION-LOOK-1 — the station screens a stranger sees on the demo route, finished

**For:** Gemini Neon (designer-engineer with eyes). **Kind:** look, fix, prove. Commit your own files.

The demo's Adventure route docks at Helios Station: a four-door hub (Jobs, Market, Shipyard, People)
and the Chart. An independent review shot them at 1280x720 and found these (PNG paths are its evidence):

1. **Chart, galaxy view:** the player's own sector label ('Helios Prime / YOU / Fulfillment') is
   printed ~170 px left of its node, beside Dione Lane's node, so a stranger reads Dione Lane as
   "where I am" (`.devshots/demo/wave2/station-review4/chart-galaxy.png`). Likely src/ui/galaxyMap.js
   ~10487/10531 reserves price lines and job badges as fixed plates before the player's label is
   placed. Seat the player's own label first (or exempt it), so it sits by its node.
2. **Chart, Here tab:** the 'Nearby' section shows a lone gold ◆ and nothing else
   (`station-review5/chart.png` ~921,557; galaxyMap.js ~7105). Show the rows/key or the existing
   'No contacts or stations in immediate range.' note, or drop the section when empty.
3. **Market:** on a first dock the detail panel is a ~670x430 empty dark box under 'Iron Ore 33'
   (`station-review/station-market.png`). Give a first-time trader something useful (today's price
   and where this good is known to sell) or shrink the panel to its content.
4. **Shipyard:** one hull under four names ('HITCH / STARTER SCOUT', 'STARTER · Skirmisher',
   'STARTER · SKIRMISHER', 'Tessera · Name this hull'); the DETAILS line is clipped at the panel
   bottom (`station-review/station-shipworks.png`). One role word on every plate; say plainly how
   the ship's given name and the hull model relate (or show one); let DETAILS end cleanly. Delete
   `drawFleetCaption` instead of `const want = false && ...` (shipworks.js ~2167).
5. **People:** the LEADS button row sits on the panel's bottom edge and looks clipped; 'Play
   manifest' tells a stranger nothing; the title card covers half the speaker's face
   (`station-review4/station-bar.png`). Give the row its own padded foot, rename the button to say
   what it does, seat the card clear of the face.
6. **Hub:** shoot the four-door hub (`--shot=station-hub`, added today) and judge it as a stranger.

Shoot: `node scripts/ui-bench.mjs --shot=station-hub,station-market,station-shipworks,station-bar,chart,chart-galaxy --viewports=1280x720,390x844 --walk --out=.devshots/fleet/station-look`
(the bench does not boot the game; no game lock needed). Open every PNG yourself.

## You may edit
src/ui/station/**, src/ui/galaxyMap.js, styles/station*, and their tests. Before editing a file run
`git diff -- <file>`; if it has changes you did not make, use `bash scripts/fleet/own-commit.sh begin <file>`
before and `... commit "<msg>" <file>` after. Never git add -A, reset, stash, restore or checkout.
No rings around things (owner). Plain words. Deckplate kit tokens.

## Receipt
Protocol headings; per item done/partly/not and why; before/after PNG pairs.
