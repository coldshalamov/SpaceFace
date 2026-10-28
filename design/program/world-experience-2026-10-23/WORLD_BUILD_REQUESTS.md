# World-experience commissions and first placements

Companion to [The places between the contracts](WORLD_EXPERIENCE_TREATMENT.md), 23 October 2026.

These requests are authorized creative direction for the existing build-map owners. They do not create a second queue, take an active agent’s files, waive original prerequisites or mark anything complete. Inspect current ownership before implementation and attach each accepted commission to its existing packet. Rope and Blind Welder work are parked; none of the requests below asks an agent to resume them.

The source inspection is pinned to `8bc5e265adfcd515f4c335cc785b73020d614518`. Reconcile newer work before implementing. The inventory and consumer-path findings are source evidence, not live visual acceptance.

## 1. First placement increment: Tethys change of watch

**Experience:** a pilot can stop somewhere sensible and understand a piece of the junction’s working life without accepting a mission or opening a lore screen.

**Existing material:** the eight-hull quiet-handoff chain, actual contraband pickup effects, customs queue, seized-hulk/log relay, Quiet Cache, trade hub, Latch Nine and the existing actor/activity owners. The scene’s order already exists in `sectorCausalChains.js` and `traffic.js`. The missing authored work is the place from which the player can read it.

**Composition commission:** create an overlook on the working margin of the seized-hulk/log-yard pocket, not in the public traffic lane. Start with the existing damaged hull as the reason for the service area. Place a freight/service platform, a worklight and an observation blister in relation to that hull. A rack should belong to the job, not float as a fourth unrelated landmark. Use a small number of selected pieces and preserve the empty space that makes the stopping place usable.

The first view should frame an approaching or waiting actor and the patrol’s departure. Moving to the outer side should reveal the next leg toward the cache. Do not promise both poles fit in one normal camera frame: the authored locations are separated. The player learns the connection through a short, voluntary movement. The safe continuation to ordinary station business must remain obvious.

**Immediate scope:** the first four-piece increment is placement-only. The following attention cue or acknowledgment is a later extension, not part of that writer’s current delivery.

**Later script commission:** use current causal phases and real actor identity to time any small attention cue. A worklight or service gesture may help distinguish a change of watch, but it must not create a fake shipment, false crime or new reward. Any acknowledgment is based on an actual observed participation event, not “player entered radius.” It is acceptable for the first increment to improve composition only if the existing script already carries the scene.

**Use existing pieces:** `place_freight_platform`, `place_worklight_tower`, `place_observation_blister`, `place_hull_rack`, `place_maintenance_gantry` and appropriate aftermath hull geometry. These are options, not a requirement to place all six. Respect Tethys’s generated-kit exclusions and Latch Nine’s approach geometry. Use the current placement/dressing owner, not a second scene manager.

**Success from the player’s side:** a new pilot can identify a safe place to pause and a working route; a returning pilot recognizes the watch gap; following the runner is a voluntary discovery; collecting real dropped cargo still uses ordinary custody and law. The player can ignore all of it and reach the hub normally.

**Evidence needed:** inspect actual normal-camera views and clearance, test that placements are unique across sector return/Continue, and observe one real causal cycle. Keep source previews and live captures separately labeled. No whole-sector acceptance from a placement checklist.

**Routing:** existing sector identity/world-depth composition owners and `PQ-153`; coordinate existing traffic/activity owners rather than rewriting them. This is the immediate executable placement slice.

## 2. Binding commission: put the cast in the same world as the story

**Experience:** the person a player meets, their faction, their work and their location agree across the campaign, station contacts, missions and surrounding world.

**Current gaps:** the inspected contact table places Rook at Coalition rather than canonical Cinder, Voss at Belt Outpost rather than Hollow, Mira at Tethys/MTS rather than Bourse/Quiet, Drift at `station_drift` rather than Meridian, and Quinn across two station IDs rather than one clearly bound Outpost 9. Embodied cards also call Rook a rescue broker and the Witness “Kurtz.” These findings need deliberate reconciliation; they are not permission to blindly move every contact to the prose sheet’s string.

