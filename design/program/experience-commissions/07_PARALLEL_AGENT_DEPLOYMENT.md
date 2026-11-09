# SpaceFace — Parallel agent deployment and integration map (v2)

**Purpose:** make the 52 section commissions safe to execute simultaneously without turning 52 independent GitHub branches into 52 competing game engines. This is a proposed scheduling/coordination aid. Live write claims in `design/program/NOW.md` and current master lanes remain authoritative; the counts below are **source-reference intersections**, not permissions or proof of active conflicts.

## Why this matters

The 52 briefs repeatedly cite the same canonical modules. Across the *authored commission texts* the largest hotspots include:
- `src/world/worldRecords.js` — referenced by **19** commissions
- `src/systems/npcJobsRuntime.js` — referenced by **12**
- `src/data/swarmLadder.js` — referenced by **12**
- `src/systems/trafficCausalChainOps.js` — referenced by **11**
- `src/systems/cargoCustody.js` — referenced by **9**
- `src/systems/swarmArena.js` — referenced by **7**
- `src/ui/station/barContacts.js` — referenced by **7**

A “source hook to inspect” is **not** an exact-path write claim. Section agents should default to creating *local authored* modules, data records, placements, interactions and tests. Shared owners own minimal central registration and systemic contract changes. Agree request/response shape and idempotency, then accept the consumer in a real local scene before generalizing it.

## Dispatch groups and work interfaces

| Cohort | Representative PRs | Can proceed without waiting on other cohorts | Shared owner or interface |
| --- | --- | --- | --- |
| First place | EC-S01 Helios (#944) | Compose Lantern Ward arrival, existing contact/world jobs, visual staging, local missions and return; do not overwrite current Helios work | EC-G01 NPC-address; EC-G02 camera; EC-G03 art; EC-G13 integration |
| First combat | EC-A01 Foundry (#983) | Author physical room identity, on-screen player interaction, prompts, impacts and audiovisual feedback | EC-Z01 waves 1–10 (#990), EC-G08 combat, EC-G11 performance |
| World transport | EC-S02 Ceres (#945), EC-S03 Tethys (#946), EC-S05 Vesta (#948) | Author local receivers, industrial places and physical delivery scenes | One shared traffic/custody owner; Ceres interior needs EC-G02 geometry-camera interface |
| Public order/outlaw | EC-S04 Dione (#947), EC-S06 Pallas (#949), EC-S07 Sker (#950), EC-S08 Io (#951) | Compose guards, refuges, service operations and local faction consequences | Law, shipjack/control-transfer, worldRecords single writers |
| Ecology and frontier | EC-S09 Charon (#952), EC-S10 Veil (#953), EC-S11 Ashfall (#954), EC-S19 Phoebe (#962) | Distinct authored ecological, research, manufactured and quiet environments | EC-G06 consequences/ecology; EC-G03 presentation; worldRecords owner |
| Other sectors | Remaining EC-S docs | Distinct geography, actors, missions, place-specific interactions | Same common owner APIs; release waves after one representative pipeline works |
| Swarm rooms | EC-A02–A07 (#984–989) | Distinct geometry, visibility, hazards, stage sound and visual reactions | One `swarmArena.js`/ladder owner; no concurrent uncoordinated director edits |
| Swarm development | EC-Z02–Z04 (#991–993), EC-C01 (#994) | Distinct encounter design, timings, set pieces, progression and alternate failure paths | One wave/planner/ladder owner; authored Crucible is separate from endless Swarm |
| Shared technical/quality | EC-G01–G15 | Diagnose and implement established native campaigns in exact claimed files | Existing Finish lanes are owners, not new EC super-owners |

This is not a claim that all entries in a row can simultaneously write shared source. At dispatch, the controller must check which **exact files** are actually free.

## Recommended first coordinated wave

**Wave 0 — remove friction:** Make EC-G02 camera and EC-G11 transport/performance owners measure the reported camera and worker-stall failures on the *same* reproducible scenes. Do not start another performance architecture for a sector.

**Wave 1 — prove two experiences:** Lead A owns EC-S01 Helios; lead B owns EC-A01 Foundry; lead C owns EC-Z01 the first ten Swarm rounds. If B and C both need `swarmArena.js` or `swarmMode.js`, appoint **one writer** for that file and give the other agent a narrow authored-data/acceptance contract. The shared place/NPC owner implements one physical recurring contact and mission marker within Helios, not a whole unrelated NPC framework first. Shared visual direction remains subject to X1 owner approval.

**Wave 2 — prove reuse, not cloning:** Ceres and Tethys reuse successful place/address and consequence interfaces while creating different spatial grammar; Vesta reuses finite freight without copying Ceres layout. Dione adds a legible garrison, Pallas the inhabited wreck way. Run return/Continue and large-hull camera tests before claiming scalable districts.

**Wave 3 — put consequences in the picture:** Charon ecology, Veil research, Ashfall manufactured world and player-owned operations reuse prior place and ownership mechanisms. At this stage the same shipment or infestation state should produce coherent physical, social, and economic differences; no per-sector duplicate ledger.

**Wave 4 — broaden and reconcile:** Fill the other sectors, later arenas/round blocks, authored Crucible and underused public modes. EC-G13 integrates cross-branch player routes and verifies the complete experience.

## Smallest cross-team contract

For a shared fix request, the area lead must provide:
1. Normal game route and reproducible seed/setup; target platform and representative ship/load.
2. Concrete player-visible failure and relevant current owner path.
3. Required canonical input/event, output/state and what must persist.
4. A negative example (what must *not* be accepted as success).
5. A realistic local fixture plus the public-route acceptance scene.
6. Costs/risks: possible input theft, body count, frame-time, material/asset upload, state duplication.

Shared owner delivers exact change and proof; area lead integrates it and validates the original scene. No parallel unreviewed writer to the same file; no workaround that manufactures local truth.

## PR lifecycle for each of the 52

1. **SPEC/DRAFT:** authored brief, no gameplay. This was the state at publication.
2. **CLAIMED/DRAFT:** agent assigned, fresh repository/PR overlap read, exact nonconflicting paths agreed.
3. **IMPLEMENTING/DRAFT:** one or more real source/asset commits, playable evidence evolving.
4. **INTEGRATED/DRAFT:** latest source merged under repo policy; local user route and applicable native checks exercised. Deferred shared owner requests linked.
5. **READY:** complete named scope, required independent review, actual route and performance/visual evidence; no material known defects in the accepted local outcome.
6. **MERGED:** only with approved integration, authoritative status reconciled; related commission IDs can still have separate unfinished obligations.

A return from stage 4 to stage 3 is normal when a reviewer finds a defect. A PR with a usable partial component may be reviewed without the overall commission becoming stage 5.

## Cost-aware quality choices

Do not give every sector a new always-running scheduler, always-awake physics population, 3D dynamic shadow set or multiple imported textures. The goal is **more authored experience per unit of frame cost**: a repeated physical freight route that player can interrupt; one named repair worker whose job genuinely pauses; two usefully different paths through a ship-scale structure; a recognizable infection change expressed by a small number of driven material/geometry states. All of these can be more immersive than dozens of decorative meshes.

Avoid proving performance solely in empty routes. The integrator must maintain representative worst-case fixtures for occupied Helios, Ceres interior/haulage, Charon ecology and dense Foundry/Swarms, and read actual current E-campaign target criteria. Don’t silently pixelate or depopulate the game to pass an unrelated benchmark.

**No new EC queue** is authorized by this document. It merely resolves the execution order of the existing 52 PR commissions under the current native Finish program.
