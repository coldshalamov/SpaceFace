# Pelican Production V1

Status: **integration_candidate** (not self-accepted). Distinct live prospector body so Pelican no longer shares the Ironback barge silhouette.

Before any form or surfacing pass: `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md` and `.grok/skills/spaceface-blender-material-truth/SKILL.md`.

## Player-facing read

A one-crew Ceres prospector: short stocky plated hull, two working cutter arms, starboard filter drums, a short survey wand, twin axial ion drives, compact dark canopy, hand-painted return chevron. Heat-stained orange-brown over older grey plates. Not a barge. Not a capsule toy.

## Contract

- Blender +X forward, +Y starboard, +Z up, metres. glTF +Y up.
- Semantic materials: Hull, Armor, Mechanical, Accent, Warning, Canopy, Thruster, Ceramic, Radiator.
- First-party PBR treatment from the in-repo Wasp/Hitch sheet family, retinted per bill. No Hitch geometry copied.
- No embedded plume. Trail sockets mark drive centers.
- Sockets and a non-render collision hull remain separate.

## Frozen identity

Live `hull_miner` envelope (~14.3 × 6.8 × 7.7 m) plus `ship_pelican` visuals. Arms may grow the visible envelope without changing gameplay collision.
