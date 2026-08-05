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
