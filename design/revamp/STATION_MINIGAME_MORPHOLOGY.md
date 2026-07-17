# Station Minigame Morphology

Status: design exploration, not an aesthetic contract.
Purpose: prevent another implementation from beginning with a web-page skeleton and decorating it.

## The problem being solved

The station is not navigation between reports. It is the strategic half of SpaceFace: the place where
the player turns flight results into a changed ship, changed cargo, changed relationships, changed
routes, and a changed plan.

The interaction sentence is therefore:

> Select an object -> reveal its relationships -> manipulate the model -> preview consequences ->
> commit -> watch the connected systems settle.

Any design that instead begins with `choose page -> read -> press button` is rejected, even if the
page contains attractive charts, motion, gradients, or holographic styling.

This document evaluates **72 representation systems across all seven station contexts**. That is 504
screen/representation evaluations before selecting a direction. The matrix is deliberately broader
than a component inventory: it includes world metaphors, spatial models, simulation instruments,
motion continuity, physical feedback, narrative embodiment, and accessible equivalents.

## Player reasoning by station context

| Context | What the player is actually reasoning about | Primary manipulable object | Consequence that must be previewable |
|---|---|---|---|
| Arrival / operations | What changed in flight, what needs attention, and what to do before departing | docked ship + station connections | credits, readiness, risk, cargo pressure, next opportunity |
| Shipworks | What this ship can become and which constraint is worth trading | physical hull, hardpoint, subsystem, candidate part | power, heat, mass, capacity, role, cost, compatibility |
| Market | What cargo should move, why the price matters, and where value can be created | owned cargo, commodity, quantity, route, time range | cash, hold usage, cost basis, route profit, demand response |
| Industry | What output to pursue and which upstream shortage blocks it | desired output, dependency path, batch, production order | consumed inputs, time, cost, unlocked hull/module options |
| Contracts | Which opportunity fits this ship, route, appetite for risk, and faction plan | route-shaped contract, preparation gate, stage | reward, travel, fit readiness, cargo need, standing, risk |
| Factions | Who controls this place, how relationships constrain action, and how to move them | authority, relationship, tier threshold, recent action | access, prices, scans, contracts, hostility buffer, unlocks |
| Bar / contacts | Who knows something useful, what information is credible, and whether to act on it | person, signal, lead, rumor, survey | revealed route, contract, wreck, faction consequence, cost |

## Evaluation key

- `P` — primary representation: the context could be built around it.
- `S` — strong supporting representation.
- `A` — accent or short-lived feedback only.
- `X` — misleading, wasteful, or thematically wrong for that context.

Columns: `O` operations, `S` Shipworks, `M` Market, `I` Industry, `C` Contracts,
`F` Factions, `B` Bar/contacts.

## Morphology matrix: 72 representation systems x 7 contexts

### A. World and workspace metaphors

| # | Representation system | What operating it feels like | O | S | M | I | C | F | B |
|---:|---|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| 01 | Persistent authored docking bay | The ship remains physically berthed while real station machinery and projections reconfigure around it | P | P | S | S | S | S | S |
| 02 | Live station digital twin | A spatial holographic model exposes traffic, authority, fabrication, contacts, and systems as layers of one place | P | S | P | P | P | P | S |
| 03 | Orbital service crown | Station functions occupy a curved field around the ship; proximity produces magnetic focus and selection changes the world behind the crown | P | S | S | S | S | S | S |
| 04 | Station cutaway | The player zooms into functional bays in a sectional station model instead of opening destinations | P | S | S | P | S | P | P |
| 05 | Transit spine | Services are locations along one luminous station artery; changing mode is a short camera translation through a continuous place | P | S | S | S | S | S | P |
| 06 | Docking gantry theatre | Movable work arms, scanners, cargo cranes, and projector rigs become the controls and status displays | P | P | S | P | A | A | X |
| 07 | Captain's holotable | A physical table projects a different manipulable world model for each activity | S | S | P | P | P | P | S |
| 08 | Fold-out instrument reliquary | A compact physical console mechanically unfolds only the instruments required by the selected task | S | S | S | S | S | S | S |
| 09 | Station circulatory system | Cargo, power, people, influence, and contracts flow through one living network; selecting a flow reveals causes and destinations | S | S | P | P | P | P | S |
| 10 | Working warehouse | Actual cargo volumes, racks, cranes, and loading gates embody inventory and trade | S | A | P | P | S | X | A |
| 11 | Map room / astrogation chamber | Space, routes, jurisdictions, prices, and missions are manipulated on a deep spatial chart | S | X | P | S | P | P | S |
| 12 | Social concourse diorama | People, counters, doors, and physical artifacts represent contacts and services in a compact living station slice | S | X | A | X | S | S | P |

