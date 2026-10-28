<!-- LIFETIME: ACTIVE -->
# THE OPEN REACH — space, scale, camera, and authored assets

**Status: proposed production specification, not a report of implemented environments.** Source inspection is pinned to `42d57a248209c9f5a7354e65817c0f7b8f5dbcec` (27 October 2026). This document does not claim a rendered playthrough, delivered new GLBs, measured performance, or completed interior-flight support. The user explicitly commissioned detailed model briefs for subsequent local agents. District names and narrative ownership come from [02-WORLD-AND-STORY.md](02-WORLD-AND-STORY.md); the eight stable district IDs below must agree with that document and the authored district catalog.

The intended picture is a ship passing through a place with a recognizable silhouette, understandable work, and an exploitable physical arrangement. A city has streets because cargo and residents need to go somewhere. A fort has a perimeter because somebody is protecting something. A wreck town has blind corners because its founders built inside the remains of something larger. Scale must change how the player navigates, not merely how much geometry sits behind the ship.

## 1. What the repository already provides

These are observations of source, not visual-quality verdicts. Reuse the existing owners; catalog membership alone does not establish that a body loads, looks good, collides correctly, or performs its advertised job on the default route.

| Existing seam | Observed capability | Consequence for this work |
|---|---|---|
| [`sectorAnchors.js`](../../../src/data/sectorAnchors.js), [`sectorZones.js`](../../../src/data/sectorZones.js) | Stable stations, gates, fields, POIs and named zones with spatial anchors, reasons and some presence templates. | Districts compose around these IDs. A district is not another disconnected sector registry. Preserve existing save identities and anchor reservations. |
| [`sectorCompositions.js`](../../../src/data/sectorCompositions.js) | Authored relationships, field motifs, apertures and protected routes. The current composer deliberately leaves the fixed anchors in place. | Develop deliberate streets, bays and passages by extending the composition contract. Do not scatter city props over the existing safe corridors. |
| [`sectorWayOfLife.js`](../../../src/data/sectorWayOfLife.js) | Every sector has verbs, rhythm, law, crime, structures and a landmark description. | The missing maturity cannot be solved by another adjectives table. Each district must make these relationships physically visible. |
| [`everydaySpaceKitDressing.js`](../../../src/data/everydaySpaceKitDressing.js) | Forty-six legal model identities include habitat pods, shuttle docks, passenger platforms, utility modules, cranes, customs pylons, inspection platforms, solar arrays and salvage hardware. Ordinary placement is deliberately sparse. | Assemble an authored city from this library before commissioning replacement buildings. Six scattered kit pieces are not a city; coherent placement and causal occupations are the new work. |
| [`wreckAftermathDressing.js`](../../../src/data/wreckAftermathDressing.js) | Fracture families for ore freighters, liners and corvettes, with shared ribs, panels and machinery. | Widow's Run uses related fragments from recognizable parent hulls. It must not become an indiscriminate debris confetti field. |
| [`worldSiteManifests.js`](../../../src/data/worldSiteManifests.js), [`worldSiteAssetBindings.js`](../../../src/data/worldSiteAssetBindings.js) | Durable world-site operations and exact asset/socket snapshots; the Wreck Cathedral has its own identity, stages, evidence and payload. | The Cathedral remains the Cathedral. Nine-Mouth Cut is an adjacent ore mass with new identity. Reusing its saved ID for a rock would corrupt both narrative and saves. |
| [`solidDressing.js`](../../../src/world/solidDressing.js), [`modelTruth.js`](../../../src/data/modelTruth.js) | Measured model skins can enter the static collision and projectile layers without turning all dressing into sim entities. Unadopted or absent skins remain nonphysical. | Use measured compound shapes for walls and passages. Every promised obstacle must be explicitly physical; no giant bounding sphere across a visible hole. |
| [`camera.js`](../../../src/render/camera.js), [`racingCameraBlend.js`](../../../src/render/racingCameraBlend.js), [`racingSteer.js`](../../../src/systems/racingSteer.js) | Default fixed-heading overhead view plus an existing stern view and polar blend. Current stern selection is a steering/race policy, not automatic cave traversal. | Extend one camera owner. Reuse the blend math, but do not claim interiors are already handled or copy the race's control-lock policy into free exploration. |
| [`cameraGlide.js`](../../../src/render/cameraGlide.js), [`cameraOccluders.js`](../../../src/render/cameraOccluders.js) | Predictive up-and-back clearance and presentation-only relief for small occluders. The latter has a bounded radius range. | Open-space clearance cannot simply lift the camera through every cave ceiling. Large authored interiors need local camera volumes and selective roof visibility. Do not duck an entire city under the ship. |
| [`theBolus.js`](../../../src/data/theBolus.js), [`systems/theBolus.js`](../../../src/systems/theBolus.js), [`bolusView.js`](../../../src/render/bolusView.js) | A real `interiorHost` sector, dedicated materialization, biological obstructions, timed iris, forces and saved ecological flags. | Harvest its useful layout/force/lifecycle patterns. The Bolus is one specific host, not a general interior system; preserve its behavior and do not create a second ecology owner. |
| [`asteroidInteriorPreview.js`](../../../src/render/asteroidInteriorPreview.js) | An explicitly dev-only visual cutaway for the works/drill presentation. | This is a reference for rock appearance, not evidence that ship flight inside arbitrary asteroids is implemented. |
| [`alienEcology.js`](../../../src/data/alienEcology.js), [`alienFauna.js`](../../../src/data/alienFauna.js) | A single fungus with local strains, contamination distinct from player knowledge, fauna drives and stimuli. | Greenwake extends the Charon Grave lineage. It does not introduce a generic purple enemy faction with unrelated infection meters. |
| [`sectorCoordinates.js`](../../../src/data/sectorCoordinates.js), [`frameCoordinates.js`](../../../src/render/frameCoordinates.js) | Global sector positions, materialization tiers and frame-local presentation. | Use the existing floating-origin membrane. A giant surface does not justify a parallel coordinate system. |
| [`headlights.js`](../../../src/render/headlights.js), [`lookMoods.js`](../../../src/data/lookMoods.js), [The Look](../../../docs/visual-assets/LOOK.md) | Real pooled SpotLights, sector moods, event-light ownership and material rules. | The ship's headlight must actually illuminate ground and walls. No luminous fan posing as a beam; no new light per window. |
| [`sectorLandmarkBackground.js`](../../../src/render/sectorLandmarkBackground.js) | Distant landmark dressing currently chooses a derelict-hauler or relay-mast art kind from the sector landmark description. | A distant backdrop is not the playable landmark. District identity requires its own geography, silhouette and physical opportunities. |
| [`stationBayTraffic.js`](../../../src/render/stationBayTraffic.js), [`stationOperationVfx.js`](../../../src/render/vfx/stationOperationVfx.js) | Decorative station-screen transfer craft and a separate receipt-driven in-world work presentation. | Use the latter ownership pattern for actionable occupations. A decorative shuttle loop must not pretend to carry physical cargo or passengers that the player can seize. |

Current camera numbers in old architecture prose and newer runtime policy are not perfectly aligned. Take an implementation baseline from the live camera and [`tabletopPolicy.js`](../../../src/render/tabletopPolicy.js), preserve existing tests and settings, and document any deliberate policy change. Do not restore a historical zoom range merely because an older paragraph calls it canonical.

## 2. A spatial vocabulary large enough for a world

The eight districts need different **topologies**: different arrangements of routes, obstacles and destinations. Palette is a supporting cue. With the names and colors removed, a pilot should still distinguish a freight city from a military harbor or a hollow rock.

