<!-- LIFETIME: DURABLE -->
# Asteroid Works playfield — you are in the rock

Law for the mining minigame after the 2026-08-20 owner playtest. Copy-paste operator:
[`ASTEROID_WORKS_PLAYFIELD_GOAL.txt`](./ASTEROID_WORKS_PLAYFIELD_GOAL.txt).

Admitted as **`PQ-130`**. Dispatch `node scripts/program-dispatch.mjs --id PQ-130`.
Ordinary `--next` still returns fleet remaster. This is not INFERENCE, not `PQ-050`,
not `PQ-129`, and not Asteroid Ops Waves 1–4 (formations, heat, signature, clusters).

**2026-08-20 owner design session (same day, after the playtest):** the campaign now has a
**positive target**, not only this defect list —
[`design/ASTEROID_WORKS_DESIGN_LAW.md`](../ASTEROID_WORKS_DESIGN_LAW.md). Read it before
any leaf. Three rulings amend this file:

1. **Perfect flat grid.** The board is an axis-aligned chess board. §5.3's "pitch only
   enough" is tightened to **zero tilt** — square cells, camera pans and zooms only.
2. **Fog of war removed.** §2's "unsurveyed is still rock; survey reveals veins" and §5.5's
   "Unsurveyed stays anonymous stone" are **void**. Every cell's material is visible from
   the first frame; strategy lives in tunnel geometry, not information hiding.
3. **The UI is reimagined from the ground up.** Owner verdict on the current chrome: "gray,
   bleak, and vibe-coded, harsh fonts." The gunmetal/amber/tracked-caps console voice is
   deleted, not restyled — the law's §3 (warm palette, new vendored type, sentence case) is
   the replacement. A beautifully polished copy of the old shell fails.

Leaves `.01–.06` are re-aimed by the law's §12, and `.07–.10` extend the ladder (events on
the board, sound, build-mode feel, networks-on-board).

---

## 0. The spirit (read this before any leaf)

You are not dressing a webpage around a 3D widget. You are putting the player
**inside a cut asteroid** with a drilling rig, and letting them *see* the game
that already exists.

The fantasy is a cross-section you inhabit: a dark body of stone, a hole you
made, a vehicle you can point at, ore that looks like ore, gas that looks like
it will kill you. The remaining chrome is a **rig dashboard** — a few machined
instruments that earn their pixels this second. It is not an admin console, not
a log, not three empty bays and a novel.

If a stranger glances at the screen and reads “sci-fi website with a Minecraft
inset,” the leaf has failed, even if the playfield is technically larger.

If a stranger glances and reads “I am in this rock, that is my rig, that cell
is the prize / the hazard,” the leaf is on the path.

This is the same owner complaint that created the instrument grammar: frontend
that comes back cheap and uninspired. Asteroid Works is the worst current case
because the **game is the picture**, and the picture is a postage stamp inside
ugly chrome.

**Do not satisfy a leaf with a vanilla collapse.** A vanilla collapse is a PR
that can be honestly described as: shrink the CSS bays, zoom the ortho camera,
darken the tan hex, scale the crystals, bump the move cooldown, truncate the
inspector strings. That set of edits can hit every checkbox in a lazy reading
of this file and still be the same ugly, unreadable minigame. If that is your
diff, you are not done. You have not started.

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
6. **HUD eats the game, and it is ugly.** “If the game board is the purpose of
   this minigame, and the functions and HUD are secondary/auxiliary to that, why
   does the HUD take up almost the entire screen and I can barely see what's on
   the screen? … at least 60% of the screen is dedicated to HUD and not the
   actual game that I'm supposed to be seeing.” Follow-up: the chrome is not
   just too large. **It looks cheap.** Empty bays, tiny type, a video-embed
   window around the rock, a novel well, a keypad of faint line icons. Size and
   ugliness are the same failure: chrome that does not earn its pixels.
7. **Rover is undrivable.** “The controls are so sensitive that I can't really
   control the rover at all. I hit any button and it zooms out way off to the other
   side, maybe it's hitchy or something but it doesn't seem very responsive.
   Sometimes hitting the arrow keys will move the rover and sometimes it won't,
   and sometimes it'll zoom me way off if I hold it just a second too long but
   actually being surgical with moving 1 block over is impossible.”
8. **Survey does not change the picture.** Side-by-side cells, one labeled
   SILICATE ROCK VEIN and one UNSURVEYED STRATA, “look literally identical except
   for the fact that maybe one is slightly lighter if I squint at it.”

