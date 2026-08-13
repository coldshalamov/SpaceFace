# Hitch quality floor (do not edit Hitch)

Lane: fleet remaster of every live non-Hitch flyable ship.
Hitch/Kestrel authoring is owned by another agent. This file is a read-only floor.

## Variants reviewed

| Variant | Role | Live? |
|---|---|---|
| Live player Hitch body `wholeships/kestrel.glb` (+ LOD1/LOD2) | Default-route starter | Yes — do not edit |
| Borrowed Time V4 package `assets/ships/kestrel_borrowed_time_v4/` | Remaster package + material-truth refs | Review only (v2/v3 are lineage) |
| Hitch modular starter hull `hulls/hull_starter.glb` | Modular fallback, not the hero body | Do not edit |
| `assets/ships/kestrel/` hero/blueprint package | PR #1 standard | Review only |

## Guidance reviewed

- In-tree `docs/visual-assets/` + `.grok/skills/spaceface-blender-material-truth/SKILL.md`
- Merged PR #1 — Hitch hero-asset standard (already in-tree)
- Open draft PR #89 — visual asset production standard (already largely in-tree)
- Open draft PR #4 — stale June kit-hull authoring; hulls already live in-tree; do not promote those binaries

## Floor (what remasters must beat)

Hitch V4/V6 material-truth refs and audit are the construction/material floor:

- Manufactured assemblies, not primitive stacks. A tube/box/torus only survives if its section, load path, and interfaces are visible.
- Distinct physical materials: coated pressure shell (dielectric), brake-formed armor, machined nickel alloy, ceramic isolators, refractory vanes, radiator sheet, laminated glass, cable jacket. Not one recolored Principled.
- Recessed radiators, hatches with rims, drive vanes with roots, sensor as a dish/gimbal not a neon hoop.
- Causal wear, quiet plate areas, size hierarchy (macro / meso / micro).
- Forbidden P0/P1: plastic, clay, leather grain on metal, glowing disks, LEGO bricks, DCC-default surfaces.

Live Hitch is now the V7 remaster (another agent shipped it). Remasters must beat that live body **and** chase the A-list 2026 bar shown in the Hitch component refs (drive vane assembly, midship plate construction, radiator cassette).

## Hitch paths this lane will not touch

Live Hitch wholeship/LODs, Hitch modular starter hull, `kestrel/` and `kestrel_borrowed_time_*` packages, and any in-flight Hitch polish scripts/evidence.