| District | Primary spatial form | The player learns | Physical interruption that changes its life |
|---|---|---|---|
| `district_helios_lantern_ward` | A sheltered civic crescent around the Candle Fleet, with an open freight edge and small connected berths. | Local landmarks, yielding to working craft, a safe first tow. | A damaged utility feed changes which berth receives the service tender; repairing it resumes the interrupted route. |
| `district_dione_niner_bastion` | A nested military harbor: public approach, inspection throat, staging apron, restricted tender slip. | Perimeter escalation, patrol timing, route denial, preparation. | Steal COUNTERSIGN, breach a gate, free an impounded hull, or destroy a radar relay; the deployment pattern and traffic response change. |
| `district_tethys_switchyard` | A dominant freight spine with three unequal feeder streets and civic side courts. | Timing large mass, reading right-of-way, using service alleys. | Divert a shipment or jam a transfer berth; a real queue forms and workers route to the obstruction. |
| `district_ceres_cathedral` | A wreck landmark beside Nine-Mouth Cut: a long ore mass with branching horizontal bores and a sunlit chamber. | Anchor placement, cargo clearance, route choice inside a volume. | Open a sealed haul bore, rescue a trapped cutter, or break a fan regulator; routes and work accessibility change. |
| `district_pallas_widows_run` | A dogleg wreck canyon with two exposed bypasses and sheltered Quiet Berths built into liner ribs. | Cover, line-of-sight, momentum commitment and escape-route planning. | Move a suspended hull section, steal a tow, or provoke a pursuit; the same wreckwork becomes an obstacle, shield or escape tool. |
| `district_charon_memorial_gardens` | A garden of wreck terraces and rooted tissue, with paths around feeding fronts. | Thermal and vibration restraint, living boundaries, ecology that is not uniformly hostile. | Heat a colony, remove a carrier, restore a shade device or deliver a seed vault; the organisms and service crews react through the existing ecology. |
| `district_ashfall_iron_maw` | A vast accreted hull surface, cut by drainage trenches, armored ridges and inhabited repair scars. | Headlight navigation, large-scale landmark bearings, a surface-to-interior expedition. | Re-route coolant or open a service seam; local pressure, machinery and access change while distant parts remain a visible horizon. |
| `district_phoebe_fourth_toll` | A quiet crystalline basin with a rescue port on one lip and a broken resonant span across the other. | Listening, restraint, careful positioning and low-stakes skill play. | Restore a missing resonator, tow a pilgrim out of a drift, or disrupt the ceremony; the next procession takes a visibly different route. |

Each flagship district needs a **public edge, a working core, a risky interior and a route home**. Those need not be four concentric circles. There should be at least one useful route through a place that does not require a mission, one shortcut earned through knowledge or action, and one way to leave after making a poor decision. Secret routes must be legible from physical evidence: dock rash, guide lamps, a tug disappearing behind a broken rib, moving airless dust from an operating vent. A marker may confirm discovery; it cannot be the entire discovery.

A landmark's identity consists of silhouette, approach, use and remembered history. A nuclear-bomb-shaped object with a paragraph attached would borrow the reference game's furniture but miss its achievement. Here, the Candle Fleet is maintained, worked around, visited, exploited and argued over. The quarter exists because of what that object means and does.

### Layered population, not particle crowds

A convincing district uses four scales of life:

1. **Named physical actors** whose ship, job, cargo and outcome can be followed across a whole local scene.
2. **Repeatable service actors** with a real source, destination and reason to wait, flee, repair or resume.
3. **Attached mechanical activity** such as shutters, pump pistons, clamps and cranes driven by actual local operations.
4. **Distant decorative evidence** such as window occupation, tiny silhouettes behind glazing and lights on an inaccessible terrace.

The first two are interactable participants. The last two are presentation unless explicitly promoted through a sim owner. At near range, a visible moving object that looks towable or shootable should become physical, or have a clear physical boundary explaining why it cannot be reached. A hologram is allowed to be a hologram; a freighter should not quietly become one when shot.

### Citizens the pilot can actually see

The user asked to see people doing things, not just ships with occupation labels. Build visible human-scale activity where the flight camera can read it: glazed dock galleries, inspection platforms alongside the berth, an illuminated workshop bay, an EVA technician held by a service tether, and a memorial ledge seen during a close pass. Keep real relative scale. Do not enlarge people into eight-meter mascots or fill distant streets with subpixel dots.

A small shared figure kit should support carrying, pointing, inspecting, welding, waiting, gathering and assisting another worker. Culture and occupation change workwear, tools, posture and group arrangement; use the existing culture direction in [03_PEOPLES_CREATURES_MACHINES.md](../../expansion/03_PEOPLES_CREATURES_MACHINES.md). A customs inspector checks a stopped load, a repair pair exchanges tools, passengers wait while the shuttle is absent, and the memorial attendant adjusts a lamp. Their motions follow the related service state. Only background idle shifts use autonomous cosmetic variation.

Visible glazing/railings establish where a person physically is. Most figures are attached presentation inside an inaccessible habitat; they are not fake independent ships or combatants. An EVA rescue becomes a real named rescue object through the existing entity/custody path before it promises a gameplay interaction. This program does not require a walking-player mode. The ship can still carry the entire game while the people inside the world become visible.

Recurring work and authored vignettes need different admission rules. The existing encounter catalog contains many `ambientScene: true` scenes; that flag is not a guarantee of a singular, once-only event. A routine may repeat after its real stock, route and crew are ready. A named funeral, unusual accident or discovery must keep its durable consumption/aftermath record; it cannot restage the same dead citizen every twenty minutes because a generic ambient scheduler is ready. Avoid a parade of repeating “unique” scenes. Between events, let the ordinary district day continue.

## 3. The districts as buildable places

Dimensions below are **layout starting points**, not measured implementation performance or universal art limits. `S` means the maximum measured swept width of a permitted craft and its relevant carried load on that route; derive it from model truth and gameplay state, not the visual radius alone. A route that accepts COUNTERSIGN uses its envelope, not the starter Hitch's. The Hitch's catalog has a 14 WU collision radius; that is a useful reference, not permission to assume every aperture wider than 28 WU is safe.

### Lantern Ward — an ordinary day around an extraordinary object

Keep `poi_memorial` and its current Candle Fleet body. Place the civic quarter on the side that preserves its established procession and narrative bearings. Use a crescent of habitat clusters with shared service spines; the open side faces the lawful freight route. Separate a 6–8 S freight passage from 3–4 S local berth lanes. The central memorial approach remains wide enough to turn a tow without striking residents.

The arrival composition should show three scales at once: the Candle Fleet silhouette; a shuttle crossing toward a passenger platform; a tender attending a single lamp or damaged connection. The player can observe the tender complete a physical job before hearing an explanation. A small garden blister contains recognizable planted silhouettes, maintenance shutters and a shaded meeting ledge. It is attached to a habitat, rather than floating alone as a “garden object.”

Quaintness comes from repairs and compromises: one berth is a former engine bell, one family's shade canopy spans two mismatched modules, a market stall is bolted into an obsolete customs frame, a memorial lamp has a replacement housing from a worklight. Keep the industrial material language; make the choice of use human. Do not cover every surface with random “grime.”

**Required visible loops:** shuttle berth-to-berth service; utility tender repairing a specific node; memorial procession with a reason to stop; salvor dropping recovered material at a real receiver. If all jobs are busy or interrupted, waiting craft use holding points clear of the player's dock path.

### Niner Bastion — a military base the player can deliberately antagonize

Preserve the Dione exchange and customs station identities. Niner is the military district around the customs approach, not a duplicate station. Its public edge permits observation of the garrison at work. A player can assess the heist without accepting it. Restriction is geometric: paired pylons, a painted inspection throat, armored piers, mooring racks, a command mast and a tender slip.

