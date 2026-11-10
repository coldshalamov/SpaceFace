# Find an exported asset-bank piece

Run from the repository root:

```sh
node scripts/list-asset-bank.mjs
node scripts/list-asset-bank.mjs --category structure
node scripts/list-asset-bank.mjs --id truss_short --json
node scripts/list-asset-bank.mjs --tag modular --category structure --json
node scripts/list-asset-bank.mjs --root assets/models/asset-bank/cargo --json
node --test test/asset-bank-catalog.test.mjs
```

The CLI reads the adjacent JSON sidecars under `assets/models/asset-bank`, not the design batch
manifests. A custom `--root DIRECTORY` selects one directory tree, including temporary fixtures.
Filters are exact and case-sensitive, combine with AND, and never suppress duplicate-ID errors.
Use `--help` for the command summary. Both `--flag value` and `--flag=value` are accepted.

## Output contract

`--json` writes a JSON array only, sorted by category then asset ID using code-point order. An empty
root or no matches returns `[]` successfully. A missing root, malformed sidecar, duplicate asset ID,
unsafe path or missing exported GLB fails with exit status 1 and an error on stderr, without partial
JSON. Diagnostics do not silently omit broken candidate models.

Each item contains:

- `assetId`, `category`, `description`, sorted `tags`
- `dimensions`: XYZ extent computed as `bounds.max - bounds.min`, in the sidecar's `unit`; `bounds`
  retains the original min/max. This is an axis-aligned bound, not a certified mating clearance.
- `socketNames`: sorted names; read `metadataPath` for full positions, orientations and motion rules
- `lods`: level-sorted records with `path`, `triangles`, `draws`, `bytes`, as declared by the sidecar
- `source`: repository-relative authoring recipe; `metadataPath` and LOD paths are relative to the
  selected root, not the current working directory
- `kind`: always `authoring-library candidate`; `runtimeStatus`: the sidecar's declaration, or an
  explicit unknown status when absent

The catalog checks that each declared GLB exists as a regular file. It does not decode GLBs, verify
hashes or remeasure costs. Run `node scripts/check-reusable-asset-bank.mjs` for structural validation.
Metadata costs do not certify GPU performance or the cost of a larger composition.

## Scope and safety

Discovery does not register assets in the game or grant visual/runtime acceptance. These are
exported authoring candidates, which may include local unpublished work. The catalog makes no
claim about which revision has shipped. Use the existing feature-owned integration and acceptance
process described in [the bank guide](README.md).

The scan skips directories named `evidence` and JSON documents without a top-level `assetId` (such
as batch manifests/review receipts). It does not follow symlinks. Metadata source paths must be
plain repository-relative paths without parent traversal, drive prefixes or backslashes; LOD paths
must be simple sibling `.glb` filenames. The scan is bounded to eight directory levels, 20,000
entries and 2 MiB per JSON file. These limits make accidental broad roots fail rather than silently
produce an incomplete catalog. Select the exported bank or a family directory, not the whole repo.
