# assets/ agent orientation

This file routes asset work. It deliberately avoids hand-maintained inventories: manifests, runtime
maps, report commands, and current player-route captures are the status authority.

## 0. Start by asset type

| Work | Read |
|---|---|
| Ship, station, gate, place, Blender/export | `assets/ships/AGENTS.md` |
| Craft / acceptance (G0–G7, states, evidence) | `docs/visual-assets/README.md` |
| Existing 3D asset reads plastic/clay/LEGO-like, primitive-stacked, or contradicts its fictional material/function | `.grok/skills/spaceface-blender-material-truth/SKILL.md` **and** `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md` |
| Station-bar portraits | `assets/portraits/AGENTS.md` |
| Concept/reference art | `assets/concept/AGENTS.md` |
| Visual program and priorities | `design/graphics-sprints/README.md` and `design/program/` |
| Runtime render integration | `src/render/AGENTS.md` |
| Recurring load/fallback failure | `docs/COMMON_BUGS.md` asset sections |

## 1. Asset classes and truth

- **Runtime:** referenced by live source and included by the bundle/release path.
- **Authoring:** editable source used to produce runtime output; not loaded directly in default play.
- **Reference:** mood, concept, or donor material; never wire directly unless promoted through the
  runtime contract.
- **Generated evidence:** captures, reports, logs, and intermediate outputs; not source or policy.
- **Procedural/code-native:** intentionally built at runtime. This is a technique, not a quality
  requirement or substitute for missing authored hero assets.

The current bundle roots are defined by `scripts/build-bundle.mjs` and `package.json`. Do not copy a
folder list into new policy; inspect those owners.

### 1.1 Sources of truth

| Question | Authority |
|---|---|
| Is a ship/place candidate accepted or blocked? | Exact entry in `assets/ships/parts/parts_manifest.json` |
| Was it promoted to release? | Generated release manifest and release build report |
| Can runtime select it? | Exact maps/registries in `src/render/partsLibrary.js` |
| Does it load and validate? | Asset diagnostics plus `check:assets:live` / `check:asset-status` |
| Is it bundled and reachable? | `check:asset-reachability` |
| Does it look good in the game? | Current normal-route captures and independent review |
| Is third-party material usable? | Provenance record, origin license, hashes, and adaptation notes |

Never infer validity or quality from filename, family name, age, file size, triangle count, or an old
queue sentence.

## 2. Ship and place routing

Use `assets/ships/AGENTS.md` for the authoring/release/runtime pipeline.

### 2.1 Candidate status

Status is per exact manifest ID. Inspect the manifest and runtime maps; do not copy a current
accepted/blocked roster into policy.

## 3. Promotion, quality, and performance

- Do not impose global triangle, texture, material, technique, iteration, or deficiency quotas.
- Choose geometry/texture/LOD from screen-space contribution and measured residency/draw cost.
- Optimize through sensible mesh roles, batching/instancing, LOD/HLOD, compression, culling, and
  residency. Do not solve performance by replacing authored quality with primitives.
- Require coherent silhouette, materials, scale, sockets, transforms, provenance, reproducible
  source, and player-camera evidence appropriate to the asset's role.
- A Tier A/B material-truth complaint is not satisfied by a generic surfacing pass. Load the focused
  material-truth skill, write the component fiction/material bill, repair the earliest failed form
  or construction gate, and keep exact-source evidence fail-closed.

### 3.1 Coordination

- Treat active release locks/building directories, authoring locks, Blender/export processes, and
  concurrent edits as current ownership signals. Coordinate before touching the same output.
- A historical lane assignment is not permanent ownership.
- Never hand-edit generated release metadata or promote over a live build.
- The runtime asset path may retain a procedural fallback on load failure; inspect diagnostics rather
  than assuming a visible entity proves the authored asset loaded.

## 4. UI placement

- Flight HUD remains non-diegetic; do not wire helmet/visor pilot art as HUD framing.
- Station bar/comms may use the portrait registry.
- Concept boards and labeled sheets are reference material, not runtime textures.

## 5. Verification

Use the narrow set relevant to the change, normally including asset status, reachability, live load,
visual stability, and a representative normal-route capture. Run the release build only when the task
owns promotion and no conflicting lock is active.