The initial authored roster should create the promised impression of dozens of units without demanding that dozens of full tactical agents chase the player every frame. The district catalog proposes **20 normal materialized actors**, which can be composed as six perimeter craft, six on the ready apron, four berthed hulls, two service craft and two command/support hulls. A visual target of 24 may add four parked hulls drawn from the catalog's finite reserve of 12 **only if the shared admission budget has room**. Reserve 12 is logical inventory, not 12 extra bodies to add on top. Parked materializations still pay collision, render, targeting and lifecycle cost, and still count toward the shared physical census. Other traffic and encounter owners consume that same budget.

The existing runtime default remains 24; proposed `alertActive:32` and `sharedCap:40` are planning envelopes that require measured integration before adoption, not instructions to silently raise it. Admission/choreography may stage release from physically legible bays, while preserving the actual finite roster and showing damaged or empty berths. The player must never see a fresh pursuit ship spawn on top of a destroyed moored hull. A reserve hull that is visible and reachable is damageable and owned by the same roster; launch promotes that identity to active flight.

Launch geometry matters. Three independent lanes prevent one jam from stopping every response. The tender slip sits behind a narrow inspection spine but has an emergency tug exit. The public approach, maintenance lane and cargo access form three different heist possibilities. Their difficulty changes with patrol attention and the player's actions, not a scripted “choose stealth/combat” dialog.

**COUNTERSIGN** uses the existing `ship_warden` lineage, with a conspicuous interdiction yoke and asymmetric service boom. It should look heavy enough to make the player's ordinary ship feel small. Its special function is temporary control of local traffic: seize a moving hull's vector, impose a local hold, or drag a heavier target. The systems specification owns the exact rules. Asset acceptance requires a visible emitter and a readable deployed/idle state; the silhouette must not promise a giant cannon if the toy controls mass. `warden_escort` is a separate enemy identity and must not be conflated with `ship_warden`.

Garrison response is visible: alarm shutters close, ready hulls detach, a service tug abandons maintenance, civilians divert outside the fence, command craft choose lanes. Escaping changes the district to repair/search activity. A finite deployment and a bounded pursuit create a challenge a player can start for fun; an invisible infinite wave makes the base a punishment machine.

### Switchyard — a town built from routes and inconvenience

Keep Tethys Trade Hub as the main service owner and preserve the existing Split Station's two real halves. Build outward from one broad freight spine into three nonparallel streets/courts: the licensed exchange route, a slower loaded-hauler slip, and a thin service route through domestic berths that leaks toward the Quiet Cache. Avoid a perfect radial diagram. A working city accumulates around constraints. The moved domestic receiver called the Wrong Address is a real destination whose changed position the local work follows, not a second instance of either Split Station half.

Each street has a distinct terminating silhouette. The legal freight line ends at the hub's receiving face. The loaded-hauler slip points toward a large weigh cradle. The service route points toward the underside of a mismatched terrarium stack. Passenger platforms and habitat pockets sit off the streets, protected by gantries and mooring booms. A small utility square is recognizable because every delivery crosses its view, not because the map paints a square there.

Clamps align with actual pod dimensions. Cranes do not sweep through the flight lane. Queues occupy marked bays and change under disruption. A seized load may leave an empty receiver, a waiting worker, a delayed convoy and a new negotiating position. The visual sequence should be readable without opening a market panel.

**Required visible loops:** input pod arrives, clamp grips, transfer arm moves, receiving stock changes, empty carrier departs. At least one passenger service and one maintenance service continue independently. A weathered signal board shows current local operations, but route lights and hull movement carry the necessary information without relying on tiny text.

### Cathedral and Nine-Mouth Cut — two landmarks, one industrial landscape

The saved Wreck Cathedral remains its own source-backed structure and story. Nine-Mouth Cut is an ore mass nearby, not a scaled copy of `place_asteroid_seamed`. The district's relation is visual and economic: the wreck's broken ribs frame the rock's quarry mouths, and work routes carry reclaimed machinery between them.

Before freezing the rock position, deliver an authored reservation map for its shell, approaches and side exits against the existing station/gate routes and the [fixed Ceres anchors](../../../src/data/sectorAnchors.js): Second Measure at local `(-500, 1600)`, Wreck Cathedral at `(300, 2700)` and the Throughline beacon at `(3040, -920)`, expressed as `(x, z)` WU. These are existing anchors to preserve, not proposed rock origins. A large shell cannot be centered on the Cathedral merely because the catalog names it as a related landmark.

Begin with a roughly 1,800–2,600 WU long rock envelope, subject to existing reservations and measured camera reach. Its silhouette needs at least three unrelated large forms: a blunt unworked shoulder, a flat saw-cut shelf and an eroded split. The completed district has nine usable mouths: three shipping mouths and six narrower service mouths, connected through two chambers and an extraction nave. An initial three-portal route is the first implementation milestone for proving camera, collision and custody; it does not complete the nine-mouth district. Additional collapsed faces may establish history, but do not count them as usable mouths. A painted door with no depth cannot impersonate a ship-sized tunnel.

The three principal paths differ: a broad haul bore with traffic; a short narrow survey passage; a long salvage throat wide enough for a tow but interrupted by a physical obstruction. Their branches connect a sunlit working chamber with an offset pillar to a sheltered second chamber; both provide turning room. Navigation remains in XZ. Height is visual depth and camera room. There are no stacked playable floors occupying the same XZ location in this phase.

The interior should contain one workplace, one quiet shelter and one active hazard, not nine identical combat rooms. The workplace has ore faces, an extractor, a receiving bay and real output. The shelter is a pressure blister bolted into the rock, warm against cold strata. The hazard may reuse the existing machinery/force owners, but its safe window must be visible in the mechanism. A blocked return route has a towable obstruction or a second exit; loss of a mission object cannot seal the player inside forever.

### Widow's Run and Quiet Berths — the ship graveyard has addresses

Choose two or three parent wreck families and give each a directional history. The liner pieces make inhabited ribs; the ore freighter makes a cargo canyon; a corvette's separated armor makes an ambush lip. Use the existing Quiessence bodies as their current named site requires, not generic repetition throughout the district.

The main gauntlet is a dogleg, not a hallway. Each bend provides a protected observation pocket, an exposed committed crossing and a side exit. At least one bypass accepts a heavy stolen hull while a tighter route accepts the Hitch and a small load. A loose hull section can alter a route, but a single shove must not permanently block every route into town.

Quiet Berths sit in the lee of a broken liner drum, connected by utility pipes and docking bridges. Homes use repaired hull modules; illicit transfer frames sit where a lawful scan cannot directly see them. The “town square” is a protected turning space where a salvage auction, meal delivery and clandestine handoff compete for room. If a player brings military pursuit here, gates and shutters react and the inhabitants seek shelter. The town remembers damage in patched hardware and changed service behavior, not only a reputation number.

### Memorial Gardens and Greenwake — an ecology inside somebody's home

Keep the existing Charon Grave strain, existing ecology sites and their saved contamination/revelation meanings. “Greenwake” is the inhabited frontier district's local name, not a second organism. Much of the actual Charon palette may remain pale tissue and red filament; a green district name is not an instruction to tint the fungus green.

Arrange three inhabited wreck hulls as terraces around an open garden court and civic ruin, extending the existing Three Hull Garden. Surviving utility modules are threaded by fungal growth; dead handrails become roots; a cooling manifold becomes a feeding ridge. The same metal anatomy remains recognizable through infestation, so the player can infer what happened. Maintain a legible shipping path along one side and a quieter pilgrimage/service route along the other.

Use at least three distinct motion scales: slow structural breathing, medium fauna grazing/repair, rapid defensive response to a specific stimulus. Do not run every animation at the same heartbeat. Harmless resting organisms, offspring shelters and maintenance activity should be at least as memorable as attack behavior. An ecological boundary is read through tissue density, active organisms and an environmental change; a damage circle painted under a beautiful mesh is insufficient.

