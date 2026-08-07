# PQ-037 — PERF-03 production render-package receipt

```yaml
packet: PQ-037
scope: compiler foundation plus default-route Kestrel, Helios Span, and place_debris_chunk production pilots
implementationBranch: claude/perf00-20260727
foundationParent: 6a803d8a
synchronizedUpstream: 0f1e6001
foundationCommit: this_receipt_commit
productionPilotCommit: 81134ecfc6028c97d4e84186e8e18fee3c2139bf
foundationClaim: focused_green
runtimeCutoverClaim: three_asset_default_route
acceptanceClaim: route_accepted
phaseDisposition: INTEGRATED
qualityInvariant: preserved
```

## What this receipt claims

The PERF-03 compiler foundation and its bounded production pilot are integrated. Exact accepted release
bytes for the player's Kestrel, common Helios Span traffic freighter, and frequent `place_debris_chunk`
place compile reproducibly into content-hash-bound packages. The default authored loader selects those
packages by exact source URL and instantiates lightweight roots over shared immutable resources. The pilot
route does not execute the former geometry clone/apply/merge/attribute-normalization/de-index preparation.

This receipt claims a shipped three-asset runtime-work reduction and preserved semantics/visual inputs. It
does not infer an absolute FPS, GPU, compositor, or cold-load latency improvement from this workstation.
The headed route was used once to establish reachability and package identity, not as a noisy benchmark.

## Implemented foundation

### Versioned contract and content identity

- `spaceface.renderPackage.v1` validates compiler identity, render bytes, source provenance, stable
  semantic nodes and anchors, dynamic groups, geometry/material records, LOD/HLOD, collision references,
  spatial clusters, bounds, and cross-record references.
- `spaceface.renderPackageSource.v1` validates the explicit semantic input, including immutable/dynamic
  roles, merge/culling/transparency boundaries, anchors, moving groups, and distance/collision records.
- `spaceface.renderPackageSemantic.v1` is a compiler-owned locator payload stored in reserved node extras.
  It binds stable semantic record IDs to decoded objects without treating mutable child indexes or
  loader-sanitized object names as runtime authority.
- Canonical JSON and one shared content-identity projection are used by compiler, loader, and equivalence
  checker. Transport and provenance URIs are relocatable; hashes, byte counts, compiler identity, semantic
  records, render records, and source identity remain content-bound.
- The isolated loader accepts an optional external `expectedContentHash` trust anchor. A supplied empty,
  malformed, or mismatched value fails closed; only `null`/`undefined` means no external anchor. Production
  cutover must obtain this value from the accepted release owner rather than trusting package-local metadata
  alone.

### Offline compiler

- Resolves semantic source nodes by unique authored name and preserves stable semantic IDs in metadata.
- Isolates immutable meshes, primitives, morph targets, and accessors before mutation. It does not call the
  installed `transformMesh()` path that was proven to corrupt normalized integer normals, tangents, and
  morph deltas.
- Bakes an admitted immutable node transform into its isolated geometry. When the node has descendants, a
  deterministic meshless carrier retains the node's original translation, rotation, and scale while all
  authored descendant local transforms remain unchanged. This preserves exact parent-before-child transform
  ordering, including non-uniform parent scale plus child rotation and later runtime child motion, without
  decomposing a multiplied matrix back into lossy TRS.
- Performs fail-closed preflight before graph mutation. Non-identity baking rejects non-invertible or
  negative-determinant transforms, morph targets, tangents, normalized or non-FLOAT normals, unsupported
  POSITION component types, skins, and nodes referenced as skin joints or skeleton roots. The compiler also
  rejects transform-animated subtrees, cameras, node extensions, geometry accessor extras/extensions,
  collisions with the reserved semantic extras key, and `KHR_mesh_primitive_restart`.
- Rejects merge groups that cross dynamic, independent-culling, parent, merge-boundary, pipeline,
  transparency, culling-group, spatial-cluster, or overlapping-membership boundaries. Merge candidates with
  morph targets, node or mesh weights, weight animation, node-scoped LOD/HLOD records, or mesh/primitive
  extras or extensions fail before geometry is moved.
- Joins only compatible independent points, lines, and triangles. `LINE_LOOP`, `LINE_STRIP`,
  `TRIANGLE_STRIP`, and `TRIANGLE_FAN` primitives stay separate so a joined draw cannot create topology
  between source primitives.
