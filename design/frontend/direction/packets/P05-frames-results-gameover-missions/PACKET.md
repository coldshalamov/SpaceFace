```yaml
packet: P05
title: Style frames — Crucible results, game over, missions log, codex
lane: FRAMES
tool: ChatGPT 6 Pro (image generation + scripting VM)
dependsOn: [P01, P03]
current: [crucible-results, crucible-draft, game-over, mission-log, codex, help, tech-tree]
inputs: [design/frontend/direction/approved/frame-crucible-door.png, design/frontend/direction/approved/frame-station-market.png, design/frontend/direction/approved/kit-notes.md]
returns: P05-return.zip
turns: 1 (+1 correction)
```

# P05 — Style frames: the moments and the reading screens

## Objective

Four frames: two POSTER moments (Crucible results, game over) and two BENCH reading screens
(missions log, codex). With P01–P04 these cover every register and every screen family; the
remaining screens (contracts, factions, industry, bar, shipworks, help, tech tree, draft/refit,
pause, new game, photo mode) are derived from these by the code packets without new frames.

## Read

`_COMMON` (all) → `02_ART_DIRECTION.md` §3 → `inputs/` (match the approved Crucible door and
Market frames) → `01_GAME_DOSSIER.md`.

## Frame A — Crucible results (POSTER, white-hot cooling to warm)

A still of the arena after the run — machinery stopped, debris, the player's ship battered in the
foreground. The run told as a story: "BEST CHAIN" with a hero numeral (use 14), the moments as a
short column of engraved sentences ("Wave 6 — three light ships into the bank", "Wave 9 — the
Massline held", "Wave 10 — the boss took the door"), the cause of death and the telegraph you missed
as two lines on a safety-paint strip, the build code as fine print ("RR-4242-SWARM"), keys RETRY
(primary) · CRUCIBLE · MAIN MENU. Records: "NEW RECORD" as a lit legend if true.

## Frame B — game over (POSTER, wanted-cold)

The wreck or the last frame, cooled with the cold temperature. What killed you at 96 px ("Concord
patrol · Vesta Forge"), the final sortie and damage as a second line; three engraved blocks:
recovery dock, recovery cost (hero numeral), cargo consequence; coverage as one sentence; keys
CONTINUE FROM THE RECOVERY BERTH (primary) · LOAD · NEW GAME · MAIN MENU.

## Frame C — missions log (BENCH)

Left: missions as engraved rows on a plate (a class icon, the job in one line, payout tabular, a
status light: ACTIVE/TRACKED). Right: the focused mission opened — name at 96 px, the next step as
one sentence, the reward as a hero numeral, the route as an etched line with two end marks, keys
TRACK · ABANDON (hazard). The world at 25 % glass behind. Use the dossier's contract strings.

## Frame D — codex (BENCH)

A book, not a wiki: left, entry names as engraved rows grouped by etched headers; right, the entry
as a readable measure of text on a paper-toned plate insert (a different, lighter material for
reading — cream `#E9E2D3` at 92 %, dark text) with a plate image where one exists (a rendered hull
or a place), the title at 96 px. Entry: "Kestrel 'Hitch'".

## Deliverables

```
P05-return/
  frames/frame-crucible-results.png · frames/frame-game-over.png
  frames/frame-mission-log.png · frames/frame-codex.png
  plates/plate-arena-after.png · plates/plate-wreck.png
  layers/layer-mission-log.png · layers/layer-codex.png
  crops/crops-moments.png           100 % crops: hero numeral, safety strip, engraved sentence,
                                    the paper insert edge, a status light, a row with icon
  kit-notes.md · NOTES.md · manifest.json
```

## Acceptance

1. Four frames; every line legible; the moments are stills with one hero numeral each.
2. The codex introduces exactly one new material (the paper insert) and it is specified in
   `kit-notes.md`.
3. Materials, faces, hexes match the approved frames; §2 tests and §5 guard pass.