### B. Object-centric spatial representations

| # | Representation system | What operating it feels like | O | S | M | I | C | F | B |
|---:|---|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| 13 | Ship as invariant anchor | The current ship never disappears; every station decision is visibly related back to it | P | P | S | S | P | S | A |
| 14 | Exploded assembly | Layers separate to reveal internal bays, systems, or production stages without changing screens | A | P | A | P | S | X | X |
| 15 | Projected hardpoint constellation | Named interactive nodes sit on actual 3D slot positions and inherit camera occlusion/depth | A | P | X | X | S | X | X |
| 16 | Sectional scan mask | A movable scan plane reveals hidden modules, cargo, station conduits, or jurisdiction beneath a surface | S | P | S | S | S | S | A |
| 17 | Orbiting subsystem ring | A controlled ring expresses system topology and snaps selected items back to physical locations | S | P | S | S | S | S | A |
| 18 | Spatial cargo hold | Cargo occupies visible capacity; selection is of carried objects, not rows containing quantities | P | S | P | S | P | X | A |
| 19 | Service umbilicals | Repair, fuel, resupply, data, cargo, and power attach as visible connections to the ship | P | P | S | S | S | A | X |
| 20 | Direct camera manipulation | Drag/zoom/focus changes what can be operated and which information layer is visible | S | P | S | S | P | P | S |
| 21 | Ghost replacement | A proposed ship, module, cargo allocation, recipe, route, or relationship outcome overlays current truth | S | P | P | P | P | P | S |
| 22 | Before/after spatial scrub | A drag or held control moves continuously between current and proposed world states | A | P | P | S | P | S | A |
| 23 | Thermal tomography | Heat is a spatial volume on ship, foundry, cargo, route danger, or political pressure | S | P | A | P | S | A | X |
| 24 | Mass / balance plane | Weight, hold pressure, throughput, reward, and influence deform a common equilibrium surface | S | P | P | S | P | P | X |

### C. Flow, topology, and relationship representations

| # | Representation system | What operating it feels like | O | S | M | I | C | F | B |
|---:|---|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| 25 | Power capillaries | Routed light width and strain show real capacity flowing to dependent systems | S | P | X | P | S | S | X |
| 26 | Material Sankey river | Path width is actual material/value movement; branching is the strategic decision | S | S | P | P | S | S | X |
| 27 | Recipe conveyor | Inputs physically advance through operations into an output; batch length and interruptions are manipulable | A | A | S | P | S | X | X |
| 28 | Dependency loom | Selecting an output weaves only the upstream resources, research, reputation, and facilities that make it possible | S | S | S | P | P | S | A |
| 29 | Broken-chain path | A shortage or lock interrupts the exact route; touching the break offers the correct acquisition path | S | S | S | P | P | P | S |
| 30 | Order-book canyon | Buy and sell pressure form two opposed spatial walls; the spread is the navigable gap | X | X | P | A | X | X | X |
| 31 | Commodity orbital system | Commodity families orbit a market center; radius, velocity, and brightness encode price, volatility, and ownership | A | X | P | S | S | X | X |
| 32 | Price weather / terrain | Price, demand, and uncertainty form a brushable contour field with storms caused by world events | A | X | P | S | S | S | A |
| 33 | Route-profit star chart | Known stations and routes become a field where distance, margin, risk, cargo, and stale intel are simultaneously legible | S | X | P | S | P | S | S |
| 34 | Cargo packing surface | The hold becomes a capacity puzzle where trade allocations physically claim mass/volume | S | S | P | S | P | X | X |
| 35 | Faction gravity wells | Influence, hostility, and alliance bend routes and access around political bodies | S | X | S | S | P | P | S |
| 36 | Relationship constellation | Links encode alliance, rivalry, control, obligation, and information provenance | S | X | S | S | P | P | P |
| 37 | Territory tessellation | Regions deform as control changes; selecting a cell reveals the authority and gameplay rules acting there | S | X | S | S | P | P | S |
| 38 | Standing lock mechanism | Reputation thresholds are physical permissions that open equipment, prices, routes, or contract gates | S | S | S | S | P | P | S |
| 39 | Contract route volume | A contract is primarily its three-dimensional path, stages, threats, cargo and destination—not a text card | S | S | S | S | P | S | P |
| 40 | Mission branching circuit | Optional objectives and failure paths are electrically or mechanically connected to the main route | A | S | S | S | P | S | P |

### D. Time, simulation, and control representations