The player can move a heat source, shelter a service hull or damage a relay and then observe a localized response. Changes should alter a finite work route or access pocket. The entire district must not become irreversibly hostile because a stray projectile touched a leaf.

### Iron Maw — terrain made from a catastrophic history

There is existing Ashfall lore describing an Iron Maw Deep-Mother, its death, its arena signal and the growth archive behind it. The proposed reconciliation is an accreted dreadnought shell grown and bolted around that carcass. Preserve `poi_boss` as the existing ossuary/aftermath site and `poi_vault` as its archive; no resurrection or silent reassignment of those IDs. The story bible records the canon amendment.

The approach first shows a curved hull limb and a spine that continues beyond the screen. Crossing onto it replaces most sky beneath the ship with opaque physical-looking surface. The player flies **over** it, through trenches cut across it, and into a service throat; this does not require simulating a spherical planet or building a whole Death-Star-like globe.

The first playable exterior patch should offer a central armored ridge, two drainage trenches, a radiator field, an inhabited repair scar and an entrance to a maintenance nave. Its visual body continues farther than its interactive patch. Remote machinery moves slowly enough to read as enormous. Nearby conduits, scar plates and docking fittings establish familiar scale. The surface has no obvious repeating tile every two ship lengths.

Three routes are essential: an exposed fast crossing along the ridge; a slower sheltered trench; a service detour past inhabited machinery. A sweeping thermal release makes the chosen route matter. Headlights reveal real relief, cast shadow or supported occlusion, and a moving spot on the surface. Hot exhaust is readable before it becomes damaging. The interior exit looks back out onto a remembered feature of the same surface, preserving orientation.

The distant shell may be noninteractive, but its boundary must be honest. It is outside the local flight stratum, behind solid structure, or part of a clearly marked outer surface route. It cannot look touchable at the same depth and then let the player pass through a painted card.

### Fourth Toll — a place allowed to be quiet

The crystal shrine and rescue port occupy opposite lips of a shallow basin. An open circle of resonators contains the deliberately empty fourth-bell socket; a broken resonant span behind that court offers a recognizable horizon and a useful anchor. Use a small number of large, readable crystal planes; a field of identical spikes is visually loud and navigationally dull.

Approach lights make the port comprehensible from both overhead and stern views. Rescue equipment is weathered but cared for. Service craft move more slowly than Tethys freight, while the procession occupies a deliberate route with stopping places. One empty mooring is meaningful. A windless hanging ornament should not flap like cloth in atmosphere; a powered tether or acoustic actuator supplies its movement.

This is a respite district with optional physical mischief, rescue and investigation. Do not force a mandatory combat interruption into every visit. Quiet is what gives the military alarm and industrial disaster somewhere to rise from.

## 4. Large scale without a second game engine

### Four geometrical classes

Every placed structure declares one of these roles before rendering or collision work begins:

| Class | Physical meaning | Representation |
|---|---|---|
| Reachable obstacle | The player, weapons or tow can touch it. | Measured sim collision proxy, stable identity, matched visible body, damage/reaction policy. |
| Reachable machinery | It has a working state or a movable part relevant to play. | Sim-owned operation and physical envelope; renderer animates the resolved state and sockets. |
| Architectural background | Surface below/above the flight stratum or behind a physical boundary. | Opaque authored geometry with correct depth, culling and lighting; no claim that it is towable. |
| Distant context | Horizon, orbital limb, remote district or inaccessible large body. | Existing distant rendering path or a properly authored distant mesh, with parallax consistent with its distance. |

A structure may contain several classes, each in a named node group. That allows a continuous huge hull to have a small, rich interactive patch without lying about nearby solidity. It also stops every window frame becoming an entity.

### Preserve the 2.5D promise

The current sim holds all gameplay positions in the XZ plane. A tunnel is therefore a passage in that plane, with side walls and visual height, not a vertical elevator secretly implemented by teleporting the ship. A roof can be selectively hidden for overhead play. A stern camera can occupy the tunnel's free volume while the craft remains at `y = 0`.

Stacked flyable decks, arbitrary pitch/roll navigation and vertical weapons need a separate architecture project: 3D navigation, collision/query semantics, input and aim, camera, HUD, AI, mission distances, saves and existing 2D geometry must all agree. This program does not imply those features are one camera setting away. It delivers the cave/structure fantasy with continuous horizontal passages first.

### Size comes from repeated evidence

A giant body needs a long visible edge, near/far parallax, local detail at a known ship scale, shadowing, traffic of several sizes and a route that cannot reveal the whole object at once. Use the real largest accepted camera frustum when sizing the surface patch. Raising camera `far` globally is not the plan; it reduces depth precision and still leaves an empty place if the route has no purpose.

Use local chunks anchored through existing sector-global and render-frame conversions. Preserve static asset origins and explicit placement scales; do not let the ordinary “fit this model to an entity radius” path shrink a kilometre-sized terrain chunk to a normal prop. Keep low-frequency silhouette continuity between near chunks and the distant shell. Geometry that is merely far away must not repeat or drift relative to the local hull as the camera moves.

Astrophysical scale is not required for emotional scale. The Anvil already uses an authored 700 WU sphere and bounded approach bands; indiscriminately inflating it would change routes, fields and danger. Keep that site intact. New surface districts show a local region of something far larger, so they can occupy the whole screen while preserving useful travel times.

### Clearance is a gameplay specification

For each route record the admitted craft/load envelope, minimum width, turn radius, observation pocket, emergency exit and local hazard phase. Use swept capsules or measured hull proxies; a centerline through an opening proves nothing about the stern, tow line or cargo.

A useful first design estimate for the visible stopping approach is `d >= v*t_notice + v²/(2*a_brake) + margin`, using the actual handling mode and loaded craft acceleration. It is an estimate, not an invisible speed limiter. Verify with native flight. Advanced shortcuts can require skill and deliberate braking; public lanes should not surprise a beginner with an unavoidable wall just outside the camera.

Physical apertures are cut from the compound skin. Do not use the outer silhouette's convex hull for a concave ruin: it fills the holes. The collision, shot line-of-sight, Massline latch surfaces, navigation planner and camera all need to agree about the same passage. A door's visual-open state and physical-open state commit together. If the door can crush a ship, it must first telegraph, allow retreat, and resolve through the normal damage/physics owners.

## 5. Interior camera contract

**Default:** preserve the player's current overhead preference. **Optional:** “auto at structures” can reuse the existing stern rig on a supported passage. The user's wish to descend behind the ship is supported as a designed experience; it must not become a surprise control remap.

Use one presentation state machine:

| State | Entry condition | Required behavior |
|---|---|---|
| Outside | No committed passage volume. | Existing camera policy and zoom continue. |
| Approach | Ship enters a wide entrance apron and faces a supported passage. | Preload its interior, reveal the entrance geometry and any camera hint; do not change the ship's inputs. |
| Interior blend | The hull crosses the actual entrance plane inward with sufficient clearance, and auto mode is enabled. | Blend eye position around the hull using the existing polar path. Preserve aim/selection semantics and player safe frame. |
| Interior | Hull occupies the passage's navigable component. | Use an authored camera free-volume query. Keep the entry/exit and closest relevant threat or obstacle readable. |
| Exit blend | Hull crosses an outward exit plane and clears a wider release boundary. | Restore the previous player preference and zoom context smoothly. |
| Recovery | Death, load, teleport, lost host, invalid free volume or explicit camera override. | Resolve a safe overhead/cutaway pose immediately; restore controls and clear only this camera lease. |