**Commission:** produce and implement one authoritative binding crosswalk: stable character ID, canonical role and place, actual station/sector ID, intentional adaptation if any, mission and contact consumers, save/reference migration, and the arrival/docked context that makes the binding readable. Preserve existing earned progress. If a scene intentionally adapts canon, record the decision at the appropriate authority layer instead of letting two incompatible versions survive.

Do not solve this by duplicating named characters, inventing off-screen travel excuses for every mismatch, changing only the display name, or making a new universal identity framework. Extend the existing canonical-contact and story owners.

**Additional place binding:** canonical Veil Expanse/Vael hospitality differs from current `faction_free` Research Station Veil, whose chart says “Instruments first, hospitality never.” Sori is DMC. Decide the intended relationship explicitly; preserve both source truth and canon until then.

**Canon protections:** the eight-node contacts do not name each other to explain their network; the grid tag remains received year 3 / issued year 17; Quinn’s currency withdrawal is six-year-old history; Lida and the Vethari stay off-frame; Hale does not receive a conversion scene. The Witness’s internal plumbing ID can remain `npc_kurtz` while player-facing language uses the canonical title.

**Success:** a player can follow the story’s people through the actual world without needing a developer to explain which station name means which fictional place. Existing missions and saved outcomes remain valid. A contact’s local visual and activity context supports their role.

**Routing:** current campaign/story binding owner, `PQ-032` and the worldbuilding pipeline. This is a high-priority story/place integration request, not a rewrite of the campaign or its endings.

## 3. Place commission: Veil’s working research edge

**Experience:** the existing Free Frontier Research Station Veil becomes a coherent place for careful work and voluntary observation. Its brusque identity stays intact. Canonical Vael hospitality is a separate place/faction binding decision, not a reason to relabel this station.

**Existing material:** Research Station Veil `(420, -1120)`, Surge Shrine `(-240, -720)`, instrument tender and dish-listener paths, Quiet Ice activity, Sori’s scan/extract/independent-comparison contract, Venn’s courier identity, Suhl’s interpretation, current research-station assets and everyday kit.

**Composition commission:** build a modest exterior sample-handling apron and a quieter observation corner with distinct routes. Service craft need a reason to move between the apron and the station. Visiting ships need an understandable place to wait without obstructing the tender. Habitat and utility pieces should relate to each other; solar surfaces and cold storage should have believable orientation and access. Preserve the missing-center character of the nebula and the existing shrine rather than filling every gap.

Use `place_observation_blister`, `place_habitat_pod`, `place_utility_module`, `place_solar_array`, `place_cargo_pod_hazmat` and `place_cold_locker` only where each has a visible purpose. A new custom research city is not required for this first pass.

**Small life commission:** make the station observation corner a specific pleasure: a place to coast and watch the tender’s chord without accepting a job. Quiet Ice and its mourning kite are a separate voluntary stop about 2,660 WU away, not a view promised from that station corner. Preserve the ecology’s actual placement. A restrained docked service observation can connect to that exterior work. Keep DMC assayer Sori, Suhl and Venn distinct. Do not make them a single mysterious-alien exposition chorus. A future genuinely hospitable Vael destination should be canon-bound through commission 2, not assumed to be this Free Frontier station.

**Causal extension, only if needed:** the contract already mentions battle-afterglow exclusion. If actual recent disturbance can be connected through existing aftermath/sampling records, expose that bounded fact. Otherwise retain the authored exclusion and explicitly leave dynamic causality unimplemented. Never claim the player changed the survey merely because combat occurred somewhere in the sector.

**Success:** a pilot has a practical reason to linger, can distinguish work routes from the observation space, can complete the existing sample job without decorative interference, and sees one appropriately modest response after a real accepted comparison. Save/return does not duplicate cargo, visitors or rewards.

**Routing:** existing sector-identity/activity owners, Veil research/career-contract owners and the asset-experience program. No new faction, economy, research ledger or obligatory mission spine.

## 4. Major set piece: Borrowed Sun, the visiting market

**Existing scope:** `SF20-12`, primary owner `P07`, fitting-and-market family. Preserve original prerequisite edges `SF20-01` and `SF20-02` in the twenty-concept map. This commission sharpens the experience; it does not add a twenty-first concept.

**Current truth:** data and a source system exist, but the system is unregistered and explicitly refuses materialization without `helpers.borrowedSunPhysicalBody`. No corresponding released body was identified in the inspected tree. Do not advertise a live market from source text alone.

