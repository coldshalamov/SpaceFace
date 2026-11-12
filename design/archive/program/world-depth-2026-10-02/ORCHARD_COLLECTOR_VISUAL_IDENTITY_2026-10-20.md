# Orchard collector: restore its authored visual identity

Status: implemented, exact-public 85/85 checks passed, independently reviewed; draft publication prepared on verified PR476 preload successor `36c401ea828c843773f6cd4c1c2d5adf2d3eba07` / tree `7918c1cd56d547060aa0db73dffcdb874dcf9634`. This is an original P01 collector integration correction, not completion of SF-ORCHARD or visual acceptance of the whole game. All eight overarching goals remain open.

## Observed defect

The original traffic-created Stormshift collector already has the durable role `stormshift_collector`, Mule gameplay statistics and a 32-solid fixed-cheek Stormshift collision compound. On public PR476 tree `15827b93889cc751c23186e48d9b795aa22e4931`, the whole-ship selector lacked that role and fell through to the Mule visual. Its rendered mouth and width therefore did not represent its collision authority. A test using the actual original traffic worker failed with `wholeships/mule_production_v1.glb` rather than the dedicated collector. This is not a speculative inventory omission or a new model commission.

The dedicated released GLB, pilot package and pinned motion bank already exist publicly. Release blob: `c781da6260c366ff3cf1d7f827478ec05cf5e25b`. No new asset upload is necessary.

## Bounded correction

Add exactly the traffic-role file and matching asset-ID mapping in `src/render/partsLibrary.js`. The role selects `wholeships/ship_stormshift_collector_v01.glb` / `SF_STORMSHIFT_COLLECTOR_V01`. Preserve Mule gameplay identity, drive, finite cargo, hull, collision, routes and save schemas. Unrelated Mule ships still select Mule; the receiving tender still selects its faction-specific Helios Span MTS. No existing role is remapped.

The public projection is two map entries over verified PR476, not the canonical partsLibrary file. It excludes every pending headlamp and unrelated private hunk. A separate pending upload is neither retried nor included in this unit.

## Evidence and constraints

- The fresh original worker test reproduces the pre-fix failure and passes after the bounded correction.
- Exact public focused tests pass 3/3: fresh worker identity, actual exported release/package/motion binding, and ordinary native residency promotion. Residency approach takes 411 ticks; both original workers promote at tick 293 and retain native identity for 120 consecutive ticks, finite cargo 4 and budget 3/24.
- Package source bounds are 18.091591119766235 × 2.8473557829856873 × 17.481072902679443. Source-origin targetLength 1.72, with no bounds-centre translation, gives precisely the existing collision normalization. Actual released GLB SHA is checked against the selected pilot.
- The actual released GLB hierarchy/transforms and mesh-presence/LOD visibility bind the pinned eight-pivot motion bank through the existing production binder. All six radiator pivots measurably respond to the completed stow clip. Empty marker-only fixture subtrees intentionally froze under the existing binder, so that insufficient test was replaced and its failed attempt retained. Both solid cheeks remain at their authored rest transforms throughout both clips; six raised radiator leaves remain visual-only. This checks binding and collision compatibility, not automatic gameplay dispatch of the stow/deploy clips.
- Exact-public suite passes 85/85 with no skips: native normal/disturbed/Continue, 32-solid collider mouth/cheeks, routing, LOD policy and live whole-ship admission. The existing native Continue test also requires the restored original worker to retain its selected collector body.
- New actual compiled-release top and oblique views were inspected on 20 October 2026 at 20:33 UTC by implementer and independent reviewer. Open intake mouth, paired cheeks, six mechanical radiator leaves, four dorsal canisters and dual drives are readable with coherent industrial materials, without obvious clipping. These are offline neutral-studio rest-pose views, not live game-camera or physical-phone acceptance. Minor canopy studio highlights are not a blocker.

The GLB extras retain older authoring metadata about convex-envelope collision and cheek stow angles. They are not current runtime policy: the actual gameplay compound and pinned runtime bank keep solid cheeks fixed. Likewise the bank sourceGlbSha256 identifies authoring provenance, not the compiled release SHA verified against the pilot. No asset bytes or metadata are modified by this two-line integration fix.

## Remaining asset behavior

Production `src/render/authoredMotion.js` has no Stormshift worker-phase dispatcher: the existing `planet:collector` handler targets extraction-mast pumping, not this hull. The pinned bank provides `stormshift_stow` and `stormshift_deploy`, but binding and explicit clip tests do not demonstrate automatic runtime playback. The next separate asset action is to design and test a presentation-only reader of the original worker itinerary phase, including first admission, interruption and Continue/residency rebind, before connecting these clips. Do not repurpose the extraction-mast event or move collision-authoritative cheeks. This unit intentionally leaves that seam unchanged.

## Next executable action

Exact public candidate 008a5d41071635a7cbea9ae701e0b806d71e9729 passed 85/85 with no skips in 49.015s. All 3628 module/filesystem reads across 1189 paths matched immutable Git blobs. Independent source and exported-model review approve this bounded draft scope. Reconcile onto the verified PR476 preload-fix successor, preserve unchanged source/test identities and publish the root-approved draft. Verify remote commit and follow attributable CI. Leave original program goals open.
