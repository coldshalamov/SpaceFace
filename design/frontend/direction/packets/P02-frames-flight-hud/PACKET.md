```yaml
packet: P02
title: Style frames — the flight HUD, resting and wanted
lane: FRAMES
tool: local Codex (gpt-6-astra xhigh — composed frames from Blender-rendered plates + kit assets; built-in image_gen for mood imagery only) — or ChatGPT 6 Pro native image_gen from the zip
dependsOn: [P01]
current: [flight, power-rail, comms-radial, pause]
inputs: [design/frontend/direction/approved/frame-title.png, design/frontend/direction/approved/kit-notes.md]
returns: P02-return.zip
turns: 1 (+1 correction)
```

# P02 — Style frames: the flight HUD

## Objective

Two 1920×1080 frames of the EDGE register: the flight HUD at rest over a real flight picture, and
the same HUD after the player goes **wanted** (the cold temperature shift). Plus a 100 % component
crop sheet, because the HUD is small-scale detail and code will be built from the crops.

## Read

`_COMMON` (all) → `02_ART_DIRECTION.md` §3 EDGE, §4 materials, §7 temperature, §9 EDGE motion →
`inputs/` (the approved Title frame and its kit-notes: match its materials, faces and hexes exactly)
→ `01_GAME_DOSSIER.md` §4 "Flight HUD" for every string.

## The picture behind the HUD

A real flight shot from the game's chase camera: the Kestrel "Hitch" centred slightly low, a warm
nebula band and a ringed gas giant to the upper right, a derelict freighter mid-distance, stars.
Generate a plate like this (or better) — it must look like the game's own render, not concept art.
Nothing of the interface sits in the middle third of the frame.

## The instruments (all present, all from the dossier's strings)

| Instrument | Where | Material / form |
|---|---|---|
| Tip line "Light ships are ammunition. Swing a rock. Keep the speed." | top centre | stencil text on the world, no plate, 62 % bone |
| Comms tape "BAND OFF ---" | top edge, right of centre | a thin backlit tape with end caps |
| Sector law | top right | a **badge**: the Solar Concord Navy crest, "HIGH SECURITY" on a small safety-paint strip, "HELIOS PRIME · SOLAR CONCORD NAVY" as legends; the sentence about dispatch as one fine line, not a paragraph |
| Local contacts | right, under the badge | an engraved list on a small smoked plate: class glyph · name · distance (tabular) · a faction status light; header "Local contacts 21"; footer "+17 · 5 WRECKS · 12 OTHER" |
| Radar | bottom right | a circular **smoked-glass face** with an etched bezel, range rings, a slow sweep, contact glyphs by class, "N" lit, "RANGE 4.0K" engraved, "YOU" as the centre mark |
| Objective | left, mid-low | a small plate: objective icon, "Recover the 47-A sample from the marked rock", "47-A Recovery Site · 679 WU · ETA 7s" as tabular numerals, a direction chevron lit |
| Status 0 / 10 | above the objective | ten small status lights in an engraved strip, "STATUS" as a legend |
| Band / comms / hail and the log line | left | backlit legend tabs; the log "LOG KESSLER — Kestrel, that pulse is the job…" as one fine engraved line |
| Ship block | bottom left | a gunmetal plate with the hull silhouette in a smoked window; ENERGY 80 and DRIVE 100 as backlit segmented bars with tabular numerals |
| Speed | bottom centre-left | a real **gauge**: an arc with etched ticks, a needle, "95" as a hero numeral (64 px) in a window, legends "weapons Pulse Laser S" and "class Hitch · Starter · Reaction" engraved beneath |
| Action bar | bottom centre | a row of **sockets** (machined recesses) each holding a verb icon with the key engraved beneath (Y · R · SPACE · LINE / 4 SEED · 5 WELL · 6 REPEL / 7 CONE · 8 SKIM), grouped ORDNANCE · FIELDWORK · RIG by etched brackets |
| World tag "Payload · TOW · 69% · READY" | on the ship | a tiny lit tag with a leader line |
| "OBJ 679U · HELIOS PRIME" | bottom right corner | a fine legend |
| Reticle | centre-right | etched crosshair, no plate |

Resting state: legends at 40 %, lights dim, the world dominant. **Wanted state:** every backlight
goes cold white-blue, every signal turns red, the sector law strip flips to "WANTED" on live safety
paint, the radar face cools, one hazard element is allowed to be *lit* (not flashing).

## Deliverables

```
P02-return/
  frames/frame-hud-resting.png     1920×1080
  frames/frame-hud-wanted.png
  plates/plate-flight.png          the flight picture without interface
  layers/layer-hud-resting.png     the HUD alone on transparent (required for this packet)
  layers/layer-hud-wanted.png
  crops/crops-hud.png              100 % crops of every instrument above, labelled
  kit-notes.md                     HUD sizes in px at 1920, every hex, gauge geometry (radii,
                                   tick counts), socket size, plate thickness, legend dim levels
  NOTES.md · manifest.json
```

## Acceptance

1. Both frames exist; every string from the dossier's HUD list is present and legible at 100 %.
2. Nothing but the reticle and the world tag sits in the middle third.
3. No plate is larger than one sixth of the frame; the world remains the picture.
4. Every instrument is a manufactured object (gauge, socket, badge, tape, face, plate) in the
   materials of §4 — no bordered text boxes.
5. The wanted frame changes the whole frame's temperature, not one badge.
6. Materials, faces and hexes match the approved Title frame's `kit-notes.md`.
7. No cockpit, visor, windshield framing or screen-edge arcs anywhere.