Matched stills from that session: a wall of identical tan cubes trapped in a
cyan-framed inset; a black void to the left of the rock; a 264px rail reprinting
the same MK2 warning; a 208px deck of empty gauges, tutorial paragraphs, and
grey icon keys; a rover you have to hunt for.

---

## 2. What is already supposed to be true (and is not)

The console brief already said **the scene stays sovereign**. The 3D renderer
already said **one cell = one block**, **veins are treasure**, **gas is danger not
loot**, **the rig is a vehicle**. The 2D painter already had dark silicate and a
vein ribbon meant to be “recognizable at a glance.” The strata legend already
shows those dark swatches. The instrument grammar already forbids sub-12 px type
and screens that share a silhouette.

Live play does the opposite:

| Law | Live picture |
|---|---|
| Scene is sovereign | The rock is a letterboxed video embed inside a website. Black well on the left. 264px tape. 208px three-bay deck. Empty instruments still occupy a third of the apron. |
| Chrome is an instrument | Site systems show Power —, Export —, Couriers — and still take a full bay. Context is a title plus a novel plus a dark hole. Command keys are 8px labels on 20px faint SVGs. Inspector kickers are 9px. |
| Unsurveyed is still rock; survey reveals veins | Surveyed silicate and unsurveyed matrix are the same tan cube. Crystals are a tenth of a cell. |
| Gas is cracked rock seeping vapor | Gas reads as the same tiny yellow-green sparkle as ore. |
| Rig is a vehicle | A few pixels in a dark tunnel, gunmetal on tan, no silhouette. |
| Camera tilt is “small on purpose” so the grid stays a precision surface | Beveled pyramid pads + yaw/pitch make an isometric diamond wall. |
| Hold-to-drive, one cell per beat | Empty-tile step is 0.06s (~16 cells/s). A tap into rock starts a bore that does nothing visible. A hold in a tunnel rockets the camera down the shaft. |

The HUD is compensating with tutorial sentences because the picture does not
speak, and the chrome around that failure is itself an eyesore. Do not add more
sentences. Do not keep the same chrome and make it 20% shorter.

`design/frontend/SCREENS_D_STATION_META.md` B.10 said “leave the drill screen
alone and use it as the bar.” **That ruling is void.** Owner playtest outranks it.

---

## 3. Vanilla collapse (illegal)

A leaf **fails** if the diff is any of these, alone or together, without a new
silhouette:

| Fake | Why it is not the work |
|---|---|
| `--ao-deck` 208 → 160, `--ao-rail` 264 → 180 | Ugly chrome, smaller. The owner can still barely see the game, and it still looks like a webpage. |
| `display:none` on the rail, opacity on empty bays | Hiding junk is not designing a dashboard. Empty Power/Export/Couriers should **collapse** because they have nothing to say, not sit there dimmed. |
| Same three-bay deck, “flex: 1” on the canvas | The rock is still an inset in the same frame. |
| VIEW_ROWS 18 → 12, still showing all 28 columns | Cells get a few pixels. The rover is still a speck. You are still looking at a whole cliff of cubes. |
| Multiply rock colour by 0.7 | Still generic dungeon sandstone, just dirtier. Not *this* asteroid. |
| Crystal `scale *= 1.5` | Still a speck on a tan cube. Geology does not occupy the cell. |
| Gas tinted more yellow | Still looks like ore. |
| `MOVE_COOLDOWN_BASE` 0.06 → 0.14 | A slower rocket is still a rocket. Tap still fails into walls. |
| Inspector `line()` strings shortened | Still a novel well. Still not a picture. |
| More amber hazard stripes, more tracked Saira, more 1px borders | That is how this screen got ugly. Do not double down on the template. |
| Billboard sprites / emoji / CSS icons on cells | Banned stand-in. The board has to be geology. |
| Bloom off, quality preset down | Forbidden performance/quality cheat. |

If you can describe your PR in one of those rows, stop and do the spirit instead.

---

## 4. The bar

**Pass:** from the ordinary tether → Asteroid Works route, at a normal window,
a stranger can, **without reading the context bay:**

- believe they are **inside this asteroid**, not a tan brick dungeon and not a
  website;
- point at a cell and say ore / gas / plain rock / unknown;
- find the rover in about a second and say it is a drilling vehicle;
- tap once and move **one** empty cell, or hold to cruise after a short delay;
- ignore most of the chrome because the board already taught them, and the
  chrome that remains looks like a dashboard they would touch, not a form.

