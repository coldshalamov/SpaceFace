# Common Context — Universe Atlas and Physical Travel

Use this context at the beginning of every agent session. The task-specific request should appear after this block.

<project_context>
SpaceFace is a space game whose current primitives suggest a continuous universe, but the player's experience of maps and long-distance travel is fragmented, ambiguous, and often empty.

The map is not a secondary utility. It is one of four major player interfaces:

1. Mining interface — granular interaction with asteroids.
2. Flight/combat interface — local, personal movement and combat.
3. Station interface — economy, missions, customization, and strategy.
4. Universe map — the zoomed-out interface to the game world as a whole, and the future substrate for fleet, logistics, territory, and remote strategic control.

The intended program is therefore not “polish the map.” It is “make spatial truth, missions, routing, travel, discovery, presentation, and content authoring one coherent Universe Atlas and Physical Travel system.”
</project_context>

<evidence_labels>
Treat all supplied information according to these labels:

- `FIRSTHAND_OBSERVATION`: A player directly experienced this behavior. Preserve the symptom even if the proposed cause is wrong.
- `PRIOR_AUDIT_CLAIM`: A previous read-only agent reported this from an earlier repository state. Reproduce and verify it against the current commit before treating it as fact.
- `BINDING_PRODUCT_DIRECTION`: A product requirement from the user. Preserve it unless it is technically impossible or conflicts with a higher-priority requirement; explain any conflict.
- `PROPOSED_DESIGN`: A promising solution, not a commandment. Challenge it with evidence and alternatives.
- `VERIFIED_CURRENT_FACT`: A claim you personally reproduced or traced in the current repository with exact evidence.

Never collapse these categories into one undifferentiated specification.
</evidence_labels>

<firsthand_observations>
## Navigation and map failures

- The tracked mission, required action, final destination, and immediate reachable waypoint are not presented as one coherent task.
- A yellow/gold HUD waypoint exists, but opening the map does not clearly identify what it represents.
- Sectors and markers look too similar; several objects appear highlighted at once.
- The map lacks a robust legend and does not use color, shape, line style, and hierarchy to distinguish ordinary places, mission relevance, the tracked goal, threats, services, and uncertainty.
- Local, System, and Galaxy views feel like unrelated maps rather than concentric scales of one world.
- Their sidebars are largely static and may show information unrelated to the current scale.
- Marker overlap can make two locations appear as one.
- The player cannot reliably see a persistent “you are here” marker at local, system, and galaxy scales.
- Deep space is represented as absence: after flying far enough, the player cannot tell where they are between known places.
- The map does not clearly show route geometry, the next physical leg, progress along the route, or whether the target is in another sector behind a gate or portal.
- Clicking a place does not provide the expected inspection and action surface: details, system view, plot route, engage autopilot, or related mission context.
- The current information density is paradoxical: too little useful information, yet the visible information feels crowded because it is presented without depth, progressive disclosure, or prioritization.

## Long-distance flight failures

- Local assisted flight appears designed for controllable combat, but the same governor or resistance makes long-distance travel feel artificially slow.
- The desired experience includes sustained acceleration, accumulating velocity, meaningful braking, and the possibility of overshoot.
- A latched travel command is desired so the player does not hold the forward key for an extended trip. Num Lock is a suggested default, not a hard-coded-only input.
- Dash can add velocity effectively while held boost may slow the ship at high speed.
- Dash, held boost, normal thrust, braking authority, energy or propellant cost, and upgrades do not feel like one designed propulsion system.
- Turning presentation appears physically wrong when both front-side jets fire instead of the opposite-side RCS jet producing the turn.

## High-speed and environmental presentation failures

- Speed lines become thick, bright, additive clutter that can obscure the entire screen.
- Their style reads as cheap or cartoonish rather than modern and technically coherent.
- At extreme speed the visual behavior changes in another undesirable way, clustering aggressively near the top of the screen.
- Background regions can change abruptly rather than appearing as spatial volumes the player approaches, enters, crosses, and leaves.
- Long-distance space often lacks landmarks, stations, wrecks, convoys, patrols, resource sites, anomalies, piracy, or other signs of an inhabited universe.

