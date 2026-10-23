<!-- LIFETIME: DURABLE -->
# Nereid earned freight annex — active claim, 2026-10-23 08:28 UTC

## Ownership and existing authority
Allocated production scope: src/systems/claims.js (public93706 baseline90315498b49f31d047583b8e74feb4b9eeff9feb), new src/world/nereidFreightAnnex.js and new test/nereid-freight-annex.test.mjs. Dot owns integration, independent review, report, package and draft delivery. Fresh50openPR filename checks found no claims/helper/test overlap; PR480/488-owned Nereid pocket definitions, stationApp, world, renderer and parts registries remain untouched.

The existing claims.stationGrowth ledger already earns Bonded Freight Annex after150units of supplied throughput. A real seeded player food sell through economy.handleTrade consumed150stock and paid8464credits, creating the existing station-growth:station_nereid:growth_bonded_annex receipt. This is player market-sell throughput; accepted contract freight and relay convoys use their existing contribution paths. Ambient NPC arrival alone does not count. The ledger already changes names, faction bonuses and map metadata, but no render consumer materializes its modules.

## Visible projection under implementation
Use existing world._spawnPlaceProp dressing ownership and two registered exported models, without a second growth ledger or new model:
- Freight platform: local(1048,-160), rotation0, drawScale1; Git blobed82826806e9076ff775b6966b3261770d3eb1aa.
- Container rack: local(1098,-180), rotation0, drawScale1; Git blobb75aa946b1584e55576c4b7af60e05390f3d79a8.

Nereid local anchor(960,-380), fixture global(37824,11908), radius34, dockRadius72, approach158.40468955103233degrees. Seats are fixed, outside the dock/apron band. Obstruction refuses seating rather than moving parts to arbitrary rings. Existing fixed scenery has no combat hull/worldRecord, so no invented destruction ledger. Claimed benefits and physical materialization remain separate when seating is blocked; the existing growth news channel now states earned annex/awaiting clear apron rather than falsely claiming it was built.

Actual exported geometry was decoded and both blobs checked against the public93706 release directory. Visible geometry is81primitives/46652triangles; catalog83 includes two non-render collision meshes. These are not measured draw calls or FPS. A newly inspected CPU source-geometry/layout preview was delivered, explicitly not live camera, with station geometry omitted and diagnostic dock overlay; textures and game lighting are unvalidated.

## Evidence and next action
Current14case suite passes real149→none/150→two projection, receipt/stamp idempotence, actual partsLibrary prewarm, obstruction/retry, partial-spawn rollback and Save/sector lifecycle. Review found an older-Save defect: earned geometry survived restoring149unit or zero-growth state. It is fixed through existing claims restore reconciliation;4independent probes pass.

Next: finish source-qualified adjacent growth tests and one bounded native-physics readiness probe, preserve final source/tests/render evidence, then publish a coherent draft. Static-layer/measured-skin admission alone does not prove a native collider exists. No worker jobs, new dock service, full player flight, live rendering or performance acceptance is claimed. All ten larger goals remain open; existing unrelated holds are unchanged.
