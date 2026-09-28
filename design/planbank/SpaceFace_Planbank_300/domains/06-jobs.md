# 06 — Occupations, civilian routines and social interruption

**Current lane:** THE WORLD  
**Build-map connections:** PQ-143, PQ-150; CV-DAY, CV-QUIET, CR-CHOIR  
**15 proposed packets:** SF-076–SF-090

## Existing foundation, not a blank slate

Civilian jobs, towing, real mined-lot handoffs, ambient raids and the Choir relief berth already have live owners. The opportunity is stronger continuity and interruptions, not an extra decorative ship label.

This is a source-informed working description, not a fresh gameplay acceptance claim. Read current source before treating any subfeature as missing. [Source provenance](../SOURCE_PROVENANCE.md) records scope and limitations.

## Domain contract

Use the current occupation/job runtime, spawnBudget and canonical cargo/repair/economy owners. A civilian route is not a new AI engine. Persist stable job/world identity; release only persistence marks owned by the job.

## Reusable implementation workflow

1. Find the live job and its actual producer/consumer. Name what the worker is trying to finish and the observable evidence of progress.
2. Specify normal work plus threat, obstruction and resource/partner-loss states. Resume or transform the same job instead of respawning a replacement worker.
3. Use physical approach, tool use and custody transfer. Coordinate with one other occupation through existing events rather than a private shared inventory.
4. Add a player opportunity that emerges from the interruption and a bounded consequence when ignored. Keep lawful authorization and neutral IFF intact.
5. Test solo worker, partner death, blocked berth, full hold and offscreen/reentry. Count real transfers and persistence pins, not decorative route laps.
6. Watch at least one complete work cycle. Remove explanatory barks that merely narrate absent physical work; make the work itself legible first.

## Ordinary-route proof

Observe an ordinary activity pocket without accepting a mission, interfere nonviolently, provoke a threat, leave and return; the occupation must still make sense.

Choose one seed/route and compare it before and after; keep the scenario's meaningful variables fixed. Use both a competent intended action and a plausible mistake. Source or headless proof cannot establish visual, audio, feel or frame-pacing quality; inspect/listen/play the relevant route where tools permit, otherwise report that portion unproven.

## Authoritative INFERENCE depth bars

- [WF-01: Npc Living World](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-01_NPC_LIVING_WORLD.md)
- [WF-16: Content Variants States And Aftermath](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-16_CONTENT_VARIANTS_STATES_AND_AFTERMATH.md)

Do not copy an entire workflow into a new instruction hierarchy. The selected packet resolves the creative direction; the live workflow still supplies the completeness bar. An existing compatible capability satisfies a dependency.

## Packets

- [SF-076 — Restore the real Ceres miner-to-hauler cycle](../plans/06-jobs/SF-076-restore-the-real-ceres-miner-to-hauler-cycle.md) — conditional repair
- [SF-077 — A tender that visibly repairs the failure](../plans/06-jobs/SF-077-a-tender-that-visibly-repairs-the-failure.md) — deepening
- [SF-078 — A surveyor whose measurements matter](../plans/06-jobs/SF-078-a-surveyor-whose-measurements-matter.md) — deepening
- [SF-079 — A salvor that separates before it hauls](../plans/06-jobs/SF-079-a-salvor-that-separates-before-it-hauls.md) — deepening
- [SF-080 — A berth queue with understandable right of way](../plans/06-jobs/SF-080-a-berth-queue-with-understandable-right-of-way.md) — deepening
- [SF-081 — A worker that responds to a close call](../plans/06-jobs/SF-081-a-worker-that-responds-to-a-close-call.md) — deepening
- [SF-082 — A hauler that visibly chooses a safer continuation](../plans/06-jobs/SF-082-a-hauler-that-visibly-chooses-a-safer-continuation.md) — deepening
- [SF-083 — A patrol that performs a job before a fight](../plans/06-jobs/SF-083-a-patrol-that-performs-a-job-before-a-fight.md) — deepening
- [SF-084 — Two occupations competing for a real resource](../plans/06-jobs/SF-084-two-occupations-competing-for-a-real-resource.md) — deepening
- [SF-085 — A relief berth with limited capacity and a human rhythm](../plans/06-jobs/SF-085-a-relief-berth-with-limited-capacity-and-a-human-rhythm.md) — deepening
- [SF-086 — A work shift that changes the same place](../plans/06-jobs/SF-086-a-work-shift-that-changes-the-same-place.md) — deepening
- [SF-087 — Civilian assistance that carries an actual cost](../plans/06-jobs/SF-087-civilian-assistance-that-carries-an-actual-cost.md) — deepening
- [SF-088 — A rival recovery crew that can be negotiated with through action](../plans/06-jobs/SF-088-a-rival-recovery-crew-that-can-be-negotiated-with-through-action.md) — deepening
- [SF-089 — Occupational persistence without pinned ghosts](../plans/06-jobs/SF-089-occupational-persistence-without-pinned-ghosts.md) — deepening
- [SF-090 — A quiet encounter worth watching](../plans/06-jobs/SF-090-a-quiet-encounter-worth-watching.md) — deepening

## Owner reading map

- [`src/systems/npcJobs.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/npcJobs.js)
- [`src/systems/npcJobsRuntime.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/npcJobsRuntime.js)
- [`src/systems/traffic.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/traffic.js)
- [`src/ai/ambientPredation.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ai/ambientPredation.js)
- [`src/systems/choirReliefBerth.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/choirReliefBerth.js)
- [`src/systems/stationSideEventDirector.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/stationSideEventDirector.js)
- [`src/systems/intervention.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/intervention.js)
- [`src/systems/wingMorale.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/wingMorale.js)

[Return to index](../INDEX.md) · [Execution contract](../EXECUTION_CONTRACT.md)
