<!-- LIFETIME: DURABLE -->
# Nereid's earned freight annex becomes a physical place

## Existing work now has a visible consequence
Nereid Waystation already earns station-growth modules from supplied throughput. Before this increment, the Bonded Freight Annex changed station names, faction bonuses and map metadata but had no physical projection. Claims remains the sole durable authority; no second growth book, clock, worker job, dock service or reward is introduced.

A real seeded player sale of 150 food units through economy.handleTrade consumes the supplied stock, pays 8,464 credits in that fixture and earns the existing station-growth:station_nereid:growth_bonded_annex receipt. Player market sells, accepted contract freight and relay convoys retain their existing contribution rules; ambient NPC arrival alone does not count.

Before earning that receipt the annex is absent. Once earned, the existing world dressing owner seats two existing registered freight models. Returning to the sector and Save/Continue reconstruct the projection from the same claims receipt. This is existing asset reuse, not two newly authored models or extra LODs counted as assets.

## Placement and existing ownership
Nereid's local station anchor is (960,-380), radius 34, dock radius 72 and approach bearing 158.40468955103233 degrees. The freight platform sits at (1048,-160), the container rack at (1098,-180), both rotation 0 and drawScale 1. Fixed authored seats lie beyond the 165-unit apron band and outside the approach corridor; other current colliding bodies are checked with measured model clearance.

The helper calls world._spawnPlaceProp. Existing dressing rows, rendering admission, collision skins and fixed-body ownership remain in control. These are non-destructible scenery rows without combat hulls or world-record tombstones, not resurrected destroyed ships.

Obstruction refuses seating at those positions rather than clearing player objects or searching arbitrary rings. Partial creation rolls back. Retry uses the existing claims stamp on entry, restore or later growth, not a new per-frame poll or every sale. If initial seating is blocked, the current growth news channel says the annex was earned and physical seating awaits a clear apron. The business benefit and physical projection are not falsely treated as the same completed operation.

Review found and fixed an older-save defect: geometry from an earned annex survived loading 149-unit or zero-growth state. Restore now removes only tagged annex dressing when the authoritative receipt is absent. Repeated valid stamps preserve annex identities and avoid duplicates; unrelated scenery keeps its existing world-owner restoration semantics.

## Actual assets and cost
Both exported blobs were verified against the public release directory:
- assets/ships/release/parts/places/place_freight_platform.glb: ed82826806e9076ff775b6966b3261770d3eb1aa, 530,228 bytes.
- assets/ships/release/parts/places/place_container_rack.glb: b75aa946b1584e55576c4b7af60e05390f3d79a8, 912,940 bytes.

The CPU source preview decodes actual GLB triangles and uses the tested positions. It explicitly omits station geometry, marks the dock overlay as diagnostic, and does not claim game-camera, textures or lighting acceptance. Visible assets total 81 primitives and 46,652 triangles; catalog 83 includes two non-render collision meshes. These are geometry counts, not measured draw calls.

Reconciliation is event-bound O(entities + dressing), with two fixed parts and no new update loop. Actual partsLibrary prewarm requests and registered render-package identities are exercised, but headless rows remain presentation-pending without the native renderer. Cold asset loading and target-device FPS remain unmeasured.

## Tests and native proof
Final source: claims 5e64e1d4ce0cf57537d9dfde65da08c0a6cb51d7; helper 83d2005908c259698b4a60cbed30b929feecafaf; main test 141d80f596b2fa6924cb525f9c31def607759a04.

- Main suite: 14/14; matched baseline: 4 pass, 10 fail.
- Existing growth/depot suite: 8/8.
- 22 distinct behavior cases total; independent overlapping review probes are not added again.
- Separate portable native physics test: 1/1, published as test/nereid-freight-annex-native.test.mjs.

The native test prepares the actual Rapier backend and resumes normal simulation after fixture undocking. It asserts two fixed bodies and 36 capsule colliders: platform 12 at global (37912,12128), native (1048,-160); rack 24 at global (37962,12108), native (1098,-180). Measured collider unions are approximately 22.17×11.13 and 13.77×8.78 world units. Three repeats retain exactly two bodies and the same collider count. Loading the older zero-growth save and stepping removes both native bodies. The first diagnostic remained dock-frozen; correcting the fixture undock required no production physics change.

Real economy, world, claims, Save and selected physics owners are used. Stock, dock latch, sector travel and time remain fixture inputs, not player-flown acceptance. Native bodies do not prove rendered or performance quality.

## Current-source qualification and delivery
Original qualification used public 93706 plus the scoped candidate. Before publication, public master advanced to 5491567666b94a74e01b0a1a5848af0b73d3d1e5. Exactly one changed module intersected the executed graph: physics.js, now ecfbeb73a69f0f4fee9301d69681ec7f7bd26e0e. A separate fail-closed current-source wrapper verified it; all 22 cases and the native proof passed again with unchanged production source. The current effective manifest contains 1,201 inputs, SHA256 3c44b66ee274d0fe2f452c4477204c9313f93778b179fdd09fa3d2bf7d88b5ad. This is executed-source qualification, not an unrestricted filesystem audit.

Only claims, the new helper, two focused tests, one named package gate and this report ship. PR480/488 pocket definitions and active renderer/station/world/asset owners are untouched. The gate runs 14 behavior cases plus the native test; the eight existing growth cases are additional local adjacent evidence. Source, tests, review, publication, integration and acceptance remain distinct. All larger game and sector goals stay open.
