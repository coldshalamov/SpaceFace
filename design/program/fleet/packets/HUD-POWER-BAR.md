# HUD-POWER-BAR — a power bar that explains itself, and a flight screen that stays quiet

**For:** a frontend designer-builder with eyes. **Kind:** flight HUD (both modes). **Commit when the
frames look right.** The director judges your frames.

## Why

The owner: "I can't tell what any of the powers do… the UI is often filled with gibberish language
and bad UI." A fresh-eyes audit (read it first: `.devshots/director/fable/ux/FRESH-EYES.md`,
sections 2 and 5, and the HUD sketch at the end) rated three of the five powers "nobody could know".
Today's frames: `.devshots/director/fable/baseline/travel/a0-spawn.png` and `f06.png`.

## Look first

`node scripts/ui-bench.mjs --list`, then shoot the flight HUD shots (the ids containing `flight`,
`crucibleHud`, `power`) with `node scripts/ui-bench.mjs --shot=<id>` and open the PNGs. The bench
draws the real DOM over a still and takes seconds; **run it directly, without the game lock** (the
lock is for booting the game, and eight agents are queued on it). Loop details:
`docs/UI_VISUAL_ITERATION.md`.

## Build

### 1. Six tiles, one grammar (bottom-left, both modes, identical)

| Key | Name | Icon to draw | One line (hover, and first-use caption) |
|---|---|---|---|
| 1 | Pull | arrows converging on a point (keep if it already reads) | Drags everything near the cursor together |
| 2 | Shove | a pressure front bursting forward from a bow (not the fullscreen-arrows glyph) | Blasts everything ahead of you away |
| 3 | Pin | a stake driven through a point, with a small orbit arc | Nails a ship, or a point in space, in place |
| 4 | Bomb | a charge with a blinking fuse lamp (not a canister) | Sticks a charge. Press again to detonate |
| 5 | Plow | a wedge at a bow pushing three rocks (not the wifi arcs) | Gathers rocks at your bow. Press again to launch |
| RMB / F | Line | a hook on a cable | Hook anything: swing on heavy things, throw light ones |

- One name per power everywhere on the flight HUD. The words Well, Repulsor, Seed, Field, Cone, Rig,
  Gyre, Massline and Mass Seed do not appear on it.
- **State lives on the tile:** a cooldown wipe with whole seconds inside the tile; a ring while the
  power is running; stock count as a small `×4`. While a charge is armed, tile 4 reads `Detonate`
  and pulses. While the plow holds rocks, tile 5 shows how many and reads `Launch`.
- **Delete the floating status pills** ("WELL — ENGAGED 3S", "REPULSOR — FADING 1S", "SEED → LOCK",
  "FIELD — ENGAGED") wherever they are drawn (`src/ui/fieldHud.js`, `src/ui/massSeedHud.js`,
  `src/ui/powerRail.js` and friends). The tile and the effect itself carry that now.
- **First-use caption:** the first three times each key is pressed in a save (and every time in the
  first Swarm run on a profile), the one line above appears just over the bar for 2.5 s. Hover shows
  the same line. Nothing else explains a power on the flight screen. Store the count the way other
  first-use hints are stored (find the existing mechanism; do not invent a new save field if one
  exists).
- No empty sockets and no tile for a power the player does not have. A small `Q · More` pill sits
  after the Line tile.
- Draw the icons as crisp single-weight SVG glyphs in the existing glyph module
  (`src/ui/orrery/arsenalGlyphs.js`), sized for the existing tiles, legible at 1280×720.

The behaviour behind tiles 3, 4 and 5 is being fixed by another agent at the same time (press 4 again
detonates; Pin stakes a body or plants a post; the plow never silently changes mode). Read the state
you need from what the simulation already publishes; if a state you need is not published, show the
tile without it and name the missing field in your receipt.

### 2. A quiet screen: one attention state

Extend the existing owner (`src/ui/hudAttention.js`) so the HUD root carries one of three modes, and
style from that one attribute:

- **teach**: the first two minutes of a new Adventure save.
- **fight**: a hostile is engaged or within weapons range, or the hull was hit in the last 8 s. A
  Swarm round is always `fight`.
- **calm**: everything else.

Then:

- In **fight** and **teach**, hide: the Field Build chip, Comms and Hail, the Radio chip, the
  Overhead and Circuits buttons, news crawls, the mug pad, cargo and system status lines.
- In **calm**, show a secondary control only when it can be used: Field Build only near a body that
  can be claimed or is owned; Hail only with a hailable contact; Dock only in range.
- Remove from the flight HUD entirely: the `Circuits` button (it lives in Pause and on the title),
  any status line that is always the same ("SYS: NOMINAL", "CARGO: STABLE LOAD"), and the drive
  cooldown debug box.
- Nothing overlaps: the objective card, the top-right buttons and any banner each keep their own
  seat at 1280×720, 1366×650 and 1920×1080.
- **Off-screen attackers** are red chevrons on the screen edge pointing at the attacker, clear of the
  bottom HUD. Delete the unlabelled red "ruler" boxes (`styles/hud-flight.generated.css` near the
  rule the audit cites, and `src/ui/threatHalo.js`).
- The aim cursor's white diamond must not draw on top of HUD panels (it does in today's frames):
  either it stops at the panel edge or the panel sits above it.

### 3. Leave alone

The Swarm round card, streak counter, floor-pad cards and the Run Over screen
(`src/ui/survivalHud.js`, `swarmJuiceHud.js`, `src/ui/screens/crucible*`): another agent owns them.
Input bindings and what keys do (`src/systems/input.js`, `powerVerbs.js`): another agent owns them.
The plain-words sweep of the rest of the game: another agent.

## Prove

- Before and after frames of the flight HUD in Adventure and Swarm at 1280×720 and 1920×1080, each
  state of the bar shot: idle, a power on cooldown, a charge armed, the plow loaded, a first-use
  caption, calm, fight. Open every PNG; fix what looks wrong; repeat until you would ship it.
  `--walk` the controls you changed.
- Update the tests that pin the old pills, names or chips so they assert the new behaviour.
- In the receipt: the frame paths, every file changed, and any simulation state you needed and did
  not find.

## Files

`src/ui/orrery/visorInstruments.js`, `arsenalGlyphs.js`, `flightCluster.js`, `hudAdapter.js`,
`src/ui/powerRail.js`, `fieldHud.js`, `massSeedHud.js`, `hud.js`, `hudMeta.js`, `hudAttention.js`,
`bandHud.js`, `contactHailPrompt.js`, `fieldBuild/fieldBuildMode.js` (the pill only), `racingHud.js`
(the two buttons only), `threatHalo.js`, the flight HUD stylesheets and their generators under
`styles/` (if a stylesheet is generated, edit its source and regenerate), and their tests. Other
agents are working in this folder: before each edit run `git diff -- <file>`, and commit with
`bash scripts/fleet/own-commit.sh` if a file carries lines that are not yours.
