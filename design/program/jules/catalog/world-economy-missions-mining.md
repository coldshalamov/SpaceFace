<!-- GENERATED FROM ../task-bank.json; DO NOT EDIT BY HAND -->

# World, economy, missions, mining, and progression

Harden and enrich the living-world loops through existing owners, catalogs, and verbs.

**Tasks:** 17 · **Range:** `JULES-0134`–`JULES-0150`

## JULES-0134 — Cargo capacity, mass, and transfer logistics — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `world-cargo-logistics`

**Objective:** Audit the data and owner relationships for cargo capacity, mass, and transfer logistics. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in single-writer cargo mutations, volume caps, mass consequences, partial transfers, overflow, and pickup feedback.

**Context:** cargo capacity, mass, and transfer logistics: single-writer cargo mutations, volume caps, mass consequences, partial transfers, overflow, and pickup feedback.

**Inspect:** `src/systems/cargo.js` `src/data/commodities.js` `src/ui/hud.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map cargo capacity, mass, and transfer logistics to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by single-writer cargo mutations, volume caps, mass consequences, partial transfers, overflow, and pickup feedback.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:fragile-cargo`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0134 --format prompt`

## JULES-0135 — Crafting, refining, and manufacturing queues — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `world-crafting`

**Objective:** Audit the data and owner relationships for crafting, refining, and manufacturing queues. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in recipe inputs and outputs, queue lifecycle, cancellation/refunds, station context, completion delivery, and save persistence.

**Context:** crafting, refining, and manufacturing queues: recipe inputs and outputs, queue lifecycle, cancellation/refunds, station context, completion delivery, and save persistence.

**Inspect:** `src/systems/crafting.js` `src/data/blueprints.js` `src/ui/screens/automationPanel.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map crafting, refining, and manufacturing queues to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by recipe inputs and outputs, queue lifecycle, cancellation/refunds, station context, completion delivery, and save persistence.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0135 --format prompt`

## JULES-0136 — Technology tree progression — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `world-tech-progression`

**Objective:** Audit the data and owner relationships for technology tree progression. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in prerequisite graph integrity, unlock affordability, duplicate purchases, derived effects, discoverability, and old-save normalization.

**Context:** technology tree progression: prerequisite graph integrity, unlock affordability, duplicate purchases, derived effects, discoverability, and old-save normalization.

**Inspect:** `src/data/tech.js` `src/ui/screens/techTree.js` `src/systems/ships.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map technology tree progression to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by prerequisite graph integrity, unlock affordability, duplicate purchases, derived effects, discoverability, and old-save normalization.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0136 --format prompt`

## JULES-0137 — Beam mining cadence and seam extraction — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `world-beam-mining`

**Objective:** Audit the data and owner relationships for beam mining cadence and seam extraction. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in target acquisition, seam multipliers, extraction cadence, release behavior, deterministic yield, and readable mining feedback.

**Context:** beam mining cadence and seam extraction: target acquisition, seam multipliers, extraction cadence, release behavior, deterministic yield, and readable mining feedback.

**Inspect:** `src/systems/mining.js` `src/data/mining.js` `src/render/vfx.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map beam mining cadence and seam extraction to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by target acquisition, seam multipliers, extraction cadence, release behavior, deterministic yield, and readable mining feedback.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:mining:bulk-guidance`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0137 --format prompt`

## JULES-0138 — Beam mining cadence and seam extraction — repair transaction and progression edges

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `world-beam-mining`

**Objective:** Exercise beam mining cadence and seam extraction across exact affordability/capacity thresholds, partial success, cancellation, duplicate delivery, and owner failure. Fix one atomicity or progression defect if reproduced.

**Context:** beam mining cadence and seam extraction: target acquisition, seam multipliers, extraction cadence, release behavior, deterministic yield, and readable mining feedback.

**Inspect:** `src/systems/mining.js` `src/data/mining.js` `src/render/vfx.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map beam mining cadence and seam extraction to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by target acquisition, seam multipliers, extraction cadence, release behavior, deterministic yield, and readable mining feedback.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- Credits, cargo, reputation, inventory, unlocks, or rewards change exactly once and through their canonical writer.
- Failure leaves state unchanged or rolls back completely.
- Boundary values immediately below/at/above the threshold are covered.
- UI feedback reports the canonical failure reason.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:mining:bulk-guidance`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0138 --format prompt`

## JULES-0139 — Asteroid fracture, chunks, and pickup convergence — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `world-asteroid-fracture`

**Objective:** Audit the data and owner relationships for asteroid fracture, chunks, and pickup convergence. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in fracture topology, chunk ownership, direct-to-cargo rules, vacuum convergence, cleanup, collision, and large-chunk hauling.

**Context:** asteroid fracture, chunks, and pickup convergence: fracture topology, chunk ownership, direct-to-cargo rules, vacuum convergence, cleanup, collision, and large-chunk hauling.

**Inspect:** `src/systems/mining.js` `src/systems/cargo.js` `src/systems/asteroidFormations.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map asteroid fracture, chunks, and pickup convergence to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by fracture topology, chunk ownership, direct-to-cargo rules, vacuum convergence, cleanup, collision, and large-chunk hauling.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:asteroid-motion`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0139 --format prompt`

