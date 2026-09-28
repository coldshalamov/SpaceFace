# 05 — Swarm encounter arcs, drafting and replayable runs

**Current lane:** THE FIGHT  
**Build-map connections:** PQ-174, PQ-175, PQ-169; CV-AMMO  
**15 proposed packets:** SF-061–SF-075

## Existing foundation, not a blank slate

Wave planning is a pure seeded function, and survivalDraft already fits through the ships owner, spends through run requests and guarantees a single resolution receipt even on refusal.

This is a source-informed working description, not a fresh gameplay acceptance claim. Read current source before treating any subfeature as missing. [Source provenance](../SOURCE_PROVENANCE.md) records scope and limitations.

## Domain contract

Keep the wave planner pure and runSession authoritative for run envelopes. Drafts use real fitting APIs; no free stat mutations or Adventure-wallet leakage. Active-body and spawn/materialization budgets remain bounded.

## Reusable implementation workflow

1. Read planWave, the current act recipe and the run phase that consumes it. Preserve seed and semantic hash behavior unless the content intentionally changes.
2. Author an encounter question rather than adding simultaneous bodies. Select roles, ingress gates, obstruction use and a recovery window that test the named player verb.
3. If a draft changes, apply it through grant/fit and run-wallet requests. Define refusal, skip and reroll terminal behavior before improving the choice.
4. Ensure every actor can materialize and every phase can resolve if a body is disabled, displaced or destroyed out of sequence.
5. Run same-seed comparison plus a small deliberately different seed set; test low ammo, odd builds, denied fits and transition save/resume where supported.
6. Play a complete arc, not just its peak. Preserve readable breathing room and verify the next choice makes the previous fight feel consequential.

## Ordinary-route proof

Enter Swarm from the normal mode selection, finish the opening lesson, make at least one draft decision and reach a later pressure/recovery transition.

Choose one seed/route and compare it before and after; keep the scenario's meaningful variables fixed. Use both a competent intended action and a plausible mistake. Source or headless proof cannot establish visual, audio, feel or frame-pacing quality; inspect/listen/play the relevant route where tools permit, otherwise report that portion unproven.

## Authoritative INFERENCE depth bars

- [WF-02: Enemy Roster And Encounters](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-02_ENEMY_ROSTER_AND_ENCOUNTERS.md)
- [WF-07: Progression Ships Builds And Infrastructure](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-07_PROGRESSION_SHIPS_BUILDS_AND_INFRASTRUCTURE.md)
- [WF-17: Vertical Slice And Portfolio Integration](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-17_VERTICAL_SLICE_AND_PORTFOLIO_INTEGRATION.md)

Do not copy an entire workflow into a new instruction hierarchy. The selected packet resolves the creative direction; the live workflow still supplies the completeness bar. An existing compatible capability satisfies a dependency.

## Packets

- [SF-061 — Opening wave as a physical promise](../plans/05-swarm/SF-061-opening-wave-as-a-physical-promise.md) — deepening
- [SF-062 — A mass-and-gap round](../plans/05-swarm/SF-062-a-mass-and-gap-round.md) — deepening
- [SF-063 — Earned breathing room that survives burst kills](../plans/05-swarm/SF-063-earned-breathing-room-that-survives-burst-kills.md) — deepening
- [SF-064 — A specialist introduction with a physical rehearsal](../plans/05-swarm/SF-064-a-specialist-introduction-with-a-physical-rehearsal.md) — deepening
- [SF-065 — Draft choices that change the next maneuver](../plans/05-swarm/SF-065-draft-choices-that-change-the-next-maneuver.md) — deepening
- [SF-066 — A reroll that preserves trust](../plans/05-swarm/SF-066-a-reroll-that-preserves-trust.md) — deepening
- [SF-067 — Cover that stays useful through a round](../plans/05-swarm/SF-067-cover-that-stays-useful-through-a-round.md) — deepening
- [SF-068 — A boss round with ammunition, not escorts as chores](../plans/05-swarm/SF-068-a-boss-round-with-ammunition-not-escorts-as-chores.md) — deepening
- [SF-069 — Cleanup that never lies about surviving enemies](../plans/05-swarm/SF-069-cleanup-that-never-lies-about-surviving-enemies.md) — deepening
- [SF-070 — Between-round preparation without accidental launch](../plans/05-swarm/SF-070-between-round-preparation-without-accidental-launch.md) — deepening
- [SF-071 — An arena law that creates opportunity](../plans/05-swarm/SF-071-an-arena-law-that-creates-opportunity.md) — deepening
- [SF-072 — Build pressure that tests rather than hard-counters](../plans/05-swarm/SF-072-build-pressure-that-tests-rather-than-hard-counters.md) — deepening
- [SF-073 — Run rewards that follow physical collection](../plans/05-swarm/SF-073-run-rewards-that-follow-physical-collection.md) — deepening
- [SF-074 — A cash-out decision with an honest mode boundary](../plans/05-swarm/SF-074-a-cash-out-decision-with-an-honest-mode-boundary.md) — deepening
- [SF-075 — A rematch that reveals mastery instead of a bigger score](../plans/05-swarm/SF-075-a-rematch-that-reveals-mastery-instead-of-a-bigger-score.md) — deepening

## Owner reading map

- [`src/systems/survivalWavePlanner.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/survivalWavePlanner.js)
- [`src/data/survivalActs.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/survivalActs.js)
- [`src/systems/survivalDraft.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/survivalDraft.js)
- [`src/systems/survivalRun.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/survivalRun.js)
- [`src/systems/swarmArena.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/swarmArena.js)
- [`src/systems/survivalWave.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/survivalWave.js)
- [`src/systems/runSession.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/runSession.js)
- [`src/systems/survivalExtraction.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/survivalExtraction.js)
- [`src/data/swarmMode.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/swarmMode.js)
- [`src/systems/survivalRecords.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/survivalRecords.js)
- [`src/systems/survivalResults.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/survivalResults.js)
- [`src/systems/swarmSupply.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/swarmSupply.js)

[Return to index](../INDEX.md) · [Execution contract](../EXECUTION_CONTRACT.md)
