# Map Flat Diagnostic Guide

Map flats can expose bake, packing, and material-authoring problems that a beauty render hides. Use
this guide when the asset actually uses these maps; it is not a requirement to create every map or to
force weathering/emissive onto every material.

## Contact sheet layout

Arrange in a single PNG grid:

```
| AO          | Roughness   | Normal      | Emissive    |
| (grayscale) | (grayscale) | (RGB)       | (mask)      |
```

Label each quadrant. Include asset id and bake resolution (e.g. 1024²).

## AO diagnostics

**Good:** Panel recesses read darker; overlapping plates show contact shadow; vent slots are deep; multiply blend on albedo would add depth without mud.

**Fail:** Uniform mid-gray; pure black corners; seam streaks; no variation between mechanical and hull zones.

## Roughness diagnostics

**Good:** Intentional material response and spatial variation appropriate to the asset; clean regions
may remain clean, while used surfaces may show wear tied to contact, exposure, and construction.

**Fail:** Single flat value (0.5 everywhere); roughness painted as color tint on albedo instead of baked map; noisy speckle that shimmers in game.

## Normal diagnostics

**Good:** Panel inset lines, bolt heads, grille depth visible in normal-only preview; smooth flats; no purple/green seam spikes.

**Fail:** Normal baked from high-poly that doesn't match low-poly; cage too large (ray leaks); absent when geo is too flat (acceptable if panels are modeled).

## Emissive diagnostics

**Good:** Crisp authored emission assigned to plausible or deliberately stylized sources. The asset's
role may justify sources beyond engines/windows; visible bloom belongs to runtime presentation rather
than a baked photographic flare.

**Fail:** Color baked into emissive; entire hull glowing; photographic lens flare.

## Common failure comparisons

| Weak signal | Stronger signal |
|---|---|
| One gray `MeshStandardMaterial` | AO + roughness variation visible in flat preview |
| Edge highlights from lights only | Edge wear in roughness map |
| Detail from mesh subdiv only | Normal map panel lines at same tri budget |
| Glowing hull | Emissive mask on thrusters/windows only |
| Large file with missing body or unused maps | Complete body and required maps with measured, justified cost |

## Vision check questions

When reviewing `maps_<id>.png` with vision:

1. Can you describe where panel depth is without seeing the mesh?
2. Can you point to edge wear in the roughness map?
3. Would multiplying AO onto albedo add readable depth at game distance?
4. Is emissive limited to propulsion/light sources?

Use the answers to diagnose whether another authoring pass is needed. The live exporter and task's
asset contract—not this guide—decide whether export is valid.
