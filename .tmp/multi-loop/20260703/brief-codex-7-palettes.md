# TASK: Data-driven sector palettes (SpaceFace WS-E2) — WAVE 2 (graphics lane — check AGENTS.md ownership signals first)

You are Codex in the SpaceFace repo. Read `design/GDD_2_0.md` §9.2 and AGENTS.md "Concurrent Graphics
Work" (if a graphics lock/lane is active, STOP and report). Study `src/render/renderer.js` (lighting rig:
ambient/key/rim/fill + fog), `src/render/starfield.js` (nebula tint param exists), `src/data/sectors.js`.

## Build exactly this
1. In `src/data/sectors.js`: add a `palette` block per sector. Author FOUR palette classes and assign by
   sector flavor: `core` (clean cyan/steel), `belt` (rust/amber haze), `fringe` (sodium-red murk),
   `anomaly` (violet/green wrongness). Shape:
   `palette: { key: 0x______, rim: 0x______, fill: 0x______, ambient: 0x______, fog: 0x______, fogDensity: n, nebulaTint: 0x______, dust: 0x______ }`
   Derive all values from the CURRENT hardcoded rig (renderer.js) as the `core` baseline so core sectors
   look unchanged. Keep ambient luminance within ±20% of baseline across classes (readability floor).
2. In `src/render/renderer.js`: on `jump:arrive` / sector load, lerp the light colors/intensities + fog
   to the sector palette over 1.5 s (no pop). Starfield nebula regenerates with `nebulaTint` only when the
   sector's tint actually differs (it's a canvas rebake — never per-frame).
3. Dust/`dust` color: export the value on `state.render.sectorPalette` for future parallax layers; no
   consumer yet.
4. `scripts/check-sector-palettes.mjs`: validates every sector has a complete palette block, all four
   classes are used at least once, and luminance bounds hold (compute relative luminance of ambient+fill).

## Constraints
- Files: `src/data/sectors.js`, `src/render/renderer.js`, `src/render/starfield.js` (tint plumb only),
  new check script, package.json (one line).
- No new deps. No per-frame allocations (lerp via preallocated Color scratch). Respect existing
  `check:art` and `npm run check:non-graphics`. Screenshots: if you can run the dev server headless
  probes (scripts/probe-*.mjs pattern), capture before/after per class into .devshots/ — optional.

## Verify
```
node scripts/check-sector-palettes.mjs && node scripts/check-data.mjs && npm run check:non-graphics
```
Write the files. 10-line summary max.
