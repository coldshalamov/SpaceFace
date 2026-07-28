<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-022
leafId: PQ-022.exterior-relay-collar
acceptance: focused_green
disposition: PASS
candidateCommit: 9e6aafb86b9e3319a7a27909b053ab932aa9c39c
-->

# PQ-022 leaf — exterior claim relay/collar admission

```yaml
parent: PQ-022
leafId: PQ-022.exterior-relay-collar
assetIds: [place_claim_outpost_relay]
playerRoute: canonical player route -> New Game (seed 47) -> flight -> anchored Asteroid Ops claim in sector_helios_prime
sourceOwner:
  - assets/ships/parts/places/place_claim_outpost_relay.glb
  - assets/ships/release/parts/places/place_claim_outpost_relay.glb
runtimeOwner:
  - src/render/partsLibrary.js
  - src/data/worldSiteAssetBindings.js
  - src/systems/asteroidSites.js
baseCommit: c6d83fe4
candidateCommit: 9e6aafb86b9e3319a7a27909b053ab932aa9c39c
lifecycleClaim: implemented
acceptanceClaim: focused_green
disposition: PASS
decision: ACCEPT AS-IS (structural); visual verdict deferred with a recorded reservation
assetMutations: none
```

`candidateCommit` is the parent of the commit carrying this receipt: it is the tip that contains
every artifact the claims below rest on. The receipt commit adds only this file.

## What this leaf claims

The already-authored `place_claim_outpost_relay` is the correct exterior relay/collar identity to
carry into PQ-024 **structurally**, and it reaches the flight world through the ordinary place path
with no repair and no asset mutation. Source/release/manifest/runtime identity, release fidelity,
transform and LOD behaviour, the PQ-017 socket snapshot, and the Asteroid Ops exterior projection
are proven here.

