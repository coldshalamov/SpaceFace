```yaml
packet: P01
title: Style frames — the Title and the Crucible door
lane: FRAMES
tool: ChatGPT 6 Pro (image generation + scripting VM)
dependsOn: []
current: [title, crucible-door, flight, station-dock, ship]
inputs: []
returns: P01-return.zip
turns: 1 (+1 correction)
```

# P01 — Style frames: the Title and the Crucible door

## Objective

Produce the first **finished-looking pictures** of SpaceFace's new interface: four 1920×1080 style
frames of two POSTER-register screens, built to `_COMMON/02_ART_DIRECTION.md` ("Field Hardware"),
using the game's exact strings. These frames become the target that code is built to match. They
are the single most important deliverable of the programme: every asset and every screen after this
is judged against them.

Three of the four frames are **variants of the Title** — three different world shots of the *same*
direction, so the controller can pick the strongest. One frame is the **Crucible door**. Nobody will
ask the owner to choose between them; the controller picks and the owner sees the pick in the game.

## Non-goals

Do not design the HUD, the station, or any other screen. Do not produce assets (plates, icons) as
separate files — a crop sheet is enough. Do not write code. Do not restyle the current screens; they
are content inventories, not references.

## Read

`_COMMON/00_READ_ME_FIRST.md` → `01_GAME_DOSSIER.md` (§4 Title and Crucible strings) →
`02_ART_DIRECTION.md` (§1–§8; POSTER register in §3) → `03_CONVENTIONS.md` §4 (frames) and §7.

## The screens

### Frame A — the Title (three variants)

**What is on screen (verbatim, all of it):** the wordmark "SPACEFACE"; the status line "CONTRACT
47-A REMAINS OPEN"; the save line "No save found - New Game opens Contract 47-A in Helios."; the
menu NEW GAME · CONTINUE · LOAD GAME · SETTINGS · CRUCIBLE · SIGNAL ARCHIVE · QUIT GAME (omit
SANDBOX); a version string bottom-left ("v0.9.4 · build 2026.09.10" is an acceptable placeholder).
NEW GAME is the focused item.

**The shot (POSTER):** the starter hull, the Kestrel "Hitch" — a small, tough scout-class tug with a
blunt nose, side-mounted ion thruster, exposed cargo frame, one pulse laser and one mining laser on
the underside, matte gunmetal with worn safety-orange markings — as the subject of a lit, cinematic
scene. The hull occupies roughly the right two-thirds, slightly below the eye line, three-quarter
view, with a slow turn implied. Lighting: warm key from a hangar/gantry source, cool fill from the
sky, real shadow contact. Depth: the scene has foreground, subject, background.

**The hardware:** exactly one manufactured element carries the menu — a backlit legend rail: a
thin machined plate down the left edge whose amber light sits behind the focused word; the other
words are stencil markings at 62 % bone. The wordmark is a painted stencil marking (Archivo
Expanded 900, ~200 px) that belongs to the world (on a hanging plate, a wall, a bay door frame — your
choice per variant). The status line is a small backlit legend strip. The version is fine print
with one status light.

**Temperature:** menus-over-the-world — warm ground, amber signal.

**The three variants (three shots, one direction):**

1. **v1 "Hangar"** — the hull in its rig inside a working hangar: gantry, cables, a floor with
   markings, warm work lights, an open bay door top-right showing the deep-field sky.
