# Plan an asset-bank composition

This authoring tool resolves an explicit placement list against the [exported asset catalog](CATALOG.md).
It outputs a deterministic JSON placement plan without importing the game, registering runtime
assets, or loading geometry. It is useful input for a later scene builder, reviewer or integration agent.

## Run

Save this example as a JSON file outside the exported bank (for example `/tmp/scene.json`):

```json
{
  "schemaVersion": 1,
  "placements": [
    {
      "instanceId": "beam-left",
      "assetId": "truss_short",
      "position": [0, 0, -3],
      "rotation": [0, 0, 0],
      "scale": [1, 1, 1],
      "lod": 0
    },
    {
      "instanceId": "beam-right",
      "assetId": "truss_short",
      "position": [0, 0, 3],
      "rotation": [0, 1.5707963267948966, 0],
      "scale": [1, 1, 1],
      "lod": 1
    }
  ]
}
```

```sh
node scripts/plan-asset-bank-scene.mjs --scene /tmp/scene.json
node scripts/plan-asset-bank-scene.mjs --scene /tmp/scene.json --root assets/models/asset-bank/structure
node scripts/plan-asset-bank-scene.mjs --scene /tmp/scene.json > /tmp/scene-plan.json
node --test test/asset-bank-scene-planning.test.mjs
```

Output is always JSON. `--scene` is required; `--root` defaults to the exported bank, resolved
relative to this script. An explicit root and scene filename resolve relative to the working
directory. `--flag=value` syntax is also accepted. Neither input nor bank files are modified.

## Input and transform contract

- Top level accepts only `schemaVersion` (optional, must be 1) and `placements` (required array).
- Each placement requires `assetId`, `position`, `rotation`, and `scale`. No implicit transform
  defaults hide missing author decisions. Unknown fields, including path overrides, are rejected.
- `position`, `rotation`, and `scale` each contain exactly three finite numbers, in XYZ order.
  Positions and bank bounds use metres; scales are dimensionless and must be nonzero. Negative
  scales are supported as reflections; downstream importers must handle mirrored winding/normals.
- Rotations use radians about fixed axes, applied X, then Y, then Z. Scale is applied before
  rotation, translation last: `T * Rz * Ry * Rx * S`. This is an explicit extrinsic convention;
  do not blindly assign these angles to a renderer's differently ordered Euler object.
- Optional `lod` is a nonnegative integer, default 0, and must exist in the selected asset sidecar.
- Optional `instanceId` must be unique and contain only letters, digits, underscores or hyphens.
  Omitted IDs become `placement-000001`, `placement-000002`, etc., from input occurrence order.
  An explicit ID colliding with an automatically generated one is an error.
- An asset ID can occur repeatedly. No deduplication removes instances or their costs.

## Output contract

The result includes `schemaVersion`, authoring-only `kind`, `unit`, `rotationConvention`,
`matrixLayout`, `placements`, `totals`, and aggregate `bounds`.

Each placement retains input order and its resolved identity/transforms, provides a column-major
4×4 `matrix`, the selected `lod` (`level`, `path`, `triangles`, `draws`, `bytes`), transformed
`bounds`, category, source recipe, metadata path and sidecar runtime-status declaration. LOD and
metadata paths are relative to the selected bank root; source paths are repository-relative.
The matrix is the direct transform contract for downstream tools, avoiding Euler-order ambiguity.

Bounds transform all eight corners of the asset's declared axis-aligned box and then enclose them
in a scene-axis-aligned box. Aggregate bounds enclose all placements. They are conservative bounds
of the metadata boxes, not an exact recomputation of mesh bounds or a collision/clearance proof.
An empty plan returns no placements, zero costs and `bounds: null`.

`totals.instances`, `totals.triangles`, and `totals.draws` count occurrences, using each instance's
selected LOD. They do not infer GPU instancing, batching, culling, resident-memory sharing, camera
visibility or frame performance. Byte counts remain per-LOD metadata; there is no misleading
aggregate memory estimate. All counts must stay within JavaScript's safe integer range.

## Validation and limits

The planner reuses the catalog's bounded scan and validates the entire selected root before
resolving placements. Duplicate asset IDs, missing exports, unsafe source/LOD paths and symlinks
fail under the catalog contract. Missing requested IDs/LODs, non-metre assets, invalid transforms,
nonfinite transformed coordinates and aggregate overflow fail with exit status 1, a diagnostic on
stderr and no partial JSON on stdout. Scene files must be regular, nonsymlink files no larger than
2 MiB, with no more than 10,000 placements.

This does not verify GLB hashes, geometry or socket mating. Run the bank validator separately.
Exported candidates may include local unpublished work; planning does not certify publication,
visual acceptance, a valid physical body, lore, performance or runtime registration. The next
integration still belongs to the existing feature-owned asset/runtime and acceptance pipeline.