Final visual acceptance is **not** claimed, and this leaf does not grant it. PQ-024's entry
condition already anticipates that ("the existing generic relay ... cannot satisfy final visual
acceptance unless independently approved for this role"); the evidence below supports that caution
and states precisely what re-authoring would have to deliver.

## 1. Identity

| Field | Value |
|---|---|
| partId / liveId | `place_claim_outpost_relay` |
| assetId | `SF_PLACE_CLAIM_OUTPOST_RELAY` |
| authored root node | `SF_PLACE_CLAIM_OUTPOST_RELAY_ROOT` (single top-level, identity TRS) |
| claim spec | `spec_relay` |
| source | `assets/ships/parts/places/place_claim_outpost_relay.glb` |
| source sha256 | `a93c7b4d8fd23fa925fb99c025a544dacf13716e374261b8c487399c2196fda8` |
| source bytes | 13,230,948 |
| release | `assets/ships/release/parts/places/place_claim_outpost_relay.glb` |
| release sha256 | `dc07ebef0ea61a45e778ecbb8a9ac4dfda4e71e4970433337e0ead084fffdcc2` |
| release bytes | 8,303,864 (37.2% smaller) |
| reproducible source | `assets/ships/m5_claim_outposts/blender/place_claim_outpost_relay.blend` |
| generator | `tools/blender/build_claim_outpost_family.py`, Blender 5.1 |
| authored evidence | `assets/ships/m5_claim_outposts/evidence/place_claim_outpost_relay.json` |

The frozen m5 source copy at `assets/ships/m5_claim_outposts/source/places/place_claim_outpost_relay.glb`
is byte-identical to the canonical part (13,230,948 B, same digest). Provenance is first-party and
reproducible; no third-party intake applies.

### Manifest rows (unchanged by this leaf)

| Row | Location | Contents |
|---|---|---|
| part | `assets/ships/parts/parts_manifest.json:3909` | `category: places`, `priority: P0`, `file: places/place_claim_outpost_relay.glb`, `textureSize: 1024`, `mount: origin`, `tris: 59052`, `bytes: 13230948`, `tintable{hull,accent}`, `factionAccentVariants{core,belt,fringe,anomaly}`, 7 sockets, bounds |
| runtime slot | `assets/ships/parts/parts_manifest.json:4394` | `runtimeSlots.place` includes `places/place_claim_outpost_relay.glb` |
| release | `assets/ships/release/release_manifest.json:902` | both paths, both digests, both byte counts, `textures: 15`, `ktx2Textures: 15`, `meshoptBufferViews: 65`, `contractNodeCount: 22` |

Four independent records agree on the same two digests: the authored evidence JSON, the release
manifest, the PQ-017 binding in `src/data/worldSiteAssetBindings.js:78`, and the bytes on disk.

### Runtime binding sites

| Site | Role |
|---|---|
| `src/render/partsLibrary.js:72` | `spec_relay -> places/place_claim_outpost_relay.glb` (the only filename map) |
| `src/data/worldSiteAssetBindings.js:78` | PQ-017 immutable snapshot: both digests, byte counts, root name, `visualCenterXZ {x: 3.3318, z: 0}`, 7 socket transforms |
| `src/data/worldSiteManifests.js:77` | `world_site_helios_relay` visual root, `initialScale: 0.14` |
| `src/data/worldSiteManifests.js:149` | stage `damaged` "DARK RELAY", `scale: 0.14` |
| `src/systems/asteroidSites.js:1133` | **the PQ-024 exterior route** — `_ensureBeacon`, `placeScale: 0.16` |
| `src/systems/automation.js:73`, `src/data/heistFacilities.js:52` | other consumers of the same placeId |
| `scripts/check-claim-outpost-visuals.mjs:14` | the repo's own family auditor |

The relay already carries a component named `receiver_collar` / "RECOVERY COLLAR"
(`worldSiteManifests.js`, anchored on `SOCKET_Dock_Approach`) — the relay **and** the collar in
PQ-024's phrase resolve to this one asset.

## 2. Structural audit

Measured directly from both GLBs (`@gltf-transform` with the meshopt decoder), with node transforms
applied.

| Property | Source | Release |
|---|---|---|
| nodes / meshes / primitives | 24 / 16 / 16 | 24 / 16 / 16 |
| materials | 5 (`Hull`, `Mechanical`, `Accent`, `Glass`, `Warm`) | identical names |
| textures / embedded images | 15 / 15 PNG | 15 / 15 KTX2 BasisU |
| geometry compression | — | `EXT_meshopt_compression` (required), 65 buffer views |
| vertex semantics | `POSITION, NORMAL, TANGENT, TEXCOORD_0` | identical |
| primitives missing UV0 | 0 | 0 |
| material role coverage | all 5 carry baseColor + normal + metalRough + occlusion | identical |
| sockets | 7, identity rotation/scale, parented to the authored root | byte-identical translations |
| LOD triangles | 59,052 / 21,532 / 5,264 (+44 non-LOD) | identical, no silent decimation |
| `asset.extras.spacefaceAsset` | contractVersion 1, `textureCompression: PNG-source` | contractVersion 1, `textureCompression: KTX2/BasisU` |

**No `place_debris_chunk`-class defect.** The failure mode that made that asset unloadable in PQ-018
was absent `asset.extras`, zero embedded images, and missing UV0. This asset has all three. Its
release stamp is also correctly rewritten to `KTX2/BasisU`, so the stale-`PNG-source` residual
PQ-018 recorded for the Cathedral does **not** apply here.

The LOD chain is a real reduction (3.6× then 4.1×), not exported copies of LOD0, and every level
keeps all 5 draw groups.

### Measured bounds and the axis-order finding

| Level | World AABB size (m), source |
|---|---|
| LOD0 | 104.3364 × 95.8590 × 55.3196 |
| LOD1 | 104.3324 × 95.8550 × 54.6084 |
| LOD2 | 104.3364 × 95.8590 × 53.3062 |

Source and release agree to 4 decimal places at every level.

The `parts_manifest.json` bounds row reads `dimensionsM: [104.3364, 55.3196, 95.859]` — the same
three magnitudes with **Y and Z transposed**. Measured against the GLB the mapping is exactly
`manifest.y === -glb.z` and `manifest.z === +glb.y`: the row is recorded in the Blender Z-up
authoring frame, while the GLB is correctly converted to glTF Y-up. Control: `place_debris_chunk`,
which passes the same assertion, has manifest bounds that match its GLB **exactly, component by
component**. So this is a per-family bookkeeping artifact of
`tools/blender/build_claim_outpost_family.py`, not a geometry defect — and all four claim-outpost
family members carry it.

**It cannot reach runtime scale.** `src/render/assetLoader.js:673` derives `record.bounds` with
`Box3.setFromObject` on the loaded scene, so the manifest row is never the source of truth; and in
`buildPlacePropRoot` both consumers are order-invariant here (`authoredLength = size[0]` and
`authoredEnvelope = max(size)` both resolve to the same 104.3364 m because +X is the longest axis).
The focused test pins that inertness so it cannot start mattering silently.

## 3. Decision — ACCEPT AS-IS, with a visual reservation

**Structurally acceptable as-is. No repair performed, and none would help.** There is no structural
defect to repair: the release pair is current, hash-bound, fully KTX2/meshopt, and preserves every
contract node. A canonical-GLB repair or release rebuild would change nothing, and rewriting the
source JSON chunk to satisfy the legacy flat-`asset.extras` checks would invalidate the frozen
digest that four records and the PQ-017 binding depend on.

**Asset mutations: zero.** No source GLB, no release GLB, no `parts_manifest.json` row, no
`release_manifest.json` row was written. The manifest write budget granted to this leaf went unused.

**The reservation, stated plainly:** at the game camera the asset reads as a generic assembly of
grey primitives — cylinders, boxes, two torus rings, a disc — with a cyan accent ring. This is the
authored look, not a loading failure: the live capture records all five materials binding
baseColor + normal + roughness + metalness + AO as 1024px **compressed KTX2** through the shared
material path. It satisfies the *gameplay* signal PQ-024 wants (at ~105 m the pale silhouette reads
clearly against dark rock and black space as "something built is attached to this rock"), but it
does not meet PQ-022's visual quality contract for meso construction or faction/function identity.
That verdict belongs to an independent reviewer under the PQ-034 lease; it is recorded here as
evidence, not exercised.

### Re-authoring needs, if the integrator elects to reject it visually

Advisory, for the visual-production lane — not a claim of this leaf:

- **macro** — the silhouette is primitive-additive; it needs a load path a viewer can read (mast,
  dish/aperture, anchoring structure into the rock), not stacked cylinders on a spine;
- **meso** — no plate overlap, recesses, access panels, radiators, or machinery at the 30–100 m
  band where the player actually meets it;
- **micro** — maps are present and correctly bound but near-neutral (hull baseColor `#f2f2f3`,
  mechanical `#f6f7f7`); no controlled wear, fasteners, welds, or heat/roughness variation reads;
- **identity** — the four faction accent variants declared in the manifest are a tint, and PQ-022
  explicitly rejects tint as a substitute for faction/function construction;
- **contract to preserve** — any replacement must keep assetId `SF_PLACE_CLAIM_OUTPOST_RELAY`, the
  root node name, all 7 socket names and their exact local translations (the PQ-017 binding and
  `test/world-site-assets.test.mjs` are pinned to them), the 3-level LOD naming convention, and the
  +X longest-axis property the scale math relies on.

## 4. Runtime proofs

`test/pq022-relay-collar-admission.test.mjs` — **9/9**, wired as `npm run check:pq022:relay-collar`.

| Proof | Evidence |
|---|---|
| frozen source identity | digest, bytes, `spacefaceAsset` contract v1, `role: spec_relay`, 15 images, 0 primitives missing UV0 |
| manifest identity | part row fields, socket set, `runtimeSlots.place` membership, evidence-record digest agreement |
| release identity | both digests, both byte counts, 15/15 KTX2 BasisU, meshopt required, real compression |
| release fidelity | node-count parity (24), triangle parity, material-name parity, per-socket translation/rotation/scale parity, strictly reducing LOD chain, single identity root |
| transform contract | every release node passes `authoredTransformIssue` — 0 offenders |
| runtime resolution | `PART_LIBRARY_CONTRACT.slots.place` membership + `resolvePlaceFileForEntity({claimSpecId:'spec_relay'})` |
| PQ-017 binding | both digests and all 7 socket translations verified against **both** GLBs |
| scale inertness | `max(dimensionsM) === dimensionsM[0]`, magnitudes match the evidence record |
| exterior projection | exactly one `fx` relay, `collides: false`, `worldDressing`, `factionId: faction_player`, `placeScale: 0.16`, on the rock contact ring; idempotent across revisits; re-ensured exactly once after despawn |

### Live admission on the exterior route

`scripts/capture-pq022-relay-collar.mjs` boots the canonical player route headlessly, starts a new
game at seed 47, reaches flight, and anchors a claim on a **real** asteroid in `sector_helios_prime`,
letting the shipped `asteroidSites._ensureBeacon` place the relay. Nothing is faked and no
acceptance-only render path is added.

All three stills record:

- `authoredAssetState: "authored"`, `authoredVisualRoot: "authored-root"`,
  `authoredReadableFallbackRetained: false` — the authored asset is admitted with no placeholder
  substrate, so a pending asset never presents misleading verbs;
- `authoredSlots.place = ["assets/ships/release/parts/places/place_claim_outpost_relay.glb"]` — the
  ordinary loader admits the **release** (KTX2/meshopt) artifact, not the source.

Transform and envelope, measured live: `authoredWorldScale: 0.16` on
`authoredSourceEnvelope: 104.33640453118832 m`, confirming `placeScale` is an exact uniform
multiplier (`buildPlacePropRoot` only normalizes when `placeTargetRadius` is supplied, and the
exterior projection supplies none). Stamped `visualBounds` size is
`16.6938 × 15.3374 × 10.0073 m`; the mesh actually drawn spans `13.609 × 12.320 × 9.621 m`. Placed
on the contact ring of a 11.9109 m rock at 18.9109 m = `radius + 7`, exactly as authored.

Interaction envelope: the exterior relay is `collides: false` dressing, so it owns no collision.
Where the same asset backs a World Site, `worldSiteKernel.planWorldSiteMaterialization` scales both
proxy radii (`proxyRadius(proxy) * root.scale`) and socket offsets by the stage scale, so the
interaction envelope tracks the visual coherently rather than drifting from it.

## 5. Evidence paths

| Artifact | Path |
|---|---|
| focused test | `test/pq022-relay-collar-admission.test.mjs` |
| check alias | `npm run check:pq022:relay-collar` (`package.json`) |
| capture harness | `scripts/capture-pq022-relay-collar.mjs` |
| durable stills + manifest | `assets/ships/m5_claim_outposts/evidence/pq022-relay-collar/` |
| working output | `.devshots/pq022-relay-collar/` (gitignored; regenerate with `SF_PQ022_CAPTURE_DIR`) |

The capture manifest (`spaceface.pq022RelayCollarCapture.v1`) carries the route, viewport, placement
record, per-shot admission state, measured extents, the full runtime material table, and an explicit
`blockedOnPq034Lease` list. `.devshots/` is gitignored repo-wide, so the durable copy follows the
existing `assets/ships/<family>/evidence/devshots/` precedent.

## 6. Gates

| Gate | Result |
|---|---|
| `npm run check:pq022:relay-collar` | **9/9 pass** |
| `node --test test/world-site-assets.test.mjs test/presentation-admission.test.mjs test/world-site-input.test.mjs` | 17/17 pass |
| `node scripts/check-claim-outpost-visuals.mjs` | **70 ok, 0 fail** (the family's own auditor) |
| `npm run check:asset-reachability` | pass — 53 runtime assets reachable and bundled |
| `npm run check:sim:compare` | `ok: true`, **`hashEqual: true`**, `firstDivergentTick: null` |
| `npm run check:baseline` | 10/10 green, 67.3 s of a 90 s budget |
| `npm run check:assets:live` | **PASS**, `failureCount: 0` — the relay's release GLB is among the probed URLs |
| `npm run check:runtime-assets` | **FAIL — inherited.** 3 required failures, all `wholeships/` (kestrel LODs, wasp lod1/lod2 uncompressed). The relay contributes **0**. |
| `npm run check:graphics:asset-receipts` | **FAIL — inherited.** `place_asteroid_rock_a` byte drift (9,118,128 vs 1,970,132), the exact drift PQ-018 recorded. |
| `node scripts/check-parts-manifest.mjs` | 3024 ok, 228 fail — see below |

Attribution is structural, not asserted: `git diff --stat c6d83fe4..HEAD` touches **7 files** — the
test, the capture script, four evidence artifacts, and one added `package.json` line. **No GLB, no
manifest, and no runtime module was modified**, so every asset-gate failure above is inherited by
construction.

`check:assets:live` passing with `failureCount: 0` also confirms the PQ-018 route blocker is gone:
`place_debris_chunk` was repaired at `8450287f`/`0f1e6001`, both ancestors of this leaf's pin.

### `check-parts-manifest.mjs`, stated honestly

The relay contributes 8 failures. All 8 are family- or corpus-wide and none is asset-specific:

- 6 are the legacy flat-`asset.extras` family PQ-018 documented (`category`, `priority`,
  `triangleCount`, `textureSize`, coordinate contract, `boundsDimensionsM`) — 16 assets fail these;
  the relay carries the newer nested `spacefaceAsset` stamp instead;
- `triangles match manifest` (`glb=85892 manifest=59052`) — the checker sums **every** LOD
  (59,052 + 21,532 + 5,264 + 44 = 85,892) while the manifest declares the LOD0 budget; 16 assets fail;
- `computed dimensions match manifest` — the axis-order finding in §2; 18 assets fail, and the
  checker's own computation is unreliable here (it reports `place_station_trade_hub` as
  3,959,733 m across).

All four claim-outpost family members fail the identical 8 assertions. Repairing them requires
rewriting source GLB JSON chunks, which changes the frozen digests that the evidence record, the
release row and the PQ-017 binding all pin. Recorded as follow-up, not silently absorbed.

Not run, deliberately: `npm run check:art` (contains the known mutually-unsatisfiable
`check-asset-pipeline-contract` gate-wiring assertion, out of scope by instruction) and any
validation-broker, Electron, or performance capture (PQ-034 lease).

## 7. Open rows

Blocked on the **PQ-034 lease** (performance-evidence / validation-broker / browser-gpu). The leaf's
upgrade to `route_accepted` happens there, not here:

- [ ] headed Browser/Electron route acceptance and parity;
- [ ] independent human visual verdict at the game camera — the reservation in §3 is the input to it,
      not a substitute for it;
- [ ] matched before/after performance on identical route/settings/viewport/seed: admission latency,
      draw calls/primitives, programs/materials, texture and GPU residency, LOD occupancy, frame
      p95/p99/hitches, resource high-water and cleanup. **No performance claim is made anywhere in
      this leaf**; the stills are presentation only.

Handed to the integrator, not fixed here:

- [ ] **Axis-order bookkeeping** — `parts_manifest.json` bounds for all four claim-outpost assets are
      in the Blender authoring order (§2). Inert today; a latent trap for any future consumer that
      trusts the row instead of the loaded scene. Fixing it is a 4-row family edit outside this
      leaf's write budget and interacts with `check-parts-manifest.mjs` semantics.
- [ ] **Declared vs drawn envelope** — the stamped `visualBounds` length (16.6938 m) overstates the
      drawn mesh union (13.609 m) by ~19%, because `record.bounds` also spans the socket marker
      nodes. Relevant to whoever tunes culling/selection radii; the entity's `visualRadius: 6` sits
      just under the drawn 6.8 m half-extent.
- [ ] **Multi-LOD checker semantics** — `check-parts-manifest.mjs` sums all LODs against a LOD0
      manifest budget, so every multi-LOD asset fails by construction (16 assets).
- [ ] Inherited reds unrelated to this leaf: `check:runtime-assets` (kestrel/wasp wholeships),
      `check:graphics:asset-receipts` (`place_asteroid_rock_a` byte drift).

## 8. What PQ-024 can rely on

- `place_claim_outpost_relay` admits through the ordinary place path from the **release** artifact,
  with no fallback substrate and no second registry;
- its identity is hash-bound across four records, and `test/pq022-relay-collar-admission.test.mjs`
  fails immediately if any of them drifts;
- `asteroidSites._ensureBeacon` already projects exactly one relay per anchored site, is idempotent
  across sector revisits, and re-ensures exactly once after despawn — the "exactly one exterior
  relay/collar appears in flight and survives Continue" requirement has a working substrate;
- the collar role resolves to the same asset via the `receiver_collar` component on
  `SOCKET_Dock_Approach`;
- PQ-024 must still treat final visual acceptance as open (§3), consistent with its own entry
  condition.
