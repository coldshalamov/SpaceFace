# Per-asset graphics review

The owner requested 20 substantive review/improvement iterations for each individual asset.
Record real actions and decisions; do not manufacture cycles or repeat unchanged checks to reach
the number. A count is not visual acceptance. The game's renderer and gameplay camera remain the
visual authority; see [the graphics front door](../../../../docs/visual-assets/README.md).

The reusable index is built from the release manifest, the runtime package manifest, the Ruckus
mesh registry and the dated [procedural candidate seed](procedural-seed.json). A model's source,
released GLB and runtime package are separate representations; LODs are variants of that model.
Each representation's status says whether it has only manifest or metadata coverage. Code paths
found by literal search are candidates until traced; [facts/](facts/) holds confirmed routes for
models already investigated. Declare a materially distinct playable color/role variant in its
base model's facts with an ID, description and evidence paths; the next index creates a linked
variant record with its own iteration history. The `show` command identifies that model's facts
file; a definition has the shape
`"playableVariants": [{"id":"variant-id","description":"observed difference","evidence":["path/to/evidence"]}]`.
Set `"variationDiscovery":"complete"` only after tracing that model's playable variants. Do not
split mere file copies into new models.

The rebuild also inventories model files in `assets/`, `tools/art/` and `tools/blender/`, including
non-manifest GLB, glTF, Blender and other 3D sources. Manifest-linked files, generated authoring
library outputs, third-party inputs, reference copies, backups and scratch previews are labeled
separately. Source-only files are grouped by directory and filename stem as **unresolved
candidates**, not asserted to be distinct shipped models. Filename links are suggestions only;
trace actual use and duplicate relationships before promoting or deleting anything. Third-party
inputs and preview files are retained in the inventory without assigning them shipped status.
Dependencies, captures, build output and alternate checkouts outside these roots are listed as
excluded classes; this is not a claim that every model anywhere on the machine was inspected.

Broad procedural/presentation groups are explicitly marked as needing individual identity
resolution. The seed is a starting list, not proof of completeness, reachability or current visual
quality. Seeded asteroid and optic visual variants have separate model records, with their own LOD
targets. Expand other groups when actual visible model identities are established, retain any
existing history, and avoid counting a packaged body and its procedural controller twice.
Graphics systems, lighting, textures and effects also require review by their respective owners;
the model index does not certify them.

From the repository root:

```powershell
node scripts/fleet/asset-review.mjs index
node scripts/fleet/asset-review.mjs show SF_SHIP_TOWLINE_KIT
node scripts/fleet/asset-review.mjs source assets/models/asset-bank/structure/airlock_vestibule_lod0.glb
node scripts/fleet/asset-review.mjs summary
```

The generated index and source-file inventory are written to
`.devshots/fleet/graphics-overhaul-asset-catalog/`. A richer optional `catalog-v2.json` supplies
the dated geometry/material census; when absent, the index still rebuilds from repository data and
reports that catalog coverage is unavailable. `index --no-catalog` exercises that path. Refresh
the census after asset changes, and check current bytes before relying on its hashes.

[iterations/](iterations/) contains one small append-only journal per model, so different asset
owners can work on disjoint files. Claim a model before writing its journal; the recorder does not
serialize concurrent writers to the same model. To add an actual iteration, create a JSON file
with `modelId`, `performedBy`, `action`, `observation`, `decision`, `next`, `evidenceScope`, `performance`, a
nonempty `evidence` array of existing paths and a `variantCoverage` array, then run:

```powershell
node scripts/fleet/asset-review.mjs record .devshots/fleet/graphics-overhaul-asset-catalog/events/example.json
```

`variantCoverage` lists only targets actually examined: each row has `target`, `scope` and an
`evidence` path also present in `evidence`. Scopes are `static-data`, `historical-render`,
`current-isolated` and `ordinary-play`; use `[]` if an iteration did not inspect a specific
variant or LOD. `show` lists each declared LOD target and its evidence separately from the model's
iteration count. Named LODs are read from GLB node names or extras; their presence does not
establish runtime visibility. An asset cannot be called fully reviewed simply because it has 20 entries
while one of its LODs or distinct playable variants remains unexamined.

`show` reports recorded iterations and the remainder of the requested 20. A pending comparison,
blank capture, metadata inventory or historical screenshot must not be described as current
player-route acceptance. Report actual measured performance separately from resource counts or a
synthetic benchmark. The recorder rejects missing evidence and exact repeated observations.

Use a single renderer session for several relevant angles/LODs when practical. Every game,
browser and Electron run must use the shared lock. For example:

```powershell
node scripts/fleet/game-lock.mjs run -- node scripts/fleet-look.mjs --files=wholeships/towline_kit.glb,wholeships/towline_kit_lod1.glb,wholeships/towline_kit_lod2.glb --views=place,chase,side --out=.devshots/fleet/graphics-overhaul-asset-review-current/towline-kit
```

Inspect the images and target draw reports before recording a decision. An isolated preview uses
the live renderer but is not the ordinary gameplay route; a source-GLB preview does not prove the
compiled package shipped. Use matched within-session measurements for performance comparisons.
Coordinate shared files and current claims. The owner requires GPT-6 Astra for custom Blender/SVG
model generation and imagegen for generated 2D textures.

The script, facts, seed and iteration journal are repository files; the generated index and large
capture evidence remain in `.devshots`. Preserve the referenced `.devshots` files in an external
backup when moving work to another checkout or clearing scratch. `show` and `summary` list missing
evidence rather than treating a missing capture as a pass. Keep this small journal with the work so
a new session can rebuild the index and see remaining iterations.