## JULES-0140 — Rich-core and deep-drill play — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `world-rich-core`

**Objective:** Audit the data and owner relationships for rich-core and deep-drill play. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in core reveal, timing interaction, hazard resolution, rewards, state reset, input reachability, and mining-loop handoff.

**Context:** rich-core and deep-drill play: core reveal, timing interaction, hazard resolution, rewards, state reset, input reachability, and mining-loop handoff.

**Inspect:** `src/systems/drill.js` `src/ui/screens/drill.js` `src/data/mining.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map rich-core and deep-drill play to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by core reveal, timing interaction, hazard resolution, rewards, state reset, input reachability, and mining-loop handoff.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:drill-smooth`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0140 --format prompt`

## JULES-0141 — Scanner, recon, and discovery state — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `world-scanner-discovery`

**Objective:** Audit the data and owner relationships for scanner, recon, and discovery state. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in scan pulse lifecycle, reveal ownership, duplicate discoveries, saved knowledge, marker semantics, and mission credit.

**Context:** scanner, recon, and discovery state: scan pulse lifecycle, reveal ownership, duplicate discoveries, saved knowledge, marker semantics, and mission credit.

**Inspect:** `src/systems/scanner.js` `src/data/sectors.js` `src/ui/radar.js` `src/ui/screens/starmap.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map scanner, recon, and discovery state to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by scan pulse lifecycle, reveal ownership, duplicate discoveries, saved knowledge, marker semantics, and mission credit.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:scan-reveal`
- `npm run check:map-confidence`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0141 --format prompt`

## JULES-0142 — Sector topology, routes, gates, and place registration — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `world-sector-topology`

**Objective:** Audit the data and owner relationships for sector topology, routes, gates, and place registration. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in graph connectivity, unreachable places, reciprocal routes, spawn anchors, registration completeness, and map visibility.

**Context:** sector topology, routes, gates, and place registration: graph connectivity, unreachable places, reciprocal routes, spawn anchors, registration completeness, and map visibility.

**Inspect:** `src/data/sectors.js` `src/systems/world.js` `src/data/PLACE_REGISTRATION.md`

**Read first:** `build_map.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map sector topology, routes, gates, and place registration to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by graph connectivity, unreachable places, reciprocal routes, spawn anchors, registration completeness, and map visibility.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:atlas-integrity`
- `npm run check:map-nav-context`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0142 --format prompt`

## JULES-0143 — Hazards, cruise interdiction, and local danger — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `world-hazards-interdiction`

**Objective:** Audit the data and owner relationships for hazards, cruise interdiction, and local danger. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in hazard entry/exit, mass-lock and cruise drop, danger semantics, telegraph windows, deterministic selection, and recovery.

**Context:** hazards, cruise interdiction, and local danger: hazard entry/exit, mass-lock and cruise drop, danger semantics, telegraph windows, deterministic selection, and recovery.

**Inspect:** `src/systems/world.js` `src/systems/cruise.js` `src/systems/dangerModel.js` `src/data/sectors.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map hazards, cruise interdiction, and local danger to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by hazard entry/exit, mass-lock and cruise drop, danger semantics, telegraph windows, deterministic selection, and recovery.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:baseline`
- `npm run check:core-combat-loop`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0143 --format prompt`

## JULES-0144 — Factions, reputation, law, and wanted consequences — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `world-factions-law`

**Objective:** Audit the data and owner relationships for factions, reputation, law, and wanted consequences. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in single-writer reputation, threshold transitions, WANTED propagation, lawful hostility, docking consequences, and recovery.

**Context:** factions, reputation, law, and wanted consequences: single-writer reputation, threshold transitions, WANTED propagation, lawful hostility, docking consequences, and recovery.