| # | Representation system | What operating it feels like | O | S | M | I | C | F | B |
|---:|---|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| 41 | Operational timeline | Past causes, current action, queued work, and predicted completion occupy one manipulable sequence | S | S | P | P | P | P | S |
| 42 | Time scrub | Dragging time replays market movement, faction change, production, route stages, or ship-fit consequences | A | S | P | P | P | P | S |
| 43 | Allocation dial | A constrained physical dial allocates cargo, batch, power, repair depth, or acceptable risk while previewing results | S | P | P | P | P | S | S |
| 44 | Coupled balance controls | Moving one allocation visibly displaces competing resources instead of editing independent sliders | S | P | P | P | P | P | X |
| 45 | Batch / quantity geometry | Number is expressed as occupied bays, conveyor length, cargo units, or repeated route markers | S | S | P | P | P | X | A |
| 46 | Scenario ghosts | Several possible futures coexist translucently until the player chooses one | S | P | P | P | P | P | S |
| 47 | Risk/reward terrain | The player moves a selector through a landscape where reward, danger, time, fit, and standing change continuously | S | S | P | S | P | P | S |
| 48 | Readiness circuit | Departure requirements are a circuit that closes only when fuel, hull, cargo, mission, and risk states are acceptable | P | S | A | A | P | A | X |

### E. Motion, continuity, and causal feedback

| # | Representation system | What operating it feels like | O | S | M | I | C | F | B |
|---:|---|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| 49 | Shared-object transformation | The selected ship, cargo, route, crest, or contact survives and physically becomes the deeper state | P | P | P | P | P | P | P |
| 50 | Morphing workspace architecture | Gantries, projection planes, light fields, and camera framing reconfigure around the task rather than swapping pages | P | P | P | P | P | P | P |
| 51 | Aperture / shutter transition | A mechanical or projected mask reveals a deeper layer with clear spatial continuity | S | S | S | S | S | S | S |
| 52 | Kinetic magnetic command crown | Neighbor response follows pointer/focus distance; selected returns to equilibrium under a stable latch | P | S | S | S | S | S | S |
| 53 | Focus lens | The question and its evidence are enlarged or clarified at the exact spatial point of inquiry | S | P | P | P | P | P | P |
| 54 | Semantic zoom | Scale changes information meaning: station -> bay -> object -> subsystem -> history | P | P | P | P | P | P | P |
| 55 | Anchored tool tray | Compatible actions and evidence unfold from the object that caused them, then collapse back into it | S | P | P | P | P | P | P |
| 56 | Spatial radial command | A short action set appears around a ship slot, cargo object, route node, or person | S | P | S | S | S | S | S |
| 57 | State-machine control | Controls visibly move through rest, quote, armed, processing, settled, and fault states | P | P | P | P | P | P | P |
| 58 | Causal travel animation | Parts, cargo, power, contracts, reputation, and data visibly travel from source to affected destination | S | P | P | P | P | P | P |
| 59 | Local action receipt | Only the changed consequences settle beside the affected object, with undo when truthful | P | P | P | P | P | P | P |
| 60 | One-shot system response | A brief ripple, route trace, border run, light change, or sound answers an actual state change and then stops | P | P | P | P | P | P | P |

### F. Information acquisition, identity, social presence, and access

| # | Representation system | What operating it feels like | O | S | M | I | C | F | B |
|---:|---|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| 61 | Docking acquisition handshake | Station, ship, cargo, services, and authority resolve in a terse one-shot diagnostic on arrival | P | A | A | A | A | A | A |
| 62 | Signal decryption / resolution | Unknown information becomes legible through standing, purchase, scan, rumor, or inspection | S | A | P | S | P | P | P |
| 63 | Dynamic institutional wayfinding | The station's faction, purpose, restrictions, and service state alter meaningful projected signage | P | S | S | S | S | P | S |
| 64 | Environmental narrative artifacts | Graffiti, stamps, invoices, manifests, warnings, and personal traces live on physical surfaces, never in operational boxes | S | S | S | S | S | S | P |
| 65 | Contact transmission stage | A person occupies an authored audiovisual channel with body language, signal quality, and contextual props | A | X | A | A | P | P | P |
| 66 | Reputation embodied in access | Lighting, greeting, clearance geometry, prices, guards, and available tools change with standing | P | S | S | S | S | P | P |
| 67 | Reactive station material identity | Trade, fab, military, research, refinery, mining, and black-market stations share grammar but alter form, tempo, light, and sound | P | P | P | P | P | P | P |
| 68 | Audio-tactile synchronization | Latches, springs, umbilicals, transactions, route binding, and machinery answer with restrained sound and apparent mass | P | P | P | P | P | P | P |
| 69 | Reduced-motion spatial twin | Every transformation has a composed instant state preserving object continuity, hierarchy, and causality without motion | P | P | P | P | P | P | P |
| 70 | Keyboard command constellation | Search and spatial roving focus reach the same objects/actions without flattening the visual world | P | P | P | P | P | P | P |
| 71 | Controller focus orbit | Stick/d-pad focus travels through spatial neighbors; confirm goes deeper, cancel returns outward | P | P | P | P | P | P | P |
| 72 | High-contrast schematic mirror | Complex 3D/colour encodings have an optional synchronized line/symbol layer rather than a separate lesser interface | P | P | P | P | P | P | P |