**Why this is worth building:** the route needs a destination that changes its relationship to a place. A visiting market gives Ceres and Tethys something to anticipate and recognize without building another permanent station. Its warmth comes from useful services and recognizable opening activity, not from an inevitable betrayal.

**Asset commission:** one distinctive carrier with readable folded and deployed states, three ordered reflector pairs and an exterior trade/service apron. The docking mouth must remain understandable at normal gameplay scale in every permitted state. The carrier’s industrial construction should support its role as a traveling place; do not make a generic freighter with a shop icon.

Deliver the authored source, exported package, materials, animations, collision/clearance contract, sockets/service anchors and LOD behavior through the current asset pipeline. LODs and recolors are not additional distinct models. Inspect the actual exported body, not only a source viewport.

**Placement and script commission:** honor the existing safe berths at Tethys `(-250, 1600)` and Ceres `(-2150, -1280)`. Opening, occupied, closing and absent states should be legible. Never move an occupied station. A visitor arriving late should find an honest state, not be trapped by an arbitrary timer. Its itinerary and finite stock must use existing owners; an empty berth should remain a meaningful place rather than spawning a counterfeit market for convenience.

**Life:** Nemi’s hospitality should be practically useful. Let the gathering have a small recurring culture: a familiar service craft, a recognizable opening order, a place crews wait. A public program or informal competition can be a later authored addition, not a prerequisite for the carrier’s first coherent visit.

**Success:** the pilot recognizes the opening silhouette from the lane, approaches safely, uses ordinary services, leaves normally, and later finds the market at the correct other berth or an honestly empty site. Exported, reviewed, published, integrated and accepted are separate states.

## 5. Major set piece: the Tethys Switchyard

**Existing scope:** `SF20-11`, primary owner `P08`, cargo-theft/switchyard family. Preserve original dependencies `SF20-03` and `SF20-09`. This is an existing unfinished concept, not a new generic logistics system.

**Current truth:** `tethysSwitchyard.js` defines the site, a finite six-unit food pallet, receivers and phases. A named runtime/registry activation was not verified. Data is not a functioning yard.

**Why this is worth building:** the junction’s traffic should visibly move something to somewhere. A crew-owned transfer cycle gives the player a reason to watch before being asked to intervene. The same pallet can matter to the trade hub, Customs or dispatch without changing identity whenever the story needs another object.

**Asset commission:** the existing contracts name `SF_PLACE_TETHYS_SWITCHYARD`, `SF_PROP_TETHYS_GANTRY`, `SF_PROP_TETHYS_SLED` and `SF_PROP_TETHYS_PALLET`. Build them as one readable working arrangement: input berth, A trade-hub exit, B customs diversion, C dispatch return, moving-part clearances and a safe observer bypass. A scenic gantry with no meaningful relation to the route is not the set piece.

**Script commission:** a complete ordinary crew cycle must work before player intervention. A jam changes an actual reachable destination; helping resumes the same work. A customs diversion changes where the same finite pallet goes. Avoid both infinite replacement goods and a “press button, spawn completed shipment” shortcut. Reuse reservations, finite custody and receiver owners.

This is not permission to resume a general tow-mechanics project. The experience is understanding and helping a working junction. The player should have a clear non-destructive way to observe and leave; not every role in the yard must involve dragging a mass.

**Success:** a pilot can watch a complete transfer, explain the three exits from their geometry, help with a bounded interruption and recognize the consequence on return. The six food units remain six through save, diversion, recovery and delivery. Art and ordinary-route acceptance remain separate from technical custody checks.

## 6. Major set piece: the Watcher and the people working beside it

**Experience:** the player optionally explores an ancient aperture aimed at something absent and the Archive’s separate field-research site. The scale contrast is the scene. Sori’s comparison shipment instead settles at the already-bodied Free Frontier Triton Wake Lab (`station_triton`, `(480, -980)`, `place_station_research`); this commission does not replace or relocate that receiving station.

**Current gap:** preserve `poi_triton_watcher` at `(-1700, 1500)` and `poi_triton_field_lab` at `(1600, -700)`. The Watcher currently uses `place_asteroid_seamed`; the lab uses `place_sensor_mast`. The existing discovery and three-bearing research promise a more specific place than those stand-ins communicate.

