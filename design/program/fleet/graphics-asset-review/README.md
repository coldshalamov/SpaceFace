# Per-asset graphics review

The owner requests a fast, systematic quality and practical efficiency pass over every in-scope
model. Visually inspect each model, improve its surfaces and construction where needed, and record
the outcome. Use as many iterations as the particular asset needs; there is no fixed iteration quota.
The game's renderer and gameplay camera remain the
visual authority; see [the graphics front door](../../../../docs/visual-assets/README.md).
Use [faction direction](FACTION_DIRECTION.md) to connect a model's construction and finish to its
actual owner, role and story, while checking the live asset selection before applying that direction.

## Breadth-first work

The owner's examples are fleet-wide rejection criteria, not a priority list of individual models.
Unexplained transparent boxes, large flat monochrome surfaces, detached parts, harsh clipped glow,
and mismatched material detail should prompt a check for the same cause across related assets.
Judge a surface by its role, gameplay size and actual appearance. It needs a convincing material
response and appropriate detail; an unfinished primitive or a featureless tinted box is not a
finished cockpit or hull.

For each reachable model, inspect representative gameplay and detail views, apply a suitable
textured or otherwise convincing material treatment to visible surfaces, and check for obvious
geometry, material, texture and draw waste. Preserve intentional functional lights and glass.
Batch similar assets and reuse suitable surfaces where this preserves their individual character.
Record one concise result per model: pending, in progress, passed, or needs follow-up; include the
asset identity/version, views, changes and any remaining issue. A single considered pass can be
enough. Do not require performance captures or benchmarks for this campaign; describe theoretical
savings as such and do not claim a measured speedup without a measurement. Refresh the queue for
newly landed assets and keep unused or uncertain items distinct from player-reachable models.

Start with shared material, lighting, loading and assembly causes that affect many visible assets,
then fix representative groups and move through the remaining inventory in batches. Do not hold the
fleet review on one model while waiting for repeated long captures. Record failed or unfinished
work and return when a concrete improvement can change it. Record a clear per-model disposition;
do not substitute iteration counts or an inventory for visual review. Check captured inputs and fatal browser errors promptly so broken render sessions do
not occupy the shared lock for extended periods.

## Assets arriving through pull requests

The owner extended this review to models, textures and visual systems arriving in concurrent
pull-request merges. The starting inventory is not a cutoff: refresh it against the current
release and runtime manifests as merges land, and apply the same visual, variation, LOD and
performance review to newly reachable assets. Inspect the actual picture at useful gameplay and
detail views; reject unfinished shapes, unexplained parts, flat or washed-out surfaces and excessive
glow. Preserve readable material detail and restrained light while measuring costs separately from
draw or file counts. Use generated image textures where they improve the result, with the existing
imagegen workflow and provenance. Use Luna for bounded cataloging and mechanical work, Terra for
most asset and 3D implementation work, and Sol for difficult one-off decisions; do not use Astra.

When the current local asset list has been reviewed but an asset-bearing PR has not yet landed,
review and improve that PR under the same standards. Coordinate around the separate merge agent's
work and preserve its branch and shared-checkout changes. Record real iterations and unresolved
variants as for local assets; a merged PR or a passing technical check alone is not visual acceptance.

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
establish runtime visibility. Record the actual variants reviewed and any material gaps; an iteration
count alone does not establish coverage.

The current `show` tool still reports a historical remainder toward 20; that number is not a requirement.
A pending comparison,
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
Coordinate shared files and current claims. Use imagegen when generated 2D textures are appropriate.

The script, facts, seed and iteration journal are repository files; the generated index and large
capture evidence remain in `.devshots`. Preserve the referenced `.devshots` files in an external
backup when moving work to another checkout or clearing scratch. `show` and `summary` list missing
evidence rather than treating a missing capture as a pass. Keep this small journal with the work so
a new session can rebuild the index and see remaining iterations.
