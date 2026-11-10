# Resident Splitter material handoff: unaccepted WIP

## Current status

The user's latest direction rejects all shown Brood art and prioritizes a coherent WIP handoff. No source or release model from this packet is approved for default activation. This is a separately frozen, unimported review overlay, not a completed gameplay/visual slice.

`manifest.json` SHA256: `2cd283b034792574e9c6242bf7089ac81dd13126d078dd1b97d0dbceaa843621`

- `resident-presentation-WIP.patch`: `41111c27fd0c5b39e6fc404b461e8841907c0dda19b41205aab5550409b43838`
- `corpse-life-followup.patch`: `87f7c5ae6fa6e6d6cdeee56058990e24b8b6dfe4a0f176c7052caec05685e47f`
- `resident-tests-WIP.patch`: `621cb189979a40ef6c3b241b44c1003b7c1f3cd51ff80df12227e634bc04386b`

All three patches pass exact preimage application checks. Source and before/after SHA256 values are included. `preimage/` and `source/` contain just changed files. No assets are copied into this packet.

## What this draft does

- Preserves the explicitly authored `PART_SPLITTER_AXIAL`, `PART_SPLITTER_PORT` and `PART_SPLITTER_STARBOARD` identity through canonical loader/runtime tables, composition batches, and static batches
- Makes a copied part name/tag inert without the exact declared v12 body contract and canonical source/geometry seal; composed model authority is private, so cloning public mesh metadata cannot mint it
- Requires the current parent object/generation, settled material ownership, exact child family/ordinal relationship, and a source-life stamp for one-body corpse transfer
- Transfers already resident mesh surfaces, their actual matrices and material objects. It does not decode child GLBs, invent a proxy mesh, or allocate replacement GPU geometry at birth
- Retains existing asset keys for shared resources and registers only owner-local resources. Original template references remain held until the last transferred material owner retires, including unrelated parents sharing the same buffers
- Stages sibling publication until the renderer consumes the completed-tick entity handles. A partial bind refusal unwinds every already-bound sibling and retains the material for retry
- Carries the parent's resident LOD into the first authored child frame, then uses the ordinary child projected-size selector
- Uses existing residency registration, request, retain/release and context-loss ownership. No new global cache
- Includes narrow current-source first-three partsLibrary selectors, source-origin placement, biological material treatment and omission of ship hardware. Current Ceres fit/admission guards and current staged presentation owners are preserved

## Source basis

The exact renderer/partsLibrary preimages are the composer's current presentation-threeway outputs:
- renderer `fc999d44ddfd67a2ec19194c5291eae6a3cc6576b299ab81f843c7ae8fbd7ca6`
- partsLibrary `9f7074ec918f0de6459497c86c1c4abadf2256042bba83b36990fa9d4ad787b9`
- current+entry assetLoader `0889f6cc7a1ea2077c814109982975fe8a5937ad772f9b560b7a2c12c83563f7`

Prerequisites are the frozen lifecycle packet, the current source-only first-three render-module rebase, current Ceres/convex/native overlays and the new `broodPartitionLod.js` module already supplied by the lifecycle packet. Do not apply the old renderer hunk in `presentation-lod.patch` as well as this overlay.

The one-line corpse source-life field is a separate follow-up to the immutable lifecycle module. It has not been folded back into that packet.

## Evidence and gaps

- 6/6 CPU ownership tests pass: exact synthetic world matrices, parent disappearance, per-child LOD, idempotent disposal, atomic partial publication/retry, recycled lives, Retry/context-loss reset, protected foreign shared owners, copied-tag/life rejection, and failed admission retaining a usable parent without orphan assets
- Current renderer/partsLibrary/assetLoader modules import and parse
- Combined diagnostic run is 7 pass / 1 fail. The rejected v12 raw-GLB graph helper incorrectly assumes one material primitive per node. The actual source contains a multi-primitive node, so the canonical composition and first-drawn-frame source geometry check has NOT executed. This is preserved as a failure, not skipped or re-recorded
- No first-visible-frame live-renderer image, real GPU admission/cost, source/release registration acceptance, actual material/rig inheritance image, or default-route asset proof exists for this overlay
- The v12 source/model seals are provisional historical engineering inputs only. They must be replaced by the redesigned art contract before any normal model activation
- Explicit reinforcement affordability coverage remains pending: remaining finite quota 0..5 versus available physical seats 0..4. Existing all-41-occupancies cap40 coverage does not replace it
- The frozen lifecycle packet contains two accidental Splitter roster-shaped entries in authored Anvil/wave25 packages. The rebaser's separately attributed correction removes those two, retains the intended single wave17 roster entry, and adds all-recipe / through-wave100 regressions. Never import frozen v1 without that correction

## Lifecycle candidate already handed off

`../splitter-runtime-packet/final-candidate-v1/` remains immutable at the source/patch level. Its native and ordinary simulation evidence remains useful with the art-rejection qualification:
- 79/79 final focused tests against the provisional v12 body map
- 255 broad assertions passing; two intentionally omitted full Ceres semantic entrypoints could not load their absent hardware/presentation dependencies
- actual seventeen-wave fresh replay and retained Retry, plus connected ordinary input/projectile encounter: 18 shots, four kills, no cancelled lives, player alive at tick253
- unchanged 47a telemetry across20 repeats plus reload600

The later wave25 insertion defect and incomplete affordability grid are explicit limits on that earlier acceptance. No default runtime/release activation, remote write, merge, deployment or golden edit is authorized by these artifacts.