**Asset commission:** build an asymmetric carved mass with an unmistakable aperture and fixed gaze. Its silhouette should survive the normal top-down camera, distance and dark background. Do not depict a Vethari, open a portal, add a face or turn the aperture into a boss mouth. The interesting thing is the direction it attends to and the empty space at the end of that direction.

The Archive Field Lab surround can be assembled mostly from the existing research/service bank: platform, masts, storage, utility, visiting craft and observation positions. Add only the missing structural piece that makes the lab’s scale and work clear. The human offering field already has a memorial, tally post, cargo pods and whistle; preserve it as a modest response to the large object, not a decorative ring of loot.

**Placement commission:** present three scales along a voluntary approach: small instrument hull, offering field, vast aperture. Keep direct legible routes to both the existing Wake Lab station and the separate Archive Field Lab, plus an outer bypass. Proposed near/far physical reference marks should help the pilot understand the existing three-bearing research spatially; physical markers are not established by the current triangulation behavior alone. Do not make the player collide with the mystery to discover that it exists.

**Script commission:** reuse discovery, the three-bearing research, stabilized-echo aftermath and actual field workers. Verify any existing local-dampening behavior before building an experience around it. The external-only Wake Draft dialogue is not a physical flight owner and must not be used as evidence that the player can already ride a draft.

**Success:** the pilot understands what is aimed and what is absent, can perform the existing research at readable reference positions, and returns to a working lab rather than an arbitrary mast. The result is a stabilized research signal, not Sori’s separate commodity comparison and not a definitive revelation of the universe.

**Routing:** existing Triton frontier/research and landmark/asset owners; coordinate current work before claiming exact files. This is an architecture-and-composition commission, not a new anomaly engine.

## 7. Small later commission: something genuinely on the public screen

**Experience:** a waiting place has culture and time that do not revolve around the pilot’s current objective.

Commission one specific program: **Kite’s Corner**, an original recorded course segment at a Ceres service/waiting surface associated with the existing Red Kite route. It is a local crew’s interest in flying well, not a generic news feed.

The program has three beats. First, a readable course view establishes one named corner and the hull class. Second, an actual recorded run takes that corner wide; the replay lets the viewer see the mistake rather than overlaying a lecture. Third, a cleaner recorded pass shows the alternative and ends with its real recorded time. If the comparison is authored demonstration footage rather than a live leaderboard event, label it as such. Do not fabricate a current race result or invent a player record.

Use the game’s own recorded poses/rendered footage or an appropriate lightweight in-world representation, with the current replay/presentation owner. No copied real show, unrelated video or universal entertainment simulation. The scene’s audience is crews waiting for ordinary service; the screen must be placed where waiting is plausible and not in the transit lane. It is a later composition request, not a fifth prop silently added to the four-slot Tethys overlook.

The point is that a place has something to watch. The player can stay for the ending, take the corner differently on their next voluntary run, or leave halfway through. There is no viewing reward, quest gate or reputation farming. Playback needs a bounded resource budget, a readable fallback and no interference with docking, the board or departure. If a distant exterior screen is illegible at normal camera scale, give the existing docked surface a supported presentation rather than pretending a tiny texture is a television.

**Routing:** current presentation/ORRERY and world-activity owners, with the relevant asset/lighting owners. This is lower priority than the first composed place and the canon binding, but is an explicit way to pursue everyday depth once the place has an audience.

## Delivery and sequencing

1. Compose Tethys’s safe change-of-watch overlook using existing released pieces and real causal behavior.
2. Reconcile the cast’s canonical/runtime place bindings before building new cross-character scenes.
3. Compose Veil’s working research edge around its existing independent station, service routes and observation corner; bind canonical Vael hospitality separately.
4. Commission the Watcher’s aperture/lab architecture and the two retained SF20 social/logistics set pieces through their existing owners, preserving prerequisites and active work.
5. Add a public program only where an authored waiting place gives it purpose.

This order is a creative dependency, not a replacement dispatch queue. Local agents can take a larger set-piece request while the assistant continues composing existing places. The requests remain subject to current path ownership and the project’s normal approvals.

For every delivery retain separate evidence for source creation, export, visual review, publication, integration and acceptance. A build-map request is complete as a request when it is clear and routed; its world outcome stays open until the player can actually experience it.