**Fail:** tan wash; HUD majority; HUD that is merely smaller but still ugly;
isometric diamond grid; rover as a speck; surveyed vein identical to unsurveyed
rock; hover paragraphs; tap-or-hold rocket; “sci-fi website with a 3D inset.”

Judge at **live play size**. Capture `scripts/capture-asteroid-works.mjs`. A
zoomed crop of one cube, or a still of an empty board, is not a pass.

### What the HUD is allowed to be

Not a smaller copy of the current shell. A **rig dashboard**.

- **CREST** — a thin identity strip. Site, claim, one alert, yield, retract.
  It already almost works. Do not fatten it.
- **STAGE** — the rock, edge to edge of the theater. No black well. No cyan
  “video embed” frame that makes the mine look like a clip inside an app.
  The cutaway is the screen.
- **APRON** — only the verbs you need in this second: DRIVE / BUILD, the
  command keys, pulse survey, the two rig gauges that change while you bore
  (temp, energy). The command card must look like a **physical keypad** —
  pressable plates, readable glyphs, type at the grammar floor — not a grey
  icon font at 8px on 20px SVGs.
- **Everything else is a drawer or it is gone.** Manifest tape, site-systems
  that currently print “—”, the novel context well, the truncated keybind dump.
  They may exist. They may not occupy the default drive view. When they open,
  they do not cover the rock like a modal.

Empty instruments **collapse**. A first-visit bore with no power network does
not get a Power / Export / Couriers bay. A cell hover does not get a novel-sized
hole waiting for paragraphs.

Ugliness test, text removed: the silhouette is a **rock face and a vehicle**,
with a thin strip and a keypad. If the silhouette is stacked dark rectangles
around a small grid, you shipped a website.

References for spirit, not for cloning: Motherload / Steamworld Dig (the mine
*is* the screen); StarCraft (the map is the theater, the command card is a tight
instrument you do not stare at); a glass-cockpit strip where every remaining
readout is a physical object. Do not clone their art. Clone the **priority**:
the world first, chrome as tools.

Instrument grammar still binds whatever chrome remains **structurally**: 12 px floor,
colour by meaning, no cyan-as-decoration, motion only when a value moves, CREST /
STAGE / APRON / DRAWER. Its typefaces and cold token hues are superseded on this
screen by the design law's §3 (warm `--aw-*` palette, Instrument Sans / Spline Sans
Mono / Bricolage, sentence case, zero uppercase transforms). The **centerpiece** is
the cutaway. The **verb** is BORE. See
[`design/ASTEROID_WORKS_DESIGN_LAW.md`](../ASTEROID_WORKS_DESIGN_LAW.md) and
[`design/frontend/SCREENS_E_ASTEROID_WORKS.md`](../frontend/SCREENS_E_ASTEROID_WORKS.md).

---

## 5. Art direction (decided from the playtest)

These are product calls, not options to re-litigate per leaf.

1. **You are in the rock.** The STAGE is the cutaway, full theater. Chrome is a
   dashboard that earns pixels. Ugly HUD is in scope for the theater leaf, not
   a later polish.
2. **Frame the rover, not the whole cliff.** Default drive camera is a local
   window around the rig. Pan with it. A full-field view is a survey beat, not
   the drive camera.
3. **Flatten the slant — completely.** Yaw zero, pitch zero. Cells project as
   axis-aligned squares (design law §11.1 makes this assertable). The front pad is a
   **square face**, not a pyramid. This is a precision grid game (cell 12,4); a bored
   cell reads as a room by value and lighting, not by camera tilt.
4. **This rock’s color.** Interior stone is the asteroid you entered — grey lumpy
   common rock, darker metallic, cool icy — and it matches the strata legend.
   Not dungeon sandstone. Not “tan × 0.7.”
5. **Materials occupy the cell, and every cell shows its material.** *(Amended
   2026-08-20: fog removed.)* A vein is mineralized rock plus a cluster that reads
   as treasure at play size. A gas pocket is the **block itself** cracked and
   seeping. There is no "unsurveyed" appearance — anonymous stone means plain
   silicate matrix, not hidden information. Contiguous same-material cells render
   as one outlined body with a count chip (design law §3.5). The differences must
   survive a squint. MK lock is a readable stamp on a dull vein, not an 8px sprite.