## Five complete station-world architectures considered

These are not palette variations. Each gives the player a different mental model of what the station
is and how one goes deeper.

### 1. The station cutaway

The arrival view is a sectional 3D station. Bays are services. Selecting a bay flies the camera into
it; local machinery becomes the mini-game.

Strengths: station identity is literal; service availability can be read spatially; fantastic use of
the archetype GLBs. Weaknesses: repeated camera travel can become slow; a full believable interior
for every service is an enormous asset burden; Market and Factions risk turning back into projected
panels once the camera arrives. Keep as an arrival/identity layer, not the only interaction model.

### 2. The captain's holotable

One physical table projects different models: ship, economy, production, routes, political field.

Strengths: coherent, legible, plausible, naturally supports direct manipulation. Weaknesses: the
table can become a literal desk holding seven dashboards. Rejected as the primary metaphor; retained
as one environmental object inside the stronger direction.

### 3. The station transit spine

Services are stops along a luminous concourse or transit artery. A short spatial movement changes
activity, and contacts physically inhabit the line.

Strengths: sense of place and arrival continuity. Weaknesses: distance is not depth; frequent tasks
become commute; Shipworks and Market still need separate core metaphors. Useful for station identity
and contact presence, not primary operation.

### 4. Ship-centered everything

The docked ship remains the center and every decision orbits it: cargo, fit, contracts, faction
clearance, contacts, production goals.

Strengths: perfect for Shipworks, readiness, cargo, and contract fit. Weaknesses: it distorts the
economy, production network, politics, and social world into ship accessories. The ship should be the
invariant anchor, but it cannot be the whole universe.

### 5. The live station instrument (selected)

The player docks into a real 3D bay. Over that authored place the station grants access to a luminous
**operational twin**: not a fake glass HUD, but the station's live model of its own cargo, machinery,
routes, authority, and people. The docked ship is the invariant physical anchor. The station twin is
the shared strategic space. An orbital service crown is its mode selector. Selecting a function
does not open a page; it changes which real relationships the twin exposes and how the bay's tools
reconfigure.

This wins because it can be holographic without becoming floating-card slop, physical without
becoming Stalinist steel, and coherent without forcing every activity into the same arrangement.

## Selected visual thesis: luminous salvage futurism

This is not a palette mandate. It is the material logic that keeps physical grit and advanced
projection technology in balance.

- The physical layer is lived-in spacecraft material: dark composite, painted alloy, ceramic,
  fabric, clamps, cables, scuffs, service markings, warm practical light. It supports the experience
  and never becomes a wall of steel panels.
- The operational layer is sharp projected light: thin volumetric planes, spectral particles,
  luminous vector geometry, depth-faded labels, responsive beams, and local bloom. Projection occurs
  from identifiable emitters and remains attached to objects, routes, or machinery.
- Warm light means physical work, cost, warning, or human presence. Cool spectral light means
  manipulable station data. Green is committed/healthy. Red is a real block or threat. Colour does
  not decorate arbitrary text.
- Surfaces do not float merely to hold copy. Text either labels a spatial object, belongs to an
  instrument, or appears in an anchored explanation requested by the player.
- The bold move is the persistent operable station twin. Effects serve that move; they do not
  compete to be the most animated object.

## Navigation decision

A conventional navigation bar is not appropriate.

The earlier macOS-like behavior remains valuable, but its final form is the **service crown**: an arc
of station functions suspended from a real projector rail above/around the docked ship.

- Pointer proximity and spatial keyboard focus create controlled neighbor magnification.
- The active function returns to equilibrium and is held by a stable projected notch/latch; selected
  never looks like hover frozen in place.
- Repair, refuel, resupply, cargo transfer, and undock are physical ship umbilicals below the crown,
  not destinations pretending to be tabs.
