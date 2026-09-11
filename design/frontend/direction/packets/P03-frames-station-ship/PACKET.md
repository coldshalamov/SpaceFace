```yaml
packet: P03
title: Style frames — docking arrival, the Market, THE SHIP
lane: FRAMES
tool: local Codex (gpt-6-astra xhigh — composed frames from Blender-rendered plates + kit assets; built-in image_gen for mood imagery only) — or ChatGPT 6 Pro native image_gen from the zip
dependsOn: [P01]
current: [station-dock, station-market, station-shipworks, ship, station-ledger]
inputs: [design/frontend/direction/approved/frame-title.png, design/frontend/direction/approved/kit-notes.md]
returns: P03-return.zip
turns: 1 (+1 correction)
```

# P03 — Style frames: the station as a place, and the BENCH register

## Objective

Three 1920×1080 frames that prove the **BENCH** register (instruments on a workbench with the live
scene visible through smoked-glass windows) and the docking moment (POSTER): the arrival at Helios
Station, the Market, and THE SHIP. These three decide how every dense screen in the game looks.

## Read

`_COMMON` (all) → `02_ART_DIRECTION.md` §3 BENCH and POSTER, §4, §6 (the dense register lives in
type and etched rows), §8 (lists of things are imaged tiles; lists of facts are engraved rows) →
`inputs/` (match the approved Title's materials, faces, hexes) → `01_GAME_DOSSIER.md` §4 for the
Station shell, Market and THE SHIP strings.

## Frame A — docking arrival (POSTER, docked temperature)

The berth: your hull sitting in Helios Station's dock interior — a working berth with gantry arms,
cables, service lights, crew equipment, warm light — the hull centred-right. "HELIOS STATION" as a
stencil marking at ~140 px with "Trade Hub · Class L · Solar Concord Navy" beneath. One line of
local news as a backlit legend. The destinations MARKET · SHIPWORKS · INDUSTRY · MISSIONS ·
FACTIONS · BAR · LEDGER as a row of **backlit keys** along the bottom edge (the one hardware set),
UNDOCK as a larger key at the row's end with "READY" as a status light. The vitals (HULL 140/140 ·
FUEL 100/100 · HOLD 0/40 U · MUNITIONS Low · RESUPPLY · 66 MUN · 792 CR) and CREDITS 5,000 cr as a
quiet engraved column top-right on a small plate. The frame warms (docked temperature).

## Frame B — the Market (BENCH)

The berth stays visible through the bench: the hull seen through a wide smoked-glass window behind
the instruments. Left half: the **exchange board** — commodities as a column of engraved rows on a
gunmetal plate (name at 100 %, category at 62 %, price as tabular numeral, trend as a small lit
arrow, demand as a legend), filters as a row of small backlit keys (ALL STOCK 45 · IN HOLD 0 · RAW &
RARE 21 · INDUSTRY 12 · CIVILIAN 6 · SALVAGE 3 · MILITARY 3 · RESTRICTED 0), the selected row lit
amber. Right half: the selected commodity as an **instrument** — "Iron Ore" at 96 px, "79 cr" at
140 px, the price history as an etched trace in a smoked window, the four explanations ("Demand ↑ ·
Trade Hub consumes Iron Ore", "Tight core", "No conflict", "Cyclic") as backlit legends, and the
trade console as a physical thing: BUY / SELL as two keys, quantity as a machined stepper with an
engraved readout, "Total cost 79 cr", one primary key CONFIRM PURCHASE. Station header and vitals
as in Frame A but reduced. Twelve rows visible; the table never wider than half the frame.

## Frame C — THE SHIP (BENCH)

The hull at full bleed in its rig, orbitable, the largest object; hardpoint labels pinned to the
hull by etched leader lines ending in small lit sockets ("PULSE LASER S · PHYSICAL / S" and the
rest). "HITCH" at 140 px with "Turns wide. Sluggish under load. Stops badly." as one engraved line.
The six dials (MASS 32t · ENERGY 80 · SHIELD 115 · CARGO 40u · THRUST 145 · HEAT 10) as **real
gauges** on a plate top-right. The four bands along the bottom edge as four instruments: HANDLING
(Agility 22.71 · Top speed 145 · Inertia 27 · Brake 46.9 as etched scales with lit needles), POWER
(+2/s · CAP 80 · REGEN 12/s · DRAW 10/s), CONDITION (SOUND · "No living-hull marks yet"), and
WHAT YOU CAN DO NOW as three backlit legend tiles (BREAK AWAY INSTANTLY · 150 IMPULSE / CARRY 40
UNITS / TOW THINGS THAT DO NOT WANT TO BE TOWED · NEXT). Keys: TAKE IT TO THE RANGE (primary) ·
RECORD · SELECT A SLOT. Slot strip: Energy core 80 · Weapon 1/1 · Shield 1/1 · Engine 1/1 · Mining
1/1 · Utility 0/1 as sockets with icons.

## Deliverables

```
P03-return/
  frames/frame-station-dock.png · frames/frame-station-market.png · frames/frame-ship.png
  plates/plate-berth.png · plates/plate-ship-rig.png
  layers/layer-*.png                (required for market and ship)
  crops/crops-bench.png             100 % crops: an engraved row (rest/selected), a filter key, a
                                    gauge, a stepper, the primary key, a window edge, a leader socket
  kit-notes.md · NOTES.md · manifest.json
```

## Acceptance

1. All three frames, all strings, legible at 100 %; the hull visible in all three.
2. The Market shows twelve rows and three enormous elements (name, price, one more) and reads as an
   instrument, not a spreadsheet; the table is ≤ half the frame.
3. Every list of facts is engraved rows; every list of things is tiles or sockets with icons.
4. Materials, faces, hexes match the approved Title; the docked temperature is visible.
5. §2 tests and §5 guard pass on all three.