- Uses bit-identical `weld({ overwrite: true })` plus Meshopt performance reordering; it does not simplify
  meshes, reduce textures, change materials, alter authored LOD distances, or intentionally de-index source
  geometry.
- Removes detached pre-bake geometry after replacement while retaining live semantic and morph metadata.
- Stamps compiler-owned semantic record IDs after graph transforms and before serialization.
- Emits deterministic render bytes, stable metadata bytes, source/semantic/render hashes, geometry/material
  hashes, texture color-space records, diagnostic node paths, transforms, bounds, and spatial clusters.
- The CLI compiles only explicitly named inputs and outputs. It does not mutate release manifests.

### Isolated package loader and residency

- Validates package schema and canonical content identity before decode.
- Traverses the actual decoded or cloned Three.js object graph once and resolves nodes and anchors by the
  compiler-owned semantic record IDs. Missing, duplicate, unknown, malformed, schema-mismatched, or
  raw-name-mismatched locators fail closed. `nodePath` remains diagnostic metadata only.
- This lookup remains valid when `GLTFLoader` expands a multi-primitive glTF node into additional objects or
  sanitizes slash-bearing `Object3D.name` values.
- Decodes once per content hash and reuses the existing `assetResidency` registry rather than creating a
  second production residency authority.
- Retains one cache owner plus one owner per live instance. Geometry, material, and texture resources are
  shared and disposed exactly once after the final owner releases.
- Creates independent lightweight scene roots and dynamic-group transforms while sharing immutable GPU
  resources.
- Deep-freezes accepted canonical metadata, makes its binding non-writable, and keeps the mutable decoded
  template private so callers cannot redirect later semantic resolution under an accepted hash.
- Cancels in-flight generations on disposal, including disposal during asynchronous content hashing and
  after decode but before residency commit.
- Preserves absolute, protocol-relative, root-relative, ordinary relative, and parent-relative render
  references. Relative render URLs use the final `Response.url` after metadata redirects.
- Ordinary `load()` is fail-closed. Only explicit `loadWithSourceFallback()` can invoke the diagnostic
  source route, and its result records whether `render-package` or `source-fallback` was used.

### Deterministic equivalence route

The checker supports:

1. package-to-package byte comparison for `render.glb` and `render-package.json`; and
2. source-to-package comparison that verifies render integrity, package content identity, source GLB and
   optional source-manifest provenance, normalized semantic identity, and a byte-identical temporary rebuild.

A changed semantic declaration produces both semantic-provenance and deterministic-rebuild failures.
Corrupt render bytes and altered package metadata are reported separately.

## Focused semantic proof

The deterministic focused fixtures prove:

- two identical builds of a translated immutable merge group remain byte-identical, indexed, and separated
  from a translated dynamic node;
- only compatible independent primitive modes join, while strip/fan topology remains separate;
- unsupported bake streams, skin-joint ownership, reserved extras collisions, accessor metadata, primitive
  restart, and unsafe merge morph/weight/animation state reject before an output file is written;
- a non-uniform immutable parent plus rotated anchor and dynamic descendant has the same decoded neutral
  world matrices before and after compilation, and remains equivalent after runtime translation, rotation,
  and scale are applied to the dynamic child;
- an identity-transform morph mesh retains its named live target while detached pre-bake resources are absent
  from the serialized package; and
- the default public loader resolves slash-bearing semantic names and anchors from a real installed
  `GLTFLoader` decode of a multi-primitive node, rather than relying on glTF child paths.

## Adversarial repairs before disposition

1. Replaced compiler-local package hashing with the shared canonical projection used by the loader and
   equivalence checker, so relocation does not create a false content generation.
2. Reused `assetResidency` and repaired package/instance owner transitions, final disposal, cache-owner
   reacquisition, and decode-after-dispose behavior.
3. Added compatible indexed primitive joining instead of merely declaring merge groups in metadata.
4. Rejected duplicate and overlapping merge-group membership.
5. Restricted primitive joining to independent points, lines, and triangles; line loops/strips and triangle
   strips/fans stay separate.
6. Replaced unsafe whole-mesh transform mutation with isolated primitive/accessor mutation and explicit
   fail-closed stream admission.
7. Added skin-joint/skeleton ownership, primitive-restart, accessor metadata, and reserved-extras preflight
   before any graph mutation or output.
8. Replaced descendant matrix premultiplication/decomposition with the exact meshless-carrier hierarchy.
9. Rejected morph, weight, and weight-animation merge inputs before geometry can move between nodes.
10. Made compiler-owned semantic IDs authoritative in the actual decoded Three.js graph; diagnostic
    `nodePath` records no longer control runtime lookup.
