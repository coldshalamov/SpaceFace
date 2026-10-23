<!-- LIFETIME: ACTIVE -->
# Triton Field Lab route allocation, 23 October 2026

Owner: dot. Outcome: make the existing placed Field Lab's promised triangulation actually work there, feed its existing Wake Lab causal desk, and retain the earned aftermath on return. Reuse the existing sensor-mast asset and scanner, living-POI, causal-offer and Save owners; do not invent another station, lab, asset or controller.

## Reproduced missing behavior
Public livingPoiBehaviors.js blob da0ab6e1fb423bcfba412f9f42377bdbb4ff7720 records authored-place descriptors but does not materialize them. poi_triton_field_lab is placed at sector-local (1600,-700); neither the seed-selected Wake nor Glow research zone contains it. Three actual scanner-owner pulses at globally transformed lab bearings produce zero progress and no causal offer. Coordinates were checked against world placement; this is not a local/global mix-up. The proof is accelerated owner/API evidence, not native flight or live visual acceptance.

## Exact scope
- src/data/poiBehaviorFamilies.js: only a bounded explicit Field Lab interaction contract/identity, retaining all existing family and other authored-place contracts.
- src/systems/livingPoiBehaviors.js: only materialize that exact authored Field Lab row; position-bound scan selection; exact existing POI readout binding; and exclude its aftermath from the generic family-zone pin choice. Preserve generic seed-selected plans, mission/consequence ownership and existing serialization semantics.
- test/triton-field-lab-route.test.mjs: new real-owner regression.
- design/program/world-depth-2026-10-02/TRITON_FIELD_LAB_ROUTE_2026-10-23.md: evidence and acceptance limits.
- package.json: root-owned unique focused command and CI graph registration after review.

Use a bounded 300 WU research interaction footprint centered on the actual authored place, not a new physics body or globally registered zone. Keep its stable authored identity distinct from Wake/Glow. Do not move the asset or retarget another sector's desk. Resolve the existing station_triton through canonical data and existing causal-offer rules.

## Required evidence
The actual scanner must progress only from three separated in-footprint bearings, produce one normal causal offer and preserve existing mission acceptance/consequence authority. Repeated or outside bearings must not progress. Generic Wake/Glow selection and aftermath pins must remain unchanged even when both generic and authored research aftermath exist. Exact-place annotation must not hijack another nearby anchor. Exercise Save/Continue and leave/return through the existing owner, explaining which partial progress resets under current semantics and which resolved aftermath persists; do not silently claim a new save contract or exact native restoration. Preserve the existing six-day research aftermath/expiry policy.

No Guide resolver, traffic, mining, npcJobsRuntime, physics, assets or shared render changes. Existing holds remain untouched. Fresh open-PR searches for the exact owner/data paths and Triton found no matches; this is not proof every external writer is idle. Stop a particular overlapping hunk if newer ownership becomes evident.

State: baseline reproduced; implementation allocated, not implemented, published, integrated or accepted. SF-LIVING-WORLD and SF-SECTOR-COHERENCE remain open.
