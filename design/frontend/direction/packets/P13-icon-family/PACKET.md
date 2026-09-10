```yaml
packet: P13
title: The icon family — ~80 glyphs, one construction, three optical sizes (SVG)
lane: SVG
tool: ChatGPT 6 Pro (hand-written SVG in the VM) — Codex is the alternate producer
dependsOn: [P01, P02]
current: [flight, station-market, ship]
inputs: [design/frontend/direction/approved/kit-notes.md, design/frontend/direction/approved/crops-hud.png, src/ui/station/icons.js, src/ui/glyphs.js]
returns: P13-return.zip
turns: 1 (+1 correction)
```

# P13 — The icon family

## Objective

One icon family for the whole game: **filled forms with a single stroke detail**, built on a
rounded-square grid, at 24 / 32 / 48 px optical masters, `currentColor` with an `accent` slot for
the amber light. This replaces the current 24 px line icons (`inputs/icons.js`, `glyphs.js` —
included so you know every name that must exist and what each currently means; their *style* is
not to be kept).

## Read

`_COMMON` → `02_ART_DIRECTION.md` §8 → `03_CONVENTIONS.md` §3 (SVG rules, sprite, sheet).

## Construction rules (write them into `ICON_RULES.md` in the return)

- Grid 24: 2 px safe margin, 1.5 px minimum feature, corner radius 2, one stroke detail at 1.75 px.
- Filled silhouette first; the stroke detail is a cut or an inner line, never an outline of the
  whole glyph.
- Every glyph passes at 16 px rendered (the radar and rows use it small).
- Mirror pairs must differ by a second, non-directional channel (Well = filled centre; Repel =
  broken ring) — direction alone fails at 21–32 px.
- The `accent` slot (one path per glyph, may be empty) is where the amber light sits: the lit
  segment of a socket icon, the fill of a status dot.

## Names (all must exist; add none without listing them in NOTES.md)

**Verbs (24):** buy · sell · accept · abandon · track · install · remove · undock · dock · repair ·
refuel · resupply · record · range · scan · hail · fire · lock · brake · boost · tow · line (the
Massline tether) · seed · well · repel · cone · skim
**Things (16):** credits · hull · fuel · cargo · munitions · ore · module · weapon · shield · engine ·
mining · utility · energy-core · heat · energy · drive
**Destinations (7):** market · shipworks · industry · missions · factions · bar · ledger
**Contact classes (12):** you · fighter · freighter · miner · patrol · pirate · derelict · wreck ·
station · gate · beacon · asteroid
**States and UI (21):** ready · cooling · locked · offline · online · warning · danger · info · close ·
chevron-left · chevron-right · chevron-up · chevron-down · plus · minus · check · search · settings ·
help · clock · route · target · spark · pod

(That is 80. `map`, `codex`, `save`, `load`, `photo`, `crucible`, `swarm`, `gauntlet`, `ghost` are
marks, not icons — P14.)

## Deliverables

```
P13-return/
  icons/24/icon-<name>.svg          80 files, viewBox 0 0 24 24
  icons/32/icon-<name>.svg          80 files
  icons/48/icon-<name>.svg          80 files
  icons/_sprite-24.svg · _sprite-32.svg · _sprite-48.svg   <symbol id="icon-<name>">
  icons/glyph-paths.json            { "<name>": ["<path d>", ...] } at 24 for canvas Path2D
  icons/_sheet.png                  the family at 24/32/48 on the ground; and at 24 in black on white
  ICON_RULES.md · NOTES.md · manifest.json
```

## Acceptance

1. 80 × 3 files, sprites, paths JSON, sheet; each file valid, optimised, `currentColor`, no
   `<style>`/`<filter>`/raster.
2. Family test: on the sheet, no glyph looks like it came from a different set; stroke detail
   weight and corner logic are constant.
3. Mirror pairs pass the second-channel rule; every glyph reads at 16 px.
4. Forced-colours render (black on white) keeps every glyph recognisable.

## The way this gets faked

Feather/Lucide-style line icons; inconsistent stroke weights across the set; glyphs that are
literally the letter of the thing; arrows for everything.
