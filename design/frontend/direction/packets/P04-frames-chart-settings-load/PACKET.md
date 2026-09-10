```yaml
packet: P04
title: Style frames — the chart, Settings, Load
lane: FRAMES
tool: ChatGPT 6 Pro (image generation + scripting VM)
dependsOn: [P01, P03]
current: [chart-galaxy, chart, settings, save-load, new-game]
inputs: [design/frontend/direction/approved/frame-title.png, design/frontend/direction/approved/frame-station-market.png, design/frontend/direction/approved/kit-notes.md]
returns: P04-return.zip
turns: 1 (+1 correction)
```

# P04 — Style frames: the chart, Settings, Load

## Objective

Three BENCH frames for the screens that carry the game's *understanding*: the star chart (the
game's map, currently an admin console), Settings, and Load (saves as portraits).

## Read

`_COMMON` (all) → `02_ART_DIRECTION.md` §3 BENCH → `inputs/` (match the approved Title and Market
frames) → `01_GAME_DOSSIER.md` §4 "The chart".

## Frame A — the chart (galaxy scope)

The map **is** the picture: the eight sectors (Helios Prime, Vesta Forge, Ceres Belt, Tethys
Junction, Pallas Drift, Io Reach, Dione Lane, Charon Expanse) drawn as lit star systems on a deep,
dimensional field with faint nebula plates, lanes as etched lines, traffic as small moving lights,
the player's position as a lit mark, the tracked beacon as the one amber signal. The bench sits at
the edges only: left, the lenses as three groups of backlit keys with an engraved group label
(PLACE · FLOW · TROUBLE); top, the scope keys LOCAL · SYSTEM · GALAXY and the search as an engraved
field; right, the inspector as a narrow plate with the selected sector's name at 96 px, one
sentence, and the actions RETURN TO SHIP · FRAME SHIP + DESTINATION · ENGAGE ROUTE as keys; bottom,
the cargo deck as a low tape reading "NO VIABLE DECK ROUTE" with one key. "WORKING 63 / 140 · thin
security" as a small gauge. No panel covers the map's centre.

## Frame B — Settings

The world held behind at 25 % glass. Left: section keys Display · Controls · Audio · Accessibility ·
Game (backlit, the live one lit). Right: the chosen section's controls as engraved rows on one
plate: label, value, and a physical control per row type — a **toggle** (a two-position machined
switch with a lit legend), a **slider** (an etched track with a lit thumb and a tabular readout), a
**stepper**, a **key-bind cell** (an engraved keycap). Invent no settings; use plausible Display rows
(Resolution, Window mode, Render scale, V-sync, Reduce motion, Reduce flash, UI scale).

## Frame C — Load

Saves as portraits: left, the save slots as engraved rows (slot · sector · ship · credits · date) on
a plate; on the stage, the focused save's hull rendered as it is in that save, its name at 140 px,
the objective as one sentence, credits as a hero numeral, sector and date as fine print; keys LOAD ·
DELETE (hazard) · BACK. A populated list (six saves) — never an empty state for this frame.

## Deliverables

```
P04-return/
  frames/frame-chart-galaxy.png · frames/frame-settings.png · frames/frame-load.png
  plates/plate-chart-field.png      the star field with sectors, no bench
  layers/layer-*.png                (required for chart and settings)
  crops/crops-controls.png          100 % crops: toggle both states, slider, stepper, key-bind cell,
                                    a lens key rest/lit, a sector mark, the beacon mark
  kit-notes.md · NOTES.md · manifest.json
```

## Acceptance

1. Three frames, strings present, legible; the chart's centre is the map, uncovered.
2. Settings shows four distinct physical control types; Load shows a populated list and a hull.
3. Materials, faces, hexes match the approved frames; §2 tests and §5 guard pass.
