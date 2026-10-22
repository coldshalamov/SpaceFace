<!-- LIFETIME: DURABLE -->
# Pallas light-cut experience register: evidence addendum

22 October 2026, 08:38 UTC. **OPEN**, not sector acceptance. This is a new, narrow supplement to the existing sector inventory; it does not edit or supersede the held PR480 sector-register artifact. No personally piloted session, live camera or new canon is asserted.

## Scope and source identity

This unit belongs to [IMPLEMENTATION P08](IMPLEMENTATION.md), the [Pallas district example](DISTRICT_EXAMPLES.md#4-pallas-a-salvage-crew-with-a-working-reef-edge), the [original twenty-concept map](TWENTY_CONCEPT_MAP.json), and the actual [build map](../../../build_map.md) (PQ-027 machinery, PQ-153 sector identity). It is the first light cut, not the entire extraction/recovery/rescue/return episode or the Anvil–Tethys–Vesta–Pallas consequence chain.

Existing authored anchors are in [sectorWayOfLife.js](https://github.com/coldshalamov/SpaceFace/blob/e7f6122f8d8f2985223940bfbb60eb4f66272561/src/data/sectorWayOfLife.js) and [environmentalMachinery.js](https://github.com/coldshalamov/SpaceFace/blob/e7f6122f8d8f2985223940bfbb60eb4f66272561/src/data/environmentalMachinery.js). New code and placed asset bytes are preserved in the [exact recovery manifest](https://github.com/coldshalamov/SpaceFace/blob/c9155b39fe955e99f0d04fd136aabf008c98bc23/design/recovery/pallas-mobile-20261022/manifest.json) and [residency recovery instructions](https://github.com/coldshalamov/SpaceFace/blob/c9155b39fe955e99f0d04fd136aabf008c98bc23/design/recovery/pallas-mobile-20261022/residency/README.md). These are reconstruction artifacts, **not runtime files delivered on an implementation PR**.

Code inspected in the reconstructed 14b80eeba8da81b81224286d133f34972dfdff30 snapshot: src/data/pallasReefCrew.js; src/systems/pallasReefSource.js; src/systems/pallasReefCrew.js; src/systems/salvage.js; src/systems/npcJobsRuntime.js; src/systems/traffic.js; src/data/contactHail.js; existing environmentalMachinery.js and sectorWayOfLife.js. The four-path residency derivative is separately pinned by [residency-manifest.json](https://github.com/coldshalamov/SpaceFace/blob/c9155b39fe955e99f0d04fd136aabf008c98bc23/design/recovery/pallas-mobile-20261022/residency/residency-manifest.json), with result tree 8df4859e6b74ac0ec8caaaac79880336cd27d1cd. Current-master combined integration is still pending.

## First arrival: what exists and what teaches it

**Implemented in candidate source:** the light section and spent hulk are placed relative to the actual reef frame, not guessed global coordinates. Section offset is (320 along, 190 across); hulk (310, 217); carrier berth (330, 390). Cutter, tug and carrier have distinct durable identities and roles. The cutter uses the actual mining-beam/cut target transport. Hail STATUS describes cutting, holding, transfer, received, interrupted, recovered or lost, with a stale-report fallback. A received report explicitly says the original section is on the carrier's external line and has not been sold.

**Unverified:** a new player noticing the crew from an ordinary approach, understanding the safe edge or discovering STATUS without assistance. Source wiring and model previews do not prove legibility at normal zoom, obstruction-free sightlines or a successful first-arrival lesson. No new tutorial or automatic introductory encounter is claimed.

**Proposed next observation, not implementation:** enter through the normal Pallas route, watch a warning/surge/calm transition, find the cutter and inspect STATUS without debug staging. Check whether the real beam, line and carrier placement communicate “cut, hold, wait, transfer” before adding more UI or prose.

## Ordinary visits, elapsed time and choices

**Implemented:** existing reef simulation uses a 2-second warning, 8-second surge and 4-second calm cycle. Work needs real current native bodies, legitimate job ownership and line custody. The cutter progresses the clamp; the tug holds/reels the same section; the carrier receives only with calm phase, both relevant bodies outside the actual cone, close range, bounded relative speed and the original valid line. The section is mass 45, radius 8, with one finite pool: three scrap-metal units and one salvage-electronics unit.

**Choices with tested/source consequences:** real player extraction disputes/drains that pool rather than spawning another cut. Lost material and lost crew are not silently respawned as replacement stock. Control leases and interrupted jobs prevent automatic NPC custody. Existing recovery/negative checks constrain duplicate receipts and rollback. This is a finite episode, not a repeating four-unit dispenser.

**Limits:** elapsed simulation time is not proof of autonomous distant-sector productivity. Mission completion is not shown to select a new cut, create a repair return or change a personal relationship. Heavy and damaged cuts remain district proposals, not implemented variations. No automatic sale, station delivery, profit, offscreen reward or full rescue arc is established.

## Leaving, returning and Save/Continue

**Save/Continue evidence:** focused native tests cover original partial-cut and carrier-owned-line states, finite source stock, custody and truthful read-model/visual identity. Numeric entity IDs alone do not confer identity. The original section and existing native authority remain the source of truth.

**Separate residency correction:** production world.enterSector calls exercise real exit/enter listeners and the residency planner for continuous/noTeleport and hard-entry options. Pallas is asserted RECORD_ONLY while away. Exact admitted live entity/data/job/generation, unique record and original line must survive; resumed work produces one real carrier receipt, and a second ten-second absence/return must not duplicate it. Player-disputed stock and forged/stale identities fail closed. Carrier approach now follows the real section using a stable authored receiving side; it does not inject pose, velocity, force, stock or a receipt.

**Precisely not proved:** physically piloting the sector boundary, using the complete gate UI, full encounter populations, destruction/rematerialization of the five protected actors, GPU/camera/controller feel or long-session performance. The correction retains live protected occupants. Tests omit unrelated encounters and are not a substitute for two ordinary player visits.

## Inhabitants, work, economy, history and relationships

- **Inhabitants/work:** Reef Cutter · Pale Line (Pelican), Reef Tug · Second Pull (Hawser), Reef Carrier · Waiting Room (Mule) are source-authored traffic labels/roles, not invented human biographies. Traffic owns actors, jobs owns steering, combat owns lines, salvage owns stock. The pre-existing eight pocket actors and Black-Wake remain separate.
- **Economy:** exactly one four-unit source moves through physical custody. The carrier receipt means the section is on its line; manifest and credits are not a sale. Destination/offload/sale is open work.
- **History:** cut progress, interruption, depletion/loss and the single receipt preserve mechanical episode history. They do not establish a named crew's conversation memory, repaired return or station relationship.
- **Relationships:** existing Pallas law and institutions remain source canon. No new named local human, borrowed canon character, portrait, company ownership or personal trust arc is implemented by this unit. The district's experienced cutter/younger pilot remain proposals pending canon fit and actual behaviors.
- **Landmarks/texture:** existing sector data names Drift Market, Smuggler Den, pirate wreckage, hidden cache and the Quiessence; its signature toy is explicitly “none.” This addendum does not turn the light cut into a new landmark or reinterpret the Erased. Scenic placement against ordinary station approaches and existing discoveries still needs actual play evidence.

## Actual asset and acceptance boundary

One distinct machinery cassette has editable source assets/ships/forge/sources/pallas_cut_section/pallas_cut_section.blend, generator tools/blender/pallas_cut_section_source.py, source/release place_pallas_cut_section.glb and the runtime pallas-cut-section package, all in the recovery manifest. The spent hulk keeps its existing visual selection. Rails, pressure casing, finned motor, service manifold, severed face and hollow pipes provide an industrial silhouette; five opaque material batches and 7,792 triangles are one asset, not multiple models counted by packaging stage. Geometry tests load actual bytes and check native-capsule containment after real fitting; identity tests cross serializer/receiver/Continue boundaries. These are not live readability or GPU-cost measurements.

Evidence remains separate: reconciled Pallas 85/85 focused; expanded 309/314 with five independently reproduced public-source-control shunt failures; residency derivative 51/51; mobile 126/126 in its own snapshot. None is a combined current-master result. Exact e7 main CI failed overall, and Chromium CI success did not verify visible world play. Latest 08:26 cloud-browser attempt failed on an already-used profile before any play.

**Owner/next:** root integration reconciles current master, registers the explicit residency test and seals combined evidence before implementation publication; exact feature/reviewer ownership is unchanged. Then inspect real first arrival, ordinary work, choices, two visits and Continue, followed by the still-missing destination/offload/sale and broader P08 acceptance. SF-PLAY-WORLD and SF-SECTOR-COHERENCE stay OPEN. Original PR480 held operation and original register remain unchanged.

## Evidence update — 22 October 2026, 09:28 UTC

See the [current delivery and integration checkpoint](CURRENT_CHECKPOINT_2026-10-22.md) for the latest verified mobile PR successor, recovery identity and next actions. It supersedes historical current-state prose without closing any of the ten outcome markers.

The source findings above remain bounded historical evidence. The coherent radio successor is bcfdd4730a74c2b79b6e53e3bd7111d6d2ec1dc3 / tree 707320df59191f596616b9741c79586fd817e386, based on exact 70bb667 upstream, not latest master. [Recovery c7f275ca](https://github.com/coldshalamov/SpaceFace/commit/c7f275ca1d35a026212f570a96fe7f2529b58c6c) reconstructs all 61 outputs and the full tree; this is not runtime publication.

First-arrival/ordinary-visit teaching now includes 24 state-conditioned radio lines for the three existing ships, with short HUD labels unchanged. No human biographies or new crew are implied. A Continue readout correction prevents a negative observedTick sentinel from making a historical carrier receipt sound current at tick zero. Final wording passes 20 pure/serialized read-model/Hail checks; earlier 22-case wording evidence included two physical tests and is not a final-tree count. Independent review of this bounded increment is closed, not player acceptance. The voice test joins the existing gate with 318 prior leaves preserved. Expanded upstream remains 311/316, including five inherited shunt failures.

The next genuinely active unit is the original Waiting Room carrier to existing Drift Market intake. A native transfer plus 180 simulation seconds staying received proves the missing destination behavior; actual economy initialization confirms Scrap Metal and Salvage Electronics listings. dot owns source/market atomicity, physical approach, Continue and interference. These changes are not yet implemented or accepted. No sale, payment, invented listings/capacity, new crew or completed episode is claimed. Receipt-to-market physical continuity remains an open acceptance question.

No hands-on flight exists. The 08:44 view is CPU native-pose evidence; the 09:06 accepted cloud-browser application launch produced no browser window. The original held PR480 sector register and asset operation remain unchanged. All ten goals, including SF-PLAY-WORLD and SF-SECTOR-COHERENCE, stay OPEN.
