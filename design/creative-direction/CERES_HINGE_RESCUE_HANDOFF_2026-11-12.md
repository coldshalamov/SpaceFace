# Ceres: from sorting machinery to carrying people

Research/increment base: `db1a02c8a85f54c8bf0bf715c59e56d05fe530d7`, EC-G15 / PR982. Source review and focused native evidence, **not visual acceptance or a completed campaign**.

## Why this next

[LARK's earned two-load route](CERES_SORTING_ROUNDTRIP_2026-11-12.md) establishes a starter-fit working loop with original 18t/16t machinery. Extending that shift with more receipts would add little. Ceres already contains another use of the same cable: six-tonne occupied evacuation pods at Hinge Works. The appropriate next experience is taking responsibility for a moving person, not increasing a sorting counter. This is an optional nearby worksite, not a newly invented LARK mission dependency or a guarantee the player has been directed there.

[The connected world direction](STORY_WORLD_DIRECTION_2026-11-10.md) argues for relationships among existing matter rather than additional commodity types. Hinge has named crews, finite machinery and physical causes already. Their rescue should allow the pilot to intervene in the route, without an autonomous refuge controller pulling the opposite way.

## Scene dossier and reusable toolbox

Sources: [scenario geometry/cast](../../src/features/industrialDisasters/scenarios.js), [ordinary invitation](../../src/features/industrialDisasters/encounter.js), [runtime](../../src/features/industrialDisasters/runtime.js), [causality](../../src/features/industrialDisasters/causality.js), [native adapter](../../src/features/industrialDisasters/physicalSite.js), [presentation](../../src/features/industrialDisasters/presentation.js), [render](../../src/features/industrialDisasters/render.js).

- **Arrival:** Ceres refinery approach, local (-1520,240). Distress invitation is untimed; the initial emergency hold allows inspection and existing unpaid rehearsal before acceptance releases the actual incident. No new mission, invitation or deadline was added.
- **Place:** a working loading/refining installation rather than a generic battle arena. Existing refinery and shuttle-dock assets give the worksite and receiving bracket. Geometry/render source inspected; no fresh screenshots or conclusions about actual mesh readability.
- **First activity, Runaway Consignment:** Morrow's 36t disabled conveyor hauler approaches two 20t solvent tanks. Move the hauler or tank to change the future impact. Iona and Merrit occupy separate 6t pods. Once safe, working thrusters head toward the refuge; damage can strand a pod instead. Failed prevention is a salvage/rescue aftermath, not an automatic reset.
- **Next authored configurations:** The Closed Lane has two 12t plate obstructions, Lio and Paz, a 32t hot carrier and an 8t medical consignment. Live Feed has an 18t power skid, 5t coupling, two 24t mills, Sena and catalyst cargo. These are existing deliberate next-incident selections after closure, not evidence of an independently running industrial economy.
- **What the player knows:** accepting starts danger; towing or clearing changes actual physical paths; opening a route is not arrival; a lost survival compartment cannot be repaired into a saved person; damaged equipment can remain useful scrap without being recorded as intact machinery.
- **Return and persistence:** the existing owner stores original poses/custody, incident history and one settlement receipt; leaving suspends the site unless a player line retains it. A next incident replaces the prior cycle only by deliberate choice after release. Practice restores the real aftermath. Neither is proof of full browser Continue.
- **Strong reuse:** existing native MassLine plus the pods' existing evacuation drive. Keep all three incident layouts, damage/exposure thresholds, refuge predicate, rewards and asset placements unchanged. No missing model is necessary for this increment; no speculative asset wishlist.

## Implemented interaction: crew hands the route to the tug

The physical adapter now projects `playerTowRole` only from the existing validated original-player attachment snapshot: live hull, supported player-line definition, endpoint identity and generation. The causality owner suppresses a crew pod's autonomous drive while that original line exists. It does not write poses, velocities, rope forces or thruster state into a second simulation.

An unresolved surviving pod records one named handoff in the existing event/history channel: “your line has us. Thrusters idle; take us to the refuge.” Existing channel spacing still applies. Repeated latch/release and cold restoration do not repeat that first event. The native impulse boundary revalidates the live line after restoration, rejecting even an evacuation intent sampled before the restored cable existed. Cutting the line lets a healthy pod resume its existing refuge route; stranded or lost pods do not acquire working thrusters. A towed pod still must reach the actual refuge under the existing speed condition to become safe. Even a safe pod yields its stationkeeping to the attached tug; cutting resumes stationkeeping. There is no rescue-on-latch, hull repair or extra payment.

## Verification and limits

`test/industrial-crew-tow.test.mjs`: actual Adventure input latches the original pod; native attachment drives the yield predicate. A bounded **controlled tug impulse**, not keyboard flight, moves the player and same pod along an alternate direction for 90 simulation ticks. No admitted pose/velocity is assigned. Cold native restoration retains the tow and silent saved handoff; actual MassLine cut restores autonomous evacuation. Separate focused states verify refuge receipt while attached, release stationkeeping and no spontaneous repair of stranded/lost crews.

Three focused tests and 28 existing Hinge/rehearsal tests pass against exact-parent imports plus the candidate. The broader suite includes native causal recovery, destruction, settlement and restore tests, but these are not a single earned route from Helios/LARK. Render-adapter tests establish contracts, **not a visual review**. No new image, full approach/escape, complete player-flown rescue, UI fit or browser Continue is claimed.

## Open outcomes (not completion claims)

| Marker | Intended outcome / state | Owner / evidence | Next executable action |
|---|---|---|---|
| SF-WORLD-DIRECTION | Existing work connects mechanically and emotionally; in progress | creative direction; this source-linked dossier | Verify the ordinary discovery route from the Ceres working loop without forcing a quest dependency |
| SF-SECTOR-COHERENCE | Ceres teaches handling machinery before intervention in occupied loads; in progress | creative direction + Hinge owner | Walk LARK departure to Hinge inspection with starter fit; review real scale/navigation pixels |
| SF-LIVING-WORLD | Named crews can cede control to the pilot without fake rescue; candidate | Hinge owner; 3 focused checks | Pilot an alternate route around the actual Closed Lane plates, release and witness refuge arrival |
| SF-GAME | Native original tow/cut/restore integrates without reward drift; acceptance open | integration reviewer; 28 regression checks | Independent review, publication verification, rendered/ordinary-route acceptance |
| SF-ASSETBANK / SF-ASSET-QUALITY | Reuse existing pod, dock, refinery and industrial bodies; no production request | local model owners retain assets | Inspect their real appearance on a permitted render-capable environment |

User-dependent operations: none for source review/testing. Render acceptance needs an allowed functioning game renderer; do not bypass known browser sandbox restrictions. Merge/deploy and execution-thread creation remain outside this increment.