- Shipworks, Exchange, Foundry, Operations, Authority, and Concourse are operating modes. Selecting
  one causes a shared-object/camera/workspace transformation.
- The crown can recede to a thin constellation during focused work and returns on `Escape`, controller
  cancel, pointer approach, or command-palette invocation.
- There is no duplicate sidebar and no footer navigation.

## One coherent transformation grammar

The selected station world uses the same seven-depth model everywhere:

| Depth | Station behavior |
|---|---|
| Glance | The bay, ship, crown, active connections, credits/cargo/readiness, authority, and one opportunity are immediately legible |
| Focus | A spatial object receives light, depth, and audio focus; unrelated layers recede rather than disappear |
| Reveal | Relationships animate outward from that object: compatible slots, price causes, dependencies, route stages, alliances, leads |
| Manipulate | The player rotates, brushes, routes, allocates, scrubs, tunes, or reorders the representation itself |
| Simulate | Ghost geometry and counterfactual flows show the proposed future in place |
| Commit | The relevant source visibly travels or transforms into the destination through the real game intent |
| Explain | A requested anchored layer supplies history, exact numbers, provenance, and advanced detail; it never permanently consumes a column |

## Mini-game actualization

### Arrival / operations: the docked state is the home state

Docking continues the flight rather than replacing it with a menu. The camera settles inside the
authored dock. The ship is caught by the berth. A short acquisition trace identifies station,
authority, cargo, damage, fuel, active mission, and available connections. Service umbilicals make
repair/refuel/resupply visible as actual ship relationships with cost carried on the connection.

The service crown resolves last. One context-sensitive opportunity appears as a spatial signal:
sell profitable carried cargo, repair real damage, install a newly unlocked part, pursue a nearby
contract, or depart. There is no home dashboard.

### Shipworks: operate the ship, not an inventory page

The bay opens around the already-present ship. Projected hardpoints lock to real 3D positions.
Selecting a point brings a gantry light and camera focus to it; a compatible-part fan unfolds from
the slot. Equipped, owned, and station-stock parts occupy distinct physical origins. Hover/focus
ghosts a candidate into place. Power capillaries, heat tomography, mass plane, and local delta halos
show only affected consequences. A hold-to-compare state restores the old fit. Commit sends the
module along the gantry into the slot and settles a local receipt. Hull browsing uses a service
elevator/turntable: a hull preview physically replaces the candidate while the current ship remains
available as a ghost comparison.

### Exchange / Market: move cargo through an economy

The ship's actual cargo hold opens into a spatial cargo field. Carried commodities occupy visible
capacity as objects. The station exchange is a luminous orbital system around a trade core; families,
ownership, demand, spread, and volatility determine orbit and signal behavior. Selecting cargo opens
its price weather and known-route star chart around the same object. Brushing time changes the cause
markers and known margin field. Quantity is allocated by moving a capacity gate, with credits, hold,
cost basis, and route burden previewed in the geometry.

`Sell what you hauled` enters here with the cargo hold already isolated, station bid gates active,
and the first sellable carried object focused. Selling causes cargo to leave the hold, cross the bid
gate, alter the market signal, and settle credits/profit at the source. Browsing all commodities is
a deeper semantic zoom, not the first thing the player sees.

### Foundry / Industry: choose an output, then operate its causal chain

The player first chooses the desired module, hull, or refined output as a blueprint volume. The
station twin weaves its real dependency loom backward from that goal: output -> component -> refined
material -> raw input -> available source. Path width is quantity. A shortage physically breaks the
exact branch. Selecting the break can bind the Exchange to that input or create an acquisition
objective. Batch size lengthens the conveyor and previews consumed stock, time, fees, and capacity.
Queued work becomes a manipulable operational timeline with visible conflicts. This is one connected
fabrication system; refinery and manufacture are not duplicated destinations.

### Operations / Contracts: choose a future route, not a text offer

The live station twin expands into the surrounding system. Contracts arrive as route volumes from
the current berth to real destinations, with stage gates along the path. Path turbulence expresses
risk; width/charge expresses reward; cargo and fit requirements attach to the route. Selecting one
brings the ship's readiness circuit around the departure point and previews faction changes as
political wakes. Competing routes can be held or scrubbed for comparison. Accepting binds the route
into navigation, closes the readiness circuit where possible, and starts stage one. Full prose,
failure clauses, and provenance are available from anchored inspection, not permanent cards.

### Authority / Factions: manipulate social gravity

