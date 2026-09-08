# assets/ agent orientation

Routes asset work. Manifests, runtime maps, report commands, and current player-route captures are
the status authority — not copied inventories.

## Start by asset type

| Work | Read |
|---|---|
| Any player-facing visual asset | `docs/visual-assets/README.md` first |
| Ship, station, gate, place, Blender/export | `assets/ships/AGENTS.md` |
| Craft / acceptance (G0–G7) | `docs/visual-assets/README.md` |
| Any 3D form or surfacing | `.grok/skills/spaceface-blender-material-truth/SKILL.md` **and** `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`; complete the **preflight**. A technical receipt cannot close G1/G2/G4. A **component-scoped** pass never implies a **whole-asset** pass. |
| Station-bar portraits | `assets/portraits/AGENTS.md` |
| Concept/reference art | `assets/concept/AGENTS.md` |
| Runtime render integration | `src/render/AGENTS.md` |
| Recurring load/fallback failure | `docs/COMMON_BUGS.md` asset sections |

## Classes and truth

- **Runtime:** referenced by live source and included by the bundle/release path.
- **Authoring:** editable source used to produce runtime output.
- **Reference:** mood/concept/donor; never wire unless promoted.
- **Generated evidence:** captures and reports; not source or policy.
- **Procedural/code-native:** a technique, not a substitute for missing authored hero assets.

Bundle roots are defined by `scripts/build-bundle.mjs` and `package.json`. Do not copy a folder list
into policy.

| Question | Authority |
|---|---|
| Accepted or blocked? | Exact entry in `assets/ships/parts/parts_manifest.json` |
| Promoted to release? | Generated release manifest and release build report |
| Can runtime select it? | Exact maps in `src/render/partsLibrary.js` |
| Load / bundle / look right? | `check:assets:live`, `check:asset-status`, `check:asset-reachability`, current normal-route captures |
| Third-party usable? | Provenance, license, hashes, adaptation notes |

Never infer validity from filename, family, age, size, triangle count, or an old queue sentence.

## Promotion and coordination

Do not impose global triangle/texture/technique quotas. Optimize mesh roles, batching, LOD,
compression, culling, and residency — not by replacing authored quality with primitives. Coordinate
with a current lock/build/Blender process on the same output; a historical lane is not ownership.
Never hand-edit generated release metadata. A visible entity does not prove the authored asset
loaded — inspect diagnostics.

Flight HUD stays non-diegetic. Station bar/comms may use the portrait registry. Concept boards are
not runtime textures.