A starting hysteresis proposal is an entrance commitment after crossing by one hull length, and exit release after crossing outward by two hull lengths. Add a short time dwell only to reject boundary chatter, never as a hidden mission requirement. Test reversed entry, sideways entry, high momentum, two adjacent portals, load while inside and backing out during the blend. Geometric passage ownership takes precedence over “nearest portal.”

**Keep camera authority separate from steering.** Do not set the saved `steeringView` preference on every portal crossing. Add a temporary presentation request with a stable owner; the player can cancel it. Free exploration cannot borrow `steerLock` as permission to override a user's explicit overhead choice. Mouse aim, controller aim and draw-path movement must remain coherent against the displayed camera projection; settings cannot silently invert yaw.

The exterior `cameraRoofAt`/glide solver solves “get above the roof.” An interior needs “remain in this free volume.” Supply a local swept eye sphere and ship-to-camera sightline against the relevant structural nodes. At blocked corners, shorten the boom or transition to overhead cutaway before forcing the camera through solid rock. Never mark the whole megastructure `clearanceExempt` merely to silence the solver.

For overhead play, author roof groups and visibility masks. A cutaway reveals the occupied chamber and its immediate exits while preserving wall thickness and adjacent solid rock. It must not reveal every secret through the asteroid. Prefer a supported clip/dither or designed cutaway over full transparent roofs that create sorting errors and hide muzzle flashes. Preserve actual projectile and collision geometry when changing visual visibility.

Reduced motion disables orbiting transition flourish and reduces shake without removing information. A fixed-heading interior/cutaway view must remain a complete way to play the district. Color changes are reinforced by shape, position and captioned/audio cues. A dangerous shutter cannot communicate exclusively through flashing red light.

## 6. Asset commission manifest

### Reuse first, deliberately

These existing IDs are integration candidates, not a claim that this branch delivered new art:

| Need | Existing candidates | Required improvement |
|---|---|---|
| Civic life | `place_habitat_pod`, `place_shuttle_dock`, `place_observation_blister`, `place_passenger_platform`, `place_utility_module` | Connected clusters, distinct entrances, job endpoints and authored signs/repair variants. |
| Freight city | `place_container_rack`, `place_freight_platform`, `place_transfer_arm`, `place_tanker_coupling`, `place_ore_sorter` | Real cargo sockets, safe moving envelopes and service lanes. |
| Garrison | `place_station_military`, `place_transponder_gate`, `place_customs_pylon`, `place_inspection_platform`, `place_sensor_mast`, `place_interdiction_buoy` | A perimeter and slips with distinct role silhouettes, not duplicate station nodes. |
| Wreck settlement | Existing liner, corvette and freighter aftermath families; `place_improvised_dock`, `place_hull_rack`, `place_illicit_transfer_frame` | Parent-fracture continuity, enclosed sheltered spaces, playable gaps and occupied repair history. |
| Industrial geography | `place_conveyor_truss`, `place_slurry_tank`, `place_radiator_bank`, `place_drill_platform`, `place_worklight_tower` | Attach to rock/hull surfaces at actual working points; tie state to the sim. |
| Named anchors | `place_landmark_candle_fleet`, `place_landmark_wreck_cathedral`, `place_landmark_resonant_cathedral`, Quiessence hulls | Preserve identity and existing uses. Add surroundings and approved components, not silent replacements. |
| Working ships | Existing haulers, service tugs, mining drones, patrols and `ship_warden` | Occupation-specific fittings and state animation; keep body/role/save identity separate. |

### New authored families

The identifiers in this table are **art commission family keys**, not registered runtime assets. The canonical planned runtime IDs are mapped in the next table and already appear with `status: planned` in [districts.json](districts.json). Keep that status until an actual artifact and its consumer are verified through the established manifest/binding pipeline. Each family needs source, release, LODs where appropriate, collision measurements and socket evidence. Do not turn a planned catalog reference into a production GLB load and rely on fallback geometry.

| Commission ID | Geometry and material direction | Sockets / motion / physical requirement | District and use |
|---|---|---|---|
| `OR-A01 civic_spine` | Branched utility beam, offset service deck, insulated conduit bundles; ivory lacquer with dark recesses and occupation-color patches. Three branch arrangements. | Habitat, power-feed and passage markers; service panels open only during an owned operation. Solid supports, open central lane. | Lantern Ward and Switchyard; makes a cluster appear built rather than scattered. |
| `OR-A02 terrarium_stack` | Three unequal glazed garden pods joined by a load-bearing spine; planting is visible as distinct broad forms, not green noise. | Two docking sockets, service hatch, shutter pivots; animated shutters and pump based on utility state. | Switchyard civic landmark and inhabited repair incentive. |
| `OR-A03 bell_berth` | A retired drive bell converted to a little berth, cut flat on one side and reinforced with patched struts. | Approach/seat/exit, power lead; compound collision follows the cavity. | Lantern Ward's recognizable small address. |
| `OR-A04 public_service_ledge` | A passenger platform with waiting canopy, handrails, emergency locker and mooring points; readable from overhead. | Shuttle berth, rescue pickup, crowd strip behind glass. Decorative people never stand in the playable flight plane. | Civilian service and rescue endpoints. |
| `OR-A05 niner_pier` | Long armored pier with three side moorings and an exposed maintenance underside; Concord paint over older seams. | Three hull clamps, launch centerlines, warning shutters; collision leaves each berth mouth empty. | Niner ready apron; the roster has somewhere to exist. |
| `OR-A06 gate_three` | Two offset inspection towers joined outside the flight aperture, with visibly retracting screening hardware. | Gate leaves, scanner origin, maintenance latch, clear escape pocket; closed/open physics states measured separately. | Public-to-restricted military threshold. |
| `OR-A07 countersign_yoke` | Warden-compatible paired mass-control arms with a broad dark gap, visibly heavy service boom and exposed coupling. | Emitter sockets, tow point, power link, deploy pivot and disabled pose; measured swept deployment envelope. | Hijackable military toy. The existing hull remains recognizable. |
| `OR-A08 weigh_cradle` | Asymmetric suspended balance with one occupied and one empty side, thick anchors and readable central receiver. | Load seat, release clamp, arm pivots, operator station; no fake load mass from render oscillation. | Switchyard's central landmark and cargo conflict. |
| `OR-A09 nine_mouth_shell` | Unworked shoulder, quarry shelf and split stone ridge; three major shell chunks and a distant continuation. Strata run through cuts. | Named entry frames; no single convex collision around the whole rock. Explicit origin and scale. | The large hollow asteroid. |
| `OR-A10 quarry_bore_kit` | Straight bore, dogleg, fork, chamber and collapsed face; tool-cut sections contrast with natural faults. | Portal entry/exit planes, camera free volumes, roof groups, rock faces, anchor points; measured interiors. | Three connected initial routes in Nine-Mouth Cut. |
| `OR-A11 chamber_workface` | Extractor and ore face set into stone, storage cradle off the haul line, warm pressure blister on a ledge. | Cut face, cargo receiver, tool pivots, shelter dock; work animation follows extraction/custody. | Interior workplace and a reason to return. |
| `OR-A12 widow_keel_arch` | Two related broken liner ribs with a missing span; one arch carries patched habitat pods. | Mooring/tow point, detachable obstruction and lane envelope. Separate permanent load-bearing shell from movable wreck piece. | Widow's Run's opening sightline. |
| `OR-A13 quiet_berth_cluster` | Three salvaged cabins tied to a liner drum by utility rails; one recessed illicit transfer cradle. | Door/shutter poses, physical receiver, service dock; shutters respond to district alert state. | Quiet Berths town and pursuit shelter. |
| `OR-A14 wreck_swing_section` | A cut freighter hopper or corvette armor piece from an existing parent family, with attachment scars and one obvious tow lug. | Dynamic body, contact material, Massline point; no scripted world-position animation while moving. | Gauntlet route alteration and improvised weapon. |
| `OR-A15 greenwake_rooted_ruin` | A civic machinery shell whose original structure remains legible under calcified collars and branching tissue. | Growth sockets, maintenance inlet, finite salvage node and route boundary; color follows Charon lineage. | Infested frontier with recognizable past use. |
| `OR-A16 ecology_bridge_kit` | Three tissue forms: rooted seam, tensioned bridge and feeding collar. Pale tissue/red filament, irregular rhythm. | Attach to actual surface anchors; operation-driven opening/closing; broad collision consistent with visible aperture. | Greenwake routes and ecological reactions. |
| `OR-A17 shade_sail_rig` | Rigid segmented radiator/shade device with repaired actuator and offset control housing. | Hinge, power point, shade/heat receiver volume; physical damage disables actual function. | A nonviolent ecological tool and local work loop. |
| `OR-A18 maw_surface_kit` | Hull plates, broad scar seam, trench wall, ridge, radiator bed and accreted bone/metal transition. Seven historical paint fragments appear in large designed patches. | Chunk origins, seam joins, service nodes, roof groups; far shell has compatible silhouette. | Ground-like megastructure geography. |
| `OR-A19 maw_service_throat` | A mouth cut through armored plates into a maintenance nave; bolted machinery overlaps calcified Deep-Mother tissue. | Exterior/interior portals, camera volumes, pressure gates, two exits. | Seamless surface-to-interior flight without changing physics plane. |
| `OR-A20 maw_pressure_engine` | A large pumping assembly whose pistons, reservoir and exhaust physically explain the dangerous cycle. | Intake, valve, receiver and release direction; warning/surge/calm poses read from one sim clock. | Route hazard that can be manipulated. |
| `OR-A21 fourth_toll_span` | An asymmetric broken crystalline span held by a maintained mechanical cradle; two missing structural masses frame the separate four-position bell court. | Rescue anchor, resonator seat, striking/signal element; shard geometry must not hide invisible walls. | Quiet landmark, repair puzzle and rescue navigation. |
| `OR-A22 locality_marks` | An authored shared atlas of berth plates, service insignia, wall repairs, locally meaningful numbers and honest wear. No generated nonsense lettering. | Set readable words through approved type/stencil paths; marks anchor to real surfaces and semantic states. | Differentiation and history across all districts. |
| `OR-A23 human_work_kit` | A shared small rig family for civilian workwear, inspection clothing and tethered EVA equipment; readable grouped poses at true human-to-ship scale. | Carry, inspect, weld, wait, gather and assist clips; tool/hand and service-tether sockets; attach to a real deck or gallery. Background figures have no false collision/interaction promise. | Visible citizens at berths, workshops and memorials, plus properly owned rescue subjects. |