11. Removed detached pre-bake geometry while preserving live morph metadata.
12. Made accepted metadata immutable and moved the decoded template behind private loader state.
13. Added an external expected-content-hash seam and made empty/invalid anchors fail closed.
14. Repaired disposal during asynchronous hash verification so no later decode can be admitted.
15. Repaired absolute, protocol-relative, root-relative, parent-relative, and redirected metadata URL
    handling.
16. Disposed decoded geometry, material, and texture resources when semantic template validation fails
    before residency registration.

One bounded causal re-review of only the repaired blocker classes returned `clean: true`, with no findings or
deferred items. No additional broad discovery loop was opened.

## Foundation verification (historical)

| Gate | Result |
|---|---|
| Loader focused suite | **11 pass / 0 fail** |
| Compiler/schema/equivalence focused suite | **12 pass / 0 fail** |
| Combined focused foundation coverage | **23 pass / 0 fail** |
| Bounded causal review of repaired blocker classes | **CLEAN** — 0 findings, 0 deferred |
| `node --check` on contract, compiler library, equivalence checker, CLI, and loader | **PASS** |
| `npm run check:asset-pipeline-contract` | **PASS** — 14 focused checks |
| `npm run check:asset-reachability` | **PASS** — 53 referenced runtime assets present and bundled |
| `npm run check:sim:compare` | **PASS** — uninterrupted and reload-at-600 hashes equal (`271605e7639ef3ec8519c42a9d8b227938fdac76aa72bd914a6c922f13588af1`) |
| `npm run check:baseline` | **PASS** — 10/10 green; no timing or performance claim |
| `git diff --check` | **PASS** — line-ending conversion warnings only; no whitespace errors |
| `npm run check:runtime-assets` | **RED at unchanged production assets** — Kestrel missing authored hull LOD markers; two Wasp LOD files use uncompressed textures |

The runtime-assets gate reads production release assets that this bounded foundation was prohibited from
modifying. Its three reported required failures remain open and prevent a terminal packet claim; this
receipt does not relabel the gate green or use the isolated compiler foundation to bypass it.

## Production pilot closure 2026-08-05

### Exact inputs and reproducible outputs

`assets/ships/render-packages/pilots.json` binds the three accepted release rows and refuses a build if
either the release-manifest identity or the actual source bytes drift:

| Pilot | Accepted source SHA-256 | Source bytes | Package content hash |
|---|---:|---:|---:|
| Kestrel / `SF_K0_KESTREL_BORROWED_TIME_V4` | `dc4b841191e76e175f9e3aac93f30a9b4a1578b2f4da4127b83146468185c1a2` | 31,799,928 | `f8e332fe6af5fce6ebc1b6788cd16e974525777121bebcf52811c47e6e907d6b` |
| Helios Span / `SF_WHOLESHIP_HELIOS_SPAN` | `5fb2a62c79d3bc07777c5bf5ff9d2e26554e2bf3bfca051ba470d28adb6ed1b5` | 14,153,500 | `7e6c4c3d5cb8c56114caac47d7ca90113c5a2968157cbdd7c754377b4988e317` |
| debris / `place_debris_chunk` | `016e7a103a40b7ba3183d56fcef1362aea0c3723274b49d4ab2439ae51151a26` | 1,527,596 | `e22c1baf1823a7dbaac0450ccc6cd1f58946ba7a4210e6157f6cd4ada4f95999` |

The build derives semantic node, anchor, socket, dynamic-surface, and collision declarations from unique
authored names, compiles all three packages, and generates the runtime trust manifest. `--check` rebuilds
into a temporary directory and compares every generated byte; a stale source hash, source size, release
row, package byte, metadata byte, or runtime binding fails closed. Production quantized normalized NORMAL
and TANGENT accessors are promoted to `Float32Array` offline before immutable transform baking, while the
package retains indexed topology.

### Default-route work removed

`assetLoader` selects a package only for the three exact accepted source URLs and configures the same
GLTF/KTX2/Draco/Meshopt decode stack as the source route. Validation, material profiles, tags, dynamic
bindings, sockets, collision visibility, placement, palette, LOD, and disposal still use their existing
runtime semantics. Other authored assets keep the unchanged source route.