The current station remains center. Factions form influence bodies whose gravity bends access,
prices, scans, contracts, and routes. The controlling authority owns the station's outer clearance
ring. The player's relationship is a vector/orbit with labelled permission gates, not a giant gauge.
Selecting a faction reveals only its meaningful links, recent action wakes, next permission lock,
hostility buffer, and affected opportunities. Semantic zoom exposes history and the full unlock
ladder. Reputation is embodied by changed clearances, greetings, projected wayfinding, and station
tools—not only numbers.

### Concourse / Bar: tune into people and evidence

The machinery recedes and the physical station becomes warmer and more human. Contacts occupy
authored transmission stages or compact positions in a concourse diorama. Selecting a person tunes
their channel; known relationship, credibility, price, and current lead resolve around them.
Rumors, survey data, and job leads are signal artifacts with provenance. Buying survey data visibly
resolves unknown regions on the shared station/system twin. Inspecting a lead transforms that same
signal into its route volume in Operations. Graffiti and lines such as `REDISTRIBUTED TO THE HIGHEST
BIDDER` remain physical environmental artifacts, separate from operational help and station identity.

## Thematic cohesion without identical layouts

The mini-games share:

- the same physical dock and live station twin;
- the service crown and outward/inward navigation grammar;
- object-preserving transformations;
- projection physics, typography, symbols, colour meaning, focus, and sound;
- anchored explanations and causal receipts;
- semantic zoom and reversible simulation;
- controller/keyboard/pointer parity and reduced-motion twins.

They deliberately do **not** share:

- a left/center/right template;
- a card or panel geometry;
- a permanent inspector;
- a generic chart frame;
- a repeated list-plus-detail interaction;
- equal visual density or identical camera composition.

## Technology actualization

The current repo supports a hybrid rather than a framework-first rewrite:

1. Three.js renders the persistent bay, current ship, station twin, spatial selection, emissive route
   geometry, cargo objects, projection volumes, and camera continuity.
2. Existing authored `place_dock_interior*` and `place_station_*` GLBs provide physical identity.
   Blender 5.1 can add named projector origins, service sockets, gantry paths, material variants,
   occlusion-safe label anchors, and one-shot mechanical animation clips where the runtime assets lack
   them.
3. DOM/SVG supplies crisp typography, focusable spatial labels, accessible controls, exact values,
   help, and high-contrast schematic overlays. These elements anchor to 3D objects rather than form
   pages.
4. Floating UI handles trays and explanations that must remain attached to projected objects while
   respecting viewport boundaries.
5. GSAP or Motion is worth adding only for shared DOM/3D timing and interruption-safe state
   transitions. Three.js owns spatial animation; CSS does not fake 3D with scaled cards.
6. Rive is optional for a small number of authored state-machine glyphs (service latch, readiness
   circuit, station handshake), not for the world itself.
7. ECharts/React Flow are not the default. Their algorithms or data transforms may be useful, but
   their visible widgets would pull the result back toward analytical software. The station twin
   owns final rendering and interaction.
8. Web Audio provides low-frequency mechanical mass, projector acquisition, navigation ticks, and
   transaction causality with a quiet/reduced-effects path.

## Accessibility is a second encoding, not a second design

- Every spatial object has a synchronized DOM semantic node and plain-language accessible name.
- Roving focus follows authored spatial neighbours; Tab reaches global/escape actions; a command
  palette provides expert direct access without becoming primary navigation.
- Pointer hover and keyboard/controller focus reveal identical consequences.
- Colour is always paired with geometry, motion, pattern, text, or sound.
- Reduced motion replaces camera flight and reflow with composed cuts that preserve selected-object
  continuity and the final cause/effect layout.
- High-contrast schematic mode strengthens edges, symbols, anchors, and labels while retaining the
  same spatial model.
- Time scrubs, dials, brushing, radial controls, and 3D manipulation all have keyboard step actions
  and direct numeric alternatives in requested contextual trays.
- No critical information exists only in depth, hover, animation, or audio.

## Performance and lifecycle rules

- Flight simulation/render/VFX sleep while docked; station rendering is its own measured budget.
- The persistent bay renders on demand when settled. Continuous frames occur only during direct
  manipulation, active transition, or real state animation.
- Ship and dock GLBs, shared materials, and environment maps are cached and reused; hidden modes
  dispose listeners and stop animation without rebuilding the bay.
- Effective DPR is measured and capped intelligently, never forced to 1 and enlarged.
- Spatial labels use stable projection with occlusion/depth rules and avoid fractional CSS transform
  blur at rest.
- Offscreen route/particle layers sleep; decorative ambient particles have strict count/cadence and
  never become the reason the interface feels alive.
- Reduced-motion and low-effects paths are authored compositions, not blank or degraded modes.

## Rejection tests before implementation expands again