The table is twenty-three **families**, not twenty-three arbitrary single meshes. A family may contain several modular pieces, and a hero assembly may combine multiple families. Estimate the actual authoring burden from variants, sockets, collision, LODs, animations and verification—not by counting filenames.

### Canonical model IDs and assembly crosswalk

The catalog has **15 planned runtime asset IDs**. They are the authoritative names for the initial district model commissions; the `OR-A` keys explain reusable component work. A family used in several assemblies should share materials and compatible parts, not spawn another independent gameplay entity in every assembly. `OR-A22` locality marks and `OR-A23` human work are shared finishing/presentation dependencies across inhabited assemblies. Support families such as the pressure engine can be delivered as named children of the relevant assembly before a separate public asset identity is justified.

The dimensions below are **proposed layout envelopes**, not published model measurements. Use `S` as defined in section 3 for the route's admitted craft/load width; a ship uses the measured full envelope of its chosen hull instead. Measure the actual built artifact, settle the physical reservation against existing anchors, and record the accepted WU dimensions before release. Art cannot stretch the opening after the collision test while retaining the old acceptance receipt.

| Canonical planned runtime ID | Commission families | Required assembly and first layout envelope |
|---|---|---|
| `place_lw_lantern_cradle` | `OR-A01`, `OR-A03`, `OR-A04` fittings | An open two-prong holder framing the missing family lamp, not a second memorial. Keep its outer hardware approximately 2–3 S across, a 2 S service approach and a 4 S turning pocket. The absent lamp must be legible from promenade, service cut and freight bypass. |
| `ship_lw_countersign` | Existing `ship_warden` plus `OR-A07` | Recognizable Warden hull with two mass-control clamp arms, screening hardware and exposed service coupling. Scale the fittings to the actual hull/socket measurements; do not globally enlarge the hull to fake authority. Publish separate folded, working and damaged swept envelopes. |
| `place_lw_niner_hangar` | `OR-A05`, `OR-A06`, `OR-A04` | Open-front armored court containing visible roster berths; roof panels have authored cutaway groups. Begin with a 6–8 S convoy mouth, two separate 3 S maintenance cuts and turning room for COUNTERSIGN in its folded state. Its deployed yoke must never accidentally make the required escape impossible. |
| `place_lw_switchyard_truss` | `OR-A01`, `OR-A08`, `OR-A04` | A freight-priority branching rail/truss system, rather than a circle of isolated sheds. Start with a 6–8 S main spine, 3–4 S loaded feeder and 2–3 S service alley; large cargo receives its own accepted envelope. Side courts admit turning without obstructing the main crossing. |
| `ship_lw_impulse_shunter` | New hull fittings compatible with `OR-A01` and existing tow craft | A low, wide work hull with two unmistakable couplers, an exposed forward impulse shoe and protected operator blister. Target a body roughly one to one-and-a-half relevant tug lengths; the actual loaded train determines route width and braking space. It moves real coupled loads. |
| `place_lw_nine_mouth_shell` | `OR-A09`, `OR-A10`, `OR-A11` | The 1,800–2,600 WU trial rock envelope, adjusted against reservations, with nine real mouths in the completed district. Shipping passages begin around 4–6 S, service passages around 1.6–2.2 S for their explicitly admitted small craft. The two chambers need turning pockets, not merely intersections of centerlines. |
| `place_lw_quarry_bell` | `OR-A11` attachment vocabulary, bespoke resonator | A heavy work resonator on a constrained suspension beside the extraction nave. A roughly 2–3 S frame must leave both its maximum moving envelope and a safe ship approach out of the through-lane. Its size/strain communicates quarry work, distinct from Phoebe's ceremonial court. |
| `place_lw_ferry_habitat` | Existing liner fracture lineage plus `OR-A12`, `OR-A13`, `OR-A02` | An identifiable ferry prow and inhabited inner court, on the order of 12–18 S long with a 4–5 S turning basin. An upside-down planted window is a landmark. Exterior scrap may detach; the inhabited core has an explicit structural/damage policy, not arbitrary invulnerability inferred from warm lights. |
| `place_lw_wreck_throat` | `OR-A12`, `OR-A14` | Three distinct broken-hull portals belonging to related parent wrecks. Begin with 4–6 S licensed passage, 2–3 S tow route and 1.5–2 S advanced small-craft cut; each definition states its admitted load. Provide passing alcoves and a retreat pocket before the narrowest commitment. |
| `place_lw_greenwake_bridge` | `OR-A15`, `OR-A16`, `OR-A17` | Rooted membrane spans tying existing hulls to the garden court. Each passable tissue tunnel exposes roughly 2.5–4 S useful opening for its accepted craft. Five persistent ecology-stage variants preserve anchor identity; growth or cutting changes the real aperture through one operation owner. |
| `place_lw_greenhouse_hull` | Existing derelict pod/cargo hull plus `OR-A02`, `OR-A15`, `OR-A04` | An occupied warm greenhouse court inside a broken cargo hull, approximately 8–12 S across, with visible shutters and a 3 S rescue/service mouth. Plants, workers and pale/red Charon tissue remain distinct at gameplay distance. No green filter standing in for authored ecology. |
| `place_lw_maw_surface` | `OR-A18`, `OR-A20` | A kit of macro ribs, radiator beds, armor scars, pressure machinery and traversable trenches. Size the visible patch from the largest supported gameplay frustum; author local chunk joins and distant continuation together. First trench width 3–5 S, exposed ridge route 6–8 S; material tiling cannot replace relief. |
| `place_lw_maw_relief_court` | `OR-A19`, `OR-A04`, `OR-A02` | An inhabited negative space in the industrial keel: shelter, shuttered workshops, repair berth and two evacuation routes. Begin with a 6 S turning court and two independent 3 S exits. The service throat returns to this same exterior region; the Deep-Mother chamber remains its separate saved site. |
| `place_lw_maw_crane` | `OR-A18` / `OR-A20` machinery language, bespoke articulated rig | A rooted heavy lift rig with slew, boom, hook and emergency brake visible from the flight lane. Reach about 4–8 S across an off-lane work pocket; record maximum swept volume for every part and suspended load. A parked boom cannot occupy the mandatory evacuation path. |
| `place_lw_fourth_toll_berth` | `OR-A21`, `OR-A04`, existing observation blister | A sparse four-position bell court around one deliberately empty socket, with an adjacent warm refuge and active repair berth. A starting 10–16 S court supports quiet coasting; leave a 3 S rescue approach. The broken span is background orientation, not an extra missing-bell quest. |