For a package record, `partsLibrary` now creates a lightweight stable root and uses the loader's shared
immutable resources. It does not enter `compositionPrimitives`, `buildStaticBatchGeometry`, or
`normalizeStaticBatchGeometries`, and therefore performs no gameplay-time geometry clone, matrix bake,
merge, normalized-attribute promotion, or de-index conversion for these pilots. A focused route test makes
`geometry.clone()` throw and still constructs the debris place successfully; every visible pilot mesh in
the live route remained indexed.

### Bounded live proof

One headed after-route used the ordinary New Game path at default quality and produced no page errors.
The player Kestrel and spawned Helios Span both reported `render-package` route identity from ordinary
startup; the same live renderer then loaded `place_debris_chunk`. The route observed 18 direct player
meshes, 17 indexed visible Kestrel meshes, 24 indexed visible Span meshes, and 19 indexed visible debris
meshes. This is reachability and semantic-route evidence, not a cold-load timing comparison.

### Exit verification

| Gate | Result |
|---|---|
| Compiler/loader/pilot focused suite | **27 pass / 0 fail** in 719 ms |
| `npm run check:render-package-pilots` | **PASS** — all three outputs rebuilt byte-identically |
| `npm run check:asset-pipeline-contract` | **PASS** — 14 focused checks |
| `npm run check:asset-reachability` | **PASS** — 58 referenced runtime assets present and bundled |
| `npm run check:baseline` | **8/10 green** in 30.4 s, the same green set and same two foreign dirty-path failures as entry: HUD binding text in `src/ui/uiRoot.js`, save-schema drift from `src/core/gameState.js` |
| `npm run check:runtime-assets` | **RED at unchanged accepted inputs** — the pre-existing Kestrel missing-hull-LOD marker and Wasp uncompressed-texture findings; neither source asset nor release manifest changed |
| Headed routes spent | **1 after / 0 before** — one default-route semantic reachability proof, no retry |

The runtime-assets failure fingerprint and the two baseline failure fingerprints were each recorded once
and not used to start a validator-tuning loop.

## Preserved boundaries

- Accepted source/release GLBs, textures, source/release manifests, Blender/export tools, renderer, HUD,
  menu, gameplay, controls, saves, Massline, and simulation code did not change in this slice.
- Source GLBs remain authoritative; generated render packages are reproducible disposable caches.
- WebGL2 compatibility and the existing decode, asset-residency, generation, and disposal authorities remain
  intact; no second registry or permanent dual compiler was introduced.
- Content, population, effects, draw distance, art density, render quality, and default visual quality were
  not reduced.
- This closes the required three-asset production pilot. Broader package expansion and absolute cold/warm
  admission benchmarking remain optional later units, not hidden conditions on this accepted pilot.

## Geology-family production expansion 2026-08-06

The ordinary authored-place source URLs for `place_asteroid_rock_a`, `place_asteroid_rock_b`, and
`place_asteroid_rock_c` now resolve through the same accepted production-package route. The binding keeps
both existing identities explicit: the live place IDs remain the source-URL selectors, while the internal
authored GLB identities remain `SF_PLACE_HELIOS_ROCK_A/B/C`. No source or release GLB, texture, material,
LOD node, placement, collision, gameplay data, renderer setting, or quality default changed.

| Package | Accepted source SHA-256 | Package content hash | Indexed geometry |
|---|---|---|---:|
| Helios Rock A | `05d8ed9c2770df65d48c331a843a92052efe5bc86990932364d403fe7e1983a6` | `da6de21f6db41ac2f853067c74b6af6629e67996d4a11040cfb9d458c62bedb5` | 6 / 6 |
| Helios Rock B | `4d6dfecdbbd783a4694a19f03aa65300a3ea6bfd905785950b33f7eacaec114f` | `c74ea12b1518565d4b51834ba8954c7374b8c683d46f53daade4763ee27a10e4` | 6 / 6 |
| Helios Rock C | `6e6d96ad5f75fb1908236204171462329fb491de5a14ee3ac0c29ba98fe42752` | `273659798ba653d0b64e3542f2a12bfd9e5155ed7af06ea49013d365fbfd4f13` | 7 / 7 |

Adding a package changes the hash-bound source-manifest provenance for the existing package set, so the
generated metadata and runtime trust manifest were atomically rebound. With the lockfile's exact glTF
Transform 4.4.1 toolchain, every previously accepted `render.glb` remained byte-identical; only the three
new geology binaries were added.

