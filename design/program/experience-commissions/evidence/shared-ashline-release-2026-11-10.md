# Shared Ashline release provenance repair — 2026-11-10

## Outcome and originating failure

The four Ashline Dart/Rig LOD1/LOD2 packages now pass the same provenance, render payload,
runtime-table, and motion-bank validation that rejected the mobile/retail builds at
`scripts/lib/releasePackaging.mjs:497`. This is a common dependency repair for the five commission
PRs, not a new commission or full release acceptance.

Base commit `9e9ebcd906c1c7257ddd94c94e2c8869d5a13b16` corrected extracted GLB node/mesh markers from
`LOD0_` to their actual `LOD1_`/`LOD2_` tier but left release records, pilot records, compiled
packages, and shipping pins describing the previous bytes. Those files were already inconsistent
in base `0ca4e55`; the five commission implementations did not introduce the mismatch.

Exact Git-blob comparisons against that commit's parent proved, for all four authored files and
all four release files, identical binary chunks and exactly 28 JSON node/mesh-name changes per
file. Canonical `inspectReleaseAssetPair` passed all four pairs with no issues: 6/6 KTX2 textures,
15/15 compressed primitives, and all 26 contract node names preserved per release.

## Bounded canonical repair

The build dependencies used the repository lock's exact versions/integrities, installed in a
task-local directory. Repository `package.json`/`package-lock.json` and existing runtime versions
were unchanged. Only declared metadata, the selected payloads/motion banks, and four Ashline LOD0
reference GLBs needed by the family checks were hydrated. The unrelated binary tree was not fetched.

The canonical commands executed were:

```sh
node scripts/build-sg04-release-assets.mjs --resume-valid --no-clean --only=wholeship_ashline_dart_lod1,wholeship_ashline_dart_lod2,wholeship_ashline_rig_lod1,wholeship_ashline_rig_lod2
node scripts/refresh-render-package-pilots.mjs --only=ashline-dart-lod1,ashline-dart-lod2,ashline-rig-lod1,ashline-rig-lod2
node scripts/build-render-package-pilots.mjs --only=ashline-dart-lod1,ashline-dart-lod2,ashline-rig-lod1,ashline-rig-lod2
```

The first command emitted exactly four `skip-valid` receipts. Only its four verified generated
rows were integrated; every original manifest byte outside those row spans, including header,
ordering, and unrelated/blocked rows, was preserved. The only release-row changes were the four
source and four release SHA-256 values. Pilot refresh changed only the four release SHA-256 values.

Only four packages were compiled. The compiler read 422 existing package metadata records to
reconstruct the generated shipping manifest; its summary says `422 production packages`, but the
`--only` selection controlled compilation. The other 418 shipping entries are unchanged.

All eight authored/release GLBs remain byte-for-byte identical to the integration HEAD. Each
rebuilt `render.glb` also retains its exact previous binary chunk and file size; its 56 JSON
changes are node/mesh names and their semantic name/record-ID fields. No geometry or image payload
was regenerated. Existing motion banks and their hashes are unchanged. The only production logic
edit is the four package-content hash literals in `RIGID_ASHLINE_LOD_IDENTITIES`.

Two inherited test fixtures also assumed that an external tier still used `LOD0_`: the authored
family comparison and hull-submission visibility/role selection. They now use the selected file's
actual tier. Exact role counts, original-geometry comparisons, collision/contract checks, seven
batch/fourteen-instance expectations, and all identity-rejection assertions remain in place.

## Generated identities

| Package | Content hash | `render.glb` SHA-256 | Render bytes |
|---|---|---|---:|
| `ashline-dart-lod1` | `08359be3633ee264a288156afe47e4bab484a7aa8bdc93de1c2625765be33fb5` | `66db7fe8d577c11faf8fc55d2dc0500bf3fed562d37bbca7f2d6bd200f58673f` | 481,896 |
| `ashline-dart-lod2` | `ab0399328d49858dcd1b987097f942d84ca3e18f515368f64454fdae775fa8a2` | `7c342568c7eca882d37d1c68ee5648c65b632243194fb133c40cbf626ebe0b97` | 411,936 |
| `ashline-rig-lod1` | `f10bb30df4c3a506d2bd8c6b95f6af25de57ceca7b572b7826d12beaa141e272` | `371f7386aa0c23c07c17ae0fb55e38195085bd5d7b9668a4936cf28f50355581` | 496,876 |
| `ashline-rig-lod2` | `d67943ef594d0567ef1b9149a0b044b268a6afebdf1580365d0342c62576bd61` | `c6fe5bc6e9c4aaf9dd30015fa4e090f623d3c17444ffe67789973eefd28719e7` | 424,644 |

## Verification

All of the following passed on the repaired files:

```sh
node scripts/check-release-manifest-pins.mjs --only=ashline-dart-lod1,ashline-dart-lod2,ashline-rig-lod1,ashline-rig-lod2
node scripts/build-render-package-pilots.mjs --check --only=ashline-dart-lod1,ashline-dart-lod2,ashline-rig-lod1,ashline-rig-lod2
node scripts/check-render-package-encoding.mjs --only=ashline-dart-lod1,ashline-dart-lod2,ashline-rig-lod1,ashline-rig-lod2 --json
node --test --test-concurrency=2 test/ashline-authored-lod-family.test.mjs test/ashline-hull-submission.test.mjs test/ordinary-ship-lod.test.mjs test/live-whole-ship-admission.test.mjs
git diff --check
```

- Pins: 4/4 consistent with exact on-disk release files.
- Deterministic compiler check: all four rebuilt metadata/render payload pairs match a fresh build.
- Encoding: four packages; 1,815,352 render bytes / 1,790,332 release bytes, total ratio 1.014,
  worst ratio 1.0177; geometry-compression extensions retained.
- Native family/admission checks: **83/83 passed**, zero skips. This includes all 30 hull-submission
  cases, four accepted sealed LOD identities, sixteen hash/bank/URL/generation rejection cases,
  authored geometry/contract comparisons, public picking, motion, Pause, and publication lifetime.
- Programmatic scope audit: four release rows, four pilot rows, and four generated shipping entries
  changed; all other entries/header values and all source/release GLB bytes are unchanged.

The actual failing release-copy validator was exercised without a replacement checker:

```js
const keys = new Set(['ashline-dart-lod1', 'ashline-dart-lod2', 'ashline-rig-lod1', 'ashline-rig-lod2']);
const pilots = RENDER_PACKAGE_PILOTS.filter(pilot => keys.has(pilot.key));
const plans = await createReleaseCopyPlans({
  root: process.cwd(),
  mappings: [{ source: 'assets/ships/release', destination: 'assets/ships/release',
    projection: RENDER_PACKAGE_SOURCE_PROJECTION }],
  pilots,
});
assert.equal(pilots.length, 4);
assert.equal(plans.length, 1);
assert.equal(plans[0].omissions.length, 4);
```

This passed all four complete source/provenance/render/runtime/motion checks. Full retail/mobile
bundling was **not** run locally because the remaining binary tree was intentionally unhydrated.
The bounded gate does not establish that every other asset or the full release build passes.
There is no new browser/GPU or visual-performance claim in this repair.
