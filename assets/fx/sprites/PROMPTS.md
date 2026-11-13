# VFX flipbook sheets (LOOK-05C)

All sheets: 1024x1024 RGBA PNG, 4x4 grid of 256x256 cells, real alpha, read left-to-right, top-to-bottom
(frame 1 = top-left). Generated with Codex (`codex exec -m gpt-6.1-sol`), checked by eye, played by
`src/render/combat/flipbookSprites.js` through the instanced sprite pool (`instancedSpritePool.js`).
Common tail on every prompt: "1024x1024 RGBA, 4x4 grid of 256x256 cells, TRUE transparent background
(real alpha, no checkerboard, no solid fill), no text, no grid lines, nothing crossing cell borders, soft
feathered edges, no hard circle outlines. Top-down space-game VFX, painted-not-plastic, authored by a AAA VFX artist."

- `smoke_billow_sheet.png` — 16-frame warm-grey smoke billow, small dense curl growing into a wispy torn-edged
  billow, lit softly from upper left (#3a3633..#8a8480). Used for SPR_PUFF (dust/smoke), normal blend.
- `fire_burst_sheet.png` — 16-frame explosion fireball: white-hot flash, expanding white-yellow core with
  orange-red turbulent lobes, cooling to dark red embers and black soot tendrils, then ragged wisps.
  Used for SPR_COMBUSTION, additive with HDR heat.
- `shock_ring_sheet.png` — 16-frame shockwave: thin expanding uneven pale-cyan ring of compressed gas,
  faint blue outer glow, broken wispy edge. Used for SPR_RING / SPR_FRESNEL (shock + shield ripple), additive.
- `spark_ember_sheet.png` — 16-frame radial spark and ember burst, bright white-yellow heads with orange
  tails, spreading and thinning. Layered on SPR_FLASH (muzzle/impact/explosion core), additive HDR.
- `energy_wisp_sheet.png` — see status in the LOOK-05C report (first attempt rejected: blocky clipped fringe).
