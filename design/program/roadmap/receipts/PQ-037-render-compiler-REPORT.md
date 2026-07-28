# PQ-037 — PERF-03 offline render-compiler foundation receipt

```yaml
packet: PQ-037
scope: versioned render-package compiler, contract, deterministic fixtures, isolated loader, and equivalence checker
implementationBranch: claude/perf00-20260727
foundationParent: 6a803d8a
synchronizedUpstream: 0f1e6001
foundationCommit: this_receipt_commit
foundationClaim: focused_green
runtimeCutoverClaim: not_started
acceptanceClaim: unproven
phaseDisposition: PARTIAL
qualityInvariant: preserved
```

## What this receipt claims

The lease-bounded PERF-03 foundation is implemented without touching authored ship/place GLBs,
source/release manifests, the default authored loader, or the ordinary runtime composition route. The
foundation can compile an explicit source GLB plus a versioned semantic declaration into a deterministic
`render.glb` and `render-package.json`, validate and compare that package against its source inputs, and
load the generated package through an isolated hash-keyed cache with shared immutable resource lifetime.

This is a **Phase 1 foundation claim only**. It does not claim a Kestrel, dynamic-surface freighter, or
place pilot; source/package visual parity; absence of runtime compilation on an accepted production
route; measured transition improvement; Browser/Electron acceptance; or terminal PQ-037 acceptance.
Those claims remain gated on exact current source/release identities, manifest/runtime leases, pilot
integration, and broker-owned visual/admission evidence.

No FPS, GPU, compositor, admission-latency, or resource improvement is inferred from this workstation.
The machine was not a static performance baseline while other coding agents were active.

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

## Verification

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

## Preserved boundaries

- No production GLB, texture, source manifest, release manifest, asset map, package alias, Blender/export
  tool, authored loader, parts library, renderer, HUD, menu, gameplay, Massline, or simulation file changed.
- Source GLBs remain authoritative. Generated render packages are disposable caches.
- Browser and Electron retain one unchanged ordinary route; the isolated loader is not default-wired.
- WebGL2 compatibility and existing Three.js GLTF/KTX2/Meshopt decoding remain intact.
- Content, population, effects, draw distance, render quality, and default visual quality were not reduced.

## Residual acceptance gap and next action

PQ-037 remains `acceptance: unproven`. The next PERF-03 phase must:

1. rebind exact accepted Kestrel, dynamic-surface freighter, and place source/release hashes;
2. acquire the required asset-manifest and renderer authority before any production write;
3. compile pilots without changing authored quality or source identity;
4. bind package hashes through the accepted release owner and supply them to `expectedContentHash`;
5. route one diagnostic package at a time while keeping ordinary source fallback explicit;
6. prove geometry, material, texture, anchor, socket, dynamic-group, collision, LOD/HLOD, image, and temporal
   equivalence through PQ-034 and broker evidence;
7. prove accepted routes perform no gameplay-time clone/apply/merge/normalize/de-index compilation; and
8. report cold/warm admission, upload, residency, construction, and first-visible evidence separately on an
   uncontended broker machine.

Until those steps pass, this foundation unblocks implementation work but does not satisfy the packet's
pilot, runtime-cutover, visual, admission, or fallback-removal checkoffs.