These values are a design starting point for a coherent first composition. They are not licenses to scale all reused props independently until the layout fits. Human decks, cargo clamps and docking fixtures retain compatible dimensions. If the accepted craft cannot safely turn, alter the route and reservation or explicitly restrict the shortcut; never make the visible ship smaller than its collision as a fix.

### Assembly-specific state and socket briefs

The socket names below are **proposed semantic names** to resolve through the existing asset binding pipeline; they are not claims of currently exported nodes. Add exact accepted transforms to the relevant binding and verify them with the ordinary runtime mount.

- **Lantern cradle:** provide `lamp_seat`, `lamp_retain_left`, `lamp_retain_right`, `service_approach`, `service_power` and an empty-state silhouette that reads without text. Separate lamp payload from holder. Powered/empty/damaged/repair poses derive from the same holder/cargo state; a flickering material cannot imply that a real missing lamp has returned.
- **COUNTERSIGN and its hangar:** provide left/right clamp pivots, `screen_origin`, `service_coupling`, `tow_point` and hull-specific berth/launch transforms. The screen is a finite sim ability; hull motion and field VFX do not author its duration. Hangar berth identity names the actual roster hull, including after theft or destruction. A repair/launch animation cannot resurrect that identity.
- **Impulse shunter:** provide `coupler_front`, `coupler_rear`, `impulse_shoe`, `operator_view` and folded/loaded/emergency-stop poses. The shoe visibly compresses and releases when the resolved impulse is delivered. Coupler latches track actual attachment state, and the load remains under native mass, tow and collision rules. The tram-like appearance does not justify a rail-path teleport or nonphysical train.
- **Quarry bell:** provide `suspension_root`, `bell_pivot`, `strike_face`, `strain_pickup`, `service_latch` and `safe_approach`. Define working and maximum travel angles and visible warning before a dangerous swing. Audio/strain feedback follows contact or the authoritative quarry mechanism. Repeated rendered ringing cannot mint resources or continually restart the same discovery.
- **Ferry and greenhouse habitats:** mark inhabited-core, exterior salvage, glazing, shutter and roof nodes separately. Provide real passenger/rescue receivers, utility inlets and evacuation approaches. A home is not a loot crate disguised by a warm window. Destruction behavior is a deliberate district rule with visible consequences; art agents must not silently make domestic pods either disposable pickup debris or immortal obstacles.
- **Greenwake bridge:** keep stable root anchors across the five accepted variants; separate visual stage from revealed player knowledge. Record each stage's aperture and removable tissue ownership. Cutting must not alter global infection simply because the render swaps a mesh. Retain safe approach/exit space while a stage operation commits and while a carried load occupies the gap.
- **Maw crane and relief court:** provide `root`, `slew`, `boom`, `hook`, `brake`, `load_seat`, shelter receiver, two evacuation mouths and repair approach. All moving collision follows the sim-owned mechanism. The renderer can smooth its pose but may not sweep the visible hook through a stationary physical proxy. Camera cutaway reveals the crane's actual load and exits, not a conveniently empty interior.
- **Fourth Toll berth:** distinguish `bell_slot_1` through `bell_slot_4`, `repair_seat`, `listen_approach` and `rescue_anchor`; slot 4 begins empty where the canonical story requires it. Preserve the existing Echo Shrine, Struck Bell and BELLHOP object/custody identities. A returned bell populates the real slot; revisiting the district cannot spawn a decorative duplicate beside the player's carried original.

### Contract attached to every asset delivery

Follow [Forge](../../../tools/blender/forge/FORGE.md) and the existing [Graphics Program](../GRAPHICS_PROGRAM.md). Use its shared surface vocabulary and publishing route. Forge's authoring axes are +X nose, +Y port, +Z up; the runtime gameplay plane is XZ with +Y up. Use the established export/mount transform and compare measured socket world positions. Do not hand-swap axes in several consumers.

Every commission returns:

- Editable source and reproducible build recipe, licensed dependencies where any are used, source and release hashes, and a named manifest entry.
- Exact dimensions at authoring scale and resolved runtime scale; origin, pivot and attachment meaning; no unrecorded centering or normalization.
- Named semantic sockets with a small transform fixture proving they land on visible geometry after placement, rotation, scaling and frame-origin changes.
- Separate nodes for static shell, movable machinery, removable payload, roof/camera treatment and distant continuation where needed.
- A measured physical skin preserving all advertised holes. Provide closed, open and damaged envelopes for relevant moving mechanisms; mark decorative recesses as decorative.
- LODs that preserve silhouette, entrance width and actionable parts. A distant LOD may simplify rivets; it cannot replace a tunnel mouth with a sealed rock.
- State poses/clips: normal, working, interrupted, damaged and repaired where the object promises them. The runtime owns phase and consequence; animation never grants cargo or opens a collider on its own.
- In-engine inspection at ordinary gameplay and close views, plus overhead and stern traversal when relevant. A Blender beauty render is useful art evidence but does not establish gameplay readability.
- A short integration receipt naming the production placement, successful authored-load diagnostics and the source of each interaction. “Exists in assets” is not delivery.

For main structures, include an occupancy sheet: free flight volumes, forbidden solid volumes, launch paths, turning pockets and expected camera regions. For moving machinery, include the maximum swept volume. These are game-design assets, not optional technical appendices.

## 7. Streaming, light and performance

### Residency follows the player's possible next action

Use the existing sector residency and prepared-asset path. Add district-level grouping only where needed by the local content owner; do not create a second global streamer. From the entrance apron, preload the next visible chamber, its collision, its essential interaction models and the exit context. Precompile its material/light combinations before the player commits. Maintain the previous chamber until the ship, cargo, pursuit and camera have cleared it.

Prioritize actionable silhouettes and physical continuity. If an authored body is not ready, keep the route safely outside an already-visible structure and show an honest short transition only where the design supports it. Never allow the player to hit invisible collision, fall through unloaded ground or fly past an invisible hero model. Do not quietly lower permanent default quality to make a gate pass.