Stop and redesign if any capture can accurately be described as:

- a web application floating over a background;
- a horizontal tab bar changing pages;
- a list choosing the content of a central card;
- a left rail plus large visualization plus right inspector;
- a collection of rounded panels;
- a chart with space styling but no game manipulation;
- a 3D model used as animated wallpaper behind DOM controls;
- a hologram made from translucent rectangles;
- industrial steel framing carrying the visual identity by itself;
- several effects that do not correspond to real state;
- text removed without being replaced by a legible symbolic relationship;
- apparent depth that disappears when the player tries to manipulate it.

The acceptance question is not “does it look futuristic?” It is:

> Is operating the representation itself how the player changes the connected game systems?

## Actualization plan and kill gates

The existing production station is frozen until Phase 2 proves the world model. No more CSS polish or
mini-app rearrangement can answer the architectural question.

### Phase 0 — preserve truth and remove false authority

- Preserve the dirty tree and inventory every real event path, task mode, filter, selection, error,
  confirmation, and return path.
- Keep tests for functional parity; rewrite only checks that freeze a visual topology.
- Mark the morphology as exploration rather than replacing one design constitution with another.
- Keep the current implementation runnable as behavioral reference while the new world is isolated.

Kill gate: if a shortcut retains destination but loses task context (`Sell what you hauled` without
sell mode + carried filter + focus), it does not pass into the new architecture.

### Phase 1 — station-world technical spike

Build an isolated route containing only:

- one authored dock-interior GLB;
- the player's authored ship;
- a camera that settles from arrival framing into the berth;
- named projector/service anchors;
- the magnetic service crown;
- four physical umbilicals for repair, refuel, resupply, and departure;
- synchronized DOM semantics and roving spatial focus;
- instant reduced-motion composition;
- render-on-demand sleep after the sequence settles.

No Market, charts, panels, or long copy. This spike answers whether the station feels like a place and
whether the service crown feels like a futuristic operating system rather than a navigation bar.

Kill gate: reject if the 3D bay reads as wallpaper behind HTML, if the crown reads as rounded tabs, if
the ship is not the immediate physical anchor, or if the settled scene cannot sleep.

### Phase 2 — two interaction proofs before a suite

Build two narrow but deep proofs on the station-world route:

1. **Shipworks hardpoint loop:** select actual hardpoint -> focus -> reveal compatible part fan ->
   ghost fit -> inspect localized power/heat/mass/cost -> hold compare -> buy/install through real intent
   -> causal installation and receipt.
2. **Carried-cargo sale loop:** select actual cargo object -> reveal station bids and price weather ->
   manipulate quantity/capacity -> preview credits/profit/hold -> sell through real intent -> cargo
   transfer and market response.

These deliberately test opposite systems: one spatial/technical and one economic/analytical. If both
feel native to the same station twin, the metaphor is strong enough to expand.

Kill gate: reject if either proof needs a permanent list, generic inspector, or detached chart to be
usable. Reject if animation cannot be interrupted or if keyboard/controller users receive a flattened
workflow with less information.

### Phase 3 — Blender and asset authoring pass

Only after the interaction proofs establish exact needs:

- add named service sockets, projector origins, camera targets, label anchors, and gantry curves to
  the dock assets;
- author a restrained service-latch/gantry/aperture clip where runtime interpolation cannot create
  equal quality;
- create material variants that balance composite/ceramic physical surfaces with spectral projection;
- improve or replace visibly provisional station/contact assets used in the selected loops;
- export GLB with stable names/extras and validate it through the existing asset pipeline.

Kill gate: no asset is authored merely to decorate an unchanged page layout. Every new mesh, anchor,
or animation must enable a selected object, relationship, manipulation, or consequence.

#### Ship and bay fidelity ladder

The station camera is close enough that the normal flight silhouette is not sufficient. “More
detail” must be authored at several physical scales rather than added as a uniform noise pass:

1. **Macro form:** pressure hull, shoulders, drive, cockpit, radiators, tools, gear. The silhouette
   must still explain the ship at thumbnail size.
2. **Construction form:** overlapping armor, rebates, canopy sills, structural braces, load rings,
   removable cassettes, service cavities. These features catch real highlights and prevent the hull
   reading as one molded clay object.
3. **Functional clusters:** cooling banks near heat sources, cable and pipe routing between actual
   systems, weapon access, repair patches, cargo interfaces, fasteners around removable parts. Detail
   density follows maintenance and stress, not a random greeble field.
4. **Surface response:** localized roughness, exposed metal, heat tint, grease, paint mismatch,
   scratches, decals, and panel normals. Texture information supports geometry; it does not pretend
   a flat plane is a machine.
