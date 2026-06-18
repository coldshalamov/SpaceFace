# ADR-0002: Seed + mutation-overlay saves and an offscreen statistical simulation

- **Status:** Accepted (retroactive — documents the V2 PART IV direction; partially implemented)
- **Date:** 2026-06-17 (decision recorded after the fact; see V2_MASTER_PLAN.md PART IV)
- **Deciders:** SpaceFace lead / V2 master plan
- **Tags:** persistence, simulation, world-model, perf

> Retroactive ADR. The **save envelope** half is implemented (`src/save/`); the **seed + mutation /
> offscreen statistical sim** half is the [LOCKED] architectural direction from V2 PART IV that
> downstream world/automation work builds toward. This record fixes the rationale so the two halves
> stay coherent.

---

## Context

The game promises a large, persistent, *alive* universe with an automation/passive-income layer —
in a **browser/Electron** runtime with a strict per-frame perf budget. Three forces collide:

- **Persistence size.** Storing world geometry (sectors, fields, NPC rosters) per-save bloats to
  megabytes and grows without bound over a long campaign. localStorage (the current sink) is small;
  exports should stay shareable.
- **Performance.** Tick-simulating every NPC hauler, patrol, drone, and economy node at 60 Hz across
  a whole universe is impossible in a browser. Yet a static world (timers frozen while you're away)
  feels dead — returning to a region "as if time stopped" breaks the fantasy (V2 §35.x).
- **Determinism & integrity.** Saves must round-trip safely, never corrupt live state on a bad load,
  and ideally be reproducible (same inputs → same world) for debugging and "the save is your story."

## Decision

We will model the world as **seed + a saved mutation overlay**, simulate **offscreen activity
statistically** (closed-form, not tick-by-tick), and persist via a **versioned, checksummed save
envelope** with atomic, migration-aware loads. Specifically:

- **Seed-generated world, mutation-overlay diff (V2 §32, LOCKED).** Every world entity derives its
  intrinsic properties deterministically from a stable per-entity seed (hashed from its id + the
  master `meta.seed`). The save stores **only the *diff*** from seed-state — depleted veins, killed
  NPCs, built structures, rep changes, mined asteroids. *"You don't save planet geometry; you save
  `{seed, mutations[]}`."* A 50-hour save is kilobytes of mutations, not megabytes of world.
- **Offscreen = statistical; onscreen = tick (V2 §33–34, LOCKED).** The **view boundary is the
  simulation boundary.** Only what's in (or near) view is rendered and 60 Hz-simulated. Offscreen
  events resolve through a **universal closed-form outcome formula**
  `P(outcome) = clamp(baseHazard × exposure × assetVulnerability × mitigation, 0, 1)` — O(1) per
  event, statistically honest in aggregate. On re-entry, the region is advanced by elapsed `T`,
  deferred outcomes are applied, and visible entities are *instantiated* from the formula and handed
  to the live sim ("rendered as if it had been rendered the whole time"). **Offscreen RNG must be
  seed-stable per region/event** so returning yields the same result regardless of *when* you look
  (V2 §35-rule).
- **Versioned, atomic, checksummed save envelope (implemented, `src/save/`).** Saves are an envelope
  `{fmt:'spaceface-save', version, savedAt, playtimeS, slot, checksum, data}` written to
  localStorage slots (+ exportable/importable `.json`). Load is **validate-before-destroy**:
  `fmt → version ≤ CURRENT → FNV-1a checksum → migrate-a-copy → has-player` all pass *before* any
  live state is touched; any failure emits `save:error` and leaves the running game intact. Schema
  is **v1**; migrations are an ordered `{from,to,fn}` chain run against a *copy*. The data payload is
  serialized deps-first (meta → player → cargo → economy → factions → world → entities → missions →
  automation → settings); NPC ships regenerate from the spawner rather than being serialized
  (consistent with the seed-regenerates-the-rest rule).

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Seed + mutation overlay, offscreen statistical sim, versioned envelope** (chosen) | Tiny saves; infinite stable worlds; "nothing resets" falls out free; O(1) offscreen; world *moves on* while away; deterministic replay; atomic corruption-safe loads | Reconciliation logic is subtle (seed-stable RNG, re-entry advance); statistical outcomes are aggregate-honest but individually a roll; migration discipline required on every schema change | **Chosen** — the only model that gives persistence + perf + aliveness together (V2 PART IV: "the load-bearing wall") |
| Full-state save (serialize the whole world) | Conceptually simple; exact | Saves bloat to MB and grow unbounded; slow; not shareable; still doesn't solve offscreen aliveness | Rejected — bloat + doesn't address the sim problem (V2 §35.x anti-pattern) |
| Tick-simulate everything offscreen | "Real" everywhere | Impossible in-browser at universe scale; perf scales with empire size — unbounded | Rejected — no perf budget for it |
| Static offscreen world (freeze timers when away) | Trivial | Returning feels like time stopped; kills the alive-universe fantasy and time-pressure (V2 §35.x) | Rejected — breaks the core promise |

## Consequences

- **Positive:** kilobyte saves that scale with *play*, not world size; a universe that evolves while
  you're gone (real time pressure for the automation layer); deterministic, shareable, replayable
  saves; corruption-safe loads that never trash a live game.
- **Negative / costs:** the offscreen engine and the seed↔mutation↔reconcile pipeline are real
  complexity to build and test; statistical outcomes can surprise on a single event (mitigated by
  aggregate honesty + seed-stability); **every schema change now carries a migration obligation.**
- **Risks / follow-ups:**
  - **Untested migration path (precise).** The migration *machinery* exists and is sound
    (migrate-a-copy, atomic) but **has never executed** — `MIGRATIONS = []`, schema is v1, zero
    migrations authored. The first real schema bump (v1→v2) must ship *with* a round-trip migration
    test; do not let it ride on untested code. (QA_MATRIX.md §C.)
  - **Electron save-origin risk.** localStorage is keyed by origin, and the Electron shell currently
    binds a **random port per launch** (`electron/main.cjs` `server.listen(0)`) — so saves may not
    survive a relaunch. This is a persistence bug independent of the model and is the headline
    UNVERIFIED row in the QA matrix (QA_MATRIX.md SAVE-1). The seed+mutation model makes saves tiny
    enough that a **file-based sink under `userData`** is a clean fix if the origin problem bites.
  - **Seed-stable offscreen RNG** is a correctness invariant, not a nicety — a non-stable stream
    makes the world change based on *when you look*. Must be enforced and tested as the offscreen
    engine lands.
- **Reversal cost:** High for the world model (seed+mutation is foundational — "the load-bearing
  wall under Parts I–III"); Low–moderate for the save *envelope* (format is versioned, so it can
  evolve via migrations rather than a rewrite).

## References

- design/V2_MASTER_PLAN.md PART IV — §32 (seed + mutation overlay, LOCKED), §32.1 (seeded-vs-mutated
  contract table), §33 (offscreen statistical engine + universal formula), §33.3 (reconciliation),
  §34 (view-gated rendering/sim), §35 (anti-patterns: stored geometry, static world; seed-stable RNG
  rule).
- ARCHITECTURE.md §0.5 (RNG & determinism, per-stream seeds), §3.2 (`meta.seed`), §3.8/§3.9
  (world discovery overlay + automation, serialized), §4.5 (save envelope, migrations, autosave).
- Implementation: `src/save/saveSystem.js`, `src/save/migrations.js`, `src/save/checksum.js`,
  `src/data/saveVersion.js`.
- Related: ADR-0001 (the zero-build ESM stack this persistence/sim model runs on).
