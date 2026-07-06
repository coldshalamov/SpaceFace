# Map Flat Rubric — What "Good" Looks Like

Agents often ship flat gray because they never produce or review map flats. This rubric describes what professional breakdown posts show in their texture sheets.

## Contact sheet layout

Arrange in a single PNG grid:

```
| AO          | Roughness   | Normal      | Emissive    |
| (grayscale) | (grayscale) | (RGB)       | (mask)      |
```

Label each quadrant. Include asset id and bake resolution (e.g. 1024²).

## AO — pass criteria

**Good:** Panel recesses read darker; overlapping plates show contact shadow; vent slots are deep; multiply blend on albedo would add depth without mud.

**Fail:** Uniform mid-gray; pure black corners; seam streaks; no variation between mechanical and hull zones.

## Roughness — pass criteria

**Good:** Edge wear visible as lighter streaks on leading edges and panel borders; cavities slightly rougher; glass regions isolated to low roughness in separate material or mask.

**Fail:** Single flat value (0.5 everywhere); roughness painted as color tint on albedo instead of baked map; noisy speckle that shimmers in game.

## Normal — pass criteria

**Good:** Panel inset lines, bolt heads, grille depth visible in normal-only preview; smooth flats; no purple/green seam spikes.

**Fail:** Normal baked from high-poly that doesn't match low-poly; cage too large (ray leaks); absent when geo is too flat (acceptable if panels are modeled).

## Emissive mask — pass criteria

**Good:** Thruster bells, window strips, running lights as crisp white shapes on black; no soft photographic glow baked in.

**Fail:** Color baked into emissive; entire hull glowing; photographic lens flare.

## Comparison to "N64 slop"

| N64 slop signal | Professional signal |
|---|---|
| One gray `MeshStandardMaterial` | AO + roughness variation visible in flat preview |
| Edge highlights from lights only | Edge wear in roughness map |
| Detail from mesh subdiv only | Normal map panel lines at same tri budget |
| Glowing hull | Emissive mask on thrusters/windows only |
| 14MB accessory GLB | Budget-sized GLB with hull body + maps |

## Vision check questions

When reviewing `maps_<id>.png` with vision:

1. Can you describe where panel depth is without seeing the mesh?
2. Can you point to edge wear in the roughness map?
3. Would multiplying AO onto albedo add readable depth at game distance?
4. Is emissive limited to propulsion/light sources?

If all four are "no," return to Phase 5 — do not export.