6. **No camera-facing soft squares** for ore, gas, or the rover. Distant
   background stars are the only billboard exception in this game, and they are
   not in this screen.
7. **The rover is a character.** Arcade-readable vehicle: tracks, cabin, auger,
   hazard markings against dark rock. Findable in a second. Rebuild the
   procedural rig first. Authored GLB only if that still fails “what is it?”
8. **Hover is an instrument.** A plate you can read with the text off: swatch,
   consequence chips (bore once / farm forever / hazard / locked), contact ring
   when neighbors matter. One line of prose maximum. Tutorial copy prints once
   on a drawer tape, never on every mouseover.
9. **The rig is heavy.** Tap is one cell. Hold delay, then cruise. A wall tap is
   a bite you can see. Not a hitch leaf. If the picture still stutters after
   cadence is honest, that is `PQ-129`.

---

## 6. Ordered units (one at a time)

Keep going. Finish one, commit only that leaf, then the next. Later leaves are
judged at the play size and dashboard `.01` creates.

| Leaf | Spirit | Vanilla fake (illegal) |
|---|---|---|
| **`PQ-130.01` Theater** | The mine *is* the screen. Remaining chrome is a crafted dashboard. Local camera on the rover. Flat grid. No embed-window, no empty bays, no black well. | Shorter `ao-deck` / `ao-rail`. Same three bays. Same cyan inset. Zoom only. |
| **`PQ-130.02` Surgical drive** | A heavy rig you *place*. Tap seats one cell. Hold is a decision to cruise. | `MOVE_COOLDOWN` 0.06 → 0.12 and ship it. |
| **`PQ-130.03` This asteroid’s rock** | You recognize the body you tethered to. Lighting as stone, not a blown-out fill. | Darken `#8a7357`. Keep the key light at 4.2. |
| **`PQ-130.04` Cells speak** | A prospector can read the face. Ore is treasure in the cell. Gas is a cracked pocket. Survey changes the picture. | Bigger sparkles. Yellower gas. Same tan host cube. |
| **`PQ-130.05` The vehicle** | “That is my drill.” Silhouette, cabin, bit, hazard paint. | `makeRover` scale × 1.4. Same box stack. |
| **`PQ-130.06` Hover as instrument** | The readout is a picture. The board already told you; chrome confirms. | Truncated paragraphs in the same well. |
| **`PQ-130.07` The sim speaks** | Every event happens on the board with a sound (design law §5): chunks arc into the hopper, gas erupts and kicks the camera, MK locks refuse with sparks. The ledger becomes a silent drawer. | Keeping the tape and adding particles next to it. A floater with no board change. |
| **`PQ-130.08` The mine's voice** | The mine's own muffled industrial soundscape (design law §8): bed, three-layer grind by hardness, every event cue, music bus not zeroed. | One generic beep per event. Leaving the pause path silencing everything. |
| **`PQ-130.09` Build like chess** | Earned palette of pressable keys; ghost placement with valid faces glowing and one why-glyph on blocked faces; deliberate snapped placement. | Restyling the current 3×3 grey grid. Keys for machines you have not unlocked. |
| **`PQ-130.10` The site reads** | Cables glow, lanes flow, lamps and want-chips tell machine state, port crates stack, couriers visibly launch; returning to a producing site opens at site zoom. | A production report panel. Numbers without the picture. |

Do not open Wave 1 formations, thermal, signature, or cluster assembly here.
Those remain `ASTEROID_OPS_VISION.md`. (The design law's §12 lists them as future
packets: seam-size scaling, the parked thermal model, gas-tap power balance,
import complements, the economy curve, drones/field.)

---

## 7. Collision / stay-off

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

## 8. How a leaf closes

A leaf is done when the **spirit column** in §6 is true on the live tether →
Asteroid Works route, at default window size, and the vanilla-fake column is
not a fair description of the diff. `npm run check:playable` still boots the
real game.

Visual leaves need current stills of the **whole theater at play size** — rock,
dashboard, a surveyed vein next to unsurveyed stone, a revealed gas pocket, the
rover in an open bore. Not a studio crop of one cube. Not a screenshot of CSS
boxes without the mine.

Drive leaf needs a focused test that a tap commits one empty cell and a
sub-threshold hold does not chain a tunnel run.

Theater leaf needs a silhouette still with labels off (or obviously ignorable):
rock face + vehicle + thin dashboard. If stacked dark rectangles still dominate,
`.01` is not done.