2. **v2 "Field at dusk"** — the hull parked on an asteroid pad at dusk: rock texture under low
   warm light (the owner's liked picture), a distant station or refinery on the horizon, the sky
   going cold above. This is the "field equipment at dusk" reading.
3. **v3 "Bay door"** — the camera inside the bay looking past the hull out through the open door
   into space: traffic lights moving, a planet edge, the wordmark painted on the door frame.

### Frame B — the Crucible door

**What is on screen (verbatim, all of it):** "Crucible"; "Bring the swarm. Turn the room against
it."; row Mode: Swarm · Gauntlet · Daily · Weekly · Ghost, with "Clear a round. Spend the spoils
or save for a bigger toy. Push your build as far as it goes." and "No ghost for this seed yet.";
row Starter build: Web Weaver · Ricochet Runner · Baseline Energy · Baseline Kinetic · Physics
Toolkit · Massline Rig, with "Bank a stream of bullets around cover. Shove the pack into the rocks,
then boost through."; row Arena: Ricochet Foundry · Lagrange Crucible · Cinder Sluice · Cryo Drift ·
Storm Lattice, with "Hard banks, tight gaps and moving machinery. Turn pursuit into a pile-up.";
Seed "4242" and "New seed"; "Records & challenges"; actions "Launch Swarm" and "Back". Selected:
Swarm, Ricochet Runner, Ricochet Foundry.

**The shot (POSTER, Crucible temperature = white-hot):** the selected arena, Ricochet Foundry —
hard metal banks, tight gaps, moving machinery, forge glow — as a lit set seen from the top-down
game camera's angle but pulled back and tilted for drama; the player's Ricochet Runner build ship
in the lower foreground lit by the forge; light ships (the swarm) massing in the far background as
small lit shapes.

**The hardware:** the three selector rows are rows of **imaged tiles** hanging from the left edge —
mode tiles carry a mark each (a simple emblem for Swarm/Gauntlet/Daily/Weekly/Ghost), build tiles
carry a small rendered hull with its weapon icons, arena tiles carry arena keyart — each tile a
smoked-glass window with a backlit legend beneath and the selected tile lit white. "Launch Swarm" is
**one big machined key** with a live hazard stripe; "Back" is a stencil word. The seed is an
engraved numeric readout with "New seed" as a small key. "Records & challenges" is a fine backlit
legend with a chevron. The title "CRUCIBLE" is a stencil marking at ~160 px.

**What the eye lands on:** the arena, then CRUCIBLE, then the Launch key, then the selected tiles.

## Deliverables (exact)

```
P01-return/
  frames/frame-title-v1.png        1920×1080 composite
  frames/frame-title-v2.png
  frames/frame-title-v3.png
  frames/frame-crucible-door.png
  plates/plate-title-v1.png        the scene without any interface, same camera
  plates/plate-title-v2.png
  plates/plate-title-v3.png
  plates/plate-crucible-door.png
  layers/layer-*.png               OPTIONAL: the interface alone on transparent, exact registration
  crops/crops-title.png            100 % crops of every distinct element: wordmark, legend rail with
                                   focused word, a resting word, status strip, version + light
  crops/crops-crucible.png         100 % crops: title, one tile in rest/selected, the Launch key,
                                   the seed readout, the fine legend
  kit-notes.md                     faces + sizes, every hex, plate/edge/glass values, icon rules,
                                   per-frame composition paragraph (first/second/third read)
  NOTES.md
  manifest.json
```

## Acceptance (all must hold)

1. All four composites exist at 1920×1080 with the exact strings above, legible at 100 %.
2. Each frame passes the two tests in `02_ART_DIRECTION.md` §2 and every line of §5.
3. The world is lit and dimensional in every frame; no frame is words on a dark ground.
4. Each Title variant has one enormous element (the wordmark ≥ 160 px) and one hardware element
   (the legend rail); the Crucible door has the title ≥ 140 px, three tile rows, one machined key.
5. Only OFL-licensed faces are named in `kit-notes.md`; every colour used is listed as hex.
6. The three Title variants are three shots, not three tints — different sets, same direction.
7. `manifest.json` validates against `03_CONVENTIONS.md` §6; `NOTES.md` records the §7 checks.

## Stop conditions

Stop and report in `NOTES.md` if: image generation is unavailable; the tool cannot keep text
legible (then deliver the frame with the text region left as a clean plate and describe the type in
`kit-notes.md`); or the tool cannot separate plates from composites (deliver composites, say so).

## What a bad return looks like (reject yourself before packaging)

A dark screen with a column of words and a hairline. A holographic cockpit. Cyan lines on black.
A grid of gray cards. A frame where the ship is a silhouette on black rather than a lit object in a
place. Text that says things the dossier does not say. Chrome that is glossy. A menu that could be a
website's.
