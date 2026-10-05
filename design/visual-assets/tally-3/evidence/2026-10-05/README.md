# Tally-3 evidence and preserved source attempts

This is deliberately preserved SF20-03 evidence, dated 5 October 2026. It contains the complete V1/V2/V3 source-review images, editable attempts and build failures, plus hash-bound behavioral and actual production-consumer evidence. It is not a shipping-renderer visual acceptance record.

## Current evidence

- [Public consumer summary](public-consumer/SUMMARY.md): eight passed checkpoints through the actual public authored-upgrade queue, generated package resolver, default verified GLB decoder, stock GLTFLoader/Meshopt and runtime-table binder. The composed package retains all three LODs/four motion groups; receipt gating, Save/adoption, predecessor-safe disposal and eviction pass
- [Independent final consumer review](public-consumer/INDEPENDENT_REVIEW.md): the direct-compile-only proof gap is closed for this explicit CPU route
- [Consumer result](public-consumer/RESULT.json), [all input pins](public-consumer/INPUT_PINS.json), [checksums](public-consumer/CHECKSUMS.sha256) and [stdout](public-consumer/stdout.log)
- [Combined maker and join tests](behavior/78-maker-and-joins.log): 78/78 in the isolated integrated candidate; [selected baseline](behavior/5-selected-baseline.log): 5/5. These logs state their actual scope; the public consumer above reads the real shared generated outputs
- [Source-spine census evidence](geometry/source-only-census.json): one exact source-bound native spine, open V, 1e-5 WU tolerance and 6.073788898635482e-7 WU maximum boundary discrepancy. This remains red/source-only rather than claiming that compressed render geometry is the collision authority
- [Metadata correction review](geometry/metadata-correction-review.json): actual source/release/render primitive counts are 16,242 / 6,492 / 2,133. The former 2,156 LOD2 number was a pre-export Blender mesh estimate, retained as provenance in the current asset contract

Reproduce the read-only CPU consumer from the repository root:

    node scripts/check-tally3-production-consumer.mjs --repo-root="$PWD" --evidence-dir=/tmp/tally3-consumer-new-run

The runner uses actual repository bytes. An input change during a run invalidates it. The final runner SHA-256 is 83a58d82d1709d416fb72b0fb0122606beed401c99d6c2ffc97a8dc3a213540c.

## Exact limits

The CPU consumer decodes real geometry and verifies actual package and motion bytes. Its six KTX2 images use Texture placeholders; canvas and GPU preparation/exact-target callbacks are instrumented CPU ports. It does not establish texture-pixel appearance, GPU output, frame timing, performance, the browser runtime-constructor singleton, the full production Ceres route or whole-world native-cache Continue.

Native owner tests separately exercised the real compact spine and crate, 15 clear approaches across three yaws/near-tolerance offsets, explicit delivery, outside-tolerance denial and positive spine collision/momentum transfer. The tethered Continue proof uses scalar native restoration and 20 native physics steps, not exact whole-world cache reuse.

## Source art history

Every PNG below is a Blender source-review render, not the game's Look, gameplay camera or GPU acceptance. The V3 chase was shown to the user with that explicit qualifier; this is not inferred approval of live appearance.

- [V1](source-review/tally-3-v1/): original failed 32,068-triangle/16-primitive attempt, unavailable-denoiser script/log, preserved editable precursor, later V1 recipe/Blend file, blueprint reference, and top/chase/close/working/folded renders
- [V2](source-review/tally-3-v2/): quieter material/press treatment, editable source and recipe, five poses and source-scale strip. The weak small-scale chords prompted V3
- [V3](source-review/tally-3-v3/): thicker continuous quiet trusses, five poses, 50/100/170 px source-scale strip, source recipe, metadata predecessor and final build/clearance logs. The current editable production source is retained separately at tools/blender/forge/source_assets/tally_3/tally_3.blend

Historical versioned asset-contract JSON files retain their original pre-export count and status. Do not silently reinterpret them as corrected current metadata. The maintained ../../asset-contract.json and ../../authoring-notes.md contain the corrected exported counts and current scope.

## Review history

The three bounded reviews are retained verbatim: [maker](reviews/01-maker/REVIEW.md), [motion-state correction](reviews/02-motion-state/REVIEW.md), and [integration joins](reviews/03-integration-joins/REVIEW.md). Initial failed tests remain beside corrected tests. Historical review hashes refer to the files reviewed at that moment, including pre-correction source, and are not current shipping seals.

Earlier public-consumer attempts under consumer-history intentionally remain failed/intermediate evidence. They uncovered the pre-export count discrepancy and a probe-only actor clone. The final gate uses the stronger live public queue and the actual boundary's three-argument forwarding. Current evidence is the public-consumer directory above.

Historical logs may include former absolute workspace paths or a candidate/ prefix. These are provenance, not runtime dependencies. Reproduction uses the repository runner and current source/test paths; no abandoned workspace is required.
