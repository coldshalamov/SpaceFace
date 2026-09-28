# 10 — Embodied missions, heists and multi-approach activities

**Current lane:** THE WORLD / THE LONG GAME  
**Build-map connections:** PQ-152, PQ-171, PQ-178; CR-CHAIN  
**15 proposed packets:** SF-136–SF-150

## Existing foundation, not a blank slate

The director and phase-script facade already own encounters, spawned actors and consequence intents. Freight scripts already implement real custody/recovery; do not write a second convoy backend.

This is a source-informed working description, not a fresh gameplay acceptance claim. Read current source before treating any subfeature as missing. [Source provenance](../SOURCE_PROVENANCE.md) records scope and limitations.

## Domain contract

Use the existing mission/director/script ownership, scoped seeded streams and consequence helpers. Only write encounter-owned state or actor fields explicitly owned by it. Persistent choices go through canonical world/story/economy owners.

## Reusable implementation workflow

1. Select an existing appropriate encounter shape and mission owner. Check the live catalog for an equivalent authored job; extend it instead of duplicating.
2. Author a complete scene: premise, placed geometry, working cast, two approaches, a complication caused by play and an aftermath. The task must still have things to do if dialogue is ignored.
3. Implement phases with explicit entry, observable success, failure continuation and cleanup; tie objective progress to actual bodies/transfers/tools.
4. Route rewards, law and faction reactions through the director facade. Stable scene records retain only durable outcomes, not expired combat timers.
5. Test both approaches, premature target destruction, actor loss, leaving mid-job, duplicate resolution and save at the commitment boundary.
6. Play through both success and a recoverable failure at normal camera. A briefing row, scattered props or a hold-E interaction is not this packet completed.

## Ordinary-route proof

Discover the offer normally, fly to its physically placed scene, assess without reading a wall of text, commit, encounter the complication and return to the changed place.

Choose one seed/route and compare it before and after; keep the scenario's meaningful variables fixed. Use both a competent intended action and a plausible mistake. Source or headless proof cannot establish visual, audio, feel or frame-pacing quality; inspect/listen/play the relevant route where tools permit, otherwise report that portion unproven.

## Authoritative INFERENCE depth bars

- [WF-08: Missions Heists Contracts And World Activities](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-08_MISSIONS_HEISTS_CONTRACTS_AND_WORLD_ACTIVITIES.md)
- [WF-17: Vertical Slice And Portfolio Integration](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-17_VERTICAL_SLICE_AND_PORTFOLIO_INTEGRATION.md)

Do not copy an entire workflow into a new instruction hierarchy. The selected packet resolves the creative direction; the live workflow still supplies the completeness bar. An existing compatible capability satisfies a dependency.

## Packets

- [SF-136 — Put a real crusher into the yard tow-out](../plans/10-missions/SF-136-put-a-real-crusher-into-the-yard-tow-out.md) — conditional repair
- [SF-137 — A liner toll run with a real crossing decision](../plans/10-missions/SF-137-a-liner-toll-run-with-a-real-crossing-decision.md) — deepening
- [SF-138 — The Borrowed Tug: recover without owning the tool](../plans/10-missions/SF-138-the-borrowed-tug-recover-without-owning-the-tool.md) — deepening
- [SF-139 — The Split Manifest: choose what can be saved](../plans/10-missions/SF-139-the-split-manifest-choose-what-can-be-saved.md) — deepening
- [SF-140 — The Blind Transfer: intercept by observation](../plans/10-missions/SF-140-the-blind-transfer-intercept-by-observation.md) — deepening
- [SF-141 — The Warm Wreck: rescue before salvage](../plans/10-missions/SF-141-the-warm-wreck-rescue-before-salvage.md) — deepening
- [SF-142 — The Quiet Berth: solve a job without a fight](../plans/10-missions/SF-142-the-quiet-berth-solve-a-job-without-a-fight.md) — deepening
- [SF-143 — The Counterweight Job: hold one thing to move another](../plans/10-missions/SF-143-the-counterweight-job-hold-one-thing-to-move-another.md) — deepening
- [SF-144 — The Wrong Convoy: verify before intervention](../plans/10-missions/SF-144-the-wrong-convoy-verify-before-intervention.md) — deepening
- [SF-145 — The Salvage Auction: possession before paperwork](../plans/10-missions/SF-145-the-salvage-auction-possession-before-paperwork.md) — deepening
- [SF-146 — The Broken Escort: protect the obligation, not just the hull](../plans/10-missions/SF-146-the-broken-escort-protect-the-obligation-not-just-the-hull.md) — deepening
- [SF-147 — The Hot Return: a heist's escape has a second act](../plans/10-missions/SF-147-the-hot-return-a-heist-s-escape-has-a-second-act.md) — deepening
- [SF-148 — The False Shortcut: knowledge beats the map line](../plans/10-missions/SF-148-the-false-shortcut-knowledge-beats-the-map-line.md) — deepening
- [SF-149 — A three-visit story told through a workplace](../plans/10-missions/SF-149-a-three-visit-story-told-through-a-workplace.md) — deepening
- [SF-150 — Mission closure that preserves the scene's future](../plans/10-missions/SF-150-mission-closure-that-preserves-the-scene-s-future.md) — deepening

## Owner reading map

- [`src/systems/missions.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/missions.js)
- [`src/systems/encounterDirector.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/encounterDirector.js)
- [`src/systems/encounterScripts.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/encounterScripts.js)
- [`src/systems/heistFacilities.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/heistFacilities.js)
- [`src/systems/setPieceMissionOffers.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/setPieceMissionOffers.js)
- [`src/data/missions.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/missions.js)
- [`src/systems/uniqueWreckEncounterScripts.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/uniqueWreckEncounterScripts.js)
- [`src/systems/salvageActions.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/salvageActions.js)
- [`src/data/encounters/346-yard-towout.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/encounters/346-yard-towout.js)
- [`src/data/encounters/348-liner-toll-run.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/encounters/348-liner-toll-run.js)
- [`src/data/heistFacilities.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/heistFacilities.js)
- [`src/data/encounters/mega-heist.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/encounters/mega-heist.js)

[Return to index](../INDEX.md) · [Execution contract](../EXECUTION_CONTRACT.md)
