```yaml
packet: P14
title: Marks — the SPACEFACE logotype, 14 faction crests, mode and arena marks, insignia (SVG)
lane: SVG
tool: ChatGPT 6 Pro (image generation for logotype exploration + vectorising and hand-written SVG in the VM)
dependsOn: [P01]
current: [title, crucible-door, station-factions]
inputs: [design/frontend/direction/approved/kit-notes.md, design/frontend/direction/approved/frame-title.png, design/frontend/direction/approved/frame-crucible-door.png, src/ui/station/icons.js, assets/ui/command-deck-refit/crucible-mark.svg, assets/ui/orbital/brand.svg]
returns: P14-return.zip
turns: 1 (+1 correction)
```

# P14 — Marks: the things that identify

## Objective

The identity marks of the game as vector art usable at 24 px and at 240 px, in the Field Hardware
construction (stencil, manufactured, warm): the **SPACEFACE logotype**, the **fourteen faction
crests** redrawn to one construction while keeping each faction's existing idea, the **mode
marks** and **arena marks** for the Crucible, **difficulty insignia**, and the small **system
marks** the icon family does not cover.

## Read

`_COMMON` → `02_ART_DIRECTION.md` §6 (type) and §8 → `inputs/icons.js` (the existing crest
meanings, keys: `scn mts dmc reach quiet vael free choir helix understory fulfillment archive
pitborn verge_layers`; keep each crest's subject, change its construction) → `03_CONVENTIONS.md` §3.

## Deliverables

```
P14-return/
  marks/logotype/spaceface-logotype.svg          the stencil wordmark, outlined paths, one colour
  marks/logotype/spaceface-logotype-stacked.svg  a compact lockup for small use
  marks/logotype/spaceface-monogram.svg          "SF" mark for the favicon/window icon, 0 0 240 240
  marks/logotype/_explorations.png               the raster explorations you generated and the one chosen, annotated
  marks/crests/crest-<key>.svg                   14 files, 0 0 240 240, `currentColor` + `accent`
  marks/crests/_sheet.png                        at 240 and at 24, on ground and black-on-white
  marks/modes/mark-swarm.svg · mark-gauntlet.svg · mark-daily.svg · mark-weekly.svg · mark-ghost.svg
  marks/arenas/mark-ricochet-foundry.svg · mark-lagrange-crucible.svg · mark-cinder-sluice.svg · mark-cryo-drift.svg · mark-storm-lattice.svg
  marks/insignia/insignia-difficulty-1..4.svg    four steps, one system
  marks/system/mark-crucible.svg · mark-map.svg · mark-codex.svg · mark-save.svg · mark-load.svg · mark-photo.svg · mark-ship.svg · mark-footprint.svg · mark-range.svg
  marks/_sprite.svg · NOTES.md · manifest.json
```

## Rules

- The logotype is a **stencil** (bridged counters), wide, heavy, drawn — not a font set in a text
  element. It must read as painted marking on a plate. Deliver outlined paths only.
- Crests share one construction: a shield or plate silhouette family (two or three shapes), a
  single interior emblem, one accent slot. Keep each faction's subject from the current crest.
- Mode and arena marks are emblems (a circle-plate with an interior symbol), not illustrations.
- All marks survive at 24 px and in black on white.

## Acceptance

1. Every file above; the logotype exists in three lockups; explorations documented.
2. The 14 crests read as one family and each still means what it meant.
3. Sheet renders at 240 and 24 pass; forced-colours pass.

## The way this gets faked

A text element with a font; crests that are fourteen unrelated clip-art shields; mode marks that
are the icon family with a circle around them; a logotype with a swoosh.