## Reference experience

Freelancer is a key experiential reference, not a request to clone its implementation:

- The universe felt large without requiring hours of key-holding.
- Long travel passed planets, stations, wrecks, traffic, and danger.
- Trade lanes were physical infrastructure in the game world rather than a loading-screen teleport.
- Lane disruption created encounters, but the player could recover by reaching the next intact segment.
- Autopilot reduced input tedium while preserving world traversal.
</firsthand_observations>

<prior_audit_leads>
A prior read-only audit reported the following. These are leads, not current truth:

- `src/ui/galaxyMap.js` reportedly switches among separate Local/System/Galaxy builders and cameras at hard zoom thresholds.
- System-map projection reportedly mixes sector-local zones and gates with galactic-global player and station positions, causing nonzero-origin systems to collapse or hide the player.
- `src/systems/world.js` reportedly sets a cross-sector `nav.autoTravel` state without a runtime consumer that executes the route.
- Multiple overlays reportedly begin enabled while amber/gold is reused for route, mission, current sector, market, selection, and decoration.
- `src/core/flight/propulsionKernel.js` reportedly treats assisted throttle as a speed command and may command reverse thrust above the boost cap even while boost energy drains.
- Dash reportedly applies a fixed impulse independent of current speed, while held boost remains governed.
- Existing cruise reportedly modifies a profile field that the live assisted governor does not use.
- `src/render/feel.js` reportedly scales additive streak count, length, and intensity with an effectively unbounded speed ratio.
- Flight telemetry reportedly lacks signed yaw and lateral actuator demand, preventing correct RCS presentation.
- `src/data/sectorCoordinates.js` and world simulation reportedly already contain stable global coordinates, sector origins, and continuous free-flight sector membership.
- The previous agent also reported that relevant files were dirty or under a shared-tree lease at that time. Recheck the current repository; never overwrite unknown work.

For every claim, return one of: `confirmed`, `partially confirmed`, `not reproduced`, `obsolete`, or `blocked from verification`, with exact evidence.
</prior_audit_leads>

<binding_product_direction>
## Product principles

- Preserve the existing “Surveyor's Table” visual identity: warm black, brass, amber, restrained teal, and technical typography. Improve hierarchy and semantics without gutting the aesthetic.
- Use a mathematically precise 2D or 2.5D chart as the primary navigation surface.
- Use holographic wireframes and richer 3D inspection for selected objects, close semantic zoom, orbital inspection, and the inspector—not as a perspective galaxy graph that sacrifices route and label precision.
- Replace the mental model of three disconnected maps with one continuous semantic atlas. Local/System/Galaxy controls may remain as framing bookmarks.
- The player must never become spatially undefined. Deep space is a valid location with context, progress, and recovery actions.
- The map must answer, without detective work:
  - Where am I?
  - What am I doing?
  - Why am I going there?
  - Where is the final destination?
  - What is the next physically reachable action?
  - How long will the trip take?
  - What resources and risks matter?
  - What can interrupt the route?
  - How do I recover?
- Information should exist in depth through zoom, selection, lenses, tabs, and inspection. Do not solve the problem with a wall of labels, text, and permanent overlays.
- Gold is reserved for the tracked objective and active route. Other semantics must use a redundant grammar of color, shape, line style, text, and motion.
- Long-distance travel must remain travel through the same physical universe. Avoid unexplained magic warps as the default solution.
- Local assisted flight and long-distance travel flight are distinct experiences, but they should be composed from explicit orthogonal systems rather than a pile of unrelated mode flags.
- The map and travel system must become a durable substrate for later strategic control, not a disposable mission screen.
- Adding a new planet, station, sector, corridor, environmental region, or mission destination must have an obvious, validated path into the Atlas.
</binding_product_direction>

<proposed_system_contracts>
These are target contracts for the Program Lead to verify and refine.

## Canonical Atlas record

Every map-visible concept should have a stable lightweight record containing, as applicable:

- Stable ID, type, name, parent hierarchy
- Authoring coordinate frame and canonical galactic-global position
- Bounds, orbit, trajectory, region, corridor, search area, or uncertainty volume
- Discovery state, confidence, staleness, and provenance
- Map glyph, label, accessible description, and optional close-range holographic proxy
- Navigation connectors, approaches, gates, lanes, docking points, and constraints
- Services, economy, faction, law, threat, resources, traffic, missions, and history
- Permitted player actions

The Atlas is lightweight. It must not require every distant gameplay entity to be fully simulated or loaded.

## Navigation contract

Every tracked objective should resolve into:

- Ultimate destination
- Immediate reachable leg
- Reason for travel
- Required action on arrival
- Exact, approximate, uncertain, stale, or unknown location state
- Route alternatives and policy
- ETA and stopping information
- Fuel or energy implications
- Threat, legality, and confidence
- Interruption and recovery conditions

The HUD points to the next reachable leg, not blindly through empty space at an unreachable final station.

## Flight control dimensions

Represent these independently:

- Assist regime: Assisted / Drift / Newtonian
- Control owner: Manual / Local autopilot / Route follower
- Travel drive: Off / Charging / Engaged / Interdicted
- Actuator request: Main thrust / Reverse or brake / Boost / Dash / Lateral RCS / Yaw RCS

## Map information architecture

A likely structure is:

- Left rail: missions, bookmarks, search, route alternatives, lenses
- Center: continuous chart
- Right rail: contextual selection inspector; with no selection, show current location, tracked objective, and next leg
- Bottom route ribbon: route legs, ETA, resource use, interruptions, and arrival state

Selection may expose Overview, Travel, Missions, Economy, Threat, Services, Discovery, and History as progressive layers rather than simultaneous panels.
</proposed_system_contracts>

<primary_acceptance_journey>
The primary acceptance route is an ordinary player session, without injected state as the main path:

1. Accept the textile mission.
2. Open the map.
3. Identify current position, tracked mission, final destination, and next physical leg within seconds.
4. Inspect Tethys and understand why the mission goes there.
5. Compare route options where alternatives exist.
6. Plot the route and separately engage travel or autopilot.
7. Watch the same ship traverse the same physical universe.
8. See ETA, velocity, stopping distance, fuel or energy, danger, and route confidence.
9. Survive a route or lane disruption, or manually leave the route.
10. Recover the itinerary without orphaned markers or hidden state.
11. Arrive, dock, and complete the cargo action.
12. Save and continue at any stage without losing coherent route state.
</primary_acceptance_journey>

<engineering_rules>
- Begin with `pwd`, repository instructions (`CLAUDE.md`, `AGENTS.md`, or equivalents), `git status`, relevant plans, and recent git history.
- The current repository is the source of truth. Prior audit file paths and conclusions may be stale.
- Do not edit a dirty shared tree or overwrite unfamiliar changes. Use an isolated branch or worktree, or remain read-only and report the blocker.
- Do not run destructive git or filesystem commands, bypass checks, force-push, or discard unknown changes.
- Use the loop: gather context → form and test hypotheses → take a bounded action → verify the player-visible outcome → repeat.
- Use repository search, runtime inspection, tests, browser or Electron automation, and profiling tools explicitly. Do not reason around a tool call that can establish the fact.
- Implement one coherent vertical slice at a time. Do not one-shot the entire program.
- Use or create one authoritative feature ledger and progress log. Do not create duplicate planning systems.
- Mark a feature passing only after end-to-end verification. Unit tests alone are insufficient for player-facing behavior.
- Test outcomes, not a brittle prescribed sequence of internal calls.
- Implement general logic, not hard-coded values that only satisfy a single fixture or test.
- Keep cross-workstream APIs explicit. Do not reach into another subsystem's internals to “just make it work.”
- Distinguish verified fact, inference, proposal, and unresolved question in every report.
- Avoid speculative abstractions. Build the minimum architecture needed for the accepted program and its stated future substrate.
- Clean up temporary files. End with a clean, understandable branch and a precise summary of files changed, tests run, evidence, limitations, and next dependencies.
- Do not expose private chain-of-thought. Return concise evidence, decisions, tradeoffs, and verification results.
</engineering_rules>
