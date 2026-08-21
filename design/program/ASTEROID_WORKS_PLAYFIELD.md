<!-- LIFETIME: DURABLE -->
# Asteroid Works playfield — see the board, then play the board

Law for the mining minigame after the 2026-08-20 owner playtest. Copy-paste operator:
[`ASTEROID_WORKS_PLAYFIELD_GOAL.txt`](./ASTEROID_WORKS_PLAYFIELD_GOAL.txt).

Admitted as **`PQ-130`**. Dispatch `node scripts/program-dispatch.mjs --id PQ-130`.
Ordinary `--next` still returns fleet remaster. This is not INFERENCE, not `PQ-050`,
not `PQ-129`, and not Asteroid Ops Waves 1–4 (formations, heat, signature, clusters).

The sim underneath is already a real game: a 28×45 cutaway, a rover, survey fog,
gas as a sealed hazard, veins you can spend now or farm forever. The live screen
hides that game. This campaign makes the **board** the thing you look at and the
thing you drive.

---

## 1. Owner playtest (2026-08-20) — keep these words

These are the defects. Do not paraphrase them into a different problem.

1. **Tan wash.** “I can't see what materials are in these blocks because the blocks
   are this bright tan color and saturate the screen.” Suggested direction: “maybe
   it should make more sense like being the color of the asteroid.”
2. **Invisible markers.** “The icons for the materials are very small and nearly
   invisible.”
3. **Slanted board.** “The whole game board is at a slant and I can't really see
   what is what.”
4. **Tiny rover.** “My rover is very tiny and I don't can't really see what it is.”
5. **Hover novel.** “The whole UX of having the mouseover do TEXT TEXT MORE TEXT
   WALL OF TEXT all the time doesn't visually really explain what's going on.
   That would have to have a more visual UX.”
6. **HUD eats the game.** “If the game board is the purpose of this minigame, and
   the functions and HUD are secondary/auxiliary to that, why does the HUD take up
   almost the entire screen and I can barely see what's on the screen? … at least
   60% of the screen is dedicated to HUD and not the actual game that I'm supposed
   to be seeing.”
7. **Rover is undrivable.** “The controls are so sensitive that I can't really
   control the rover at all. I hit any button and it zooms out way off to the other
   side, maybe it's hitchy or something but it doesn't seem very responsive.
   Sometimes hitting the arrow keys will move the rover and sometimes it won't,
   and sometimes it'll zoom me way off if I hold it just a second too long but
   actually being surgical with moving 1 block over is impossible.”
8. **Survey does not change the picture.** Side-by-side cells, one labeled
   SILICATE ROCK VEIN and one UNSURVEYED STRATA, “look literally identical except
   for the fact that maybe one is slightly lighter if I squint at it.”

Matched stills from that session: a wall of identical tan cubes, a postage-stamp
playfield inside a console, a rover you have to hunt for, and a context bay that
lectures while the hovered cell still looks like every other cell.

---

## 2. What is already supposed to be true (and is not)

The console brief already said **the scene stays sovereign**. The 3D renderer
already said **one cell = one block**, **veins are treasure**, **gas is danger not
loot**, **the rig is a vehicle**. The 2D painter already had dark silicate
(`#41382e`) and a vein ribbon meant to be “recognizable at a glance.” The strata
legend already shows those dark swatches.

Live play does the opposite:

| Law | Live picture |
|---|---|
| Scene is sovereign | Top strip + 264px manifest rail + 208px command deck + letterboxed postage stamp. The cutaway is not the majority of the screen. |
| Unsurveyed is still rock; survey reveals veins | Surveyed silicate and unsurveyed matrix are the same tan cube. Crystals are ~a tenth of a cell. |
| Gas is cracked rock seeping vapor | Gas reads as the same tiny yellow-green sparkle as ore. |
| Rig is a vehicle | A few pixels in a dark tunnel, gunmetal on tan, no silhouette. |
| Camera tilt is “small on purpose” so the grid stays a precision surface | Beveled pyramid pads + yaw/pitch make an isometric diamond wall. |
| Hold-to-drive, one cell per beat | Empty-tile step is 0.06s (~16 cells/s). A tap into rock starts a bore that does nothing visible. A hold in a tunnel rockets the camera down the shaft. |

The HUD is compensating with tutorial sentences because the picture does not speak.
That is the failure. Do not add more sentences.

`design/frontend/SCREENS_D_STATION_META.md` B.10 said “leave the drill screen alone
and use it as the bar.” **That ruling is void.** Owner playtest outranks it.

---

## 3. The bar (one glance, then one cell)

**Pass:** from the ordinary tether → Asteroid Works route, a stranger can:

- tell they are inside **this** asteroid, not a tan brick dungeon;
- point at a cell and say ore / gas / plain rock / unknown **without** reading the
  context bay;
- find the rover immediately and say it is a drilling vehicle;
- tap once and move **one** empty cell, or hold to cruise after a short delay;
- use the context bay as confirmation (swatch, yield, hazard), not as the only way
  to learn what the cursor is on.

**Fail:** tan wash; HUD majority; isometric diamond grid; rover as a speck;
surveyed vein identical to unsurveyed rock; hover paragraphs; tap-or-hold rocket.

Judge at the **live play size**, not a zoomed crop of one cube. The capture harness
`scripts/capture-asteroid-works.mjs` is the evidence socket; a single pretty still
of an empty board is not a pass.

---

## 4. Art direction (decided from the playtest)

These are product calls, not options to re-litigate per leaf.

