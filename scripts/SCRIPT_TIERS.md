<!-- LIFETIME: STABLE -->
# npm script tiers — how to read the 660+ scripts

`package.json` carries a flat historical namespace. A newcomer needs four doors, not six hundred
entries. Tiers by role; a script belongs to exactly one tier by its prefix.

## Tier 0 — daily driver (memorize)

| Command | Runs |
|---|---|
| `npm start` / `npm run serve` | the game in a browser |
| `npm run electron` | the same route in Electron |
| `npm test` | the focused node suite |
| `npm run build` / `dist*` | packaged builds |
| `npm run player-truth -- --mode=<m> --gate` | binding gameplay acceptance (modes: swarm, gauntlet, adventure, racing) |

## Tier 1 — program doors (autonomous work)

`program-dispatch` (next unit), `board-chunks` (open seams), `agent-checkpoint` (NOW protocol),
`agent-loop` (fast plan/sim/ui proof batches), `inference:*` (only under an owner INFERENCE
instruction), `campaign:*`, `factory:*`, `jules:*`.

## Tier 2 — validation gates (`check:*`, ~570 scripts)

Contract checks. Grouped by second segment — pick by domain, never run the flat list.

- **Simulation/determinism**: `check:sim`, `check:sim:compare`, `check:sim:long`,
  `check:47a:*`, `check:sg02:*`, `check:sg06:*`, `check:physics-authority`, `check:save-*`.
- **Baseline**: `check:baseline`, `check:alpha:baseline:*`, `check:ci:report`, `check:all`.
- **Economy/missions**: `check:economy:*`, `check:professional-*`, `check:contracts`, career/
  `m1`/`m2`/`m3`/`m4`/`m5`/`m6` milestone families.
- **World/content**: `check:station-*`, `check:sector-*`, `check:traffic`, `check:living-*`,
  `check:named-captains`, `check:encounter-*`, `check:flavor-*`, `check:faction-*`.
- **Rope/combat**: `check:massline:*` (largest family), `check:massline2:*`, `check:tether-*`,
  `check:combat-*`, `check:crucible:*`.
- **UI/render**: `check:ui:*`, `check:map-*`, `check:thruster:*`, `check:vfx`,
  `check:audio-*`, `check:presentation`, `check:camera:*`, `check:type-floor`.
- **Assets/release**: `check:assets`, `check:asset-*`, `check:runtime-assets`,
  `check:electron:*`, `check:release-soak`, `check:steam`, `check:store-assets`.
- **Ceremony/one-offs**: named feature checks (`check:sg02:dash-collision`, etc.) — run the one
  the task names.

## Tier 3 — diagnostics (`probe:*`, `perf:*`, `bench:*`, `capture:*`, `report:*`, `audit:*`)

Measurement and capture tools. Output goes to ignored devshot/report paths; a number is not
acceptance. Never reuse a capture across acceptance cells.

## Tier 4 — authoring (`build:*`, `generate:*`, `author:*`, `bake:*`, `promote:*`, `export:*`,
`wire:*`, `verify:*`, `optimize:*`, `flatten:*`, `sigil:*`, `scene-truth`, `moment-machine`,
`economic-redteam`, `causal-foundry`, `stranger-lab`, `creators-dock`, `credits`, `steam`)

Generators, index builders, asset authoring, and pipeline tools. `build:indexes` regenerates
`docs/EVENT_ROUTING.md` and `docs/SYSTEM_REGISTRY.md` — never hand-patch generated docs.

## Retired aliases

Removed zero-reference duplicates (same command under two names, nothing referencing the alias):
`perf:gltf:inspect` (use `perf:gltf`), `check:validation-broker:massline-live`
(use `check:massline2:live`). One-name-per-command is the rule for new scripts.
