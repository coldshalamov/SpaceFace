# SF20-19 public package admission: bounded independent review

Verdict: PASS, 2026-10-05. The new check closes the specific admission-proof gap left by direct `compileBlueprint` checks. No material remaining finding in the reviewed fixture/route scope.

## Reviewed fixture pins

Packet: `/workspace/scratch/d2415e46e35b/pip-spanner-package-admission-v1`

- `check-public-lease.mjs`: `8a5baca541bb160e0baca66007b666c3e2bad76569eda933cc20a9863d57f654`
- `cpu-decoder-loader.mjs`: `ac36740d44ab78c456f546a5bb04b002cbf9e5f48006d444966e92bf3d5cb5e1`
- `cpu-ktx2-loader.mjs`: `30b78fa48d88ea4d14c711353a8577987b226fe105bc6d9ec218020fbb0cb4c8`

## Actual production route

Independent execution used the canonical checkout and real `createAuthoredAssetLease(...).load(PIT_CREW_ASSET, {slot:'place'})`. No production source injection, package/admission override, developer source flag, or source fallback is used. The sole module replacement is the fixture KTX2Loader class. Its replacement scope is disclosed below.

The public source-route guard rejects the deliberately unregistered release URL with `AssetContractError`. For the registered URL, the generated pilot selects the published package, content/runtime validation runs in the canonical loader, and `prepareRenderPackageBlueprint` binds the supplied runtime table through the actual package plan. The returned record explicitly reports `render-package`.

The transport only serves the exact Pip package JSON, package render GLB, and Basis WASM. Source release bytes are read separately after public admission solely as comparison data; they cannot fulfill a lease fetch.

Observed pins:

- Source release: `247a57ec9b5d9066b79c9d0f09d3197fd45c51c47ec469af988ad11cfd6245f0`
- Package JSON: `82b0219eb68ac43323200149bb4801e2111908297041dad2fb8b5e6df66acc55`
- Package render GLB: `1f9f4165e1639c856f9ee09d6df7cc5cd52ea7f99617337990c509913d2485f5`
- Expected/content hash: `00b518fd0657e18d479f6f8bb6d018cbe5f1e1ccfd327b032542ff7913ab3c9b`
- Runtime hash: `67ad5c0433f352478793680186ed468cf38f5c475c8937ba8770710ecb706d09`
- `assetLoader.js`: `9594ea185836cb42d695d5e8142d382253489bfd4da26008cd7af94710757d31`
- `renderPackageLoader.js`: `427a44d14678f747c2bd7bd06e26f4ac2a0a88c06259b63767d3a8cb09e5d2db`
- `renderPackageManifest.js`: `7fd87548ea5c102b425e72ffce0c7b81f12e4ad6b8920f983cb4db23118aa1d1`
- `pipSpannerPreview.js`: `3b61958295eb03241ddcfb468bc9349bb80daecd5e372a82fbabddd1be294056`

## Independently observed results

- Exactly 25 primitives, all six required semantic markers, no record warnings
- Actual `instantiatePitCrew` preserves every primitive world matrix, reconstructs rigid groups from flattened names/markers, and passes accepted/repair/denied poses and the authored item-cradle camera projection
- Source-to-public-record geometry comparison passes all 25 meshes and 16,920 oriented triangles. Source vertices: 16,364; package vertices: 16,353 after legal welding. Maximum world-position error: `3.994887807497843e-7` metres, below the `5e-5` metre tolerance
- The comparison's triangle key allows cyclic rotations while preserving winding; triangle-key multiplicity detects missing/duplicated surface triangles. Nearest-position matching allows harmless index reordering and duplicate-position welding. This is a world-position/triangle-surface assertion, not a new proof of UVs, normals or material appearance
- Closed lease refuses further loads; a peer lease reopens the same record without another render-GLB fetch
- A gated real Basis CPU parse allows immediate logical abort/null withdrawal. The actual preview retirement helper remains pending, leaves the lease active and does not dispose the decoder/renderer/context until that raw parse is released and settles
- Both decoder acquisitions retire, all 12 texture parses complete, and the final record census is empty

The render GLB carries 101 Meshopt-compressed buffer views and six KTX2 images. Meshopt decoding is real. The CPU adapter uses the installed Three Basis WASM to transcode all mip levels to RGBA; each load yields three 1024x1024/11-level textures and three 512x512/10-level textures.

## Independent integrity adversaries

Reviewer-only `public-package-negative.mjs` changes transport responses, never production code or disk assets:

1. Change only the served metadata runtime hash: public load returns null, reports the canonical runtime-hash mismatch, and leaves no settled record. No render GLB is fetched.
2. Flip one byte in every served render GLB response: canonical cached/reload recovery attempts still reject with SHA-256 mismatch, public load returns null, and no settled record exists.

These prove that the successful path genuinely crosses the production integrity checks, beyond merely inspecting a package-shaped returned record.

## Reproduction and evidence

From the canonical repository:

```sh
PIP_GAME_ROOT="$PWD" node \
  --loader /workspace/scratch/d2415e46e35b/pip-spanner-package-admission-v1/cpu-decoder-loader.mjs \
  /workspace/scratch/d2415e46e35b/pip-spanner-package-admission-v1/check-public-lease.mjs "$PWD"
```

Reviewer evidence in this report's directory:

- `public-package-admission-final.log` (final exact fixture PASS)
- `public-package-negative.mjs`
- `public-package-negative-runtime.log`
- `public-package-negative-render.log`

## Precise limitations

The replacement KTX2Loader includes its parse implementation, support detection and worker-pool stub. Stock KTX2 parse, Worker messaging/budget scheduling, hardware compressed-format selection, actual WebGL and UI pixels are not exercised. The real production package/lease/retirement machinery operates around the adapter's genuine Basis CPU parse. Program readiness uses a renderer double with no issued programs here; the prior separate GPU-program lifetime review remains the evidence for that boundary. This does not expand the shared decoder correction into a universal proof of hidden vendor-sibling/driver quiescence.

No canonical build or shared write was performed by this reviewer.
