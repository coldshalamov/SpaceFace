# MAPS-2 — the big map becomes a chart you plan on

**For:** a designer-builder with eyes. **Kind:** the full-screen map (M). **One commit per part.**
The director judges your frames. Do this after MAPS-1 and reuse its glyphs.

## Why

The owner (2026-11-20): "the big map might need an upgrade too." It is where an Adventure player
decides what to do next: where the work is, where the danger is, where a price is climbing. Today
it has good bones (the galaxy view's portrait nodes and the hand-drawn atlas ground) and three
problems the director saw in `.devshots/director/fable/screens1/chart-local.png` and
`chart-galaxy.png` (shoot fresh ones):

- **The local view is a blue blotch.** A cloudy texture fills the frame; rock fields are brown
  smudges; stations are identical ring icons; "RUMOR SEARCH · Cache Tally" floats in the middle. It
  does not read as the place the player is flying in.
- **The side panel is a filing cabinet.** Nine tabs (Overview, Route, Missions, Economy, Threat,
  Careers, Services, Discovery, History) over dense small rows; the left rail's list is cut off at
  the bottom.
- **Nothing on it is alive or worth a decision.** No traffic, no fronts, no prices, no jobs on the
  map itself.

## Look first

`node scripts/ui-bench.mjs --shot=chart-local,chart-galaxy,chart-route,chart --viewports=1366x768,1920x1080 --out=.devshots/maps2/before`
and open each PNG. Code: `src/ui/galaxyMap.js` (very large: read in slices, find the local, system
and galaxy draw paths and the panel builder), `src/ui/orrery/chartWorld.js`, `chartHub.js`,
`chartInstruments.js`, `chartLabels.js`, `chartLayouts.js`, `src/ui/map/*`, the map layers
(`src/ui/*MapLayer.js`).

## Build

**Part A — Local view: a survey of the real sector.**
- Draw what is there, from the same data the minimap uses: rock fields as contoured or stippled
  regions shaped by the actual rocks (richer fields denser; mined-out areas visibly thinner),
  stations and outposts with distinct icons and their services as small pips, gates with their
  destination, hazards hatched, shipping lanes as faint dashed corridors.
- What the ship has sensed is sharp; what it has not is fogged. The scan bubble is one ring.
- Live contacts the player currently senses use the MAPS-1 glyphs with velocity tails.
- The player's own things are unmistakable: claimed rocks, bases, drones' routes.
- Replace the cloudy blue fill with a quiet dark chart ground (keep the atlas paper character, lose
  the blotches) so marks carry the picture.
- Hover or select anything: a compact card beside it with its name, one line on what it is, and at
  most three actions (Set course, Track, Details).

**Part B — Galaxy view: decisions on the map.**
- Keep the portrait nodes and lanes. Add layers the player switches with icon chips (not a list):
  **Danger** (pirate and war heat as a soft glow per sector and on lanes), **Jobs** (count and best
  pay per sector, the tracked job highlighted), **Trade** (for the selected good: an arrow from the
  best place to buy to the best place to sell, labelled with the margin, and a tiny trend arrow per
  sector: rising, falling, flat; use whatever price data exists today and say in your receipt what
  you read it from, a new price model is coming), **Yours** (bases, drones, claims).
- A planned route shows as a ribbon with jump count and travel time; hazards along it are flagged.
- Faction regions are soft tinted areas with a name; faction nicknames under sector names are
  either explained in three plain words or removed.
- News that matters appears as a pin on the place it happened.

**Part C — The panel.**
- Nine tabs become four: **Place** (what is here, services, who owns it), **Route**, **Jobs**,
  **Trade**. Threat folds into Place; Careers and Services fold into Place and Jobs; Discovery and
  History move behind a single "Log" link. Nothing is lost, it is just reachable in one more click.
- The left rail keeps the objective card and the layer chips; nothing is cut off at 1366×768.
- One primary button per state ("Set course", "Engage route"); it is never disabled without a
  line saying why.
- Wheel or pinch zooms continuously between local, system and galaxy; the three-step slider stays
  as the indicator. `M` opens and closes. Controller and touch reach everything; `--walk` passes.
- Plain words, `m` and `km`, minimum 12 px type.

## Prove

Before and after frames of local, galaxy with each layer on, a planned route, and the panel's four
tabs, at 1366×768 and 1920×1080. `node scripts/ui-bench.mjs --shot=<the chart shots> --walk`
reports no findings. The chart tests (`ls test | grep -i -E "chart|galaxy|map"`) pass, with the
ones that pin the old nine tabs rewritten. One run in the real game through the lock to confirm the
local view matches the real sector (take a frame of the chart and a frame of flight at the same
moment). In the receipt: frame paths, what data each layer reads, files changed.

## Files

`src/ui/galaxyMap.js`, `src/ui/orrery/chart*.js`, `src/ui/map/*`, the map layer files, their CSS
sources (regenerate sidecars), `tools/ui-bench.js`, tests. Another agent edits player-facing
strings across `src/ui/`: for a shared file use `bash scripts/fleet/own-commit.sh begin <file>`
before editing and `bash scripts/fleet/own-commit.sh commit "<message>" <files>`.