**Inspect:** `src/systems/factions.js` `src/systems/heat.js` `src/data/factions.js` `src/ai/engagementAuthority.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map factions, reputation, law, and wanted consequences to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by single-writer reputation, threshold transitions, WANTED propagation, lawful hostility, docking consequences, and recovery.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:47a:tactics`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0144 --format prompt`

## JULES-0145 — Civilian traffic routes and behavior — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `world-civilian-traffic`

**Objective:** Audit the data and owner relationships for civilian traffic routes and behavior. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in route generation, passive team semantics, despawn/respawn, collision avoidance, lifecycle cadence, and visible purpose.

**Context:** civilian traffic routes and behavior: route generation, passive team semantics, despawn/respawn, collision avoidance, lifecycle cadence, and visible purpose.

**Inspect:** `src/systems/traffic.js` `src/systems/world.js` `src/systems/aiPorts.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map civilian traffic routes and behavior to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by route generation, passive team semantics, despawn/respawn, collision avoidance, lifecycle cadence, and visible purpose.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0145 --format prompt`

## JULES-0146 — Claims, beacons, and player infrastructure — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `world-claims-beacons`

**Objective:** Audit the data and owner relationships for claims, beacons, and player infrastructure. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in placement legality, ownership, duplicate deployment, persistence, destruction, map registration, and resource handoff.

**Context:** claims, beacons, and player infrastructure: placement legality, ownership, duplicate deployment, persistence, destruction, map registration, and resource handoff.

**Inspect:** `src/systems/claims.js` `src/systems/beacons.js` `src/data/claimableBodies.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map claims, beacons, and player infrastructure to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by placement legality, ownership, duplicate deployment, persistence, destruction, map registration, and resource handoff.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0146 --format prompt`

## JULES-0147 — Mission objective tracking and reward settlement — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `world-mission-tracking`

**Objective:** Audit the data and owner relationships for mission objective tracking and reward settlement. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in event-to-objective attribution, multi-step state, abandon/fail/complete races, idempotent rewards, and save/reload.

**Context:** mission objective tracking and reward settlement: event-to-objective attribution, multi-step state, abandon/fail/complete races, idempotent rewards, and save/reload.

**Inspect:** `src/systems/missions.js` `src/ui/screens/missionLog.js` `src/systems/economy.js` `src/systems/cargo.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map mission objective tracking and reward settlement to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by event-to-objective attribution, multi-step state, abandon/fail/complete races, idempotent rewards, and save/reload.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0147 --format prompt`

## JULES-0148 — Story beats, narrative memory, and player ledger — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `world-story-ledger`

**Objective:** Audit the data and owner relationships for story beats, narrative memory, and player ledger. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in beat prerequisites, one-time delivery, remembered consequences, stale callbacks, branching consistency, and player comprehension.

**Context:** story beats, narrative memory, and player ledger: beat prerequisites, one-time delivery, remembered consequences, stale callbacks, branching consistency, and player comprehension.

**Inspect:** `src/systems/story.js` `src/systems/aceMemory.js` `src/data/narrative.js` `src/data/sectorAnchors.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map story beats, narrative memory, and player ledger to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by beat prerequisites, one-time delivery, remembered consequences, stale callbacks, branching consistency, and player comprehension.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0148 --format prompt`

## JULES-0149 — Battle aftermath, wrecks, and persistent world sites — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `world-aftermath-sites`

**Objective:** Audit the data and owner relationships for battle aftermath, wrecks, and persistent world sites. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in combat-to-aftermath handoff, wreck ownership, salvageability, persistence, cleanup, revisits, and readable environmental storytelling.

**Context:** battle aftermath, wrecks, and persistent world sites: combat-to-aftermath handoff, wreck ownership, salvageability, persistence, cleanup, revisits, and readable environmental storytelling.

**Inspect:** `src/systems/aftermathWrecks.js` `src/systems/asteroidSites.js` `src/systems/world.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map battle aftermath, wrecks, and persistent world sites to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by combat-to-aftermath handoff, wreck ownership, salvageability, persistence, cleanup, revisits, and readable environmental storytelling.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:battle-aftermath`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0149 --format prompt`

## JULES-0150 — Automation, drones, outposts, and logistics — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** high · **Size:** s · **Collision:** `world-automation`

**Objective:** Audit the data and owner relationships for automation, drones, outposts, and logistics. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in automation order validation, resource transfer, offscreen cadence, failure recovery, persistence, and comprehensible production output.

**Context:** automation, drones, outposts, and logistics: automation order validation, resource transfer, offscreen cadence, failure recovery, persistence, and comprehensible production output.

**Inspect:** `src/data/automation.js` `src/ui/screens/automationPanel.js` `src/systems/sectorSim.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map automation, drones, outposts, and logistics to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by automation order validation, resource transfer, offscreen cadence, failure recovery, persistence, and comprehensible production output.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0150 --format prompt`
