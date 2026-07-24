# ADR-0001: Deterministic Gameplay Lab (characterization baseline)

- **Status:** Proposed
- **Date:** 2026-07-24
- **Deciders:** Phase 0 lab characterization (implementer)
- **Tags:** determinism, sim-host, validation, lab, profiles
- **Provenance:** Baseline inventories under `design/lab/baseline/` cite line numbers at
  revision `8610102d` (recorded head). Concurrent uncommitted working-tree edits are
  intentionally not reflected.

> Phase 0 only. This ADR records what exists and why a later manifest/profile/broker
> architecture is motivated. It does **not** decide Phase 1–5 implementation detail.

---

## Context

SpaceFace already has strong deterministic building blocks:

- Headless fixed-step host: `createSimulation()` (`src/core/sim.js`) at 60 Hz (`SIM_DT = 1/60`).
- Live browser registry: hard-coded `SYSTEMS` + `UPDATE_ORDER` in `createRegistry()` (`src/core/registry.js`).
- Scenario 47-A goldens via `scripts/sf-sim.mjs` with a **manually curated** system subset.
- Environment-tier feature flags (`src/data/featureFlags.js`) defaulting to `IS_BROWSER`.
- PQ-017 iteration guard with digests, failure fingerprints, fast-gate receipts, and launch arbitration.
- Pure input transition (`transitionFlightKeyState`) and Massline input grammar (sim-dt timed).
- Gameplay Observatory semantic hash (`canonicalStateHash`) that **omits** `state.rng`.

These pieces are **not unified**. Two parallel system-collection sites (headless explicit list vs
browser hard-coded registry), three independent layers holding 47-A frozen, and wall-time probe
holds prevent a single “profile + scenario + seed → reproducible run” control plane.

## Decision

We will treat the **current** architecture as the Phase 0 baseline and build a Deterministic
Gameplay Lab in later phases **without changing gameplay in Phase 0**. Phase 0 outputs are:

1. This ADR (motivation + constraints).
2. Machine-readable baseline inventory under `design/lab/baseline/`.
3. An execution ledger under `.campaign/lab-build/` (gitignored).

Later phases (not decided here beyond naming) are expected to:

- **Phase 1:** extract a generic validation broker from PQ-017 reusable components.
- **Phase 2:** unify system collection (manifest) and migrate env-selected gameplay flags.
- **Phase 3+:** lab runtime, scenario schema, profiles, tick-indexed probes.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| A — Characterize first (Phase 0 docs only) | No gameplay risk; later phases share one inventory | Delays implementation | **Chosen** |
| B — Build manifest/broker immediately | Faster feature delivery | High risk of breaking goldens / dirty-tree collisions | Rejected for this phase |
| C — Edit goldens / production systems to “make room” | Green checks look cleaner | Violates determinism policy and Phase 0 hard stop | Rejected |

## Consequences

- **Positive:** Later phases have a verified map of systems, flags, hashes, guards, and seams.
- **Negative / costs:** Inventory can drift; must re-verify against source at each phase start.
- **Risks / follow-ups:** Envelope `authoritativeHash` fields in 47-A expected files currently
  disagree with live compare hashes while reload-determinism still passes — track as pre-existing
  envelope drift, do not “fix” by editing goldens in Phase 0.
- **Reversal cost:** Delete `design/lab/**` and the ledger; no production code depends on them yet.

## Key structural findings (Phase 0)

### Two system-collection sites

| Site | Host | How systems are chosen |
|---|---|---|
| Headless | `createSimulation({ systems })` | Caller-supplied ordered array (+ forced `core`) |
| Browser | `createRegistry(ctx)` | Hard-coded `SYSTEMS` (init) + `UPDATE_ORDER` (step) |

### Three independent 47-A determinism layers

1. Curated `sf-sim` systems list omits massline/travel families.
2. `massline2Flag` / `travelFlag` / most `combatFlag` defaults are OFF under Node (`IS_BROWSER`).
3. `scripts/sf-sim.mjs` explicitly pins `weaponImpulseConsequences: false` for scenario `47a`.

### Profile concept today

`graphicsProfileBootstrap` is the only runtime profile. Gameplay backends
(`physicsBackend`, `aiBackend`, `flightBackend`) are **LOCKED** and cannot be overridden by
profile merge — backends are settings defaults, not environment-derived.

## References

- `ARCHITECTURE.md` (sim contract, determinism).
- `src/core/sim.js`, `src/core/registry.js`, `src/core/loop.js`.
- `scripts/sf-sim.mjs`, `scripts/lib/pq017ProbeIterationGuard.mjs`.
- `src/data/featureFlags.js`, `src/observability/sessionSamplers.js`.
- Baseline JSON siblings under `design/lab/baseline/`.