Reserve identities separately from active simulation. Unseen garrison reserves can have coarse work state, but a visible launch promotes the same hull. A far district's population does not all require 60 Hz tactical AI. Conversely, a nearby interactable hauler cannot be replaced by a nonphysical decorative twin just because the camera turns away. Cargo custody, destruction and damaged-route state survive residency transitions.

### Light must reveal the new architecture

Surface districts exist partly to let real lights land on something. Use shared moods and stable pooled lights. Allocate the player's headlight, nearest important worklight and high-salience event through their proper owners. Far windows and indicators can be emissive without casting a light each. A worklight needs a readable fixture; its illumination must touch the work face.

New terrain must receive the relevant shared material treatment and shadows/occlusion. Avoid bright ambient fill that erases the distinction between the lit work face and the dark route beside it. Preserve warm inhabited pockets against cold machinery and tissue. In a dense interior, reduce bloom contribution from signal surfaces through the existing look contract so functional lamps do not wash out the opening.

No new district gets its own renderer-wide lighting override. If NOCTURNE or another lighting branch lands after this source pin, integrate through its established allocation interface. This plan does not fork or assume unmerged lighting work.

### Initial engineering alarms, not quality ceilings

No district measurements were taken for this document. These are initial investigation thresholds to be replaced by a recorded baseline and exact target-hardware evidence:

| Measurement | Initial district-local alarm | What to change first |
|---|---|---|
| Additional CPU work at normal traversal | More than 1 ms p95 over the matching current scene | Cadence, cached queries, spatial partition and avoiding per-frame traversal/allocation. |
| Additional GPU work | More than 2 ms p95 over the same route and resolution | Batching, screen-size LOD, overdraw, material variants, shadow allocation and hidden interior culling. |
| Full tactical participants | More than roughly 16–24 nearby simultaneously without a measured budget | Activation by range/intent, standing physical reserves, staggered decision cadence; preserve the visible garrison. |
| Structural runtime growth after repeated visits | Any monotonic retained-body/material/listener growth | Lifecycle, stable identity reuse, async cancellation and shared-resource disposal. |
| Entrance hitch or asset pop | Any interactive obstacle visible in physics before its model, or obvious shader hitch during the committed turn | Earlier prediction/prewarm, finite admission batches, dependency ordering; not hiding the obstacle. |
| Asset memory | A new district consumes its entire working set even when only one chamber is visible | Chunk residency, shared materials/textures and dropping retired hidden rooms; measure actual decoded/GPU memory. |

The total game still has to meet its frame-time target. A 1 ms addition is not free if the baseline already consumes the frame. Draw-call and triangle limits are scene-dependent, so this document intentionally does not give agents a universal “20,000 triangles means accepted” rule. A fixed screenshot also cannot expose a residency hitch; traverse, return, and trigger the worst relevant local disturbance.

## 8. Implementation order and acceptance scenes

Use the main [program plan](README.md) for task ordering. The environmental dependency chain is:

1. Compose Lantern Ward and a small Switchyard street using existing released assets, real work endpoints and current collision. This proves city composition without waiting on the hero art.
2. Complete Niner's perimeter, finite physical roster and COUNTERSIGN loop. Its courtyard validates dense actors, law readability and active/inactive transitions.
3. Complete one playable Nine-Mouth route with two exits, a useful interior action and both camera preferences. Prove it with actual craft and a carried load before multiplying passages.
4. Extend Widow's Run with the same corridor and physical-obstruction vocabulary, then Greenwake with the existing ecological owner.
5. Build Iron Maw's playable surface patch and service throat from the now-proven structure/camera contracts. Deliver distant scale with a local route the player can actually influence.
6. Add Fourth Toll as the tonal counterweight and expand successful modular families. Do not treat “more sectors” as a substitute for unresolved life in the first street.

Every environment packet delivers a production route, physical ownership, animation state bindings and a revisit consequence together. A packet that delivers only a model and then leaves “wire the gameplay later” has not completed the environment task. An art-only commission is narrower: its integration owner and exact remaining consumer must be named in the handoff.

### Required agent-run observations

| Scene | Acceptance observation | Failure the observation must expose |
|---|---|---|
| Arrive at Lantern Ward with no mission accepted | Within one short watch, a service job has a visible source, action and destination; the player can interrupt it and see the correct response. | Decorative orbiting NPCs masquerading as a working town. |
| Follow a Switchyard load | The same cargo reaches its receiver, or survives as a recoverable interrupted load; queue and machinery reflect custody. | Cargo vanishing/reappearing or a crane cycling against an empty berth. |
| Enter Niner, leave, then deliberately attack | Public/restricted boundaries are readable; actual roster hulls launch; civilian diversion and finite response appear; a return shows aftermath. | Infinite anonymous spawns, immediate unjustified hostility, no believable standing army. |
| Enter Nine-Mouth at speed and reverse out mid-transition | The camera remains outside solids, control meaning does not change, and the ship/tow can exit. | Portal jitter, roof ejection, input inversion, hidden keep-out spheres or trapped save state. |
| Fly the same tunnel overhead and stern | Both views expose obstacles and interactable parts, and aim/projectile paths agree with geometry. | A route that is playable only through a photographic camera trick. |
| Tow a wreck section through Widow's Run under pursuit | Real swept clearance, line-of-sight and shared physics determine outcomes; blocked routes have usable alternatives. | Cinematic-only collision, tow clipping, one movable object sealing the whole town. |
| Disturb and then repair Greenwake's local service edge | Specific organism/service reactions follow confirmed causes; the saved return preserves the local change. | Generic enemy aggro, a second infection ledger, an irreversible global punishment for a small accident. |
| Cross Iron Maw without looking at the map | Surface dominates the frame; two remembered landmarks support navigation; the headlight strikes actual relief; a service entrance returns to the same exterior. | A small toy planet, tiled wallpaper, fake beam light, an unrelated interior minigame. |
| Visit Fourth Toll without accepting work | A complete quiet scene continues; rescue or mischief is available but not forced. | Every location becoming the same encounter scheduler with different paint. |
| Repeat district enter/exit, save/load and interruption | Stable identities, cargo, damage, camera preference and resources recover without duplicates or growth. | Respawn exploits, lost stolen craft, permanent forced camera, memory leaks. |

Use native flight and normal player actions for the final route. A direct state mutation can test a bounded invariant but is not evidence that a pilot can reach the result. Preserve the relevant player-truth route evidence and report unmeasured parts honestly. Performance captures belong to the repository's designated quiet-host workflow; absence of that machine does not excuse failing to implement the scene or to run focused deterministic checks.

## 9. Directions an agent must not misread

**“Make a city” does not mean add buildings in a circle.** Place destinations, connect them, give activity a reason, create safe and illicit routes, and make an interruption observable.

**“Make it huge” does not mean multiply a radius.** Establish local scale cues, a horizon, occlusion, a path across the structure and bounded rendering. Preserve the existing planet/site physical rules unless the packet deliberately changes them.

**“Make it alive” does not mean animate everything continuously.** Rest, waiting, broken machinery, hesitation and resumption communicate purpose. A permanently spinning wrench explains nothing.

**“Make it mature” does not mean cover it in rust and profanity.** Material history, social contradictions, work, care and consequence provide maturity; violence and jokes gain force from that context.

**“Let me go inside” does not mean create a separate arcade screen.** Preserve the player's craft, load, damage, pursuit, position continuity and route out. The camera is a view of the same physical situation.

**“Reuse assets” does not mean use one station model as every landmark.** Reuse structural vocabulary and fittings, while hero silhouette, route topology and local work remain distinct. One new giant hull plus seven familiar crates will not carry eight different places.

**“Agents will finish the models” does not mean assets can be unspecified.** The source/release contract, dimensions, sockets, moving envelopes, gameplay use and acceptance route are part of each commission. If any is missing, finish the brief before asking the art agent to guess.