Focused verification was bounded to the production seam: `test/render-package-pilots.test.mjs` passed
3/3, and `npm run check:render-package-pilots` rebuilt all 17 packages byte-for-byte. The broader
`check:runtime-assets` command retained its unchanged three-source fingerprint (Kestrel hull LOD markers
and two uncompressed Wasp LOD releases); none of those inputs are in this unit, and the command was not
repeated. No headed route or one-use performance claim was spent on this deterministic offline expansion.

## Resource-worksite production expansion 2026-08-06

Five accepted mining/claim-site releases now enter through immutable production packages: the common
seamed asteroid, conveyor barge, and claim-outpost base, refinery, and relay. Together they move 45.25 MB
of prepared render data and 78 indexed geometry records off the gameplay-time geometry preparation path.
The three outposts retain their seven named anchors and collision reference; the seamed asteroid and barge
retain their authored hierarchy and socket records.

| Package | Accepted source SHA-256 | Package content hash | Indexed geometry |
|---|---|---|---:|
| Seamed asteroid | `31cc9bae776abf00913e98bbc788b56a363cc6eaedcd4e1d5ae8a3cd624323d4` | `5d4e44d0c8a3aecc81c2351126295b32e7cb7882451e93c9a0c7fd2db95bbeee` | 25 / 25 |
| Conveyor barge | `f304e55850309a53bd490525c53469337ea80ae87b0bf688e88b2455aab2d47e` | `a7440840278704949f52a238e288dcac77eaf3748868cb6addcacb79e6da198c` | 5 / 5 |
| Claim outpost base | `6dab7e40086ddd6c0041977fac879069875d99a1aed52f2cb37962352658b4f0` | `f829af1a56457ede5eb62f15e72934f89e8fbd20f0fb8f9ef8794190bc4c648e` | 16 / 16 |
| Claim outpost refinery | `63802aa4f426a9031139e939e16f47d0e1e9fc37ea4c1f6c86bb914ec9cf82c7` | `68de9e73e3b79581517adb4e460af915c31555db11180c76b67b13b1de730997` | 16 / 16 |
| Claim outpost relay | `85b8d74e7719203766937289b2ed5756294c4a9d48612c0432c6f036644167a8` | `594ee633299dd3cc100f8d4fca4b63439b7bed5493282948230285b4fb2c7694` | 16 / 16 |

`test/render-package-pilots.test.mjs` passed 3/3 and the single allowed rebuild comparison reported
22/22 fresh production packages. Source/release GLBs, materials, LODs, placement, gameplay, controls,
saves, authored density, and default quality did not change. The mining drone was not admitted by this
unit: its accepted GLB declares no internal `assetId`, so the asset-metadata owner must add that identity
before the fail-closed compiler can package it; the compiler check was not weakened or bypassed.

## Navigation-marker production expansion 2026-08-06

Four repeated travel/arrival markers now use immutable production packages: navigation buoy, lane
beacon, station billboard, and memorial array. The exact accepted releases contribute 6.49 MB of
prepared render data and 57 indexed geometry records; each retains its authored root and anchor record.

| Package | Accepted source SHA-256 | Package content hash | Indexed geometry |
|---|---|---|---:|
| Navigation buoy | `5f7c43a66b4563d40e4a6df1fe35698c11489263f81746b55a86b7eabcc886e6` | `2ca909ea127743a15f343f7c193337e8a1cfc72a16cfe0a2283a9d46bb21b432` | 15 / 15 |
| Lane beacon | `72bb0fabefed2b1b81c8cd4d70a3b3ef7abbad1f09010dde14c5f0fe15d1cbbe` | `bb929c9350ee3508ebf6c27bdec14d90abf63b10fff5526755058cbd9ccda9f3` | 12 / 12 |
| Station billboard | `1a780be072b47a1ba38dbd977fdcfb16c5d1a7318213c1edc167cd5025b5d0c5` | `f454262997dccbc9949100cf2560cbe106bf735a5c9327c8c561bd1b0d248981` | 15 / 15 |
| Memorial array | `7bb0c7709a33e7b3972d5a32226037605792666b439c94b934dc04d15b238667` | `ef12b916806e58598e0f1ee0f1310c8ce5ebedf5467cac37b3e94798af1bb750` | 15 / 15 |

`test/render-package-pilots.test.mjs` passed 3/3 and the single rebuild comparison reported all
26 production packages fresh. The source/release GLBs, materials, placement, art, gameplay, controls,
saves, density, and default quality remain byte-for-byte or behaviorally unchanged; only deterministic
package outputs, provenance hashes, and the generated runtime trust binding changed.