5. **Operational light:** environment reflection, warm work key, cool fill, narrow rim, contact
   shadow, emissive service rails, and selection projection. Bloom is restricted to real emitters.

The first fidelity spike found that the station prototype was incorrectly using the old procedural
`buildKestrelHero()` path even though a materially richer V4 whole-ship GLB was already promoted. The
isolated correction now tests three separable contributions:

- the authored V4 PBR asset under a PMREM environment and shaped light rig;
- a non-destructive Blender candidate retaining source detail and adding manufactured edge bevels;
- a small separate overlay of causal service clusters, so panel density can be judged without
  mutating the accepted asset.

The candidate deliberately remains outside release maps. It is evidence, not a promotion. Its
successful ideas must be folded into a reproducible semantic V5 asset, then batched only after world
transforms, sockets, animated roles, material mapping, and normal/tangent behavior are verified.

Reject a detail pass when it produces any of these signatures:

- evenly tiled plates that read as LEGO or appliqué;
- pipes, vents, bolts, or lights with no system they serve;
- razor edges whose material cannot produce a readable highlight;
- broad surfaces differing only by random colour;
- uniform dirt and edge wear unrelated to access, heat, airflow, impacts, or repair;
- 200 tiny meshes retained in production merely because the close prototype can afford them;
- stronger glow, bloom, or contrast used to disguise weak modeling.

### Phase 4 — shared station-world kernel

Integrate the proven route into the live docked state:

- world/camera ownership and transition state machine;
- spatial selection registry shared by Three.js and DOM;
- service crown and inward/outward navigation;
- anchored surface manager;
- counterfactual preview state separate from committed game state;
- causal receipt/undo channel;
- audio, motion, reduced-motion, focus, disposal, and renderer sleep;
- station-archetype identity inputs.

Kill gate: no mini-game may invent a second navigation system, second tooltip system, second colour
grammar, or independent animation lifecycle.

### Phase 5 — mini-games, one causal loop at a time

Expand in this order because each reuses the preceding representation grammar:

1. Shipworks: full hull/fit/slot/inventory/stock loop.
2. Exchange: carried sale, purchase, commodity exploration, route intelligence.
3. Foundry: output-first dependency loom, acquisition handoff, batch and queue.
4. Operations: route volumes, readiness, acceptance, tracking, abandonment.
5. Authority: control field, permissions, recent deltas, consequences, history.
6. Concourse: contacts, rumors, surveys, environmental artifacts, contract handoff.
7. Arrival/home: choose the single best contextual opportunity using all completed systems.

For every loop: functional contract -> spatial prototype -> live intent -> causal receipt -> pointer,
keyboard, controller, reduced-motion -> screenshot and performance critique -> only then next loop.

Kill gate: if a mini-game can be described as a reskinned version of the previous mini-game, its
central representation is wrong. Coherence comes from the world and interaction grammar, not copied
layout.

### Phase 6 — station identity variations

Apply the same grammar through different station behavior:

- trade hub: more cargo traffic, clearer market orbit, customs and route projection;
- fab: visible dependency flow, gantry tempo, warm work light, manufacturing capacity;
- refinery/mining: heavy material flow, ore handling, throughput and hazards;
- military: clearance geometry, restricted systems, requisition and patrol routes;
- research: sectional scans, signal resolution, analysis layers;
- black market: improvised emitters, uncertain provenance, concealed paths, intercepted signals.

These variations change emphasis, signal quality, service availability, sound, and physical behavior;
they do not merely swap palette tokens.

Kill gate: station identity must remain recognizable in a greyscale screenshot and with all titles
temporarily hidden.

### Phase 7 — evidence and polish loop

- Capture arrival and every mini-game at 1920x1080, 1440x900, and 1366x768; DPR 1 and 2; zoom 100,
  125, and 150 percent.
- Record complete interaction sequences for the two proof loops and every later causal loop.
- Measure first meaningful frame, settled GPU/CPU, active manipulation, transition cost, memory after
  repeated open/close, and hidden-state work.
- Test screen-reader landmarks/names, keyboard order, controller graph, contrast, high-contrast mode,
  reduced motion, interruption, cancellation, error, and rollback.
- Critique each capture against the rejection tests in this document. Fix hierarchy, depth, occlusion,
  text harshness, projection legibility, animation timing, sound weight, and semantic colour before
  expanding scope.

Completion requires both: the real gameplay paths work, and the station reads as a continuous
operable place whose representations are the mechanics. Passing DOM-pattern checks alone proves
nothing about this design.