1. **The board is the STAGE.** Chrome is auxiliary. Crest stays a thin strip.
   Command card stays, compact, as the apron (you need the verbs). Manifest tape
   and site-systems trivia recede — drawer, overlay, or a much thinner rail.
   The cutaway fills the theater. No black letterbox well beside a tiny grid.
2. **Frame the rover, not the whole rock.** The camera always showing all 28
   columns is why every cell and the rover are postage stamps. Follow a local
   window around the rig; pan as it drives. A full-field view may exist as a
   survey beat, not as the default drive camera.
3. **Flatten the slant.** Yaw to zero. Pitch only enough that a bored cell still
   reads as a hole with a floor. The front pad is a **square face**, not a pyramid.
   This is a precision grid game (cell 12,4), not an isometric diorama.
4. **This rock’s color.** Interior matrix/basalt follow the asteroid you entered
   (common rock is grey lumpy stone, metallic is darker, icy is cool, and so on).
   Stop the generic bright tan. Match the strata legend, then the exterior body —
   not a second, sun-blasted palette.
5. **Surveyed materials occupy the cell.** A vein is mineralized rock plus a
   cluster that reads at play size, tinted by the ore. A gas pocket is the **block
   itself** cracked and seeping — never a crystal. Unsurveyed stays anonymous
   stone, and the difference must survive a squint test. Locked MK veins stay
   dull with a readable stamp, not a 8px sprite.
6. **No camera-facing soft squares** for ore, gas, or the rover. Distant
   background stars are the only billboard exception in this game, and they are
   not in this screen. Crystals stay 3D. Gas stays 3D. The rover stays a vehicle.
7. **The rover is the protagonist of the view.** Arcade-readable: it fills most of
   a cell, hazard markings contrast the dark rock, cabin / tracks / auger read at
   play size. Rebuild the procedural rig first. An authored model is only in
   scope if the rebuilt rig still fails the “what is it?” test.
8. **Hover is an instrument.** Identity plate + consequence chips (bore once /
   farm forever / hazard / locked). Contact ring when the subject has neighbors
   that matter. One line of prose maximum. Tutorial copy already prints once on
   the tape; it does not reprint on every mouseover.
9. **Tap is one cell.** Hold after a short delay is cruise. Tapping a wall is a
   bore, and a short tap on a wall must not feel like “the key did nothing” and
   must not launch you. This is not a hitch-campaign leaf. If the picture still
   stutters after the cadence is honest, that is `PQ-129`, named separately.

Instrument grammar still binds the chrome: CREST / STAGE / APRON, 12 px floor,
colour by meaning, no cyan-as-decoration. The **centerpiece** of this screen is
the cutaway. The **verb** is BORE. See
[`design/frontend/SCREENS_E_ASTEROID_WORKS.md`](../frontend/SCREENS_E_ASTEROID_WORKS.md).

---

## 5. Ordered units (one at a time)

Keep going through the leaves. Finish one, commit only that leaf’s files, then
the next. Later leaves are judged at the play size `.01` creates — do not “fix”
ore icons while the camera still shows 28 columns of tan.

| Leaf | Player-facing result | Why this order |
|---|---|---|
| **`PQ-130.01` Theater** | The cutaway is the majority of the screen. Local camera on the rover. Flat grid. No postage-stamp letterbox. | Nothing else can be judged until the board is large and square. |
| **`PQ-130.02` Surgical drive** | Tap = one empty cell. Hold delay, then cruise. A wall tap is a bore you can see. | The owner cannot play the minigame today. |
| **`PQ-130.03` This asteroid’s rock** | Tan wash gone. Body color matches the rock you entered. Lighting no longer blows the face out. | Contrast for every later material language. |
| **`PQ-130.04` Cells speak** | Ore, gas, basalt, unknown are distinct at a glance. Surveyed silicate ≠ unsurveyed stone. | The strategy (spend vs farm, don’t breach gas) is invisible until this. |
| **`PQ-130.05` The vehicle** | Rover reads as a drilling rig at play size. | Identity, after the rock is dark enough for yellow to pop. |
| **`PQ-130.06` Hover as instrument** | Context bay is a picture. No mouseover novel. | Chrome last, once the board already tells the truth. |

Do not open Wave 1 formations, thermal, signature, or cluster assembly in this
campaign. Those remain `ASTEROID_OPS_VISION.md`.

---

## 6. Collision / stay-off

Safe: `src/ui/asteroid/`, `styles/asteroid-ops.css`, `src/render/asteroidInteriorPreview.js`,
the drill input cadence in `src/systems/drill.js` / `src/ui/screens/drill.js` /
`src/ui/asteroid/asteroidController.js`, the asteroid-ops capture scripts, and the
docs this campaign owns.

Stay off: hitch renderer owners (`renderer.js`, `precompile.js`, `partsLibrary.js`,
bloom/pipeline files), Hitch/Kestrel, fleet remaster sources, and any rewrite of
contact-ring **sim** laws, site production, or courier economy.

`screens/drill.js` stays as the exported input/particle helper. Do not revive it
as the live screen.

---

## 7. How a leaf closes

A leaf is done when the owner-facing sentence in the table is true on the live
tether → Asteroid Works route, at default window size, with
`npm run check:playable` still booting the real game.

Visual leaves need current stills of the **playfield at play size**, including a
surveyed vein next to unsurveyed stone, a revealed gas pocket, and the rover in
an open bore — not a studio crop.

Drive leaf needs a focused test that a tap crosses one empty cell and that a
sub-threshold hold does not chain a tunnel run.

Do not pass a leaf by shrinking the grid, cutting bloom as a quality preset, or
stamping 2D icons on cubes.
